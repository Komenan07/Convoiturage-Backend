const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const connectDB = require('./config/db');
const { errorHandler } = require('./middlewares/errorHandler');
const http = require('http'); 

const app = express();

// Configuration de base
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

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
const HOST = process.env.HOST || 'localhost';

const demarrerServeur = async () => {
  try {
    await connectDB();
    console.log('✅ Connexion MongoDB établie');

    // Créer un serveur HTTP natif afin d'attacher Socket.io
    const server = http.createServer(app);

    // Initialiser Socket.io
    try {
      const { initSocket } = require('./realtime/socket');
      const io = initSocket(server, app); // <-- Récupérer l'instance io pour une utilisation ultérieure si nécessaire
      console.log('✅ Socket.io initialisé');

      // Exemple : Écouter un événement personnalisé au niveau du serveur principal (optionnel)
      io.on('connection', (socket) => {
        console.log(`🔌 Socket connecté: ${socket.id}`);
      });

    } catch (e) {
      console.warn('⚠️ Socket.io non initialisé:', e.message);
    }

    server.listen(PORT, '0.0.0.0', () => {
      console.log('🎉 ================================');
      console.log(`🚀 Serveur démarré avec succès!`);
      console.log(`📍 URL: http://${HOST}:${PORT}`);
      console.log(`🔗 Santé: http://${HOST}:${PORT}/api/health`);
      console.log(`📋 Endpoints: http://${HOST}:${PORT}/api`);
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
