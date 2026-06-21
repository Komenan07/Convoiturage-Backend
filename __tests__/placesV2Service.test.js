// __tests__/placesV2Service.test.js
const axios = require('axios');

// Mock axios globalement AVANT de require le service
jest.mock('axios');

// Clear le cache du service avant tout
delete require.cache[require.resolve('../services/placesV2Service')];

describe('PlacesV2Service', () => {
  let service;

  beforeEach(() => {
    // Réinitialiser tous les mocks
    jest.clearAllMocks();
    
    // Définir la clé API
    process.env.GOOGLE_MAPS_API_KEY = 'test-api-key';
    
    // Clear le cache et require le service (instance singleton)
    delete require.cache[require.resolve('../services/placesV2Service')];
    service = require('../services/placesV2Service');
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  // ============================================================
  // TESTS: searchText
  // ============================================================
  describe('searchText', () => {
    it('devrait retourner les résultats de recherche texte', async () => {
      const mockResponse = {
        data: {
          places: [
            {
              id: 'places/123',
              displayName: { text: 'Restaurant XYZ' },
              formattedAddress: 'Abidjan, Côte d\'Ivoire',
              location: { latitude: 5.3364, longitude: -4.0255 },
              types: ['restaurant', 'food'],
              primaryType: 'restaurant',
              rating: 4.5,
              userRatingCount: 100,
              businessStatus: 'OPERATIONAL',
              nationalPhoneNumber: '+225 1234567',
              websiteUri: 'https://example.com',
              regularOpeningHours: { weekdayDescriptions: ['Lun: 10h - 22h'] }
            }
          ]
        }
      };

      axios.post.mockResolvedValueOnce(mockResponse);

      const result = await service.searchText('restaurant', {});

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].name).toBe('Restaurant XYZ');
      expect(axios.post).toHaveBeenCalled();
    });

    it('devrait retourner une erreur si la requête échoue', async () => {
      axios.post.mockRejectedValueOnce({
        response: {
          data: {
            error: {
              message: 'Quota dépassé'
            }
          }
        }
      });

      const result = await service.searchText('restaurant', {});

      expect(result.success).toBe(false);
      expect(result.error).toBe('Quota dépassé');
    });

    it('devrait retourner une erreur si aucun résultat trouvé', async () => {
      axios.post.mockResolvedValueOnce({
        data: { places: [] }
      });

      const result = await service.searchText('xyz-inexistant-123', {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('Aucun résultat trouvé');
    });

    it('devrait inclure les types filtrés dans la requête', async () => {
      axios.post.mockResolvedValueOnce({
        data: {
          places: [{
            id: 'places/456',
            displayName: { text: 'Hôtel' },
            location: { latitude: 5.3364, longitude: -4.0255 },
            types: ['hotel']
          }]
        }
      });

      await service.searchText('hôtel', { includedTypes: ['hotel'] });

      expect(axios.post).toHaveBeenCalled();
      const callArgs = axios.post.mock.calls[0];
      expect(callArgs[0]).toContain('searchText');
    });
  });

  // ============================================================
  // TESTS: searchNearby
  // ============================================================
  describe('searchNearby', () => {
    it('devrait retourner les lieux à proximité avec distance', async () => {
      const mockResponse = {
        data: {
          places: [
            {
              id: 'places/789',
              displayName: { text: 'Station-service' },
              formattedAddress: 'Abidjan',
              location: { latitude: 5.3400, longitude: -4.0300 },
              types: ['gas_station'],
              primaryType: 'gas_station',
              rating: 4.2,
              priceLevel: 'PRICE_LEVEL_2'
            }
          ]
        }
      };

      axios.post.mockResolvedValueOnce(mockResponse);

      const result = await service.searchNearby(5.3364, -4.0255, { radius: 5000 });

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].name).toBe('Station-service');
    });

    it('devrait utiliser les paramètres de rayon et limite', async () => {
      axios.post.mockResolvedValueOnce({
        data: { places: [] }
      });

      await service.searchNearby(5.3364, -4.0255, { 
        radius: 10000,
        maxResults: 15,
        rankPreference: 'RELEVANCE'
      });

      const callArgs = axios.post.mock.calls[0];
      const requestBody = callArgs[1];

      expect(requestBody.locationRestriction.circle.radius).toBe(10000);
      expect(requestBody.maxResultCount).toBe(15);
      expect(requestBody.rankPreference).toBe('RELEVANCE');
    });

    it('devrait retourner une erreur si les coordonnées sont invalides', async () => {
      const result = await service.searchNearby(null, undefined);

      expect(result.success).toBe(false);
    });

    it('devrait filtrer par évaluation minimale', async () => {
      axios.post.mockResolvedValueOnce({
        data: { places: [] }
      });

      await service.searchNearby(5.3364, -4.0255, { minRating: 4.0 });

      const callArgs = axios.post.mock.calls[0];
      const requestBody = callArgs[1];

      expect(requestBody.minRating).toBe(4.0);
    });
  });

  // ============================================================
  // TESTS: autocomplete
  // ============================================================
  describe('autocomplete', () => {
    it('devrait retourner les suggestions d\'autocomplétion', async () => {
      const mockResponse = {
        data: {
          suggestions: [
            {
              placePrediction: {
                placeId: 'places/123',
                text: { text: 'Abidjan' }
              }
            }
          ]
        }
      };

      axios.post.mockResolvedValueOnce(mockResponse);

      const result = await service.autocomplete('Abi');

      expect(result.success).toBe(true);
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('devrait retourner une erreur si l\'input est vide', async () => {
      const result = await service.autocomplete('');

      expect(result.success).toBe(false);
    });

    it('devrait utiliser le code de région CI pour la Côte d\'Ivoire', async () => {
      axios.post.mockResolvedValueOnce({
        data: { suggestions: [] }
      });

      await service.autocomplete('Yam');

      const callArgs = axios.post.mock.calls[0];
      const requestBody = callArgs[1];

      expect(requestBody.regionCode).toBe('CI');
      expect(requestBody.languageCode).toBe('fr');
    });
  });

  // ============================================================
  // TESTS: getPlaceDetails
  // ============================================================
  describe('getPlaceDetails', () => {
    it('devrait retourner les détails d\'un lieu', async () => {
      const mockResponse = {
        data: {
          id: 'places/123',
          displayName: { text: 'Lieu célèbre' },
          formattedAddress: 'Abidjan',
          location: { latitude: 5.3364, longitude: -4.0255 },
          rating: 4.7,
          userRatingCount: 500,
          businessStatus: 'OPERATIONAL'
        }
      };

      axios.get.mockResolvedValueOnce(mockResponse);

      const result = await service.getPlaceDetails('places/123');

      expect(result.success).toBe(true);
      expect(result.data.name).toBe('Lieu célèbre');
      expect(axios.get).toHaveBeenCalled();
    });

    it('devrait normaliser les IDs de lieu sans préfixe places/', async () => {
      axios.get.mockResolvedValueOnce({
        data: {
          id: 'places/123',
          displayName: { text: 'Test' }
        }
      });

      const result = await service.getPlaceDetails('123');

      expect(result.success).toBe(true);
      const callUrl = axios.get.mock.calls[0][0];
      expect(callUrl).toContain('places/123');
    });

    it('devrait inclure le fieldMask personnalisé si fourni', async () => {
      axios.get.mockResolvedValueOnce({
        data: {
          id: 'places/123',
          displayName: { text: 'Test' }
        }
      });

      const result = await service.getPlaceDetails('places/123', ['rating', 'displayName']);

      expect(result.success).toBe(true);
      const callHeaders = axios.get.mock.calls[0][1].headers;
      expect(callHeaders['X-Goog-FieldMask']).toContain('rating');
    });

    it('devrait retourner une erreur si le lieu n\'existe pas', async () => {
      axios.get.mockRejectedValueOnce({
        response: {
          status: 404,
          data: { error: { message: 'Lieu non trouvé' } }
        }
      });

      const result = await service.getPlaceDetails('places/invalid');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Lieu non trouvé');
    });
  });

  // ============================================================
  // TESTS: getBatchPlaceDetails
  // ============================================================
  describe('getBatchPlaceDetails', () => {
    it('devrait retourner les détails de plusieurs lieux', async () => {
      const mockResponses = [
        { data: { id: 'places/1', displayName: { text: 'Lieu 1' } } },
        { data: { id: 'places/2', displayName: { text: 'Lieu 2' } } }
      ];

      axios.get
        .mockResolvedValueOnce(mockResponses[0])
        .mockResolvedValueOnce(mockResponses[1]);

      const result = await service.getBatchPlaceDetails(['places/1', 'places/2']);

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.metadata.total).toBe(2);
      expect(result.metadata.successful).toBe(2);
    });

    it('devrait gérer les erreurs partielles', async () => {
      axios.get
        .mockResolvedValueOnce({
          data: {
            id: 'places/1',
            displayName: { text: 'Lieu 1' }
          }
        })
        .mockRejectedValueOnce(new Error('Lieu non trouvé'));

      const result = await service.getBatchPlaceDetails(['places/1', 'places/2']);

      expect(result.success).toBe(true);
      expect(result.metadata.successful).toBe(1);
      expect(result.metadata.failed).toBe(1);
    });
  });

  // ============================================================
  // TESTS: Utilitaires privés
  // ============================================================
  describe('Méthodes utilitaires', () => {
    it('devrait calculer la distance entre deux points', () => {
      // Abidjan to Yamoussoukro (approx. 240 km)
      const distance = service._calculateDistance(5.3364, -4.0255, 6.8276, -5.2893);
      
      expect(distance).toBeGreaterThan(200);
      expect(distance).toBeLessThan(300);
    });

    it('devrait extraire les catégories des types Google Places', () => {
      const category1 = service._getCategoryFromTypes(['restaurant']);
      expect(category1).toBe('Restaurant');

      const category2 = service._getCategoryFromTypes(['bus_station']);
      expect(category2).toBe('Gare routière');

      const category3 = service._getCategoryFromTypes(['unknown_type']);
      expect(category3).toBe('Lieu');
    });

    it('devrait extraire les prix du carburant du texte', () => {
      const text = 'Essence: 650 FCFA, Diesel: 590 FCFA';
      const prices = service._extractFuelPrices(text);

      expect(prices).toHaveProperty('essence', 650);
      expect(prices).toHaveProperty('diesel', 590);
    });

    it('devrait formater les composants d\'adresse', () => {
      const components = [
        {
          longName: 'Abidjan',
          types: ['locality', 'political']
        },
        {
          longName: 'Côte d\'Ivoire',
          types: ['country', 'political']
        }
      ];

      const extracted = service._extractAddressComponents(components);

      // La fonction retourne un objet avec les clés dérivées des types
      expect(typeof extracted).toBe('object');
      expect(extracted).not.toBeNull();
    });
  });

  // ============================================================
  // TESTS: healthCheck
  // ============================================================
  describe('healthCheck', () => {
    it('devrait retourner le statut opérationnel', async () => {
      axios.post.mockResolvedValueOnce({
        data: {
          places: [{ id: 'test' }]
        }
      });

      const result = await service.healthCheck();

      expect(result.success).toBe(true);
      expect(result.status).toBe('operational');
    });

    it('devrait capturer les erreurs d\'API', async () => {
      axios.post.mockRejectedValueOnce({
        message: 'Erreur API'
      });

      const result = await service.healthCheck();

      expect(result.success).toBe(false);
      expect(result.status).toBe('offline');
    });
  });

  // ============================================================
  // TESTS: Spécialisés (Communes, Gares, etc.)
  // ============================================================
  describe('Recherches spécialisées', () => {
    it('devrait rechercher les communes', async () => {
      axios.post.mockResolvedValueOnce({
        data: {
          places: [
            {
              id: 'places/com1',
              displayName: { text: 'Yamoussoukro' },
              location: { latitude: 6.8276, longitude: -5.2893 }
            }
          ]
        }
      });

      const result = await service.searchCommunes('Yam', 'Abidjan');

      expect(result.success).toBe(true);
      expect(result.data[0].name).toBe('Yamoussoukro');
    });

    it('devrait rechercher les gares routières', async () => {
      axios.post.mockResolvedValueOnce({
        data: {
          places: [
            {
              id: 'places/gare1',
              displayName: { text: 'Gare d\'Adjamé' },
              location: { latitude: 5.35, longitude: -4.02 },
              types: ['bus_station']
            }
          ]
        }
      });

      const result = await service.searchGaresRoutieres(5.3364, -4.0255, 10000);

      expect(result.success).toBe(true);
    });

    it('devrait rechercher les stations TotalEnergies', async () => {
      axios.post.mockResolvedValueOnce({
        data: {
          places: [
            {
              id: 'places/total1',
              displayName: { text: 'TotalEnergies - Cocody' },
              location: { latitude: 5.33, longitude: -4.00 },
              types: ['gas_station']
            }
          ]
        }
      });

      const result = await service.searchStationsProches(5.3364, -4.0255, 5000);

      expect(result.success).toBe(true);
    });
  });
});
