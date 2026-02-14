// services/twilioService.js
const twilio = require('twilio');
const { logger } = require('../utils/logger');
require('dotenv').config();

class TwilioService {
  constructor() {
    // Configuration
    this.accountSid = process.env.TWILIO_ACCOUNT_SID;
    this.authToken = process.env.TWILIO_AUTH_TOKEN;
    this.phoneNumber = process.env.TWILIO_PHONE_NUMBER;
    this.verifyServiceSid = process.env.TWILIO_VERIFY_SERVICE_SID;
    
    // Options
    this.mockMode = process.env.TWILIO_MOCK_MODE === 'true';
    this.showCodes = process.env.SHOW_VERIFICATION_CODES === 'true';
    this.otpExpiration = process.env.OTP_EXPIRATION_MINUTES || 10;

    // Rate limiting
    this.rateLimiter = new Map();
    this.rateLimit = {
      maxAttempts: parseInt(process.env.OTP_MAX_ATTEMPTS || '5'),
      windowMs: parseInt(process.env.OTP_RATE_LIMIT_WINDOW || '3600000') // 1 heure
    };

    // Métriques
    this.metrics = {
      sent: { whatsapp: 0, sms: 0, mock: 0 },
      failed: { whatsapp: 0, sms: 0 },
      errors: []
    };

    // Validation et initialisation
    this._initialize();
    
    // Nettoyage périodique du rate limiter (toutes les heures)
    this.cleanupInterval = setInterval(() => this._cleanupRateLimiter(), 3600000);
  }

  /**
   * 🔧 Initialisation du service
   * @private
   */
  _initialize() {
    if (!this.accountSid || !this.authToken || !this.phoneNumber) {
      logger.warn('⚠️ Configuration Twilio incomplète - Mode mock activé', {
        hasSid: !!this.accountSid,
        hasToken: !!this.authToken,
        hasPhone: !!this.phoneNumber
      });
      this.mockMode = true;
    }

    if (!this.mockMode) {
      try {
        this.client = twilio(this.accountSid, this.authToken, {
          timeout: 30000 // 30 secondes
        });
        logger.info('✅ Twilio Service initialisé avec succès', {
          phoneNumber: this.phoneNumber,
          hasVerifyService: !!this.verifyServiceSid,
          timeout: '30s'
        });
      } catch (error) {
        logger.error('❌ Erreur initialisation Twilio - Basculement en mode mock', error);
        this.mockMode = true;
      }
    } else {
      logger.info('📱 Twilio Service en mode MOCK');
    }
  }

  /**
   * ✅ Validation du format du numéro de téléphone
   * @private
   */
  _validerNumeroTelephone(telephone) {
    // Format international requis : +225XXXXXXXXXX (Côte d'Ivoire)
    const regex = /^\+225\d{10}$/;
    
    if (!telephone) {
      throw new Error('Numéro de téléphone requis');
    }

    if (!regex.test(telephone)) {
      throw new Error(
        `Format de numéro invalide: ${telephone}. ` +
        `Format attendu: +225XXXXXXXXXX (10 chiffres après +225)`
      );
    }

    return true;
  }

  /**
   * ✅ Vérification du rate limiting
   * @private
   */
  _checkRateLimit(telephone) {
    const now = Date.now();
    const { maxAttempts, windowMs } = this.rateLimit;

    if (!this.rateLimiter.has(telephone)) {
      this.rateLimiter.set(telephone, { count: 1, lastReset: now });
      return true;
    }

    const data = this.rateLimiter.get(telephone);
    
    // Reset si la fenêtre est dépassée
    if (now - data.lastReset > windowMs) {
      this.rateLimiter.set(telephone, { count: 1, lastReset: now });
      return true;
    }

    // Vérifier la limite
    if (data.count >= maxAttempts) {
      const minutesLeft = Math.ceil((windowMs - (now - data.lastReset)) / 60000);
      throw new Error(
        `Trop de tentatives d'envoi pour ce numéro. ` +
        `Veuillez réessayer dans ${minutesLeft} minute(s).`
      );
    }

    data.count++;
    return true;
  }

  /**
   * ✅ Nettoyage périodique du rate limiter
   * @private
   */
  _cleanupRateLimiter() {
    const now = Date.now();
    const { windowMs } = this.rateLimit;
    let cleaned = 0;
    
    for (const [phone, data] of this.rateLimiter.entries()) {
      if (now - data.lastReset > windowMs) {
        this.rateLimiter.delete(phone);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info(`🧹 Rate limiter nettoyé: ${cleaned} entrées supprimées`);
    }
  }

  /**
   * ✅ Retry avec backoff exponentiel
   * @private
   */
  async _retryWithBackoff(fn, maxRetries = 3, operation = 'operation') {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        const isLastAttempt = attempt === maxRetries - 1;
        
        // Erreurs réseau temporaires qui méritent un retry
        const isRetryableError = 
          error.code === 'ETIMEDOUT' || 
          error.code === 'ECONNRESET' ||
          error.code === 'ENOTFOUND' ||
          (error.status >= 500 && error.status < 600);

        if (isLastAttempt || !isRetryableError) {
          throw error;
        }

        const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
        logger.warn(`⏳ Retry ${attempt + 1}/${maxRetries} pour ${operation} après ${delay}ms`, {
          error: error.message,
          code: error.code
        });
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * 📱 Formater le numéro de téléphone pour WhatsApp
   * @private
   */
  _formatWhatsAppNumber(telephone) {
    return `whatsapp:${telephone}`;
  }

  /**
   * 📝 Générer le message de vérification
   * @private
   */
  _genererMessageVerification(code, nomComplet) {
    return `[WAYZ-ECO] Bonjour ${nomComplet},

Votre code de vérification est : ${code}

Ce code expire dans ${this.otpExpiration} minutes.

⚠️ Ne partagez jamais ce code.`;
  }

  /**
   * 🎯 MÉTHODE PRINCIPALE : Envoi code de vérification
   * Stratégie : WhatsApp d'abord, fallback SMS si échec
   * 
   * @param {string} telephone - Numéro au format international (+225...)
   * @param {string} code - Code de vérification
   * @param {string} nomComplet - Nom du destinataire
   * @returns {Promise<Object>} Résultat de l'envoi
   */
  async envoyerCodeVerification(telephone, code, nomComplet = '') {
    try {
      // Validation du numéro
      this._validerNumeroTelephone(telephone);
      
      // Vérification du rate limit
      this._checkRateLimit(telephone);

      const message = this._genererMessageVerification(code, nomComplet);

      // Affichage du code en dev si configuré
      if (this.showCodes) {
        console.log(`\n🔑 CODE OTP: ${code} pour ${telephone}\n`);
      }

      // Mode mock
      if (this.mockMode) {
        logger.info('📱 [MOCK] Code de vérification simulé', { 
          telephone, 
          code: this.showCodes ? code : '***' 
        });
        this.metrics.sent.mock++;
        return {
          success: true,
          messageId: `mock_${Date.now()}`,
          provider: 'twilio-mock',
          channel: 'mock'
        };
      }

      logger.info('🚀 Démarrage envoi code de vérification', { 
        telephone,
        strategy: 'WhatsApp → SMS' 
      });

      // 🔵 Tentative 1 : WhatsApp
      const whatsappResult = await this._tryWhatsApp(telephone, message);
      if (whatsappResult.success) {
        this.metrics.sent.whatsapp++;
        return whatsappResult;
      }
      this.metrics.failed.whatsapp++;

      // 🟢 Tentative 2 : SMS (fallback)
      const smsResult = await this._trySMS(telephone, message);
      if (smsResult.success) {
        this.metrics.sent.sms++;
        return smsResult;
      }
      this.metrics.failed.sms++;

      // ❌ Échec total
      logger.error('❌ Échec envoi code après tous les canaux', { telephone });
      this.metrics.errors.push({
        timestamp: new Date(),
        telephone,
        error: 'All channels failed'
      });

      return {
        success: false,
        error: 'Impossible d\'envoyer le code par WhatsApp ou SMS',
        provider: 'twilio',
        channel: 'failed'
      };

    } catch (error) {
      logger.error('❌ Erreur critique lors de l\'envoi du code', {
        telephone,
        error: error.message,
        stack: error.stack
      });

      this.metrics.errors.push({
        timestamp: new Date(),
        telephone,
        error: error.message
      });

      return {
        success: false,
        error: error.message,
        provider: 'twilio',
        channel: 'error'
      };
    }
  }

  /**
   * 💬 Tenter l'envoi via WhatsApp
   * @private
   */
  async _tryWhatsApp(telephone, message) {
    try {
      logger.info('📤 Tentative envoi via WhatsApp', { telephone });

      // ✅ CORRECTION CRITIQUE : Le "from" ne doit PAS avoir le préfixe whatsapp:
      // Seul le "to" (destinataire) doit avoir le préfixe whatsapp:
      const result = await this._retryWithBackoff(
        async () => await this.client.messages.create({
          from: this.phoneNumber,  // ✅ CORRIGÉ : Pas de whatsapp: pour l'expéditeur
          to: this._formatWhatsAppNumber(telephone),
          body: message
        }),
        3,
        'WhatsApp'
      );

      logger.info('✅ Code envoyé avec succès via WhatsApp', {
        messageId: result.sid,
        status: result.status,
        telephone
      });

      return {
        success: true,
        messageId: result.sid,
        provider: 'twilio',
        channel: 'whatsapp',
        status: result.status
      };

    } catch (error) {
      logger.warn('⚠️ Échec envoi WhatsApp, fallback vers SMS', {
        telephone,
        error: error.message,
        code: error.code
      });

      return {
        success: false,
        error: error.message,
        errorCode: error.code
      };
    }
  }

  /**
   * 📧 Tenter l'envoi via SMS
   * @private
   */
  async _trySMS(telephone, message) {
    try {
      logger.info('📤 Tentative envoi via SMS', { telephone });

      const result = await this._retryWithBackoff(
        async () => await this.client.messages.create({
          from: this.phoneNumber,
          to: telephone,
          body: message
        }),
        3,
        'SMS'
      );

      logger.info('✅ Code envoyé avec succès via SMS', {
        messageId: result.sid,
        status: result.status,
        telephone
      });

      return {
        success: true,
        messageId: result.sid,
        provider: 'twilio',
        channel: 'sms',
        status: result.status
      };

    } catch (error) {
      logger.error('❌ Échec envoi SMS', {
        telephone,
        error: error.message,
        code: error.code
      });

      return {
        success: false,
        error: error.message,
        errorCode: error.code
      };
    }
  }

  /**
   * 🎉 Envoyer un message de bienvenue
   * 
   * @param {string} telephone - Numéro au format international
   * @param {string} prenom - Prénom de l'utilisateur
   * @returns {Promise<Object>} Résultat de l'envoi
   */
  async envoyerMessageBienvenue(telephone, prenom) {
    try {
      // Validation
      this._validerNumeroTelephone(telephone);

      const message = `🎉 Bienvenue ${prenom} sur WAYZ-ECO !

Votre compte est maintenant actif. Vous pouvez commencer à utiliser la plateforme de covoiturage.

Bon voyage ! 🚗`;

      if (this.mockMode) {
        logger.info('📱 [MOCK] Message de bienvenue simulé', { telephone, prenom });
        return {
          success: true,
          messageId: `mock_welcome_${Date.now()}`,
          provider: 'twilio-mock'
        };
      }

      logger.info('📤 Envoi message de bienvenue', { telephone, prenom });

      const result = await this._retryWithBackoff(
        async () => await this.client.messages.create({
          from: this.phoneNumber,
          to: telephone,
          body: message
        }),
        3,
        'Message bienvenue'
      );

      logger.info('✅ Message de bienvenue envoyé', {
        messageId: result.sid,
        telephone
      });

      return {
        success: true,
        messageId: result.sid,
        provider: 'twilio',
        channel: 'sms'
      };

    } catch (error) {
      logger.error('❌ Erreur envoi message de bienvenue', {
        telephone,
        error: error.message
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 🔐 Envoyer un code de réinitialisation de mot de passe
   * 
   * @param {string} telephone - Numéro au format international
   * @param {string} code - Code de réinitialisation
   * @param {string} nomComplet - Nom complet de l'utilisateur
   * @returns {Promise<Object>} Résultat de l'envoi
   */
  async envoyerCodeResetMotDePasse(telephone, code, nomComplet = '') {
    try {
      // Validation et rate limiting
      this._validerNumeroTelephone(telephone);
      this._checkRateLimit(telephone);

      const message = `[WAYZ-ECO] Bonjour ${nomComplet},

Votre code de réinitialisation de mot de passe est : ${code}

Ce code expire dans ${this.otpExpiration} minutes.

⚠️ Si vous n'avez pas demandé cette réinitialisation, ignorez ce message et contactez-nous immédiatement.`;

      if (this.showCodes) {
        console.log(`\n🔐 CODE RESET: ${code} pour ${telephone}\n`);
      }

      if (this.mockMode) {
        logger.info('📱 [MOCK] Code reset simulé', { 
          telephone, 
          code: this.showCodes ? code : '***' 
        });
        return {
          success: true,
          messageId: `mock_reset_${Date.now()}`,
          provider: 'twilio-mock'
        };
      }

      logger.info('📤 Envoi code de réinitialisation', { telephone });

      const result = await this._retryWithBackoff(
        async () => await this.client.messages.create({
          from: this.phoneNumber,
          to: telephone,
          body: message
        }),
        3,
        'Code reset'
      );

      logger.info('✅ Code de réinitialisation envoyé', {
        messageId: result.sid,
        telephone
      });

      return {
        success: true,
        messageId: result.sid,
        provider: 'twilio',
        channel: 'sms'
      };

    } catch (error) {
      logger.error('❌ Erreur envoi code reset', {
        telephone,
        error: error.message
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * ✅ Envoyer une confirmation de réinitialisation de mot de passe
   * 
   * @param {string} telephone - Numéro au format international
   * @param {string} prenom - Prénom de l'utilisateur
   * @returns {Promise<Object>} Résultat de l'envoi
   */
  async envoyerConfirmationResetMotDePasse(telephone, prenom) {
    try {
      // Validation
      this._validerNumeroTelephone(telephone);

      const message = `✅ [WAYZ-ECO] Bonjour ${prenom},

Votre mot de passe a été réinitialisé avec succès.

Vous pouvez maintenant vous connecter avec votre nouveau mot de passe.

⚠️ Si ce n'était pas vous, contactez-nous immédiatement au support.`;

      if (this.mockMode) {
        logger.info('📱 [MOCK] Confirmation reset simulée', { telephone, prenom });
        return {
          success: true,
          messageId: `mock_confirm_${Date.now()}`,
          provider: 'twilio-mock'
        };
      }

      logger.info('📤 Envoi confirmation reset mot de passe', { telephone, prenom });

      const result = await this._retryWithBackoff(
        async () => await this.client.messages.create({
          from: this.phoneNumber,
          to: telephone,
          body: message
        }),
        3,
        'Confirmation reset'
      );

      logger.info('✅ Confirmation reset envoyée', {
        messageId: result.sid,
        telephone
      });

      return {
        success: true,
        messageId: result.sid,
        provider: 'twilio',
        channel: 'sms'
      };

    } catch (error) {
      logger.error('❌ Erreur envoi confirmation reset', {
        telephone,
        error: error.message
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 🔍 Vérifier le statut d'un message
   * 
   * @param {string} messageId - ID du message Twilio
   * @returns {Promise<Object>} Statut du message
   */
  async verifierStatutMessage(messageId) {
    try {
      if (this.mockMode) {
        return {
          success: true,
          status: 'delivered',
          statusFr: 'Délivré',
          provider: 'twilio-mock'
        };
      }

      const message = await this.client.messages(messageId).fetch();

      return {
        success: true,
        status: message.status,
        statusFr: this._mapTwilioStatus(message.status),
        dateCreated: message.dateCreated,
        dateSent: message.dateSent,
        errorCode: message.errorCode,
        errorMessage: message.errorMessage
      };

    } catch (error) {
      logger.error('❌ Erreur vérification statut message', {
        messageId,
        error: error.message
      });

      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * ✅ Mapper les statuts Twilio en français
   * @private
   */
  _mapTwilioStatus(status) {
    const statusMap = {
      'queued': 'En file d\'attente',
      'sending': 'En cours d\'envoi',
      'sent': 'Envoyé',
      'delivered': 'Délivré',
      'undelivered': 'Non délivré',
      'failed': 'Échec',
      'received': 'Reçu'
    };
    return statusMap[status] || status;
  }

  /**
   * ✅ Calculer le taux de succès
   * @private
   */
  _calculateSuccessRate(channel) {
    const sent = this.metrics.sent[channel] || 0;
    const failed = this.metrics.failed[channel] || 0;
    const total = sent + failed;
    
    if (total === 0) return 0;
    return ((sent / total) * 100).toFixed(2);
  }

  /**
   * 📊 Obtenir des statistiques sur l'utilisation
   * 
   * @returns {Object} Statistiques du service
   */
  getStats() {
    return {
      provider: 'twilio',
      mockMode: this.mockMode,
      configured: !this.mockMode,
      phoneNumber: this.phoneNumber,
      hasVerifyService: !!this.verifyServiceSid,
      showCodes: this.showCodes,
      otpExpiration: this.otpExpiration,
      rateLimit: {
        maxAttempts: this.rateLimit.maxAttempts,
        windowMinutes: this.rateLimit.windowMs / 60000,
        activeNumbers: this.rateLimiter.size
      }
    };
  }

  /**
   * ✅ Obtenir des statistiques détaillées
   * 
   * @returns {Object} Statistiques détaillées
   */
  getDetailedStats() {
    return {
      ...this.getStats(),
      metrics: {
        sent: this.metrics.sent,
        failed: this.metrics.failed,
        total: {
          sent: Object.values(this.metrics.sent).reduce((a, b) => a + b, 0),
          failed: Object.values(this.metrics.failed).reduce((a, b) => a + b, 0)
        },
        successRate: {
          whatsapp: `${this._calculateSuccessRate('whatsapp')}%`,
          sms: `${this._calculateSuccessRate('sms')}%`
        },
        recentErrors: this.metrics.errors.slice(-10) // 10 dernières erreurs
      }
    };
  }

  /**
   * ✅ Reset des métriques
   */
  resetMetrics() {
    this.metrics = {
      sent: { whatsapp: 0, sms: 0, mock: 0 },
      failed: { whatsapp: 0, sms: 0 },
      errors: []
    };
    logger.info('📊 Métriques réinitialisées');
  }

  /**
   * 🧹 Cleanup lors de l'arrêt du service
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      logger.info('🛑 Twilio Service arrêté proprement');
    }
  }
}

// Export singleton
module.exports = new TwilioService();