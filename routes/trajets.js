const express = require('express');
const { body, query, param, validationResult } = require('express-validator');
const TrajetController = require('../controllers/trajetController');
const { protect } = require('../middlewares/authMiddleware');
const router = express.Router();

// Middleware de validation des erreurs
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

// ==================== CREATE ====================

// Créer un trajet ponctuel
router.post('/ponctuel', protect, [
  body('pointDepart').notEmpty().withMessage('Le point de départ est requis'),
  body('pointArrivee').notEmpty().withMessage('Le point d\'arrivée est requis'),
  body('dateDepart').notEmpty().withMessage('La date de départ est requise'),
  body('prixParPassager').isNumeric().withMessage('Le prix doit être un nombre')
], handleValidationErrors, TrajetController.creerTrajetPonctuel);

// Créer un trajet récurrent
router.post('/recurrent', protect, [
  body('pointDepart').notEmpty().withMessage('Le point de départ est requis'),
  body('pointArrivee').notEmpty().withMessage('Le point d\'arrivée est requis'),
  body('recurrence').notEmpty().withMessage('La récurrence est requise'),
  body('recurrence.jours').isArray({ min: 1 }).withMessage('Au moins un jour doit être sélectionné')
], handleValidationErrors, TrajetController.creerTrajetRecurrent);

// ==================== READ ====================

// Rechercher trajets disponibles
router.get('/recherche', [
  query('longitude').optional().isFloat().withMessage('Longitude invalide'),
  query('latitude').optional().isFloat().withMessage('Latitude invalide')
], handleValidationErrors, TrajetController.rechercherTrajetsDisponibles);

// Obtenir détails complets d'un trajet
router.get('/:id', param('id').isMongoId().withMessage('ID invalide'), handleValidationErrors, TrajetController.obtenirDetailsTrajet);

// Obtenir tous les trajets d'un conducteur
router.get('/conducteur/:conducteurId', param('conducteurId').isMongoId().withMessage('ID invalide'), handleValidationErrors, TrajetController.obtenirTrajetsConducteur);

// Historique trajets utilisateur connecté
router.get('/historique/moi', protect, TrajetController.obtenirHistoriqueTrajets);

// Filtrer trajets
router.get('/filtrer', TrajetController.filtrerTrajets);

// ==================== UPDATE ====================

// Modifier détails trajet
router.put('/:id', protect, param('id').isMongoId(), handleValidationErrors, TrajetController.modifierDetailsTrajet);

// Changer nombre de places
router.patch('/:id/places', protect, param('id').isMongoId(), handleValidationErrors, TrajetController.changerNombrePlaces);

// Modifier préférences trajet
router.patch('/:id/preferences', protect, param('id').isMongoId(), handleValidationErrors, TrajetController.modifierPreferences);

// Mettre à jour le statut trajet
router.patch('/:id/statut', protect, param('id').isMongoId(), handleValidationErrors, TrajetController.mettreAJourStatut);

// ==================== DELETE ====================

// Annuler trajet
router.delete('/:id/annuler', protect, param('id').isMongoId(), handleValidationErrors, TrajetController.annulerTrajet);

// Supprimer trajet récurrent
router.delete('/:id/recurrent', protect, param('id').isMongoId(), handleValidationErrors, TrajetController.supprimerTrajetRecurrent);

module.exports = router;
