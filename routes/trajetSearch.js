// routes/trajetSearch.routes.js

const express = require('express');
const router = express.Router();
const trajetSearchController = require('../controllers/trajetSearchController');
const { authMiddleware } = require('../middlewares/authMiddleware');

// ===============================================
// TOUTES LES ROUTES NÉCESSITENT UNE AUTHENTIFICATION
// ===============================================
router.use(authMiddleware);

/**
 * @route   POST /api/trajets/search/nearby
 * @desc    Recherche géospatiale de trajets par proximité
 * @access  Private (authentification requise)
 * @body    {
 *   departLat: number (requis) - Latitude du point de départ,
 *   departLng: number (requis) - Longitude du point de départ,
 *   arriveeLat: number (requis) - Latitude du point d'arrivée,
 *   arriveeLng: number (requis) - Longitude du point d'arrivée,
 *   rayonDepart?: number (km, défaut: 5) - Rayon de recherche au départ,
 *   rayonArrivee?: number (km, défaut: 5) - Rayon de recherche à l'arrivée,
 *   dateDepart?: string (ISO 8601) - Date souhaitée du trajet,
 *   toleranceDate?: number (heures, défaut: 2) - Tolérance sur l'horaire,
 *   limit?: number (défaut: 20, max: 100) - Nombre max de résultats
 * }
 * @example
 * POST /api/trajets/search/nearby
 * {
 *   "departLat": 5.2893,
 *   "departLng": -3.9832,
 *   "arriveeLat": 5.3272,
 *   "arriveeLng": -4.0144,
 *   "rayonDepart": 3,
 *   "rayonArrivee": 2,
 *   "dateDepart": "2025-01-29T08:00:00Z",
 *   "toleranceDate": 1,
 *   "limit": 10
 * }
 */
router.post('/nearby', trajetSearchController.searchNearbyTrips);

/**
 * @route   POST /api/trajets/search/commune
 * @desc    Recherche de trajets par commune et quartier
 * @access  Private
 * @body    {
 *   communeDepart: string (requis) - Commune de départ,
 *   communeArrivee: string (requis) - Commune d'arrivée,
 *   quartierDepart?: string - Quartier de départ,
 *   quartierArrivee?: string - Quartier d'arrivée,
 *   dateDepart?: string (ISO 8601) - Date souhaitée,
 *   toleranceDate?: number (heures, défaut: 2) - Tolérance,
 *   limit?: number (défaut: 20) - Nombre max de résultats
 * }
 * @example
 * POST /api/trajets/search/commune
 * {
 *   "communeDepart": "Marcory",
 *   "communeArrivee": "Plateau",
 *   "quartierDepart": "Zone 4",
 *   "dateDepart": "2025-01-29T08:00:00Z",
 *   "limit": 15
 * }
 */
router.post('/commune', trajetSearchController.searchByCommune);

/**
 * @route   POST /api/trajets/search/smart
 * @desc    Recherche intelligente avec fallback automatique
 *          Tente d'abord la recherche GPS, puis bascule sur commune si nécessaire
 * @access  Private
 * @body    Combinaison des paramètres des routes /nearby et /commune
 * @example
 * POST /api/trajets/search/smart
 * {
 *   "departLat": 5.2893,
 *   "departLng": -3.9832,
 *   "arriveeLat": 5.3272,
 *   "arriveeLng": -4.0144,
 *   "communeDepart": "Marcory",
 *   "communeArrivee": "Plateau",
 *   "quartierDepart": "Zone 4",
 *   "rayonDepart": 5,
 *   "rayonArrivee": 5,
 *   "dateDepart": "2025-01-29T08:00:00Z",
 *   "toleranceDate": 2
 * }
 */
router.post('/smart', trajetSearchController.smartSearch);

/**
 * @route   GET /api/trajets/search/config
 * @desc    Obtenir la configuration du service de recherche
 * @access  Private
 * @returns {Object} Configuration actuelle (rayons, limites, etc.)
 */
router.get('/config', trajetSearchController.getConfig);

/**
 * @route   GET /api/trajets/search/health
 * @desc    Health check du service de recherche
 * @access  Public
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'Recherche de trajets',
    status: 'Opérationnel',
    endpoints: {
      'POST /nearby': 'Recherche géospatiale par proximité',
      'POST /commune': 'Recherche par commune/quartier',
      'POST /smart': 'Recherche intelligente avec fallback',
      'GET /config': 'Configuration du service'
    },
    timestamp: new Date().toISOString()
  });
});

module.exports = router;