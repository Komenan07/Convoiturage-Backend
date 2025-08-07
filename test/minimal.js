// server-minimal.js - Version minimale pour identifier le problème

require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();

// Middlewares de base
app.use(cors());
app.use(express.json());

// Route de test simple
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: '🚗 Serveur minimal opérationnel',
    timestamp: new Date().toISOString()
  });
});

// Route de santé
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    mongodb: mongoose.connection.readyState === 1 ? 'Connecté' : 'Déconnecté'
  });
});

console.log('🔄 Démarrage du serveur minimal...');

// ÉTAPE 1: Tester sans les routes utilisateur
console.log('📋 ÉTAPE 1: Test sans routes utilisateur');

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`✅ Serveur minimal démarré sur port ${PORT}`);
  console.log('🧪 Testez: http://localhost:3000');
  console.log('💊 Santé: http://localhost:3000/health');
  
  // ÉTAPE 2: Tenter de charger les routes une par une
  console.log('\n📋 ÉTAPE 2: Test des routes...');
  
  setTimeout(() => {
    try {
      console.log('🔄 Chargement de utilisateurRouter...');
      const utilisateurRouter = require('./routes/utilisateurRouter');
      
      // Si on arrive ici, le fichier se charge sans erreur
      console.log('✅ utilisateurRouter chargé avec succès');
      
      // Maintenant essayer de l'utiliser
      app.use('/api/utilisateur', utilisateurRouter);
      console.log('✅ Routes utilisateur montées avec succès');
      
    } catch (error) {
      console.error('❌ Erreur lors du chargement des routes:');
      console.error('   Message:', error.message);
      console.error('   Stack:', error.stack.split('\n').slice(0, 5).join('\n'));
      
      if (error.message.includes('Missing parameter name')) {
        console.error('\n💡 SOLUTION PROBABLE:');
        console.error('   Le fichier ./routes/utilisateurRouter.js contient une route malformée');
        console.error('   Cherchez les patterns comme:');
        console.error('   ❌ router.get(":/", ...)     // Paramètre vide');
        console.error('   ❌ router.get("/:/id", ...)  // Paramètre mal défini');
        console.error('   ❌ router.get("/test:", ...) // Paramètre sans nom');
        console.error('   ✅ router.get("/:id", ...)  // Correct');
      }
    }
  }, 1000);
});

// Gestion d'erreur globale
app.use((error, req, res, next) => {
  console.error('🛑 Erreur globale:', error.message);
  res.status(500).json({
    success: false,
    message: 'Erreur serveur',
    error: error.message
  });
});

module.exports = server;