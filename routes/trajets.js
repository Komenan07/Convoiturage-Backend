const express = require('express');
const { body, query, param } = require('express-validator');
const trajetController = require('../controllers/trajetController');
const { auth } = require('../middleware/auth'); 
const rateLimiter = require('../middleware/rateLimiter');

const router = express.Router();

// ==================== VALIDATIONS ====================

/**
 * Validation pour les points géographiques
 */
const validatePoint = (fieldName) => [
  body(`${fieldName}.nom`).notEmpty().withMessage(`Le nom du ${fieldName} est requis`),
  body(`${fieldName}.adresse`).notEmpty().withMessage(`L'adresse du ${fieldName} est requise`),
  body(`${fieldName}.commune`).notEmpty().withMessage(`La commune du ${fieldName} est requise`),
  body(`${fieldName}.quartier`).notEmpty().withMessage(`Le quartier du ${fieldName} est requis`),
  body(`${fieldName}.coordonnees.type`).equals('Point').withMessage('Le type de coordonnées doit être "Point"'),
  body(`${fieldName}.coordonnees.coordinates`)
    .isArray({ min: 2, max: 2 })
    .withMessage('Les coordonnées doivent contenir exactement 2 éléments')
    .custom((coordinates) => {
      const [longitude, latitude] = coordinates;
      if (longitude < -180 || longitude > 180) {
        throw new Error('Longitude invalide (doit être entre -180 et 180)');
      }
      if (latitude < -90 || latitude > 90) {
        throw new Error('Latitude invalide (doit être entre -90 et 90)');
      }
      return true;
    })
];

/**
 * Validation pour la création de trajet ponctuel
 */
const validateTrajetPonctuel = [
  // Points de départ et d'arrivée
  ...validatePoint('pointDepart'),
  ...validatePoint('pointArrivee'),
  
  // Planification
  body('dateDepart')
    .isISO8601()
    .withMessage('Format de date invalide')
    .custom((date) => {
      if (new Date(date) <= new Date()) {
        throw new Error('La date de départ doit être dans le futur');
      }
      return true;
    }),
  body('heureDepart')
    .matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage('Format d\'heure invalide (HH:MM attendu)'),
  
  // Détails du trajet
  body('prixParPassager')
    .isInt({ min: 0 })
    .withMessage('Le prix par passager doit être un entier positif'),
  body('nombrePlacesTotal')
    .isInt({ min: 1, max: 8 })
    .withMessage('Le nombre de places total doit être entre 1 et 8'),
  body('nombrePlacesDisponibles')
    .isInt({ min: 0 })
    .withMessage('Le nombre de places disponibles doit être un entier positif')
    .custom((value, { req }) => {
      if (value > req.body.nombrePlacesTotal) {
        throw new Error('Les places disponibles ne peuvent pas dépasser le total');
      }
      return true;
    }),
  
  // Véhicule
  body('vehiculeUtilise.marque').notEmpty().withMessage('La marque du véhicule est requise'),
  body('vehiculeUtilise.modele').notEmpty().withMessage('Le modèle du véhicule est requis'),
  body('vehiculeUtilise.couleur').notEmpty().withMessage('La couleur du véhicule est requise'),
  body('vehiculeUtilise.immatriculation').notEmpty().withMessage('L\'immatriculation est requise'),
  body('vehiculeUtilise.nombrePlaces')
    .isInt({ min: 1, max: 8 })
    .withMessage('Le nombre de places du véhicule doit être entre 1 et 8'),
  
  // Préférences (optionnelles)
  body('preferences.accepteFemmesSeulement')
    .optional()
    .isBoolean()
    .withMessage('accepteFemmesSeulement doit être un booléen'),
  body('preferences.accepteHommesSeuleument')
    .optional()
    .isBoolean()
    .withMessage('accepteHommesSeuleument doit être un booléen')
    .custom((value, { req }) => {
      if (value && req.body.preferences?.accepteFemmesSeulement) {
        throw new Error('Ne peut pas accepter exclusivement les deux genres');
      }
      return true;
    }),
  body('preferences.typeBagages')
    .optional()
    .isIn(['PETIT', 'MOYEN', 'GRAND'])
    .withMessage('Type de bagages invalide'),
  body('preferences.conversation')
    .optional()
    .isIn(['AUCUNE', 'LIMITEE', 'LIBRE'])
    .withMessage('Type de conversation invalide')
];

/**
 * Validation pour la création de trajet récurrent
 */
const validateTrajetRecurrent = [
  ...validateTrajetPonctuel,
  
  // Récurrence
  body('recurrence.jours')
    .isArray({ min: 1 })
    .withMessage('Au moins un jour de récurrence est requis')
    .custom((jours) => {
      const joursValides = ['LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI', 'DIMANCHE'];
      const joursInvalides = jours.filter(jour => !joursValides.includes(jour));
      if (joursInvalides.length > 0) {
        throw new Error(`Jours invalides: ${joursInvalides.join(', ')}`);
      }
      return true;
    }),
  body('recurrence.dateFinRecurrence')
    .optional()
    .isISO8601()
    .withMessage('Format de date de fin de récurrence invalide')
    .custom((date) => {
      if (date && new Date(date) <= new Date()) {
        throw new Error('La date de fin de récurrence doit être dans le futur');
      }
      return true;
    })
];

/**
 * Validation pour la recherche géospatiale
 */
const validateRechercheGeo = [
  query('longitude')
    .optional()
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude invalide'),
  query('latitude')
    .optional()
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude invalide'),
  query('rayonKm')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Rayon doit être entre 1 et 100 km'),
  query('dateDepart')
    .optional()
    .isISO8601()
    .withMessage('Format de date de départ invalide'),
  query('dateFin')
    .optional()
    .isISO8601()
    .withMessage('Format de date de fin invalide'),
  query('prixMax')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Prix maximum doit être un entier positif'),
  query('nombrePlacesMin')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Nombre minimum de places doit être positif')
];

/**
 * Validation pour les filtres avancés
 */
const validateFiltres = [
  query('dateDepart').optional().isISO8601().withMessage('Format de date invalide'),
  query('dateFin').optional().isISO8601().withMessage('Format de date invalide'),
  query('prixMin').optional().isInt({ min: 0 }).withMessage('Prix minimum invalide'),
  query('prixMax').optional().isInt({ min: 0 }).withMessage('Prix maximum invalide'),
  query('typeTrajet').optional().isIn(['PONCTUEL', 'RECURRENT', 'EVENEMENTIEL']).withMessage('Type de trajet invalide'),
  query('commune').optional().isString().withMessage('Commune doit être une chaîne'),
  query('page').optional().isInt({ min: 1 }).withMessage('Page doit être un entier positif'),
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limite doit être entre 1 et 50')
];

/**
 * Validation pour la modification des places
 */
const validatePlaces = [
  body('nombrePlacesDisponibles')
    .isInt({ min: 0 })
    .withMessage('Le nombre de places disponibles doit être un entier positif')
];

/**
 * Validation pour les préférences
 */
const validatePreferences = [
  body('accepteFemmesSeulement')
    .optional()
    .isBoolean()
    .withMessage('accepteFemmesSeulement doit être un booléen'),
  body('accepteHommesSeuleument')
    .optional()
    .isBoolean()
    .withMessage('accepteHommesSeuleument doit être un booléen'),
  body('accepteBagages')
    .optional()
    .isBoolean()
    .withMessage('accepteBagages doit être un booléen'),
  body('typeBagages')
    .optional()
    .isIn(['PETIT', 'MOYEN', 'GRAND'])
    .withMessage('Type de bagages invalide'),
  body('musique')
    .optional()
    .isBoolean()
    .withMessage('musique doit être un booléen'),
  body('conversation')
    .optional()
    .isIn(['AUCUNE', 'LIMITEE', 'LIBRE'])
    .withMessage('Type de conversation invalide'),
  body('fumeur')
    .optional()
    .isBoolean()
    .withMessage('fumeur doit être un booléen')
];

/**
 * Validation pour le changement de statut
 */
const validateStatut = [
  body('statutTrajet')
    .isIn(['PROGRAMME', 'EN_COURS', 'TERMINE', 'ANNULE'])
    .withMessage('Statut de trajet invalide')
];

/**
 * Validation pour l'annulation
 */
const validateAnnulation = [
  body('motifAnnulation')
    .optional()
    .isString()
    .withMessage('Le motif d\'annulation doit être une chaîne')
    .isLength({ max: 500 })
    .withMessage('Le motif ne peut pas dépasser 500 caractères')
];

/**
 * Validation des paramètres d'ID
 */
const validateId = [
  param('id').isMongoId().withMessage('ID de trajet invalide')
];

const validateConducteurId = [
  param('conducteurId').isMongoId().withMessage('ID de conducteur invalide')
];

// ==================== MIDDLEWARES ====================

/**
 * Rate limiting pour les créations
 */
const createTrajetLimiter = rateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Maximum 10 créations par 15 minutes
  message: {
    success: false,
    message: 'Trop de créations de trajets. Réessayez dans 15 minutes.'
  }
});

/**
 * Rate limiting pour les recherches
 */
const searchLimiter = rateLimiter({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // Maximum 30 recherches par minute
  message: {
    success: false,
    message: 'Trop de recherches. Réessayez dans une minute.'
  }
});

// ==================== ROUTES CREATE ====================

/**
 * POST /api/trajets/ponctuel
 * Créer un trajet ponctuel
 */
router.post('/ponctuel',
  createTrajetLimiter,
  auth,
  validateTrajetPonctuel,
  trajetController.creerTrajetPonctuel
);

/**
 * POST /api/trajets/recurrent
 * Créer un trajet récurrent
 */
router.post('/recurrent',
  createTrajetLimiter,
  auth,
  validateTrajetRecurrent,
  trajetController.creerTrajetRecurrent
);

// ==================== ROUTES READ ====================

/**
 * GET /api/trajets/rechercher
 * Rechercher trajets disponibles (avec géolocalisation)
 */
router.get('/rechercher',
  searchLimiter,
  validateRechercheGeo,
  trajetController.rechercherTrajetsDisponibles
);

/**
 * GET /api/trajets/filtrer
 * Filtrer les trajets avec critères avancés
 */
router.get('/filtrer',
  searchLimiter,
  validateFiltres,
  trajetController.filtrerTrajets
);

/**
 * GET /api/trajets/:id
 * Obtenir les détails complets d'un trajet
 */
router.get('/:id',
  validateId,
  trajetController.obtenirDetailsTrajet
);

/**
 * GET /api/trajets/conducteur/:conducteurId
 * Obtenir tous les trajets d'un conducteur
 */
router.get('/conducteur/:conducteurId',
  validateConducteurId,
  trajetController.obtenirTrajetsConducteur
);

/**
 * GET /api/trajets/mes-trajets/historique
 * Obtenir l'historique des trajets de l'utilisateur connecté
 */
router.get('/mes-trajets/historique',
  auth,
  trajetController.obtenirHistoriqueTrajets
);

// ==================== ROUTES UPDATE ====================

/**
 * PUT /api/trajets/:id
 * Modifier les détails d'un trajet
 */
router.put('/:id',
  auth,
  validateId,
  // Réutiliser les validations de création mais rendre tout optionnel
  trajetController.modifierDetailsTrajet
);

/**
 * PATCH /api/trajets/:id/places
 * Changer le nombre de places disponibles
 */
router.patch('/:id/places',
  auth,
  validateId,
  validatePlaces,
  trajetController.changerNombrePlaces
);

/**
 * PATCH /api/trajets/:id/preferences
 * Modifier les préférences du trajet
 */
router.patch('/:id/preferences',
  auth,
  validateId,
  validatePreferences,
  trajetController.modifierPreferences
);

/**
 * PATCH /api/trajets/:id/statut
 * Mettre à jour le statut du trajet
 */
router.patch('/:id/statut',
  auth,
  validateId,
  validateStatut,
  trajetController.mettreAJourStatut
);

// ==================== ROUTES DELETE ====================

/**
 * PATCH /api/trajets/:id/annuler
 * Annuler un trajet (avec notifications)
 */
router.patch('/:id/annuler',
  auth,
  validateId,
  validateAnnulation,
  trajetController.annulerTrajet
);

/**
 * DELETE /api/trajets/:id
 * Supprimer un trajet récurrent
 */
router.delete('/:id',
  auth,
  validateId,
  trajetController.supprimerTrajetRecurrent
);

// ==================== ROUTES UTILITAIRES ====================

/**
 * GET /api/trajets/stats/conducteur
 * Obtenir les statistiques d'un conducteur
 */
router.get('/stats/conducteur/:conducteurId',
  validateConducteurId,
  async (req, res) => {
    try {
      const { conducteurId } = req.params;
      
      const stats = await Trajet.aggregate([
        { $match: { conducteurId: mongoose.Types.ObjectId(conducteurId) } },
        {
          $group: {
            _id: null,
            totalTrajets: { $sum: 1 },
            trajetsTermines: { 
              $sum: { $cond: [{ $eq: ['$statutTrajet', 'TERMINE'] }, 1, 0] } 
            },
            trajetsAnnules: { 
              $sum: { $cond: [{ $eq: ['$statutTrajet', 'ANNULE'] }, 1, 0] } 
            },
            kmTotaux: { $sum: '$distance' },
            revenusEstimes: { 
              $sum: { 
                $multiply: [
                  '$prixParPassager', 
                  { $subtract: ['$nombrePlacesTotal', '$nombrePlacesDisponibles'] }
                ] 
              } 
            }
          }
        }
      ]);

      res.json({
        success: true,
        data: stats[0] || {
          totalTrajets: 0,
          trajetsTermines: 0,
          trajetsAnnules: 0,
          kmTotaux: 0,
          revenusEstimes: 0
        }
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des statistiques',
        error: error.message
      });
    }
  }
);

/**
 * GET /api/trajets/proximite/communes
 * Obtenir les communes populaires pour les trajets
 */
router.get('/proximite/communes',
  async (req, res) => {
    try {
      const communes = await Trajet.aggregate([
        { $match: { statutTrajet: 'PROGRAMME' } },
        {
          $group: {
            _id: {
              commune: '$pointDepart.commune',
              type: 'depart'
            },
            count: { $sum: 1 }
          }
        },
        {
          $unionWith: {
            coll: 'trajets',
            pipeline: [
              { $match: { statutTrajet: 'PROGRAMME' } },
              {
                $group: {
                  _id: {
                    commune: '$pointArrivee.commune',
                    type: 'arrivee'
                  },
                  count: { $sum: 1 }
                }
              }
            ]
          }
        },
        {
          $group: {
            _id: '$_id.commune',
            totalTrajets: { $sum: '$count' },
            details: {
              $push: {
                type: '$_id.type',
                count: '$count'
              }
            }
          }
        },
        { $sort: { totalTrajets: -1 } },
        { $limit: 20 }
      ]);

      res.json({
        success: true,
        data: communes
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des communes',
        error: error.message
      });
    }
  }
);

// ==================== MIDDLEWARE D'ERREUR ====================

/**
 * Middleware de gestion d'erreurs spécifique aux trajets
 */
router.use((error, req, res, next) => {
  console.error('Erreur dans les routes trajets:', error);

  // Erreurs de validation Mongoose
  if (error.name === 'ValidationError') {
    const errors = Object.values(error.errors).map(err => ({
      field: err.path,
      message: err.message
    }));

    return res.status(400).json({
      success: false,
      message: 'Erreur de validation',
      errors
    });
  }

  // Erreur de duplication MongoDB
  if (error.code === 11000) {
    return res.status(400).json({
      success: false,
      message: 'Données en conflit (duplicate)',
      field: Object.keys(error.keyPattern)[0]
    });
  }

  // Erreur CastError (ID invalide)
  if (error.name === 'CastError') {
    return res.status(400).json({
      success: false,
      message: 'ID invalide',
      path: error.path
    });
  }

  // Erreur générale
  res.status(500).json({
    success: false,
    message: 'Erreur interne du serveur',
    error: process.env.NODE_ENV === 'development' ? error.message : 'Une erreur est survenue'
  });
});

module.exports = router;