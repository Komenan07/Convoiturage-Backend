require('dotenv').config();
const mongoose = require('mongoose');

// Fonction de test de connexion
async function testMongoConnection() {
    const mongoURI = process.env.MONGO_URI || process.env.DATABASE;
    
    console.log('🔍 Test de connexion MongoDB...');
    console.log('📝 URI (masquée):', mongoURI?.replace(/:([^:@]+)@/, ':***@'));
    
    if (!mongoURI) {
        console.error('❌ Aucune URI MongoDB trouvée dans les variables d\'environnement');
        return;
    }
    
    try {
        // Options de connexion recommandées
        const options = {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: 10000, // 10 secondes
            socketTimeoutMS: 45000, // 45 secondes
        };
        
        console.log('⏳ Tentative de connexion...');
        await mongoose.connect(mongoURI, options);
        
        console.log('✅ Connexion MongoDB réussie !');
        console.log('📊 Base de données connectée:', mongoose.connection.name);
        console.log('🏠 Host:', mongoose.connection.host);
        
        // Test d'une opération simple
        const collections = await mongoose.connection.db.listCollections().toArray();
        console.log('📁 Collections disponibles:', collections.map(c => c.name));
        
    } catch (error) {
        console.error('❌ Erreur de connexion MongoDB:');
        console.error('📋 Type d\'erreur:', error.name);
        console.error('💬 Message:', error.message);
        
        // Conseils selon le type d'erreur
        if (error.message.includes('ENOTFOUND')) {
            console.log('\n🔧 Solutions possibles:');
            console.log('1. Vérifiez que le nom du cluster est correct');
            console.log('2. Encodez les caractères spéciaux dans le mot de passe (@->%40, #->%23, etc.)');
            console.log('3. Vérifiez votre connexion internet');
        } else if (error.message.includes('authentication failed')) {
            console.log('\n🔧 Solutions possibles:');
            console.log('1. Vérifiez le nom d\'utilisateur et mot de passe');
            console.log('2. Assurez-vous que l\'utilisateur a les bonnes permissions');
        } else if (error.message.includes('IP not in whitelist')) {
            console.log('\n🔧 Solutions possibles:');
            console.log('1. Ajoutez votre IP à la whitelist MongoDB Atlas');
            console.log('2. Ou autorisez toutes les IPs (0.0.0.0/0) pour les tests');
        }
        
    } finally {
        await mongoose.disconnect();
        console.log('🔌 Connexion fermée');
    }
}

// Exécuter le test
testMongoConnection();