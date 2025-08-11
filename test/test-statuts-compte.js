const axios = require('axios');

// Configuration de base
const BASE_URL = 'http://localhost:3000';
const API_URL = `${BASE_URL}/api/auth`;

// Test des différents statuts de compte
async function testerStatutsCompte() {
  console.log('🧪 Test de la gestion des statuts de compte...\n');

  // Test 1: Inscription d'un nouvel utilisateur
  console.log('📝 Test 1: Inscription d\'un nouvel utilisateur...');
  const payloadInscription = {
    nom: "Test",
    prenom: "Statut",
    email: "test.statut@example.com",
    motDePasse: "MotDePasse123",
    telephone: "0701234569"
  };

  try {
    const responseInscription = await axios.post(`${API_URL}/inscription`, payloadInscription, {
      headers: { 'Content-Type': 'application/json' }
    });
    
    console.log('✅ Inscription réussie');
    console.log('📊 Statut du compte:', responseInscription.data.user.statutCompte || 'Non défini');
    
    // Test 2: Tentative de connexion avec le compte en attente de vérification
    console.log('\n🔐 Test 2: Tentative de connexion avec compte en attente de vérification...');
    
    try {
      await axios.post(`${API_URL}/connexion`, {
        email: payloadInscription.email,
        password: payloadInscription.motDePasse
      });
      console.log('❌ Erreur: La connexion aurait dû échouer');
    } catch (error) {
      if (error.response && error.response.status === 403) {
        console.log('✅ Connexion correctement refusée');
        console.log('📄 Message:', error.response.data.message);
        console.log('🔑 Code d\'erreur:', error.response.data.codeErreur);
        console.log('📋 Détails:', error.response.data.details);
      } else {
        console.log('❌ Erreur inattendue:', error.message);
      }
    }

  } catch (error) {
    console.error('❌ Erreur lors de l\'inscription:', error.response?.data || error.message);
  }

  // Test 3: Test de connexion avec identifiants incorrects
  console.log('\n🔐 Test 3: Test de connexion avec identifiants incorrects...');
  
  try {
    await axios.post(`${API_URL}/connexion`, {
      email: "email.inexistant@example.com",
      password: "MotDePasseIncorrect"
    });
    console.log('❌ Erreur: La connexion aurait dû échouer');
  } catch (error) {
    if (error.response && error.response.status === 401) {
      console.log('✅ Connexion correctement refusée avec identifiants incorrects');
      console.log('📄 Message:', error.response.data.message);
      console.log('🔑 Code d\'erreur:', error.response.data.codeErreur);
      console.log('📊 Tentatives restantes:', error.response.data.tentativesRestantes);
    } else {
      console.log('❌ Erreur inattendue:', error.message);
    }
  }

  // Test 4: Test de la route de santé
  console.log('\n🏥 Test 4: Test de la route de santé...');
  
  try {
    const responseSante = await axios.get(`${API_URL}/health`);
    console.log('✅ Route de santé accessible');
    console.log('📊 Statut:', responseSante.status);
    console.log('📄 Réponse:', JSON.stringify(responseSante.data, null, 2));
  } catch (error) {
    console.error('❌ Erreur route de santé:', error.message);
  }
}

// Test de simulation de blocage temporaire
async function testerBlocageTemporaire() {
  console.log('\n🔒 Test de simulation de blocage temporaire...');
  
  const emailTest = "test.blocage@example.com";
  
  // Inscription
  const payload = {
    nom: "Test",
    prenom: "Blocage",
    email: emailTest,
    motDePasse: "MotDePasse123",
    telephone: "0701234570"
  };

  try {
    await axios.post(`${API_URL}/inscription`, payload, {
      headers: { 'Content-Type': 'application/json' }
    });
    
    console.log('✅ Utilisateur créé, test de tentatives échouées...');
    
    // Simuler plusieurs tentatives de connexion échouées
    for (let i = 1; i <= 6; i++) {
      try {
        await axios.post(`${API_URL}/connexion`, {
          email: emailTest,
          password: "MotDePasseIncorrect"
        });
        console.log(`❌ Tentative ${i}: La connexion aurait dû échouer`);
      } catch (error) {
        if (error.response && error.response.status === 401) {
          console.log(`✅ Tentative ${i}: Connexion refusée (${error.response.data.tentativesRestantes} restantes)`);
        } else {
          console.log(`❌ Erreur inattendue à la tentative ${i}:`, error.message);
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Erreur lors du test de blocage:', error.response?.data || error.message);
  }
}

// Exécuter les tests
async function executerTests() {
  console.log('🚀 Démarrage des tests de gestion des statuts de compte...\n');
  
  await testerStatutsCompte();
  await testerBlocageTemporaire();
  
  console.log('\n✨ Tests terminés');
}

// Exécuter si le fichier est appelé directement
if (require.main === module) {
  executerTests().catch(console.error);
}

module.exports = { testerStatutsCompte, testerBlocageTemporaire };
