// routes/shareTrajet.routes.js
const express                           = require('express');
const { body, param, validationResult } = require('express-validator');
const shareCtrl                         = require('../controllers/ShareTrajetController');
const { authMiddleware }                = require('../middlewares/authMiddleware');

const router = express.Router();

// ===============================================
// MIDDLEWARE DE VALIDATION DES ERREURS
// (même pattern que trajetRoutes.js)
// ===============================================

/**
 * Middleware centralisé pour gérer les erreurs de validation
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Erreurs de validation',
      errors: errors.array().map(error => ({
        champ:   error.path || error.param,
        message: error.msg,
        valeur:  error.value
      }))
    });
  }
  next();
};

// ===============================================
// VALIDATIONS RÉUTILISABLES
// ===============================================

/**
 * Validation des informations du proche
 */
const validateProche = [
  body('proche')
    .notEmpty().withMessage('Les informations du proche sont requises'),

  body('proche.nom')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Le nom du proche doit contenir entre 2 et 100 caractères'),

  body('proche.telephone')
    .optional()
    .trim()
    .matches(/^\+?[0-9]{8,15}$/)
    .withMessage('Le numéro de téléphone est invalide (ex: +2250700000000)'),

  body('proche.email')
    .optional()
    .trim()
    .isEmail()
    .withMessage('L\'adresse email est invalide')
    .normalizeEmail(),

  // Au moins un contact requis + cohérence canal ↔ contact
  body('proche').custom((proche, { req }) => {
    const canaux = req.body.canaux || [];

    if (!proche?.telephone && !proche?.email) {
      throw new Error('Le proche doit avoir au moins un numéro de téléphone ou une adresse email');
    }
    if (canaux.includes('SMS') && !proche?.telephone) {
      throw new Error('Un numéro de téléphone est requis pour le canal SMS');
    }
    if (canaux.includes('EMAIL') && !proche?.email) {
      throw new Error('Une adresse email est requise pour le canal EMAIL');
    }
    return true;
  })
];

/**
 * Validation des canaux de partage
 */
const validateCanaux = [
  body('canaux')
    .isArray({ min: 1 })
    .withMessage('Veuillez sélectionner au moins un canal de partage'),

  body('canaux.*')
    .isIn(['SMS', 'EMAIL', 'WHATSAPP'])
    .withMessage('Canal invalide. Valeurs acceptées : SMS, EMAIL, WHATSAPP')
];

// ===============================================
// ROUTE PUBLIQUE — sans authentification
// Accessible par le proche via son lien de suivi
// ===============================================

/**
 * @route   GET /api/suivi/:token
 * @desc    Consulter les informations d'un trajet via le lien de suivi
 * @access  Public (aucune auth requise)
 *
 * ⚠️ Cette route doit être montée AVANT le middleware d'auth global dans app.js
 */
router.get('/suivi/:token',
  [
    param('token')
      .notEmpty().withMessage('Token manquant')
      .isLength({ min: 10, max: 100 })
      .withMessage('Token invalide')
      .matches(/^[a-f0-9]+$/i)
      .withMessage('Format de token invalide')
  ],
  handleValidationErrors,
  shareCtrl.suivreTrajet
);

// ===============================================
// ROUTES PROTÉGÉES — authentification requise
// ===============================================

/**
 * @route   POST /api/trajets/:id/partager
 * @desc    Partager un trajet à un proche (SMS / Email / WhatsApp)
 * @access  Privé (conducteur ou passager du trajet)
 */
router.post('/trajets/:id/partager',
  authMiddleware,
  [
    param('id')
      .isMongoId().withMessage('ID du trajet invalide'),

    ...validateProche,
    ...validateCanaux
  ],
  handleValidationErrors,
  shareCtrl.partagerTrajet
);

/**
 * @route   GET /api/trajets/:id/partages
 * @desc    Lister tous les partages actifs d'un trajet
 * @access  Privé (conducteur ou passager qui a partagé)
 *
 * ⚠️ Déclarée AVANT /trajets/partages/:partageId
 * pour éviter que "partages" soit capturé par :id
 */
router.get('/trajets/:id/partages',
  authMiddleware,
  [
    param('id')
      .isMongoId().withMessage('ID du trajet invalide')
  ],
  handleValidationErrors,
  shareCtrl.listerPartages
);

/**
 * @route   DELETE /api/trajets/partages/:partageId
 * @desc    Révoquer un lien de suivi
 * @access  Privé (utilisateur qui a créé le partage)
 *
 * ⚠️ Déclarée AVANT toute route générique /:id
 * pour éviter les conflits de paramètres
 */
router.delete('/trajets/partages/:partageId',
  authMiddleware,
  [
    param('partageId')
      .isMongoId().withMessage('ID du partage invalide')
  ],
  handleValidationErrors,
  shareCtrl.revoquerPartage
);

// ===============================================
// ROUTE DE SANTÉ (HEALTH CHECK)
// (même pattern que trajetRoutes.js)
// ===============================================

/**
 * @route   GET /api/partage/health
 * @desc    Vérifier l'état de santé du service de partage
 * @access  Public
 */
router.get('/health', (req, res) => {
  res.json({
    success:   true,
    message:   'Service de partage de trajet opérationnel',
    timestamp: new Date().toISOString(),
    version:   '1.0.0',
    endpoints: {
      public: [
        'GET /suivi/:token - Consulter le suivi d\'un trajet (sans auth)'
      ],
      prive: [
        'POST /trajets/:id/partager  - Partager un trajet à un proche',
        'GET  /trajets/:id/partages  - Lister les partages d\'un trajet',
        'DELETE /trajets/partages/:partageId - Révoquer un lien de suivi'
      ]
    }
  });
});

// ===============================================
// GESTION CENTRALISÉE DES ERREURS
// (même pattern que trajetRoutes.js)
// ===============================================

router.use((error, req, res, next) => {
  console.error('Erreur dans le router shareTrajet:', {
    message:   error.message,
    stack:     error.stack,
    url:       req.url,
    method:    req.method,
    body:      req.body,
    timestamp: new Date().toISOString()
  });

  // Erreurs de validation Mongoose
  if (error.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      code:    'VALIDATION_ERROR',
      message: 'Erreur de validation des données',
      errors:  Object.values(error.errors).map(err => ({
        champ:   err.path,
        message: err.message,
        valeur:  err.value
      })),
      timestamp: new Date().toISOString()
    });
  }

  // CastError — ID MongoDB invalide
  if (error.name === 'CastError' && error.kind === 'ObjectId') {
    return res.status(400).json({
      success:   false,
      code:      'INVALID_ID',
      message:   'Format d\'ID invalide',
      timestamp: new Date().toISOString()
    });
  }

  // Duplication (token déjà existant — très rare avec crypto.randomBytes)
  if (error.code === 11000) {
    return res.status(409).json({
      success:   false,
      code:      'DUPLICATE_ERROR',
      message:   'Un partage similaire existe déjà',
      timestamp: new Date().toISOString()
    });
  }

  next(error);
});

module.exports = router;

// ===============================================
// 🔌 INTÉGRATION DANS app.js / server.js
// ===============================================
//
//   const shareTrajetRoutes = require('./routes/shareTrajet.routes');
//   app.use('/api', shareTrajetRoutes);
//
// ⚠️ Si tu as un authMiddleware global sur /api,
// monte ce router AVANT lui pour que /suivi/:token
// reste accessible publiquement :
//
//   app.use('/api', shareTrajetRoutes);   // ← AVANT
//   app.use('/api', authMiddlewareGlobal);
//   app.use('/api', autresRoutes);