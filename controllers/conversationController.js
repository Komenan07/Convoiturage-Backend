// controllers/conversationController.js - Version CommonJS
const { validationResult } = require('express-validator');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const AppError = require('../utils/AppError');

// DEBUG: S'assurer que le module se charge correctement
console.log('Chargement du conversationController (CommonJS)...');

// =====================================================
// CREATE - CRÉER UNE CONVERSATION
// =====================================================

const creerConversation = async (req, res, next) => {
  console.log('Appel de creerConversation');
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Erreurs de validation',
        errors: errors.array()
      });
    }

    const { trajetId, participants, titre, type } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Utilisateur non authentifié'
      });
    }

    // Vérifier si une conversation existe déjà pour ce trajet
    const conversationExistante = await Conversation.findByTrajet(trajetId);
    if (conversationExistante) {
      // Populate pour cohérence avec la création
      const populated = await Conversation.findById(conversationExistante._id)
        .populate('trajetId', 'pointDepart pointArrivee dateDepart')
        .populate('participants', 'nom prenom');
      
      return res.status(200).json({
        success: true,
        message: 'Conversation existante récupérée',
        data: populated,
        existante: true
      });
    }

    // Créer la nouvelle conversation
    const conversation = new Conversation({
      trajetId,
      participants: participants || [userId],
      titre: titre || `Conversation pour trajet ${trajetId}`,
      type: type || 'trajet',
      derniereActivite: new Date(),
      estArchivee: false
    });

    // Initialiser les messages non lus pour tous les participants
    conversation.participants.forEach(participantId => {
      conversation.nombreMessagesNonLus.set(participantId.toString(), 0);
    });

    const savedConversation = await conversation.save();
    
    // Populate pour la réponse
    const populatedConversation = await Conversation.findById(savedConversation._id)
      .populate('trajetId', 'pointDepart pointArrivee dateDepart')
      .populate('participants', 'nom prenom');

    res.status(201).json({
      success: true,
      message: 'Conversation créée avec succès',
      data: populatedConversation
    });

  } catch (error) {
    console.error('Erreur création conversation:', error);
    return next(AppError.serverError('Erreur serveur lors de la création de la conversation', { originalError: error.message }));
  }
};

// =====================================================
// READ - OBTENIR LES CONVERSATIONS D'UN UTILISATEUR
// =====================================================

const obtenirConversationsUtilisateur = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Erreurs de validation',
        errors: errors.array()
      });
    }

    const { page = 1, limit = 10, includeArchived = false, type } = req.query;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Utilisateur non authentifié'
      });
    }

    // Construire le query
    const query = {
      participants: userId,
      estArchivee: includeArchived === 'true' ? { $in: [true, false] } : false
    };

    if (type) {
      query.type = type;
    }

    const conversations = await Conversation.find(query)
      .populate('trajetId', 'pointDepart pointArrivee dateDepart nombrePlaces prixParPlace statut')
      .populate('participants', 'nom prenom email photoProfil')
      .populate('statistiques.dernierMessagePar', 'nom prenom')
      .sort({ derniereActivite: -1 })
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await Conversation.countDocuments(query);

    // Ajouter les informations de messages non lus pour l'utilisateur
    const conversationsAvecNonLus = conversations.map(conv => {
      const convObj = conv.toObject();
      convObj.messagesNonLus = conv.nombreMessagesNonLus.get(userId.toString()) || 0;
      return convObj;
    });

    res.json({
      success: true,
      data: {
        conversations: conversationsAvecNonLus,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit)) || 0
        }
      }
    });

  } catch (error) {
    console.error('Erreur récupération conversations:', error);
    return next(AppError.serverError('Erreur serveur lors de la récupération des conversations', { originalError: error.message }));
  }
};

// =====================================================
// READ - OBTENIR LES DÉTAILS D'UNE CONVERSATION
// =====================================================

const obtenirDetailsConversation = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Erreurs de validation',
        errors: errors.array()
      });
    }

    const { id } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Utilisateur non authentifié'
      });
    }

    const conversation = await Conversation.findById(id)
      .populate('trajetId')
      .populate('participants', 'nom prenom email photoProfil telephone')
      .populate('statistiques.dernierMessagePar', 'nom prenom');

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation non trouvée'
      });
    }

    // Vérifier que l'utilisateur est participant
    if (!conversation.participants.some(p => p._id.toString() === userId)) {
      return res.status(403).json({
        success: false,
        message: 'Accès non autorisé à cette conversation'
      });
    }

    // Récupérer les messages récents (optionnel)
    const { includeMessages = true, messageLimit = 50 } = req.query;
    let messages = [];
    
    if (includeMessages === 'true') {
      messages = await Message.find({ conversationId: id })
        .populate('expediteur', 'nom prenom photoProfil')
        .sort({ createdAt: -1 })
        .limit(parseInt(messageLimit));
      messages.reverse(); // Pour avoir l'ordre chronologique
    }

    const convObj = conversation.toObject();
    convObj.messagesNonLus = conversation.nombreMessagesNonLus.get(userId.toString()) || 0;
    convObj.messages = messages;

    res.json({
      success: true,
      data: convObj
    });

  } catch (error) {
    console.error('Erreur détails conversation:', error);
    return next(AppError.serverError('Erreur serveur lors de la récupération des détails', { originalError: error.message }));
  }
};

// =====================================================
// UPDATE - ARCHIVER UNE CONVERSATION
// =====================================================

const archiverConversation = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Erreurs de validation',
        errors: errors.array()
      });
    }

    const { id } = req.params;
    const { archiver = true } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Utilisateur non authentifié'
      });
    }

    const conversation = await Conversation.findById(id);
    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation non trouvée'
      });
    }

    // Vérifier que l'utilisateur est participant
    if (!conversation.participants.includes(userId)) {
      return res.status(403).json({
        success: false,
        message: 'Accès non autorisé à cette conversation'
      });
    }

    conversation.estArchivee = archiver;
    await conversation.save();

    res.json({
      success: true,
      message: archiver ? 'Conversation archivée avec succès' : 'Conversation désarchivée avec succès',
      data: { estArchivee: conversation.estArchivee }
    });

  } catch (error) {
    console.error('Erreur archivage conversation:', error);
    return next(AppError.serverError('Erreur serveur lors de l\'archivage', { originalError: error.message }));
  }
};

// =====================================================
// UPDATE - METTRE À JOUR LA DERNIÈRE ACTIVITÉ
// =====================================================

const mettreAJourActivite = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Utilisateur non authentifié'
      });
    }

    const conversation = await Conversation.findById(id);
    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation non trouvée'
      });
    }

    if (!conversation.participants.includes(userId)) {
      return res.status(403).json({
        success: false,
        message: 'Accès non autorisé à cette conversation'
      });
    }

    conversation.derniereActivite = new Date();
    await conversation.save();

    res.json({
      success: true,
      message: 'Activité mise à jour',
      data: { derniereActivite: conversation.derniereActivite }
    });

  } catch (error) {
    console.error('Erreur mise à jour activité:', error);
    return next(AppError.serverError('Erreur serveur lors de la mise à jour', { originalError: error.message }));
  }
};

// =====================================================
// GESTION DES PARTICIPANTS
// =====================================================

const ajouterParticipant = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Erreurs de validation',
        errors: errors.array()
      });
    }

    const { id } = req.params;
    const { utilisateurId } = req.body;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Utilisateur non authentifié'
      });
    }

    const conversation = await Conversation.findById(id);
    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation non trouvée'
      });
    }

    // Vérifier les permissions (seuls les participants actuels peuvent ajouter)
    if (!conversation.participants.includes(userId)) {
      return res.status(403).json({
        success: false,
        message: 'Vous n\'avez pas l\'autorisation d\'ajouter des participants'
      });
    }

    // Ajouter le participant
    conversation.ajouterParticipant(utilisateurId);
    await conversation.save();

    const updatedConversation = await Conversation.findById(id)
      .populate('participants', 'nom prenom email photoProfil');

    res.json({
      success: true,
      message: 'Participant ajouté avec succès',
      data: updatedConversation
    });

  } catch (error) {
    console.error('Erreur ajout participant:', error);
    return next(AppError.serverError('Erreur serveur lors de l\'ajout du participant', { originalError: error.message }));
  }
};

const retirerParticipant = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Erreurs de validation',
        errors: errors.array()
      });
    }

    const { id, utilisateurId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Utilisateur non authentifié'
      });
    }

    const conversation = await Conversation.findById(id);
    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation non trouvée'
      });
    }

    // Vérifier les permissions (participant peut se retirer lui-même)
    if (!conversation.participants.includes(userId) || 
        (utilisateurId !== userId && !conversation.participants.includes(userId))) {
      return res.status(403).json({
        success: false,
        message: 'Accès non autorisé'
      });
    }

    conversation.retirerParticipant(utilisateurId);
    await conversation.save();

    const updatedConversation = await Conversation.findById(id)
      .populate('participants', 'nom prenom email photoProfil');

    res.json({
      success: true,
      message: 'Participant retiré avec succès',
      data: updatedConversation
    });

  } catch (error) {
    console.error('Erreur retrait participant:', error);
    return next(AppError.serverError('Erreur serveur lors du retrait du participant', { originalError: error.message }));
  }
};

// =====================================================
// GESTION DES MESSAGES NON LUS
// =====================================================

const marquerCommeLu = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Erreurs de validation',
        errors: errors.array()
      });
    }

    const { id } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Utilisateur non authentifié'
      });
    }

    const conversation = await Conversation.findById(id);
    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation non trouvée'
      });
    }

    if (!conversation.participants.includes(userId)) {
      return res.status(403).json({
        success: false,
        message: 'Accès non autorisé à cette conversation'
      });
    }

    conversation.marquerCommeLu(userId);
    await conversation.save();

    // Émettre l'événement socket pour notifier les autres participants en temps réel
    const io = req.app.get('io');
    if (io) {
      const conversationRoom = `conversation:${id}`;
      io.to(conversationRoom).emit('conversation_marked_read', {
        conversationId: id,
        userId,
        timestamp: new Date()
      });
    }

    res.json({
      success: true,
      message: 'Messages marqués comme lus',
      data: { 
        messagesNonLus: conversation.nombreMessagesNonLus.get(userId.toString()) || 0 
      }
    });

  } catch (error) {
    console.error('Erreur marquage lecture:', error);
    return next(AppError.serverError('Erreur serveur lors du marquage', { originalError: error.message }));
  }
};

// =====================================================
// DELETE - SUPPRIMER UNE CONVERSATION
// =====================================================

const supprimerConversation = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Erreurs de validation',
        errors: errors.array()
      });
    }

    const { id } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Utilisateur non authentifié'
      });
    }

    const conversation = await Conversation.findById(id);
    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation non trouvée'
      });
    }

    // Seuls les participants peuvent supprimer (ou implémenter une logique admin)
    if (!conversation.participants.includes(userId)) {
      return res.status(403).json({
        success: false,
        message: 'Vous n\'avez pas l\'autorisation de supprimer cette conversation'
      });
    }

    // Supprimer la conversation (les messages seront supprimés via le middleware pre)
    await conversation.deleteOne();

    res.json({
      success: true,
      message: 'Conversation supprimée avec succès'
    });

  } catch (error) {
    console.error('Erreur suppression conversation:', error);
    return next(AppError.serverError('Erreur serveur lors de la suppression', { originalError: error.message }));
  }
};

// =====================================================
// FONCTIONS UTILITAIRES
// =====================================================

const obtenirConversationParTrajet = async (req, res, next) => {
  try {
    const { trajetId } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Utilisateur non authentifié'
      });
    }

    const conversation = await Conversation.findByTrajet(trajetId)
      .populate('participants', 'nom prenom email photoProfil');

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Aucune conversation trouvée pour ce trajet'
      });
    }

    // Vérifier l'accès
    if (!conversation.participants.some(p => p._id.toString() === userId.toString())) {
      return res.status(403).json({
        success: false,
        message: 'Accès non autorisé à cette conversation'
      });
    }

    const convObj = conversation.toObject();
    convObj.messagesNonLus = conversation.nombreMessagesNonLus.get(userId.toString()) || 0;

    res.json({
      success: true,
      data: convObj
    });

  } catch (error) {
    console.error('Erreur récupération conversation par trajet:', error);
    return next(AppError.serverError('Erreur serveur lors de la récupération', { originalError: error.message }));
  }
};

// Export des fonctions
module.exports = {
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
};

console.log('✓ Tous les exports définis correctement');