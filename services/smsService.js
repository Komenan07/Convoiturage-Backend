// services/smsService.js
const axios = require('axios');
const { logger } = require('../utils/logger');

/**
 * Configuration du service SMS
 */
const SMS_CONFIG = {
  // Configuration pour Twilio
  TWILIO: {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    fromNumber: process.env.TWILIO_PHONE_NUMBER,
    apiUrl: 'https://api.twilio.com/2010-04-01/Accounts'
  },
  
  // Configuration pour Orange SMS API (Côte d'Ivoire)
  ORANGE: {
    clientId: process.env.ORANGE_CLIENT_ID,
    clientSecret: process.env.ORANGE_CLIENT_SECRET,
    apiUrl: 'https://api.orange.com/smsmessaging/v1',
    accessToken: null,
    tokenExpiry: null
  },
  
  // Configuration générique pour API REST
  GENERIC: {
    apiUrl: process.env.SMS_API_URL,
    apiKey: process.env.SMS_API_KEY,
    username: process.env.SMS_USERNAME,
    password: process.env.SMS_PASSWORD
  }
};

/**
 * Détermine le fournisseur SMS à utiliser
 */
const getProvider = () => {
  if (process.env.SMS_PROVIDER) {
    return process.env.SMS_PROVIDER.toUpperCase();
  }
  
  // Détection automatique basée sur les variables d'environnement
  if (SMS_CONFIG.TWILIO.accountSid && SMS_CONFIG.TWILIO.authToken) {
    return 'TWILIO';
  }
  
  if (SMS_CONFIG.ORANGE.clientId && SMS_CONFIG.ORANGE.clientSecret) {
    return 'ORANGE';
  }
  
  if (SMS_CONFIG.GENERIC.apiUrl && SMS_CONFIG.GENERIC.apiKey) {
    return 'GENERIC';
  }
  
  throw new Error('Aucun fournisseur SMS configuré');
};

/**
 * NORMALISATION COMPLÈTE POUR LA CÔTE D'IVOIRE
 * Corrige les problèmes de format qui causaient les erreurs Twilio
 */
const normaliserTelephoneCI = (telephone) => {
  if (!telephone) return null;
  
  // Supprimer tous les caractères non numériques sauf le +
  let telClean = telephone.replace(/[\s\-().]/g, '');
  
  // Cas 1: Numéro commence par +225 (déjà international)
  if (telClean.startsWith('+225')) {
    const numero = telClean.substring(4); // Enlever +225
    // Vérifier que le numéro fait exactement 10 chiffres
    if (numero.length === 10 && /^\d{10}$/.test(numero)) {
      return '+225' + numero;
    }
    return null; // Format invalide
  }
  
  // Cas 2: Numéro commence par 00225
  if (telClean.startsWith('00225')) {
    const numero = telClean.substring(5); // Enlever 00225
    if (numero.length === 10 && /^\d{10}$/.test(numero)) {
      return '+225' + numero;
    }
    return null;
  }
  
  // Cas 3: Numéro commence par 225 (sans indicateur international)
  if (telClean.startsWith('225')) {
    const numero = telClean.substring(3); // Enlever 225
    if (numero.length === 10 && /^\d{10}$/.test(numero)) {
      return '+225' + numero;
    }
    return null;
  }
  
  // Enlever le + initial s'il existe pour traitement uniforme
  telClean = telClean.replace(/^\+/, '');
  
  // Cas 4: Numéro commence par 0 (format national)
  if (telClean.startsWith('0')) {
    const numero = telClean.substring(1); // Enlever le 0
    if (numero.length === 9 && /^\d{9}$/.test(numero)) {
      return '+2250' + numero; // Ajouter +225 + 0
    }
    return null;
  }
  
  // Cas 5: Numéro de 10 chiffres (format national sans 0 initial)
  if (telClean.length === 10 && /^\d{10}$/.test(telClean)) {
    return '+225' + telClean;
  }
  
  // Cas 6: Numéro de 9 chiffres (format local sans 0)
  if (telClean.length === 9 && /^\d{9}$/.test(telClean)) {
    return '+2250' + telClean;
  }
  
  // Cas 7: Numéro de 8 chiffres (ancien format mobile)
  if (telClean.length === 8 && /^\d{8}$/.test(telClean)) {
    // Ajouter 07 pour faire un numéro mobile valide
    return '+22507' + telClean;
  }
  
  return null; // Format non reconnu
};

/**
 * Valide le format du numéro de téléphone
 */
const validatePhoneNumber = (phoneNumber) => {
  const normalized = normaliserTelephoneCI(phoneNumber);
  
  // Validation stricte format E.164 pour la Côte d'Ivoire
  const phoneRegex = /^\+225\d{10}$/;
  
  return {
    isValid: normalized !== null && phoneRegex.test(normalized),
    normalized: normalized,
    length: normalized ? normalized.length : 0
  };
};

/**
 * Service d'envoi SMS avec Twilio (VERSION CORRIGÉE)
 */
const sendViaTwilio = async (to, message) => {
  try {
    const { accountSid, authToken, fromNumber } = SMS_CONFIG.TWILIO;
    
    if (!accountSid || !authToken || !fromNumber) {
      throw new Error('Configuration Twilio incomplète');
    }

    // VALIDATION STRICTE DU NUMÉRO AVANT ENVOI
    const validation = validatePhoneNumber(to);
    if (!validation.isValid) {
      throw new Error(`Numéro de téléphone invalide pour Twilio: ${to} -> ${validation.normalized}`);
    }

    const numeroValide = validation.normalized;

    // Log détaillé pour debug
    logger.info('Préparation envoi SMS Twilio', {
      originalNumber: to,
      validatedNumber: numeroValide,
      numberLength: numeroValide.length,
      fromNumber: fromNumber
    });
    
    const response = await axios.post(
      `${SMS_CONFIG.TWILIO.apiUrl}/${accountSid}/Messages.json`,
      new URLSearchParams({
        From: fromNumber,
        To: numeroValide, // Utiliser le numéro validé
        Body: message
      }),
      {
        auth: {
          username: accountSid,
          password: authToken
        },
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 30000
      }
    );
    
    logger.info('SMS envoyé via Twilio avec succès', { 
      to: numeroValide, 
      sid: response.data.sid,
      status: response.data.status,
      price: response.data.price,
      priceUnit: response.data.price_unit
    });
    
    return {
      success: true,
      messageId: response.data.sid,
      status: response.data.status,
      provider: 'TWILIO',
      to: numeroValide,
      price: response.data.price
    };
    
  } catch (error) {
    // Log détaillé de l'erreur
    const errorDetails = {
      message: error.message,
      originalNumber: to,
      status: error.response?.status,
      twilioError: error.response?.data?.message,
      twilioCode: error.response?.data?.code,
      twilioMoreInfo: error.response?.data?.more_info,
      fullResponse: error.response?.data
    };
    
    logger.error('Erreur envoi SMS Twilio:', errorDetails);
    
    // Messages d'erreur plus spécifiques
    if (error.response?.data?.code === 21211) {
      throw new Error(`Numéro de téléphone invalide: ${to}`);
    } else if (error.response?.data?.code === 21608) {
      throw new Error(`Numéro non vérifié sur compte Twilio Trial: ${to}`);
    } else if (error.response?.data?.message?.includes('unverified')) {
      throw new Error(`Le numéro ${to} n'est pas vérifié. Les comptes Twilio Trial ne peuvent envoyer qu'aux numéros vérifiés`);
    }
    
    throw new Error(`Erreur Twilio: ${error.response?.data?.message || error.message}`);
  }
};

/**
 * Service d'envoi SMS avec Orange API (VERSION CORRIGÉE)
 */
const sendViaOrange = async (to, message) => {
  try {
    const { clientId, clientSecret, apiUrl } = SMS_CONFIG.ORANGE;
    
    if (!clientId || !clientSecret) {
      throw new Error('Configuration Orange SMS incomplète');
    }

    // Validation du numéro
    const validation = validatePhoneNumber(to);
    if (!validation.isValid) {
      throw new Error(`Numéro de téléphone invalide pour Orange: ${to}`);
    }

    const numeroValide = validation.normalized;
    
    // Obtenir le token d'accès si nécessaire
    if (!SMS_CONFIG.ORANGE.accessToken || 
        !SMS_CONFIG.ORANGE.tokenExpiry || 
        Date.now() > SMS_CONFIG.ORANGE.tokenExpiry) {
      
      await getOrangeAccessToken();
    }
    
    const smsData = {
      outboundSMSMessageRequest: {
        address: [`tel:${numeroValide}`], // Format correct pour Orange
        senderAddress: 'tel:+2250779947665', // Utiliser un numéro Orange valide
        outboundSMSTextMessage: {
          message: message
        }
      }
    };
    
    logger.info('Envoi SMS via Orange API', {
      to: numeroValide,
      messageLength: message.length
    });
    
    const response = await axios.post(
      `${apiUrl}/outbound/tel%3A%2B2250779947665/requests`, // URL encodée
      smsData,
      {
        headers: {
          'Authorization': `Bearer ${SMS_CONFIG.ORANGE.accessToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );
    
    logger.info('SMS envoyé via Orange avec succès', { 
      to: numeroValide,
      resourceURL: response.data.outboundSMSMessageRequest?.resourceURL 
    });
    
    return {
      success: true,
      messageId: response.data.outboundSMSMessageRequest?.resourceURL,
      status: 'sent',
      provider: 'ORANGE',
      to: numeroValide
    };
    
  } catch (error) {
    logger.error('Erreur envoi SMS Orange:', {
      error: error.message,
      response: error.response?.data,
      status: error.response?.status,
      originalNumber: to
    });
    
    throw new Error(`Erreur Orange: ${error.response?.data?.requestError?.serviceException?.text || error.message}`);
  }
};

/**
 * Obtenir le token d'accès Orange (VERSION CORRIGÉE)
 */
const getOrangeAccessToken = async () => {
  try {
    const { clientId, clientSecret } = SMS_CONFIG.ORANGE;
    
    const tokenData = new URLSearchParams({
      grant_type: 'client_credentials'
    });
    
    logger.info('Demande de token Orange', { clientId: clientId.substring(0, 8) + '...' });
    
    const response = await axios.post(
      'https://api.orange.com/oauth/v2/token',
      tokenData,
      {
        auth: {
          username: clientId,
          password: clientSecret
        },
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        timeout: 30000
      }
    );
    
    SMS_CONFIG.ORANGE.accessToken = response.data.access_token;
    SMS_CONFIG.ORANGE.tokenExpiry = Date.now() + (response.data.expires_in * 1000) - 60000; // 1 minute de marge
    
    logger.info('Token Orange obtenu avec succès', {
      expiresIn: response.data.expires_in,
      tokenType: response.data.token_type
    });
    
  } catch (error) {
    logger.error('Erreur obtention token Orange:', {
      error: error.message,
      response: error.response?.data,
      status: error.response?.status
    });
    throw new Error(`Impossible d'obtenir le token Orange: ${error.message}`);
  }
};

/**
 * Service d'envoi SMS générique (VERSION AMÉLIORÉE)
 */
const sendViaGeneric = async (to, message) => {
  try {
    const { apiUrl, apiKey, username, password } = SMS_CONFIG.GENERIC;
    
    if (!apiUrl) {
      throw new Error('URL API SMS non configurée');
    }

    // Validation du numéro
    const validation = validatePhoneNumber(to);
    if (!validation.isValid) {
      throw new Error(`Numéro de téléphone invalide: ${to}`);
    }

    const numeroValide = validation.normalized;
    
    const requestData = {
      to: numeroValide,
      message: message,
      from: 'WAYZ-ECO'
    };
    
    const headers = {
      'Content-Type': 'application/json'
    };
    
    // Authentification par clé API
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }
    
    // Authentification basique
    const authConfig = {};
    if (username && password) {
      authConfig.auth = {
        username: username,
        password: password
      };
    }
    
    const response = await axios.post(
      apiUrl,
      requestData,
      {
        headers,
        ...authConfig,
        timeout: 30000
      }
    );
    
    logger.info('SMS envoyé via API générique', { 
      to: numeroValide,
      response: response.data 
    });
    
    return {
      success: true,
      messageId: response.data.id || response.data.message_id,
      status: response.data.status || 'sent',
      provider: 'GENERIC',
      to: numeroValide
    };
    
  } catch (error) {
    logger.error('Erreur envoi SMS générique:', {
      error: error.message,
      response: error.response?.data,
      status: error.response?.status
    });
    
    throw new Error(`Erreur API générique: ${error.response?.data?.message || error.message}`);
  }
};

/**
 * Service d'envoi SMS en mode développement (AMÉLIORÉ)
 */
const sendViaDev = async (to, message) => {
  // Validation même en mode dev pour tester la logique
  const validation = validatePhoneNumber(to);
  
  logger.info('MODE DÉVELOPPEMENT - SMS simulé', { 
    originalNumber: to,
    validatedNumber: validation.normalized,
    isValid: validation.isValid,
    message: message.substring(0, 50) + (message.length > 50 ? '...' : ''),
    messageLength: message.length
  });
  
  // Simuler un délai d'envoi
  await new Promise(resolve => setTimeout(resolve, Math.random() * 2000 + 500));
  
  // Simuler occasionnellement une erreur (5% du temps)
  if (Math.random() < 0.05) {
    throw new Error('Erreur simulée en mode développement');
  }

  // Simuler l'erreur Twilio pour les numéros non vérifiés
  if (process.env.SIMULATE_TWILIO_UNVERIFIED === 'true' && Math.random() < 0.3) {
    throw new Error(`Le numéro ${validation.normalized || to} n'est pas vérifié. Les comptes Twilio Trial ne peuvent envoyer qu'aux numéros vérifiés`);
  }
  
  return {
    success: true,
    messageId: `dev_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    status: 'delivered',
    provider: 'DEV',
    to: validation.normalized || to,
    simulatedDelay: Math.floor(Math.random() * 2000 + 500)
  };
};

/**
 * FONCTION PRINCIPALE D'ENVOI DE SMS (VERSION CORRIGÉE)
 */
const sendSMS = async ({ to, message }) => {
  try {
    // Validation des paramètres
    if (!to || !message) {
      throw new Error('Destinataire et message requis');
    }
    
    if (message.length > 160) {
      logger.warn('Message SMS trop long', { length: message.length, to });
    }
    
    // VALIDATION STRICTE AVANT ENVOI
    const phoneValidation = validatePhoneNumber(to);
    if (!phoneValidation.isValid) {
      const errorMsg = `Numéro de téléphone invalide: ${to}${phoneValidation.normalized ? ' -> normalisé en: ' + phoneValidation.normalized : ''}`;
      logger.error('Validation téléphone échouée', {
        originalNumber: to,
        normalizedNumber: phoneValidation.normalized,
        isValid: phoneValidation.isValid,
        length: phoneValidation.length
      });
      throw new Error(errorMsg);
    }
    
    const normalizedPhone = phoneValidation.normalized;
    
    logger.info('Début envoi SMS', { 
      originalNumber: to,
      normalizedNumber: normalizedPhone,
      messageLength: message.length,
      phoneLength: normalizedPhone.length
    });
    
    // Déterminer le fournisseur à utiliser
    const provider = getProvider();
    
    let result;
    
    switch (provider) {
      case 'TWILIO': {
        result = await sendViaTwilio(normalizedPhone, message);
        break;
      }
        
      case 'ORANGE': {
        result = await sendViaOrange(normalizedPhone, message);
        break;
      }
        
      case 'GENERIC': {
        result = await sendViaGeneric(normalizedPhone, message);
        break;
      }
        
      case 'DEV': {
        result = await sendViaDev(normalizedPhone, message);
        break;
      }
        
      default:
        throw new Error(`Fournisseur SMS non supporté: ${provider}`);
    }
    
    // Log du succès avec détails complets
    logger.info('SMS envoyé avec succès', {
      originalNumber: to,
      normalizedNumber: normalizedPhone,
      provider: result.provider,
      messageId: result.messageId,
      status: result.status,
      messageLength: message.length
    });
    
    return result;
    
  } catch (error) {
    // Log détaillé de l'erreur
    logger.error('Erreur envoi SMS service:', {
      originalNumber: to,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      messageLength: message ? message.length : 0
    });
    
    // Relancer l'erreur pour que le contrôleur puisse la gérer
    throw error;
  }
};

/**
 * Vérifier le statut d'un SMS envoyé (VERSION AMÉLIORÉE)
 */
const getSMSStatus = async (messageId, provider) => {
  try {
    switch (provider) {
      case 'TWILIO': {
        const { accountSid, authToken } = SMS_CONFIG.TWILIO;
        if (!accountSid || !authToken) {
          throw new Error('Configuration Twilio manquante');
        }
        
        const response = await axios.get(
          `${SMS_CONFIG.TWILIO.apiUrl}/${accountSid}/Messages/${messageId}.json`,
          {
            auth: {
              username: accountSid,
              password: authToken
            },
            timeout: 15000
          }
        );
        
        return {
          status: response.data.status,
          dateUpdated: response.data.date_updated,
          dateSent: response.data.date_sent,
          errorCode: response.data.error_code,
          errorMessage: response.data.error_message,
          price: response.data.price,
          direction: response.data.direction
        };
      }
        
      case 'ORANGE': {
        // Orange API pour vérifier le statut
        // Implementation dépend de l'API Orange spécifique
        logger.info('Vérification statut Orange non implémentée', { messageId });
        return { status: 'unknown', provider: 'ORANGE' };
      }
        
      case 'DEV': {
        // Simuler des statuts différents
        const statuses = ['queued', 'sent', 'delivered', 'failed'];
        const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];
        return {
          status: randomStatus,
          dateUpdated: new Date().toISOString(),
          provider: 'DEV',
          simulated: true
        };
      }
        
      default: {
        logger.warn('Vérification statut non supportée', { provider, messageId });
        return { status: 'unknown', provider };
      }
    }
    
  } catch (error) {
    logger.error('Erreur vérification statut SMS:', {
      messageId,
      provider,
      error: error.message
    });
    throw error;
  }
};

/**
 * Fonction utilitaire pour tester la configuration SMS (AMÉLIORÉE)
 */
const testSMSService = async (numeroTest = null) => {
  try {
    const testNumber = numeroTest || process.env.TEST_PHONE_NUMBER || '+2250779947663';
    const testMessage = `Test SMS service WAYZ-ECO - ${new Date().toLocaleString()}`;
    
    logger.info('Début test du service SMS', { 
      testNumber,
      provider: getProvider(),
      messageLength: testMessage.length
    });
    
    const result = await sendSMS({
      to: testNumber,
      message: testMessage
    });
    
    logger.info('Test SMS réussi', result);
    return {
      success: true,
      result,
      testNumber,
      message: testMessage
    };
    
  } catch (error) {
    logger.error('Test SMS échoué:', {
      error: error.message,
      testNumber: numeroTest || process.env.TEST_PHONE_NUMBER,
      provider: getProvider()
    });
    
    return {
      success: false,
      error: error.message,
      testNumber: numeroTest || process.env.TEST_PHONE_NUMBER
    };
  }
};

/**
 * Fonction utilitaire pour valider la configuration
 */
const validateSMSConfig = () => {
  const errors = [];
  
  try {
    const provider = getProvider();
    
    switch (provider) {
      case 'TWILIO':
        if (!SMS_CONFIG.TWILIO.accountSid) errors.push('TWILIO_ACCOUNT_SID manquant');
        if (!SMS_CONFIG.TWILIO.authToken) errors.push('TWILIO_AUTH_TOKEN manquant');
        if (!SMS_CONFIG.TWILIO.fromNumber) errors.push('TWILIO_PHONE_NUMBER manquant');
        break;
        
      case 'ORANGE':
        if (!SMS_CONFIG.ORANGE.clientId) errors.push('ORANGE_CLIENT_ID manquant');
        if (!SMS_CONFIG.ORANGE.clientSecret) errors.push('ORANGE_CLIENT_SECRET manquant');
        break;
        
      case 'GENERIC':
        if (!SMS_CONFIG.GENERIC.apiUrl) errors.push('SMS_API_URL manquant');
        break;
    }
    
    return {
      isValid: errors.length === 0,
      provider,
      errors,
      config: {
        twilioConfigured: !!(SMS_CONFIG.TWILIO.accountSid && SMS_CONFIG.TWILIO.authToken),
        orangeConfigured: !!(SMS_CONFIG.ORANGE.clientId && SMS_CONFIG.ORANGE.clientSecret),
        genericConfigured: !!SMS_CONFIG.GENERIC.apiUrl
      }
    };
    
  } catch (error) {
    return {
      isValid: false,
      provider: null,
      errors: [error.message],
      config: {}
    };
  }
};

module.exports = {
  sendSMS,
  getSMSStatus,
  testSMSService,
  validateSMSConfig,
  normaliserTelephoneCI,
  validatePhoneNumber,
  // Fonctions utilitaires pour debug
  getProvider,
  SMS_CONFIG
};