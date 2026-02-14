/**
 * 🧪 TEST COMPLET - NOTIFICATIONS TRAJETS WAYZ-ECO
 * 
 * Teste toutes les notifications liées aux trajets :
 * ✅ RIDE_STARTED       → Trajet démarré (passagers)
 * ✅ RIDE_STARTED_CONF  → Confirmation conducteur
 * ✅ RIDE_COMPLETED     → Trajet terminé (passagers)
 * ✅ RIDE_COMPLETED_DRV → Confirmation conducteur fin
 * ✅ RIDE_CANCELLED     → Trajet annulé
 * ✅ RESERVATION_CONF   → Réservation confirmée
 * 
 * ▶️  UTILISATION:
 *    node test-notifications-trajets.js
 * 
 * ⚙️  PRÉREQUIS:
 *    - Fichier à la racine du projet
 *    - .env avec FIREBASE_ENABLED=true et MONGODB_URI
 */

require('dotenv').config();
const mongoose = require('mongoose');

// ============================================================
// ⚙️  CONFIG — MODIFIER AVANT DE LANCER
// ============================================================
const CONFIG = {
  // ID d'un passager avec un token FCM valide
  PASSAGER_ID: 'COLLE_ID_PASSAGER_ICI',

  // ID du conducteur (peut être le même compte pour tester)
  CONDUCTEUR_ID: 'COLLE_ID_CONDUCTEUR_ICI',

  // ID d'un trajet existant (optionnel)
  TRAJET_ID: 'COLLE_ID_TRAJET_ICI',

  // Chemin Firebase service (adapter si différent)
  FIREBASE_PATH: './src/services/firebaseService',
  UTILISATEUR_PATH: './src/models/Utilisateur',
};

// ============================================================
// COULEURS CONSOLE
// ============================================================
const C = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
  dim: '\x1b[2m'
};

const ok  = (msg) => console.log(`${C.green}   ✅ ${msg}${C.reset}`);
const err = (msg) => console.log(`${C.red}   ❌ ${msg}${C.reset}`);
const warn = (msg) => console.log(`${C.yellow}   ⚠️  ${msg}${C.reset}`);
const info = (msg) => console.log(`${C.cyan}   ℹ️  ${msg}${C.reset}`);
const title = (msg) => console.log(`\n${C.bold}${C.blue}📋 ${msg}${C.reset}`);
const sep = () => console.log(`${C.dim}${'─'.repeat(55)}${C.reset}`);

// ============================================================
// RÉSULTATS GLOBAUX
// ============================================================
const results = { total: 0, passed: 0, failed: 0, skipped: 0 };

async function runTest(name, fn) {
  results.total++;
  title(name);
  try {
    const skipped = await fn();
    if (skipped === 'SKIP') {
      results.skipped++;
      warn('Test ignoré (config manquante)');
    } else {
      results.passed++;
    }
  } catch (e) {
    results.failed++;
    err(`Exception: ${e.message}`);
  }
  sep();
}

// ============================================================
// TESTS
// ============================================================

async function main() {
  console.log(`\n${C.bold}${'═'.repeat(55)}`);
  console.log('🔔 TEST NOTIFICATIONS TRAJETS — WAYZ-ECO');
  console.log(`${'═'.repeat(55)}${C.reset}\n`);

  // ─── TEST 1 : ENV ──────────────────────────────────────────
  await runTest('TEST 1 : Variables d\'environnement', async () => {
    console.log(`   FIREBASE_ENABLED = ${process.env.FIREBASE_ENABLED}`);
    console.log(`   MONGODB_URI      = ${process.env.MONGODB_URI ? '✅ défini' : '❌ manquant'}`);

    if (process.env.FIREBASE_ENABLED !== 'true') {
      err('FIREBASE_ENABLED !== "true" → Ajoute dans .env');
      throw new Error('Firebase désactivé');
    }
    if (!process.env.MONGODB_URI) {
      err('MONGODB_URI manquant dans .env');
      throw new Error('MongoDB URI manquant');
    }
    ok('Variables OK');
  });

  // ─── TEST 2 : FIREBASE INIT ────────────────────────────────
  let firebaseService, Utilisateur;
  await runTest('TEST 2 : Initialisation Firebase', async () => {
    try {
      firebaseService = require(CONFIG.FIREBASE_PATH);
      ok(`Service chargé depuis: ${CONFIG.FIREBASE_PATH}`);
    } catch (e) {
      // Essayer chemin alternatif
      try {
        firebaseService = require('./services/firebaseService');
        ok('Service chargé depuis: ./services/firebaseService');
      } catch (e2) {
        err(`Impossible de charger Firebase: ${e.message}`);
        err(`Chemin testé: ${CONFIG.FIREBASE_PATH}`);
        info('Modifie FIREBASE_PATH dans la config');
        throw e;
      }
    }

    const stats = firebaseService.getStats();
    console.log(`   Statut: ${stats.sdk}`);
    console.log(`   Activé: ${stats.enabled}`);

    if (!firebaseService.isEnabled()) {
      err('Firebase non initialisé (vérifier serviceAccountKey.json)');
      throw new Error('Firebase non initialisé');
    }
    ok('Firebase prêt');
  });

  // ─── TEST 3 : MONGODB + MODÈLE UTILISATEUR ─────────────────
  await runTest('TEST 3 : Connexion MongoDB + Utilisateur', async () => {
    await mongoose.connect(process.env.MONGODB_URI);
    ok('MongoDB connecté');

    try {
      Utilisateur = require(CONFIG.UTILISATEUR_PATH);
      ok(`Modèle Utilisateur chargé`);
    } catch (e) {
      try {
        Utilisateur = require('./models/Utilisateur');
        ok('Modèle Utilisateur chargé depuis ./models/Utilisateur');
      } catch (e2) {
        err(`Impossible de charger le modèle Utilisateur: ${e.message}`);
        throw e;
      }
    }
  });

  // ─── TEST 4 : VÉRIFIER TOKENS DES UTILISATEURS ─────────────
  await runTest('TEST 4 : Tokens FCM en base', async () => {
    const db = mongoose.connection.db;
    const users = await db.collection('utilisateurs').find(
      { fcmTokens: { $exists: true, $ne: [] } },
      { projection: { nom: 1, prenom: 1, fcmTokens: 1, _id: 1 } }
    ).limit(5).toArray();

    if (users.length === 0) {
      err('Aucun utilisateur avec des tokens FCM');
      info('Les utilisateurs doivent ouvrir l\'app pour enregistrer leurs tokens');
      throw new Error('Pas de tokens FCM');
    }

    ok(`${users.length} utilisateur(s) avec des tokens FCM :`);
    users.forEach(u => {
      const tokensValides = u.fcmTokens.filter(t => t.token && t.actif !== false).length;
      console.log(`   👤 ${u.nom} ${u.prenom} (${u._id}) → ${tokensValides} token(s) actif(s)`);
    });

    // Mettre à jour les IDs de config si non définis
    if (CONFIG.PASSAGER_ID === 'COLLE_ID_PASSAGER_ICI') {
      CONFIG.PASSAGER_ID = users[0]._id.toString();
      warn(`PASSAGER_ID auto-défini: ${CONFIG.PASSAGER_ID}`);
    }
    if (CONFIG.CONDUCTEUR_ID === 'COLLE_ID_CONDUCTEUR_ICI') {
      CONFIG.CONDUCTEUR_ID = users[users.length > 1 ? 1 : 0]._id.toString();
      warn(`CONDUCTEUR_ID auto-défini: ${CONFIG.CONDUCTEUR_ID}`);
    }
  });

  // ─── TEST 5 : NOTIFICATION TRAJET DÉMARRÉ (PASSAGER) ───────
  await runTest('TEST 5 : RIDE_STARTED → Passager', async () => {
    if (!firebaseService || !Utilisateur) return 'SKIP';

    const result = await firebaseService.sendToUser(
      CONFIG.PASSAGER_ID,
      {
        title: '🚗 Trajet démarré !',
        message: 'Le conducteur a démarré le trajet vers Plateau',
        type: 'trajets',
        channelId: 'trajets',
        data: {
          type: 'RIDE_STARTED',
          trajetId: CONFIG.TRAJET_ID !== 'COLLE_ID_TRAJET_ICI' ? CONFIG.TRAJET_ID : 'test-trajet-123',
          screen: 'ActiveTripPassenger'
        }
      },
      Utilisateur
    );

    logResult(result, 'RIDE_STARTED passager');
  });

  // ─── TEST 6 : NOTIFICATION TRAJET DÉMARRÉ (CONDUCTEUR) ─────
  await runTest('TEST 6 : RIDE_STARTED_CONFIRMATION → Conducteur', async () => {
    if (!firebaseService || !Utilisateur) return 'SKIP';

    const result = await firebaseService.sendToUser(
      CONFIG.CONDUCTEUR_ID,
      {
        title: '✅ Trajet démarré',
        message: 'Vous avez 2 passager(s) à bord',
        type: 'trajets',
        channelId: 'trajets',
        data: {
          type: 'RIDE_STARTED_CONFIRMATION',
          trajetId: CONFIG.TRAJET_ID !== 'COLLE_ID_TRAJET_ICI' ? CONFIG.TRAJET_ID : 'test-trajet-123',
          passagersCount: '2',
          screen: 'ActiveTripDriver'
        }
      },
      Utilisateur
    );

    logResult(result, 'RIDE_STARTED_CONFIRMATION conducteur');
  });

  // ─── TEST 7 : NOTIFICATION TRAJET TERMINÉ (PASSAGER) ───────
  await runTest('TEST 7 : RIDE_COMPLETED → Passager', async () => {
    if (!firebaseService || !Utilisateur) return 'SKIP';

    const result = await firebaseService.sendToUser(
      CONFIG.PASSAGER_ID,
      {
        title: '🎉 Trajet terminé !',
        message: 'N\'oubliez pas d\'évaluer votre conducteur',
        type: 'trajets',
        channelId: 'trajets',
        data: {
          type: 'RIDE_COMPLETED',
          trajetId: CONFIG.TRAJET_ID !== 'COLLE_ID_TRAJET_ICI' ? CONFIG.TRAJET_ID : 'test-trajet-123',
          screen: 'TripEvaluation',
          requireEvaluation: 'true'
        }
      },
      Utilisateur
    );

    logResult(result, 'RIDE_COMPLETED passager');
  });

  // ─── TEST 8 : NOTIFICATION TRAJET TERMINÉ (CONDUCTEUR) ─────
  await runTest('TEST 8 : RIDE_COMPLETED_DRIVER → Conducteur', async () => {
    if (!firebaseService || !Utilisateur) return 'SKIP';

    const result = await firebaseService.sendToUser(
      CONFIG.CONDUCTEUR_ID,
      {
        title: '✅ Trajet terminé',
        message: 'Votre trajet avec 2 passager(s) est terminé. N\'oubliez pas de les évaluer !',
        type: 'trajets',
        channelId: 'trajets',
        data: {
          type: 'RIDE_COMPLETED_DRIVER',
          trajetId: CONFIG.TRAJET_ID !== 'COLLE_ID_TRAJET_ICI' ? CONFIG.TRAJET_ID : 'test-trajet-123',
          passagersCount: '2',
          screen: 'TripEvaluation',
          requireEvaluation: 'true'
        }
      },
      Utilisateur
    );

    logResult(result, 'RIDE_COMPLETED_DRIVER conducteur');
  });

  // ─── TEST 9 : NOTIFICATION ANNULATION ──────────────────────
  await runTest('TEST 9 : RIDE_CANCELLED → Passager', async () => {
    if (!firebaseService || !Utilisateur) return 'SKIP';

    const result = await firebaseService.sendToUser(
      CONFIG.PASSAGER_ID,
      {
        title: '⚠️ Trajet annulé',
        message: 'Le trajet vers Plateau a été annulé par le conducteur',
        type: 'reservations',
        channelId: 'reservations',
        data: {
          type: 'RIDE_CANCELLED',
          trajetId: CONFIG.TRAJET_ID !== 'COLLE_ID_TRAJET_ICI' ? CONFIG.TRAJET_ID : 'test-trajet-123',
          screen: 'Home'
        }
      },
      Utilisateur
    );

    logResult(result, 'RIDE_CANCELLED passager');
  });

  // ─── TEST 10 : NOTIFICATION RÉSERVATION CONFIRMÉE ──────────
  await runTest('TEST 10 : RESERVATION_CONFIRMED → Passager', async () => {
    if (!firebaseService || !Utilisateur) return 'SKIP';

    const result = await firebaseService.sendToUser(
      CONFIG.PASSAGER_ID,
      {
        title: '✅ Réservation confirmée',
        message: 'Votre trajet vers Plateau est confirmé',
        type: 'reservations',
        channelId: 'reservations',
        data: {
          type: 'RESERVATION_CONFIRMED',
          trajetId: CONFIG.TRAJET_ID !== 'COLLE_ID_TRAJET_ICI' ? CONFIG.TRAJET_ID : 'test-trajet-123',
          reservationId: 'test-resa-123',
          destination: 'Plateau',
          screen: 'ReservationDetails'
        }
      },
      Utilisateur
    );

    logResult(result, 'RESERVATION_CONFIRMED passager');
  });

  // ─── TEST 11 : ENVOI MULTIPLE (simule demarrerTrajet) ───────
  await runTest('TEST 11 : sendToMultipleUsers → Simulation demarrerTrajet', async () => {
    if (!firebaseService || !Utilisateur) return 'SKIP';

    // Utiliser les deux IDs pour simuler plusieurs passagers
    const passagerIds = [CONFIG.PASSAGER_ID];
    if (CONFIG.CONDUCTEUR_ID !== CONFIG.PASSAGER_ID) {
      passagerIds.push(CONFIG.CONDUCTEUR_ID);
    }

    const result = await firebaseService.sendToMultipleUsers(
      passagerIds,
      {
        title: '🚗 [TEST] Trajet démarré !',
        message: 'Simulation sendToMultipleUsers',
        type: 'trajets',
        channelId: 'trajets',
        data: {
          type: 'RIDE_STARTED',
          trajetId: 'test-multi-123',
          screen: 'ActiveTripPassenger'
        }
      },
      Utilisateur
    );

    console.log(`   Résultats:`);
    console.log(`   - Envoyées   : ${result.successCount}`);
    console.log(`   - Échouées   : ${result.failureCount}`);
    console.log(`   - Désactivées: ${result.disabledCount || 0}`);
    console.log(`   - Sans token : ${result.noTokenCount || 0}`);

    if (result.successCount > 0) {
      ok(`${result.successCount} notification(s) envoyée(s) avec succès`);
    } else {
      err('Aucune notification envoyée');
      throw new Error('sendToMultipleUsers failed');
    }
  });

  // ─── RÉSUMÉ FINAL ──────────────────────────────────────────
  if (mongoose.connection.readyState === 1) {
    await mongoose.disconnect();
  }

  console.log(`\n${C.bold}${'═'.repeat(55)}`);
  console.log('📊 RÉSUMÉ FINAL');
  console.log(`${'═'.repeat(55)}${C.reset}`);
  console.log(`   Total   : ${results.total}`);
  console.log(`${C.green}   Passés  : ${results.passed}${C.reset}`);
  console.log(`${C.red}   Échoués : ${results.failed}${C.reset}`);
  console.log(`${C.yellow}   Ignorés : ${results.skipped}${C.reset}`);

  if (results.failed === 0) {
    console.log(`\n${C.bold}${C.green}🎉 TOUS LES TESTS PASSENT — Notifications opérationnelles !${C.reset}`);
  } else {
    console.log(`\n${C.bold}${C.red}⚠️  ${results.failed} test(s) en échec — Consulter les logs ci-dessus${C.reset}`);
  }

  console.log(`\n${C.dim}💡 Si les notifications n'arrivent pas sur le téléphone :`);
  console.log(`   1. Vérifier que le channelId 'trajets' existe dans l'app Android`);
  console.log(`   2. Vérifier que les notifs sont autorisées sur le téléphone`);
  console.log(`   3. Vérifier que le token FCM est à jour (rouvrir l'app)${C.reset}\n`);
}

// ============================================================
// HELPER : Logger le résultat d'un envoi
// ============================================================
function logResult(result, label) {
  if (result.success) {
    ok(`${label}: ${result.successCount} notification(s) envoyée(s)`);
    if (result.failureCount > 0) {
      warn(`${result.failureCount} token(s) en échec`);
    }
  } else {
    if (result.reason === 'notifications_disabled') {
      warn(`${label}: notifications désactivées pour cet utilisateur`);
      // Pas une erreur bloquante
    } else if (result.error === 'Aucun token FCM disponible') {
      warn(`${label}: utilisateur sans token FCM (doit ouvrir l'app)`);
      // Pas une erreur bloquante
    } else {
      err(`${label}: ${result.error || result.reason || 'Erreur inconnue'}`);
      if (result.error) throw new Error(result.error);
    }
  }
}

// ============================================================
// LANCEMENT
// ============================================================
main().catch(async (e) => {
  console.error(`\n${C.red}💥 Erreur fatale: ${e.message}${C.reset}`);
  if (mongoose.connection.readyState === 1) {
    await mongoose.disconnect();
  }
  process.exit(1);
});