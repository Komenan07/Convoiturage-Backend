const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const Utilisateur = require('../models/Utilisateur');
const Conversation = require('../models/Conversation');
const { Message } = require('../models/Message');
const Trajet = require('../models/Trajet');
const Reservation = require('../models/Reservation');
const AlerteUrgence = require('../models/AlerteUrgence');
const Paiement = require('../models/Paiement');
const notificationService = require('../services/notificationService');
const presenceService = require('../services/presenceService');
const locationService = require('../services/locationService');

/**
 * Récupère le token d'authentification depuis diverses sources possibles
 * @param {Object} socket - Objet socket
 * @returns {string|null} Token JWT ou null
 */
function getTokenFromHandshake(socket) {
  const { auth = {}, query = {} } = socket.handshake || {};
  return auth.token ||
         query.token ||
         (socket.handshake.headers && socket.handshake.headers['x-auth-token']) ||
         (socket.handshake.headers && socket.handshake.headers.authorization?.replace('Bearer ', ''));
}

/**
 * Middleware d'authentification pour les connexions Socket.IO
 * @param {Object} socket - Objet socket
 * @param {Function} next - Fonction next
 */
async function socketAuth(socket, next) {
  try {
    const token = getTokenFromHandshake(socket);
    if (!token) return next(new Error('NO_TOKEN'));
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await Utilisateur.findById(decoded.userId || decoded.id)
      .select('email nom prenom photoProfil telephone role statutCompte');

    if (!user || user.statutCompte !== 'ACTIF') {
      return next(new Error('USER_INVALID'));
    }
    // Stocker les infos utilisateur dans l'objet socket
    socket.user = {
      id: user._id.toString(),
      email: user.email,
      nom: user.nom,
      prenom: user.prenom,
      photoProfil: user.photoProfil,
      telephone: user.telephone,
      role: user.role
    };
    next();
  } catch (err) {
    console.error('Erreur d\'authentification socket:', err.message);
    next(new Error('AUTH_FAILED'));
  }
}

/**
 * Génère les noms des salles (rooms) pour Socket.IO
 * @param {string} conversationId - ID de la conversation
 * @param {string} userId - ID de l'utilisateur
 * @param {string} trajetId - ID du trajet
 * @returns {Object} Noms des salles
 */
function buildRoomNames(conversationId, userId, trajetId) {
  return {
    conversationRoom: conversationId ? `conversation:${conversationId}` : null,
    userRoom: userId ? `user:${userId}` : null,
    trajetRoom: trajetId ? `trajet:${trajetId}` : null
  };
}

/**
 * Initialise Socket.IO sur le serveur HTTP
 * @param {Object} httpServer - Serveur HTTP
 * @param {Object} app - Application Express
 * @returns {Object} Instance Socket.IO
 */
function initSocket(httpServer, app) {
  // Configuration de Socket.IO
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.CORS_ORIGIN || '*',
      methods: ['GET', 'POST'],
      credentials: true
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 60000, // 1 minute
    pingInterval: 25000, // 25 secondes
    maxHttpBufferSize: 5e6 // 5MB pour permettre les petites images
  });

  // Ajouter le middleware d'authentification
  io.use(socketAuth);

  // Stockage des utilisateurs connectés
  const connectedUsers = new Map();

  // Rendre disponible la liste des utilisateurs connectés dans l'app Express
  io.getConnectedUsers = () => connectedUsers;
  app.set('connectedUsers', connectedUsers);
  app.set('io', io);

  // ==================== GESTION DES CONNEXIONS ====================
  io.on('connection', async (socket) => {
    const userId = socket.user.id;
    console.log(`Socket connecté: ${userId} (${socket.id})`);

    // Enregistrer l'utilisateur dans la map des connectés
    connectedUsers.set(userId, {
      socketId: socket.id,
      user: socket.user,
      connectedAt: new Date()
    });

    // Mettre à jour le statut en ligne et rejoindre la salle utilisateur
    presenceService.setOnline(userId, socket.id);
    await socket.join(buildRoomNames(null, userId).userRoom);

    // Émettre l'événement de connexion à tous les utilisateurs
    io.emit('user_online', {
      userId,
      nom: socket.user.nom,
      prenom: socket.user.prenom,
      timestamp: new Date()
    });

    // Envoyer une confirmation de connexion
    socket.emit('connection:ack', {
      success: true,
      userId,
      userInfo: {
        nom: socket.user.nom,
        prenom: socket.user.prenom,
        email: socket.user.email
      }
    });

    // ==================== ÉVÉNEMENTS DE CHAT ====================
    // Rejoindre une conversation
    socket.on('conversation:join', async ({ conversationId }, ack = () => {}) => {
      try {
        if (!mongoose.isValidObjectId(conversationId)) {
          throw new Error('INVALID_CONVERSATION_ID');
        }
        const conversation = await Conversation.findById(conversationId).select('participants');
        if (!conversation) {
          throw new Error('CONVERSATION_NOT_FOUND');
        }
        if (!conversation.participants.map(p => p.toString()).includes(userId)) {
          throw new Error('FORBIDDEN');
        }
        const { conversationRoom } = buildRoomNames(conversationId, userId);
        await socket.join(conversationRoom);
        ack({ success: true });
      } catch (e) {
        ack({ success: false, error: e.message });
      }
    });

    // Quitter une conversation
    socket.on('conversation:leave', async ({ conversationId }, ack = () => {}) => {
      try {
        const { conversationRoom } = buildRoomNames(conversationId, userId);
        await socket.leave(conversationRoom);
        ack({ success: true });
      } catch (e) {
        ack({ success: false, error: e.message });
      }
    });

    // Envoyer un message
    socket.on('send_message', async (payload, ack = () => {}) => {
      try {
        const { conversationId, destinataireId, contenu, typeMessage = 'TEXTE', pieceJointe = null } = payload || {};
        if (!mongoose.isValidObjectId(conversationId)) {
          throw new Error('INVALID_CONVERSATION_ID');
        }
        if (!mongoose.isValidObjectId(destinataireId)) {
          throw new Error('INVALID_DESTINATAIRE_ID');
        }
        if (!contenu && typeMessage === 'TEXTE') {
          throw new Error('CONTENU_REQUIRED');
        }
        // Vérifier que la conversation existe et que l'utilisateur en fait partie
        const conversation = await Conversation.findById(conversationId).select('participants statistiques trajetId');
        if (!conversation) {
          throw new Error('CONVERSATION_NOT_FOUND');
        }
        const participantIds = conversation.participants.map(p => p.toString());
        if (!participantIds.includes(userId)) {
          throw new Error('FORBIDDEN');
        }
        // Créer le message
        const message = await Message.create({
          conversationId,
          expediteurId: userId,
          destinataireId,
          contenu,
          typeMessage,
          pieceJointe,
          lu: false,
          dateEnvoi: new Date()
        });
        // Mettre à jour la conversation
        const update = {
          derniereActivite: new Date(),
          'statistiques.dernierMessagePar': userId,
          'statistiques.dernierMessageContenu': (contenu || '').slice(0, 100)
        };
        // Incrémenter le nombre de messages non lus pour tous sauf l'expéditeur
        const inc = {};
        participantIds.forEach(pid => {
          if (pid !== userId) {
            inc[`nombreMessagesNonLus.${pid}`] = 1;
          }
        });
        await Conversation.updateOne(
          { _id: conversationId },
          {
            $set: update,
            ...(Object.keys(inc).length ? { $inc: inc } : {})
          }
        );
        // Récupérer le message avec les infos utilisateur
        const populated = await Message.findById(message._id)
          .populate('expediteurId', 'nom prenom photoProfil')
          .populate('destinataireId', 'nom prenom photoProfil');
        // Émettre l'événement de nouveau message aux participants de la conversation
        const { conversationRoom } = buildRoomNames(conversationId, userId);
        io.to(conversationRoom).emit('new_message', {
          message: populated,
          expediteur: {
            _id: socket.user.id,
            nom: socket.user.nom,
            prenom: socket.user.prenom,
            photoProfil: socket.user.photoProfil
          }
        });
        // Notifier le destinataire s'il est hors ligne
        const isDestOnline = presenceService.isOnline(destinataireId);
        if (!isDestOnline) {
          try {
            await notificationService.sendMessageNotification(
              destinataireId,
              `${socket.user.prenom} ${socket.user.nom}`,
              (contenu || '').slice(0, 120),
              { conversationId, messageId: message._id }
            );
          } catch (err) {
            console.warn('Notification de message non envoyée:', err.message);
          }
        }
        ack({ success: true, message: populated });
      } catch (e) {
        console.error('Erreur d\'envoi de message:', e);
        ack({ success: false, error: e.message });
      }
    });

    // Marquer les messages comme lus
    socket.on('mark_as_read', async (payload, ack = () => {}) => {
      try {
        const { messageId, conversationId } = payload || {};
        if (messageId) {
          // Marquer un message spécifique comme lu
          const message = await Message.findOneAndUpdate(
            { _id: messageId, destinataireId: userId, lu: false },
            { lu: true, dateLecture: new Date() },
            { new: true }
          );
          if (message) {
            // Émettre l'événement de lecture à l'expéditeur
            const userRoom = buildRoomNames(null, message.expediteurId).userRoom;
            io.to(userRoom).emit('message_read', {
              messageId: message._id,
              conversationId: message.conversationId,
              readBy: userId,
              timestamp: new Date()
            });
          }
        } else if (conversationId) {
          // Marquer tous les messages de la conversation comme lus
          await Message.updateMany(
            { conversationId, destinataireId: userId, lu: false },
            { lu: true, dateLecture: new Date() }
          );
          await Conversation.updateOne(
            { _id: conversationId },
            { $set: { [`nombreMessagesNonLus.${userId}`]: 0 } }
          );
          // Émettre l'événement aux participants de la conversation
          const { conversationRoom } = buildRoomNames(conversationId, userId);
          io.to(conversationRoom).emit('conversation:read:update', {
            conversationId,
            userId
          });
        } else {
          throw new Error('MISSING_PARAMETERS');
        }
        ack({ success: true });
      } catch (e) {
        ack({ success: false, error: e.message });
      }
    });

    // Utilisateur en train de taper
    socket.on('typing_start', (data) => {
      try {
        const { conversationId } = data;
        if (!conversationId) return;
        // Émettre l'événement aux participants de la conversation
        const { conversationRoom } = buildRoomNames(conversationId, userId);
        socket.to(conversationRoom).emit('user_typing', {
          conversationId,
          userId,
          userName: `${socket.user.prenom} ${socket.user.nom}`,
          timestamp: new Date()
        });
      } catch (error) {
        console.error('Erreur typing_start:', error);
      }
    });

    // Utilisateur a arrêté de taper
    socket.on('typing_end', (data) => {
      try {
        const { conversationId } = data;
        if (!conversationId) return;
        // Émettre l'événement aux participants de la conversation
        const { conversationRoom } = buildRoomNames(conversationId, userId);
        socket.to(conversationRoom).emit('user_stopped_typing', {
          conversationId,
          userId,
          userName: `${socket.user.prenom} ${socket.user.nom}`,
          timestamp: new Date()
        });
      } catch (error) {
        console.error('Erreur typing_end:', error);
      }
    });

    // ==================== ÉVÉNEMENTS DE RÉSERVATION ====================
    // Créer une réservation
    socket.on('create_reservation', async (data, ack = () => {}) => {
      try {
        const {
          trajetId,
          nombrePlacesReservees,
          pointPriseEnCharge,
          pointDepose,
          bagages = null
        } = data;
        if (!trajetId || !nombrePlacesReservees || !pointPriseEnCharge || !pointDepose) {
          throw new Error('MISSING_PARAMETERS');
        }
        // Vérifier si le trajet existe
        const trajet = await Trajet.findById(trajetId);
        if (!trajet) {
          throw new Error('TRAJET_NOT_FOUND');
        }
        // Vérifier la disponibilité des places
        if (trajet.nombrePlacesDisponibles < nombrePlacesReservees) {
          throw new Error('PLACES_INSUFFISANTES');
        }
        // Vérifier que l'utilisateur n'est pas le conducteur
        if (trajet.conducteurId.toString() === userId) {
          throw new Error('SELF_RESERVATION_FORBIDDEN');
        }
        // Calculer le montant total
        const montantTotal = trajet.prixParPassager * nombrePlacesReservees;
        // Créer la réservation
        const newReservation = new Reservation({
          trajetId,
          passagerId: userId,
          nombrePlacesReservees,
          pointPriseEnCharge,
          pointDepose,
          statutReservation: trajet.validationAutomatique ? 'CONFIRMEE' : 'EN_ATTENTE',
          dateReservation: new Date(),
          montantTotal,
          statutPaiement: 'EN_ATTENTE',
          bagages
        });
        await newReservation.save();
        // Mettre à jour le nombre de places disponibles sur le trajet
        await Trajet.findByIdAndUpdate(trajetId, {
          $inc: { nombrePlacesDisponibles: -nombrePlacesReservees }
        });
        // Créer une conversation pour la réservation si elle n'existe pas déjà
        let conversation = await Conversation.findOne({
          trajetId,
          participants: { $all: [userId, trajet.conducteurId.toString()] }
        });
        if (!conversation) {
          conversation = new Conversation({
            trajetId,
            participants: [userId, trajet.conducteurId],
            derniereActivite: new Date(),
            nombreMessagesNonLus: {}
          });
          // Initialiser à 0 pour tous les participants
          conversation.participants.forEach(p => {
            conversation.nombreMessagesNonLus[p.toString()] = 0;
          });
          await conversation.save();
          // Récupérer les infos de l'utilisateur
          const passager = await Utilisateur.findById(userId)
            .select('nom prenom photoProfil telephone');
          // Émettre l'événement de création de conversation au conducteur
          const conducteurRoom = buildRoomNames(null, trajet.conducteurId).userRoom;
          io.to(conducteurRoom).emit('conversation_created', {
            conversation,
            avecUtilisateur: {
              _id: passager._id,
              nom: passager.nom,
              prenom: passager.prenom,
              photoProfil: passager.photoProfil
            }
          });
        }
        // Récupérer les infos du conducteur
        const conducteur = await Utilisateur.findById(trajet.conducteurId)
          .select('nom prenom photoProfil telephone');
        // Émettre l'événement de création de réservation au conducteur
        const conducteurRoom = buildRoomNames(null, trajet.conducteurId).userRoom;
        io.to(conducteurRoom).emit('reservation_created', {
          reservation: newReservation,
          passager: {
            _id: userId,
            nom: socket.user.nom,
            prenom: socket.user.prenom,
            photoProfil: socket.user.photoProfil,
            telephone: socket.user.telephone
          },
          trajet: {
            _id: trajet._id,
            dateDepart: trajet.dateDepart,
            heureDepart: trajet.heureDepart,
            pointDepart: trajet.pointDepart,
            pointArrivee: trajet.pointArrivee
          }
        });
        // Envoyer une notification au conducteur s'il est hors ligne
        if (!presenceService.isOnline(trajet.conducteurId.toString())) {
          await notificationService.sendReservationNotification(
            trajet.conducteurId,
            'Nouvelle réservation',
            `${socket.user.prenom} ${socket.user.nom} a réservé ${nombrePlacesReservees} place(s) pour votre trajet.`,
            { trajetId, reservationId: newReservation._id }
          );
        }
        // Envoyer la confirmation au passager
        ack({
          success: true,
          reservation: newReservation,
          conducteur: {
            _id: conducteur._id,
            nom: conducteur.nom,
            prenom: conducteur.prenom,
            photoProfil: conducteur.photoProfil,
            telephone: conducteur.telephone
          },
          trajet: {
            _id: trajet._id,
            dateDepart: trajet.dateDepart,
            heureDepart: trajet.heureDepart,
            pointDepart: trajet.pointDepart,
            pointArrivee: trajet.pointArrivee
          },
          conversationId: conversation._id
        });
      } catch (e) {
        console.error('Erreur create_reservation:', e);
        ack({ success: false, error: e.message });
      }
    });

    // Confirmer une réservation
    socket.on('confirm_reservation', async (data, ack = () => {}) => {
      try {
        const { reservationId } = data;
        if (!reservationId) {
          throw new Error('MISSING_RESERVATION_ID');
        }
        // Vérifier si la réservation existe
        const reservation = await Reservation.findById(reservationId);
        if (!reservation) {
          throw new Error('RESERVATION_NOT_FOUND');
        }
        // Vérifier que l'utilisateur est le conducteur du trajet
        const trajet = await Trajet.findById(reservation.trajetId);
        if (!trajet || trajet.conducteurId.toString() !== userId) {
          throw new Error('NOT_AUTHORIZED');
        }
        // Vérifier que la réservation est en attente
        if (reservation.statutReservation !== 'EN_ATTENTE') {
          throw new Error('INVALID_RESERVATION_STATUS');
        }
        // Mettre à jour le statut de la réservation
        reservation.statutReservation = 'CONFIRMEE';
        reservation.dateConfirmation = new Date();
        await reservation.save();
        // Émettre l'événement de confirmation de réservation au passager
        const passagerRoom = buildRoomNames(null, reservation.passagerId).userRoom;
        io.to(passagerRoom).emit('reservation_confirmed', {
          reservationId: reservation._id,
          trajetId: trajet._id,
          confirmePar: userId,
          dateConfirmation: reservation.dateConfirmation
        });
        // Envoyer une notification au passager s'il est hors ligne
        if (!presenceService.isOnline(reservation.passagerId.toString())) {
          await notificationService.sendReservationNotification(
            reservation.passagerId,
            'Réservation confirmée',
            `Votre réservation pour le trajet du ${new Date(trajet.dateDepart).toLocaleDateString()} a été confirmée.`,
            { trajetId: trajet._id, reservationId: reservation._id }
          );
        }
        // Envoyer la confirmation au conducteur
        ack({
          success: true,
          reservationId: reservation._id,
          trajetId: trajet._id,
          passagerId: reservation.passagerId,
          dateConfirmation: reservation.dateConfirmation
        });
      } catch (e) {
        console.error('Erreur confirm_reservation:', e);
        ack({ success: false, error: e.message });
      }
    });

    // Refuser une réservation
    socket.on('reject_reservation', async (data, ack = () => {}) => {
      try {
        const { reservationId, motifRefus } = data;
        if (!reservationId) {
          throw new Error('MISSING_RESERVATION_ID');
        }
        // Vérifier si la réservation existe
        const reservation = await Reservation.findById(reservationId);
        if (!reservation) {
          throw new Error('RESERVATION_NOT_FOUND');
        }
        // Vérifier que l'utilisateur est le conducteur du trajet
        const trajet = await Trajet.findById(reservation.trajetId);
        if (!trajet || trajet.conducteurId.toString() !== userId) {
          throw new Error('NOT_AUTHORIZED');
        }
        // Vérifier que la réservation est en attente
        if (reservation.statutReservation !== 'EN_ATTENTE') {
          throw new Error('INVALID_RESERVATION_STATUS');
        }
        // Récupérer le nombre de places à réintégrer
        const placesAReintegrer = reservation.nombrePlacesReservees;
        // Mettre à jour le statut de la réservation
        reservation.statutReservation = 'REFUSEE';
        reservation.motifRefus = motifRefus;
        await reservation.save();
        // Réintégrer les places au trajet
        await Trajet.findByIdAndUpdate(trajet._id, {
          $inc: { nombrePlacesDisponibles: placesAReintegrer }
        });
        // Émettre l'événement de refus de réservation au passager
        const passagerRoom = buildRoomNames(null, reservation.passagerId).userRoom;
        io.to(passagerRoom).emit('reservation_rejected', {
          reservationId: reservation._id,
          trajetId: trajet._id,
          motifRefus,
          refusePar: userId
        });
        // Envoyer une notification au passager s'il est hors ligne
        if (!presenceService.isOnline(reservation.passagerId.toString())) {
          await notificationService.sendReservationNotification(
            reservation.passagerId,
            'Réservation refusée',
            `Votre réservation pour le trajet du ${new Date(trajet.dateDepart).toLocaleDateString()} a été refusée.`,
            { trajetId: trajet._id, reservationId: reservation._id }
          );
        }
        // Envoyer la confirmation au conducteur
        ack({
          success: true,
          reservationId: reservation._id,
          trajetId: trajet._id,
          passagerId: reservation.passagerId,
          motifRefus
        });
      } catch (e) {
        console.error('Erreur reject_reservation:', e);
        ack({ success: false, error: e.message });
      }
    });

    // Annuler une réservation
    socket.on('cancel_reservation', async (data, ack = () => {}) => {
      try {
        const { reservationId, motifAnnulation } = data;
        if (!reservationId) {
          throw new Error('MISSING_RESERVATION_ID');
        }
        // Vérifier si la réservation existe
        const reservation = await Reservation.findById(reservationId);
        if (!reservation) {
          throw new Error('RESERVATION_NOT_FOUND');
        }
        // Vérifier que l'utilisateur est autorisé (passager ou conducteur)
        const trajet = await Trajet.findById(reservation.trajetId);
        if (!trajet) {
          throw new Error('TRAJET_NOT_FOUND');
        }
        const estPassager = reservation.passagerId.toString() === userId;
        const estConducteur = trajet.conducteurId.toString() === userId;
        if (!estPassager && !estConducteur) {
          throw new Error('NOT_AUTHORIZED');
        }
        // Vérifier que la réservation peut être annulée
        if (reservation.statutReservation === 'TERMINEE' ||
            reservation.statutReservation === 'REFUSEE' ||
            reservation.statutReservation === 'ANNULEE') {
          throw new Error('INVALID_RESERVATION_STATUS');
        }
        // Récupérer le nombre de places à réintégrer
        const placesAReintegrer = reservation.nombrePlacesReservees;
        // Mettre à jour le statut de la réservation
        reservation.statutReservation = 'ANNULEE';
        reservation.motifRefus = motifAnnulation; // Réutilisation du champ motifRefus
        await reservation.save();
        // Réintégrer les places au trajet si le trajet n'est pas déjà en cours ou terminé
        if (trajet.statutTrajet !== 'EN_COURS' && trajet.statutTrajet !== 'TERMINE') {
          await Trajet.findByIdAndUpdate(trajet._id, {
            $inc: { nombrePlacesDisponibles: placesAReintegrer }
          });
        }
        // Déterminer l'autre partie concernée
        const autrePartieId = estPassager ? trajet.conducteurId : reservation.passagerId;
        // Émettre l'événement d'annulation à l'autre partie
        const autrePartieRoom = buildRoomNames(null, autrePartieId).userRoom;
        io.to(autrePartieRoom).emit('reservation_cancelled', {
          reservationId: reservation._id,
          trajetId: trajet._id,
          annulePar: userId,
          estAnnuleParConducteur: estConducteur,
          motifAnnulation
        });
        // Envoyer une notification à l'autre partie si elle est hors ligne
        if (!presenceService.isOnline(autrePartieId.toString())) {
          const messageNotif = estConducteur
            ? `Le conducteur a annulé votre réservation pour le trajet du ${new Date(trajet.dateDepart).toLocaleDateString()}.`
            : `Un passager a annulé sa réservation pour le trajet du ${new Date(trajet.dateDepart).toLocaleDateString()}.`;
          await notificationService.sendReservationNotification(
            autrePartieId,
            'Réservation annulée',
            messageNotif,
            { trajetId: trajet._id, reservationId: reservation._id }
          );
        }
        // Envoyer la confirmation à l'utilisateur actuel
        ack({
          success: true,
          reservationId: reservation._id,
          trajetId: trajet._id,
          autrePartieId,
          motifAnnulation
        });
      } catch (e) {
        console.error('Erreur cancel_reservation:', e);
        ack({ success: false, error: e.message });
      }
    });

    // ==================== ÉVÉNEMENTS DE TRAJET ====================
    // Rejoindre un trajet (pour le suivi en temps réel)
    socket.on('trajet:join', async ({ trajetId }, ack = () => {}) => {
      try {
        if (!mongoose.isValidObjectId(trajetId)) {
          throw new Error('INVALID_TRAJET_ID');
        }
        const trajet = await Trajet.findById(trajetId);
        if (!trajet) {
          throw new Error('TRAJET_NOT_FOUND');
        }
        // Vérifier si l'utilisateur est le conducteur ou un passager confirmé
        const estConducteur = trajet.conducteurId.toString() === userId;
        let estPassager = false;
        if (!estConducteur) {
          const reservation = await Reservation.findOne({
            trajetId,
            passagerId: userId,
            statutReservation: 'CONFIRMEE'
          });
          estPassager = !!reservation;
        }
        if (!estConducteur && !estPassager) {
          throw new Error('NOT_AUTHORIZED');
        }
        const { trajetRoom } = buildRoomNames(null, null, trajetId);
        await socket.join(trajetRoom);
        ack({ success: true });
      } catch (e) {
        ack({ success: false, error: e.message });
      }
    });

    // Quitter un trajet (arrêter le suivi en temps réel)
    socket.on('trajet:leave', async ({ trajetId }, ack = () => {}) => {
      try {
        const { trajetRoom } = buildRoomNames(null, null, trajetId);
        await socket.leave(trajetRoom);
        ack({ success: true });
      } catch (e) {
        ack({ success: false, error: e.message });
      }
    });

    // Démarrer un trajet
    socket.on('start_trajet', async (data, ack = () => {}) => {
      try {
        const { trajetId } = data;
        if (!trajetId) {
          throw new Error('MISSING_TRAJET_ID');
        }
        // Vérifier si le trajet existe
        const trajet = await Trajet.findById(trajetId);
        if (!trajet) {
          throw new Error('TRAJET_NOT_FOUND');
        }
        // Vérifier que l'utilisateur est le conducteur
        if (trajet.conducteurId.toString() !== userId) {
          throw new Error('NOT_AUTHORIZED');
        }
        // Vérifier que le trajet peut être démarré
        if (trajet.statutTrajet !== 'PROGRAMME') {
          throw new Error('INVALID_TRAJET_STATUS');
        }
        // Mettre à jour le statut du trajet
        trajet.statutTrajet = 'EN_COURS';
        await trajet.save();
        // Récupérer toutes les réservations confirmées pour ce trajet
        const reservations = await Reservation.find({
          trajetId,
          statutReservation: 'CONFIRMEE'
        }).populate('passagerId', 'nom prenom telephone photoProfil');
        // Préparer les données pour l'événement
        const startData = {
          trajetId: trajet._id,
          dateDepart: trajet.dateDepart,
          heureDepart: trajet.heureDepart,
          conducteur: {
            _id: userId,
            nom: socket.user.nom,
            prenom: socket.user.prenom,
            telephone: socket.user.telephone
          },
          nombrePassagers: reservations.length,
          timestamp: new Date()
        };
        // Émettre l'événement de démarrage à tous les passagers et au conducteur
        const { trajetRoom } = buildRoomNames(null, null, trajetId);
        io.to(trajetRoom).emit('trajet_started', startData);
        // Envoyer des notifications aux passagers qui ne sont pas en ligne
        for (const reservation of reservations) {
          const passagerId = reservation.passagerId._id.toString();
          if (!presenceService.isOnline(passagerId)) {
            await notificationService.sendTrajetNotification(
              passagerId,
              'Trajet démarré',
              `Votre trajet vient de démarrer. Le conducteur est en route.`,
              { trajetId }
            );
          }
        }
        // Envoyer la confirmation au conducteur avec la liste des passagers
        ack({
          success: true,
          ...startData,
          passagers: reservations.map(r => ({
            reservationId: r._id,
            passager: r.passagerId,
            nombrePlaces: r.nombrePlacesReservees,
            pointPriseEnCharge: r.pointPriseEnCharge,
            pointDepose: r.pointDepose
          }))
        });
      } catch (e) {
        console.error('Erreur start_trajet:', e);
        ack({ success: false, error: e.message });
      }
    });

    // Mettre à jour la position du conducteur
    socket.on('update_location', async (data, ack = () => {}) => {
      try {
        const { trajetId, position } = data;
        if (!trajetId || !position || !position.coordinates) {
          throw new Error('MISSING_PARAMETERS');
        }
        // Vérifier si le trajet existe
        const trajet = await Trajet.findById(trajetId);
        if (!trajet) {
          throw new Error('TRAJET_NOT_FOUND');
        }
        // Vérifier que l'utilisateur est le conducteur
        if (trajet.conducteurId.toString() !== userId) {
          throw new Error('NOT_AUTHORIZED');
        }
        // Vérifier que le trajet est en cours
        if (trajet.statutTrajet !== 'EN_COURS') {
          throw new Error('INVALID_TRAJET_STATUS');
        }
        // Préparer les données pour l'événement
        const locationData = {
          trajetId,
          position,
          timestamp: new Date()
        };
        // Émettre l'événement de mise à jour de position à tous les participants du trajet
        const { trajetRoom } = buildRoomNames(null, null, trajetId);
        io.to(trajetRoom).emit('trajet_location_update', locationData);
        // Stocker la position dans le service de localisation
        locationService.updateTrajetLocation(trajetId, position);
        // Mettre à jour les réservations avec la position en temps réel
        await Reservation.updateMany(
          {
            trajetId,
            statutReservation: 'CONFIRMEE'
          },
          {
            'positionEnTempsReel.coordonnees': position,
            'positionEnTempsReel.lastUpdate': new Date()
          }
        );
        ack({ success: true, timestamp: new Date() });
      } catch (e) {
        console.error('Erreur update_location:', e);
        ack({ success: false, error: e.message });
      }
    });

    // Prise en charge d'un passager
    socket.on('pickup_passenger', async (data, ack = () => {}) => {
      try {
        const { reservationId, position } = data;
        if (!reservationId) {
          throw new Error('MISSING_RESERVATION_ID');
        }
        // Vérifier si la réservation existe
        const reservation = await Reservation.findById(reservationId)
          .populate('trajetId');
        if (!reservation) {
          throw new Error('RESERVATION_NOT_FOUND');
        }
        const trajet = reservation.trajetId;
        // Vérifier que l'utilisateur est le conducteur
        if (trajet.conducteurId.toString() !== userId) {
          throw new Error('NOT_AUTHORIZED');
        }
        // Vérifier que la réservation est confirmée
        if (reservation.statutReservation !== 'CONFIRMEE') {
          throw new Error('INVALID_RESERVATION_STATUS');
        }
        // Préparer les données pour l'événement
        const pickupData = {
          reservationId: reservation._id,
          trajetId: trajet._id,
          passagerId: reservation.passagerId,
          position: position || null,
          timestamp: new Date()
        };
        // Émettre l'événement de prise en charge au passager
        const passagerRoom = buildRoomNames(null, reservation.passagerId).userRoom;
        io.to(passagerRoom).emit('passenger_pickup', pickupData);
        // Émettre également à tous les participants du trajet
        const { trajetRoom } = buildRoomNames(null, null, trajet._id);
        io.to(trajetRoom).emit('passenger_pickup', pickupData);
        // Envoyer une notification au passager s'il est hors ligne
        if (!presenceService.isOnline(reservation.passagerId.toString())) {
          await notificationService.sendTrajetNotification(
            reservation.passagerId,
            'Prise en charge',
            `Le conducteur est arrivé à votre point de prise en charge.`,
            { trajetId: trajet._id, reservationId: reservation._id }
          );
        }
        // Envoyer la confirmation au conducteur
        ack({ success: true, ...pickupData });
      } catch (e) {
        console.error('Erreur pickup_passenger:', e);
        ack({ success: false, error: e.message });
      }
    });

    // Dépose d'un passager
    socket.on('dropoff_passenger', async (data, ack = () => {}) => {
      try {
        const { reservationId, position } = data;
        if (!reservationId) {
          throw new Error('MISSING_RESERVATION_ID');
        }
        // Vérifier si la réservation existe
        const reservation = await Reservation.findById(reservationId)
          .populate('trajetId');
        if (!reservation) {
          throw new Error('RESERVATION_NOT_FOUND');
        }
        const trajet = reservation.trajetId;
        // Vérifier que l'utilisateur est le conducteur
        if (trajet.conducteurId.toString() !== userId) {
          throw new Error('NOT_AUTHORIZED');
        }
        // Vérifier que la réservation est confirmée
        if (reservation.statutReservation !== 'CONFIRMEE') {
          throw new Error('INVALID_RESERVATION_STATUS');
        }
        // Mettre à jour le statut de la réservation
        reservation.statutReservation = 'TERMINEE';
        await reservation.save();
        // Préparer les données pour l'événement
        const dropoffData = {
          reservationId: reservation._id,
          trajetId: trajet._id,
          passagerId: reservation.passagerId,
          position: position || null,
          timestamp: new Date()
        };
        // Émettre l'événement de dépose au passager
        const passagerRoom = buildRoomNames(null, reservation.passagerId).userRoom;
        io.to(passagerRoom).emit('passenger_dropoff', dropoffData);
        // Émettre également à tous les participants du trajet
        const { trajetRoom } = buildRoomNames(null, null, trajet._id);
        io.to(trajetRoom).emit('passenger_dropoff', dropoffData);
        // Envoyer une notification au passager s'il est hors ligne
        if (!presenceService.isOnline(reservation.passagerId.toString())) {
          await notificationService.sendTrajetNotification(
            reservation.passagerId,
            'Arrivée à destination',
            `Vous êtes arrivé à destination. Merci d'avoir voyagé avec nous !`,
            { trajetId: trajet._id, reservationId: reservation._id }
          );
        }
        // Envoyer la confirmation au conducteur
        ack({ success: true, ...dropoffData });
      } catch (e) {
        console.error('Erreur dropoff_passenger:', e);
        ack({ success: false, error: e.message });
      }
    });

    // Terminer un trajet
    socket.on('complete_trajet', async (data, ack = () => {}) => {
      try {
        const { trajetId } = data;
        if (!trajetId) {
          throw new Error('MISSING_TRAJET_ID');
        }
        // Vérifier si le trajet existe
        const trajet = await Trajet.findById(trajetId);
        if (!trajet) {
          throw new Error('TRAJET_NOT_FOUND');
        }
        // Vérifier que l'utilisateur est le conducteur
        if (trajet.conducteurId.toString() !== userId) {
          throw new Error('NOT_AUTHORIZED');
        }
        // Vérifier que le trajet est en cours
        if (trajet.statutTrajet !== 'EN_COURS') {
          throw new Error('INVALID_TRAJET_STATUS');
        }
        // Mettre à jour le statut du trajet
        trajet.statutTrajet = 'TERMINE';
        await trajet.save();
        // Mettre à jour toutes les réservations non terminées
        await Reservation.updateMany(
          {
            trajetId,
            statutReservation: 'CONFIRMEE'
          },
          {
            statutReservation: 'TERMINEE'
          }
        );
        // Récupérer toutes les réservations pour ce trajet
        const reservations = await Reservation.find({
          trajetId,
          statutReservation: 'TERMINEE'
        });
        // Préparer les données pour l'événement
        const completionData = {
          trajetId: trajet._id,
          conducteurId: trajet.conducteurId,
          nombrePassagers: reservations.length,
          timestamp: new Date()
        };
        // Émettre l'événement de fin de trajet à tous les participants du trajet
        const { trajetRoom } = buildRoomNames(null, null, trajetId);
        io.to(trajetRoom).emit('trajet_completed', completionData);
        // Envoyer des notifications aux passagers qui ne sont pas en ligne
        for (const reservation of reservations) {
          const passagerId = reservation.passagerId.toString();
          if (!presenceService.isOnline(passagerId)) {
            await notificationService.sendTrajetNotification(
              passagerId,
              'Trajet terminé',
              `Votre trajet est terminé. N'oubliez pas de laisser une évaluation !`,
              { trajetId }
            );
          }
        }
        // Envoyer la confirmation au conducteur
        ack({ success: true, ...completionData });
      } catch (e) {
        console.error('Erreur complete_trajet:', e);
        ack({ success: false, error: e.message });
      }
    });

    // ==================== ÉVÉNEMENTS D'URGENCE ====================
    // Déclencher une alerte d'urgence
    socket.on('trigger_emergency', async (data, ack = () => {}) => {
      try {
        const {
          trajetId,
          typeAlerte,
          description,
          position,
          niveauGravite = 'MOYEN'
        } = data;
        if (!trajetId || !typeAlerte) {
          throw new Error('MISSING_PARAMETERS');
        }
        // Vérifier si le trajet existe
        const trajet = await Trajet.findById(trajetId);
        if (!trajet) {
          throw new Error('TRAJET_NOT_FOUND');
        }
        // Vérifier que l'utilisateur est un participant du trajet
        const estConducteur = trajet.conducteurId.toString() === userId;
        let estPassager = false;
        if (!estConducteur) {
          // Vérifier si l'utilisateur est un passager
          const reservation = await Reservation.findOne({
            trajetId,
            passagerId: userId,
            statutReservation: { $in: ['CONFIRMEE', 'TERMINEE'] }
          });
          estPassager = !!reservation;
          if (!estPassager) {
            throw new Error('NOT_AUTHORIZED');
          }
        }
        // Récupérer toutes les réservations confirmées pour ce trajet
        const reservations = await Reservation.find({
          trajetId,
          statutReservation: { $in: ['CONFIRMEE', 'TERMINEE'] }
        }).populate('passagerId', 'nom prenom telephone');
        // Préparer la liste des personnes présentes
        const personnesPresentes = [
          {
            utilisateurId: trajet.conducteurId,
            nom: `${socket.user.prenom} ${socket.user.nom}`,
            telephone: socket.user.telephone
          }
        ];
        for (const reservation of reservations) {
          personnesPresentes.push({
            utilisateurId: reservation.passagerId._id,
            nom: `${reservation.passagerId.prenom} ${reservation.passagerId.nom}`,
            telephone: reservation.passagerId.telephone
          });
        }
        // Créer l'alerte d'urgence
        const newAlerte = new AlerteUrgence({
          declencheurId: userId,
          trajetId,
          position: position || {
            type: 'Point',
            coordinates: [0, 0] // Position par défaut
          },
          typeAlerte,
          description,
          niveauGravite,
          personnesPresentes,
          statutAlerte: 'ACTIVE',
          premiersSecours: false,
          policeContactee: false,
          createdAt: new Date()
        });
        await newAlerte.save();
        // Préparer les données pour l'événement
        const emergencyData = {
          alerteId: newAlerte._id,
          trajetId,
          declencheur: {
            _id: userId,
            nom: socket.user.nom,
            prenom: socket.user.prenom,
            telephone: socket.user.telephone
          },
          typeAlerte,
          description,
          niveauGravite,
          position: position || null,
          timestamp: new Date()
        };
        // Émettre l'événement d'urgence à tous les participants du trajet
        const { trajetRoom } = buildRoomNames(null, null, trajetId);
        io.to(trajetRoom).emit('emergency_alert', emergencyData);
        // Envoyer des notifications d'urgence à tous les participants qui ne sont pas en ligne
        const participantsIds = [trajet.conducteurId.toString(), ...reservations.map(r => r.passagerId._id.toString())];
        for (const participantId of participantsIds) {
          if (participantId !== userId && !presenceService.isOnline(participantId)) {
            await notificationService.sendEmergencyNotification(
              participantId,
              'ALERTE URGENCE',
              `${typeAlerte}: ${description || 'Urgence signalée pendant le trajet'}`,
              { trajetId, alerteId: newAlerte._id }
            );
          }
        }
        // Envoyer la confirmation au déclencheur
        ack({ success: true, alerteId: newAlerte._id });
      } catch (e) {
        console.error('Erreur trigger_emergency:', e);
        ack({ success: false, error: e.message });
      }
    });

    // Résoudre une alerte d'urgence
    socket.on('resolve_emergency', async (data, ack = () => {}) => {
      try {
        const { alerteId, commentaireResolution } = data;
        if (!alerteId) {
          throw new Error('MISSING_ALERTE_ID');
        }
        // Vérifier si l'alerte existe
        const alerte = await AlerteUrgence.findById(alerteId);
        if (!alerte) {
          throw new Error('ALERTE_NOT_FOUND');
        }
        // Vérifier que l'utilisateur est le déclencheur ou le conducteur du trajet
        const trajet = await Trajet.findById(alerte.trajetId);
        if (!trajet) {
          throw new Error('TRAJET_NOT_FOUND');
        }
        const estDeclencheur = alerte.declencheurId.toString() === userId;
        const estConducteur = trajet.conducteurId.toString() === userId;
        if (!estDeclencheur && !estConducteur) {
          throw new Error('NOT_AUTHORIZED');
        }
        // Vérifier que l'alerte est active
        if (alerte.statutAlerte !== 'ACTIVE' && alerte.statutAlerte !== 'EN_TRAITEMENT') {
          throw new Error('INVALID_ALERTE_STATUS');
        }
        // Mettre à jour le statut de l'alerte
        alerte.statutAlerte = 'RESOLUE';
        alerte.dateResolution = new Date();
        alerte.commentaireResolution = commentaireResolution;
        await alerte.save();
        // Préparer les données pour l'événement
        const resolutionData = {
          alerteId: alerte._id,
          trajetId: alerte.trajetId,
          resoluPar: userId,
          commentaireResolution,
          timestamp: new Date()
        };
        // Émettre l'événement de résolution à tous les participants du trajet
        const { trajetRoom } = buildRoomNames(null, null, alerte.trajetId);
        io.to(trajetRoom).emit('emergency_resolved', resolutionData);
        // Envoyer des notifications de résolution à tous les participants qui ne sont pas en ligne
        const reservations = await Reservation.find({
          trajetId: alerte.trajetId,
          statutReservation: { $in: ['CONFIRMEE', 'TERMINEE'] }
        });
        const participantsIds = [trajet.conducteurId.toString(), ...reservations.map(r => r.passagerId.toString())];
        for (const participantId of participantsIds) {
          if (participantId !== userId && !presenceService.isOnline(participantId)) {
            await notificationService.sendEmergencyNotification(
              participantId,
              'Urgence résolue',
              `L'alerte d'urgence a été résolue.`,
              { trajetId: alerte.trajetId, alerteId: alerte._id }
            );
          }
        }
        // Envoyer la confirmation au résolveur
        ack({ success: true, ...resolutionData });
      } catch (e) {
        console.error('Erreur resolve_emergency:', e);
        ack({ success: false, error: e.message });
      }
    });

    // ==================== ÉVÉNEMENTS DE PAIEMENT ====================
    // Mettre à jour un paiement
    socket.on('update_payment', async (data, ack = () => {}) => {
      try {
        const {
          reservationId,
          methodePaiement,
          referencePaiement,
          statutPaiement
        } = data;
        if (!reservationId || !methodePaiement || !statutPaiement) {
          throw new Error('MISSING_PARAMETERS');
        }
        // Vérifier si la réservation existe
        const reservation = await Reservation.findById(reservationId)
          .populate('trajetId');
        if (!reservation) {
          throw new Error('RESERVATION_NOT_FOUND');
        }
        const trajet = reservation.trajetId;
        // Vérifier que l'utilisateur est autorisé (passager ou administrateur)
        const estPassager = reservation.passagerId.toString() === userId;
        const estAdmin = socket.user.role === 'ADMIN' || socket.user.role === 'SUPER_ADMIN';
        if (!estPassager && !estAdmin) {
          throw new Error('NOT_AUTHORIZED');
        }
        // Mettre à jour le statut du paiement de la réservation
        reservation.statutPaiement = statutPaiement;
        reservation.methodePaiement = methodePaiement;
        reservation.referencePaiement = referencePaiement;
        reservation.datePaiement = new Date();
        await reservation.save();
        // Créer ou mettre à jour l'enregistrement de paiement
        let paiement = await Paiement.findOne({ reservationId });
        if (!paiement) {
          // Calculer les montants
          const montantTotal = reservation.montantTotal;
          const commissionPlateforme = montantTotal * 0.1; // 10% de commission
          const fraisTransaction = 0; // À ajuster selon la méthode de paiement
          const montantConducteur = montantTotal - commissionPlateforme - fraisTransaction;
          paiement = new Paiement({
            reservationId,
            payeurId: reservation.passagerId,
            beneficiaireId: trajet.conducteurId,
            montantTotal,
            montantConducteur,
            commissionPlateforme,
            fraisTransaction,
            methodePaiement,
            referenceTransaction: referencePaiement,
            statutPaiement,
            dateInitiation: new Date(),
            dateTraitement: statutPaiement === 'TRAITE' ? new Date() : null,
            dateCompletion: statutPaiement === 'COMPLETE' ? new Date() : null,
            numeroRecu: `REC-${Date.now()}-${Math.floor(Math.random() * 1000)}`
          });
        } else {
          paiement.methodePaiement = methodePaiement;
          paiement.referenceTransaction = referencePaiement;
          paiement.statutPaiement = statutPaiement;
          if (statutPaiement === 'TRAITE') {
            paiement.dateTraitement = new Date();
          }
          if (statutPaiement === 'COMPLETE') {
            paiement.dateCompletion = new Date();
          }
        }
        await paiement.save();
        // Préparer les données pour l'événement
        const paymentData = {
          paiementId: paiement._id,
          reservationId,
          trajetId: trajet._id,
          montantTotal: paiement.montantTotal,
          statutPaiement,
          methodePaiement,
          timestamp: new Date()
        };
        // Émettre l'événement de mise à jour du paiement au conducteur
        const conducteurRoom = buildRoomNames(null, trajet.conducteurId).userRoom;
        io.to(conducteurRoom).emit('payment_updated', paymentData);
        // Envoyer une notification au conducteur s'il est hors ligne
        if (!presenceService.isOnline(trajet.conducteurId.toString())) {
          await notificationService.sendPaymentNotification(
            trajet.conducteurId,
            'Mise à jour de paiement',
            `Un paiement de ${paiement.montantTotal} FCFA a été mis à jour (${statutPaiement}).`,
            { trajetId: trajet._id, reservationId, paiementId: paiement._id }
          );
        }
        // Envoyer la confirmation au passager
        ack({ success: true, ...paymentData });
      } catch (e) {
        console.error('Erreur update_payment:', e);
        ack({ success: false, error: e.message });
      }
    });

    // Finaliser un paiement (réservé aux administrateurs)
    socket.on('payment_completed', async (data, ack = () => {}) => {
      try {
        const { paiementId } = data;
        if (!paiementId) {
          throw new Error('MISSING_PAIEMENT_ID');
        }
        // Vérifier si le paiement existe
        const paiement = await Paiement.findById(paiementId);
        if (!paiement) {
          throw new Error('PAIEMENT_NOT_FOUND');
        }
        // Vérifier que l'utilisateur est autorisé (administrateur ou système)
        const estAdmin = socket.user.role === 'ADMIN' || socket.user.role === 'SUPER_ADMIN';
        if (!estAdmin) {
          throw new Error('NOT_AUTHORIZED');
        }
        // Mettre à jour le statut du paiement
        paiement.statutPaiement = 'COMPLETE';
        paiement.dateCompletion = new Date();
        await paiement.save();
        // Mettre à jour le statut de paiement de la réservation
        await Reservation.findByIdAndUpdate(paiement.reservationId, {
          statutPaiement: 'PAYE',
          datePaiement: new Date()
        });
        // Préparer les données pour l'événement
        const completionData = {
          paiementId: paiement._id,
          reservationId: paiement.reservationId,
          statutPaiement: 'COMPLETE',
          montantTotal: paiement.montantTotal,
          montantConducteur: paiement.montantConducteur,
          numeroRecu: paiement.numeroRecu,
          timestamp: new Date()
        };
        // Émettre l'événement de finalisation du paiement au conducteur et au passager
        const conducteurRoom = buildRoomNames(null, paiement.beneficiaireId).userRoom;
        const passagerRoom = buildRoomNames(null, paiement.payeurId).userRoom;
        io.to(conducteurRoom).emit('payment_completed', completionData);
        io.to(passagerRoom).emit('payment_completed', completionData);
        // Envoyer des notifications aux deux parties si elles sont hors ligne
        if (!presenceService.isOnline(paiement.beneficiaireId.toString())) {
          await notificationService.sendPaymentNotification(
            paiement.beneficiaireId,
            'Paiement complété',
            `Un paiement de ${paiement.montantConducteur} FCFA a été versé sur votre compte.`,
            { reservationId: paiement.reservationId, paiementId: paiement._id }
          );
        }
        if (!presenceService.isOnline(paiement.payeurId.toString())) {
          await notificationService.sendPaymentNotification(
            paiement.payeurId,
            'Paiement confirmé',
            `Votre paiement de ${paiement.montantTotal} FCFA a été confirmé.`,
            { reservationId: paiement.reservationId, paiementId: paiement._id }
          );
        }
        // Envoyer la confirmation à l'administrateur
        ack({ success: true, ...completionData });
      } catch (e) {
        console.error('Erreur payment_completed:', e);
        ack({ success: false, error: e.message });
      }
    });

    // ==================== ÉVÉNEMENTS SYSTÈME ====================
    // Ping pour garder la connexion active
    socket.on('ping', () => {
      socket.emit('pong', { timestamp: new Date() });
    });

    // Récupérer la liste des utilisateurs en ligne
    socket.on('users:online', (data, ack = () => {}) => {
      try {
        // Vérifier si l'utilisateur a des droits d'administration pour voir tous les utilisateurs
        const estAdmin = socket.user.role === 'ADMIN' || socket.user.role === 'SUPER_ADMIN';
        // Si des IDs spécifiques sont fournis, vérifier uniquement ces utilisateurs
        const { userIds } = data || {};
        let onlineUsers = [];
        if (Array.isArray(userIds) && userIds.length > 0) {
          onlineUsers = userIds.map(id => ({
            userId: id,
            online: presenceService.isOnline(id)
          }));
        } else if (estAdmin) {
          // Pour les admins, renvoyer tous les utilisateurs en ligne
          onlineUsers = Array.from(connectedUsers.entries()).map(([id, data]) => ({
            userId: id,
            online: true,
            lastSeen: data.connectedAt,
            userInfo: {
              nom: data.user.nom,
              prenom: data.user.prenom
            }
          }));
        } else {
          // Pour les utilisateurs normaux, cette opération n'est pas autorisée sans IDs spécifiques
          throw new Error('NOT_AUTHORIZED');
        }
        ack({ success: true, users: onlineUsers });
      } catch (e) {
        console.error('Erreur users:online:', e);
        ack({ success: false, error: e.message });
      }
    });

    // ==================== GESTION DE LA DÉCONNEXION ====================
    socket.on('disconnect', async () => {
      const userId = socket.user?.id;
      if (!userId) return;
      console.log(`Socket déconnecté: ${userId} (${socket.id})`);
      // Supprimer l'utilisateur de la liste des connectés
      connectedUsers.delete(userId);
      // Mettre à jour le statut en ligne
      presenceService.setOffline(userId, socket.id);
      const online = presenceService.isOnline(userId);
      // Si l'utilisateur n'est plus en ligne avec aucun socket, informer les autres
      if (!online) {
        // Mettre à jour la dernière connexion dans la base de données
        try {
          await Utilisateur.findByIdAndUpdate(userId, {
            $set: { 'derniereConnexion': new Date() }
          });
        } catch (error) {
          console.error('Erreur lors de la mise à jour de la dernière connexion:', error);
        }
        // Émettre l'événement de déconnexion aux autres utilisateurs
        socket.broadcast.emit('user_offline', {
          userId,
          timestamp: new Date()
        });
      }
    });
  });

  // Retourner l'instance io pour utilisation externe
  return io;
}

module.exports = { initSocket };
