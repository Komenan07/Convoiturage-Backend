const express = require('express');
const router = express.Router();
const evenementController = require('../controllers/evenementController');
const { auth, admin } = require('../middleware/auth');
const { body, param, query, validationResult } = require('express-validator');

// Middleware to handle validation errors
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Erreurs de validation',
      errors: errors.array()
    });
  }
  next();
};

// Middleware de validation commun
const validateEventId = [
  param('id').isMongoId().withMessage('ID événement invalide'),
  handleValidationErrors
];

const validateGroupId = [
  param('groupeId').isMongoId().withMessage('ID groupe invalide'),
  handleValidationErrors
];

// Routes principales
router.post('/',
  auth,
  admin,
  [
    body('nom').notEmpty().withMessage('Le nom est requis'),
    body('dateDebut').isISO8601().withMessage('Format de date invalide'),
    body('ville').notEmpty().withMessage('La ville est requise'),
    body('typeEvenement').isIn(['CONFERENCE', 'FESTIVAL', 'CONCERT', 'SPORTIF', 'AUTRE'])
      .withMessage('Type d\'événement invalide')
  ],
  handleValidationErrors,
  evenementController.creerEvenement
);

router.get('/',
  [
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('limite').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('typeEvenement').optional().isIn(['CONFERENCE', 'FESTIVAL', 'CONCERT', 'SPORTIF', 'AUTRE']),
    query('statutEvenement').optional().isIn(['PROGRAMME', 'EN_COURS', 'TERMINE', 'ANNULE']),
    query('tri').optional().isString(),
    handleValidationErrors
  ],
  evenementController.obtenirEvenements
);

router.get('/:id',
  validateEventId,
  evenementController.obtenirEvenement
);

router.put('/:id',
  auth,
  admin,
  validateEventId,
  evenementController.mettreAJourEvenement
);

router.delete('/:id',
  auth,
  admin,
  validateEventId,
  evenementController.supprimerEvenement
);

// Routes de recherche
router.get('/proximite',
  [
    query('longitude').isFloat({ min: -180, max: 180 }),
    query('latitude').isFloat({ min: -90, max: 90 }),
    query('rayon').optional().isFloat({ min: 1 }),
    handleValidationErrors
  ],
  evenementController.rechercherParProximite
);

router.get('/a-venir',
  [
    query('limite').optional().isInt({ min: 1, max: 50 }).toInt(),
    handleValidationErrors
  ],
  evenementController.obtenirEvenementsAVenir
);

router.post('/recherche-avancee',
  evenementController.rechercheAvancee
);

// Routes de gestion des groupes de covoiturage
router.post('/:id/groupes-covoiturage',
  auth,
  validateEventId,
  [
    body('pointDepart').notEmpty().withMessage('Le point de départ est requis'),
    body('heureDepart').isISO8601().withMessage('Format d\'heure invalide'),
    body('placesDisponibles').isInt({ min: 1 }),
    handleValidationErrors
  ],
  evenementController.ajouterGroupeCovoiturage
);

router.delete('/:id/groupes-covoiturage/:groupeId',
  auth,
  validateEventId,
  validateGroupId,
  evenementController.supprimerGroupeCovoiturage
);

router.get('/:id/groupes-covoiturage',
  validateEventId,
  evenementController.obtenirGroupesCovoiturage
);

router.post('/:id/groupes-covoiturage/:groupeId/rejoindre',
  auth,
  validateEventId,
  validateGroupId,
  evenementController.rejoindrGroupe
);

router.delete('/:id/groupes-covoiturage/:groupeId/quitter',
  auth,
  validateEventId,
  validateGroupId,
  evenementController.quitterGroupe
);

// Routes administratives
router.get('/statistiques',
  auth,
  admin,
  evenementController.obtenirStatistiques
);

router.patch('/:id/statut',
  auth,
  admin,
  validateEventId,
  [
    body('statut').isIn(['PROGRAMME', 'EN_COURS', 'TERMINE', 'ANNULE'])
      .withMessage('Statut invalide')
  ],
  handleValidationErrors,
  evenementController.changerStatut
);

router.get('/export',
  auth,
  admin,
  [
    query('format').optional().isIn(['json', 'csv']),
    handleValidationErrors
  ],
  evenementController.exporterEvenements
);

module.exports = router;