const { Message } = require('../models/Message');
const Conversation = require('../models/Conversation');
const AppError = require('../utils/AppError');
const mongoose = require('mongoose');

class MessageService {

  /**
   * Envoyer un message texte
   */
  static async envoyerMessageTexte(data) {
    try {
      const {
        conversationId,
        expediteurId,
        destinataireId,
        contenu
      } = data;

      // Validation
      if (!contenu || contenu.trim().length === 0) {
        throw new AppError('Le contenu du message est requis', 400);
      }

      if (!conversationId || !expediteurId) {
        throw new AppError('ID conversation et expéditeur requis', 400);
      }

      // Vérifier que la conversation existe
      const conversation = await Conversation.findById(conversationId);
      if (!conversation) {
        throw new AppError('Conversation non trouvée', 404);
      }

      // Vérifier l'autorisation
      if (!conversation.participants.includes(expediteurId)) {
        throw new AppError('Vous n\'êtes pas autorisé à envoyer des messages dans cette conversation', 403);
      }

      // Créer le message
      const message = new Message({
        conversationId: new mongoose.Types.ObjectId(conversationId),
        expediteurId: new mongoose.Types.ObjectId(expediteurId),
        destinataireId: destinataireId ? new mongoose.Types.ObjectId(destinataireId) : null,
        contenu: contenu.trim(),
        typeMessage: 'TEXTE',
        dateEnvoi: new Date(),
        lu: false
      });

      return await message.save();
    } catch (error) {
      throw new Error(`Erreur envoi message: ${error.message}`);
    }
  }

  /**
   * Envoyer une position GPS
   */
  static async envoyerPosition(data) {
    try {
      const {
        conversationId,
        expediteurId,
        destinataireId,
        contenu = 'Position partagée',
        longitude,
        latitude
      } = data;

      // Validation des coordonnées
      if (longitude === undefined || latitude === undefined) {
        throw new AppError('Coordonnées GPS requises', 400);
      }

      const lon = parseFloat(longitude);
      const lat = parseFloat(latitude);

      if (isNaN(lon) || isNaN(lat) || lon < -180 || lon > 180 || lat < -90 || lat > 90) {
        throw new AppError('Coordonnées GPS invalides', 400);
      }

      // Vérifier que la conversation existe
      const conversation = await Conversation.findById(conversationId);
      if (!conversation) {
        throw new AppError('Conversation non trouvée', 404);
      }

      if (!conversation.participants.includes(expediteurId)) {
        throw new AppError('Vous n\'êtes pas autorisé à envoyer des messages dans cette conversation', 403);
      }

      // Créer le message avec localisation
      const message = new Message({
        conversationId: new mongoose.Types.ObjectId(conversationId),
        expediteurId: new mongoose.Types.ObjectId(expediteurId),
        destinataireId: destinataireId ? new mongoose.Types.ObjectId(destinataireId) : null,
        contenu: contenu,
        typeMessage: 'POSITION',
        pieceJointe: {
          type: 'LOCALISATION',
          coordonnees: {
            type: 'Point',
            coordinates: [lon, lat]
          }
        },
        dateEnvoi: new Date(),
        lu: false
      });

      return await message.save();
    } catch (error) {
      throw new Error(`Erreur envoi position: ${error.message}`);
    }
  }

  /**
   * Utiliser un modèle prédéfini
   */
  static async utiliserModelePredefini(data) {
    try {
      const {
        conversationId,
        expediteurId,
        destinataireId,
        modeleUtilise,
        contenu
      } = data;

      if (!modeleUtilise || !contenu) {
        throw new AppError('Modèle et contenu requis', 400);
      }

      // Vérifier que la conversation existe
      const conversation = await Conversation.findById(conversationId);
      if (!conversation) {
        throw new AppError('Conversation non trouvée', 404);
      }

      if (!conversation.participants.includes(expediteurId)) {
        throw new AppError('Vous n\'êtes pas autorisé à envoyer des messages dans cette conversation', 403);
      }

      // Créer le message avec modèle
      const message = new Message({
        conversationId: new mongoose.Types.ObjectId(conversationId),
        expediteurId: new mongoose.Types.ObjectId(expediteurId),
        destinataireId: destinataireId ? new mongoose.Types.ObjectId(destinataireId) : null,
        contenu: contenu,
        typeMessage: 'MODELE_PREDEFINI',
        modeleUtilise: modeleUtilise,
        dateEnvoi: new Date(),
        lu: false
      });

      return await message.save();
    } catch (error) {
      throw new Error(`Erreur utilisation modèle: ${error.message}`);
    }
  }

  /**
   * Obtenir les messages d'une conversation
   */
  static async obtenirMessagesConversation(conversationId, options = {}) {
    try {
      const {
        page = 1,
        limite = 50,
        depuisDate
      } = options;

      // Validation
      if (!mongoose.Types.ObjectId.isValid(conversationId)) {
        throw new AppError('ID de conversation invalide', 400);
      }

      const filtre = { conversationId: new mongoose.Types.ObjectId(conversationId) };
      if (depuisDate) {
        filtre.dateEnvoi = { $gte: new Date(depuisDate) };
      }

      const skip = (page - 1) * limite;

      const messages = await Message.find(filtre)
        .populate('expediteurId', 'nom prenom avatar')
        .populate('destinataireId', 'nom prenom avatar')
        .sort({ dateEnvoi: -1 })
        .skip(skip)
        .limit(limite)
        .lean();

      const total = await Message.countDocuments(filtre);

      return {
        messages,
        pagination: {
          page,
          limite,
          total,
          pages: Math.ceil(total / limite)
        }
      };
    } catch (error) {
      throw new Error(`Erreur récupération messages: ${error.message}`);
    }
  }

  /**
   * Rechercher dans les messages
   */
  static async rechercherMessages(utilisateurId, termeRecherche, options = {}) {
    try {
      const {
        page = 1,
        limite = 20,
        typeMessage
      } = options;

      if (!termeRecherche || termeRecherche.trim().length < 2) {
        throw new AppError('Le terme de recherche doit contenir au moins 2 caractères', 400);
      }

      const filtre = {
        $or: [
          { expediteurId: new mongoose.Types.ObjectId(utilisateurId) },
          { destinataireId: new mongoose.Types.ObjectId(utilisateurId) }
        ],
        contenu: { $regex: termeRecherche.trim(), $options: 'i' }
      };

      if (typeMessage) {
        filtre.typeMessage = typeMessage;
      }

      const skip = (page - 1) * limite;

      const messages = await Message.find(filtre)
        .populate('expediteurId', 'nom prenom')
        .populate('destinataireId', 'nom prenom')
        .populate('conversationId', 'nom')
        .sort({ dateEnvoi: -1 })
        .skip(skip)
        .limit(limite)
        .lean();

      const total = await Message.countDocuments(filtre);

      return {
        messages,
        pagination: {
          page,
          limite,
          total,
          pages: Math.ceil(total / limite)
        }
      };
    } catch (error) {
      throw new Error(`Erreur recherche messages: ${error.message}`);
    }
  }

  /**
   * Obtenir les messages non lus
   */
  static async obtenirMessagesNonLus(utilisateurId) {
    try {
      const messages = await Message.find({
        destinataireId: new mongoose.Types.ObjectId(utilisateurId),
        lu: false
      })
      .populate('expediteurId', 'nom prenom avatar')
      .populate('conversationId', 'nom')
      .sort({ dateEnvoi: -1 })
      .lean();

      const count = messages.length;

      return { messages, count };
    } catch (error) {
      throw new Error(`Erreur récupération messages non lus: ${error.message}`);
    }
  }

  /**
   * Marquer un message comme lu
   */
  static async marquerCommeLu(messageId, utilisateurId) {
    try {
      const message = await Message.findOneAndUpdate(
        { 
          _id: new mongoose.Types.ObjectId(messageId),
          destinataireId: new mongoose.Types.ObjectId(utilisateurId),
          lu: false
        },
        { 
          lu: true,
          dateLecture: new Date()
        },
        { new: true }
      );

      if (!message) {
        throw new Error('Message non trouvé ou déjà lu');
      }

      return message;
    } catch (error) {
      throw new Error(`Erreur marquage lecture: ${error.message}`);
    }
  }

  /**
   * Marquer tous les messages d'une conversation comme lus
   */
  static async marquerConversationCommeLue(conversationId, utilisateurId) {
    try {
      const result = await Message.updateMany(
        {
          conversationId: new mongoose.Types.ObjectId(conversationId),
          destinataireId: new mongoose.Types.ObjectId(utilisateurId),
          lu: false
        },
        {
          lu: true,
          dateLecture: new Date()
        }
      );

      return {
        messagesMarques: result.modifiedCount,
        message: `${result.modifiedCount} messages marqués comme lus`
      };
    } catch (error) {
      throw new Error(`Erreur marquage conversation: ${error.message}`);
    }
  }

  /**
   * Signaler un message
   */
  static async signalerMessage(messageId, motifSignalement, moderateurId) {
    try {
      const message = await Message.findByIdAndUpdate(
        new mongoose.Types.ObjectId(messageId),
        {
          estSignale: true,
          motifSignalement,
          moderateurId: moderateurId ? new mongoose.Types.ObjectId(moderateurId) : null
        },
        { new: true }
      );

      if (!message) {
        throw new Error('Message non trouvé');
      }

      return message;
    } catch (error) {
      throw new Error(`Erreur signalement: ${error.message}`);
    }
  }

  /**
   * Supprimer un message (soft delete)
   */
  static async supprimerMessage(messageId, utilisateurId) {
    try {
      // Vérifier que l'utilisateur est l'expéditeur
      const message = await Message.findOne({
        _id: new mongoose.Types.ObjectId(messageId),
        expediteurId: new mongoose.Types.ObjectId(utilisateurId)
      });

      if (!message) {
        throw new Error('Message non trouvé ou non autorisé');
      }

      // Soft delete - marquer comme supprimé
      message.contenu = '[Message supprimé]';
      message.pieceJointe = undefined;
      message.modeleUtilise = undefined;

      await message.save();

      return { message: 'Message supprimé avec succès' };
    } catch (error) {
      throw new Error(`Erreur suppression: ${error.message}`);
    }
  }

  /**
   * Obtenir les statistiques de messages
   */
  static async obtenirStatistiques(utilisateurId, periode = 30) {
    try {
      const dateDebut = new Date();
      dateDebut.setDate(dateDebut.getDate() - periode);

      const stats = await Message.aggregate([
        {
          $match: {
            $or: [
              { expediteurId: new mongoose.Types.ObjectId(utilisateurId) },
              { destinataireId: new mongoose.Types.ObjectId(utilisateurId) }
            ],
            dateEnvoi: { $gte: dateDebut }
          }
        },
        {
          $group: {
            _id: null,
            totalMessages: { $sum: 1 },
            messagesEnvoyes: {
              $sum: {
                $cond: [
                  { $eq: ['$expediteurId', new mongoose.Types.ObjectId(utilisateurId)] },
                  1, 0
                ]
              }
            },
            messagesRecus: {
              $sum: {
                $cond: [
                  { $eq: ['$destinataireId', new mongoose.Types.ObjectId(utilisateurId)] },
                  1, 0
                ]
              }
            },
            messagesNonLus: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ['$destinataireId', new mongoose.Types.ObjectId(utilisateurId)] },
                      { $eq: ['$lu', false] }
                    ]
                  },
                  1, 0
                ]
              }
            }
          }
        }
      ]);

      return stats[0] || {
        totalMessages: 0,
        messagesEnvoyes: 0,
        messagesRecus: 0,
        messagesNonLus: 0
      };
    } catch (error) {
      throw new Error(`Erreur calcul statistiques: ${error.message}`);
    }
  }

  /**
   * Recherche géospatiale de messages avec localisation
   */
  static async rechercherMessagesProximite(longitude, latitude, rayonKm = 10) {
    try {
      const rayonRadians = rayonKm / 6378.1; // Conversion km vers radians

      const messages = await Message.find({
        'pieceJointe.type': 'LOCALISATION',
        'pieceJointe.coordonnees': {
          $geoWithin: {
            $centerSphere: [[longitude, latitude], rayonRadians]
          }
        }
      })
      .populate('expediteurId', 'nom prenom avatar')
      .sort({ dateEnvoi: -1 })
      .limit(50)
      .lean();

      return messages;
    } catch (error) {
      throw new Error(`Erreur recherche géospatiale: ${error.message}`);
    }
  }

  /**
   * Obtenir les conversations d'un utilisateur
   */
  static async obtenirConversations(utilisateurId, options = {}) {
    try {
      const { page = 1, limite = 20 } = options;
      const skip = (page - 1) * limite;

      const conversations = await Conversation.find({
        participants: new mongoose.Types.ObjectId(utilisateurId)
      })
      .populate('participants', 'nom prenom avatar')
      .populate('trajetId', 'pointDepart pointArrivee dateDepart')
      .sort({ derniereActivite: -1 })
      .skip(skip)
      .limit(limite)
      .lean();

      // Ajouter le dernier message et compteur non lus pour chaque conversation
      const conversationsAvecDetails = await Promise.all(
        conversations.map(async (conversation) => {
          const dernierMessage = await Message.findOne({
            conversationId: conversation._id
          })
          .populate('expediteurId', 'nom prenom')
          .sort({ dateEnvoi: -1 })
          .lean();

          const messagesNonLus = await Message.countDocuments({
            conversationId: conversation._id,
            destinataireId: new mongoose.Types.ObjectId(utilisateurId),
            lu: false
          });

          return {
            ...conversation,
            dernierMessage,
            messagesNonLus
          };
        })
      );

      const total = await Conversation.countDocuments({
        participants: new mongoose.Types.ObjectId(utilisateurId)
      });

      return {
        conversations: conversationsAvecDetails,
        pagination: {
          page,
          limite,
          total,
          pages: Math.ceil(total / limite)
        }
      };
    } catch (error) {
      throw new Error(`Erreur récupération conversations: ${error.message}`);
    }
  }

  /**
   * Créer ou récupérer une conversation
   */
  static async obtenirOuCreerConversation(participantIds, trajetId = null) {
    try {
      if (!Array.isArray(participantIds) || participantIds.length !== 2) {
        throw new AppError('Une conversation doit avoir exactement 2 participants', 400);
      }

      // Vérifier si une conversation existe déjà
      let conversation = await Conversation.findOne({
        participants: { 
          $all: participantIds.map(id => new mongoose.Types.ObjectId(id)), 
          $size: 2 
        },
        ...(trajetId && { trajetId: new mongoose.Types.ObjectId(trajetId) })
      });

      if (!conversation) {
        // Créer une nouvelle conversation
        conversation = new Conversation({
          participants: participantIds.map(id => new mongoose.Types.ObjectId(id)),
          trajetId: trajetId ? new mongoose.Types.ObjectId(trajetId) : null,
          derniereActivite: new Date()
        });

        await conversation.save();
      }

      // Peupler les informations
      await conversation.populate('participants', 'nom prenom avatar');
      if (trajetId) {
        await conversation.populate('trajetId', 'pointDepart pointArrivee dateDepart');
      }

      return conversation;
    } catch (error) {
      throw new Error(`Erreur création/récupération conversation: ${error.message}`);
    }
  }

  /**
   * Nettoyer les anciens messages
   */
  static async nettoyerAnciensmessages(joursConservation = 90) {
    try {
      const dateLimit = new Date();
      dateLimit.setDate(dateLimit.getDate() - joursConservation);

      const result = await Message.deleteMany({
        dateEnvoi: { $lt: dateLimit },
        estSignale: false // Garder les messages signalés
      });

      return {
        message: `${result.deletedCount} anciens messages supprimés`,
        messagesSupprimes: result.deletedCount,
        dateLimit
      };
    } catch (error) {
      throw new Error(`Erreur nettoyage: ${error.message}`);
    }
  }

  /**
   * Modération - Obtenir les messages signalés
   */
  static async obtenirMessagesSignales(options = {}) {
    try {
      const { page = 1, limite = 20 } = options;
      const skip = (page - 1) * limite;

      const messages = await Message.find({ estSignale: true })
        .populate('expediteurId', 'nom prenom email')
        .populate('moderateurId', 'nom prenom')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limite);

      const total = await Message.countDocuments({ estSignale: true });

      return {
        messages,
        pagination: {
          page,
          limite,
          total,
          pages: Math.ceil(total / limite)
        }
      };
    } catch (error) {
      throw new Error(`Erreur récupération messages signalés: ${error.message}`);
    }
  }

  /**
   * Valider les coordonnées GPS
   */
  static validerCoordonnees(longitude, latitude) {
    const lon = parseFloat(longitude);
    const lat = parseFloat(latitude);
    
    if (isNaN(lon) || isNaN(lat)) {
      return false;
    }
    
    return lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90;
  }

  /**
   * Formater un message pour l'affichage
   */
  static formaterMessage(message) {
    const messageFormated = {
      id: message._id,
      conversationId: message.conversationId,
      expediteur: message.expediteurId,
      destinataire: message.destinataireId,
      contenu: message.contenu,
      typeMessage: message.typeMessage,
      dateEnvoi: message.dateEnvoi,
      lu: message.lu,
      dateLecture: message.dateLecture
    };

    if (message.pieceJointe) {
      messageFormated.pieceJointe = message.pieceJointe;
    }

    if (message.modeleUtilise) {
      messageFormated.modeleUtilise = message.modeleUtilise;
    }

    return messageFormated;
  }
}

module.exports = MessageService;