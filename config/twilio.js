// services/twilio.js
const twilio = require('twilio');
const { logger } = require('../utils/logger');

// ===================================
// CONFIGURATION TWILIO
// ===================================

class TwilioService {
  constructor() {
    // Vérifier les variables d'environnement
    this.validateEnvironmentVariables();
    
    // Configuration Twilio
    this.accountSid = process.env.TWILIO_ACCOUNT_SID;
    this.authToken = process.env.TWILIO_AUTH_TOKEN;
    this.phoneNumber = process.env.TWILIO_PHONE_NUMBER;
    this.serviceSid = process.env.TWILIO_VERIFY_SERVICE_SID; // Pour Verify API (optionnel)
    
    // Initialiser le client Twilio
    this.client = twilio(this.accountSid, this.authToken);
    
    // Configuration par défaut
    this.defaultConfig = {
      maxRetries: 3,
      timeout: 30000, // 30 secondes
      statusCallback: null,
      validityPeriod: 600 // 10 minutes
    };
    
    logger.info('Service Twilio initialisé', {
      accountSid: this.accountSid ? `${this.accountSid.substring(0, 8)}...` : 'manquant',
      phoneNumber: this.phoneNumber ? `${this.phoneNumber.substring(0, 8)}...` : 'manquant'
    });
  }

  /**
   * Valider les variables d'environnement requises
   */
  validateEnvironmentVariables() {
    const requiredVars = [
      'TWILIO_ACCOUNT_SID',
      'TWILIO_AUTH_TOKEN',
      'TWILIO_PHONE_NUMBER'
    ];

    const missingVars = requiredVars.filter(varName => !process.env[varName]);

    if (missingVars.length > 0) {
      const error = new Error(`Variables d'environnement Twilio manquantes: ${missingVars.join(', ')}`);
      logger.error('Configuration Twilio incomplète', { missingVars });
      throw error;
    }
  }

  /**
   * Formater un numéro de téléphone international
   * @param {string} phoneNumber - Numéro de téléphone
   * @returns {string} Numéro formaté
   */
  formatPhoneNumber(phoneNumber) {
    // Supprimer tous les espaces et caractères spéciaux
    let cleaned = phoneNumber.replace(/[\s\-().]/g, '');
    
    // Ajouter le préfixe international si absent
    if (!cleaned.startsWith('+')) {
      // Pour la Côte d'Ivoire, préfixe +225
      if (cleaned.startsWith('0')) {
        cleaned = '+225' + cleaned.substring(1);
      } else if (!cleaned.startsWith('225')) {
        cleaned = '+225' + cleaned;
      } else {
        cleaned = '+' + cleaned;
      }
    }
    
    return cleaned;
  }

  /**
   * Valider un numéro de téléphone
   * @param {string} phoneNumber - Numéro à valider
   * @returns {object} Résultat de validation
   */
  validatePhoneNumber(phoneNumber) {
    if (!phoneNumber) {
      return {
        valid: false,
        error: 'Numéro de téléphone requis',
        formatted: null
      };
    }

    try {
      const formatted = this.formatPhoneNumber(phoneNumber);
      
      // Validation basique pour la Côte d'Ivoire
      // Format attendu: +225XXXXXXXX (10 chiffres après +225)
      const ivoirianPattern = /^\+225[0-9]{8,10}$/;
      
      if (!ivoirianPattern.test(formatted)) {
        return {
          valid: false,
          error: 'Format de numéro invalide pour la Côte d\'Ivoire',
          formatted: null
        };
      }

      return {
        valid: true,
        error: null,
        formatted: formatted
      };
    } catch (error) {
      return {
        valid: false,
        error: 'Erreur de formatage du numéro',
        formatted: null
      };
    }
  }

  /**
   * Envoyer un SMS simple
   * @param {object} options - Options d'envoi
   * @returns {Promise<object>} Résultat de l'envoi
   */
  async sendSMS(options) {
    const { to, message, from = this.phoneNumber } = options;

    try {
      logger.info('Tentative d\'envoi SMS', {
        to: to ? `${to.substring(0, 8)}...` : 'manquant',
        messageLength: message ? message.length : 0
      });

      // Validation du destinataire
      const phoneValidation = this.validatePhoneNumber(to);
      if (!phoneValidation.valid) {
        throw new Error(phoneValidation.error);
      }

      // Validation du message
      if (!message || message.trim().length === 0) {
        throw new Error('Message SMS requis');
      }

      if (message.length > 1600) {
        throw new Error('Message trop long (maximum 1600 caractères)');
      }

      // Envoyer le SMS via Twilio
      const result = await this.client.messages.create({
        body: message.trim(),
        from: from,
        to: phoneValidation.formatted,
        validityPeriod: this.defaultConfig.validityPeriod
      });

      logger.info('SMS envoyé avec succès', {
        messageSid: result.sid,
        status: result.status,
        to: phoneValidation.formatted
      });

      return {
        success: true,
        messageSid: result.sid,
        status: result.status,
        to: phoneValidation.formatted,
        message: 'SMS envoyé avec succès'
      };

    } catch (error) {
      logger.error('Erreur envoi SMS', {
        error: error.message,
        code: error.code,
        moreInfo: error.moreInfo,
        to: to ? `${to.substring(0, 8)}...` : 'manquant'
      });

      // Gestion des erreurs spécifiques Twilio
      let userMessage = 'Erreur lors de l\'envoi du SMS';
      
      if (error.code) {
        switch (error.code) {
          case 21211:
            userMessage = 'Numéro de téléphone invalide';
            break;
          case 21608:
            userMessage = 'Numéro de téléphone non joignable';
            break;
          case 21614:
            userMessage = 'Numéro de téléphone invalide pour ce pays';
            break;
          case 30007:
            userMessage = 'Message filtré par l\'opérateur';
            break;
          case 30008:
            userMessage = 'Numéro inconnu ou invalide';
            break;
          default:
            userMessage = `Erreur Twilio: ${error.message}`;
        }
      }

      return {
        success: false,
        error: userMessage,
        code: error.code,
        details: error.message
      };
    }
  }

  /**
   * Envoyer un code de vérification (code OTP)
   * @param {object} options - Options d'envoi
   * @returns {Promise<object>} Résultat de l'envoi
   */
  async sendVerificationCode(options) {
    const { to, code, appName = 'WAYZ-ECO', expiryMinutes = 10 } = options;

    if (!code) {
      throw new Error('Code de vérification requis');
    }

    const message = `Votre code de vérification ${appName} est: ${code}. Ce code expire dans ${expiryMinutes} minutes. Ne le partagez avec personne.`;

    return await this.sendSMS({
      to,
      message
    });
  }

  /**
   * Envoyer un code de réinitialisation de mot de passe
   * @param {object} options - Options d'envoi
   * @returns {Promise<object>} Résultat de l'envoi
   */
  async sendPasswordResetCode(options) {
    const { to, code, appName = 'WAYZ-ECO', expiryMinutes = 10 } = options;

    if (!code) {
      throw new Error('Code de réinitialisation requis');
    }

    const message = `Votre code de réinitialisation ${appName} est: ${code}. Ce code expire dans ${expiryMinutes} minutes. Si vous n'avez pas demandé cette réinitialisation, ignorez ce message.`;

    return await this.sendSMS({
      to,
      message
    });
  }

  /**
   * Vérifier le statut d'un message
   * @param {string} messageSid - SID du message Twilio
   * @returns {Promise<object>} Statut du message
   */
  async getMessageStatus(messageSid) {
    try {
      const message = await this.client.messages(messageSid).fetch();
      
      return {
        success: true,
        status: message.status,
        errorCode: message.errorCode,
        errorMessage: message.errorMessage,
        dateCreated: message.dateCreated,
        dateSent: message.dateSent,
        dateUpdated: message.dateUpdated
      };
    } catch (error) {
      logger.error('Erreur récupération statut message', {
        messageSid,
        error: error.message
      });
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Obtenir le solde du compte Twilio
   * @returns {Promise<object>} Informations du compte
   */
  async getAccountBalance() {
    try {
      const account = await this.client.accounts(this.accountSid).fetch();
      
      return {
        success: true,
        balance: account.balance,
        currency: account.currency || 'USD',
        status: account.status
      };
    } catch (error) {
      logger.error('Erreur récupération solde compte', {
        error: error.message
      });
      
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Valider la configuration Twilio
   * @returns {Promise<object>} Résultat de validation
   */
  async validateConfiguration() {
    try {
      // Test simple: récupérer les infos du compte
      const account = await this.client.accounts(this.accountSid).fetch();
      
      logger.info('Configuration Twilio validée', {
        accountSid: account.sid,
        status: account.status
      });
      
      return {
        valid: true,
        accountStatus: account.status,
        message: 'Configuration Twilio valide'
      };
    } catch (error) {
      logger.error('Configuration Twilio invalide', {
        error: error.message,
        code: error.code
      });
      
      return {
        valid: false,
        error: error.message,
        code: error.code
      };
    }
  }
}

// ===================================
// INSTANCE SINGLETON
// ===================================

let twilioService = null;

/**
 * Obtenir l'instance du service Twilio
 * @returns {TwilioService} Instance du service
 */
const getTwilioService = () => {
  if (!twilioService) {
    twilioService = new TwilioService();
  }
  return twilioService;
};

// ===================================
// FONCTIONS D'EXPORT COMPATIBLES
// ===================================

/**
 * Fonction d'envoi SMS compatible avec le contrôleur existant
 * @param {object} options - Options d'envoi {to, message}
 * @returns {Promise<object>} Résultat de l'envoi
 */
const sendSMS = async (options) => {
  const service = getTwilioService();
  return await service.sendSMS(options);
};

/**
 * Envoyer un code de vérification
 * @param {object} options - Options d'envoi
 * @returns {Promise<object>} Résultat de l'envoi
 */
const sendVerificationCode = async (options) => {
  const service = getTwilioService();
  return await service.sendVerificationCode(options);
};

/**
 * Envoyer un code de réinitialisation
 * @param {object} options - Options d'envoi
 * @returns {Promise<object>} Résultat de l'envoi
 */
const sendPasswordResetCode = async (options) => {
  const service = getTwilioService();
  return await service.sendPasswordResetCode(options);
};

// ===================================
// EXPORTS
// ===================================

module.exports = {
  TwilioService,
  getTwilioService,
  sendSMS,
  sendVerificationCode,
  sendPasswordResetCode,
  
  // Export de l'instance pour compatibilité
  twilio: getTwilioService
};

// Variables d'environnement requises (à ajouter dans .env)
/*
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_PHONE_NUMBER=+1234567890
TWILIO_VERIFY_SERVICE_SID=VAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx (optionnel)
*/