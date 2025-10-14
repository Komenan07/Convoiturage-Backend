const mongoose = require('mongoose');
const env = require('./env');
const logger = require('../utils/logger');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(env.mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 30000, // 30 secondes pour la sélection du serveur
      socketTimeoutMS: 45000, // 45 secondes pour les opérations socket
      connectTimeoutMS: 30000, // 30 secondes pour la connexion
      maxPoolSize: 10, // Taille maximale du pool de connexions
      minPoolSize: 1, // Taille minimale du pool de connexions
      maxIdleTimeMS: 30000, // Temps maximum d'inactivité
    });
    logger.info(`MongoDB connecté: ${conn.connection.host}`);
  } catch (err) {
    logger.error(`Erreur de connexion MongoDB: ${err.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
