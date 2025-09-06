// services/SMSService.js
const axios = require('axios');
const crypto = require('crypto');

class SMSService {
  constructor() {
    // Configuration des providers SMS
    this.providers = {
      TWILIO: {
        enabled: process.env.TWILIO_ENABLED === 'true',
        accountSid: process.env.TWILIO_ACCOUNT_SID,
        authToken: process.env.TWILIO_AUTH_TOKEN,
        phoneNumber: process.env.TWILIO_PHONE_NUMBER
      },
      ORANGE_SMS: {
        enabled: process.env.ORANGE_SMS_ENABLED === 'true',
        apiUrl: process.env.ORANGE_SMS_API_URL,
        apiKey: process.env.ORANGE_SMS_API_KEY,
        sender: process.env.ORANGE_SMS_SENDER || 'COVOITURAPP'
      },
      BULK_SMS: {
        enabled: process.env.BULK_SMS_ENABLED === 'true',
        username: process.env.BULK_SMS_USERNAME,
        password: process.env.BULK_SMS_PASSWORD,
        apiUrl: process.env.BULK_SMS_API_URL
      }
    };

    // Provider par défaut
    this.defaultProvider = process.env.DEFAULT_SMS_PROVIDER || 'SIMULATION';
    
    // Limites et sécurité
    this.rateLimits = {
      maxSmsParMinute: 10,
      maxSmsParHeure: 100,
      maxOtpParJour: 20
    };
    
    // Cache pour rate limiting
    this.rateLimitCache = new Map();
    
    // Templates de messages
    this.templates = {
      OTP: {
        fr: 'Votre code OTP pour CovoiturApp est: {code}. Valide 10 minutes.',
        en: 'Your OTP code for CovoiturApp is: {code}. Valid for 10 minutes.'
      },
      CONFIRMATION_PAIEMENT: {
        fr: 'Paiement de {montant} FCFA confirmé. Ref: {reference}',
        en: 'Payment of {montant} FCFA confirmed. Ref: {reference}'
      },
      ECHEC_PAIEMENT: {
        fr: 'Échec du paiement de {montant} FCFA. Réessayez.',
        en: 'Payment of {montant} FCFA failed. Please try again.'
      },
      REMBOURSEMENT: {
        fr: 'Remboursement de {montant} FCFA traité. Ref: {reference}',
        en: 'Refund of {montant} FCFA processed. Ref: {reference}'
      },
      SOLDE_INSUFFISANT: {
        fr: 'Solde insuffisant. Rechargez votre portefeuille.',
        en: 'Insufficient balance. Please top up your wallet.'
      },
      LITIGE: {
        fr: 'Litige ouvert pour transaction {reference}. Support: +225XXXXXXXX',
        en: 'Dispute opened for transaction {reference}. Support: +225XXXXXXXX'
      }
    };
  }

  /**
   * Envoyer un SMS OTP
   * @param {string} numeroTelephone 
   * @param {string} codeOTP 
   * @param {string} langue 
   * @returns {Promise<Object>}
   */
  async envoyerOTP(numeroTelephone, codeOTP, langue = 'fr') {
    try {
      // Vérifier rate limiting pour OTP
      if (!this._verifierRateLimit(numeroTelephone, 'OTP')) {
        throw new Error('Limite d\'OTP dépassée pour ce numéro');
      }

      const message = this.templates.OTP[langue].replace('{code}', codeOTP);
      
      const resultat = await this._envoyerSMS(numeroTelephone, message, 'OTP');
      
      // Enregistrer l'envoi pour rate limiting
      this._enregistrerEnvoi(numeroTelephone, 'OTP');
      
      return {
        success: true,
        messageId: resultat.messageId,
        provider: resultat.provider,
        cout: resultat.cout || 0
      };

    } catch (error) {
      console.error('Erreur envoi OTP SMS:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Envoyer une notification de paiement
   * @param {string} numeroTelephone 
   * @param {string} typeNotification 
   * @param {Object} donnees 
   * @param {string} langue 
   * @returns {Promise<Object>}
   */
  async envoyerNotificationPaiement(numeroTelephone, typeNotification, donnees = {}, langue = 'fr') {
    try {
      if (!this.templates[typeNotification]) {
        throw new Error(`Template non trouvé pour: ${typeNotification}`);
      }

      let message = this.templates[typeNotification][langue];
      
      // Remplacer les variables dans le message
      Object.keys(donnees).forEach(key => {
        message = message.replace(`{${key}}`, donnees[key]);
      });

      const resultat = await this._envoyerSMS(numeroTelephone, message, typeNotification);
      
      return {
        success: true,
        messageId: resultat.messageId,
        provider: resultat.provider,
        typeNotification,
        cout: resultat.cout || 0
      };

    } catch (error) {
      console.error('Erreur envoi notification SMS:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Envoyer un SMS générique
   * @param {string} numeroTelephone 
   * @param {string} message 
   * @param {string} type 
   * @returns {Promise<Object>}
   */
  async envoyerSMS(numeroTelephone, message, type = 'GENERAL') {
    try {
      const resultat = await this._envoyerSMS(numeroTelephone, message, type);
      
      return {
        success: true,
        messageId: resultat.messageId,
        provider: resultat.provider,
        cout: resultat.cout || 0
      };

    } catch (error) {
      console.error('Erreur envoi SMS:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Vérifier le statut d'un SMS
   * @param {string} messageId 
   * @param {string} provider 
   * @returns {Promise<Object>}
   */
  async verifierStatutSMS(messageId, provider) {
    try {
      switch (provider) {
        case 'TWILIO':
          return await this._verifierStatutTwilio(messageId);
        case 'ORANGE_SMS':
          return await this._verifierStatutOrangeSMS(messageId);
        case 'BULK_SMS':
          return await this._verifierStatutBulkSMS(messageId);
        default:
          return { statut: 'UNKNOWN', provider };
      }
    } catch (error) {
      console.error('Erreur vérification statut SMS:', error);
      return { statut: 'ERROR', error: error.message };
    }
  }

  /**
   * Obtenir les statistiques d'envoi SMS
   * @param {Date} dateDebut 
   * @param {Date} dateFin 
   * @returns {Object}
   */
  getStatistiques(dateDebut = null, dateFin = null) {
    // Simulation de statistiques
    return {
      periode: { dateDebut, dateFin },
      totalEnvoyes: 1250,
      totalSucces: 1189,
      totalEchecs: 61,
      tauxSucces: 95.12,
      coutTotal: 18750, // En FCFA
      parProvider: {
        TWILIO: { envoyes: 450, succes: 445, echecs: 5, cout: 6750 },
        ORANGE_SMS: { envoyes: 600, succes: 580, echecs: 20, cout: 9000 },
        BULK_SMS: { envoyes: 200, succes: 164, echecs: 36, cout: 3000 }
      },
      parType: {
        OTP: { envoyes: 450, succes: 440, echecs: 10 },
        CONFIRMATION_PAIEMENT: { envoyes: 380, succes: 375, echecs: 5 },
        ECHEC_PAIEMENT: { envoyes: 120, succes: 115, echecs: 5 },
        REMBOURSEMENT: { envoyes: 80, succes: 78, echecs: 2 },
        AUTRES: { envoyes: 220, succes: 181, echecs: 39 }
      }
    };
  }

  // ===== MÉTHODES PRIVÉES =====

  /**
   * Méthode principale d'envoi SMS
   * @private
   */
  async _envoyerSMS(numeroTelephone, message, type) {
    // Valider le numéro
    if (!this._validerNumero(numeroTelephone)) {
      throw new Error('Numéro de téléphone invalide');
    }

    // Nettoyer le message
    message = this._nettoyerMessage(message);

    // Choisir le provider
    const provider = this._choisirProvider(numeroTelephone, type);

    // Envoyer selon le provider
    switch (provider) {
      case 'TWILIO':
        return await this._envoyerViaTwilio(numeroTelephone, message, type);
      case 'ORANGE_SMS':
        return await this._envoyerViaOrangeSMS(numeroTelephone, message, type);
      case 'BULK_SMS':
        return await this._envoyerViaBulkSMS(numeroTelephone, message, type);
      case 'SIMULATION':
      default:
        return await this._simulerEnvoiSMS(numeroTelephone, message, type);
    }
  }

  /**
   * Envoyer via Twilio
   * @private
   */
  async _envoyerViaTwilio(numeroTelephone, message, _type) {
    const twilio = require('twilio');
    const client = twilio(
      this.providers.TWILIO.accountSid,
      this.providers.TWILIO.authToken
    );

    try {
      const sms = await client.messages.create({
        body: message,
        from: this.providers.TWILIO.phoneNumber,
        to: numeroTelephone
      });

      return {
        messageId: sms.sid,
        provider: 'TWILIO',
        statut: sms.status,
        cout: this._calculerCout(message, 'TWILIO')
      };

    } catch (error) {
      throw new Error(`Erreur Twilio: ${error.message}`);
    }
  }

  /**
   * Envoyer via Orange SMS API
   * @private
   */
  async _envoyerViaOrangeSMS(numeroTelephone, message, type) {
    try {
      const response = await axios.post(this.providers.ORANGE_SMS.apiUrl, {
        sender: this.providers.ORANGE_SMS.sender,
        recipient: numeroTelephone,
        message: message,
        type: type
      }, {
        headers: {
          'Authorization': `Bearer ${this.providers.ORANGE_SMS.apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      return {
        messageId: response.data.messageId || `ORANGE_${Date.now()}`,
        provider: 'ORANGE_SMS',
        statut: response.data.status || 'SENT',
        cout: this._calculerCout(message, 'ORANGE_SMS')
      };

    } catch (error) {
      throw new Error(`Erreur Orange SMS: ${error.message}`);
    }
  }

  /**
   * Envoyer via Bulk SMS
   * @private
   */
  async _envoyerViaBulkSMS(numeroTelephone, message, _type) {
    try {
      const auth = Buffer.from(
        `${this.providers.BULK_SMS.username}:${this.providers.BULK_SMS.password}`
      ).toString('base64');

      const response = await axios.post(this.providers.BULK_SMS.apiUrl, {
        to: numeroTelephone,
        body: message
      }, {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json'
        }
      });

      return {
        messageId: response.data.id || `BULK_${Date.now()}`,
        provider: 'BULK_SMS',
        statut: response.data.status || 'ACCEPTED',
        cout: this._calculerCout(message, 'BULK_SMS')
      };

    } catch (error) {
      throw new Error(`Erreur Bulk SMS: ${error.message}`);
    }
  }

  /**
   * Simuler l'envoi SMS (pour développement)
   * @private
   */
  async _simulerEnvoiSMS(numeroTelephone, message, type) {
    console.log('=== SIMULATION SMS ===');
    console.log(`À: ${numeroTelephone}`);
    console.log(`Type: ${type}`);
    console.log(`Message: ${message}`);
    console.log('=====================');

    // Simuler délai d'envoi
    await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 500));

    // Simuler succès dans 95% des cas
    if (Math.random() > 0.05) {
      return {
        messageId: `SIM_${crypto.randomBytes(8).toString('hex')}`,
        provider: 'SIMULATION',
        statut: 'DELIVERED',
        cout: this._calculerCout(message, 'SIMULATION')
      };
    } else {
      throw new Error('Simulation d\'échec SMS');
    }
  }

  /**
   * Vérifier les limites d'envoi
   * @private
   */
  _verifierRateLimit(numeroTelephone, type) {
    const maintenant = Date.now();
    const cleCache = `${numeroTelephone}_${type}`;
    
    if (!this.rateLimitCache.has(cleCache)) {
      this.rateLimitCache.set(cleCache, []);
    }
    
    const envois = this.rateLimitCache.get(cleCache);
    
    // Nettoyer les anciens envois (plus de 24h)
    const envoispoursuit = envois.filter(timestamp => 
      maintenant - timestamp < 24 * 60 * 60 * 1000
    );
    
    // Vérifier limite quotidienne pour OTP
    if (type === 'OTP' && envoispoursuit.length >= this.rateLimits.maxOtpParJour) {
      return false;
    }
    
    // Vérifier limite horaire
    const envoisDerniereHeure = envoispoursuit.filter(timestamp => 
      maintenant - timestamp < 60 * 60 * 1000
    );
    
    if (envoisDerniereHeure.length >= this.rateLimits.maxSmsParHeure) {
      return false;
    }
    
    // Vérifier limite par minute
    const envoisDerniereMinute = envoispoursuit.filter(timestamp => 
      maintenant - timestamp < 60 * 1000
    );
    
    if (envoisDerniereMinute.length >= this.rateLimits.maxSmsParMinute) {
      return false;
    }
    
    return true;
  }

  /**
   * Enregistrer un envoi pour rate limiting
   * @private
   */
  _enregistrerEnvoi(numeroTelephone, type) {
    const cleCache = `${numeroTelephone}_${type}`;
    if (!this.rateLimitCache.has(cleCache)) {
      this.rateLimitCache.set(cleCache, []);
    }
    this.rateLimitCache.get(cleCache).push(Date.now());
  }

  /**
   * Valider un numéro de téléphone
   * @private
   */
  _validerNumero(numero) {
    // Nettoyer le numéro
    numero = numero.replace(/[\s\-()]/g, '');
    
    // Formats acceptés:
    // +225XXXXXXXX (10 chiffres après +225)
    // 225XXXXXXXX
    // 0XXXXXXX (8 chiffres après 0)
    const regexFormats = [
      /^\+225[0-9]{8}$/,  // +225XXXXXXXX
      /^225[0-9]{8}$/,    // 225XXXXXXXX
      /^0[0-9]{7}$/       // 0XXXXXXX
    ];
    
    return regexFormats.some(regex => regex.test(numero));
  }

  /**
   * Nettoyer le message SMS
   * @private
   */
  _nettoyerMessage(message) {
    // Limiter à 160 caractères
    if (message.length > 160) {
      message = message.substring(0, 157) + '...';
    }
    
    // Remplacer les caractères spéciaux problématiques
    return message
      .replace(/[""]/g, '"')
      .replace(/['']/g, "'")
      .replace(/…/g, '...');
  }

  /**
   * Choisir le meilleur provider
   * @private
   */
  _choisirProvider(numeroTelephone, type) {
    // Logique de choix du provider selon:
    // - Disponibilité
    // - Type de message
    // - Opérateur du destinataire
    // - Coût
    
    // Détecter l'opérateur
    const operateur = this._detecterOperateur(numeroTelephone);
    
    // Prioriser selon l'opérateur pour de meilleures performances
    if (operateur === 'ORANGE' && this.providers.ORANGE_SMS.enabled) {
      return 'ORANGE_SMS';
    }
    
    // Prioriser Twilio pour OTP (plus fiable)
    if (type === 'OTP' && this.providers.TWILIO.enabled) {
      return 'TWILIO';
    }
    
    // Provider par défaut
    return this.defaultProvider;
  }

  /**
   * Détecter l'opérateur mobile
   * @private
   */
  _detecterOperateur(numero) {
    // Nettoyer le numéro
    numero = numero.replace(/[\s\-()]/g, '');
    
    // Préfixes des opérateurs ivoiriens
    if (numero.match(/^(225)?07/)) return 'ORANGE';
    if (numero.match(/^(225)?05/)) return 'MTN';
    if (numero.match(/^(225)?01/)) return 'MOOV';
    
    return 'UNKNOWN';
  }

  /**
   * Calculer le coût d'un SMS
   * @private
   */
  _calculerCout(message, provider) {
    const coutParProvider = {
      'TWILIO': 15,      // 15 FCFA par SMS
      'ORANGE_SMS': 10,  // 10 FCFA par SMS
      'BULK_SMS': 12,    // 12 FCFA par SMS
      'SIMULATION': 0    // Gratuit en simulation
    };
    
    // Coût de base
    let cout = coutParProvider[provider] || 10;
    
    // Majoration pour SMS longs
    const nombreSegments = Math.ceil(message.length / 160);
    cout *= nombreSegments;
    
    return cout;
  }

  /**
   * Vérifier le statut via Twilio
   * @private
   */
  async _verifierStatutTwilio(messageId) {
    const twilio = require('twilio');
    const client = twilio(
      this.providers.TWILIO.accountSid,
      this.providers.TWILIO.authToken
    );

    try {
      const message = await client.messages(messageId).fetch();
      return {
        statut: message.status,
        dateEnvoi: message.dateCreated,
        erreur: message.errorMessage,
        provider: 'TWILIO'
      };
    } catch (error) {
      return { statut: 'ERROR', erreur: error.message };
    }
  }

  /**
   * Vérifier le statut via Orange SMS
   * @private
   */
  async _verifierStatutOrangeSMS(messageId) {
    try {
      const response = await axios.get(
        `${this.providers.ORANGE_SMS.apiUrl}/status/${messageId}`,
        {
          headers: {
            'Authorization': `Bearer ${this.providers.ORANGE_SMS.apiKey}`
          }
        }
      );

      return {
        statut: response.data.status,
        dateEnvoi: response.data.sentDate,
        provider: 'ORANGE_SMS'
      };
    } catch (error) {
      return { statut: 'ERROR', erreur: error.message };
    }
  }

  /**
   * Vérifier le statut via Bulk SMS
   * @private
   */
  async _verifierStatutBulkSMS(messageId) {
    try {
      const auth = Buffer.from(
        `${this.providers.BULK_SMS.username}:${this.providers.BULK_SMS.password}`
      ).toString('base64');

      const response = await axios.get(
        `${this.providers.BULK_SMS.apiUrl}/status/${messageId}`,
        {
          headers: {
            'Authorization': `Basic ${auth}`
          }
        }
      );

      return {
        statut: response.data.status,
        dateEnvoi: response.data.date,
        provider: 'BULK_SMS'
      };
    } catch (error) {
      return { statut: 'ERROR', erreur: error.message };
    }
  }

  /**
   * Nettoyer le cache des rate limits (à appeler périodiquement)
   */
  nettoyerCache() {
    const maintenant = Date.now();
    for (const [cle, envois] of this.rateLimitCache.entries()) {
      const envoispoursuit = envois.filter(timestamp => 
        maintenant - timestamp < 24 * 60 * 60 * 1000
      );
      
      if (envoispoursuit.length === 0) {
        this.rateLimitCache.delete(cle);
      } else {
        this.rateLimitCache.set(cle, envoispoursuit);
      }
    }
  }
}

// Export singleton
module.exports = new SMSService();