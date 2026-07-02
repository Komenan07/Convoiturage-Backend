// =====================================================
// ROUTES ADMINISTRATEUR 
// =====================================================

const express = require('express');
const { body, query, param } = require('express-validator');
const router = express.Router();

// Import du middleware d'authentification admin dédié
const {
  protectAdmin,
  authorize,
  logSensitiveAction,
  preventSelfModification,
  preventModifyingSuperAdmin
} = require('../middlewares/adminAuthMiddleware');

// Import sécurisé du rate limiter
let rateLimiterModule;
try {
  rateLimiterModule = require('../middlewares/rateLimiter');
  console.log('✅ Rate limiter chargé avec succès');
} catch (error) {
  console.warn('⚠️ Middleware rateLimiter non trouvé, utilisation des fallbacks');
  rateLimiterModule = {
    rateLimiters: { auth: {}, admin: {} },
    globalRateLimit: null,
    apiLimiterByRole: null,
    createCustomLimiter: null
  };
}
// ✅ Déstructuration correcte des exports
const { 
  rateLimiters = {},
  globalRateLimit,
  apiLimiterByRole
} = rateLimiterModule;

// Import sécurisé du contrôleur admin
let adminController = {};
try {
  adminController = require('../controllers/adminController');
} catch (error) {
  console.warn('⚠️ Contrôleur adminController non trouvé, utilisation des méthodes par défaut');
}

const {
  connexionAdmin,
  obtenirProfil,
  creerAdmin,
  listerAdmins,
  obtenirAdminParId,
  modifierAdmin,
  changerStatutAdmin,
  desactiverAdmin,
  obtenirDashboard,
  obtenirStatistiques,
  feedAdmin,
  validerPassageConducteur, 
  listerDemandesPassageConducteur  ,
  // Gestion Trajets
  listerTrajets,
  obtenirTrajet,
  obtenirReservationsTrajet,
  annulerTrajet,
  supprimerTrajet,
  // Gestion Utilisateurs
  listerUtilisateurs,
  obtenirUtilisateur,
  obtenirStatistiquesUtilisateur,
  obtenirTrajetsUtilisateur,
  obtenirReservationsUtilisateur,
  obtenirVehiculesUtilisateur,
  suspendreUtilisateur,
  activerUtilisateur,
  supprimerUtilisateur,
  exporterUtilisateurs,
  // Gestion Réservations
  listerReservations,
  obtenirReservation,
  confirmerReservation,
  annulerReservation,
  // Gestion Paiements
  listerPaiements,
  obtenirPaiement,
  rembourserPaiement,
  obtenirStatistiquesPaiements,
  // Gestion Commissions
  obtenirStatistiquesCommissions,
  traiterCommissionsEnEchec,
  obtenirDetailCommission,
  genererRapportCommissions,
  surveillerCommissions,
  exporterPaiements,
  
 // Gestion Recharges
  obtenirStatistiquesRecharges,
  traiterRechargesEnAttente,

  // Gestion Signalements
  listerSignalements,
  obtenirSignalement,
  traiterSignalement,
  marquerPrioritaire,
  // Gestion Événements
  listerEvenements,
  creerEvenement,
  obtenirEvenement,
  obtenirParticipantsEvenement,
  modifierEvenement,
  annulerEvenement,
  supprimerEvenement,
  // Gestion Évaluations
  listerEvaluations,
  obtenirEvaluation,
  masquerEvaluation, 
  demasquerEvaluation, 
  supprimerEvaluation,
  signalerEvaluation,
  detecterEvaluationsSuspectes,
  obtenirStatistiquesEvaluations,
  obtenirMeilleuresEvaluations,
  obtenirStatsPourBadges, 
  recalculerScoreConfiance, 
  // Gestion Alertes
  listerAlertes,
  obtenirAlerte,
  traiterAlerte,
  contacterAlerte,
  cloturerAlerte,
  // Gestion Véhicules 
  listerVehiculesAdmin,
  obtenirVehiculeAdmin,
  obtenirProprietaireVehicule,
  validerVehiculeAdmin,
  rejeterVehiculeAdmin,
  obtenirStatistiquesVehiculesAdmin
} = adminController;

// =====================================================
// CONSTANTES - PERMISSIONS VALIDES
// =====================================================

const PERMISSIONS_VALIDES = [
  // Permissions système
  'ALL',
  
  // Gestion des utilisateurs
  'GESTION_UTILISATEURS',
  'GESTION_CONDUCTEURS',        
  'GESTION_PASSAGERS',
  'GESTION_ADMINS',
  
  // Vérification et modération
  'VERIFICATION_DOCUMENTS',
  'VERIFICATION_IDENTITE',
  'GESTION_VEHICULES', 
  'MODERATION_CONTENUS',
  'MODERATION',
  
  // Gestion des trajets et réservations
  'GESTION_TRAJETS',
  'GESTION_RESERVATIONS',
  'ANNULATION_TRAJETS',
  
  // Gestion financière
  'GESTION_PAIEMENTS',
  'RAPPORTS_FINANCIERS',
  'GESTION_COMMISSIONS',
  'REMBOURSEMENTS',
  
  // Support et assistance
  'SUPPORT_CLIENT',
  'GESTION_RECLAMATIONS',
  'CHAT_SUPPORT',
  
  // Analytics et rapports
  'ANALYTICS',
  'RAPPORTS_DETAILLES',
  'EXPORT_DONNEES',
  
  // Configuration
  'CONFIGURATION_SYSTEME',
  'GESTION_NOTIFICATIONS',
  'GESTION_TARIFS'
];

// === FONCTIONS HELPER SÉCURISÉES ===

const creerMiddlewareParDefaut = (nom) => {
  return (req, res, next) => {
    console.warn(`⚠️ Middleware ${nom} non disponible, passage à l'étape suivante`);
    next();
  };
};

const creerControleurParDefaut = (nomMethode, message = null) => {
  return (req, res) => {
    res.status(501).json({
      success: false,
      message: message || `Méthode ${nomMethode} non implémentée dans le contrôleur admin`,
      info: 'Cette fonctionnalité sera disponible dans une future version'
    });
  };
};

// Middlewares sécurisés
const middlewareAuth = protectAdmin;

const middlewareAuthorize = (roles = [], permissions = []) => {
  return authorize(roles, permissions);
};

const middlewareLogSensitiveAction = (action) => {
  return logSensitiveAction(action);
};

const middlewareRateLimit = (type) => {
  // Support des types utilisés dans ce fichier
  const map = {
    // Auth
    'auth': rateLimiters?.auth?.login,
    'login': rateLimiters?.auth?.login,
    'register': rateLimiters?.auth?.register,
    
    // Standard
    'standard': apiLimiterByRole || globalRateLimit,
    'api': apiLimiterByRole || globalRateLimit,
    
    // Reporting
    'reporting': rateLimiters?.admin?.reports || apiLimiterByRole || globalRateLimit,
    'reports': rateLimiters?.admin?.reports || apiLimiterByRole || globalRateLimit,
    
    // Admin
    'admin': rateLimiters?.admin?.actions || globalRateLimit,
    'admin_actions': rateLimiters?.admin?.actions || globalRateLimit
  };
  const limiter = map[type];
  if (!limiter) {
    return creerMiddlewareParDefaut(`rateLimit.${type}`);
  }
  return limiter;
};

// =====================================================
// VALIDATIONS
// =====================================================

// Validation pour la connexion
const validationConnexion = [
  body('email')
    .isEmail()
    .withMessage('Format d\'email invalide')
    .normalizeEmail(),
  body('motDePasse')
    .notEmpty()
    .withMessage('Le mot de passe est requis')
    .isLength({ min: 6 })
    .withMessage('Le mot de passe doit contenir au moins 6 caractères')
];

// Validation pour la création d'admin
const validationCreationAdmin = [
  body('email')
    .isEmail()
    .withMessage('Format d\'email invalide')
    .normalizeEmail(),
  body('motDePasse')
    .isLength({ min: 8 })
    .withMessage('Le mot de passe doit contenir au moins 8 caractères')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Le mot de passe doit contenir au moins une majuscule, une minuscule, un chiffre et un caractère spécial'),
  body('nom')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Le nom doit contenir entre 2 et 50 caractères')
    .matches(/^[a-zA-ZÀ-ÿ\s'-]+$/)
    .withMessage('Le nom ne peut contenir que des lettres, espaces, apostrophes et tirets'),
  body('prenom')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Le prénom doit contenir entre 2 et 50 caractères')
    .matches(/^[a-zA-ZÀ-ÿ\s'-]+$/)
    .withMessage('Le prénom ne peut contenir que des lettres, espaces, apostrophes et tirets'),
  body('role')
    .optional()
    .isIn(['SUPER_ADMIN', 'MODERATEUR', 'SUPPORT'])
    .withMessage('Rôle invalide'),
  body('permissions')
    .optional()
    .isArray()
    .withMessage('Les permissions doivent être un tableau'),
  body('permissions.*')
    .optional()
    .isIn(PERMISSIONS_VALIDES)
    .withMessage('Permission invalide')
];

// Validation pour la modification d'admin
const validationModificationAdmin = [
  body('nom')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Le nom doit contenir entre 2 et 50 caractères')
    .matches(/^[a-zA-ZÀ-ÿ\s'-]+$/)
    .withMessage('Le nom ne peut contenir que des lettres, espaces, apostrophes et tirets'),
  body('prenom')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Le prénom doit contenir entre 2 et 50 caractères')
    .matches(/^[a-zA-ZÀ-ÿ\s'-]+$/)
    .withMessage('Le prénom ne peut contenir que des lettres, espaces, apostrophes et tirets'),
  body('role')
    .optional()
    .isIn(['SUPER_ADMIN', 'MODERATEUR', 'SUPPORT'])
    .withMessage('Rôle invalide'),
  body('permissions')
    .optional()
    .isArray()
    .withMessage('Les permissions doivent être un tableau'),
  body('permissions.*')
    .optional()
    .isIn(PERMISSIONS_VALIDES)
    .withMessage('Permission invalide'),
  body('statutCompte')
    .optional()
    .isIn(['ACTIF', 'SUSPENDU'])
    .withMessage('Statut de compte invalide')
];

// Validation pour le changement de statut
const validationChangementStatut = [
  body('statutCompte')
    .isIn(['ACTIF', 'SUSPENDU'])
    .withMessage('Statut invalide')
];

// Validation des paramètres de recherche
const validationRechercheAdmins = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('La page doit être un entier positif'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('La limite doit être entre 1 et 100'),
  query('sort')
    .optional()
    .isIn(['createdAt', '-createdAt', 'nom', '-nom', 'email', '-email', 'role', '-role'])
    .withMessage('Critère de tri invalide'),
  query('role')
    .optional()
    .isIn(['SUPER_ADMIN', 'MODERATEUR', 'SUPPORT'])
    .withMessage('Rôle invalide'),
  query('statutCompte')
    .optional()
    .isIn(['ACTIF', 'SUSPENDU'])
    .withMessage('Statut invalide'),
  query('dateDebut')
    .optional()
    .isISO8601()
    .withMessage('Format de date invalide'),
  query('dateFin')
    .optional()
    .isISO8601()
    .withMessage('Format de date invalide')
];

// Validation des paramètres d'ID
const validationId = [
  param('id')
    .matches(/^[0-9a-fA-F]{24}$/)
    .withMessage('ID MongoDB invalide')
];
// ✅ Ajout validation pour utilisateurId
const validationUtilisateurId = [
  param('utilisateurId')
    .matches(/^[0-9a-fA-F]{24}$/)
    .withMessage('ID utilisateur MongoDB invalide')
];

// ✅  Ajout validation pour validation passage conducteur
const validationPassageConducteur = [
  body('approuve')
    .isBoolean()
    .withMessage('Le champ approuve doit être un booléen'),
  body('commentaire')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Le commentaire ne peut dépasser 500 caractères')
];
// Validation pour les statistiques
const validationStatistiques = [
  query('periode')
    .optional()
    .isInt({ min: 1, max: 365 })
    .withMessage('La période doit être entre 1 et 365 jours')
];

// =====================================================
// MIDDLEWARES DE PERMISSIONS
// =====================================================

// Middleware pour vérifier les permissions spécifiques
const verifierPermissionGestionAdmins = middlewareAuthorize(['SUPER_ADMIN'], ['ALL', 'GESTION_UTILISATEURS', 'GESTION_ADMINS']);
const verifierPermissionAnalytics = middlewareAuthorize(['SUPER_ADMIN', 'MODERATEUR'], ['ALL', 'ANALYTICS']);
const verifierPermissionSuperAdmin = middlewareAuthorize(['SUPER_ADMIN'], ['ALL']);
const verifierPermissionGestionConducteurs = middlewareAuthorize(['SUPER_ADMIN', 'MODERATEUR'], ['ALL', 'GESTION_CONDUCTEURS', 'GESTION_UTILISATEURS']);

// =====================================================
// ROUTES D'AUTHENTIFICATION
// =====================================================

/**
 * @route   POST /api/admin/login
 * @desc    Connexion administrateur
 * @access  Public
 */
router.post('/login', 
  middlewareRateLimit('auth'),
  validationConnexion,
  middlewareLogSensitiveAction('ADMIN_LOGIN_ATTEMPT'),
  connexionAdmin || creerControleurParDefaut('connexionAdmin')
);

/**
 * @route   GET /api/admin/auth/profil
 * @desc    Obtenir le profil de l'admin connecté
 * @access  Private (Admin)
 */
router.get('/auth/profil',
  middlewareAuth,
  obtenirProfil || creerControleurParDefaut('obtenirProfil')
);

/**
 * @route   POST /api/admin/feed
 * @desc    Créer l'administrateur principal (seed)
 * @access  Public
 */
router.post('/feed', feedAdmin || creerControleurParDefaut('feedAdmin'));

// =====================================================
// ROUTES CRUD ADMINISTRATEURS
// =====================================================

/**
 * @route   POST /api/admin/admins
 * @desc    Créer un nouvel administrateur
 * @access  Private (Super Admin)
 */
router.post('/admins',
  middlewareAuth,
  middlewareRateLimit('standard'),
  verifierPermissionSuperAdmin,
  validationCreationAdmin,
  middlewareLogSensitiveAction('ADMIN_CREATE'),
  creerAdmin || creerControleurParDefaut('creerAdmin')
);

/**
 * @route   GET /api/admin/admins
 * @desc    Obtenir la liste des administrateurs
 * @access  Private (Admin avec permission GESTION_UTILISATEURS)
 */
router.get('/admins',
  middlewareAuth,
  middlewareRateLimit('standard'),
  verifierPermissionGestionAdmins,
  validationRechercheAdmins,
  listerAdmins || creerControleurParDefaut('listerAdmins')
);

/**
 * @route   GET /api/admin/admins/:id
 * @desc    Obtenir un administrateur par ID
 * @access  Private (Admin avec permission GESTION_UTILISATEURS)
 */
router.get('/admins/:id',
  middlewareAuth,
  middlewareRateLimit('standard'),
  verifierPermissionGestionAdmins,
  validationId,
  obtenirAdminParId || creerControleurParDefaut('obtenirAdminParId')
);

/**
 * @route   GET /api/admin/demandes-conducteur
 * @desc    Lister les demandes de passage conducteur en attente
 * @access  Private (Admin avec permission GESTION_CONDUCTEURS)
 */
router.get('/demandes-conducteur',
  middlewareAuth,
  middlewareRateLimit('standard'),
  verifierPermissionGestionConducteurs,
  middlewareLogSensitiveAction('DEMANDES_CONDUCTEUR_LIST'),
  listerDemandesPassageConducteur || creerControleurParDefaut('listerDemandesPassageConducteur')
);

/**
 * @route   PATCH /api/admin/demandes-conducteur/:utilisateurId/valider
 * @desc    Valider ou refuser une demande de passage conducteur
 * @access  Private (Admin avec permission GESTION_CONDUCTEURS)
 */
router.patch('/demandes-conducteur/:utilisateurId/valider',
  middlewareAuth,
  middlewareRateLimit('standard'),
  verifierPermissionGestionConducteurs,
  validationUtilisateurId,
  validationPassageConducteur,
  middlewareLogSensitiveAction('DEMANDE_CONDUCTEUR_VALIDATION'),
  validerPassageConducteur || creerControleurParDefaut('validerPassageConducteur')
);

/**
 * @route   PUT /api/admin/admins/:id
 * @desc    Modifier un administrateur
 * @access  Private (Super Admin)
 */
router.put('/admins/:id',
  middlewareAuth,
  middlewareRateLimit('standard'),
  verifierPermissionSuperAdmin,
  preventSelfModification,
  preventModifyingSuperAdmin,
  validationId,
  validationModificationAdmin,
  middlewareLogSensitiveAction('ADMIN_UPDATE'),
  modifierAdmin || creerControleurParDefaut('modifierAdmin')
);

/**
 * @route   PATCH /api/admin/admins/:id/statut
 * @desc    Changer le statut d'un administrateur
 * @access  Private (Super Admin)
 */
router.patch('/admins/:id/statut',
  middlewareAuth,
  middlewareRateLimit('standard'),
  verifierPermissionSuperAdmin,
  preventSelfModification,
  preventModifyingSuperAdmin,
  validationId,
  validationChangementStatut,
  middlewareLogSensitiveAction('ADMIN_STATUS_CHANGE'),
  changerStatutAdmin || creerControleurParDefaut('changerStatutAdmin')
);

/**
 * @route   DELETE /api/admin/admins/:id
 * @desc    Désactiver un administrateur
 * @access  Private (Super Admin)
 */
router.delete('/admins/:id',
  middlewareAuth,
  middlewareRateLimit('standard'),
  verifierPermissionSuperAdmin,
  preventSelfModification,
  preventModifyingSuperAdmin,
  validationId,
  middlewareLogSensitiveAction('ADMIN_DELETE'),
  desactiverAdmin || creerControleurParDefaut('desactiverAdmin')
);

// =====================================================
// ROUTES ANALYTICS ET DASHBOARD
// =====================================================

/**
 * @route   GET /api/admin/dashboard
 * @desc    Obtenir le dashboard analytics
 * @access  Private (Admin avec permission ANALYTICS)
 */
router.get('/dashboard',
  middlewareAuth,
  middlewareRateLimit('standard'),
  verifierPermissionAnalytics,
  obtenirDashboard || creerControleurParDefaut('obtenirDashboard')
);

/**
 * @route   GET /api/admin/statistiques
 * @desc    Obtenir les statistiques détaillées
 * @access  Private (Admin avec permission ANALYTICS)
 */
router.get('/statistiques',
  middlewareAuth,
  middlewareRateLimit('reporting'),
  verifierPermissionAnalytics,
  validationStatistiques,
  obtenirStatistiques || creerControleurParDefaut('obtenirStatistiques')
);

// =====================================================
// ROUTES DE GESTION DES TRAJETS
// =====================================================

/**
 * @route   GET /api/admin/trajets
 * @desc    Lister tous les trajets
 * @access  Private (Admin avec permission GESTION_TRAJETS)
 */
router.get('/trajets',
  middlewareAuth,
  middlewareRateLimit('standard'),
  middlewareAuthorize(['SUPER_ADMIN', 'MODERATEUR'], ['ALL', 'GESTION_TRAJETS']),
  listerTrajets || creerControleurParDefaut('listerTrajets')
);

/**
 * @route   GET /api/admin/trajets/:id
 * @desc    Obtenir les détails d'un trajet
 * @access  Private (Admin)
 */
router.get('/trajets/:id',
  middlewareAuth,
  middlewareRateLimit('standard'),
  validationId,
  obtenirTrajet || creerControleurParDefaut('obtenirTrajet')
);

/**
 * @route   GET /api/admin/trajets/:id/reservations
 * @desc    Obtenir les réservations d'un trajet
 * @access  Private (Admin)
 */
router.get('/trajets/:id/reservations',
  middlewareAuth,
  middlewareRateLimit('standard'),
  validationId,
  obtenirReservationsTrajet || creerControleurParDefaut('obtenirReservationsTrajet')
);

/**
 * @route   POST /api/admin/trajets/:id/annuler
 * @desc    Annuler un trajet
 * @access  Private (Admin avec permission ANNULATION_TRAJETS)
 */
router.post('/trajets/:id/annuler',
  middlewareAuth,
  middlewareRateLimit('standard'),
  middlewareAuthorize(['SUPER_ADMIN', 'MODERATEUR'], ['ALL', 'ANNULATION_TRAJETS']),
  validationId,
  [
    body('motif')
      .notEmpty()
      .isLength({ min: 10 })
      .withMessage('Le motif doit contenir au moins 10 caractères')
  ],
  middlewareLogSensitiveAction('TRAJET_ANNULATION'),
  annulerTrajet || creerControleurParDefaut('annulerTrajet')
);

/**
 * @route   DELETE /api/admin/trajets/:id
 * @desc    Supprimer un trajet
 * @access  Private (Admin)
 */
router.delete('/trajets/:id',
  middlewareAuth,
  middlewareRateLimit('standard'),
  middlewareAuthorize(['SUPER_ADMIN'], ['ALL']),
  validationId,
  middlewareLogSensitiveAction('TRAJET_SUPPRESSION'),
  supprimerTrajet || creerControleurParDefaut('supprimerTrajet')
);

// =====================================================
// ROUTES DE GESTION DES UTILISATEURS
// =====================================================

/**
 * @route   GET /api/admin/utilisateurs
 * @desc    Lister tous les utilisateurs
 * @access  Private (Admin avec permission GESTION_UTILISATEURS)
 */
router.get('/utilisateurs',
  middlewareAuth,
  middlewareRateLimit('standard'),
  verifierPermissionGestionAdmins,
  listerUtilisateurs || creerControleurParDefaut('listerUtilisateurs')
);

/**
 * @route   GET /api/admin/utilisateurs/export
 * @desc    Exporter les utilisateurs
 * @access  Private (Admin avec permission EXPORT_DONNEES)
 */
router.get('/utilisateurs/export',
  middlewareAuth,
  middlewareRateLimit('standard'),
  middlewareAuthorize(['SUPER_ADMIN', 'MODERATEUR'], ['ALL', 'EXPORT_DONNEES']),
  middlewareLogSensitiveAction('EXPORT_UTILISATEURS'),
  exporterUtilisateurs || creerControleurParDefaut('exporterUtilisateurs')
);

/**
 * @route   GET /api/admin/utilisateurs/:id
 * @desc    Obtenir les détails d'un utilisateur
 * @access  Private (Admin)
 */
router.get('/utilisateurs/:id',
  middlewareAuth,
  middlewareRateLimit('standard'),
  validationId,
  obtenirUtilisateur || creerControleurParDefaut('obtenirUtilisateur')
);

/**
 * @route   GET /api/admin/utilisateurs/:id/statistiques
 * @desc    Obtenir les statistiques d'un utilisateur
 * @access  Private (Admin)
 */
router.get('/utilisateurs/:id/statistiques',
  middlewareAuth,
  middlewareRateLimit('standard'),
  validationId,
  obtenirStatistiquesUtilisateur || creerControleurParDefaut('obtenirStatistiquesUtilisateur')
);

/**
 * @route   GET /api/admin/utilisateurs/:id/trajets
 * @desc    Obtenir les trajets d'un utilisateur
 * @access  Private (Admin)
 */
router.get('/utilisateurs/:id/trajets',
  middlewareAuth,
  middlewareRateLimit('standard'),
  validationId,
  obtenirTrajetsUtilisateur || creerControleurParDefaut('obtenirTrajetsUtilisateur')
);

/**
 * @route   GET /api/admin/utilisateurs/:id/reservations
 * @desc    Obtenir les réservations d'un utilisateur
 * @access  Private (Admin)
 */
router.get('/utilisateurs/:id/reservations',
  middlewareAuth,
  middlewareRateLimit('standard'),
  validationId,
  obtenirReservationsUtilisateur || creerControleurParDefaut('obtenirReservationsUtilisateur')
);

/**
 * @route   GET /api/admin/utilisateurs/:id/vehicules
 * @desc    Obtenir les véhicules d'un utilisateur
 * @access  Private (Admin)
 */
router.get('/utilisateurs/:id/vehicules',
  middlewareAuth,
  middlewareRateLimit('standard'),
  validationId,
  obtenirVehiculesUtilisateur || creerControleurParDefaut('obtenirVehiculesUtilisateur')
);

/**
 * @route   POST /api/admin/utilisateurs/:id/suspendre
 * @desc    Suspendre un utilisateur
 * @access  Private (Admin avec permission MODERATION)
 */
router.post('/utilisateurs/:id/suspendre',
  middlewareAuth,
  middlewareRateLimit('standard'),
  middlewareAuthorize(['SUPER_ADMIN', 'MODERATEUR'], ['ALL', 'MODERATION']),
  validationId,
  [
    body('motif')
      .notEmpty()
      .isLength({ min: 10 })
      .withMessage('Le motif doit contenir au moins 10 caractères'),
    body('duree')
      .optional()
      .isInt({ min: 1 })
      .withMessage('La durée doit être un nombre de jours positif')
  ],
  middlewareLogSensitiveAction('USER_SUSPENSION'),
  suspendreUtilisateur || creerControleurParDefaut('suspendreUtilisateur')
);

/**
 * @route   POST /api/admin/utilisateurs/:id/activer
 * @desc    Activer/Réactiver un utilisateur
 * @access  Private (Admin avec permission MODERATION)
 */
router.post('/utilisateurs/:id/activer',
  middlewareAuth,
  middlewareRateLimit('standard'),
  middlewareAuthorize(['SUPER_ADMIN', 'MODERATEUR'], ['ALL', 'MODERATION']),
  validationId,
  middlewareLogSensitiveAction('USER_ACTIVATION'),
  activerUtilisateur || creerControleurParDefaut('activerUtilisateur')
);

/**
 * @route   DELETE /api/admin/utilisateurs/:id
 * @desc    Supprimer un utilisateur
 * @access  Private (Admin)
 */
router.delete('/utilisateurs/:id',
  middlewareAuth,
  middlewareRateLimit('standard'),
  middlewareAuthorize(['SUPER_ADMIN'], ['ALL']),
  validationId,
  middlewareLogSensitiveAction('USER_SUPPRESSION'),
  supprimerUtilisateur || creerControleurParDefaut('supprimerUtilisateur')
);

// =====================================================
// ROUTES DE GESTION DES RÉSERVATIONS
// =====================================================

/**
 * @route   GET /api/admin/reservations
 * @desc    Lister toutes les réservations
 * @access  Private (Admin avec permission GESTION_RESERVATIONS)
 */
router.get('/reservations',
  middlewareAuth,
  middlewareRateLimit('standard'),
  middlewareAuthorize(['SUPER_ADMIN', 'MODERATEUR'], ['ALL', 'GESTION_RESERVATIONS']),
  listerReservations || creerControleurParDefaut('listerReservations')
);

/**
 * @route   GET /api/admin/reservations/:id
 * @desc    Obtenir les détails d'une réservation
 * @access  Private (Admin)
 */
router.get('/reservations/:id',
  middlewareAuth,
  middlewareRateLimit('standard'),
  validationId,
  obtenirReservation || creerControleurParDefaut('obtenirReservation')
);

/**
 * @route   POST /api/admin/reservations/:id/confirmer
 * @desc    Confirmer une réservation
 * @access  Private (Admin)
 */
router.post('/reservations/:id/confirmer',
  middlewareAuth,
  middlewareRateLimit('standard'),
  middlewareAuthorize(['SUPER_ADMIN', 'MODERATEUR'], ['ALL', 'GESTION_RESERVATIONS']),
  validationId,
  middlewareLogSensitiveAction('RESERVATION_CONFIRMATION'),
  confirmerReservation || creerControleurParDefaut('confirmerReservation')
);

/**
 * @route   POST /api/admin/reservations/:id/annuler
 * @desc    Annuler une réservation
 * @access  Private (Admin)
 */
router.post('/reservations/:id/annuler',
  middlewareAuth,
  middlewareRateLimit('standard'),
  middlewareAuthorize(['SUPER_ADMIN', 'MODERATEUR'], ['ALL', 'GESTION_RESERVATIONS']),
  validationId,
  [
    body('motif')
      .notEmpty()
      .isLength({ min: 10 })
      .withMessage('Le motif doit contenir au moins 10 caractères')
  ],
  middlewareLogSensitiveAction('RESERVATION_ANNULATION'),
  annulerReservation || creerControleurParDefaut('annulerReservation')
);

// =====================================================
// ROUTES DE GESTION DES PAIEMENTS
// =====================================================

/**
 * @route   GET /api/admin/paiements/statistiques
 * @desc    Obtenir les statistiques des paiements
 * @access  Private (Admin avec permission RAPPORTS_FINANCIERS)
 */
router.get('/paiements/statistiques',
  middlewareAuth,
  middlewareRateLimit('reporting'),
  middlewareAuthorize(['SUPER_ADMIN', 'MODERATEUR'], ['ALL', 'RAPPORTS_FINANCIERS']),
  obtenirStatistiquesPaiements || creerControleurParDefaut('obtenirStatistiquesPaiements')
);

/**
 * @route   GET /api/admin/paiements/commissions/statistiques
 * @desc    Statistiques détaillées des commissions
 * @access  Private (Admin avec permission ANALYTICS)
 */
router.get(
  '/paiements/commissions/statistiques',
  middlewareAuth,
  middlewareRateLimit('reporting'),
  middlewareAuthorize(['SUPER_ADMIN', 'MODERATEUR'], ['ALL', 'ANALYTICS', 'GESTION_PAIEMENTS']),
  obtenirStatistiquesCommissions || creerControleurParDefaut('obtenirStatistiquesCommissions')
);

/**
 * @route   POST /api/admin/paiements/commissions/traiter-echecs
 * @desc    Traiter les commissions en échec
 * @access  Private (Admin avec permission GESTION_PAIEMENTS)
 */
router.post(
  '/paiements/commissions/traiter-echecs',
  middlewareAuth,
  middlewareRateLimit('standard'),
  middlewareAuthorize(['SUPER_ADMIN', 'MODERATEUR'], ['ALL', 'GESTION_PAIEMENTS']),
  middlewareLogSensitiveAction('COMMISSIONS_TRAITER_ECHECS'),
  traiterCommissionsEnEchec || creerControleurParDefaut('traiterCommissionsEnEchec')
);

/**
 * @route   GET /api/admin/paiements/:paiementId/commission
 * @desc    Détails d'une commission spécifique
 * @access  Private (Admin)
 */
router.get(
  '/paiements/:paiementId/commission',
  middlewareAuth,
  middlewareRateLimit('standard'),
  param('paiementId').matches(/^[0-9a-fA-F]{24}$/).withMessage('ID paiement invalide'),
  obtenirDetailCommission || creerControleurParDefaut('obtenirDetailCommission')
);

/**
 * @route   GET /api/admin/paiements/commissions/rapport
 * @desc    Générer un rapport des commissions
 * @access  Private (Admin avec permission ANALYTICS)
 */
router.get(
  '/paiements/commissions/rapport',
  middlewareAuth,
  middlewareRateLimit('reporting'),
  middlewareAuthorize(['SUPER_ADMIN', 'MODERATEUR'], ['ALL', 'ANALYTICS']),
  middlewareLogSensitiveAction('RAPPORT_COMMISSIONS_GENERATION'),
  genererRapportCommissions || creerControleurParDefaut('genererRapportCommissions')
);

/**
 * @route   GET /api/admin/paiements/commissions/surveiller
 * @desc    Surveillance en temps réel des commissions
 * @access  Private (Admin)
 */
router.get(
  '/paiements/commissions/surveiller',
  middlewareAuth,
  middlewareRateLimit('standard'),
  surveillerCommissions || creerControleurParDefaut('surveillerCommissions')
);

// =====================================================
// ROUTES RECHARGES (ADMIN)
// =====================================================

/**
 * @route   GET /api/admin/paiements/recharges/statistiques
 * @desc    Statistiques détaillées des recharges
 * @access  Private (Admin avec permission ANALYTICS)
 */
router.get(
  '/paiements/recharges/statistiques',
  middlewareAuth,
  middlewareRateLimit('reporting'),
  middlewareAuthorize(['SUPER_ADMIN', 'MODERATEUR'], ['ALL', 'ANALYTICS', 'GESTION_PAIEMENTS']),
  obtenirStatistiquesRecharges || creerControleurParDefaut('obtenirStatistiquesRecharges')
);

/**
 * @route   POST /api/admin/paiements/recharges/traiter-attentes
 * @desc    Traiter les recharges en attente (expiration automatique)
 * @access  Private (Admin avec permission GESTION_PAIEMENTS)
 */
router.post(
  '/paiements/recharges/traiter-attentes',
  middlewareAuth,
  middlewareRateLimit('standard'),
  middlewareAuthorize(['SUPER_ADMIN', 'MODERATEUR'], ['ALL', 'GESTION_PAIEMENTS']),
  middlewareLogSensitiveAction('RECHARGES_TRAITER_ATTENTES'),
  traiterRechargesEnAttente || creerControleurParDefaut('traiterRechargesEnAttente')
);
/**
 * @route   GET /api/admin/paiements/export
 * @desc    Exporter les paiements
 * @access  Private (Admin avec permission EXPORT_DONNEES)
 */
router.get('/paiements/export',
  middlewareAuth,
  middlewareRateLimit('reporting'),
  middlewareAuthorize(['SUPER_ADMIN'], ['ALL', 'EXPORT_DONNEES', 'RAPPORTS_FINANCIERS']),
  middlewareLogSensitiveAction('EXPORT_PAIEMENTS'),
  exporterPaiements || creerControleurParDefaut('exporterPaiements')
);

/**
 * @route   GET /api/admin/paiements
 * @desc    Lister tous les paiements
 * @access  Private (Admin avec permission GESTION_PAIEMENTS)
 */
router.get('/paiements',
  middlewareAuth,
  middlewareRateLimit('standard'),
  middlewareAuthorize(['SUPER_ADMIN', 'MODERATEUR'], ['ALL', 'GESTION_PAIEMENTS']),
  listerPaiements || creerControleurParDefaut('listerPaiements')
);

/**
 * @route   GET /api/admin/paiements/:id
 * @desc    Obtenir les détails d'un paiement
 * @access  Private (Admin)
 */
router.get('/paiements/:id',
  middlewareAuth,
  middlewareRateLimit('standard'),
  validationId,
  obtenirPaiement || creerControleurParDefaut('obtenirPaiement')
);

/**
 * @route   POST /api/admin/paiements/:id/rembourser
 * @desc    Rembourser un paiement
 * @access  Private (Admin avec permission REMBOURSEMENTS)
 */
router.post('/paiements/:id/rembourser',
  middlewareAuth,
  middlewareRateLimit('standard'),
  middlewareAuthorize(['SUPER_ADMIN'], ['ALL', 'REMBOURSEMENTS']),
  validationId,
  [
    body('motif')
      .notEmpty()
      .withMessage('Le motif est requis'),
    body('montant')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Le montant doit être positif')
  ],
  middlewareLogSensitiveAction('PAIEMENT_REMBOURSEMENT'),
  rembourserPaiement || creerControleurParDefaut('rembourserPaiement')
);

// =====================================================
// ROUTES DE GESTION DES SIGNALEMENTS
// =====================================================

/**
 * @route   GET /api/admin/signalements
 * @desc    Lister tous les signalements
 * @access  Private (Admin avec permission MODERATION)
 */
router.get('/signalements',
  middlewareAuth,
  middlewareRateLimit('standard'),
  middlewareAuthorize(['SUPER_ADMIN', 'MODERATEUR'], ['ALL', 'MODERATION', 'GESTION_RECLAMATIONS']),
  listerSignalements || creerControleurParDefaut('listerSignalements')
);

/**
 * @route   GET /api/admin/signalements/:id
 * @desc    Obtenir les détails d'un signalement
 * @access  Private (Admin)
 */
router.get('/signalements/:id',
  middlewareAuth,
  middlewareRateLimit('standard'),
  validationId,
  obtenirSignalement || creerControleurParDefaut('obtenirSignalement')
);

/**
 * @route   POST /api/admin/signalements/:id/traiter
 * @desc    Traiter un signalement
 * @access  Private (Admin avec permission MODERATION)
 */
router.post('/signalements/:id/traiter',
  middlewareAuth,
  middlewareRateLimit('standard'),
  middlewareAuthorize(['SUPER_ADMIN', 'MODERATEUR'], ['ALL', 'MODERATION']),
  validationId,
  [
    body('decision')
      .isIn(['valide', 'rejete'])
      .withMessage('Décision invalide'),
    body('commentaire')
      .notEmpty()
      .isLength({ min: 10 })
      .withMessage('Commentaire requis (minimum 10 caractères)'),
    body('action')
      .optional()
      .isIn(['avertissement', 'suspension', 'bannissement'])
      .withMessage('Action invalide')
  ],
  middlewareLogSensitiveAction('SIGNALEMENT_TRAITEMENT'),
  traiterSignalement || creerControleurParDefaut('traiterSignalement')
);

/**
 * @route   POST /api/admin/signalements/:id/priorite
 * @desc    Marquer un signalement comme prioritaire
 * @access  Private (Admin)
 */
router.post('/signalements/:id/priorite',
  middlewareAuth,
  middlewareRateLimit('standard'),
  middlewareAuthorize(['SUPER_ADMIN', 'MODERATEUR'], ['ALL', 'MODERATION']),
  validationId,
  middlewareLogSensitiveAction('SIGNALEMENT_PRIORITE'),
  marquerPrioritaire || creerControleurParDefaut('marquerPrioritaire')
);

// =====================================================
// ROUTES DE GESTION DES ÉVÉNEMENTS
// =====================================================

/**
 * @route   GET /api/admin/evenements
 * @desc    Lister tous les événements
 * @access  Private (Admin)
 */
router.get('/evenements',
  middlewareAuth,
  middlewareRateLimit('standard'),
  listerEvenements || creerControleurParDefaut('listerEvenements')
);

/**
 * @route   POST /api/admin/evenements
 * @desc    Créer un événement
 * @access  Private (Admin)
 */
router.post('/evenements',
  middlewareAuth,
  middlewareRateLimit('standard'),
  middlewareAuthorize(['SUPER_ADMIN', 'MODERATEUR'], ['ALL']),
  middlewareLogSensitiveAction('EVENEMENT_CREATION'),
  creerEvenement || creerControleurParDefaut('creerEvenement')
);

/**
 * @route   GET /api/admin/evenements/:id
 * @desc    Obtenir les détails d'un événement
 * @access  Private (Admin)
 */
router.get('/evenements/:id',
  middlewareAuth,
  middlewareRateLimit('standard'),
  validationId,
  obtenirEvenement || creerControleurParDefaut('obtenirEvenement')
);

/**
 * @route   GET /api/admin/evenements/:id/participants
 * @desc    Obtenir les participants d'un événement
 * @access  Private (Admin)
 */
router.get('/evenements/:id/participants',
  middlewareAuth,
  middlewareRateLimit('standard'),
  validationId,
  obtenirParticipantsEvenement || creerControleurParDefaut('obtenirParticipantsEvenement')
);

/**
 * @route   PUT /api/admin/evenements/:id
 * @desc    Modifier un événement
 * @access  Private (Admin)
 */
router.put('/evenements/:id',
  middlewareAuth,
  middlewareRateLimit('standard'),
  middlewareAuthorize(['SUPER_ADMIN', 'MODERATEUR'], ['ALL']),
  validationId,
  middlewareLogSensitiveAction('EVENEMENT_MODIFICATION'),
  modifierEvenement || creerControleurParDefaut('modifierEvenement')
);

/**
 * @route   POST /api/admin/evenements/:id/annuler
 * @desc    Annuler un événement
 * @access  Private (Admin)
 */
router.post('/evenements/:id/annuler',
  middlewareAuth,
  middlewareRateLimit('standard'),
  middlewareAuthorize(['SUPER_ADMIN', 'MODERATEUR'], ['ALL']),
  validationId,
  [
    body('motif')
      .notEmpty()
      .isLength({ min: 10 })
      .withMessage('Le motif doit contenir au moins 10 caractères')
  ],
  middlewareLogSensitiveAction('EVENEMENT_ANNULATION'),
  annulerEvenement || creerControleurParDefaut('annulerEvenement')
);

/**
 * @route   DELETE /api/admin/evenements/:id
 * @desc    Supprimer un événement
 * @access  Private (Admin)
 */
router.delete('/evenements/:id',
  middlewareAuth,
  middlewareRateLimit('standard'),
  middlewareAuthorize(['SUPER_ADMIN'], ['ALL']),
  validationId,
  middlewareLogSensitiveAction('EVENEMENT_SUPPRESSION'),
  supprimerEvenement || creerControleurParDefaut('supprimerEvenement')
);

// =====================================================
// ROUTES DE GESTION DES ÉVALUATIONS
// =====================================================

/**
 * @route   GET /api/admin/evaluations/statistiques
 * @desc    Obtenir les statistiques des évaluations
 * @access  Private (Admin)
 */
router.get('/evaluations/statistiques',
  middlewareAuth,
  middlewareRateLimit('standard'),
  obtenirStatistiquesEvaluations || creerControleurParDefaut('obtenirStatistiquesEvaluations')
);

/**
 * @route   GET /api/admin/evaluations/meilleures
 * @desc    Obtenir les meilleures évaluations (top 10)
 * @access  Private (Admin)
 */
router.get('/evaluations/meilleures',
  middlewareAuth,
  middlewareRateLimit('standard'),
  middlewareAuthorize(['SUPER_ADMIN', 'MODERATEUR'], ['ALL', 'MODERATION', 'ANALYTICS']),
  obtenirMeilleuresEvaluations || creerControleurParDefaut('obtenirMeilleuresEvaluations')
);

/**
 * @route   GET /api/admin/evaluations
 * @desc    Lister toutes les évaluations
 * @access  Private (Admin avec permission MODERATION)
 */
router.get('/evaluations',
  middlewareAuth,
  middlewareRateLimit('standard'),
  middlewareAuthorize(['SUPER_ADMIN', 'MODERATEUR'], ['ALL', 'MODERATION']),
  listerEvaluations || creerControleurParDefaut('listerEvaluations')
);

/**
 * @route   GET /api/admin/evaluations/:id
 * @desc    Obtenir les détails d'une évaluation
 * @access  Private (Admin)
 */
router.get('/evaluations/:id',
  middlewareAuth,
  middlewareRateLimit('standard'),
  validationId,
  obtenirEvaluation || creerControleurParDefaut('obtenirEvaluation')
);

/**
 * @route   PATCH /api/admin/evaluations/:id/masquer
 * @desc    Masquer une évaluation (modération)
 * @access  Private (Admin/Modérateur)
 */
router.patch('/evaluations/:id/masquer',
  middlewareAuth,
  middlewareRateLimit('standard'),
  middlewareAuthorize(['SUPER_ADMIN', 'MODERATEUR'], ['ALL', 'MODERATION']),
  validationId,
  [
    body('raison')
      .notEmpty()
      .isLength({ min: 10 })
      .withMessage('La raison du masquage doit contenir au moins 10 caractères')
  ],
  middlewareLogSensitiveAction('EVALUATION_MASQUEE'),
  masquerEvaluation || creerControleurParDefaut('masquerEvaluation')
);

/**
 * @route   PATCH /api/admin/evaluations/:id/demasquer
 * @desc    Démasquer une évaluation
 * @access  Private (Admin/Modérateur)
 */
router.patch('/evaluations/:id/demasquer',
  middlewareAuth,
  middlewareRateLimit('standard'),
  middlewareAuthorize(['SUPER_ADMIN', 'MODERATEUR'], ['ALL', 'MODERATION']),
  validationId,
  middlewareLogSensitiveAction('EVALUATION_DEMASQUEE'),
  demasquerEvaluation || creerControleurParDefaut('demasquerEvaluation')
);

/**
 * @route   POST /api/admin/evaluations/:id/signaler
 * @desc    Signaler une évaluation
 * @access  Private (Admin)
 */
router.post('/evaluations/:id/signaler',
  middlewareAuth,
  middlewareRateLimit('standard'),
  middlewareAuthorize(['SUPER_ADMIN', 'MODERATEUR'], ['ALL', 'MODERATION']),
  validationId,
  middlewareLogSensitiveAction('EVALUATION_SIGNALEMENT'),
  signalerEvaluation || creerControleurParDefaut('signalerEvaluation')
);

/**
 * @route   DELETE /api/admin/evaluations/:id
 * @desc    Supprimer une évaluation
 * @access  Private (Admin avec permission MODERATION)
 */
router.delete('/evaluations/:id',
  middlewareAuth,
  middlewareRateLimit('standard'),
  middlewareAuthorize(['SUPER_ADMIN', 'MODERATEUR'], ['ALL', 'MODERATION']),
  validationId,
  middlewareLogSensitiveAction('EVALUATION_SUPPRESSION'),
  supprimerEvaluation || creerControleurParDefaut('supprimerEvaluation')
);

/**
 * @route   GET /api/admin/evaluations/utilisateur/:userId/suspectes
 * @desc    Détecter les évaluations suspectes d'un utilisateur
 * @access  Private (Admin/Modérateur)
 */
router.get('/evaluations/utilisateur/:userId/suspectes',
  middlewareAuth,
  middlewareRateLimit('standard'),
  middlewareAuthorize(['SUPER_ADMIN', 'MODERATEUR'], ['ALL', 'MODERATION']),
  param('userId').matches(/^[0-9a-fA-F]{24}$/).withMessage('ID utilisateur invalide'),
  detecterEvaluationsSuspectes || creerControleurParDefaut('detecterEvaluationsSuspectes')
);

/**
 * @route   GET /api/admin/evaluations/utilisateur/:userId/badges
 * @desc    Obtenir les stats pour badges d'un utilisateur
 * @access  Private (Admin)
 */
router.get('/evaluations/utilisateur/:userId/badges',
  middlewareAuth,
  middlewareRateLimit('standard'),
  middlewareAuthorize(['SUPER_ADMIN', 'MODERATEUR'], ['ALL', 'ANALYTICS']),
  param('userId').matches(/^[0-9a-fA-F]{24}$/).withMessage('ID utilisateur invalide'),
  obtenirStatsPourBadges || creerControleurParDefaut('obtenirStatsPourBadges')
);

/**
 * @route   POST /api/admin/evaluations/utilisateur/:userId/recalculer-score
 * @desc    Recalculer le score de confiance d'un utilisateur
 * @access  Private (Super Admin)
 */
router.post('/evaluations/utilisateur/:userId/recalculer-score',
  middlewareAuth,
  middlewareRateLimit('standard'),
  middlewareAuthorize(['SUPER_ADMIN'], ['ALL']),
  param('userId').matches(/^[0-9a-fA-F]{24}$/).withMessage('ID utilisateur invalide'),
  middlewareLogSensitiveAction('SCORE_CONFIANCE_RECALCULE'),
  recalculerScoreConfiance || creerControleurParDefaut('recalculerScoreConfiance')
);
// =====================================================
// ROUTES DE GESTION DES ALERTES D'URGENCE
// =====================================================

/**
 * @route   GET /api/admin/alertes-urgence
 * @desc    Lister toutes les alertes d'urgence
 * @access  Private (Admin avec permission SUPPORT_CLIENT)
 */
router.get('/alertes-urgence',
  middlewareAuth,
  middlewareRateLimit('standard'),
  middlewareAuthorize(['SUPER_ADMIN', 'MODERATEUR', 'SUPPORT'], ['ALL', 'SUPPORT_CLIENT']),
  listerAlertes || creerControleurParDefaut('listerAlertes')
);

/**
 * @route   GET /api/admin/alertes-urgence/:id
 * @desc    Obtenir les détails d'une alerte
 * @access  Private (Admin)
 */
router.get('/alertes-urgence/:id',
  middlewareAuth,
  middlewareRateLimit('standard'),
  validationId,
  obtenirAlerte || creerControleurParDefaut('obtenirAlerte')
);

/**
 * @route   POST /api/admin/alertes-urgence/:id/traiter
 * @desc    Traiter une alerte d'urgence
 * @access  Private (Admin avec permission SUPPORT_CLIENT)
 */
router.post('/alertes-urgence/:id/traiter',
  middlewareAuth,
  middlewareRateLimit('standard'),
  middlewareAuthorize(['SUPER_ADMIN', 'MODERATEUR', 'SUPPORT'], ['ALL', 'SUPPORT_CLIENT']),
  validationId,
  [
    body('action')
      .isIn(['en_cours', 'resolu', 'fausse_alerte'])
      .withMessage('Action invalide'),
    body('commentaire')
      .notEmpty()
      .isLength({ min: 10 })
      .withMessage('Commentaire requis (minimum 10 caractères)')
  ],
  middlewareLogSensitiveAction('ALERTE_TRAITEMENT'),
  traiterAlerte || creerControleurParDefaut('traiterAlerte')
);

/**
 * @route   POST /api/admin/alertes-urgence/:id/contacter
 * @desc    Contacter l'utilisateur en urgence
 * @access  Private (Admin avec permission SUPPORT_CLIENT)
 */
router.post('/alertes-urgence/:id/contacter',
  middlewareAuth,
  middlewareRateLimit('standard'),
  middlewareAuthorize(['SUPER_ADMIN', 'MODERATEUR', 'SUPPORT'], ['ALL', 'SUPPORT_CLIENT']),
  validationId,
  middlewareLogSensitiveAction('ALERTE_CONTACT'),
  contacterAlerte || creerControleurParDefaut('contacterAlerte')
);

/**
 * @route   POST /api/admin/alertes-urgence/:id/cloturer
 * @desc    Clôturer une alerte
 * @access  Private (Admin avec permission SUPPORT_CLIENT)
 */
router.post('/alertes-urgence/:id/cloturer',
  middlewareAuth,
  middlewareRateLimit('standard'),
  middlewareAuthorize(['SUPER_ADMIN', 'MODERATEUR', 'SUPPORT'], ['ALL', 'SUPPORT_CLIENT']),
  validationId,
  middlewareLogSensitiveAction('ALERTE_CLOTURE'),
  cloturerAlerte || creerControleurParDefaut('cloturerAlerte')
);

// =====================================================
// ROUTES DE RAPPORTS FINANCIERS (à implémenter)
// =====================================================

/**
 * @route   GET /api/admin/rapports/transactions
 * @desc    Rapport des transactions
 * @access  Private (Admin avec permission RAPPORTS_FINANCIERS)
 */
router.get('/rapports/transactions',
  middlewareAuth,
  middlewareRateLimit('reporting'),
  middlewareAuthorize(['SUPER_ADMIN', 'MODERATEUR'], ['ALL', 'RAPPORTS_FINANCIERS']),
  middlewareLogSensitiveAction('FINANCIAL_REPORT_ACCESS'),
  (req, res) => {
    res.status(501).json({
      success: false,
      message: 'Rapports financiers en cours d\'implémentation',
      code: 'NOT_IMPLEMENTED'
    });
  }
);

/**
 * @route   GET /api/admin/rapports/revenus
 * @desc    Rapport des revenus
 * @access  Private (Admin avec permission RAPPORTS_FINANCIERS)
 */
router.get('/rapports/revenus',
  middlewareAuth,
  middlewareRateLimit('reporting'),
  middlewareAuthorize(['SUPER_ADMIN'], ['ALL', 'RAPPORTS_FINANCIERS']),
  middlewareLogSensitiveAction('REVENUE_REPORT_ACCESS'),
  (req, res) => {
    res.status(501).json({
      success: false,
      message: 'Rapports de revenus en cours d\'implémentation',
      code: 'NOT_IMPLEMENTED'
    });
  }
);

// =====================================================
// ROUTES DE GESTION DES VÉHICULES (ADMIN)
// =====================================================

/**
 * @route   GET /api/admin/vehicules/statistiques/globales
 * @desc    Obtenir les statistiques globales des véhicules (admin)
 * @access  Private (Admin avec permission ANALYTICS)
 */
router.get('/vehicules/statistiques/globales',
  middlewareAuth,
  middlewareRateLimit('reporting'),
  middlewareAuthorize(['SUPER_ADMIN', 'MODERATEUR'], ['ALL', 'ANALYTICS']),
  obtenirStatistiquesVehiculesAdmin || creerControleurParDefaut('obtenirStatistiquesVehiculesAdmin')
);

/**
 * @route   GET /api/admin/vehicules
 * @desc    Lister tous les véhicules (admin)
 * @access  Private (Admin avec permission VERIFICATION_DOCUMENTS)
 */
router.get('/vehicules',
  middlewareAuth,
  middlewareRateLimit('standard'),
  middlewareAuthorize(['SUPER_ADMIN', 'MODERATEUR'], ['ALL', 'VERIFICATION_DOCUMENTS', 'GESTION_VEHICULES']),
  listerVehiculesAdmin || creerControleurParDefaut('listerVehiculesAdmin')
);

/**
 * @route   GET /api/admin/vehicules/:id
 * @desc    Obtenir les détails d'un véhicule (admin)
 * @access  Private (Admin)
 */
router.get('/vehicules/:id',
  middlewareAuth,
  middlewareRateLimit('standard'),
  validationId,
  obtenirVehiculeAdmin || creerControleurParDefaut('obtenirVehiculeAdmin')
);

/**
 * @route   GET /api/admin/vehicules/:id/proprietaire
 * @desc    Obtenir le propriétaire d'un véhicule (admin)
 * @access  Private (Admin)
 */
router.get('/vehicules/:id/proprietaire',
  middlewareAuth,
  middlewareRateLimit('standard'),
  validationId,
  obtenirProprietaireVehicule || creerControleurParDefaut('obtenirProprietaireVehicule')
);

/**
 * @route   POST /api/admin/vehicules/:id/valider
 * @desc    Valider un véhicule (admin)
 * @access  Private (Admin avec permission VERIFICATION_DOCUMENTS)
 */
router.post('/vehicules/:id/valider',
  middlewareAuth,
  middlewareRateLimit('standard'),
  middlewareAuthorize(['SUPER_ADMIN', 'MODERATEUR'], ['ALL', 'VERIFICATION_DOCUMENTS']),
  validationId,
  [
    body('commentaire')
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Le commentaire ne peut dépasser 500 caractères')
  ],
  middlewareLogSensitiveAction('VEHICULE_VALIDATION'),
  validerVehiculeAdmin || creerControleurParDefaut('validerVehiculeAdmin')
);

/**
 * @route   POST /api/admin/vehicules/:id/rejeter
 * @desc    Rejeter un véhicule (admin)
 * @access  Private (Admin avec permission VERIFICATION_DOCUMENTS)
 */
router.post('/vehicules/:id/rejeter',
  middlewareAuth,
  middlewareRateLimit('standard'),
  middlewareAuthorize(['SUPER_ADMIN', 'MODERATEUR'], ['ALL', 'VERIFICATION_DOCUMENTS']),
  validationId,
  [
    body('raison')
      .notEmpty()
      .isLength({ min: 10 })
      .withMessage('La raison du rejet doit contenir au moins 10 caractères')
  ],
  middlewareLogSensitiveAction('VEHICULE_REJET'),
  rejeterVehiculeAdmin || creerControleurParDefaut('rejeterVehiculeAdmin')
);

// =====================================================
// VALIDATION DES PARAMÈTRES
// =====================================================

// Middleware pour valider les IDs
router.param('id', (req, res, next, id) => {
  if (!id.match(/^[0-9a-fA-F]{24}$/)) {
    return res.status(400).json({
      success: false,
      message: 'Format ID invalide',
      code: 'INVALID_ID'
    });
  }
  next();
});

router.param('utilisateurId', (req, res, next, utilisateurId) => {
  if (!utilisateurId.match(/^[0-9a-fA-F]{24}$/)) {
    return res.status(400).json({
      success: false,
      message: 'Format ID utilisateur invalide',
      code: 'INVALID_UTILISATEUR_ID'
    });
  }
  next();
});

// =====================================================
// MIDDLEWARES GLOBAUX
// =====================================================

// Middleware de logging pour les actions admin
// ✅ CORRECTION
router.use((req, res, next) => {
  const originalSend = res.send;
  res.send = function(data) {
    // Support à la fois req.admin et req.user pour compatibilité
    const userId = req.admin?.id || req.admin?._id || req.user?.id || 'Anonymous';
    const userRole = req.admin?.role || req.user?.role || 'N/A';
    console.log(`👑 ACTION ADMIN: ${req.method} ${req.originalUrl} - User: ${userId} - Role: ${userRole}`);
    return originalSend.call(this, data);
  };
  next();
});

// =====================================================
// GESTION D'ERREURS
// =====================================================

// Middleware pour les routes non trouvées
router.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route administrateur non trouvée',
    code: 'ADMIN_ROUTE_NOT_FOUND'
  });
});

// Middleware de gestion d'erreurs spécifique aux routes admin
router.use((err, req, res, next) => {
  console.error('💥 Erreur dans les routes admin:', {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    user: req.user?.id,
    url: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString()
  });

  // Erreur de validation express-validator
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      message: 'Erreur de validation des données',
      code: 'VALIDATION_ERROR',
      errors: Object.values(err.errors).map(e => e.message)
    });
  }

  // Erreur JWT
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      message: 'Token d\'authentification invalide',
      code: 'INVALID_TOKEN'
    });
  }

  // Erreur de cast (ID MongoDB invalide)
  if (err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      message: 'ID invalide',
      code: 'INVALID_ID'
    });
  }

  // Erreur de permission
  if (err.statusCode === 403) {
    return res.status(403).json({
      success: false,
      message: 'Permissions insuffisantes pour cette action',
      code: 'INSUFFICIENT_PERMISSIONS'
    });
  }

  // Erreur par défaut
  if (process.env.NODE_ENV === 'production') {
    return res.status(500).json({
      success: false,
      message: 'Erreur interne du serveur administratif',
      code: 'ADMIN_SERVER_ERROR'
    });
  }

  return next(err);
});

module.exports = router;