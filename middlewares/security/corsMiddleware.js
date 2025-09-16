// middleware/corsMiddleware.js
const cors = require('cors');

// Configuration CORS pour l'application de covoiturage
const corsOptions = {
  // Origines autorisées (à adapter selon vos domaines)
  origin: function (origin, callback) {
    // Liste des domaines autorisés
    const allowedOrigins = [
      'http://localhost:3000',           // Frontend local React/Vue
      'http://localhost:3001',           // Autre port local
      'http://127.0.0.1:3000',          // IP locale
      'https://votre-app-covoiturage.com', // Domaine production
      'https://admin.votre-app-covoiturage.com', // Panel admin
      'https://api.votre-app-covoiturage.com',   // API
      // Ajoutez vos autres domaines ici
    ];

    // Permettre les requêtes sans origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);

    // Environnement de développement - plus permissif
    if (process.env.NODE_ENV === 'development') {
      // Permettre localhost sur tous les ports
      if (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
        return callback(null, true);
      }
    }

    // Vérifier si l'origine est dans la liste autorisée
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.warn(`🚫 Origine CORS bloquée: ${origin}`);
      callback(new Error('Non autorisé par la politique CORS'));
    }
  },

  // Méthodes HTTP autorisées
  methods: [
    'GET',
    'POST', 
    'PUT', 
    'PATCH',
    'DELETE', 
    'OPTIONS',
    'HEAD'
  ],

  // Headers autorisés
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'X-HTTP-Method-Override',
    'X-API-Key',
    'X-Client-Version',
    'X-Device-ID',
    'X-User-Agent',
    'Cache-Control',
    'Pragma',
    'Accept-Language',
    'Accept-Encoding'
  ],

  // Headers exposés au client
  exposedHeaders: [
    'X-Total-Count',
    'X-Page-Count', 
    'X-Current-Page',
    'X-Rate-Limit-Remaining',
    'X-Rate-Limit-Reset',
    'Content-Range',
    'Accept-Ranges'
  ],

  // Autoriser les cookies et credentials
  credentials: true,

  // Cache des résultats preflight (OPTIONS)
  maxAge: 86400, // 24 heures

  // Gérer les requêtes preflight
  preflightContinue: false,
  optionsSuccessStatus: 200
};

// Middleware CORS principal
const corsMiddleware = cors(corsOptions);

// Middleware CORS spécial pour les paiements mobiles (Wave, Orange Money, etc.)
const corsPaymentMiddleware = cors({
  origin: [
    'https://api.wave.com',
    'https://api.orangemoney.ci',
    'https://api.mtn.ci',
    'https://api.moovmoney.ci',
    // Domaines des services de paiement
  ],
  methods: ['POST', 'GET'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: false
});

// Middleware CORS pour les webhooks
const corsWebhookMiddleware = cors({
  origin: false, // Pas de CORS pour les webhooks
  methods: ['POST'],
  allowedHeaders: ['Content-Type', 'X-Webhook-Signature'],
  credentials: false
});

// Middleware CORS pour les uploads de fichiers
const corsUploadMiddleware = cors({
  ...corsOptions,
  // Augmenter la taille max pour les uploads
  maxAge: 3600 // 1 heure pour les uploads
});

// Fonction utilitaire pour configurer CORS dynamiquement
const configureCorsForRoute = (routeType) => {
  switch (routeType) {
    case 'payment':
      return corsPaymentMiddleware;
    case 'webhook':
      return corsWebhookMiddleware;
    case 'upload':
      return corsUploadMiddleware;
    case 'public':
      return cors({
        origin: '*',
        methods: ['GET'],
        allowedHeaders: ['Content-Type'],
        credentials: false
      });
    default:
      return corsMiddleware;
  }
};

// Middleware pour logger les requêtes CORS
const corsLogger = (req, res, next) => {
  if (req.method === 'OPTIONS') {
    console.log(`🔄 Requête CORS OPTIONS: ${req.headers.origin} -> ${req.url}`);
  }
  next();
};

// Middleware pour gérer les erreurs CORS
const corsErrorHandler = (error, req, res, next) => {
  if (error.message && error.message.includes('CORS')) {
    console.error(`❌ Erreur CORS: ${error.message}`, {
      origin: req.headers.origin,
      method: req.method,
      url: req.url,
      userAgent: req.headers['user-agent']
    });

    return res.status(403).json({
      success: false,
      error: 'CORS_REJECTED',
      message: 'Accès refusé - Origine non autorisée',
      code: 'CORS_003'
    });
  }
  next(error);
};

// Configuration spéciale pour les environnements
const getEnvironmentCorsConfig = () => {
  const env = process.env.NODE_ENV || 'development';
  
  switch (env) {
    case 'production':
      return {
        ...corsOptions,
        origin: [
          'https://votre-app-covoiturage.com',
          'https://admin.votre-app-covoiturage.com'
        ],
        credentials: true,
        maxAge: 86400
      };
    
    case 'staging':
      return {
        ...corsOptions,
        origin: [
          'https://staging.votre-app-covoiturage.com',
          'https://staging-admin.votre-app-covoiturage.com',
          'http://localhost:3000'
        ]
      };
    
    case 'development':
    default:
      return {
        ...corsOptions,
        origin: true, // Permettre toutes les origines en dev
        credentials: true
      };
  }
};

module.exports = {
  corsMiddleware,
  corsPaymentMiddleware,
  corsWebhookMiddleware,
  corsUploadMiddleware,
  configureCorsForRoute,
  corsLogger,
  corsErrorHandler,
  getEnvironmentCorsConfig
};