const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const { errorHandler } = require('./middlewares/errorHandler');

const app = express();

// ====================================
// SÉCURITÉ AVEC HELMET
// ====================================
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
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
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    const allowedOrigins = process.env.ALLOWED_ORIGINS 
      ? process.env.ALLOWED_ORIGINS.split(',')
      : [
          'http://localhost:3000', 
          'http://localhost:3001', 
          'http://localhost:8000', 
          'http://127.0.0.1:8000',
          'http://localhost:8080', 
          'http://127.0.0.1:8080'
        ];
    if (origin.match(/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/)) {
      return callback(null, true);
    }
    if (process.env.NODE_ENV === 'development') {
      if (origin.match(/^http:\/\/(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$/)) {
        return callback(null, true);
      }
    }
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log('❌ CORS: Origine non autorisée:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  exposedHeaders: ['Content-Range', 'X-Content-Range']
};
app.use(cors(corsOptions));

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

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
  path.join(__dirname, 'uploads', 'photos'),
  path.join(__dirname, 'uploads', 'documents'), 
  path.join(__dirname, 'uploads', 'profils'),
  path.join(__dirname, 'uploads', 'vehicules'), 
  path.join(__dirname, 'uploads', 'users'),
  path.join(__dirname, 'uploads', 'temp'), 
  path.join(__dirname, 'logs'), 
  path.join(__dirname, 'backups')
];

uploadDirs.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// ====================================
// FICHIERS STATIQUES
// ====================================
app.use('/uploads', (req, res, next) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Cross-Origin-Resource-Policy', 'cross-origin');
  res.header('Cross-Origin-Embedder-Policy', 'unsafe-none');
  next();
}, express.static(path.join(__dirname, 'uploads')));

app.use('/public', (req, res, next) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Cross-Origin-Resource-Policy', 'cross-origin');
  res.header('Cross-Origin-Embedder-Policy', 'unsafe-none');
  next();
}, express.static(path.join(__dirname, 'public')));

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
// Allowlist / skip logic: useful to avoid 429 in local development and
// to allow certain IPs (CI, health checks) to bypass the limiter.
const allowlistEnv = process.env.RATE_LIMIT_WHITELIST || '127.0.0.1,::1';
const allowlist = allowlistEnv.split(',').map(s => s.trim()).filter(Boolean);

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Trop de requêtes, veuillez réessayer plus tard',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req, _res) => {
    // Skip limiter entirely in development for convenience
    if (process.env.NODE_ENV === 'development') return true;
    // Skip for requests coming from allowlisted IPs
    const ip = req.ip || req.connection?.remoteAddress || '';
    if (allowlist.includes(ip)) return true;
    return false;
  }
});

app.use('/api/', globalLimiter);

// ====================================
// TEST ENV: stub external services to avoid side-effects at import
// ====================================
if (process.env.NODE_ENV === 'test') {
  const stubNames = [
    'greenApiService',
    'notificationService',
    'firebaseService',
    'cinetPayService',
    'presenceService',
    'emailService'
  ];

  stubNames.forEach((name) => {
    try {
      const p = require.resolve(`./services/${name}.js`);
      const noopProxy = new Proxy({}, { get: () => () => {} });
      require.cache[p] = { id: p, filename: p, loaded: true, exports: noopProxy };
    } catch (e) {
      // ignore if module doesn't exist
    }
  });
}

// ====================================
// CHARGEMENT DES ROUTES
// ====================================
const chargerRouteSecurisee = (cheminRoute, nomRoute, urlBase) => {
  try {
    const cheminComplet = path.resolve(__dirname, cheminRoute);
    if (!fs.existsSync(cheminComplet)) {
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
    return true;
  } catch (error) {
    console.error(`❌ Erreur lors du chargement de la route ${nomRoute}:`, error.message);
    return false;
  }
};

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
  { nom: 'places', chemins: ['./routes/placesV2Routes.js'], url: '/api/places' },
  { nom: 'verifications', chemins: ['./routes/verificationRoute.js'], url: '/api/verification' },
  { nom: 'notifications', chemins: ['./routes/notifications.js'], url: '/api/notifications' },
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

if (process.env.NODE_ENV === 'development') {
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

module.exports = app;
