const express = require('express');
const router = express.Router();
const EvenementController = require('../controllers/evenementController');

// Instanciation du contrôleur
const evenementController = new EvenementController();

// Import du middleware d'authentification
let protect;
try {
  const authMiddleware = require('../middlewares/authMiddleware');
  protect = authMiddleware.protect;
} catch (error) {
  console.warn('⚠️ Middleware protect non trouvé');
  // Middleware temporaire pour les tests
  protect = (req, res, next) => {
    req.user = { 
      id: '68a5f9e043391dafa36887e4', 
      role: 'utilisateur',
      nom: 'SIGATOUGO',
      prenom: 'BORIS CONSTANT'
    };
    next();
  };
}

// Validation des IDs MongoDB
const validerIdEvenement = (req, res, next) => {
  const { id } = req.params;
  if (id && (id.length !== 24 || !/^[0-9a-fA-F]{24}$/.test(id))) {
    return res.status(400).json({
      success: false,
      message: 'Format ID événement invalide',
      id_fourni: id
    });
  }
  next();
};

// Validation des IDs de groupe
const validerIdGroupe = (req, res, next) => {
  const { groupeId } = req.params;
  if (groupeId && (groupeId.length !== 24 || !/^[0-9a-fA-F]{24}$/.test(groupeId))) {
    return res.status(400).json({
      success: false,
      message: 'Format ID groupe invalide',
      id_fourni: groupeId
    });
  }
  next();
};

// Validation des paramètres de localisation
const validerLocalisation = (req, res, next) => {
  const { longitude, latitude, rayon } = req.query;

  if (longitude && (isNaN(longitude) || longitude < -180 || longitude > 180)) {
    return res.status(400).json({
      success: false,
      message: 'Longitude invalide (doit être entre -180 et 180)'
    });
  }

  if (latitude && (isNaN(latitude) || latitude < -90 || latitude > 90)) {
    return res.status(400).json({
      success: false,
      message: 'Latitude invalide (doit être entre -90 et 90)'
    });
  }

  if (rayon && (isNaN(rayon) || rayon < 0 || rayon > 1000)) {
    return res.status(400).json({
      success: false,
      message: 'Rayon invalide (doit être entre 0 et 1000 km)'
    });
  }

  next();
};

// Logger pour le debugging
const loggerEvenements = (req, res, next) => {
  console.log(`🎉 [EVENEMENTS] ${req.method} ${req.originalUrl} - User: ${req.user?.id || 'Anonymous'}`);
  next();
};

router.use(loggerEvenements);

/**
 * @swagger
 * components:
 *   schemas:
 *     Evenement:
 *       type: object
 *       required:
 *         - nom
 *         - description
 *         - typeEvenement
 *         - dateDebut
 *         - dateFin
 *         - lieu
 *       properties:
 *         _id:
 *           type: string
 *           description: ID unique de l'événement
 *         nom:
 *           type: string
 *           maxLength: 200
 *           description: Nom de l'événement
 *         description:
 *           type: string
 *           maxLength: 2000
 *           description: Description détaillée
 *         typeEvenement:
 *           type: string
 *           enum: [SPORT, CONCERT, FESTIVAL, CONFERENCE]
 *         dateDebut:
 *           type: string
 *           format: date-time
 *         dateFin:
 *           type: string
 *           format: date-time
 *         lieu:
 *           type: object
 *           properties:
 *             nom:
 *               type: string
 *             adresse:
 *               type: string
 *             ville:
 *               type: string
 *             coordonnees:
 *               type: object
 *               properties:
 *                 type:
 *                   type: string
 *                   enum: [Point]
 *                 coordinates:
 *                   type: array
 *                   items:
 *                     type: number
 *         capaciteEstimee:
 *           type: number
 *         statutEvenement:
 *           type: string
 *           enum: [PROGRAMME, EN_COURS, TERMINE, ANNULE]
 *         sourceDetection:
 *           type: string
 *           enum: [MANUEL, AUTOMATIQUE, API_EXTERNE]
 *         groupesCovoiturage:
 *           type: array
 *           items:
 *             type: object
 *         tags:
 *           type: array
 *           items:
 *             type: string
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 */

// =============== ROUTES CREATE ===============

/**
 * @swagger
 * tags:
 *   - name: Événements - CREATE
 *     description: Création d'événements et groupes de covoiturage
 *   - name: Événements - READ
 *     description: Consultation des événements
 *   - name: Événements - UPDATE
 *     description: Modification des événements
 *   - name: Événements - DELETE
 *     description: Suppression et annulation des événements
 */

// Créer un événement manuellement
router.post('/creer-manuel', protect, evenementController.creerEvenementManuel);

// Importer des événements depuis une API externe
router.post('/import-api', protect, evenementController.importerEvenementsAPI);

// Créer un groupe de covoiturage
router.post('/:id/groupes-covoiturage', protect, validerIdEvenement, evenementController.creerGroupeCovoiturage);

// =============== ROUTES READ ===============

// Obtenir les événements à venir
router.get('/a-venir', evenementController.obtenirEvenementsAVenir);

// Rechercher par localisation
router.get('/recherche-localisation', validerLocalisation, evenementController.rechercherParLocalisation);

// Obtenir les trajets associés à un événement
router.get('/:id/trajets', validerIdEvenement, evenementController.obtenirTrajetsAssocies);

// Obtenir les groupes de covoiturage d'un événement
router.get('/:id/groupes-covoiturage', validerIdEvenement, evenementController.obtenirGroupesCovoiturage);

// Obtenir un événement spécifique
router.get('/:id', validerIdEvenement, evenementController.obtenirEvenement);

// Obtenir tous les événements (doit être en dernier des GET)
router.get('/', evenementController.obtenirTousEvenements);

// =============== ROUTES UPDATE ===============

// Modifier les détails d'un événement
router.put('/:id', protect, validerIdEvenement, evenementController.modifierDetailsEvenement);

// Mettre à jour le statut
router.patch('/:id/statut', protect, validerIdEvenement, evenementController.mettreAJourStatut);

// Modifier un groupe de covoiturage
router.put('/:id/groupes-covoiturage/:groupeId', protect, validerIdEvenement, validerIdGroupe, evenementController.modifierGroupeCovoiturage);

// Rejoindre un groupe de covoiturage
router.post('/:id/groupes-covoiturage/:groupeId/rejoindre', protect, validerIdEvenement, validerIdGroupe, evenementController.rejoindreGroupeCovoiturage);

// Quitter un groupe de covoiturage
router.delete('/:id/groupes-covoiturage/:groupeId/quitter', protect, validerIdEvenement, validerIdGroupe, evenementController.quitterGroupeCovoiturage);

// =============== ROUTES DELETE ===============

// Annuler un événement
router.patch('/:id/annuler', protect, validerIdEvenement, evenementController.annulerEvenement);

// Supprimer un groupe de covoiturage
router.delete('/:id/groupes-covoiturage/:groupeId', protect, validerIdEvenement, validerIdGroupe, evenementController.supprimerGroupeCovoiturage);

// =============== ROUTES DE TEST (DÉVELOPPEMENT) ===============
router.get('/test/structure', (req, res) => {
  res.json({
    success: true,
    message: 'API Événements opérationnelle',
    routes_disponibles: {
      create: [
        'POST /creer-manuel - Créer événement manuel',
        'POST /import-api - Import événements API externe',
        'POST /:id/groupes-covoiturage - Créer groupe covoiturage'
      ],
      read: [
        'GET /a-venir - Événements à venir',
        'GET /recherche-localisation - Recherche par localisation',
        'GET /:id/trajets - Trajets associés',
        'GET /:id/groupes-covoiturage - Groupes covoiturage',
        'GET /:id - Événement spécifique',
        'GET / - Tous les événements'
      ],
      update: [
        'PUT /:id - Modifier détails événement',
        'PATCH /:id/statut - Mettre à jour statut',
        'PUT /:id/groupes-covoiturage/:groupeId - Modifier groupe',
        'POST /:id/groupes-covoiturage/:groupeId/rejoindre - Rejoindre groupe',
        'DELETE /:id/groupes-covoiturage/:groupeId/quitter - Quitter groupe'
      ],
      delete: [
        'PATCH /:id/annuler - Annuler événement',
        'DELETE /:id/groupes-covoiturage/:groupeId - Supprimer groupe'
      ]
    },
    middlewares: {
      auth: typeof protect === 'function',
      validation: true,
      logging: true
    }
  });
});

// =============== GESTION D'ERREURS ===============
router.use((error, req, res, next) => {
  console.error(`💥 [EVENEMENTS] Erreur ${req.method} ${req.originalUrl}:`, {
    message: error.message,
    stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    user: req.user?.id,
    params: req.params,
    query: req.query,
    timestamp: new Date().toISOString()
  });
    next(error);
  // Erreurs de validation MongoDB
  if (error.name === 'ValidationError') {
    const errors = Object.values(error.errors).map(err => ({
      field: err.path,
      message: err.message
    }));
    return res.status(400).json({
      success: false,
      message: 'Erreurs de validation',
      errors
    });
  }

  // Erreur de cast (ID invalide)
  if (error.name === 'CastError') {
    return res.status(400).json({
      success: false,
      message: 'ID invalide',
      details: `${error.path}: ${error.value}`
    });
  }

  // Erreur de duplication
  if (error.code === 11000) {
    return res.status(400).json({
      success: false,
      message: 'Données dupliquées',
      details: error.keyPattern
    });
  }

  // Erreurs spécifiques aux événements
  if (error.message?.includes('Événement non trouvé')) {
    return res.status(404).json({
      success: false,
      message: 'Événement non trouvé'
    });
  }

  if (error.message?.includes('Non autorisé')) {
    return res.status(403).json({
      success: false,
      message: 'Action non autorisée'
    });
  }

  // Erreur générale
  res.status(500).json({
    success: false,
    message: 'Erreur interne du serveur',
    ...(process.env.NODE_ENV === 'development' && { details: error.message })
  });
});

module.exports = router;