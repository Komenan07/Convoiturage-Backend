// controllers/placesV2Controller.js
const placesV2Service = require('../services/placesV2Service');

/**
 * Vérifie que latitude/longitude sont des nombres valides
 * (corrige le bug où une coordonnée = 0 était rejetée par !latitude)
 */
const hasValidCoords = (latitude, longitude) => {
  return (
    latitude !== undefined &&
    latitude !== null &&
    longitude !== undefined &&
    longitude !== null &&
    !Number.isNaN(Number(latitude)) &&
    !Number.isNaN(Number(longitude))
  );
};

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

    if (location && hasValidCoords(location.latitude, location.longitude)) {
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
        metadata: {
          ...result.metadata,
          query,
          location: location || null
        }
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

    if (!hasValidCoords(latitude, longitude)) {
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

    // ✅ Passer location pour avoir la distance
    if (location && hasValidCoords(location.latitude, location.longitude)) {
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
        metadata: {
          ...result.metadata,
          input,
          location: location || null
        }
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
 * HEALTH CHECK
 * GET /api/places/health
 */
const healthCheck = async (req, res) => {
  try {
    const result = await placesV2Service.healthCheck();
    const statusCode = result.status === 'operational' ? 200 : 503;
    return res.status(statusCode).json({
      success: result.status === 'operational',
      ...result
    });
  } catch (error) {
    console.error('Erreur healthCheck:', error);
    return res.status(500).json({
      success: false,
      error: 'Erreur serveur lors du health check'
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
 * Récupère plusieurs lieux par leurs Place IDs
 * @route POST /api/places/batch
 * @body {array} placeIds - Tableau de Place IDs
 */
const getBatchPlaceDetails = async (req, res) => {
  try {
    const { placeIds } = req.body;

    // Validation
    if (!placeIds || !Array.isArray(placeIds)) {
      return res.status(400).json({
        success: false,
        error: 'Un tableau de Place IDs est requis',
      });
    }

    if (placeIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Le tableau de Place IDs ne peut pas être vide',
      });
    }

    if (placeIds.length > 50) {
      return res.status(400).json({
        success: false,
        error: 'Maximum 50 Place IDs par requête',
      });
    }

    // Récupérer les détails de chaque lieu
    const results = await Promise.allSettled(
      placeIds.map(placeId => placesV2Service.getPlaceDetails(placeId))
    );

    const successfulResults = [];
    const failedResults = [];

    results.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value.success) {
        successfulResults.push({
          placeId: placeIds[index],
          data: result.value.data,
        });
      } else {
        failedResults.push({
          placeId: placeIds[index],
          error: result.status === 'fulfilled'
            ? result.value.error
            : result.reason.message,
        });
      }
    });

    return res.status(200).json({
      success: true,
      data: successfulResults,
      failed: failedResults,
      metadata: {
        total: placeIds.length,
        successful: successfulResults.length,
        failed: failedResults.length,
      },
    });

  } catch (error) {
    console.error('Erreur getBatchPlaceDetails:', error);
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

    if (!hasValidCoords(latitude, longitude)) {
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

    if (!hasValidCoords(latitude, longitude)) {
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

    if (!hasValidCoords(latitude, longitude)) {
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

    if (!hasValidCoords(latitude, longitude)) {
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

    if (!hasValidCoords(latitude, longitude)) {
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
 * RECHERCHE AVEC FILTRES AVANCÉS
 * POST /api/places/search/filtered
 */
const searchWithFilters = async (req, res) => {
  try {
    const {
      query,
      latitude,
      longitude,
      radius,
      minRating,
      maxPrice,
      categories,
      openNow,
      maxResults
    } = req.body;

    if (!query || query.trim().length < 2) {
      return res.status(400).json({
        success: false,
        error: 'La requête doit contenir au moins 2 caractères'
      });
    }

    // ✅ Mapping catégories → types Google Places valides
    const categoryMapping = {
      'restaurants': ['restaurant', 'cafe', 'bar'],
      'shopping': ['shopping_mall', 'supermarket', 'store'],
      'health': ['hospital', 'pharmacy', 'doctor'],
      'education': ['school', 'university'],
      'transport': ['bus_station', 'train_station', 'taxi_stand'],
      'hotels': ['hotel', 'lodging'],
      'services': ['bank', 'atm', 'police', 'gas_station'],
      'entertainment': ['movie_theater', 'night_club', 'stadium', 'park']
    };

    const options = {
      maxResults: maxResults || 20,
    };

    if (hasValidCoords(latitude, longitude)) {
      options.location = { latitude, longitude };
      options.rankPreference = 'DISTANCE';
    } else {
      options.rankPreference = 'RELEVANCE';
    }

    if (radius) options.radius = radius;
    if (minRating) options.minRating = minRating;

    // ✅ Convertir les catégories en types Google valides
    if (categories && Array.isArray(categories) && categories.length > 0) {
      const googleTypes = categories.flatMap(cat => categoryMapping[cat] || [cat]);
      if (googleTypes.length > 0) {
        options.includedTypes = googleTypes;
      }
    }

    const result = await placesV2Service.searchText(query, options);

    if (!result.success) {
      return res.status(404).json(result);
    }

    let filteredData = result.data;

    if (openNow) {
      filteredData = filteredData.filter(place => place.isOpen === true);
    }

    if (maxPrice !== undefined) {
      filteredData = filteredData.filter(place =>
        place.priceLevel !== null && place.priceLevel <= maxPrice
      );
    }

    return res.status(200).json({
      success: true,
      count: filteredData.length,
      data: filteredData,
      filters: { minRating, maxPrice, categories, openNow, radius },
      metadata: result.metadata
    });

  } catch (error) {
    console.error('Erreur searchWithFilters:', error);
    return res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de la recherche filtrée'
    });
  }
};

/**
 * RECHERCHE DE LIEUX POPULAIRES
 * GET /api/places/popular?latitude=x&longitude=y&radius=z
 */
const getPopularPlaces = async (req, res) => {
  try {
    const { latitude, longitude, radius, limit } = req.query;

    if (!hasValidCoords(latitude, longitude)) {
      return res.status(400).json({
        success: false,
        error: 'Les coordonnées sont requises'
      });
    }

    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    const searchRadius = radius ? parseInt(radius, 10) : 5000;
    const totalLimit = limit ? parseInt(limit, 10) : 20;

    const popularTypes = [
      'restaurant',
      'cafe',
      'shopping_mall',
      'supermarket',
      'pharmacy',
      'hotel',
      'park'
    ];

    const perTypeLimit = Math.max(1, Math.floor(totalLimit / popularTypes.length));

    const results = await Promise.all(
      popularTypes.map(type =>
        placesV2Service.searchNearby(
          lat,
          lng,
          {
            includedTypes: [type],
            radius: searchRadius,
            maxResults: Math.min(perTypeLimit, 5),
            rankPreference: 'DISTANCE'
          }
        )
      )
    );

    // Fusionner et trier par note
    const allPlaces = results
      .filter(r => r.success)
      .flatMap(r => r.data)
      .filter(place => place.rating && place.rating >= 3.5)
      .sort((a, b) => (b.rating || 0) - (a.rating || 0))
      .slice(0, totalLimit);

    return res.status(200).json({
      success: true,
      count: allPlaces.length,
      data: allPlaces,
      metadata: {
        searchCenter: { latitude: lat, longitude: lng },
        radius: searchRadius
      }
    });

  } catch (error) {
    console.error('Erreur getPopularPlaces:', error);
    return res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de la récupération des lieux populaires'
    });
  }
};

/**
 * RECHERCHE DE LIEUX À PROXIMITÉ PAR CATÉGORIE
 * POST /api/places/nearby/category
 */
const searchNearbyByCategory = async (req, res) => {
  try {
    const { latitude, longitude, category, radius, maxResults } = req.body;

    if (!hasValidCoords(latitude, longitude)) {
      return res.status(400).json({
        success: false,
        error: 'Les coordonnées sont requises'
      });
    }

    if (!category) {
      return res.status(400).json({
        success: false,
        error: 'La catégorie est requise'
      });
    }

    // Mapping des catégories vers les types Google Places
    const categoryMapping = {
      'restaurants': ['restaurant', 'cafe', 'bar'],
      'shopping': ['shopping_mall', 'supermarket', 'store'],
      'health': ['hospital', 'pharmacy', 'doctor'],
      'education': ['school', 'university'],
      'transport': ['bus_station', 'train_station', 'taxi_stand'],
      'hotels': ['hotel', 'lodging'],
      'services': ['bank', 'atm', 'police', 'gas_station'],
      'entertainment': ['movie_theater', 'night_club', 'stadium', 'park']
    };

    const types = categoryMapping[category] || [category];

    const result = await placesV2Service.searchNearby(
      latitude,
      longitude,
      {
        includedTypes: types,
        radius: radius || 5000,
        maxResults: maxResults || 20,
        rankPreference: 'DISTANCE'
      }
    );

    return res.status(200).json({
      success: result.success,
      count: result.success ? result.data.length : 0,
      data: result.success ? result.data : [],
      category,
      metadata: {
        searchCenter: { latitude, longitude },
        radius: radius || 5000,
        typesSearched: types
      }
    });

  } catch (error) {
    console.error('Erreur searchNearbyByCategory:', error);
    return res.status(500).json({
      success: false,
      error: 'Erreur serveur lors de la recherche par catégorie'
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

    if (!hasValidCoords(latitude, longitude)) {
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
  healthCheck,
  getPlaceDetails,
  getBatchPlaceDetails,
  searchCommunes,
  searchGaresRoutieres,
  searchStationsProches,
  searchPolices,
  searchStations,
  searchPOI,
  getAllTotalEnergies,
  getNearbyTotalEnergies,
  getPlaceTypes,
  searchWithFilters,
  getPopularPlaces,
  searchNearbyByCategory,
};