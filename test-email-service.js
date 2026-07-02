/**
 * TEST - Vérification du service email
 * 
 * Comment l'utiliser :
 * 1. Copie ce fichier à la racine de ton projet
 * 2. Lance : node test-email-service.js
 */

console.log('🔍 Test du service emailService...\n');

// ── 1. Tester l'import ────────────────────────────────────────
const emailModule = require('./utils/emailService');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('1️⃣  TYPE de l\'export par défaut :');
console.log('   typeof emailModule :', typeof emailModule);
console.log('   emailModule :', emailModule);

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('2️⃣  CLÉS disponibles sur emailModule :');
console.log('   Object.keys :', Object.keys(emailModule));

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('3️⃣  Formes d\'accès possibles :');
console.log('   emailModule.envoyerEmail          :', typeof emailModule.envoyerEmail);
console.log('   emailModule.emailService           :', typeof emailModule.emailService);
console.log('   emailModule.default                :', typeof emailModule.default);
console.log('   emailModule.EmailService           :', typeof emailModule.EmailService);

// ── 2. Trouver la bonne forme ─────────────────────────────────
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('4️⃣  RÉSULTAT - Quelle forme utiliser :\n');

if (typeof emailModule.envoyerEmail === 'function') {
  console.log('✅ Utilise : emailModule.envoyerEmail(...)');
  console.log('   Import   : const emailService = require(\'../utils/emailService\')');
  console.log('   Appel    : await emailService.envoyerEmail({ to, subject, html })');
} else if (emailModule.emailService && typeof emailModule.emailService.envoyerEmail === 'function') {
  console.log('✅ Utilise : emailModule.emailService.envoyerEmail(...)');
  console.log('   Import   : const { emailService } = require(\'../utils/emailService\')');
  console.log('   Appel    : await emailService.envoyerEmail({ to, subject, html })');
} else if (emailModule.default && typeof emailModule.default.envoyerEmail === 'function') {
  console.log('✅ Utilise : emailModule.default.envoyerEmail(...)');
  console.log('   Import   : const emailService = require(\'../utils/emailService\').default');
  console.log('   Appel    : await emailService.envoyerEmail({ to, subject, html })');
} else if (typeof emailModule === 'object' && emailModule.constructor && typeof emailModule.constructor.prototype.envoyerEmail === 'function') {
  console.log('✅ C\'est une instance de classe avec envoyerEmail sur le prototype');
  console.log('   Import   : const emailService = require(\'../utils/emailService\')');
  console.log('   Appel    : await emailService.envoyerEmail({ to, subject, html })');
} else {
  console.log('❌ envoyerEmail introuvable - Affichage complet de emailModule :');
  console.dir(emailModule, { depth: 3 });
}

// ── 3. Test d'envoi simulé ────────────────────────────────────
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('5️⃣  TEST d\'envoi simulé (mode simulation) :\n');

async function testEnvoi() {
  try {
    let instance = null;

    if (typeof emailModule.envoyerEmail === 'function') {
      instance = emailModule;
    } else if (emailModule.emailService && typeof emailModule.emailService.envoyerEmail === 'function') {
      instance = emailModule.emailService;
    } else if (emailModule.default && typeof emailModule.default.envoyerEmail === 'function') {
      instance = emailModule.default;
    }

    if (!instance) {
      console.log('❌ Impossible de trouver une instance valide');
      return;
    }

    const result = await instance.envoyerEmail({
      to: 'test@example.com',
      subject: 'Test WAYZ-ECO',
      html: '<p>Test email</p>'
    });

    console.log('✅ Envoi réussi :', result);
  } catch (err) {
    console.log('❌ Erreur lors de l\'envoi :', err.message);
  }
}

testEnvoi();