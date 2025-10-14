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