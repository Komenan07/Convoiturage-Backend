// routes/trajetRoutes.js
const express = require('express');
const { body, query, param, validationResult } = require('express-validator');
const TrajetController = require('../controllers/trajetController');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { transformerCoordonneesEnGeoJSON } = require('../middlewares/geoJsonMiddleware');
const router = express.Router();

// ===============================================
// MIDDLEWARE DE VALIDATION DES ERREURS
// ===============================================

/**
 * Middleware centralisé pour gérer les erreurs de validation
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Erreurs de validation',
      errors: errors.array().map(error => ({
        champ: error.path || error.param,
        message: error.msg,
        valeur: error.value
      }))
    });
  }
  next();
};

// ===============================================
// VALIDATIONS RÉUTILISABLES
// ===============================================

// Validation du point de départ
const validatePointDepart = [
  body('pointDepart.nom')
    .trim()
    .notEmpty().withMessage('Le nom du point de départ est requis')
    .isLength({ min: 2, max: 200 }).withMessage('Le nom doit contenir entre 2 et 200 caractères'),
  body('pointDepart.adresse')
    // .notEmpty().withMessage('L\'adresse du point de départ est requise')
    .trim()
    .isLength({ max: 500 }).withMessage('L\'adresse ne peut pas dépasser 500 caractères'),
  body('pointDepart.coordonnees')
    // .notEmpty().withMessage('Les coordonnées du point de départ sont requises')
    .custom((value) => {
      // ✅ Accepter le format GeoJSON
      if (value.type === 'Point' && Array.isArray(value.coordinates)) {
        const [longitude, latitude] = value.coordinates;
        if (typeof longitude !== 'number' || typeof latitude !== 'number') {
          throw new Error('Les coordonnées doivent être des nombres');
        }
        if (longitude < -180 || longitude > 180) {
          throw new Error('La longitude doit être entre -180 et 180');
        }
        if (latitude < -90 || latitude > 90) {
          throw new Error('La latitude doit être entre -90 et 90');
        }
        return true;
      }
      // ✅ Accepter aussi le format tableau simple [lng, lat]
      else if (Array.isArray(value) && value.length === 2) {
        const [longitude, latitude] = value;
        if (typeof longitude !== 'number' || typeof latitude !== 'number') {
          throw new Error('Les coordonnées doivent être des nombres');
        }
        if (longitude < -180 || longitude > 180) {
          throw new Error('La longitude doit être entre -180 et 180');
        }
        if (latitude < -90 || latitude > 90) {
          throw new Error('La latitude doit être entre -90 et 90');
        }
        return true;
      }
      throw new Error('Format de coordonnées invalide. Utilisez GeoJSON ou [longitude, latitude]');
    }),
  body('pointDepart.ville')
    .optional()
    .trim()
    .isLength({ max: 100 }).withMessage('Le nom de la ville ne peut pas dépasser 100 caractères'),
  body('pointDepart.commune')
    .optional()
    .trim()
    .isLength({ max: 100 }).withMessage('La commune ne peut pas dépasser 100 caractères'),
  body('pointDepart.quartier')
    .optional()
    .trim()
    .isLength({ max: 100 }).withMessage('Le quartier ne peut pas dépasser 100 caractères')
];

// Validation du point d'arrivée
const validatePointArrivee = [
  body('pointArrivee.nom')
    .trim()
    .notEmpty().withMessage('Le nom du point d\'arrivée est requis')
    .isLength({ min: 2, max: 200 }).withMessage('Le nom doit contenir entre 2 et 200 caractères'),
  body('pointArrivee.adresse')
    .notEmpty().withMessage('L\'adresse du point d\'arrivée est requise')
    .trim()
    .isLength({ max: 500 }).withMessage('L\'adresse ne peut pas dépasser 500 caractères'),
  body('pointArrivee.coordonnees')
    .notEmpty().withMessage('Les coordonnées du point d\'arrivée sont requises')
    .custom((value) => {
      // ✅ Accepter le format GeoJSON
      if (value.type === 'Point' && Array.isArray(value.coordinates)) {
        const [longitude, latitude] = value.coordinates;
        if (typeof longitude !== 'number' || typeof latitude !== 'number') {
          throw new Error('Les coordonnées doivent être des nombres');
        }
        if (longitude < -180 || longitude > 180) {
          throw new Error('La longitude doit être entre -180 et 180');
        }
        if (latitude < -90 || latitude > 90) {
          throw new Error('La latitude doit être entre -90 et 90');
        }
        return true;
      }
      // ✅ Accepter aussi le format tableau simple [lng, lat]
      else if (Array.isArray(value) && value.length === 2) {
        const [longitude, latitude] = value;
        if (typeof longitude !== 'number' || typeof latitude !== 'number') {
          throw new Error('Les coordonnées doivent être des nombres');
        }
        if (longitude < -180 || longitude > 180) {
          throw new Error('La longitude doit être entre -180 et 180');
        }
        if (latitude < -90 || latitude > 90) {
          throw new Error('La latitude doit être entre -90 et 90');
        }
        return true;
      }
      throw new Error('Format de coordonnées invalide. Utilisez GeoJSON ou [longitude, latitude]');
    }),
  body('pointArrivee.ville')
    .optional()
    .trim()
    .isLength({ max: 100 }).withMessage('Le nom de la ville ne peut pas dépasser 100 caractères'),
  body('pointArrivee.commune')
    .optional()
    .trim()
    .isLength({ max: 100 }).withMessage('La commune ne peut pas dépasser 100 caractères'),
  body('pointArrivee.quartier')
    .optional()
    .trim()
    .isLength({ max: 100 }).withMessage('Le quartier ne peut pas dépasser 100 caractères')
];

// Validation de la date de départ
const validateDateDepart = [
  body('dateDepart')
    .notEmpty().withMessage('La date de départ est requise')
    .isISO8601().withMessage('La date de départ doit être au format ISO 8601 (YYYY-MM-DD)')
    .custom((value) => {
      const date = new Date(value);
      const aujourd = new Date();
      aujourd.setHours(0, 0, 0, 0);
      if (date < aujourd) {
        throw new Error('La date de départ ne peut pas être dans le passé');
      }
      return true;
    })
];

// Validation de l'heure de départ
const validateHeureDepart = [
  body('heureDepart')
    .notEmpty().withMessage('L\'heure de départ est requise')
    .matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage('L\'heure de départ doit être au format HH:MM (ex: 08:30)')
];

// Validation du prix
const validatePrix = [
  body('prixParPassager')
    .notEmpty().withMessage('Le prix par passager est requis')
    .isInt({ min: 0, max: 100000 })
    .withMessage('Le prix doit être un nombre entier entre 0 et 100 000 FCFA')
];

// Validation du nombre de places
const validateNombrePlaces = [
  body('nombrePlacesDisponibles')
    .notEmpty().withMessage('Le nombre de places disponibles est requis')
    .isInt({ min: 1, max: 8 })
    .withMessage('Le nombre de places disponibles doit être entre 1 et 8'),
  body('nombrePlacesTotal')
    .notEmpty().withMessage('Le nombre total de places est requis')
    .isInt({ min: 1, max: 8 })
    .withMessage('Le nombre total de places doit être entre 1 et 8')
    .custom((value, { req }) => {
      if (parseInt(req.body.nombrePlacesDisponibles) > parseInt(value)) {
        throw new Error('Le nombre de places disponibles ne peut pas dépasser le nombre total de places');
      }
      return true;
    })
];

// Validation du véhicule
const validateVehicule = [
  body('vehiculeUtilise.marque')
    .trim()
    .notEmpty().withMessage('La marque du véhicule est requise')
    .isLength({ min: 2, max: 50 }).withMessage('La marque doit contenir entre 2 et 50 caractères'),
  body('vehiculeUtilise.modele')
    .trim()
    .notEmpty().withMessage('Le modèle du véhicule est requis')
    .isLength({ min: 1, max: 50 }).withMessage('Le modèle doit contenir entre 1 et 50 caractères'),
  body('vehiculeUtilise.couleur')
    .trim()
    .notEmpty().withMessage('La couleur du véhicule est requise')
    .isLength({ min: 2, max: 30 }).withMessage('La couleur doit contenir entre 2 et 30 caractères'),
  body('vehiculeUtilise.immatriculation')
    .trim()
    .notEmpty().withMessage('L\'immatriculation du véhicule est requise')
    .isLength({ min: 2, max: 20 }).withMessage('L\'immatriculation doit contenir entre 2 et 20 caractères')
    .matches(/^[A-Z0-9-]+$/i).withMessage('L\'immatriculation ne peut contenir que des lettres, chiffres et tirets'),
  body('vehiculeUtilise.nombrePlaces')
    .notEmpty().withMessage('Le nombre de places du véhicule est requis')
    .isInt({ min: 1, max: 8 })
    .withMessage('Le nombre de places du véhicule doit être entre 1 et 8')
    .custom((value, { req }) => {
      if (parseInt(req.body.nombrePlacesTotal) > parseInt(value)) {
        throw new Error('Le nombre total de places ne peut pas dépasser la capacité du véhicule');
      }
      return true;
    }),
  body('vehiculeUtilise.typeVehicule')
    .optional()
    .isIn(['BERLINE', 'CITADINE', '4X4', 'VAN', 'MINIBUS'])
    .withMessage('Type de véhicule invalide')
];

// Validation de la récurrence
const validateRecurrence = [
  body('recurrence.jours')
    .isArray({ min: 1, max: 7 })
    .withMessage('Au moins un jour doit être sélectionné et maximum 7 jours'),
  body('recurrence.jours.*')
    .isIn(['LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI', 'DIMANCHE'])
    .withMessage('Jour de la semaine invalide'),
  body('recurrence.dateFinRecurrence')
    .optional()
    .isISO8601().withMessage('La date de fin doit être au format ISO 8601')
    .custom((value, { req }) => {
      if (value) {
        const dateFin = new Date(value);
        const dateDebut = new Date(req.body.dateDepart);
        if (dateFin <= dateDebut) {
          throw new Error('La date de fin de récurrence doit être après la date de début');
        }
      }
      return true;
    }),
  body('recurrence.frequence')
    .optional()
    .isIn(['HEBDOMADAIRE', 'MENSUEL'])
    .withMessage('Fréquence invalide')
];

// Validation des préférences
const validatePreferences = [
  body('preferences.accepteFemmesSeulement')
    .optional()
    .isBoolean().withMessage('La préférence femmes seulement doit être un booléen'),
  body('preferences.accepteHommesSeuleument')
    .optional()
    .isBoolean().withMessage('La préférence hommes seulement doit être un booléen'),
  body('preferences.accepteBagages')
    .optional()
    .isBoolean().withMessage('La préférence bagages doit être un booléen'),
  body('preferences.typeBagages')
    .optional()
    .isIn(['PETIT', 'MOYEN', 'GRAND'])
    .withMessage('Type de bagages invalide'),
  body('preferences.musique')
    .optional()
    .isBoolean().withMessage('La préférence musique doit être un booléen'),
  body('preferences.conversation')
    .optional()
    .isIn(['AUCUNE', 'LIMITEE', 'MODERE', 'LIBRE'])
    .withMessage('Type de conversation invalide'),
  body('preferences.fumeur')
    .optional()
    .isBoolean().withMessage('La préférence fumeur doit être un booléen'),
  body('preferences.animauxAcceptes')
    .optional()
    .isBoolean().withMessage('La préférence animaux doit être un booléen'),
  body('preferences.climatisationActive')
    .optional()
    .isBoolean().withMessage('La préférence climatisation doit être un booléen')
];

// ===============================================
// ROUTES PUBLIQUES (sans authentification)
// ===============================================

/**
 * @route   GET /api/trajets/recherche
 * @desc    Rechercher des trajets disponibles avec filtres géospatiaux
 * @access  Public
 */
router.get('/recherche', [
  query('longitude')
    .optional()
    .isFloat({ min: -180, max: 180 }).withMessage('Longitude invalide'),
  query('latitude')
    .optional()
    .isFloat({ min: -90, max: 90 }).withMessage('Latitude invalide'),
  query('rayonKm')
    .optional()
    .isInt({ min: 1, max: 500 }).withMessage('Le rayon doit être entre 1 et 500 km'),
  query('dateDepart')
    .optional()
    .isISO8601().withMessage('Date de départ invalide'),
  query('dateFin')
    .optional()
    .isISO8601().withMessage('Date de fin invalide'),
  query('prixMax')
    .optional()
    .isInt({ min: 0 }).withMessage('Prix maximum invalide'),
  query('nombrePlacesMin')
    .optional()
    .isInt({ min: 1, max: 8 }).withMessage('Nombre de places minimum invalide'),
  query('page')
    .optional()
    .isInt({ min: 1 }).withMessage('Numéro de page invalide'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('Limite invalide (1-100)')
], handleValidationErrors, TrajetController.rechercherTrajetsDisponibles);

/**
 * @route   GET /api/trajets/filtrer
 * @desc    Filtrer les trajets avec des critères avancés
 * @access  Public
 */
router.get('/filtrer', [
  query('dateDepart')
    .optional()
    .isISO8601().withMessage('Date de départ invalide'),
  query('dateFin')
    .optional()
    .isISO8601().withMessage('Date de fin invalide'),
  query('prixMin')
    .optional()
    .isInt({ min: 0 }).withMessage('Prix minimum invalide'),
  query('prixMax')
    .optional()
    .isInt({ min: 0 }).withMessage('Prix maximum invalide')
    .custom((value, { req }) => {
      if (req.query.prixMin && parseInt(value) < parseInt(req.query.prixMin)) {
        throw new Error('Le prix maximum doit être supérieur au prix minimum');
      }
      return true;
    }),
  query('typeTrajet')
    .optional()
    .isIn(['PONCTUEL', 'RECURRENT', 'EVENEMENTIEL'])
    .withMessage('Type de trajet invalide'),
  query('page')
    .optional()
    .isInt({ min: 1 }).withMessage('Numéro de page invalide'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('Limite invalide (1-100)')
], handleValidationErrors, TrajetController.filtrerTrajets);

/**
 * @route   GET /api/trajets/conducteur/:conducteurId
 * @desc    Obtenir tous les trajets d'un conducteur spécifique
 * @access  Public
 */
router.get('/conducteur/:conducteurId', [
  param('conducteurId')
    .isMongoId().withMessage('ID du conducteur invalide'),
  query('statut')
    .optional()
    .isIn(['PROGRAMME', 'EN_COURS', 'TERMINE', 'ANNULE', 'EXPIRE'])
    .withMessage('Statut invalide'),
  query('type')
    .optional()
    .isIn(['PONCTUEL', 'RECURRENT', 'EVENEMENTIEL'])
    .withMessage('Type de trajet invalide'),
  query('page')
    .optional()
    .isInt({ min: 1 }).withMessage('Numéro de page invalide'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('Limite invalide (1-100)')
], handleValidationErrors, TrajetController.obtenirTrajetsConducteur);

/**
 * @route   GET /api/trajets/expires
 * @desc    Obtenir tous les trajets expirés (admin/monitoring)
 * @access  Public (à sécuriser en production)
 */
router.get('/expires', [
  query('page')
    .optional()
    .isInt({ min: 1 }).withMessage('Numéro de page invalide'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('Limite invalide (1-100)')
], handleValidationErrors, TrajetController.obtenirTrajetsExpires);

// ===============================================
// ROUTES PROTÉGÉES (authentification requise)
// ===============================================

/**
 * ⭐ Route de prévisualisation de distance
 * @route   POST /api/trajets/preview-distance
 * @desc    Prévisualiser la distance et durée AVANT de créer un trajet
 * @access  Privé
 */
router.post('/preview-distance',
  authMiddleware,
  transformerCoordonneesEnGeoJSON, // ✅ Transforme les coordonnées AVANT validation
  [
    // Validation du point de départ
    body('pointDepart.nom')
      .trim()
      .notEmpty().withMessage('Le nom du point de départ est requis')
      .isLength({ min: 2, max: 200 }).withMessage('Le nom doit contenir entre 2 et 200 caractères'),
    
    body('pointDepart.adresse')
      .notEmpty().withMessage('L\'adresse du point de départ est requise')
      .trim()
      .isLength({ max: 500 }).withMessage('L\'adresse ne peut pas dépasser 500 caractères'),
    
    body('pointDepart.coordonnees')
      .notEmpty().withMessage('Les coordonnées du point de départ sont requises')
      .custom((value) => {
        // Après transformation, on attend du GeoJSON
        if (!value.type || value.type !== 'Point') {
          throw new Error('Format de coordonnées invalide après transformation');
        }
        if (!Array.isArray(value.coordinates) || value.coordinates.length !== 2) {
          throw new Error('Les coordonnées doivent contenir [longitude, latitude]');
        }
        const [longitude, latitude] = value.coordinates;
        if (typeof longitude !== 'number' || typeof latitude !== 'number') {
          throw new Error('Les coordonnées doivent être des nombres');
        }
        if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
          throw new Error('Coordonnées hors limites');
        }
        return true;
      }),
    
    body('pointDepart.commune')
      .notEmpty().withMessage('La commune du point de départ est requise')
      .trim()
      .isLength({ max: 100 }).withMessage('La commune ne peut pas dépasser 100 caractères'),
    
    body('pointDepart.quartier')
      .notEmpty().withMessage('Le quartier du point de départ est requis')
      .trim()
      .isLength({ max: 100 }).withMessage('Le quartier ne peut pas dépasser 100 caractères'),

    // Validation du point d'arrivée
    body('pointArrivee.nom')
      .trim()
      .notEmpty().withMessage('Le nom du point d\'arrivée est requis')
      .isLength({ min: 2, max: 200 }).withMessage('Le nom doit contenir entre 2 et 200 caractères'),
    
    body('pointArrivee.adresse')
      .notEmpty().withMessage('L\'adresse du point d\'arrivée est requise')
      .trim()
      .isLength({ max: 500 }).withMessage('L\'adresse ne peut pas dépasser 500 caractères'),
    
    body('pointArrivee.coordonnees')
      .notEmpty().withMessage('Les coordonnées du point d\'arrivée sont requises')
      .custom((value) => {
        if (!value.type || value.type !== 'Point') {
          throw new Error('Format de coordonnées invalide après transformation');
        }
        if (!Array.isArray(value.coordinates) || value.coordinates.length !== 2) {
          throw new Error('Les coordonnées doivent contenir [longitude, latitude]');
        }
        const [longitude, latitude] = value.coordinates;
        if (typeof longitude !== 'number' || typeof latitude !== 'number') {
          throw new Error('Les coordonnées doivent être des nombres');
        }
        if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
          throw new Error('Coordonnées hors limites');
        }
        return true;
      }),
    
    body('pointArrivee.commune')
      .notEmpty().withMessage('La commune du point d\'arrivée est requise')
      .trim()
      .isLength({ max: 100 }).withMessage('La commune ne peut pas dépasser 100 caractères'),
    
    body('pointArrivee.quartier')
      .notEmpty().withMessage('Le quartier du point d\'arrivée est requis')
      .trim()
      .isLength({ max: 100 }).withMessage('Le quartier ne peut pas dépasser 100 caractères'),

    // Validation optionnelle de l'heure et date
    body('heureDepart')
      .optional()
      .matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/)
      .withMessage('L\'heure de départ doit être au format HH:MM (ex: 14:30)'),
    
    body('dateDepart')
      .optional()
      .isISO8601().withMessage('La date de départ doit être au format ISO 8601')
      .custom((value) => {
        const date = new Date(value);
        if (isNaN(date.getTime())) {
          throw new Error('Date invalide');
        }
        return true;
      })
  ],
  handleValidationErrors,
  TrajetController.previewDistance
);

/**
 * @route   POST /api/trajets/ponctuel
 * @desc    Créer un nouveau trajet ponctuel
 * @access  Privé (Conducteur)
 */
router.post('/ponctuel', 
  authMiddleware,
  transformerCoordonneesEnGeoJSON,
  [
    ...validatePointDepart,
    ...validatePointArrivee,
    ...validateDateDepart,
    ...validateHeureDepart,
    ...validatePrix,
    ...validateNombrePlaces,
    ...validateVehicule,
    ...validatePreferences,
    body('distance')
      .optional()
      .isFloat({ min: 0, max: 1000 })
      .withMessage('La distance doit être entre 0 et 1000 km'),
    body('dureeEstimee')
      .optional()
      .isInt({ min: 1, max: 1440 })
      .withMessage('La durée estimée doit être entre 1 et 1440 minutes (24h)'),
    body('commentaireConducteur')
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Le commentaire ne peut pas dépasser 500 caractères'),
    body('pointsArretIntermedaires')
      .optional()
      .isArray({ max: 10 })
      .withMessage('Maximum 10 points d\'arrêt intermédiaires'),
    body('pointsArretIntermedaires.*.nom')
      .optional()
      .trim()
      .isLength({ min: 2, max: 200 })
      .withMessage('Le nom du point d\'arrêt doit contenir entre 2 et 200 caractères')
  ],
  handleValidationErrors,
  TrajetController.creerTrajetPonctuel
);

/**
 * @route   POST /api/trajets/recurrent
 * @desc    Créer un nouveau trajet récurrent
 * @access  Privé (Conducteur)
 */
router.post('/recurrent', 
  authMiddleware,
  transformerCoordonneesEnGeoJSON, 
  [
    ...validatePointDepart,
    ...validatePointArrivee,
    ...validateDateDepart,
    ...validateHeureDepart,
    ...validatePrix,
    ...validateNombrePlaces,
    ...validateVehicule,
    ...validateRecurrence,
    ...validatePreferences,
    body('distance')
      .optional()
      .isFloat({ min: 0, max: 1000 })
      .withMessage('La distance doit être entre 0 et 1000 km'),
    body('dureeEstimee')
      .optional()
      .isInt({ min: 1, max: 1440 })
      .withMessage('La durée estimée doit être entre 1 et 1440 minutes (24h)'),
    body('commentaireConducteur')
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Le commentaire ne peut pas dépasser 500 caractères')
  ],
  handleValidationErrors,
  TrajetController.creerTrajetRecurrent
);

/**
 * @route   GET /api/trajets/historique
 * @desc    Obtenir l'historique des trajets de l'utilisateur connecté
 * @access  Privé
 */
router.get('/historique', 
  authMiddleware,
  [
    query('type')
      .optional()
      .isIn(['tous', 'conduits', 'reserves'])
      .withMessage('Type d\'historique invalide (tous, conduits, reserves)'),
    query('statut')
      .optional()
      .isIn(['PROGRAMME', 'EN_COURS', 'TERMINE', 'ANNULE', 'EXPIRE'])
      .withMessage('Statut invalide'),
    query('page')
      .optional()
      .isInt({ min: 1 }).withMessage('Numéro de page invalide'),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 }).withMessage('Limite invalide (1-100)')
  ],
  handleValidationErrors,
  TrajetController.obtenirHistoriqueTrajets
);

/**
 * @route   PUT /api/trajets/:id
 * @desc    Modifier les détails d'un trajet
 * @access  Privé (Propriétaire du trajet)
 */
router.put('/:id', 
  authMiddleware,
  [
    param('id')
      .isMongoId().withMessage('ID du trajet invalide'),
    body('prixParPassager')
      .optional()
      .isInt({ min: 0, max: 100000 })
      .withMessage('Le prix doit être entre 0 et 100 000 FCFA'),
    body('commentaireConducteur')
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Le commentaire ne peut pas dépasser 500 caractères'),
    body('heureDepart')
      .optional()
      .matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/)
      .withMessage('L\'heure de départ doit être au format HH:MM'),
    body('dateDepart')
      .optional()
      .isISO8601().withMessage('La date de départ doit être valide')
      .custom((value) => {
        const date = new Date(value);
        const aujourd = new Date();
        aujourd.setHours(0, 0, 0, 0);
        if (date < aujourd) {
          throw new Error('La date de départ ne peut pas être dans le passé');
        }
        return true;
      })
  ],
  handleValidationErrors,
  TrajetController.modifierDetailsTrajet
);

/**
 * @route   PATCH /api/trajets/:id/places
 * @desc    Changer le nombre de places disponibles
 * @access  Privé (Propriétaire du trajet)
 */
router.patch('/:id/places', 
  authMiddleware,
  [
    param('id')
      .isMongoId().withMessage('ID du trajet invalide'),
    body('nombrePlacesDisponibles')
      .notEmpty().withMessage('Le nombre de places disponibles est requis')
      .isInt({ min: 0, max: 8 })
      .withMessage('Le nombre de places doit être entre 0 et 8')
  ],
  handleValidationErrors,
  TrajetController.changerNombrePlaces
);

/**
 * @route   PATCH /api/trajets/:id/preferences
 * @desc    Modifier les préférences d'un trajet
 * @access  Privé (Propriétaire du trajet)
 */
router.patch('/:id/preferences', 
  authMiddleware,
  [
    param('id')
      .isMongoId().withMessage('ID du trajet invalide'),
    ...validatePreferences
  ],
  handleValidationErrors,
  TrajetController.modifierPreferences
);


// : Recalculer distance manuellement
router.patch(
  '/:id/recalculer-distance',
  authMiddleware,
  TrajetController.recalculerDistance
);
/**
 * @route   PATCH /api/trajets/:id/statut
 * @desc    Mettre à jour le statut d'un trajet
 * @access  Privé (Propriétaire du trajet)
 */
router.patch('/:id/statut', 
  authMiddleware,
  [
    param('id')
      .isMongoId().withMessage('ID du trajet invalide'),
    body('statutTrajet')
      .notEmpty().withMessage('Le statut est requis')
      .isIn(['PROGRAMME', 'EN_COURS', 'TERMINE', 'ANNULE'])
      .withMessage('Statut invalide (PROGRAMME, EN_COURS, TERMINE, ANNULE)')
  ],
  handleValidationErrors,
  TrajetController.mettreAJourStatut
);

/**
 * @route   PATCH /api/trajets/:id/annuler
 * @desc    Annuler un trajet
 * @access  Privé (Propriétaire du trajet)
 */
router.patch('/:id/annuler', 
  authMiddleware,
  [
    param('id')
      .isMongoId().withMessage('ID du trajet invalide'),
    body('motifAnnulation')
      .optional()
      .trim()
      .isLength({ min: 3, max: 500 })
      .withMessage('Le motif d\'annulation doit contenir entre 3 et 500 caractères')
  ],
  handleValidationErrors,
  TrajetController.annulerTrajet
);

/**
 * @route   DELETE /api/trajets/:id
 * @desc    Supprimer (annuler) un trajet récurrent
 * @access  Privé (Propriétaire du trajet)
 */
router.delete('/:id', 
  authMiddleware,
  [
    param('id')
      .isMongoId().withMessage('ID du trajet invalide')
  ],
  handleValidationErrors,
  TrajetController.supprimerTrajetRecurrent
);

/**
 * @route   GET /api/trajets/:id/expiration
 * @desc    Vérifier et marquer un trajet comme expiré si nécessaire
 * @access  Privé (ou Public selon besoin)
 */
router.get('/:id/expiration', 
  [
    param('id')
      .isMongoId().withMessage('ID du trajet invalide')
  ],
  handleValidationErrors,
  TrajetController.verifierExpiration
);

// ===============================================
// ROUTE DE SANTÉ (HEALTH CHECK)
// ===============================================

/**
 * @route   GET /api/trajets/health
 * @desc    Vérifier l'état de santé du service des trajets
 * @access  Public
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Service des trajets opérationnel',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    endpoints: {
      creation: [
        'POST /preview-distance - Prévisualiser distance/durée',
        'POST /ponctuel - Créer un trajet ponctuel',
        'POST /recurrent - Créer un trajet récurrent'
      ],
      lecture: [
        'GET /recherche - Rechercher des trajets',
        'GET /filtrer - Filtrer les trajets',
        'GET /conducteur/:id - Trajets d\'un conducteur',
        'GET /historique - Historique utilisateur',
        'GET /expires - Trajets expirés',
        'GET /:id - Détails d\'un trajet'
      ],
      modification: [
        'PUT /:id - Modifier un trajet',
        'PATCH /:id/places - Modifier les places',
        'PATCH /:id/preferences - Modifier les préférences',
        'PATCH /:id/statut - Changer le statut',
        'PATCH /:id/annuler - Annuler un trajet'
      ],
      suppression: [
        'DELETE /:id - Supprimer un trajet récurrent'
      ],
      utilitaires: [
        'GET /:id/expiration - Vérifier expiration'
      ]
    }
  });
});

// ===============================================
// ROUTE GÉNÉRIQUE GET PAR ID - TOUJOURS EN DERNIER
// ===============================================

/**
 * @route   GET /api/trajets/:id
 * @desc    Obtenir les détails complets d'un trajet par son ID
 * @access  Public
 * 
 * ⚠️ IMPORTANT: Cette route doit TOUJOURS être en dernier
 * car elle capture tous les GET avec un paramètre ID
 */
router.get('/:id', 
  [
    param('id')
      .isMongoId().withMessage('ID du trajet invalide')
  ],
  handleValidationErrors,
  TrajetController.obtenirDetailsTrajet
);

// ===============================================
// GESTION CENTRALISÉE DES ERREURS
// ===============================================

/**
 * Middleware d'erreurs spécifique au router de trajets
 */
router.use((error, req, res, next) => {
  console.error('Erreur dans le router trajets:', {
    message: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    body: req.body,
    timestamp: new Date().toISOString()
  });

  // Gestion des erreurs de validation Mongoose
  if (error.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      code: 'VALIDATION_ERROR',
      message: 'Erreur de validation des données',
      errors: Object.values(error.errors).map(err => ({
        champ: err.path,
        message: err.message,
        valeur: err.value
      })),
      timestamp: new Date().toISOString()
    });
  }

  // Gestion des erreurs CastError (ID MongoDB invalide)
  if (error.name === 'CastError' && error.kind === 'ObjectId') {
    return res.status(400).json({
      success: false,
      code: 'INVALID_ID',
      message: 'Format d\'ID invalide',
      timestamp: new Date().toISOString()
    });
  }

  // Gestion des erreurs de duplication MongoDB
  if (error.code === 11000) {
    return res.status(409).json({
      success: false,
      code: 'DUPLICATE_ERROR',
      message: 'Un trajet similaire existe déjà',
      timestamp: new Date().toISOString()
    });
  }

  // Propager les autres erreurs au handler global
  next(error);
});

module.exports = router;