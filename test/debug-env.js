// debug-env.js - À placer à la racine du projet
const fs = require('fs');
const path = require('path');

console.log('=== DÉBOGAGE COMPLET VARIABLES D\'ENVIRONNEMENT ===\n');

// 1. Vérifier l'existence du fichier .env
const envPath = path.join(__dirname, '.env');
console.log('1. Chemin du fichier .env:', envPath);
console.log('2. Fichier .env existe:', fs.existsSync(envPath));

if (fs.existsSync(envPath)) {
  console.log('3. Contenu du fichier .env (premières lignes):');
  const envContent = fs.readFileSync(envPath, 'utf8');
  const lines = envContent.split('\n').slice(0, 10);
  lines.forEach((line, index) => {
    if (line.startsWith('MONGODB_URI')) {
      console.log(`   Ligne ${index + 1}: ${line}`);
    }
  });
}

// 4. Charger dotenv
console.log('\n4. Chargement de dotenv...');
try {
  const result = require('dotenv').config();
  if (result.error) {
    console.log('❌ Erreur dotenv:', result.error.message);
  } else {
    console.log('✅ Dotenv chargé avec succès');
  }
} catch (error) {
  console.log('❌ Erreur lors du chargement de dotenv:', error.message);
}

// 5. Vérifier les variables
console.log('\n5. Variables d\'environnement:');
console.log('MONGODB_URI:', process.env.MONGODB_URI ? '✅ Définie' : '❌ Undefined');
console.log('PORT:', process.env.PORT ? '✅ Définie' : '❌ Undefined');
console.log('NODE_ENV:', process.env.NODE_ENV ? '✅ Définie' : '❌ Undefined');

// 6. Test de connexion MongoDB si la variable existe
if (process.env.MONGODB_URI) {
  console.log('\n6. Test de connexion MongoDB...');
  const mongoose = require('mongoose');
  
  mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 10000,
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log('✅ Connexion MongoDB réussie!');
    process.exit(0);
  })
  .catch((error) => {
    console.log('❌ Erreur de connexion MongoDB:', error.message);
    process.exit(1);
  });
} else {
  console.log('\n6. ❌ Impossible de tester la connexion, MONGODB_URI non définie');
}