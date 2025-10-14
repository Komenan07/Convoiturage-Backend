const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const Utilisateur = require('../models/Utilisateur');
const { AppError } = require('../utils/helpers');
const mongoose = require('mongoose');

class MessageService {

  /**
   * Envoyer un nouveau message
   */
  async envoyerMessage(donnees) {
    const { conversationId, expediteurId, destinataireId, contenu, typeMessage = 'TEXTE', pieceJointe = null, modeleUtilise = null } = donnees;

    // Validation de base
    if (!contenu && !pieceJointe) {
      throw new AppError('Le contenu du message ou une pièce jointe est requis', 400);
    }

    if (!conversationId || !expediteurId) {
      throw new AppError('ID conversation et expéditeur requis', 400);
    }

    // Vérifier que la conversation existe
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      throw new AppError('Conversation non trouvée', 404);
    }

    // Vérifier que l'expéditeur fait partie de la conversation
    if (!conversation.participants.includes(expediteurId)) {
      throw new AppError('Vous n\'êtes pas autorisé à envoyer des messages dans cette conversation', 403);
    }

    // Déterminer le destinataire si non fourni
    let destinataireIdFinal = destinataireId;
    if (!destinataireIdFinal) {
      // Trouver l'autre participant de la conversation
      destinataireIdFinal = conversation.participants.find(
        participantId => !participantId.equals(expediteurId)
      );
    }

    // Créer le message
    const nouveauMessage = new Message({
      conversationId,
      expediteurId,
      destinataireId: destinataireIdFinal,
      contenu,
      typeMessage,
      pieceJointe,
      modeleUtilise,
      dateEnvoi: new Date(),
      lu: false
    });

    await nouveauMessage.save();

    // Mettre à jour la conversation
    await Conversation.findByIdAndUpdate(conversationId, {
      derniereActivite: new Date(),
      $inc: { nombreMessagesNonLus: 1 }
    });

    // Peupler les informations de l'expéditeur
    await nouveauMessage.populate('expediteurId', 'nom prenom photoProfil');

    return nouveauMessage;
  }

  /**
   * Obtenir les messages d'une conversation avec pagination
   */
  async obtenirMessages(conversationId, utilisateurId, options = {}) {
    const { page = 1, limite = 50 } = options;

    // Vérifier que l'utilisateur fait partie de la conversation
    const conversation = await Conversation.findById(conversationId);
    if (!conversation) {
      throw new AppError('Conversation non trouvée', 404);
    }

    if (!conversation.participants.includes(utilisateurId)) {
      throw new AppError('Accès non autorisé à cette conversation', 403);
    }

    // Calcul de la pagination
    const skip = (page - 1) * limite;

    // Récupérer les messages avec pagination (ordre décroissant par date)
    const messages = await Message.find({ conversationId })
      .populate('expediteurId', 'nom prenom photoProfil')
      .populate('destinataireId', 'nom prenom')
      .sort({ dateEnvoi: -1 })
      .skip(skip)
      .limit(limite)
      .lean();

    // Compter le total pour la pagination
    const total = await Message.countDocuments({ conversationId });

    // Marquer les messages comme lus
    await this.marquerMessagesCommelus(conversationId, utilisateurId);

    return {
      messages: messages.reverse(), // Remettre dans l'ordre chronologique
      pagination: {
        page,
        limite,
        total,
        pages: Math.ceil(total / limite),
        hasNext: page < Math.ceil(total / limite),
        hasPrev: page > 1
      }
    };
  }

  /**
   * Marquer les messages comme lus
   */
  async marquerMessagesCommelus(conversationId, utilisateurId) {
    // Marquer tous les messages non lus destinés à cet utilisateur comme lus
    const result = await Message.updateMany(
      {
        conversationId,
        destinataireId: utilisateurId,
        lu: false
      },
      {
        lu: true,
        dateLecture: new Date()
      }
    );

    // Réinitialiser le compteur de messages non lus pour cet utilisateur
    await Conversation.findByIdAndUpdate(conversationId, {
      nombreMessagesNonLus: 0
    });

    return result.modifiedCount;
  }

  /**
   * Supprimer un message
   */
  async supprimerMessage(messageId, utilisateurId) {
    const message = await Message.findById(messageId);
    
    if (!message) {
      throw new AppError('Message non trouvé', 404);
    }

    // Seul l'expéditeur peut supprimer son message
    if (!message.expediteurId.equals(utilisateurId)) {
      throw new AppError('Vous ne pouvez supprimer que vos propres messages', 403);
    }

    // Vérifier que le message n'est pas trop ancien (ex: 24h)
    const limiteSuppressionHeures = 24;
    const maintenant = new Date();
    const tempsEcoule = (maintenant - message.dateEnvoi) / (1000 * 60 * 60);
    
    if (tempsEcoule > limiteSuppressionHeures) {
      throw new AppError(`Impossible de supprimer un message de plus de ${limiteSuppressionHeures}h`, 400);
    }

    await Message.findByIdAndDelete(messageId);

    return {
      message: 'Message supprimé avec succès',
      messageId
    };
  }

  /**
   * Signaler un message
   */
  async signalerMessage(messageId, signalantId, motifSignalement) {
    const message = await Message.findById(messageId);
    
    if (!message) {
      throw new AppError('Message non trouvé', 404);
    }

    // Ne pas permettre de signaler ses propres messages
    if (message.expediteurId.equals(signalantId)) {
      throw new AppError('Vous ne pouvez pas signaler vos propres messages', 400);
    }

    // Mettre à jour le message
    const messageSignale = await Message.findByIdAndUpdate(
      messageId,
      {
        estSignale: true,
        motifSignalement
      },
      { new: true }
    );

    // TODO: Créer un signalement dans la collection SIGNALEMENT
    // const signalement = await SignalementService.creerSignalement({
    //   signalantId,
    //   signaleId: message.expediteurId,
    //   messageId,
    //   typeSignalement: 'CONTENU',
    //   motif: motifSignalement
    // });

    return {
      message: 'Message signalé avec succès',
      messageSignale
    };
  }

  /**
   * Obtenir les conversations d'un utilisateur
   */
  async obtenirConversations(utilisateurId, options = {}) {
    const { page = 1, limite = 20 } = options;
    const skip = (page - 1) * limite;

    // Récupérer les conversations où l'utilisateur est participant
    const conversations = await Conversation.find({
      participants: utilisateurId,
      estArchivee: false
    })
    .populate('participants', 'nom prenom photoProfil')
    .populate('trajetId', 'pointDepart pointArrivee dateDepart')
    .sort({ derniereActivite: -1 })
    .skip(skip)
    .limit(limite)
    .lean();

    // Pour chaque conversation, récupérer le dernier message
    const conversationsAvecDernierMessage = await Promise.all(
      conversations.map(async (conversation) => {
        const dernierMessage = await Message.findOne({
          conversationId: conversation._id
        })
        .populate('expediteurId', 'nom prenom')
        .sort({ dateEnvoi: -1 })
        .lean();

        // Compter les messages non lus pour cet utilisateur
        const messagesNonLus = await Message.countDocuments({
          conversationId: conversation._id,
          destinataireId: utilisateurId,
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
      participants: utilisateurId,
      estArchivee: false
    });

    return {
      conversations: conversationsAvecDernierMessage,
      pagination: {
        page,
        limite,
        total,
        pages: Math.ceil(total / limite),
        hasNext: page < Math.ceil(total / limite),
        hasPrev: page > 1
      }
    };
  }

  /**
   * Créer ou récupérer une conversation entre utilisateurs
   */
  async obtenirOuCreerConversation(trajetId, participantIds) {
    // Vérifier qu'il y a exactement 2 participants
    if (!Array.isArray(participantIds) || participantIds.length !== 2) {
      throw new AppError('Une conversation doit avoir exactement 2 participants', 400);
    }

    // Vérifier si une conversation existe déjà pour ce trajet et ces participants
    let conversation = await Conversation.findOne({
      trajetId,
      participants: { $all: participantIds, $size: 2 }
    });

    if (!conversation) {
      // Créer une nouvelle conversation
      conversation = new Conversation({
        trajetId,
        participants: participantIds,
        derniereActivite: new Date(),
        nombreMessagesNonLus: 0,
        estArchivee: false
      });

      await conversation.save();
    }

    // Peupler les informations
    await conversation.populate('participants', 'nom prenom photoProfil');
    await conversation.populate('trajetId', 'pointDepart pointArrivee dateDepart conducteurId');

    return conversation;
  }

  /**
   * Archiver une conversation
   */
  async archiverConversation(conversationId, utilisateurId) {
    const conversation = await Conversation.findById(conversationId);
    
    if (!conversation) {
      throw new AppError('Conversation non trouvée', 404);
    }

    if (!conversation.participants.includes(utilisateurId)) {
      throw new AppError('Accès non autorisé à cette conversation', 403);
    }

    await Conversation.findByIdAndUpdate(conversationId, {
      estArchivee: true
    });

    return {
      message: 'Conversation archivée avec succès',
      conversationId
    };
  }

  /**
   * Rechercher dans les messages
   */
  async rechercherMessages(utilisateurId, termeRecherche, options = {}) {
    const { page = 1, limite = 20 } = options;
    const skip = (page - 1) * limite;

    // Obtenir les conversations de l'utilisateur
    const conversationsUtilisateur = await Conversation.find({
      participants: utilisateurId
    }).select('_id');

    const conversationIds = conversationsUtilisateur.map(conv => conv._id);

    // Rechercher dans les messages
    const query = {
      conversationId: { $in: conversationIds },
      contenu: { $regex: termeRecherche, $options: 'i' }
    };

    const messages = await Message.find(query)
      .populate('expediteurId', 'nom prenom photoProfil')
      .populate('conversationId', 'trajetId')
      .sort({ dateEnvoi: -1 })
      .skip(skip)
      .limit(limite)
      .lean();

    const total = await Message.countDocuments(query);

    return {
      messages,
      pagination: {
        page,
        limite,
        total,
        pages: Math.ceil(total / limite),
        hasNext: page < Math.ceil(total / limite),
        hasPrev: page > 1
      },
      termeRecherche
    };
  }

  /**
   * Obtenir les statistiques de messages pour un utilisateur
   */
  async obtenirStatistiquesMessages(utilisateurId) {
    // Messages envoyés
    const messagesEnvoyes = await Message.countDocuments({
      expediteurId: utilisateurId
    });

    // Messages reçus
    const messagesRecus = await Message.countDocuments({
      destinataireId: utilisateurId
    });

    // Messages non lus
    const messagesNonLus = await Message.countDocuments({
      destinataireId: utilisateurId,
      lu: false
    });

    // Conversations actives
    const conversationsActives = await Conversation.countDocuments({
      participants: utilisateurId,
      estArchivee: false
    });

    // Messages par type
    const messagesParType = await Message.aggregate([
      {
        $match: {
          $or: [
            { expediteurId: new mongoose.Types.ObjectId(utilisateurId) },
            { destinataireId: new mongoose.Types.ObjectId(utilisateurId) }
          ]
        }
      },
      {
        $group: {
          _id: '$typeMessage',
          count: { $sum: 1 }
        }
      }
    ]);

    return {
      messagesEnvoyes,
      messagesRecus,
      messagesNonLus,
      conversationsActives,
      messagesParType: messagesParType.reduce((acc, item) => {
        acc[item._id] = item.count;
        return acc;
      }, {})
    };
  }

  /**
   * Modérer un message (admin)
   */
  async modererMessage(messageId, moderateurId, action) {
    const message = await Message.findById(messageId);
    
    if (!message) {
      throw new AppError('Message non trouvé', 404);
    }

    const actionsValides = ['APPROUVER', 'REJETER', 'SUPPRIMER'];
    if (!actionsValides.includes(action)) {
      throw new AppError('Action de modération invalide', 400);
    }

    let updateData = {
      moderateurId,
      dateModeration: new Date()
    };

    switch (action) {
      case 'APPROUVER':
        updateData.estSignale = false;
        updateData.motifSignalement = null;
        break;
      
      case 'REJETER':
        // Garder le signalement mais marquer comme traité
        updateData.estTraite = true;
        break;
      
      case 'SUPPRIMER':
        await Message.findByIdAndDelete(messageId);
        return {
          message: 'Message supprimé par modération',
          messageId,
          action
        };
    }

    const messageModere = await Message.findByIdAndUpdate(
      messageId,
      updateData,
      { new: true }
    ).populate('expediteurId', 'nom prenom');

    return {
      message: `Message ${action.toLowerCase()} par modération`,
      messageModere,
      action
    };
  }

  /**
   * Obtenir les messages signalés (admin)
   */
  async obtenirMessagesSignales(options = {}) {
    const { page = 1, limite = 20, statut = 'EN_ATTENTE' } = options;
    const skip = (page - 1) * limite;

    let query = { estSignale: true };
    
    if (statut !== 'TOUS') {
      query.estTraite = statut === 'TRAITE';
    }

    const messages = await Message.find(query)
      .populate('expediteurId', 'nom prenom email')
      .populate('conversationId', 'trajetId')
      .sort({ dateEnvoi: -1 })
      .skip(skip)
      .limit(limite);

    const total = await Message.countDocuments(query);

    return {
      messages,
      pagination: {
        page,
        limite,
        total,
        pages: Math.ceil(total / limite),
        hasNext: page < Math.ceil(total / limite),
        hasPrev: page > 1
      }
    };
  }

  /**
   * Envoyer un message prédéfini (templates locaux)
   */
  async envoyerMessagePredefini(conversationId, expediteurId, modeleUtilise, variables = {}) {
    // Templates de messages prédéfinis en français local
    const modelesMessages = {
      'ARRIVEE_PROCHE': 'Je suis bientôt arrivé(e) au point de rendez-vous ! 🚗',
      'RETARD_5MIN': 'Désolé(e), j\'ai un petit retard de 5 minutes environ ⏰',
      'RETARD_10MIN': 'Je suis en retard d\'environ 10 minutes, désolé(e) 😔',
      'ARRIVE_LIEU': 'Je suis arrivé(e) au point de rendez-vous 📍',
      'DEMANDE_POSITION': 'Pouvez-vous partager votre position s\'il vous plaît ? 📱',
      'REMERCIEMENT': 'Merci pour ce bon trajet ! À bientôt 😊',
      'PROBLEME_TECHNIQUE': 'J\'ai un petit problème technique, je vous tiens au courant 🔧',
      'CONFIRMATION_TRAJET': 'Je confirme ma présence pour le trajet ✅',
      'ANNULATION_URGENCE': 'Désolé(e), je dois annuler pour cause d\'urgence 🚨'
    };

    const contenu = modelesMessages[modeleUtilise];
    if (!contenu) {
      throw new AppError('Modèle de message non trouvé', 404);
    }

    // Remplacer les variables dans le template si nécessaire
    let contenuFinal = contenu;
    Object.keys(variables).forEach(key => {
      contenuFinal = contenuFinal.replace(`{{${key}}}`, variables[key]);
    });

    return await this.envoyerMessage({
      conversationId,
      expediteurId,
      contenu: contenuFinal,
      typeMessage: 'MODELE_PREDEFINI',
      modeleUtilise
    });
  }

  /**
   * Obtenir le nombre de messages non lus pour un utilisateur
   */
  async obtenirNombreMessagesNonLus(utilisateurId) {
    const nombreNonLus = await Message.countDocuments({
      destinataireId: utilisateurId,
      lu: false
    });

    return { nombreMessagesNonLus: nombreNonLus };
  }

  /**
   * Envoyer un message de localisation
   */
  async envoyerLocalisation(conversationId, expediteurId, coordonnees) {
    if (!coordonnees || !coordonnees.longitude || !coordonnees.latitude) {
      throw new AppError('Coordonnées de localisation requises', 400);
    }

    const pieceJointe = {
      type: 'LOCALISATION',
      coordonnees: {
        type: 'Point',
        coordinates: [coordonnees.longitude, coordonnees.latitude]
      }
    };

    return await this.envoyerMessage({
      conversationId,
      expediteurId,
      contenu: '📍 Position partagée',
      typeMessage: 'POSITION',
      pieceJointe
    });
  }

  /**
   * Obtenir les messages par période
   */
  async obtenirMessagesParPeriode(debut, fin, options = {}) {
    const query = {
      dateEnvoi: {
        $gte: new Date(debut),
        $lte: new Date(fin)
      }
    };

    const messages = await Message.find(query)
      .populate('expediteurId', 'nom prenom')
      .sort({ dateEnvoi: -1 })
      .limit(options.limite || 100);

    return messages;
  }

  /**
   * Nettoyer les anciens messages (tâche de maintenance)
   */
  async nettoyerAnciensmessages(joursConservation = 90) {
    const dateLimit = new Date();
    dateLimit.setDate(dateLimit.getDate() - joursConservation);

    const result = await Message.deleteMany({
      dateEnvoi: { $lt: dateLimit },
      estSignale: false // Garder les messages signalés pour investigation
    });

    return {
      message: `${result.deletedCount} anciens messages supprimés`,
      messagesSupprimes: result.deletedCount,
      dateLimit
    };
  }
}

module.exports = new MessageService();