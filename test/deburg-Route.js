// debug-routes.js - Script pour identifier les routes problématiques

const express = require('express');
const app = express();

// Liste des fichiers de routes à tester
const routeFiles = [
  './routes/utilisateurRouter'
];

console.log('🔍 Diagnostic des routes...\n');

// Tester chaque fichier de route individuellement
routeFiles.forEach((routeFile, index) => {
  try {
    console.log(`${index + 1}. Test de ${routeFile}...`);
    
    // Créer une nouvelle app pour chaque test
    const testApp = express();
    
    // Essayer de charger la route
    const router = require(routeFile);
    testApp.use('/test', router);
    
    console.log(`   ✅ ${routeFile} - OK`);
    
  } catch (error) {
    console.error(`   ❌ ${routeFile} - ERREUR:`);
    console.error(`      ${error.message}`);
    console.error(`      Stack: ${error.stack.split('\n')[0]}\n`);
    
    // Si c'est l'erreur path-to-regexp, donner des indices
    if (error.message.includes('Missing parameter name')) {
      console.error('      💡 Indices pour résoudre:');
      console.error('         - Vérifiez les routes avec des paramètres (:id, :param)');
      console.error('         - Cherchez les routes malformées comme "/:/" ou "/*/"');
      console.error('         - Vérifiez les caractères spéciaux dans les chemins');
      console.error('');
    }
  }
});

console.log('🏁 Diagnostic terminé.');

// Test des patterns de routes courants problématiques
console.log('\n🧪 Test des patterns problématiques courants:');

const problematicPatterns = [
  '/:/',           // Paramètre vide
  '/*/',           // Wildcard mal placé
  '/:/test',       // Paramètre sans nom
  '/test/:',       // Paramètre en fin sans nom
  '/test/:/id',    // Paramètre mal défini
];

problematicPatterns.forEach(pattern => {
  try {
    const testApp = express();
    testApp.get(pattern, (req, res) => res.send('test'));
    console.log(`   ✅ Pattern "${pattern}" - OK`);
  } catch (error) {
    console.log(`   ❌ Pattern "${pattern}" - ERREUR: ${error.message}`);
  }
});

console.log('\n📋 Vérifiez votre fichier utilisateurRouter.js pour ces problèmes:');
console.log('   1. Routes avec paramètres mal définis: "/:/" au lieu de "/:id"');
console.log('   2. Caractères spéciaux non échappés');
console.log('   3. Wildcards (*) mal placés');
console.log('   4. Paramètres sans nom après ":"');