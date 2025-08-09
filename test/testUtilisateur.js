// test-utilisateur.js
require('dotenv').config();
const mongoose = require('mongoose');

const testUtilisateur = async () => {
  try {
    mongoose.set('bufferCommands', false);
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 30000,
      family: 4
    });
    
    console.log('✅ Connecté à MongoDB');
    
    // Lister toutes les collections
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log('📋 Collections disponibles:', collections.map(c => c.name));
    
    // Tester la collection utilisateurs
    const Utilisateur = mongoose.model('TestUser', new mongoose.Schema({
      email: String
    }), 'utilisateurs');
    
    const count = await Utilisateur.countDocuments();
    console.log(`👥 Nombre d'utilisateurs dans la collection: ${count}`);
    
    // Tester une recherche par email
    const test = await Utilisateur.findOne({ email: 'yves.konan@gmail.com' });
    console.log('🔍 Utilisateur trouvé:', test ? 'Oui' : 'Non');
    
  } catch (error) {
    console.error('❌ Erreur test:', error.message);
  } finally {
    await mongoose.disconnect();
  }
};

testUtilisateur();