jest.mock('../utils/logger', () => ({
  logger: {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

jest.mock('../middlewares/uploadMiddleware', () => ({
  uploadProfilPhoto: jest.fn((req, res, next) => next()),
  uploadDocument: jest.fn((req, res, next) => next())
}));

jest.mock('../models/Utilisateur', () => ({
  paginate: jest.fn()
}));

const User = require('../models/Utilisateur');
const { obtenirUtilisateurs, rechercherUtilisateurs } = require('../controllers/utilisateurController');

describe('utilisateurController', () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    req = {
      query: {}
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    next = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('obtenirUtilisateurs', () => {
    it('doit appliquer correctement les filtres et renvoyer les résultats', async () => {
      req.query = {
        page: '2',
        limit: '10',
        role: 'conducteur',
        statutCompte: 'ACTIF',
        ville: 'Abidjan',
        commune: 'Yopougon',
        scoreMin: '4.5',
        dateInscriptionDebut: '2025-01-01',
        dateInscriptionFin: '2025-12-31',
        sortBy: 'dateInscription',
        sortOrder: 'desc',
        q: 'Dupont'
      };

      const paginateResult = {
        docs: [{ id: '1', nom: 'Dupont' }],
        page: 2,
        totalPages: 1,
        totalDocs: 1,
        hasNextPage: false,
        hasPrevPage: true,
        limit: 10
      };

      jest.spyOn(User, 'paginate').mockResolvedValue(paginateResult);

      await obtenirUtilisateurs(req, res, next);

      expect(User.paginate).toHaveBeenCalledWith(
        {
          role: 'conducteur',
          statutCompte: 'ACTIF',
          'adresse.ville': { $regex: 'Abidjan', $options: 'i' },
          'adresse.commune': { $regex: 'Yopougon', $options: 'i' },
          scoreConfiance: { $gte: 4.5 },
          dateInscription: {
            $gte: new Date('2025-01-01'),
            $lte: new Date('2025-12-31')
          },
          $or: [
            { nom: { $regex: 'Dupont', $options: 'i' } },
            { prenom: { $regex: 'Dupont', $options: 'i' } },
            { email: { $regex: 'Dupont', $options: 'i' } },
            { telephone: { $regex: 'Dupont', $options: 'i' } }
          ]
        },
        expect.objectContaining({
          page: 2,
          limit: 10,
          sort: { dateInscription: -1 },
          select: expect.any(String),
          populate: expect.any(Array)
        })
      );

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          utilisateurs: paginateResult.docs,
          pagination: {
            currentPage: 2,
            totalPages: 1,
            totalCount: 1,
            hasNextPage: false,
            hasPrevPage: true,
            limit: 10
          },
          filtres: {
            role: 'conducteur',
            statutCompte: 'ACTIF',
            ville: 'Abidjan',
            commune: 'Yopougon',
            scoreMin: '4.5',
            dateInscriptionDebut: '2025-01-01',
            dateInscriptionFin: '2025-12-31',
            recherche: 'Dupont'
          }
        }
      });
    });
  });

  describe('rechercherUtilisateurs', () => {
    it('doit construire la requête avancée et renvoyer les résultats', async () => {
      req.query = {
        page: '3',
        limit: '15',
        q: 'test',
        role: 'moderateur',
        statutCompte: 'SUSPENDU',
        ville: 'Yamoussoukro',
        commune: 'Kossou',
        scoreMin: '2',
        dateInscriptionDebut: '2024-05-01',
        dateInscriptionFin: '2024-05-31',
        sortBy: 'nom',
        sortOrder: 'asc'
      };

      const paginateResult = {
        docs: [{ id: '2', nom: 'Testeur' }],
        page: 3,
        totalPages: 1,
        totalDocs: 1,
        hasNextPage: false,
        hasPrevPage: true
      };

      jest.spyOn(User, 'paginate').mockResolvedValue(paginateResult);

      await rechercherUtilisateurs(req, res, next);

      expect(User.paginate).toHaveBeenCalledWith(
        {
          $or: [
            { nom: { $regex: 'test', $options: 'i' } },
            { prenom: { $regex: 'test', $options: 'i' } },
            { email: { $regex: 'test', $options: 'i' } }
          ],
          role: 'moderateur',
          statutCompte: 'SUSPENDU',
          'adresse.ville': { $regex: 'Yamoussoukro', $options: 'i' },
          'adresse.commune': { $regex: 'Kossou', $options: 'i' },
          scoreConfiance: { $gte: 2 },
          dateInscription: {
            $gte: new Date('2024-05-01'),
            $lte: new Date('2024-05-31')
          }
        },
        expect.objectContaining({
          page: 3,
          limit: 15,
          sort: { nom: 1 },
          select: expect.any(String)
        })
      );

      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          utilisateurs: paginateResult.docs,
          pagination: {
            currentPage: 3,
            totalPages: 1,
            totalCount: 1,
            hasNextPage: false,
            hasPrevPage: true
          },
          criteres: {
            q: 'test',
            role: 'moderateur',
            statutCompte: 'SUSPENDU',
            ville: 'Yamoussoukro',
            commune: 'Kossou',
            scoreMin: '2'
          }
        }
      });
    });
  });
});
