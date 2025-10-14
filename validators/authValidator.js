const { body } = require('express-validator');

// =============== VALIDATIONS DE BASE ===============

// Validation email
const validateEmail = [
  body('email')
    .trim()
    .isEmail()
    .withMessage('Email invalide')
    .normalizeEmail()
];

// Validation téléphone ivoirien
const validatePhone = [
  body('telephone')
    .trim()
    .matches(/^(\+225)?[0-9]{8,10}$/)
    .withMessage('Numéro de téléphone ivoirien invalide')
];

// Validation mot de passe fort
const validatePassword = [
  body('motDePasse')
    .isLength({ min: 8 })
    .withMessage('Le mot de passe doit contenir au moins 8 caractères')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Le mot de passe doit contenir au moins une majuscule, une minuscule et un chiffre')
];

// Validation code SMS (6 chiffres)
const validateSMSCode = [
  body('codeSMS')
    .trim()
    .matches(/^[0-9]{6}$/)
    .withMessage('Le code SMS doit contenir exactement 6 chiffres')
];

// Validation code OTP (6 chiffres)
const validateOTPCode = [
  body('codeOTP')
    .trim()
    .matches(/^[0-9]{6}$/)
    .withMessage('Le code OTP doit contenir exactement 6 chiffres')
];

// =============== VALIDATIONS POUR INSCRIPTION ===============

// Validation pour l'inscription EMAIL (existant)
const registerValidation = [
  body('nom').trim().notEmpty().withMessage('Le nom est requis'),
  body('prenom').trim().notEmpty().withMessage('Le prénom est requis'),
  body('email').trim().isEmail().withMessage('Email invalide'),
  body('password')
    .isLength({ min: 8 }).withMessage('Le mot de passe doit contenir au moins 8 caractères')
    .matches(/[A-Z]/).withMessage('Le mot de passe doit contenir au moins une majuscule')
    .matches(/[a-z]/).withMessage('Le mot de passe doit contenir au moins une minuscule')
    .matches(/[0-9]/).withMessage('Le mot de passe doit contenir au moins un chiffre'),
  body('telephone')
    .optional()
    .isMobilePhone('fr-FR').withMessage('Numéro de téléphone invalide')
];

// NOUVEAU: Validation pour l'inscription SMS
const registerSMSValidation = [
  body('nom')
    .trim()
    .notEmpty()
    .withMessage('Le nom est requis')
    .isLength({ min: 2, max: 50 })
    .withMessage('Le nom doit contenir entre 2 et 50 caractères'),
  
  body('prenom')
    .trim()
    .notEmpty()
    .withMessage('Le prénom est requis')
    .isLength({ min: 2, max: 50 })
    .withMessage('Le prénom doit contenir entre 2 et 50 caractères'),
  
  ...validatePhone,
  ...validatePassword,
  
  body('email')
    .optional()
    .trim()
    .isEmail()
    .withMessage('Email invalide')
    .normalizeEmail(),
  
  body('dateNaissance')
    .optional()
    .isISO8601()
    .withMessage('Date de naissance invalide')
    .custom((value) => {
      if (value) {
        const age = (Date.now() - new Date(value).getTime()) / (1000 * 60 * 60 * 24 * 365);
        if (age < 18 || age > 80) {
          throw new Error('L\'âge doit être compris entre 18 et 80 ans');
        }
      }
      return true;
    }),
  
  body('sexe')
    .optional()
    .isIn(['M', 'F'])
    .withMessage('Le sexe doit être M ou F')
];

// =============== VALIDATIONS POUR CONNEXION ===============

// Validation pour la connexion (existant)
const loginValidation = [
  body('email').trim().isEmail().withMessage('Email invalide'),
  body('password').notEmpty().withMessage('Le mot de passe est requis')
];

// NOUVEAU: Validation pour connexion par téléphone
const loginPhoneValidation = [
  ...validatePhone,
  body('motDePasse').notEmpty().withMessage('Le mot de passe est requis')
];

// =============== VALIDATIONS POUR VÉRIFICATION ===============

// NOUVEAU: Validation pour vérification SMS
const verifySMSValidation = [
  ...validatePhone,
  ...validateSMSCode
];

// NOUVEAU: Validation pour renvoi SMS
const resendSMSValidation = [
  ...validatePhone
];

// =============== VALIDATIONS RESET PASSWORD ===============

// Validation pour la réinitialisation de mot de passe (existant)
const resetPasswordValidation = [
  body('password')
    .isLength({ min: 8 }).withMessage('Le mot de passe doit contenir au moins 8 caractères')
    .matches(/[A-Z]/).withMessage('Le mot de passe doit contenir au moins une majuscule')
    .matches(/[a-z]/).withMessage('Le mot de passe doit contenir au moins une minuscule')
    .matches(/[0-9]/).withMessage('Le mot de passe doit contenir au moins un chiffre')
];

// NOUVEAU: Validation pour demande reset par SMS
const resetPasswordSMSValidation = [
  ...validatePhone
];

// NOUVEAU: Validation pour vérification OTP reset
const verifyOTPResetValidation = [
  ...validatePhone,
  ...validateOTPCode
];

// NOUVEAU: Validation pour nouveau mot de passe après OTP
const newPasswordValidation = [
  body('password')
    .isLength({ min: 8 })
    .withMessage('Le mot de passe doit contenir au moins 8 caractères')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Le mot de passe doit contenir au moins une majuscule, une minuscule et un chiffre'),
  
  body('confirmPassword')
    .custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error('La confirmation du mot de passe ne correspond pas');
      }
      return true;
    })
];

// =============== VALIDATIONS POUR ADMIN ===============

// Validation pour connexion admin
const adminLoginValidation = [
  body('email')
    .trim()
    .isEmail()
    .withMessage('Email administrateur invalide'),
  body('motDePasse')
    .notEmpty()
    .withMessage('Le mot de passe administrateur est requis')
];

// =============== VALIDATIONS POUR TOKENS ===============

// Validation pour refresh token
const refreshTokenValidation = [
  body('refreshToken')
    .notEmpty()
    .withMessage('Refresh token requis')
    .isLength({ min: 10 })
    .withMessage('Refresh token invalide')
];

// =============== VALIDATIONS POUR PROFIL ===============

// Validation pour mise à jour profil
const updateProfileValidation = [
  body('nom')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Le nom doit contenir entre 2 et 50 caractères'),
  
  body('prenom')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Le prénom doit contenir entre 2 et 50 caractères'),
  
  body('email')
    .optional()
    .trim()
    .isEmail()
    .withMessage('Email invalide'),
  
  body('telephone')
    .optional()
    .matches(/^(\+225)?[0-9]{8,10}$/)
    .withMessage('Numéro de téléphone ivoirien invalide'),
  
  body('dateNaissance')
    .optional()
    .isISO8601()
    .withMessage('Date de naissance invalide'),
  
  body('sexe')
    .optional()
    .isIn(['M', 'F'])
    .withMessage('Le sexe doit être M ou F')
];

// =============== VALIDATIONS COMPOSITES ===============

// Validation complète inscription (EMAIL ou SMS)
const fullRegisterValidation = [
  body('nom')
    .trim()
    .notEmpty()
    .withMessage('Le nom est requis')
    .isLength({ min: 2, max: 50 })
    .withMessage('Le nom doit contenir entre 2 et 50 caractères'),
  
  body('prenom')
    .trim()
    .notEmpty()
    .withMessage('Le prénom est requis')
    .isLength({ min: 2, max: 50 })
    .withMessage('Le prénom doit contenir entre 2 et 50 caractères'),
  
  body('email')
    .optional()
    .trim()
    .isEmail()
    .withMessage('Email invalide')
    .normalizeEmail(),
  
  body('telephone')
    .trim()
    .notEmpty()
    .withMessage('Le numéro de téléphone est requis')
    .matches(/^(\+225)?[0-9]{8,10}$/)
    .withMessage('Numéro de téléphone ivoirien invalide'),
  
  ...validatePassword,
  
  body('dateNaissance')
    .optional()
    .isISO8601()
    .withMessage('Date de naissance invalide'),
  
  body('sexe')
    .optional()
    .isIn(['M', 'F'])
    .withMessage('Le sexe doit être M ou F'),
  
  // Vérifier qu'au moins email OU téléphone est fourni
  body().custom((value, { req }) => {
    if (!req.body.email && !req.body.telephone) {
      throw new Error('Email ou téléphone requis');
    }
    return true;
  })
];

// =============== VALIDATIONS PERSONNALISÉES ===============

// Validation pour numéro ivoirien spécifique
const validateIvorianPhone = [
  body('telephone')
    .trim()
    .custom((value) => {
      // Normaliser le numéro
      let cleaned = value.replace(/[^\d+]/g, '');
      
      // Formats acceptés pour la Côte d'Ivoire
      const validPatterns = [
        /^\+225[0-9]{8}$/,     // Format international complet
        /^225[0-9]{8}$/,       // Sans le +
        /^0[0-9]{7,9}$/,       // Format national (07, 05, 01...)
        /^[0-9]{8}$/           // 8 chiffres directs
      ];
      
      const isValid = validPatterns.some(pattern => pattern.test(cleaned));
      
      if (!isValid) {
        throw new Error('Numéro de téléphone ivoirien invalide');
      }
      
      return true;
    })
];

// Validation pour email avec domaines spécifiques
const validateEmailDomains = [
  body('email')
    .trim()
    .isEmail()
    .withMessage('Email invalide')
    .custom((value) => {
      const allowedDomains = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com'];
      const domain = value.split('@')[1];
      
      if (!allowedDomains.includes(domain)) {
        throw new Error('Domaine email non autorisé');
      }
      
      return true;
    })
];

// =============== EXPORTS ===============

module.exports = {
  // Validations de base
  validateEmail,
  validatePhone,
  validatePassword,
  validateSMSCode,
  validateOTPCode,
  
  // Validations existantes (compatibilité)
  registerValidation,
  loginValidation,
  resetPasswordValidation,
  
  // Nouvelles validations SMS
  registerSMSValidation,
  verifySMSValidation,
  resendSMSValidation,
  resetPasswordSMSValidation,
  verifyOTPResetValidation,
  newPasswordValidation,
  
  // Validations système
  loginPhoneValidation,
  adminLoginValidation,
  refreshTokenValidation,
  updateProfileValidation,
  fullRegisterValidation,
  
  // Validations personnalisées
  validateIvorianPhone,
  validateEmailDomains
};