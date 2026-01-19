const http = require('http');
const connectDB = require('./config/db');
const app = require('./app');
const ExpireTrajetsJob = require('./jobs/expireTrajetsJob');
const trajetAutomationService = require('./services/trajetAutomationService');

const PORT = process.env.PORT || 5500;
const HOST = '0.0.0.0';

const demarrerServeur = async () => {
  try {
    await connectDB();
    console.log('✅ Connexion MongoDB établie');

     // Démarrer le job d'expiration
    ExpireTrajetsJob.start();

    // Exécuter une première fois au démarrage
    try {
      const result = await ExpireTrajetsJob.executer();
      if (result.total > 0) {
        console.log(`✅ Expiration initiale: ${result.total} trajet(s) expiré(s)`);
      }
    } catch (err) {
      console.error('⚠️ Erreur expiration initiale:', err.message);
    }

    console.log('🚀 Démarrage du service d\'automation des trajets...');
    trajetAutomationService.start();

    const server = http.createServer(app);

    // Initialiser Socket.io si disponible
    try {
      const { initSocket } = require('./realtime/socket');
      const io = initSocket(server, app);
      console.log('✅ Socket.io initialisé');
      io.on('connection', (socket) => {
        console.log(`🔌 Socket connecté: ${socket.id}`);
      });
    } catch (e) {
      // ignore
    }

    server.listen(PORT, HOST, () => {
      console.log(`🚀 Serveur démarré: http://${HOST}:${PORT} (env=${process.env.NODE_ENV || 'development'})`);
    });

    process.on('unhandledRejection', (reason) => {
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

if (process.env.NODE_ENV !== 'test') {
  demarrerServeur();
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 SIGTERM reçu, fermeture...');
  try {
    trajetAutomationService.stop();
    
    const mongoose = require('mongoose');
    await mongoose.connection.close(false);
    console.log('✅ Connexion MongoDB fermée');
  } finally {
    process.exit(0);
  }
});

module.exports = app;