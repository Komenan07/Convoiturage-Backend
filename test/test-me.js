const axios = require('axios');

const BASE_URL = 'http://localhost:3000';

async function testRouteMe() {
    console.log('🧪 === TEST ROUTE /api/auth/me ===\n');
    
    // D'abord, se connecter pour obtenir un token
    const credentials = {
        email: 'kouakou01marc@gmail.com',
        motDePasse: 'Test123!'
    };
    
    console.log('📝 Connexion pour obtenir un token...');
    
    try {
        const loginResponse = await axios.post(`${BASE_URL}/api/auth/connexion`, credentials, {
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 15000
        });
        
        if (!loginResponse.data.token) {
            console.log('❌ Pas de token reçu lors de la connexion');
            return false;
        }
        
        const token = loginResponse.data.token;
        console.log('✅ Token JWT obtenu:', token.substring(0, 50) + '...');
        
        // Maintenant, tester la route /me avec le token
        console.log('\n📡 Test de la route /api/auth/me...');
        
        const meResponse = await axios.get(`${BASE_URL}/api/auth/me`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            timeout: 15000
        });
        
        console.log('✅ ROUTE /me RÉUSSIE !');
        console.log('📄 Réponse du serveur:');
        console.log(JSON.stringify(meResponse.data, null, 2));
        
        if (meResponse.data.user) {
            console.log('\n👤 Informations utilisateur reçues:');
            console.log('   - ID:', meResponse.data.user._id);
            console.log('   - Email:', meResponse.data.user.email);
            console.log('   - Nom:', meResponse.data.user.nom);
            console.log('   - Prénom:', meResponse.data.user.prenom);
            console.log('   - Statut compte:', meResponse.data.user.statutCompte);
            console.log('   - Role:', meResponse.data.user.role);
        }
        
        return true;
        
    } catch (error) {
        console.log('❌ ERREUR lors du test');
        
        if (error.response) {
            console.log('📄 Réponse d\'erreur du serveur:');
            console.log(`Status: ${error.response.status}`);
            console.log(JSON.stringify(error.response.data, null, 2));
        } else if (error.request) {
            console.log('📡 Pas de réponse du serveur.');
        } else {
            console.log('❌ Erreur:', error.message);
        }
        return false;
    }
}

// Test de la route
testRouteMe();
