// services/SMSService.js
const axios = require('axios');
const crypto = require('crypto');
const EventEmitter = require('events');

class SMSService extends EventEmitter {
  constructor() {
    super();
    
    // Configuration des providers SMS
    this.providers = {
      TWILIO: {
        enabled: process.env.TWILIO_ENABLED === 'true',
        accountSid: process.env.TWILIO_ACCOUNT_SID,
        authToken: process.env.TWILIO_AUTH_TOKEN,
        phoneNumber: process.env.TWILIO_PHONE_NUMBER,
        timeout: parseInt(process.env.TWILIO_TIMEOUT) || 30000
      },
      ORANGE_SMS: {
        enabled: process.env.ORANGE_SMS_ENABLED === 'true',
        apiUrl: process.env.ORANGE_SMS_API_URL,
        apiKey: process.env.ORANGE_SMS_API_KEY,
        sender: process.env.ORANGE_SMS_SENDER || 'COVOITURAPP',
        timeout: parseInt(process.env.ORANGE_SMS_TIMEOUT) || 30000
      },
      BULK_SMS: {
        enabled: process.env.BULK_SMS_ENABLED === 'true',
        username: process.env.BULK_SMS_USERNAME,
        password: process.env.BULK_SMS_PASSWORD,
        apiUrl: process.env.BULK_SMS_API_URL,
        timeout: parseInt(process.env.BULK_SMS_TIMEOUT) || 30000
      }
    };

    // Provider par défaut
    this.defaultProvider = process.env.DEFAULT_SMS_PROVIDER || 'SIMULATION';
    
    // Configuration des limites (peut être surchargée via env)
    this.rateLimits = {
      maxSmsParMinute: parseInt(process.env.SMS_RATE_LIMIT_MINUTE) || 10,
      maxSmsParHeure: parseInt(process.env.SMS_RATE_LIMIT_HOUR) || 100,
      maxOtpParJour: parseInt(process.env.SMS_RATE_LIMIT_OTP_DAY) || 20,
      maxRetriesParProvider: parseInt(process.env.SMS_MAX_RETRIES) || 3
    };
    
    // Cache pour rate limiting avec TTL
    this.rateLimitCache = new Map();
    this.cacheCleanupInterval = null;
    
    // Statistiques en temps réel
    this.statistiques = {
      totalEnvoyes: 0,
      totalSucces: 0,
      totalEchecs: 0,
      parProvider: {},
      parType: {},
      derniereMAJ: new Date()
    };
    
    // Queue de retry pour les échecs
    this.retryQueue = [];
    this.retryInterval = null;
    
    // Templates de messages avec validation
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
      },
      VERIFICATION_COMPTE: {
        fr: 'Votre code de vérification CovoiturApp: {code}. Valide 10 minutes.',
        en: 'Your CovoiturApp verification code: {code}. Valid for 10 minutes.'
      },
      NOTIFICATION_TRAJET: {
        fr: 'Nouveau trajet disponible! De {origine} à {destination}. Prix: {prix} FCFA',
        en: 'New ride available! From {origine} to {destination}. Price: {prix} FCFA'
      }
    };

    // Initialiser le service
    this._initialiser();
  }

  /**
   * Initialisation du service
   * @private
   */
  _initialiser() {
    try {
      // Valider la configuration
      this._validerConfiguration();
      
      // Démarrer le nettoyage automatique du cache
      this._demarrerNettoyageCache();
      
      // Démarrer le système de retry
      this._demarrerSystemeRetry();
      
      // Initialiser les statistiques par provider
      Object.keys(this.providers).forEach(provider => {
        this.statistiques.parProvider[provider] = {
          envoyes: 0, succes: 0, echecs: 0, cout: 0
        };
      });
      
      console.log('SMS Service initialisé avec succès');
      this.emit('service:ready');
      
    } catch (error) {
      console.error('Erreur initialisation SMS Service:', error.message);
      this.emit('service:error', error);
    }
  }

  /**
   * Valider la configuration au démarrage
   * @private
   */
  _validerConfiguration() {
    const erreurs = [];
    
    // Vérifier qu'au moins un provider est configuré
    const providersActifs = Object.keys(this.providers).filter(
      key => this.providers[key].enabled
    );
    
    if (providersActifs.length === 0 && this.defaultProvider !== 'SIMULATION') {
      erreurs.push('Aucun provider SMS activé et mode simulation désactivé');
    }
    
    // Valider configuration Twilio si activé
    if (this.providers.TWILIO.enabled) {
      if (!this.providers.TWILIO.accountSid || !this.providers.TWILIO.authToken) {
        erreurs.push('Configuration Twilio incomplète (accountSid/authToken manquants)');
      }
    }
    
    // Valider configuration Orange SMS si activé
    if (this.providers.ORANGE_SMS.enabled) {
      if (!this.providers.ORANGE_SMS.apiUrl || !this.providers.ORANGE_SMS.apiKey) {
        erreurs.push('Configuration Orange SMS incomplète (apiUrl/apiKey manquants)');
      }
    }
    
    // Valider configuration Bulk SMS si activé
    if (this.providers.BULK_SMS.enabled) {
      if (!this.providers.BULK_SMS.username || !this.providers.BULK_SMS.password) {
        erreurs.push('Configuration Bulk SMS incomplète (username/password manquants)');
      }
    }
    
    if (erreurs.length > 0) {
      throw new Error(`Erreurs de configuration SMS: ${erreurs.join(', ')}`);
    }
  }

  /**
   * Démarrer le nettoyage automatique du cache
   * @private
   */
  _demarrerNettoyageCache() {
    if (this.cacheCleanupInterval) {
      clearInterval(this.cacheCleanupInterval);
    }
    
    // Nettoyer toutes les heures
    this.cacheCleanupInterval = setInterval(() => {
      this.nettoyerCache();
    }, 60 * 60 * 1000);
  }

  /**
   * Démarrer le système de retry
   * @private
   */
  _demarrerSystemeRetry() {
    if (this.retryInterval) {
      clearInterval(this.retryInterval);
    }
    
    // Traiter la queue de retry toutes les 5 minutes
    this.retryInterval = setInterval(() => {
      this._traiterQueueRetry();
    }, 5 * 60 * 1000);
  }

  /**
   * Envoyer un SMS OTP avec validation renforcée
   * @param {string} numeroTelephone 
   * @param {string} codeOTP 
   * @param {string} langue 
   * @returns {Promise<Object>}
   */
  async envoyerOTP(numeroTelephone, codeOTP, langue = 'fr') {
    try {
      // Validation des paramètres
      if (!numeroTelephone || !codeOTP) {
        throw new Error('Numéro de téléphone et code OTP requis');
      }
      
      if (!/^[0-9]{4,8}$/.test(codeOTP)) {
        throw new Error('Code OTP invalide (4-8 chiffres requis)');
      }
      
      // Vérifier rate limiting pour OTP
      if (!this._verifierRateLimit(numeroTelephone, 'OTP')) {
        const error = new Error('Limite d\'OTP dépassée pour ce numéro');
        error.code = 'RATE_LIMIT_EXCEEDED';
        throw error;
      }

      const template = this.templates.OTP[langue] || this.templates.OTP.fr;
      const message = template.replace('{code}', codeOTP);
      
      const resultat = await this._envoyerSMSAvecRetry(numeroTelephone, message, 'OTP');
      
      // Enregistrer l'envoi pour rate limiting
      this._enregistrerEnvoi(numeroTelephone, 'OTP');
      
      // Émettre événement pour monitoring
      this.emit('sms:sent', {
        type: 'OTP',
        numeroTelephone: this._masquerNumero(numeroTelephone),
        success: true,
        provider: resultat.provider
      });
      
      return {
        success: true,
        messageId: resultat.messageId,
        provider: resultat.provider,
        cout: resultat.cout || 0,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      this._gererErreurEnvoi(error, 'OTP', numeroTelephone);
      return {
        success: false,
        error: error.message,
        code: error.code || 'SMS_ERROR',
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Envoyer une notification de paiement avec validation des données
   * @param {string} numeroTelephone 
   * @param {string} typeNotification 
   * @param {Object} donnees 
   * @param {string} langue 
   * @returns {Promise<Object>}
   */
  async envoyerNotificationPaiement(numeroTelephone, typeNotification, donnees = {}, langue = 'fr') {
    try {
      // Validation des paramètres
      if (!numeroTelephone || !typeNotification) {
        throw new Error('Numéro de téléphone et type de notification requis');
      }
      
      if (!this.templates[typeNotification]) {
        throw new Error(`Template non trouvé pour: ${typeNotification}`);
      }

      // Validation des données selon le type
      this._validerDonneesNotification(typeNotification, donnees);

      const template = this.templates[typeNotification][langue] || this.templates[typeNotification].fr;
      let message = template;
      
      // Remplacer les variables dans le message avec échappement
      Object.keys(donnees).forEach(key => {
        const valeur = this._echapperValeur(donnees[key]);
        message = message.replace(new RegExp(`\\{${key}\\}`, 'g'), valeur);
      });

      const resultat = await this._envoyerSMSAvecRetry(numeroTelephone, message, typeNotification);
      
      this.emit('sms:sent', {
        type: typeNotification,
        numeroTelephone: this._masquerNumero(numeroTelephone),
        success: true,
        provider: resultat.provider
      });
      
      return {
        success: true,
        messageId: resultat.messageId,
        provider: resultat.provider,
        typeNotification,
        cout: resultat.cout || 0,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      this._gererErreurEnvoi(error, typeNotification, numeroTelephone);
      return {
        success: false,
        error: error.message,
        code: error.code || 'SMS_ERROR',
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Envoyer un SMS générique avec validation
   * @param {string} numeroTelephone 
   * @param {string} message 
   * @param {string} type 
   * @returns {Promise<Object>}
   */
  async envoyerSMS(numeroTelephone, message, type = 'GENERAL') {
    try {
      // Validation des paramètres
      if (!numeroTelephone || !message) {
        throw new Error('Numéro de téléphone et message requis');
      }
      
      if (message.length > 1600) { // Limite pour SMS concatenés
        throw new Error('Message trop long (1600 caractères max)');
      }

      const resultat = await this._envoyerSMSAvecRetry(numeroTelephone, message, type);
      
      this.emit('sms:sent', {
        type,
        numeroTelephone: this._masquerNumero(numeroTelephone),
        success: true,
        provider: resultat.provider
      });
      
      return {
        success: true,
        messageId: resultat.messageId,
        provider: resultat.provider,
        cout: resultat.cout || 0,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      this._gererErreurEnvoi(error, type, numeroTelephone);
      return {
        success: false,
        error: error.message,
        code: error.code || 'SMS_ERROR',
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Vérifier le statut d'un SMS avec timeout
   * @param {string} messageId 
   * @param {string} provider 
   * @returns {Promise<Object>}
   */
  async verifierStatutSMS(messageId, provider) {
    try {
      if (!messageId || !provider) {
        throw new Error('MessageId et provider requis');
      }

      let resultat;
      switch (provider.toUpperCase()) {
        case 'TWILIO':
          resultat = await this._verifierStatutTwilio(messageId);
          break;
        case 'ORANGE_SMS':
          resultat = await this._verifierStatutOrangeSMS(messageId);
          break;
        case 'BULK_SMS':
          resultat = await this._verifierStatutBulkSMS(messageId);
          break;
        case 'SIMULATION':
          resultat = { statut: 'DELIVERED', provider: 'SIMULATION' };
          break;
        default:
          resultat = { statut: 'UNKNOWN', provider, error: 'Provider non supporté' };
      }
      
      return {
        ...resultat,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      return { 
        statut: 'ERROR', 
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Obtenir les statistiques d'envoi SMS en temps réel
   * @param {Date} dateDebut 
   * @param {Date} dateFin 
   * @returns {Object}
   */
  getStatistiques(dateDebut = null, dateFin = null) {
    const stats = {
      ...this.statistiques,
      periode: { dateDebut, dateFin },
      tauxSucces: this.statistiques.totalEnvoyes > 0 ? 
        ((this.statistiques.totalSucces / this.statistiques.totalEnvoyes) * 100).toFixed(2) : 0,
      cacheInfo: {
        tailleCache: this.rateLimitCache.size,
        queueRetry: this.retryQueue.length
      },
      providersDisponibles: this._getProvidersDisponibles(),
      derniereMiseAJour: this.statistiques.derniereMAJ
    };

    return stats;
  }

  /**
   * Obtenir les providers disponibles
   * @private
   */
  _getProvidersDisponibles() {
    const disponibles = {};
    Object.keys(this.providers).forEach(provider => {
      disponibles[provider] = {
        enabled: this.providers[provider].enabled,
        configured: this._isProviderConfigured(provider)
      };
    });
    return disponibles;
  }

  /**
   * Vérifier si un provider est correctement configuré
   * @private
   */
  _isProviderConfigured(provider) {
    const config = this.providers[provider];
    switch (provider) {
      case 'TWILIO':
        return !!(config.accountSid && config.authToken && config.phoneNumber);
      case 'ORANGE_SMS':
        return !!(config.apiUrl && config.apiKey);
      case 'BULK_SMS':
        return !!(config.username && config.password && config.apiUrl);
      default:
        return false;
    }
  }

  // ===== MÉTHODES PRIVÉES AMÉLIORÉES =====

  /**
   * Envoyer SMS avec système de retry
   * @private
   */
  async _envoyerSMSAvecRetry(numeroTelephone, message, type) {
    let derniereErreur;
    const providersEssayes = [];

    for (let tentative = 0; tentative < this.rateLimits.maxRetriesParProvider; tentative++) {
      try {
        const provider = this._choisirProvider(numeroTelephone, type, providersEssayes);
        
        if (!provider) {
          throw new Error('Aucun provider disponible');
        }
        
        providersEssayes.push(provider);
        const resultat = await this._envoyerSMS(numeroTelephone, message, type, provider);
        
        // Mettre à jour les statistiques en cas de succès
        this._mettreAJourStatistiques(type, provider, true, resultat.cout);
        
        return resultat;
        
      } catch (error) {
        derniereErreur = error;
        
        // Mettre à jour les statistiques en cas d'échec
        this._mettreAJourStatistiques(type, providersEssayes[providersEssayes.length - 1], false, 0);
        
        // Si c'est une erreur de rate limiting, ne pas retry
        if (error.code === 'RATE_LIMIT_EXCEEDED') {
          break;
        }
        
        // Attendre avant le prochain retry
        if (tentative < this.rateLimits.maxRetriesParProvider - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000 * (tentative + 1)));
        }
      }
    }

    // Ajouter à la queue de retry si tous les providers ont échoué
    this._ajouterAQueueRetry(numeroTelephone, message, type);
    
    throw derniereErreur || new Error('Échec d\'envoi SMS après toutes les tentatives');
  }

  /**
   * Méthode principale d'envoi SMS avec provider spécifique
   * @private
   */
  async _envoyerSMS(numeroTelephone, message, type, providerForce = null) {
    // Valider le numéro
    if (!this._validerNumero(numeroTelephone)) {
      const error = new Error('Numéro de téléphone invalide');
      error.code = 'INVALID_PHONE_NUMBER';
      throw error;
    }

    // Nettoyer le message
    message = this._nettoyerMessage(message);

    // Choisir le provider
    const provider = providerForce || this._choisirProvider(numeroTelephone, type);

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
   * Envoyer via Twilio avec timeout et validation
   * @private
   */
  async _envoyerViaTwilio(numeroTelephone, message, _type) {
    if (!this.providers.TWILIO.enabled || !this._isProviderConfigured('TWILIO')) {
      throw new Error('Provider Twilio non configuré ou désactivé');
    }

    // Import conditionnel avec gestion d'erreur
    let twilio;
    try {
      twilio = require('twilio');
    } catch (error) {
      throw new Error('Module twilio non installé');
    }

    const client = twilio(
      this.providers.TWILIO.accountSid,
      this.providers.TWILIO.authToken,
      { timeout: this.providers.TWILIO.timeout }
    );

    try {
      const sms = await Promise.race([
        client.messages.create({
          body: message,
          from: this.providers.TWILIO.phoneNumber,
          to: this._normaliserNumero(numeroTelephone)
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout Twilio')), this.providers.TWILIO.timeout)
        )
      ]);

      return {
        messageId: sms.sid,
        provider: 'TWILIO',
        statut: sms.status,
        cout: this._calculerCout(message, 'TWILIO')
      };

    } catch (error) {
      const smsError = new Error(`Erreur Twilio: ${error.message}`);
      smsError.code = 'TWILIO_ERROR';
      throw smsError;
    }
  }

  /**
   * Envoyer via Orange SMS API avec timeout
   * @private
   */
  async _envoyerViaOrangeSMS(numeroTelephone, message, type) {
    if (!this.providers.ORANGE_SMS.enabled || !this._isProviderConfigured('ORANGE_SMS')) {
      throw new Error('Provider Orange SMS non configuré ou désactivé');
    }

    try {
      const response = await axios.post(this.providers.ORANGE_SMS.apiUrl, {
        sender: this.providers.ORANGE_SMS.sender,
        recipient: this._normaliserNumero(numeroTelephone),
        message: message,
        type: type
      }, {
        headers: {
          'Authorization': `Bearer ${this.providers.ORANGE_SMS.apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: this.providers.ORANGE_SMS.timeout
      });

      return {
        messageId: response.data.messageId || `ORANGE_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
        provider: 'ORANGE_SMS',
        statut: response.data.status || 'SENT',
        cout: this._calculerCout(message, 'ORANGE_SMS')
      };

    } catch (error) {
      const smsError = new Error(`Erreur Orange SMS: ${error.response?.data?.message || error.message}`);
      smsError.code = 'ORANGE_SMS_ERROR';
      throw smsError;
    }
  }

  /**
   * Envoyer via Bulk SMS avec timeout
   * @private
   */
  async _envoyerViaBulkSMS(numeroTelephone, message, _type) {
    if (!this.providers.BULK_SMS.enabled || !this._isProviderConfigured('BULK_SMS')) {
      throw new Error('Provider Bulk SMS non configuré ou désactivé');
    }

    try {
      const auth = Buffer.from(
        `${this.providers.BULK_SMS.username}:${this.providers.BULK_SMS.password}`
      ).toString('base64');

      const response = await axios.post(this.providers.BULK_SMS.apiUrl, {
        to: this._normaliserNumero(numeroTelephone),
        body: message
      }, {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Content-Type': 'application/json'
        },
        timeout: this.providers.BULK_SMS.timeout
      });

      return {
        messageId: response.data.id || `BULK_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
        provider: 'BULK_SMS',
        statut: response.data.status || 'ACCEPTED',
        cout: this._calculerCout(message, 'BULK_SMS')
      };

    } catch (error) {
      const smsError = new Error(`Erreur Bulk SMS: ${error.response?.data?.message || error.message}`);
      smsError.code = 'BULK_SMS_ERROR';
      throw smsError;
    }
  }

  /**
   * Simuler l'envoi SMS avec logs sécurisés
   * @private
   */
  async _simulerEnvoiSMS(numeroTelephone, message, type) {
    const numeroMasque = this._masquerNumero(numeroTelephone);
    const messageTronque = message.length > 50 ? message.substring(0, 47) + '...' : message;
    
    console.log('=== SIMULATION SMS ===');
    console.log(`À: ${numeroMasque}`);
    console.log(`Type: ${type}`);
    console.log(`Message: ${messageTronque}`);
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
      const error = new Error('Simulation d\'échec SMS');
      error.code = 'SIMULATION_ERROR';
      throw error;
    }
  }

  /**
   * Valider un numéro de téléphone avec règles strictes
   * @private
   */
  _validerNumero(numero) {
    if (!numero || typeof numero !== 'string') {
      return false;
    }

    // Nettoyer le numéro
    const numeroNettoye = numero.replace(/[\s\-()]/g, '');
    
    // Formats acceptés pour la Côte d'Ivoire:
    const regexFormats = [
      /^\+225[0-9]{8}$/,    // +225XXXXXXXX (format international)
      /^225[0-9]{8}$/,      // 225XXXXXXXX (sans +)
      /^0[0-9]{7}$/,        // 0XXXXXXX (format local 8 chiffres)
      /^[0-9]{8}$/          // XXXXXXXX (8 chiffres directs)
    ];
    
    const estFormatValide = regexFormats.some(regex => regex.test(numeroNettoye));
    
    if (!estFormatValide) {
      return false;
    }

    // Validation supplémentaire pour les opérateurs ivoiriens
    return this._validerOperateur(numeroNettoye);
  }

  /**
   * Valider selon les préfixes d'opérateurs ivoiriens
   * @private
   */
  _validerOperateur(numero) {
    // Supprimer les préfixes pays
    const numeroSansPrefix = numero.replace(/^(\+225|225|0)/, '');
    
    // Préfixes valides des opérateurs ivoiriens
    const prefixesValides = [
      /^07/, // Orange
      /^05/, // MTN
      /^01/, // Moov
      /^03/  // Autres opérateurs
    ];
    
    return prefixesValides.some(regex => regex.test(numeroSansPrefix));
  }

  /**
   * Normaliser le numéro pour l'envoi
   * @private
   */
  _normaliserNumero(numero) {
    // Nettoyer le numéro
    let numeroNettoye = numero.replace(/[\s\-()]/g, '');
    
    // Convertir au format international +225XXXXXXXX
    if (numeroNettoye.startsWith('0')) {
      numeroNettoye = '+225' + numeroNettoye.substring(1);
    } else if (numeroNettoye.startsWith('225')) {
      numeroNettoye = '+' + numeroNettoye;
    } else if (!numeroNettoye.startsWith('+225')) {
      numeroNettoye = '+225' + numeroNettoye;
    }
    
    return numeroNettoye;
  }

  /**
   * Masquer un numéro pour les logs
   * @private
   */
  _masquerNumero(numero) {
    if (!numero) return '***';
    const numeroNettoye = numero.replace(/[\s\-()]/g, '');
    if (numeroNettoye.length < 4) return '***';
    return numeroNettoye.substring(0, 3) + '*'.repeat(numeroNettoye.length - 6) + numeroNettoye.slice(-3);
  }

  /**
   * Valider les données de notification selon le type
   * @private
   */
  _validerDonneesNotification(type, donnees) {
    const validations = {
      CONFIRMATION_PAIEMENT: ['montant', 'reference'],
      ECHEC_PAIEMENT: ['montant'],
      REMBOURSEMENT: ['montant', 'reference'],
      LITIGE: ['reference'],
      NOTIFICATION_TRAJET: ['origine', 'destination', 'prix']
    };

    const champsRequis = validations[type] || [];
    const champsManquants = champsRequis.filter(champ => !donnees[champ]);

    if (champsManquants.length > 0) {
      throw new Error(`Champs manquants pour ${type}: ${champsManquants.join(', ')}`);
    }

    // Validation spécifique des montants
    if (donnees.montant && (isNaN(donnees.montant) || donnees.montant < 0)) {
      throw new Error('Montant invalide');
    }
  }

  /**
   * Échapper les valeurs pour éviter l'injection
   * @private
   */
  _echapperValeur(valeur) {
    if (typeof valeur !== 'string') {
      return String(valeur);
    }
    return valeur.replace(/[<>]/g, '');
  }

  /**
   * Gérer les erreurs d'envoi avec logging
   * @private
   */
  _gererErreurEnvoi(error, type, numeroTelephone) {
    const numeroMasque = this._masquerNumero(numeroTelephone);
    
    console.error(`Erreur envoi SMS ${type}:`, {
      error: error.message,
      code: error.code,
      numeroMasque,
      timestamp: new Date().toISOString()
    });

    this.emit('sms:error', {
      type,
      numeroTelephone: numeroMasque,
      error: error.message,
      code: error.code
    });
  }

  /**
   * Vérifier les limites d'envoi avec nettoyage automatique
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
    
    this.rateLimitCache.set(cleCache, envoispoursuit);
    
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
   * Enregistrer un envoi pour rate limiting avec TTL
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
   * Nettoyer le message SMS avec validation
   * @private
   */
  _nettoyerMessage(message) {
    if (!message || typeof message !== 'string') {
      return '';
    }

    // Remplacer les caractères spéciaux problématiques
    let messageNettoye = message
      .replace(/[""]/g, '"')
      .replace(/['']/g, "'")
      .replace(/…/g, '...')
      .replace(/[\r\n\t]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    // Limiter selon le type de SMS
    if (messageNettoye.length > 160) {
      // SMS long - découper en segments
      if (messageNettoye.length <= 1600) {
        return messageNettoye; // SMS concatené autorisé
      } else {
        return messageNettoye.substring(0, 157) + '...';
      }
    }
    
    return messageNettoye;
  }

  /**
   * Choisir le meilleur provider avec logique avancée
   * @private
   */
  _choisirProvider(numeroTelephone, type, providersEssayes = []) {
    // Filtrer les providers déjà essayés
    const providersDisponibles = Object.keys(this.providers).filter(provider => 
      this.providers[provider].enabled && 
      this._isProviderConfigured(provider) &&
      !providersEssayes.includes(provider)
    );

    if (providersDisponibles.length === 0) {
      return this.defaultProvider;
    }

    // Détecter l'opérateur pour optimiser la route
    const operateur = this._detecterOperateur(numeroTelephone);
    
    // Logique de choix prioritaire
    if (operateur === 'ORANGE' && providersDisponibles.includes('ORANGE_SMS')) {
      return 'ORANGE_SMS';
    }
    
    if (type === 'OTP' && providersDisponibles.includes('TWILIO')) {
      return 'TWILIO';
    }

    // Choisir selon les statistiques de succès
    const meilleurProvider = providersDisponibles.reduce((meilleur, provider) => {
      const statsProvider = this.statistiques.parProvider[provider] || { envoyes: 0, succes: 0 };
      const tauxSucces = statsProvider.envoyes > 0 ? statsProvider.succes / statsProvider.envoyes : 0.5;
      
      const statsMeilleur = this.statistiques.parProvider[meilleur] || { envoyes: 0, succes: 0 };
      const tauxSuccesMeilleur = statsMeilleur.envoyes > 0 ? statsMeilleur.succes / statsMeilleur.envoyes : 0.5;
      
      return tauxSucces > tauxSuccesMeilleur ? provider : meilleur;
    });

    return meilleurProvider || this.defaultProvider;
  }

  /**
   * Détecter l'opérateur mobile avec validation
   * @private
   */
  _detecterOperateur(numero) {
    const numeroNettoye = numero.replace(/[\s\-()]/g, '');
    
    // Supprimer les préfixes pays
    const numeroSansPrefix = numeroNettoye.replace(/^(\+225|225|0)/, '');
    
    // Préfixes des opérateurs ivoiriens
    if (/^07/.test(numeroSansPrefix)) return 'ORANGE';
    if (/^05/.test(numeroSansPrefix)) return 'MTN';
    if (/^01/.test(numeroSansPrefix)) return 'MOOV';
    if (/^03/.test(numeroSansPrefix)) return 'AUTRES';
    
    return 'UNKNOWN';
  }

  /**
   * Calculer le coût d'un SMS avec précision
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
    
    // Calcul du nombre de segments SMS
    let nombreSegments = 1;
    if (message.length > 160) {
      // SMS concatené: 153 caractères par segment après le premier
      nombreSegments = 1 + Math.ceil((message.length - 160) / 153);
    }
    
    return cout * nombreSegments;
  }

  /**
   * Mettre à jour les statistiques en temps réel
   * @private
   */
  _mettreAJourStatistiques(type, provider, succes, cout) {
    // Statistiques globales
    this.statistiques.totalEnvoyes++;
    if (succes) {
      this.statistiques.totalSucces++;
    } else {
      this.statistiques.totalEchecs++;
    }
    
    // Statistiques par provider
    if (!this.statistiques.parProvider[provider]) {
      this.statistiques.parProvider[provider] = { envoyes: 0, succes: 0, echecs: 0, cout: 0 };
    }
    
    this.statistiques.parProvider[provider].envoyes++;
    if (succes) {
      this.statistiques.parProvider[provider].succes++;
    } else {
      this.statistiques.parProvider[provider].echecs++;
    }
    this.statistiques.parProvider[provider].cout += cout;
    
    // Statistiques par type
    if (!this.statistiques.parType[type]) {
      this.statistiques.parType[type] = { envoyes: 0, succes: 0, echecs: 0 };
    }
    
    this.statistiques.parType[type].envoyes++;
    if (succes) {
      this.statistiques.parType[type].succes++;
    } else {
      this.statistiques.parType[type].echecs++;
    }
    
    this.statistiques.derniereMAJ = new Date();
  }

  /**
   * Ajouter à la queue de retry
   * @private
   */
  _ajouterAQueueRetry(numeroTelephone, message, type) {
    this.retryQueue.push({
      numeroTelephone,
      message,
      type,
      tentatives: 0,
      dateAjout: new Date(),
      prochaineTentative: new Date(Date.now() + 5 * 60 * 1000) // Dans 5 minutes
    });
  }

  /**
   * Traiter la queue de retry
   * @private
   */
  async _traiterQueueRetry() {
    const maintenant = new Date();
    const elementsATraiter = this.retryQueue.filter(
      item => item.prochaineTentative <= maintenant && item.tentatives < 3
    );

    for (const item of elementsATraiter) {
      try {
        await this._envoyerSMS(item.numeroTelephone, item.message, item.type);
        
        // Supprimer de la queue en cas de succès
        this.retryQueue = this.retryQueue.filter(i => i !== item);
        
        console.log(`Retry SMS réussi pour ${this._masquerNumero(item.numeroTelephone)}`);
        
      } catch (error) {
        item.tentatives++;
        item.prochaineTentative = new Date(Date.now() + (item.tentatives * 10 * 60 * 1000)); // Backoff exponentiel
        
        if (item.tentatives >= 3) {
          // Supprimer après 3 échecs
          this.retryQueue = this.retryQueue.filter(i => i !== item);
          console.error(`Abandon retry SMS pour ${this._masquerNumero(item.numeroTelephone)} après 3 tentatives`);
        }
      }
    }

    // Nettoyer les anciens éléments (plus de 24h)
    this.retryQueue = this.retryQueue.filter(
      item => maintenant - item.dateAjout < 24 * 60 * 60 * 1000
    );
  }

  /**
   * Vérifier le statut via Twilio avec gestion d'erreur
   * @private
   */
  async _verifierStatutTwilio(messageId) {
    if (!this._isProviderConfigured('TWILIO')) {
      return { statut: 'ERROR', erreur: 'Twilio non configuré' };
    }

    try {
      const twilio = require('twilio');
      const client = twilio(
        this.providers.TWILIO.accountSid,
        this.providers.TWILIO.authToken,
        { timeout: 10000 }
      );

      const message = await client.messages(messageId).fetch();
      return {
        statut: message.status,
        dateEnvoi: message.dateCreated,
        erreur: message.errorMessage,
        provider: 'TWILIO'
      };
    } catch (error) {
      return { statut: 'ERROR', erreur: error.message, provider: 'TWILIO' };
    }
  }

  /**
   * Vérifier le statut via Orange SMS avec timeout
   * @private
   */
  async _verifierStatutOrangeSMS(messageId) {
    if (!this._isProviderConfigured('ORANGE_SMS')) {
      return { statut: 'ERROR', erreur: 'Orange SMS non configuré' };
    }

    try {
      const response = await axios.get(
        `${this.providers.ORANGE_SMS.apiUrl}/status/${messageId}`,
        {
          headers: {
            'Authorization': `Bearer ${this.providers.ORANGE_SMS.apiKey}`
          },
          timeout: 10000
        }
      );

      return {
        statut: response.data.status,
        dateEnvoi: response.data.sentDate,
        provider: 'ORANGE_SMS'
      };
    } catch (error) {
      return { 
        statut: 'ERROR', 
        erreur: error.response?.data?.message || error.message,
        provider: 'ORANGE_SMS' 
      };
    }
  }

  /**
   * Vérifier le statut via Bulk SMS avec timeout
   * @private
   */
  async _verifierStatutBulkSMS(messageId) {
    if (!this._isProviderConfigured('BULK_SMS')) {
      return { statut: 'ERROR', erreur: 'Bulk SMS non configuré' };
    }

    try {
      const auth = Buffer.from(
        `${this.providers.BULK_SMS.username}:${this.providers.BULK_SMS.password}`
      ).toString('base64');

      const response = await axios.get(
        `${this.providers.BULK_SMS.apiUrl}/status/${messageId}`,
        {
          headers: {
            'Authorization': `Basic ${auth}`
          },
          timeout: 10000
        }
      );

      return {
        statut: response.data.status,
        dateEnvoi: response.data.date,
        provider: 'BULK_SMS'
      };
    } catch (error) {
      return { 
        statut: 'ERROR', 
        erreur: error.response?.data?.message || error.message,
        provider: 'BULK_SMS' 
      };
    }
  }

  /**
   * Nettoyer le cache des rate limits avec logging
   */
  nettoyerCache() {
    const maintenant = Date.now();
    let elementsSupprimes = 0;
    
    for (const [cle, envois] of this.rateLimitCache.entries()) {
      const envoispoursuit = envois.filter(timestamp => 
        maintenant - timestamp < 24 * 60 * 60 * 1000
      );
      
      if (envoispoursuit.length === 0) {
        this.rateLimitCache.delete(cle);
        elementsSupprimes++;
      } else if (envoispoursuit.length < envois.length) {
        this.rateLimitCache.set(cle, envoispoursuit);
      }
    }
    
    if (elementsSupprimes > 0) {
      console.log(`Cache SMS nettoyé: ${elementsSupprimes} entrées supprimées`);
    }
    
    this.emit('cache:cleaned', {
      elementsSupprimes,
      tailleCacheActuelle: this.rateLimitCache.size
    });
  }

  /**
   * Arrêter le service proprement
   */
  async arreterService() {
    console.log('Arrêt du service SMS...');
    
    // Arrêter les intervals
    if (this.cacheCleanupInterval) {
      clearInterval(this.cacheCleanupInterval);
      this.cacheCleanupInterval = null;
    }
    
    if (this.retryInterval) {
      clearInterval(this.retryInterval);
      this.retryInterval = null;
    }
    
    // Traiter les derniers éléments de la queue
    if (this.retryQueue.length > 0) {
      console.log(`Traitement final de ${this.retryQueue.length} SMS en attente...`);
      await this._traiterQueueRetry();
    }
    
    // Nettoyer le cache
    this.rateLimitCache.clear();
    
    this.emit('service:stopped');
    console.log('Service SMS arrêté');
  }

  /**
   * Obtenir l'état de santé du service
   */
  obtenirEtatSante() {
    const maintenant = new Date();
    const providersStatus = {};
    
    Object.keys(this.providers).forEach(provider => {
      providersStatus[provider] = {
        enabled: this.providers[provider].enabled,
        configured: this._isProviderConfigured(provider),
        stats: this.statistiques.parProvider[provider] || { envoyes: 0, succes: 0, echecs: 0 }
      };
    });
    
    return {
      status: 'healthy',
      timestamp: maintenant.toISOString(),
      uptime: process.uptime(),
      providers: providersStatus,
      cache: {
        size: this.rateLimitCache.size,
        retryQueue: this.retryQueue.length
      },
      statistiques: this.getStatistiques(),
      configuration: {
        rateLimits: this.rateLimits,
        defaultProvider: this.defaultProvider
      }
    };
  }
}

// Export singleton avec gestion d'erreur
let smsServiceInstance;

try {
  smsServiceInstance = new SMSService();
} catch (error) {
  console.error('Erreur création service SMS:', error.message);
  // Créer une instance basique en cas d'erreur
  smsServiceInstance = {
    envoyerOTP: async () => ({ success: false, error: 'Service SMS non disponible' }),
    envoyerNotificationPaiement: async () => ({ success: false, error: 'Service SMS non disponible' }),
    envoyerSMS: async () => ({ success: false, error: 'Service SMS non disponible' }),
    verifierStatutSMS: async () => ({ statut: 'ERROR', error: 'Service SMS non disponible' }),
    getStatistiques: () => ({ error: 'Service SMS non disponible' }),
    nettoyerCache: () => {},
    arreterService: async () => {},
    obtenirEtatSante: () => ({ status: 'unhealthy', error: 'Service SMS non disponible' })
  };
}

module.exports = smsServiceInstance;