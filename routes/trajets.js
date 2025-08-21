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

// Debug middleware pour voir quelle route est appelée
router.use('/ponctuel', (req, res, next) => {
  console.log('DEBUG USER:', req.user);
  console.log('DEBUG HEADERS:', req.headers.authorization);
  next();
});

// ==================== TOUTES LES ROUTES SPÉCIFIQUES EN PREMIER ====================

// Créer un trajet ponctuel - CETTE ROUTE DOIT ÊTRE EN PREMIER
router.post('/ponctuel', protect, [
  body('pointDepart.nom').notEmpty().withMessage('Le nom du point de départ est requis'),
  body('pointArrivee.nom').notEmpty().withMessage('Le nom du point d\'arrivée est requis'),
  body('dateDepart').isISO8601().withMessage('La date de départ doit être valide'),
  body('heureDepart').matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('L\'heure de départ doit être au format HH:MM'),
  body('prixParPassager').isInt({ min: 0 }).withMessage('Le prix doit être un nombre entier positif'),
  body('nombrePlacesDisponibles').isInt({ min: 1 }).withMessage('Le nombre de places disponibles doit être au moins 1'),
  body('nombrePlacesTotal').isInt({ min: 1 }).withMessage('Le nombre total de places doit être au moins 1'),
  body('vehiculeUtilise.marque').notEmpty().withMessage('La marque du véhicule est requise'),
  body('vehiculeUtilise.modele').notEmpty().withMessage('Le modèle du véhicule est requis'),
  body('vehiculeUtilise.couleur').notEmpty().withMessage('La couleur du véhicule est requise'),
  body('vehiculeUtilise.immatriculation').notEmpty().withMessage('L\'immatriculation du véhicule est requise'),
  body('vehiculeUtilise.nombrePlaces').isInt({ min: 1, max: 8 }).withMessage('Le nombre de places du véhicule doit être entre 1 et 8')
], handleValidationErrors, TrajetController.creerTrajetPonctuel);

// Créer un trajet récurrent
router.post('/recurrent', protect, [
  body('pointDepart.nom').notEmpty().withMessage('Le nom du point de départ est requis'),
  body('pointArrivee.nom').notEmpty().withMessage('Le nom du point d\'arrivée est requis'),
  body('recurrence.jours').isArray({ min: 1 }).withMessage('Au moins un jour doit être sélectionné'),
  body('dateDepart').isISO8601().withMessage('La date de départ doit être valide'),
  body('heureDepart').matches(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).withMessage('L\'heure de départ doit être au format HH:MM'),
  body('prixParPassager').isInt({ min: 0 }).withMessage('Le prix doit être un nombre entier positif'),
  body('nombrePlacesDisponibles').isInt({ min: 1 }).withMessage('Le nombre de places disponibles doit être au moins 1'),
  body('nombrePlacesTotal').isInt({ min: 1 }).withMessage('Le nombre total de places doit être au moins 1'),
  body('vehiculeUtilise.marque').notEmpty().withMessage('La marque du véhicule est requise'),
  body('vehiculeUtilise.modele').notEmpty().withMessage('Le modèle du véhicule est requis'),
  body('vehiculeUtilise.couleur').notEmpty().withMessage('La couleur du véhicule est requise'),
  body('vehiculeUtilise.immatriculation').notEmpty().withMessage('L\'immatriculation du véhicule est requise'),
  body('vehiculeUtilise.nombrePlaces').isInt({ min: 1, max: 8 }).withMessage('Le nombre de places du véhicule doit être entre 1 et 8')
], handleValidationErrors, TrajetController.creerTrajetRecurrent);

// Rechercher trajets disponibles
router.get('/recherche', [
  query('longitude').optional().isFloat().withMessage('Longitude invalide'),
  query('latitude').optional().isFloat().withMessage('Latitude invalide'),
  query('rayonKm').optional().isInt({ min: 1 }).withMessage('Le rayon doit être un entier positif'),
  query('dateDepart').optional().isISO8601().withMessage('Date de départ invalide'),
  query('dateFin').optional().isISO8601().withMessage('Date de fin invalide'),
  query('prixMax').optional().isInt({ min: 0 }).withMessage('Prix maximum invalide'),
  query('nombrePlacesMin').optional().isInt({ min: 1 }).withMessage('Nombre de places minimum invalide')
], handleValidationErrors, TrajetController.rechercherTrajetsDisponibles);

// Historique trajets utilisateur connecté
router.get('/historique', protect, [
  query('type').optional().isIn(['tous', 'conduits']).withMessage('Type d\'historique invalide'),
  query('page').optional().isInt({ min: 1 }).withMessage('Numéro de page invalide'),
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limite invalide (1-50)')
], handleValidationErrors, TrajetController.obtenirHistoriqueTrajets);

// Filtrer trajets
router.get('/filtrer', [
  query('dateDepart').optional().isISO8601().withMessage('Date de départ invalide'),
  query('dateFin').optional().isISO8601().withMessage('Date de fin invalide'),
  query('prixMin').optional().isInt({ min: 0 }).withMessage('Prix minimum invalide'),
  query('prixMax').optional().isInt({ min: 0 }).withMessage('Prix maximum invalide'),
  query('typeTrajet').optional().isIn(['PONCTUEL', 'RECURRENT', 'EVENEMENTIEL']).withMessage('Type de trajet invalide'),
  query('page').optional().isInt({ min: 1 }).withMessage('Numéro de page invalide'),
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limite invalide (1-50)')
], handleValidationErrors, TrajetController.filtrerTrajets);

// Obtenir tous les trajets d'un conducteur spécifique
router.get('/conducteur/:conducteurId', [
  param('conducteurId').isMongoId().withMessage('ID du conducteur invalide'),
  query('statut').optional().isIn(['PROGRAMME', 'EN_COURS', 'TERMINE', 'ANNULE']).withMessage('Statut invalide'),
  query('type').optional().isIn(['PONCTUEL', 'RECURRENT', 'EVENEMENTIEL']).withMessage('Type invalide'),
  query('page').optional().isInt({ min: 1 }).withMessage('Numéro de page invalide'),
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limite invalide (1-50)')
], handleValidationErrors, TrajetController.obtenirTrajetsConducteur);

// ==================== ROUTES DE MODIFICATION AVEC ID ====================

// Modifier détails trajet
router.put('/:id', protect, [
  param('id').isMongoId().withMessage('ID du trajet invalide')
], handleValidationErrors, TrajetController.modifierDetailsTrajet);

// Changer nombre de places
router.patch('/:id/places', protect, [
  param('id').isMongoId().withMessage('ID du trajet invalide'),
  body('nombrePlacesDisponibles').isInt({ min: 0 }).withMessage('Le nombre de places doit être un entier positif')
], handleValidationErrors, TrajetController.changerNombrePlaces);

// Modifier préférences trajet
router.patch('/:id/preferences', protect, [
  param('id').isMongoId().withMessage('ID du trajet invalide')
], handleValidationErrors, TrajetController.modifierPreferences);

// Mettre à jour le statut trajet
router.patch('/:id/statut', protect, [
  param('id').isMongoId().withMessage('ID du trajet invalide'),
  body('statutTrajet').isIn(['PROGRAMME', 'EN_COURS', 'TERMINE', 'ANNULE']).withMessage('Statut invalide')
], handleValidationErrors, TrajetController.mettreAJourStatut);

// Annuler trajet
router.patch('/:id/annuler', protect, [
  param('id').isMongoId().withMessage('ID du trajet invalide'),
  body('motifAnnulation').optional().isString().withMessage('Le motif d\'annulation doit être une chaîne de caractères')
], handleValidationErrors, TrajetController.annulerTrajet);

// Supprimer trajet récurrent
router.delete('/:id', protect, [
  param('id').isMongoId().withMessage('ID du trajet invalide')
], handleValidationErrors, TrajetController.supprimerTrajetRecurrent);

// ==================== ROUTE GET AVEC ID - TOUJOURS EN DERNIER ====================

// Obtenir détails complets d'un trajet - CETTE ROUTE DOIT ÊTRE LA DERNIÈRE
router.get('/:id', [
  param('id').isMongoId().withMessage('ID du trajet invalide')
], handleValidationErrors, TrajetController.obtenirDetailsTrajet);

module.exports = router;