const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// Configuration de la base de données
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/covoiturage');
    console.log('✅ Connexion à MongoDB réussie');
  } catch (error) {
    console.error('❌ Erreur de connexion MongoDB:', error);
    process.exit(1);
  }
};

// Importer le modèle Utilisateur complet
const User = require('../models/Utilisateur');

// Fonction pour vérifier directement le hash
const verifierHashDirect = async () => {
  try {
    const email = 'smart12center@gmail.com';
    const motDePasse = 'Je@nM@rc79';
    
    console.log('\n🔍 Recherche de l\'utilisateur...');
    const user = await User.findOne({ email }).select('+motDePasse');
    
    if (!user) {
      console.log('❌ Utilisateur non trouvé');
      return;
    }
    
    console.log('✅ Utilisateur trouvé:');
    console.log('   - ID:', user._id);
    console.log('   - Email:', user.email);
    console.log('   - Hash stocké:', user.motDePasse);
    console.log('   - Hash présent:', !!user.motDePasse);
    
    if (user.motDePasse) {
      console.log('\n🔐 Test de vérification du mot de passe...');
      console.log('   - Mot de passe à tester:', motDePasse);
      
      // Test avec bcrypt.compare
      const isMatch = await bcrypt.compare(motDePasse, user.motDePasse);
      console.log('   - bcrypt.compare résultat:', isMatch);
      
      // Test avec la méthode du modèle
      if (typeof user.verifierMotDePasse === 'function') {
        try {
          const verifModele = await user.verifierMotDePasse(motDePasse);
          console.log('   - user.verifierMotDePasse résultat:', verifModele);
        } catch (error) {
          console.log('   - user.verifierMotDePasse erreur:', error.message);
        }
      } else {
        console.log('   - Méthode verifierMotDePasse non disponible');
      }
      
      // Créer un nouveau hash du même mot de passe
      console.log('\n🆕 Test avec un nouveau hash...');
      const salt = await bcrypt.genSalt(10);
      const newHash = await bcrypt.hash(motDePasse, salt);
      console.log('   - Nouveau hash créé:', newHash);
      
      // Vérifier le nouveau hash
      const newHashMatch = await bcrypt.compare(motDePasse, newHash);
      console.log('   - Nouveau hash valide:', newHashMatch);
      
      // Comparer les deux hashes
      console.log('\n🔍 Comparaison des hashes...');
      console.log('   - Hash stocké:', user.motDePasse);
      console.log('   - Nouveau hash:', newHash);
      console.log('   - Sont identiques:', user.motDePasse === newHash);
      
      // Test avec le hash stocké
      console.log('\n🧪 Test avec le hash stocké...');
      const testHashMatch = await bcrypt.compare(motDePasse, user.motDePasse);
      console.log('   - Test avec hash stocké:', testHashMatch);
      
      // Test avec le nouveau hash
      const testNewHashMatch = await bcrypt.compare(motDePasse, newHash);
      console.log('   - Test avec nouveau hash:', testNewHashMatch);
      
    } else {
      console.log('\n❌ MOT DE PASSE MANQUANT dans la base de données');
    }
    
  } catch (error) {
    console.error('❌ Erreur lors de la vérification:', error);
  }
};

// Fonction principale
const main = async () => {
  await connectDB();
  await verifierHashDirect();
  await mongoose.disconnect();
  console.log('\n🔌 Déconnexion de MongoDB');
};

main();

