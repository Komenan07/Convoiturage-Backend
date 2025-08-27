const { Message, MessageService } = require('../models/Message');
const Conversation = require('../models/Conversation');
const Utilisateur = require('../models/Utilisateur');
const Signalement = require('../models/Signalement');
const presenceService = require('../services/presenceService');
const notificationService = require('../services/notificationService');
const AppError = require('../utils/AppError');
const mongoose = require('mongoose');

// ===============================
// CONTRÔLEURS POUR LES MESSAGES
// ===============================

// Envoyer un message texte
const envoyerMessageTexte = async (req, res, next) => {
  try {
    const {
      conversationId,
      contenu,
      destinataireId
    } = req.body;

    const userId = req.user.id;

    // Vérifier que la conversation existe et que l'utilisateur y participe
    const conversation = await Conversation.findById(conversationId);
    if (!conversation || !conversation.participants.includes(userId)) {
      return res.status(403).json({
        succes: false,
        erreur: 'Accès non autorisé à cette conversation'
      });
    }

    // Utiliser le service pour créer le message
    const messageData = {
      conversationId,
      expediteurId: userId,
      destinataireId,
      contenu
    };

    const message = await MessageService.envoyerMessageTexte(messageData);

    // Populer le message avec les détails de l'expéditeur
    const populatedMessage = await Message.findById(message._id)
      .populate('expediteurId', 'nom prenom avatar')
      .populate('destinataireId', 'nom prenom avatar');

    // Mettre à jour la conversation
    await Conversation.updateOne(
      { _id: conversationId },
      {
        $set: {
          derniereActivite: new Date(),
          'statistiques.dernierMessagePar': userId,
          'statistiques.dernierMessageContenu': (contenu || '').slice(0, 100)
        }
      }
    );

    // Broadcast temps réel et notifications
    try {
      const io = req.app.get('io');
      if (io) {
        io.to(`conversation:${conversationId}`).emit('message:new', { message: populatedMessage });
      }
      
      // Notification email si utilisateur offline
      if (destinataireId && !presenceService.isOnline(destinataireId.toString())) {
        const destUser = await Utilisateur.findById(destinataireId).select('email nom prenom');
        if (destUser?.email) {
          await notificationService.sendEmail(
            destUser.email,
            'Nouveau message reçu',
            `${req.user.nom} ${req.user.prenom}: ${(contenu || '').slice(0, 120)}`
          );
        }
      }
    } catch (notifError) {
      console.error('Erreur notification:', notifError);
    }

    res.status(201).json({
      succes: true,
      message: 'Message envoyé avec succès',
      data: populatedMessage
    });

  } catch (error) {
    console.error('Erreur envoi message texte:', error);
    return next(AppError.serverError('Erreur serveur lors de l\'envoi du message', { originalError: error.message }));
  }
};

// Envoyer position GPS
const envoyerPosition = async (req, res, next) => {
  try {
    const {
      conversationId,
      longitude,
      latitude,
      destinataireId,
      contenu = 'Position partagée'
    } = req.body;

    const userId = req.user.id;

    // Vérifier que la conversation existe
    const conversation = await Conversation.findById(conversationId);
    if (!conversation || !conversation.participants.includes(userId)) {
      return res.status(403).json({
        succes: false,
        erreur: 'Accès non autorisé à cette conversation'
      });
    }

    // Utiliser le service pour créer le message avec position
    const positionData = {
      conversationId,
      expediteurId: userId,
      destinataireId,
      contenu,
      longitude: parseFloat(longitude),
      latitude: parseFloat(latitude)
    };

    const message = await MessageService.envoyerPosition(positionData);

    // Populer le message
    const populatedMessage = await Message.findById(message._id)
      .populate('expediteurId', 'nom prenom avatar')
      .populate('destinataireId', 'nom prenom avatar');

    // Mettre à jour la conversation
    await Conversation.updateOne(
      { _id: conversationId },
      {
        $set: {
          derniereActivite: new Date(),
          'statistiques.dernierMessagePar': userId,
          'statistiques.dernierMessageContenu': (contenu || 'Position partagée').slice(0, 100)
        }
      }
    );

    // Broadcast temps réel et notifications
    try {
      const io = req.app.get('io');
      if (io) {
        io.to(`conversation:${conversationId}`).emit('message:new', { message: populatedMessage });
      }
      
      if (destinataireId && !presenceService.isOnline(destinataireId.toString())) {
        const destUser = await Utilisateur.findById(destinataireId).select('email nom prenom');
        if (destUser?.email) {
          await notificationService.sendEmail(
            destUser.email,
            'Nouvelle position reçue',
            `${req.user.nom} ${req.user.prenom} a partagé sa position`
          );
        }
      }
    } catch (notifError) {
      console.error('Erreur notification:', notifError);
    }

    res.status(201).json({
      succes: true,
      message: 'Position envoyée avec succès',
      data: populatedMessage
    });

  } catch (error) {
    console.error('Erreur envoi position:', error);
    return next(AppError.serverError('Erreur serveur lors de l\'envoi de la position', { originalError: error.message }));
  }
};

// Utiliser modèle prédéfini
const utiliserModelePredefini = async (req, res, next) => {
  try {
    const {
      conversationId,
      modeleUtilise,
      destinataireId,
      contenu,
      parametres = {}
    } = req.body;

    const userId = req.user.id;

    // Vérifier que la conversation existe
    const conversation = await Conversation.findById(conversationId);
    if (!conversation || !conversation.participants.includes(userId)) {
      return res.status(403).json({
        succes: false,
        erreur: 'Accès non autorisé à cette conversation'
      });
    }

    // Modèles prédéfinis en français local (Côte d'Ivoire)
    const modeles = {
      'ARRIVEE_PROCHE': `Je suis bientôt là, dans environ ${parametres.minutes || 5} minutes`,
      'RETARD': `Désolé, je vais avoir ${parametres.minutes || 10} minutes de retard`,
      'ARRIVEE': 'Je suis arrivé(e) au point de rendez-vous',
      'PROBLEME_CIRCULATION': 'Il y a des embouteillages, on va arriver en retard',
      'PROBLEME_VOITURE': 'J\'ai un petit problème avec la voiture, je vous tiens au courant',
      'MERCI': 'Merci pour ce voyage, tout s\'est très bien passé !',
      'LOCALISATION_DEMANDE': 'Pouvez-vous partager votre position s\'il vous plaît ?',
      'CONFIRMATION': 'C\'est confirmé, on se voit comme prévu',
      'ANNULATION': 'Désolé, je dois annuler le voyage'
    };

    const contenuFinal = contenu || modeles[modeleUtilise];

    if (!contenuFinal) {
      return res.status(400).json({
        succes: false,
        erreur: 'Modèle non trouvé ou contenu manquant'
      });
    }

    // Utiliser le service
    const modeleData = {
      conversationId,
      expediteurId: userId,
      destinataireId,
      modeleUtilise,
      contenu: contenuFinal
    };

    const message = await MessageService.utiliserModelePredefini(modeleData);

    // Populer le message
    const populatedMessage = await Message.findById(message._id)
      .populate('expediteurId', 'nom prenom avatar')
      .populate('destinataireId', 'nom prenom avatar');

    // Mettre à jour la conversation
    await Conversation.updateOne(
      { _id: conversationId },
      {
        $set: {
          derniereActivite: new Date(),
          'statistiques.dernierMessagePar': userId,
          'statistiques.dernierMessageContenu': contenuFinal.slice(0, 100)
        }
      }
    );

    // Broadcast temps réel et notifications
    try {
      const io = req.app.get('io');
      if (io) {
        io.to(`conversation:${conversationId}`).emit('message:new', { message: populatedMessage });
      }
      
      if (destinataireId && !presenceService.isOnline(destinataireId.toString())) {
        const destUser = await Utilisateur.findById(destinataireId).select('email nom prenom');
        if (destUser?.email) {
          await notificationService.sendEmail(
            destUser.email,
            'Nouveau message',
            `${req.user.nom} ${req.user.prenom}: ${contenuFinal.slice(0, 120)}`
          );
        }
      }
    } catch (notifError) {
      console.error('Erreur notification:', notifError);
    }

    res.status(201).json({
      succes: true,
      message: 'Message prédéfini envoyé avec succès',
      data: populatedMessage
    });

  } catch (error) {
    console.error('Erreur envoi modèle prédéfini:', error);
    return next(AppError.serverError('Erreur serveur lors de l\'envoi du modèle prédéfini', { originalError: error.message }));
  }
};

// Obtenir messages d'une conversation
const obtenirMessagesConversation = async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limite = parseInt(req.query.limite || req.query.limit) || 50;
    const depuisDate = req.query.depuisDate;

    // Utiliser le service
    const options = {
      page,
      limite,
      depuisDate
    };

    const result = await MessageService.obtenirMessagesConversation(conversationId, options);

    res.json({
      succes: true,
      data: result.messages,
      pagination: result.pagination
    });

  } catch (error) {
    console.error('Erreur récupération messages conversation:', error);
    return next(AppError.serverError('Erreur serveur lors de la récupération des messages de conversation', { originalError: error.message }));
  }
};

// Rechercher dans les messages
const rechercherMessages = async (req, res, next) => {
  try {
    const { q, typeMessage } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limite = parseInt(req.query.limite || req.query.limit) || 20;
    const utilisateurId = new mongoose.Types.ObjectId(req.user.id);

    if (!q || q.length < 2) {
      return res.status(400).json({
        succes: false,
        erreur: 'La recherche doit contenir au moins 2 caractères'
      });
    }

    // Utiliser le service
    const options = {
      page,
      limite,
      typeMessage
    };

    const result = await MessageService.rechercherMessages(utilisateurId, q, options);

    res.json({
      succes: true,
      data: result.messages,
      pagination: result.pagination
    });

  } catch (error) {
    console.error('Erreur recherche messages:', error);
    return next(AppError.serverError('Erreur serveur lors de la recherche de messages', { originalError: error.message }));
  }
};

// Obtenir messages non lus
const obtenirMessagesNonLus = async (req, res, next) => {
  try {
    const utilisateurId = new mongoose.Types.ObjectId(req.user.id);

    const result = await MessageService.obtenirMessagesNonLus(utilisateurId);

    res.json({
      succes: true,
      data: result.messages,
      nombreTotal: result.count
    });

  } catch (error) {
    console.error('Erreur récupération messages non lus:', error);
    return next(AppError.serverError('Erreur serveur lors de la récupération des messages non lus', { originalError: error.message }));
  }
};

// Obtenir statistiques utilisateur
const obtenirStatistiques = async (req, res, next) => {
  try {
    const utilisateurId = new mongoose.Types.ObjectId(req.user.id);
    const periode = parseInt(req.query.periode) || 30;

    const statistiques = await MessageService.obtenirStatistiques(utilisateurId, periode);

    res.json({
      succes: true,
      data: statistiques
    });

  } catch (error) {
    console.error('Erreur récupération statistiques:', error);
    return next(AppError.serverError('Erreur serveur lors de la récupération des statistiques', { originalError: error.message }));
  }
};

// Rechercher messages par proximité géographique
const rechercherMessagesProximite = async (req, res, next) => {
  try {
    const { longitude, latitude, rayon = 10 } = req.query; // rayon en km
    
    if (!longitude || !latitude) {
      return res.status(400).json({
        succes: false,
        erreur: 'Longitude et latitude sont requises'
      });
    }

    const rayonKm = parseFloat(rayon);
    const messages = await MessageService.rechercherMessagesProximite(
      parseFloat(longitude), 
      parseFloat(latitude), 
      rayonKm
    );

    res.json({
      succes: true,
      data: messages,
      count: messages.length
    });

  } catch (error) {
    console.error('Erreur recherche proximité:', error);
    return next(AppError.serverError('Erreur serveur lors de la recherche géospatiale', { originalError: error.message }));
  }
};

// Marquer message comme lu
const marquerCommeLu = async (req, res, next) => {
  try {
    const { messageId } = req.params;
    const utilisateurId = new mongoose.Types.ObjectId(req.user.id);

    const message = await MessageService.marquerCommeLu(messageId, utilisateurId);

    res.json({
      succes: true,
      message: 'Message marqué comme lu',
      data: message
    });

  } catch (error) {
    console.error('Erreur marquage lecture:', error);
    return next(AppError.serverError('Erreur serveur lors du marquage de lecture', { originalError: error.message }));
  }
};

// Marquer toute une conversation comme lue
const marquerConversationCommeLue = async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    const utilisateurId = new mongoose.Types.ObjectId(req.user.id);

    const result = await MessageService.marquerConversationCommeLue(conversationId, utilisateurId);

    // Broadcast mise à jour temps réel
    try {
      const io = req.app.get('io');
      if (io) {
        io.to(`conversation:${conversationId}`).emit('conversation:read:update', { 
          conversationId, 
          userId: req.user.id 
        });
      }
    } catch (wsError) {
      console.error('Erreur WebSocket:', wsError);
    }

    res.json({
      succes: true,
      message: result.message,
      messagesMarques: result.messagesMarques
    });

  } catch (error) {
    console.error('Erreur marquage conversation lue:', error);
    return next(AppError.serverError('Erreur serveur lors du marquage de conversation lue', { originalError: error.message }));
  }
};

// Signaler un message
const signalerMessage = async (req, res, next) => {
  try {
    const { messageId } = req.params;
    const { motif, description } = req.body;
    const userId = req.user.id;

    const message = await Message.findById(messageId);
    
    if (!message) {
      return res.status(404).json({
        succes: false,
        erreur: 'Message non trouvé'
      });
    }

    // Empêcher de signaler ses propres messages
    if (message.expediteurId.toString() === userId) {
      return res.status(400).json({
        succes: false,
        erreur: 'Vous ne pouvez pas signaler vos propres messages'
      });
    }

    // Vérifier si déjà signalé par cet utilisateur
    const existingReport = await Signalement.findOne({
      signalantId: userId,
      messageId: messageId
    });

    if (existingReport) {
      return res.status(400).json({
        succes: false,
        erreur: 'Vous avez déjà signalé ce message'
      });
    }

    // Utiliser le service pour signaler
    await MessageService.signalerMessage(messageId, motif, userId);

    // Créer le signalement
    const signalement = new Signalement({
      signalantId: userId,
      signaleId: message.expediteurId,
      messageId: messageId,
      typeSignalement: 'CONTENU',
      motif,
      description,
      statutTraitement: 'EN_ATTENTE',
      dateSignalement: new Date()
    });

    await signalement.save();

    res.json({
      succes: true,
      message: 'Message signalé avec succès. Il sera examiné par notre équipe.'
    });

  } catch (error) {
    console.error('Erreur signalement message:', error);
    return next(AppError.serverError('Erreur serveur lors du signalement du message', { originalError: error.message }));
  }
};

// Supprimer un message
const supprimerMessage = async (req, res, next) => {
  try {
    const { messageId } = req.params;
    const utilisateurId = new mongoose.Types.ObjectId(req.user.id);

    const result = await MessageService.supprimerMessage(messageId, utilisateurId);

    res.json({
      succes: true,
      message: result.message
    });

  } catch (error) {
    console.error('Erreur suppression message:', error);
    return next(AppError.serverError('Erreur serveur lors de la suppression du message', { originalError: error.message }));
  }
};

// ===============================
// CONTRÔLEURS ADMIN
// ===============================

// Obtenir messages signalés (admin)
const obtenirMessagesSignales = async (req, res, next) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const messagesSignales = await Message.find({ estSignale: true })
      .populate('expediteurId', 'nom prenom email')
      .populate('moderateurId', 'nom prenom')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Message.countDocuments({ estSignale: true });

    res.json({
      succes: true,
      data: messagesSignales,
      pagination: {
        page: page,
        totalPages: Math.ceil(total / limit),
        total: total,
        limit: limit
      }
    });

  } catch (error) {
    console.error('Erreur récupération messages signalés:', error);
    return next(AppError.serverError('Erreur serveur lors de la récupération des messages signalés', { originalError: error.message }));
  }
};

// Modérer un message (admin)
const modererMessage = async (req, res, next) => {
  try {
    const { messageId } = req.params;
    const { action } = req.body; // action: 'APPROVE' | 'DELETE' | 'WARN'

    const message = await Message.findById(messageId);

    if (!message) {
      return res.status(404).json({
        succes: false,
        erreur: 'Message non trouvé'
      });
    }

    switch (action) {
      case 'APPROVE':
        message.estSignale = false;
        message.motifSignalement = '';
        message.moderateurId = req.user.id;
        await message.save();
        break;
        
      case 'DELETE':
        await Message.findByIdAndDelete(messageId);
        return res.json({
          succes: true,
          message: 'Message supprimé par modération'
        });
        
      case 'WARN':
        message.estSignale = false;
        message.moderateurId = req.user.id;
        await message.save();
        // Ici vous pourriez envoyer un avertissement à l'utilisateur
        break;
        
      default:
        return res.status(400).json({
          succes: false,
          erreur: 'Action non valide'
        });
    }

    res.json({
      succes: true,
      message: 'Action de modération effectuée',
      data: message
    });

  } catch (error) {
    console.error('Erreur modération message:', error);
    return next(AppError.serverError('Erreur serveur lors de la modération du message', { originalError: error.message }));
  }
};

// ===============================
// CONTRÔLEURS WEBSOCKET
// ===============================

// Rejoindre une salle WebSocket
const rejoindreSalleWebSocket = async (req, res, next) => {
  try {
    const { conversationId } = req.body;
    const userId = req.user.id;

    // Vérifier accès à la conversation
    const conversation = await Conversation.findById(conversationId);
    if (!conversation || !conversation.participants.includes(userId)) {
      return res.status(403).json({
        succes: false,
        erreur: 'Accès non autorisé à cette conversation'
      });
    }

    res.json({
      succes: true,
      message: 'Rejoint la salle de conversation en temps réel',
      data: { conversationId, userId }
    });

  } catch (error) {
    console.error('Erreur rejoindre salle WebSocket:', error);
    return next(AppError.serverError('Erreur serveur lors de la rejoindre salle WebSocket', { originalError: error.message }));
  }
};

// Quitter une salle WebSocket
const quitterSalleWebSocket = async (req, res, next) => {
  try {
    const { conversationId } = req.body;
    const userId = req.user.id;

    res.json({
      succes: true,
      message: 'Quitté la salle de conversation en temps réel',
      data: { conversationId, userId }
    });

  } catch (error) {
    console.error('Erreur quitter salle WebSocket:', error);
    return next(AppError.serverError('Erreur serveur lors de la quitter salle WebSocket', { originalError: error.message }));
  }
};

module.exports = {
  envoyerMessageTexte,
  envoyerPosition,
  utiliserModelePredefini,
  obtenirMessagesConversation,
  rechercherMessages,
  obtenirMessagesNonLus,
  obtenirStatistiques,
  rechercherMessagesProximite,
  marquerCommeLu,
  marquerConversationCommeLue,
  signalerMessage,
  supprimerMessage,
  obtenirMessagesSignales,
  modererMessage,
  rejoindreSalleWebSocket,
  quitterSalleWebSocket
};