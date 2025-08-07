// debug-env.js
require('dotenv').config();

console.log('=== DIAGNOSTIC DES VARIABLES D\'ENVIRONNEMENT ===\n');

// 1. Vérification du chargement de dotenv
console.log('1. Status dotenv:');
console.log('   - dotenv chargé:', typeof require === 'function' ? '✅' : '❌');

// 2. Vérification du fichier .env
const fs = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '.env');

console.log('\n2. Fichier .env:');
console.log('   - Chemin:', envPath);
console.log('   - Existe:', fs.existsSync(envPath) ? '✅' : '❌');

if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    console.log('   - Taille:', envContent.length, 'caractères');
    
    // Chercher les lignes contenant MONGO
    const mongoLines = envContent.split('\n').filter(line => 
        line.includes('MONGO') && !line.trim().startsWith('#')
    );
    console.log('   - Lignes MONGO trouvées:', mongoLines.length);
    mongoLines.forEach((line, index) => {
        console.log(`     ${index + 1}: ${line.trim()}`);
    });
}

// 3. Variables d'environnement actuelles
console.log('\n3. Variables d\'environnement:');
console.log('   - MONGODB_URI:', process.env.MONGODB_URI || 'NON DÉFINIE');
console.log('   - MONGO_URI:', process.env.MONGO_URI || 'NON DÉFINIE');

// 4. Toutes les variables qui contiennent "MONGO" ou "DB"
const allEnvVars = Object.keys(process.env).filter(key => 
    key.toUpperCase().includes('MONGO') || key.toUpperCase().includes('DB')
);
console.log('   - Variables liées à MongoDB:', allEnvVars);

// 5. Test manuel de connexion avec différentes variables
console.log('\n4. Test de valeurs:');
const possibleVars = ['MONGODB_URI', 'MONGO_URI', 'DATABASE_URL', 'DB_URI'];
possibleVars.forEach(varName => {
    const value = process.env[varName];
    if (value) {
        console.log(`   - ${varName}: ${value.substring(0, 50)}...`);
    } else {
        console.log(`   - ${varName}: NON DÉFINIE`);
    }
});

console.log('\n=== FIN DU DIAGNOSTIC ===');