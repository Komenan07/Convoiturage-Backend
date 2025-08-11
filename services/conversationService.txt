const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Trajet = require('../models/Trajet');
const Utilisateur = require('../models/Utilisateur');
const notificationService = require('./notificationService');
const { Types } = require('mongoose');

const conversationService = {
  /**
   * Créer une conversation automatiquement lors d'une réservation
   */
  creerConversationAutomatique: async (trajetId, conducteurId, passagerId) => {
    try {
      // Vérifier si une conversation existe déjà
      let conversation = await Conversation.findByTrajet(trajetId);
      
      if (!conversation) {
        // Créer une nouvelle conversation
        conversation = new Conversation({
          trajetId,
          participants: [conducteurId],
          type: 'trajet',
          titre: 'Conversation du trajet'
        });
        
        await conversation.save();
      }
      
      // Ajouter le passager s'il n'est pas déjà participant
      if (!conversation.participants.includes(passagerId)) {
        conversation.ajouterParticipant(passagerId);
        await conversation.save();
        
        // Notifier les participants existants
        await notificationService.notifierNouveauParticipant(
          conversation._id, 
          passagerId,
          conversation.participants.filter(p => p.toString() !== passagerId.toString())
        );
      }
      
      return conversation;
    } catch (error) {
      console.error('Erreur création conversation automatique:', error);
      throw error;
    }
  },

  /**
   * Envoyer un message dans une conversation
   */
  envoyerMessage: async (conversationId, expediteurId, contenu, type = 'text', metadata = {}) => {
    try {
      const conversation = await Conversation.findById(conversationId)
        .populate('participants', 'nom prenom');
      
      if (!conversation) {
        throw new Error('Conversation non trouvée');
      }
      
      // Vérifier les droits d'écriture
      if (!conversation.peutEcrire(expediteurId)) {
        throw new Error('Droits d\'écriture insuffisants');
      }
      
      // Créer le message
      const message = new Message({
        conversationId,
        expediteur: expediteurId,
        contenu,
        type,
        metadata
      });
      
      await message.save();
      
      // Mettre à jour la conversation
      conversation.statistiques.nombreTotalMessages += 1;
      conversation.statistiques.dernierMessagePar = expediteurId;
      conversation.statistiques.dernierMessageContenu = contenu.substring(0, 100);
      conversation.derniereActivite = new Date();
      
      // Incrémenter les messages non lus pour tous les autres participants
      conversation.participants.forEach(participantId => {
        if (participantId.toString() !== expediteurId.toString()) {
          conversation.marquerCommeNonLu(participantId, 1);
        }
      });
      
      await conversation.save();
      
      // Envoyer notifications
      const autresParticipants = conversation.participants.filter(
        p => p._id.toString() !== expediteurId.toString()
      );
      
      if (autresParticipants.length > 0) {
        await notificationService.notifierNouveauMessage(
          conversationId,
          expediteurId,
          contenu,
          autresParticipants
        );
      }
      
      return message;
    } catch (error) {
      console.error('Erreur envoi message:', error);
      throw error;
    }
  },

  /**
   * Obtenir les messages d'une conversation avec pagination
   */
  obtenirMessages: async (conversationId, utilisateurId, options = {}) => {
    try {
      const { page = 1, limit = 50, avant = null } = options;
      
      const conversation = await Conversation.findById(conversationId);
      if (!conversation) {
        throw new Error('Conversation non trouvée');
      }
      
      if (!conversation.peutAcceder(utilisateurId)) {
        throw new Error('Accès non autorisé');
      }
      
      let query = { conversationId };
      
      // Pagination par curseur si 'avant' est fourni
      if (avant) {
        query.createdAt = { $lt: new Date(avant) };
      }
      
      const messages = await Message.find(query)
        .populate('expediteur', 'nom prenom avatar')
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();
      
      return messages.reverse(); // Ordre chronologique
    } catch (error) {
      console.error('Erreur récupération messages:', error);
      throw error;
    }
  },

  /**
   * Rechercher dans les conversations
   */
  rechercherConversations: async (utilisateurId, terme, options = {}) => {
    try {
      const { limit = 10 } = options;
      
      const pipeline = [
        {
          $match: {
            participants: new Types.ObjectId(utilisateurId),
            estArchivee: false,
            $or: [
              { titre: { $regex: terme, $options: 'i' } },
              { 'statistiques.dernierMessageContenu': { $regex: terme, $options: 'i' } }
            ]
          }
        },
        {
          $lookup: {
            from: 'trajets',
            localField: 'trajetId',
            foreignField: '_id',
            as: 'trajet'
          }
        },
        {
          $lookup: {
            from: 'utilisateurs',
            localField: 'participants',
            foreignField: '_id',
            as: 'participantsInfo',
            pipeline: [
              { $project: { nom: 1, prenom: 1, avatar: 1 } }
            ]
          }
        },
        {
          $addFields: {
            score: {
              $add: [
                { $cond: [{ $regexMatch: { input: '$titre', regex: terme, options: 'i' } }, 10, 0] },
                { $cond: [{ $regexMatch: { input: '$statistiques.dernierMessageContenu', regex: terme, options: 'i' } }, 5, 0] }
              ]
            }
          }
        },
        { $sort: { score: -1, derniereActivite: -1 } },
        { $limit: limit }
      ];
      
      return await Conversation.aggregate(pipeline);
    } catch (error) {
      console.error('Erreur recherche conversations:', error);
      throw error;
    }
  },

  /**
   * Obtenir les statistiques détaillées d'une conversation
   */
  obtenirStatistiques: async (conversationId, utilisateurId) => {
    try {
      const conversation = await Conversation.findById(conversationId);
      
      if (!conversation || !conversation.peutAcceder(utilisateurId)) {
        throw new Error('Conversation non accessible');
      }
      
      const [messageStats, participantsStats] = await Promise.all([
        // Statistiques des messages
        Message.aggregate([
          { $match: { conversationId: new Types.ObjectId(conversationId) } },
          {
            $group: {
              _id: null,
              totalMessages: { $sum: 1 },
              messagesParJour: {
                $push: {
                  date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                  expediteur: '$expediteur'
                }
              }
            }
          },
          {
            $addFields: {
              messagesParJour: {
                $reduce: {
                  input: '$messagesParJour',
                  initialValue: {},
                  in: {
                    $mergeObjects: [
                      '$value',
                      { '$this.date': { $add: [{ $ifNull: ['$value.$this.date', 0] }, 1] } }
                    ]
                  }
                }
              }
            }
          }
        ]),
        
        // Statistiques des participants
        Message.aggregate([
          { $match: { conversationId: new Types.ObjectId(conversationId) } },
          {
            $group: {
              _id: '$expediteur',
              nombreMessages: { $sum: 1 },
              dernierMessage: { $max: '$createdAt' }
            }
          },
          {
            $lookup: {
              from: 'utilisateurs',
              localField: '_id',
              foreignField: '_id',
              as: 'utilisateur',
              pipeline: [{ $project: { nom: 1, prenom: 1 } }]
            }
          }
        ])
      ]);
      
      return {
        conversation: {
          participants: conversation.participants.length,
          messagesTotal: conversation.statistiques.nombreTotalMessages,
          createdAt: conversation.createdAt,
          derniereActivite: conversation.derniereActivite
        },
        messages: messageStats[0] || { totalMessages: 0, messagesParJour: {} },
        participants: participantsStats
      };
    } catch (error) {
      console.error('Erreur statistiques conversation:', error);
      throw error;
    }
  },

  /**
   * Nettoyer les conversations inactives
   */
  nettoyerConversationsInactives: async (joursInactivite = 90) => {
    try {
      const dateLimit = new Date();
      dateLimit.setDate(dateLimit.getDate() - joursInactivite);
      
      const conversationsInactives = await Conversation.find({
        derniereActivite: { $lt: dateLimit },
        estArchivee: false
      });
      
      let compteurArchivees = 0;
      
      for (const conversation of conversationsInactives) {
        // Vérifier si le trajet est terminé
        const trajet = await Trajet.findById(conversation.trajetId);
        
        if (trajet && trajet.statut === 'termine') {
          conversation.estArchivee = true;
          await conversation.save();
          compteurArchivees++;
        }
      }
      
      return {
        conversationsAnalysees: conversationsInactives.length,
        conversationsArchivees: compteurArchivees
      };
    } catch (error) {
      console.error('Erreur nettoyage conversations:', error);
      throw error;
    }
  },

  /**
   * Synchroniser les participants d'une conversation avec ceux du trajet
   */
  synchroniserParticipants: async (conversationId) => {
    try {
      const conversation = await Conversation.findById(conversationId)
        .populate('trajetId');
      
      if (!conversation) {
        throw new Error('Conversation non trouvée');
      }
      
      const trajet = conversation.trajetId;
      const participantsTrajet = [
        trajet.conducteur,
        ...trajet.passagers
          .filter(p => p.statut === 'accepte')
          .map(p => p.utilisateur)
      ];
      
      // Ajouter les nouveaux participants
      const nouveauxParticipants = participantsTrajet.filter(
        p => !conversation.participants.includes(p)
      );
      
      // Retirer les anciens participants qui ne sont plus dans le trajet
      const participantsARetirer = conversation.participants.filter(
        p => !participantsTrajet.includes(p)
      );
      
      let modifications = false;
      
      for (const participantId of nouveauxParticipants) {
        conversation.ajouterParticipant(participantId);
        modifications = true;
      }
      
      for (const participantId of participantsARetirer) {
        conversation.retirerParticipant(participantId);
        modifications = true;
      }
      
      if (modifications) {
        await conversation.save();
      }
      
      return {
        ajouts: nouveauxParticipants.length,
        retraits: participantsARetirer.length
      };
    } catch (error) {
      console.error('Erreur synchronisation participants:', error);
      throw error;
    }
  },

  /**
   * Exporter une conversation (pour l'utilisateur)
   */
  exporterConversation: async (conversationId, utilisateurId, format = 'json') => {
    try {
      const conversation = await Conversation.findById(conversationId)
        .populate('trajetId', 'depart destination dateDepart')
        .populate('participants', 'nom prenom');
      
      if (!conversation || !conversation.peutAcceder(utilisateurId)) {
        throw new Error('Conversation non accessible');
      }
      
      const messages = await Message.find({ conversationId })
        .populate('expediteur', 'nom prenom')
        .sort({ createdAt: 1 })
        .lean();
      
      const export_data = {
        conversation: {
          id: conversation._id,
          trajet: conversation.trajetId,
          participants: conversation.participants,
          createdAt: conversation.createdAt,
          statistiques: conversation.statistiques
        },
        messages: messages.map(msg => ({
          expediteur: msg.expediteur,
          contenu: msg.contenu,
          type: msg.type,
          date: msg.createdAt
        }))
      };
      
      if (format === 'csv') {
        // Conversion en CSV pour les messages
        const csv = [
          'Date,Expediteur,Contenu,Type',
          ...messages.map(msg => 
            `"${msg.createdAt}","${msg.expediteur.nom} ${msg.expediteur.prenom}","${msg.contenu.replace(/"/g, '""')}","${msg.type}"`
          )
        ].join('\n');
        
        return { format: 'csv', data: csv };
      }
      
      return { format: 'json', data: export_data };
    } catch (error) {
      console.error('Erreur export conversation:', error);
      throw error;
    }
  }
};

module.exports = conversationService;