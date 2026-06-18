// routes/placesV2Routes.js
const express = require('express');
const router = express.Router();
const placesV2Controller = require('../controllers/placesV2Controller');
const authMiddleware = require('../middlewares/authMiddleware');
const rateLimit = require('express-rate-limit');

// -------------------------------------------------------
// Extraction des middlewares depuis authMiddleware.js
// -------------------------------------------------------
const {
  protect: authenticateToken,  // authMiddleware principal (alias protect)
  placesAuth,                  // auth optionnelle pour les lieux
} = authMiddleware;

if (typeof authenticateToken !== 'function') {
  throw new Error('❌ Middleware protect/authenticateToken introuvable dans authMiddleware.js');
}

// -------------------------------------------------------
// Vérification des méthodes du controller au démarrage
// -------------------------------------------------------
const requiredMethods = [
  'searchText', 'searchNearby', 'autocomplete', 'getPlaceDetails',
  'getBatchPlaceDetails', 'searchCommunes', 'searchGaresRoutieres',
  'searchStationsProches', 'searchPolices', 'searchStations',
  'searchPOI', 'getAllTotalEnergies', 'getNearbyTotalEnergies',
  'getPlaceTypes', 'searchWithFilters', 'getPopularPlaces', 'searchNearbyByCategory', 'healthCheck'
];

const missingMethods = requiredMethods.filter(
  method => typeof placesV2Controller[method] !== 'function'
);

if (missingMethods.length > 0) {
  console.error('❌ Méthodes manquantes dans placesV2Controller:', missingMethods);
  throw new Error(`Méthodes manquantes: ${missingMethods.join(', ')}`);
}

console.log('✅ Toutes les dépendances placesV2Routes sont OK');

// -------------------------------------------------------
// Rate limiters
// -------------------------------------------------------
const searchLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 30,
  message: { success: false, message: 'Trop de recherches, veuillez patienter' },
});

const autocompleteLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 60, // autocomplete est appelée à chaque frappe, limite plus haute
  message: { success: false, message: 'Trop de requêtes d\'autocomplétion' },
});

// -------------------------------------------------------
// Routes STATIQUES en premier (avant /:placeId)
// -------------------------------------------------------

// --- Health check (public) ---
router.get('/health', placesV2Controller.healthCheck);

// --- Recherche texte ---
router.post('/search', placesAuth, searchLimiter, placesV2Controller.searchText);
router.post('/search/filtered', authenticateToken, searchLimiter, placesV2Controller.searchWithFilters);

// --- Recherche à proximité ---
router.post('/nearby', placesAuth, searchLimiter, placesV2Controller.searchNearby);
router.post('/nearby/category', authenticateToken, searchLimiter, placesV2Controller.searchNearbyByCategory);

// --- Autocomplétion ---
router.post('/autocomplete', placesAuth, autocompleteLimiter, placesV2Controller.autocomplete);

// --- Communes ---
router.post('/communes', placesAuth, searchLimiter, placesV2Controller.searchCommunes);

// --- Gares & stations ---
router.post('/gares', authenticateToken, searchLimiter, placesV2Controller.searchGaresRoutieres);
router.post('/stations-proches', authenticateToken, searchLimiter, placesV2Controller.searchStationsProches);
router.post('/stations', authenticateToken, searchLimiter, placesV2Controller.searchStations);

// --- Police ---
router.post('/polices', authenticateToken, searchLimiter, placesV2Controller.searchPolices);

// --- POI ---
router.post('/poi', authenticateToken, searchLimiter, placesV2Controller.searchPOI);

// --- Lieux populaires ---
router.get('/popular', placesAuth, searchLimiter, placesV2Controller.getPopularPlaces);

// --- TotalEnergies (statiques avant /:placeId) ---
router.get('/totalenergies/all', authenticateToken, searchLimiter, placesV2Controller.getAllTotalEnergies);
router.post('/totalenergies/nearby', authenticateToken, searchLimiter, placesV2Controller.getNearbyTotalEnergies);

// --- Types de lieux (public, pas besoin d'auth) ---
router.get('/types/list', placesV2Controller.getPlaceTypes);

// --- Batch ---
router.post('/batch', authenticateToken, placesV2Controller.getBatchPlaceDetails);

// -------------------------------------------------------
// Route DYNAMIQUE en dernier (capte tout /:placeId)
// -------------------------------------------------------
router.get('/:placeId', authenticateToken, placesV2Controller.getPlaceDetails);

console.log(`✅ ${router.stack.length} routes places enregistrées`);

module.exports = router;