const { body, query, param } = require('express-validator');
const { handleValidationErrors } = require('./validationMiddleware');

// Validation pour créer un événement
const validateCreateEvenement = [
  body('nom')
    .trim()
    .notEmpty()
    .withMessage('Le nom de l\'événement est requis')
    .isLength({ min: 3, max: 200 })
    .withMessage('Le nom doit contenir entre 3 et 200 caractères'),

  body('description')
    .optional()
    .trim()
    .isLength({ max: 2000 })
    .withMessage('La description ne peut pas dépasser 2000 caractères'),

  body('lieu.nom')
    .trim()
    .notEmpty()
    .withMessage('Le nom du lieu est requis')
    .isLength({ max: 200 })
    .withMessage('Le nom du lieu ne peut pas dépasser 200 caractères'),

  body('lieu.adresse')
    .trim()
    .notEmpty()
    .withMessage('L\'adresse du lieu est requise')
    .isLength({ max: 500 })
    .withMessage('L\'adresse ne peut pas dépasser 500 caractères'),

  body('lieu.ville')
    .trim()
    .notEmpty()
    .withMessage('La ville est requise')
    .isLength({ max: 100 })
    .withMessage('La ville ne peut pas dépasser 100 caractères'),

  body('lieu.coordonnees.coordinates')
    .isArray({ min: 2, max: 2 })
    .withMessage('Coordonnées GPS requises [longitude, latitude]'),

  body('lieu.coordonnees.coordinates.*')
    .isFloat({ min: -180, max: 180 })
    .withMessage('Coordonnées GPS invalides'),

  body('dateDebut')
    .notEmpty()
    .withMessage('La date de début est requise')
    .isISO8601()
    .withMessage('Format de date de début invalide')
    .custom((value) => {
      const date = new Date(value);
      const now = new Date();
      if (date <= now) {
        throw new Error('La date de début doit être dans le futur');
      }
      return true;
    }),

  body('dateFin')
    .optional()
    .isISO8601()
    .withMessage('Format de date de fin invalide')
    .custom((value, { req }) => {
      if (value && req.body.dateDebut) {
        const dateDebut = new Date(req.body.dateDebut);
        const dateFin = new Date(value);
        if (dateFin <= dateDebut) {
          throw new Error('La date de fin doit être après la date de début');
        }
      }
      return true;
    }),

  body('typeEvenement')
    .optional()
    .isIn(['SPORT', 'CONCERT', 'FESTIVAL', 'CONFERENCE', 'AUTRE'])
    .withMessage('Type d\'événement invalide'),

  body('capaciteEstimee')
    .optional()
    .isInt({ min: 1, max: 1000000 })
    .withMessage('Capacité estimée invalide'),

  body('sourceDetection')
    .optional()
    .isIn(['MANUEL', 'AUTOMATIQUE', 'API_EXTERNE'])
    .withMessage('Source de détection invalide'),

  handleValidationErrors
];

// Validation pour mettre à jour un événement
const validateUpdateEvenement = [
  body('nom')
    .optional()
    .trim()
    .isLength({ min: 3, max: 200 })
    .withMessage('Le nom doit contenir entre 3 et 200 caractères'),

  body('description')
    .optional()
    .trim()
    .isLength({ max: 2000 })
    .withMessage('La description ne peut pas dépasser 2000 caractères'),

  body('lieu.nom')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Le nom du lieu ne peut pas dépasser 200 caractères'),

  body('lieu.adresse')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('L\'adresse ne peut pas dépasser 500 caractères'),

  body('lieu.ville')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('La ville ne peut pas dépasser 100 caractères'),

  body('lieu.coordonnees.coordinates')
    .optional()
    .isArray({ min: 2, max: 2 })
    .withMessage('Coordonnées GPS invalides [longitude, latitude]'),

  body('lieu.coordonnees.coordinates.*')
    .optional()
    .isFloat({ min: -180, max: 180 })
    .withMessage('Coordonnées GPS invalides'),

  body('dateDebut')
    .optional()
    .isISO8601()
    .withMessage('Format de date de début invalide'),

  body('dateFin')
    .optional()
    .isISO8601()
    .withMessage('Format de date de fin invalide'),

  body('typeEvenement')
    .optional()
    .isIn(['SPORT', 'CONCERT', 'FESTIVAL', 'CONFERENCE', 'AUTRE'])
    .withMessage('Type d\'événement invalide'),

  body('capaciteEstimee')
    .optional()
    .isInt({ min: 1, max: 1000000 })
    .withMessage('Capacité estimée invalide'),

  body('statutEvenement')
    .optional()
    .isIn(['PROGRAMME', 'EN_COURS', 'TERMINE', 'ANNULE'])
    .withMessage('Statut d\'événement invalide'),

  handleValidationErrors
];

// Validation pour rechercher des événements
const validateSearchEvenements = [
  query('q')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('La recherche doit contenir entre 2 et 100 caractères'),

  query('ville')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Le nom de ville invalide'),

  query('typeEvenement')
    .optional()
    .isIn(['SPORT', 'CONCERT', 'FESTIVAL', 'CONFERENCE', 'AUTRE'])
    .withMessage('Type d\'événement invalide'),

  query('dateDebut')
    .optional()
    .isISO8601()
    .withMessage('Format de date de début invalide'),

  query('dateFin')
    .optional()
    .isISO8601()
    .withMessage('Format de date de fin invalide'),

  query('latitude')
    .optional()
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude invalide'),

  query('longitude')
    .optional()
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude invalide'),

  query('rayon')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Rayon invalide (1-100 km)'),

  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Numéro de page invalide'),

  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Limite invalide (1-50)'),

  handleValidationErrors
];

// Validation pour créer un groupe de covoiturage
const validateCreateGroupeCovoiturage = [
  body('nom')
    .trim()
    .notEmpty()
    .withMessage('Le nom du groupe est requis')
    .isLength({ min: 3, max: 100 })
    .withMessage('Le nom doit contenir entre 3 et 100 caractères'),

  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('La description ne peut pas dépasser 500 caractères'),

  body('tarifPrefere')
    .optional()
    .isFloat({ min: 0, max: 100000 })
    .withMessage('Tarif préféré invalide'),

  body('heureDepart')
    .optional()
    .matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/)
    .withMessage('Format d\'heure invalide (HH:MM)'),

  body('membres')
    .optional()
    .isArray()
    .withMessage('La liste des membres doit être un tableau'),

  body('membres.*')
    .optional()
    .isMongoId()
    .withMessage('ID de membre invalide'),

  handleValidationErrors
];

// Validation des paramètres d'URL
const validateEventId = [
  param('eventId')
    .isMongoId()
    .withMessage('ID d\'événement invalide'),
  handleValidationErrors
];

const validateGroupeId = [
  param('groupeId')
    .isMongoId()
    .withMessage('ID de groupe invalide'),
  handleValidationErrors
];

// Middleware pour vérifier que l'utilisateur peut modifier un événement
const checkEventOwnership = async (req, res, next) => {
  try {
    const eventId = req.params.eventId;
    const userId = req.user.id;

    const Evenement = require('../models/Evenement');
    const event = await Evenement.findById(eventId);

    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Événement non trouvé'
      });
    }

    // Vérifier si l'utilisateur est le créateur ou un admin
    if (event.createurId && event.createurId.toString() !== userId && !req.user.isAdmin) {
      return res.status(403).json({
        success: false,
        message: 'Vous n\'êtes pas autorisé à modifier cet événement'
      });
    }

    req.event = event;
    next();
  } catch (error) {
    console.error('Erreur vérification propriétaire événement:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la vérification'
    });
  }
};

// Middleware pour vérifier la participation à un événement
const checkEventParticipation = async (req, res, next) => {
  try {
    const eventId = req.params.eventId;
    const userId = req.user.id;

    const Evenement = require('../models/Evenement');
    const event = await Evenement.findById(eventId);

    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Événement non trouvé'
      });
    }

    // Vérifier si l'utilisateur participe à l'événement via un groupe
    const isParticipant = event.groupesCovoiturage.some(groupe => 
      groupe.membres.includes(userId)
    );

    if (!isParticipant && event.createurId?.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Vous ne participez pas à cet événement'
      });
    }

    req.event = event;
    next();
  } catch (error) {
    console.error('Erreur vérification participation événement:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la vérification'
    });
  }
};

module.exports = {
  validateCreateEvenement,
  validateUpdateEvenement,
  validateSearchEvenements,
  validateCreateGroupeCovoiturage,
  validateEventId,
  validateGroupeId,
  checkEventOwnership,
  checkEventParticipation
};