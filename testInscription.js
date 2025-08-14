// testInscription.js - Test avec coordonnées géographiques correctes
const axios = require('axios');

const BASE_URL = 'http://localhost:3000';

async function testInscriptionAvecCoordonnees() {
    console.log('🧪 === TEST INSCRIPTION AVEC COORDONNÉES ===\n');
    
    const testUser = {
        nom: 'Test',
        prenom: 'Utilisateur', 
        email: 'komenanjean07+test@gmail.com',
        motDePasse: 'Test123456',
        telephone: '0701020304', // Format sans espaces
        // Ajouter l'adresse avec coordonnées correctes pour Abidjan
        adresse: {
            ville: 'Abidjan',
            commune: 'Cocody',
            quartier: 'Riviera',
            description: 'Près de la pharmacie',
            coordonnees: {
                type: 'Point',
                coordinates: [-4.0199, 5.3599] // [longitude, latitude] pour Abidjan
            }
        }
    };
    
    console.log('📝 Données d\'inscription complètes:');
    console.log(JSON.stringify(testUser, null, 2));
    
    try {
        console.log('\n📡 Envoi de la requête d\'inscription...');
        
        const response = await axios.post(`${BASE_URL}/api/auth/inscription`, testUser, {
            headers: {
                'Content-Type': 'application/json'
            },
            timeout: 15000
        });
        
        console.log('✅ INSCRIPTION RÉUSSIE !');
        console.log('📄 Réponse du serveur:');
        console.log(JSON.stringify(response.data, null, 2));
        
        console.log('\n📧 VÉRIFIEZ MAINTENANT:');
        console.log(`1. Votre boîte email: ${testUser.email}`);
        console.log('2. Le dossier SPAM/Indésirables');
        console.log('3. Vous devriez recevoir UN email de bienvenue');
        
        return true;
        
    } catch (error) {
        console.log('❌ ERREUR D\'INSCRIPTION');
        
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

// Test avec données minimales mais coordonnées par défaut
async function testInscriptionMinimale() {
    console.log('\n🎯 === TEST INSCRIPTION MINIMALE ===\n');
    
    const testUser = {
        nom: 'TestMin',
        prenom: 'UserMin', 
        email: 'komenanjean07+min@gmail.com',
        motDePasse: 'Test123456',
        telephone: '0707070707' // Format simple
    };
    
    console.log('📝 Données minimales:');
    console.log(JSON.stringify(testUser, null, 2));
    
    try {
        const response = await axios.post(`${BASE_URL}/api/auth/inscription`, testUser, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        console.log('✅ INSCRIPTION MINIMALE RÉUSSIE !');
        console.log(JSON.stringify(response.data, null, 2));
        return true;
        
    } catch (error) {
        console.log('❌ ERREUR INSCRIPTION MINIMALE');
        if (error.response) {
            console.log(JSON.stringify(error.response.data, null, 2));
        }
        return false;
    }
}

// Test de différents formats de téléphone valides
async function testFormatsPhone() {
    console.log('\n📱 === TEST FORMATS TÉLÉPHONE ===\n');
    
    const validFormats = [
        '0701234567',
        '0501234567', 
        '0101234567',
        '2250701234567'
    ];
    
    for (let i = 0; i < validFormats.length; i++) {
        const phone = validFormats[i];
        const testUser = {
            nom: 'TestPhone',
            prenom: `User${i}`, 
            email: `komenanjean07+phone${i}@gmail.com`,
            motDePasse: 'Test123456',
            telephone: phone
        };
        
        console.log(`📞 Test ${i+1}: ${phone}`);
        
        try {
            const response = await axios.post(`${BASE_URL}/api/auth/inscription`, testUser, {
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            console.log(`✅ Format ${phone} ACCEPTÉ !`);
            return true; // Arrêter au premier succès
            
        } catch (error) {
            if (error.response && error.response.status === 400) {
                console.log(`❌ Format ${phone} rejeté`);
            } else {
                console.log(`❌ Erreur serveur avec ${phone}:`, error.response?.data?.message);
            }
        }
        
        // Attendre entre les tests
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    return false;
}

async function runTests() {
    console.log('🚀 === TESTS D\'INSCRIPTION COMPLETS ===\n');
    
    // Test 1: Avec coordonnées complètes
    const test1 = await testInscriptionAvecCoordonnees();
    if (test1) return;
    
    // Test 2: Données minimales
    const test2 = await testInscriptionMinimale();
    if (test2) return;
    
    // Test 3: Différents formats de téléphone
    const test3 = await testFormatsPhone();
    if (test3) return;
    
    console.log('\n💡 === CONSEILS DE DÉPANNAGE ===');
    console.log('1. Vérifiez votre modèle User pour les champs requis');
    console.log('2. Le problème principal semble être les coordonnées géographiques');
    console.log('3. Votre modèle attend probablement une structure GeoJSON complète');
    console.log('\n🔧 Suggestion: Modifiez temporairement votre modèle User');
    console.log('pour rendre les coordonnées optionnelles pendant les tests.');
}

if (require.main === module) {
    runTests();
}

module.exports = { testInscriptionAvecCoordonnees, testInscriptionMinimale, testFormatsPhone };