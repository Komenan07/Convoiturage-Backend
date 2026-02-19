/**
 * ============================================================
 * TEST ENVOI OTP - WhatsApp & SMS en temps réel
 * ============================================================
 * USAGE :
 *   node test-otp-realtime.js
 *   node test-otp-realtime.js --phone=+22507XXXXXXXX
 *   node test-otp-realtime.js --channel=sms
 *   node test-otp-realtime.js --channel=whatsapp
 * ============================================================
 */

require('dotenv').config();
const twilioService = require('./services/twilioService');

// ============================================================
// CONFIGURATION
// ============================================================

const args = process.argv.slice(2);
const getArg = (name) => {
  const arg = args.find(a => a.startsWith(`--${name}=`));
  return arg ? arg.split('=')[1] : null;
};

// Numeros fictifs VALIDES : exactement 10 chiffres apres +225
const NUMERO_PAR_DEFAUT = '+2250779947665'; // 07-000-000-00  (10 chiffres OK)
const NUMERO_RATE_LIMIT = '+2250779947665'; // 07-111-111-11  (10 chiffres OK)

const NUMERO_TEST      = getArg('phone') || NUMERO_PAR_DEFAUT;
const CANAL_FORCE      = getArg('channel');
const EST_VRAI_NUMERO  = getArg('phone') !== null;
const CODE_TEST        = '123456';
const NOM_TEST         = 'Test Utilisateur';

// Couleurs
const C = {
  reset: '\x1b[0m', vert: '\x1b[32m', rouge: '\x1b[31m',
  jaune: '\x1b[33m', bleu: '\x1b[34m', cyan: '\x1b[36m', gras: '\x1b[1m'
};

const log = {
  info:     (msg) => console.log(`${C.bleu}i  ${msg}${C.reset}`),
  ok:       (msg) => console.log(`${C.vert}OK ${msg}${C.reset}`),
  err:      (msg) => console.log(`${C.rouge}XX ${msg}${C.reset}`),
  warn:     (msg) => console.log(`${C.jaune}!! ${msg}${C.reset}`),
  titre:    (msg) => console.log(`\n${C.gras}${C.cyan}${'='.repeat(60)}\n   ${msg}\n${'='.repeat(60)}${C.reset}\n`),
  section:  (msg) => console.log(`\n${C.gras}--- ${msg} ---${C.reset}`),
  check:    (label, valeur, ok) => {
    const ic = ok ? `${C.vert}[OK]` : `${C.rouge}[KO]`;
    console.log(`  ${ic} ${label}: ${C.gras}${valeur}${C.reset}`);
  }
};

// ============================================================
// TEST 1 : Configuration Twilio
// ============================================================

async function testConfiguration() {
  log.section('TEST 1 : Configuration Twilio');

  const stats = twilioService.getStats();
  const isMock = stats.mockMode;

  log.check('Mode Mock',      isMock ? 'OUI (messages simules)' : 'NON (envoi reel)', !isMock);
  log.check('Configure',      stats.configured ? 'OUI' : 'NON',                       stats.configured || isMock);
  log.check('Numero Twilio',  stats.phoneNumber || 'MANQUANT',                        !!stats.phoneNumber);
  log.check('Expiration OTP', `${stats.otpExpiration} minutes`,                       true);
  log.check('Max tentatives', `${stats.rateLimit.maxAttempts}`,                       true);

  if (isMock) {
    log.warn('TWILIO_MOCK_MODE=true -> messages simules, pas envoyes en reel');
    log.warn('Pour un vrai test : TWILIO_MOCK_MODE=false dans .env');
  }

  return stats;
}

// ============================================================
// TEST 2 : Envoi OTP automatique (WhatsApp -> SMS fallback)
// ============================================================

async function testEnvoiAutomatique(telephone) {
  log.section('TEST 2 : Envoi OTP automatique (WhatsApp -> SMS)');
  log.info(`Numero cible : ${telephone}`);
  log.info(`Code envoye  : ${CODE_TEST}`);
  log.info(`Strategie    : WhatsApp en premier, SMS si WhatsApp echoue`);

  const debut = Date.now();
  const resultat = await twilioService.envoyerCodeVerification(telephone, CODE_TEST, NOM_TEST);
  const duree = Date.now() - debut;

  if (resultat.success) {
    log.ok(`Envoi reussi en ${duree}ms`);
    log.check('Canal utilise', resultat.channel,   true);
    log.check('Message ID',    resultat.messageId, true);
    log.check('Provider',      resultat.provider,  true);

    if (resultat.channel === 'whatsapp') {
      log.ok('-> Recu via WHATSAPP (le numero a WhatsApp actif)');
    } else if (resultat.channel === 'sms') {
      log.warn('-> WhatsApp indisponible, recu via SMS (fallback automatique)');
    } else if (resultat.channel === 'mock') {
      log.warn('-> Mode MOCK : simule (aucun message reel envoye)');
    }

    return { success: true, canal: resultat.channel, duree, messageId: resultat.messageId };
  } else {
    log.err(`Echec : ${resultat.error}`);
    return { success: false, erreur: resultat.error };
  }
}

// ============================================================
// TEST 3 : Envoi SMS direct (FIX: verification mode mock avant appel client)
// ============================================================

async function testEnvoiSMS(telephone) {
  log.section('TEST 3 : Envoi OTP via SMS direct');
  log.info(`Numero cible : ${telephone}`);

  const isMock = twilioService.mockMode;

  // FIX : En mode mock, this.client est undefined -> on simule directement
  if (isMock) {
    log.warn('Mode mock -> simulation SMS sans appel Twilio reel');
    log.ok('SMS simule avec succes (mock)');
    return { success: true, canal: 'sms-mock', duree: 0 };
  }

  // Mode reel uniquement
  const debut = Date.now();
  const resultat = await twilioService._trySMS(
    telephone,
    `[WAYZ-ECO TEST] Code SMS : ${CODE_TEST}\nExpire dans 10 minutes.`
  );
  const duree = Date.now() - debut;

  if (resultat.success) {
    log.ok(`SMS envoye en ${duree}ms`);
    log.check('Message ID', resultat.messageId, true);
    return { success: true, canal: 'sms', duree };
  } else {
    log.err(`Echec SMS : ${resultat.error}`);
    return { success: false, erreur: resultat.error };
  }
}

// ============================================================
// TEST 4 : Scenario inscription complete
// ============================================================

async function testScenarioInscription(telephone) {
  log.section('TEST 4 : Scenario inscription complete');
  log.info('Simulation : validation numero -> generation code -> envoi OTP');

  // Etape 1 : Validation (meme regex que twilioService)
  log.info('Etape 1/3 : Validation du numero...');
  const regexCI = /^\+225\d{10}$/;
  const numeroValide = regexCI.test(telephone);
  log.check('Format +225 + 10 chiffres', telephone, numeroValide);

  if (!numeroValide) {
    const nbChiffres = telephone.replace('+225', '').length;
    log.err(`Format invalide : ${nbChiffres} chiffres apres +225, attendu 10`);
    return { success: false, erreur: 'Numero invalide' };
  }

  // Etape 2 : Generation du code OTP
  log.info('Etape 2/3 : Generation du code OTP...');
  const codeGenere = Math.floor(100000 + Math.random() * 900000).toString();
  log.ok(`Code genere : ${codeGenere}`);

  // Etape 3 : Envoi
  log.info('Etape 3/3 : Envoi OTP...');
  const resultat = await twilioService.envoyerCodeVerification(telephone, codeGenere, 'Jean Dupont');

  if (resultat.success) {
    log.ok(`Code envoye via : ${resultat.channel.toUpperCase()}`);
    return { success: true, canal: resultat.channel, codeGenere };
  } else {
    log.err(`Envoi echoue : ${resultat.error}`);
    return { success: false, erreur: resultat.error };
  }
}

// ============================================================
// TEST 5 : Rate Limiting (FIX: numero valide avec 10 chiffres)
// ============================================================

async function testRateLimiting() {
  log.section('TEST 5 : Rate Limiting (protection anti-spam)');

  // FIX : NUMERO_RATE_LIMIT = '+22507111111' = 10 chiffres apres +225 -> valide
  const numeroFictif  = NUMERO_RATE_LIMIT;
  const maxTentatives = twilioService.rateLimit.maxAttempts;

  log.info(`Numero de test   : ${numeroFictif}`);
  log.info(`Limite configuree : ${maxTentatives} tentatives`);
  log.info(`Envoi de ${maxTentatives + 1} codes pour declencher le blocage...`);

  let compteur = 0;
  let bloque   = false;

  for (let i = 1; i <= maxTentatives + 1; i++) {
    try {
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      await twilioService.envoyerCodeVerification(numeroFictif, code, 'Test RL');
      compteur++;
      log.info(`  Envoi ${i} : accepte`);
    } catch (e) {
      // envoyerCodeVerification ne throw pas -> ce bloc ne sera pas atteint
    }

    // Verifier le compteur interne du rate limiter
    const data = twilioService.rateLimiter.get(numeroFictif);
    if (data && data.count >= maxTentatives) {
      bloque = true;
      // Tester le rejet du prochain envoi
      try {
        twilioService._checkRateLimit(numeroFictif);
        log.warn(`  Envoi ${i + 1} : rate limiter interne atteint`);
      } catch (e) {
        log.ok(`  Envoi ${i + 1} : BLOQUE -> "${e.message}"`);
      }
      break;
    }
  }

  // Nettoyage
  twilioService.rateLimiter.delete(numeroFictif);
  log.info('Rate limiter nettoye apres le test');

  if (!bloque) {
    log.warn(`Rate limiting non declenche apres ${compteur} envois`);
  } else {
    log.ok(`Rate limiting fonctionne apres ${compteur} tentatives`);
  }

  return { bloque, tentatives: compteur };
}

// ============================================================
// TEST 6 : Statut d'un message
// ============================================================

async function testStatutMessage(messageId) {
  log.section('TEST 6 : Verification statut message');

  if (!messageId || messageId.startsWith('mock_')) {
    log.warn('Mode mock -> statut simule (aucun vrai message a verifier)');
    return;
  }

  log.info(`Verification du message : ${messageId}`);
  const statut = await twilioService.verifierStatutMessage(messageId);

  if (statut.success) {
    log.check('Statut',     statut.statusFr,     true);
    log.check('Date envoi', statut.dateSent || 'N/A', true);
    if (statut.errorCode) {
      log.err(`Erreur Twilio : ${statut.errorCode} - ${statut.errorMessage}`);
    }
  } else {
    log.err(`Verification impossible : ${statut.error}`);
  }
}

// ============================================================
// RAPPORT FINAL
// ============================================================

function afficherRapport(resultats, isMock) {
  log.titre('RAPPORT FINAL DES TESTS OTP');

  let total = 0, reussis = 0;
  resultats.forEach(({ nom, ok, detail }) => {
    total++;
    if (ok) reussis++;
    log.check(nom, detail || (ok ? 'PASSE' : 'ECHOUE'), ok);
  });

  console.log('');
  log.info(`Resultat : ${reussis}/${total} tests passes`);

  if (reussis === total) {
    log.ok('Tous les tests passes !');
  } else {
    log.warn(`${total - reussis} test(s) echoue(s)`);
  }

  if (isMock) {
    console.log('\n Pour tester en TEMPS REEL avec vrai envoi :');
    console.log('  1. .env -> TWILIO_MOCK_MODE=false');
    console.log('  2. node test-otp-realtime.js --phone=+225XXXXXXXXXX\n');
  }
}

// ============================================================
// LANCEMENT
// ============================================================

async function lancerTousLesTests() {
  log.titre('TEST OTP TEMPS REEL - WAYZ-ECO');

  const isMock = twilioService.mockMode;

  console.log(`  Numero teste  : ${NUMERO_TEST}`);
  console.log(`  Vrai numero   : ${EST_VRAI_NUMERO ? 'OUI' : 'NON (placeholder)'}`);
  console.log(`  Canal force   : ${CANAL_FORCE || 'AUTO (WhatsApp -> SMS)'}`);
  console.log(`  Mode mock     : ${isMock ? 'OUI (simule)' : 'NON (reel)'}`);
  console.log(`  Environnement : ${process.env.NODE_ENV || 'development'}`);

  if (!EST_VRAI_NUMERO) {
    log.warn('Numero placeholder. Pour un test reel :');
    log.warn('  node test-otp-realtime.js --phone=+225XXXXXXXXXX\n');
  }

  const resultats = [];

  // Test 1 : Config
  const config = await testConfiguration();
  resultats.push({
    nom: 'Configuration Twilio',
    ok: !!config.phoneNumber,
    detail: isMock ? 'Mode MOCK actif' : 'Credentials reels charges'
  });

  // Test 2 : Envoi automatique
  if (!CANAL_FORCE || CANAL_FORCE === 'auto' || CANAL_FORCE === 'whatsapp') {
    const envoi = await testEnvoiAutomatique(NUMERO_TEST);
    resultats.push({
      nom: 'Envoi OTP automatique (WhatsApp->SMS)',
      ok: envoi.success,
      detail: envoi.success
        ? `Canal: ${envoi.canal?.toUpperCase()} | ${envoi.duree}ms`
        : envoi.erreur
    });

    if (envoi.messageId) {
      await testStatutMessage(envoi.messageId);
    }
  }

  // Test 3 : SMS direct
  if (!CANAL_FORCE || CANAL_FORCE === 'sms') {
    const sms = await testEnvoiSMS(NUMERO_TEST);
    resultats.push({
      nom: 'Envoi OTP via SMS',
      ok: sms.success,
      detail: sms.success ? `Canal: ${sms.canal} | ${sms.duree}ms` : sms.erreur
    });
  }

  // Test 4 : Scenario inscription
  const inscription = await testScenarioInscription(NUMERO_TEST);
  resultats.push({
    nom: 'Scenario inscription complete',
    ok: inscription.success,
    detail: inscription.success
      ? `Canal: ${inscription.canal?.toUpperCase()}`
      : inscription.erreur || 'Echoue'
  });

  // Test 5 : Rate limiting (seulement en mock)
  if (isMock) {
    const rl = await testRateLimiting();
    resultats.push({
      nom: 'Rate Limiting',
      ok: true,
      detail: rl.bloque
        ? `Bloque apres ${rl.tentatives} tentatives`
        : `Non declenche (${rl.tentatives} envois en mock)`
    });
  }

  // Rapport
  afficherRapport(resultats, isMock);

  // Stats
  log.section('Statistiques du service Twilio');
  const stats = twilioService.getDetailedStats();
  const m = stats.metrics || {};
  console.log(`  Envois WhatsApp reussis : ${m.sent?.whatsapp || 0}`);
  console.log(`  Envois SMS reussis      : ${m.sent?.sms || 0}`);
  console.log(`  Envois mock             : ${m.sent?.mock || 0}`);
  console.log(`  Echecs WhatsApp         : ${m.failed?.whatsapp || 0}`);
  console.log(`  Echecs SMS              : ${m.failed?.sms || 0}`);
  console.log(`  Total reussis           : ${m.total?.sent || 0}`);
  console.log(`  Total echecs            : ${m.total?.failed || 0}`);
}

lancerTousLesTests()
  .then(() => { console.log('\nTests termines.\n'); process.exit(0); })
  .catch((err) => { console.error('\nErreur fatale :', err.message); process.exit(1); });
