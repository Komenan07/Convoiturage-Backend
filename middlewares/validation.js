// middlewares/validation.js
const { body, param, query, validationResult } = require('express-validator');

// =========================
// HELPER FUNCTIONS
// =========================

/**
 * Fonction utilitaire pour gérer les erreurs de validation
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'DONNEES_INVALIDES',
      message: 'Données de validation invalides',
      errors: errors.array().map(err => ({
        field: err.path || err.param,
        message: err.msg,
        value: err.value
      }))
    });
  }
  next();
};

/**
 * Validation des numéros de téléphone par opérateur
 */
const validatePhoneByOperator = (phone, operator) => {
  const patterns = {
    'ORANGE': /^(\+225)?(07|47)[0-9]{8}$/,
    'ORANGE_MONEY': /^(\+225)?(07|47)[0-9]{8}$/,
    'MTN': /^(\+225)?(05|45|55|65|75|85|95)[0-9]{8}$/,
    'MTN_MONEY': /^(\+225)?(05|45|55|65|75|85|95)[0-9]{8}$/,
    'MOOV': /^(\+225)?(01|02|03|41|42|43)[0-9]{8}$/,
    'MOOV_MONEY': /^(\+225)?(01|02|03|41|42|43)[0-9]{8}$/,
    'WAVE': /^(\+225)?[0-9]{8,10}$/
  };
  const pattern = patterns[operator?.toUpperCase()];
  return pattern ? pattern.test(phone) : false;
};

// =========================
// VALIDATION AUTHENTIFICATION
// =========================

const validateRegistration = [
  body('nom').trim().notEmpty().withMessage('Le nom est requis')
    .isLength({ min: 2, max: 50 }).withMessage('Le nom doit contenir entre 2 et 50 caractères'),
  body('prenom').trim().notEmpty().withMessage('Le prénom est requis')
    .isLength({ min: 2, max: 50 }).withMessage('Le prénom doit contenir entre 2 et 50 caractères'),
  body('email').trim().isEmail().withMessage('Email invalide').normalizeEmail(),
  body('password')
    .isLength({ min: 8 }).withMessage('Le mot de passe doit contenir au moins 8 caractères')
    .matches(/[A-Z]/).withMessage('Le mot de passe doit contenir au moins une majuscule')
    .matches(/[a-z]/).withMessage('Le mot de passe doit contenir au moins une minuscule')
    .matches(/[0-9]/).withMessage('Le mot de passe doit contenir au moins un chiffre'),
  body('telephone')
    .optional()
    .matches(/^(\+225)?[0-9]{8,10}$/)
    .withMessage('Numéro de téléphone invalide'),
  handleValidationErrors
];

const registerValidation = validateRegistration; // Alias pour compatibilité

const validateLogin = [
  body('email').trim().isEmail().withMessage('Email invalide'),
  body('password').notEmpty().withMessage('Le mot de passe est requis'),
  handleValidationErrors
];

const loginValidation = validateLogin; // Alias pour compatibilité

const registerSMSValidation = [
  body('nom').trim().notEmpty().withMessage('Le nom est requis'),
  body('prenom').trim().notEmpty().withMessage('Le prénom est requis'),
  body('telephone')
    .trim()
    .notEmpty()
    .withMessage('Le numéro de téléphone est requis')
    .matches(/^(\+225)?[0-9]{8,10}$/)
    .withMessage('Numéro de téléphone invalide'),
  body('motDePasse')
    .isLength({ min: 8 })
    .withMessage('Le mot de passe doit contenir au moins 8 caractères')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Le mot de passe doit contenir au moins une majuscule, une minuscule et un chiffre'),
  handleValidationErrors
];

const resetPasswordValidation = [
  body('password')
    .isLength({ min: 8 }).withMessage('Le mot de passe doit contenir au moins 8 caractères')
    .matches(/[A-Z]/).withMessage('Le mot de passe doit contenir au moins une majuscule')
    .matches(/[a-z]/).withMessage('Le mot de passe doit contenir au moins une minuscule')
    .matches(/[0-9]/).withMessage('Le mot de passe doit contenir au moins un chiffre'),
  handleValidationErrors
];

// =========================
// VALIDATION TRAJETS
// =========================

const validateTrajet = [
  body('depart').notEmpty().withMessage('Le point de départ est requis'),
  body('arrivee').notEmpty().withMessage('Le point d\'arrivée est requis'),
  body('dateDepart').isISO8601().withMessage('Date de départ invalide'),
  body('placesDisponibles').isInt({ min: 1 }).withMessage('Au moins une place doit être disponible'),
  body('prix').isFloat({ min: 0 }).withMessage('Le prix doit être positif'),
  handleValidationErrors
];

/**
 * Validation pour obtenir les méthodes de paiement d'un trajet
 */
const validateTrajetId = [
  param('trajetId')
    .notEmpty()
    .withMessage('ID de trajet requis')
    .isMongoId()
    .withMessage('ID de trajet invalide'),
  handleValidationErrors
];

// =========================
// VALIDATION VÉHICULES
// =========================

const validateVehicule = [
  body('marque').notEmpty().withMessage('La marque est requise'),
  body('modele').notEmpty().withMessage('Le modèle est requis'),
  body('immatriculation').notEmpty().withMessage('L\'immatriculation est requise'),
  body('nombrePlaces').isInt({ min: 1, max: 8 }).withMessage('Le nombre de places doit être entre 1 et 8'),
  handleValidationErrors
];

// =========================
// VALIDATION RÉSERVATIONS
// =========================

const validateReservation = [
  body('trajet').notEmpty().withMessage('Le trajet est requis'),
  body('nombrePlaces').isInt({ min: 1 }).withMessage('Le nombre de places doit être au moins 1'),
  handleValidationErrors
];

// =========================
// VALIDATION PAIEMENTS TRAJETS
// =========================

const validatePaiement = [
  body('reservationId')
    .notEmpty()
    .withMessage('ID de réservation requis')
    .isMongoId()
    .withMessage('ID de réservation invalide'),
  body('montant')
    .isFloat({ min: 100, max: 1000000 })
    .withMessage('Montant doit être entre 100 et 1,000,000 FCFA')
    .toFloat(),
  body('methodePaiement')
    .optional()
    .isIn(['WAVE',  'ORANGE', 'MTN', 'MOOV', 'ORANGE_MONEY', 'MTN_MONEY', 'MOOV_MONEY'])
    .withMessage('Méthode de paiement non supportée')
    .default('WAVE'),
  handleValidationErrors
];

/**
 * Validation pour confirmer un paiement en espèces
 */
const validateConfirmerPaiementEspeces = [
  param('referenceTransaction')
    .notEmpty()
    .withMessage('Référence de transaction requise')
    .isLength({ min: 10, max: 50 })
    .withMessage('Format de référence invalide'),
  body('codeConfirmation')
    .optional()
    .isString()
    .withMessage('Code de confirmation doit être une chaîne')
    .isLength({ min: 4, max: 10 })
    .withMessage('Code de confirmation invalide (4-10 caractères)'),
  handleValidationErrors
];

// =========================
// VALIDATION RECHARGES
// =========================

const validateRecharge = [
  body('montant')
    .isFloat({ min: 1000, max: 1000000 })
    .withMessage('Montant doit être entre 1,000 et 1,000,000 FCFA')
    .toFloat(),
  body('methodePaiement')
    .isIn(['WAVE',  'ORANGE', 'MTN', 'MOOV', 'ORANGE_MONEY', 'MTN_MONEY', 'MOOV_MONEY'])
    .withMessage('Méthode de paiement non supportée'),
  body('numeroTelephone')
    .notEmpty()
    .withMessage('Numéro de téléphone requis')
    .matches(/^(\+225)?[0-9]{8,10}$/)
    .withMessage('Format de numéro invalide')
    .custom((value, { req }) => {
      const operator = req.body.operateur || req.body.methodePaiement;
      if (operator && !validatePhoneByOperator(value, operator)) {
        throw new Error(`Numéro invalide pour l'opérateur ${operator}`);
      }
      return true;
    }),
  body('operateur')
    .optional()
    .isIn(['ORANGE', 'MTN', 'MOOV', 'WAVE', 'ORANGE_MONEY', 'MTN_MONEY', 'MOOV_MONEY'])
    .withMessage('Opérateur non supporté'),
  body('codeTransaction')
    .optional()
    .isLength({ min: 6, max: 20 })
    .withMessage('Code de transaction invalide (6-20 caractères)'),
  handleValidationErrors
];

const validateConfirmerRecharge = [
  body('referenceTransaction')
    .notEmpty()
    .withMessage('Référence de transaction requise')
    .isLength({ min: 10, max: 50 })
    .withMessage('Format de référence invalide'),
  body('codeVerification')
    .optional()
    .isLength({ min: 6, max: 20 })
    .withMessage('Code de vérification invalide'),
  body('statutPaiement')
    .optional()
    .isIn(['COMPLETE', 'ECHEC'])
    .withMessage('Statut de paiement invalide')
    .default('COMPLETE'),
  body('donneesCallback')
    .optional()
    .isObject()
    .withMessage('Données de callback doivent être un objet'),
  handleValidationErrors
];

const validateHistoriqueRecharges = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Numéro de page invalide')
    .toInt()
    .default(1),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limite invalide (1-100)')
    .toInt()
    .default(10),
  query('statut')
    .optional()
    .isIn(['EN_ATTENTE', 'COMPLETE', 'ECHEC', 'ANNULE'])
    .withMessage('Statut invalide'),
  query('dateDebut')
    .optional()
    .isISO8601()
    .withMessage('Format de date début invalide (ISO8601)')
    .toDate(),
  query('dateFin')
    .optional()
    .isISO8601()
    .withMessage('Format de date fin invalide (ISO8601)')
    .toDate()
    .custom((value, { req }) => {
      if (req.query.dateDebut && value <= new Date(req.query.dateDebut)) {
        throw new Error('Date fin doit être postérieure à date début');
      }
      return true;
    }),
  handleValidationErrors
];

const validateAutoRecharge = [
  body('active')
    .isBoolean()
    .withMessage('Active doit être un booléen'),
  body('seuilAutoRecharge')
    .if(body('active').equals(true))
    .isFloat({ min: 500, max: 50000 })
    .withMessage('Seuil auto-recharge doit être entre 500 et 50,000 FCFA')
    .toFloat(),
  body('montantAutoRecharge')
    .if(body('active').equals(true))
    .isFloat({ min: 1000, max: 100000 })
    .withMessage('Montant auto-recharge doit être entre 1,000 et 100,000 FCFA')
    .toFloat(),
  body('methodePaiementAuto')
    .if(body('active').equals(true))
    .isIn(['WAVE', 'ORANGE_MONEY', 'MTN_MONEY', 'MOOV_MONEY'])
    .withMessage('Méthode de paiement auto invalide'),
  body('numeroTelephoneAuto')
    .if(body('active').equals(true))
    .notEmpty()
    .withMessage('Numéro de téléphone auto requis')
    .matches(/^(\+225)?[0-9]{8,10}$/)
    .withMessage('Format de numéro auto invalide'),
  handleValidationErrors
];

// =========================
// VALIDATION COMMUNES
// =========================

const validateReferenceTransaction = [
  param('referenceTransaction')
    .notEmpty()
    .withMessage('Référence de transaction requise')
    .isLength({ min: 10, max: 50 })
    .withMessage('Format de référence invalide'),
  handleValidationErrors
];

const validatePaiementId = [
  param('paiementId')
    .isMongoId()
    .withMessage('ID de paiement invalide'),
  handleValidationErrors
];

const validateHistoriquePaiements = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Numéro de page invalide')
    .toInt(),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Limite invalide (1-50)')
    .toInt(),
  query('statut')
    .optional()
    .isIn(['EN_ATTENTE', 'COMPLETE', 'ECHEC', 'REMBOURSE', 'ANNULE'])
    .withMessage('Statut invalide'),
  query('type')
    .optional()
    .isIn(['tous', 'trajets', 'recharges'])
    .withMessage('Type invalide')
    .default('tous'),
  query('dateDebut')
    .optional()
    .isISO8601()
    .withMessage('Format de date début invalide')
    .toDate(),
  query('dateFin')
    .optional()
    .isISO8601()
    .withMessage('Format de date fin invalide')
    .toDate(),
  handleValidationErrors
];

const validateRemboursement = [
  body('paiementId')
    .isMongoId()
    .withMessage('ID de paiement invalide'),
  body('raison')
    .notEmpty()
    .withMessage('Raison du remboursement requise')
    .isLength({ min: 10, max: 500 })
    .withMessage('Raison doit contenir entre 10 et 500 caractères'),
  handleValidationErrors
];

// =========================
// VALIDATION ADMIN - COMMISSIONS
// =========================

const validateStatistiquesCommissions = [
  query('dateDebut')
    .optional()
    .isISO8601()
    .withMessage('Format de date début invalide')
    .toDate(),
  query('dateFin')
    .optional()
    .isISO8601()
    .withMessage('Format de date fin invalide')
    .toDate(),
  query('periode')
    .optional()
    .isInt({ min: 1, max: 365 })
    .withMessage('Période invalide (1-365 jours)')
    .toInt()
    .default(30),
  handleValidationErrors
];

const validateTraiterCommissionsEchec = [
  body('paiementIds')
    .isArray({ min: 1 })
    .withMessage('Liste d\'IDs de paiement requise'),
  body('paiementIds.*')
    .isMongoId()
    .withMessage('ID de paiement invalide'),
  body('action')
    .isIn(['retry', 'waive', 'manual'])
    .withMessage('Action invalide (retry, waive, manual)')
    .default('retry'),
  handleValidationErrors
];

const validateRapportCommissions = [
  query('format')
    .optional()
    .isIn(['json', 'pdf', 'csv'])
    .withMessage('Format invalide (json, pdf, csv)')
    .default('json'),
  query('dateDebut')
    .optional()
    .isISO8601()
    .withMessage('Format de date début invalide')
    .toDate(),
  query('dateFin')
    .optional()
    .isISO8601()
    .withMessage('Format de date fin invalide')
    .toDate(),
  query('groupePar')
    .optional()
    .isIn(['heure', 'jour', 'semaine', 'mois'])
    .withMessage('Groupement invalide')
    .default('jour'),
  handleValidationErrors
];

// =========================
// VALIDATION ADMIN - RECHARGES
// =========================

const validateStatistiquesRecharges = [
  query('dateDebut')
    .optional()
    .isISO8601()
    .withMessage('Format de date début invalide')
    .toDate(),
  query('dateFin')
    .optional()
    .isISO8601()
    .withMessage('Format de date fin invalide')
    .toDate(),
  query('groupePar')
    .optional()
    .isIn(['heure', 'jour', 'semaine', 'mois'])
    .withMessage('Groupement invalide')
    .default('jour'),
  handleValidationErrors
];

const validateTraiterRechargesAttente = [
  body('forcerExpiration')
    .optional()
    .isBoolean()
    .withMessage('Forcer expiration doit être un booléen')
    .default(false),
  handleValidationErrors
];

const validateAnnulerRecharge = [
  param('referenceTransaction')
    .notEmpty()
    .withMessage('Référence de transaction requise')
    .isLength({ min: 10, max: 50 })
    .withMessage('Format de référence invalide'),
  body('raison')
    .optional()
    .isLength({ max: 200 })
    .withMessage('Raison trop longue (max 200 caractères)'),
  handleValidationErrors
];

// =========================
// VALIDATION WEBHOOK
// =========================

const validateWebhookCinetPay = [
  body('cpm_trans_id')
    .optional()
    .notEmpty()
    .withMessage('ID transaction CinetPay requis'),
  body('cpm_trans_status')
    .optional()
    .isIn(['COMPLETED', 'FAILED', 'PENDING'])
    .withMessage('Statut transaction invalide'),
  body('signature')
    .optional()
    .notEmpty()
    .withMessage('Signature webhook requise'),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.warn('Webhook validation errors:', errors.array());
    }
    next();
  }
];

// =========================
// EXPORTS
// =========================

module.exports = {
  // Utilitaires
  handleValidationErrors,
  validatePhoneByOperator,
  
  // Authentification
  validateRegistration,
  registerValidation,
  validateLogin,
  loginValidation,
  registerSMSValidation,
  resetPasswordValidation,
  
  // Trajets
  validateTrajet,
   validateTrajetId,
  
  // Véhicules
  validateVehicule,
  
  // Réservations
  validateReservation,
  
  // Paiements trajets
  validatePaiement,
  validateConfirmerPaiementEspeces,
  
  // Recharges
  validateRecharge,
  validateConfirmerRecharge,
  validateHistoriqueRecharges,
  validateAutoRecharge,
  validateAnnulerRecharge,
  
  // Communes
  validateReferenceTransaction,
  validatePaiementId,
  validateHistoriquePaiements,
  validateRemboursement,
  
  // Admin - Commissions
  validateStatistiquesCommissions,
  validateTraiterCommissionsEchec,
  validateRapportCommissions,
  
  // Admin - Recharges
  validateStatistiquesRecharges,
  validateTraiterRechargesAttente,
  
  // Webhooks
  validateWebhookCinetPay
};