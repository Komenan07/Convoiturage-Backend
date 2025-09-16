// routes/utilisateurRoute.js
const express = require('express');
const router = express.Router();
const { body, param, query, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');

// =============== IMPORTS CONTRÔLEURS ===============
const {
  mettreAJourProfil,
  uploadPhotoProfil,
  uploadDocumentIdentite,
  changerMotDePasse,
  mettreAJourVehicule,
  mettreAJourCoordonnees,
  changerRole,
  rechercherUtilisateurs,
  obtenirTousLesUtilisateurs,
  supprimerCompte,
  obtenirStatistiques,
  obtenirStatistiquesGlobales,
  mettreAJourPreferences,
  ajouterContactUrgence,
  supprimerContactUrgence,
  configurerParametresRetrait,
  configurerAutoRecharge,
  desactiverAutoRecharge,
  obtenirDashboard
} = require('../../controllers/auth/utilisateurController');

// =============== IMPORTS MIDDLEWARES ===============
const {
  authMiddleware,
  adminMiddleware,
  conducteurMiddleware
} = require('../../middlewares/auth/authMiddleware');

// =============== RATE LIMITING ===============

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 uploads max par IP
  message: {
    success: false,
    message: 'Trop d\'uploads. Réessayez dans 15 minutes.'
  }
});

const searchLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // 30 recherches max par minute
  message: {
    success: false,
    message: 'Trop de recherches. Réessayez dans 1 minute.'
  }
});

const updateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 20, // 20 mises à jour max par 5 minutes
  message: {
    success: false,
    message: 'Trop de mises à jour. Réessayez dans 5 minutes.'
  }
});

const deleteLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 heure
  max: 3, // 3 tentatives de suppression max par heure
  message: {
    success: false,
    message: 'Trop de tentatives de suppression. Réessayez dans 1 heure.'
  }
});

// =============== VALIDATIONS ===============

const validateUpdateProfile = [
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
  body('dateNaissance')
    .optional()
    .isDate()
    .withMessage('Date de naissance invalide'),
  body('sexe')
    .optional()
    .isIn(['M', 'F'])
    .withMessage('Le sexe doit être M ou F'),
  body('adresse.commune')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Le nom de la commune ne peut dépasser 100 caractères'),
  body('adresse.quartier')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Le nom du quartier ne peut dépasser 100 caractères'),
  body('adresse.ville')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Le nom de la ville ne peut dépasser 100 caractères')
];

const validateChangePassword = [
  body('motDePasseActuel')
    .notEmpty()
    .withMessage('Le mot de passe actuel est requis'),
  body('nouveauMotDePasse')
    .isLength({ min: 8 })
    .withMessage('Le nouveau mot de passe doit contenir au moins 8 caractères')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Le nouveau mot de passe doit contenir au moins une majuscule, une minuscule et un chiffre')
];

const validateVehicle = [
  body('marque')
    .optional()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('La marque doit contenir entre 1 et 50 caractères'),
  body('modele')
    .optional()
    .trim()
    .isLength({ min: 1, max: 50 })
    .withMessage('Le modèle doit contenir entre 1 et 50 caractères'),
  body('couleur')
    .optional()
    .trim()
    .isLength({ min: 1, max: 30 })
    .withMessage('La couleur doit contenir entre 1 et 30 caractères'),
  body('immatriculation')
    .optional()
    .trim()
    .isLength({ min: 1, max: 20 })
    .withMessage('L\'immatriculation doit contenir entre 1 et 20 caractères'),
  body('nombrePlaces')
    .optional()
    .isInt({ min: 1, max: 8 })
    .withMessage('Le nombre de places doit être entre 1 et 8')
];

const validateCoordinates = [
  body('longitude')
    .isFloat({ min: -180, max: 180 })
    .withMessage('La longitude doit être entre -180 et 180'),
  body('latitude')
    .isFloat({ min: -90, max: 90 })
    .withMessage('La latitude doit être entre -90 et 90'),
  body('commune')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Le nom de la commune ne peut dépasser 100 caractères'),
  body('quartier')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Le nom du quartier ne peut dépasser 100 caractères'),
  body('ville')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Le nom de la ville ne peut dépasser 100 caractères')
];

const validateRole = [
  body('nouveauRole')
    .isIn(['passager', 'conducteur', 'les_deux'])
    .withMessage('Rôle invalide. Doit être: passager, conducteur ou les_deux')
];

const validateEmergencyContact = [
  body('nom')
    .trim()
    .notEmpty()
    .isLength({ min: 1, max: 50 })
    .withMessage('Le nom du contact est requis et doit contenir entre 1 et 50 caractères'),
  body('telephone')
    .trim()
    .matches(/^(\+225)?[0-9]{8,10}$/)
    .withMessage('Numéro de téléphone invalide'),
  body('relation')
    .isIn(['FAMILLE', 'AMI', 'COLLEGUE'])
    .withMessage('Relation invalide. Doit être: FAMILLE, AMI ou COLLEGUE')
];

const validateWithdrawalSettings = [
  body('numeroMobile')
    .trim()
    .matches(/^(\+225)?[0-9]{8,10}$/)
    .withMessage('Numéro de mobile invalide'),
  body('operateur')
    .isIn(['ORANGE', 'MTN', 'MOOV'])
    .withMessage('Opérateur invalide. Doit être: ORANGE, MTN ou MOOV'),
  body('nomTitulaire')
    .trim()
    .notEmpty()
    .isLength({ min: 1, max: 100 })
    .withMessage('Nom du titulaire requis (max 100 caractères)')
];

const validateAutoRecharge = [
  body('seuilAutoRecharge')
    .isFloat({ min: 0 })
    .withMessage('Le seuil doit être positif'),
  body('montantAutoRecharge')
    .isFloat({ min: 1000 })
    .withMessage('Le montant minimum est 1000 FCFA'),
  body('methodePaiementAuto')
    .isIn(['wave', 'orange_money', 'mtn_money', 'moov_money'])
    .withMessage('Méthode de paiement invalide')
];

const validateDocumentUpload = [
  body('type')
    .isIn(['CNI', 'PASSEPORT'])
    .withMessage('Type de document invalide. Utilisez CNI ou PASSEPORT'),
  body('numero')
    .trim()
    .notEmpty()
    .withMessage('Numéro de document requis')
];

const validateDeleteAccount = [
  body('motDePasse')
    .notEmpty()
    .withMessage('Mot de passe requis'),
  body('confirmation')
    .equals('SUPPRIMER_MON_COMPTE')
    .withMessage('Confirmation invalide. Tapez exactement: SUPPRIMER_MON_COMPTE')
];

const validateSearch = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Le numéro de page doit être un entier positif'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('La limite doit être entre 1 et 100'),
  query('role')
    .optional()
    .isIn(['passager', 'conducteur', 'les_deux', 'admin'])
    .withMessage('Rôle invalide'),
  query('statutCompte')
    .optional()
    .isIn(['ACTIF', 'SUSPENDU', 'BLOQUE', 'EN_ATTENTE_VERIFICATION'])
    .withMessage('Statut de compte invalide'),
  query('longitude')
    .optional()
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude invalide'),
  query('latitude')
    .optional()
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude invalide'),
  query('rayonKm')
    .optional()
    .isFloat({ min: 0.1, max: 100 })
    .withMessage('Le rayon doit être entre 0.1 et 100 km')
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

// =============== ROUTES PROTÉGÉES - GESTION PROFIL ===============

/**
 * @route   PUT /api/users/profil
 * @desc    Mettre à jour le profil utilisateur
 * @access  Privé - Token requis
 */
router.put('/profil',
  authMiddleware,
  updateLimiter,
  validateUpdateProfile,
  handleValidationErrors,
  mettreAJourProfil
);

/**
 * @route   POST /api/users/upload-photo
 * @desc    Upload photo de profil
 * @access  Privé - Token requis
 */
router.post('/upload-photo',
  authMiddleware,
  uploadLimiter,
  uploadPhotoProfil
);

/**
 * @route   POST /api/users/upload-document
 * @desc    Upload document d'identité
 * @access  Privé - Token requis
 */
router.post('/upload-document',
  authMiddleware,
  uploadLimiter,
  validateDocumentUpload,
  handleValidationErrors,
  uploadDocumentIdentite
);

/**
 * @route   PUT /api/users/mot-de-passe
 * @desc    Changer le mot de passe
 * @access  Privé - Token requis
 */
router.put('/mot-de-passe',
  authMiddleware,
  updateLimiter,
  validateChangePassword,
  handleValidationErrors,
  changerMotDePasse
);

/**
 * @route   PUT /api/users/coordonnees
 * @desc    Mettre à jour les coordonnées géographiques
 * @access  Privé - Token requis
 */
router.put('/coordonnees',
  authMiddleware,
  updateLimiter,
  validateCoordinates,
  handleValidationErrors,
  mettreAJourCoordonnees
);

/**
 * @route   PUT /api/users/role
 * @desc    Changer le rôle utilisateur
 * @access  Privé - Token requis
 */
router.put('/role',
  authMiddleware,
  updateLimiter,
  validateRole,
  handleValidationErrors,
  changerRole
);

/**
 * @route   GET /api/users/dashboard
 * @desc    Obtenir le dashboard utilisateur
 * @access  Privé - Token requis
 */
router.get('/dashboard',
  authMiddleware,
  obtenirDashboard
);

/**
 * @route   GET /api/users/statistiques
 * @desc    Obtenir les statistiques personnelles
 * @access  Privé - Token requis
 */
router.get('/statistiques',
  authMiddleware,
  obtenirStatistiques
);

/**
 * @route   DELETE /api/users/compte
 * @desc    Supprimer le compte utilisateur
 * @access  Privé - Token requis
 */
router.delete('/compte',
  authMiddleware,
  deleteLimiter,
  validateDeleteAccount,
  handleValidationErrors,
  supprimerCompte
);

// =============== ROUTES PROTÉGÉES - VÉHICULE (CONDUCTEURS) ===============

/**
 * @route   PUT /api/users/vehicule
 * @desc    Mettre à jour les informations du véhicule
 * @access  Privé - Conducteurs seulement
 */
router.put('/vehicule',
  authMiddleware,
  conducteurMiddleware,
  updateLimiter,
  validateVehicle,
  handleValidationErrors,
  mettreAJourVehicule
);

// =============== ROUTES PROTÉGÉES - PRÉFÉRENCES ===============

/**
 * @route   PUT /api/users/preferences
 * @desc    Mettre à jour les préférences utilisateur
 * @access  Privé - Token requis
 */
router.put('/preferences',
  authMiddleware,
  updateLimiter,
  [
    body('preferences.musique')
      .optional()
      .isBoolean()
      .withMessage('La préférence musique doit être un booléen'),
    body('preferences.climatisation')
      .optional()
      .isBoolean()
      .withMessage('La préférence climatisation doit être un booléen'),
    body('preferences.conversation')
      .optional()
      .isIn(['BAVARD', 'CALME', 'NEUTRE'])
      .withMessage('Préférence de conversation invalide'),
    body('preferences.languePreferee')
      .optional()
      .isIn(['FR', 'ANG'])
      .withMessage('Langue préférée invalide')
  ],
  handleValidationErrors,
  mettreAJourPreferences
);

// =============== ROUTES PROTÉGÉES - CONTACTS D'URGENCE ===============

/**
 * @route   POST /api/users/contacts-urgence
 * @desc    Ajouter un contact d'urgence
 * @access  Privé - Token requis
 */
router.post('/contacts-urgence',
  authMiddleware,
  updateLimiter,
  validateEmergencyContact,
  handleValidationErrors,
  ajouterContactUrgence
);

/**
 * @route   DELETE /api/users/contacts-urgence/:contactId
 * @desc    Supprimer un contact d'urgence
 * @access  Privé - Token requis
 */
router.delete('/contacts-urgence/:contactId',
  authMiddleware,
  updateLimiter,
  [
    param('contactId')
      .isMongoId()
      .withMessage('ID de contact invalide')
  ],
  handleValidationErrors,
  supprimerContactUrgence
);

// =============== ROUTES PROTÉGÉES - COMPTE COVOITURAGE ===============

/**
 * @route   PUT /api/users/parametres-retrait
 * @desc    Configurer les paramètres de retrait des gains
 * @access  Privé - Conducteurs seulement
 */
router.put('/parametres-retrait',
  authMiddleware,
  conducteurMiddleware,
  updateLimiter,
  validateWithdrawalSettings,
  handleValidationErrors,
  configurerParametresRetrait
);

/**
 * @route   PUT /api/users/auto-recharge
 * @desc    Configurer la recharge automatique
 * @access  Privé - Conducteurs seulement
 */
router.put('/auto-recharge',
  authMiddleware,
  conducteurMiddleware,
  updateLimiter,
  validateAutoRecharge,
  handleValidationErrors,
  configurerAutoRecharge
);

/**
 * @route   DELETE /api/users/auto-recharge
 * @desc    Désactiver la recharge automatique
 * @access  Privé - Conducteurs seulement
 */
router.delete('/auto-recharge',
  authMiddleware,
  conducteurMiddleware,
  updateLimiter,
  desactiverAutoRecharge
);

// =============== ROUTES PROTÉGÉES - RECHERCHE ===============

/**
 * @route   GET /api/users/rechercher
 * @desc    Rechercher des utilisateurs
 * @access  Privé - Token requis
 */
router.get('/rechercher',
  authMiddleware,
  searchLimiter,
  validateSearch,
  handleValidationErrors,
  rechercherUtilisateurs
);

// =============== ROUTES ADMIN ===============

/**
 * @route   GET /api/users/admin/tous
 * @desc    Obtenir tous les utilisateurs (pagination)
 * @access  Privé - Admin seulement
 */
router.get('/admin/tous',
  adminMiddleware,
  [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Le numéro de page doit être un entier positif'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('La limite doit être entre 1 et 100'),
    query('role')
      .optional()
      .isIn(['passager', 'conducteur', 'les_deux', 'admin'])
      .withMessage('Rôle invalide'),
    query('statutCompte')
      .optional()
      .isIn(['ACTIF', 'SUSPENDU', 'BLOQUE', 'EN_ATTENTE_VERIFICATION'])
      .withMessage('Statut de compte invalide'),
    query('sortBy')
      .optional()
      .isIn(['dateInscription', 'nom', 'email', 'scoreConfiance', 'derniereConnexion'])
      .withMessage('Champ de tri invalide'),
    query('sortOrder')
      .optional()
      .isIn(['asc', 'desc'])
      .withMessage('Ordre de tri invalide')
  ],
  handleValidationErrors,
  obtenirTousLesUtilisateurs
);

/**
 * @route   GET /api/users/admin/statistiques-globales
 * @desc    Obtenir les statistiques globales du système
 * @access  Privé - Admin seulement
 */
router.get('/admin/statistiques-globales',
  adminMiddleware,
  obtenirStatistiquesGlobales
);

// =============== ROUTES DE MONITORING ===============

/**
 * @route   GET /api/users/health
 * @desc    Vérifier l'état de santé du service utilisateurs
 * @access  Public
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Service utilisateurs opérationnel',
    timestamp: new Date().toISOString(),
    version: '1.2.0',
    features: {
      profileManagement: true,
      photoUpload: true,
      documentVerification: true,
      vehicleManagement: true,
      emergencyContacts: true,
      carpoolingAccount: true,
      geolocation: true,
      userSearch: true,
      adminPanel: true
    },
    routes: {
      profil: [
        'PUT /profil',
        'POST /upload-photo',
        'POST /upload-document',
        'PUT /mot-de-passe',
        'PUT /coordonnees',
        'PUT /role',
        'GET /dashboard',
        'GET /statistiques',
        'DELETE /compte'
      ],
      vehicule: [
        'PUT /vehicule'
      ],
      preferences: [
        'PUT /preferences',
        'POST /contacts-urgence',
        'DELETE /contacts-urgence/:contactId'
      ],
      compteCovoiturage: [
        'PUT /parametres-retrait',
        'PUT /auto-recharge',
        'DELETE /auto-recharge'
      ],
      recherche: [
        'GET /rechercher'
      ],
      admin: [
        'GET /admin/tous',
        'GET /admin/statistiques-globales'
      ]
    }
  });
});

/**
 * @route   GET /api/users/test
 * @desc    Test de connectivité du service
 * @access  Public
 */
router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'Service utilisateurs accessible',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// =============== GESTION CENTRALISÉE DES ERREURS ===============

/**
 * Middleware d'erreurs spécifique au router utilisateurs
 */
router.use((error, req, res, next) => {
  console.error('Erreur dans le router utilisateurs:', {
    message: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    timestamp: new Date().toISOString(),
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    userId: req.user?.userId
  });

  // Gestion des erreurs Multer (upload)
  if (error.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      success: false,
      code: 'FILE_TOO_LARGE',
      message: 'Fichier trop volumineux. Taille maximum: 5MB',
      timestamp: new Date().toISOString()
    });
  }

  if (error.code === 'LIMIT_FILE_COUNT') {
    return res.status(400).json({
      success: false,
      code: 'TOO_MANY_FILES',
      message: 'Trop de fichiers. Un seul fichier autorisé',
      timestamp: new Date().toISOString()
    });
  }

  if (error.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({
      success: false,
      code: 'UNEXPECTED_FILE',
      message: 'Champ de fichier inattendu',
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
    const field = Object.keys(error.keyPattern)[0];
    return res.status(409).json({
      success: false,
      code: 'DUPLICATE_ERROR',
      message: `${field} déjà utilisé`,
      field: field,
      timestamp: new Date().toISOString()
    });
  }

  // Gestion des erreurs de casting MongoDB
  if (error.name === 'CastError') {
    return res.status(400).json({
      success: false,
      code: 'INVALID_ID',
      message: 'Identifiant invalide',
      timestamp: new Date().toISOString()
    });
  }

  // Gestion des erreurs de système de fichiers
  if (error.code === 'ENOENT') {
    return res.status(500).json({
      success: false,
      code: 'FILE_SYSTEM_ERROR',
      message: 'Erreur de système de fichiers',
      timestamp: new Date().toISOString()
    });
  }

  // Pour toutes les autres erreurs, les propager au handler global
  return next(error);
});

// =============== EXPORT DU ROUTER ===============

module.exports = router;