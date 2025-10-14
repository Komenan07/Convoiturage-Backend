const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const Utilisateur = require('../models/Utilisateur');
const Conversation = require('../models/Conversation');
const { Message } = require('../models/Message');
const Trajet = require('../models/Trajet');
const Reservation = require('../models/Reservation');
//const AlerteUrgence = require('../models/AlerteUrgence');
//const Paiement = require('../models/Paiement');
const notificationService = require('../services/notificationService');
const presenceService = require('../services/presenceService');
//const locationService = require('../services/locationService');

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
 * Middleware d'authentification optionnel pour les connexions Socket.IO
 * @param {Object} socket - Objet socket
 * @param {Function} next - Fonction next
 */
async function optionalSocketAuth(socket, next) {
  try {
    const token = getTokenFromHandshake(socket);
    
    if (token) {
      // Si un token est fourni, on vérifie l'authentification
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await Utilisateur.findById(decoded.userId || decoded.id)
          .select('email nom prenom photoProfil telephone role statutCompte');

        if (user && user.statutCompte === 'ACTIF') {
          // Utilisateur authentifié
          socket.user = {
            id: user._id.toString(),
            email: user.email,
            nom: user.nom,
            prenom: user.prenom,
            photoProfil: user.photoProfil,
            telephone: user.telephone,
            role: user.role,
            authenticated: true
          };
        } else {
          // Token invalide ou utilisateur inactif - on continue sans authentification
          socket.user = { authenticated: false };
        }
      } catch (err) {
        // Token invalide - on continue sans authentification
        console.warn('Token invalide fourni:', err.message);
        socket.user = { authenticated: false };
      }
    } else {
      // Pas de token fourni - utilisateur non authentifié
      socket.user = { authenticated: false };
    }
    
    next();
  } catch (err) {
    console.error('Erreur dans le middleware d\'authentification:', err.message);
    // En cas d'erreur, on continue sans authentification
    socket.user = { authenticated: false };
    next();
  }
}

/**
 * Vérifie si l'utilisateur est authentifié
 * @param {Object} socket - Objet socket
 * @returns {boolean} True si authentifié
 */
function isAuthenticated(socket) {
  return socket.user && socket.user.authenticated === true;
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

  // Ajouter le middleware d'authentification optionnel
  io.use(optionalSocketAuth);

  // Stockage des utilisateurs connectés (authentifiés et non-authentifiés)
  const connectedUsers = new Map();
  const anonymousUsers = new Map(); // Pour les utilisateurs non authentifiés

  // Rendre disponible la liste des utilisateurs connectés dans l'app Express
  io.getConnectedUsers = () => connectedUsers;
  io.getAnonymousUsers = () => anonymousUsers;
  app.set('connectedUsers', connectedUsers);
  app.set('anonymousUsers', anonymousUsers);
  app.set('io', io);

  // ==================== GESTION DES CONNEXIONS ====================
  io.on('connection', async (socket) => {
    console.log(`Socket connecté: ${socket.id} (Authentifié: ${isAuthenticated(socket)})`);

    if (isAuthenticated(socket)) {
      const userId = socket.user.id;
      
      // Enregistrer l'utilisateur authentifié dans la map des connectés
      connectedUsers.set(userId, {
        socketId: socket.id,
        user: socket.user,
        connectedAt: new Date()
      });

      // Mettre à jour le statut en ligne et rejoindre la salle utilisateur
      presenceService.setOnline(userId, socket.id);
      await socket.join(buildRoomNames(null, userId).userRoom);

      // Émettre l'événement de connexion à tous les utilisateurs authentifiés
      io.emit('user_online', {
        userId,
        nom: socket.user.nom,
        prenom: socket.user.prenom,
        timestamp: new Date()
      });

      // Envoyer une confirmation de connexion pour utilisateur authentifié
      socket.emit('connection:ack', {
        success: true,
        authenticated: true,
        userId,
        userInfo: {
          nom: socket.user.nom,
          prenom: socket.user.prenom,
          email: socket.user.email
        }
      });
    } else {
      // Utilisateur non authentifié
      const anonymousId = `anon_${socket.id}`;
      
      // Enregistrer l'utilisateur anonyme
      anonymousUsers.set(anonymousId, {
        socketId: socket.id,
        connectedAt: new Date(),
        anonymousId
      });

      // Envoyer une confirmation de connexion pour utilisateur anonyme
      socket.emit('connection:ack', {
        success: true,
        authenticated: false,
        anonymousId,
        message: 'Connecté en mode anonyme. Certaines fonctionnalités nécessitent une authentification.'
      });
    }

    // ==================== ÉVÉNEMENTS DE CHAT (AUTHENTIFICATION REQUISE) ====================
    // Rejoindre une conversation
    socket.on('conversation:join', async ({ conversationId }, ack = () => {}) => {
      try {
        if (!isAuthenticated(socket)) {
          throw new Error('AUTHENTICATION_REQUIRED');
        }
        
        const userId = socket.user.id;
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
        if (!isAuthenticated(socket)) {
          throw new Error('AUTHENTICATION_REQUIRED');
        }
        
        const userId = socket.user.id;
        const { conversationRoom } = buildRoomNames(conversationId, userId);
        await socket.leave(conversationRoom);
        ack({ success: true });
      } catch (e) {
        ack({ success: false, error: e.message });
      }
    });

    // Envoyer un message (authentification requise)
    socket.on('send_message', async (payload, ack = () => {}) => {
      try {
        if (!isAuthenticated(socket)) {
          throw new Error('AUTHENTICATION_REQUIRED');
        }

        const userId = socket.user.id;
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

    // ==================== CHAT PUBLIC ANONYME ====================
    // Chat public pour les utilisateurs non authentifiés
    socket.on('public_chat:join', async (data, ack = () => {}) => {
      try {
        const { roomName = 'general' } = data || {};
        const publicRoom = `public:${roomName}`;
        
        await socket.join(publicRoom);
        
        // Annoncer l'arrivée dans le chat public
        const joinMessage = {
          id: `msg_${Date.now()}_${Math.random()}`,
          type: 'system',
          content: isAuthenticated(socket) 
            ? `${socket.user.prenom} ${socket.user.nom} a rejoint le chat`
            : `Un utilisateur anonyme a rejoint le chat`,
          timestamp: new Date(),
          room: roomName
        };
        
        socket.to(publicRoom).emit('public_message', joinMessage);
        
        ack({ success: true, room: roomName });
      } catch (e) {
        console.error('Erreur public_chat:join:', e);
        ack({ success: false, error: e.message });
      }
    });

    // Envoyer un message dans le chat public
    socket.on('send_public_message', async (data, ack = () => {}) => {
      try {
        const { roomName = 'general', content, username } = data || {};
        
        if (!content || content.trim().length === 0) {
          throw new Error('MESSAGE_EMPTY');
        }

        const publicRoom = `public:${roomName}`;
        
        // Déterminer l'expéditeur
        let senderInfo;
        if (isAuthenticated(socket)) {
          senderInfo = {
            id: socket.user.id,
            nom: socket.user.nom,
            prenom: socket.user.prenom,
            photoProfil: socket.user.photoProfil,
            authenticated: true
          };
        } else {
          // Utilisateur anonyme - utiliser le nom fourni ou générer un nom
          const anonymousId = anonymousUsers.get(`anon_${socket.id}`)?.anonymousId || `anon_${socket.id}`;
          senderInfo = {
            id: anonymousId,
            nom: username || `Anonyme_${socket.id.slice(-4)}`,
            prenom: '',
            photoProfil: null,
            authenticated: false
          };
        }

        const publicMessage = {
          id: `msg_${Date.now()}_${Math.random()}`,
          type: 'message',
          content: content.trim(),
          sender: senderInfo,
          timestamp: new Date(),
          room: roomName
        };

        // Émettre le message à tous les participants du chat public
        io.to(publicRoom).emit('public_message', publicMessage);

        ack({ success: true, message: publicMessage });
      } catch (e) {
        console.error('Erreur send_public_message:', e);
        ack({ success: false, error: e.message });
      }
    });

    // Quitter le chat public
    socket.on('public_chat:leave', async (data, ack = () => {}) => {
      try {
        const { roomName = 'general' } = data || {};
        const publicRoom = `public:${roomName}`;
        
        await socket.leave(publicRoom);
        
        // Annoncer le départ du chat public
        const leaveMessage = {
          id: `msg_${Date.now()}_${Math.random()}`,
          type: 'system',
          content: isAuthenticated(socket) 
            ? `${socket.user.prenom} ${socket.user.nom} a quitté le chat`
            : `Un utilisateur anonyme a quitté le chat`,
          timestamp: new Date(),
          room: roomName
        };
        
        socket.to(publicRoom).emit('public_message', leaveMessage);
        
        ack({ success: true });
      } catch (e) {
        console.error('Erreur public_chat:leave:', e);
        ack({ success: false, error: e.message });
      }
    });

    // ==================== AUTHENTIFICATION PENDANT LA SESSION ====================
    // Permettre l'authentification après connexion
    socket.on('authenticate', async (data, ack = () => {}) => {
      try {
        const { token } = data || {};
        
        if (!token) {
          throw new Error('TOKEN_REQUIRED');
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await Utilisateur.findById(decoded.userId || decoded.id)
          .select('email nom prenom photoProfil telephone role statutCompte');

        if (!user || user.statutCompte !== 'ACTIF') {
          throw new Error('USER_INVALID');
        }

        // Si l'utilisateur était anonyme, le supprimer de la liste des anonymes
        if (!isAuthenticated(socket)) {
          const anonymousId = `anon_${socket.id}`;
          anonymousUsers.delete(anonymousId);
        }

        // Mettre à jour les informations utilisateur
        socket.user = {
          id: user._id.toString(),
          email: user.email,
          nom: user.nom,
          prenom: user.prenom,
          photoProfil: user.photoProfil,
          telephone: user.telephone,
          role: user.role,
          authenticated: true
        };

        const userId = socket.user.id;

        // Enregistrer l'utilisateur authentifié
        connectedUsers.set(userId, {
          socketId: socket.id,
          user: socket.user,
          connectedAt: new Date()
        });

        // Mettre à jour le statut en ligne et rejoindre la salle utilisateur
        presenceService.setOnline(userId, socket.id);
        await socket.join(buildRoomNames(null, userId).userRoom);

        // Émettre l'événement de connexion
        io.emit('user_online', {
          userId,
          nom: socket.user.nom,
          prenom: socket.user.prenom,
          timestamp: new Date()
        });

        ack({
          success: true,
          authenticated: true,
          userId,
          userInfo: {
            nom: socket.user.nom,
            prenom: socket.user.prenom,
            email: socket.user.email
          }
        });
      } catch (e) {
        console.error('Erreur authenticate:', e);
        ack({ success: false, error: e.message });
      }
    });

    // ==================== ÉVÉNEMENTS NÉCESSITANT AUTHENTIFICATION ====================
    // Tous les événements suivants nécessitent une authentification
    // (Réservations, trajets, urgences, paiements, etc.)
    
    // Wrapper pour vérifier l'authentification
    const requireAuth = (eventName, handler) => {
      socket.on(eventName, async (...args) => {
        if (!isAuthenticated(socket)) {
          const ack = args[args.length - 1];
          if (typeof ack === 'function') {
            ack({ success: false, error: 'AUTHENTICATION_REQUIRED' });
          }
          return;
        }
        await handler(...args);
      });
    };

    // ==================== ÉVÉNEMENTS DE RÉSERVATION (AUTHENTIFICATION REQUISE) ====================
    requireAuth('create_reservation', async (data, ack = () => {}) => {
      try {
        const userId = socket.user.id;
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

    // ==================== ÉVÉNEMENTS SYSTÈME ====================
    // Ping pour garder la connexion active
    socket.on('ping', () => {
      socket.emit('pong', { 
        timestamp: new Date(),
        authenticated: isAuthenticated(socket)
      });
    });

    // Récupérer les informations de statut
    socket.on('status:info', (data, ack = () => {}) => {
      try {
        const status = {
          authenticated: isAuthenticated(socket),
          socketId: socket.id,
          connectedAt: isAuthenticated(socket) 
            ? connectedUsers.get(socket.user.id)?.connectedAt 
            : anonymousUsers.get(`anon_${socket.id}`)?.connectedAt,
          userInfo: isAuthenticated(socket) ? {
            userId: socket.user.id,
            nom: socket.user.nom,
            prenom: socket.user.prenom,
            email: socket.user.email,
            role: socket.user.role
          } : null,
          availableFeatures: {
            publicChat: true,
            privateMessages: isAuthenticated(socket),
            reservations: isAuthenticated(socket),
            trajets: isAuthenticated(socket),
            payments: isAuthenticated(socket)
          }
        };

        ack({ success: true, status });
      } catch (e) {
        console.error('Erreur status:info:', e);
        ack({ success: false, error: e.message });
      }
    });

    // ==================== GESTION DE LA DÉCONNEXION ====================
    socket.on('disconnect', async () => {
      console.log(`Socket déconnecté: ${socket.id}`);

      if (isAuthenticated(socket)) {
        const userId = socket.user.id;
        
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
      } else {
        // Utilisateur anonyme
        const anonymousId = `anon_${socket.id}`;
        anonymousUsers.delete(anonymousId);
      }
    });
  });

  // Retourner l'instance io pour utilisation externe
  return io;
}

module.exports = { initSocket };