const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
const { createAdapter } = require('@socket.io/redis-adapter');
const { redisClient } = require('./redis');

// Import des handlers Socket.IO
const chatHandler = require('../realtime/handlers/chat');
const gpsHandler = require('../realtime/handlers/gps');
const alerteHandler = require('../realtime/handlers/alerte');
const reservationHandler = require('../realtime/handlers/reservation');
const wazeHandler = require('../realtime/handlers/waze'); // Ajouter le handler Waze

function configureSocket(server) {
  // Configuration Socket.IO
  const io = socketIo(server, {
    cors: {
      origin: process.env.CLIENT_URL || "http://localhost:3000",
      methods: ["GET", "POST"],
      credentials: true
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000
  });

  // Configuration Redis Adapter pour la scalabilité (si Redis disponible)
  const redis = redisClient();
  if (redis) {
    const pubClient = redis.duplicate();
    const subClient = redis.duplicate();
    io.adapter(createAdapter(pubClient, subClient));
    console.log('🔴 Redis adapter configuré pour Socket.IO');
  }

  // Middleware d'authentification Socket.IO
  io.use(async (socket, next) => {
    try {
      // Récupérer le token depuis les headers ou auth
      const token = socket.handshake.auth.token || 
                   socket.handshake.headers.authorization?.replace('Bearer ', '');
      
      if (!token) {
        return next(new Error('Token d\'authentification manquant'));
      }

      // Vérifier et décoder le token JWT
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Charger les données utilisateur depuis la base
      const Utilisateur = require('../models/Utilisateur');
      const user = await Utilisateur.findById(decoded.id).select('-motDePasse');
      
      if (!user) {
        return next(new Error('Utilisateur non trouvé'));
      }

      if (user.statutCompte !== 'ACTIF') {
        return next(new Error('Compte utilisateur suspendu ou bloqué'));
      }

      // Attacher les données utilisateur au socket
      socket.userId = user._id.toString();
      socket.user = user;
      
      next();
      
    } catch (error) {
      console.error('Erreur authentification Socket.IO:', error.message);
      
      if (error.name === 'JsonWebTokenError') {
        return next(new Error('Token invalide'));
      } else if (error.name === 'TokenExpiredError') {
        return next(new Error('Token expiré'));
      }
      
      return next(new Error('Authentification échouée'));
    }
  });

  // Gestion des connexions Socket.IO
  io.on('connection', (socket) => {
    console.log(`👤 Utilisateur connecté: ${socket.user.nom} ${socket.user.prenom} (${socket.userId})`);
    
    // Rejoindre les rooms nécessaires
    socket.join(`user_${socket.userId}`);
    
    // Si c'est un admin, rejoindre la room admin
    if (socket.user.role && ['SUPER_ADMIN', 'MODERATEUR', 'SUPPORT'].includes(socket.user.role)) {
      socket.join('admin_room');
      console.log(`🔐 Admin connecté: ${socket.user.nom}`);
    }

    // Mettre à jour le statut de connexion utilisateur
    updateUserOnlineStatus(socket.userId, true);

    // Envoyer les données de connexion
    socket.emit('connected', {
      userId: socket.userId,
      message: 'Connexion Socket.IO établie',
      timestamp: new Date()
    });

    // Enregistrer tous les handlers par module
    try {
      chatHandler(socket, io);
      gpsHandler(socket, io);
      alerteHandler(socket, io);
      reservationHandler(socket, io);
      wazeHandler(socket, io); // Ajouter le handler Waze
    } catch (error) {
      console.error('Erreur lors de l\'enregistrement des handlers:', error);
    }

    // Event de test de connexion
    socket.on('ping', (data) => {
      socket.emit('pong', { 
        message: 'Connexion Socket.IO active', 
        timestamp: new Date(),
        userId: socket.userId,
        data: data || null
      });
    });

    // Gestion de la déconnexion
    socket.on('disconnect', (reason) => {
      console.log(`👋 Utilisateur déconnecté: ${socket.user.nom} - Raison: ${reason}`);
      updateUserOnlineStatus(socket.userId, false);
      
      // Nettoyer les ressources si nécessaire
      handleUserDisconnection(socket);
    });

    // Gestion des erreurs du socket
    socket.on('error', (error) => {
      console.error(`❌ Erreur socket ${socket.userId}:`, error.message);
    });
  });

  // Gestion des erreurs globales Socket.IO
  io.engine.on('connection_error', (err) => {
    console.error('❌ Erreur connexion Socket.IO:', {
      message: err.message,
      description: err.description,
      context: err.context,
      type: err.type
    });
  });

  // Event pour les statistiques (optionnel)
  setInterval(() => {
    const connectedUsers = io.engine.clientsCount;
    io.to('admin_room').emit('stats_update', {
      connectedUsers,
      timestamp: new Date()
    });
  }, 30000); // Toutes les 30 secondes

  return io;
}

// Solution 1: Utiliser le paramètre isOnline
async function updateUserOnlineStatus(userId, isOnline) {
  try {
    const Utilisateur = require('../models/Utilisateur');
    const updateData = {
      derniereConnexion: new Date(),
      // Ajouter le champ isOnline si vous voulez tracker le statut en ligne
      isOnline: isOnline
    };
    
    await Utilisateur.findByIdAndUpdate(userId, updateData);
    
  } catch (error) {
    console.error('Erreur mise à jour statut utilisateur:', error.message);
  }
}

// Solution 2: Alternative si vous ne voulez pas tracker isOnline
// Renommez le paramètre avec un underscore pour indiquer qu'il n'est pas utilisé
/*
async function updateUserOnlineStatus(userId, _isOnline) {
  try {
    const Utilisateur = require('../models/Utilisateur');
    const updateData = {
      derniereConnexion: new Date()
      // Pas de champ isOnline
    };
    
    await Utilisateur.findByIdAndUpdate(userId, updateData);
    
  } catch (error) {
    console.error('Erreur mise à jour statut utilisateur:', error.message);
  }
}
*/

// Solution 3: Alternative plus simple - supprimer le paramètre
/*
async function updateUserOnlineStatus(userId) {
  try {
    const Utilisateur = require('../models/Utilisateur');
    const updateData = {
      derniereConnexion: new Date()
    };
    
    await Utilisateur.findByIdAndUpdate(userId, updateData);
    
  } catch (error) {
    console.error('Erreur mise à jour statut utilisateur:', error.message);
  }
}
*/

// Fonction pour gérer la déconnexion utilisateur
function handleUserDisconnection(socket) {
  // Nettoyer les intervalles de trafic Waze s'ils existent
  if (socket.trafficUpdateInterval) {
    clearInterval(socket.trafficUpdateInterval);
    socket.trafficUpdateInterval = null;
  }
  
  // Autres nettoyages possibles :
  // - Nettoyer les positions GPS en cours
  // - Mettre à jour les statuts de trajets
  // - Notifier les autres utilisateurs si nécessaire
  
  console.log(`🧹 Nettoyage des ressources pour ${socket.userId}`);
}

module.exports = configureSocket;