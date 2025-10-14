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
      type: {
        type: String,
        enum: ['Point'],
        required: true
      },
      coordinates: {
        type: [Number],
        required: true
      }
    }
  }
});

const User = mongoose.model('Utilisateur', userSchema);

// Fonction pour recréer le compte
const recreerCompte = async () => {
  try {
    const email = 'kouakou01marc@gmail.com';
    
    console.log('\n🔍 Recherche de l\'utilisateur existant...');
    const userExistant = await User.findOne({ email });
    
    if (userExistant) {
      console.log('✅ Utilisateur existant trouvé:');
      console.log('   - ID:', userExistant._id);
      console.log('   - Nom:', userExistant.nom);
      console.log('   - Prénom:', userExistant.prenom);
      console.log('   - Statut:', userExistant.statutCompte);
      
      console.log('\n🗑️  Suppression de l\'utilisateur existant...');
      await User.findByIdAndDelete(userExistant._id);
      console.log('✅ Utilisateur supprimé');
    } else {
      console.log('ℹ️  Aucun utilisateur existant trouvé');
    }
    
    console.log('\n🆕 Création d\'un nouvel utilisateur...');
    
    // Nouveau mot de passe simple et mémorisable
    const nouveauMotDePasse = 'Test123!';
    console.log('   - Nouveau mot de passe:', nouveauMotDePasse);
    
    // Hacher le nouveau mot de passe
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(nouveauMotDePasse, salt);
    console.log('   - Hash généré:', hashedPassword);
    
    // Créer le nouvel utilisateur
    const nouvelUtilisateur = new User({
      email: email,
      motDePasse: hashedPassword,
      nom: 'Kouakou',
      prenom: 'Marc',
      telephone: '0701020305', // Numéro différent pour éviter les conflits
      statutCompte: 'ACTIF',
      role: 'utilisateur',
      estVerifie: true,
      emailConfirmeLe: new Date(),
      tentativesConnexionEchouees: 0,
      derniereTentativeConnexion: null,
      compteBloqueLe: null,
      // Ajouter une adresse complète avec coordonnées valides
      adresse: {
        ville: 'Abidjan',
        commune: 'Cocody',
        quartier: 'Riviera',
        coordonnees: {
          type: 'Point',
          coordinates: [-4.0199, 5.3599] // [longitude, latitude] pour Abidjan
        }
      }
    });
    
    await nouvelUtilisateur.save();
    console.log('✅ Nouvel utilisateur créé avec succès');
    console.log('   - ID:', nouvelUtilisateur._id);
    
    // Vérifier que le mot de passe fonctionne
    console.log('\n🔐 Vérification du nouveau mot de passe...');
    const isMatch = await bcrypt.compare(nouveauMotDePasse, hashedPassword);
    console.log('   - Mot de passe valide:', isMatch);
    
    if (isMatch) {
      console.log('\n🎉 SUCCÈS !');
      console.log('Le compte a été recréé avec succès.');
      console.log('\n💡 Vous pouvez maintenant vous connecter avec:');
      console.log(`   Email: ${email}`);
      console.log(`   Mot de passe: ${nouveauMotDePasse}`);
      
      console.log('\n⚠️  IMPORTANT:');
      console.log('1. Notez bien ce mot de passe');
      console.log('2. Vous devrez confirmer votre email à nouveau');
      console.log('3. Utilisez ces identifiants pour tester la connexion');
    } else {
      console.log('\n❌ ERREUR: Le mot de passe ne fonctionne pas');
    }
    
  } catch (error) {
    console.error('❌ Erreur lors de la recréation du compte:', error);
  }
};

// Fonction principale
const main = async () => {
  await connectDB();
  await recreerCompte();
  await mongoose.disconnect();
  console.log('\n🔌 Déconnexion de MongoDB');
};

main();
