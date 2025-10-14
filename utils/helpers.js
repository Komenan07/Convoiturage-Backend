/**
 * Utilitaires pour l'application de covoiturage
 * Fonctions générales, authentification, géolocalisation, validation et formatage
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const moment = require('moment');
const { REGEX_PATTERNS, LIMITES } = require('./constants');

// =====================================================
// UTILITAIRES GÉNÉRAUX
// =====================================================

/**
 * Formate une date selon le format spécifié
 * @param {Date|string} date - La date à formater
 * @param {string} format - Le format souhaité (défaut: 'DD/MM/YYYY HH:mm')
 * @returns {string} Date formatée
 */
const formatDate = (date, format = 'DD/MM/YYYY HH:mm') => {
  try {
    return moment(date).format(format);
  } catch (error) {
    console.error('Erreur formatage date:', error.message);
    return new Date(date).toISOString();
  }
};

/**
 * Génère un identifiant unique
 * @param {number} length - Longueur de l'ID (défaut: 9)
 * @returns {string} Identifiant unique
 */
const generateId = (length = 9) => {
  return Math.random().toString(36).substr(2, length);
};

/**
 * Génère un code numérique aléatoire
 * @param {number} length - Longueur du code (défaut: 6)
 * @returns {string} Code numérique
 */
const generateCode = (length = 6) => {
  const min = Math.pow(10, length - 1);
  const max = Math.pow(10, length) - 1;
  return Math.floor(Math.random() * (max - min + 1) + min).toString();
};

/**
 * Génère un code de référence unique avec préfixe
 * @param {string} prefix - Préfixe (ex: 'TRJ', 'RES')
 * @returns {string} Code de référence
 */
const generateReferenceCode = (prefix = 'REF') => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substr(2, 5);
  return `${prefix}_${timestamp}_${random}`.toUpperCase();
};

/**
 * Génère un slug à partir d'un texte
 * @param {string} text - Texte à convertir
 * @returns {string} Slug généré
 */
const generateSlug = (text) => {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[\s\W-]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

/**
 * Capitalise la première lettre de chaque mot
 * @param {string} str - Chaîne à traiter
 * @returns {string} Chaîne capitalisée
 */
const capitalize = (str) => {
  if (!str) return '';
  return str
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

/**
 * Nettoie et valide un texte
 * @param {string} text - Texte à valider
 * @param {number} maxLength - Longueur maximale
 * @returns {string|null} Texte nettoyé ou null si invalide
 */
const sanitizeText = (text, maxLength = 500) => {
  if (typeof text !== 'string') return null;
  
  const cleaned = text.trim();
  if (cleaned.length === 0 || cleaned.length > maxLength) return null;
  
  // Supprimer les caractères potentiellement dangereux
  return cleaned.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
};

/**
 * Valide et nettoie les données d'entrée
 * @param {object} data - Données à nettoyer
 * @param {array} allowedFields - Champs autorisés
 * @returns {object} Données nettoyées
 */
const sanitizeInput = (data, allowedFields = []) => {
  const cleaned = {};
  
  for (const field of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(data, field)) {
      const value = data[field];
      
      // Nettoyer les chaînes
      if (typeof value === 'string') {
        cleaned[field] = value.trim();
      } else {
        cleaned[field] = value;
      }
    }
  }
  
  return cleaned;
};

// =====================================================
// AUTHENTIFICATION ET SÉCURITÉ
// =====================================================

/**
 * Hasher un mot de passe
 * @param {string} password - Mot de passe en clair
 * @returns {Promise<string>} - Mot de passe hashé
 */
const hashPassword = async (password) => {
  const salt = await bcrypt.genSalt(12);
  return await bcrypt.hash(password, salt);
};

/**
 * Vérifier un mot de passe
 * @param {string} password - Mot de passe en clair
 * @param {string} hashedPassword - Mot de passe hashé
 * @returns {Promise<boolean>} - True si le mot de passe correspond
 */
const verifyPassword = async (password, hashedPassword) => {
  return await bcrypt.compare(password, hashedPassword);
};

/**
 * Générer un token JWT
 * @param {Object} payload - Données à inclure dans le token
 * @param {string} expiresIn - Durée de validité (ex: '7d', '1h')
 * @returns {string} - Token JWT
 */
const generateToken = (payload, expiresIn = process.env.JWT_EXPIRE || '7d') => {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });
};

/**
 * Vérifier et décoder un token JWT
 * @param {string} token - Token à vérifier
 * @returns {Object|null} - Payload décodé ou null si invalide
 */
const verifyToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    return null;
  }
};

/**
 * Masque une partie d'un email ou téléphone
 * @param {string} value - Valeur à masquer
 * @param {string} type - Type: 'email' ou 'phone'
 * @returns {string} Valeur masquée
 */
const maskSensitiveData = (value, type = 'email') => {
  if (!value) return '';
  
  if (type === 'email') {
    const [local, domain] = value.split('@');
    if (local.length <= 2) return value;
    return local.substring(0, 2) + '*'.repeat(local.length - 2) + '@' + domain;
  }
  
  if (type === 'phone') {
    if (value.length <= 4) return value;
    return value.substring(0, 4) + '*'.repeat(value.length - 4);
  }
  
  return value;
};

// =====================================================
// VALIDATION
// =====================================================

/**
 * Valide un format d'email
 * @param {string} email - Email à valider
 * @returns {boolean} True si valide
 */
const isValidEmail = (email) => {
  return REGEX_PATTERNS.EMAIL.test(email);
};

/**
 * Valide un numéro de téléphone ivoirien
 * @param {string} phone - Numéro à valider
 * @returns {boolean} True si valide
 */
const isValidIvorianPhone = (phone) => {
  return REGEX_PATTERNS.TELEPHONE_CI.test(phone.replace(/\s/g, ''));
};

/**
 * Valider des coordonnées GPS
 * @param {Array} coordinates - [longitude, latitude]
 * @returns {boolean} - True si valides
 */
const isValidCoordinates = (coordinates) => {
  if (!Array.isArray(coordinates) || coordinates.length !== 2) {
    return false;
  }
  
  const [lng, lat] = coordinates;
  return (
    typeof lng === 'number' && 
    typeof lat === 'number' &&
    lng >= -180 && lng <= 180 &&
    lat >= -90 && lat <= 90
  );
};

/**
 * Valider un prix de trajet
 * @param {number} price - Prix en FCFA
 * @returns {boolean} - True si valide
 */
const isValidTripPrice = (price) => {
  return (
    typeof price === 'number' &&
    price >= LIMITES.MIN_PRIX_TRAJET &&
    price <= LIMITES.MAX_PRIX_TRAJET
  );
};

/**
 * Vérifier si une date est dans le futur
 * @param {Date} date - Date à vérifier
 * @param {number} minMinutes - Minutes minimum dans le futur
 * @returns {boolean} - True si dans le futur
 */
const isFutureDate = (date, minMinutes = 0) => {
  const now = new Date();
  const checkDate = new Date(date);
  const diffMinutes = (checkDate - now) / 60000;
  
  return diffMinutes >= minMinutes;
};

// =====================================================
// FORMATAGE ET TRANSFORMATION
// =====================================================

/**
 * Nettoie et formate un numéro de téléphone
 * @param {string} phone - Numéro à formater
 * @returns {string} Numéro formaté
 */
const formatPhone = (phone) => {
  if (!phone) return '';
  
  // Supprimer les espaces et tirets
  const cleaned = phone.replace(/[\s-]/g, '');
  
  // Ajouter +225 si nécessaire
  if (cleaned.startsWith('0')) {
    return '+225' + cleaned.substring(1);
  }
  
  if (!cleaned.startsWith('+225')) {
    return '+225' + cleaned;
  }
  
  return cleaned;
};

/**
 * Formater un prix en FCFA
 * @param {number} amount - Montant
 * @returns {string} - Prix formaté
 */
const formatPrice = (amount) => {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'XOF',
    minimumFractionDigits: 0
  }).format(amount);
};

/**
 * Calculer la durée entre deux dates
 * @param {Date} start - Date de début
 * @param {Date} end - Date de fin
 * @returns {Object} - { hours, minutes, total_minutes }
 */
const calculateDuration = (start, end) => {
  const diffMs = new Date(end) - new Date(start);
  const totalMinutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  
  return { hours, minutes, total_minutes: totalMinutes };
};

/**
 * Calculer l'âge à partir de la date de naissance
 * @param {Date} birthDate - Date de naissance
 * @returns {number} - Âge en années
 */
const calculateAge = (birthDate) => {
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  
  return age;
};

// =====================================================
// GÉOLOCALISATION ET CALCULS GPS
// =====================================================

/**
 * Convertir des degrés en radians
 * @param {number} degrees - Valeur en degrés
 * @returns {number} - Valeur en radians
 */
const toRadians = (degrees) => {
  return degrees * (Math.PI / 180);
};

/**
 * Calcule la distance entre deux points GPS (formule de Haversine)
 * @param {Array|number} point1 - [longitude, latitude] ou latitude si 4 paramètres
 * @param {number} lon1 - Longitude point 1 (si 4 paramètres)
 * @param {number} lat2 - Latitude point 2 (si 4 paramètres)
 * @param {number} lon2 - Longitude point 2 (si 4 paramètres)
 * @returns {number} Distance en kilomètres
 */
const calculateDistance = (point1, lon1, lat2, lon2) => {
  let lat1, lng1, lat_2, lng2;
  
  // Support des deux formats d'appel
  if (Array.isArray(point1)) {
    // Format: calculateDistance([lng1, lat1], [lng2, lat2])
    [lng1, lat1] = point1;
    [lng2, lat_2] = lon1; // lon1 est en fait point2
    lat2 = lat_2;
    lon2 = lng2;
  } else {
    // Format: calculateDistance(lat1, lon1, lat2, lon2)
    lat1 = point1;
    lng1 = lon1;
    lat_2 = lat2;
    lng2 = lon2;
  }

  const R = 6371; // Rayon de la Terre en km
  
  const dLat = toRadians(lat_2 - lat1);
  const dLng = toRadians(lng2 - lng1);

  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat_2)) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
            
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  
  return Math.round(R * c * 100) / 100; // Arrondir à 2 décimales
};

/**
 * Calculer l'ETA (temps d'arrivée estimé)
 * @param {Array} currentPosition - Position actuelle [lng, lat]
 * @param {Array} destination - Destination [lng, lat]
 * @param {number} currentSpeed - Vitesse actuelle en km/h
 * @param {number} averageSpeed - Vitesse moyenne en km/h (défaut: 40)
 * @returns {Object} - { distance, duration, eta }
 */
const calculateETA = (currentPosition, destination, currentSpeed = 0, averageSpeed = 40) => {
  const distance = calculateDistance(currentPosition, destination);
  
  // Utiliser la vitesse actuelle si elle est raisonnable, sinon la vitesse moyenne
  const speed = (currentSpeed > 5 && currentSpeed < 120) ? currentSpeed : averageSpeed;
  
  const durationMinutes = (distance / speed) * 60;
  const eta = new Date(Date.now() + durationMinutes * 60 * 1000);
  
  return {
    distance: Math.round(distance * 100) / 100, // Arrondir à 2 décimales
    duration: Math.round(durationMinutes),
    eta
  };
};

/**
 * Vérifier si un point est dans un rayon donné
 * @param {Array} center - Point central [lng, lat]
 * @param {Array} point - Point à tester [lng, lat]
 * @param {number} radiusKm - Rayon en kilomètres
 * @returns {boolean} - True si le point est dans le rayon
 */
const isWithinRadius = (center, point, radiusKm) => {
  const distance = calculateDistance(center, point);
  return distance <= radiusKm;
};

// =====================================================
// UTILITAIRES MÉTIER COVOITURAGE
// =====================================================

/**
 * Calculer le score de confiance d'un utilisateur
 * @param {Object} userData - Données utilisateur
 * @returns {number} - Score de 0 à 100
 */
const calculateTrustScore = (userData) => {
  let score = 50; // Score de base
  
  // Vérification d'identité (+20)
  if (userData.estVerifie) score += 20;
  
  // Note générale (+0 à +20)
  if (userData.noteGenerale) {
    score += (userData.noteGenerale / 5) * 20;
  }
  
  // Nombre de trajets effectués (+0 à +10)
  const trajetsBonus = Math.min(userData.nombreTrajetsEffectues || 0, 50) / 5;
  score += trajetsBonus;
  
  // Pénalité pour les annulations (-0 à -20)
  const totalTrajets = Math.max(userData.nombreTrajetsEffectues || 1, 1);
  const tauxAnnulation = (userData.nombreTrajetsAnnules || 0) / totalTrajets;
  score -= tauxAnnulation * 20;
  
  // Bonus pour les badges (+2 par badge)
  if (userData.badges && userData.badges.length > 0) {
    score += userData.badges.length * 2;
  }
  
  return Math.max(0, Math.min(100, Math.round(score)));
};

// =====================================================
// NOTIFICATIONS
// =====================================================

/**
 * Créer une notification push
 * @param {string} title - Titre de la notification
 * @param {string} body - Corps de la notification
 * @param {Object} data - Données supplémentaires
 * @returns {Object} - Objet notification
 */
const createPushNotification = (title, body, data = {}) => {
  return {
    title,
    body,
    icon: '/icon-192x192.png',
    badge: '/badge-72x72.png',
    data: {
      timestamp: new Date().toISOString(),
      ...data
    },
    actions: data.actions || []
  };
};

/**
 * Déterminer le type de notification selon le contexte
 * @param {string} eventType - Type d'événement
 * @param {Object} context - Contexte
 * @returns {Object} - Configuration de notification
 */
const getNotificationConfig = (eventType, context = {}) => {
  const configs = {
    'new_reservation': {
      title: 'Nouvelle réservation',
      body: `${context.passengerName} souhaite réserver ${context.seats} place(s)`,
      priority: 'high',
      sound: 'default'
    },
    'reservation_confirmed': {
      title: 'Réservation confirmée',
      body: `Votre réservation a été acceptée par ${context.driverName}`,
      priority: 'high',
      sound: 'default'
    },
    'trip_started': {
      title: 'Trajet commencé',
      body: 'Votre conducteur a commencé le trajet',
      priority: 'normal',
      sound: 'default'
    },
    'driver_nearby': {
      title: 'Conducteur proche',
      body: `Votre conducteur arrive dans ${context.distance}m`,
      priority: 'high',
      sound: 'alert'
    },
    'emergency_alert': {
      title: 'Alerte d\'urgence',
      body: `Alerte ${context.alertType} déclenchée`,
      priority: 'max',
      sound: 'emergency'
    }
  };
  
  return configs[eventType] || {
    title: 'Notification',
    body: 'Nouvelle notification',
    priority: 'normal',
    sound: 'default'
  };
};

// =====================================================
// GESTION DES ERREURS
// =====================================================

/**
 * Créer une erreur standardisée
 * @param {string} message - Message d'erreur
 * @param {number} statusCode - Code de statut HTTP
 * @param {string} type - Type d'erreur
 * @returns {Error} - Erreur formatée
 */
const createError = (message, statusCode = 500, type = 'GENERIC_ERROR') => {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.type = type;
  return error;
};

/**
 * Logger une erreur avec contexte
 * @param {Error} error - Erreur
 * @param {Object} context - Contexte additionnel
 */
const logError = (error, context = {}) => {
  console.error('\n=== ERREUR ===');
  console.error('Timestamp:', new Date().toISOString());
  console.error('Message:', error.message);
  console.error('Stack:', error.stack);
  console.error('Contexte:', JSON.stringify(context, null, 2));
  console.error('=============\n');
};

// =====================================================
// WAZE INTÉGRATION
// =====================================================

/**
 * Générer une URL Waze pour la navigation
 * @param {Array} destination - [longitude, latitude]
 * @param {string} address - Adresse de destination (optionnel)
 * @returns {string} - URL Waze
 */
const generateWazeURL = (destination, address = '') => {
  const [lng, lat] = destination;
  const baseUrl = 'https://waze.com/ul';
  
  if (address) {
    return `${baseUrl}?q=${encodeURIComponent(address)}&navigate=yes`;
  }
  
  return `${baseUrl}?ll=${lat},${lng}&navigate=yes`;
};

/**
 * Générer un lien deep link Waze pour mobile
 * @param {Array} destination - [longitude, latitude]
 * @returns {string} - Deep link Waze
 */
const generateWazeDeepLink = (destination) => {
  const [lng, lat] = destination;
  return `waze://?ll=${lat},${lng}&navigate=yes`;
};

// =====================================================
// EXPORTS
// =====================================================

module.exports = {
  // Utilitaires généraux
  formatDate,
  generateId,
  generateCode,
  generateReferenceCode,
  generateSlug,
  capitalize,
  sanitizeText,
  sanitizeInput,
  
  // Authentification
  hashPassword,
  verifyPassword,
  generateToken,
  verifyToken,
  maskSensitiveData,
  
  // Validation
  isValidEmail,
  isValidIvorianPhone,
  isValidCoordinates,
  isValidTripPrice,
  isFutureDate,
  
  // Formatage
  formatPhone,
  formatPrice,
  calculateDuration,
  calculateAge,
  
  // Géolocalisation
  calculateDistance,
  calculateETA,
  isWithinRadius,
  toRadians,
  
  // Métier covoiturage
  calculateTrustScore,
  
  // Notifications
  createPushNotification,
  getNotificationConfig,
  
  // Erreurs
  createError,
  logError,
  
  // Waze
  generateWazeURL,
  generateWazeDeepLink
};