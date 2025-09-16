// =====================================================
// ROUTES ANALYTICS - Version complète
// =====================================================

const express = require('express');
const { body, query } = require('express-validator');
const router = express.Router();

// Import du contrôleur
const {
  // Statistiques générales
  obtenirStatistiquesGenerales,
  
  // Statistiques évolutives
  obtenirEvolutionInscriptions,
  obtenirEvolutionTrajets,
  obtenirEvolutionReservations,
  
  // Statistiques financières
  obtenirStatistiquesFinancieres,
  
  // Rapports personnalisés
  genererRapportPersonnalise,
  exporterDonnees,
  
  // Cartes thermiques
  obtenirCartesThermiques,
  
  // Signalements
  obtenirStatistiquesSignalements,
  
  // Métriques de performance
  obtenirMetriquesPerformance
} = require('../../controllers/admin/analyticsController');

// Import des middlewares
const { authMiddleware, adminMiddleware } = require('../../middlewares/auth/authMiddleware');
const { rateLimiter } = require('../../middlewares/security/rateLimitMiddleware');

// =====================================================
// MIDDLEWARES DE VALIDATION
// =====================================================

// Validation pour les paramètres de période
const validationPeriode = [
  query('periode')
    .optional()
    .isInt({ min: 1, max: 365 })
    .withMessage('Période doit être entre 1 et 365 jours'),
    
  query('grouper')
    .optional()
    .isIn(['jour', 'semaine', 'mois'])
    .withMessage('Groupement invalide (jour, semaine, mois)')
];

// Validation pour les rapports personnalisés
const validationRapportPersonnalise = [
  body('type')
    .isIn(['utilisateurs', 'trajets', 'reservations', 'signalements'])
    .withMessage('Type de rapport invalide'),
    
  body('dateDebut')
    .optional()
    .isISO8601()
    .withMessage('Format de date de début invalide'),
    
  body('dateFin')
    .optional()
    .isISO8601()
    .withMessage('Format de date de fin invalide'),
    
  body('filtres')
    .optional()
    .isObject()
    .withMessage('Filtres doivent être un objet'),
    
  body('champs')
    .optional()
    .isArray()
    .withMessage('Champs doivent être un tableau'),
    
  body('grouper')
    .optional()
    .isString()
    .isLength({ min: 1, max: 50 })
    .withMessage('Champ de groupement invalide')
];

// Validation pour l'export de données
const validationExportDonnees = [
  query('type')
    .isIn(['utilisateurs', 'trajets', 'reservations', 'signalements'])
    .withMessage('Type de données invalide'),
    
  query('dateDebut')
    .optional()
    .isISO8601()
    .withMessage('Format de date de début invalide'),
    
  query('dateFin')
    .optional()
    .isISO8601()
    .withMessage('Format de date de fin invalide'),
    
  query('format')
    .optional()
    .isIn(['json', 'csv', 'excel'])
    .withMessage('Format d\'export invalide'),
    
  query('limite')
    .optional()
    .isInt({ min: 1, max: 10000 })
    .withMessage('Limite doit être entre 1 et 10,000')
];

// Validation pour les cartes thermiques
const validationCartesThermiques = [
  query('type')
    .optional()
    .isIn(['trajets', 'utilisateurs', 'reservations'])
    .withMessage('Type de carte thermique invalide'),
    
  query('periode')
    .optional()
    .isInt({ min: 1, max: 365 })
    .withMessage('Période doit être entre 1 et 365 jours')
];

// =====================================================
// ROUTES STATISTIQUES GÉNÉRALES
// =====================================================

/**
 * @route   GET /api/analytics/general
 * @desc    Obtenir les statistiques générales de la plateforme
 * @access  Private (Admin)
 * @params  ?periode=30
 */
router.get('/general', [
  authMiddleware,
  adminMiddleware,
  rateLimiter.general,
  ...validationPeriode
], obtenirStatistiquesGenerales);

// =====================================================
// ROUTES STATISTIQUES ÉVOLUTIVES
// =====================================================

/**
 * @route   GET /api/analytics/evolution-inscriptions
 * @desc    Obtenir l'évolution des inscriptions
 * @access  Private (Admin)
 * @params  ?periode=30&grouper=jour
 */
router.get('/evolution-inscriptions', [
  authMiddleware,
  adminMiddleware,
  rateLimiter.general,
  ...validationPeriode
], obtenirEvolutionInscriptions);

/**
 * @route   GET /api/analytics/evolution-trajets
 * @desc    Obtenir l'évolution des trajets
 * @access  Private (Admin)
 * @params  ?periode=30&grouper=jour
 */
router.get('/evolution-trajets', [
  authMiddleware,
  adminMiddleware,
  rateLimiter.general,
  ...validationPeriode
], obtenirEvolutionTrajets);

/**
 * @route   GET /api/analytics/evolution-reservations
 * @desc    Obtenir l'évolution des réservations
 * @access  Private (Admin)
 * @params  ?periode=30&grouper=jour
 */
router.get('/evolution-reservations', [
  authMiddleware,
  adminMiddleware,
  rateLimiter.general,
  ...validationPeriode
], obtenirEvolutionReservations);

// =====================================================
// ROUTES STATISTIQUES FINANCIÈRES
// =====================================================

/**
 * @route   GET /api/analytics/financier
 * @desc    Obtenir les statistiques financières
 * @access  Private (Admin)
 * @params  ?periode=30
 */
router.get('/financier', [
  authMiddleware,
  adminMiddleware,
  rateLimiter.general,
  query('periode')
    .optional()
    .isInt({ min: 1, max: 365 })
    .withMessage('Période doit être entre 1 et 365 jours')
], obtenirStatistiquesFinancieres);

// =====================================================
// ROUTES RAPPORTS PERSONNALISÉS
// =====================================================

/**
 * @route   POST /api/analytics/rapport-personnalise
 * @desc    Générer un rapport personnalisé
 * @access  Private (Admin)
 */
router.post('/rapport-personnalise', [
  authMiddleware,
  adminMiddleware,
  rateLimiter.rapports,
  ...validationRapportPersonnalise
], genererRapportPersonnalise);

/**
 * @route   GET /api/analytics/export-donnees
 * @desc    Obtenir les données pour export CSV/Excel
 * @access  Private (Admin)
 * @params  ?type=utilisateurs&dateDebut=2024-01-01&dateFin=2024-12-31&format=json&limite=1000
 */
router.get('/export-donnees', [
  authMiddleware,
  adminMiddleware,
  rateLimiter.export,
  ...validationExportDonnees
], exporterDonnees);

// =====================================================
// ROUTES CARTES THERMIQUES
// =====================================================

/**
 * @route   GET /api/analytics/cartes-thermiques
 * @desc    Obtenir les cartes thermiques d'activité
 * @access  Private (Admin)
 * @params  ?type=trajets&periode=30
 */
router.get('/cartes-thermiques', [
  authMiddleware,
  adminMiddleware,
  rateLimiter.general,
  ...validationCartesThermiques
], obtenirCartesThermiques);

// =====================================================
// ROUTES SIGNALEMENTS
// =====================================================

/**
 * @route   GET /api/analytics/signalements
 * @desc    Obtenir les statistiques des signalements
 * @access  Private (Admin)
 * @params  ?periode=30
 */
router.get('/signalements', [
  authMiddleware,
  adminMiddleware,
  rateLimiter.general,
  query('periode')
    .optional()
    .isInt({ min: 1, max: 365 })
    .withMessage('Période doit être entre 1 et 365 jours')
], obtenirStatistiquesSignalements);

// =====================================================
// ROUTES MÉTRIQUES DE PERFORMANCE
// =====================================================

/**
 * @route   GET /api/analytics/performance
 * @desc    Obtenir les métriques de performance
 * @access  Private (Admin)
 * @params  ?periode=30
 */
router.get('/performance', [
  authMiddleware,
  adminMiddleware,
  rateLimiter.general,
  query('periode')
    .optional()
    .isInt({ min: 1, max: 365 })
    .withMessage('Période doit être entre 1 et 365 jours')
], obtenirMetriquesPerformance);

// =====================================================
// ROUTES SUPPLÉMENTAIRES POUR TABLEAUX DE BORD
// =====================================================

/**
 * @route   GET /api/analytics/dashboard-complet
 * @desc    Obtenir toutes les données pour un tableau de bord complet
 * @access  Private (Admin)
 */
router.get('/dashboard-complet', [
  authMiddleware,
  adminMiddleware,
  rateLimiter.general,
  query('periode')
    .optional()
    .isInt({ min: 1, max: 365 })
    .withMessage('Période doit être entre 1 et 365 jours')
], async (req, res, next) => {
  try {
    const { periode = '30' } = req.query;
    
    // Simuler un appel à plusieurs contrôleurs
    // Dans un vrai projet, vous appelleriez directement les fonctions
    const response = {
      success: true,
      data: {
        message: 'Dashboard complet - Cette route combinerait plusieurs endpoints analytics',
        periode,
        endpoints: [
          '/api/analytics/general',
          '/api/analytics/financier',
          '/api/analytics/performance',
          '/api/analytics/signalements'
        ]
      }
    };
    
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /api/analytics/resume-quotidien
 * @desc    Obtenir un résumé quotidien d'activité
 * @access  Private (Admin)
 */
router.get('/resume-quotidien', [
  authMiddleware,
  adminMiddleware,
  rateLimiter.general,
  query('date')
    .optional()
    .isISO8601()
    .withMessage('Format de date invalide')
], async (req, res, next) => {
  try {
    const { date = new Date().toISOString() } = req.query;
    
    // Cette route fournirait un résumé quotidien
    const response = {
      success: true,
      data: {
        message: 'Résumé quotidien des activités',
        date,
        resume: {
          nouveauxUtilisateurs: 0,
          nouveauxTrajets: 0,
          nouvellesReservations: 0,
          nouveauxSignalements: 0,
          revenus: 0
        }
      }
    };
    
    res.status(200).json(response);
  } catch (error) {
    next(error);
  }
});

// =====================================================
// MIDDLEWARE DE GESTION D'ERREURS
// =====================================================

// Gestion des erreurs 404 pour les routes analytics non trouvées
router.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route analytics introuvable',
    code: 'ANALYTICS_ROUTE_NOT_FOUND',
    requestedPath: req.originalUrl
  });
});

// Gestion globale des erreurs pour les routes analytics
router.use((error, req, res, _next) => {
  console.error('Erreur dans les routes analytics:', error);
  
  // Erreur de validation Mongoose
  if (error.name === 'ValidationError') {
    const erreurs = Object.values(error.errors).map(err => ({
      champ: err.path,
      message: err.message
    }));
    
    return res.status(400).json({
      success: false,
      message: 'Erreur de validation',
      code: 'MONGOOSE_VALIDATION_ERROR',
      data: { erreurs }
    });
  }
  
  // Erreur de cast (ID invalide)
  if (error.name === 'CastError') {
    return res.status(400).json({
      success: false,
      message: 'ID invalide',
      code: 'INVALID_ID'
    });
  }
  
  // Erreur JWT
  if (error.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      message: 'Token invalide',
      code: 'INVALID_TOKEN'
    });
  }
  
  // Erreur JWT expiré
  if (error.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      message: 'Token expiré',
      code: 'TOKEN_EXPIRED'
    });
  }
  
  // Erreur de timeout MongoDB
  if (error.name === 'MongoTimeoutError') {
    return res.status(503).json({
      success: false,
      message: 'Délai d\'attente de la base de données dépassé',
      code: 'DATABASE_TIMEOUT'
    });
  }
  
  // Erreur par défaut
  res.status(error.statusCode || 500).json({
    success: false,
    message: error.message || 'Erreur serveur interne',
    code: error.code || 'INTERNAL_SERVER_ERROR'
  });
});

module.exports = router;