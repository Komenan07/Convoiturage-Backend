const express = require('express');
const router = express.Router();
const { body, param, query } = require('express-validator');
const { protect, restrictTo } = require('../../middleware/auth');
const { validateRequest } = require('../../middleware/validation');

// Import du contrôleur
const {
  obtenirSignalements,
  obtenirSignalementParId,
  traiterSignalement,
  obtenirUtilisateursAModerer,
  obtenirTrajetsAModerer,
  modererTrajet,
  verifierDocumentIdentite,
  obtenirDashboard
} = require('../../controllers/admin/moderationController');

// =====================================================
// MIDDLEWARE DE PROTECTION
// =====================================================

// Toutes les routes nécessitent une authentification et le rôle de modérateur
router.use(protect);
router.use(restrictTo('moderateur', 'admin'));

// =====================================================
// ROUTES - GESTION DES SIGNALEMENTS
// =====================================================

/**
 * @route   GET /api/moderateur/signalements
 * @desc    Obtenir tous les signalements avec pagination et filtres
 * @access  Private (Modérateur)
 */
router.get('/signalements', [
  query('page').optional().isInt({ min: 1 }).withMessage('La page doit être un entier positif'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('La limite doit être entre 1 et 100'),
  query('statut').optional().isIn(['EN_ATTENTE', 'ACCEPTE', 'REJETE']).withMessage('Statut invalide'),
  query('type').optional().isIn(['UTILISATEUR', 'TRAJET', 'COMMENTAIRE']).withMessage('Type invalide'),
  query('dateDebut').optional().isISO8601().withMessage('Format de date invalide'),
  query('dateFin').optional().isISO8601().withMessage('Format de date invalide'),
  query('sort').optional().isString().withMessage('Critère de tri invalide'),
  validateRequest
], obtenirSignalements);

/**
 * @route   GET /api/moderateur/signalements/:id
 * @desc    Obtenir un signalement par ID
 * @access  Private (Modérateur)
 */
router.get('/signalements/:id', [
  param('id').isMongoId().withMessage('ID de signalement invalide'),
  validateRequest
], obtenirSignalementParId);

/**
 * @route   PATCH /api/moderateur/signalements/:id/traiter
 * @desc    Traiter un signalement (accepter/rejeter)
 * @access  Private (Modérateur)
 */
router.patch('/signalements/:id/traiter', [
  param('id').isMongoId().withMessage('ID de signalement invalide'),
  body('decision')
    .notEmpty()
    .isIn(['ACCEPTE', 'REJETE', 'EN_ATTENTE'])
    .withMessage('Décision requise et doit être ACCEPTE, REJETE ou EN_ATTENTE'),
  body('commentaire')
    .optional()
    .isString()
    .isLength({ max: 500 })
    .withMessage('Le commentaire ne peut excéder 500 caractères'),
  body('actionUtilisateur')
    .optional()
    .isIn(['AVERTISSEMENT', 'SUSPENSION', 'BLOCAGE'])
    .withMessage('Action utilisateur invalide'),
  validateRequest
], traiterSignalement);

// =====================================================
// ROUTES - MODÉRATION DE CONTENU
// =====================================================

/**
 * @route   GET /api/moderateur/utilisateurs-a-moderer
 * @desc    Obtenir les utilisateurs nécessitant une modération
 * @access  Private (Modérateur)
 */
router.get('/utilisateurs-a-moderer', [
  query('page').optional().isInt({ min: 1 }).withMessage('La page doit être un entier positif'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('La limite doit être entre 1 et 100'),
  query('type')
    .optional()
    .isIn(['NOUVEAUX', 'NON_VERIFIES', 'CONDUCTEURS', 'SIGNALEMENTS'])
    .withMessage('Type de filtre invalide'),
  query('sort').optional().isString().withMessage('Critère de tri invalide'),
  validateRequest
], obtenirUtilisateursAModerer);

/**
 * @route   GET /api/moderateur/trajets-a-moderer
 * @desc    Obtenir les trajets nécessitant une modération
 * @access  Private (Modérateur)
 */
router.get('/trajets-a-moderer', [
  query('page').optional().isInt({ min: 1 }).withMessage('La page doit être un entier positif'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('La limite doit être entre 1 et 100'),
  query('type')
    .optional()
    .isIn(['SIGNALES', 'PRIX_ANORMAUX', 'NOUVEAUX'])
    .withMessage('Type de filtre invalide'),
  query('sort').optional().isString().withMessage('Critère de tri invalide'),
  validateRequest
], obtenirTrajetsAModerer);

/**
 * @route   PATCH /api/moderateur/trajets/:id/moderer
 * @desc    Modérer un trajet (approuver/rejeter/suspendre)
 * @access  Private (Modérateur)
 */
router.patch('/trajets/:id/moderer', [
  param('id').isMongoId().withMessage('ID de trajet invalide'),
  body('action')
    .notEmpty()
    .isIn(['APPROUVER', 'REJETER', 'SUSPENDRE'])
    .withMessage('Action requise et doit être APPROUVER, REJETER ou SUSPENDRE'),
  body('raison')
    .if(body('action').not().equals('APPROUVER'))
    .notEmpty()
    .isString()
    .isLength({ min: 10, max: 500 })
    .withMessage('Raison requise pour le rejet/suspension (10-500 caractères)'),
  validateRequest
], modererTrajet);

/**
 * @route   PATCH /api/moderateur/utilisateurs/:id/verifier-document
 * @desc    Vérifier le document d'identité d'un utilisateur
 * @access  Private (Modérateur)
 */
router.patch('/utilisateurs/:id/verifier-document', [
  param('id').isMongoId().withMessage('ID utilisateur invalide'),
  body('statutVerification')
    .notEmpty()
    .isIn(['VERIFIE', 'REJETE', 'EN_ATTENTE'])
    .withMessage('Statut de vérification requis et doit être VERIFIE, REJETE ou EN_ATTENTE'),
  body('raisonRejet')
    .if(body('statutVerification').equals('REJETE'))
    .notEmpty()
    .isString()
    .isLength({ min: 10, max: 300 })
    .withMessage('Raison de rejet requise (10-300 caractères)'),
  validateRequest
], verifierDocumentIdentite);

// =====================================================
// ROUTES - TABLEAU DE BORD
// =====================================================

/**
 * @route   GET /api/moderateur/dashboard
 * @desc    Obtenir le tableau de bord du modérateur avec statistiques
 * @access  Private (Modérateur)
 */
router.get('/dashboard', obtenirDashboard);

// =====================================================
// ROUTES SUPPLÉMENTAIRES UTILES
// =====================================================

/**
 * @route   GET /api/moderateur/statistiques
 * @desc    Obtenir des statistiques détaillées de modération
 * @access  Private (Modérateur)
 */
router.get('/statistiques', [
  query('periode')
    .optional()
    .isIn(['7j', '30j', '3m', '6m', '1a'])
    .withMessage('Période invalide (7j, 30j, 3m, 6m, 1a)'),
  validateRequest
], async (req, res, _next) => {
  // Cette route pourrait être ajoutée au contrôleur pour des stats avancées
  res.status(501).json({
    success: false,
    message: 'Route non implémentée - à ajouter au contrôleur'
  });
});

/**
 * @route   GET /api/moderateur/signalements/:id/historique
 * @desc    Obtenir l'historique des actions sur un signalement
 * @access  Private (Modérateur)
 */
router.get('/signalements/:id/historique', [
  param('id').isMongoId().withMessage('ID de signalement invalide'),
  validateRequest
], async (req, res, _next) => {
  // Cette route pourrait être ajoutée pour tracer l'historique
  res.status(501).json({
    success: false,
    message: 'Route non implémentée - à ajouter au contrôleur'
  });
});

/**
 * @route   POST /api/moderateur/actions-groupees
 * @desc    Effectuer des actions groupées sur plusieurs signalements
 * @access  Private (Modérateur)
 */
router.post('/actions-groupees', [
  body('signalements')
    .isArray({ min: 1 })
    .withMessage('Liste des signalements requise'),
  body('signalements.*')
    .isMongoId()
    .withMessage('IDs de signalements invalides'),
  body('action')
    .notEmpty()
    .isIn(['ACCEPTER_TOUS', 'REJETER_TOUS', 'MARQUER_TRAITES'])
    .withMessage('Action groupée invalide'),
  body('commentaire')
    .optional()
    .isString()
    .isLength({ max: 500 })
    .withMessage('Commentaire trop long (max 500 caractères)'),
  validateRequest
], async (req, res, _next) => {
  // Cette route pourrait être ajoutée pour les actions en lot
  res.status(501).json({
    success: false,
    message: 'Route non implémentée - à ajouter au contrôleur'
  });
});

module.exports = router;