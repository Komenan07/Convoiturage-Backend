/**
 * Configuration MongoDB avec gestion d'erreurs robuste
 * Généré automatiquement par quick-fix.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

const connectDB = async () => {
  try {
    const options = {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      connectTimeoutMS: 20000,
      socketTimeoutMS: 45000,
      serverSelectionTimeoutMS: 20000,
      maxPoolSize: 10,
      minPoolSize: 2,
      heartbeatFrequencyMS: 10000,
      retryWrites: true,
      bufferCommands: false,
      bufferMaxEntries: 0,
    };

    console.log('🔄 Connexion à MongoDB...');
    
    const conn = await mongoose.connect(process.env.MONGODB_URI, options);
    
    console.log(`✅ MongoDB connecté: ${conn.connection.host}`);
    return conn;

  } catch (error) {
    console.error('❌ Erreur MongoDB:', error.message);
    
    if (error.message.includes('ETIMEOUT')) {
      console.error('💡 Solution: Utilisez MongoDB local ou vérifiez votre réseau');
    }
    
    if (error.message.includes('ECONNREFUSED')) {
      console.error('💡 Solution: Démarrez MongoDB local avec "mongod"');
    }
    
    process.exit(1);
  }
};

// Événements de connexion
mongoose.connection.on('connected', () => {
  console.log('📡 Mongoose connecté');
});

mongoose.connection.on('error', (err) => {
  console.error('❌ Erreur MongoDB:', err.message);
});

mongoose.connection.on('disconnected', () => {
  console.log('🔌 Mongoose déconnecté');
});

process.on('SIGINT', async () => {
  await mongoose.connection.close();
  console.log('🔒 Connexion fermée');
  process.exit(0);
});

module.exports = connectDB;
