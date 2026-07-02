// services/placesV2Service.js
const axios = require('axios');

class PlacesV2Service {
  constructor() {
    this.apiKey = process.env.GOOGLE_MAPS_API_KEY;
    this.baseUrl = 'https://places.googleapis.com/v1';
  }

  async searchText(textQuery, options = {}) {
  try {
    const buildRequestBody = (withType) => {
      const body = {
        textQuery: `${textQuery}, Côte d'Ivoire`,
        languageCode: 'fr',
        regionCode: 'CI',
        maxResultCount: options.maxResults || 10,
      };

      if (options.location) {
        body.locationBias = {
          circle: {
            center: {
              latitude: options.location.latitude,
              longitude: options.location.longitude,
            },
            radius: options.radius || 50000.0,
          },
        };
      }

      // ✅ includedType seulement si demandé ET premier essai
      if (withType && options.includedTypes?.length > 0) {
        body.includedType = options.includedTypes[0];
      }

      if (options.rankPreference) {
        body.rankPreference = options.rankPreference;
      }

      return body;
    };

    const headers = {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': this.apiKey,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.types,places.primaryType,places.rating,places.userRatingCount,places.businessStatus,places.nationalPhoneNumber,places.websiteUri,places.regularOpeningHours',
    };

    // 1er essai : avec includedType
    let requestBody = buildRequestBody(true);
    let response = await axios.post(
      `${this.baseUrl}/places:searchText`,
      requestBody,
      { headers }
    );

    // ✅ 2ème essai sans includedType si résultat vide
    if (!response.data?.places?.length && options.includedTypes?.length > 0) {
      console.log('🔄 Retry searchText sans includedType...');
      requestBody = buildRequestBody(false);
      response = await axios.post(
        `${this.baseUrl}/places:searchText`,
        requestBody,
        { headers }
      );
    }

    if (response.data?.places?.length > 0) {
      const userLocation = options.location || null;
      const formattedPlaces = response.data.places.map(place =>
        this._formatPlace(place, userLocation)
      );

      if (userLocation) {
        formattedPlaces.sort((a, b) => (a.distance || 9999) - (b.distance || 9999));
      }

      return {
        success: true,
        data: formattedPlaces,
        metadata: {
          total: formattedPlaces.length,
          userLocation,
          searchType: 'text',
          query: textQuery
        }
      };
    }

    return { success: false, error: 'Aucun résultat trouvé' };
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
            center: { latitude, longitude },
            radius: options.radius || 5000.0,
          },
        },
      };

      if (options.includedTypes) requestBody.includedTypes = options.includedTypes;
      if (options.excludedTypes) requestBody.excludedTypes = options.excludedTypes;
      if (options.minRating) requestBody.minRating = options.minRating;

      requestBody.rankPreference = options.rankPreference || 'DISTANCE';

      const response = await axios.post(
        `${this.baseUrl}/places:searchNearby`,
        requestBody,
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': this.apiKey,
            'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.types,places.primaryType,places.rating,places.userRatingCount,places.businessStatus,places.nationalPhoneNumber,places.websiteUri,places.regularOpeningHours',
          },
        }
      );

      if (response.data && response.data.places) {
        const userLocation = { latitude, longitude };
        const formattedPlaces = response.data.places.map(place =>
          this._formatPlace(place, userLocation)
        );

        formattedPlaces.sort((a, b) => (a.distance || 9999) - (b.distance || 9999));

        return {
          success: true,
          data: formattedPlaces,
          metadata: {
            total: formattedPlaces.length,
            searchCenter: userLocation,
            searchRadius: options.radius,
            searchType: 'nearby'
          }
        };
      }

      return { success: false, error: 'Aucun lieu trouvé à proximité' };
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
        const placeIds = response.data.suggestions
          .map(s => s.placePrediction?.placeId)
          .filter(id => id);

        let placesWithDetails = [];

        // ✅ Limité à 3 pour éviter d'exploser les quotas Google
        const topPlaceIds = placeIds.slice(0, 3);
        if (topPlaceIds.length > 0 && options.location) {
          const detailsResult = await this.getBatchPlaceDetails(topPlaceIds);
          if (detailsResult.success) {
            placesWithDetails = detailsResult.data;
          }
        }

        const suggestions = response.data.suggestions.map(suggestion => {
          const placeId = suggestion.placePrediction?.placeId;
          const detail = placesWithDetails.find(p => p.placeId === placeId);

          return {
            placeId,
            text: suggestion.placePrediction?.text?.text || '',
            mainText: suggestion.placePrediction?.structuredFormat?.mainText?.text || '',
            secondaryText: suggestion.placePrediction?.structuredFormat?.secondaryText?.text || '',
            types: suggestion.placePrediction?.types || [],
            ...(detail && {
              latitude: detail.latitude,
              longitude: detail.longitude,
              address: detail.address,
              rating: detail.rating,
              category: detail.category || this._getCategoryFromTypes(detail.types || []),
              distance: detail.distance,
              distanceText: detail.distanceText,
              isOpen: detail.isOpen
            })
          };
        });

        if (options.location) {
          suggestions.sort((a, b) => (a.distance || 9999) - (b.distance || 9999));
        }

        return {
          success: true,
          data: suggestions,
          metadata: {
            total: suggestions.length,
            userLocation: options.location || null,
            hasDetails: placesWithDetails.length > 0
          }
        };
      }

      return { success: false, error: 'Aucune suggestion' };
    } catch (error) {
      console.error('Erreur autocomplete:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error?.message || error.message,
      };
    }
  }

  async getBatchPlaceDetails(placeIds) {
    try {
      const results = await Promise.allSettled(
        placeIds.map(placeId => this.getPlaceDetails(placeId))
      );

      const successfulResults = [];
      const failedResults = [];

      results.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value.success) {
          successfulResults.push({
            placeId: placeIds[index],
            ...result.value.data
          });
        } else {
          failedResults.push({
            placeId: placeIds[index],
            error: result.status === 'fulfilled'
              ? result.value.error
              : result.reason?.message || 'Erreur inconnue'
          });
        }
      });

      return {
        success: true,
        data: successfulResults,
        failed: failedResults,
        metadata: {
          total: placeIds.length,
          successful: successfulResults.length,
          failed: failedResults.length,
        }
      };
    } catch (error) {
      console.error('Erreur batch details:', error);
      return { success: false, error: error.message };
    }
  }

  async getPlaceDetails(placeId, fields = []) {
    try {
      let normalizedPlaceId = placeId;
      if (!placeId.startsWith('places/')) {
        normalizedPlaceId = `places/${placeId}`;
        console.log(`🔄 PlaceId normalisé: ${placeId} → ${normalizedPlaceId}`);
      }

      const fieldMask = fields.length > 0
        ? fields.join(',')
        : this._getFieldMask('details');

      const response = await axios.get(
        `${this.baseUrl}/${normalizedPlaceId}`,
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': this.apiKey,
            'X-Goog-FieldMask': fieldMask,
            'Accept-Language': 'fr'
          },
        }
      );

      if (response.data) {
        return { success: true, data: this._formatPlaceDetails(response.data) };
      }

      return { success: false, error: 'Lieu non trouvé' };
    } catch (error) {
      console.error('Erreur détails lieu:', error.response?.data || error.message);
      if (error.response?.status === 400) {
        return {
          success: false,
          error: 'Place ID invalide ou format non reconnu',
          details: error.response?.data?.error?.message,
          hint: 'Vérifiez que le placeId est valide et provient de Places API V2',
        };
      }
      if (error.response?.status === 404) {
        return { success: false, error: 'Lieu non trouvé avec ce Place ID' };
      }
      return {
        success: false,
        error: error.response?.data?.error?.message || error.message,
      };
    }
  }

  async searchCommunes(query, city = 'Abidjan') {
  try {
    const searchQuery = city && city.trim().length > 0
      ? `${query}, ${city.trim()}, Côte d'Ivoire`
      : `${query}, Côte d'Ivoire`;

    // ✅ includedType (singulier) via le premier type uniquement
    const result = await this.searchText(searchQuery, {
      includedTypes: ['locality'], // ← searchText prendra includedTypes[0] = 'locality'
      maxResults: 10,
    });

    return result;
  } catch (error) {
    console.error('Erreur recherche communes:', error);
    return { success: false, error: error.message };
  }
}

  async searchGaresRoutieres(latitude, longitude, radius = 10000) {
    try {
      return await this.searchNearby(latitude, longitude, {
        includedTypes: ['bus_station', 'transit_station', 'taxi_stand'],
        radius,
        maxResults: 15,
      });
    } catch (error) {
      console.error('Erreur recherche gares:', error);
      return { success: false, error: error.message };
    }
  }

  async searchStationsProches(latitude, longitude, radius = 5000) {
    try {
      return await this.searchNearby(latitude, longitude, {
        includedTypes: [
          'bus_station', 'transit_station', 'train_station',
          'light_rail_station', 'subway_station'
        ],
        radius,
        maxResults: 20,
        rankPreference: 'DISTANCE',
      });
    } catch (error) {
      console.error('Erreur recherche stations proches:', error);
      return { success: false, error: error.message };
    }
  }

  async searchPolices(latitude, longitude, radius = 10000) {
    try {
      return await this.searchNearby(latitude, longitude, {
        includedTypes: ['police'],
        radius,
        maxResults: 20,
        rankPreference: 'DISTANCE',
      });
    } catch (error) {
      console.error('Erreur recherche polices:', error);
      return { success: false, error: error.message };
    }
  }

  async searchStations(latitude, longitude, type = 'all', radius = 5000) {
    try {
      const typeMap = {
        bus: ['bus_station'],
        train: ['train_station', 'subway_station', 'light_rail_station'],
        transit: ['transit_station'],
        taxi: ['taxi_stand'],
        all: ['bus_station', 'transit_station', 'train_station', 'light_rail_station', 'subway_station', 'taxi_stand'],
      };

      const result = await this.searchNearby(latitude, longitude, {
        includedTypes: typeMap[type] || typeMap.all,
        radius,
        maxResults: 20,
        rankPreference: 'DISTANCE',
      });

      if (result.success && result.data) {
        result.data = result.data.map(place => ({ ...place, stationType: type }));
      }

      return result;
    } catch (error) {
      console.error('Erreur recherche stations:', error);
      return { success: false, error: error.message };
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

      return await this.searchNearby(latitude, longitude, {
        includedTypes: typeMap[type] || [type],
        radius,
        maxResults: 20,
        rankPreference: 'DISTANCE',
      });
    } catch (error) {
      console.error('Erreur recherche POI:', error);
      return { success: false, error: error.message };
    }
  }

  async searchAllTotalEnergies() {
    try {
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
      const seenIds = new Set();

      for (const city of cities) {
        try {
          const requestBody = {
            textQuery: `TotalEnergies ${city.name}`,
            languageCode: 'fr',
            regionCode: 'CI',
            maxResultCount: 20,
            includedType: 'gas_station',
            locationBias: {
              circle: {
                center: { latitude: city.lat, longitude: city.lng },
                radius: 50000.0
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

          if (response.data?.places?.length > 0) {
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
                city: city.name,
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
        }
      }

      if (allStations.length > 0) {
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

      return { success: false, error: "Aucune station TotalEnergies trouvée en Côte d'Ivoire" };
    } catch (error) {
      console.error('Erreur searchAllTotalEnergies:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.error?.message || error.message
      };
    }
  }
  
  async searchNearbyTotalEnergies(latitude, longitude, radius = 10000) {
    try {
      // ✅ Corrigé : validation qui accepte coordonnée = 0
      if (latitude === undefined || latitude === null || longitude === undefined || longitude === null) {
        return { success: false, error: 'Latitude et longitude sont requises' };
      }

      const lat = parseFloat(latitude);
      const lon = parseFloat(longitude);

      if (isNaN(lat) || isNaN(lon)) {
        return { success: false, error: 'Latitude et longitude doivent être des nombres valides' };
      }

      if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        return { success: false, error: 'Coordonnées géographiques invalides' };
      }

      const validRadius = Math.min(Math.max(radius, 100), 50000);

      const requestBody = {
        languageCode: 'fr',
        maxResultCount: 20,
        includedTypes: ['gas_station'],
        locationRestriction: {
          circle: {
            center: { latitude: lat, longitude: lon },
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

      if (response.data?.places?.length > 0) {
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

        const stations = totalStations.map(place => {
          const distance = this._calculateDistance(lat, lon, place.location.latitude, place.location.longitude);
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
      if (error.response?.data?.error) {
        return {
          success: false,
          error: error.response.data.error.message || 'Erreur API Google Places',
          code: error.response.data.error.code
        };
      }
      return { success: false, error: error.message || 'Erreur lors de la recherche de stations' };
    }
  }

  // -------------------------------------------------------
  // MÉTHODES PRIVÉES
  // -------------------------------------------------------

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
      // ✅ Corrigé : phoneNumber → nationalPhoneNumber
      details: 'id,displayName,formattedAddress,location,types,primaryType,rating,userRatingCount,priceLevel,businessStatus,nationalPhoneNumber,websiteUri,regularOpeningHours,addressComponents',
    };
    return masks[type] || masks.search;
  }

  _formatPlace(place, userLocation = null) {
    const formatted = {
      placeId: place.id,
      name: place.displayName?.text || '',
      address: place.formattedAddress || '',
      latitude: place.location?.latitude,
      longitude: place.location?.longitude,
      types: place.types || [],
      primaryType: place.primaryType,
      rating: place.rating || null,
      userRatingCount: place.userRatingCount || 0,
      priceLevel: place.priceLevel || null,
      businessStatus: place.businessStatus || 'OPERATIONAL',
      phoneNumber: place.nationalPhoneNumber || null,
      website: place.websiteUri || null,
      openingHours: place.regularOpeningHours?.weekdayDescriptions || [],
      isOpen: place.regularOpeningHours?.openNow || null,
      category: this._getCategoryFromTypes(place.types || []),
      distance: null,
      distanceText: null,
      distanceUnit: null
    };

    if (userLocation && formatted.latitude && formatted.longitude) {
      const dist = this._calculateDistance(
        userLocation.latitude,
        userLocation.longitude,
        formatted.latitude,
        formatted.longitude
      );
      formatted.distance = parseFloat(dist.toFixed(2));
      formatted.distanceText = dist < 1
        ? `${(dist * 1000).toFixed(0)} m`
        : `${dist.toFixed(1)} km`;
      formatted.distanceUnit = dist < 1 ? 'm' : 'km';
    }

    return formatted;
  }

  _getCategoryFromTypes(types) {
    if (!types || !Array.isArray(types)) return 'Lieu';

    const categoryMap = {
      'bus_station': 'Gare routière',
      'transit_station': 'Station de transport',
      'train_station': 'Gare ferroviaire',
      'subway_station': 'Station de métro',
      'taxi_stand': 'Station de taxi',
      'airport': 'Aéroport',
      'gas_station': 'Station-service',
      'parking': 'Parking',
      'car_repair': 'Garage',
      'car_dealer': 'Concessionnaire',
      'shopping_mall': 'Centre commercial',
      'supermarket': 'Supermarché',
      'market': 'Marché',
      'store': 'Magasin',
      'department_store': 'Grand magasin',
      'pharmacy': 'Pharmacie',
      'convenience_store': 'Épicerie',
      'restaurant': 'Restaurant',
      'cafe': 'Café',
      'bar': 'Bar',
      'bakery': 'Boulangerie',
      'meal_takeaway': 'Restauration rapide',
      'food': 'Alimentation',
      'hospital': 'Hôpital',
      'doctor': 'Médecin',
      'dentist': 'Dentiste',
      'health': 'Centre de santé',
      'physiotherapist': 'Kinésithérapeute',
      'school': 'École',
      'university': 'Université',
      'library': 'Bibliothèque',
      'preschool': 'Crèche',
      'bank': 'Banque',
      'atm': 'Distributeur automatique',
      'police': 'Commissariat',
      'post_office': 'Bureau de poste',
      'fire_station': 'Caserne de pompiers',
      'courthouse': 'Palais de justice',
      'city_hall': 'Mairie',
      'hotel': 'Hôtel',
      'lodging': 'Hébergement',
      'resort_hotel': 'Resort',
      'motel': 'Motel',
      'hostel': 'Auberge',
      'movie_theater': 'Cinéma',
      'night_club': 'Boîte de nuit',
      'stadium': 'Stade',
      'park': 'Parc',
      'amusement_park': "Parc d'attractions",
      'museum': 'Musée',
      'art_gallery': "Galerie d'art",
      'zoo': 'Zoo',
      'aquarium': 'Aquarium',
      'church': 'Église',
      'mosque': 'Mosquée',
      'hindu_temple': 'Temple hindou',
      'synagogue': 'Synagogue',
      'place_of_worship': 'Lieu de culte',
      'gym': 'Salle de sport',
      'fitness_center': 'Centre de fitness',
      'sports_complex': 'Complexe sportif',
      'swimming_pool': 'Piscine',
      'natural_feature': 'Site naturel',
      'beach': 'Plage',
      'mountain': 'Montagne',
      'forest': 'Forêt',
      'tourist_attraction': 'Attraction touristique',
      'landmark': 'Monument',
      'historical_landmark': 'Monument historique',
      'point_of_interest': "Point d'intérêt",
      'locality': 'Localité',
      'sublocality': 'Quartier',
      'neighborhood': 'Quartier',
      'administrative_area_level_3': 'Commune',
      'administrative_area_level_2': 'Département',
      'administrative_area_level_1': 'Région',
      'country': 'Pays',
      'postal_code': 'Code postal'
    };

    for (const type of types) {
      if (categoryMap[type]) return categoryMap[type];
    }

    return 'Lieu';
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
      if (component.types.includes('street_number')) extracted.streetNumber = component.longText;
      if (component.types.includes('route')) extracted.street = component.longText;
      if (component.types.includes('locality')) extracted.city = component.longText;
      if (component.types.includes('sublocality')) extracted.commune = component.longText;
      if (component.types.includes('administrative_area_level_1')) extracted.region = component.longText;
      if (component.types.includes('country')) {
        extracted.country = component.longText;
        extracted.countryCode = component.shortText;
      }
      if (component.types.includes('postal_code')) extracted.postalCode = component.longText;
    });
    return extracted;
  }

  _chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }

  // ✅ Corrigé : utilise une vraie requête pour tester l'API
  async healthCheck() {
    try {
      if (!this.apiKey) {
        return { status: 'unhealthy', error: 'API Key non configurée' };
      }

      await axios.post(
        `${this.baseUrl}/places:searchText`,
        { textQuery: 'Abidjan', maxResultCount: 1, languageCode: 'fr' },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': this.apiKey,
            'X-Goog-FieldMask': 'places.id',
          },
          timeout: 5000
        }
      );

      return {
        status: 'operational',
        apiKeyConfigured: true,
        baseUrl: this.baseUrl
      };
    } catch (error) {
      return {
        status: 'degraded',
        apiKeyConfigured: !!this.apiKey,
        error: error.message
      };
    }
  }
}

module.exports = new PlacesV2Service();