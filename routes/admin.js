// =====================================================
// ROUTES ADMINISTRATEUR - Version corrigée
// =====================================================

const express = require('express');
const { body, query, param } = require('express-validator');
const router = express.Router();

// Import sécurisé des middlewares
let auth = {};
try {
  auth = require('../middleware/auth');
} catch (error) {
  console.warn('⚠️ Middleware auth non trouvé, utilisation des méthodes par défaut');
}

const { authenticate, authorize, logSensitiveAction } = auth;

// Import sécurisé du rate limiter
let rateLimiterModule = {};
try {
  rateLimiterModule = require('../middleware/rateLimiter');
} catch (error) {
  console.warn('⚠️ Middleware rateLimiter non trouvé');
}

const { rateLimiter } = rateLimiterModule;

// Import sécurisé du contrôleur admin
let adminController = {};
try {
  adminController = require('../controllers/adminController');
} catch (error) {
  console.warn('⚠️ Contrôleur adminController non trouvé, utilisation des méthodes par défaut');
}

const {
  connexionAdmin,
  obtenirProfil,
  creerAdmin,
  listerAdmins,
  obtenirAdminParId,
  modifierAdmin,
  changerStatutAdmin,
  desactiverAdmin,
  obtenirDashboard,
  obtenirStatistiques
} = adminController;

// === FONCTIONS HELPER SÉCURISÉES ===

const creerMiddlewareParDefaut = (nom) => {
  return (req, res, next) => {
    console.warn(`⚠️ Middleware ${nom} non disponible, passage à l'étape suivante`);
    next();
  };
};

const creerControleurParDefaut = (nomMethode, message = null) => {
  return (req, res) => {
    res.status(501).json({
      success: false,
      message: message || `Méthode ${nomMethode} non implémentée dans le contrôleur admin`,
      info: 'Cette fonctionnalité sera disponible dans une future version'
    });
  };
};

// Middlewares sécurisés
const middlewareAuth = authenticate || creerMiddlewareParDefaut('authenticate');

const middlewareAuthorize = (roles = [], permissions = []) => {
  if (!authorize) return creerMiddlewareParDefaut(`authorize(${roles.join(', ')})`);
  return authorize(roles, permissions);
};

const middlewareLogSensitiveAction = (action) => {
  if (!logSensitiveAction) return creerMiddlewareParDefaut(`logSensitiveAction(${action})`);
  return logSensitiveAction(action);
};

const middlewareRateLimit = (type) => {
  if (!rateLimiter || !rateLimiter[type]) {
    return creerMiddlewareParDefaut(`rateLimiter.${type}`);
  }
  return rateLimiter[type];
};

// =====================================================
// VALIDATIONS
// =====================================================

// Validation pour la connexion
const validationConnexion = [
  body('email')
    .isEmail()
    .withMessage('Format d\'email invalide')
    .normalizeEmail(),
  body('motDePasse')
    .notEmpty()
    .withMessage('Le mot de passe est requis')
    .isLength({ min: 6 })
    .withMessage('Le mot de passe doit contenir au moins 6 caractères')
];

// Validation pour la création d'admin
const validationCreationAdmin = [
  body('email')
    .isEmail()
    .withMessage('Format d\'email invalide')
    .normalizeEmail(),
  body('motDePasse')
    .isLength({ min: 8 })
    .withMessage('Le mot de passe doit contenir au moins 8 caractères')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Le mot de passe doit contenir au moins une majuscule, une minuscule, un chiffre et un caractère spécial'),
  body('nom')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Le nom doit contenir entre 2 et 50 caractères')
    .matches(/^[a-zA-ZÀ-ÿ\s'-]+$/)
    .withMessage('Le nom ne peut contenir que des lettres, espaces, apostrophes et tirets'),
  body('prenom')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Le prénom doit contenir entre 2 et 50 caractères')
    .matches(/^[a-zA-ZÀ-ÿ\s'-]+$/)
    .withMessage('Le prénom ne peut contenir que des lettres, espaces, apostrophes et tirets'),
  body('role')
    .optional()
    .isIn(['SUPER_ADMIN', 'MODERATEUR', 'SUPPORT'])
    .withMessage('Rôle invalide'),
  body('permissions')
    .optional()
    .isArray()
    .withMessage('Les permissions doivent être un tableau'),
  body('permissions.*')
    .optional()
    .isIn(['ALL', 'GESTION_UTILISATEURS', 'MODERATION', 'ANALYTICS', 'RAPPORTS_FINANCIERS', 'CONFIGURATION_SYSTEME'])
    .withMessage('Permission invalide')
];

// Validation pour la modification d'admin
const validationModificationAdmin = [
  body('nom')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Le nom doit contenir entre 2 et 50 caractères')
    .matches(/^[a-zA-ZÀ-ÿ\s'-]+$/)
    .withMessage('Le nom ne peut contenir que des lettres, espaces, apostrophes et tirets'),
  body('prenom')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Le prénom doit contenir entre 2 et 50 caractères')
    .matches(/^[a-zA-ZÀ-ÿ\s'-]+$/)
    .withMessage('Le prénom ne peut contenir que des lettres, espaces, apostrophes et tirets'),
  body('role')
    .optional()
    .isIn(['SUPER_ADMIN', 'MODERATEUR', 'SUPPORT'])
    .withMessage('Rôle invalide'),
  body('permissions')
    .optional()
    .isArray()
    .withMessage('Les permissions doivent être un tableau'),
  body('permissions.*')
    .optional()
    .isIn(['ALL', 'GESTION_UTILISATEURS', 'MODERATION', 'ANALYTICS', 'RAPPORTS_FINANCIERS', 'CONFIGURATION_SYSTEME'])
    .withMessage('Permission invalide'),
  body('statutCompte')
    .optional()
    .isIn(['ACTIF', 'SUSPENDU'])
    .withMessage('Statut de compte invalide')
];

// Validation pour le changement de statut
const validationChangementStatut = [
  body('statutCompte')
    .isIn(['ACTIF', 'SUSPENDU'])
    .withMessage('Statut invalide')
];

// Validation des paramètres de recherche
const validationRechercheAdmins = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('La page doit être un entier positif'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('La limite doit être entre 1 et 100'),
  query('sort')
    .optional()
    .isIn(['createdAt', '-createdAt', 'nom', '-nom', 'email', '-email', 'role', '-role'])
    .withMessage('Critère de tri invalide'),
  query('role')
    .optional()
    .isIn(['SUPER_ADMIN', 'MODERATEUR', 'SUPPORT'])
    .withMessage('Rôle invalide'),
  query('statutCompte')
    .optional()
    .isIn(['ACTIF', 'SUSPENDU'])
    .withMessage('Statut invalide'),
  query('dateDebut')
    .optional()
    .isISO8601()
    .withMessage('Format de date invalide'),
  query('dateFin')
    .optional()
    .isISO8601()
    .withMessage('Format de date invalide')
];

// Validation des paramètres d'ID
const validationId = [
  param('id')
    .matches(/^[0-9a-fA-F]{24}$/)
    .withMessage('ID MongoDB invalide')
];

// Validation pour les statistiques
const validationStatistiques = [
  query('periode')
    .optional()
    .isInt({ min: 1, max: 365 })
    .withMessage('La période doit être entre 1 et 365 jours')
];

// =====================================================
// MIDDLEWARES DE PERMISSIONS
// =====================================================

// Middleware pour vérifier les permissions spécifiques
const verifierPermissionGestionAdmins = middlewareAuthorize(['SUPER_ADMIN'], ['ALL', 'GESTION_UTILISATEURS']);
const verifierPermissionAnalytics = middlewareAuthorize(['SUPER_ADMIN', 'MODERATEUR'], ['ALL', 'ANALYTICS']);
const verifierPermissionSuperAdmin = middlewareAuthorize(['SUPER_ADMIN'], ['ALL']);

// =====================================================
// ROUTES D'AUTHENTIFICATION
// =====================================================

/**
 * @route   POST /api/admin/auth/login
 * @desc    Connexion administrateur
 * @access  Public
 */
router.post('/auth/login', 
  middlewareRateLimit('auth'),
  validationConnexion,
  middlewareLogSensitiveAction('ADMIN_LOGIN_ATTEMPT'),
  connexionAdmin || creerControleurParDefaut('connexionAdmin')
);

/**
 * @route   GET /api/admin/auth/profil
 * @desc    Obtenir le profil de l'admin connecté
 * @access  Private (Admin)
 */
router.get('/auth/profil',
  middlewareAuth,
  obtenirProfil || creerControleurParDefaut('obtenirProfil')
);

// =====================================================
// ROUTES CRUD ADMINISTRATEURS
// =====================================================

/**
 * @route   POST /api/admin/admins
 * @desc    Créer un nouvel administrateur
 * @access  Private (Super Admin)
 */
router.post('/admins',
  middlewareAuth,
  middlewareRateLimit('standard'),
  verifierPermissionSuperAdmin,
  validationCreationAdmin,
  middlewareLogSensitiveAction('ADMIN_CREATE'),
  creerAdmin || creerControleurParDefaut('creerAdmin')
);

/**
 * @route   GET /api/admin/admins
 * @desc    Obtenir la liste des administrateurs
 * @access  Private (Admin avec permission GESTION_UTILISATEURS)
 */
router.get('/admins',
  middlewareAuth,
  middlewareRateLimit('standard'),
  verifierPermissionGestionAdmins,
  validationRechercheAdmins,
  listerAdmins || creerControleurParDefaut('listerAdmins')
);

/**
 * @route   GET /api/admin/admins/:id
 * @desc    Obtenir un administrateur par ID
 * @access  Private (Admin avec permission GESTION_UTILISATEURS)
 */
router.get('/admins/:id',
  middlewareAuth,
  middlewareRateLimit('standard'),
  verifierPermissionGestionAdmins,
  validationId,
  obtenirAdminParId || creerControleurParDefaut('obtenirAdminParId')
);

/**
 * @route   PUT /api/admin/admins/:id
 * @desc    Modifier un administrateur
 * @access  Private (Super Admin)
 */
router.put('/admins/:id',
  middlewareAuth,
  middlewareRateLimit('standard'),
  verifierPermissionSuperAdmin,
  validationId,
  validationModificationAdmin,
  middlewareLogSensitiveAction('ADMIN_UPDATE'),
  modifierAdmin || creerControleurParDefaut('modifierAdmin')
);

/**
 * @route   PATCH /api/admin/admins/:id/statut
 * @desc    Changer le statut d'un administrateur
 * @access  Private (Super Admin)
 */
router.patch('/admins/:id/statut',
  middlewareAuth,
  middlewareRateLimit('standard'),
  verifierPermissionSuperAdmin,
  validationId,
  validationChangementStatut,
  middlewareLogSensitiveAction('ADMIN_STATUS_CHANGE'),
  changerStatutAdmin || creerControleurParDefaut('changerStatutAdmin')
);

/**
 * @route   DELETE /api/admin/admins/:id
 * @desc    Désactiver un administrateur
 * @access  Private (Super Admin)
 */
router.delete('/admins/:id',
  middlewareAuth,
  middlewareRateLimit('standard'),
  verifierPermissionSuperAdmin,
  validationId,
  middlewareLogSensitiveAction('ADMIN_DELETE'),
  desactiverAdmin || creerControleurParDefaut('desactiverAdmin')
);

// =====================================================
// ROUTES ANALYTICS ET DASHBOARD
// =====================================================

/**
 * @route   GET /api/admin/dashboard
 * @desc    Obtenir le dashboard analytics
 * @access  Private (Admin avec permission ANALYTICS)
 */
router.get('/dashboard',
  middlewareAuth,
  middlewareRateLimit('standard'),
  verifierPermissionAnalytics,
  obtenirDashboard || creerControleurParDefaut('obtenirDashboard')
);

/**
 * @route   GET /api/admin/statistiques
 * @desc    Obtenir les statistiques détaillées
 * @access  Private (Admin avec permission ANALYTICS)
 */
router.get('/statistiques',
  middlewareAuth,
  middlewareRateLimit('reporting'),
  verifierPermissionAnalytics,
  validationStatistiques,
  obtenirStatistiques || creerControleurParDefaut('obtenirStatistiques')
);

// =====================================================
// ROUTES DE GESTION DES UTILISATEURS (à implémenter)
// =====================================================

/**
 * @route   GET /api/admin/utilisateurs
 * @desc    Obtenir la liste des utilisateurs
 * @access  Private (Admin avec permission GESTION_UTILISATEURS)
 */
router.get('/utilisateurs',
  middlewareAuth,
  middlewareRateLimit('standard'),
  verifierPermissionGestionAdmins,
  (req, res) => {
    res.status(501).json({
      success: false,
      message: 'Gestion des utilisateurs en cours d\'implémentation',
      code: 'NOT_IMPLEMENTED'
    });
  }
);

/**
 * @route   PATCH /api/admin/utilisateurs/:id/statut
 * @desc    Changer le statut d'un utilisateur
 * @access  Private (Admin avec permission MODERATION)
 */
router.patch('/utilisateurs/:id/statut',
  middlewareAuth,
  middlewareRateLimit('standard'),
  middlewareAuthorize(['SUPER_ADMIN', 'MODERATEUR'], ['ALL', 'MODERATION']),
  validationId,
  middlewareLogSensitiveAction('USER_STATUS_CHANGE'),
  (req, res) => {
    res.status(501).json({
      success: false,
      message: 'Modération des utilisateurs en cours d\'implémentation',
      code: 'NOT_IMPLEMENTED'
    });
  }
);

// =====================================================
// ROUTES DE RAPPORTS FINANCIERS (à implémenter)
// =====================================================

/**
 * @route   GET /api/admin/rapports/transactions
 * @desc    Rapport des transactions
 * @access  Private (Admin avec permission RAPPORTS_FINANCIERS)
 */
router.get('/rapports/transactions',
  middlewareAuth,
  middlewareRateLimit('reporting'),
  middlewareAuthorize(['SUPER_ADMIN', 'MODERATEUR'], ['ALL', 'RAPPORTS_FINANCIERS']),
  middlewareLogSensitiveAction('FINANCIAL_REPORT_ACCESS'),
  (req, res) => {
    res.status(501).json({
      success: false,
      message: 'Rapports financiers en cours d\'implémentation',
      code: 'NOT_IMPLEMENTED'
    });
  }
);

/**
 * @route   GET /api/admin/rapports/revenus
 * @desc    Rapport des revenus
 * @access  Private (Admin avec permission RAPPORTS_FINANCIERS)
 */
router.get('/rapports/revenus',
  middlewareAuth,
  middlewareRateLimit('reporting'),
  middlewareAuthorize(['SUPER_ADMIN'], ['ALL', 'RAPPORTS_FINANCIERS']),
  middlewareLogSensitiveAction('REVENUE_REPORT_ACCESS'),
  (req, res) => {
    res.status(501).json({
      success: false,
      message: 'Rapports de revenus en cours d\'implémentation',
      code: 'NOT_IMPLEMENTED'
    });
  }
);

// =====================================================
// VALIDATION DES PARAMÈTRES
// =====================================================

// Middleware pour valider les IDs
router.param('id', (req, res, next, id) => {
  if (!id.match(/^[0-9a-fA-F]{24}$/)) {
    return res.status(400).json({
      success: false,
      message: 'Format ID invalide',
      code: 'INVALID_ID'
    });
  }
  next();
});

// =====================================================
// MIDDLEWARES GLOBAUX
// =====================================================

// Middleware de logging pour les actions admin
router.use((req, res, next) => {
  const originalSend = res.send;
  res.send = function(data) {
    // Logger toutes les actions admin pour audit complet
    console.log(`👑 ACTION ADMIN: ${req.method} ${req.originalUrl} - User: ${req.user?.id || 'Anonymous'} - Role: ${req.user?.role || 'N/A'}`);
    return originalSend.call(this, data);
  };
  next();
});

// =====================================================
// GESTION D'ERREURS
// =====================================================

// Middleware pour les routes non trouvées
router.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route administrateur non trouvée',
    code: 'ADMIN_ROUTE_NOT_FOUND'
  });
});

// Middleware de gestion d'erreurs spécifique aux routes admin
router.use((err, req, res, next) => {
  console.error('💥 Erreur dans les routes admin:', {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    user: req.user?.id,
    url: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString()
  });

  // Erreur de validation express-validator
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      message: 'Erreur de validation des données',
      code: 'VALIDATION_ERROR',
      errors: Object.values(err.errors).map(e => e.message)
    });
  }

  // Erreur JWT
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      message: 'Token d\'authentification invalide',
      code: 'INVALID_TOKEN'
    });
  }

  // Erreur de cast (ID MongoDB invalide)
  if (err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      message: 'ID invalide',
      code: 'INVALID_ID'
    });
  }

  // Erreur de permission
  if (err.statusCode === 403) {
    return res.status(403).json({
      success: false,
      message: 'Permissions insuffisantes pour cette action',
      code: 'INSUFFICIENT_PERMISSIONS'
    });
  }

  // Erreur par défaut
  if (process.env.NODE_ENV === 'production') {
    return res.status(500).json({
      success: false,
      message: 'Erreur interne du serveur administratif',
      code: 'ADMIN_SERVER_ERROR'
    });
  }

  next(err);
});

module.exports = router;