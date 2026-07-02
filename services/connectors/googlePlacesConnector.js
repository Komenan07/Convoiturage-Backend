// services/connectors/googlePlacesConnector.js
const axios = require('axios');

/**
 * Connecteur pour récupérer les événements/lieux depuis Google Places API
 * Documentation: https://developers.google.com/maps/documentation/places/web-service
 */
class GooglePlacesConnector {
  constructor(options = {}) {
    this.name = 'GOOGLE_PLACES';
    this.apiKey = options.apiKey || process.env.GOOGLE_MAPS_API_KEY;
    this.baseURL = 'https://maps.googleapis.com/maps/api/place';
    this.enabled = !!this.apiKey;

    // Zone de recherche : Abidjan
    this.location = {
      lat: 5.3599517,
      lng: -3.9615917,
      radius: 50000 // 50 km en mètres
    };

    // Types de lieux qui peuvent être des événements
    this.eventTypes = [
      'stadium',
      'night_club',
      'museum',
      'art_gallery',
      'tourist_attraction',
      'amusement_park'
    ];

    if (!this.enabled) {
      console.warn('⚠️  GooglePlacesConnector: API Key manquant. Désactivé.');
    }
  }

  /**
   * Récupère les lieux/événements depuis Google Places
   */
  async fetchEvenements() {
    if (!this.enabled) {
      console.log('ℹ️  GooglePlacesConnector: Désactivé (pas de clé API)');
      return [];
    }

    console.log('🔍 GooglePlacesConnector: Recherche des lieux événementiels...');
    
    const allPlaces = [];

    for (const type of this.eventTypes) {
      try {
        const places = await this._searchNearby(type);
        allPlaces.push(...places);
        console.log(`   ✅ Type ${type}: ${places.length} lieux trouvés`);
      } catch (error) {
        console.error(`   ❌ Erreur type ${type}:`, error.message);
      }

      // Pause pour éviter rate limiting
      await this._delay(200);
    }

    // Filtrer et transformer en événements
    const events = this._transformPlacesToEvents(allPlaces);
    
    console.log(`✅ GooglePlacesConnector: ${events.length} événements potentiels`);
    return events;
  }

  /**
   * Recherche de lieux à proximité
   */
  async _searchNearby(type) {
    try {
      const url = `${this.baseURL}/nearbysearch/json`;
      
      const response = await axios.get(url, {
        params: {
          key: this.apiKey,
          location: `${this.location.lat},${this.location.lng}`,
          radius: this.location.radius,
          type: type,
          keyword: 'événement event concert festival'
        },
        timeout: 10000
      });

      if (response.data.status !== 'OK' && response.data.status !== 'ZERO_RESULTS') {
        throw new Error(`Google Places API Error: ${response.data.status}`);
      }

      return response.data.results || [];
    } catch (error) {
      if (error.response) {
        throw new Error(`Google API Error: ${error.response.status}`);
      }
      throw error;
    }
  }

  /**
   * Obtient les détails d'un lieu
   */
  async _getPlaceDetails(placeId) {
    try {
      const url = `${this.baseURL}/details/json`;
      
      const response = await axios.get(url, {
        params: {
          key: this.apiKey,
          place_id: placeId,
          fields: 'name,formatted_address,geometry,photos,opening_hours,website,formatted_phone_number,types'
        },
        timeout: 10000
      });

      return response.data.result || null;
    } catch (error) {
      console.error(`❌ Erreur détails lieu ${placeId}:`, error.message);
      return null;
    }
  }

  /**
   * Transforme les lieux Google Places en événements
   * Note: Google Places ne fournit pas directement des événements,
   * on crée des "événements permanents" pour les lieux culturels
   */
  _transformPlacesToEvents(places) {
    const now = new Date();
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    return places
      .filter(place => place.business_status === 'OPERATIONAL')
      .map(place => ({
        id: place.place_id,
        name: place.name,
        description: `Lieu culturel/événementiel à ${place.vicinity}`,
        start_time: now.toISOString(),
        end_time: nextWeek.toISOString(),
        place: {
          name: place.name,
          location: {
            street: place.vicinity,
            city: 'Abidjan',
            latitude: place.geometry?.location?.lat,
            longitude: place.geometry?.location?.lng
          }
        },
        geometry: place.geometry,
        types: place.types,
        rating: place.rating,
        user_ratings_total: place.user_ratings_total,
        photos: place.photos,
        category: this._inferCategory(place.types)
      }));
  }

  /**
   * Déduit la catégorie d'événement depuis les types Google
   */
  _inferCategory(types) {
    if (!types) return 'AUTRE';
    
    const typeMap = {
      'stadium': 'SPORT',
      'night_club': 'CONCERT',
      'museum': 'EXPOSITION',
      'art_gallery': 'EXPOSITION',
      'amusement_park': 'FESTIVAL'
    };

    for (const type of types) {
      if (typeMap[type]) return typeMap[type];
    }

    return 'AUTRE';
  }

  /**
   * Délai pour éviter le rate limiting
   */
  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = GooglePlacesConnector;