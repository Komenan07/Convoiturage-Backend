// ============================================
// SCRIPT DE DIAGNOSTIC TWILIO
// ============================================
// Utilisez ce script pour identifier rapidement
// les problèmes avec votre configuration Twilio

require('dotenv').config();
const twilio = require('twilio');

// Couleurs pour les logs
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m'
};

function log(color, symbol, message) {
  console.log(`${colors[color]}${symbol} ${message}${colors.reset}`);
}

function section(title) {
  console.log('\n' + '='.repeat(50));
  console.log(`${colors.blue}${title}${colors.reset}`);
  console.log('='.repeat(50));
}

async function testTwilioConfiguration() {
  section('🔍 DIAGNOSTIC TWILIO');

  // ========== ÉTAPE 1: Variables d'environnement ==========
  section('1️⃣ Vérification des variables d\'environnement');

  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const phoneNumber = process.env.TWILIO_PHONE_NUMBER;
  const whatsappFrom = process.env.TWILIO_WHATSAPP_FROM;
  const mockMode = process.env.TWILIO_MOCK_MODE === 'true';

  // Vérifier Account SID
  if (!accountSid) {
    log('red', '❌', 'TWILIO_ACCOUNT_SID manquant dans .env');
  } else if (!accountSid.startsWith('AC')) {
    log('red', '❌', `TWILIO_ACCOUNT_SID invalide: doit commencer par 'AC', trouvé: ${accountSid.substring(0, 5)}...`);
  } else {
    log('green', '✅', `TWILIO_ACCOUNT_SID: ${accountSid.substring(0, 10)}...`);
  }

  // Vérifier Auth Token
  if (!authToken) {
    log('red', '❌', 'TWILIO_AUTH_TOKEN manquant dans .env');
  } else if (authToken.length !== 32) {
    log('red', '❌', `TWILIO_AUTH_TOKEN invalide: doit faire 32 caractères, trouvé: ${authToken.length}`);
  } else {
    log('green', '✅', `TWILIO_AUTH_TOKEN: ${'*'.repeat(32)} (32 caractères)`);
  }

  // Vérifier Phone Number
  if (!phoneNumber) {
    log('red', '❌', 'TWILIO_PHONE_NUMBER manquant dans .env');
  } else if (!phoneNumber.startsWith('+')) {
    log('red', '❌', `TWILIO_PHONE_NUMBER invalide: doit commencer par '+', trouvé: ${phoneNumber}`);
  } else {
    log('green', '✅', `TWILIO_PHONE_NUMBER: ${phoneNumber}`);
  }

  // Vérifier WhatsApp From
  if (!whatsappFrom) {
    log('yellow', '⚠️', 'TWILIO_WHATSAPP_FROM manquant (optionnel)');
  } else if (!whatsappFrom.startsWith('whatsapp:')) {
    log('red', '❌', `TWILIO_WHATSAPP_FROM invalide: doit commencer par 'whatsapp:', trouvé: ${whatsappFrom}`);
  } else {
    log('green', '✅', `TWILIO_WHATSAPP_FROM: ${whatsappFrom}`);
  }

  // Mode MOCK
  if (mockMode) {
    log('yellow', '🧪', 'MODE MOCK activé - Les messages ne seront pas réellement envoyés');
  }

  // Si des variables critiques manquent, arrêter
  if (!accountSid || !authToken || !phoneNumber) {
    log('red', '🚨', '\nImpossible de continuer: variables critiques manquantes');
    log('yellow', '💡', 'Ajoutez ces variables dans votre fichier .env:');
    console.log(`
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_PHONE_NUMBER=+1234567890
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
    `);
    process.exit(1);
  }

  // ========== ÉTAPE 2: Connexion à Twilio ==========
  section('2️⃣ Test de connexion à Twilio');

  let client;
  try {
    client = twilio(accountSid, authToken);
    log('green', '✅', 'Client Twilio initialisé');
  } catch (error) {
    log('red', '❌', `Impossible de créer le client Twilio: ${error.message}`);
    process.exit(1);
  }

  // ========== ÉTAPE 3: Informations du compte ==========
  section('3️⃣ Informations du compte Twilio');

  try {
    const account = await client.api.accounts(accountSid).fetch();
    
    log('blue', '📋', `Nom du compte: ${account.friendlyName}`);
    log('blue', '📋', `Type: ${account.type}`);
    log('blue', '📋', `Status: ${account.status}`);
    
    if (account.type === 'Trial') {
      log('yellow', '⚠️', 'COMPTE TRIAL détecté');
      log('yellow', '💡', 'Restrictions en mode Trial:');
      console.log('   - Vous ne pouvez envoyer qu\'aux numéros vérifiés');
      console.log('   - WhatsApp nécessite un compte payant');
      console.log('   - Maximum 500 messages/mois');
      console.log('   - Vérifiez vos numéros sur: https://console.twilio.com/us1/develop/phone-numbers/manage/verified');
    } else {
      log('green', '✅', 'Compte PAYANT - Toutes fonctionnalités disponibles');
    }
  } catch (error) {
    log('red', '❌', `Impossible de récupérer les infos du compte: ${error.message}`);
    if (error.code === 20003) {
      log('red', '🔑', 'Erreur d\'authentification - Vérifiez votre Account SID et Auth Token');
    }
  }

  // ========== ÉTAPE 4: Vérifier les numéros disponibles ==========
  section('4️⃣ Numéros de téléphone configurés');

  try {
    const incomingNumbers = await client.incomingPhoneNumbers.list({ limit: 20 });
    
    if (incomingNumbers.length === 0) {
      log('yellow', '⚠️', 'Aucun numéro de téléphone trouvé');
      log('yellow', '💡', 'Achetez un numéro sur: https://console.twilio.com/us1/develop/phone-numbers/manage/search');
    } else {
      log('green', '✅', `${incomingNumbers.length} numéro(s) trouvé(s):`);
      incomingNumbers.forEach(num => {
        console.log(`   📞 ${num.phoneNumber} (${num.friendlyName})`);
        
        // Vérifier si c'est le numéro configuré
        if (num.phoneNumber === phoneNumber) {
          log('green', '   ✅', 'Ce numéro correspond à TWILIO_PHONE_NUMBER');
        }
      });

      // Vérifier si le numéro configuré existe
      const configuredNumberExists = incomingNumbers.some(num => num.phoneNumber === phoneNumber);
      if (!configuredNumberExists) {
        log('red', '❌', `Le numéro configuré (${phoneNumber}) n'existe pas dans votre compte`);
      }
    }
  } catch (error) {
    log('red', '❌', `Impossible de récupérer les numéros: ${error.message}`);
  }

  // ========== ÉTAPE 5: Test de normalisation téléphone CI ==========
  section('5️⃣ Test de normalisation des numéros CI');

  function normaliserTelephoneCI(tel) {
    if (!tel) return null;
    let telClean = tel.trim().replace(/[\s\-().]/g, '');
    
    if (telClean.startsWith('+225')) {
      return telClean.length === 13 ? telClean : null;
    }
    if (telClean.startsWith('00225')) {
      telClean = '+' + telClean.substring(2);
      return telClean.length === 13 ? telClean : null;
    }
    if (telClean.startsWith('225') && telClean.length === 12) {
      return '+' + telClean;
    }
    if (telClean.startsWith('0') && telClean.length === 10) {
      return '+225' + telClean.substring(1);
    }
    if (/^\d{10}$/.test(telClean)) {
      return '+225' + telClean;
    }
    if (/^\d{9}$/.test(telClean)) {
      return '+2250' + telClean;
    }
    if (telClean.length === 8 && /^\d{8}$/.test(telClean)) {
      return '+22507' + telClean;
    }
    return null;
  }

  const testNumbers = [
    '07 12 34 56 78',
    '0712345678',
    '712345678',
    '+225 07 12 34 56 78',
    '225 07 12 34 56 78',
    '00225 07 12 34 56 78',
    '05 12 34 56 78', // MTN
    '01 12 34 56 78', // Moov
  ];

  log('blue', '📋', 'Tests de normalisation:');
  testNumbers.forEach(num => {
    const normalized = normaliserTelephoneCI(num);
    if (normalized) {
      console.log(`   ${num.padEnd(25)} → ${normalized}`);
    } else {
      console.log(`   ${num.padEnd(25)} → ❌ INVALIDE`);
    }
  });

  // ========== ÉTAPE 6: Test d'envoi SMS (optionnel) ==========
  section('6️⃣ Test d\'envoi SMS (optionnel)');

  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  });

  readline.question('\nVoulez-vous tester l\'envoi d\'un SMS? (o/n): ', async (answer) => {
    if (answer.toLowerCase() === 'o') {
      readline.question('Entrez le numéro de destination (format: +225XXXXXXXXXX): ', async (destNumber) => {
        log('blue', '📤', 'Tentative d\'envoi SMS...');
        
        try {
          const message = await client.messages.create({
            body: 'Test SMS depuis le script de diagnostic Twilio',
            from: phoneNumber,
            to: destNumber
          });

          log('green', '✅', `SMS envoyé avec succès!`);
          log('green', '📨', `SID: ${message.sid}`);
          log('green', '📊', `Status: ${message.status}`);
          log('green', '💰', `Prix: ${message.price || 'N/A'} ${message.priceUnit || ''}`);
        } catch (error) {
          log('red', '❌', `Erreur d'envoi SMS:`);
          log('red', '📛', `Code: ${error.code}`);
          log('red', '💬', `Message: ${error.message}`);
          
          // Diagnostic selon le code d'erreur
          if (error.code === 21211) {
            log('yellow', '💡', 'Le numéro de destination est invalide');
            log('yellow', '💡', 'Format attendu: +225XXXXXXXXXX');
          } else if (error.code === 21408) {
            log('yellow', '💡', 'Numéro non vérifié (compte Trial)');
            log('yellow', '💡', 'Vérifiez-le sur: https://console.twilio.com/us1/develop/phone-numbers/manage/verified');
          } else if (error.code === 20003) {
            log('yellow', '💡', 'Erreur d\'authentification');
            log('yellow', '💡', 'Vérifiez TWILIO_ACCOUNT_SID et TWILIO_AUTH_TOKEN');
          } else {
            log('yellow', '💡', `Plus d'infos: ${error.moreInfo || 'N/A'}`);
          }
        }

        readline.close();
        section('✅ Diagnostic terminé');
      });
    } else {
      readline.close();
      section('✅ Diagnostic terminé');
    }
  });
}

// Exécuter le diagnostic
testTwilioConfiguration().catch(error => {
  console.error('\n🚨 Erreur fatale:', error);
  process.exit(1);
});