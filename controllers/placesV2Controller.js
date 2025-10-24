// controllers/placesV2Controller.js
const placesV2Service = require('../services/placesV2Service');

/**
 * RECHERCHE DE TEXTE
 * POST /api/places/search
 */
const searchText = async (req, res) => {
  try {
    const { query, location, radius, includedTypes, rankPreference, maxResults } = req.body;

    if (!query || query.trim().length < 2) {
      return res.status(400).json({
        success: false,
        error: 'La requête doit contenir au moins 2 caractères',
      });
    }

    const options = {};
    
    if (location && location.latitude && location.longitude) {
      options.location = location;
      options.radius = radius || 50000;
    }

    if (includedTypes && Array.isArray(includedTypes)) {
      options.includedTypes = includedTypes;
    }

    if (rankPreference) {
      options.rankPreference = rankPreference;
    }

    if (maxResults) {
      options.maxResults = Math.min(maxResults, 20);
    }

    const result = await placesV2Service.searchText(query, options);

    if (result.success) {
      return res.status(200).json({
        success: true,
        count: result.data.length,
        data: result.data,
      });
    }

    return res.status(404).json(result);
  } catch (error) {
    console.error('Erreur searchText:', error);
    return res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de la recherche',
    });
  }
};

/**
 * RECHERCHE À PROXIMITÉ
 * POST /api/places/nearby
 */
const searchNearby = async (req, res) => {
  try {
    const { latitude, longitude, radius, includedTypes, excludedTypes, minRating, rankPreference, maxResults } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        error: 'Les coordonnées sont requises',
      });
    }

    const options = {
      radius: radius || 5000,
      maxResults: maxResults ? Math.min(maxResults, 20) : 20,
    };

    if (includedTypes && Array.isArray(includedTypes)) {
      options.includedTypes = includedTypes;
    }

    if (excludedTypes && Array.isArray(excludedTypes)) {
      options.excludedTypes = excludedTypes;
    }

    if (minRating) {
      options.minRating = minRating;
    }

    if (rankPreference) {
      options.rankPreference = rankPreference;
    }

    const result = await placesV2Service.searchNearby(latitude, longitude, options);

    if (result.success) {
      return res.status(200).json({
        success: true,
        count: result.data.length,
        data: result.data,
      });
    }

    return res.status(404).json(result);
  } catch (error) {
    console.error('Erreur searchNearby:', error);
    return res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de la recherche nearby',
    });
  }
};

/**
 * AUTOCOMPLÉTION
 * POST /api/places/autocomplete
 */
const autocomplete = async (req, res) => {
  try {
    const { input, location, radius, includedPrimaryTypes, includeOnlyRegions } = req.body;

    if (!input || input.trim().length < 2) {
      return res.status(400).json({
        success: false,
        error: 'La saisie doit contenir au moins 2 caractères',
      });
    }

    const options = {};

    if (location && location.latitude && location.longitude) {
      options.location = location;
      options.radius = radius || 50000;
    }

    if (includedPrimaryTypes && Array.isArray(includedPrimaryTypes)) {
      options.includedPrimaryTypes = includedPrimaryTypes;
    }

    if (includeOnlyRegions) {
      options.includeOnlyRegions = true;
    }

    const result = await placesV2Service.autocomplete(input, options);

    if (result.success) {
      return res.status(200).json({
        success: true,
        count: result.data.length,
        data: result.data,
      });
    }

    return res.status(404).json(result);
  } catch (error) {
    console.error('Erreur autocomplete:', error);
    return res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de l\'autocomplétion',
    });
  }
};

/**
 * DÉTAILS D'UN LIEU
 * GET /api/places/:placeId
 */
const getPlaceDetails = async (req, res) => {
  try {
    const { placeId } = req.params;
    const { fields } = req.query;

    if (!placeId) {
      return res.status(400).json({
        success: false,
        error: 'L\'ID du lieu est requis',
      });
    }

    const fieldArray = fields ? fields.split(',') : [];
    const result = await placesV2Service.getPlaceDetails(placeId, fieldArray);

    if (result.success) {
      return res.status(200).json({
        success: true,
        data: result.data,
      });
    }

    return res.status(404).json(result);
  } catch (error) {
    console.error('Erreur getPlaceDetails:', error);
    return res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de la récupération des détails',
    });
  }
};

/**
 * RECHERCHE DE COMMUNES
 * POST /api/places/communes
 */
const searchCommunes = async (req, res) => {
  try {
    const { query, city } = req.body;

    if (!query || query.trim().length < 2) {
      return res.status(400).json({
        success: false,
        error: 'La requête est trop courte',
      });
    }

    const result = await placesV2Service.searchCommunes(query, city);

    if (result.success) {
      return res.status(200).json({
        success: true,
        count: result.data.length,
        data: result.data,
      });
    }

    return res.status(404).json(result);
  } catch (error) {
    console.error('Erreur searchCommunes:', error);
    return res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de la recherche de communes',
    });
  }
};

/**
 * RECHERCHE DE GARES ROUTIÈRES
 * POST /api/places/gares
 */
const searchGaresRoutieres = async (req, res) => {
  try {
    const { latitude, longitude, radius } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        error: 'Les coordonnées sont requises',
      });
    }

    const result = await placesV2Service.searchGaresRoutieres(
      latitude,
      longitude,
      radius || 10000
    );

    if (result.success) {
      return res.status(200).json({
        success: true,
        count: result.data.length,
        data: result.data,
      });
    }

    return res.status(404).json(result);
  } catch (error) {
    console.error('Erreur searchGaresRoutieres:', error);
    return res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de la recherche de gares routières',
    });
  }
};
/**
 * RECHERCHE DE STATIONS PROCHES (bus, train, etc.)
 * POST /api/places/stations-proches
 */
const searchStationsProches = async (req, res) => {
  try {
    const { latitude, longitude, radius } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        error: 'Les coordonnées sont requises',
      });
    }

    const result = await placesV2Service.searchStationsProches(
      latitude,
      longitude,
      radius || 5000
    );

    if (result.success) {
      return res.status(200).json({
        success: true,
        count: result.data.length,
        data: result.data,
      });
    }

    return res.status(404).json(result);
  } catch (error) {
    console.error('Erreur searchStationsProches:', error);
    return res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de la recherche de stations proches',
    });
  }
};

/**
 * RECHERCHE DE STATIONS DE POLICE
 * POST /api/places/polices
 */
const searchPolices = async (req, res) => {
  try {
    const { latitude, longitude, radius } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        error: 'Les coordonnées sont requises',
      });
    }

    const result = await placesV2Service.searchPolices(
      latitude,
      longitude,
      radius || 10000
    );

    if (result.success) {
      return res.status(200).json({
        success: true,
        count: result.data.length,
        data: result.data,
      });
    }

    return res.status(404).json(result);
  } catch (error) {
    console.error('Erreur searchPolices:', error);
    return res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de la recherche de stations de police',
    });
  }
};

/**
 * RECHERCHE GÉNÉRALE DE STATIONS
 * POST /api/places/stations
 */
const searchStations = async (req, res) => {
  try {
    const { latitude, longitude, radius, type } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        error: 'Les coordonnées sont requises',
      });
    }

    const validTypes = ['bus', 'train', 'transit', 'taxi', 'all'];
    const stationType = type || 'all';

    if (!validTypes.includes(stationType)) {
      return res.status(400).json({
        success: false,
        error: `Type invalide. Types autorisés: ${validTypes.join(', ')}`,
      });
    }

    const result = await placesV2Service.searchStations(
      latitude,
      longitude,
      stationType,
      radius || 5000
    );

    if (result.success) {
      return res.status(200).json({
        success: true,
        count: result.data.length,
        data: result.data,
      });
    }

    return res.status(404).json(result);
  } catch (error) {
    console.error('Erreur searchStations:', error);
    return res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de la recherche de stations',
    });
  }
};
/**
 * RECHERCHE DE POINTS D'INTÉRÊT
 * POST /api/places/poi
 */
const searchPOI = async (req, res) => {
  try {
    const { latitude, longitude, type, radius } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        error: 'Les coordonnées sont requises',
      });
    }

    if (!type) {
      return res.status(400).json({
        success: false,
        error: 'Le type de POI est requis',
      });
    }

    const validTypes = ['mall', 'market', 'hospital', 'school', 'airport', 'hotel', 'restaurant', 'station'];
    
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        error: `Type invalide. Types autorisés: ${validTypes.join(', ')}`,
      });
    }

    const result = await placesV2Service.searchPOI(
      latitude,
      longitude,
      type,
      radius || 5000
    );

    if (result.success) {
      return res.status(200).json({
        success: true,
        count: result.data.length,
        data: result.data,
      });
    }

    return res.status(404).json(result);
  } catch (error) {
    console.error('Erreur searchPOI:', error);
    return res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de la recherche de POI',
    });
  }
};

/**
 * RECHERCHE DE TOUTES LES STATIONS TOTALENERGIES
 * GET /api/places/totalenergies/all
 */
const getAllTotalEnergies = async (req, res) => {
  try {
    const result = await placesV2Service.searchAllTotalEnergies();

    if (result.success) {
      return res.status(200).json({
        success: true,
        count: result.data.length,
        data: result.data,
      });
    }

    return res.status(404).json(result);
  } catch (error) {
    console.error('Erreur getAllTotalEnergies:', error);
    return res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de la recherche des stations TotalEnergies',
    });
  }
};

/**
 * RECHERCHE DE STATIONS TOTALENERGIES À PROXIMITÉ
 * POST /api/places/totalenergies/nearby
 */
const getNearbyTotalEnergies = async (req, res) => {
  try {
    const { latitude, longitude, radius } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        error: 'Les coordonnées (latitude, longitude) sont requises',
      });
    }

    const result = await placesV2Service.searchNearbyTotalEnergies(
      latitude,
      longitude,
      radius || 10000
    );

    if (result.success) {
      return res.status(200).json({
        success: true,
        count: result.data.length,
        data: result.data,
        userLocation: { latitude, longitude },
      });
    }

    return res.status(404).json(result);
  } catch (error) {
    console.error('Erreur getNearbyTotalEnergies:', error);
    return res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de la recherche de stations TotalEnergies à proximité',
    });
  }
};

/**
 * LISTE DES TYPES DE LIEUX
 * GET /api/places/types/list
 */
const getPlaceTypes = (req, res) => {
  try {
    const types = {
      communes: ['locality', 'sublocality', 'neighborhood', 'administrative_area_level_3'],
      transport: ['bus_station', 'transit_station', 'taxi_stand', 'airport', 'train_station'],
      commercial: ['shopping_mall', 'supermarket', 'store', 'market', 'department_store'],
      education: ['school', 'university', 'library'],
      health: ['hospital', 'pharmacy', 'doctor', 'dentist'],
      hospitality: ['hotel', 'lodging', 'resort_hotel'],
      food: ['restaurant', 'cafe', 'bar', 'bakery', 'meal_takeaway'],
      services: ['atm', 'bank', 'gas_station', 'car_repair', 'parking'],
      entertainment: ['movie_theater', 'night_club', 'stadium', 'park'],
      religious: ['church', 'mosque', 'hindu_temple', 'synagogue'],
    };

    return res.json({
      success: true,
      data: types,
    });
  } catch (error) {
    console.error('Erreur types:', error);
    return res.status(500).json({
      success: false,
      error: 'Erreur serveur',
    });
  }
};

module.exports = {
  searchText,
  searchNearby,
  autocomplete,
  getPlaceDetails,
  searchCommunes,
  searchGaresRoutieres,
  searchStationsProches,
  searchPolices,
  searchStations,
  searchPOI,
  getAllTotalEnergies,      
  getNearbyTotalEnergies,
  getPlaceTypes,
};