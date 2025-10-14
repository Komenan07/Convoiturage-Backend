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

// Modèle Utilisateur complet
const userSchema = new mongoose.Schema({
  email: String,
  motDePasse: String,
  nom: String,
  prenom: String,
  telephone: String,
  statutCompte: String,
  role: String,
  estVerifie: Boolean,
  emailConfirmeLe: Date,
  tentativesConnexionEchouees: Number,
  derniereTentativeConnexion: Date,
  compteBloqueLe: Date,
  adresse: {
    ville: String,
    commune: String,
    quartier: String,
    coordonnees: {
      type: String,
      coordinates: [Number]
    }
  }
});

const User = mongoose.model('Utilisateur', userSchema);

// Fonction pour vérifier le statut
const verifierStatut = async () => {
  try {
    const email = 'kouakou01marc@gmail.com';
    
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
    
    // Vérifier la méthode peutSeConnecter
    console.log('\n📋 Test de la méthode peutSeConnecter...');
    
    if (typeof user.peutSeConnecter === 'function') {
      const statutAutorise = user.peutSeConnecter();
      console.log('   - Résultat peutSeConnecter():', statutAutorise);
    } else {
      console.log('   - ❌ Méthode peutSeConnecter() non trouvée');
    }
    
    // Vérifier manuellement les conditions
    console.log('\n🔍 Analyse manuelle des conditions de connexion...');
    
    const maintenant = new Date();
    console.log('   - Heure actuelle:', maintenant);
    
    // Vérifier le statut du compte
    if (user.statutCompte === 'ACTIF') {
      console.log('   - ✅ Statut compte: ACTIF');
      
      // Vérifier le blocage temporaire
      if (user.compteBloqueLe && user.tentativesConnexionEchouees >= 5) {
        const tempsEcoule = maintenant - user.compteBloqueLe;
        const dureeBloquage = 15 * 60 * 1000; // 15 minutes
        
        console.log('   - Compte temporairement bloqué le:', user.compteBloqueLe);
        console.log('   - Temps écoulé:', Math.ceil(tempsEcoule / 1000 / 60), 'minutes');
        console.log('   - Durée de blocage:', 15, 'minutes');
        
        if (tempsEcoule < dureeBloquage) {
          const tempsRestant = dureeBloquage - tempsEcoule;
          console.log('   - ❌ Compte encore bloqué, temps restant:', Math.ceil(tempsRestant / 1000 / 60), 'minutes');
        } else {
          console.log('   - ✅ Blocage expiré, compte peut se connecter');
        }
      } else {
        console.log('   - ✅ Aucun blocage temporaire');
      }
    } else {
      console.log('   - ❌ Statut compte non autorisé:', user.statutCompte);
    }
    
    // Vérifier la vérification email
    if (user.estVerifie) {
      console.log('   - ✅ Email vérifié');
    } else {
      console.log('   - ❌ Email non vérifié');
    }
    
  } catch (error) {
    console.error('❌ Erreur lors de la vérification:', error);
  }
};

// Fonction principale
const main = async () => {
  await connectDB();
  await verifierStatut();
  await mongoose.disconnect();
  console.log('\n🔌 Déconnexion de MongoDB');
};

main();

