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
  motDePasse: String,
  statutCompte: String,
  estVerifie: Boolean,
  emailConfirmeLe: Date,
  tentativesConnexionEchouees: Number,
  derniereTentativeConnexion: Date,
  compteBloqueLe: Date
});

const User = mongoose.model('Utilisateur', userSchema);

// Fonction de test de connexion
const testConnexion = async () => {
  try {
    const email = 'kouakou01marc@gmail.com';
    const motDePasse = 'Test123456'; // Mot de passe utilisé lors de l'inscription
    
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
    console.log('   - Est vérifié:', user.estVerifie);
    console.log('   - Email confirmé le:', user.emailConfirmeLe);
    console.log('   - Tentatives échouées:', user.tentativesConnexionEchouees);
    console.log('   - Dernière tentative:', user.derniereTentativeConnexion);
    console.log('   - Compte bloqué le:', user.compteBloqueLe);
    console.log('   - Mot de passe présent:', !!user.motDePasse);
    
    if (user.motDePasse) {
      console.log('\n🔐 Test de vérification du mot de passe...');
      const isMatch = await bcrypt.compare(motDePasse, user.motDePasse);
      console.log('   - Mot de passe valide:', isMatch);
      
      if (!isMatch) {
        console.log('\n⚠️  Le mot de passe ne correspond pas au hash stocké');
        console.log('   - Hash stocké:', user.motDePasse);
        
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
    const maintenant = new Date();
    
    if (user.statutCompte === 'ACTIF') {
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
        console.log('   - ✅ Compte peut se connecter');
      }
    } else {
      console.log('   - ❌ Compte ne peut pas se connecter (statut:', user.statutCompte, ')');
    }
    
  } catch (error) {
    console.error('❌ Erreur lors du test:', error);
  }
};

// Fonction principale
const main = async () => {
  await connectDB();
  await testConnexion();
  await mongoose.disconnect();
  console.log('\n🔌 Déconnexion de MongoDB');
};

main();
