const express = require('express');
const router = express.Router();
const { body, param, query } = require('express-validator');
const multer = require('multer');

// Contrôleur et middlewares
const signalementController = require('../controllers/signalementController');
const authMiddleware = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');

// Middleware Multer pour gérer les fichiers
const upload = multer({
  limits: {
    fileSize: 10 * 1024 * 1024, // Limite de 10MB
    files: 5 // Limite de 5 fichiers
  },
  fileFilter: (req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/gif', 'application/pdf', 'video/mp4', 'video/quicktime'].includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Type de fichier non autorisé pour les preuves'));
    }
  }
});

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
router.post('/', authMiddleware.requireAuth, upload.array('preuves'), validateCreateSignalement, signalementController.creerSignalement);
router.post('/preuves', authMiddleware.requireAuth, upload.array('preuves'), body('signalementId').isMongoId().withMessage('ID signalement invalide'), signalementController.uploaderPreuves);
router.get('/moderation/queue', authMiddleware.requireAuth, roleMiddleware.requireRole(['ADMIN', 'MODERATEUR']), validateQueryParams, signalementController.obtenirQueueModeration);
router.get('/moderation/statistiques', authMiddleware.requireAuth, roleMiddleware.requireRole(['ADMIN']), query('moderateurId').optional().isMongoId().withMessage('ID modérateur invalide'), validateQueryParams, signalementController.obtenirStatistiquesModeration);
router.get('/moderation/metriques', authMiddleware.requireAuth, roleMiddleware.requireRole(['ADMIN', 'MODERATEUR']), signalementController.obtenirMetriquesTempsReel);
router.get('/recherche', authMiddleware.requireAuth, roleMiddleware.requireRole(['ADMIN', 'MODERATEUR']), validateQueryParams, query('q').optional().isLength({ min: 1 }).withMessage('Terme de recherche requis'), query('motif').optional().isString(), query('moderateurId').optional().isMongoId().withMessage('ID modérateur invalide'), signalementController.rechercherSignalements);
router.get('/historique', authMiddleware.requireAuth, validateQueryParams, query('userId').optional().isMongoId().withMessage('ID utilisateur invalide'), signalementController.obtenirHistoriqueSignalements);
router.get('/mes-signalements', authMiddleware.requireAuth, validateQueryParams, (req, res, next) => { req.query.userId = req.user._id.toString(); next(); }, signalementController.obtenirHistoriqueSignalements);
router.get('/:id', authMiddleware.requireAuth, param('id').isMongoId().withMessage('ID signalement invalide'), signalementController.obtenirSignalement);
router.patch('/:id/traiter', authMiddleware.requireAuth, roleMiddleware.requireRole(['ADMIN', 'MODERATEUR']), validateTraiterSignalement, signalementController.traiterSignalement);
router.patch('/:id/assigner', authMiddleware.requireAuth, roleMiddleware.requireRole(['ADMIN']), validateAssignerModerateur, signalementController.assignerModerateur);
router.patch('/:id/classer', authMiddleware.requireAuth, roleMiddleware.requireRole(['ADMIN', 'MODERATEUR']), validateClasserSignalement, signalementController.classerSignalement);
router.get('/utilisateur/:userId', authMiddleware.requireAuth, roleMiddleware.requireRole(['ADMIN']), param('userId').isMongoId().withMessage('ID utilisateur invalide'), async (req, res) => {
  try {
    const signalements = await signalementController.obtenirSignalementsUtilisateur(req.params.userId);
    res.json({ success: true, data: { signalements } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur lors de la récupération des signalements', code: 'INTERNAL_ERROR' });
  }
});
router.get('/utilisateur/:userId/en-cours', authMiddleware.requireAuth, roleMiddleware.requireRole(['ADMIN', 'MODERATEUR']), param('userId').isMongoId().withMessage('ID utilisateur invalide'), async (req, res) => {
  try {
    const aSignalementsEnCours = await signalementController.verifierSignalementsEnCours(req.params.userId);
    res.json({ success: true, data: { aSignalementsEnCours } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur lors de la vérification', code: 'INTERNAL_ERROR' });
  }
});
router.delete('/maintenance/nettoyer-expires', authMiddleware.requireAuth, roleMiddleware.requireRole(['ADMIN']), async (req, res) => {
  try {
    const nombreSupprimes = await signalementController.nettoyerSignalementsExpires();
    res.json({ success: true, message: 'Nettoyage effectué avec succès', data: { nombreSupprimes } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur lors du nettoyage', code: 'INTERNAL_ERROR' });
  }
});
router.post('/maintenance/escalader', authMiddleware.requireAuth, roleMiddleware.requireRole(['ADMIN']), async (req, res) => {
  try {
    const nombreEscalades = await signalementController.escaladerSignalementsUrgents();
    res.json({ success: true, message: 'Escalade effectuée avec succès', data: { nombreEscalades } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur lors de l\'escalade', code: 'INTERNAL_ERROR' });
  }
});
router.get('/export', authMiddleware.requireAuth, roleMiddleware.requireRole(['ADMIN']), validateQueryParams, query('format').optional().isIn(['json', 'csv']).withMessage('Format invalide'), async (req, res) => {
  try {
    res.json({ success: true, message: 'Fonctionnalité d\'export en cours de développement', data: {} });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur lors de l\'export', code: 'INTERNAL_ERROR' });
  }
});

// Middleware de gestion d'erreurs spécifique
router.use((error, req, res, _next) => {
  console.error('Erreur dans les routes signalements:', error);

  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, message: 'Fichier trop volumineux (maximum 10MB)', code: 'FILE_TOO_LARGE' });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ success: false, message: 'Trop de fichiers (maximum 5)', code: 'TOO_MANY_FILES' });
    }
    return res.status(400).json({ success: false, message: 'Erreur de traitement de fichier', code: 'FILE_ERROR' });
  }

  if (error.message === 'Type de fichier non autorisé pour les preuves') {
    return res.status(400).json({ success: false, message: 'Type de fichier non autorisé. Formats acceptés: JPEG, PNG, GIF, PDF, MP4, MOV', code: 'INVALID_FILE_TYPE' });
  }

  res.status(500).json({ success: false, message: 'Erreur interne du serveur', code: 'INTERNAL_ERROR' });
});

module.exports = router;
