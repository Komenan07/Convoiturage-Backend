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

// Fonction pour recréer le compte
const recreerCompte = async () => {
  try {
    const email = 'smart12center@gmail.com';
    const nouveauMotDePasse = 'Je@nM@rc79';
    
    console.log('\n🔍 Recherche de l\'utilisateur existant...');
    const userExistant = await User.findOne({ email });
    
    if (userExistant) {
      console.log('✅ Utilisateur existant trouvé:');
      console.log('   - ID:', userExistant._id);
      console.log('   - Nom:', userExistant.nom);
      console.log('   - Prénom:', userExistant.prenom);
      console.log('   - Statut compte:', userExistant.statutCompte);
      
      console.log('\n🗑️  Suppression de l\'utilisateur existant...');
      await User.findByIdAndDelete(userExistant._id);
      console.log('✅ Utilisateur supprimé avec succès');
    } else {
      console.log('ℹ️  Aucun utilisateur existant trouvé');
    }
    
    console.log('\n🆕 Création du nouveau compte...');
    
    // Hacher le nouveau mot de passe
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(nouveauMotDePasse, salt);
    console.log('   - Mot de passe haché avec succès');
    
    // Créer le nouvel utilisateur
    const nouvelUtilisateur = new User({
      email: email,
      motDePasse: hashedPassword,
      nom: 'Ouattara',
      prenom: 'Kouadio',
      telephone: '0701020307', // Nouveau numéro pour éviter les conflits
      statutCompte: 'ACTIF',
      role: 'utilisateur',
      estVerifie: true,
      emailConfirmeLe: new Date(),
      tentativesConnexionEchouees: 0,
      derniereTentativeConnexion: null,
      compteBloqueLe: null,
      dateInscription: new Date(),
      derniereConnexion: new Date(),
      scoreConfiance: 50,
      noteGenerale: 0,
      nombreTrajetsEffectues: 0,
      nombreTrajetsAnnules: 0,
      preferences: {
        climatisation: true,
        conversation: 'NEUTRE',
        languePreferee: 'FR',
        musique: true
      },
      badges: [],
      contactsUrgence: [],
      historiqueStatuts: [],
      documentIdentite: {
        statutVerification: 'EN_ATTENTE'
      },
      adresse: {
        coordonnees: {
          type: 'Point',
          coordinates: [-4.0199, 5.3599] // Coordonnées d'Abidjan
        },
        ville: 'Abidjan',
        pays: 'Côte d\'Ivoire'
      }
    });
    
    // Sauvegarder l'utilisateur
    await nouvelUtilisateur.save();
    console.log('✅ Nouvel utilisateur créé avec succès');
    console.log('   - ID:', nouvelUtilisateur._id);
    
    // Vérifier que le mot de passe fonctionne
    console.log('\n🔐 Vérification du nouveau mot de passe...');
    const isMatch = await bcrypt.compare(nouveauMotDePasse, hashedPassword);
    console.log('   - Mot de passe valide:', isMatch);
    
    // Tester la méthode peutSeConnecter
    console.log('\n📋 Test de la méthode peutSeConnecter...');
    if (typeof nouvelUtilisateur.peutSeConnecter === 'function') {
      const statutAutorise = nouvelUtilisateur.peutSeConnecter();
      console.log('   - Résultat peutSeConnecter():', statutAutorise);
      
      if (statutAutorise.autorise) {
        console.log('\n🎉 SUCCÈS !');
        console.log('Le nouvel utilisateur peut se connecter.');
        console.log('\n💡 Identifiants de connexion:');
        console.log(`   Email: ${email}`);
        console.log(`   Mot de passe: ${nouveauMotDePasse}`);
        console.log(`   Téléphone: ${nouvelUtilisateur.telephone}`);
        
        console.log('\n📋 Informations du compte:');
        console.log(`   - Statut: ${nouvelUtilisateur.statutCompte}`);
        console.log(`   - Vérifié: ${nouvelUtilisateur.estVerifie}`);
        console.log(`   - Role: ${nouvelUtilisateur.role}`);
        console.log(`   - Score confiance: ${nouvelUtilisateur.scoreConfiance}`);
        
      } else {
        console.log('\n⚠️  ATTENTION: L\'utilisateur ne peut pas se connecter');
        console.log('   - Raison:', statutAutorise.raison);
      }
    } else {
      console.log('❌ Méthode peutSeConnecter() non disponible');
    }
    
  } catch (error) {
    console.error('❌ Erreur lors de la recréation:', error);
    
    if (error.code === 11000) {
      console.log('\n🔧 ERREUR: Doublon détecté');
      if (error.keyPattern && error.keyPattern.telephone) {
        console.log('   - Le numéro de téléphone est déjà utilisé');
        console.log('   - Solution: Modifiez le numéro de téléphone dans le script');
      } else if (error.keyPattern && error.keyPattern.email) {
        console.log('   - L\'email est déjà utilisé');
        console.log('   - Solution: Supprimez d\'abord l\'ancien utilisateur');
      }
    }
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
