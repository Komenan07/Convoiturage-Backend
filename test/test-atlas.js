const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const mongoose = require('mongoose');
require('dotenv').config();

const testAtlas = async () => {
  console.log('🧪 Test de connexion MongoDB Atlas...');
  console.log('URI:', process.env.MONGODB_URI?.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@'));
  
  try {
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 30000,
      family: 4
    });
    console.log('✅ Test réussi !');
    
    // Test d'une requête simple
    const admin = mongoose.connection.db.admin();
    const result = await admin.ping();
    console.log('🏓 Ping MongoDB:', result);
    
  } catch (error) {
    console.error('❌ Test échoué:', error.message);
    console.error('Type d\'erreur:', error.name);
  } finally {
    await mongoose.disconnect();
  }
};

testAtlas();