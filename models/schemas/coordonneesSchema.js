/**
 * Schéma réutilisable pour les coordonnées géographiques au format GeoJSON
 * 
 * Ce schéma est utilisé dans tous les modèles nécessitant des coordonnées GPS:
 * - Trajet (pointDepart, pointArrivee, arretsIntermediaires)
 * - Reservation (pointPriseEnCharge, pointDepose)
 * - Evenement (lieu)
 * - AlerteUrgence (position)
 * - Message (pieceJointe.coordonnees)
 * - Utilisateur (adresse)
 * 
 * Format: GeoJSON Point selon RFC 7946
 * Structure: { type: "Point", coordinates: [longitude, latitude] }
 * 
 * ATTENTION: MongoDB GeoJSON stocke [longitude, latitude] (longitude en premier)
 * 
 * @see https://www.mongodb.com/docs/manual/reference/geojson/
 * @see https://datatracker.ietf.org/doc/html/rfc7946
 */

const mongoose = require('mongoose');

const coordonneesSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: {
      values: ['Point'],
      message: 'Type GeoJSON doit être "Point"'
    },
    required: [true, 'Le type de coordonnées est requis'],
    default: 'Point'
  },
  coordinates: {
    type: [Number],
    required: [true, 'Les coordonnées GPS sont requises au format [longitude, latitude]'],
    validate: [
      {
        validator: function(coords) {
          return Array.isArray(coords) && coords.length === 2;
        },
        message: 'Les coordonnées doivent contenir exactement 2 valeurs: [longitude, latitude]'
      },
      {
        validator: function(coords) {
          const [longitude, latitude] = coords;
          return longitude >= -180 && longitude <= 180;
        },
        message: 'Longitude invalide. Doit être entre -180 et 180 degrés'
      },
      {
        validator: function(coords) {
          const [longitude, latitude] = coords;
          return latitude >= -90 && latitude <= 90;
        },
        message: 'Latitude invalide. Doit être entre -90 et 90 degrés'
      },
      {
        // Validation spécifique Côte d'Ivoire (optionnelle mais recommandée)
        validator: function(coords) {
          const [longitude, latitude] = coords;
          // Côte d'Ivoire: longitude [-8.6, -2.5], latitude [4.3, 10.7]
          const isInCoteDIvoire = 
            longitude >= -8.6 && longitude <= -2.5 &&
            latitude >= 4.3 && latitude <= 10.7;
          
          // Accepter les coordonnées hors Côte d'Ivoire (pour trajets internationaux)
          // mais logger un avertissement
          if (!isInCoteDIvoire) {
            console.warn(`⚠️ Coordonnées hors Côte d'Ivoire: [${longitude}, ${latitude}]`);
          }
          
          return true; // Toujours valider (ne pas bloquer)
        },
        message: 'Coordonnées GPS en dehors de la Côte d\'Ivoire'
      }
    ]
  }
}, { 
  _id: false,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// =============== PROPRIÉTÉS VIRTUELLES ===============

/**
 * Retourne la longitude (premier élément)
 */
coordonneesSchema.virtual('longitude').get(function() {
  return this.coordinates && this.coordinates[0];
});

/**
 * Retourne la latitude (second élément)
 */
coordonneesSchema.virtual('latitude').get(function() {
  return this.coordinates && this.coordinates[1];
});

/**
 * Vérifie si les coordonnées sont en Côte d'Ivoire
 */
coordonneesSchema.virtual('estEnCoteDIvoire').get(function() {
  if (!this.coordinates || this.coordinates.length !== 2) return false;
  
  const [longitude, latitude] = this.coordinates;
  return longitude >= -8.6 && longitude <= -2.5 &&
         latitude >= 4.3 && latitude <= 10.7;
});

// =============== MÉTHODES D'INSTANCE ===============

/**
 * Calcule la distance en kilomètres vers un autre point
 * @param {Object} autrePoint - Autre coordonnées GeoJSON
 * @returns {Number} Distance en kilomètres
 */
coordonneesSchema.methods.distanceVers = function(autrePoint) {
  if (!autrePoint || !autrePoint.coordinates || autrePoint.coordinates.length !== 2) {
    throw new Error('Point de destination invalide');
  }
  
  const [lon1, lat1] = this.coordinates;
  const [lon2, lat2] = autrePoint.coordinates;
  
  // Formule de Haversine
  const R = 6371; // Rayon de la Terre en km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  
  return Math.round(distance * 100) / 100; // Arrondir à 2 décimales
};

/**
 * Formate les coordonnées pour affichage
 * @returns {String} Format: "Lat: X.XXX, Lon: Y.YYY"
 */
coordonneesSchema.methods.formater = function() {
  if (!this.coordinates || this.coordinates.length !== 2) {
    return 'Coordonnées invalides';
  }
  
  const [longitude, latitude] = this.coordinates;
  return `Lat: ${latitude.toFixed(6)}, Lon: ${longitude.toFixed(6)}`;
};

/**
 * Retourne un lien Google Maps
 * @returns {String} URL Google Maps
 */
coordonneesSchema.methods.versGoogleMaps = function() {
  if (!this.coordinates || this.coordinates.length !== 2) {
    return null;
  }
  
  const [longitude, latitude] = this.coordinates;
  return `https://www.google.com/maps?q=${latitude},${longitude}`;
};

// =============== MÉTHODES STATIQUES ===============

/**
 * Crée des coordonnées à partir de lat/lon séparés
 * @param {Number} latitude 
 * @param {Number} longitude 
 * @returns {Object} Objet coordonnées GeoJSON
 */
coordonneesSchema.statics.depuisLatLon = function(latitude, longitude) {
  return {
    type: 'Point',
    coordinates: [longitude, latitude] // Attention: longitude en premier !
  };
};

/**
 * Valide des coordonnées sans créer de document
 * @param {Array} coordinates - [longitude, latitude]
 * @returns {Boolean} true si valide
 */
coordonneesSchema.statics.valider = function(coordinates) {
  if (!Array.isArray(coordinates) || coordinates.length !== 2) {
    return false;
  }
  
  const [longitude, latitude] = coordinates;
  return longitude >= -180 && longitude <= 180 &&
         latitude >= -90 && latitude <= 90;
};

// =============== HOOKS ===============

/**
 * Middleware pre-validate pour normaliser les coordonnées
 */
coordonneesSchema.pre('validate', function(next) {
  // S'assurer que coordinates est bien un tableau de nombres
  if (this.coordinates) {
    this.coordinates = this.coordinates.map(coord => {
      const num = typeof coord === 'string' ? parseFloat(coord) : coord;
      if (isNaN(num)) {
        return next(new Error(`Coordonnée invalide: ${coord}`));
      }
      return num;
    });
  }
  
  next();
});

// =============== INDEX ===============

// Index géospatial 2dsphere pour requêtes géospatiales
// Appliqué automatiquement quand coordonneesSchema est utilisé dans un modèle
// Les modèles parents doivent créer l'index sur le champ parent
// Exemple: trajetSchema.index({ 'pointDepart.coordonnees': '2dsphere' });

module.exports = coordonneesSchema;
