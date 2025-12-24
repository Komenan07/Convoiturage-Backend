// services/distanceService.js - VERSION ADAPTÉE WAYZ-ECO

const axios = require('axios');
const { Client } = require('@googlemaps/google-maps-services-js');

// ============================================
// CONFIGURATION
// ============================================
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const GOOGLE_MAPS_ENABLED = process.env.GOOGLE_MAPS_ENABLED === 'true';
const USE_OSRM_FALLBACK = process.env.USE_OSRM_FALLBACK !== 'false';
const USE_HAVERSINE_FALLBACK = process.env.USE_HAVERSINE_FALLBACK !== 'false';
const OSRM_BASE_URL = 'https://router.project-osrm.org';

// Cache & Rate Limiting
const MAX_CACHE_SIZE = parseInt(process.env.MAX_CACHE_SIZE || 1000);
const CACHE_DURATION = parseInt(process.env.CACHE_DURATION_HOURS || 24) * 60 * 60 * 1000;
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_PER_USER_DAILY || 100);
const RATE_LIMIT_WINDOW = 24 * 60 * 60 * 1000;

// Timeouts
const DISTANCE_TIMEOUT = parseInt(process.env.DISTANCE_CALCULATION_TIMEOUT || 10000);
const MAX_RETRIES = parseInt(process.env.MAX_DISTANCE_RETRIES || 3);

// Initialiser le client Google Maps
const googleMapsClient = new Client({});

// Stockage en mémoire
const distanceCache = new Map();
const rateLimits = new Map();

// Analytics
const analytics = {
  requests: { 
    total: 0, 
    googleMaps: 0, 
    osrm: 0, 
    haversine: 0, 
    cacheHits: 0 
  },
  costs: { 
    googleMapsTotal: 0 
  },
  errors: { 
    googleMaps: 0, 
    osrm: 0, 
    haversine: 0 
  }
};

// ============================================
// FONCTIONS UTILITAIRES
// ============================================

/**
 * Valider les coordonnées GPS
 */
function validateCoordinates(coords, name) {
  if (!Array.isArray(coords) || coords.length !== 2) {
    throw new Error(`${name}: coordonnées invalides - format attendu [longitude, latitude]`);
  }
  
  const [lng, lat] = coords;
  
  if (typeof lng !== 'number' || typeof lat !== 'number') {
    throw new Error(`${name}: les coordonnées doivent être des nombres`);
  }
  
  if (lng < -180 || lng > 180) {
    throw new Error(`${name}: longitude invalide (${lng}). Doit être entre -180 et 180`);
  }
  
  if (lat < -90 || lat > 90) {
    throw new Error(`${name}: latitude invalide (${lat}). Doit être entre -90 et 90`);
  }
}

/**
 * Vérifier le rate limiting par utilisateur
 */
function checkRateLimit(userId) {
  if (!userId) return true;
  
  const now = Date.now();
  const userLimit = rateLimits.get(userId);
  
  if (!userLimit || now > userLimit.resetAt) {
    rateLimits.set(userId, { 
      count: 1, 
      resetAt: now + RATE_LIMIT_WINDOW 
    });
    return true;
  }
  
  if (userLimit.count >= RATE_LIMIT_MAX) {
    const resetIn = Math.ceil((userLimit.resetAt - now) / (60 * 60 * 1000));
    throw new Error(
      `Limite de requêtes atteinte (${RATE_LIMIT_MAX}/jour). ` +
      `Réinitialisation dans ${resetIn}h`
    );
  }
  
  userLimit.count++;
  return true;
}

/**
 * Logger les analytics
 */
function logAnalytics(provider, fromCache = false) {
  analytics.requests.total++;
  
  if (fromCache) {
    analytics.requests.cacheHits++;
    return;
  }
  
  if (provider === 'googleMaps') {
    analytics.requests.googleMaps++;
    analytics.costs.googleMapsTotal += 0.005; // $5 / 1000 requêtes
  } else if (provider === 'osrm') {
    analytics.requests.osrm++;
  } else if (provider === 'haversine') {
    analytics.requests.haversine++;
  }
}

/**
 * Générer une clé de cache unique
 */
function generateCacheKey(origin, destination, mode) {
  return `${origin[0]},${origin[1]}-${destination[0]},${destination[1]}-${mode}`;
}

/**
 * Vérifier le cache
 */
function checkCache(key) {
  const cached = distanceCache.get(key);
  const now = Date.now();
  
  // Si l'entrée est expirée, la supprimer
  if (cached && (now - cached.timestamp >= CACHE_DURATION)) {
    distanceCache.delete(key);
    return null;
  }
  
  // Lazy cleanup: nettoyer quelques entrées aléatoirement
  if (Math.random() < 0.01) {
    cleanupExpiredCacheLazy(5);
  }
  
  if (cached) {
    console.log('✅ Résultat trouvé dans le cache');
    return cached.data;
  }
  
  return null;
}

/**
 * Sauvegarder dans le cache
 */
function saveToCache(key, data) {
  // Si le cache est plein, supprimer l'entrée la plus ancienne
  if (distanceCache.size >= MAX_CACHE_SIZE) {
    const oldestKey = distanceCache.keys().next().value;
    distanceCache.delete(oldestKey);
    console.log('⚠️  Cache plein - suppression entrée la plus ancienne');
  }
  
  distanceCache.set(key, { 
    data, 
    timestamp: Date.now() 
  });
}

/**
 * Nettoyage lazy du cache expiré
 */
function cleanupExpiredCacheLazy(maxToClean = 5) {
  const now = Date.now();
  let cleaned = 0;
  
  for (const [key, value] of distanceCache.entries()) {
    if (cleaned >= maxToClean) break;
    
    if (now - value.timestamp > CACHE_DURATION) {
      distanceCache.delete(key);
      cleaned++;
    }
  }
  
  if (cleaned > 0) {
    console.log(`🧹 Lazy cleanup: ${cleaned} entrées supprimées`);
  }
}

/**
 * Retry avec backoff exponentiel
 */
async function retryWithBackoff(fn, maxRetries = MAX_RETRIES, baseDelay = 1000) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // Ne pas retry sur erreurs permanentes
      if (error.message.includes('Route not found') || 
          error.message.includes('ZERO_RESULTS') ||
          error.message.includes('INVALID_REQUEST')) {
        throw error;
      }
      
      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt - 1);
        console.log(`⚠️  Tentative ${attempt}/${maxRetries} échouée, retry dans ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError;
}

// ============================================
// MÉTHODES DE CALCUL DE DISTANCE
// ============================================

/**
 * MÉTHODE 1 : Google Maps Distance Matrix API
 */
async function calculateDistanceWithGoogleMaps(origin, destination, mode = 'driving', departureTime = null) {
  return retryWithBackoff(async () => {
    console.log('🗺️  Calcul avec Google Maps Distance Matrix API...');

    const params = {
      origins: [`${origin[1]},${origin[0]}`], // Google utilise lat,lng
      destinations: [`${destination[1]},${destination[0]}`],
      mode: mode, // driving, walking, bicycling, transit
      language: 'fr',
      units: 'metric'
    };

    // Ajouter l'heure de départ pour le trafic en temps réel
    if (departureTime) {
      params.departure_time = departureTime;
      params.traffic_model = 'best_guess'; // best_guess, pessimistic, optimistic
    }

    const response = await googleMapsClient.distancematrix({
      params: {
        ...params,
        key: GOOGLE_MAPS_API_KEY
      },
      timeout: DISTANCE_TIMEOUT
    });

    if (response.data.status !== 'OK') {
      throw new Error(`Google Maps API error: ${response.data.status}`);
    }

    const element = response.data.rows[0].elements[0];

    if (element.status !== 'OK') {
      throw new Error(`Route not found: ${element.status}`);
    }

    const distanceMeters = element.distance.value;
    const durationSeconds = element.duration.value;
    const durationInTrafficSeconds = element.duration_in_traffic?.value || durationSeconds;

    const result = {
      distance: distanceMeters,
      distanceKm: (distanceMeters / 1000).toFixed(1),
      distanceText: element.distance.text,
      duration: durationSeconds,
      durationMinutes: Math.ceil(durationSeconds / 60),
      durationText: element.duration.text,
      durationInTraffic: durationInTrafficSeconds,
      durationInTrafficMinutes: Math.ceil(durationInTrafficSeconds / 60),
      provider: 'googleMaps',
      mode: mode
    };

    console.log('✅ Google Maps:', result.distanceText, '-', result.durationText);
    return result;
  });
}

/**
 * MÉTHODE 2 : OSRM (Fallback gratuit)
 */
async function calculateDistanceWithOSRM(origin, destination, mode = 'driving') {
  try {
    console.log('🛣️  Calcul avec OSRM (fallback gratuit)...');

    const profile = mode === 'walking' ? 'foot' : 'car';
    const url = `${OSRM_BASE_URL}/route/v1/${profile}/${origin[0]},${origin[1]};${destination[0]},${destination[1]}?overview=false`;

    const response = await axios.get(url, { timeout: DISTANCE_TIMEOUT });

    if (response.data.code !== 'Ok') {
      throw new Error(`OSRM error: ${response.data.code}`);
    }

    const route = response.data.routes[0];
    const distanceMeters = route.distance;
    const durationSeconds = route.duration;

    const result = {
      distance: distanceMeters,
      distanceKm: (distanceMeters / 1000).toFixed(1),
      distanceText: `${(distanceMeters / 1000).toFixed(1)} km`,
      duration: durationSeconds,
      durationMinutes: Math.ceil(durationSeconds / 60),
      durationText: `${Math.ceil(durationSeconds / 60)} min`,
      provider: 'osrm',
      mode: mode
    };

    console.log('✅ OSRM:', result.distanceText, '-', result.durationText);
    return result;

  } catch (error) {
    console.error('❌ Erreur OSRM:', error.message);
    throw error;
  }
}

/**
 * MÉTHODE 3 : Haversine (Fallback vol d'oiseau)
 */
function calculateDistanceHaversine(origin, destination) {
  console.log('📐 Calcul à vol d\'oiseau (Haversine)...');

  const [lon1, lat1] = origin;
  const [lon2, lat2] = destination;

  const R = 6371; // Rayon de la Terre en km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distanceKm = R * c;
  
  // Estimation durée (60 km/h moyenne en ville ivoirienne)
  const durationMinutes = Math.ceil((distanceKm / 60) * 60);

  const result = {
    distance: distanceKm * 1000,
    distanceKm: distanceKm.toFixed(1),
    distanceText: `${distanceKm.toFixed(1)} km (à vol d'oiseau)`,
    duration: durationMinutes * 60,
    durationMinutes: durationMinutes,
    durationText: `~${durationMinutes} min`,
    provider: 'haversine',
    mode: 'estimated'
  };

  console.log('✅ Haversine:', result.distanceText);
  return result;
}

// ============================================
// FONCTION PRINCIPALE
// ============================================

/**
 * Calculer la distance avec fallback cascade
 * Google Maps → OSRM → Haversine
 */
async function calculateDistance(origin, destination, options = {}) {
  const {
    mode = 'driving',
    departureTime = null,
    useCache = true,
    userId = null
  } = options;

  // Validations
  validateCoordinates(origin, 'origin');
  validateCoordinates(destination, 'destination');
  
  // Rate limiting
  if (process.env.NODE_ENV !== 'development') {
    checkRateLimit(userId);
  }

  // Vérifier le cache
  if (useCache) {
    const cacheKey = generateCacheKey(origin, destination, mode);
    const cached = checkCache(cacheKey);
    if (cached) {
      logAnalytics(cached.provider, true);
      return cached;
    }
  }

  let result = null;
  const errors = [];

  // TENTATIVE 1 : Google Maps
  if (GOOGLE_MAPS_ENABLED && GOOGLE_MAPS_API_KEY) {
    try {
      result = await calculateDistanceWithGoogleMaps(origin, destination, mode, departureTime);
      logAnalytics('googleMaps');
      
      if (useCache) {
        const cacheKey = generateCacheKey(origin, destination, mode);
        saveToCache(cacheKey, result);
      }
      
      return result;
    } catch (error) {
      console.warn('⚠️  Google Maps échoué, passage au fallback...');
      analytics.errors.googleMaps++;
      errors.push({ provider: 'google_maps', error: error.message });
    }
  }

  // TENTATIVE 2 : OSRM
  if (USE_OSRM_FALLBACK) {
    try {
      result = await calculateDistanceWithOSRM(origin, destination, mode);
      logAnalytics('osrm');
      
      if (useCache) {
        const cacheKey = generateCacheKey(origin, destination, mode);
        saveToCache(cacheKey, result);
      }
      
      return result;
    } catch (error) {
      console.warn('⚠️  OSRM échoué, passage à Haversine...');
      analytics.errors.osrm++;
      errors.push({ provider: 'osrm', error: error.message });
    }
  }

  // TENTATIVE 3 : Haversine
  if (USE_HAVERSINE_FALLBACK) {
    try {
      result = calculateDistanceHaversine(origin, destination);
      logAnalytics('haversine');
      
      if (useCache) {
        const cacheKey = generateCacheKey(origin, destination, mode);
        saveToCache(cacheKey, result);
      }
      
      return result;
    } catch (error) {
      analytics.errors.haversine++;
      errors.push({ provider: 'haversine', error: error.message });
    }
  }

  // Si tout a échoué
  throw new Error(`Tous les services ont échoué: ${JSON.stringify(errors)}`);
}

/**
 * Calcul multi-mode (voiture + piéton)
 */
async function calculateMultiMode(origin, destination, departureTime = null, userId = null) {
  try {
    console.log('🚗🚶 Calcul multi-mode...');

    const [driving, walking] = await Promise.all([
      calculateDistance(origin, destination, { mode: 'driving', departureTime, userId }),
      calculateDistance(origin, destination, { mode: 'walking', departureTime, userId })
    ]);

    return {
      driving,
      walking,
      provider: driving.provider
    };

  } catch (error) {
    console.error('❌ Erreur calcul multi-mode:', error);
    throw error;
  }
}

/**
 * Calculer l'heure d'arrivée (avec gestion changement de jour)
 */
function calculateArrivalTime(departureTime, durationMinutes, departureDate = null) {
  // Utiliser la date du trajet si fournie
  const baseDate = departureDate ? new Date(departureDate) : new Date();
  
  // Parser l'heure de départ
  const [hours, minutes] = departureTime.split(':').map(Number);
  
  // Créer la date/heure de départ complète
  const departure = new Date(baseDate);
  departure.setHours(hours, minutes, 0, 0);
  
  // Calculer l'heure d'arrivée
  const arrival = new Date(departure.getTime() + durationMinutes * 60000);
  
  // Vérifier le changement de jour
  const sameDay = departure.getDate() === arrival.getDate() &&
                  departure.getMonth() === arrival.getMonth() &&
                  departure.getFullYear() === arrival.getFullYear();
  
  const arrivalTime = arrival.toTimeString().slice(0, 5);
  
  return {
    heure: arrivalTime,
    date: arrival.toISOString().split('T')[0],
    changementDeJour: !sameDay,
    joursApres: sameDay ? 0 : Math.floor((arrival - departure) / (24 * 60 * 60 * 1000))
  };
}

/**
 * Obtenir les directions détaillées (Google Maps)
 */
async function getDetailedDirections(origin, destination, mode = 'driving') {
  try {
    if (!GOOGLE_MAPS_ENABLED || !GOOGLE_MAPS_API_KEY) {
      throw new Error('Google Maps non configuré');
    }

    console.log('🧭 Récupération itinéraire détaillé...');

    const response = await googleMapsClient.directions({
      params: {
        origin: `${origin[1]},${origin[0]}`,
        destination: `${destination[1]},${destination[0]}`,
        mode: mode,
        language: 'fr',
        key: GOOGLE_MAPS_API_KEY
      },
      timeout: DISTANCE_TIMEOUT
    });

    if (response.data.status !== 'OK') {
      throw new Error(`Directions API error: ${response.data.status}`);
    }

    const route = response.data.routes[0];
    const leg = route.legs[0];

    return {
      distance: leg.distance.value,
      distanceText: leg.distance.text,
      duration: leg.duration.value,
      durationText: leg.duration.text,
      startAddress: leg.start_address,
      endAddress: leg.end_address,
      steps: leg.steps.map(step => ({
        instruction: step.html_instructions.replace(/<[^>]*>/g, ''),
        distance: step.distance.text,
        duration: step.duration.text
      })),
      polyline: route.overview_polyline.points,
      bounds: route.bounds
    };

  } catch (error) {
    console.error('❌ Erreur directions:', error.message);
    throw error;
  }
}

// ============================================
// RAPPORTS & MONITORING
// ============================================

/**
 * Obtenir le rapport d'analytics
 */
function getAnalyticsReport() {
  const cacheHitRate = analytics.requests.total > 0
    ? ((analytics.requests.cacheHits / analytics.requests.total) * 100).toFixed(2)
    : 0;
  
  return {
    requests: analytics.requests,
    cacheHitRate: `${cacheHitRate}%`,
    cacheSize: distanceCache.size,
    costs: {
      totalToday: `$${analytics.costs.googleMapsTotal.toFixed(4)}`,
      estimatedMonthly: `$${(analytics.costs.googleMapsTotal * 30).toFixed(2)}`,
      savedByCache: `$${(analytics.requests.cacheHits * 0.005).toFixed(4)}`
    },
    errors: analytics.errors,
    rateLimitsActive: rateLimits.size
  };
}

/**
 * Réinitialiser les analytics
 */
function resetAnalytics() {
  analytics.requests = { total: 0, googleMaps: 0, osrm: 0, haversine: 0, cacheHits: 0 };
  analytics.costs = { googleMapsTotal: 0 };
  analytics.errors = { googleMaps: 0, osrm: 0, haversine: 0 };
  console.log('📊 Analytics réinitialisées');
}

/**
 * Vider le cache manuellement
 */
function clearCache() {
  const size = distanceCache.size;
  distanceCache.clear();
  console.log(`🧹 Cache vidé: ${size} entrées supprimées`);
  return size;
}

/**
 * Vider les rate limits
 */
function clearRateLimits() {
  const size = rateLimits.size;
  rateLimits.clear();
  console.log(`🧹 Rate limits réinitialisés: ${size} utilisateurs`);
  return size;
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  // Fonctions principales
  calculateDistance,
  calculateMultiMode,
  calculateArrivalTime,
  getDetailedDirections,
  
  // Méthodes spécifiques (si besoin direct)
  calculateDistanceWithGoogleMaps,
  calculateDistanceWithOSRM,
  calculateDistanceHaversine,
  
  // Monitoring & gestion
  getAnalyticsReport,
  resetAnalytics,
  clearCache,
  clearRateLimits
};