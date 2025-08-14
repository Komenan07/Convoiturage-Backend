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

// Fonction de diagnostic
const diagnostiquerUtilisateur = async () => {
  try {
    const email = 'smart12center@gmail.com';
    const motDePasse = 'Je@nM@rc79';
    
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
    console.log('   - Email confirmé le:', user.emailConfirmeLe);
    console.log('   - Tentatives échouées:', user.tentativesConnexionEchouees);
    console.log('   - Dernière tentative:', user.derniereTentativeConnexion);
    console.log('   - Compte bloqué le:', user.compteBloqueLe);
    console.log('   - Role:', user.role);
    console.log('   - Mot de passe présent:', !!user.motDePasse);
    
    if (user.motDePasse) {
      console.log('\n🔐 Test de vérification du mot de passe...');
      console.log('   - Hash stocké:', user.motDePasse);
      console.log('   - Mot de passe à tester:', motDePasse);
      
      const isMatch = await bcrypt.compare(motDePasse, user.motDePasse);
      console.log('   - Mot de passe valide:', isMatch);
      
      if (!isMatch) {
        console.log('\n⚠️  Le mot de passe ne correspond pas au hash stocké');
        
        // Test avec un nouveau hash du même mot de passe
        const newHash = await bcrypt.hash(motDePasse, 10);
        console.log('   - Nouveau hash du même mot de passe:', newHash);
        
        // Vérifier si le nouveau hash fonctionne
        const newHashMatch = await bcrypt.compare(motDePasse, newHash);
        console.log('   - Nouveau hash valide:', newHashMatch);
      }
    }
    
    // Vérifier le statut de connexion
    console.log('\n📋 Vérification du statut de connexion...');
    if (typeof user.peutSeConnecter === 'function') {
      const statutAutorise = user.peutSeConnecter();
      console.log('   - Résultat peutSeConnecter():', statutAutorise);
      
      if (statutAutorise.autorise) {
        console.log('   - ✅ Compte peut se connecter');
      } else {
        console.log('   - ❌ Compte ne peut pas se connecter');
        console.log('   - Raison:', statutAutorise.raison);
        if (statutAutorise.deblocageA) {
          console.log('   - Déblocage à:', statutAutorise.deblocageA);
        }
      }
    } else {
      console.log('   - ❌ Méthode peutSeConnecter() non disponible');
    }
    
    // Vérifier manuellement les conditions
    console.log('\n🔍 Analyse manuelle des conditions de connexion...');
    const maintenant = new Date();
    
    if (user.statutCompte === 'ACTIF') {
      console.log('   - ✅ Statut compte: ACTIF');
      
      if (user.compteBloqueLe && user.tentativesConnexionEchouees >= 5) {
        const tempsEcoule = maintenant - user.compteBloqueLe;
        const dureeBloquage = 15 * 60 * 1000; // 15 minutes
        
        if (tempsEcoule < dureeBloquage) {
          const tempsRestant = dureeBloquage - tempsEcoule;
          console.log('   - ❌ Compte temporairement bloqué');
          console.log('   - Temps restant:', Math.ceil(tempsRestant / 1000 / 60), 'minutes');
        } else {
          console.log('   - ✅ Compte peut se connecter (blocage expiré)');
        }
      } else {
        console.log('   - ✅ Aucun blocage temporaire');
      }
    } else {
      console.log('   - ❌ Statut compte non autorisé:', user.statutCompte);
    }
    
    if (user.estVerifie) {
      console.log('   - ✅ Email vérifié');
    } else {
      console.log('   - ❌ Email non vérifié');
    }
    
  } catch (error) {
    console.error('❌ Erreur lors du diagnostic:', error);
  }
};

// Fonction principale
const main = async () => {
  await connectDB();
  await diagnostiquerUtilisateur();
  await mongoose.disconnect();
  console.log('\n🔌 Déconnexion de MongoDB');
};

main();
