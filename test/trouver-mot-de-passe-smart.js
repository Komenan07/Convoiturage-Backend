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

// Liste des mots de passe possibles à tester
const motsDePassePossibles = [
  'Je@nM@rc79',
  'JeanMarc79',
  'jeanmarc79',
  'Jean@Marc79',
  'JeanMarc@79',
  'jean@marc79',
  'JEANMARC79',
  'JeanMarc1979',
  'jeanmarc1979',
  'Jean@Marc1979',
  'JeanMarc@1979',
  'jean@marc1979',
  'JEANMARC1979',
  'Ouattara79',
  'ouattara79',
  'OUATTARA79',
  'Ouattara1979',
  'ouattara1979',
  'OUATTARA1979',
  'Kouadio79',
  'kouadio79',
  'KOUADIO79',
  'Kouadio1979',
  'kouadio1979',
  'KOUADIO1979',
  'Smart12',
  'smart12',
  'SMART12',
  'Smart123',
  'smart123',
  'SMART123',
  'Center12',
  'center12',
  'CENTER12',
  'Center123',
  'center123',
  'CENTER123',
  'SmartCenter12',
  'smartcenter12',
  'SMARTCENTER12',
  'SmartCenter123',
  'smartcenter123',
  'SMARTCENTER123',
  'Password123',
  'password123',
  'PASSWORD123',
  'Test123',
  'test123',
  'TEST123',
  'Admin123',
  'admin123',
  'ADMIN123',
  'User123',
  'user123',
  'USER123',
  'Abc123!',
  'abc123!',
  'ABC123!',
  '123456789',
  'qwerty123',
  'azerty123'
];

// Fonction pour trouver le mot de passe
const trouverMotDePasse = async () => {
  try {
    const email = 'smart12center@gmail.com';
    
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
    
    console.log('\n🔐 Test des mots de passe possibles...');
    console.log('=' .repeat(60));
    
    let motDePasseTrouve = null;
    
    for (const motDePasse of motsDePassePossibles) {
      try {
        const isMatch = await bcrypt.compare(motDePasse, user.motDePasse);
        
        if (isMatch) {
          console.log(`✅ MOT DE PASSE TROUVÉ: "${motDePasse}"`);
          motDePasseTrouve = motDePasse;
          break;
        } else {
          console.log(`❌ "${motDePasse}" - Incorrect`);
        }
      } catch (error) {
        console.log(`⚠️  "${motDePasse}" - Erreur de test:`, error.message);
      }
    }
    
    if (motDePasseTrouve) {
      console.log('\n🎉 SUCCÈS !');
      console.log(`Le mot de passe correct est: "${motDePasseTrouve}"`);
      console.log('\n💡 Vous pouvez maintenant vous connecter avec:');
      console.log(`   Email: ${email}`);
      console.log(`   Mot de passe: ${motDePasseTrouve}`);
      
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
      console.log('\n❌ Aucun mot de passe testé ne correspond au hash stocké');
      console.log('\n🔧 SOLUTIONS POSSIBLES:');
      console.log('1. Vérifiez le mot de passe utilisé lors de l\'inscription');
      console.log('2. Le hash peut être corrompu - recréez le compte');
      console.log('3. Vérifiez les logs d\'inscription pour le mot de passe exact');
      console.log('4. Le mot de passe peut contenir des caractères spéciaux non testés');
    }
    
  } catch (error) {
    console.error('❌ Erreur lors de la recherche:', error);
  }
};

// Fonction principale
const main = async () => {
  await connectDB();
  await trouverMotDePasse();
  await mongoose.disconnect();
  console.log('\n🔌 Déconnexion de MongoDB');
};

main();
