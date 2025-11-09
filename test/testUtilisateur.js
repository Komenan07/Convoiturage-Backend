const mongoose = require('mongoose');

// ⚙️ CONFIGURATION
const MONGODB_URI = 'mongodb://localhost:27017/covoiturage';

const userSchema = new mongoose.Schema({}, { strict: false, collection: 'utilisateurs' });
const User = mongoose.model('User', userSchema);

async function fixUserStatus() {
  try {
    console.log('🔌 Connexion à MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connecté à MongoDB\n');

    // Trouver l'utilisateur
    const user = await User.findOne({ email: 'kouakou01marc@gmail.com' });
    
    if (!user) {
      console.log('❌ Utilisateur non trouvé!');
      return;
    }

    console.log('📋 AVANT MISE À JOUR:');
    console.log(`statutCompte: ${user.statutCompte || 'undefined'}`);
    console.log(`estVerifie: ${user.estVerifie || false}`);
    console.log(`whatsappVerifie: ${user.whatsappVerifie || false}`);
    console.log(`tentativesConnexionEchouees: ${user.tentativesConnexionEchouees || 0}`);
    console.log(`compteBloqueLe: ${user.compteBloqueLe || 'null'}`);
    console.log(`role: ${user.role || 'undefined'}`);
    console.log(`badges: ${user.badges || 'undefined'}\n`);

    // Mettre à jour tous les champs nécessaires
    console.log('🔧 Mise à jour des champs...\n');
    
    const updateData = {
      statutCompte: 'ACTIF',
      estVerifie: true,
      whatsappVerifie: true,
      tentativesConnexionEchouees: 0,
      compteBloqueLe: null,
      role: user.role || 'conducteur',
      badges: user.badges || ['NOUVEAU'],
      dateInscription: user.dateInscription || new Date(),
      derniereConnexion: new Date(),
      scoreConfiance: user.scoreConfiance || 50,
      nombreTrajetsEffectues: user.nombreTrajetsEffectues || 0,
      nombreTrajetsAnnules: user.nombreTrajetsAnnules || 0,
      noteGenerale: user.noteGenerale || 0,
      
      // S'assurer que compteCovoiturage existe
      compteCovoiturage: user.compteCovoiturage || {
        solde: 0,
        estRecharge: false,
        seuilMinimum: 0,
        historiqueRecharges: [],
        totalCommissionsPayees: 0,
        totalGagnes: 0,
        modeAutoRecharge: {
          active: false
        },
        historiqueCommissions: [],
        parametresRetrait: {},
        limites: {
          retraitJournalier: 1000000,
          retraitMensuel: 5000000,
          montantRetireAujourdhui: 0,
          montantRetireCeMois: 0
        }
      },
      
      // Adresse par défaut si manquante
      adresse: user.adresse || {
        ville: 'Abidjan',
        commune: 'Marcory',
        coordonnees: {
          type: 'Point',
          coordinates: [-4.0305, 5.3598]
        }
      },
      
      // Préférences par défaut
      preferences: user.preferences || {
        musique: true,
        climatisation: true,
        conversation: 'NEUTRE',
        languePreferee: 'FR'
      }
    };

    await User.updateOne(
      { email: 'kouakou01marc@gmail.com' },
      { $set: updateData }
    );

    console.log('✅ Utilisateur mis à jour!\n');

    // Vérifier la mise à jour
    const updatedUser = await User.findOne({ email: 'kouakou01marc@gmail.com' });
    
    console.log('📋 APRÈS MISE À JOUR:');
    console.log(`statutCompte: ${updatedUser.statutCompte}`);
    console.log(`estVerifie: ${updatedUser.estVerifie}`);
    console.log(`whatsappVerifie: ${updatedUser.whatsappVerifie}`);
    console.log(`tentativesConnexionEchouees: ${updatedUser.tentativesConnexionEchouees}`);
    console.log(`compteBloqueLe: ${updatedUser.compteBloqueLe || 'null'}`);
    console.log(`role: ${updatedUser.role}`);
    console.log(`badges: ${JSON.stringify(updatedUser.badges)}\n`);

    console.log('═══════════════════════════════════════');
    console.log('🎉 TOUT EST PRÊT !');
    console.log('═══════════════════════════════════════');
    console.log('Testez maintenant la connexion:');
    console.log('Email: kouakou01marc@gmail.com');
    console.log('Mot de passe: Je@nM@rc79');
    console.log('═══════════════════════════════════════\n');

  } catch (error) {
    console.error('❌ Erreur:', error.message);
    console.error(error.stack);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Déconnecté de MongoDB');
  }
}

fixUserStatus();