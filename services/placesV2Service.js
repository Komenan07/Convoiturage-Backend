// services/placesV2Service.js
const axios = require('axios');

class PlacesV2Service {
  constructor() {
    this.apiKey = process.env.GOOGLE_MAPS_API_KEY;
    this.baseUrl = 'https://places.googleapis.com/v1';
  }

  async searchText(textQuery, options = {}) {
    try {
      const requestBody = {
        textQuery: `${textQuery}, Côte d'Ivoire`,
        languageCode: 'fr',
        regionCode: 'CI',
        maxResultCount: options.maxResults || 10,
      };

      if (options.location) {
        requestBody.locationBias = {
          circle: {
            center: {
              latitude: options.location.latitude,
              longitude: options.location.longitude,
            },
            radius: options.radius || 50000.0,
          },
        };
      }

      if (options.includedTypes) {
        requestBody.includedTypes = options.includedTypes;
      }

      if (options.rankPreference) {
        requestBody.rankPreference = options.rankPreference;
      }

      const response = await axios.post(
        `${this.baseUrl}/places:searchText`,
        requestBody,
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': this.apiKey,
            'X-Goog-FieldMask': this._getFieldMask('search'),
          },
        }
      );

      if (response.data && response.data.places) {
        return {
          success: true,
          data: response.data.places.map(place => this._formatPlace(place)),
        };
      }

      return {
        success: false,
        error: 'Aucun résultat trouvé',
      };
    } catch (error) {
      console.error('Erreur recherche texte:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error?.message || error.message,
      };
    }
  }

  async searchNearby(latitude, longitude, options = {}) {
    try {
      const requestBody = {
        languageCode: 'fr',
        maxResultCount: options.maxResults || 20,
        locationRestriction: {
          circle: {
            center: {
              latitude,
              longitude,
            },
            radius: options.radius || 5000.0,
          },
        },
      };

      if (options.includedTypes) {
        requestBody.includedTypes = options.includedTypes;
      }

      if (options.excludedTypes) {
        requestBody.excludedTypes = options.excludedTypes;
      }

      if (options.minRating) {
        requestBody.minRating = options.minRating;
      }

      requestBody.rankPreference = options.rankPreference || 'DISTANCE';

      const response = await axios.post(
        `${this.baseUrl}/places:searchNearby`,
        requestBody,
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': this.apiKey,
            'X-Goog-FieldMask': this._getFieldMask('nearby'),
          },
        }
      );

      if (response.data && response.data.places) {
        return {
          success: true,
          data: response.data.places.map(place => this._formatPlace(place)),
        };
      }

      return {
        success: false,
        error: 'Aucun lieu trouvé à proximité',
      };
    } catch (error) {
      console.error('Erreur recherche nearby:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error?.message || error.message,
      };
    }
  }

  async autocomplete(input, options = {}) {
    try {
      const requestBody = {
        input,
        languageCode: 'fr',
        regionCode: 'CI',
      };

      if (options.location) {
        requestBody.locationBias = {
          circle: {
            center: {
              latitude: options.location.latitude,
              longitude: options.location.longitude,
            },
            radius: options.radius || 50000.0,
          },
        };
      }

      if (options.includedPrimaryTypes) {
        requestBody.includedPrimaryTypes = options.includedPrimaryTypes;
      }

      if (options.includeOnlyRegions) {
        requestBody.includedRegionCodes = ['CI'];
      }

      const response = await axios.post(
        `${this.baseUrl}/places:autocomplete`,
        requestBody,
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': this.apiKey,
          },
        }
      );

      if (response.data && response.data.suggestions) {
        return {
          success: true,
          data: response.data.suggestions.map(suggestion => ({
            placeId: suggestion.placePrediction?.placeId,
            text: suggestion.placePrediction?.text?.text,
            mainText: suggestion.placePrediction?.structuredFormat?.mainText?.text,
            secondaryText: suggestion.placePrediction?.structuredFormat?.secondaryText?.text,
            types: suggestion.placePrediction?.types || [],
          })),
        };
      }

      return {
        success: false,
        error: 'Aucune suggestion',
      };
    } catch (error) {
      console.error('Erreur autocomplete:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error?.message || error.message,
      };
    }
  }

  async getPlaceDetails(placeId, fields = []) {
    try {
      const fieldMask = fields.length > 0 
        ? fields.join(',')
        : this._getFieldMask('details');

      const response = await axios.get(
        `${this.baseUrl}/places/${placeId}`,
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': this.apiKey,
            'X-Goog-FieldMask': fieldMask,
          },
          params: {
            languageCode: 'fr',
          },
        }
      );

      if (response.data) {
        return {
          success: true,
          data: this._formatPlaceDetails(response.data),
        };
      }

      return {
        success: false,
        error: 'Lieu non trouvé',
      };
    } catch (error) {
      console.error('Erreur détails lieu:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error?.message || error.message,
      };
    }
  }

  async searchCommunes(query, city = 'Abidjan') {
    try {
      const searchQuery = city ? `${query}, ${city}, Côte d'Ivoire` : `${query}, Côte d'Ivoire`;
      
      const result = await this.searchText(searchQuery, {
        includedTypes: ['locality', 'sublocality', 'neighborhood', 'administrative_area_level_3'],
        maxResults: 10,
      });

      return result;
    } catch (error) {
      console.error('Erreur recherche communes:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async searchGaresRoutieres(latitude, longitude, radius = 10000) {
    try {
      const result = await this.searchNearby(latitude, longitude, {
        includedTypes: ['bus_station', 'transit_station', 'taxi_stand'],
        radius,
        maxResults: 15,
      });

      return result;
    } catch (error) {
      console.error('Erreur recherche gares:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async searchStationsProches(latitude, longitude, radius = 5000) {
    try {
      const result = await this.searchNearby(latitude, longitude, {
        includedTypes: [
          'bus_station',
          'transit_station',
          'train_station',
          'light_rail_station',
          'subway_station'
        ],
        radius,
        maxResults: 20,
        rankPreference: 'DISTANCE',
      });

      return result;
    } catch (error) {
      console.error('Erreur recherche stations proches:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async searchPolices(latitude, longitude, radius = 10000) {
    try {
      const result = await this.searchNearby(latitude, longitude, {
        includedTypes: ['police'],
        radius,
        maxResults: 20,
        rankPreference: 'DISTANCE',
      });

      return result;
    } catch (error) {
      console.error('Erreur recherche polices:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async searchStations(latitude, longitude, type = 'all', radius = 5000) {
    try {
      let includedTypes = [];
      
      switch(type) {
        case 'bus':
          includedTypes = ['bus_station'];
          break;
        case 'train':
          includedTypes = ['train_station', 'subway_station', 'light_rail_station'];
          break;
        case 'transit':
          includedTypes = ['transit_station'];
          break;
        case 'taxi':
          includedTypes = ['taxi_stand'];
          break;
        case 'all':
        default:
          includedTypes = [
            'bus_station',
            'transit_station',
            'train_station',
            'light_rail_station',
            'subway_station',
            'taxi_stand'
          ];
          break;
      }

      const result = await this.searchNearby(latitude, longitude, {
        includedTypes,
        radius,
        maxResults: 20,
        rankPreference: 'DISTANCE',
      });

      // Ajouter le type de station dans chaque résultat
      if (result.success && result.data) {
        result.data = result.data.map(place => ({
          ...place,
          stationType: type
        }));
      }

      return result;
    } catch (error) {
      console.error('Erreur recherche stations:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async searchPOI(latitude, longitude, type, radius = 5000) {
    try {
      const typeMap = {
        mall: ['shopping_mall'],
        market: ['market', 'supermarket'],
        hospital: ['hospital', 'pharmacy'],
        school: ['school', 'university'],
        airport: ['airport'],
        hotel: ['hotel', 'lodging'],
        restaurant: ['restaurant', 'cafe'],
        station: ['gas_station'],
      };

      const result = await this.searchNearby(latitude, longitude, {
        includedTypes: typeMap[type] || [type],
        radius,
        maxResults: 20,
        rankPreference: 'DISTANCE',
      });

      return result;
    } catch (error) {
      console.error('Erreur recherche POI:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * RECHERCHE DE TOUTES LES STATIONS TOTALENERGIES EN CÔTE D'IVOIRE
   */
  async searchAllTotalEnergies() {
  try {
    // Coordonnées des principales villes de Côte d'Ivoire
    const cities = [
      { name: 'Abidjan', lat: 5.3600, lng: -4.0083 },
      { name: 'Yamoussoukro', lat: 6.8270, lng: -5.2893 },
      { name: 'Bouaké', lat: 7.6903, lng: -5.0300 },
      { name: 'Daloa', lat: 6.8770, lng: -6.4503 },
      { name: 'San-Pédro', lat: 4.7500, lng: -6.6364 },
      { name: 'Korhogo', lat: 9.4580, lng: -5.6297 },
      { name: 'Man', lat: 7.4125, lng: -7.5544 }
    ];

    const allStations = [];
    const seenIds = new Set(); // Pour éviter les doublons

    // Rechercher dans chaque ville
    for (const city of cities) {
      try {
        const requestBody = {
          textQuery: `TotalEnergies ${city.name}`,
          languageCode: 'fr',
          regionCode: 'CI',
          maxResultCount: 20,
          includedType: "gas_station",
          locationBias: {
            circle: {
              center: {
                latitude: city.lat,
                longitude: city.lng
              },
              radius: 50000.0 // Maximum autorisé: 50km
            }
          }
        };

        const response = await axios.post(
          `${this.baseUrl}/places:searchText`,
          requestBody,
          {
            headers: {
              'Content-Type': 'application/json',
              'X-Goog-Api-Key': this.apiKey,
              'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.types,places.rating,places.userRatingCount,places.businessStatus,places.nationalPhoneNumber,places.websiteUri,places.regularOpeningHours,places.editorialSummary',
            },
          }
        );

        if (response.data && response.data.places && response.data.places.length > 0) {
          const totalStations = response.data.places.filter(place => {
            const name = place.displayName?.text?.toLowerCase() || '';
            return (name.includes('total') || name.includes('totalenergies')) && !seenIds.has(place.id);
          });

          totalStations.forEach(place => {
            seenIds.add(place.id);
            allStations.push({
              id: place.id,
              placeId: place.id,
              name: place.displayName?.text || 'Station TotalEnergies',
              address: place.formattedAddress,
              city: city.name, // Ajouter la ville
              location: {
                latitude: place.location?.latitude,
                longitude: place.location?.longitude
              },
              latitude: place.location?.latitude,
              longitude: place.location?.longitude,
              rating: place.rating || null,
              userRatingsTotal: place.userRatingCount || 0,
              businessStatus: place.businessStatus || 'OPERATIONAL',
              types: place.types || ['gas_station'],
              primaryType: 'gas_station',
              fuelPrices: this._extractFuelPrices(place.editorialSummary?.text || ''),
              phoneNumber: place.nationalPhoneNumber || null,
              website: place.websiteUri || null,
              openingHours: place.regularOpeningHours?.weekdayDescriptions || [],
              isOpen: place.regularOpeningHours?.openNow || null
            });
          });
        }
      } catch (cityError) {
        console.error(`Erreur recherche ${city.name}:`, cityError.response?.data || cityError.message);
        // Continue avec les autres villes même si une échoue
      }
    }

    if (allStations.length > 0) {
      // Trier par ville puis par nom
      allStations.sort((a, b) => {
        const cityCompare = a.city.localeCompare(b.city);
        if (cityCompare !== 0) return cityCompare;
        return a.name.localeCompare(b.name);
      });

      return { 
        success: true, 
        data: allStations,
        total: allStations.length,
        metadata: {
          citiesSearched: cities.length,
          uniqueStations: allStations.length
        }
      };
    }

    return { 
      success: false, 
      error: 'Aucune station TotalEnergies trouvée en Côte d\'Ivoire' 
    };
  } catch (error) {
    console.error('Erreur searchAllTotalEnergies:', error.response?.data || error.message);
    return { 
      success: false, 
      error: error.response?.data?.error?.message || error.message 
    };
  }
}

  /**
   * RECHERCHE DES STATIONS TOTALENERGIES À PROXIMITÉ
   */
  async searchNearbyTotalEnergies(latitude, longitude, radius = 10000) {
  try {
    // 1. Validation des paramètres d'entrée
    if (!latitude || !longitude) {
      return { 
        success: false, 
        error: 'Latitude et longitude sont requises' 
      };
    }

    // Valider que ce sont bien des nombres
    const lat = parseFloat(latitude);
    const lon = parseFloat(longitude);
    
    if (isNaN(lat) || isNaN(lon)) {
      return { 
        success: false, 
        error: 'Latitude et longitude doivent être des nombres valides' 
      };
    }

    // Vérifier les limites géographiques
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      return { 
        success: false, 
        error: 'Coordonnées géographiques invalides' 
      };
    }

    // 2. Limiter le rayon à 50000m maximum (limite de Google Places API)
    const validRadius = Math.min(Math.max(radius, 100), 50000); // Min 100m, Max 50000m

    const requestBody = {
      languageCode: 'fr',
      maxResultCount: 20,
      includedTypes: ["gas_station"],
      locationRestriction: {
        circle: {
          center: { 
            latitude: lat, 
            longitude: lon 
          },
          radius: validRadius 
        }
      },
      rankPreference: 'DISTANCE'
    };

    const response = await axios.post(
      `${this.baseUrl}/places:searchNearby`,
      requestBody,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': this.apiKey,
          'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.types,places.rating,places.userRatingCount,places.businessStatus,places.nationalPhoneNumber,places.websiteUri,places.regularOpeningHours,places.editorialSummary',
        },
      }
    );

    if (response.data && response.data.places && response.data.places.length > 0) {
      // 3. Filtrer uniquement les stations TotalEnergies
      const totalStations = response.data.places.filter(place => {
        const name = place.displayName?.text?.toLowerCase() || '';
        return name.includes('total') || name.includes('totalenergies');
      });

      if (totalStations.length === 0) {
        return { 
          success: false, 
          error: 'Aucune station TotalEnergies trouvée à proximité',
          metadata: {
            searchRadius: validRadius,
            totalGasStations: response.data.places.length
          }
        };
      }

      // 4. Mapper les stations avec calcul de distance
      const stations = totalStations.map(place => {
        const distance = this._calculateDistance(
          lat,
          lon,
          place.location.latitude,
          place.location.longitude
        );

        return {
          id: place.id,
          placeId: place.id,
          name: place.displayName?.text || 'Station TotalEnergies',
          address: place.formattedAddress,
          location: {
            latitude: place.location?.latitude,
            longitude: place.location?.longitude
          },
          latitude: place.location?.latitude,
          longitude: place.location?.longitude,
          distance: parseFloat(distance.toFixed(2)),
          distanceText: `${distance.toFixed(2)} km`,
          rating: place.rating || null,
          userRatingsTotal: place.userRatingCount || 0,
          businessStatus: place.businessStatus || 'OPERATIONAL',
          types: place.types || ['gas_station'],
          primaryType: 'gas_station',
          fuelPrices: this._extractFuelPrices(place.editorialSummary?.text || ''),
          phoneNumber: place.nationalPhoneNumber || null,
          website: place.websiteUri || null,
          openingHours: place.regularOpeningHours?.weekdayDescriptions || [],
          isOpen: place.regularOpeningHours?.openNow || null
        };
      });

      // 5. Trier par distance croissante
      stations.sort((a, b) => a.distance - b.distance);

      return { 
        success: true, 
        data: stations,
        total: stations.length,
        metadata: {
          searchCenter: { latitude: lat, longitude: lon },
          searchRadius: validRadius,
          nearestStation: stations[0]?.distance || null
        }
      };
    }

    return { 
      success: false, 
      error: 'Aucune station-service trouvée à proximité',
      metadata: {
        searchRadius: validRadius,
        searchCenter: { latitude: lat, longitude: lon }
      }
    };
  } catch (error) {
    console.error('Erreur searchNearbyTotalEnergies:', error.response?.data || error.message);
    
    // Gestion d'erreurs plus détaillée
    if (error.response?.data?.error) {
      return { 
        success: false, 
        error: error.response.data.error.message || 'Erreur API Google Places',
        code: error.response.data.error.code
      };
    }
    
    return { 
      success: false, 
      error: error.message || 'Erreur lors de la recherche de stations'
    };
  }
}

  /**
   * CALCUL DE LA DISTANCE (Haversine)
   */
  _calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = this._toRadians(lat2 - lat1);
    const dLon = this._toRadians(lon2 - lon1);
    
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this._toRadians(lat1)) * Math.cos(this._toRadians(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  _toRadians(degrees) {
    return degrees * (Math.PI / 180);
  }

  /**
   * EXTRACTION DES PRIX DU CARBURANT
   */
  _extractFuelPrices(text) {
    if (!text) return null;
    
    const prices = {};
    const essenceMatch = text.match(/essence[:\s]+(\d+)\s*(FCFA|F|CFA)?/i);
    const dieselMatch = text.match(/diesel[:\s]+(\d+)\s*(FCFA|F|CFA)?/i);
    const gasoilMatch = text.match(/gasoil[:\s]+(\d+)\s*(FCFA|F|CFA)?/i);
    const superMatch = text.match(/super[:\s]+(\d+)\s*(FCFA|F|CFA)?/i);
    
    if (essenceMatch) prices.essence = parseInt(essenceMatch[1]);
    if (dieselMatch) prices.diesel = parseInt(dieselMatch[1]);
    if (gasoilMatch) prices.gasoil = parseInt(gasoilMatch[1]);
    if (superMatch) prices.super = parseInt(superMatch[1]);
    
    return Object.keys(prices).length > 0 ? prices : null;
  }

  _getFieldMask(type) {
    const masks = {
      search: 'places.id,places.displayName,places.formattedAddress,places.location,places.types,places.primaryType',
      nearby: 'places.id,places.displayName,places.formattedAddress,places.location,places.types,places.primaryType,places.rating,places.priceLevel',
      details: 'id,displayName,formattedAddress,location,types,primaryType,rating,userRatingCount,priceLevel,businessStatus,phoneNumber,websiteUri,regularOpeningHours,addressComponents',
    };

    return masks[type] || masks.search;
  }

  _formatPlace(place) {
    return {
      placeId: place.id,
      name: place.displayName?.text || '',
      address: place.formattedAddress || '',
      latitude: place.location?.latitude,
      longitude: place.location?.longitude,
      types: place.types || [],
      primaryType: place.primaryType,
      rating: place.rating,
      priceLevel: place.priceLevel,
    };
  }

  _formatPlaceDetails(place) {
    return {
      placeId: place.id,
      name: place.displayName?.text || '',
      address: place.formattedAddress || '',
      latitude: place.location?.latitude,
      longitude: place.location?.longitude,
      types: place.types || [],
      primaryType: place.primaryType,
      rating: place.rating,
      userRatingCount: place.userRatingCount,
      priceLevel: place.priceLevel,
      businessStatus: place.businessStatus,
      phoneNumber: place.nationalPhoneNumber,
      website: place.websiteUri,
      openingHours: place.regularOpeningHours?.weekdayDescriptions || [],
      addressComponents: this._extractAddressComponents(place.addressComponents || []),
    };
  }

  _extractAddressComponents(components) {
    const extracted = {};
    
    components.forEach(component => {
      if (component.types.includes('street_number')) {
        extracted.streetNumber = component.longText;
      }
      if (component.types.includes('route')) {
        extracted.street = component.longText;
      }
      if (component.types.includes('locality')) {
        extracted.city = component.longText;
      }
      if (component.types.includes('sublocality')) {
        extracted.commune = component.longText;
      }
      if (component.types.includes('administrative_area_level_1')) {
        extracted.region = component.longText;
      }
      if (component.types.includes('country')) {
        extracted.country = component.longText;
        extracted.countryCode = component.shortText;
      }
      if (component.types.includes('postal_code')) {
        extracted.postalCode = component.longText;
      }
    });

    return extracted;
  }

}

module.exports = new PlacesV2Service();