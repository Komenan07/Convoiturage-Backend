// createExpiredTrip.js
const mongoose = require('mongoose');
const connectDB = require('./config/db'); // ⭐ Utiliser votre config
const Trajet = require('./models/Trajet');

async function createExpiredTrip() {
  try {
    // Utiliser votre méthode de connexion existante
    await connectDB();
    console.log('✅ Connexion MongoDB établie');

    // Créer 3 trajets avec dates passées
    console.log('📅 Création de trajets de test avec dates passées...\n');
    
    for (let i = 1; i <= 3; i++) {
      const datePassee = new Date();
      datePassee.setDate(datePassee.getDate() - i); // i jours dans le passé
      datePassee.setHours(8, 0, 0, 0);

      const trajet = new Trajet({
        conducteurId: '692d6dab1bbed9b90bd2e547',
        pointDepart: {
          nom: `Test Expiré ${i}`,
          adresse: `${i} Rue Test, Cocody`,
          commune: 'Cocody',
          quartier: 'Riviera',
          coordonnees: {
            type: 'Point',
            coordinates: [-4.0083, 5.36]
          }
        },
        pointArrivee: {
          nom: `Destination Test ${i}`,
          adresse: `${i} Avenue Test, Plateau`,
          commune: 'Plateau',
          quartier: 'Centre',
          coordonnees: {
            type: 'Point',
            coordinates: [-4.0267, 5.3198]
          }
        },
        dateDepart: datePassee,
        heureDepart: '08:00',
        distance: 10,
        dureeEstimee: 20,
        heureArriveePrevue: '08:20',
        prixParPassager: 1000,
        nombrePlacesDisponibles: 2,
        nombrePlacesTotal: 4,
        typeTrajet: 'PONCTUEL',
        vehiculeUtilise: {
          marque: 'Toyota',
          modele: `Corolla-Test-${i}`,
          couleur: 'Rouge',
          immatriculation: `TST-${i}23-CI`,
          nombrePlaces: 4
        },
        preferences: {
          accepteFemmesSeulement: false,
          accepteHommesSeulement: false,
          accepteBagages: true,
          typeBagages: 'MOYEN',
          musique: true,
          conversation: 'LIBRE',
          fumeur: false,
          animauxAcceptes: false,
          climatisationActive: true
        },
        statutTrajet: 'PROGRAMME' // Important : PROGRAMME pour que le job le marque comme EXPIRE
      });

      await trajet.save();
      console.log(`✅ Trajet ${i} créé:`);
      console.log(`   ID: ${trajet._id}`);
      console.log(`   Date: ${datePassee.toLocaleDateString()} (il y a ${i} jour(s))`);
      console.log(`   Statut: ${trajet.statutTrajet}\n`);
    }

    console.log('✅ 3 trajets de test créés avec succès !');
    console.log('\n🧪 Pour tester, appelez:');
    console.log('   GET http://localhost:3000/api/trajets/expirer');
    console.log('\n💡 Le job devrait automatiquement marquer ces trajets comme EXPIRE');
    
    await mongoose.disconnect();
    console.log('\n✅ Déconnexion MongoDB');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Erreur:', error.message);
    if (error.errors) {
      Object.keys(error.errors).forEach(key => {
        console.error(`   ${key}: ${error.errors[key].message}`);
      });
    }
    process.exit(1);
  }
}

createExpiredTrip();