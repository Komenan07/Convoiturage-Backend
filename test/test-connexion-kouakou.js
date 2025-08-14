const axios = require('axios');

const BASE_URL = 'http://localhost:3000';

async function testConnexionKouakou() {
    console.log('🧪 === TEST CONNEXION kouakou01marc@gmail.com ===\n');
    
    const credentials = {
        email: 'kouakou01marc@gmail.com',
        motDePasse: 'Test123!'
    };
    
    console.log('📝 Identifiants de connexion:');
    console.log(JSON.stringify(credentials, null, 2));
    
    try {
        console.log('\n📡 Envoi de la requête de connexion...');
        
        const response = await axios.post(`${BASE_URL}/api/auth/connexion`, credentials, {
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 15000
        });
        
        console.log('✅ CONNEXION RÉUSSIE !');
        console.log('📄 Réponse du serveur:');
        console.log(JSON.stringify(response.data, null, 2));
        
        if (response.data.token) {
            console.log('\n🔑 TOKEN JWT reçu:');
            console.log('   - Token:', response.data.token.substring(0, 50) + '...');
            console.log('   - Refresh Token:', response.data.refreshToken ? 'Présent' : 'Absent');
            
            // Tester la route /me avec le token
            console.log('\n📡 Test de la route /api/auth/me...');
            
            const meResponse = await axios.get(`${BASE_URL}/api/auth/me`, {
                headers: {
                    'Authorization': `Bearer ${response.data.token}`,
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
            
            console.log('\n🎉 TOUS LES TESTS SONT RÉUSSIS !');
            console.log('Le serveur fonctionne parfaitement avec les corrections.');
            
        }
        
        return true;
        
    } catch (error) {
        console.log('❌ ERREUR DE CONNEXION');
        
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

// Test de connexion
testConnexionKouakou();
