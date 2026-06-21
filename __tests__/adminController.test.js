const Administrateur = require('../models/Administrateur');
const { listerAdmins } = require('../controllers/adminController');

describe('adminController.listerAdmins', () => {
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

  it('construit correctement les filtres et appelle rechercheAvancee avec les bons paramètres', async () => {
    req.query = {
      page: '2',
      limit: '5',
      sort: '-createdAt',
      email: 'admin@example.com',
      nom: 'Dupont',
      role: 'SUPER_ADMIN',
      statutCompte: 'ACTIF',
      dateDebut: '2026-01-01',
      dateFin: '2026-12-31'
    };

    const expectedResult = {
      admins: [],
      pagination: {
        page: 2,
        limit: 5,
        total: 0,
        totalPages: 0,
        hasNextPage: false,
        hasPrevPage: false
      }
    };

    jest.spyOn(Administrateur, 'rechercheAvancee').mockResolvedValue(expectedResult);

    await listerAdmins(req, res, next);

    expect(Administrateur.rechercheAvancee).toHaveBeenCalledWith(
      {
        email: 'admin@example.com',
        nom: 'Dupont',
        role: 'SUPER_ADMIN',
        statutCompte: 'ACTIF',
        dateCreation: {
          debut: '2026-01-01',
          fin: '2026-12-31'
        }
      },
      expect.objectContaining({
        page: 2,
        limit: 5,
        sort: '-createdAt',
        populate: true
      })
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Liste des administrateurs récupérée',
      data: expectedResult
    });
  });

  it('appelle rechercheAvancee sans filtres lorsque les paramètres optionnels ne sont pas fournis', async () => {
    req.query = {
      page: '1',
      limit: '10',
      sort: 'createdAt'
    };

    const expectedResult = {
      admins: [],
      pagination: {
        page: 1,
        limit: 10,
        total: 0,
        totalPages: 0,
        hasNextPage: false,
        hasPrevPage: false
      }
    };

    jest.spyOn(Administrateur, 'rechercheAvancee').mockResolvedValue(expectedResult);

    await listerAdmins(req, res, next);

    expect(Administrateur.rechercheAvancee).toHaveBeenCalledWith({}, expect.objectContaining({
      page: 1,
      limit: 10,
      sort: 'createdAt',
      populate: true
    }));

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Liste des administrateurs récupérée',
      data: expectedResult
    });
  });
});
