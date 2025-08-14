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

// Fonction pour corriger l'utilisateur
const corrigerUtilisateur = async () => {
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
    console.log('   - Nom:', user.nom);
    console.log('   - Prénom:', user.prenom);
    console.log('   - Statut compte:', user.statutCompte);
    console.log('   - Est vérifié:', user.estVerifie);
    console.log('   - Mot de passe présent:', !!user.motDePasse);
    
    // Vérifier si le mot de passe est manquant
    if (!user.motDePasse) {
      console.log('\n⚠️  MOT DE PASSE MANQUANT - Correction nécessaire');
      
      // Créer un nouveau mot de passe
      const nouveauMotDePasse = 'Je@nM@rc79';
      console.log('   - Nouveau mot de passe:', nouveauMotDePasse);
      
      // Hacher le nouveau mot de passe
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(nouveauMotDePasse, salt);
      console.log('   - Hash généré:', hashedPassword);
      
      // Mettre à jour l'utilisateur
      user.motDePasse = hashedPassword;
      user.estVerifie = true; // Marquer comme vérifié
      user.emailConfirmeLe = new Date(); // Date de confirmation
      user.tentativesConnexionEchouees = 0; // Réinitialiser les tentatives
      user.derniereTentativeConnexion = null;
      user.compteBloqueLe = null;
      
      await user.save();
      console.log('✅ Utilisateur corrigé avec succès');
      
      // Vérifier que le mot de passe fonctionne maintenant
      console.log('\n🔐 Vérification du nouveau mot de passe...');
      const isMatch = await bcrypt.compare(nouveauMotDePasse, hashedPassword);
      console.log('   - Mot de passe valide:', isMatch);
      
      // Tester la méthode peutSeConnecter
      console.log('\n📋 Test de la méthode peutSeConnecter...');
      if (typeof user.peutSeConnecter === 'function') {
        const statutAutorise = user.peutSeConnecter();
        console.log('   - Résultat peutSeConnecter():', statutAutorise);
        
        if (statutAutorise.autorise) {
          console.log('\n🎉 SUCCÈS !');
          console.log('L\'utilisateur peut maintenant se connecter.');
          console.log('\n💡 Identifiants de connexion:');
          console.log(`   Email: ${email}`);
          console.log(`   Mot de passe: ${nouveauMotDePasse}`);
        } else {
          console.log('\n⚠️  ATTENTION: L\'utilisateur ne peut toujours pas se connecter');
          console.log('   - Raison:', statutAutorise.raison);
        }
      }
      
    } else {
      console.log('\n✅ Mot de passe déjà présent');
      console.log('   - Hash:', user.motDePasse);
      
      // Tester le mot de passe existant
      const motDePasse = 'Je@nM@rc79';
      const isMatch = await bcrypt.compare(motDePasse, user.motDePasse);
      console.log('   - Mot de passe valide:', isMatch);
      
      if (!isMatch) {
        console.log('\n⚠️  Le mot de passe ne correspond pas au hash stocké');
        console.log('   - Mot de passe testé:', motDePasse);
      }
    }
    
  } catch (error) {
    console.error('❌ Erreur lors de la correction:', error);
  }
};

// Fonction principale
const main = async () => {
  await connectDB();
  await corrigerUtilisateur();
  await mongoose.disconnect();
  console.log('\n🔌 Déconnexion de MongoDB');
};

main();
