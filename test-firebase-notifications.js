/**
 * 🧪 TEST FIREBASE NOTIFICATIONS - WAYZ-ECO
 * 
 * Ce fichier teste toute la chaîne de notifications Firebase
 * sans avoir besoin de passer par l'API complète.
 * 
 * ▶️ UTILISATION:
 *    node test-firebase-notifications.js
 * 
 * ⚙️ PRÉREQUIS:
 *    - Copier ce fichier à la racine de ton projet
 *    - Avoir un .env avec FIREBASE_ENABLED=true
 *    - Avoir un token FCM valide d'un appareil de test
 */

require('dotenv').config();

// ============================================================
// ⚙️ CONFIGURATION - MODIFIER CES VALEURS AVANT DE LANCER
// ============================================================

const CONFIG = {
  // 🔑 Token FCM de l'appareil du passager (récupère-le depuis l'app mobile)
 FCM_TOKEN_TEST: 'cYcllHKETWeFtgCqRpVvsE:APA91bEyHiHkncBOCsPjq6WoHNmRZQh9KDRmerv3pZZsQh2Gz8vYBHJSdsTJwCSjioqlLc2fWZteP-E863vAfFJltT1k-wi9T4AenZScgPFg8q8F2KdzaLE',
  // 🗄️ MongoDB (pour tester avec de vraies données)
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/wayz-eco',

  // 📋 IDs de test (optionnel - pour tester avec de vraies réservations)
  TRAJET_ID_TEST: null,   // ex: '64abc123...'
  PASSAGER_ID_TEST: null, // ex: '64def456...'
};

// ============================================================
// 🧪 TESTS
// ============================================================

async function runTests() {
  console.log('\n========================================');
  console.log('🧪 TEST FIREBASE NOTIFICATIONS - WAYZ-ECO');
  console.log('========================================\n');

  // ----------------------------------------
  // TEST 1 : Firebase est-il activé ?
  // ----------------------------------------
  console.log('📋 TEST 1 : Vérification activation Firebase');
  console.log('   FIREBASE_ENABLED =', process.env.FIREBASE_ENABLED);

  if (process.env.FIREBASE_ENABLED !== 'true') {
    console.log('   ❌ ÉCHEC : FIREBASE_ENABLED n\'est pas "true" dans ton .env');
    console.log('   👉 Ajoute FIREBASE_ENABLED=true dans ton fichier .env\n');
  } else {
    console.log('   ✅ OK : Firebase est activé\n');
  }

  // ----------------------------------------
  // TEST 2 : Initialisation du service Firebase
  // ----------------------------------------
  console.log('📋 TEST 2 : Chargement du service Firebase');
  let firebaseService;
  try {
    firebaseService = require('./services/firebaseService');
    console.log('   ✅ OK : Service chargé');
    console.log('   📊 Stats:', firebaseService.getStats(), '\n');
  } catch (error) {
    console.log('   ❌ ÉCHEC : Impossible de charger firebaseService');
    console.log('   📍 Erreur:', error.message);
    console.log('   👉 Vérifie le chemin vers firebaseService.js\n');
    process.exit(1);
  }

  // ----------------------------------------
  // TEST 3 : Envoi d'une notification directe
  // ----------------------------------------
  console.log('📋 TEST 3 : Envoi notification directe (sendToToken)');

  if (CONFIG.FCM_TOKEN_TEST === 'COLLE_ICI_LE_TOKEN_FCM_DU_PASSAGER') {
    console.log('   ⚠️  IGNORÉ : Remplace FCM_TOKEN_TEST dans la config en haut du fichier\n');
  } else {
    try {
      const result = await firebaseService.sendToToken(
        CONFIG.FCM_TOKEN_TEST,
        {
          title: '🧪 Test notification',
          message: 'Si tu vois ce message, Firebase fonctionne !',
          channelId: 'trajets',
          data: {
            type: 'TEST',
            screen: 'Home'
          }
        }
      );

      if (result.success) {
        console.log('   ✅ OK : Notification envoyée avec succès');
        console.log('   📨 Message ID:', result.messageId, '\n');
      } else {
        console.log('   ❌ ÉCHEC :', result.error);
        console.log('   💡 Code erreur:', result.code);
        if (result.isInvalidToken) {
          console.log('   👉 Le token FCM est invalide ou expiré');
          console.log('      Récupère un nouveau token depuis l\'app mobile\n');
        }
      }
    } catch (error) {
      console.log('   ❌ EXCEPTION :', error.message, '\n');
    }
  }

  // ----------------------------------------
  // TEST 4 : Envoi multiple (comme demarrerTrajet)
  // ----------------------------------------
  console.log('📋 TEST 4 : Envoi multiple (sendToMultipleTokens) - simule demarrerTrajet');

  if (CONFIG.FCM_TOKEN_TEST === 'COLLE_ICI_LE_TOKEN_FCM_DU_PASSAGER') {
    console.log('   ⚠️  IGNORÉ : Remplace FCM_TOKEN_TEST dans la config\n');
  } else {
    try {
      const result = await firebaseService.sendToMultipleTokens(
        [CONFIG.FCM_TOKEN_TEST],
        {
          title: 'Trajet démarré ! 🚗',
          message: 'Le conducteur a démarré le trajet vers Plateau',
          channelId: 'trajets',
          data: {
            type: 'RIDE_STARTED',
            trajetId: 'test-trajet-id',
            reservationId: 'test-reservation-id',
            screen: 'ActiveTripPassenger'
          }
        }
      );

      if (result.success) {
        console.log('   ✅ OK : Notification "Trajet démarré" envoyée');
        console.log(`   📊 Succès: ${result.successCount} | Échecs: ${result.failureCount}`);
        if (result.invalidTokens?.length > 0) {
          console.log('   ⚠️  Tokens invalides détectés:', result.invalidTokens.length);
        }
        console.log();
      } else {
        console.log('   ❌ ÉCHEC :', result.error, '\n');
      }
    } catch (error) {
      console.log('   ❌ EXCEPTION :', error.message, '\n');
    }
  }

  // ----------------------------------------
  // TEST 5 : Simulation complète avec MongoDB
  // ----------------------------------------
  console.log('📋 TEST 5 : Simulation complète avec MongoDB (optionnel)');

  if (!CONFIG.TRAJET_ID_TEST || !CONFIG.PASSAGER_ID_TEST) {
    console.log('   ⚠️  IGNORÉ : Renseigne TRAJET_ID_TEST et PASSAGER_ID_TEST dans la config\n');
  } else {
    const mongoose = require('mongoose');
    try {
      await mongoose.connect(CONFIG.MONGODB_URI);
      console.log('   ✅ MongoDB connecté');

      const Reservation = require('./src/models/Reservation');

      // Chercher les réservations confirmées du trajet
      const reservations = await Reservation.find({
        trajetId: CONFIG.TRAJET_ID_TEST,
        statutReservation: 'CONFIRMEE'
      }).populate('passagerId', 'fcmTokens nom prenom');

      console.log(`   📋 Réservations CONFIRMEE trouvées: ${reservations.length}`);

      if (reservations.length === 0) {
        console.log('   ⚠️  Aucune réservation CONFIRMEE pour ce trajet');
        console.log('   👉 Vérifie le TRAJET_ID_TEST ou le statut des réservations\n');
      } else {
        for (const res of reservations) {
          const passager = res.passagerId;
          console.log(`\n   👤 Passager: ${passager?.nom} ${passager?.prenom}`);
          console.log(`   📱 Tokens FCM: ${passager?.fcmTokens?.length || 0}`);

          if (!passager?.fcmTokens?.length) {
            console.log('   ❌ Aucun token FCM → notification impossible');
            console.log('   👉 Le passager doit ouvrir l\'app pour enregistrer son token');
          } else {
            // Envoyer la vraie notification
            const result = await firebaseService.sendToMultipleTokens(
              passager.fcmTokens,
              {
                title: 'Trajet démarré ! 🚗',
                message: 'Le conducteur a démarré le trajet',
                channelId: 'trajets',
                data: {
                  type: 'RIDE_STARTED',
                  trajetId: CONFIG.TRAJET_ID_TEST,
                  reservationId: res._id.toString(),
                  screen: 'ActiveTripPassenger'
                }
              }
            );

            if (result.success) {
              console.log(`   ✅ Notification envoyée ! (${result.successCount} succès)`);
            } else {
              console.log('   ❌ Échec envoi:', result.error);
            }
          }
        }
        console.log();
      }

      await mongoose.disconnect();
    } catch (error) {
      console.log('   ❌ ERREUR MongoDB:', error.message, '\n');
    }
  }

  // ----------------------------------------
  // RÉSUMÉ
  // ----------------------------------------
  console.log('========================================');
  console.log('📊 RÉSUMÉ DU DIAGNOSTIC\n');
  console.log('Si les tests 3 et 4 passent ✅ → Firebase fonctionne côté serveur');
  console.log('Si la notif n\'arrive pas sur le téléphone → problème côté app mobile :');
  console.log('  • Vérifier que le channelId "trajets" existe dans l\'app Android');
  console.log('  • Vérifier que les notifications sont autorisées sur le téléphone');
  console.log('  • Vérifier que le token FCM est bien enregistré au login\n');
  console.log('Si le test 5 montre "0 tokens" → le passager doit rouvrir l\'app');
  console.log('========================================\n');
}

// Lancer les tests
runTests().catch(console.error);