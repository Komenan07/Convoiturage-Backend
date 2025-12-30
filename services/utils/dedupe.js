// services/utils/dedupe.js
const crypto = require('crypto');

/**
 * Utilitaire de déduplication d'événements
 * Génère des clés uniques pour identifier les doublons
 */
class Dedupe {
  
  /**
   * Génère une clé unique pour un événement
   * Basée sur : nom, date, lieu
   */
  static getKey(evenement) {
    if (!evenement) {
      throw new Error('Événement requis pour générer une clé');
    }

    // Utiliser l'identifiant externe si disponible
    if (evenement.identifiantExterne && evenement.source) {
      return `${evenement.source}:${evenement.identifiantExterne}`;
    }

    // Sinon, créer une clé composite
    const parts = [
      this._normalizeString(evenement.nom),
      this._normalizeDate(evenement.dateDebut),
      this._normalizeLocation(evenement.lieu)
    ].filter(Boolean);

    if (parts.length === 0) {
      throw new Error('Impossible de générer une clé: données insuffisantes');
    }

    // Créer un hash MD5 de la combinaison
    const combined = parts.join('|');
    return this._hash(combined);
  }

  /**
   * Normalise une chaîne de caractères
   */
  static _normalizeString(str) {
    if (!str) return '';
    
    return str
      .toLowerCase()
      .trim()
      .normalize('NFD') // Décompose les accents
      .replace(/[\u0300-\u036f]/g, '') // Supprime les accents
      .replace(/[^\w\s]/g, '') // Supprime la ponctuation
      .replace(/\s+/g, ' '); // Normalise les espaces
  }

  /**
   * Normalise une date (jour uniquement)
   */
  static _normalizeDate(date) {
    if (!date) return '';
    
    try {
      const d = new Date(date);
      if (isNaN(d.getTime())) return '';
      
      // Retourne YYYY-MM-DD
      return d.toISOString().split('T')[0];
    } catch (error) {
      return '';
    }
  }

  /**
   * Normalise un lieu
   */
  static _normalizeLocation(lieu) {
    if (!lieu) return '';
    
    if (typeof lieu === 'string') {
      return this._normalizeString(lieu);
    }
    
    if (lieu.adresse) {
      return this._normalizeString(lieu.adresse);
    }
    
    // Si on a des coordonnées, utiliser une grille approximative
    if (lieu.coordonnees && lieu.coordonnees.coordinates) {
      const [lon, lat] = lieu.coordonnees.coordinates;
      // Arrondir à 3 décimales (~111m de précision)
      return `${lat.toFixed(3)},${lon.toFixed(3)}`;
    }
    
    return '';
  }

  /**
   * Crée un hash MD5
   */
  static _hash(str) {
    return crypto
      .createHash('md5')
      .update(str)
      .digest('hex');
  }

  /**
   * Calcule la similarité entre deux événements (0-100%)
   * Utile pour détecter les doublons potentiels
   */
  static calculateSimilarity(event1, event2) {
    if (!event1 || !event2) return 0;

    let score = 0;
    let maxScore = 0;

    // Similarité du nom (40 points max)
    maxScore += 40;
    const nameSimilarity = this._stringSimilarity(
      this._normalizeString(event1.nom),
      this._normalizeString(event2.nom)
    );
    score += nameSimilarity * 40;

    // Même date (30 points max)
    maxScore += 30;
    if (this._normalizeDate(event1.dateDebut) === this._normalizeDate(event2.dateDebut)) {
      score += 30;
    }

    // Même lieu (30 points max)
    maxScore += 30;
    const locationSimilarity = this._locationSimilarity(event1.lieu, event2.lieu);
    score += locationSimilarity * 30;

    return Math.round((score / maxScore) * 100);
  }

  /**
   * Calcule la similarité entre deux chaînes (Levenshtein simplifié)
   */
  static _stringSimilarity(str1, str2) {
    if (str1 === str2) return 1;
    if (!str1 || !str2) return 0;

    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    if (longer.length === 0) return 1;

    const editDistance = this._levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  /**
   * Distance de Levenshtein
   */
  static _levenshteinDistance(str1, str2) {
    const matrix = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  /**
   * Similarité de localisation
   */
  static _locationSimilarity(lieu1, lieu2) {
    if (!lieu1 || !lieu2) return 0;

    // Si on a des coordonnées pour les deux
    if (lieu1.coordonnees && lieu2.coordonnees) {
      const [lon1, lat1] = lieu1.coordonnees.coordinates || [];
      const [lon2, lat2] = lieu2.coordonnees.coordinates || [];

      if (lat1 && lon1 && lat2 && lon2) {
        const distance = this._haversineDistance(lat1, lon1, lat2, lon2);
        // Si < 500m, similarité élevée
        if (distance < 0.5) return 1;
        // Si < 2km, similarité moyenne
        if (distance < 2) return 0.5;
        return 0;
      }
    }

    // Sinon comparer les adresses textuelles
    const addr1 = lieu1.adresse || '';
    const addr2 = lieu2.adresse || '';
    return this._stringSimilarity(
      this._normalizeString(addr1),
      this._normalizeString(addr2)
    );
  }

  /**
   * Distance Haversine entre deux points GPS (en km)
   */
  static _haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Rayon de la Terre en km
    const dLat = this._toRad(lat2 - lat1);
    const dLon = this._toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this._toRad(lat1)) *
        Math.cos(this._toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  static _toRad(degrees) {
    return (degrees * Math.PI) / 180;
  }
}

module.exports = Dedupe;