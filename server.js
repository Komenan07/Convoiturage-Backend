const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const connectDB = require('./config/db');
const { errorHandler } = require('./middlewares/errorHandler');
const http = require('http');
const { globalRateLimit, smartRateLimit } = require('./middlewares/rateLimiter');
const helmet = require('helmet');
require('dotenv').config();

const app = express();

// Configuration de sécurité avec Helmet
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// Configuration de base
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting global
app.use('/api', globalRateLimit);

// Rate limiting intelligent par endpoint
app.use('/api', smartRateLimit);

// Middleware de logging des requêtes en développement
if (process.env.NODE_ENV === 'development') {
  app.use('/api', (req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} - IP: ${req.ip} - User: ${req.user?.id || 'Anonyme'}`);
    next();
  });
}

// Configuration des fichiers statiques pour les uploads
const uploadDirs = [
  path.join(__dirname, 'public', 'uploads', 'photos'),
  path.join(__dirname, 'public', 'uploads', 'documents'),
  path.join(__dirname, 'public', 'uploads', 'vehicules')
];
uploadDirs.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`📁 Répertoire créé: ${dir}`);
  }
});

// Servir les fichiers statiques
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));
app.use('/public', express.static(path.join(__dirname, 'public')));

// Fonction pour charger les routes de manière sécurisée
const chargerRouteSecurisee = (cheminRoute, nomRoute, urlBase) => {
  try {
    const cheminComplet = path.resolve(__dirname, cheminRoute);
    if (!fs.existsSync(cheminComplet)) {
      console.warn(`⚠️ Fichier route non trouvé: ${cheminComplet}`);
      return false;
    }
    delete require.cache[require.resolve(cheminRoute)];
    const route = require(cheminComplet);
    if (!route) {
      console.error(`❌ ${nomRoute}: Le module n'exporte rien (undefined/null)`);
      return false;
    }
    if (typeof route !== 'function') {
      console.error(`❌ ${nomRoute}: Le module exporté n'est pas un router Express valide`);
      return false;
    }
    app.use(urlBase, route);
    console.log(`✅ Route ${nomRoute} chargée avec succès (${urlBase})`);
    return true;
  } catch (error) {
    console.error(`❌ Erreur lors du chargement de la route ${nomRoute}:`, error.message);
    return false;
  }
};

// Configuration des routes
console.log('🚀 Chargement des routes...\n');
const routesConfig = [
  { nom: 'authentification', chemins: ['./routes/authRoute.js'], url: '/api/auth' },
  { nom: 'utilisateurs', chemins: ['./routes/utilisateur.js'], url: '/api/utilisateurs' },
  { nom: 'véhicules', chemins: ['./routes/vehicules.js'], url: '/api/vehicules' },
  { nom: 'trajets', chemins: ['./routes/trajets.js'], url: '/api/trajets' },
  { nom: 'réservations', chemins: ['./routes/reservations.js'], url: '/api/reservations' },
  { nom: 'messages', chemins: ['./routes/messages.js'], url: '/api/messages' },
  { nom: 'évaluations', chemins: ['./routes/evaluations.js'], url: '/api/evaluations' },
  { nom: 'événements', chemins: ['./routes/evenements.js'], url: '/api/evenements' },
  { nom: 'alertes-urgence', chemins: ['./routes/alertes-urgence.js'], url: '/api/alertes-urgence' },
  { nom: 'signalements', chemins: ['./routes/signalement.js'], url: '/api/signalements' },
  { nom: 'paiements', chemins: ['./routes/paiements.js'], url: '/api/paiements' },
  { nom: 'admin', chemins: ['./routes/admin.js'], url: '/api/admin' },
  { nom: 'conversations', chemins: ['./routes/conversation.js'], url: '/api/conversations' }
];

let routesChargees = 0;
const routesDetails = [];
routesConfig.forEach(config => {
  let routeChargee = false;
  for (const chemin of config.chemins) {
    if (chargerRouteSecurisee(chemin, config.nom, config.url)) {
      routeChargee = true;
      routesChargees++;
      break;
    }
  }
  routesDetails.push({ nom: config.nom, url: config.url, status: routeChargee ? 'Chargée' : 'Échouée' });
});

console.log(`\n📊 Résumé du chargement des routes:`);
console.log(`   ✅ Chargées: ${routesChargees}`);
console.log(`   ❌ Échouées: ${routesConfig.length - routesChargees}`);
console.log(`   📁 Total: ${routesConfig.length}`);

// Afficher le détail des routes chargées
if (process.env.NODE_ENV === 'development') {
  console.log(`\n📋 Détail des routes:`);
  routesDetails.forEach(route => {
    const status = route.status === 'Chargée' ? '✅' : '❌';
    console.log(`   ${status} ${route.nom} → ${route.url}`);
  });
}

// Route de santé/test
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'API Covoiturage en fonctionnement',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  });
});

// Route d'information sur les messages
app.get('/api/messages/info', (req, res) => {
  res.json({
    success: true,
    message: 'Service de messagerie actif',
    features: {
      textMessages: true,
      locationSharing: true,
      predefinedTemplates: true,
      realTimeMessaging: true,
      messageSearch: true,
      readReceipts: true
    },
    templates: [
      'ARRIVEE_PROCHE',
      'RETARD', 
      'ARRIVEE',
      'PROBLEME_CIRCULATION',
      'PROBLEME_VOITURE',
      'MERCI',
      'LOCALISATION_DEMANDE',
      'CONFIRMATION',
      'ANNULATION'
    ],
    rateLimits: {
      sendMessage: '30 per minute',
      readMessages: '100 per minute',
      searchMessages: '20 per minute'
    }
  });
});

// Route de test pour les notifications (développement uniquement)
app.get('/api/messages/test-notification', async (req, res) => {
  if (process.env.NODE_ENV !== 'development') {
    return res.status(403).json({
      success: false,
      message: 'Endpoint de test disponible uniquement en développement'
    });
  }
  
  try {
    const notificationService = require('./services/notificationService');
    const testResult = await notificationService.testEmailConfiguration();
    
    res.json({
      success: true,
      message: 'Test de notification',
      result: testResult,
      smtpConfigured: notificationService.isOperational()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erreur test notification',
      error: error.message
    });
  }
});

// Route de statistiques des messages (développement uniquement)
app.get('/api/messages/stats', async (req, res) => {
  if (process.env.NODE_ENV !== 'development') {
    return res.status(403).json({
      success: false,
      message: 'Statistiques disponibles uniquement en développement'
    });
  }
  
  try {
    const presenceService = require('./services/presenceService');
    const onlineUsers = presenceService.getOnlineUsers();
    
    res.json({
      success: true,
      stats: {
        onlineUsers: onlineUsers.length,
        connectedSockets: req.app.get('io')?.sockets?.sockets?.size || 0,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erreur récupération statistiques',
      error: error.message
    });
  }
});

// Route d'information sur les endpoints disponibles
app.get('/api', (req, res) => {
  const endpoints = routesDetails.map(route => ({ nom: route.nom, url: route.url, status: route.status }));
  res.json({
    success: true,
    message: 'API Covoiturage - Liste des endpoints',
    endpoints: endpoints
  });
});

// Gestion des erreurs 404
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Endpoint ${req.method} ${req.originalUrl} non trouvé`
  });
});

// Middleware de gestion d'erreurs globales (unifié)
app.use(errorHandler);

// Démarrage du serveur
const PORT = process.env.PORT || 3000;
//const HOST = process.env.HOST || 'localhost';
const HOST = '0.0.0.0';

const demarrerServeur = async () => {
  try {
    await connectDB();
    console.log('✅ Connexion MongoDB établie');

    // Créer un serveur HTTP natif afin d'attacher Socket.io
    const server = http.createServer(app);

    // Initialiser Socket.io
    try {
      const { initSocket } = require('./realtime/socket');
      const io = initSocket(server, app);
      console.log('✅ Socket.io initialisé');

      // Stocker l'instance io dans l'app pour l'utiliser dans les contrôleurs
      app.set('io', io);

      // Intégration des messages avec Socket.io
      try {
        // Initialiser les services de messages
        const presenceService = require('./services/presenceService');
        
        // Gestion des événements de connexion/déconnexion pour messages
        io.on('connection', (socket) => {
          console.log(`Socket connecté: ${socket.id}`);
          
          // Authentifier l'utilisateur du socket
          socket.on('authenticate', (token) => {
            try {
              const jwt = require('jsonwebtoken');
              const decoded = jwt.verify(token, process.env.JWT_SECRET);
              socket.userId = decoded.id;
              
              // Marquer l'utilisateur comme en ligne
              presenceService.setOnline(decoded.id);
              
              console.log(`Utilisateur authentifié: ${decoded.id}`);
              socket.emit('authenticated', { success: true });
            } catch (error) {
              console.error('Erreur authentification socket:', error.message);
              socket.emit('auth_error', { message: 'Token invalide' });
            }
          });
          
          // Rejoindre une conversation
          socket.on('join_conversation', (conversationId) => {
            if (socket.userId) {
              socket.join(`conversation:${conversationId}`);
              console.log(`Utilisateur ${socket.userId} a rejoint la conversation ${conversationId}`);
              socket.emit('joined_conversation', { conversationId });
            } else {
              socket.emit('error', { message: 'Authentification requise' });
            }
          });
          
          // Quitter une conversation
          socket.on('leave_conversation', (conversationId) => {
            if (socket.userId) {
              socket.leave(`conversation:${conversationId}`);
              console.log(`Utilisateur ${socket.userId} a quitté la conversation ${conversationId}`);
              socket.emit('left_conversation', { conversationId });
            }
          });
          
          // Indicateur de frappe
          socket.on('typing', ({ conversationId, isTyping }) => {
            if (socket.userId) {
              socket.to(`conversation:${conversationId}`).emit('user_typing', {
                userId: socket.userId,
                isTyping
              });
            }
          });
          
          // Marquer un message comme lu via Socket
          socket.on('mark_message_read', ({ messageId, conversationId }) => {
            if (socket.userId) {
              socket.to(`conversation:${conversationId}`).emit('message_read', {
                messageId,
                readBy: socket.userId
              });
            }
          });
          
          // Déconnexion
          socket.on('disconnect', () => {
            if (socket.userId) {
              // Marquer l'utilisateur comme hors ligne
              presenceService.setOffline(socket.userId);
              console.log(`Utilisateur ${socket.userId} déconnecté`);
            }
            console.log(`Socket déconnecté: ${socket.id}`);
          });
        });
        
        console.log('✅ Intégration messages-Socket.io configurée');
        
      } catch (msgError) {
        console.warn('⚠️ Erreur intégration messages:', msgError.message);
      }

    } catch (e) {
      console.warn('⚠️ Socket.io non initialisé:', e.message);
    }

    server.listen(PORT, HOST, () => {
      console.log('🎉 ================================');
      console.log(`🚀 Serveur démarré avec succès!`);
      console.log(`📍 URL: http://${HOST}:${PORT}`);
      console.log(`🔗 Santé: http://${HOST}:${PORT}/api/health`);
      console.log(`📋 Endpoints: http://${HOST}:${PORT}/api`);
      console.log(`💬 Messages: http://${HOST}:${PORT}/api/messages/info`);
      if (process.env.NODE_ENV === 'development') {
        console.log(`🧪 Test notifications: http://${HOST}:${PORT}/api/messages/test-notification`);
        console.log(`📊 Stats messages: http://${HOST}:${PORT}/api/messages/stats`);
      }
      console.log('🎉 ================================\n');
    });

  } catch (error) {
    console.error('❌ Erreur lors du démarrage du serveur:', error.message);
    process.exit(1);
  }
};

demarrerServeur();

// Gestion gracieuse de l'arrêt
process.on('SIGTERM', () => {
  console.log('🛑 Arrêt du serveur demandé (SIGTERM)');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 Arrêt du serveur demandé (SIGINT)');
  process.exit(0);
});

module.exports = app;