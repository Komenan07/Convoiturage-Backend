// =====================================================
// SERVEUR PRINCIPAL - API COVOITURAGE CÔTE D'IVOIRE
// =====================================================

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// =====================================================
// IMPORT DES ROUTES
// =====================================================

//const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/utilisateur');
const trajetRoutes = require('./routes/trajets');
const reservationRoutes = require('./routes/reservations');
const messageRoutes = require('./routes/messages');
const evaluationRoutes = require('./routes/evaluations');
const evenementRoutes = require('./routes/evenements');
const alerteUrgenceRoutes = require('./routes/alertes-urgence');
const paiementRoutes = require('./routes/paiements');
const adminRoutes = require('./routes/admin');
const signalementRoutes = require('./routes/conversation');
const vehiculeRoutes = require('./routes/vehicules');
// =====================================================
// IMPORT DES MIDDLEWARES
// =====================================================

const { rateLimiter } = require('./middleware/rateLimiter.middleware');
const errorHandler = require('./middleware/errorHandler');
const notFound = require('./middleware/notFound');

// =====================================================
// INITIALISATION DE L'APPLICATION
// =====================================================

const app = express();
const PORT = process.env.PORT || 3000;

// =====================================================
// CONFIGURATION DES LOGS
// =====================================================

if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  // Créer le dossier logs s'il n'existe pas
  const logDir = process.env.LOG_FILE_PATH || 'logs';
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  
  // Configuration des logs en production
  const accessLogStream = fs.createWriteStream(
    path.join(logDir, 'access.log'),
    { flags: 'a' }
  );
  app.use(morgan('combined', { stream: accessLogStream }));
}

// =====================================================
// MIDDLEWARES DE SÉCURITÉ
// =====================================================

// Configuration Helmet pour la sécurité
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// Configuration CORS
const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS 
    ? process.env.ALLOWED_ORIGINS.split(',') 
    : ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-auth-token']
};
app.use(cors(corsOptions));

// Compression des réponses
app.use(compression());

// Rate limiting global
app.use('/api/', rateLimiter.standard || rateLimiter);

// Trust proxy (pour les déploiements derrière un reverse proxy)
app.set('trust proxy', 1);

// =====================================================
// MIDDLEWARES DE PARSING
// =====================================================

// Parsing JSON avec limite de taille
app.use(express.json({ 
  limit: '10mb',
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

app.use(express.urlencoded({ 
  extended: true, 
  limit: '10mb' 
}));

// =====================================================
// MIDDLEWARES STATIQUES ET HEADERS
// =====================================================

// Servir les fichiers statiques
app.use('/uploads', express.static(path.join(__dirname, process.env.UPLOAD_PATH || 'uploads')));
app.use('/public', express.static(path.join(__dirname, 'public')));

// Headers de sécurité supplémentaires
app.use((req, res, next) => {
  res.setHeader('X-Powered-By', 'Covoiturage-CI');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

// =====================================================
// ROUTES DE SANTÉ ET D'INFO
// =====================================================

// Route de santé (health check)
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    success: true,
    message: 'Service opérationnel',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    version: process.env.APP_VERSION || process.env.npm_package_version || '1.0.0',
    database: mongoose.connection.readyState === 1 ? '✅ Connectée' : '❌ Déconnectée'
  });
});

// Route d'informations sur l'API
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'API Covoiturage Côte d\'Ivoire',
    version: process.env.APP_VERSION || '1.0.0',
    documentation: '/api/docs',
    healthCheck: '/health'
  });
});

app.get('/api', (req, res) => {
  res.json({
    message: 'API Covoiturage Côte d\'Ivoire',
    version: '1.0.0',
    documentation: '/api/docs',
    endpoints: {
      //auth: '/api/auth',
      users: '/api/users',
      trajets: '/api/trajets',
      reservations: '/api/reservations',
      messages: '/api/messages',
      evaluations: '/api/evaluations',
      evenements: '/api/evenements',
      alertes: '/api/alertes-urgence',
      paiements: '/api/paiements',
      admin: '/api/admin',
      signalements: '/api/signalements',
      vehicules: 'api/vehicules'
    }
  });
});

// =====================================================
// ROUTES PRINCIPALES
// =====================================================

//app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/trajets', trajetRoutes);
app.use('/api/reservations', reservationRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/evaluations', evaluationRoutes);
app.use('/api/evenements', evenementRoutes);
app.use('/api/alertes-urgence', alerteUrgenceRoutes);
app.use('/api/paiements', paiementRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/signalements', signalementRoutes);
app.use('/api/vehicules', vehiculeRoutes);

// =====================================================
// GESTION DES ERREURS
// =====================================================

// Route non trouvée (404)
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route non trouvée',
    code: 'ROUTE_NOT_FOUND',
    path: req.originalUrl
  });
});

// Gestionnaire d'erreurs global
app.use((err, req, res, next) => {
  console.error('Erreur globale:', err.stack);

  // Erreur de validation Mongoose
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map(e => e.message);
    return res.status(400).json({
      success: false,
      message: 'Erreur de validation',
      code: 'VALIDATION_ERROR',
      data: { errors }
    });
  }

  // Erreur de duplication (code 11000)
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    return res.status(400).json({
      success: false,
      message: `${field} déjà utilisé`,
      code: 'DUPLICATE_FIELD',
      data: { field }
    });
  }

  // Erreur JWT
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      message: 'Token invalide',
      code: 'INVALID_TOKEN'
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      message: 'Token expiré',
      code: 'EXPIRED_TOKEN'
    });
  }

  // Erreur de cast MongoDB
  if (err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      message: 'ID invalide',
      code: 'INVALID_ID'
    });
  }

  // Erreur par défaut
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    message: process.env.NODE_ENV === 'production' 
      ? 'Erreur serveur interne' 
      : err.message,
    code: 'SERVER_ERROR',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// =====================================================
// CONNEXION À LA BASE DE DONNÉES
// =====================================================

const connectDB = async () => {
  try {
    const mongoURI = process.env.NODE_ENV === 'test' 
      ? process.env.MONGODB_TEST_URI 
      : process.env.MONGODB_URI;

    if (!mongoURI) {
      throw new Error('URI MongoDB non configurée');
    }

    const options = {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      family: 4,
      // Index automatique seulement en développement
      autoIndex: process.env.NODE_ENV !== 'production'
    };

    const conn = await mongoose.connect(mongoURI, options);
    console.log(`🍃 MongoDB connecté: ${conn.connection.host}`);

    // Création des index géospatiaux en développement
    if (process.env.NODE_ENV !== 'production') {
      await createGeospatialIndexes();
    }

    // Gestion des événements de connexion
    mongoose.connection.on('error', (err) => {
      console.error('❌ Erreur MongoDB:', err);
    });

    mongoose.connection.on('disconnected', () => {
      console.log('📡 MongoDB déconnecté');
    });

  } catch (error) {
    console.error('❌ Erreur de connexion MongoDB:', error);
    process.exit(1);
  }
};

// =====================================================
// CRÉATION DES INDEX GÉOSPATIAUX
// =====================================================

const createGeospatialIndexes = async () => {
  try {
    const db = mongoose.connection.db;
    
    // Index pour les utilisateurs
    await db.collection('utilisateurs').createIndex(
      { "adresse.coordonnees": "2dsphere" }
    );
    await db.collection('utilisateurs').createIndex(
      { "email": 1 }, 
      { unique: true }
    );
    await db.collection('utilisateurs').createIndex(
      { "telephone": 1 }, 
      { unique: true }
    );
    
    // Index pour les trajets
    await db.collection('trajets').createIndex(
      { "pointDepart.coordonnees": "2dsphere" }
    );
    await db.collection('trajets').createIndex(
      { "pointArrivee.coordonnees": "2dsphere" }
    );
    await db.collection('trajets').createIndex({
      "pointDepart.coordonnees": "2dsphere",
      "pointArrivee.coordonnees": "2dsphere",
      "dateDepart": 1,
      "nombrePlacesDisponibles": 1
    });
    
    // Index pour les alertes d'urgence
    await db.collection('alerteurgences').createIndex(
      { "position": "2dsphere" }
    );
    
    console.log('✅ Index géospatiaux créés avec succès');
  } catch (error) {
    console.warn('⚠️ Attention: Erreur lors de la création des index:', error.message);
  }
};

// =====================================================
// GESTION DE L'ARRÊT GRACIEUX
// =====================================================

const gracefulShutdown = (signal) => {
  console.log(`\n${signal} reçu. Arrêt en cours...`);
  
  server.close((err) => {
    if (err) {
      console.error('❌ Erreur lors de la fermeture du serveur:', err);
      process.exit(1);
    }
    
    console.log('✅ Serveur HTTP fermé');
    
    // Fermer la connexion MongoDB
    mongoose.connection.close(false, (err) => {
      if (err) {
        console.error('❌ Erreur lors de la fermeture MongoDB:', err);
        process.exit(1);
      }
      
      console.log('🔌 Connexion MongoDB fermée');
      process.exit(0);
    });
  });

  // Forcer l'arrêt après 10 secondes
  setTimeout(() => {
    console.error('⚠️ Arrêt forcé après timeout');
    process.exit(1);
  }, 10000);
};

// =====================================================
// GESTION DES PROCESSUS ET SIGNAUX
// =====================================================

// Écouter les signaux d'arrêt
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Gestion des erreurs non capturées
process.on('uncaughtException', (err) => {
  console.error('❌ Erreur non capturée:', err);
  process.exit(1);
});

process.on('unhandledRejection', (err, promise) => {
  console.error('❌ Promise rejetée non gérée:', err);
  console.error('Promise:', promise);
  process.exit(1);
});

// =====================================================
// DÉMARRAGE DU SERVEUR
// =====================================================

let server;

const startServer = async () => {
  try {
    // Connexion à la base de données
    await connectDB();
    
    // Démarrage du serveur
    server = app.listen(PORT, () => {
      console.log(`
🚀 Serveur Covoiturage CI démarré
📡 Port: ${PORT}
🌍 Environnement: ${process.env.NODE_ENV || 'development'}
📊 Base de données: ${mongoose.connection.readyState === 1 ? '✅ Connectée' : '❌ Déconnectée'}
🕐 Démarrage: ${new Date().toISOString()}
📍 URL locale: http://localhost:${PORT}
🏥 Health check: http://localhost:${PORT}/health
      `);
    });

    return server;
  } catch (error) {
    console.error('❌ Erreur lors du démarrage du serveur:', error);
    process.exit(1);
  }
};

// =====================================================
// EXPORT ET DÉMARRAGE
// =====================================================

// Démarrage de l'application si ce fichier est exécuté directement
if (require.main === module) {
  startServer();
}

// Export pour les tests et autres modules
module.exports = { app, startServer };