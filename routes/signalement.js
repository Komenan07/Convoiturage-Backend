const express = require('express');
const router = express.Router();
const { body, param, query } = require('express-validator');

// Contrôleur et middlewares
const signalementController = require('../controllers/signalementController');
const authMiddleware = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');
const AppError = require('../utils/AppError');

// Validation pour créer un signalement
const validateCreateSignalement = [
  body('signaleId')
    .isMongoId()
    .withMessage('ID utilisateur signalé invalide')
    .notEmpty()
    .withMessage('L\'utilisateur signalé est requis'),

  body('typeSignalement')
    .isIn(['COMPORTEMENT', 'SECURITE', 'FRAUDE', 'SPAM', 'CONTENU_INAPPROPRIE', 'AUTRE'])
    .withMessage('Type de signalement invalide'),

  body('motif')
    .isIn([
      'HARCELEMENT', 'MENACES', 'CONDUITE_DANGEREUSE', 'VEHICULE_NON_CONFORME',
      'USURPATION_IDENTITE', 'VIOLENCE_VERBALE', 'DISCRIMINATION',
      'COMPORTEMENT_INAPPROPRIE', 'FAUX_PROFIL', 'CONTENU_OFFENSANT'
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

// Validation pour traiter un signalement
const validateTraiterSignalement = [
  param('id')
    .isMongoId()
    .withMessage('ID signalement invalide'),

  body('action')
    .isIn(['APPROUVER', 'REJETER'])
    .withMessage('Action invalide'),

  body('actionsDisciplinaires')
    .optional()
    .isArray()
    .withMessage('Les actions disciplinaires doivent être un tableau'),

  body('actionsDisciplinaires.*')
    .optional()
    .isIn([
      'AVERTISSEMENT', 'SUSPENSION_1_JOUR', 'SUSPENSION_7_JOURS',
      'SUSPENSION_30_JOURS', 'BLOCAGE_DEFINITIF', 'LIMITATION_FONCTIONNALITES',
      'VERIFICATION_IDENTITE_REQUISE'
    ])
    .withMessage('Action disciplinaire invalide'),

  body('commentaire')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Le commentaire ne peut dépasser 500 caractères')
    .trim()
];

// Validation pour assigner un modérateur
const validateAssignerModerateur = [
  param('id')
    .isMongoId()
    .withMessage('ID signalement invalide'),

  body('moderateurId')
    .isMongoId()
    .withMessage('ID modérateur invalide')
    .notEmpty()
    .withMessage('Le modérateur est requis')
];

// Validation pour classer un signalement
const validateClasserSignalement = [
  param('id')
    .isMongoId()
    .withMessage('ID signalement invalide'),

  body('raison')
    .optional()
    .isLength({ max: 500 })
    .withMessage('La raison ne peut dépasser 500 caractères')
    .trim()
];

// Validation pour les paramètres de requête
const validateQueryParams = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Le numéro de page doit être un entier positif'),

  query('limite')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('La limite doit être entre 1 et 100'),

  query('statut')
    .optional()
    .matches(/^(EN_ATTENTE|EN_COURS|TRAITE|REJETE|CLASSE_SANS_SUITE)(,(EN_ATTENTE|EN_COURS|TRAITE|REJETE|CLASSE_SANS_SUITE))*$/)
    .withMessage('Statut invalide'),

  query('priorite')
    .optional()
    .isIn(['BASSE', 'NORMALE', 'HAUTE', 'CRITIQUE'])
    .withMessage('Priorité invalide'),

  query('type')
    .optional()
    .isIn(['COMPORTEMENT', 'SECURITE', 'FRAUDE', 'SPAM', 'CONTENU_INAPPROPRIE', 'AUTRE'])
    .withMessage('Type invalide'),

  query('dateDebut')
    .optional()
    .isISO8601()
    .withMessage('Date de début invalide'),

  query('dateFin')
    .optional()
    .isISO8601()
    .withMessage('Date de fin invalide')
];

// Routes

// Créer un signalement avec gestion des preuves
router.post('/', 
  authMiddleware.requireAuth, 
  signalementController.uploadPreuves, 
  validateCreateSignalement, 
  signalementController.creerSignalement
);

// Uploader des preuves supplémentaires
router.post('/preuves', 
  authMiddleware.requireAuth, 
  signalementController.uploadPreuves,
  body('signalementId').isMongoId().withMessage('ID signalement invalide'), 
  signalementController.uploaderPreuves
);

// Queue de modération
router.get('/moderation/queue', 
  authMiddleware.requireAuth, 
  roleMiddleware.requireRole(['ADMIN', 'MODERATEUR']), 
  validateQueryParams, 
  signalementController.obtenirQueueModeration
);

// Statistiques de modération
router.get('/moderation/statistiques', 
  authMiddleware.requireAuth, 
  roleMiddleware.requireRole(['ADMIN']), 
  query('moderateurId').optional().isMongoId().withMessage('ID modérateur invalide'), 
  validateQueryParams, 
  signalementController.obtenirStatistiquesModeration
);

// Métriques temps réel
router.get('/moderation/metriques', 
  authMiddleware.requireAuth, 
  roleMiddleware.requireRole(['ADMIN', 'MODERATEUR']), 
  signalementController.obtenirMetriquesTempsReel
);

// Recherche de signalements
router.get('/recherche', 
  authMiddleware.requireAuth, 
  roleMiddleware.requireRole(['ADMIN', 'MODERATEUR']), 
  validateQueryParams, 
  query('q').optional().isLength({ min: 1 }).withMessage('Terme de recherche requis'), 
  query('motif').optional().isString(), 
  query('moderateurId').optional().isMongoId().withMessage('ID modérateur invalide'), 
  signalementController.rechercherSignalements
);

// Historique des signalements
router.get('/historique', 
  authMiddleware.requireAuth, 
  validateQueryParams, 
  query('userId').optional().isMongoId().withMessage('ID utilisateur invalide'), 
  signalementController.obtenirHistoriqueSignalements
);

// Mes signalements (utilisateur connecté)
router.get('/mes-signalements', 
  authMiddleware.requireAuth, 
  validateQueryParams, 
  (req, res, next) => { 
    req.query.userId = req.user._id.toString(); 
    next(); 
  }, 
  signalementController.obtenirHistoriqueSignalements
);

// Obtenir un signalement spécifique
router.get('/:id', 
  authMiddleware.requireAuth, 
  param('id').isMongoId().withMessage('ID signalement invalide'), 
  signalementController.obtenirSignalement
);

// Traiter un signalement
router.patch('/:id/traiter', 
  authMiddleware.requireAuth, 
  roleMiddleware.requireRole(['ADMIN', 'MODERATEUR']), 
  validateTraiterSignalement, 
  signalementController.traiterSignalement
);

// Assigner un modérateur
router.patch('/:id/assigner', 
  authMiddleware.requireAuth, 
  roleMiddleware.requireRole(['ADMIN']), 
  validateAssignerModerateur, 
  signalementController.assignerModerateur
);

// Classer un signalement sans suite
router.patch('/:id/classer', 
  authMiddleware.requireAuth, 
  roleMiddleware.requireRole(['ADMIN', 'MODERATEUR']), 
  validateClasserSignalement, 
  signalementController.classerSignalement
);

// Obtenir les signalements d'un utilisateur spécifique
router.get('/utilisateur/:userId', 
  authMiddleware.requireAuth, 
  roleMiddleware.requireRole(['ADMIN']), 
  param('userId').isMongoId().withMessage('ID utilisateur invalide'), 
  async (req, res, next) => {
    try {
      const signalements = await signalementController.obtenirSignalementsUtilisateur(req.params.userId);
      res.json({ success: true, data: { signalements } });
    } catch (error) {
      return next(AppError.serverError('Erreur serveur lors de la récupération des signalements', { originalError: error.message }));
    }
  }
);

// Vérifier si un utilisateur a des signalements en cours
router.get('/utilisateur/:userId/en-cours', 
  authMiddleware.requireAuth, 
  roleMiddleware.requireRole(['ADMIN', 'MODERATEUR']), 
  param('userId').isMongoId().withMessage('ID utilisateur invalide'), 
  async (req, res, next) => {
    try {
      const aSignalementsEnCours = await signalementController.verifierSignalementsEnCours(req.params.userId);
      res.json({ success: true, data: { aSignalementsEnCours } });
    } catch (error) {
      return next(AppError.serverError('Erreur serveur lors de la vérification', { originalError: error.message }));
    }
  }
);

// Maintenance : nettoyer les signalements expirés
router.delete('/maintenance/nettoyer-expires', 
  authMiddleware.requireAuth, 
  roleMiddleware.requireRole(['ADMIN']), 
  async (req, res, next) => {
    try {
      const nombreSupprimes = await signalementController.nettoyerSignalementsExpires();
      res.json({ success: true, message: 'Nettoyage effectué avec succès', data: { nombreSupprimes } });
    } catch (error) {
      return next(AppError.serverError('Erreur serveur lors du nettoyage', { originalError: error.message }));
    }
  }
);

// Maintenance : escalader les signalements urgents
router.post('/maintenance/escalader', 
  authMiddleware.requireAuth, 
  roleMiddleware.requireRole(['ADMIN']), 
  async (req, res, next) => {
    try {
      const nombreEscalades = await signalementController.escaladerSignalementsUrgents();
      res.json({ success: true, message: 'Escalade effectuée avec succès', data: { nombreEscalades } });
    } catch (error) {
      return next(AppError.serverError('Erreur serveur lors de l\'escalade', { originalError: error.message }));
    }
  }
);

// Export des données (fonctionnalité en développement)
router.get('/export', 
  authMiddleware.requireAuth, 
  roleMiddleware.requireRole(['ADMIN']), 
  validateQueryParams, 
  query('format').optional().isIn(['json', 'csv']).withMessage('Format invalide'), 
  async (req, res, next) => {
    try {
      res.json({ success: true, message: 'Fonctionnalité d\'export en cours de développement', data: {} });
    } catch (error) {
      return next(AppError.serverError('Erreur serveur lors de l\'export', { originalError: error.message }));
    }
  }
);

// Middleware de gestion d'erreurs spécifique
router.use((error, req, res, next) => {
  console.error('Erreur dans les routes signalements:', error);

  // Les erreurs Multer sont maintenant gérées dans le controller
  // mais on garde une sécurité au cas où
  if (error.message && error.message.includes('Type de fichier non autorisé')) {
    return res.status(400).json({ 
      success: false, 
      message: 'Type de fichier non autorisé. Formats acceptés: JPEG, PNG, GIF, PDF, MP4, MOV', 
      code: 'INVALID_FILE_TYPE' 
    });
  }

  return next(error);
});

module.exports = router;