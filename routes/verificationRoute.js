// routes/verificationRoute.js
const express = require('express');
const router = express.Router();
const { body, param, query, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');

// =============== IMPORTS CONTRÔLEURS ===============
const {
  telechargerPhotoDocument,
  marquerEnCoursRevision,
  obtenirHistoriqueVerifications,
  envoyerRappelVerification,
  obtenirDocumentsExpires,
  demanderRenouvellement,
  approuverEnLot
} = require('../controllers/verificationController');

// Import du contrôleur principal de vérification (assumé)
// const {
//   soumettreDocumentVerification,
//   approuverDocument,
//   rejeterDocument,
//   obtenirDocumentsEnAttente,
//   obtenirStatutVerification
// } = require('../controllers/auth/verificationController');

// =============== IMPORTS MIDDLEWARES ===============
const {
  //authMiddleware,
  adminMiddleware
} = require('../middlewares/authMiddleware');

// =============== RATE LIMITING ===============

const verificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 actions de vérification max par IP
  message: {
    success: false,
    message: 'Trop d\'actions de vérification. Réessayez dans 15 minutes.'
  }
});

const downloadLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 50, // 50 téléchargements max par 5 minutes
  message: {
    success: false,
    message: 'Trop de téléchargements. Réessayez dans 5 minutes.'
  }
});

const adminActionLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 100, // 100 actions admin max par 10 minutes
  message: {
    success: false,
    message: 'Trop d\'actions administratives. Réessayez dans 10 minutes.'
  }
});

const bulkActionLimiter = rateLimit({
  windowMs: 30 * 60 * 1000, // 30 minutes
  max: 10, // 10 actions en lot max par 30 minutes
  message: {
    success: false,
    message: 'Trop d\'actions en lot. Réessayez dans 30 minutes.'
  }
});

// =============== VALIDATIONS ===============

const validateUserId = [
  param('userId')
    .isMongoId()
    .withMessage('ID utilisateur invalide')
];

const validateRenewalRequest = [
  body('raison')
    .optional()
    .trim()
    .isLength({ min: 10, max: 500 })
    .withMessage('La raison doit contenir entre 10 et 500 caractères')
];

const validateBulkApproval = [
  body('userIds')
    .isArray({ min: 1, max: 20 })
    .withMessage('Liste d\'utilisateurs requise (1-20 utilisateurs max pour approbation en lot)'),
  body('userIds.*')
    .isMongoId()
    .withMessage('ID utilisateur invalide'),
  body('commentaire')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Le commentaire ne peut dépasser 200 caractères')
];

const validateReminderRequest = [
  body('userIds')
    .isArray({ min: 1, max: 100 })
    .withMessage('Liste d\'utilisateurs requise (1-100 utilisateurs max)'),
  body('userIds.*')
    .isMongoId()
    .withMessage('ID utilisateur invalide'),
  body('messagePersonnalise')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Le message personnalisé ne peut dépasser 500 caractères')
];

const validateExpiredDocsQuery = [
  query('includeExpired')
    .optional()
    .isBoolean()
    .withMessage('includeExpired doit être un booléen'),
  query('includeToRenew')
    .optional()
    .isBoolean()
    .withMessage('includeToRenew doit être un booléen'),
  query('daysThreshold')
    .optional()
    .isInt({ min: 1, max: 365 })
    .withMessage('Le seuil de jours doit être entre 1 et 365')
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

// =============== ROUTES ADMIN - TÉLÉCHARGEMENTS ===============

/**
 * @route   GET /api/verification/admin/document/:userId/photo
 * @desc    Télécharger la photo d'un document d'identité
 * @access  Privé - Admin seulement
 */
router.get('/admin/document/:userId/photo',
  adminMiddleware,
  downloadLimiter,
  validateUserId,
  handleValidationErrors,
  telechargerPhotoDocument
);

// =============== ROUTES ADMIN - GESTION DES DOCUMENTS ===============

/**
 * @route   PUT /api/verification/admin/document/:userId/en-cours
 * @desc    Marquer un document comme en cours de révision
 * @access  Privé - Admin seulement
 */
router.put('/admin/document/:userId/en-cours',
  adminMiddleware,
  adminActionLimiter,
  validateUserId,
  handleValidationErrors,
  marquerEnCoursRevision
);

/**
 * @route   PUT /api/verification/admin/document/:userId/renouvellement
 * @desc    Demander un renouvellement de vérification
 * @access  Privé - Admin seulement
 */
router.put('/admin/document/:userId/renouvellement',
  adminMiddleware,
  adminActionLimiter,
  validateUserId,
  validateRenewalRequest,
  handleValidationErrors,
  demanderRenouvellement
);

/**
 * @route   POST /api/verification/admin/approuver-lot
 * @desc    Approuver plusieurs documents en lot
 * @access  Privé - Admin seulement
 */
router.post('/admin/approuver-lot',
  adminMiddleware,
  bulkActionLimiter,
  validateBulkApproval,
  handleValidationErrors,
  approuverEnLot
);

// =============== ROUTES ADMIN - CONSULTATION ===============

/**
 * @route   GET /api/verification/admin/historique/:userId
 * @desc    Obtenir l'historique des vérifications d'un utilisateur
 * @access  Privé - Admin seulement
 */
router.get('/admin/historique/:userId',
  adminMiddleware,
  verificationLimiter,
  validateUserId,
  handleValidationErrors,
  obtenirHistoriqueVerifications
);

/**
 * @route   GET /api/verification/admin/documents-expires
 * @desc    Obtenir la liste des documents expirés ou à renouveler
 * @access  Privé - Admin seulement
 */
router.get('/admin/documents-expires',
  adminMiddleware,
  verificationLimiter,
  validateExpiredDocsQuery,
  handleValidationErrors,
  obtenirDocumentsExpires
);

// =============== ROUTES ADMIN - COMMUNICATIONS ===============

/**
 * @route   POST /api/verification/admin/rappel-verification
 * @desc    Envoyer des rappels de vérification aux utilisateurs
 * @access  Privé - Admin seulement
 */
router.post('/admin/rappel-verification',
  adminMiddleware,
  bulkActionLimiter,
  validateReminderRequest,
  handleValidationErrors,
  envoyerRappelVerification
);

// =============== ROUTES DE MONITORING ET STATISTIQUES ===============

/**
 * @route   GET /api/verification/admin/statistiques
 * @desc    Obtenir les statistiques de vérification
 * @access  Privé - Admin seulement
 */
router.get('/admin/statistiques',
  adminMiddleware,
  async (req, res, next) => {
    try {
      const User = require('../../models/Utilisateur');
      
      // Statistiques générales
      const stats = await User.aggregate([
        {
          $group: {
            _id: '$documentIdentite.statutVerification',
            count: { $sum: 1 }
          }
        }
      ]);

      // Documents en attente depuis plus de X jours
      const maintenant = new Date();
      const il7Jours = new Date(maintenant.getTime() - 7 * 24 * 60 * 60 * 1000);
      const il30Jours = new Date(maintenant.getTime() - 30 * 24 * 60 * 60 * 1000);

      const enAttenteDepuis7Jours = await User.countDocuments({
        'documentIdentite.statutVerification': 'EN_ATTENTE',
        createdAt: { $lt: il7Jours }
      });

      const enAttenteDepuis30Jours = await User.countDocuments({
        'documentIdentite.statutVerification': 'EN_ATTENTE',
        createdAt: { $lt: il30Jours }
      });

      // Statistiques par type de document
      const statsParType = await User.aggregate([
        {
          $match: {
            'documentIdentite.type': { $exists: true }
          }
        },
        {
          $group: {
            _id: {
              type: '$documentIdentite.type',
              statut: '$documentIdentite.statutVerification'
            },
            count: { $sum: 1 }
          }
        }
      ]);

      const statistiques = {
        global: stats.reduce((acc, item) => {
          acc[item._id || 'non_defini'] = item.count;
          return acc;
        }, {}),
        delais: {
          enAttenteDepuis7Jours,
          enAttenteDepuis30Jours
        },
        parType: statsParType,
        derniereMiseAJour: new Date()
      };

      res.json({
        success: true,
        data: statistiques
      });

    } catch (error) {
      console.error('Erreur statistiques vérification:', error);
      return next(error);
    }
  }
);

// =============== ROUTES DE MONITORING SYSTÈME ===============

/**
 * @route   GET /api/verification/health
 * @desc    Vérifier l'état de santé du service de vérification
 * @access  Public
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Service de vérification opérationnel',
    timestamp: new Date().toISOString(),
    version: '1.1.0',
    features: {
      documentUpload: true,
      automaticVerification: false,
      manualVerification: true,
      bulkApproval: true,
      renewalRequests: true,
      expiredDocuments: true,
      verificationHistory: true,
      reminderSystem: true
    },
    routes: {
      admin: [
        'GET /admin/document/:userId/photo',
        'PUT /admin/document/:userId/en-cours',
        'PUT /admin/document/:userId/renouvellement',
        'POST /admin/approuver-lot',
        'GET /admin/historique/:userId',
        'GET /admin/documents-expires',
        'POST /admin/rappel-verification',
        'GET /admin/statistiques'
      ],
      monitoring: [
        'GET /health',
        'GET /test'
      ]
    },
    limits: {
      verificationActions: '20/15min',
      downloads: '50/5min',
      adminActions: '100/10min',
      bulkActions: '10/30min'
    }
  });
});

/**
 * @route   GET /api/verification/test
 * @desc    Test de connectivité du service
 * @access  Public
 */
router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'Service de vérification accessible',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// =============== ROUTES D'INFORMATION ===============

/**
 * @route   GET /api/verification/types-documents
 * @desc    Obtenir les types de documents acceptés
 * @access  Public
 */
router.get('/types-documents', (req, res) => {
  res.json({
    success: true,
    data: {
      typesAcceptes: [
        {
          code: 'CNI',
          nom: 'Carte Nationale d\'Identité',
          format: 'XX00000000',
          description: 'Carte d\'identité ivoirienne valide'
        },
        {
          code: 'PASSEPORT',
          nom: 'Passeport',
          format: 'Alphanumerique 6-9 caractères',
          description: 'Passeport ivoirien ou étranger valide'
        }
      ],
      exigences: {
        qualiteImage: 'Haute résolution, texte lisible',
        format: 'JPEG, PNG ou PDF',
        tailleFichier: 'Maximum 5MB',
        validite: 'Document non expiré'
      },
      delaiTraitement: '24-48 heures ouvrables',
      criteresValidation: [
        'Lisibilité du texte',
        'Authenticité du document',
        'Correspondance des informations',
        'Validité du document'
      ]
    }
  });
});

/**
 * @route   GET /api/verification/statuts
 * @desc    Obtenir les différents statuts de vérification
 * @access  Public
 */
router.get('/statuts', (req, res) => {
  res.json({
    success: true,
    data: {
      statuts: [
        {
          code: 'EN_ATTENTE',
          nom: 'En attente',
          description: 'Document soumis, en cours de vérification'
        },
        {
          code: 'VERIFIE',
          nom: 'Vérifié',
          description: 'Document approuvé et vérifié'
        },
        {
          code: 'REJETE',
          nom: 'Rejeté',
          description: 'Document rejeté, soumission requise'
        }
      ],
      processus: [
        'Soumission du document par l\'utilisateur',
        'Vérification manuelle par un administrateur',
        'Approbation ou rejet avec commentaires',
        'Notification à l\'utilisateur'
      ]
    }
  });
});

// =============== GESTION CENTRALISÉE DES ERREURS ===============

/**
 * Middleware d'erreurs spécifique au router de vérification
 */
router.use((error, req, res, next) => {
  console.error('Erreur dans le router vérification:', {
    message: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    timestamp: new Date().toISOString(),
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    userId: req.user?.userId,
    isAdmin: req.user?.role === 'admin'
  });

  // Gestion des erreurs de fichier non trouvé
  if (error.code === 'ENOENT') {
    return res.status(404).json({
      success: false,
      code: 'FILE_NOT_FOUND',
      message: 'Document non trouvé',
      timestamp: new Date().toISOString()
    });
  }

  // Gestion des erreurs de permission de fichier
  if (error.code === 'EACCES') {
    return res.status(500).json({
      success: false,
      code: 'FILE_ACCESS_ERROR',
      message: 'Erreur d\'accès au fichier',
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

  // Gestion des erreurs de casting MongoDB
  if (error.name === 'CastError') {
    return res.status(400).json({
      success: false,
      code: 'INVALID_ID',
      message: 'Identifiant invalide',
      timestamp: new Date().toISOString()
    });
  }

  // Gestion des erreurs d'email
  if (error.message && error.message.includes('email')) {
    return res.status(500).json({
      success: false,
      code: 'EMAIL_ERROR',
      message: 'Erreur lors de l\'envoi de l\'email',
      timestamp: new Date().toISOString()
    });
  }

  // Gestion des erreurs de base de données
  if (error.name === 'MongoError' || error.name === 'MongoTimeoutError') {
    return res.status(500).json({
      success: false,
      code: 'DATABASE_ERROR',
      message: 'Erreur de base de données',
      timestamp: new Date().toISOString()
    });
  }

  // Pour toutes les autres erreurs, les propager au handler global
  return next(error);
});

// =============== EXPORT DU ROUTER ===============

module.exports = router;