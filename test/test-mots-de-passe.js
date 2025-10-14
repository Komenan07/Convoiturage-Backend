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

// Modèle Utilisateur simplifié pour le test
const userSchema = new mongoose.Schema({
  email: String,
  motDePasse: String
});

const User = mongoose.model('Utilisateur', userSchema);

// Liste des mots de passe possibles à tester
const motsDePassePossibles = [
  'Test123456',
  'Test123!',
  'Test123',
  'test123456',
  'test123!',
  'test123',
  'Password123',
  'password123',
  'MotDePasse123',
  'motdepasse123',
  'Admin123',
  'admin123',
  'User123',
  'user123',
  'Kouakou123',
  'kouakou123',
  'Marc123',
  'marc123',
  'Abc123!',
  'abc123!',
  '123456789',
  'qwerty123',
  'azerty123'
];

// Fonction de test des mots de passe
const testerMotsDePasse = async () => {
  try {
    const email = 'kouakou01marc@gmail.com';
    
    console.log('\n🔍 Recherche de l\'utilisateur...');
    const user = await User.findOne({ email });
    
    if (!user) {
      console.log('❌ Utilisateur non trouvé');
      return;
    }
    
    console.log('✅ Utilisateur trouvé:');
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
    } else {
      console.log('\n❌ Aucun mot de passe testé ne correspond au hash stocké');
      console.log('\n🔧 SOLUTIONS POSSIBLES:');
      console.log('1. Vérifiez le mot de passe utilisé lors de l\'inscription');
      console.log('2. Le hash peut être corrompu - recréez le compte');
      console.log('3. Vérifiez les logs d\'inscription pour le mot de passe exact');
    }
    
  } catch (error) {
    console.error('❌ Erreur lors du test:', error);
  }
};

// Fonction principale
const main = async () => {
  await connectDB();
  await testerMotsDePasse();
  await mongoose.disconnect();
  console.log('\n🔌 Déconnexion de MongoDB');
};

main();

