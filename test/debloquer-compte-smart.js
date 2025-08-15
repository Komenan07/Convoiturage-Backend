const mongoose = require('mongoose');
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

// Fonction pour débloquer le compte
const debloquerCompte = async () => {
  try {
    const email = 'smart12center@gmail.com';
    
    console.log('\n🔍 Recherche de l\'utilisateur...');
    const user = await User.findOne({ email });
    
    if (!user) {
      console.log('❌ Utilisateur non trouvé');
      return;
    }
    
    console.log('✅ Utilisateur trouvé:');
    console.log('   - ID:', user._id);
    console.log('   - Email:', user.email);
    console.log('   - Statut compte:', user.statutCompte);
    console.log('   - Tentatives échouées:', user.tentativesConnexionEchouees);
    console.log('   - Compte bloqué le:', user.compteBloqueLe);
    
    // Vérifier le statut actuel
    if (typeof user.peutSeConnecter === 'function') {
      const statutAvant = user.peutSeConnecter();
      console.log('\n📋 Statut avant déblocage:');
      console.log('   - Peut se connecter:', statutAvant.autorise);
      console.log('   - Raison:', statutAvant.raison);
      if (statutAvant.deblocageA) {
        console.log('   - Déblocage à:', statutAvant.deblocageA);
      }
    }
    
    // Débloquer le compte
    console.log('\n🔓 Déblocage du compte...');
    
    user.tentativesConnexionEchouees = 0;
    user.derniereTentativeConnexion = null;
    user.compteBloqueLe = null;
    
    await user.save();
    console.log('✅ Compte débloqué avec succès');
    
    // Vérifier le nouveau statut
    console.log('\n📋 Statut après déblocage:');
    if (typeof user.peutSeConnecter === 'function') {
      const statutApres = user.peutSeConnecter();
      console.log('   - Peut se connecter:', statutApres.autorise);
      console.log('   - Raison:', statutApres.raison);
      
      if (statutApres.autorise) {
        console.log('\n🎉 SUCCÈS !');
        console.log('Le compte est maintenant débloqué et peut se connecter.');
        console.log('\n💡 Identifiants de connexion:');
        console.log(`   Email: ${email}`);
        console.log(`   Mot de passe: Je@nM@rc79`);
      } else {
        console.log('\n⚠️  ATTENTION: Le compte ne peut toujours pas se connecter');
        console.log('   - Raison:', statutApres.raison);
      }
    }
    
  } catch (error) {
    console.error('❌ Erreur lors du déblocage:', error);
  }
};

// Fonction principale
const main = async () => {
  await connectDB();
  await debloquerCompte();
  await mongoose.disconnect();
  console.log('\n🔌 Déconnexion de MongoDB');
};

main();

