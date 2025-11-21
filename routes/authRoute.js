// routes/authRoute.js
const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { loginFlexibleValidation } = require('../validators/authValidator');
const rateLimit = require('express-rate-limit');

// =============== IMPORTS ===============
const {
  // Inscription
  inscription,              
  inscriptionSMS, 
  passerConducteur,
  register,
  verifyCode,
  resendCode,          
  
  // Confirmation
  confirmerEmail,           
  verifierCodeSMS,          
  renvoyerConfirmationEmail, 
  renvoyerCodeSMS,          
  
  // Connexion
  connexion,
  connexionAdmin,
  deconnexion,
  verifierToken,
  obtenirUtilisateurConnecte,
  
  // Réinitialisation mot de passe
  motDePasseOublie,         
  motDePasseOublieSMS,      
  verifierCodeOTPReset,     
  reinitialiserMotDePasse,
  demandeReinitialisationMotDePasse,
  confirmerReinitialisationMotDePasse,

  // Réinitialisation mot de passe WhatsApp
  forgotPassword,          
  resetPassword,            
  resendResetCode,    
  verifyResetCode,      
  
  // Gestion des Refresh Tokens
  refreshToken,
  roterToken,
  obtenirSessionsActives,
  revoquerSession,
  deconnexionGlobale,

  // Gestion des Recharges
  demanderRecharge,
  confirmerRecharge,
  configurerAutoRecharge,
  desactiverAutoRecharge,
  configurerRetraitGains,

  // Nouveaux contrôleurs compte covoiturage
  obtenirResumeCompteCovoiturage,
  obtenirHistoriqueRecharges,
  obtenirHistoriqueCommissions,
  verifierCapaciteAcceptationCourse
} = require('../controllers/authController');

const { authMiddleware } = require('../middlewares/authMiddleware');
const AppError = require('../utils/AppError');

// =============== RATE LIMITING ===============

const inscriptionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // 3 inscriptions max par IP
  message: { 
    success: false,
    message: 'Trop de tentatives d\'inscription. Réessayez dans 15 minutes.'
  }
});

const smsLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 5, // 5 SMS max par IP
  message: {
    success: false,
    message: 'Trop de demandes SMS. Réessayez dans 5 minutes.'
  }
});

const resetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 demandes reset max par IP
  message: {
    success: false,
    message: 'Trop de demandes de réinitialisation. Réessayez dans 15 minutes.'
  }
});

const connexionLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 tentatives de connexion max par IP
  message: {
    success: false,
    message: 'Trop de tentatives de connexion. Réessayez dans 15 minutes.'
  }
});
// ⭐ Rate limiter spécifique pour réinitialisation WhatsApp
const whatsappResetLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // 3 demandes max par IP
  message: {
    success: false,
    message: 'Trop de demandes de réinitialisation WhatsApp. Réessayez dans 15 minutes.'
  }
});

const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 demandes de refresh max par IP
  message: {
    success: false,
    message: 'Trop de demandes de rafraîchissement de token. Réessayez dans 15 minutes.'
  }
});

// =============== VALIDATIONS ===============

const validateEmail = [
  body('email')
    // .trim()
    .isEmail()
    .withMessage('Email invalide')
    // .normalizeEmail()
];

const validatePhone = [
  body('telephone')
    .trim()
    .matches(/^(\+225)?[0-9]{8,10}$/)
    .withMessage('Numéro de téléphone invalide')
];

const validatePassword = [
  body('motDePasse')
    .isLength({ min: 8 })
    .withMessage('Le mot de passe doit contenir au moins 8 caractères')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Le mot de passe doit contenir au moins une majuscule, une minuscule et un chiffre')
];

const validateResetPassword = [
  body('motDePasse')
    .isLength({ min: 8 })
    .withMessage('Le mot de passe doit contenir au moins 8 caractères')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Le mot de passe doit contenir au moins une majuscule, une minuscule et un chiffre')
];

const validateSMSCode = [
  body('codeSMS')
    .trim()
    .matches(/^[0-9]{6}$/)
    .withMessage('Le code SMS doit contenir exactement 6 chiffres')
];

const validateOTPCode = [
  body('codeOTP')
    .trim()
    .matches(/^[0-9]{6}$/)
    .withMessage('Le code OTP doit contenir exactement 6 chiffres')
];

const validateRole = [
  body('role')
    .optional()
    .isIn(['conducteur', 'passager', 'les_deux'])
    .withMessage('Rôle invalide. Doit être: conducteur, passager ou les_deux')
];
// ⭐ Validation code WhatsApp (6 chiffres)
const validateWhatsAppCode = [
  body('code')
    .trim()
    .matches(/^[0-9]{6}$/)
    .withMessage('Le code doit contenir exactement 6 chiffres')
];

// ⭐ Validation nouveau mot de passe WhatsApp
const validateNewPassword = [
  body('new_password')
    .isLength({ min: 4 })
    .withMessage('Le mot de passe doit contenir au moins 4 caractères')
];

const validateRefreshToken = [
  body('refreshToken')
    .trim()
    .notEmpty()
    .withMessage('Le refresh token est requis')
    .isLength({ min: 64, max: 128 })
    .withMessage('Le refresh token doit être un JWT valide')
];

const validateRecharge = [
  body('montant')
    .isNumeric()
    .withMessage('Le montant doit être un nombre')
    .isFloat({ min: 100 })
    .withMessage('Le montant minimum de recharge est de 100 FCFA'),
  body('methodePaiement')
    .trim()
    .notEmpty()
    .withMessage('La méthode de paiement est requise')
    .isIn(['orange_money', 'mtn_money', 'moov_money', 'wave', 'carte_bancaire'])
    .withMessage('Méthode de paiement invalide'),
  body('numeroTelephone')
    .optional()
    .trim()
    .matches(/^(\+225)?[0-9]{8,10}$/)
    .withMessage('Numéro de téléphone invalide')
];

/**
 * Validations pour l'inscription conducteur
 */
const validateConducteurInscription = [
  // Validation du véhicule (OBLIGATOIRE pour devenir conducteur)
  body('vehicule').notEmpty().withMessage('Les informations du véhicule sont obligatoires'),
  
  // Champs obligatoires du véhicule
  // body('vehicule.marque')
  //   .trim()
  //   .notEmpty()
  //   .withMessage('La marque du véhicule est obligatoire'),
  // body('vehicule.modele')
  //   .trim()
  //   .notEmpty()
  //   .withMessage('Le modèle du véhicule est obligatoire'),
  // body('vehicule.couleur')
  //   .trim()
  //   .notEmpty()
  //   .withMessage('La couleur du véhicule est obligatoire'),
  // body('vehicule.annee')
  //   .isInt({ min: 2010, max: new Date().getFullYear() + 1 })
  //   .withMessage('L\'année du véhicule doit être entre 2010 et ' + (new Date().getFullYear() + 1)),
  // body('vehicule.nombrePlaces')
  //   .isInt({ min: 2, max: 9 })
  //   .withMessage('Le nombre de places doit être entre 2 et 9'),
  // body('vehicule.immatriculation')
  //   .trim()
  //   .notEmpty()
  //   .withMessage('L\'immatriculation est obligatoire')
  //   .matches(/^([A-Z]{2}-\d{3}-[A-Z]{2}|\d{4}\s[A-Z]{2}\s\d{2})$/i)
  //   .withMessage('Format d\'immatriculation invalide (AB-123-CD ou 1234 AB 01)'),

  // // Champs optionnels du véhicule avec valeurs par défaut
  // body('vehicule.carburant')
  //   .optional()
  //   .isIn(['ESSENCE', 'DIESEL', 'HYBRIDE', 'ELECTRIQUE', 'GPL'])
  //   .withMessage('Type de carburant invalide'),
  // // body('vehicule.typeCarrosserie')
  // //   .optional()
  // //   .isIn(['BERLINE', 'BREAK', 'COUPE', 'CABRIOLET', 'SUV', '4X4', 'MONOSPACE', 'UTILITAIRE'])
  // //   .withMessage('Type de carrosserie invalide'),
  // body('vehicule.transmission')
  //   .optional()
  //   .isIn(['MANUELLE', 'AUTOMATIQUE'])
  //   .withMessage('Type de transmission invalide'),
  // body('vehicule.kilometrage')
  //   .optional()
  //   .isInt({ min: 0 })
  //   .withMessage('Kilométrage invalide'),

  // // Documents légaux (optionnels)
  // body('vehicule.assurance.numeroPolice')
  //   .optional()
  //   .trim()
  //   .isLength({ min: 1 })
  //   .withMessage('Numéro de police d\'assurance invalide'),
  // body('vehicule.assurance.dateExpiration')
  //   .optional()
  //   .isISO8601()
  //   .withMessage('Date d\'expiration assurance invalide'),
  // body('vehicule.assurance.compagnie')
  //   .optional()
  //   .trim()
  //   .isLength({ min: 2 })
  //   .withMessage('Nom de la compagnie d\'assurance invalide'),

  // body('vehicule.visiteTechnique.dateExpiration')
  //   .optional()
  //   .isISO8601()
  //   .withMessage('Date d\'expiration visite technique invalide'),
  // body('vehicule.visiteTechnique.resultat')
  //   .optional()
  //   .isIn(['FAVORABLE', 'DEFAVORABLE', 'FAVORABLE_AVEC_RESERVES'])
  //   .withMessage('Résultat visite technique invalide'),

  // body('vehicule.carteGrise.numero')
  //   .optional()
  //   .trim()
  //   .isLength({ min: 1 })
  //   .withMessage('Numéro carte grise invalide'),
  // body('vehicule.carteGrise.numeroChassis')
  //   .optional()
  //   .trim()
  //   .isLength({ min: 10, max: 20 })
  //   .withMessage('Numéro de châssis invalide'),

  // // Équipements (optionnels)
  // body('vehicule.equipements.ceintures')
  //   .optional()
  //   .isIn(['AVANT_UNIQUEMENT', 'AVANT_ARRIERE', 'TOUS_POSTES'])
  //   .withMessage('Configuration ceintures invalide'),
  // body('vehicule.equipements.nombreAirbags')
  //   .optional()
  //   .isInt({ min: 0, max: 10 })
  //   .withMessage('Nombre d\'airbags invalide'),

  // // Commodités (optionnels)
  // body('vehicule.commodites.espaceBagages')
  //   .optional()
  //   .isIn(['PETIT', 'MOYEN', 'GRAND', 'TRES_GRAND'])
  //   .withMessage('Espace bagages invalide'),

  // // Méthode de vérification (optionnelle)
  // body('methodVerification')
  //   .optional()
  //   .isIn(['email', 'whatsapp'])
  //   .withMessage('Méthode de vérification invalide'),

  // // Données utilisateur mises à jour (optionnelles)
  // // body('telephone')
  // //   .optional()
  // //   .matches(/^(\+225)?[0-9]{8,10}$/)
  // //   .withMessage('Numéro de téléphone invalide'),
  // body('email')
  //   .optional()
  //   .isEmail()
  //   .withMessage('Email invalide')
];

// Middleware de gestion des erreurs de validation
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Erreurs de validation',
      errors: errors.array().map(error => ({
        field: error.param,
        message: error.msg,
        value: error.value
      }))
    });
  }
  next();
};

// =============== ROUTES PUBLIQUES - INSCRIPTION ===============

// Inscription avec WhatsApp (nouvelle méthode)
/**
 * @desc    Inscription d'un nouvel utilisateur avec vérification WhatsApp
 * @route   POST /api/auth/register
 * @access  Public
 */
router.post('/register', register);
/**
 * @desc    Vérifier le code WhatsApp
 * @route   POST /api/auth/verify-code
 * @access  Public
 */
router.post('/verify-code', verifyCode);
/**
 * @desc    Renvoyer le code de vérification WhatsApp
 * @route   POST /api/auth/resend-code
 * @access  Public
 */
router.post('/resend-code', resendCode);
/**
 * @route   POST /api/auth/inscription
 * @desc    Inscription d'un nouvel utilisateur avec envoi d'email de confirmation
 * @access  Public
 */
router.post('/inscription', 
  // inscriptionLimiter,
  [
    body('nom').trim().notEmpty().withMessage('Le nom est requis'),
    body('prenom').trim().notEmpty().withMessage('Le prénom est requis'),
    ...validateEmail,
    ...validatePhone,
    ...validatePassword,
    ...validateRole
  ],
  handleValidationErrors,
  inscription
);

/**
 * @route   POST /api/auth/inscription-sms
 * @desc    NOUVEAU - Inscription avec vérification par SMS
 * @access  Public
 */
router.post('/inscription-sms',
  inscriptionLimiter,
  [
    body('nom').trim().notEmpty().withMessage('Le nom est requis'),
    body('prenom').trim().notEmpty().withMessage('Le prénom est requis'),
    ...validatePhone,
    ...validatePassword,
    ...validateRole,
    body('email').optional().isEmail().withMessage('Email invalide')
  ],
  handleValidationErrors,
  inscriptionSMS
);

/**
 * @route   POST /api/auth/inscription-conducteur
 * @desc     Inscription d'un conducteur avec son véhicule
 * @access  Public
 */
router.post('/inscription-conducteur',
  // inscriptionLimiter,
  validateConducteurInscription,
  authMiddleware,
  handleValidationErrors,
  passerConducteur
);

// =============== ROUTES PUBLIQUES - CONNEXION ===============

/**
 * @route   POST /api/auth/connexion
 * @route   POST /api/auth/login (alias)
 * @desc    Connexion utilisateur standard
 * @access  Public
 */
router.post('/connexion', 
  connexionLimiter,
  loginFlexibleValidation,  
  handleValidationErrors,
  connexion
);
router.post('/login', 
  connexionLimiter,
  [
    ...validateEmail,
    body('motDePasse').notEmpty().withMessage('Le mot de passe est requis')
  ],
  handleValidationErrors,
  connexion
);

/**
 * @route   POST /api/auth/admin/connexion
 * @route   POST /api/auth/admin/login (alias)
 * @desc    Connexion administrateur
 * @access  Public
 */
router.post('/admin/connexion', 
  connexionLimiter,
  [
    ...validateEmail,
    body('motDePasse').notEmpty().withMessage('Le mot de passe est requis')
  ],
  handleValidationErrors,
  connexionAdmin
);
router.post('/admin/login', 
  connexionLimiter,
  [
    ...validateEmail,
    body('motDePasse').notEmpty().withMessage('Le mot de passe est requis')
  ],
  handleValidationErrors,
  connexionAdmin
);

// =============== ROUTES PUBLIQUES - CONFIRMATION ===============

/**
 * @route   GET /api/auth/confirm-email/:token
 * @route   GET /api/auth/confirm-email (avec query param ?token=...)
 * @desc    Confirmer l'email de l'utilisateur via un token
 * @access  Public
 */
router.get('/confirm-email/:token', confirmerEmail);
router.get('/confirm-email', confirmerEmail);

/**
 * @route   POST /api/auth/resend-confirmation
 * @desc    Renvoyer l'email de confirmation
 * @access  Public
 */
router.post('/resend-confirmation', 
  smsLimiter,
  validateEmail,
  handleValidationErrors,
  renvoyerConfirmationEmail
);

/**
 * @route   POST /api/auth/verifier-sms
 * @desc    NOUVEAU - Vérifier le code SMS pour activer le compte
 * @access  Public
 */
router.post('/verifier-sms',
  smsLimiter,
  [
    ...validatePhone,
    ...validateSMSCode
  ],
  handleValidationErrors,
  verifierCodeSMS
);

/**
 * @route   POST /api/auth/renvoyer-sms
 * @desc    NOUVEAU - Renvoyer un nouveau code de vérification SMS
 * @access  Public
 */
router.post('/renvoyer-sms',
  smsLimiter,
  validatePhone,
  handleValidationErrors,
  renvoyerCodeSMS
);

// =============== ROUTES PUBLIQUES - MOT DE PASSE OUBLIÉ ===============

/**
 * @route   POST /api/auth/forgot-password
 * @route   POST /api/auth/mot-de-passe-oublie (alias français)
 * @desc    Demande de réinitialisation de mot de passe par EMAIL
 * @access  Public
 */
router.post('/forgot-password', 
  resetLimiter,
  validateEmail,
  handleValidationErrors,
  motDePasseOublie
);
router.post('/mot-de-passe-oublie', 
  resetLimiter,
  validateEmail,
  handleValidationErrors,
  demandeReinitialisationMotDePasse
);
/**
 * @route   POST /api/auth/verify-reset-code
 * @desc    Vérifier le code de réinitialisation (Étape 2)
 * @access  Public
 */
router.post('/verify-reset-code', 
  resetLimiter,
  [
    ...validatePhone,
    ...validateWhatsAppCode
  ],
  handleValidationErrors,
  verifyResetCode
);

/**
 * @route   POST /api/auth/mot-de-passe-oublie-sms
 * @desc    NOUVEAU - Demande de réinitialisation par SMS/OTP
 * @access  Public
 */
router.post('/mot-de-passe-oublie-sms',
  resetLimiter,
  validatePhone,
  handleValidationErrors,
  motDePasseOublieSMS
);

/**
 * @route   POST /api/auth/verifier-code-otp-reset
 * @desc    NOUVEAU - Vérifier le code OTP pour réinitialisation
 * @access  Public
 */
router.post('/verifier-code-otp-reset',
  smsLimiter,
  [
    ...validatePhone,
    ...validateOTPCode
  ],
  handleValidationErrors,
  verifierCodeOTPReset
);

/**
 * @route   GET /api/auth/reset-password/:token
 * @desc    Vérifier la validité du token de réinitialisation
 * @access  Public
 */
router.get('/reset-password/:token', confirmerReinitialisationMotDePasse);

/**
 * @route   POST /api/auth/reset-password/:token
 * @route   PUT /api/auth/reset-password/:token (alias)
 * @desc    Réinitialiser le mot de passe avec le token (EMAIL ou SMS)
 * @access  Public
 */
router.post('/reset-password/:token', 
  validateResetPassword,
  handleValidationErrors,
  reinitialiserMotDePasse
);
router.put('/reset-password/:token', 
  validateResetPassword,
  handleValidationErrors,
  reinitialiserMotDePasse
);
// ============================================================
// ⭐ ROUTES PUBLIQUES - RÉINITIALISATION WHATSAPP (NOUVEAU)
// ============================================================

/**
 * @route   POST /api/auth/forgot-password-whatsapp
 * @desc    Demander réinitialisation via WhatsApp
 * @access  Public
 */
router.post('/forgot-password-whatsapp', 
  whatsappResetLimiter,
  validatePhone,
  handleValidationErrors,
  forgotPassword
);

/**
 * @route   POST /api/auth/reset-password-whatsapp
 * @desc    Réinitialiser avec code WhatsApp
 * @access  Public
 */
router.post('/reset-password-whatsapp', 
  resetLimiter,
  [
    ...validatePhone,
    ...validateWhatsAppCode,
    ...validateNewPassword
  ],
  handleValidationErrors,
  resetPassword
);

/**
 * @route   POST /api/auth/resend-reset-code-whatsapp
 * @desc    Renvoyer code reset WhatsApp
 * @access  Public
 */
router.post('/resend-reset-code-whatsapp', 
  whatsappResetLimiter,
  validatePhone,
  handleValidationErrors,
  resendResetCode
);

// =============== ROUTES PUBLIQUES - REFRESH TOKENS ===============

/**
 * @route   POST /api/auth/refresh-token
 * @desc    Rafraîchir le token d'accès
 * @access  Public (nécessite refresh token)
 */
router.post('/refresh-token',
  refreshLimiter,
  validateRefreshToken,
  handleValidationErrors,
  refreshToken
);

/**
 * @route   POST /api/auth/rotate-token
 * @desc    Rotation du refresh token (plus sécurisé)
 * @access  Public (nécessite refresh token)
 */
router.post('/rotate-token',
  refreshLimiter,
  validateRefreshToken,
  handleValidationErrors,
  roterToken
);

// =============== ROUTES PROTÉGÉES - DÉCONNEXION - SESSION===============

/**
 * @route   POST /api/auth/deconnexion
 * @route   POST /api/auth/logout (alias anglais)
 * @desc    Déconnexion utilisateur
 * @access  Privé - Token requis
 */
router.post('/deconnexion', authMiddleware, deconnexion);
router.post('/logout', authMiddleware, deconnexion);

/**
 * @route   GET /api/auth/sessions
 * @desc    Obtenir les sessions actives
 * @access  Privé
 */
router.get('/sessions', authMiddleware, obtenirSessionsActives);

/**
 * @route   DELETE /api/auth/sessions
 * @desc    Révoquer une session spécifique
 * @access  Privé
 */
router.delete('/sessions',
  authMiddleware,
  validateRefreshToken,
  handleValidationErrors,
  revoquerSession
);

/**
 * @route   POST /api/auth/logout-all
 * @desc    Déconnexion globale (toutes sessions)
 * @access  Privé
 */
router.post('/logout-all', authMiddleware, deconnexionGlobale);

// =============== ROUTES PROTÉGÉES - VÉRIFICATION ET PROFIL ===============

/**
 * @route   GET /api/auth/verify
 * @desc    Vérifier la validité du token d'authentification
 * @access  Privé - Token requis
 */
router.get('/verify', authMiddleware, verifierToken);

/**
 * @route   GET /api/auth/me
 * @route   GET /api/auth/profil (alias français)
 * @route   GET /api/auth/user (alias)
 * @desc    Obtenir les informations de l'utilisateur connecté
 * @access  Privé - Token requis
 */
router.get('/me', authMiddleware, obtenirUtilisateurConnecte);
router.get('/profil', authMiddleware, obtenirUtilisateurConnecte);
router.get('/user', authMiddleware, obtenirUtilisateurConnecte);

// =============== ROUTES PROTÉGÉES - COMPTE COVOITURAGE ===============

/**
 * @route   GET /api/auth/compte-covoiturage
 * @desc    NOUVEAU - Obtenir le résumé du compte covoiturage
 * @access  Privé - Token requis
 */
router.get('/compte-covoiturage', authMiddleware, obtenirResumeCompteCovoiturage);

/**
 * @route   GET /api/auth/historique-recharges
 * @desc    NOUVEAU - Obtenir l'historique des recharges
 * @access  Privé - Token requis
 */
router.get('/historique-recharges', authMiddleware, obtenirHistoriqueRecharges);

/**
 * @route   GET /api/auth/historique-commissions
 * @desc    NOUVEAU - Obtenir l'historique des commissions
 * @access  Privé - Token requis
 */
router.get('/historique-commissions', authMiddleware, obtenirHistoriqueCommissions);

/**
 * @route   GET /api/auth/peut-accepter-course
 * @desc    NOUVEAU - Vérifier si le conducteur peut accepter une course
 * @access  Privé - Token requis
 */
router.get('/peut-accepter-course', authMiddleware, verifierCapaciteAcceptationCourse);

// =============== ROUTES PROTÉGÉES - RECHARGES ===============

/**
 * @route   POST /api/auth/recharge
 * @desc    Demander une recharge de compte
 * @access  Privé (conducteurs uniquement)
 */
router.post('/recharge',
  authMiddleware,
  validateRecharge,
  handleValidationErrors,
  demanderRecharge
);

/**
 * @route   PUT /api/auth/recharge/:referenceTransaction/confirm
 * @desc    Confirmer une recharge (webhook/admin)
 * @access  Privé/Admin
 */
router.put('/recharge/:referenceTransaction/confirm',
  authMiddleware,
  body('userId').notEmpty().withMessage('ID utilisateur requis'),
  body('statut').optional().isIn(['reussi', 'echoue']).withMessage('Statut invalide'),
  handleValidationErrors,
  confirmerRecharge
);

/**
 * @route   POST /api/auth/auto-recharge/configure
 * @desc    Configurer la recharge automatique
 * @access  Privé
 */
router.post('/auto-recharge/configure',
  authMiddleware,
  [
    body('seuilAutoRecharge').isNumeric().withMessage('Seuil invalide'),
    body('montantAutoRecharge').isNumeric().withMessage('Montant invalide'),
    body('methodePaiementAuto').notEmpty().withMessage('Méthode requise')
  ],
  handleValidationErrors,
  configurerAutoRecharge
);

/**
 * @route   POST /api/auth/auto-recharge/desactiver
 * @desc    Désactiver la recharge automatique
 * @access  Privé
 */
router.post('/auto-recharge/desactiver', authMiddleware, desactiverAutoRecharge);

/**
 * @route   POST /api/auth/retrait/configure
 * @desc    Configurer les paramètres de retrait
 * @access  Privé
 */
router.post('/retrait/configure',
  authMiddleware,
  [
    body('numeroMobile').notEmpty().withMessage('Numéro mobile requis'),
    body('operateur').notEmpty().withMessage('Opérateur requis'),
    body('nomTitulaire').notEmpty().withMessage('Nom titulaire requis')
  ],
  handleValidationErrors,
  configurerRetraitGains
);

// =============== ROUTES DE MONITORING ET DIAGNOSTICS ===============

/**
 * @route   GET /api/auth/health
 * @desc    Vérifier l'état de santé du service d'authentification
 * @access  Public
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Service d\'authentification opérationnel',
    timestamp: new Date().toISOString(),
    version: '2.3.0',
    features: {
      emailConfirmation: true,
      smsConfirmation: true,
      whatsappConfirmation: true,
      passwordReset: true,
      smsPasswordReset: true,
      whatsappPasswordReset: true, 
      adminAccess: true,
      compteCovoiturage: true ,
      recharges: true,
      commissions: true,
      autoRecharge: true,
      inscriptionConducteur: true
    },
    routes: {
      publiques: [
        'POST /register (WhatsApp)',                    
        'POST /verify-code (WhatsApp)',                 
        'POST /resend-code (WhatsApp)',
        'POST /inscription',
        'POST /inscription-sms',
        'POST /inscription-conducteur',
        'POST /connexion | /login',
        'POST /admin/connexion | /admin/login',
        'POST /forgot-password | /mot-de-passe-oublie',
        'POST /forgot-password-whatsapp (WhatsApp)',    
        'POST /reset-password-whatsapp (WhatsApp)',     
        'POST /resend-reset-code-whatsapp (WhatsApp)',
        'POST /mot-de-passe-oublie-sms',
        'POST /verifier-code-otp-reset',
        'GET /reset-password/:token',
        'POST /reset-password/:token',
        'GET /confirm-email/:token | /confirm-email',
        'POST /resend-confirmation',
        'POST /verifier-sms',
        'POST /renvoyer-sms'
      ],
      protegees: [
        'POST /deconnexion | /logout',
        'GET /verify',
        'GET /me | /profil | /user',
        'GET /compte-covoiturage',
        'GET /historique-recharges',
        'GET /historique-commissions',
        'GET /peut-accepter-course'
      ],
      monitoring: [
        'GET /health',
        'GET /test',
        'GET /status'
      ]
    }
  });
});

/**
 * @route   GET /api/auth/test
 * @desc    Route de test simple pour vérifier la connectivité
 * @access  Public
 */
router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'Route d\'authentification accessible',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

/**
 * @route   GET /api/auth/status
 * @desc    Statut détaillé du système d'authentification
 * @access  Public
 */
router.get('/status', (req, res) => {
  const requiredEnvVars = [
    'JWT_SECRET',
    'EMAIL_HOST',
    'EMAIL_PORT',
    'EMAIL_USER',
    'EMAIL_PASS',
    'TWILIO_ACCOUNT_SID',
    'TWILIO_AUTH_TOKEN',
    'TWILIO_PHONE_NUMBER',
    'SMS_PROVIDER',
    'GREEN_API_INSTANCE_ID',  
    'GREEN_API_TOKEN'   
  ];
  
  const envStatus = requiredEnvVars.reduce((acc, varName) => {
    acc[varName] = process.env[varName] ? 'Configuré' : 'Manquant';
    return acc;
  }, {});
  
  res.json({
    success: true,
    message: 'Statut du système d\'authentification',
    timestamp: new Date().toISOString(),
    configuration: {
      environment: process.env.NODE_ENV || 'development',
      frontendUrl: process.env.FRONTEND_URL || 'Non configuré',
      baseUrl: process.env.BASE_URL || 'Non configuré',
      variables: envStatus
    },
    services: {
      database: 'Opérationnel',
      email: process.env.EMAIL_HOST ? 'Configuré' : 'Non configuré',
      sms: process.env.TWILIO_ACCOUNT_SID ? 'Configuré' : 'Non configuré',
      whatsapp: process.env.GREEN_API_INSTANCE_ID ? 'Configuré' : 'Non configuré',  
      jwt: process.env.JWT_SECRET ? 'Configuré' : 'Non configuré'
    },
    features: {
      compteCovoiturage: true,
      rechargeCompte: true,
      commissions: true,
      autoRecharge: true,
      whatsappVerification: true,      
      whatsappPasswordReset: true,
      inscriptionConducteur: true       
    }
  });
});

// =============== GESTION CENTRALISÉE DES ERREURS ===============

/**
 * Middleware d'erreurs spécifique au router d'authentification
 * Gère les erreurs selon le format AppError unifié
 */
router.use((error, req, res, next) => {
  // Log détaillé de l'erreur pour le debugging
  console.error('Erreur dans le router auth:', {
    message: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    timestamp: new Date().toISOString(),
    userAgent: req.get('User-Agent'),
    ip: req.ip
  });

  // Gestion des erreurs AppError ou erreurs avec structure similaire
  if (error instanceof AppError || (error && typeof error.status === 'number' && typeof error.code === 'string')) {
    return res.status(error.status).json({
      success: false,
      code: error.code,
      message: error.message,
      ...(error.context ? { context: error.context } : {}),
      timestamp: new Date().toISOString()
    });
  }

  // Gestion spécifique des erreurs JWT
  if (error.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      code: 'INVALID_TOKEN',
      message: 'Token invalide',
      timestamp: new Date().toISOString()
    });
  }

  if (error.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      code: 'TOKEN_EXPIRED',
      message: 'Token expiré',
      timestamp: new Date().toISOString()
    });
  }

  // Gestion des erreurs Twilio/SMS
  if (error.code && (error.code.toString().startsWith('21') || error.code.toString().startsWith('20'))) {
    return res.status(500).json({
      success: false,
      code: 'SMS_ERROR',
      message: 'Erreur lors de l\'envoi du SMS',
      timestamp: new Date().toISOString()
    });
  }

  // Gestion des erreurs de validation Mongoose
  if (error.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      code: 'VALIDATION_ERROR',
      message: 'Erreur de validation des données',
      errors: Object.values(error.errors).map(err => err.message),
      timestamp: new Date().toISOString()
    });
  }

  // Gestion des erreurs de duplication MongoDB
  if (error.code === 11000) {
    return res.status(409).json({
      success: false,
      code: 'DUPLICATE_ERROR',
      message: 'Données déjà existantes',
      timestamp: new Date().toISOString()
    });
  }

  // Gestion des erreurs de parsing JSON Express
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({
      success: false,
      code: 'INVALID_JSON',
      message: 'Format JSON invalide',
      timestamp: new Date().toISOString()
    });
  }

  // Gestion des erreurs de taille de payload
  if (error.type === 'entity.too.large') {
    return res.status(413).json({
      success: false,
      code: 'PAYLOAD_TOO_LARGE',
      message: 'Données trop volumineuses',
      timestamp: new Date().toISOString()
    });
  }

  // Pour toutes les autres erreurs, les propager au handler global
  return next(error);
});

// =============== EXPORT DU ROUTER ===============

module.exports = router;