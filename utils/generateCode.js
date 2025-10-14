// utils/generateCode.js

/**
 * Génère un code numérique aléatoire de 6 chiffres
 * Utilisé pour les vérifications SMS et les codes OTP de réinitialisation
 * 
 * @returns {string} Code à 6 chiffres (string pour préserver les zéros de tête)
 */
const genererCode6Chiffres = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Génère un code numérique de longueur variable
 * 
 * @param {number} longueur - Longueur du code souhaité (par défaut 6)
 * @returns {string} Code numérique de la longueur spécifiée
 */
const genererCodePersonnalise = (longueur = 6) => {
  if (longueur < 1 || longueur > 10) {
    throw new Error('La longueur du code doit être entre 1 et 10');
  }
  
  const min = Math.pow(10, longueur - 1);
  const max = Math.pow(10, longueur) - 1;
  
  return Math.floor(min + Math.random() * (max - min + 1)).toString();
};

/**
 * Génère un code OTP sécurisé avec vérification d'unicité
 * Évite les codes facilement devinables comme 000000, 123456, etc.
 * 
 * @param {number} longueur - Longueur du code (par défaut 6)
 * @returns {string} Code OTP sécurisé
 */
const genererCodeSecurise = (longueur = 6) => {
  const codesInterdits = [
    '000000', '111111', '222222', '333333', '444444', '555555',
    '666666', '777777', '888888', '999999', '123456', '654321',
    '000001', '111222', '123123', '987654'
  ];
  
  let code;
  let tentatives = 0;
  const maxTentatives = 100;
  
  do {
    code = genererCodePersonnalise(longueur);
    tentatives++;
    
    if (tentatives >= maxTentatives) {
      // Si on ne trouve pas de code valide après 100 tentatives,
      // on retourne quand même un code (très improbable)
      break;
    }
  } while (codesInterdits.includes(code) || estCodeTropSimple(code));
  
  return code;
};

/**
 * Vérifie si un code est trop simple (patterns répétitifs)
 * 
 * @param {string} code - Code à vérifier
 * @returns {boolean} True si le code est trop simple
 */
const estCodeTropSimple = (code) => {
  // Vérifier si tous les chiffres sont identiques
  if (new Set(code).size === 1) {
    return true;
  }
  
  // Vérifier si c'est une séquence croissante
  let estCroissant = true;
  for (let i = 1; i < code.length; i++) {
    if (parseInt(code[i]) !== parseInt(code[i-1]) + 1) {
      estCroissant = false;
      break;
    }
  }
  
  // Vérifier si c'est une séquence décroissante
  let estDecroissant = true;
  for (let i = 1; i < code.length; i++) {
    if (parseInt(code[i]) !== parseInt(code[i-1]) - 1) {
      estDecroissant = false;
      break;
    }
  }
  
  return estCroissant || estDecroissant;
};

/**
 * Valide un code numérique
 * 
 * @param {string} code - Code à valider
 * @param {number} longueurAttendue - Longueur attendue du code (par défaut 6)
 * @returns {object} Objet avec propriétés 'valide' et 'erreur'
 */
const validerCode = (code, longueurAttendue = 6) => {
  if (!code) {
    return {
      valide: false,
      erreur: 'Code manquant'
    };
  }
  
  if (typeof code !== 'string') {
    code = code.toString();
  }
  
  // Vérifier si le code contient uniquement des chiffres
  if (!/^\d+$/.test(code)) {
    return {
      valide: false,
      erreur: 'Le code doit contenir uniquement des chiffres'
    };
  }
  
  // Vérifier la longueur
  if (code.length !== longueurAttendue) {
    return {
      valide: false,
      erreur: `Le code doit contenir exactement ${longueurAttendue} chiffres`
    };
  }
  
  return {
    valide: true,
    erreur: null
  };
};

/**
 * Génère un code avec une durée d'expiration
 * 
 * @param {number} dureeMinutes - Durée en minutes avant expiration (par défaut 10)
 * @param {number} longueurCode - Longueur du code (par défaut 6)
 * @returns {object} Objet avec le code et la date d'expiration
 */
const genererCodeAvecExpiration = (dureeMinutes = 10, longueurCode = 6) => {
  const code = genererCodeSecurise(longueurCode);
  const expiration = new Date(Date.now() + dureeMinutes * 60 * 1000);
  
  return {
    code,
    expiration,
    dureeMinutes
  };
};

/**
 * Vérifie si un code est expiré
 * 
 * @param {Date} dateExpiration - Date d'expiration du code
 * @returns {boolean} True si le code est expiré
 */
const estCodeExpire = (dateExpiration) => {
  return new Date() > new Date(dateExpiration);
};

/**
 * Calcule le temps restant avant expiration
 * 
 * @param {Date} dateExpiration - Date d'expiration du code
 * @returns {object} Objet avec les minutes et secondes restantes
 */
const tempsRestantAvantExpiration = (dateExpiration) => {
  const maintenant = new Date();
  const expiration = new Date(dateExpiration);
  const diffMs = expiration - maintenant;
  
  if (diffMs <= 0) {
    return {
      expire: true,
      minutes: 0,
      secondes: 0,
      total: 0
    };
  }
  
  const totalSecondes = Math.floor(diffMs / 1000);
  const minutes = Math.floor(totalSecondes / 60);
  const secondes = totalSecondes % 60;
  
  return {
    expire: false,
    minutes,
    secondes,
    total: totalSecondes
  };
};

// Export des fonctions
module.exports = {
  genererCode6Chiffres,
  genererCodePersonnalise,
  genererCodeSecurise,
  genererCodeAvecExpiration,
  validerCode,
  estCodeExpire,
  estCodeTropSimple,
  tempsRestantAvantExpiration
};

// Alias pour compatibilité avec le code existant
module.exports.genererCodeSMS = genererCode6Chiffres;
module.exports.genererCodeOTP = genererCodeSecurise;