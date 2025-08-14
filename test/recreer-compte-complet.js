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
    
    // Créer le nouvel utilisateur avec le modèle complet
    const nouvelUtilisateur = new User({
      email: email,
      motDePasse: hashedPassword,
      nom: 'Kouakou',
      prenom: 'Marc',
      telephone: '0701020306', // Numéro différent pour éviter les conflits
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
    
    // Tester la méthode peutSeConnecter
    console.log('\n📋 Test de la méthode peutSeConnecter...');
    if (typeof nouvelUtilisateur.peutSeConnecter === 'function') {
      const statutAutorise = nouvelUtilisateur.peutSeConnecter();
      console.log('   - Résultat peutSeConnecter():', statutAutorise);
      
      if (statutAutorise.autorise) {
        console.log('\n🎉 SUCCÈS !');
        console.log('Le compte a été recréé avec succès et peut se connecter.');
        console.log('\n💡 Vous pouvez maintenant vous connecter avec:');
        console.log(`   Email: ${email}`);
        console.log(`   Mot de passe: ${nouveauMotDePasse}`);
      } else {
        console.log('\n⚠️  ATTENTION: Le compte ne peut pas se connecter');
        console.log('   - Raison:', statutAutorise.raison);
        if (statutAutorise.deblocageA) {
          console.log('   - Déblocage à:', statutAutorise.deblocageA);
        }
      }
    } else {
      console.log('\n❌ ERREUR: Méthode peutSeConnecter() non disponible');
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
