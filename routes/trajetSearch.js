// routes/trajetSearch.js

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
 * @desc    Recherche géospatiale de trajets — Logique Yango
 *          Cherche les conducteurs proches du passager qui vont dans la même direction.
 *          Vérifie le point de départ ET les arrêts intermédiaires du conducteur.
 * @access  Private (authentification requise)
 * @body    {
 *   departLat:    number  (requis) - Latitude du passager,
 *   departLng:    number  (requis) - Longitude du passager,
 *   arriveeLat:   number  (requis) - Latitude de la destination,
 *   arriveeLng:   number  (requis) - Longitude de la destination,
 *   rayonDepart?:  number (km, défaut: 5)  - Grand rayon de recherche initial,
 *   rayonArrivee?: number (km, défaut: 5)  - Rayon autour de la destination,
 *   rayonMontee?:  number (km, défaut: 2)  - Rayon pour détecter un arrêt de montée proche du passager,
 *   dateDepart?:   string (ISO 8601)       - Date souhaitée du trajet,
 *   toleranceDate?: number (heures, défaut: 2) - Tolérance sur l'horaire,
 *   nombrePassagers?: number - Nombre de places nécessaires,
 *   prixMax?:      number   - Prix maximum par passager (FCFA),
 *   noteMin?:      number   - Note minimale du conducteur (0-5),
 *   musique?:      boolean  - Préférence musique,
 *   climatisation?: boolean - Préférence climatisation,
 *   bagages?:      boolean  - Bagages acceptés,
 *   nonFumeur?:    boolean  - Véhicule non-fumeur,
 *   limit?:        number   (défaut: 20) - Nombre max de résultats
 * }
 * @returns {
 *   success: boolean,
 *   count: number,
 *   methode: "geospatial_yango",
 *   trajets: [{
 *     ...infoTrajet,
 *     arretMontee: {          ← où le passager peut monter
 *       type: "DEPART" | "ARRET_INTERMEDIAIRE",
 *       nom: string,
 *       distanceKm: number,
 *       ordre: number
 *     },
 *     distanceMonteeKm: number,   ← distance passager → arrêt de montée
 *     distanceArriveeKm: number,  ← distance destinations
 *     conducteur: { ... }
 *   }]
 * }
 * @example
 * POST /api/trajets/search/nearby
 * {
 *   "departLat": 5.3601,
 *   "departLng": -3.9969,
 *   "arriveeLat": 5.3196,
 *   "arriveeLng": -4.0167,
 *   "rayonDepart": 10,
 *   "rayonArrivee": 3,
 *   "rayonMontee": 2,
 *   "dateDepart": "2026-03-10T07:00:00Z",
 *   "toleranceDate": 1,
 *   "limit": 10
 * }
 */
router.post('/nearby', trajetSearchController.searchNearbyTrips);

/**
 * @route   POST /api/trajets/search/commune
 * @desc    Recherche de trajets par commune et quartier (sans GPS)
 *          Utile quand le passager n'a pas la localisation activée.
 *          Accepte le quartier précis OU les trajets sans quartier renseigné.
 * @access  Private
 * @body    {
 *   communeDepart:   string (requis) - Commune de départ (ex: "Cocody"),
 *   communeArrivee:  string (requis) - Commune d'arrivée (ex: "Plateau"),
 *   quartierDepart?:  string - Quartier de départ (ex: "Saint Jean"),
 *   quartierArrivee?: string - Quartier d'arrivée,
 *   dateDepart?:      string (ISO 8601) - Date souhaitée,
 *   toleranceDate?:   number (heures, défaut: 2) - Tolérance sur l'horaire,
 *   nombrePassagers?: number - Nombre de places nécessaires,
 *   prixMax?:         number - Prix maximum (FCFA),
 *   noteMin?:         number - Note minimale conducteur (0-5),
 *   musique?:         boolean,
 *   climatisation?:   boolean,
 *   bagages?:         boolean,
 *   nonFumeur?:       boolean,
 *   limit?:           number (défaut: 20)
 * }
 * @example
 * POST /api/trajets/search/commune
 * {
 *   "communeDepart": "Cocody",
 *   "communeArrivee": "Plateau",
 *   "quartierDepart": "Saint Jean",
 *   "dateDepart": "2026-03-10T07:00:00Z",
 *   "prixMax": 1000,
 *   "limit": 15
 * }
 */
router.post('/commune', trajetSearchController.searchByCommune);

/**
 * @route   POST /api/trajets/search/smart
 * @desc    Recherche intelligente — Point d'entrée principal (recommandé)
 *
 *          Stratégie automatique:
 *            1. GPS fourni         → recherche Yango géospatiale
 *            2. Texte seulement    → geocoding local → recherche Yango
 *            3. 0 résultat géo     → fallback recherche par commune
 *            4. Erreur géospatiale → fallback recherche par commune
 *
 * @access  Private
 * @body    {
 *   // Option A — GPS (mobile avec localisation)
 *   departLat?:    number - Latitude du passager,
 *   departLng?:    number - Longitude du passager,
 *   arriveeLat?:   number - Latitude destination,
 *   arriveeLng?:   number - Longitude destination,
 *
 *   // Option B — Texte (sans GPS)
 *   communeDepart?:   string - Ex: "Cocody",
 *   communeArrivee?:  string - Ex: "Plateau",
 *   quartierDepart?:  string - Ex: "Saint Jean",
 *   quartierArrivee?: string,
 *
 *   // Au moins Option A OU Option B est obligatoire
 *
 *   // Paramètres communs optionnels
 *   rayonDepart?:     number (km, défaut: 5),
 *   rayonArrivee?:    number (km, défaut: 5),
 *   rayonMontee?:     number (km, défaut: 2) - Rayon arrêt de montée autour du passager,
 *   dateDepart?:      string (ISO 8601),
 *   toleranceDate?:   number (heures, défaut: 2),
 *   nombrePassagers?: number,
 *   prixMax?:         number (FCFA),
 *   noteMin?:         number (0-5),
 *   musique?:         boolean,
 *   climatisation?:   boolean,
 *   bagages?:         boolean,
 *   nonFumeur?:       boolean,
 *   limit?:           number (défaut: 20)
 * }
 * @returns {
 *   success: boolean,
 *   count: number,
 *   methode: "geospatial_yango" | "commune" | "commune_fallback",
 *   fallback?: boolean,       ← true si la géospatiale a été remplacée par commune
 *   fallbackRaison?: string,
 *   geocoding?: {             ← présent si résolution texte → GPS
 *     depart:  { label, precision },
 *     arrivee: { label, precision }
 *   },
 *   trajets: [...]
 * }
 *
 * @example — GPS direct (mobile)
 * POST /api/trajets/search/smart
 * {
 *   "departLat": 5.3601,
 *   "departLng": -3.9969,
 *   "arriveeLat": 5.3196,
 *   "arriveeLng": -4.0167,
 *   "rayonMontee": 2
 * }
 *
 * @example — Texte seulement
 * POST /api/trajets/search/smart
 * {
 *   "communeDepart": "Cocody",
 *   "quartierDepart": "Saint Jean",
 *   "communeArrivee": "Plateau",
 *   "prixMax": 1000
 * }
 *
 * @example — GPS + commune (fallback automatique si 0 résultat géo)
 * POST /api/trajets/search/smart
 * {
 *   "departLat": 5.3601,
 *   "departLng": -3.9969,
 *   "arriveeLat": 5.3196,
 *   "arriveeLng": -4.0167,
 *   "communeDepart": "Cocody",
 *   "communeArrivee": "Plateau",
 *   "quartierDepart": "Saint Jean",
 *   "rayonMontee": 2,
 *   "dateDepart": "2026-03-10T07:00:00Z"
 * }
 */
router.post('/smart', trajetSearchController.smartSearch);

/**
 * @route   GET /api/trajets/search/config
 * @desc    Obtenir la configuration actuelle du service de recherche
 * @access  Private
 * @returns {
 *   success: boolean,
 *   config: {
 *     RAYON_DEFAUT_KM: 5,
 *     RAYON_MONTEE_DEFAUT_KM: 2,
 *     TOLERANCE_DATE_DEFAUT_HEURES: 2,
 *     LIMITE_RESULTATS_DEFAUT: 20,
 *     RAYON_MAX_KM: 50,
 *     RAYON_MIN_KM: 0.5,
 *     TOLERANCE_DIRECTION_DEGRES: 60
 *   }
 * }
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
    service: 'Recherche de trajets WAYZ-ECO',
    status: 'Opérationnel',
    logique: 'Yango — arrêts intermédiaires inclus',
    endpoints: {
      'POST /nearby':  'Recherche géospatiale Yango (GPS obligatoire)',
      'POST /commune': 'Recherche par commune/quartier (sans GPS)',
      'POST /smart':   'Recherche intelligente avec fallback automatique (recommandé)',
      'GET  /config':  'Configuration du service'
    },
    timestamp: new Date().toISOString()
  });
});

module.exports = router;