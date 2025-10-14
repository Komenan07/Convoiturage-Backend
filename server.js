const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const connectDB = require('./config/db');
const { errorHandler } = require('./middlewares/errorHandler');
const http = require('http');

const app = express();

// ====================================
// SÉCURITÉ AVEC HELMET
// ====================================
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

// ====================================
// COMPRESSION DES RÉPONSES
// ====================================
app.use(compression());

// ====================================
// LOGGING DES REQUÊTES
// ====================================
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  const accessLogStream = fs.createWriteStream(
    path.join(__dirname, 'logs', 'access.log'),
    { flags: 'a' }
  );
  app.use(morgan('combined', { stream: accessLogStream }));
}

// ====================================
// CONFIGURATION CORS AVANCÉE
// ====================================
const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS 
    ? process.env.ALLOWED_ORIGINS.split(',')
    : ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization']
};
app.use(cors(corsOptions));

// ====================================
// CONFIGURATION DE BASE
// ====================================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.set('trust proxy', 1);

// ====================================
// CRÉATION DES RÉPERTOIRES
// ====================================
const uploadDirs = [
  path.join(__dirname, 'public', 'uploads', 'photos'),
  path.join(__dirname, 'public', 'uploads', 'documents'),
  path.join(__dirname, 'public', 'uploads', 'vehicules'),
  path.join(__dirname, 'logs'), 
  path.join(__dirname, 'backups')
];

uploadDirs.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`📁 Répertoire créé: ${dir}`);
  }
});

// ====================================
// FICHIERS STATIQUES
// ====================================
app.use('/uploads', express.static(path.join(__dirname, 'public', 'uploads')));
app.use('/public', express.static(path.join(__dirname, 'public')));

// ====================================
// MIDDLEWARE DE MONITORING
// ====================================
app.use((req, res, next) => {
  req.requestTime = new Date().toISOString();
  next();
});

// ====================================
// RATE LIMITING GLOBAL
// ====================================
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Trop de requêtes, veuillez réessayer plus tard',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', globalLimiter);

// ====================================
// CHARGEMENT DES ROUTES
// ====================================
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
  { nom: 'conversations', chemins: ['./routes/conversation.js'], url: '/api/conversations' },
  { nom: 'places', chemins: ['./routes/placesV2Routes.js'], url: '/api/places' }
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
  routesDetails.push({ 
    nom: config.nom, 
    url: config.url, 
    status: routeChargee ? 'Chargée' : 'Échouée' 
  });
});

console.log(`\n📊 Résumé du chargement des routes:`);
console.log(`   ✅ Chargées: ${routesChargees}`);
console.log(`   ❌ Échouées: ${routesConfig.length - routesChargees}`);
console.log(`   📁 Total: ${routesConfig.length}`);

if (process.env.NODE_ENV === 'development') {
  console.log(`\n📋 Détail des routes:`);
  routesDetails.forEach(route => {
    const status = route.status === 'Chargée' ? '✅' : '❌';
    console.log(`   ${status} ${route.nom} → ${route.url}`);
  });
}

// ====================================
// ROUTES DE MONITORING
// ====================================
app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'API Covoiturage en fonctionnement',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    uptime: process.uptime(),
    memory: process.memoryUsage()
  });
});

app.get('/api/stats', (req, res) => {
  res.json({
    success: true,
    stats: {
      routes: {
        total: routesConfig.length,
        chargees: routesChargees,
        echouees: routesConfig.length - routesChargees
      },
      server: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        version: process.version
      }
    }
  });
});

app.get('/api', (req, res) => {
  const endpoints = routesDetails.map(route => ({ 
    nom: route.nom, 
    url: route.url, 
    status: route.status 
  }));
  res.json({
    success: true,
    message: 'API Covoiturage - Liste des endpoints',
    endpoints: endpoints,
    documentation: `${req.protocol}://${req.get('host')}/api/docs`
  });
});

// ====================================
// GESTION DES ERREURS 404
// ====================================
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Endpoint ${req.method} ${req.originalUrl} non trouvé`,
    availableEndpoints: '/api'
  });
});

// ====================================
// MIDDLEWARE DE GESTION D'ERREURS
// ====================================
app.use(errorHandler);

// ====================================
// DÉMARRAGE DU SERVEUR
// ====================================
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0';

const demarrerServeur = async () => {
  try {
    await connectDB();
    console.log('✅ Connexion MongoDB établie');

    const server = http.createServer(app);

    // Initialiser Socket.io
    try {
      const { initSocket } = require('./realtime/socket');
      const io = initSocket(server, app);
      console.log('✅ Socket.io initialisé');

      io.on('connection', (socket) => {
        console.log(`🔌 Socket connecté: ${socket.id}`);
      });
    } catch (e) {
      console.warn('⚠️ Socket.io non initialisé:', e.message);
    }

    // Tâches planifiées (CRON)
    try {
      const cron = require('node-cron');
      
      cron.schedule('0 0 * * *', () => {
        console.log('🧹 Nettoyage des anciens logs...');
      });

      cron.schedule('0 * * * *', () => {
        console.log('⏰ Vérification des trajets expirés...');
      });

      console.log('✅ Tâches planifiées configurées');
    } catch (e) {
      console.warn('⚠️ Tâches planifiées non configurées:', e.message);
    }

    server.listen(PORT, HOST, () => {
      console.log('🎉 ================================');
      console.log(`🚀 Serveur démarré avec succès!`);
      console.log(`📍 URL: http://${HOST}:${PORT}`);
      console.log(`🔗 Santé: http://${HOST}:${PORT}/api/health`);
      console.log(`📊 Stats: http://${HOST}:${PORT}/api/stats`);
      console.log(`📋 Endpoints: http://${HOST}:${PORT}/api`);
      console.log(`🌍 Environnement: ${process.env.NODE_ENV || 'development'}`);
      console.log('🎉 ================================\n');
    });

    // Gestion des erreurs non gérées
    process.on('unhandledRejection', (reason, _promise) => {
      console.error('❌ Promesse non gérée:', reason);
    });

    process.on('uncaughtException', (error) => {
      console.error('❌ Exception non capturée:', error);
      process.exit(1);
    });

  } catch (error) {
    console.error('❌ Erreur lors du démarrage du serveur:', error.message);
    process.exit(1);
  }
};

demarrerServeur();

// ====================================
// GESTION GRACIEUSE DE L'ARRÊT
// ====================================
const gracefulShutdown = (signal) => {
  console.log(`\n🛑 Signal ${signal} reçu, arrêt gracieux...`);
  
  // Note: 'server' doit être accessible ici
  // Il faudrait le déclarer en dehors de demarrerServeur()
  const mongoose = require('mongoose');
  mongoose.connection.close(false, () => {
    console.log('✅ Connexion MongoDB fermée');
    process.exit(0);
  });

  setTimeout(() => {
    console.error('⚠️ Arrêt forcé après timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

module.exports = app;