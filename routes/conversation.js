// routes/conversations.js (noter le 's' à la fin)
const express = require('express');
const { body, param, query } = require('express-validator');
const {
  creerConversation,
  obtenirConversationsUtilisateur,
  obtenirDetailsConversation,
  archiverConversation,
  mettreAJourActivite,
  ajouterParticipant,
  retirerParticipant,
  marquerCommeLu,
  supprimerConversation,
  obtenirConversationParTrajet
} = require('../controllers/conversationController');
// Nettoyage: supprimer logs de debug intrusifs


// Middleware d'authentification
const { protect } = require('../middlewares/authMiddleware');

// Middleware de rate limiting - avec fallback si non configuré
let createRateLimit, readRateLimit, sensitiveActionsLimit;

try {
  const { basicRateLimiter } = require('../middlewares/rateLimiter');
  createRateLimit = basicRateLimiter?.strict || ((req, res, next) => next());
  readRateLimit = basicRateLimiter?.standard || ((req, res, next) => next());
  sensitiveActionsLimit = basicRateLimiter?.strict || ((req, res, next) => next());
} catch (error) {
  console.warn('Rate limiter non configuré, utilisation de middlewares par défaut');
  const defaultMiddleware = (req, res, next) => next();
  createRateLimit = defaultMiddleware;
  readRateLimit = defaultMiddleware;
  sensitiveActionsLimit = defaultMiddleware;
}

const router = express.Router();

// =====================================================
// VALIDATEURS DE DONNÉES
// =====================================================
// Validateur pour la création de conversation
const validateCreateConversation = [
  body('trajetId')
    .isMongoId()
    .withMessage('ID de trajet invalide'),
  body('participants')
    .optional()
    .isArray()
    .withMessage('Les participants doivent être un tableau')
    .custom((value) => {
      if (value && value.length > 0) {
        const isValid = value.every(id => /^[0-9a-fA-F]{24}$/.test(id));
        if (!isValid) {
          throw new Error('IDs de participants invalides');
        }
      }
      return true;
    }),
  body('titre')
    .optional()
    .isLength({ min: 1, max: 100 })
    .withMessage('Le titre doit contenir entre 1 et 100 caractères')
    .trim(),
  body('type')
    .optional()
    .isIn(['trajet', 'groupe', 'prive'])
    .withMessage('Type de conversation invalide')
];

// Validateur pour les paramètres de conversation
const validateConversationId = [
  param('id')
    .isMongoId()
    .withMessage('ID de conversation invalide')
];

// Validateur pour les paramètres de trajet
const validateTrajetId = [
  param('trajetId')
    .isMongoId()
    .withMessage('ID de trajet invalide')
];

// Validateur pour la pagination
const validatePagination = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('La page doit être un nombre entier positif'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('La limite doit être entre 1 et 100'),
  query('includeArchived')
    .optional()
    .isBoolean()
    .withMessage('includeArchived doit être un booléen'),
  query('type')
    .optional()
    .isIn(['trajet', 'groupe', 'prive'])
    .withMessage('Type de conversation invalide')
];

// Validateur pour l'archivage
const validateArchive = [
  body('archiver')
    .optional()
    .isBoolean()
    .withMessage('Le paramètre archiver doit être un booléen')
];

// Validateur pour ajouter un participant
const validateAddParticipant = [
  body('utilisateurId')
    .isMongoId()
    .withMessage('ID utilisateur invalide')
];

// Validateur pour retirer un participant
const validateRemoveParticipant = [
  param('utilisateurId')
    .isMongoId()
    .withMessage('ID utilisateur invalide')
];

// Validateur pour les détails de conversation
const validateConversationDetails = [
  query('includeMessages')
    .optional()
    .isBoolean()
    .withMessage('includeMessages doit être un booléen'),
  query('messageLimit')
    .optional()
    .isInt({ min: 1, max: 200 })
    .withMessage('messageLimit doit être entre 1 et 200')
];

// =====================================================
// ROUTES PRINCIPALES
// =====================================================
/**
 * @route   POST /api/conversations
 * @desc    Créer une nouvelle conversation
 * @access  Private
 * @body    { trajetId, participants?, titre?, type? }
 */
router.post('/', createRateLimit, protect, validateCreateConversation, creerConversation);

/**
 * @route   GET /api/conversations
 * @desc    Obtenir toutes les conversations de l'utilisateur connecté
 * @access  Private
 * @query   { page?, limit?, includeArchived?, type? }
 */
router.get('/', readRateLimit, protect, validatePagination, obtenirConversationsUtilisateur);

/**
 * @route   GET /api/conversations/trajet/:trajetId
 * @desc    Obtenir la conversation d'un trajet spécifique
 * @access  Private
 */
router.get('/trajet/:trajetId', readRateLimit, protect, validateTrajetId, obtenirConversationParTrajet);

/**
 * @route   GET /api/conversations/:id
 * @desc    Obtenir les détails d'une conversation
 * @access  Private
 * @query   { includeMessages?, messageLimit? }
 */
router.get('/:id', readRateLimit, protect, validateConversationId, validateConversationDetails, obtenirDetailsConversation);

/**
 * @route   PATCH /api/conversations/:id/archiver
 * @desc    Archiver ou désarchiver une conversation
 * @access  Private
 * @body    { archiver? }
 */
router.patch('/:id/archiver', protect, validateConversationId, validateArchive, archiverConversation);

/**
 * @route   PATCH /api/conversations/:id/activite
 * @desc    Mettre à jour la dernière activité d'une conversation
 * @access  Private
 */
router.patch('/:id/activite', protect, validateConversationId, mettreAJourActivite);

/**
 * @route   PATCH /api/conversations/:id/lire
 * @desc    Marquer tous les messages d'une conversation comme lus
 * @access  Private
 */
router.patch('/:id/lire', protect, validateConversationId, marquerCommeLu);

/**
 * @route   POST /api/conversations/:id/participants
 * @desc    Ajouter un participant à la conversation
 * @access  Private
 * @body    { utilisateurId }
 */
router.post('/:id/participants', sensitiveActionsLimit, protect, validateConversationId, validateAddParticipant, ajouterParticipant);

/**
 * @route   DELETE /api/conversations/:id/participants/:utilisateurId
 * @desc    Retirer un participant de la conversation
 * @access  Private
 */
router.delete('/:id/participants/:utilisateurId', sensitiveActionsLimit, protect, validateConversationId, validateRemoveParticipant, retirerParticipant);

/**
 * @route   DELETE /api/conversations/:id
 * @desc    Supprimer une conversation
 * @access  Private
 */
router.delete('/:id', sensitiveActionsLimit, protect, validateConversationId, supprimerConversation);

// =====================================================
// ROUTES D'INFORMATIONS ET DE DEBUG
// =====================================================
/**
 * @route   GET /api/conversations/info/stats
 * @desc    Obtenir les statistiques des conversations de l'utilisateur
 * @access  Private
 */
router.get('/info/stats', readRateLimit, protect, async (req, res) => {
  try {
    const userId = req.user.id;
    const Conversation = require('../models/Conversation');
    
    // Statistiques rapides
    const stats = await Conversation.aggregate([
      { $match: { participants: userId } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          archivees: {
            $sum: { $cond: [{ $eq: ['$estArchivee', true] }, 1, 0] }
          },
          actives: {
            $sum: { $cond: [{ $eq: ['$estArchivee', false] }, 1, 0] }
          },
          totalMessagesNonLus: {
            $sum: { $ifNull: [`$nombreMessagesNonLus.${userId}`, 0] }
          }
        }
      }
    ]);
    
    const result = stats[0] || {
      total: 0,
      archivees: 0,
      actives: 0,
      totalMessagesNonLus: 0
    };
    
    // Statistiques par type
    const typeStats = await Conversation.aggregate([
      { $match: { participants: userId } },
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 }
        }
      }
    ]);
    
    result.parType = typeStats.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {});
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Erreur récupération stats:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la récupération des statistiques'
    });
  }
});

// =====================================================
// MIDDLEWARE DE GESTION D'ERREURS SPÉCIALISÉ
// =====================================================
// Gestionnaire d'erreurs spécifique aux conversations
router.use((err, req, res, next) => {
  console.error('Erreur dans les routes conversations:', err);
  
  // Erreurs de validation Mongoose spécifiques aux conversations
  if (err.name === 'ValidationError' && err.errors) {
    const conversationErrors = Object.keys(err.errors).filter(key =>
      ['trajetId', 'participants', 'titre', 'type'].includes(key)
    );

    if (conversationErrors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Erreur de validation des données de conversation',
        code: 'CONVERSATION_VALIDATION_ERROR',
        errors: conversationErrors.map(key => ({
          field: key,
          message: err.errors[key].message
        }))
      });
    }
  }
  
  // Erreurs de référence (trajet non trouvé, etc.)
  if (err.name === 'CastError' && err.path === 'trajetId') {
    return res.status(400).json({
      success: false,
      message: 'ID de trajet invalide',
      code: 'INVALID_TRAJET_ID'
    });
  }
  
  // Passer l'erreur au gestionnaire global
  next(err);
});

// =====================================================
// EXPORT
// =====================================================
module.exports = router;
