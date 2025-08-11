const axios = require('axios');

// Configuration de base
const BASE_URL = 'http://localhost:3000';
const API_URL = `${BASE_URL}/api/auth/inscription`;

// Payload de test pour l'inscription
const payloadTest = {
  nom: "Test",
  prenom: "Utilisateur",
  email: "test.inscription@example.com",
  motDePasse: "MotDePasse123",
  telephone: "0701234567"
};

async function testerInscription() {
  try {
    console.log('🧪 Test de l\'API d\'inscription...');
    console.log('📤 Payload envoyé:', JSON.stringify(payloadTest, null, 2));
    
    const response = await axios.post(API_URL, payloadTest, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
    
    console.log('✅ Inscription réussie !');
    console.log('📊 Statut:', response.status);
    console.log('📄 Réponse:', JSON.stringify(response.data, null, 2));
    
  } catch (error) {
    console.error('❌ Erreur lors de l\'inscription:');
    
    if (error.response) {
      // Erreur de réponse du serveur
      console.error('📊 Statut:', error.response.status);
      console.error('📄 Réponse d\'erreur:', JSON.stringify(error.response.data, null, 2));
    } else if (error.request) {
      // Erreur de requête (pas de réponse)
      console.error('🌐 Erreur de connexion:', error.message);
    } else {
      // Autre erreur
      console.error('💥 Erreur:', error.message);
    }
  }
}

// Test de la route de santé
async function testerRouteSante() {
  try {
    console.log('\n🏥 Test de la route de santé...');
    const response = await axios.get(`${BASE_URL}/api/auth/health`);
    console.log('✅ Route de santé accessible');
    console.log('📊 Statut:', response.status);
    console.log('📄 Réponse:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error('❌ Erreur route de santé:', error.message);
  }
}

// Exécuter les tests
async function executerTests() {
  console.log('🚀 Démarrage des tests d\'inscription...\n');
  
  await testerRouteSante();
  await testerInscription();
  
  console.log('\n✨ Tests terminés');
}

// Exécuter si le fichier est appelé directement
if (require.main === module) {
  executerTests().catch(console.error);
}

module.exports = { testerInscription, testerRouteSante };
