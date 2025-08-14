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

// Fonction pour vérifier le mot de passe
const verifierMotDePasse = async () => {
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
    console.log('   - Statut compte:', user.statutCompte);
    console.log('   - Est vérifié:', user.estVerifie);
    console.log('   - Mot de passe présent:', !!user.motDePasse);
    
    if (user.motDePasse) {
      console.log('\n🔐 Test de vérification du mot de passe...');
      console.log('   - Hash stocké:', user.motDePasse);
      console.log('   - Mot de passe à tester:', motDePasse);
      
      const isMatch = await bcrypt.compare(motDePasse, user.motDePasse);
      console.log('   - Mot de passe valide:', isMatch);
      
      if (isMatch) {
        console.log('\n🎉 SUCCÈS ! Le mot de passe est valide');
        
        // Tester la méthode peutSeConnecter
        console.log('\n📋 Test de la méthode peutSeConnecter...');
        if (typeof user.peutSeConnecter === 'function') {
          const statutAutorise = user.peutSeConnecter();
          console.log('   - Résultat peutSeConnecter():', statutAutorise);
          
          if (statutAutorise.autorise) {
            console.log('   - ✅ L\'utilisateur peut se connecter');
          } else {
            console.log('   - ❌ L\'utilisateur ne peut pas se connecter');
            console.log('   - Raison:', statutAutorise.raison);
          }
        }
      } else {
        console.log('\n❌ Le mot de passe ne correspond pas au hash stocké');
        
        // Test avec un nouveau hash du même mot de passe
        const newHash = await bcrypt.hash(motDePasse, 10);
        console.log('   - Nouveau hash du même mot de passe:', newHash);
        
        // Vérifier si le nouveau hash fonctionne
        const newHashMatch = await bcrypt.compare(motDePasse, newHash);
        console.log('   - Nouveau hash valide:', newHashMatch);
      }
    } else {
      console.log('\n❌ MOT DE PASSE MANQUANT dans la base de données');
      console.log('   - Cela explique pourquoi la connexion échoue');
    }
    
  } catch (error) {
    console.error('❌ Erreur lors de la vérification:', error);
  }
};

// Fonction principale
const main = async () => {
  await connectDB();
  await verifierMotDePasse();
  await mongoose.disconnect();
  console.log('\n🔌 Déconnexion de MongoDB');
};

main();
