jest.mock('../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn()
  }
}));

jest.mock('../services/geoSearchService', () => ({
  searchNearbyTrips: jest.fn(),
  searchByCommune: jest.fn(),
  smartSearch: jest.fn(),
  getConfig: jest.fn()
}));

jest.mock('../models/Trajet', () => ({
  paginate: jest.fn()
}));

jest.mock('../services/firebaseService', () => ({}));
jest.mock('../services/notificationService', () => ({}));
jest.mock('../services/evaluationService', () => ({}));
jest.mock('../models/Utilisateur', () => ({}));
jest.mock('../models/Reservation', () => ({}));

const trajetSearchController = require('../controllers/trajetSearchController');
const trajetController = require('../controllers/trajetController');
const geoSearchService = require('../services/geoSearchService');
const Trajet = require('../models/Trajet');

describe('trajetController', () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    req = { body: {}, query: {}, user: { id: 'user-123' } };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    next = jest.fn();
    jest.clearAllMocks();
  });

  describe('trajetSearchController.searchNearbyTrips', () => {
    it('renvoie 400 si les coordonnées de départ sont manquantes', async () => {
      req.body = { arriveeLat: '6.0', arriveeLng: '-3.0' };

      await trajetSearchController.searchNearbyTrips(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Les coordonnées de départ (departLat, departLng) sont obligatoires'
      });
      expect(geoSearchService.searchNearbyTrips).not.toHaveBeenCalled();
    });

    it('parse les filtres et appelle geoSearchService.searchNearbyTrips', async () => {
      req.body = {
        departLat: '5.325',
        departLng: '-4.012',
        arriveeLat: '6.123',
        arriveeLng: '-3.789',
        communeArrivee: 'Abidjan',
        quartierArrivee: 'Cocody',
        rayonDepart: '10',
        rayonArrivee: '8',
        rayonMontee: '1.5',
        dateDepart: '2025-01-01',
        toleranceDate: '4',
        nombrePassagers: '2',
        prixMax: '1500',
        noteMin: '4.5',
        musique: 'true',
        climatisation: 'false',
        bagages: 'true',
        nonFumeur: 'false',
        limit: '50',
        debugGeo: 'true'
      };

      const expectedResult = {
        success: true,
        count: 1,
        methode: 'geo',
        docs: [{ id: 'trajet-1' }]
      };

      geoSearchService.searchNearbyTrips.mockResolvedValue(expectedResult);

      await trajetSearchController.searchNearbyTrips(req, res, next);

      expect(geoSearchService.searchNearbyTrips).toHaveBeenCalledWith({
        departLat: 5.325,
        departLng: -4.012,
        arriveeLat: 6.123,
        arriveeLng: -3.789,
        communeArrivee: 'Abidjan',
        quartierArrivee: 'Cocody',
        rayonDepart: 10,
        rayonArrivee: 8,
        rayonMontee: 1.5,
        dateDepart: new Date('2025-01-01'),
        toleranceDate: 4,
        nombrePassagers: 2,
        prixMax: 1500,
        noteMin: 4.5,
        musique: true,
        climatisation: false,
        bagages: true,
        nonFumeur: false,
        limit: 50,
        debugGeo: true
      });

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expectedResult);
    });
  });

  describe('trajetSearchController.searchByCommune', () => {
    it('renvoie 400 si les communes de départ ou d arrivée sont manquantes', async () => {
      req.body = { communeDepart: 'Yopougon' };

      await trajetSearchController.searchByCommune(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Les communes de départ et d\'arrivée sont obligatoires'
      });
      expect(geoSearchService.searchByCommune).not.toHaveBeenCalled();
    });

    it('parse les filtres et appelle geoSearchService.searchByCommune', async () => {
      req.body = {
        communeDepart: 'Cocody',
        communeArrivee: 'Plateau',
        quartierDepart: '2 Plateaux',
        quartierArrivee: 'Plateau Sud',
        dateDepart: '2025-02-14',
        toleranceDate: '3',
        nombrePassagers: '4',
        prixMax: '2000',
        noteMin: '4.0',
        musique: 'true',
        climatisation: 'true',
        bagages: 'false',
        nonFumeur: 'true',
        limit: '25'
      };

      const expectedResult = { success: true, count: 2, docs: [{ id: 'trajet-2' }] };
      geoSearchService.searchByCommune.mockResolvedValue(expectedResult);

      await trajetSearchController.searchByCommune(req, res, next);

      expect(geoSearchService.searchByCommune).toHaveBeenCalledWith({
        communeDepart: 'Cocody',
        communeArrivee: 'Plateau',
        quartierDepart: '2 Plateaux',
        quartierArrivee: 'Plateau Sud',
        dateDepart: new Date('2025-02-14'),
        toleranceDate: 3,
        nombrePassagers: 4,
        prixMax: 2000,
        noteMin: 4,
        musique: true,
        climatisation: true,
        bagages: false,
        nonFumeur: true,
        limit: 25
      });

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expectedResult);
    });
  });

  describe('trajetSearchController.smartSearch', () => {
    it('renvoie 400 si ni coordonnées GPS ni communes ne sont fournies', async () => {
      req.body = { noteMin: '3' };

      await trajetSearchController.smartSearch(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Veuillez fournir soit les coordonnées GPS (departLat, departLng, arriveeLat, arriveeLng), soit les communes (communeDepart, communeArrivee)'
      });
      expect(geoSearchService.smartSearch).not.toHaveBeenCalled();
    });

    it('parse les filtres et appelle geoSearchService.smartSearch', async () => {
      req.body = {
        departLat: '5.325',
        departLng: '-4.012',
        arriveeLat: '6.123',
        arriveeLng: '-3.789',
        communeDepart: 'Cocody',
        communeArrivee: 'Plateau',
        rayonDepart: '12',
        rayonArrivee: '7',
        rayonMontee: '1',
        dateDepart: '2025-03-11',
        toleranceDate: '2',
        nombrePassagers: '1',
        prixMax: '1000',
        noteMin: '4.8',
        musique: 'false',
        climatisation: 'true',
        bagages: 'true',
        nonFumeur: 'false',
        limit: '15',
        debugGeo: true
      };

      const expectedResult = { success: true, count: 3, methode: 'smart', docs: [{ id: 'trajet-3' }] };
      geoSearchService.smartSearch.mockResolvedValue(expectedResult);

      await trajetSearchController.smartSearch(req, res, next);

      expect(geoSearchService.smartSearch).toHaveBeenCalledWith({
        departLat: 5.325,
        departLng: -4.012,
        arriveeLat: 6.123,
        arriveeLng: -3.789,
        communeDepart: 'Cocody',
        communeArrivee: 'Plateau',
        quartierDepart: undefined,
        quartierArrivee: undefined,
        rayonDepart: 12,
        rayonArrivee: 7,
        rayonMontee: 1,
        dateDepart: new Date('2025-03-11'),
        toleranceDate: 2,
        nombrePassagers: 1,
        prixMax: 1000,
        noteMin: 4.8,
        musique: false,
        climatisation: true,
        bagages: true,
        nonFumeur: false,
        limit: 15,
        debugGeo: true
      });

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expectedResult);
    });
  });

  describe('trajetController.filtrerTrajets', () => {
    it('construit correctement la requête et renvoie les résultats', async () => {
      req.query = {
        dateDepart: '2025-06-01',
        dateFin: '2025-06-03',
        prixMin: '1000',
        prixMax: '5000',
        typeTrajet: 'ALLER',
        page: '2',
        limit: '30'
      };

      const paginateResult = {
        docs: [{ _id: 'trajet-1' }],
        page: 2,
        totalPages: 1,
        totalDocs: 1,
        limit: 30
      };
      Trajet.paginate.mockResolvedValue(paginateResult);

      await trajetController.filtrerTrajets(req, res, next);

      expect(Trajet.paginate).toHaveBeenCalledWith(
        expect.objectContaining({
          statutTrajet: 'PROGRAMME',
          dateDepart: {
            $gte: expect.any(Date),
            $lte: expect.any(Date)
          },
          prixParPassager: { $gte: 1000, $lte: 5000 },
          typeTrajet: 'ALLER'
        }),
        expect.objectContaining({
          page: 2,
          limit: 30,
          sort: { dateDepart: 1 },
          populate: { path: 'conducteurId', select: 'nom prenom photoProfil noteGenerale' }
        })
      );

      const query = Trajet.paginate.mock.calls[0][0];
      expect(query.dateDepart.$gte.toISOString()).toBe('2025-06-01T00:00:00.000Z');
      expect(query.dateDepart.$lte.toISOString()).toBe('2025-06-03T23:59:59.999Z');

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        count: paginateResult.docs.length,
        pagination: {
          total: paginateResult.totalDocs,
          page: paginateResult.page,
          pages: paginateResult.totalPages,
          limit: paginateResult.limit
        },
        data: paginateResult.docs
      });
    });
  });
});
