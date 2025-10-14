const { Message } = require('../models/Message');
const Conversation = require('../models/Conversation');
const Utilisateur = require('../models/Utilisateur');
const Signalement = require('../models/Signalement');
const presenceService = require('../services/presenceService');
const notificationService = require('../services/notificationService');
const AppError = require('../utils/AppError');

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

    const message = new Message({
      conversationId,
      expediteurId: userId,
      destinataireId,
      contenu,
      typeMessage: 'TEXTE',
      lu: false,
      dateEnvoi: new Date()
    });

    await message.save();

    // Mettre à jour la conversation: dernier message + non lus pour destinataire
    const inc = {};
    if (destinataireId) {
      inc[`nombreMessagesNonLus.${destinataireId}`] = 1;
    }
    await Conversation.updateOne(
      { _id: conversationId },
      {
        $set: {
          derniereActivite: new Date(),
          'statistiques.dernierMessagePar': userId,
          'statistiques.dernierMessageContenu': (contenu || '').slice(0, 100)
        },
        ...(Object.keys(inc).length ? { $inc: inc } : {})
      }
    );

    // Populer le message avec les détails de l'expéditeur
    const populatedMessage = await Message.findById(message._id)
      .populate('expediteurId', 'nom prenom photoProfil');

    // Broadcast temps réel
    try {
      const io = req.app.get('io');
      if (io) {
        io.to(`conversation:${conversationId}`).emit('message:new', { message: populatedMessage });
      }
      // Email offline
      const offline = destinataireId && !presenceService.isOnline(destinataireId.toString());
      if (offline) {
        const destUser = await Utilisateur.findById(destinataireId).select('email nom prenom');
        if (destUser?.email) {
          await notificationService.sendEmail(
            destUser.email,
            'Nouveau message reçu',
            `${req.user.nom} ${req.user.prenom}: ${(contenu || '').slice(0, 120)}`
          );
        }
      }
    } catch (_e) {}

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
      coordonnees,
      destinataireId,
      contenu = 'Position partagée'
    } = req.body;

    const userId = req.user.id;

    const message = new Message({
      conversationId,
      expediteurId: userId,
      destinataireId,
      contenu,
      typeMessage: 'POSITION',
      pieceJointe: {
        type: 'LOCALISATION',
        coordonnees: {
          type: 'Point',
          coordinates: coordonnees
        }
      },
      lu: false,
      dateEnvoi: new Date()
    });

    await message.save();

    const inc2 = {};
    if (destinataireId) {
      inc2[`nombreMessagesNonLus.${destinataireId}`] = 1;
    }
    await Conversation.updateOne(
      { _id: conversationId },
      {
        $set: {
          derniereActivite: new Date(),
          'statistiques.dernierMessagePar': userId,
          'statistiques.dernierMessageContenu': (contenu || 'Position partagée').slice(0, 100)
        },
        ...(Object.keys(inc2).length ? { $inc: inc2 } : {})
      }
    );

    const populatedMessage = await Message.findById(message._id)
      .populate('expediteurId', 'nom prenom photoProfil');

    // Broadcast temps réel
    try {
      const io = req.app.get('io');
      if (io) {
        io.to(`conversation:${conversationId}`).emit('message:new', { message: populatedMessage });
      }
      const offline = destinataireId && !presenceService.isOnline(destinataireId.toString());
      if (offline) {
        const destUser = await Utilisateur.findById(destinataireId).select('email nom prenom');
        if (destUser?.email) {
          await notificationService.sendEmail(
            destUser.email,
            'Nouvelle position reçue',
            `${req.user.nom} ${req.user.prenom}: ${(contenu || 'Position partagée').slice(0, 120)}`
          );
        }
      }
    } catch (_e) {}

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
      parametres = {}
    } = req.body;

    const userId = req.user.id;

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

    const contenu = modeles[modeleUtilise] || req.body.contenu;

    if (!contenu) {
      return res.status(400).json({
        succes: false,
        erreur: 'Modèle non trouvé ou contenu manquant'
      });
    }

    const message = new Message({
      conversationId,
      expediteurId: userId,
      destinataireId,
      contenu,
      typeMessage: 'MODELE_PREDEFINI',
      modeleUtilise,
      lu: false,
      dateEnvoi: new Date()
    });

    await message.save();

    const inc3 = {};
    if (destinataireId) {
      inc3[`nombreMessagesNonLus.${destinataireId}`] = 1;
    }
    await Conversation.updateOne(
      { _id: conversationId },
      {
        $set: {
          derniereActivite: new Date(),
          'statistiques.dernierMessagePar': userId,
          'statistiques.dernierMessageContenu': (contenu || '').slice(0, 100)
        },
        ...(Object.keys(inc3).length ? { $inc: inc3 } : {})
      }
    );

    const populatedMessage = await Message.findById(message._id)
      .populate('expediteurId', 'nom prenom photoProfil');

    // Broadcast temps réel
    try {
      const io = req.app.get('io');
      if (io) {
        io.to(`conversation:${conversationId}`).emit('message:new', { message: populatedMessage });
      }
      const offline = destinataireId && !presenceService.isOnline(destinataireId.toString());
      if (offline) {
        const destUser = await Utilisateur.findById(destinataireId).select('email nom prenom');
        if (destUser?.email) {
          await notificationService.sendEmail(
            destUser.email,
            'Nouveau message',
            `${req.user.nom} ${req.user.prenom}: ${(contenu || '').slice(0, 120)}`
          );
        }
      }
    } catch (_e) {}

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
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const messages = await Message.find({
      conversationId,
      // Ne pas afficher les messages signalés sauf à leurs auteurs
      $or: [
        { estSignale: false },
        { expediteurId: req.user.id }
      ]
    })
    .populate('expediteurId', 'nom prenom photoProfil scoreConfiance')
    .populate('destinataireId', 'nom prenom photoProfil')
    .sort({ dateEnvoi: 1 }) // Plus anciens en premier
    .skip(skip)
    .limit(limit);

    const total = await Message.countDocuments({
      conversationId,
      $or: [
        { estSignale: false },
        { expediteurId: req.user.id }
      ]
    });

    res.json({
      succes: true,
      data: messages,
      pagination: {
        page: page,
        totalPages: Math.ceil(total / limit),
        total: total,
        limit: limit
      }
    });

  } catch (error) {
    console.error('Erreur récupération messages conversation:', error);
    return next(AppError.serverError('Erreur serveur lors de la récupération des messages de conversation', { originalError: error.message }));
  }
};

// Rechercher dans les messages
const rechercherMessages = async (req, res, next) => {
  try {
    const { q, conversationId, dateDebut, dateFin } = req.query;
    const userId = req.user.id;

    if (!q || q.length < 2) {
      return res.status(400).json({
        succes: false,
        erreur: 'La recherche doit contenir au moins 2 caractères'
      });
    }

    let searchQuery = {
      contenu: { $regex: q, $options: 'i' },
      estSignale: false
    };

    // Filtrer par conversation si spécifié
    if (conversationId) {
      const conversation = await Conversation.findById(conversationId);
      if (!conversation || !conversation.participants.includes(userId)) {
        return res.status(403).json({
          succes: false,
          erreur: 'Accès non autorisé'
        });
      }
      searchQuery.conversationId = conversationId;
    } else {
      // Recherche dans toutes les conversations de l'utilisateur
      const userConversations = await Conversation.find({
        participants: userId
      }).select('_id');
      
      const conversationIds = userConversations.map(conv => conv._id);
      searchQuery.conversationId = { $in: conversationIds };
    }

    // Filtrer par date si spécifié
    if (dateDebut || dateFin) {
      searchQuery.dateEnvoi = {};
      if (dateDebut) searchQuery.dateEnvoi.$gte = new Date(dateDebut);
      if (dateFin) searchQuery.dateEnvoi.$lte = new Date(dateFin);
    }

    const messages = await Message.find(searchQuery)
      .populate('expediteurId', 'nom prenom photoProfil')
      .populate('conversationId', 'trajetId')
      .sort({ dateEnvoi: -1 })
      .limit(100);

    res.json({
      succes: true,
      data: messages,
      count: messages.length
    });

  } catch (error) {
    console.error('Erreur recherche messages:', error);
    return next(AppError.serverError('Erreur serveur lors de la recherche de messages', { originalError: error.message }));
  }
};

// Obtenir messages non lus
const obtenirMessagesNonLus = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const messagesNonLus = await Message.find({
      destinataireId: userId,
      lu: false,
      estSignale: false
    })
    .populate('expediteurId', 'nom prenom photoProfil')
    .populate('conversationId', 'trajetId')
    .sort({ dateEnvoi: -1 })
    .limit(100);

    const nombreTotal = await Message.countDocuments({
      destinataireId: userId,
      lu: false,
      estSignale: false
    });

    res.json({
      succes: true,
      data: messagesNonLus,
      nombreTotal
    });

  } catch (error) {
    console.error('Erreur récupération messages non lus:', error);
    return next(AppError.serverError('Erreur serveur lors de la récupération des messages non lus', { originalError: error.message }));
  }
};

// Obtenir statistiques utilisateur
const obtenirStatistiques = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const stats = await Message.aggregate([
      {
        $match: {
          $or: [
            { expediteurId: userId },
            { destinataireId: userId }
          ]
        }
      },
      {
        $group: {
          _id: null,
          totalEnvoyes: {
            $sum: {
              $cond: [{ $eq: ['$expediteurId', userId] }, 1, 0]
            }
          },
          totalRecus: {
            $sum: {
              $cond: [{ $eq: ['$destinataireId', userId] }, 1, 0]
            }
          },
          messagesNonLus: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$destinataireId', userId] },
                    { $eq: ['$lu', false] }
                  ]
                },
                1,
                0
              ]
            }
          }
        }
      }
    ]);

    const statistiques = stats[0] || {
      totalEnvoyes: 0,
      totalRecus: 0,
      messagesNonLus: 0
    };

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
    const { longitude, latitude, rayon = 5000 } = req.query; // rayon en mètres
    const userId = req.user.id;

    // Obtenir les conversations de l'utilisateur
    const userConversations = await Conversation.find({
      participants: userId
    }).select('_id');
    
    const conversationIds = userConversations.map(conv => conv._id);

    const messages = await Message.find({
      conversationId: { $in: conversationIds },
      typeMessage: 'POSITION',
      'pieceJointe.coordonnees': {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [parseFloat(longitude), parseFloat(latitude)]
          },
          $maxDistance: parseInt(rayon)
        }
      },
      estSignale: false
    })
    .populate('expediteurId', 'nom prenom photoProfil')
    .sort({ dateEnvoi: -1 })
    .limit(50);

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
    const userId = req.user.id;

    const message = await Message.findById(messageId);
    
    if (!message) {
      return res.status(404).json({
        succes: false,
        erreur: 'Message non trouvé'
      });
    }

    // Seul le destinataire peut marquer comme lu
    if (message.destinataireId && message.destinataireId.toString() !== userId) {
      return res.status(403).json({
        succes: false,
        erreur: 'Action non autorisée'
      });
    }

    await Message.findByIdAndUpdate(messageId, {
      lu: true,
      dateLecture: new Date()
    });

    res.json({
      succes: true,
      message: 'Message marqué comme lu'
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
    const userId = req.user.id;

    // Marquer tous les messages non lus de cette conversation comme lus
    await Message.updateMany({
      conversationId,
      destinataireId: userId,
      lu: false
    }, {
      lu: true,
      dateLecture: new Date()
    });

    // Réinitialiser le compteur de messages non lus pour cet utilisateur
    await Conversation.updateOne(
      { _id: conversationId },
      { $set: { [`nombreMessagesNonLus.${userId}`]: 0 } }
    );

    try {
      const io = req.app.get('io');
      if (io) io.to(`conversation:${conversationId}`).emit('conversation:read:update', { conversationId, userId });
    } catch (_e) {}

    res.json({
      succes: true,
      message: 'Conversation marquée comme lue'
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
    const { motif, typeSignalement = 'CONTENU', description } = req.body;
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

    // Créer le signalement
    const signalement = new Signalement({
      signalantId: userId,
      signaleId: message.expediteurId,
      messageId: messageId,
      typeSignalement,
      motif,
      description,
      statutTraitement: 'EN_ATTENTE',
      dateSignalement: new Date()
    });

    await signalement.save();

    // Marquer le message comme signalé
    await Message.findByIdAndUpdate(messageId, {
      estSignale: true,
      motifSignalement: motif
    });

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
    const userId = req.user.id;

    const message = await Message.findById(messageId);
    
    if (!message) {
      return res.status(404).json({
        succes: false,
        erreur: 'Message non trouvé'
      });
    }

    // Seul l'expéditeur peut supprimer son message
    if (message.expediteurId.toString() !== userId) {
      return res.status(403).json({
        succes: false,
        erreur: 'Vous ne pouvez supprimer que vos propres messages'
      });
    }

    await Message.findByIdAndDelete(messageId);

    res.json({
      succes: true,
      message: 'Message supprimé avec succès'
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
      .populate('expediteurId', 'nom prenom email scoreConfiance')
      .populate('conversationId', 'trajetId')
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
    const { action, commentaire } = req.body; // action: 'APPROVE' | 'DELETE' | 'WARN'

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
        break;
      case 'DELETE':
        await Message.findByIdAndDelete(messageId);
        return res.json({
          succes: true,
          message: 'Message supprimé par modération'
        });
      case 'WARN':
        message.estSignale = false;
        // Ici vous pourriez envoyer un avertissement à l'utilisateur
        break;
    }

    message.moderateurId = req.user.id;
    await message.save();

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

    // Ici vous pourriez implémenter la logique WebSocket
    // Par exemple, ajouter l'utilisateur à une salle Socket.io

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

    // Ici vous pourriez implémenter la logique pour quitter la salle WebSocket

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