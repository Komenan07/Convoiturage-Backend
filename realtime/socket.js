const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const Utilisateur = require('../models/Utilisateur');
const Conversation = require('../models/Conversation');
const { Message } = require('../models/Message');
const notificationService = require('../services/notificationService');
const presenceService = require('../services/presenceService');

function getTokenFromHandshake(socket) {
  const { auth = {}, query = {} } = socket.handshake || {};
  return auth.token || query.token || (socket.handshake.headers && socket.handshake.headers['x-auth-token']);
}

async function socketAuth(socket, next) {
  try {
    const token = getTokenFromHandshake(socket);
    if (!token) return next(new Error('NO_TOKEN'));

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await Utilisateur.findById(decoded.userId).select('email nom prenom role');
    if (!user || user.statut !== 'actif') return next(new Error('USER_INVALID'));

    socket.user = {
      id: user._id.toString(),
      email: user.email,
      nom: user.nom,
      prenom: user.prenom,
      role: user.role
    };
    next();
  } catch (err) {
    next(new Error('AUTH_FAILED'));
  }
}

function buildRoomNames(conversationId, userId) {
  return {
    conversationRoom: `conversation:${conversationId}`,
    userRoom: `user:${userId}`
  };
}

function initSocket(httpServer, app) {
  const io = new Server(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  io.use(socketAuth);

  io.on('connection', async (socket) => {
    const userId = socket.user.id;

    // présence en ligne
    presenceService.setOnline(userId, socket.id);
    await socket.join(buildRoomNames(null, userId).userRoom);
    io.emit('presence:update', { userId, online: true });

    socket.emit('connection:ack', { success: true, userId });

    // rejoindre une conversation
    socket.on('conversation:join', async ({ conversationId }, ack = () => {}) => {
      try {
        if (!mongoose.isValidObjectId(conversationId)) throw new Error('INVALID_CONVERSATION_ID');
        const conversation = await Conversation.findById(conversationId).select('participants');
        if (!conversation) throw new Error('CONVERSATION_NOT_FOUND');
        if (!conversation.participants.map((p) => p.toString()).includes(userId)) throw new Error('FORBIDDEN');

        const { conversationRoom } = buildRoomNames(conversationId, userId);
        await socket.join(conversationRoom);
        ack({ success: true });
      } catch (e) {
        ack({ success: false, error: e.message });
      }
    });

    // quitter une conversation
    socket.on('conversation:leave', async ({ conversationId }, ack = () => {}) => {
      try {
        const { conversationRoom } = buildRoomNames(conversationId, userId);
        await socket.leave(conversationRoom);
        ack({ success: true });
      } catch (e) {
        ack({ success: false, error: e.message });
      }
    });

    // envoyer un message
    socket.on('message:send', async (payload, ack = () => {}) => {
      try {
        const { conversationId, destinataireId, contenu, typeMessage = 'TEXTE' } = payload || {};
        if (!mongoose.isValidObjectId(conversationId)) throw new Error('INVALID_CONVERSATION_ID');
        if (!mongoose.isValidObjectId(destinataireId)) throw new Error('INVALID_DESTINATAIRE_ID');
        if (!contenu && typeMessage === 'TEXTE') throw new Error('CONTENU_REQUIRED');

        const conversation = await Conversation.findById(conversationId).select('participants statistiques');
        if (!conversation) throw new Error('CONVERSATION_NOT_FOUND');
        const participantIds = conversation.participants.map((p) => p.toString());
        if (!participantIds.includes(userId)) throw new Error('FORBIDDEN');

        const message = await Message.create({
          conversationId,
          expediteurId: userId,
          destinataireId,
          contenu,
          typeMessage,
          lu: false,
          dateEnvoi: new Date()
        });

        // mettre à jour conversation: dernier message et non lus pour destinataire
        const update = {
          derniereActivite: new Date(),
          'statistiques.dernierMessagePar': userId,
          'statistiques.dernierMessageContenu': (contenu || '').slice(0, 100)
        };
        // incrémenter pour tous sauf l'expéditeur (conversations de groupe)
        const inc = {};
        participantIds.forEach((pid) => {
          if (pid !== userId) {
            inc[`nombreMessagesNonLus.${pid}`] = 1;
          }
        });

        await Conversation.updateOne({ _id: conversationId }, { $set: update, ...(Object.keys(inc).length ? { $inc: inc } : {}) });

        const populated = await Message.findById(message._id)
          .populate('expediteurId', 'nom prenom avatar')
          .populate('destinataireId', 'nom prenom avatar');

        const { conversationRoom } = buildRoomNames(conversationId, userId);
        io.to(conversationRoom).emit('message:new', { message: populated });

        // notifier le destinataire si hors ligne
        const isDestOnline = presenceService.isOnline(destinataireId);
        if (!isDestOnline) {
          try {
            const destUser = await Utilisateur.findById(destinataireId).select('email nom prenom');
            if (destUser?.email) {
              await notificationService.sendEmail(
                destUser.email,
                'Nouveau message reçu',
                `${socket.user.nom} ${socket.user.prenom}: ${(contenu || '').slice(0, 120)}`
              );
            }
          } catch (err) {
            // log doux
            console.warn('Email offline non envoyé:', err.message);
          }
        }

        ack({ success: true, message: populated });
      } catch (e) {
        ack({ success: false, error: e.message });
      }
    });

    // marquer conversation comme lue
    socket.on('conversation:read', async ({ conversationId }, ack = () => {}) => {
      try {
        if (!mongoose.isValidObjectId(conversationId)) throw new Error('INVALID_CONVERSATION_ID');
        await Message.updateMany({ conversationId, destinataireId: userId, lu: false }, { lu: true, dateLecture: new Date() });
        await Conversation.updateOne({ _id: conversationId }, { $set: { [`nombreMessagesNonLus.${userId}`]: 0 } });

        const { conversationRoom } = buildRoomNames(conversationId, userId);
        io.to(conversationRoom).emit('conversation:read:update', { conversationId, userId });
        ack({ success: true });
      } catch (e) {
        ack({ success: false, error: e.message });
      }
    });

    socket.on('disconnect', () => {
      presenceService.setOffline(userId, socket.id);
      const online = presenceService.isOnline(userId);
      if (!online) io.emit('presence:update', { userId, online: false });
    });
  });

  // exposer io pour utilisation dans Express
  app.set('io', io);
  return io;
}

module.exports = { initSocket };


