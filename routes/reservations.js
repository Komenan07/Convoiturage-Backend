const express = require('express');
const router = express.Router();
const { body, param, query, validationResult } = require('express-validator');
const ReservationController = require('../controllers/reservationController');
const authMiddleware = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');

// Middleware de validation des erreurs
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Données invalides',
      errors: errors.array(),
      code: 'VALIDATION_ERROR'
    });
  }
  next();
};

// Validations communes
const validateReservationId = [
  param('id')
    .isMongoId()
    .withMessage('ID de réservation invalide')
];

const validateTrajetId = [
  param('trajetId')
    .isMongoId()
    .withMessage('ID de trajet invalide')
];

const validateCreateReservation = [
  body('trajetId')
    .isMongoId()
    .withMessage('ID de trajet invalide'),
  body('nombrePlacesReservees')
    .isInt({ min: 1, max: 8 })
    .withMessage('Le nombre de places doit être entre 1 et 8'),
  body('pointPriseEnCharge.nom')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Le nom du point de prise en charge est requis (2-100 caractères)'),
  body('pointPriseEnCharge.adresse')
    .trim()
    .isLength({ min: 5, max: 200 })
    .withMessage('L\'adresse du point de prise en charge est requise (5-200 caractères)'),
  body('pointPriseEnCharge.coordonnees')
    .isArray({ min: 2, max: 2 })
    .withMessage('Les coordonnées doivent être un tableau [longitude, latitude]'),
  body('pointDepose.nom')
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('Le nom du point de dépose est requis (2-100 caractères)'),
  body('pointDepose.adresse')
    .trim()
    .isLength({ min: 5, max: 200 })
    .withMessage('L\'adresse du point de dépose est requise (5-200 caractères)'),
  body('pointDepose.coordonnees')
    .isArray({ min: 2, max: 2 })
    .withMessage('Les coordonnées doivent être un tableau [longitude, latitude]'),
  body('bagages.quantite')
    .optional()
    .isInt({ min: 0, max: 10 })
    .withMessage('La quantité de bagages doit être entre 0 et 10'),
  body('bagages.poids')
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage('Le poids des bagages doit être entre 0 et 100 kg'),
  body('bagages.description')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('La description des bagages ne peut dépasser 200 caractères')
];

const validateQueryParams = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Le numéro de page doit être supérieur à 0'),
  query('limite')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('La limite doit être entre 1 et 100'),
  query('statut')
    .optional()
    .isIn(['EN_ATTENTE', 'CONFIRMEE', 'REFUSEE', 'ANNULEE', 'TERMINEE'])
    .withMessage('Statut invalide'),
  query('dateDebut')
    .optional()
    .isISO8601()
    .withMessage('Format de date invalide pour dateDebut'),
  query('dateFin')
    .optional()
    .isISO8601()
    .withMessage('Format de date invalide pour dateFin')
];

const validateStatutPaiement = [
  body('statutPaiement')
    .isIn(['EN_ATTENTE', 'PAYE', 'REMBOURSE'])
    .withMessage('Statut de paiement invalide'),
  body('methodePaiement')
    .optional()
    .isIn(['ESPECES', 'WAVE', 'ORANGE_MONEY', 'MTN_MONEY', 'MOOV_MONEY'])
    .withMessage('Méthode de paiement invalide'),
  body('referencePaiement')
    .optional()
    .trim()
    .isLength({ max: 100 })
    .withMessage('Référence de paiement trop longue')
];

const validatePosition = [
  body('latitude')
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude invalide (-90 à 90)'),
  body('longitude')
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude invalide (-180 à 180)')
];

const validateFraisSupplementaires = [
  body('type')
    .isIn(['PEAGE', 'PARKING', 'ESSENCE_SUPPLEMENTAIRE', 'AUTRE'])
    .withMessage('Type de frais invalide (PEAGE, PARKING, ESSENCE_SUPPLEMENTAIRE, AUTRE)'),
  body('montant')
    .isFloat({ min: 0 })
    .withMessage('Le montant doit être supérieur ou égal à 0'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('La description ne peut dépasser 200 caractères'),
  body('repartition')
    .optional()
    .isIn(['EQUITABLE', 'CONDUCTEUR_SEUL'])
    .withMessage('Répartition invalide (EQUITABLE, CONDUCTEUR_SEUL)')
];

const validateEvaluation = [
  body('typeEvaluation')
    .isIn(['PASSAGER_VERS_CONDUCTEUR', 'CONDUCTEUR_VERS_PASSAGER'])
    .withMessage('Type d\'évaluation invalide'),
  body('note')
    .isFloat({ min: 1, max: 5 })
    .withMessage('La note doit être entre 1 et 5'),
  body('criteres.ponctualite')
    .optional()
    .isInt({ min: 1, max: 5 })
    .withMessage('La ponctualité doit être entre 1 et 5'),
  body('criteres.proprete')
    .optional()
    .isInt({ min: 1, max: 5 })
    .withMessage('La propreté doit être entre 1 et 5'),
  body('criteres.qualiteConduite')
    .optional()
    .isInt({ min: 1, max: 5 })
    .withMessage('La qualité de conduite doit être entre 1 et 5'),
  body('criteres.respect')
    .optional()
    .isInt({ min: 1, max: 5 })
    .withMessage('Le respect doit être entre 1 et 5'),
  body('criteres.communication')
    .optional()
    .isInt({ min: 1, max: 5 })
    .withMessage('La communication doit être entre 1 et 5'),
  body('commentaire')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Le commentaire ne peut dépasser 500 caractères'),
  body('signalements')
    .optional()
    .isArray()
    .withMessage('Les signalements doivent être un tableau'),
  body('signalements.*')
  .optional()
  .isIn(['CONDUITE_DANGEREUSE', 'HARCELEMENT', 'VEHICULE_NON_CONFORME', 
         'RETARD_EXCESSIF', 'AUTRE'])
  .withMessage('Type de signalement invalide')
];

const validateConducteursProches = [
  query('latitude')
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude invalide (-90 à 90)'),
  query('longitude')
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude invalide (-180 à 180)'),
  query('rayon')
    .optional()
    .isInt({ min: 100, max: 5000 })
    .withMessage('Le rayon doit être entre 100 et 5000 mètres')
];

// Routes principales

/**
 * @route   POST /api/reservations
 * @desc    Créer une nouvelle réservation
 * @access  Private
 */
router.post('/',
  authMiddleware.requireAuth,
  validateCreateReservation,
  handleValidationErrors,
  ReservationController.creerReservation
);

/**
 * @route   GET /api/reservations
 * @desc    Obtenir les réservations avec filtres
 * @access  Private
 */
router.get('/',
  authMiddleware.requireAuth,
  validateQueryParams,
  handleValidationErrors,
  ReservationController.obtenirReservations
);

/**
 * @route   GET /api/reservations/mes-reservations
 * @desc    Obtenir mes réservations (utilisateur connecté)
 * @access  Private
 */
router.get('/mes-reservations',
  authMiddleware.requireAuth,
  [
    query('statut')
      .optional()
      .isIn(['EN_ATTENTE', 'CONFIRMEE', 'REFUSEE', 'ANNULEE', 'TERMINEE'])
      .withMessage('Statut invalide'),
    query('limite')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('La limite doit être entre 1 et 100')
  ],
  handleValidationErrors,
  ReservationController.obtenirMesReservations
);

/**
 * @route   GET /api/reservations/reservations-recues
 * @desc    Obtenir les réservations reçues (conducteur connecté)
 * @access  Private
 */
router.get('/reservations-recues',
  authMiddleware.requireAuth,
  [
    query('statut')
      .optional()
      .isIn(['EN_ATTENTE', 'CONFIRMEE', 'REFUSEE', 'ANNULEE', 'TERMINEE'])
      .withMessage('Statut invalide'),
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Le numéro de page doit être supérieur à 0'),
    query('limite')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('La limite doit être entre 1 et 100')
  ],
  handleValidationErrors,
  ReservationController.obtenirReservationsRecues
);

/**
 * @route   GET /api/reservations/statistiques
 * @desc    Obtenir les statistiques de réservation
 * @access  Private
 */
router.get('/statistiques',
  authMiddleware.requireAuth,
  [
    query('userId')
      .optional()
      .isMongoId()
      .withMessage('ID utilisateur invalide'),
    query('periode')
      .optional()
      .isIn(['7d', '30d', '90d', '1y'])
      .withMessage('Période invalide (7d, 30d, 90d, 1y)')
  ],
  handleValidationErrors,
  ReservationController.obtenirStatistiques
);

/**
 * @route   GET /api/reservations/:id
 * @desc    Obtenir les détails d'une réservation
 * @access  Private
 */
router.get('/:id',
  authMiddleware.requireAuth,
  validateReservationId,
  handleValidationErrors,
  ReservationController.obtenirReservationParId
);

/**
 * @route   PUT /api/reservations/:id/confirmer
 * @desc    Confirmer une réservation (conducteur uniquement)
 * @access  Private
 */
router.put('/:id/confirmer',
  authMiddleware.requireAuth,
  validateReservationId,
  handleValidationErrors,
  ReservationController.confirmerReservation
);

/**
 * @route   PUT /api/reservations/:id/refuser
 * @desc    Refuser une réservation (conducteur uniquement)
 * @access  Private
 */
router.put('/:id/refuser',
  authMiddleware.requireAuth,
  [
    ...validateReservationId,
    body('motifRefus')
      .trim()
      .isLength({ min: 10, max: 500 })
      .withMessage('Un motif de refus détaillé est requis (10-500 caractères)')
  ],
  handleValidationErrors,
  ReservationController.refuserReservation
);

/**
 * @route   PUT /api/reservations/:id/annuler
 * @desc    Annuler une réservation (passager uniquement)
 * @access  Private
 */
router.put('/:id/annuler',
  authMiddleware.requireAuth,
  [
    ...validateReservationId,
    body('raisonAnnulation')
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage('La raison d\'annulation ne peut dépasser 500 caractères')
  ],
  handleValidationErrors,
  ReservationController.annulerReservation
);

/**
 * @route   PUT /api/reservations/:id/terminer
 * @desc    Marquer une réservation comme terminée
 * @access  Private (Conducteur uniquement)
 * ✅ Supprimé validations notePassager et commentaire
 */
router.put('/:id/terminer',
  authMiddleware.requireAuth,
  validateReservationId,
  handleValidationErrors,
  ReservationController.terminerReservation
);

/**
 * @route   PUT /api/reservations/:id/statut-paiement
 * @desc    Mettre à jour le statut de paiement
 * @access  Private
 */
router.put('/:id/statut-paiement',
  authMiddleware.requireAuth,
  [
    ...validateReservationId,
    ...validateStatutPaiement
  ],
  handleValidationErrors,
  ReservationController.mettreAJourStatutPaiement
);

/**
 * @route   PUT /api/reservations/:id/position
 * @desc    Mettre à jour la position en temps réel
 * @access  Private
 */
router.put('/:id/position',
  authMiddleware.requireAuth,
  [
    ...validateReservationId,
    ...validatePosition
  ],
  handleValidationErrors,
  ReservationController.mettreAJourPosition
);

/**
 * @route   POST /api/reservations/:id/frais-supplementaires
 * @desc    Ajouter des frais supplémentaires (péage, stationnement, etc.)
 * @access  Private (Conducteur uniquement)
 */
router.post('/:id/frais-supplementaires',
  authMiddleware.requireAuth,
  [
    ...validateReservationId,
    ...validateFraisSupplementaires
  ],
  handleValidationErrors,
  ReservationController.ajouterFraisSupplementaires
);

/**
 * @route   GET /api/reservations/:id/frais-supplementaires
 * @desc    Obtenir les frais supplémentaires d'une réservation
 * @access  Private (Passager, Conducteur, Admin)
 */
router.get('/:id/frais-supplementaires',
  authMiddleware.requireAuth,
  validateReservationId,
  handleValidationErrors,
  ReservationController.obtenirFraisSupplementaires
);

// 🆕 NOUVELLES ROUTES - Évaluation

/**
 * @route   POST /api/reservations/:id/evaluer
 * @desc    Évaluer un trajet (passager évalue conducteur ou vice-versa)
 * @access  Private
 */
router.post('/:id/evaluer',
  authMiddleware.requireAuth,
  [
    ...validateReservationId,
    ...validateEvaluation
  ],
  handleValidationErrors,
  ReservationController.evaluerTrajet
);

// 🆕 NOUVELLES ROUTES - Prise en charge

/**
 * @route   POST /api/reservations/:id/confirmer-prise-en-charge
 * @desc    Confirmer la prise en charge du passager
 * @access  Private (Conducteur uniquement)
 */
router.post('/:id/confirmer-prise-en-charge',
  authMiddleware.requireAuth,
  [
    ...validateReservationId,
    body('latitude')
      .optional()
      .isFloat({ min: -90, max: 90 })
      .withMessage('Latitude invalide (-90 à 90)'),
    body('longitude')
      .optional()
      .isFloat({ min: -180, max: 180 })
      .withMessage('Longitude invalide (-180 à 180)')
  ],
  handleValidationErrors,
  ReservationController.confirmerPriseEnCharge
);

// 🆕 NOUVELLES ROUTES - Suivi itinéraire

/**
 * @route   POST /api/reservations/:id/verifier-itineraire
 * @desc    Vérifier si le véhicule est sur l'itinéraire prévu
 * @access  Private (Passager ou Conducteur)
 */
router.post('/:id/verifier-itineraire',
  authMiddleware.requireAuth,
  [
    ...validateReservationId,
    ...validatePosition
  ],
  handleValidationErrors,
  ReservationController.verifierItineraire
);

// 🆕 NOUVELLES ROUTES - Contacts

/**
 * @route   GET /api/reservations/:id/contacts
 * @desc    Obtenir les contacts partagés (téléphone/WhatsApp)
 * @access  Private (Passager ou Conducteur)
 */
router.get('/:id/contacts',
  authMiddleware.requireAuth,
  validateReservationId,
  handleValidationErrors,
  ReservationController.obtenirContactsPartages
);

// 🆕 NOUVELLES ROUTES - Répartition financière

/**
 * @route   GET /api/reservations/:id/repartition-financiere
 * @desc    Obtenir la répartition financière détaillée (500F split)
 * @access  Private (Conducteur, Admin)
 */
router.get('/:id/repartition-financiere',
  authMiddleware.requireAuth,
  validateReservationId,
  handleValidationErrors,
  ReservationController.obtenirRepartitionFinanciere
);

// 🆕 NOUVELLES ROUTES - Détection conflits

/**
 * @route   GET /api/reservations/:id/conducteurs-proches
 * @desc    Détecter les conducteurs proches (éviter double réservation)
 * @access  Private
 */
router.get('/:id/conducteurs-proches',
  authMiddleware.requireAuth,
  [
    ...validateReservationId,
    ...validateConducteursProches
  ],
  handleValidationErrors,
  ReservationController.detecterConducteursProches
);

/**
 * @route   GET /api/reservations/:id/distance
 * @desc    Calculer la distance d'une réservation
 * @access  Private
 */
router.get('/:id/distance',
  authMiddleware.requireAuth,
  validateReservationId,
  handleValidationErrors,
  ReservationController.calculerDistanceReservation
);

/**
 * @route   GET /api/reservations/:id/remboursement
 * @desc    Calculer le remboursement potentiel
 * @access  Private
 */
router.get('/:id/remboursement',
  authMiddleware.requireAuth,
  validateReservationId,
  handleValidationErrors,
  ReservationController.calculerRemboursement
);

/**
 * @route   GET /api/reservations/:id/positions
 * @desc    Obtenir l'historique des positions (suivi temps réel)
 * @access  Private
 */
router.get('/:id/positions',
  authMiddleware.requireAuth,
  validateReservationId,
  handleValidationErrors,
  ReservationController.obtenirHistoriquePositions
);

/**
 * @route   GET /api/reservations/:id/rapport
 * @desc    Obtenir le rapport détaillé d'une réservation
 * @access  Private (Admin/Conducteur)
 */
router.get('/:id/rapport',
  authMiddleware.requireAuth,
  validateReservationId,
  handleValidationErrors,
  ReservationController.obtenirRapportReservation
);

/**
 * @route   GET /api/reservations/trajet/:trajetId
 * @desc    Obtenir les réservations d'un trajet (conducteur uniquement)
 * @access  Private
 */
router.get('/trajet/:trajetId',
  authMiddleware.requireAuth,
  validateTrajetId,
  handleValidationErrors,
  ReservationController.obtenirReservationsTrajet
);

/**
 * @route   GET /api/reservations/trajet/:trajetId/disponibilite
 * @desc    Vérifier la disponibilité d'un trajet
 * @access  Private
 */
router.get('/trajet/:trajetId/disponibilite',
  authMiddleware.requireAuth,
  [
    ...validateTrajetId,
    query('nombrePlaces')
      .optional()
      .isInt({ min: 1, max: 8 })
      .withMessage('Le nombre de places doit être entre 1 et 8')
  ],
  handleValidationErrors,
  ReservationController.verifierDisponibilite
);

// Routes d'administration

/**
 * @route   POST /api/reservations/maintenance/notifications
 * @desc    Exécuter les notifications programmées
 * @access  Private (Admin seulement)
 */
router.post('/maintenance/notifications',
  authMiddleware.requireAuth,
  roleMiddleware.requireRole(['ADMIN']),
  [
    query('limite')
      .optional()
      .isInt({ min: 1, max: 1000 })
      .withMessage('La limite doit être entre 1 et 1000')
  ],
  handleValidationErrors,
  ReservationController.executerNotificationsPrevues
);

/**
 * @route   DELETE /api/reservations/maintenance/nettoyer
 * @desc    Nettoyage des anciennes réservations
 * @access  Private (Admin seulement)
 */
router.delete('/maintenance/nettoyer',
  authMiddleware.requireAuth,
  roleMiddleware.requireRole(['ADMIN']),
  ReservationController.nettoyerAnciennesReservations
);

/**
 * @route   GET /api/reservations/debug/info
 * @desc    Route de diagnostic (temporaire)
 * @access  Private (Admin seulement)
 */
router.get('/debug/info',
  authMiddleware.requireAuth,
  roleMiddleware.requireRole(['ADMIN']),
  ReservationController.debugReservations
);

// Middleware de gestion d'erreurs spécifique aux réservations
router.use((error, req, res, next) => {
  console.error('Erreur dans les routes réservations:', error);

  // Erreurs de validation Mongoose
  if (error.name === 'ValidationError') {
    const erreurs = Object.keys(error.errors).map(key => ({
      field: key,
      message: error.errors[key].message
    }));

    return res.status(400).json({
      success: false,
      message: 'Erreurs de validation',
      erreurs,
      code: 'MONGOOSE_VALIDATION_ERROR'
    });
  }

  // Erreurs de cast (ID invalide)
  if (error.name === 'CastError') {
    return res.status(400).json({
      success: false,
      message: 'ID invalide fourni',
      code: 'INVALID_OBJECT_ID'
    });
  }

  // Erreurs de duplicata (réservation déjà existante)
  if (error.code === 11000) {
    return res.status(409).json({
      success: false,
      message: 'Une réservation existe déjà pour ce trajet',
      code: 'DUPLICATE_RESERVATION'
    });
  }

  return next(error);
});

module.exports = router;