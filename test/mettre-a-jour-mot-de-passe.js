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

// Fonction pour mettre à jour le mot de passe
const mettreAJourMotDePasse = async () => {
  try {
    const email = 'smart12center@gmail.com';
    const nouveauMotDePasse = 'Je@nM@rc79';
    
    console.log('\n🔍 Recherche de l\'utilisateur...');
    const user = await User.findOne({ email }).select('+motDePasse');
    
    if (!user) {
      console.log('❌ Utilisateur non trouvé');
      return;
    }
    
    console.log('✅ Utilisateur trouvé:');
    console.log('   - ID:', user._id);
    console.log('   - Email:', user.email);
    console.log('   - Hash actuel:', user.motDePasse);
    
    // Vérifier l'ancien hash
    console.log('\n🔐 Test de l\'ancien hash...');
    const ancienHashValide = await bcrypt.compare(nouveauMotDePasse, user.motDePasse);
    console.log('   - Ancien hash valide:', ancienHashValide);
    
    // Créer le nouveau hash
    console.log('\n🆕 Création du nouveau hash...');
    const salt = await bcrypt.genSalt(10);
    const nouveauHash = await bcrypt.hash(nouveauMotDePasse, salt);
    console.log('   - Nouveau hash:', nouveauHash);
    
    // Vérifier le nouveau hash
    const nouveauHashValide = await bcrypt.compare(nouveauMotDePasse, nouveauHash);
    console.log('   - Nouveau hash valide:', nouveauHashValide);
    
    // Mettre à jour l'utilisateur
    console.log('\n💾 Mise à jour de l\'utilisateur...');
    user.motDePasse = nouveauHash;
    user.tentativesConnexionEchouees = 0;
    user.derniereTentativeConnexion = null;
    user.compteBloqueLe = null;
    
    await user.save();
    console.log('✅ Utilisateur mis à jour avec succès');
    
    // Vérifier la mise à jour
    console.log('\n🔍 Vérification de la mise à jour...');
    const userMisAJour = await User.findOne({ email }).select('+motDePasse');
    
    if (userMisAJour) {
      console.log('   - Nouveau hash stocké:', userMisAJour.motDePasse);
      
      // Test final
      const testFinal = await bcrypt.compare(nouveauMotDePasse, userMisAJour.motDePasse);
      console.log('   - Test final réussi:', testFinal);
      
      if (testFinal) {
        console.log('\n🎉 SUCCÈS !');
        console.log('Le mot de passe a été mis à jour avec succès.');
        console.log('\n💡 Identifiants de connexion:');
        console.log(`   Email: ${email}`);
        console.log(`   Mot de passe: ${nouveauMotDePasse}`);
        
        // Tester la méthode peutSeConnecter
        console.log('\n📋 Test de la méthode peutSeConnecter...');
        if (typeof userMisAJour.peutSeConnecter === 'function') {
          const statutAutorise = userMisAJour.peutSeConnecter();
          console.log('   - Résultat peutSeConnecter():', statutAutorise);
          
          if (statutAutorise.autorise) {
            console.log('   - ✅ L\'utilisateur peut se connecter');
          } else {
            console.log('   - ❌ L\'utilisateur ne peut pas se connecter');
            console.log('   - Raison:', statutAutorise.raison);
          }
        }
      } else {
        console.log('\n❌ ÉCHEC: Le nouveau hash ne fonctionne pas');
      }
    }
    
  } catch (error) {
    console.error('❌ Erreur lors de la mise à jour:', error);
  }
};

// Fonction principale
const main = async () => {
  await connectDB();
  await mettreAJourMotDePasse();
  await mongoose.disconnect();
  console.log('\n🔌 Déconnexion de MongoDB');
};

main();

