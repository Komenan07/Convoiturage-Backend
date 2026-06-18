// __tests__/placesV2Controller.test.js
const placesV2Controller = require('../controllers/placesV2Controller');
const placesV2Service = require('../services/placesV2Service');

jest.mock('../services/placesV2Service');

describe('PlacesV2Controller', () => {
  let req, res, mockService;

  beforeEach(() => {
    jest.clearAllMocks();
    req = {
      body: {},
      params: {},
      query: {}
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis()
    };

    mockService = placesV2Service;
  });

  describe('searchText', () => {
    it('devrait retourner les résultats avec succès', async () => {
      req.body = { query: 'restaurant' };
      mockService.searchText.mockResolvedValueOnce({
        success: true,
        data: [{ placeId: 'places/123', name: 'Restaurant XYZ' }]
      });

      await placesV2Controller.searchText(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(mockService.searchText).toHaveBeenCalled();
    });

    it('devrait valider la longueur minimale', async () => {
      req.body = { query: 'x' };
      
      await placesV2Controller.searchText(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('devrait retourner 404 si aucun résultat', async () => {
      req.body = { query: 'test' };
      mockService.searchText.mockResolvedValueOnce({
        success: false,
        error: 'Aucun résultat'
      });

      await placesV2Controller.searchText(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
    });
  });

  describe('searchNearby', () => {
    it('devrait retourner les lieux à proximité', async () => {
      req.body = {
        latitude: 5.3364,
        longitude: -4.0255,
        radius: 5000
      };

      mockService.searchNearby.mockResolvedValueOnce({
        success: true,
        data: [{ placeId: 'places/789', name: 'Station' }]
      });

      await placesV2Controller.searchNearby(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('devrait accepter coordonnées = 0', async () => {
      req.body = {
        latitude: 0,
        longitude: 0
      };

      mockService.searchNearby.mockResolvedValueOnce({
        success: true,
        data: []
      });

      await placesV2Controller.searchNearby(req, res);

      expect(mockService.searchNearby).toHaveBeenCalledWith(0, 0, expect.any(Object));
    });

    it('devrait rejeter coordonnées invalides', async () => {
      req.body = { latitude: null, longitude: -4.0255 };

      await placesV2Controller.searchNearby(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('autocomplete', () => {
    it('devrait retourner les suggestions', async () => {
      req.body = { input: 'Abi' };

      mockService.autocomplete.mockResolvedValueOnce({
        success: true,
        data: [{ mainText: 'Abidjan' }]
      });

      await placesV2Controller.autocomplete(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('devrait valider longueur minimale', async () => {
      req.body = { input: 'A' };

      await placesV2Controller.autocomplete(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('getPlaceDetails', () => {
    it('devrait retourner les détails', async () => {
      req.params = { placeId: 'places/123' };

      mockService.getPlaceDetails.mockResolvedValueOnce({
        success: true,
        data: { placeId: 'places/123', name: 'Lieu' }
      });

      await placesV2Controller.getPlaceDetails(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('devrait valider placeId', async () => {
      req.params = {};

      await placesV2Controller.getPlaceDetails(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('getBatchPlaceDetails', () => {
    it('devrait retourner les détails de plusieurs lieux', async () => {
      req.body = {
        placeIds: ['places/1', 'places/2']
      };

      mockService.getPlaceDetails
        .mockResolvedValueOnce({ success: true, data: { placeId: 'places/1' } })
        .mockResolvedValueOnce({ success: true, data: { placeId: 'places/2' } });

      await placesV2Controller.getBatchPlaceDetails(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('devrait valider tableau', async () => {
      req.body = { placeIds: 'places/1' };

      await placesV2Controller.getBatchPlaceDetails(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('devrait limiter à 50', async () => {
      req.body = { placeIds: Array(51).fill('places/1') };

      await placesV2Controller.getBatchPlaceDetails(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('healthCheck', () => {
    it('devrait retourner 200 si opérationnel', async () => {
      mockService.healthCheck.mockResolvedValueOnce({
        status: 'operational'
      });

      await placesV2Controller.healthCheck(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('devrait retourner 503 si offline', async () => {
      mockService.healthCheck.mockResolvedValueOnce({
        status: 'offline'
      });

      await placesV2Controller.healthCheck(req, res);

      expect(res.status).toHaveBeenCalledWith(503);
    });
  });

  describe('getPlaceTypes', () => {
    it('devrait retourner types', () => {
      placesV2Controller.getPlaceTypes(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe('searchCommunes', () => {
    it('devrait rechercher communes', async () => {
      req.body = { query: 'Yam', city: 'Abidjan' };

      mockService.searchCommunes.mockResolvedValueOnce({
        success: true,
        data: [{ name: 'Yamoussoukro' }]
      });

      await placesV2Controller.searchCommunes(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe('searchGaresRoutieres', () => {
    it('devrait rechercher gares', async () => {
      req.body = {
        latitude: 5.3364,
        longitude: -4.0255
      };

      mockService.searchGaresRoutieres.mockResolvedValueOnce({
        success: true,
        data: []
      });

      await placesV2Controller.searchGaresRoutieres(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe('searchStationsProches', () => {
    it('devrait rechercher stations', async () => {
      req.body = {
        latitude: 5.3364,
        longitude: -4.0255
      };

      mockService.searchStationsProches.mockResolvedValueOnce({
        success: true,
        data: []
      });

      await placesV2Controller.searchStationsProches(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe('searchPolices', () => {
    it('devrait rechercher polices', async () => {
      req.body = {
        latitude: 5.3364,
        longitude: -4.0255
      };

      mockService.searchPolices.mockResolvedValueOnce({
        success: true,
        data: []
      });

      await placesV2Controller.searchPolices(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe('searchStations', () => {
    it('devrait rechercher stations', async () => {
      req.body = {
        latitude: 5.3364,
        longitude: -4.0255,
        type: 'bus'
      };

      mockService.searchStations.mockResolvedValueOnce({
        success: true,
        data: []
      });

      await placesV2Controller.searchStations(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('devrait valider type', async () => {
      req.body = {
        latitude: 5.3364,
        longitude: -4.0255,
        type: 'invalid'
      };

      await placesV2Controller.searchStations(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('searchPOI', () => {
    it('devrait rechercher POI', async () => {
      req.body = {
        latitude: 5.3364,
        longitude: -4.0255,
        type: 'restaurant'
      };

      mockService.searchPOI.mockResolvedValueOnce({
        success: true,
        data: []
      });

      await placesV2Controller.searchPOI(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('devrait valider type POI', async () => {
      req.body = {
        latitude: 5.3364,
        longitude: -4.0255,
        type: 'invalid-type'
      };

      await placesV2Controller.searchPOI(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('getAllTotalEnergies', () => {
    it('devrait retourner stations', async () => {
      mockService.searchAllTotalEnergies.mockResolvedValueOnce({
        success: true,
        data: [{ name: 'TotalEnergies' }]
      });

      await placesV2Controller.getAllTotalEnergies(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe('getNearbyTotalEnergies', () => {
    it('devrait retourner stations proches', async () => {
      req.body = {
        latitude: 5.3364,
        longitude: -4.0255
      };

      mockService.searchNearbyTotalEnergies.mockResolvedValueOnce({
        success: true,
        data: []
      });

      await placesV2Controller.getNearbyTotalEnergies(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe('searchWithFilters', () => {
    it('devrait chercher avec filtres', async () => {
      req.body = {
        query: 'restaurant',
        latitude: 5.3364,
        longitude: -4.0255
      };

      mockService.searchText.mockResolvedValueOnce({
        success: true,
        data: []
      });

      await placesV2Controller.searchWithFilters(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe('getPopularPlaces', () => {
    it('devrait retourner lieux populaires', async () => {
      req.query = {
        latitude: '5.3364',
        longitude: '-4.0255'
      };

      mockService.searchNearby.mockResolvedValueOnce({
        success: true,
        data: []
      });

      await placesV2Controller.getPopularPlaces(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe('searchNearbyByCategory', () => {
    it('devrait rechercher par catégorie', async () => {
      req.body = {
        latitude: 5.3364,
        longitude: -4.0255,
        category: 'restaurants'
      };

      mockService.searchNearby.mockResolvedValueOnce({
        success: true,
        data: []
      });

      await placesV2Controller.searchNearbyByCategory(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });
  });
});
