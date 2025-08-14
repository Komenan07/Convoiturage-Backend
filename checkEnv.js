// checkEmailConfig.js - Vérifier la configuration email après inscription
require('dotenv').config();

console.log('🔍 === CONFIGURATION EMAIL APRÈS INSCRIPTION ===\n');

// 1. Vérifier les variables d'environnement
console.log('📧 Variables email:');
console.log(`   EMAIL_HOST: ${process.env.EMAIL_HOST}`);
console.log(`   EMAIL_USER: ${process.env.EMAIL_USER}`);
console.log(`   EMAIL_FROM: ${process.env.EMAIL_FROM}`);

// 2. Vérifier la configuration de vérification
console.log('\n📬 Configuration de vérification:');
const emailVerificationEnabled = process.env.EMAIL_VERIFICATION_ENABLED;
console.log(`   EMAIL_VERIFICATION_ENABLED: ${emailVerificationEnabled}`);

if (emailVerificationEnabled === 'true') {
  console.log('   ✅ Vérification EMAIL ACTIVÉE');
  console.log('   → L\'utilisateur recevra 2 emails:');
  console.log('     1. Email de bienvenue');
  console.log('     2. Email de confirmation avec lien d\'activation');
  console.log('   → Le compte aura le statut: EN_ATTENTE_VERIFICATION');
  console.log('   → L\'utilisateur DOIT cliquer sur le lien pour activer son compte');
} else {
  console.log('   ⚠️  Vérification EMAIL DÉSACTIVÉE');
  console.log('   → L\'utilisateur recevra seulement:');
  console.log('     1. Email de bienvenue');
  console.log('   → Le compte sera directement activé');
}

// 3. Vérifier le service email
console.log('\n🛠️  Test du service email:');
try {
  const { emailService } = require('./services/emailService');
  
  if (emailService) {
    console.log('   ✅ Service email importé avec succès');
    
    // Vérifier les méthodes disponibles
    const hasWelcomeEmail = typeof emailService.sendWelcomeEmail === 'function';
    const hasConfirmationEmail = typeof emailService.sendRegistrationConfirmation === 'function';
    
    console.log(`   📨 sendWelcomeEmail disponible: ${hasWelcomeEmail ? '✅' : '❌'}`);
    console.log(`   📬 sendRegistrationConfirmation disponible: ${hasConfirmationEmail ? '✅' : '❌'}`);
    
    if (!hasWelcomeEmail) {
      console.log('   ⚠️  ATTENTION: La méthode sendWelcomeEmail n\'existe pas!');
    }
    if (!hasConfirmationEmail && emailVerificationEnabled === 'true') {
      console.log('   ⚠️  ATTENTION: La méthode sendRegistrationConfirmation n\'existe pas!');
    }
  }
} catch (error) {
  console.log('   ❌ Erreur lors de l\'import du service email:');
  console.log(`   Error: ${error.message}`);
}

// 4. Recommandations
console.log('\n💡 === RECOMMANDATIONS ===');

if (emailVerificationEnabled !== 'true') {
  console.log('🔧 Pour ACTIVER la vérification par email:');
  console.log('   1. Ajoutez dans votre .env: EMAIL_VERIFICATION_ENABLED=true');
  console.log('   2. Redémarrez votre serveur');
  console.log('   3. Les nouveaux utilisateurs devront confirmer leur email');
}

if (emailVerificationEnabled === 'true') {
  console.log('✅ Vérification activée - Flux complet:');
  console.log('   1. Utilisateur s\'inscrit');
  console.log('   2. Compte créé avec statut "EN_ATTENTE_VERIFICATION"');
  console.log('   3. Email de bienvenue envoyé');
  console.log('   4. Email de confirmation avec lien envoyé');
  console.log('   5. Utilisateur clique sur le lien');
  console.log('   6. Compte activé avec statut "ACTIF"');
}

console.log('\n🧪 === TEST SIMPLE ===');
console.log('Pour tester l\'inscription:');
console.log('1. Créez un compte via votre API');
console.log('2. Vérifiez votre boîte email (et spam!)');
console.log('3. Regardez les logs de votre serveur pour voir les erreurs éventuelles');

console.log('\n📝 === EXEMPLE DE RÉPONSE D\'INSCRIPTION ===');
console.log('Votre API retournera:');
console.log(JSON.stringify({
  success: true,
  message: "Inscription réussie ! Vérifiez votre email.",
  data: {
    user: {
      id: "user_id",
      nom: "Nom",
      prenom: "Prenom", 
      email: "email@example.com",
      statutCompte: emailVerificationEnabled === 'true' ? "EN_ATTENTE_VERIFICATION" : "ACTIF"
    },
    emailSent: true, // Email de bienvenue
    confirmationEmailSent: emailVerificationEnabled === 'true', // Email de confirmation
    verificationRequired: emailVerificationEnabled === 'true'
  }
}, null, 2));