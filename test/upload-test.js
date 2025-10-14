// Test des modules d'upload
const path = require('path');
const fs = require('fs');

console.log('🧪 Test des modules d\'upload...\n');

// Test du module photos
try {
  const photosModule = require('../uploads/photos');
  console.log('✅ Module photos chargé avec succès');
  console.log('   - uploadSingle:', typeof photosModule.uploadSingle);
  console.log('   - uploadMultiple:', typeof photosModule.uploadMultiple);
  console.log('   - getPublicUrl:', typeof photosModule.getPublicUrl);
  console.log('   - deleteFile:', typeof photosModule.deleteFile);
  
  // Test de génération d'URL
  const testUrl = photosModule.getPublicUrl('test-photo.jpg');
  console.log('   - URL générée:', testUrl);
} catch (error) {
  console.log('❌ Erreur module photos:', error.message);
}

console.log('');

// Test du module documents
try {
  const documentsModule = require('../uploads/documents');
  console.log('✅ Module documents chargé avec succès');
  console.log('   - uploadDocument:', typeof documentsModule.uploadDocument);
  console.log('   - uploadMultiple:', typeof documentsModule.uploadMultiple);
  console.log('   - getPublicUrl:', typeof documentsModule.getPublicUrl);
  console.log('   - deleteFile:', typeof documentsModule.deleteFile);
  
  // Test de génération d'URL
  const testUrl = documentsModule.getPublicUrl('test-doc.pdf');
  console.log('   - URL générée:', testUrl);
} catch (error) {
  console.log('❌ Erreur module documents:', error.message);
}

console.log('');

// Test du module véhicules
try {
  const vehiculesModule = require('../uploads/vehicules');
  console.log('✅ Module véhicules chargé avec succès');
  console.log('   - uploadPhotoVehicule:', typeof vehiculesModule.uploadPhotoVehicule);
  console.log('   - uploadMultiple:', typeof vehiculesModule.uploadMultiple);
  console.log('   - getPublicUrl:', typeof vehiculesModule.getPublicUrl);
  console.log('   - deleteFile:', typeof vehiculesModule.deleteFile);
  
  // Test de génération d'URL
  const testUrl = vehiculesModule.getPublicUrl('test-vehicule.jpg');
  console.log('   - URL générée:', testUrl);
} catch (error) {
  console.log('❌ Erreur module véhicules:', error.message);
}

console.log('');

// Vérification des répertoires
const uploadDirs = [
  path.join(__dirname, '..', 'public', 'uploads', 'photos'),
  path.join(__dirname, '..', 'public', 'uploads', 'documents'),
  path.join(__dirname, '..', 'public', 'uploads', 'vehicules')
];

console.log('📁 Vérification des répertoires d\'upload:');
uploadDirs.forEach(dir => {
  if (fs.existsSync(dir)) {
    console.log(`   ✅ ${dir}`);
  } else {
    console.log(`   ❌ ${dir} (manquant)`);
  }
});

console.log('\n🎯 Test terminé!');
