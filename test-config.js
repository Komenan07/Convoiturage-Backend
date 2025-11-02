// test-config.js (À LA RACINE du projet)
require('dotenv').config();

console.log('🔍 Vérification de la configuration...\n');

const requiredVars = [
  'CINETPAY_API_URL',
  'CINETPAY_SITE_ID',
  'CINETPAY_API_KEY',
  'CINETPAY_SECRET_KEY',
  'CINETPAY_ENV',
  'BACKEND_URL',
  'FRONTEND_URL',
  'EMAIL_USER',
  'EMAIL_PASS',
  'JWT_SECRET',
  'MONGODB_URI'
];

let allConfigured = true;

requiredVars.forEach(varName => {
  const value = process.env[varName];
  const isConfigured = value && value !== `votre_${varName.toLowerCase()}` && !value.includes('votre_');
  const status = isConfigured ? '✅' : '❌';
  
  if (!isConfigured) {
    allConfigured = false;
  }
  
  // Masquer les valeurs sensibles
  let displayValue = value || 'MANQUANT';
  if (value && (varName.includes('SECRET') || varName.includes('PASS') || varName.includes('KEY'))) {
    displayValue = value.substring(0, 10) + '...';
  }
  
  console.log(`${status} ${varName}: ${displayValue}`);
});

console.log('\n' + (allConfigured ? '✅ Configuration complète!' : '⚠️ Configuration incomplète!'));

// Test MongoDB
if (process.env.MONGODB_URI) {
  const mongoose = require('mongoose');
  console.log('\n🔌 Test de connexion MongoDB...');
  mongoose.connect(process.env.MONGODB_URI)
    .then(() => {
      console.log('✅ MongoDB connecté!');
      mongoose.connection.close();
    })
    .catch(err => {
      console.log('❌ Erreur MongoDB:', err.message);
    });
} else {
  console.log('\n❌ MONGODB_URI non configuré - Impossible de tester la connexion');
}