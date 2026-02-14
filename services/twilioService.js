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

    // Validation et initialisation
    this._initialize();
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
        this.client = twilio(this.accountSid, this.authToken);
        logger.info('✅ Twilio Service initialisé avec succès', {
          phoneNumber: this.phoneNumber,
          hasVerifyService: !!this.verifyServiceSid
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
        return whatsappResult;
      }

      // 🟢 Tentative 2 : SMS (fallback)
      const smsResult = await this._trySMS(telephone, message);
      if (smsResult.success) {
        return smsResult;
      }

      // ❌ Échec total
      logger.error('❌ Échec envoi code après tous les canaux', { telephone });
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

      const result = await this.client.messages.create({
        from: this._formatWhatsAppNumber(this.phoneNumber),
        to: this._formatWhatsAppNumber(telephone),
        body: message
      });

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

      const result = await this.client.messages.create({
        from: this.phoneNumber,
        to: telephone,
        body: message
      });

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

      const result = await this.client.messages.create({
        from: this.phoneNumber,
        to: telephone,
        body: message
      });

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

      const result = await this.client.messages.create({
        from: this.phoneNumber,
        to: telephone,
        body: message
      });

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

      const result = await this.client.messages.create({
        from: this.phoneNumber,
        to: telephone,
        body: message
      });

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
          provider: 'twilio-mock'
        };
      }

      const message = await this.client.messages(messageId).fetch();

      return {
        success: true,
        status: message.status,
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
      otpExpiration: this.otpExpiration
    };
  }
}

// Export singleton
module.exports = new TwilioService();