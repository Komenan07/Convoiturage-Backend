/**
 * Script de diagnostic et correction rapide MongoDB
 * Usage: node quick-fix.js
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

console.log('🔧 Diagnostic et Correction MongoDB\n');

// 1. Vérifier les variables d'environnement
console.log('1. 📋 Vérification de la configuration:');
console.log('   NODE_ENV:', process.env.NODE_ENV || 'non défini');
console.log('   PORT:', process.env.PORT || 'non défini');
console.log('   MONGODB_URI:', process.env.MONGODB_URI ? 'défini' : '❌ NON DÉFINI');

if (process.env.MONGODB_URI) {
  console.log('   URI masquée:', process.env.MONGODB_URI.replace(/\/\/.@/, '//:*@'));
  
  if (process.env.MONGODB_URI.includes('mongodb.net')) {
    console.log('   🌐 Type: MongoDB Atlas (Cloud)');
    console.log('   ⚠  Problème potentiel: Connexion réseau/firewall');
  } else if (process.env.MONGODB_URI.includes('localhost')) {
    console.log('   🏠 Type: MongoDB Local');
  }
}

// 2. Créer un fichier .env corrigé
console.log('\n2. 🛠  Génération d\'un .env corrigé...');

const envContent = `# Configuration de l'environnement - Générée automatiquement
NODE_ENV=development
PORT=3000

# Base de données MongoDB
# Option recommandée pour le développement local (évite les problèmes de réseau)
MONGODB_URI=mongodb://localhost:27017/covoiturage_db

# Si vous voulez utiliser MongoDB Atlas, décommentez la ligne ci-dessous
# et commentez celle du dessus
# MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/covoiturage_db?retryWrites=true&w=majority&connectTimeoutMS=30000&socketTimeoutMS=30000

# JWT Configuration
JWT_SECRET=covoiturage_super_secret_key_2024_development_very_long_and_secure
JWT_EXPIRE=7d
JWT_REFRESH_SECRET=covoiturage_refresh_secret_key_2024_different_from_access
JWT_REFRESH_EXPIRE=30d

# Configuration sécurité
BCRYPT_ROUNDS=12
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW=15

# Configuration de développement (optionnel)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_app_password
EMAIL_FROM="CovoiturageApp <noreply@covoiturage.com>"

# Upload Configuration
MAX_FILE_SIZE=5242880
ALLOWED_IMAGE_TYPES=image/jpeg,image/png,image/webp
ALLOWED_DOCUMENT_TYPES=image/jpeg,image/png,application/pdf

# Frontend (pour CORS)
FRONTEND_URL=http://localhost:3000
`;

try {
  fs.writeFileSync('.env.backup', envContent);
  console.log('   ✅ Fichier .env.backup créé avec la configuration recommandée');
  console.log('   📝 Pour l\'utiliser: mv .env.backup .env');
} catch (error) {
  console.error('   ❌ Erreur lors de la création du fichier:', error.message);
}

// 3. Vérifier l'installation de MongoDB local
console.log('\n3. 🔍 Vérification de MongoDB local...');

const { exec } = require('child_process');

exec('mongod --version', (error, stdout, stderr) => {
  if (error) {
    console.log('   ❌ MongoDB n\'est pas installé localement');
    console.log('\n   💡 Instructions d\'installation:');
    console.log('   Windows: choco install mongodb');
    console.log('            ou télécharger depuis https://www.mongodb.com/try/download/community');
    console.log('   macOS:   brew install mongodb-community');
    console.log('   Linux:   sudo apt-get install mongodb');
    console.log('\n   🚀 Une fois installé, démarrez avec: mongod');
  } else {
    console.log('   ✅ MongoDB local trouvé');
    console.log('   Version:', stdout.trim().split('\n')[0]);
    
    // Tester la connexion locale
    exec('mongo --eval "db.runCommand({ping: 1})" --quiet', (pingError, pingStdout) => {
      if (pingError) {
        console.log('   ⚠  MongoDB installé mais non démarré');
        console.log('   🚀 Pour démarrer: mongod');
      } else {
        console.log('   ✅ MongoDB local démarré et accessible');
      }
    });
  }
});

// 4. Créer un fichier de configuration DB amélioré
console.log('\n4. 📁 Génération du fichier config/db.js amélioré...');

const dbConfigContent = `/**
 * Configuration MongoDB avec gestion d'erreurs robuste
 * Généré automatiquement par quick-fix.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

const connectDB = async () => {
  try {
    const options = {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      connectTimeoutMS: 20000,
      socketTimeoutMS: 45000,
      serverSelectionTimeoutMS: 20000,
      maxPoolSize: 10,
      minPoolSize: 2,
      heartbeatFrequencyMS: 10000,
      retryWrites: true,
      bufferCommands: false,
      bufferMaxEntries: 0,
    };

    console.log('🔄 Connexion à MongoDB...');
    
    const conn = await mongoose.connect(process.env.MONGODB_URI, options);
    
    console.log(\`✅ MongoDB connecté: \${conn.connection.host}\`);
    return conn;

  } catch (error) {
    console.error('❌ Erreur MongoDB:', error.message);
    
    if (error.message.includes('ETIMEOUT')) {
      console.error('💡 Solution: Utilisez MongoDB local ou vérifiez votre réseau');
    }
    
    if (error.message.includes('ECONNREFUSED')) {
      console.error('💡 Solution: Démarrez MongoDB local avec "mongod"');
    }
    
    process.exit(1);
  }
};

// Événements de connexion
mongoose.connection.on('connected', () => {
  console.log('📡 Mongoose connecté');
});

mongoose.connection.on('error', (err) => {
  console.error('❌ Erreur MongoDB:', err.message);
});

mongoose.connection.on('disconnected', () => {
  console.log('🔌 Mongoose déconnecté');
});

process.on('SIGINT', async () => {
  await mongoose.connection.close();
  console.log('🔒 Connexion fermée');
  process.exit(0);
});

module.exports = connectDB;
`;

try {
  if (!fs.existsSync('config')) {
    fs.mkdirSync('config');
  }
  fs.writeFileSync('config/db-improved.js', dbConfigContent);
  console.log('   ✅ Fichier config/db-improved.js créé');
  console.log('   📝 Pour l\'utiliser: mv config/db-improved.js config/db.js');
} catch (error) {
  console.error('   ❌ Erreur:', error.message);
}

// 5. Instructions finales
console.log('\n🎯 INSTRUCTIONS DE CORRECTION:');
console.log('1. Copiez la configuration recommandée:');
console.log('   mv .env.backup .env');
console.log('2. Si vous n\'avez pas MongoDB local, installez-le:');
console.log('   Windows: choco install mongodb');
console.log('   macOS:   brew install mongodb-community');
console.log('   Linux:   sudo apt-get install mongodb');
console.log('3. Démarrez MongoDB local:');
console.log('   mongod');
console.log('4. Utilisez la configuration DB améliorée:');
console.log('   mv config/db-improved.js config/db.js');
console.log('5. Redémarrez votre serveur:');
console.log('   npm run dev');
console.log('\n✨ Cette configuration éliminera les erreurs de timeout!');