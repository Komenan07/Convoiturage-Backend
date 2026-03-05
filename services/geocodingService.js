// services/geocodingService.js

const { ABIDJAN_GEO_DATA, COMMUNE_ALIASES } = require('../data/abidjanGeoData');
const { logger } = require('../utils/logger');

/**
 * Service de geocoding local pour Abidjan
 * Convertit un nom de commune/quartier en coordonnées GPS
 * sans aucun appel API externe.
 */
class GeocodingService {

  // ============================================================
  // MÉTHODE PRINCIPALE
  // ============================================================

  /**
   * Résoudre une commune + quartier en coordonnées GPS
   *
   * @param {string} commune   - Ex: "Cocody"
   * @param {string} quartier  - Ex: "Saint Jean" (optionnel)
   * @returns {{ lat, lng, label, precision } | null}
   *
   * @example
   * resolve("Cocody", "Saint Jean")
   * // → { lat: 5.3601, lng: -3.9969, label: "Saint Jean, Cocody", precision: "quartier" }
   *
   * resolve("Plateau")
   * // → { lat: 5.3196, lng: -4.0167, label: "Plateau", precision: "commune" }
   */
  resolve(commune, quartier = null) {
    if (!commune) return null;

    const communeKey = this._normalizeCommune(commune);
    const communeData = ABIDJAN_GEO_DATA[communeKey];

    if (!communeData) {
      logger.warn(`Commune inconnue: "${commune}"`);
      return null;
    }

    if (quartier) {
      const quartierKey = this._normalizeText(quartier);
      const quartierData = communeData.quartiers[quartierKey];

      if (quartierData) {
        return {
          lat:       quartierData.lat,
          lng:       quartierData.lng,
          label:     `${this._capitalize(quartier)}, ${this._capitalize(commune)}`,
          precision: 'quartier'
        };
      }
      logger.warn(`Quartier "${quartier}" non trouvé dans "${commune}", utilisation centre commune`);
    }

    return {
      lat:       communeData.centre.lat,
      lng:       communeData.centre.lng,
      label:     this._capitalize(commune),
      precision: 'commune'
    };
  }

  // ============================================================
  // RÉSOLUTION FLOUE (gère les fautes de frappe)
  // ============================================================

  /**
   * Comme resolve() mais tolère les fautes de frappe légères
   * Utilise la distance de Levenshtein (similarité de texte)
   *
   * @param {string} commune
   * @param {string} quartier
   * @returns {{ lat, lng, label, precision, score } | null}
   */
  fuzzyResolve(commune, quartier = null) {
    // Essayer d'abord la résolution exacte
    const exact = this.resolve(commune, quartier);
    if (exact) return { ...exact, score: 1.0 };

    if (!quartier) return null;

    const communeKey = this._normalizeCommune(commune);
    const communeData = ABIDJAN_GEO_DATA[communeKey];
    if (!communeData) return null;

    const quartierKey = this._normalizeText(quartier);
    let bestMatch = null;
    let bestScore = 0;

    for (const [key, coords] of Object.entries(communeData.quartiers)) {
      const score = this._similarity(quartierKey, key);
      if (score > bestScore && score >= 0.6) {
        bestScore = score;
        bestMatch = { key, coords };
      }
    }

    if (bestMatch) {
      return {
        lat:       bestMatch.coords.lat,
        lng:       bestMatch.coords.lng,
        label:     `${this._capitalize(bestMatch.key)}, ${this._capitalize(commune)}`,
        precision: 'quartier_fuzzy',
        score:     bestScore
      };
    }

    // Aucune correspondance → centre de la commune
    return this.resolve(commune);
  }

  // ============================================================
  // INFORMATIONS DISPONIBLES
  // ============================================================

  getCommunes() {
    return Object.keys(ABIDJAN_GEO_DATA).map(key => ({
      key,
      label:          this._capitalize(key),
      centre:         ABIDJAN_GEO_DATA[key].centre,
      nombreQuartiers: Object.keys(ABIDJAN_GEO_DATA[key].quartiers).length
    }));
  }

  getQuartiers(commune) {
    const communeKey = this._normalizeCommune(commune);
    const communeData = ABIDJAN_GEO_DATA[communeKey];
    if (!communeData) return [];
    return Object.entries(communeData.quartiers).map(([key, coords]) => ({
      key, label: this._capitalize(key), ...coords
    }));
  }

  communeExists(commune) {
    return !!ABIDJAN_GEO_DATA[this._normalizeCommune(commune)];
  }

  /**
 * Trouve la commune et le quartier les plus proches de coordonnées GPS
 *
 * @param {number} lat
 * @param {number} lng
 * @returns {{ commune, quartier, distanceKm, label } | null}
 *
 * @example
 * reverseGeocode(5.3196, -4.0167)
 * // → { commune: "plateau", quartier: "plateau centre", distanceKm: 0.02, label: "Plateau Centre, Plateau" }
 */
reverseGeocode(lat, lng) {
  if (!lat || !lng) return null;

  let bestMatch  = null;
  let bestDistance = Infinity;

  for (const [communeKey, communeData] of Object.entries(ABIDJAN_GEO_DATA)) {

    // Parcourir chaque quartier de la commune
    for (const [quartierKey, coords] of Object.entries(communeData.quartiers)) {
      const dist = this._haversineKm(lat, lng, coords.lat, coords.lng);

      if (dist < bestDistance) {
        bestDistance = dist;
        bestMatch = {
          commune:    communeKey,
          quartier:   quartierKey,
          distanceKm: parseFloat(dist.toFixed(2)),
          label:      `${this._capitalize(quartierKey)}, ${this._capitalize(communeKey)}`
        };
      }
    }

    // Vérifier aussi le centre de la commune (cas sans quartiers détaillés)
    const distCentre = this._haversineKm(
      lat, lng,
      communeData.centre.lat,
      communeData.centre.lng
    );
    if (distCentre < bestDistance) {
      bestDistance = distCentre;
      bestMatch = {
        commune:    communeKey,
        quartier:   null,
        distanceKm: parseFloat(distCentre.toFixed(2)),
        label:      this._capitalize(communeKey)
      };
    }
  }

  // Seuil de 3 km — au-delà on ne peut pas être sûr de la zone
  if (!bestMatch || bestMatch.distanceKm > 3) {
    logger.warn(`Reverse geocoding: aucune zone trouvée près de (${lat}, ${lng})`);
    return null;
  }

  logger.info(`Reverse geocoding: (${lat}, ${lng}) → ${bestMatch.label} (${bestMatch.distanceKm} km)`);
  return bestMatch;
}

/**
 * Distance Haversine en km — usage interne uniquement
 */
_haversineKm(lat1, lng1, lat2, lng2) {
  const R    = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a    = Math.sin(dLat / 2) ** 2 +
               Math.cos(lat1 * Math.PI / 180) *
               Math.cos(lat2 * Math.PI / 180) *
               Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
  // ============================================================
  // UTILITAIRES PRIVÉS
  // ============================================================

  _normalizeCommune(commune) {
    const normalized = this._normalizeText(commune);
    return COMMUNE_ALIASES[normalized] || normalized;
  }

  _normalizeText(text) {
    return text
      .toLowerCase()
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // supprimer accents
      .replace(/\s+/g, ' ');
  }

  _capitalize(text) {
    return text.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  _similarity(a, b) {
    const maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) return 1.0;
    return (maxLen - this._levenshtein(a, b)) / maxLen;
  }

  _levenshtein(a, b) {
    const m = [];
    for (let i = 0; i <= b.length; i++) m[i] = [i];
    for (let j = 0; j <= a.length; j++) m[0][j] = j;
    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        m[i][j] = b[i-1] === a[j-1]
          ? m[i-1][j-1]
          : Math.min(m[i-1][j-1]+1, m[i][j-1]+1, m[i-1][j]+1);
      }
    }
    return m[b.length][a.length];
  }
}

const geocodingService = new GeocodingService();
module.exports = geocodingService;