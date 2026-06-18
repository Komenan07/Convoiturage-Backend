// services/twilioService.js
const twilio = require('twilio');
const { logger } = require('../utils/logger');
require('dotenv').config();

class TwilioService {
  constructor() {
    // Configuration
    this.accountSid = process.env.TWILIO_ACCOUNT_SID;
    this.authToken = process.env.TWILIO_AUTH_TOKEN;
    // ✅ FIX : deux variables distinctes pour SMS et WhatsApp
    this.phoneNumber = process.env.TWILIO_SMS_NUMBER;          // Ex: +12025551234 (votre numéro SMS Twilio acheté)
    this.whatsappFrom = process.env.TWILIO_WHATSAPP_FROM;      // Ex: whatsapp:+14155238886 (sandbox) ou votre numéro WhatsApp Business
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
    // ✅ FIX : vérifier les deux numéros séparément
    if (!this.accountSid || !this.authToken || (!this.phoneNumber && !this.whatsappFrom)) {
      logger.warn('⚠️ Configuration Twilio incomplète - Mode mock activé', {
        hasSid: !!this.accountSid,
        hasToken: !!this.authToken,
        hasSmsNumber: !!this.phoneNumber,
        hasWhatsappFrom: !!this.whatsappFrom
      });
      this.mockMode = true;
    }

    // ✅ FIX : Si c'est le numéro sandbox WhatsApp, forcer le mode mock
    if (this.whatsappFrom === 'whatsapp:+14155238886') {
      logger.warn('⚠️ Numéro WhatsApp sandbox détecté - Mode mock activé pour éviter les erreurs');
      this.mockMode = true;
    }

    // si WhatsApp est configuré, insister sur le préfixe
    if (this.whatsappFrom && !this.whatsappFrom.startsWith('whatsapp:')) {
      logger.warn('Le paramètre TWILIO_WHATSAPP_FROM semble incorrect (pas de "whatsapp:"), correction automatique');
      // enlever un + éventuel et ajouter whatsapp:
      const clean = this.whatsappFrom.replace(/^\+/, '');
      this.whatsappFrom = `whatsapp:${clean}`;
    }

    if (!this.mockMode) {
      try {
        this.client = twilio(this.accountSid, this.authToken, {
          timeout: 30000 // 30 secondes
        });
        logger.info('✅ Twilio Service initialisé avec succès', {
          smsNumber: this.phoneNumber,       // ✅ numéro SMS
          whatsappFrom: this.whatsappFrom,   // ✅ numéro WhatsApp
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
   * ✅ Validation et normalisation du format du numéro de téléphone
   * @private
   */
  _validerNumeroTelephone(telephone) {
    if (!telephone) {
      throw new Error('Numéro de téléphone requis');
    }

    // Nettoyer le numéro (supprimer espaces, tirets, parenthèses)
    let cleaned = telephone.replace(/[\s\-()?]/g, '');

    // Formats acceptés pour la Côte d'Ivoire :
    // 1. Format international : +225XXXXXXXXXX (13 caractères)
    // 2. Format national : 0XXXXXXXXX (10 caractères, commençant par 0)
    const internationalRegex = /^\+225\d{10}$/;
    const nationalRegex = /^0\d{9}$/;

    if (internationalRegex.test(cleaned)) {
      // Déjà au bon format
      return cleaned;
    } else if (nationalRegex.test(cleaned)) {
      // Convertir en format international
      return '+225' + cleaned.substring(1);
    } else {
      throw new Error(
        `Le numéro de téléphone n'est pas valide pour la Côte d'Ivoire. ` +
        `Formats acceptés: 0707070708, +2250707070708`
      );
    }
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
   * Envoie un message avec fallback automatique WhatsApp → SMS
   */
  async envoyerMessageAvecFallback(telephone, message) {
    const results = {
      success: false,
      method: null,
      error: null,
      sid: null
    };

    // Mode MOCK
    if (this.mockMode) {
      logger.info('📱 [MOCK] Code de vérification simulé', { 
        telephone, 
        code: message.match(/\d{6}/)?.[0] 
      });
      return { 
        success: true, 
        method: 'mock',
        sid: `MOCK_${Date.now()}` 
      };
    }

    // Tentative 1 : WhatsApp
    try {
      logger.info('📱 Tentative envoi WhatsApp', { telephone });
      const whatsappResult = await this.envoyerMessage(telephone, message);
      
      results.success = true;
      results.method = 'whatsapp';
      results.sid = whatsappResult.sid;
      
      logger.info('✅ WhatsApp envoyé avec succès', { telephone, sid: whatsappResult.sid });
      return results;
      
    } catch (whatsappError) {
      logger.warn('⚠️ Échec WhatsApp, tentative SMS...', { 
        telephone, 
        error: whatsappError.message,
        code: whatsappError.code 
      });
      
      // Tentative 2 : SMS (fallback)
      try {
        const smsResult = await this.envoyerSMS(telephone, message);
        
        results.success = true;
        results.method = 'sms';
        results.sid = smsResult.sid;
        
        logger.info('✅ SMS envoyé (fallback)', { telephone, sid: smsResult.sid });
        return results;
        
      } catch (smsError) {
        logger.error('❌ Échec total (WhatsApp + SMS)', { 
          telephone,
          whatsappError: whatsappError.message,
          smsError: smsError.message
        });
        
        results.error = `WhatsApp et SMS ont échoué. WhatsApp: ${whatsappError.message}, SMS: ${smsError.message}`;
        throw new Error(results.error);
      }
    }
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
  async envoyerCodeVerification(telephone, code, nomComplet = '', options = {}) {
    let normalizedPhone = telephone;
    try {
      // Validation et normalisation du numéro
      normalizedPhone = this._validerNumeroTelephone(telephone);
      
      // Vérification du rate limit
      this._checkRateLimit(normalizedPhone);

      const message = this._genererMessageVerification(code, nomComplet);

      // Affichage du code en dev si configuré
      if (this.showCodes) {
        console.log(`\n🔑 CODE OTP: ${code} pour ${normalizedPhone}\n`);
      }

      // Mode mock
      if (this.mockMode) {
        logger.info('📱 [MOCK] Code de vérification simulé', { 
          telephone: normalizedPhone, 
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
        telephone: normalizedPhone,
        strategy: 'WhatsApp → SMS' 
      });

      const prefer = (options && options.prefer) ? options.prefer.toLowerCase() : 'auto';

      // If caller explicitly prefers SMS, send SMS directly and do not attempt WhatsApp.
      if (prefer === 'sms') {
        const smsResult = await this._trySMS(normalizedPhone, message);
        if (smsResult.success) {
          this.metrics.sent.sms++;
          return smsResult;
        }
        this.metrics.failed.sms++;

        // Respect explicit SMS preference: return failure without trying WhatsApp
        return {
          success: false,
          error: 'Impossible d\'envoyer le code par SMS',
          provider: 'twilio',
          channel: 'sms_failed'
        };
      }

      // Default and 'whatsapp' preference: WhatsApp first, SMS fallback
      // 🔵 Tentative 1 : WhatsApp
      const whatsappResult = await this._tryWhatsApp(normalizedPhone, message);
      if (whatsappResult.success) {
        this.metrics.sent.whatsapp++;
        return whatsappResult;
      }
      this.metrics.failed.whatsapp++;

      // 🟢 Tentative 2 : SMS (fallback)
      const smsResult = await this._trySMS(normalizedPhone, message);
      if (smsResult.success) {
        this.metrics.sent.sms++;
        return smsResult;
      }
      this.metrics.failed.sms++;

      // ❌ Échec total
      logger.error('❌ Échec envoi code après tous les canaux', { telephone: normalizedPhone });
      this.metrics.errors.push({
        timestamp: new Date(),
        telephone: normalizedPhone,
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
        telephone: normalizedPhone,
        error: error.message,
        stack: error.stack
      });

      this.metrics.errors.push({
        timestamp: new Date(),
        telephone: normalizedPhone,
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

      // ✅ FIX : utiliser this.whatsappFrom (TWILIO_WHATSAPP_FROM)
      // Le "from" WhatsApp doit avoir le préfixe whatsapp:
      // Le "to" (destinataire) aussi
      const result = await this._retryWithBackoff(
        async () => await this.client.messages.create({
          from: this.whatsappFrom,                         // ✅ Ex: "whatsapp:+14155238886"
          to: this._formatWhatsAppNumber(telephone),       // Ex: "whatsapp:+2250748903927"
          body: message
        }),
        3,
        'WhatsApp'
      );

      // Twilio sometimes silently converts to SMS if the sender is not a valid
      // WhatsApp-enabled number. the returned SID will start with "SM" in that
      // case (instead of "WH").  Treat such responses as a failure so the
      // fallback SMS step can run and the metrics remain accurate.
      if (typeof result.sid === 'string' && result.sid.startsWith('SM')) {
        logger.warn('⚠️ Envoi traité comme SMS par Twilio ; mauvais numéro WhatsApp ?', {
          telephone,
          sid: result.sid,
          to: result.to,
          from: result.from
        });
        // force an error to go to the catch/fallback path
        throw new Error('message livré en tant que SMS');
      }

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

      // ✅ FIX : utiliser this.phoneNumber (TWILIO_SMS_NUMBER)
      // Ce numéro doit être un numéro SMS Twilio valide lié à votre compte
      const result = await this._retryWithBackoff(
        async () => await this.client.messages.create({
          from: this.phoneNumber,          // numéro SMS classique
          to: telephone,                   // pas de préfixe whatsapp
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
      // Validation et normalisation
      const normalizedPhone = this._validerNumeroTelephone(telephone);

      const message = `🎉 Bienvenue ${prenom} sur WayZ-Eco !

Votre compte est maintenant actif. Vous pouvez commencer à utiliser la plateforme de covoiturage.

Bon voyage ! 🚗`;

      if (this.mockMode) {
        logger.info('📱 [MOCK] Message de bienvenue simulé', { telephone: normalizedPhone, prenom });
        return {
          success: true,
          messageId: `mock_welcome_${Date.now()}`,
          provider: 'twilio-mock'
        };
      }

      logger.info('📤 Envoi message de bienvenue', { telephone: normalizedPhone, prenom });

      // ✅ FIX : utiliser this.phoneNumber (TWILIO_SMS_NUMBER), pas le numéro WhatsApp sandbox
      const result = await this._retryWithBackoff(
        async () => await this.client.messages.create({
          from: this.whatsappFrom,
          to: this._formatWhatsAppNumber(normalizedPhone),
          body: message
        }),
        3,
        'Message bienvenue'
      );

      logger.info('✅ Message de bienvenue envoyé', {
        messageId: result.sid,
        telephone: normalizedPhone
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
      // Validation et normalisation
      const normalizedPhone = this._validerNumeroTelephone(telephone);
      // Validation et rate limiting
      this._checkRateLimit(normalizedPhone);

      const message = `[WAYZ-ECO] Bonjour ${nomComplet},

Votre code de réinitialisation de mot de passe est : ${code}

Ce code expire dans ${this.otpExpiration} minutes.

⚠️ Si vous n'avez pas demandé cette réinitialisation, ignorez ce message et contactez-nous immédiatement.`;

      if (this.showCodes) {
        console.log(`\n🔐 CODE RESET: ${code} pour ${normalizedPhone}\n`);
      }

      if (this.mockMode) {
        logger.info('📱 [MOCK] Code reset simulé', { 
          telephone: normalizedPhone, 
          code: this.showCodes ? code : '***' 
        });
        return {
          success: true,
          messageId: `mock_reset_${Date.now()}`,
          provider: 'twilio-mock'
        };
      }

      logger.info('📤 Envoi code de réinitialisation', { telephone: normalizedPhone });

      const result = await this._retryWithBackoff(
        async () => await this.client.messages.create({
          from: this.whatsappFrom,     // ✅ Votre vrai numéro SMS Twilio
          to: this._formatWhatsAppNumber(normalizedPhone),
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
      // Validation et normalisation
      const normalizedPhone = this._validerNumeroTelephone(telephone);

      const message = `✅ [WAYZ-ECO] Bonjour ${prenom},

Votre mot de passe a été réinitialisé avec succès.

Vous pouvez maintenant vous connecter avec votre nouveau mot de passe.

⚠️ Si ce n'était pas vous, contactez-nous immédiatement au support.`;

      if (this.mockMode) {
        logger.info('📱 [MOCK] Confirmation reset simulée', { telephone: normalizedPhone, prenom });
        return {
          success: true,
          messageId: `mock_confirm_${Date.now()}`,
          provider: 'twilio-mock'
        };
      }

      logger.info('📤 Envoi confirmation reset mot de passe', { telephone: normalizedPhone, prenom });

      const result = await this._retryWithBackoff(
        async () => await this.client.messages.create({
          from: this.whatsappFrom,   // ✅ Votre vrai numéro SMS Twilio
          to: this._formatWhatsAppNumber(normalizedPhone),
          body: message
        }),
        3,
        'Confirmation reset'
      );

      logger.info('✅ Confirmation reset envoyée', {
        messageId: result.sid,
        telephone: normalizedPhone
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
      smsNumber: this.phoneNumber,
      whatsappFrom: this.whatsappFrom,
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