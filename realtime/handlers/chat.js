const Message = require('../../models/Message');
const Conversation = require('../../models/Conversation');
//const Utilisateur = require('../../models/Utilisateur');

module.exports = (socket, io) => {
  
  // Rejoindre une conversation existante
  socket.on('joinConversation', async (data) => {
    try {
      const { conversationId } = data;
      
      // Vérifier que l'utilisateur participe à cette conversation
      const conversation = await Conversation.findOne({
        _id: conversationId,
        participants: socket.userId
      }).populate('participants', 'nom prenom photoProfil');

      if (!conversation) {
        socket.emit('error', { 
          type: 'CONVERSATION_ERROR',
          message: 'Conversation non trouvée ou accès refusé' 
        });
        return;
      }

      // Rejoindre la room de la conversation
      socket.join(`conversation_${conversationId}`);
      
      // Marquer les messages non lus comme lus
      await Message.updateMany(
        { 
          conversationId, 
          destinataireId: socket.userId, 
          lu: false 
        },
        { 
          lu: true, 
          dateLecture: new Date() 
        }
      );

      // Réinitialiser le compteur de messages non lus
      await Conversation.findByIdAndUpdate(conversationId, {
        nombreMessagesNonLus: 0
      });

      // Récupérer les derniers messages
      const messages = await Message.find({ conversationId })
        .populate('expediteurId', 'nom prenom photoProfil')
        .sort({ dateEnvoi: -1 })
        .limit(50);

      socket.emit('conversationJoined', { 
        conversationId,
        conversation,
        messages: messages.reverse() // Inverser pour avoir l'ordre chronologique
      });

      console.log(`💬 ${socket.user.nom} a rejoint la conversation ${conversationId}`);
      
    } catch (error) {
      console.error('Erreur joinConversation:', error);
      socket.emit('error', { 
        type: 'CONVERSATION_ERROR',
        message: 'Erreur lors de la connexion à la conversation' 
      });
    }
  });

  // Envoyer un message dans une conversation
  socket.on('sendMessage', async (messageData) => {
    try {
      const { 
        conversationId, 
        contenu, 
        typeMessage = 'TEXTE', 
        pieceJointe,
        modeleUtilise 
      } = messageData;

      // Validation des données
      if (!conversationId || !contenu?.trim()) {
        socket.emit('error', { 
          type: 'MESSAGE_ERROR',
          message: 'Données de message invalides' 
        });
        return;
      }

      // Vérifier la conversation et les participants
      const conversation = await Conversation.findOne({
        _id: conversationId,
        participants: socket.userId
      }).populate('participants', 'nom prenom photoProfil');

      if (!conversation) {
        socket.emit('error', { 
          type: 'MESSAGE_ERROR',
          message: 'Conversation non trouvée' 
        });
        return;
      }

      // Trouver le destinataire (l'autre participant)
      const destinataire = conversation.participants.find(
        p => p._id.toString() !== socket.userId
      );

      if (!destinataire) {
        socket.emit('error', { 
          type: 'MESSAGE_ERROR',
          message: 'Destinataire non trouvé' 
        });
        return;
      }

      // Créer le nouveau message
      const nouveauMessage = new Message({
        conversationId,
        expediteurId: socket.userId,
        destinataireId: destinataire._id,
        contenu: contenu.trim(),
        typeMessage,
        pieceJointe,
        modeleUtilise,
        dateEnvoi: new Date()
      });

      await nouveauMessage.save();

      // Mettre à jour la conversation
      await Conversation.findByIdAndUpdate(conversationId, {
        derniereActivite: new Date(),
        $inc: { nombreMessagesNonLus: 1 }
      });

      // Populer l'expéditeur pour l'affichage
      await nouveauMessage.populate('expediteurId', 'nom prenom photoProfil');

      // Diffuser le message à tous les participants connectés
      io.to(`conversation_${conversationId}`).emit('newMessage', {
        message: nouveauMessage,
        conversationId
      });

      // Vérifier si le destinataire est connecté
      const destinataireConnecte = io.sockets.adapter.rooms.has(`user_${destinataire._id}`);
      
      if (!destinataireConnecte) {
        // Le destinataire n'est pas connecté, envoyer notification push
        console.log(`📱 Notification à envoyer à ${destinataire.nom}: "${contenu.substring(0, 50)}..."`);
        
        // Ici vous intégreriez votre service de notification push
        // await sendPushNotification(destinataire._id, {
        //   title: `Nouveau message de ${socket.user.nom}`,
        //   body: contenu.substring(0, 100),
        //   data: { conversationId, messageId: nouveauMessage._id }
        // });
      }

      console.log(`💬 Message envoyé dans conversation ${conversationId} par ${socket.user.nom}`);

    } catch (error) {
      console.error('Erreur sendMessage:', error);
      socket.emit('error', { 
        type: 'MESSAGE_ERROR',
        message: 'Erreur lors de l\'envoi du message' 
      });
    }
  });

  // Indiquer qu'un utilisateur est en train de taper
  socket.on('typing', (data) => {
    try {
      const { conversationId, isTyping } = data;
      
      if (!conversationId) return;

      // Diffuser l'état "en train de taper" aux autres participants
      socket.to(`conversation_${conversationId}`).emit('userTyping', {
        userId: socket.userId,
        userName: socket.user.nom,
        isTyping: Boolean(isTyping),
        timestamp: new Date()
      });

    } catch (error) {
      console.error('Erreur typing:', error);
    }
  });

  // Marquer un message spécifique comme lu
  socket.on('markAsRead', async (data) => {
    try {
      const { messageId, conversationId } = data;
      
      if (messageId) {
        // Marquer un message spécifique
        const result = await Message.findOneAndUpdate(
          { 
            _id: messageId, 
            destinataireId: socket.userId,
            lu: false 
          },
          { 
            lu: true, 
            dateLecture: new Date() 
          },
          { new: true }
        );

        if (result) {
          socket.emit('messageMarkedAsRead', { messageId });
          
          // Notifier l'expéditeur que son message a été lu
          socket.to(`user_${result.expediteurId}`).emit('messageReadByRecipient', {
            messageId,
            readBy: socket.userId,
            readAt: result.dateLecture
          });
        }
      } else if (conversationId) {
        // Marquer tous les messages non lus de la conversation
        await Message.updateMany(
          { 
            conversationId, 
            destinataireId: socket.userId, 
            lu: false 
          },
          { 
            lu: true, 
            dateLecture: new Date() 
          }
        );

        socket.emit('conversationMarkedAsRead', { conversationId });
      }
      
    } catch (error) {
      console.error('Erreur markAsRead:', error);
    }
  });

  // Récupérer l'historique des messages d'une conversation
  socket.on('getMessageHistory', async (data) => {
    try {
      const { conversationId, page = 1, limit = 50 } = data;
      
      // Vérifier l'accès à la conversation
      const conversation = await Conversation.findOne({
        _id: conversationId,
        participants: socket.userId
      });

      if (!conversation) {
        socket.emit('error', { 
          type: 'CONVERSATION_ERROR',
          message: 'Accès refusé à cette conversation' 
        });
        return;
      }

      const skip = (page - 1) * limit;
      
      const messages = await Message.find({ conversationId })
        .populate('expediteurId', 'nom prenom photoProfil')
        .sort({ dateEnvoi: -1 })
        .skip(skip)
        .limit(limit);

      const totalMessages = await Message.countDocuments({ conversationId });

      socket.emit('messageHistory', {
        conversationId,
        messages: messages.reverse(),
        pagination: {
          page,
          limit,
          total: totalMessages,
          pages: Math.ceil(totalMessages / limit)
        }
      });

    } catch (error) {
      console.error('Erreur getMessageHistory:', error);
      socket.emit('error', { 
        type: 'MESSAGE_ERROR',
        message: 'Erreur lors de la récupération de l\'historique' 
      });
    }
  });

  // Rechercher dans les messages
  socket.on('searchMessages', async (data) => {
    try {
      const { conversationId, query, limit = 20 } = data;
      
      if (!query || query.trim().length < 2) {
        socket.emit('searchResults', { 
          conversationId, 
          results: [], 
          query 
        });
        return;
      }

      // Vérifier l'accès à la conversation
      const conversation = await Conversation.findOne({
        _id: conversationId,
        participants: socket.userId
      });

      if (!conversation) {
        socket.emit('error', { 
          type: 'SEARCH_ERROR',
          message: 'Accès refusé à cette conversation' 
        });
        return;
      }

      const messages = await Message.find({
        conversationId,
        contenu: { $regex: query.trim(), $options: 'i' }
      })
      .populate('expediteurId', 'nom prenom')
      .sort({ dateEnvoi: -1 })
      .limit(limit);

      socket.emit('searchResults', {
        conversationId,
        results: messages,
        query: query.trim()
      });

    } catch (error) {
      console.error('Erreur searchMessages:', error);
      socket.emit('error', { 
        type: 'SEARCH_ERROR',
        message: 'Erreur lors de la recherche' 
      });
    }
  });

  // Quitter une conversation
  socket.on('leaveConversation', (data) => {
    try {
      const { conversationId } = data;
      
      if (conversationId) {
        socket.leave(`conversation_${conversationId}`);
        socket.emit('conversationLeft', { conversationId });
        
        console.log(`💬 ${socket.user.nom} a quitté la conversation ${conversationId}`);
      }
      
    } catch (error) {
      console.error('Erreur leaveConversation:', error);
    }
  });

  console.log(`💬 Chat handler initialisé pour ${socket.user.nom}`);
};