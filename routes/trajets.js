const express = require('express');
const { body, query, param } = require('express-validator');
const TrajetController = require('../controllers/trajetController');
const auth = require('../middleware/authMiddleware');

const router = express.Router();

// ==================== CREATE ====================

// Créer un trajet ponctuel
router.post(
  '/ponctuel',
  auth,
  [
    body('pointDepart').notEmpty().withMessage('Le point de départ est requis'),
    body('pointArrivee').notEmpty().withMessage('Le point d\'arrivée est requis'),
    body('dateDepart').notEmpty().withMessage('La date de départ est requise'),
    body('prixParPassager').isNumeric().withMessage('Le prix doit être un nombre')
  ],
  (req, res) => TrajetController.creerTrajetPonctuel(req, res)
);

// Créer un trajet récurrent
router.post(
  '/recurrent',
  auth,
  [
    body('pointDepart').notEmpty().withMessage('Le point de départ est requis'),
    body('pointArrivee').notEmpty().withMessage('Le point d\'arrivée est requis'),
    body('recurrence').notEmpty().withMessage('La récurrence est requise'),
    body('recurrence.jours').isArray({ min: 1 }).withMessage('Au moins un jour doit être sélectionné')
  ],
  (req, res) => TrajetController.creerTrajetRecurrent(req, res)
);

// ==================== READ ====================

// Rechercher trajets disponibles
router.get(
  '/recherche',
  [
    query('longitude').optional().isFloat().withMessage('Longitude invalide'),
    query('latitude').optional().isFloat().withMessage('Latitude invalide')
  ],
  (req, res) => TrajetController.rechercherTrajetsDisponibles(req, res)
);

// Obtenir détails complets d'un trajet
router.get('/:id', param('id').isMongoId().withMessage('ID invalide'), (req, res) =>
  TrajetController.obtenirDetailsTrajet(req, res)
);

// Obtenir tous les trajets d'un conducteur
router.get('/conducteur/:conducteurId', param('conducteurId').isMongoId().withMessage('ID invalide'), (req, res) =>
  TrajetController.obtenirTrajetsConducteur(req, res)
);

// Historique trajets utilisateur connecté
router.get('/historique/moi', auth, (req, res) => TrajetController.obtenirHistoriqueTrajets(req, res));

// Filtrer trajets
router.get('/filtrer', (req, res) => TrajetController.filtrerTrajets(req, res));

// ==================== UPDATE ====================

// Modifier détails trajet
router.put('/:id', auth, param('id').isMongoId(), (req, res) =>
  TrajetController.modifierDetailsTrajet(req, res)
);

// Changer nombre de places
router.patch('/:id/places', auth, param('id').isMongoId(), (req, res) =>
  TrajetController.changerNombrePlaces(req, res)
);

// Modifier préférences trajet
router.patch('/:id/preferences', auth, param('id').isMongoId(), (req, res) =>
  TrajetController.modifierPreferences(req, res)
);

// Mettre à jour le statut trajet
router.patch('/:id/statut', auth, param('id').isMongoId(), (req, res) =>
  TrajetController.mettreAJourStatut(req, res)
);

// ==================== DELETE ====================

// Annuler trajet
router.delete('/:id/annuler', auth, param('id').isMongoId(), (req, res) =>
  TrajetController.annulerTrajet(req, res)
);

// Supprimer trajet récurrent
router.delete('/:id/recurrent', auth, param('id').isMongoId(), (req, res) =>
  TrajetController.supprimerTrajetRecurrent(req, res)
);

module.exports = router;
