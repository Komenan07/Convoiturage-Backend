// config/validationConstants.js

/**
 * Constantes de validation pour le système de paiement
 */

// =========================
// MONTANTS ET LIMITES
// =========================

const LIMITES_MONTANTS = {
  PAIEMENT_TRAJET: {
    MIN: 100,
    MAX: 1000000
  },
  RECHARGE: {
    MIN: 1000,
    MAX: 1000000
  },
  AUTO_RECHARGE: {
    SEUIL_MIN: 500,
    SEUIL_MAX: 50000,
    MONTANT_MIN: 1000,
    MONTANT_MAX: 100000
  }
};

// =========================
// MÉTHODES DE PAIEMENT
// =========================

const METHODES_PAIEMENT = {
  MOBILES: ['WAVE', 'ORANGE_MONEY', 'MTN_MONEY', 'MOOV_MONEY'],
  OPERATEURS: ['ORANGE', 'MTN', 'MOOV', 'WAVE'],
  CARTES: ['VISA', 'MASTERCARD'], // Pour extension future
  CRYPTO: ['BITCOIN', 'ETHEREUM']  // Pour extension future
};

// =========================
// STATUTS
// =========================

const STATUTS_PAIEMENT = [
  'EN_ATTENTE',
  'COMPLETE',
  'ECHEC',
  'REMBOURSE',
  'ANNULE',
  'EXPIRE'
];

const STATUTS_COMMISSION = [
  'en_attente',
  'preleve',
  'echec',
  'annule'
];

// =========================
// PATTERNS DE VALIDATION
// =========================

const PATTERNS_TELEPHONE = {
  ORANGE: /^(\+225)?(07|47)[0-9]{8}$/,
  ORANGE_MONEY: /^(\+225)?(07|47)[0-9]{8}$/,
  MTN: /^(\+225)?(05|45|55|65|75|85|95)[0-9]{8}$/,
  MTN_MONEY: /^(\+225)?(05|45|55|65|75|85|95)[0-9]{8}$/,
  MOOV: /^(\+225)?(01|02|03|41|42|43)[0-9]{8}$/,
  MOOV_MONEY: /^(\+225)?(01|02|03|41|42|43)[0-9]{8}$/,
  WAVE: /^(\+225)?[0-9]{8,10}$/,
  GENERAL: /^(\+225)?[0-9]{8,10}$/
};

const PATTERNS_REFERENCE = {
  TRANSACTION: /^[A-Z0-9_]{10,50}$/,
  CODE_VERIFICATION: /^[A-Z0-9]{6,20}$/,
  CODE_TRANSACTION: /^[A-Z0-9]{6,20}$/
};

// =========================
// LIMITES DE PAGINATION
// =========================

const PAGINATION = {
  PAGE_MIN: 1,
  PAGE_MAX: 1000,
  LIMIT_MIN: 1,
  LIMIT_MAX_HISTORIQUE: 50,
  LIMIT_MAX_RECHARGES: 100,
  LIMIT_DEFAULT: 20
};

// =========================
// PÉRIODES ET DATES
// =========================

const PERIODES = {
  GROUPEMENT: ['heure', 'jour', 'semaine', 'mois'],
  RAPPORTS_MAX_JOURS: 365,
  AUTO_RECHARGE_DELAI_MINUTES: 30,
  RECHARGE_EXPIRATION_HEURES: 2
};

// =========================
// ACTIONS ADMIN
// =========================

const ACTIONS_ADMIN = {
  COMMISSIONS: ['retry', 'waive', 'manual'],
  REMBOURSEMENTS: ['complet', 'partiel'],
  RECHARGES: ['confirmer', 'expirer', 'annuler']
};

// =========================
// FORMATS EXPORT
// =========================

const FORMATS_EXPORT = ['json', 'pdf', 'csv', 'excel'];

// =========================
// TYPES DE VALIDATION
// =========================

const TYPES_HISTORIQUE = ['tous', 'trajets', 'recharges'];

// =========================
// RÔLES ET PERMISSIONS
// =========================

const ROLES = {
  PASSAGER: 'passager',
  CONDUCTEUR: 'conducteur',
  LES_DEUX: 'les_deux',
  ADMIN: 'admin',
  SUPER_ADMIN: 'super_admin'
};

const PERMISSIONS = {
  RECHARGE: ['conducteur', 'les_deux'],
  ADMIN_COMMISSIONS: ['admin', 'super_admin'],
  ADMIN_STATS: ['admin', 'super_admin'],
  REMBOURSEMENT: ['admin', 'super_admin']
};

// =========================
// MESSAGES D'ERREUR PERSONNALISÉS
// =========================

const MESSAGES_ERREUR = {
  MONTANT_INVALIDE_TRAJET: `Montant doit être entre ${LIMITES_MONTANTS.PAIEMENT_TRAJET.MIN} et ${LIMITES_MONTANTS.PAIEMENT_TRAJET.MAX.toLocaleString()} FCFA`,
  MONTANT_INVALIDE_RECHARGE: `Montant doit être entre ${LIMITES_MONTANTS.RECHARGE.MIN.toLocaleString()} et ${LIMITES_MONTANTS.RECHARGE.MAX.toLocaleString()} FCFA`,
  TELEPHONE_INVALIDE: 'Format de numéro de téléphone invalide',
  TELEPHONE_OPERATEUR_MISMATCH: 'Numéro invalide pour l\'opérateur sélectionné',
  METHODE_PAIEMENT_INVALIDE: `Méthode de paiement non supportée. Méthodes acceptées: ${METHODES_PAIEMENT.MOBILES.join(', ')}`,
  REFERENCE_INVALIDE: 'Format de référence de transaction invalide',
  PAGINATION_INVALIDE: `Page doit être entre ${PAGINATION.PAGE_MIN} et ${PAGINATION.PAGE_MAX}`,
  LIMITE_INVALIDE: `Limite doit être entre ${PAGINATION.LIMIT_MIN} et ${PAGINATION.LIMIT_MAX_HISTORIQUE}`,
  DATE_INVALIDE: 'Format de date invalide (ISO8601 requis)',
  PERIODE_INVALIDE: `Période invalide. Valeurs acceptées: ${PERIODES.GROUPEMENT.join(', ')}`,
  ACTION_ADMIN_INVALIDE: 'Action administrative non autorisée',
  ROLE_INSUFFISANT: 'Permissions insuffisantes pour cette action'
};

// =========================
// FONCTIONS UTILITAIRES
// =========================

/**
 * Obtenir le pattern de validation pour un opérateur
 */
const getPhonePattern = (operateur) => {
  const key = operateur?.toUpperCase();
  return PATTERNS_TELEPHONE[key] || PATTERNS_TELEPHONE.GENERAL;
};

/**
 * Vérifier si une méthode de paiement est supportée
 */
const isMethodeValide = (methode) => {
  return METHODES_PAIEMENT.MOBILES.includes(methode?.toUpperCase());
};

/**
 * Vérifier si un statut est valide
 */
const isStatutValide = (statut) => {
  return STATUTS_PAIEMENT.includes(statut?.toUpperCase());
};

/**
 * Obtenir les limites pour un type de montant
 */
const getLimitesMontant = (type) => {
  switch (type) {
    case 'trajet':
      return LIMITES_MONTANTS.PAIEMENT_TRAJET;
    case 'recharge':
      return LIMITES_MONTANTS.RECHARGE;
    case 'auto_recharge_seuil':
      return { MIN: LIMITES_MONTANTS.AUTO_RECHARGE.SEUIL_MIN, MAX: LIMITES_MONTANTS.AUTO_RECHARGE.SEUIL_MAX };
    case 'auto_recharge_montant':
      return { MIN: LIMITES_MONTANTS.AUTO_RECHARGE.MONTANT_MIN, MAX: LIMITES_MONTANTS.AUTO_RECHARGE.MONTANT_MAX };
    default:
      return { MIN: 0, MAX: 1000000 };
  }
};

/**
 * Vérifier les permissions pour un rôle
 */
const hasPermission = (userRole, requiredPermissions) => {
  if (!Array.isArray(requiredPermissions)) {
    requiredPermissions = [requiredPermissions];
  }
  return requiredPermissions.includes(userRole);
};

/**
 * Validation custom pour les montants selon le type
 */
const validateMontantByType = (value, type) => {
  const limites = getLimitesMontant(type);
  if (value < limites.MIN || value > limites.MAX) {
    throw new Error(`Montant doit être entre ${limites.MIN.toLocaleString()} et ${limites.MAX.toLocaleString()} FCFA`);
  }
  return true;
};

/**
 * Validation du numéro selon l'opérateur
 */
const validatePhoneByOperator = (phone, operator) => {
  const pattern = getPhonePattern(operator);
  if (!pattern.test(phone)) {
    throw new Error(`Numéro invalide pour l'opérateur ${operator}`);
  }
  return true;
};

// =========================
// CONFIGURATION ENVIRONNEMENT
// =========================

const ENV_CONFIG = {
  DEVELOPMENT: {
    SKIP_PHONE_VALIDATION: false,
    ALLOW_TEST_AMOUNTS: true,
    DEBUG_VALIDATION: true
  },
  PRODUCTION: {
    SKIP_PHONE_VALIDATION: false,
    ALLOW_TEST_AMOUNTS: false,
    DEBUG_VALIDATION: false
  },
  TEST: {
    SKIP_PHONE_VALIDATION: true,
    ALLOW_TEST_AMOUNTS: true,
    DEBUG_VALIDATION: false
  }
};

// =========================
// EXPORTS
// =========================

module.exports = {
  // Constantes principales
  LIMITES_MONTANTS,
  METHODES_PAIEMENT,
  STATUTS_PAIEMENT,
  STATUTS_COMMISSION,
  PATTERNS_TELEPHONE,
  PATTERNS_REFERENCE,
  PAGINATION,
  PERIODES,
  ACTIONS_ADMIN,
  FORMATS_EXPORT,
  TYPES_HISTORIQUE,
  ROLES,
  PERMISSIONS,
  MESSAGES_ERREUR,
  ENV_CONFIG,

  // Fonctions utilitaires
  getPhonePattern,
  isMethodeValide,
  isStatutValide,
  getLimitesMontant,
  hasPermission,
  validateMontantByType,
  validatePhoneByOperator
};