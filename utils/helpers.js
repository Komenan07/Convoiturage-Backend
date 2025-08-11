// =====================================================
// UTILITAIRES GÉNÉRAUX
// =====================================================

const moment = require('moment');

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
 * Valide un format d'email
 * @param {string} email - Email à valider
 * @returns {boolean} True si valide
 */
const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Valide un numéro de téléphone ivoirien
 * @param {string} phone - Numéro à valider
 * @returns {boolean} True si valide
 */
const isValidIvorianPhone = (phone) => {
  // Format: +225XXXXXXXX ou 0XXXXXXXX
  const phoneRegex = /^(\+225|0)[0-9]{8,10}$/;
  return phoneRegex.test(phone);
};

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
 * Calcule la distance entre deux points (approximatif)
 * @param {number} lat1 - Latitude point 1
 * @param {number} lon1 - Longitude point 1
 * @param {number} lat2 - Latitude point 2
 * @param {number} lon2 - Longitude point 2
 * @returns {number} Distance en kilomètres
 */
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Rayon de la Terre en km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return Math.round(R * c * 100) / 100;
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

/**
 * Valide et nettoie les données d'entrée
 * @param {object} data - Données à nettoyer
 * @param {array} allowedFields - Champs autorisés
 * @returns {object} Données nettoyées
 */
const sanitizeInput = (data, allowedFields = []) => {
  const cleaned = {};
  
  for (const field of allowedFields) {
    if (data.hasOwnProperty(field)) {
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

module.exports = {
  formatDate,
  generateId,
  generateCode,
  isValidEmail,
  isValidIvorianPhone,
  formatPhone,
  calculateDistance,
  generateSlug,
  capitalize,
  maskSensitiveData,
  sanitizeInput
};