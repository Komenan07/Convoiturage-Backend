jest.mock('../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
  }
}));

jest.mock('../services/emailService', () => ({
  envoyerEmail: jest.fn()
}));

jest.mock('../services/whatsappService', () => ({
  envoyerMessage: jest.fn()
}));

jest.mock('../models/Utilisateur', () => ({
  findById: jest.fn()
}));

const User = require('../models/Utilisateur');
const emailService = require('../services/emailService');

const mockSave = jest.fn();
const mockPopulate = jest.fn();
const mockDocumentsManquants = jest.fn();
const mockDocumentsValides = jest.fn();
const mockEstDisponiblePourTrajet = jest.fn();
const mockValider = jest.fn();
const mockRejeter = jest.fn();

jest.mock('../models/Vehicule', () => {
  class Vehicule {
    constructor(data = {}) {
      Object.assign(this, data);
      this.save = mockSave;
      this.populate = mockPopulate;
      this.documentsManquants = mockDocumentsManquants;
      this.documentsValides = mockDocumentsValides;
      this.estDisponiblePourTrajet = mockEstDisponiblePourTrajet;
      this.valider = mockValider;
      this.rejeter = mockRejeter;
      this.toObject = jest.fn().mockReturnValue({
        _id: this._id,
        marque: this.marque,
        modele: this.modele,
        immatriculation: this.immatriculation,
        couleur: this.couleur,
        annee: this.annee,
        nombrePlaces: this.nombrePlaces,
        placesDisponibles: this.placesDisponibles,
        statut: this.statut,
        estPrincipal: this.estPrincipal,
        documentsComplets: this.documentsComplets,
        photos: this.photos,
        proprietaireId: this.proprietaireId,
        scoreSecurity: this.scoreSecurity,
        scoreConfort: this.scoreConfort,
        tauxFiabilite: this.tauxFiabilite,
        validation: this.validation,
        statistiques: this.statistiques
      });
    }
  }

  Vehicule.countDocuments = jest.fn();
  Vehicule.findOne = jest.fn();
  Vehicule.findById = jest.fn();
  Vehicule.findByIdAndDelete = jest.fn();
  Vehicule.trouverDisponibles = jest.fn();
  Vehicule.aggregate = jest.fn();
  Vehicule.topParNote = jest.fn();
  Vehicule.rechercheAvancee = jest.fn();
  Vehicule.documentsExpiresOuBientot = jest.fn();
  Vehicule.enAttenteValidation = jest.fn();
  Vehicule.avecSignalementsNonTraites = jest.fn();
  Vehicule.maintenanceRequise = jest.fn();
  Vehicule.statistiquesGlobales = jest.fn();

  return Vehicule;
});

const vehiculeController = require('../controllers/vehiculeController');
const Vehicule = require('../models/Vehicule');

const createMockVehicule = (overrides = {}) => {
  const vehicule = {
    _id: 'vehicule-1',
    marque: 'Toyota',
    modele: 'Corolla',
    immatriculation: 'AB-123-AB',
    couleur: 'Blanc',
    annee: 2020,
    nombrePlaces: 4,
    placesDisponibles: 4,
    statut: 'EN_ATTENTE_VERIFICATION',
    estPrincipal: false,
    documentsComplets: false,
    photos: {},
    proprietaireId: {
      _id: 'user-1',
      nom: 'Dupont',
      prenom: 'Jean',
      email: 'jean.dupont@example.com',
      telephone: '0123456789'
    },
    scoreSecurity: 80,
    scoreConfort: 75,
    tauxFiabilite: 90,
    validation: { statutValidation: 'NON_VALIDE' },
    statistiques: { noteMoyenne: 4.8, nombreAvis: 5 },
    documentsManquants: jest.fn().mockReturnValue({
      manquants: ['assurance'],
      nombreManquants: 1,
      pourcentageCompletion: 80,
      complet: false
    }),
    documentsValides: jest.fn().mockReturnValue({ alertes: [] }),
    calculerScoreEligibilite: jest.fn().mockReturnValue(92),
    estDisponiblePourTrajet: jest.fn().mockReturnValue({ disponible: true, raisons: [], score: 95 }),
    valider: jest.fn().mockResolvedValue(undefined),
    rejeter: jest.fn().mockResolvedValue(undefined),
    save: mockSave,
    populate: mockPopulate,
    toObject: jest.fn().mockReturnValue({
      _id: 'vehicule-1',
      marque: 'Toyota',
      modele: 'Corolla',
      immatriculation: 'AB-123-AB',
      couleur: 'Blanc',
      annee: 2020,
      nombrePlaces: 4,
      placesDisponibles: 4,
      statut: 'EN_ATTENTE_VERIFICATION',
      estPrincipal: false,
      documentsComplets: false,
      photos: {},
      proprietaireId: {
        _id: 'user-1',
        nom: 'Dupont',
        prenom: 'Jean',
        email: 'jean.dupont@example.com',
        telephone: '0123456789'
      },
      scoreSecurity: 80,
      scoreConfort: 75,
      tauxFiabilite: 90,
      validation: { statutValidation: 'NON_VALIDE' },
      statistiques: { noteMoyenne: 4.8, nombreAvis: 5 }
    })
  };
  return Object.assign(vehicule, overrides);
};

describe('vehiculeController', () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    jest.clearAllMocks();

    req = {
      params: {},
      query: {},
      body: {},
      user: { userId: 'user-1', role: 'conducteur' }
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    next = jest.fn();

    mockSave.mockReset().mockResolvedValue(undefined);
    mockPopulate.mockReset().mockImplementation(async function () {
      this.proprietaireId = {
        _id: 'user-1',
        nom: 'Dupont',
        prenom: 'Jean',
        email: 'jean.dupont@example.com',
        telephone: '0123456789'
      };
      return this;
    });
    mockDocumentsManquants.mockReset().mockReturnValue({
      manquants: ['assurance'],
      nombreManquants: 1,
      pourcentageCompletion: 80,
      complet: false
    });
    mockDocumentsValides.mockReset().mockReturnValue({ alertes: [] });
    mockEstDisponiblePourTrajet.mockReset().mockReturnValue({ disponible: true, raisons: [], score: 95 });
    mockValider.mockReset().mockResolvedValue(undefined);
    mockRejeter.mockReset().mockResolvedValue(undefined);

    Vehicule.countDocuments.mockReset();
    Vehicule.findOne.mockReset();
    Vehicule.findById.mockReset();
    Vehicule.trouverDisponibles.mockReset();
  });

  describe('creerVehicule', () => {
    it('crée un véhicule en corrigeant l immatriculation, en parsant les champs JSON et en définissant le premier véhicule comme principal', async () => {
      req.body = {
        marque: 'Toyota',
        modele: 'Corolla',
        immatriculation: 'AB-123-111',
        equipements: '{"climatisation":true}',
        commodites: '{"wifi":true}',
        preferences: '{"animauxAutorises":false}',
        couleur: 'Blanc',
        annee: 2020,
        nombrePlaces: 4
      };
      req.files = [
        { fieldname: 'avant', filename: 'avant.jpg' },
        { fieldname: 'interieur', filename: 'interieur.jpg' }
      ];

      User.findById.mockResolvedValue({
        _id: 'user-1',
        documentIdentite: { statutVerification: 'VERIFIE' }
      });
      Vehicule.countDocuments.mockResolvedValue(0);

      await vehiculeController.creerVehicule(req, res, next);

      expect(User.findById).toHaveBeenCalledWith('user-1');
      expect(Vehicule.countDocuments).toHaveBeenCalledWith({ proprietaireId: 'user-1' });
      expect(mockSave).toHaveBeenCalled();
      expect(mockPopulate).toHaveBeenCalledWith('proprietaireId', 'nom prenom email telephone photoProfil');

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          vehicule: expect.objectContaining({
            immatriculation: 'AB-123-AB',
            estPrincipal: true,
            marque: 'Toyota',
            modele: 'Corolla'
          }),
          documentsManquants: expect.objectContaining({
            liste: ['assurance'],
            nombre: 1,
            pourcentageCompletion: 80
          })
        })
      }));
    });

    it('renvoie 403 si l utilisateur n est pas vérifié', async () => {
      User.findById.mockResolvedValue({
        _id: 'user-1',
        documentIdentite: { statutVerification: 'NON_VERIFIE' }
      });

      await vehiculeController.creerVehicule(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Votre identité doit être vérifiée pour ajouter un véhicule',
        code: 'IDENTITY_NOT_VERIFIED',
        currentStatus: 'NON_VERIFIE'
      });
    });
  });

  describe('verifierDisponibiliteTrajet', () => {
    it('retourne la disponibilité du véhicule en fonction du nombre de places demandé', async () => {
      req.params.vehiculeId = '64af8e1f1b2c3d4e5f6a7b8c';
      req.query.nombrePlaces = '3';

      const mockVehicule = createMockVehicule();
      Vehicule.findOne.mockResolvedValue(mockVehicule);

      await vehiculeController.verifierDisponibiliteTrajet(req, res, next);

      expect(Vehicule.findOne).toHaveBeenCalledWith({
        _id: '64af8e1f1b2c3d4e5f6a7b8c',
        proprietaireId: 'user-1'
      });
      expect(mockVehicule.estDisponiblePourTrajet).toHaveBeenCalledWith(3);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          vehicule: {
            id: 'vehicule-1',
            immatriculation: 'AB-123-AB',
            marque: 'Toyota',
            modele: 'Corolla',
            placesDisponibles: 4
          },
          disponibilite: true,
          raisons: [],
          scoreEligibilite: 95
        }
      });
    });

    it('renvoie 404 si le véhicule est introuvable', async () => {
      req.params.vehiculeId = '64af8e1f1b2c3d4e5f6a7b8c';
      Vehicule.findOne.mockResolvedValue(null);

      await vehiculeController.verifierDisponibiliteTrajet(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Véhicule non trouvé'
      });
    });
  });

  describe('rechercherVehiculesDisponibles', () => {
    it('construit les critères de recherche et renvoie les véhicules disponibles', async () => {
      req.query = {
        nombrePlaces: '4',
        noteMin: '4.0',
        ville: 'Abidjan',
        anneeMin: '2018',
        carburant: 'essence',
        climatisation: 'true',
        wifi: 'true',
        chargeur: 'true',
        animaux: 'true',
        fumeur: 'false'
      };

      const vehiculeResult = createMockVehicule();
      Vehicule.trouverDisponibles.mockResolvedValue([vehiculeResult]);

      await vehiculeController.rechercherVehiculesDisponibles(req, res, next);

      expect(Vehicule.trouverDisponibles).toHaveBeenCalledWith({
        nombrePlacesMin: '4',
        noteMinimale: '4.0',
        ville: 'Abidjan',
        anneeMinimum: '2018',
        carburant: 'essence',
        equipements: { climatisation: true },
        commodites: { wifi: true, chargeurTelephone: true },
        preferences: { animauxAutorises: true, fumeurAutorise: false }
      });
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          vehicules: [expect.objectContaining({
            _id: 'vehicule-1',
            marque: 'Toyota',
            modele: 'Corolla'
          })],
          total: 1
        }
      });
    });
  });

  describe('validerVehicule', () => {
    it('bloque la validation lorsqu il manque des documents et envoie une notification', async () => {
      req.params.vehiculeId = '64af8e1f1b2c3d4e5f6a7b8c';
      req.body = { commentaire: 'Test' };
      const vehicule = createMockVehicule();
      vehicule.documentsManquants = jest.fn().mockReturnValue({
        manquants: ['assurance'],
        nombreManquants: 1,
        pourcentageCompletion: 80,
        complet: false
      });
      Vehicule.findById.mockImplementation(() => ({
        populate: jest.fn().mockResolvedValue(vehicule)
      }));

      await vehiculeController.validerVehicule(req, res, next);

      expect(Vehicule.findById).toHaveBeenCalledWith('64af8e1f1b2c3d4e5f6a7b8c');
      expect(emailService.envoyerEmail).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        code: 'DOCUMENTS_MANQUANTS'
      }));
    });

    it('valide le véhicule avec validation forcée et envoie la notification de validation', async () => {
      req.params.vehiculeId = '64af8e1f1b2c3d4e5f6a7b8c';
      req.body = { commentaire: 'Validation forcée', forcerValidation: true };
      const vehicule = createMockVehicule();
      vehicule.documentsManquants = jest.fn().mockReturnValue({
        manquants: ['assurance'],
        nombreManquants: 1,
        pourcentageCompletion: 80,
        complet: false
      });
      vehicule.validation = { statutValidation: 'EN_COURS' };
      Vehicule.findById.mockImplementation(() => ({
        populate: jest.fn().mockResolvedValue(vehicule)
      }));

      await vehiculeController.validerVehicule(req, res, next);

      expect(vehicule.valider).toHaveBeenCalledWith('user-1', 'Validation forcée');
      expect(emailService.envoyerEmail).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        data: expect.objectContaining({
          validationForcee: true,
          documentsManquants: expect.any(Object)
        })
      }));
    });
  });

  describe('rejeterVehicule', () => {
    it('renvoie 400 si la raison de rejet est trop courte', async () => {
      req.params.vehiculeId = '64af8e1f1b2c3d4e5f6a7b8c';
      req.body = { raison: 'Court' };

      await vehiculeController.rejeterVehicule(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Raison du rejet requise (minimum 10 caractères)'
      });
    });

    it('rejette un véhicule et notifie le propriétaire', async () => {
      req.params.vehiculeId = '64af8e1f1b2c3d4e5f6a7b8c';
      req.body = { raison: 'Documents invalides depuis 10 jours' };
      const vehicule = createMockVehicule();
      Vehicule.findById.mockImplementation(() => ({
        populate: jest.fn().mockResolvedValue(vehicule)
      }));

      await vehiculeController.rejeterVehicule(req, res, next);

      expect(vehicule.rejeter).toHaveBeenCalledWith('Documents invalides depuis 10 jours', 'user-1');
      expect(emailService.envoyerEmail).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        message: 'Véhicule rejeté',
        data: expect.objectContaining({
          raisonRejet: 'Documents invalides depuis 10 jours'
        })
      }));
    });
  });
});