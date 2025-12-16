// verify-token.js
const axios = require('axios');

async function verifyToken() {
  const BASE_URL = 'http://localhost:3000';
  const JWT_TOKEN = 'VOTRE_TOKEN_ICI'; // Le même que dans test-notifications-api.js
  
  console.log('🔍 VÉRIFICATION DU TOKEN ET DU SERVEUR\n');
  
  // Test 1: Vérifier la connexion au serveur
  console.log('1. Test connexion serveur...');
  try {
    const ping = await axios.get(BASE_URL, { timeout: 5000 });
    console.log(`   ✅ Serveur accessible (${ping.status})`);
  } catch (error) {
    console.log(`   ❌ Serveur inaccessible: ${error.message}`);
    console.log('   👉 Démarrez votre serveur: npm run dev');
    return;
  }
  
  // Test 2: Tester sans token
  console.log('\n2. Test sans token...');
  try {
    const noToken = await axios.get(`${BASE_URL}/api/notifications/status`);
    console.log(`   ❌ Inattendu: accessible sans token (${noToken.status})`);
  } catch (error) {
    console.log(`   ✅ Bon: authentification requise (${error.response?.status || error.code})`);
  }
  
  // Test 3: Tester avec votre token
  console.log('\n3. Test avec votre token...');
  try {
    const withToken = await axios.get(`${BASE_URL}/api/notifications/status`, {
      headers: { 'Authorization': `Bearer ${JWT_TOKEN}` }
    });
    console.log(`   ✅ Token VALIDE (${withToken.status})`);
    console.log('   Données:', JSON.stringify(withToken.data, null, 2));
  } catch (error) {
    console.log(`   ❌ Token INVALIDE ou expiré (${error.response?.status || 'No response'})`);
    console.log('   Message:', error.response?.data?.message || error.message);
    
    // Si 401, obtenez un nouveau token
    if (error.response?.status === 401) {
      console.log('\n🔑 Vous devez obtenir un nouveau token JWT:');
      console.log('   Méthode 1: Connectez-vous via votre app');
      console.log('   Méthode 2: Utilisez curl:');
      console.log('     curl -X POST http://localhost:3000/api/auth/login \\');
      console.log('       -H "Content-Type: application/json" \\');
      console.log('       -d \'{"email":"test@wayz-eco.ci","password":"test123"}\'');
    }
  }
  
  // Test 4: Vérifier la base de données
  console.log('\n4. Vérification MongoDB...');
  try {
    const health = await axios.get(`${BASE_URL}/api/health`, { timeout: 3000 });
    console.log(`   ✅ MongoDB: ${health.data.mongodb === 'connected' ? 'Connecté' : 'Déconnecté'}`);
  } catch (error) {
    console.log('   ℹ️  Endpoint health non disponible');
  }
}

verifyToken();