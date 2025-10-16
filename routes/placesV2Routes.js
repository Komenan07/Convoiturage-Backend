// routes/placesV2Routes.js
const express = require('express');
const router = express.Router();
const placesV2Controller = require('../controllers/placesV2Controller');
const authMiddleware = require('../middlewares/authMiddleware');
const rateLimit = require('express-rate-limit');

// ✅ Utiliser le nom correct du middleware
const authenticateToken = authMiddleware.protect || 
                         authMiddleware.authMiddleware || 
                         authMiddleware.requireAuth;

if (!authenticateToken) {
  throw new Error('❌ Middleware d\'authentification introuvable dans authMiddleware.js');
}  

// Debug
//console.log('🔍 Vérification des dépendances placesV2Routes...');
//console.log('   authMiddleware keys:', Object.keys(authMiddleware));
console.log('   authenticateToken:', typeof authenticateToken);

const requiredMethods = [
  'searchText', 'searchNearby', 'autocomplete', 'getPlaceDetails',
  'searchCommunes', 'searchGaresRoutieres', 'searchPOI', 'getPlaceTypes'
];

const missingMethods = requiredMethods.filter(
  method => typeof placesV2Controller[method] !== 'function'
);

if (missingMethods.length > 0) {
  console.error('❌ ERREUR: Méthodes manquantes:', missingMethods);
  throw new Error(`Méthodes manquantes: ${missingMethods.join(', ')}`);
}

if (typeof authenticateToken !== 'function') {
  console.error('❌ ERREUR: authenticateToken n\'est pas une fonction');
  console.error('   Middlewares disponibles:', Object.keys(authMiddleware));
  console.error('   Utilisez l\'un de ces noms dans votre code');
  throw new Error('authenticateToken invalide');
}

console.log('✅ Toutes les dépendances placesV2Routes sont OK');

// Rate limiter
const searchLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 30,
  message: 'Trop de recherches, veuillez patienter',
});

// Routes (reste identique)
router.post('/search', authenticateToken, searchLimiter, placesV2Controller.searchText);
router.post('/nearby', authenticateToken, searchLimiter, placesV2Controller.searchNearby);
router.post('/autocomplete', authenticateToken, searchLimiter, placesV2Controller.autocomplete);
router.post('/communes', authenticateToken, searchLimiter, placesV2Controller.searchCommunes);
router.post('/gares', authenticateToken, placesV2Controller.searchGaresRoutieres);
router.post('/poi', authenticateToken, placesV2Controller.searchPOI);
router.get('/types/list', placesV2Controller.getPlaceTypes);
router.get('/:placeId', authenticateToken, placesV2Controller.getPlaceDetails);

console.log(`✅ ${router.stack.length} routes places enregistrées`);

module.exports = router;