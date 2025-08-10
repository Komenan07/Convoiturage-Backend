const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { body, param } = require('express-validator');
const rateLimit = require('express-rate-limit');

// Importation des contrôleurs
const authController = require('../controllers/authController');
const {
  inscription,
  connexion,
  motDePasseOublie,
  reinitialiserMotDePasse,
  obtenirUtilisateurConnecte,
  deconnexion,
  verifierToken,
  rafraichirToken
} = require('../controllers/authController');

// Importation des middlewares
const authMiddleware = require('../middleware/authMiddleware');
const { protect } = require('../middleware/authMiddleware');
const { validateRequest } = require('../utils/validation');

// Importation des constantes
const { STATUTS } = require('../utils/constants');

const router = express.Router();

// ==========================================
// CONFIGURATION DES UPLOADS DE FICHIERS
// ==========================================

// Création des dossiers d'upload s'ils n'existent pas
const createUploadDirs = () => {
  const dirs = ['uploads/photos', 'uploads/documents'];
  dirs.forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
};
createUploadDirs();

// Configuration de Multer pour l'upload de fichiers
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    if (file.fieldname === 'photoProfil') {
      cb(null, 'uploads/photos/');
    } else if (file.fieldname === 'documentIdentite') {
      cb(null, 'uploads/documents/');
    } else {
      cb(new Error('Champ de fichier non reconnu'), null);
    }
  },
  filename: function(req, file, cb) {
    // Format: timestamp_userId_originalname
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname);
    const basename = path.basename(file.originalname, extension);
    
    if (file.fieldname === 'photoProfil') {
      cb(null, `profil_${uniqueSuffix}_${basename}${extension}`);
    } else if (file.fieldname === 'documentIdentite') {
      cb(null, `document_${uniqueSuffix}_${basename}${extension}`);
    }
  }
});

// Filtres pour les types de fichiers
const fileFilter = (req, file, cb) => {
  if (file.fieldname === 'photoProfil') {
    // Images pour photo de profil
    if (file.mimetype.startsWith('image/')) {
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
      if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('Format d\'image non supporté. Utilisez JPEG, PNG ou WebP'), false);
      }
    } else {
      cb(new Error('Le fichier doit être une image'), false);
    }
  } else if (file.fieldname === 'documentIdentite') {
    // Images ou PDF pour documents d'identité
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Format de document non supporté. Utilisez JPEG, PNG ou PDF'), false);
    }
  } else {
    cb(new Error('Champ de fichier non reconnu'), false);
  }
};

// Configuration de l'upload
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max
    files: 2 // Maximum 2 fichiers (photo + document)
  }
});

// Configuration des champs d'upload
const uploadFields = upload.fields([
  { name: 'photoProfil', maxCount: 1 },
  { name: 'documentIdentite', maxCount: 1 }
]);

// Middleware de gestion d'erreurs d'upload
const handleUploadError = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'Fichier trop volumineux. Taille maximale: 5MB'
      });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        message: 'Trop de fichiers. Maximum 2 fichiers autorisés'
      });
    }
  }
  
  if (error.message.includes('Format')) {
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }
  
  next(error);
};

// ==========================================
// CONFIGURATION RATE LIMITING
// ==========================================

// Rate limiting pour les routes sensibles
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 tentatives par IP
  message: {
    success: false,
    message: 'Trop de tentatives de connexion. Réessayez dans 15 minutes.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const resetPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 heure
  max: 3, // 3 demandes de réinitialisation par heure
  message: {
    success: false,
    message: 'Trop de demandes de réinitialisation. Réessayez dans 1 heure.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 heure
  max: 10, // 10 inscriptions par IP par heure
  message: {
    success: false,
    message: 'Trop d\'inscriptions depuis cette adresse IP. Réessayez dans 1 heure.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// ==========================================
// VALIDATEURS
// ==========================================

// Validateurs pour l'inscription
const inscriptionValidators = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Format d\'email invalide'),
  
  body('telephone')
    .isMobilePhone(['fr-CI', 'fr-FR'])
    .withMessage('Numéro de téléphone invalide')
    .custom((value) => {
      // Validation spécifique pour les numéros ivoiriens
      const ivoirianPattern = /^(\+225|225)?[0-9]{8,10}$/;
      if (!ivoirianPattern.test(value.replace(/\s/g, ''))) {
        throw new Error('Format de numéro ivoirien invalide');
      }
      return true;
    }),
  
  body('motDePasse')
    .isLength({ min: 8 })
    .withMessage('Le mot de passe doit contenir au moins 8 caractères')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Le mot de passe doit contenir au moins une minuscule, une majuscule et un chiffre'),
  
  body('confirmationMotDePasse')
    .notEmpty()
    .withMessage('La confirmation du mot de passe est requise'),
  
  body('nom')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Le nom doit contenir entre 2 et 50 caractères')
    .matches(/^[a-zA-ZÀ-ÿ\s\-']+$/)
    .withMessage('Le nom ne doit contenir que des lettres'),
  
  body('prenom')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Le prénom doit contenir entre 2 et 50 caractères')
    .matches(/^[a-zA-ZÀ-ÿ\s\-']+$/)
    .withMessage('Le prénom ne doit contenir que des lettres'),
  
  body('dateNaissance')
    .isISO8601()
    .withMessage('Format de date invalide')
    .custom((value) => {
      const birthDate = new Date(value);
      const age = (Date.now() - birthDate.getTime()) / (1000 * 60 * 60 * 24 * 365);
      if (age < 18 || age > 100) {
        throw new Error('L\'âge doit être compris entre 18 et 100 ans');
      }
      return true;
    }),
  
  body('sexe')
    .isIn(['M', 'F'])
    .withMessage('Le sexe doit être M ou F'),
  
  body('adresse.commune')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('La commune est requise'),
  
  body('adresse.quartier')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Le quartier est requis'),
  
  body('adresse.ville')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('La ville est requise'),
  
  body('adresse.latitude')
    .optional()
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude invalide'),
  
  body('adresse.longitude')
    .optional()
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude invalide'),
  
  body('typeDocument')
    .optional()
    .isIn(['CNI', 'PASSEPORT'])
    .withMessage('Type de document invalide'),
  
  body('numeroDocument')
    .optional()
    .isLength({ min: 5, max: 20 })
    .withMessage('Numéro de document invalide'),
  
  body('preferences.conversation')
    .optional()
    .isIn(['BAVARD', 'CALME', 'NEUTRE'])
    .withMessage('Préférence de conversation invalide'),
  
  body('preferences.languePreferee')
    .optional()
    .isIn(['FR', 'ANG'])
    .withMessage('Langue préférée invalide'),
  
  body('preferences.musique')
    .optional()
    .isBoolean()
    .withMessage('La préférence musique doit être un booléen'),
  
  body('preferences.climatisation')
    .optional()
    .isBoolean()
    .withMessage('La préférence climatisation doit être un booléen'),
  
  body('contactsUrgence')
    .optional()
    .isArray({ max: 3 })
    .withMessage('Maximum 3 contacts d\'urgence'),
  
  body('contactsUrgence.*.nom')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Nom du contact d\'urgence requis'),
  
  body('contactsUrgence.*.telephone')
    .optional()
    .isMobilePhone(['fr-CI', 'fr-FR'])
    .withMessage('Téléphone du contact d\'urgence invalide'),
  
  body('contactsUrgence.*.relation')
    .optional()
    .isIn(['FAMILLE', 'AMI', 'COLLEGUE'])
    .withMessage('Relation du contact d\'urgence invalide'),
  
  validateRequest
];

// Validateurs pour la connexion
const connexionValidators = [
  body('identifiant')
    .trim()
    .notEmpty()
    .withMessage('Email ou téléphone requis')
    .custom((value) => {
      const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
      const isPhone = /^(\+225|225)?[0-9]{8,10}$/.test(value.replace(/\s/g, ''));
      if (!isEmail && !isPhone) {
        throw new Error('Format d\'email ou de téléphone invalide');
      }
      return true;
    }),
  
  body('motDePasse')
    .notEmpty()
    .withMessage('Mot de passe requis'),
  
  validateRequest
];

// Validateurs alternatifs pour connexion avec email uniquement
const validateConnexion = [
  body('email')
    .isEmail()
    .withMessage('Email invalide')
    .normalizeEmail(),
  body('motDePasse')
    .notEmpty()
    .withMessage('Le mot de passe est requis'),
  validateRequest
];

// Validateurs pour la connexion admin
const connexionAdminValidators = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Format d\'email invalide'),
  
  body('motDePasse')
    .notEmpty()
    .withMessage('Mot de passe requis')
];

// Validateurs pour la réinitialisation de mot de passe
const resetPasswordValidators = [
  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Format d\'email invalide')
];

const validateMotDePasseOublie = [
  body('email')
    .isEmail()
    .withMessage('Email invalide')
    .normalizeEmail(),
  validateRequest
];

const confirmResetValidators = [
  body('token')
    .notEmpty()
    .withMessage('Token de réinitialisation requis'),
  
  body('nouveauMotDePasse')
    .isLength({ min: 8 })
    .withMessage('Le nouveau mot de passe doit contenir au moins 8 caractères')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Le nouveau mot de passe doit contenir au moins une minuscule, une majuscule et un chiffre')
];

const validateReinitialiserMotDePasse = [
  param('resetToken')
    .isLength({ min: 1 })
    .withMessage('Token de réinitialisation requis'),
  body('nouveauMotDePasse')
    .isLength({ min: 8 })
    .withMessage('Le nouveau mot de passe doit contenir au moins 8 caractères')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Le nouveau mot de passe doit contenir au moins une majuscule, une minuscule et un chiffre'),
  body('confirmationMotDePasse')
    .notEmpty()
    .withMessage('La confirmation du mot de passe est requise'),
  validateRequest
];

// ==========================================
// ROUTES PUBLIQUES
// ==========================================

/**
 * @route   POST /api/auth/inscription
 * @desc    Inscription d'un nouvel utilisateur
 * @access  Public
 */
router.post('/inscription', 
  registrationLimiter,
  uploadFields,
  handleUploadError,
  inscriptionValidators,
  authController.inscription
);

/**
 * @route   POST /api/auth/connexion
 * @desc    Connexion utilisateur
 * @access  Public
 */
router.post('/connexion',
  authLimiter,
  connexionValidators,
  authController.connexion
);

/**
 * @route   POST /api/auth/admin/connexion
 * @desc    Connexion administrateur
 * @access  Public
 */
router.post('/admin/connexion',
  authLimiter,
  connexionAdminValidators,
  authController.connexionAdmin
);

/**
 * @route   POST /api/auth/mot-de-passe/reinitialiser
 * @desc    Demande de réinitialisation de mot de passe
 * @access  Public
 */
router.post('/mot-de-passe/reinitialiser',
  resetPasswordLimiter,
  resetPasswordValidators,
  authController.demandeReinitialisationMotDePasse
);

/**
 * @route   POST /api/auth/mot-de-passe-oublie
 * @desc    Mot de passe oublié
 * @access  Public
 */
router.post('/mot-de-passe-oublie',
  resetPasswordLimiter,  // Correction : utilisation du bon rate limiter
  validateMotDePasseOublie,
  motDePasseOublie
);

/**
 * @route   POST /api/auth/mot-de-passe/confirmer
 * @desc    Confirmation de la réinitialisation de mot de passe
 * @access  Public
 */
router.post('/mot-de-passe/confirmer',
  authLimiter,
  confirmResetValidators,
  authController.confirmerReinitialisationMotDePasse
);

/**
 * @route   PUT /api/auth/reinitialiser-mot-de-passe/:resetToken
 * @desc    Réinitialiser le mot de passe
 * @access  Public
 */
router.put('/reinitialiser-mot-de-passe/:resetToken',
  validateReinitialiserMotDePasse,
  reinitialiserMotDePasse
);

// ==========================================
// ROUTES PROTÉGÉES
// ==========================================

/**
 * @route   GET /api/auth/verifier
 * @desc    Vérification et rafraîchissement du token
 * @access  Private
 */
router.get('/verifier',
  authController.verifierToken
);

/**
 * @route   GET /api/auth/verifier-token
 * @desc    Vérifier la validité du token
 * @access  Private
 */
router.get('/verifier-token',
  protect,
  verifierToken
);

/**
 * @route   GET /api/auth/moi
 * @desc    Obtenir l'utilisateur connecté
 * @access  Private
 */
router.get('/moi',
  protect,
  obtenirUtilisateurConnecte
);

/**
 * @route   POST /api/auth/deconnexion
 * @desc    Déconnexion utilisateur
 * @access  Private
 */
router.post('/deconnexion',
  authMiddleware,
  deconnexion
);

/**
 * @route   POST /api/auth/rafraichir-token
 * @desc    Rafraîchir le token JWT
 * @access  Private
 */
router.post('/rafraichir-token',
  protect,
  rafraichirToken
);

// ==========================================
// ROUTES UTILITAIRES
// ==========================================

/**
 * @route   GET /api/auth/test
 * @desc    Route de test pour vérifier que l'API fonctionne
 * @access  Public
 */
router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'API d\'authentification fonctionnelle',
    timestamp: new Date().toISOString(),
    endpoints: {
      inscription: 'POST /api/auth/inscription',
      connexion: 'POST /api/auth/connexion',
      connexionAdmin: 'POST /api/auth/admin/connexion',
      verifier: 'GET /api/auth/verifier',
      deconnexion: 'POST /api/auth/deconnexion',
      resetPassword: 'POST /api/auth/mot-de-passe/reinitialiser',
      confirmReset: 'POST /api/auth/mot-de-passe/confirmer'
    }
  });
});

/**
 * @route   GET /api/auth/uploads/:type/:filename
 * @desc    Servir les fichiers statiques (photos de profil et documents)
 * @access  Public
 */
router.get('/uploads/:type/:filename', (req, res) => {
  const { type, filename } = req.params;
  
  // Validation du type de fichier
  if (!['photos', 'documents'].includes(type)) {
    return res.status(404).json({
      success: false,
      message: 'Type de fichier non supporté'
    });
  }
  
  const filePath = path.join(__dirname, `../uploads/${type}/${filename}`);
  
  // Vérification de l'existence du fichier
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({
      success: false,
      message: 'Fichier non trouvé'
    });
  }
  
  // Headers de sécurité pour les fichiers
  res.setHeader('Content-Security-Policy', "default-src 'none'");
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  res.sendFile(filePath);
});

module.exports = router;