// routes/verificationRoute.js
// =====================================================
// ROUTES DE VÉRIFICATION - STOCKAGE LOCAL
// =====================================================

const express = require('express');
const router = express.Router();
const { body, param, query, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');

// =============== IMPORTS CONTRÔLEURS ===============
const {
  // Fonctions UTILISATEUR (Flutter compatible)
  soumettreVerification,
  obtenirStatutVerification,
  annulerVerification,
  
  // Fonctions ADMIN
  obtenirDocumentsEnAttente,
  telechargerPhotoDocument,
  approuverDocument,
  rejeterDocument,
  marquerEnCoursRevision,
  obtenirHistoriqueVerifications,
  envoyerRappelVerification,
  obtenirDocumentsExpires,
  demanderRenouvellement,
  approuverEnLot
} = require('../controllers/verificationController');

// =============== IMPORTS MIDDLEWARES ===============
// ✅ Compatible avec le système admin
const { protectAdmin, authorize } = require('../middlewares/adminAuthMiddleware');
const { protect: protectUser } = require('../middlewares/authMiddleware');

// ✅ CORRECTION : Importer depuis uploadMiddleware au lieu de cloudinaryConfig
const { 
   uploadVerificationFiles,    
   handleVerificationUploadError,      
  debugVerificationUpload,                
} = require('../middlewares/uploadMiddleware');

// =============== RATE LIMITING ===============

const verificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: {
    success: false,
    message: 'Trop d\'actions de vérification. Réessayez dans 15 minutes.',
    code: 'RATE_LIMIT_EXCEEDED'
  }
});

const downloadLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 50,
  message: {
    success: false,
    message: 'Trop de téléchargements. Réessayez dans 5 minutes.',
    code: 'RATE_LIMIT_EXCEEDED'
  }
});

const adminActionLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 100,
  message: {
    success: false,
    message: 'Trop d\'actions administratives. Réessayez dans 10 minutes.',
    code: 'RATE_LIMIT_EXCEEDED'
  }
});

const bulkActionLimiter = rateLimit({
  windowMs: 30 * 60 * 1000, // 30 minutes
  max: 10,
  message: {
    success: false,
    message: 'Trop d\'actions en lot. Réessayez dans 30 minutes.',
    code: 'RATE_LIMIT_EXCEEDED'
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
    .isArray({ min: 1, max: 50 })
    .withMessage('Liste d\'utilisateurs requise (1-50 utilisateurs max)'),
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

const validateRejectRequest = [
  body('raison')
    .trim()
    .notEmpty()
    .withMessage('La raison est requise')
    .isLength({ min: 10, max: 500 })
    .withMessage('La raison doit contenir entre 10 et 500 caractères')
];

// ✅ Validation pour Flutter (form-data, pas de body validation)
const validateFlutterSubmission = [
  body('type')
    .isIn(['CNI', 'PASSEPORT', 'PERMIS_CONDUIRE', 'ATTESTATION_IDENTITE'])
    .withMessage('Type de document invalide'),
  body('numero')
    .trim()
    .notEmpty()
    .withMessage('Numéro de document requis')
    .isLength({ min: 5, max: 50 })
    .withMessage('Numéro de document invalide (5-50 caractères)')
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

const validatePaginationQuery = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page invalide'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limite invalide (1-100)'),
  query('sortBy')
    .optional()
    .isIn(['dateUpload', 'nom', 'type'])
    .withMessage('Critère de tri invalide'),
  query('sortOrder')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('Ordre de tri invalide'),
  query('type')
    .optional()
    .isIn(['CNI', 'PASSEPORT', 'PERMIS_CONDUIRE', 'ATTESTATION_IDENTITE'])
    .withMessage('Type de document invalide')
];

// Middleware de gestion des erreurs de validation
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Erreurs de validation',
      code: 'VALIDATION_ERROR',
      errors: errors.array().map(error => ({
        field: error.path,
        message: error.msg,
        value: error.value
      }))
    });
  }
  next();
};

// =============== MIDDLEWARES DE PERMISSIONS ===============

// ✅ Compatible avec le système admin
const requireVerificationPermission = authorize(
  ['SUPER_ADMIN', 'MODERATEUR'], 
  ['ALL', 'VERIFICATION_DOCUMENTS', 'VERIFICATION_IDENTITE']
);

const requireModificationPermission = authorize(
  ['SUPER_ADMIN'], 
  ['ALL', 'VERIFICATION_DOCUMENTS']
);

// =====================================================
// ROUTES UTILISATEUR (FLUTTER COMPATIBLE)
// =====================================================

/**
 * @route   POST /api/verification/submit
 * @desc    Soumettre une demande de vérification (2 images via Flutter)
 * @access  Private (utilisateur connecté)
 * @body    form-data:
 *          - type (text): CNI, PASSEPORT, PERMIS_CONDUIRE, ATTESTATION_IDENTITE
 *          - numero (text): Numéro du document
 *          - documentImage (file): Photo du document (JPG/PNG)
 *          - selfieWithDocumentImage (file): Photo selfie avec document (JPG/PNG)
 */
router.post('/submit',
  protectUser,
  verificationLimiter,
  debugVerificationUpload,      // 🔍 Debug - voir les fichiers reçus
  uploadVerificationFiles,
  validateFlutterSubmission,
  handleValidationErrors,
  soumettreVerification
);

/**
 * @route   GET /api/verification/status
 * @desc    Obtenir le statut de vérification de l'utilisateur connecté
 * @access  Private (utilisateur connecté)
 */
router.get('/status',
  protectUser,
  obtenirStatutVerification
);

/**
 * @route   DELETE /api/verification/cancel
 * @desc    Annuler une demande de vérification en attente
 * @access  Private (utilisateur connecté)
 */
router.delete('/cancel',
  protectUser,
  verificationLimiter,
  annulerVerification
);

// =====================================================
// ROUTES ADMIN - GESTION DES DOCUMENTS
// =====================================================

/**
 * @route   GET /api/verification/admin/pending
 * @desc    Liste des documents en attente de vérification
 * @access  Private - Admin avec permission VERIFICATION_DOCUMENTS
 */
router.get('/admin/pending',
  protectAdmin,
  requireVerificationPermission,
  verificationLimiter,
  validatePaginationQuery,
  handleValidationErrors,
  obtenirDocumentsEnAttente
);

/**
 * @route   GET /api/verification/admin/photos/:userId
 * @desc    Obtenir les URLs des photos (document + selfie)
 * @access  Private - Admin avec permission VERIFICATION_DOCUMENTS
 */
router.get('/admin/photos/:userId',
  protectAdmin,
  requireVerificationPermission,
  downloadLimiter,
  validateUserId,
  handleValidationErrors,
  telechargerPhotoDocument
);

/**
 * @route   PUT /api/verification/admin/approve/:userId
 * @desc    Approuver un document
 * @access  Private - Admin avec permission VERIFICATION_DOCUMENTS
 */
router.put('/admin/approve/:userId',
  protectAdmin,
  requireVerificationPermission,
  adminActionLimiter,
  validateUserId,
  handleValidationErrors,
  approuverDocument
);

/**
 * @route   PUT /api/verification/admin/reject/:userId
 * @desc    Rejeter un document avec raison (min 10 caractères)
 * @access  Private - Admin avec permission VERIFICATION_DOCUMENTS
 */
router.put('/admin/reject/:userId',
  protectAdmin,
  requireVerificationPermission,
  adminActionLimiter,
  validateUserId,
  validateRejectRequest,
  handleValidationErrors,
  rejeterDocument
);

/**
 * @route   PUT /api/verification/admin/mark-reviewing/:userId
 * @desc    Marquer un document comme en cours de révision
 * @access  Private - Admin avec permission VERIFICATION_DOCUMENTS
 */
router.put('/admin/mark-reviewing/:userId',
  protectAdmin,
  requireVerificationPermission,
  adminActionLimiter,
  validateUserId,
  handleValidationErrors,
  marquerEnCoursRevision
);

/**
 * @route   GET /api/verification/admin/history/:userId
 * @desc    Obtenir l'historique des vérifications d'un utilisateur
 * @access  Private - Admin avec permission VERIFICATION_DOCUMENTS
 */
router.get('/admin/history/:userId',
  protectAdmin,
  requireVerificationPermission,
  verificationLimiter,
  validateUserId,
  handleValidationErrors,
  obtenirHistoriqueVerifications
);

/**
 * @route   POST /api/verification/admin/send-reminders
 * @desc    Envoyer des rappels de vérification (max 100 utilisateurs)
 * @access  Private - Admin avec permission VERIFICATION_DOCUMENTS
 */
router.post('/admin/send-reminders',
  protectAdmin,
  requireVerificationPermission,
  bulkActionLimiter,
  validateReminderRequest,
  handleValidationErrors,
  envoyerRappelVerification
);

/**
 * @route   GET /api/verification/admin/expired
 * @desc    Obtenir les documents expirés ou à renouveler
 * @access  Private - Admin avec permission VERIFICATION_DOCUMENTS
 */
router.get('/admin/expired',
  protectAdmin,
  requireVerificationPermission,
  verificationLimiter,
  validateExpiredDocsQuery,
  handleValidationErrors,
  obtenirDocumentsExpires
);

/**
 * @route   POST /api/verification/admin/request-renewal/:userId
 * @desc    Demander un renouvellement de vérification à un utilisateur
 * @access  Private - Super Admin
 */
router.post('/admin/request-renewal/:userId',
  protectAdmin,
  requireModificationPermission,
  adminActionLimiter,
  validateUserId,
  validateRenewalRequest,
  handleValidationErrors,
  demanderRenouvellement
);

/**
 * @route   POST /api/verification/admin/approve-batch
 * @desc    Approuver plusieurs documents en lot (max 50)
 * @access  Private - Admin avec permission VERIFICATION_DOCUMENTS
 */
router.post('/admin/approve-batch',
  protectAdmin,
  requireVerificationPermission,
  bulkActionLimiter,
  validateBulkApproval,
  handleValidationErrors,
  approuverEnLot
);

// =====================================================
// ROUTES DE MONITORING ET STATISTIQUES
// =====================================================

/**
 * @route   GET /api/verification/admin/statistiques
 * @desc    Obtenir les statistiques de vérification
 * @access  Private - Admin avec permission ANALYTICS
 */
router.get('/admin/statistiques',
  protectAdmin,
  authorize(['SUPER_ADMIN', 'MODERATEUR'], ['ALL', 'ANALYTICS']),
  async (req, res, next) => {
    try {
      const User = require('../models/Utilisateur');
      
      const stats = await User.aggregate([
        {
          $group: {
            _id: '$documentIdentite.statutVerification',
            count: { $sum: 1 }
          }
        }
      ]);

      const maintenant = new Date();
      const il7Jours = new Date(maintenant.getTime() - 7 * 24 * 60 * 60 * 1000);
      const il30Jours = new Date(maintenant.getTime() - 30 * 24 * 60 * 60 * 1000);

      const enAttenteDepuis7Jours = await User.countDocuments({
        'documentIdentite.statutVerification': 'EN_ATTENTE',
        'documentIdentite.dateUpload': { $lt: il7Jours }
      });

      const enAttenteDepuis30Jours = await User.countDocuments({
        'documentIdentite.statutVerification': 'EN_ATTENTE',
        'documentIdentite.dateUpload': { $lt: il30Jours }
      });

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

      // ✅ Statistiques sur les selfies
      const avecSelfie = await User.countDocuments({
        'documentIdentite.photoSelfie': { $exists: true, $ne: null }
      });

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
        selfies: {
          avecSelfie,
          pourcentage: stats.length > 0 
            ? ((avecSelfie / stats.reduce((sum, s) => sum + s.count, 0)) * 100).toFixed(2)
            : 0
        },
        derniereMiseAJour: new Date()
      };

      res.json({
        success: true,
        data: statistiques
      });

    } catch (error) {
      console.error('Erreur statistiques vérification:', error);
      const AppError = require('../utils/AppError');
      return next(AppError.serverError('Erreur serveur', { originalError: error.message }));
    }
  }
);

// =====================================================
// ROUTES DE MONITORING SYSTÈME
// =====================================================

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
    version: '5.0.0-local-storage',
    features: {
      flutterCompatible: true,
      twoImagesUpload: true,
      localStorage: true, // ✅ Stockage local au lieu de Cloudinary
      separateFolders: true,
      automaticVerification: false,
      manualVerification: true,
      bulkApproval: true,
      renewalRequests: true,
      expiredDocuments: true,
      verificationHistory: true,
      reminderSystem: true,
      inputValidation: true,
      rateLimiting: true,
      performanceOptimized: true,
      adminSystemIntegrated: true,
      emailNotifications: true
    },
    routes: {
      user: [
        'POST /submit (Flutter - 2 images)',
        'GET /status',
        'DELETE /cancel'
      ],
      admin: [
        'GET /admin/pending',
        'GET /admin/photos/:userId',
        'PUT /admin/approve/:userId',
        'PUT /admin/reject/:userId',
        'PUT /admin/mark-reviewing/:userId',
        'GET /admin/history/:userId',
        'POST /admin/send-reminders (max 100)',
        'GET /admin/expired',
        'POST /admin/request-renewal/:userId',
        'POST /admin/approve-batch (max 50)',
        'GET /admin/statistiques'
      ],
      monitoring: [
        'GET /health',
        'GET /test',
        'GET /types-documents',
        'GET /statuts'
      ]
    },
    permissions: {
      verification: 'VERIFICATION_DOCUMENTS, VERIFICATION_IDENTITE',
      modification: 'SUPER_ADMIN only',
      analytics: 'ANALYTICS permission'
    },
    limits: {
      verificationActions: '20/15min',
      downloads: '50/5min',
      adminActions: '100/10min',
      bulkActions: '10/30min',
      bulkApprovalMaxUsers: 50,
      reminderMaxUsers: 100,
      maxImageSize: '10MB',
      allowedFormats: ['JPG', 'PNG']
    },
    storage: {
      type: 'LOCAL', // ✅ Type de stockage
      documentFolder: 'uploads/documents/',
      baseUrl: process.env.BASE_URL || 'http://localhost:5000'
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
    environment: process.env.NODE_ENV || 'development',
    controllerVersion: '5.0.0-local-storage',
    flutterCompatible: true,
    multerEnabled: true,
    localStorage: true // ✅ Stockage local confirmé
  });
});

// =====================================================
// ROUTES D'INFORMATION
// =====================================================

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
          format: 'CI00000000',
          description: 'Carte d\'identité ivoirienne valide'
        },
        {
          code: 'PASSEPORT',
          nom: 'Passeport',
          format: 'Alphanumerique 6-9 caractères',
          description: 'Passeport ivoirien ou étranger valide'
        },
        {
          code: 'PERMIS_CONDUIRE',
          nom: 'Permis de Conduire',
          format: 'Variable',
          description: 'Permis de conduire valide'
        },
        {
          code: 'ATTESTATION_IDENTITE',
          nom: 'Attestation d\'Identité',
          format: 'Variable',
          description: 'Attestation d\'identité officielle'
        }
      ],
      exigences: {
        qualiteImage: 'Haute résolution, texte lisible',
        format: 'JPEG, PNG (stockage local sécurisé)',
        tailleFichier: 'Maximum 10MB par image',
        validite: 'Document non expiré',
        photosSelfie: 'Photo selfie avec le document obligatoire'
      },
      delaiTraitement: '24-48 heures ouvrables',
      criteresValidation: [
        'Lisibilité du texte',
        'Authenticité du document',
        'Correspondance des informations',
        'Validité du document (date d\'expiration)',
        'Concordance entre document et selfie'
      ],
      processusFlutter: [
        'Prendre photo du document avec ImagePicker',
        'Prendre selfie avec le document avec ImagePicker',
        'Soumettre les 2 images via POST /submit',
        'Sauvegarde locale automatique dans uploads/documents/',
        'Vérification manuelle par administrateur sous 24-48h',
        'Notification email avec résultat'
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
          code: 'NON_SOUMIS',
          nom: 'Non soumis',
          description: 'Aucun document n\'a encore été soumis',
          actions: ['Soumettre 2 images via /submit']
        },
        {
          code: 'EN_ATTENTE',
          nom: 'En attente',
          description: 'Document soumis, en cours de vérification',
          actions: ['Annuler via /cancel', 'Attendre résultat 24-48h']
        },
        {
          code: 'VERIFIE',
          nom: 'Vérifié',
          description: 'Document approuvé et vérifié',
          actions: ['Compte entièrement activé']
        },
        {
          code: 'REJETE',
          nom: 'Rejeté',
          description: 'Document rejeté, nouvelle soumission requise',
          actions: ['Consulter raison du rejet', 'Soumettre de nouveaux documents']
        }
      ],
      processus: [
        'Soumission de 2 images par l\'utilisateur (document + selfie)',
        'Sauvegarde locale sécurisée dans uploads/documents/',
        'Vérification manuelle par un administrateur',
        'Approbation ou rejet avec raison détaillée (min 10 caractères)',
        'Notification email automatique à l\'utilisateur',
        'Mise à jour du statut compte et historique'
      ],
      booleans: {
        isVerified: 'Compte vérifié',
        isPending: 'Vérification en cours',
        isRejected: 'Document rejeté',
        isNotSubmitted: 'Aucun document soumis'
      }
    }
  });
});

// =====================================================
// GESTION CENTRALISÉE DES ERREURS
// =====================================================

/**
 * Middleware d'erreurs spécifique au router de vérification
 */
router.use((error, req, res, next) => {
  console.error('💥 Erreur dans le router vérification:', {
    message: error.message,
    stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    url: req.url,
    method: req.method,
    timestamp: new Date().toISOString(),
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    userId: req.user?.id || req.user?.userId,
    isAdmin: req.user?.type === 'admin'
  });

  // Gestion des erreurs Multer
  if (error.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      success: false,
      code: 'FILE_TOO_LARGE',
      message: 'Fichier trop volumineux (max 10MB par image)',
      timestamp: new Date().toISOString()
    });
  }

  if (error.code === 'LIMIT_FILE_COUNT') {
    return res.status(400).json({
      success: false,
      code: 'TOO_MANY_FILES',
      message: 'Maximum 2 fichiers autorisés',
      timestamp: new Date().toISOString()
    });
  }

  if (error.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({
      success: false,
      code: 'UNEXPECTED_FILE',
      message: 'Champs de fichiers attendus: documentImage et selfieWithDocumentImage',
      timestamp: new Date().toISOString()
    });
  }

  // Gestion des erreurs de fichier
  if (error.code === 'ENOENT') {
    return res.status(404).json({
      success: false,
      code: 'FILE_NOT_FOUND',
      message: 'Document non trouvé',
      timestamp: new Date().toISOString()
    });
  }

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

  // Propager au handler global
  return next(error);
});

// ✅ CORRECTION : Utiliser handleUploadError au lieu de handleMulterError
router.use(handleVerificationUploadError);

// =====================================================
// EXPORT DU ROUTER
// =====================================================

module.exports = router;