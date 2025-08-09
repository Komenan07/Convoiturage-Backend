// routes/conversation.js - Version ES6
import express from 'express';
import * as conversationController from '../controllers/conversationController.js';
import { body, param, query } from 'express-validator';
import authMiddleware from '../middleware/auth.js';
import rateLimitMiddleware from '../middleware/rateLimiter.js';


const router = express.Router();

// DEBUG: Vérifier l'import du contrôleur
console.log('conversationController:', conversationController);
console.log('creerConversation:', conversationController.creerConversation);
if (!conversationController.creerConversation) {
  console.error('ERREUR: creerConversation n\'est pas défini!');
}

// Middleware d'authentification pour toutes les routes
router.use(authMiddleware.auth);

// Validations communes
const conversationValidation = {
  create: [
    body('trajetId')
      .isMongoId()
      .withMessage('ID de trajet invalide'),
    body('participants')
      .optional()
      .isArray()
      .withMessage('Les participants doivent être un tableau')
      .custom((value) => {
        if (value && value.some(id => !id.match(/^[0-9a-fA-F]{24}$/))) {
          throw new Error('IDs de participants invalides');
        }
        return true;
      }),
    body('titre')
      .optional()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Le titre doit contenir entre 1 et 100 caractères'),
    body('type')
      .optional()
      .isIn(['trajet', 'groupe', 'prive'])
      .withMessage('Type de conversation invalide')
  ],
  
  mongoId: [
    param('id')
      .isMongoId()
      .withMessage('ID de conversation invalide')
  ],
  
  pagination: [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Le numéro de page doit être un entier positif'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('La limite doit être entre 1 et 100'),
    query('includeArchived')
      .optional()
      .isBoolean()
      .withMessage('includeArchived doit être un booléen')
  ],
  
  participant: [
    body('utilisateurId')
      .isMongoId()
      .withMessage('ID utilisateur invalide')
  ]
};

// IMPORTANT: Routes spécifiques AVANT les routes avec paramètres
/**
 * @route   GET /api/conversations/stats
 * @desc    Obtenir les statistiques des conversations de l'utilisateur
 * @access  Privé
 */
router.get('/stats',
  async (req, res) => {
    try {
      const userId = req.user.id;
      
      // TODO: Implémenter avec vos modèles réels
      // const Conversation = require('../models/Conversation');
      
      // Pour l'instant, retourner des données de test
      res.json({
        success: true,
        data: {
          total: 0,
          archivees: 0,
          nonLues: 0,
          actives: 0
        }
      });
      
    } catch (error) {
      console.error('Erreur statistiques conversations:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur serveur'
      });
    }
  }
);

/**
 * @route   GET /api/conversations/trajet/:trajetId
 * @desc    Obtenir la conversation d'un trajet spécifique
 * @access  Privé (participants du trajet)
 */
router.get('/trajet/:trajetId',
  [
    param('trajetId')
      .isMongoId()
      .withMessage('ID de trajet invalide')
  ],
  async (req, res, next) => {
    try {
      const { trajetId } = req.params;
      const userId = req.user.id;
      
      // TODO: Remplacer par vos modèles réels quand ils seront disponibles
      /*
      const Conversation = await import('../models/Conversation.js');
      const Trajet = await import('../models/Trajet.js');
      
      // Vérifier l'accès au trajet
      const trajet = await Trajet.findById(trajetId);
      if (!trajet) {
        return res.status(404).json({
          success: false,
          message: 'Trajet non trouvé'
        });
      }
      
      const aAcces = trajet.conducteur.toString() === userId || 
                     trajet.passagers.some(p => p.utilisateur.toString() === userId);
      
      if (!aAcces) {
        return res.status(403).json({
          success: false,
          message: 'Accès non autorisé à ce trajet'
        });
      }
      
      const conversation = await Conversation.findByTrajet(trajetId);
      
      if (!conversation) {
        return res.status(404).json({
          success: false,
          message: 'Aucune conversation trouvée pour ce trajet'
        });
      }
      
      // Marquer comme lu
      conversation.marquerCommeLu(userId);
      await conversation.save();
      
      const conversationObj = conversation.toObject();
      conversationObj.messagesNonLus = conversation.nombreMessagesNonLus.get(userId.toString()) || 0;
      */
      
      // Réponse temporaire
      res.json({
        success: true,
        data: {
          id: 'temp-conversation-id',
          trajetId,
          participants: [userId],
          messages: [],
          messagesNonLus: 0
        }
      });
      
    } catch (error) {
      console.error('Erreur récupération conversation trajet:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur serveur'
      });
    }
  }
);

// Routes CRUD principales

/**
 * @route   POST /api/conversations
 * @desc    Créer une nouvelle conversation
 * @access  Privé (utilisateurs authentifiés)
 */
router.post(
  '/create',
  rateLimitMiddleware.createConversation,
  conversationValidation.create,
  conversationController.creerConversation || conversationController.default.creerConversation
);

/**
 * @route   GET /api/conversations
 * @desc    Obtenir toutes les conversations de l'utilisateur
 * @access  Privé (utilisateurs authentifiés)
 * @query   page, limit, includeArchived
 */
router.get('/',
  conversationValidation.pagination,
  conversationController.obtenirConversationsUtilisateur
);

/**
 * @route   GET /api/conversations/:id
 * @desc    Obtenir les détails d'une conversation
 * @access  Privé (participants uniquement)
 */
router.get('/:id',
  conversationValidation.mongoId,
  conversationController.obtenirDetailsConversation
);

/**
 * @route   PUT /api/conversations/:id/archiver
 * @desc    Archiver une conversation
 * @access  Privé (participants uniquement)
 */
router.put('/:id/archiver',
  rateLimitMiddleware.updateConversation,
  conversationValidation.mongoId,
  conversationController.archiverConversation
);

/**
 * @route   PUT /api/conversations/:id/participants
 * @desc    Ajouter un participant à la conversation
 * @access  Privé (conducteur ou admin)
 */
router.put('/:id/participants',
  rateLimitMiddleware.updateConversation,
  [...conversationValidation.mongoId, ...conversationValidation.participant],
  conversationController.ajouterParticipant
);

/**
 * @route   DELETE /api/conversations/:id/participants/:utilisateurId
 * @desc    Retirer un participant de la conversation
 * @access  Privé (conducteur, admin ou l'utilisateur lui-même)
 */
router.delete('/:id/participants/:utilisateurId',
  rateLimitMiddleware.updateConversation,
  [
    param('id').isMongoId().withMessage('ID de conversation invalide'),
    param('utilisateurId').isMongoId().withMessage('ID utilisateur invalide')
  ],
  conversationController.retirerParticipant
);

/**
 * @route   PUT /api/conversations/:id/lire
 * @desc    Marquer les messages de la conversation comme lus
 * @access  Privé (participants uniquement)
 */
router.put('/:id/lire',
  rateLimitMiddleware.readConversation,
  conversationValidation.mongoId,
  conversationController.marquerCommeLu
);

/**
 * @route   DELETE /api/conversations/:id
 * @desc    Supprimer une conversation
 * @access  Privé (conducteur uniquement)
 */
router.delete('/:id',
  rateLimitMiddleware.deleteConversation,
  conversationValidation.mongoId,
  conversationController.supprimerConversation
);

// Middleware de gestion d'erreurs pour les routes de conversations
router.use((error, req, res, next) => {
  console.error('Erreur dans les routes conversations:', error);
  
  if (error.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      message: 'Données de conversation invalides',
      errors: Object.values(error.errors).map(err => err.message)
    });
  }
  
  if (error.name === 'CastError') {
    return res.status(400).json({
      success: false,
      message: 'Format d\'ID invalide'
    });
  }
  
  res.status(500).json({
    success: false,
    message: 'Erreur serveur interne'
  });
});

export default router;