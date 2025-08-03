// server.js

require('dotenv').config(); // 🔐 Chargement des variables d'environnement

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const utilisateurRouter = require('./routers/utilisateurRouter');

const app = express();

// 🛡️ Sécurité
app.use(helmet()); // Sécurise les headers HTTP
app.use(cors());   // Autorise les requêtes cross-origin
app.use(express.json({ limit: '10mb' })); // Parse JSON avec limite

// 📈 Limitation du nombre de requêtes
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
});
app.use(limiter);

// 🚪 Routes principales
app.use('/api/utilisateur', utilisateurRouter);

// 🔗 Test basique
app.get('/', (req, res) => {
  res.send('🚗 Covoiturage backend opérationnel');
});

// 🛠️ Connexion MongoDB
const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGO_URI;
    if (!mongoURI) throw new Error('❌ MONGO_URI non défini dans .env');

    await mongoose.connect(mongoURI); // ✅ Options supprimées : useNewUrlParser, useUnifiedTopology
    console.log('✅ Connexion MongoDB établie');
  } catch (error) {
    console.error('❌ Erreur MongoDB:', error.message);
    process.exit(1);
  }
};

connectDB();

// 🔥 Gestion des erreurs globales
app.use((error, req, res, next) => {
  console.error('🛑 Erreur interceptée:', error);
  res.status(500).json({
    success: false,
    message: 'Erreur serveur interne',
    error: process.env.NODE_ENV === 'development' ? error.message : undefined,
  });
});

// 🚀 Démarrage du serveur
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Serveur démarré sur port ${PORT}`);
});
