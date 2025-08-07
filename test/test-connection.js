const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const mongoose = require('mongoose');
require('dotenv').config({ path: '../.env' });

const testAtlas = async () => {
  console.log('🧪 Test de connexion MongoDB Atlas...');
  console.log('🔍 Variables d\'environnement trouvées:');
  console.log('MONGO_URI:', process.env.MONGO_URI ? '✅ Défini' : '❌ Non défini');
  console.log('MONGODB_URI:', process.env.MONGODB_URI ? '✅ Défini' : '❌ Non défini');
  
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  
  if (!uri) {
    console.error('❌ Aucune URI MongoDB trouvée!');
    console.log('📝 Vérifiez votre fichier .env');
    return;
  }
  
  console.log('🔗 URI utilisée:', uri.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@'));
  
  try {
    console.log('⏳ Connexion en cours...');
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 45000,
      family: 4, // Force IPv4
      bufferMaxEntries: 0
    });
    
    console.log('✅ Connexion MongoDB Atlas réussie!');
    
    // Test d'une requête simple
    console.log('🏓 Test ping...');
    const admin = mongoose.connection.db.admin();
    const result = await admin.ping();
    console.log('✅ Ping réussi:', result);
    
    // Afficher des infos sur la DB
    console.log('📊 Informations base de données:');
    console.log('- Nom:', mongoose.connection.name);
    console.log('- État:', mongoose.connection.readyState === 1 ? 'Connecté' : 'Déconnecté');
    
  } catch (error) {
    console.error('❌ Test échoué:', error.message);
    console.error('🔍 Type d\'erreur:', error.name);
    
    if (error.message.includes('ETIMEOUT')) {
      console.log('💡 Solutions possibles:');
      console.log('   1. Vérifiez Network Access dans MongoDB Atlas (0.0.0.0/0)');
      console.log('   2. Essayez un autre réseau (partage téléphone)');
      console.log('   3. Vérifiez vos identifiants');
    }
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Connexion fermée');
  }
};

testAtlas();