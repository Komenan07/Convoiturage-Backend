const axios = require('axios');

// Configuration de base
const BASE_URL = 'http://localhost:3000';
const API_URL = `${BASE_URL}/api/auth/inscription`;

// Payload complet de test pour l'inscription
const payloadComplet = {
  nom: "Test",
  prenom: "Utilisateur",
  email: "test.complet@example.com",
  motDePasse: "MotDePasse123",
  telephone: "0701234567",
  dateNaissance: "1990-01-01",
  sexe: "M",
  adresse: {
    commune: "Cocody",
    quartier: "Riviera Palmeraie",
    ville: "Abidjan"
  }
};

// Payload minimal de test
const payloadMinimal = {
  nom: "Test",
  prenom: "Minimal",
  email: "test.minimal@example.com",
  motDePasse: "MotDePasse123",
  telephone: "0701234568"
};

async function testerInscriptionComplet() {
  try {
    console.log('🧪 Test de l\'API d\'inscription avec payload complet...');
    console.log('📤 Payload envoyé:', JSON.stringify(payloadComplet, null, 2));
    
    const response = await axios.post(API_URL, payloadComplet, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
    
    console.log('✅ Inscription complète réussie !');
    console.log('📊 Statut:', response.status);
    console.log('📄 Réponse:', JSON.stringify(response.data, null, 2));
    
  } catch (error) {
    console.error('❌ Erreur lors de l\'inscription complète:');
    
    if (error.response) {
      console.error('📊 Statut:', error.response.status);
      console.error('📄 Réponse d\'erreur:', JSON.stringify(error.response.data, null, 2));
    } else if (error.request) {
      console.error('🌐 Erreur de connexion:', error.message);
    } else {
      console.error('💥 Erreur:', error.message);
    }
  }
}

async function testerInscriptionMinimal() {
  try {
    console.log('\n🧪 Test de l\'API d\'inscription avec payload minimal...');
    console.log('📤 Payload envoyé:', JSON.stringify(payloadMinimal, null, 2));
    
    const response = await axios.post(API_URL, payloadMinimal, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
    
    console.log('✅ Inscription minimale réussie !');
    console.log('📊 Statut:', response.status);
    console.log('📄 Réponse:', JSON.stringify(response.data, null, 2));
    
  } catch (error) {
    console.error('❌ Erreur lors de l\'inscription minimale:');
    
    if (error.response) {
      console.error('📊 Statut:', error.response.status);
      console.error('📄 Réponse d\'erreur:', JSON.stringify(error.response.data, null, 2));
    } else if (error.request) {
      console.error('🌐 Erreur de connexion:', error.message);
    } else {
      console.error('💥 Erreur:', error.message);
    }
  }
}

// Test de la route de santé
async function testerRouteSante() {
  try {
    console.log('🏥 Test de la route de santé...');
    const response = await axios.get(`${BASE_URL}/api/auth/health`);
    console.log('✅ Route de santé accessible');
    console.log('📊 Statut:', response.status);
  } catch (error) {
    console.error('❌ Erreur route de santé:', error.message);
  }
}

// Exécuter les tests
async function executerTests() {
  console.log('🚀 Démarrage des tests d\'inscription...\n');
  
  await testerRouteSante();
  await testerInscriptionComplet();
  await testerInscriptionMinimal();
  
  console.log('\n✨ Tests terminés');
}

// Exécuter si le fichier est appelé directement
if (require.main === module) {
  executerTests().catch(console.error);
}

module.exports = { testerInscriptionComplet, testerInscriptionMinimal, testerRouteSante };
