// =====================================================
// ROUTES: SIGNALEMENT
// =====================================================

const express = require('express');
const router = express.Router();

// Controllers
const signalementController = require('../controllers/signalementController');

// Middleware d'authentification
const { requireAuth, requireRole } = require('../middleware/auth');
const { rateLimiter } = require('../middleware/rateLimiter');

// Middleware de validation
const { body, param, query } = require('express-validator');

// =====================================================
// MIDDLEWARE DE VALIDATION
// =====================================================

const validationCreerSignalement = [
  body('signaleId')
    .isMongoId()
    .withMessage('ID utilisateur signalé invalide'),
    
  body('typeSignalement')
    .isIn(['COMPORTEMENT', 'CONTENU', 'FRAUDE', 'SECURITE'])
    .withMessage('Type de signalement invalide'),
    
  body('motif')
    .isIn([
      // COMPORTEMENT
      'COMPORTEMENT_INAPPROPRIE', 'HARCELEMENT', 'DISCRIMINATION', 
      'VIOLENCE_VERBALE', 'NON_RESPECT_REGLES',
      // CONTENU
      'CONTENU_OFFENSANT', 'SPAM', 'CONTENU_INAPPROPRIE', 'FAUSSES_INFORMATIONS',
      // FRAUDE
      'FAUX_PROFIL', 'PRIX_ABUSIFS', 'ANNULATION_ABUSIVE', 'FAUSSE_EVALUATION',
      // SÉCURITÉ
      'CONDUITE_DANGEREUSE', 'VEHICULE_NON_CONFORME', 'USURPATION_IDENTITE', 'MENACES'
    ])
    .withMessage('Motif de signalement invalide'),
    
  body('description')
    .isLength({ min: 10, max: 1000 })
    .withMessage('La description doit contenir entre 10 et 1000 caractères')
    .trim(),
    
  body('trajetId')
    .optional()
    .isMongoId()
    .withMessage('ID trajet invalide'),
    
  body('messageId')
    .optional()
    .isMongoId()
    .withMessage('ID message invalide')
];

const validationTraiterSignalement = [
  param('id')
    .isMongoId()
    .withMessage('ID signalement invalide'),
    
  body('action')
    .isIn(['APPROUVER', 'REJETER'])
    .withMessage('Action invalide. Utilisez APPROUVER ou REJETER'),
    
  body('actionsDisciplinaires')
    .optional()
    .isArray()
    .withMessage('Les actions disciplinaires doivent être un tableau'),
    
  body('actionsDisciplinaires.*')
    .optional()
    .isIn([
      'AVERTISSEMENT', 'SUSPENSION_1_JOUR', 'SUSPENSION_7_JOURS',
      'SUSPENSION_30_JOURS', 'BLOCAGE_DEFINITIF', 'SUPPRESSION_CONTENU',
      'LIMITATION_FONCTIONNALITES', 'VERIFICATION_IDENTITE_REQUISE'
    ])
    .withMessage('Action disciplinaire invalide'),
    
  body('commentaire')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Le commentaire ne peut dépasser 500 caractères')
    .trim()
];

const validationAssignerModerateur = [
  param('id')
    .isMongoId()
    .withMessage('ID signalement invalide'),
    
  body('moderateurId')
    .isMongoId()
    .withMessage('ID modérateur invalide')
];

const validationPagination = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Le numéro de page doit être un entier positif'),
    
  query('limite')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('La limite doit être entre 1 et 100')
];

const validationStatut = [
  query('statut')
    .optional()
    .matches(/^(EN_ATTENTE|EN_COURS|TRAITE|REJETE)(,(EN_ATTENTE|EN_COURS|TRAITE|REJETE))*$/)
    .withMessage('Statut invalide')
];

// =====================================================
// ROUTES PUBLIQUES (avec authentification)
// =====================================================

/**
 * @route   POST /api/signalements
 * @desc    Créer un nouveau signalement
 * @access  Private (utilisateurs authentifiés)
 */
router.post(
  '/',
  requireAuth,
  rateLimiter.signalement, // Limitation spéciale pour éviter le spam
  signalementController.uploadPreuves, // Middleware multer
  validationCreerSignalement,
  signalementController.creerSignalement
);

/**
 * @route   POST /api/signalements/upload-preuves
 * @desc    Télécharger des preuves pour un signalement
 * @access  Private (utilisateurs authentifiés)
 */
router.post(
  '/upload-preuves',
  requireAuth,
  rateLimiter.upload,
  signalementController.uploadPreuves,
  signalementController.uploaderPreuves
);

/**
 * @route   GET /api/signalements/mes-signalements
 * @desc    Obtenir l'historique des signalements de l'utilisateur connecté
 * @access  Private (utilisateurs authentifiés)
 */
router.get(
  '/mes-signalements',
  requireAuth,
  validationPagination,
  async (req, res) => {
    req.query.userId = req.user._id;
    return signalementController.obtenirHistoriqueSignalements(req, res);
  }
);

// =====================================================
// ROUTES ADMINISTRATEUR/MODÉRATION
// =====================================================

/**
 * @route   GET /api/signalements/queue
 * @desc    Obtenir la queue de modération
 * @access  Private (administrateurs et modérateurs)
 */
router.get(
  '/queue',
  requireAuth,
  requireRole(['ADMIN', 'MODERATEUR']),
  validationPagination,
  [
    query('priorite')
      .optional()
      .isIn(['BASSE', 'NORMALE', 'HAUTE', 'CRITIQUE'])
      .withMessage('Priorité invalide'),
      
    query('type')
      .optional()
      .isIn(['COMPORTEMENT', 'CONTENU', 'FRAUDE', 'SECURITE'])
      .withMessage('Type invalide'),
      
    validationStatut
  ],
  signalementController.obtenirQueueModeration
);

/**
 * @route   GET /api/signalements/historique
 * @desc    Obtenir l'historique complet des signalements
 * @access  Private (administrateurs)
 */
router.get(
  '/historique',
  requireAuth,
  requireRole(['ADMIN']),
  validationPagination,
  [
    query('userId')
      .optional()
      .isMongoId()
      .withMessage('ID utilisateur invalide'),
      
    query('dateDebut')
      .optional()
      .isISO8601()
      .withMessage('Date de début invalide'),
      
    query('dateFin')
      .optional()
      .isISO8601()
      .withMessage('Date de fin invalide'),
      
    validationStatut
  ],
  signalementController.obtenirHistoriqueSignalements
);

/**
 * @route   GET /api/signalements/statistiques
 * @desc    Obtenir les statistiques de modération
 * @access  Private (administrateurs)
 */
router.get(
  '/statistiques',
  requireAuth,
  requireRole(['ADMIN']),
  [
    query('dateDebut')
      .optional()
      .isISO8601()
      .withMessage('Date de début invalide'),
      
    query('dateFin')
      .optional()
      .isISO8601()
      .withMessage('Date de fin invalide'),
      
    query('moderateurId')
      .optional()
      .isMongoId()
      .withMessage('ID modérateur invalide')
  ],
  signalementController.obtenirStatistiquesModeration
);

/**
 * @route   GET /api/signalements/metriques
 * @desc    Obtenir les métriques en temps réel
 * @access  Private (administrateurs et modérateurs)
 */
router.get(
  '/metriques',
  requireAuth,
  requireRole(['ADMIN', 'MODERATEUR']),
  signalementController.obtenirMetriquesTempsReel
);

/**
 * @route   GET /api/signalements/recherche
 * @desc    Rechercher des signalements avec filtres avancés
 * @access  Private (administrateurs et modérateurs)
 */
router.get(
  '/recherche',
  requireAuth,
  requireRole(['ADMIN', 'MODERATEUR']),
  validationPagination,
  [
    query('q')
      .optional()
      .isLength({ min: 2, max: 100 })
      .withMessage('Le terme de recherche doit contenir entre 2 et 100 caractères'),
      
    query('type')
      .optional()
      .isIn(['COMPORTEMENT', 'CONTENU', 'FRAUDE', 'SECURITE'])
      .withMessage('Type invalide'),
      
    query('motif')
      .optional()
      .isLength({ min: 2 })
      .withMessage('Motif invalide'),
      
    query('priorite')
      .optional()
      .isIn(['BASSE', 'NORMALE', 'HAUTE', 'CRITIQUE'])
      .withMessage('Priorité invalide'),
      
    validationStatut,
    
    query('dateDebut')
      .optional()
      .isISO8601()
      .withMessage('Date de début invalide'),
      
    query('dateFin')
      .optional()
      .isISO8601()
      .withMessage('Date de fin invalide'),
      
    query('moderateurId')
      .optional()
      .isMongoId()
      .withMessage('ID modérateur invalide')
  ],
  signalementController.rechercherSignalements
);

/**
 * @route   GET /api/signalements/:id
 * @desc    Obtenir un signalement spécifique
 * @access  Private (administrateurs et modérateurs)
 */
router.get(
  '/:id',
  requireAuth,
  requireRole(['ADMIN', 'MODERATEUR']),
  [
    param('id')
      .isMongoId()
      .withMessage('ID signalement invalide')
  ],
  signalementController.obtenirSignalement
);

/**
 * @route   PUT /api/signalements/:id/traiter
 * @desc    Traiter un signalement (approuver/rejeter)
 * @access  Private (administrateurs et modérateurs)
 */
router.put(
  '/:id/traiter',
  requireAuth,
  requireRole(['ADMIN', 'MODERATEUR']),
  rateLimiter.moderation,
  validationTraiterSignalement,
  signalementController.traiterSignalement
);

/**
 * @route   PUT /api/signalements/:id/assigner
 * @desc    Assigner un modérateur à un signalement
 * @access  Private (administrateurs)
 */
router.put(
  '/:id/assigner',
  requireAuth,
  requireRole(['ADMIN']),
  validationAssignerModerateur,
  signalementController.assignerModerateur
);

/**
 * @route   DELETE /api/signalements/:id/classer
 * @desc    Classer un signalement sans suite
 * @access  Private (administrateurs et modérateurs)
 */
router.delete(
  '/:id/classer',
  requireAuth,
  requireRole(['ADMIN', 'MODERATEUR']),
  [
    param('id')
      .isMongoId()
      .withMessage('ID signalement invalide'),
      
    body('raison')
      .optional()
      .isLength({ min: 5, max: 200 })
      .withMessage('La raison doit contenir entre 5 et 200 caractères')
      .trim()
  ],
  signalementController.classerSignalement
);

// =====================================================
// ROUTES DE RAPPORTS ET EXPORTS
// =====================================================

/**
 * @route   GET /api/signalements/rapports/hebdomadaire
 * @desc    Générer un rapport hebdomadaire
 * @access  Private (administrateurs)
 */
router.get(
  '/rapports/hebdomadaire',
  requireAuth,
  requireRole(['ADMIN']),
  async (req, res) => {
    try {
      const maintenant = new Date();
      const il7jours = new Date(maintenant.getTime() - 7 * 24 * 60 * 60 * 1000);
      
      req.query.dateDebut = il7jours.toISOString();
      req.query.dateFin = maintenant.toISOString();
      
      return signalementController.obtenirStatistiquesModeration(req, res);
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la génération du rapport',
        code: 'RAPPORT_ERROR'
      });
    }
  }
);

/**
 * @route   GET /api/signalements/rapports/mensuel
 * @desc    Générer un rapport mensuel
 * @access  Private (administrateurs)
 */
router.get(
  '/rapports/mensuel',
  requireAuth,
  requireRole(['ADMIN']),
  async (req, res) => {
    try {
      const maintenant = new Date();
      const il30jours = new Date(maintenant.getTime() - 30 * 24 * 60 * 60 * 1000);
      
      req.query.dateDebut = il30jours.toISOString();
      req.query.dateFin = maintenant.toISOString();
      
      return signalementController.obtenirStatistiquesModeration(req, res);
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la génération du rapport',
        code: 'RAPPORT_ERROR'
      });
    }
  }
);

// =====================================================
// MIDDLEWARE DE GESTION D'ERREUR POUR LES ROUTES
// =====================================================

router.use((error, req, res, next) => {
  // Erreur Multer (upload)
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'Fichier trop volumineux (maximum 10MB)',
        code: 'FILE_TOO_LARGE'
      });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        message: 'Trop de fichiers (maximum 5)',
        code: 'TOO_MANY_FILES'
      });
    }
  }

  // Erreur de type de fichier
  if (error.message === 'Type de fichier non autorisé pour les preuves') {
    return res.status(400).json({
      success: false,
      message: 'Type de fichier non autorisé. Formats acceptés: jpg, png, gif, pdf, mp4, mov',
      code: 'INVALID_FILE_TYPE'
    });
  }

  next(error);
});

// =====================================================
// DOCUMENTATION DES ENDPOINTS
// =====================================================

/**
 * @route   GET /api/signalements/docs
 * @desc    Documentation des endpoints de signalement
 * @access  Public
 */
router.get('/docs', (req, res) => {
  res.json({
    success: true,
    message: 'API Signalements - Documentation',
    version: '1.0.0',
    endpoints: {
      creation: {
        'POST /': 'Créer un nouveau signalement',
        'POST /upload-preuves': 'Télécharger des preuves'
      },
      consultation: {
        'GET /mes-signalements': 'Mes signalements',
        'GET /queue': 'Queue de modération',
        'GET /historique': 'Historique complet',
        'GET /:id': 'Signalement spécifique'
      },
      moderation: {
        'PUT /:id/traiter': 'Traiter un signalement',
        'PUT /:id/assigner': 'Assigner un modérateur',
        'DELETE /:id/classer': 'Classer sans suite'
      },
      statistiques: {
        'GET /statistiques': 'Statistiques de modération',
        'GET /metriques': 'Métriques en temps réel',
        'GET /recherche': 'Recherche avancée'
      },
      rapports: {
        'GET /rapports/hebdomadaire': 'Rapport hebdomadaire',
        'GET /rapports/mensuel': 'Rapport mensuel'
      }
    }
  });
});

module.exports = router;