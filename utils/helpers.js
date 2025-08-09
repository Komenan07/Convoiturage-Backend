// utils/helpers.js

/**
 * Classe d'erreur personnalisée pour l'application
 */
class AppError extends Error {
  constructor(message, statusCode = 500, isOperational = true) {
    super(message);
    
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = isOperational;
    
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Wrapper pour les fonctions async qui gère automatiquement les erreurs
 * @param {Function} fn - Fonction asynchrone à wrapper
 * @returns {Function} Fonction wrappée avec gestion d'erreur
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Envoyer une réponse standardisée
 * @param {Object} res - Objet Response d'Express
 * @param {number} statusCode - Code de statut HTTP
 * @param {Object} data - Données à envoyer
 */
const sendResponse = (res, statusCode, data) => {
  res.status(statusCode).json({
    timestamp: new Date().toISOString(),
    ...data
  });
};

/**
 * Envoyer une réponse d'erreur standardisée
 * @param {Object} res - Objet Response d'Express
 * @param {number} statusCode - Code de statut HTTP
 * @param {string} message - Message d'erreur
 * @param {Object} details - Détails supplémentaires
 */
const sendErrorResponse = (res, statusCode, message, details = null) => {
  const response = {
    success: false,
    error: {
      message,
      statusCode,
      timestamp: new Date().toISOString()
    }
  };

  if (details && process.env.NODE_ENV === 'development') {
    response.error.details = details;
  }

  res.status(statusCode).json(response);
};

/**
 * Calculer la distance entre deux points géographiques (Haversine)
 * @param {number} lat1 - Latitude du premier point
 * @param {number} lon1 - Longitude du premier point
 * @param {number} lat2 - Latitude du deuxième point
 * @param {number} lon2 - Longitude du deuxième point
 * @returns {number} Distance en kilomètres
 */
const calculerDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Rayon de la Terre en kilomètres
  
  const dLat = degresEnRadians(lat2 - lat1);
  const dLon = degresEnRadians(lon2 - lon1);
  
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(degresEnRadians(lat1)) * Math.cos(degresEnRadians(lat2)) * 
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  
  return R * c;
};

/**
 * Convertir des degrés en radians
 * @param {number} degres - Angle en degrés
 * @returns {number} Angle en radians
 */
const degresEnRadians = (degres) => {
  return degres * (Math.PI / 180);
};

/**
 * Formater une date pour l'affichage
 * @param {Date} date - Date à formater
 * @param {string} locale - Locale pour le formatage (défaut: 'fr-FR')
 * @returns {string} Date formatée
 */
const formaterDate = (date, locale = 'fr-FR') => {
  if (!date) return null;
  
  return new Date(date).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

/**
 * Formater une durée en heures et minutes
 * @param {number} minutes - Durée en minutes
 * @returns {string} Durée formatée
 */
const formaterDuree = (minutes) => {
  if (!minutes || minutes <= 0) return '0 min';
  
  const heures = Math.floor(minutes / 60);
  const minutesRestantes = minutes % 60;
  
  if (heures === 0) {
    return `${minutesRestantes} min`;
  } else if (minutesRestantes === 0) {
    return `${heures}h`;
  } else {
    return `${heures}h ${minutesRestantes}min`;
  }
};

/**
 * Générer un slug à partir d'une chaîne
 * @param {string} texte - Texte à convertir en slug
 * @returns {string} Slug généré
 */
const genererSlug = (texte) => {
  if (!texte) return '';
  
  return texte
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Supprimer les accents
    .replace(/[^\w\s-]/g, '') // Supprimer les caractères spéciaux
    .replace(/\s+/g, '-') // Remplacer les espaces par des tirets
    .replace(/-+/g, '-') // Supprimer les tirets multiples
    .trim('-'); // Supprimer les tirets en début/fin
};

/**
 * Valider une adresse email
 * @param {string} email - Adresse email à valider
 * @returns {boolean} True si valide
 */
const validerEmail = (email) => {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
};

/**
 * Valider un numéro de téléphone français
 * @param {string} telephone - Numéro à valider
 * @returns {boolean} True si valide
 */
const validerTelephone = (telephone) => {
  const regex = /^(?:(?:\+33|0)[1-9](?:[0-9]{8}))$/;
  return regex.test(telephone.replace(/[\s.-]/g, ''));
};

/**
 * Nettoyer et valider des coordonnées GPS
 * @param {number} longitude - Longitude
 * @param {number} latitude - Latitude
 * @returns {Object} Coordonnées validées ou erreur
 */
const validerCoordonnees = (longitude, latitude) => {
  const lon = parseFloat(longitude);
  const lat = parseFloat(latitude);
  
  if (isNaN(lon) || isNaN(lat)) {
    throw new AppError('Coordonnées invalides: format numérique requis', 400);
  }
  
  if (lon < -180 || lon > 180) {
    throw new AppError('Longitude invalide: doit être entre -180 et 180', 400);
  }
  
  if (lat < -90 || lat > 90) {
    throw new AppError('Latitude invalide: doit être entre -90 et 90', 400);
  }
  
  return { longitude: lon, latitude: lat };
};

/**
 * Paginer les résultats
 * @param {number} page - Numéro de page (commence à 1)
 * @param {number} limite - Nombre d'éléments par page
 * @param {number} total - Nombre total d'éléments
 * @returns {Object} Informations de pagination
 */
const calculerPagination = (page = 1, limite = 20, total = 0) => {
  const pageNum = Math.max(1, parseInt(page));
  const limiteNum = Math.max(1, Math.min(100, parseInt(limite)));
  const totalPages = Math.ceil(total / limiteNum);
  const skip = (pageNum - 1) * limiteNum;
  
  return {
    page: pageNum,
    limite: limiteNum,
    total,
    totalPages,
    skip,
    hasNext: pageNum < totalPages,
    hasPrev: pageNum > 1,
    nextPage: pageNum < totalPages ? pageNum + 1 : null,
    prevPage: pageNum > 1 ? pageNum - 1 : null
  };
};

/**
 * Sanitizer une chaîne pour éviter les injections
 * @param {string} input - Chaîne à nettoyer
 * @returns {string} Chaîne nettoyée
 */
const sanitizeString = (input) => {
  if (typeof input !== 'string') return '';
  
  return input
    .trim()
    .replace(/[<>\"'&]/g, (match) => {
      const chars = {
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#x27;',
        '&': '&amp;'
      };
      return chars[match];
    });
};

/**
 * Générer un identifiant unique
 * @param {string} prefixe - Préfixe optionnel
 * @returns {string} Identifiant unique
 */
const genererIdUnique = (prefixe = '') => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2);
  return prefixe ? `${prefixe}_${timestamp}_${random}` : `${timestamp}_${random}`;
};

/**
 * Convertir les millisecondes en format lisible
 * @param {number} ms - Millisecondes
 * @returns {string} Durée formatée
 */
const formaterMillisecondes = (ms) => {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}min`;
  return `${(ms / 3600000).toFixed(1)}h`;
};

/**
 * Deep clone d'un objet
 * @param {Object} obj - Objet à cloner
 * @returns {Object} Clone de l'objet
 */
const deepClone = (obj) => {
  if (obj === null || typeof obj !== 'object') return obj;
  if (obj instanceof Date) return new Date(obj.getTime());
  if (obj instanceof Array) return obj.map(item => deepClone(item));
  if (typeof obj === 'object') {
    const cloned = {};
    Object.keys(obj).forEach(key => {
      cloned[key] = deepClone(obj[key]);
    });
    return cloned;
  }
};

/**
 * Retarder l'exécution (pour les tests ou rate limiting)
 * @param {number} ms - Délai en millisecondes
 * @returns {Promise} Promise résolue après le délai
 */
const delay = (ms) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Retry une fonction avec délai exponentiel
 * @param {Function} fn - Fonction à retry
 * @param {number} maxRetries - Nombre maximum de tentatives
 * @param {number} delayMs - Délai initial en ms
 * @returns {Promise} Résultat de la fonction ou erreur finale
 */
const retryWithBackoff = async (fn, maxRetries = 3, delayMs = 1000) => {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (attempt === maxRetries) {
        throw lastError;
      }
      
      // Délai exponentiel: 1s, 2s, 4s, etc.
      const delayTime = delayMs * Math.pow(2, attempt - 1);
      await delay(delayTime);
    }
  }
};

/**
 * Limiter la longueur d'une chaîne avec ellipsis
 * @param {string} str - Chaîne à limiter
 * @param {number} maxLength - Longueur maximale
 * @param {string} suffix - Suffixe (défaut: '...')
 * @returns {string} Chaîne tronquée
 */
const tronquer = (str, maxLength, suffix = '...') => {
  if (!str || str.length <= maxLength) return str;
  return str.substring(0, maxLength - suffix.length) + suffix;
};

/**
 * Capitaliser la première lettre d'une chaîne
 * @param {string} str - Chaîne à capitaliser
 * @returns {string} Chaîne capitalisée
 */
const capitaliser = (str) => {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
};

/**
 * Formater un nombre avec des séparateurs de milliers
 * @param {number} num - Nombre à formater
 * @param {string} locale - Locale (défaut: 'fr-FR')
 * @returns {string} Nombre formaté
 */
const formaterNombre = (num, locale = 'fr-FR') => {
  return new Intl.NumberFormat(locale).format(num);
};

/**
 * Vérifier si un objet est vide
 * @param {Object} obj - Objet à vérifier
 * @returns {boolean} True si vide
 */
const estObjetVide = (obj) => {
  return obj && Object.keys(obj).length === 0 && obj.constructor === Object;
};

/**
 * Extraire les propriétés spécifiées d'un objet
 * @param {Object} obj - Objet source
 * @param {Array} keys - Clés à extraire
 * @returns {Object} Nouvel objet avec les propriétés sélectionnées
 */
const extraireProps = (obj, keys) => {
  return keys.reduce((result, key) => {
    if (obj.hasOwnProperty(key)) {
      result[key] = obj[key];
    }
    return result;
  }, {});
};

/**
 * Exclure les propriétés spécifiées d'un objet
 * @param {Object} obj - Objet source
 * @param {Array} keys - Clés à exclure
 * @returns {Object} Nouvel objet sans les propriétés exclues
 */
const exclureProps = (obj, keys) => {
  const result = { ...obj };
  keys.forEach(key => delete result[key]);
  return result;
};

module.exports = {
  AppError,
  asyncHandler,
  sendResponse,
  sendErrorResponse,
  calculerDistance,
  degresEnRadians,
  formaterDate,
  formaterDuree,
  genererSlug,
  validerEmail,
  validerTelephone,
  validerCoordonnees,
  calculerPagination,
  sanitizeString,
  genererIdUnique,
  formaterMillisecondes,
  deepClone,
  delay,
  retryWithBackoff,
  tronquer,
  capitaliser,
  formaterNombre,
  estObjetVide,
  extraireProps,
  exclureProps
};