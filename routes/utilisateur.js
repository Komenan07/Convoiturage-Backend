// routes/utilisateurs.js - VERSION COMPLÈTE
const express = require('express');
const router = express.Router();
const { body, param, query, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');

// =============== IMPORTS SÉCURISÉS ===============
// Import du contrôleur avec gestion d'erreur
let utilisateursController;
try {
  utilisateursController = require('../controllers/utilisateurController');
  console.log('✅ Contrôleur utilisateursController chargé avec succès');
} catch (error) {
  console.warn('⚠️ Contrôleur utilisateursController non trouvé:', error.message);
  utilisateursController = {};
}

// Destructuration sécurisée des fonctions
const {
  // CRUD de base
  obtenirUtilisateurs,
  obtenirUtilisateur,
  creerUtilisateur,
  mettreAJourUtilisateur,
  modifierUtilisateur,
  updateUtilisateur,
  supprimerUtilisateur,
  
  // Fonctions avancées
  changerStatutUtilisateur,
  obtenirStatistiquesUtilisateurs,
  rechercherUtilisateurs,
  exporterUtilisateurs,
  obtenirUtilisateursParRole,
  obtenirUtilisateursActifs,
  obtenirUtilisateursRecents,
  
  // Fonctions de gestion
  bloquerUtilisateur,
  debloquerUtilisateur,
  suspendreUtilisateur,
  reactiverUtilisateur,
  verifierDocumentUtilisateur,
  rejeterDocumentUtilisateur,
  
  // Fonctions de statistiques
  obtenirStatistiquesGlobales,
  obtenirStatistiquesParPeriode,
  obtenirRapportActivite,
  
  // Fonctions de modération
  obtenirUtilisateursSignales,
  traiterSignalement,
  obtenirHistoriqueModeration,
  
  // Fonctions de profil utilisateur
  mettreAJourProfil,
  uploadPhotoProfil,
  uploadDocumentIdentite,
  changerMotDePasse,
  obtenirDashboard
} = utilisateursController;

// Import des middlewares
const { authMiddleware, adminMiddleware, moderateurMiddleware } = require('../middlewares/authMiddleware');
const AppError = require('../utils/AppError');

// =============== RATE LIMITING ===============

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // 200 requêtes par IP
  message: {
    success: false,
    message: 'Trop de requêtes. Réessayez dans 15 minutes.'
  }
});

const adminActionLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 100, // 100 actions admin par IP
  message: {
    success: false,
    message: 'Trop d\'actions administrateur. Réessayez dans 5 minutes.'
  }
});

const searchLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 50, // 50 recherches par minute
  message: {
    success: false,
    message: 'Trop de recherches. Réessayez dans 1 minute.'
  }
});

const moderationLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 30, // 30 actions de modération par 5 minutes
  message: {
    success: false,
    message: 'Trop d\'actions de modération. Réessayez dans 5 minutes.'
  }
});

// =============== VALIDATIONS ===============

const validateUserId = [
  param('id')
    .isMongoId()
    .withMessage('ID utilisateur invalide')
];

const validateUserCreation = [
  body('nom')
    .trim()
    .notEmpty()
    .withMessage('Le nom est requis')
    .isLength({ min: 2, max: 50 })
    .withMessage('Le nom doit contenir entre 2 et 50 caractères'),
  
  body('prenom')
    .trim()
    .notEmpty()
    .withMessage('Le prénom est requis')
    .isLength({ min: 2, max: 50 })
    .withMessage('Le prénom doit contenir entre 2 et 50 caractères'),
  
  body('email')
    .trim()
    .isEmail()
    .withMessage('Email invalide')
    .normalizeEmail(),
  
  body('telephone')
    .trim()
    .matches(/^(\+225)?[0-9]{8,10}$/)
    .withMessage('Numéro de téléphone invalide'),
  
  body('motDePasse')
    .isLength({ min: 8 })
    .withMessage('Le mot de passe doit contenir au moins 8 caractères')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Le mot de passe doit contenir au moins une majuscule, une minuscule et un chiffre'),
  
  body('role')
    .optional()
    .isIn(['conducteur', 'passager', 'les_deux', 'admin', 'moderateur'])
    .withMessage('Rôle invalide'),
  
  body('dateNaissance')
    .optional()
    .isISO8601()
    .withMessage('Date de naissance invalide'),
  
  body('sexe')
    .optional()
    .isIn(['M', 'F'])
    .withMessage('Sexe invalide (M ou F)')
];

const validateUserUpdate = [
  body('nom')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Le nom doit contenir entre 2 et 50 caractères'),
  
  body('prenom')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Le prénom doit contenir entre 2 et 50 caractères'),
  
  body('email')
    .optional()
    .trim()
    .isEmail()
    .withMessage('Email invalide')
    .normalizeEmail(),
  
  body('telephone')
    .optional()
    .trim()
    .matches(/^(\+225)?[0-9]{8,10}$/)
    .withMessage('Numéro de téléphone invalide'),
  
  body('role')
    .optional()
    .isIn(['conducteur', 'passager', 'les_deux', 'admin', 'moderateur'])
    .withMessage('Rôle invalide'),
  
  body('statutCompte')
    .optional()
    .isIn(['ACTIF', 'SUSPENDU', 'BLOQUE', 'EN_ATTENTE_VERIFICATION'])
    .withMessage('Statut de compte invalide'),
  
  body('dateNaissance')
    .optional()
    .isISO8601()
    .withMessage('Date de naissance invalide'),
  
  body('sexe')
    .optional()
    .isIn(['M', 'F'])
    .withMessage('Sexe invalide (M ou F)')
];

const validateStatusChange = [
  body('nouveauStatut')
    .notEmpty()
    .isIn(['ACTIF', 'SUSPENDU', 'BLOQUE', 'EN_ATTENTE_VERIFICATION'])
    .withMessage('Statut de compte invalide'),
  
  body('raison')
    .trim()
    .isLength({ min: 10, max: 500 })
    .withMessage('La raison doit contenir entre 10 et 500 caractères'),
  
  body('duree')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Durée invalide (en jours)')
];

const validateSearchQuery = [
  query('q')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('La recherche doit contenir entre 1 et 100 caractères'),
  
  query('role')
    .optional()
    .isIn(['conducteur', 'passager', 'les_deux', 'admin', 'moderateur'])
    .withMessage('Rôle de filtrage invalide'),
  
  query('statutCompte')
    .optional()
    .isIn(['ACTIF', 'SUSPENDU', 'BLOQUE', 'EN_ATTENTE_VERIFICATION'])
    .withMessage('Statut de filtrage invalide'),
  
  query('ville')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Nom de ville invalide'),
  
  query('commune')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Nom de commune invalide'),
  
  query('scoreMin')
    .optional()
    .isFloat({ min: 0, max: 100 })
    .withMessage('Score de confiance minimum invalide'),
  
  query('dateInscriptionDebut')
    .optional()
    .isISO8601()
    .withMessage('Date de début d\'inscription invalide'),
  
  query('dateInscriptionFin')
    .optional()
    .isISO8601()
    .withMessage('Date de fin d\'inscription invalide'),
  
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Le numéro de page doit être un entier positif'),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('La limite doit être entre 1 et 100'),
  
  query('sortBy')
    .optional()
    .isIn(['nom', 'prenom', 'email', 'dateInscription', 'derniereConnexion', 'scoreConfiance', 'nombreTrajetsEffectues'])
    .withMessage('Champ de tri invalide'),
  
  query('sortOrder')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('Ordre de tri invalide (asc ou desc)')
];

const validateModerationAction = [
  body('action')
    .isIn(['BLOQUER', 'DEBLOQUER', 'SUSPENDRE', 'REACTIVER', 'VERIFIER_DOCUMENT', 'REJETER_DOCUMENT'])
    .withMessage('Action de modération invalide'),
  
  body('raison')
    .trim()
    .isLength({ min: 10, max: 500 })
    .withMessage('Raison obligatoire (10-500 caractères)'),
  
  body('duree')
    .optional()
    .isInt({ min: 1, max: 365 })
    .withMessage('Durée invalide (1-365 jours)')
];

const validateExportQuery = [
  query('format')
    .optional()
    .isIn(['csv', 'xlsx', 'json'])
    .withMessage('Format d\'export invalide (csv, xlsx, json)'),
  
  query('champs')
    .optional()
    .isString()
    .withMessage('Liste des champs invalide'),
  
  query('filtre')
    .optional()
    .isJSON()
    .withMessage('Filtre JSON invalide')
];

// Middleware de gestion des erreurs de validation
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Erreurs de validation',
      errors: errors.array().map(error => ({
        field: error.param,
        message: error.msg,
        value: error.value,
        location: error.location
      }))
    });
  }
  next();
};

// Middleware de vérification d'autorisation
const checkUserAccess = (req, res, next) => {
  const userId = req.params.id;
  const currentUserId = req.user.userId;
  const userRole = req.user.role;
  
  // Admin et modérateurs peuvent accéder à tous les utilisateurs
  if (['admin', 'moderateur'].includes(userRole)) {
    return next();
  }
  
  // Utilisateur peut seulement accéder à ses propres données
  if (userId === currentUserId) {
    return next();
  }
  
  return res.status(403).json({
    success: false,
    message: 'Accès non autorisé à ces données utilisateur',
    code: 'FORBIDDEN_ACCESS'
  });
};

// =============== FONCTIONS DE FALLBACK ===============

const createFallback = (functionName, requiredRole = null) => (req, res) => {
  const userRole = req.user?.role || 'anonyme';
  const hasPermission = !requiredRole || userRole === requiredRole || userRole === 'admin';
  
  if (!hasPermission) {
    return res.status(403).json({
      success: false,
      message: `Accès refusé. Rôle ${requiredRole} requis.`,
      code: 'INSUFFICIENT_PRIVILEGES'
    });
  }
  
  res.status(501).json({
    success: false,
    message: `Fonctionnalité "${functionName}" non implémentée`,
    code: 'NOT_IMPLEMENTED',
    availableFunctions: Object.keys(utilisateursController).filter(key => 
      typeof utilisateursController[key] === 'function'
    ),
    timestamp: new Date().toISOString()
  });
};

// Fonction pour déterminer la fonction de mise à jour
const getUpdateFunction = () => {
  return mettreAJourUtilisateur || 
         modifierUtilisateur || 
         updateUtilisateur || 
         createFallback('mise à jour utilisateur');
};

// =============== DEBUG ET LOGGING ===============
if (process.env.NODE_ENV === 'development') {
  console.log('🔍 État du contrôleur utilisateursController:', {
    loaded: Object.keys(utilisateursController).length > 0,
    functionsCount: Object.keys(utilisateursController).filter(key => 
      typeof utilisateursController[key] === 'function'
    ).length,
    availableFunctions: Object.keys(utilisateursController).filter(key => 
      typeof utilisateursController[key] === 'function'
    ).slice(0, 10), // Affiche les 10 premières fonctions
    updateFunctionAvailable: !!getUpdateFunction()
  });
}

// =============== ROUTES PRINCIPALES ===============

/**
 * @route   GET /api/utilisateurs
 * @desc    Obtenir la liste paginée des utilisateurs avec filtres avancés
 * @access  Privé - Admin/Modérateur uniquement
 */
router.get('/', 
  generalLimiter,
  authMiddleware, 
  adminMiddleware,
  validateSearchQuery,
  handleValidationErrors,
  obtenirUtilisateurs || createFallback('liste des utilisateurs', 'admin')
);

/**
 * @route   GET /api/utilisateurs/rechercher
 * @desc    Recherche avancée d'utilisateurs
 * @access  Privé - Admin/Modérateur
 */
router.get('/rechercher',
  searchLimiter,
  authMiddleware,
  adminMiddleware,
  validateSearchQuery,
  handleValidationErrors,
  rechercherUtilisateurs || createFallback('recherche utilisateurs', 'admin')
);

/**
 * @route   GET /api/utilisateurs/statistiques
 * @desc    Obtenir les statistiques des utilisateurs
 * @access  Privé - Admin uniquement
 */
router.get('/statistiques',
  generalLimiter,
  authMiddleware,
  adminMiddleware,
  obtenirStatistiquesUtilisateurs || createFallback('statistiques utilisateurs', 'admin')
);

/**
 * @route   GET /api/utilisateurs/statistiques/periode
 * @desc    Obtenir les statistiques par période (jour/semaine/mois)
 * @access  Privé - Admin uniquement
 */
router.get('/statistiques/periode',
  generalLimiter,
  authMiddleware,
  adminMiddleware,
  [
    query('periode')
      .isIn(['jour', 'semaine', 'mois', 'trimestre', 'annee'])
      .withMessage('Période invalide (jour, semaine, mois, trimestre, annee)'),
    query('dateDebut')
      .optional()
      .isISO8601()
      .withMessage('Date de début invalide'),
    query('dateFin')
      .optional()
      .isISO8601()
      .withMessage('Date de fin invalide'),
    query('granularite')
      .optional()
      .isIn(['heure', 'jour', 'semaine'])
      .withMessage('Granularité invalide (heure, jour, semaine)')
  ],
  handleValidationErrors,
  obtenirStatistiquesParPeriode || createFallback('statistiques par période', 'admin')
);

/**
 * @route   GET /api/utilisateurs/statistiques/globales
 * @desc    Obtenir les statistiques globales du système
 * @access  Privé - Admin uniquement
 */
router.get('/statistiques/globales',
  generalLimiter,
  authMiddleware,
  adminMiddleware,
  obtenirStatistiquesGlobales || createFallback('statistiques globales', 'admin')
);

/**
 * @route   GET /api/utilisateurs/rapport/activite
 * @desc    Générer un rapport d'activité détaillé
 * @access  Privé - Admin uniquement
 */
router.get('/rapport/activite',
  generalLimiter,
  authMiddleware,
  adminMiddleware,
  [
    query('type')
      .optional()
      .isIn(['complet', 'resume', 'tendances'])
      .withMessage('Type de rapport invalide (complet, resume, tendances)'),
    query('format')
      .optional()
      .isIn(['json', 'pdf', 'csv'])
      .withMessage('Format de rapport invalide (json, pdf, csv)'),
    query('dateDebut')
      .optional()
      .isISO8601()
      .withMessage('Date de début invalide'),
    query('dateFin')
      .optional()
      .isISO8601()
      .withMessage('Date de fin invalide'),
    query('includeGraphiques')
      .optional()
      .isBoolean()
      .withMessage('includeGraphiques doit être un booléen')
  ],
  handleValidationErrors,
  obtenirRapportActivite || createFallback('rapport d\'activité', 'admin')
);

/**
 * @route   GET /api/utilisateurs/export
 * @desc    Exporter les données utilisateurs
 * @access  Privé - Admin uniquement
 */
router.get('/export',
  adminActionLimiter,
  authMiddleware,
  adminMiddleware,
  validateExportQuery,
  handleValidationErrors,
  exporterUtilisateurs || createFallback('export utilisateurs', 'admin')
);

/**
 * @route   GET /api/utilisateurs/actifs
 * @desc    Obtenir les utilisateurs actifs
 * @access  Privé - Admin/Modérateur
 */
router.get('/actifs',
  generalLimiter,
  authMiddleware,
  adminMiddleware,
  obtenirUtilisateursActifs || createFallback('utilisateurs actifs', 'admin')
);

/**
 * @route   GET /api/utilisateurs/recents
 * @desc    Obtenir les utilisateurs récemment inscrits
 * @access  Privé - Admin/Modérateur
 */
router.get('/recents',
  generalLimiter,
  authMiddleware,
  adminMiddleware,
  [
    query('jours')
      .optional()
      .isInt({ min: 1, max: 365 })
      .withMessage('Nombre de jours invalide (1-365)')
  ],
  handleValidationErrors,
  obtenirUtilisateursRecents || createFallback('utilisateurs récents', 'admin')
);

/**
 * @route   PUT /api/utilisateurs/profil
 * @desc    Mettre à jour son propre profil (utilisateur connecté)
 * @access  Privé - Utilisateur authentifié
 */
router.put('/profil', 
  adminActionLimiter,
  authMiddleware, // Seulement auth, pas besoin d'être admin
  [
    body('nom')
      .optional()
      .trim()
      .isLength({ min: 2, max: 50 })
      .withMessage('Le nom doit contenir entre 2 et 50 caractères'),
    
    body('prenom')
      .optional()
      .trim()
      .isLength({ min: 2, max: 50 })
      .withMessage('Le prénom doit contenir entre 2 et 50 caractères'),
    
    body('email')
      .optional()
      .trim()
      .isEmail()
      .withMessage('Email invalide')
      .normalizeEmail(),
    
    body('telephone')
      .optional()
      .trim()
      .matches(/^(\+225)?[0-9]{8,10}$/)
      .withMessage('Numéro de téléphone invalide'),
    
    body('dateNaissance')
      .optional()
      .isISO8601()
      .withMessage('Date de naissance invalide'),
    
    body('sexe')
      .optional()
      .isIn(['M', 'F'])
      .withMessage('Sexe invalide (M ou F)'),
    
    body('photoProfil')
      .optional()
      .trim()
      .isURL()
      .withMessage('URL de photo de profil invalide'),
    
    body('adresse')
      .optional()
      .isObject()
      .withMessage('Adresse doit être un objet'),
    
    body('adresse.commune')
      .optional()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Commune invalide'),
    
    body('adresse.quartier')
      .optional()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Quartier invalide'),
    
    body('adresse.ville')
      .optional()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage('Ville invalide'),
    
    body('adresse.rue')
      .optional()
      .trim()
      .isLength({ max: 200 })
      .withMessage('Rue trop longue (max 200 caractères)'),
    
    body('adresse.codePostal')
      .optional()
      .trim()
      .isLength({ max: 20 })
      .withMessage('Code postal invalide'),
    
    body('preferences')
      .optional()
      .isObject()
      .withMessage('Préférences doivent être un objet'),
    
    body('preferences.accepterAnimaux')
      .optional()
      .isBoolean()
      .withMessage('accepterAnimaux doit être un booléen'),
    
    body('preferences.accepterFumeurs')
      .optional()
      .isBoolean()
      .withMessage('accepterFumeurs doit être un booléen'),
    
    body('preferences.accepterBagages')
      .optional()
      .isBoolean()
      .withMessage('accepterBagages doit être un booléen'),
    
    body('preferences.niveauDiscussion')
      .optional()
      .isIn(['AUCUNE', 'MODEREE', 'BAVARDE'])
      .withMessage('Niveau de discussion invalide'),
    
    body('preferences.languesParles')
      .optional()
      .isArray()
      .withMessage('languesParles doit être un tableau'),
    
    body('contactsUrgence')
      .optional()
      .isArray()
      .withMessage('Contacts d\'urgence doivent être un tableau'),
    
    body('contactsUrgence.*.nom')
      .optional()
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Nom du contact d\'urgence invalide'),
    
    body('contactsUrgence.*.telephone')
      .optional()
      .trim()
      .matches(/^(\+225)?[0-9]{8,10}$/)
      .withMessage('Téléphone du contact d\'urgence invalide'),
    
    body('contactsUrgence.*.lien')
      .optional()
      .trim()
      .isLength({ min: 2, max: 50 })
      .withMessage('Lien du contact d\'urgence invalide (ex: Famille, Ami)')
  ],
  handleValidationErrors,
  mettreAJourProfil || createFallback('mise à jour profil utilisateur')
);
/**
 * @route   POST /api/utilisateurs/profil/photo
 * @desc    Upload photo de profil
 * @access  Privé - Utilisateur authentifié
 */
router.post('/profil/photo', 
  adminActionLimiter,
  authMiddleware,
  uploadPhotoProfil || createFallback('upload photo profil')
);

/**
 * @route   POST /api/utilisateurs/profil/document
 * @desc    Upload document d'identité
 * @access  Privé - Utilisateur authentifié
 */
router.post('/profil/document', 
  adminActionLimiter,
  authMiddleware,
  uploadDocumentIdentite || createFallback('upload document identité')
);

/**
 * @route   PUT /api/utilisateurs/profil/mot-de-passe
 * @desc    Changer son mot de passe
 * @access  Privé - Utilisateur authentifié
 */
router.put('/profil/mot-de-passe', 
  adminActionLimiter,
  authMiddleware,
  [
    body('motDePasseActuel')
      .notEmpty()
      .withMessage('Mot de passe actuel requis'),
    body('nouveauMotDePasse')
      .isLength({ min: 8 })
      .withMessage('Le nouveau mot de passe doit contenir au moins 8 caractères')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .withMessage('Le nouveau mot de passe doit contenir au moins une majuscule, une minuscule et un chiffre')
  ],
  handleValidationErrors,
  changerMotDePasse || createFallback('changement mot de passe')
);

/**
 * @route   GET /api/utilisateurs/profil/dashboard
 * @desc    Obtenir le dashboard utilisateur
 * @access  Privé - Utilisateur authentifié
 */
router.get('/profil/dashboard', 
  generalLimiter,
  authMiddleware,
  obtenirDashboard || createFallback('dashboard utilisateur')
);

/**
 * @route   GET /api/utilisateurs/role/:role
 * @desc    Obtenir les utilisateurs par rôle
 * @access  Privé - Admin/Modérateur
 */
router.get('/role/:role',
  generalLimiter,
  authMiddleware,
  adminMiddleware,
  [
    param('role')
      .isIn(['conducteur', 'passager', 'les_deux', 'admin', 'moderateur'])
      .withMessage('Rôle invalide')
  ],
  handleValidationErrors,
  obtenirUtilisateursParRole || createFallback('utilisateurs par rôle', 'admin')
);

/**
 * @route   GET /api/utilisateurs/:id
 * @desc    Obtenir un utilisateur spécifique par ID
 * @access  Privé - Admin/Modérateur ou utilisateur lui-même
 */
router.get('/:id', 
  generalLimiter,
  authMiddleware, 
  validateUserId,
  handleValidationErrors,
  checkUserAccess,
  obtenirUtilisateur || createFallback('consultation utilisateur')
);

/**
 * @route   POST /api/utilisateurs
 * @desc    Créer un nouvel utilisateur (Admin uniquement)
 * @access  Privé - Admin uniquement
 */
router.post('/', 
  adminActionLimiter,
  authMiddleware, 
  adminMiddleware,
  validateUserCreation,
  handleValidationErrors,
  creerUtilisateur || createFallback('création utilisateur', 'admin')
);

/**
 * @route   PUT /api/utilisateurs/:id
 * @desc    Modifier complètement un utilisateur
 * @access  Privé - Admin/Modérateur ou utilisateur lui-même
 */
router.put('/:id', 
  adminActionLimiter,
  authMiddleware, 
  validateUserId,
  validateUserUpdate,
  handleValidationErrors,
  checkUserAccess,
  getUpdateFunction()
);

/**
 * @route   PATCH /api/utilisateurs/:id
 * @desc    Modification partielle d'un utilisateur
 * @access  Privé - Admin/Modérateur ou utilisateur lui-même
 */
router.patch('/:id', 
  adminActionLimiter,
  authMiddleware, 
  validateUserId,
  validateUserUpdate,
  handleValidationErrors,
  checkUserAccess,
  getUpdateFunction()
);

/**
 * @route   PUT /api/utilisateurs/:id/statut
 * @desc    Changer le statut d'un utilisateur
 * @access  Privé - Admin/Modérateur uniquement
 */
router.put('/:id/statut',
  moderationLimiter,
  authMiddleware,
  adminMiddleware,
  validateUserId,
  validateStatusChange,
  handleValidationErrors,
  changerStatutUtilisateur || createFallback('changement de statut', 'admin')
);

/**
 * @route   POST /api/utilisateurs/:id/bloquer
 * @desc    Bloquer un utilisateur
 * @access  Privé - Admin/Modérateur uniquement
 */
router.post('/:id/bloquer',
  moderationLimiter,
  authMiddleware,
  moderateurMiddleware || adminMiddleware,
  validateUserId,
  [
    body('raison')
      .trim()
      .isLength({ min: 10, max: 500 })
      .withMessage('Raison du blocage requise (10-500 caractères)')
  ],
  handleValidationErrors,
  bloquerUtilisateur || createFallback('blocage utilisateur', 'moderateur')
);

/**
 * @route   POST /api/utilisateurs/:id/debloquer
 * @desc    Débloquer un utilisateur
 * @access  Privé - Admin/Modérateur uniquement
 */
router.post('/:id/debloquer',
  moderationLimiter,
  authMiddleware,
  moderateurMiddleware || adminMiddleware,
  validateUserId,
  [
    body('raison')
      .trim()
      .isLength({ min: 10, max: 500 })
      .withMessage('Raison du déblocage requise (10-500 caractères)')
  ],
  handleValidationErrors,
  debloquerUtilisateur || createFallback('déblocage utilisateur', 'moderateur')
);
/**
 * @route   POST /api/utilisateurs/:id/suspendre
 * @desc    Suspendre temporairement un utilisateur
 * @access  Privé - Admin/Modérateur uniquement
 */
router.post('/:id/suspendre',
  moderationLimiter,
  authMiddleware,
  moderateurMiddleware || adminMiddleware,
  validateUserId,
  [
    body('raison')
      .trim()
      .isLength({ min: 10, max: 500 })
      .withMessage('Raison de la suspension requise'),
    body('duree')
      .isInt({ min: 1, max: 365 })
      .withMessage('Durée de suspension invalide (1-365 jours)')
  ],
  handleValidationErrors,
  suspendreUtilisateur || createFallback('suspension utilisateur', 'moderateur')
);

/**
 * @route   POST /api/utilisateurs/:id/reactiver
 * @desc    Réactiver un utilisateur suspendu
 * @access  Privé - Admin/Modérateur uniquement
 */
router.post('/:id/reactiver',
  moderationLimiter,
  authMiddleware,
  moderateurMiddleware || adminMiddleware,
  validateUserId,
  [
    body('raison')
      .trim()
      .isLength({ min: 10, max: 500 })
      .withMessage('Raison de la réactivation requise')
  ],
  handleValidationErrors,
  reactiverUtilisateur || createFallback('réactivation utilisateur', 'moderateur')
);

/**
 * @route   DELETE /api/utilisateurs/:id
 * @desc    Supprimer définitivement un utilisateur
 * @access  Privé - Admin uniquement
 */
router.delete('/:id', 
  adminActionLimiter,
  authMiddleware, 
  adminMiddleware,
  validateUserId,
  [
    body('confirmation')
      .equals('SUPPRIMER_DEFINITIVEMENT')
      .withMessage('Confirmation requise: SUPPRIMER_DEFINITIVEMENT'),
    body('raison')
      .trim()
      .isLength({ min: 20, max: 500 })
      .withMessage('Raison détaillée requise (20-500 caractères)')
  ],
  handleValidationErrors,
  supprimerUtilisateur || createFallback('suppression utilisateur', 'admin')
);

// =============== ROUTES DE MODÉRATION ===============

/**
 * @route   GET /api/utilisateurs/moderation/signales
 * @desc    Obtenir les utilisateurs signalés
 * @access  Privé - Modérateur/Admin
 */
router.get('/moderation/signales',
  generalLimiter,
  authMiddleware,
  moderateurMiddleware || adminMiddleware,
  obtenirUtilisateursSignales || createFallback('utilisateurs signalés', 'moderateur')
);

/**
 * @route   POST /api/utilisateurs/:id/moderation
 * @desc    Action de modération sur un utilisateur
 * @access  Privé - Modérateur/Admin
 */
router.post('/:id/moderation',
  moderationLimiter,
  authMiddleware,
  moderateurMiddleware || adminMiddleware,
  validateUserId,
  validateModerationAction,
  handleValidationErrors,
  traiterSignalement || createFallback('action de modération', 'moderateur')
);

/**
 * @route   GET /api/utilisateurs/moderation/historique
 * @desc    Historique des actions de modération
 * @access  Privé - Admin
 */
router.get('/moderation/historique',
  generalLimiter,
  authMiddleware,
  adminMiddleware,
  obtenirHistoriqueModeration || createFallback('historique modération', 'admin')
);

// =============== ROUTES DE VÉRIFICATION DE DOCUMENTS ===============

/**
 * @route   POST /api/utilisateurs/:id/verifier-document
 * @desc    Vérifier le document d'identité d'un utilisateur
 * @access  Privé - Admin/Modérateur
 */
router.post('/:id/verifier-document',
  moderationLimiter,
  authMiddleware,
  moderateurMiddleware || adminMiddleware,
  validateUserId,
  [
    body('statut')
      .isIn(['VERIFIE'])
      .withMessage('Statut invalide pour vérification (VERIFIE)'),
    body('commentaire')
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Commentaire trop long (max 500 caractères)')
  ],
  handleValidationErrors,
  verifierDocumentUtilisateur || createFallback('vérification document', 'moderateur')
);

/**
 * @route   POST /api/utilisateurs/:id/rejeter-document
 * @desc    Rejeter le document d'identité d'un utilisateur
 * @access  Privé - Admin/Modérateur
 */
router.post('/:id/rejeter-document',
  moderationLimiter,
  authMiddleware,
  moderateurMiddleware || adminMiddleware,
  validateUserId,
  [
    body('raison')
      .trim()
      .isLength({ min: 20, max: 500 })
      .withMessage('Raison du rejet requise (20-500 caractères)'),
    body('typeProbleme')
      .isIn(['DOCUMENT_ILLISIBLE', 'DOCUMENT_EXPIRE', 'DOCUMENT_FALSIFIE', 'INFORMATIONS_NON_CONFORMES', 'QUALITE_INSUFFISANTE', 'AUTRE'])
      .withMessage('Type de problème invalide'),
    body('commentaire')
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Commentaire trop long (max 500 caractères)')
  ],
  handleValidationErrors,
  rejeterDocumentUtilisateur || createFallback('rejet document', 'moderateur')
);

// =============== ROUTES DE MONITORING ET SANTÉ ===============

/**
 * @route   GET /api/utilisateurs/health
 * @desc    Vérifier l'état de santé du service utilisateurs
 * @access  Public
 */
router.get('/health', (req, res) => {
  const availableFunctions = Object.keys(utilisateursController).filter(key => 
    typeof utilisateursController[key] === 'function'
  );

  const functionStatus = {
    // CRUD de base
    obtenirUtilisateurs: typeof obtenirUtilisateurs === 'function',
    obtenirUtilisateur: typeof obtenirUtilisateur === 'function',
    creerUtilisateur: typeof creerUtilisateur === 'function',
    updateFunction: typeof getUpdateFunction() === 'function',
    supprimerUtilisateur: typeof supprimerUtilisateur === 'function',
    
    // Fonctions avancées
    rechercherUtilisateurs: typeof rechercherUtilisateurs === 'function',
    obtenirStatistiquesUtilisateurs: typeof obtenirStatistiquesUtilisateurs === 'function',
    changerStatutUtilisateur: typeof changerStatutUtilisateur === 'function',
    exporterUtilisateurs: typeof exporterUtilisateurs === 'function',
    
    // Fonctions de modération
    bloquerUtilisateur: typeof bloquerUtilisateur === 'function',
    suspendreUtilisateur: typeof suspendreUtilisateur === 'function',
    verifierDocumentUtilisateur: typeof verifierDocumentUtilisateur === 'function'
  };

  res.json({
    success: true,
    message: 'Service utilisateurs opérationnel',
    timestamp: new Date().toISOString(),
    version: '2.0.0',
    controllerStatus: {
      loaded: Object.keys(utilisateursController).length > 0,
      functionsTotal: Object.keys(utilisateursController).length,
      functionsAvailable: availableFunctions.length,
      functionsImplemented: Object.values(functionStatus).filter(Boolean).length
    },
    functionStatus,
    availableFunctions: availableFunctions.slice(0, 20), // Limite à 20 pour éviter une réponse trop longue
    routes: {
      crud: ['GET /', 'GET /:id', 'POST /', 'PUT /:id', 'PATCH /:id', 'DELETE /:id'],
      recherche: ['GET /rechercher', 'GET /actifs', 'GET /recents', 'GET /role/:role'],
      statistiques: ['GET /statistiques', 'GET /statistiques/globales', 'GET /statistiques/periode'],
      rapports: ['GET /rapport/activite'],
      moderation: ['GET /moderation/signales', 'POST /:id/moderation', 'GET /moderation/historique'],
      actions: ['POST /:id/bloquer', 'POST /:id/debloquer', 'POST /:id/suspendre', 'POST /:id/reactiver'],
      verification: ['POST /:id/verifier-document', 'POST /:id/rejeter-document'],
      utilitaires: ['GET /health', 'GET /export']
    }
  });
});

// =============== GESTION CENTRALISÉE DES ERREURS ===============

/**
 * Middleware d'erreurs spécifique au router utilisateurs
 */
router.use((error, req, res, _next) => {
  console.error('❌ Erreur dans le router utilisateurs:', {
    message: error.message,
    stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    url: req.url,
    method: req.method,
    timestamp: new Date().toISOString(),
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    userId: req.user?.userId,
    userRole: req.user?.role
  });

  // Gestion des erreurs AppError ou erreurs structurées
  if (error instanceof AppError || (error && typeof error.status === 'number' && typeof error.code === 'string')) {
    return res.status(error.status).json({
      success: false,
      code: error.code,
      message: error.message,
      ...(error.context ? { context: error.context } : {}),
      timestamp: new Date().toISOString()
    });
  }

  // Gestion des erreurs de validation Mongoose
  if (error.name === 'ValidationError') {
    const validationErrors = Object.values(error.errors).map(err => ({
      field: err.path,
      message: err.message,
      value: err.value,
      kind: err.kind
    }));

    return res.status(400).json({
      success: false,
      code: 'VALIDATION_ERROR',
      message: 'Erreur de validation des données utilisateur',
      errors: validationErrors,
      timestamp: new Date().toISOString()
    });
  }

  // Gestion des erreurs de duplication MongoDB (E11000)
  if (error.code === 11000) {
    const field = Object.keys(error.keyPattern || {})[0];
    const value = error.keyValue ? error.keyValue[field] : 'inconnue';
    
    const friendlyFieldNames = {
      email: 'adresse email',
      telephone: 'numéro de téléphone',
      'documentIdentite.numero': 'numéro de document'
    };
    
    const friendlyField = friendlyFieldNames[field] || field;
    
    return res.status(409).json({
      success: false,
      code: 'DUPLICATE_ERROR',
      message: `Un utilisateur avec cette ${friendlyField} existe déjà`,
      field,
      value,
      timestamp: new Date().toISOString()
    });
  }

  // Gestion des erreurs CastError (ID MongoDB invalide)
  if (error.name === 'CastError') {
    if (error.kind === 'ObjectId') {
      return res.status(400).json({
        success: false,
        code: 'INVALID_USER_ID',
        message: 'Identifiant utilisateur invalide',
        field: error.path,
        value: error.value,
        timestamp: new Date().toISOString()
      });
    }
    
    return res.status(400).json({
      success: false,
      code: 'INVALID_DATA_TYPE',
      message: `Type de données invalide pour le champ ${error.path}`,
      field: error.path,
      expectedType: error.kind,
      receivedValue: error.value,
      timestamp: new Date().toISOString()
    });
  }

  // Gestion des erreurs de parsing JSON Express
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({
      success: false,
      code: 'INVALID_JSON',
      message: 'Format JSON invalide dans la requête',
      details: 'Vérifiez la syntaxe de votre JSON',
      timestamp: new Date().toISOString()
    });
  }

  // Gestion des erreurs de taille de payload
  if (error.type === 'entity.too.large') {
    return res.status(413).json({
      success: false,
      code: 'PAYLOAD_TOO_LARGE',
      message: 'Données de la requête trop volumineuses',
      maxSize: '10MB',
      timestamp: new Date().toISOString()
    });
  }

  // Gestion des erreurs de timeout MongoDB
  if (error.name === 'MongoTimeoutError' || error.code === 'ETIMEOUT') {
    return res.status(408).json({
      success: false,
      code: 'DATABASE_TIMEOUT',
      message: 'Délai d\'attente de la base de données dépassé',
      timestamp: new Date().toISOString()
    });
  }

  // Gestion des erreurs de connexion MongoDB
  if (error.name === 'MongoNetworkError') {
    return res.status(503).json({
      success: false,
      code: 'DATABASE_UNAVAILABLE',
      message: 'Base de données temporairement indisponible',
      timestamp: new Date().toISOString()
    });
  }

  // Gestion des erreurs d'autorisation JWT
  if (error.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      code: 'INVALID_TOKEN',
      message: 'Token d\'authentification invalide',
      timestamp: new Date().toISOString()
    });
  }

  if (error.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      code: 'TOKEN_EXPIRED',
      message: 'Token d\'authentification expiré',
      expiredAt: error.expiredAt,
      timestamp: new Date().toISOString()
    });
  }

  // Gestion des erreurs de limites de taux (rate limiting)
  if (error.status === 429) {
    return res.status(429).json({
      success: false,
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Trop de requêtes. Veuillez patienter avant de réessayer.',
      retryAfter: error.retryAfter || '15 minutes',
      timestamp: new Date().toISOString()
    });
  }

  // Gestion des erreurs de permissions insuffisantes
  if (error.status === 403) {
    return res.status(403).json({
      success: false,
      code: 'INSUFFICIENT_PRIVILEGES',
      message: 'Privilèges insuffisants pour cette action',
      requiredRole: error.requiredRole,
      timestamp: new Date().toISOString()
    });
  }

  // Gestion des erreurs de ressource non trouvée
  if (error.status === 404) {
    return res.status(404).json({
      success: false,
      code: 'RESOURCE_NOT_FOUND',
      message: 'Ressource utilisateur non trouvée',
      timestamp: new Date().toISOString()
    });
  }

  // Gestion des erreurs de conflit de données
  if (error.status === 409) {
    return res.status(409).json({
      success: false,
      code: 'DATA_CONFLICT',
      message: 'Conflit de données détecté',
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }

  // Gestion des erreurs internes du serveur
  if (error.status >= 500) {
    return res.status(error.status || 500).json({
      success: false,
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Erreur interne du serveur',
      errorId: error.errorId || Date.now().toString(),
      timestamp: new Date().toISOString()
    });
  }

  // Pour toutes les autres erreurs non gérées
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  return res.status(500).json({
    success: false,
    code: 'UNKNOWN_ERROR',
    message: 'Une erreur inattendue s\'est produite',
    ...(isDevelopment && {
      details: error.message,
      stack: error.stack,
      name: error.name
    }),
    errorId: Date.now().toString(),
    timestamp: new Date().toISOString()
  });
});

// =============== EXPORT DU ROUTER ===============

module.exports = router;