// =====================================================
// ROUTES ADMINISTRATEUR 
// =====================================================

const express = require('express');
const { body } = require('express-validator');
const router = express.Router();

// Import du contrôleur
const {
  // Authentification
  connexionAdmin,
  obtenirProfil,
  
  // Gestion des utilisateurs
  listerUtilisateurs,
  obtenirUtilisateurParId,
  modifierStatutUtilisateur,
  verifierDocumentIdentite,
  operationFinanciere,
  creerAdmin,
  supprimerUtilisateur,
  
  // Tableau de bord et statistiques
  obtenirDashboard,
  obtenirRapports
} = require('../../controllers/admin/adminController');

// Import des middlewares
const { authMiddleware, adminMiddleware } = require('../../middlewares/authMiddleware');
const { rateLimiter } = require('../../middlewares/rateLimiterMiddleware');

// =====================================================
// MIDDLEWARES DE VALIDATION
// =====================================================

// Validation pour la connexion admin
const validationConnexionAdmin = [
  body('email')
    .isEmail()
    .withMessage('Format email invalide')
    .normalizeEmail()
    .isLength({ min: 5, max: 100 })
    .withMessage('Email doit contenir entre 5 et 100 caractères'),
    
  body('motDePasse')
    .isLength({ min: 8, max: 128 })
    .withMessage('Mot de passe doit contenir entre 8 et 128 caractères')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Mot de passe doit contenir au moins une majuscule, une minuscule, un chiffre et un caractère spécial')
];

// Validation pour la création d'admin
const validationCreationAdmin = [
  body('email')
    .isEmail()
    .withMessage('Format email invalide')
    .normalizeEmail()
    .isLength({ min: 5, max: 100 })
    .withMessage('Email doit contenir entre 5 et 100 caractères'),
    
  body('motDePasse')
    .isLength({ min: 8, max: 128 })
    .withMessage('Mot de passe doit contenir entre 8 et 128 caractères')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
    .withMessage('Mot de passe doit contenir au moins une majuscule, une minuscule, un chiffre et un caractère spécial'),
    
  body('nom')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Nom doit contenir entre 2 et 50 caractères')
    .matches(/^[a-zA-ZÀ-ÿ\s'-]+$/)
    .withMessage('Nom ne peut contenir que des lettres, espaces, apostrophes et tirets'),
    
  body('prenom')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Prénom doit contenir entre 2 et 50 caractères')
    .matches(/^[a-zA-ZÀ-ÿ\s'-]+$/)
    .withMessage('Prénom ne peut contenir que des lettres, espaces, apostrophes et tirets'),
    
  body('telephone')
    .matches(/^(\+225)?[0-9]{8,10}$/)
    .withMessage('Format de téléphone invalide (exemple: +22507123456 ou 07123456)')
];

// Validation pour la modification de statut
const validationStatutUtilisateur = [
  body('statutCompte')
    .isIn(['ACTIF', 'SUSPENDU', 'BLOQUE', 'EN_ATTENTE_VERIFICATION'])
    .withMessage('Statut invalide'),
    
  body('raison')
    .optional()
    .isLength({ min: 3, max: 255 })
    .withMessage('Raison doit contenir entre 3 et 255 caractères')
];

// Validation pour la vérification de document
const validationVerificationDocument = [
  body('statutVerification')
    .isIn(['VERIFIE', 'REJETE', 'EN_ATTENTE'])
    .withMessage('Statut de vérification invalide'),
    
  body('raisonRejet')
    .if(body('statutVerification').equals('REJETE'))
    .notEmpty()
    .withMessage('Raison de rejet requise pour un rejet')
    .isLength({ min: 10, max: 500 })
    .withMessage('Raison de rejet doit contenir entre 10 et 500 caractères')
];

// Validation pour les opérations financières
const validationOperationFinanciere = [
  body('operation')
    .isIn(['crediter', 'debiter', 'rembourser_commission', 'ajuster_solde'])
    .withMessage('Type d\'opération invalide'),
    
  body('montant')
    .isNumeric()
    .withMessage('Montant doit être numérique')
    .custom((value) => {
      if (parseFloat(value) <= 0) {
        throw new Error('Montant doit être positif');
      }
      if (parseFloat(value) > 1000000) {
        throw new Error('Montant ne peut pas dépasser 1,000,000 FCFA');
      }
      return true;
    }),
    
  body('raison')
    .isLength({ min: 10, max: 255 })
    .withMessage('Raison doit contenir entre 10 et 255 caractères'),
    
  body('referenceTransaction')
    .optional()
    .isLength({ min: 5, max: 50 })
    .withMessage('Référence transaction doit contenir entre 5 et 50 caractères')
];



// =====================================================
// ROUTES D'AUTHENTIFICATION
// =====================================================

/**
 * @route   POST /api/admin/auth/login
 * @desc    Connexion administrateur
 * @access  Public
 */
router.post('/auth/login', [
  rateLimiter.connexion, // Limiter les tentatives de connexion
  ...validationConnexionAdmin
], connexionAdmin);

/**
 * @route   GET /api/admin/auth/profil
 * @desc    Obtenir le profil de l'admin connecté
 * @access  Private (Admin)
 */
router.get('/auth/profil', [
  authMiddleware,
  adminMiddleware
], obtenirProfil);

// =====================================================
// ROUTES DE GESTION DES UTILISATEURS
// =====================================================

/**
 * @route   GET /api/admin/utilisateurs
 * @desc    Obtenir la liste de tous les utilisateurs avec filtres et pagination
 * @access  Private (Admin)
 * @params  ?page=1&limit=10&sort=-dateInscription&role=conducteur&email=test&telephone=07&nom=dupont&statutCompte=ACTIF&estVerifie=true&dateDebut=2024-01-01&dateFin=2024-12-31
 */
router.get('/utilisateurs', [
  authMiddleware,
  adminMiddleware,
  rateLimiter.general
], listerUtilisateurs);

/**
 * @route   GET /api/admin/utilisateurs/:id
 * @desc    Obtenir un utilisateur par ID
 * @access  Private (Admin)
 */
router.get('/utilisateurs/:id', [
  authMiddleware,
  adminMiddleware
], obtenirUtilisateurParId);

/**
 * @route   POST /api/admin/utilisateurs/creer-admin
 * @desc    Créer un nouvel administrateur
 * @access  Private (Admin)
 */
router.post('/utilisateurs/creer-admin', [
  authMiddleware,
  adminMiddleware,
  rateLimiter.creation,
  ...validationCreationAdmin
], creerAdmin);

/**
 * @route   PATCH /api/admin/utilisateurs/:id/statut
 * @desc    Modifier le statut d'un utilisateur
 * @access  Private (Admin)
 */
router.patch('/utilisateurs/:id/statut', [
  authMiddleware,
  adminMiddleware,
  ...validationStatutUtilisateur
], modifierStatutUtilisateur);

/**
 * @route   PATCH /api/admin/utilisateurs/:id/verification-document
 * @desc    Vérifier les documents d'identité d'un utilisateur
 * @access  Private (Admin)
 */
router.patch('/utilisateurs/:id/verification-document', [
  authMiddleware,
  adminMiddleware,
  ...validationVerificationDocument
], verifierDocumentIdentite);

/**
 * @route   POST /api/admin/utilisateurs/:id/operation-financiere
 * @desc    Effectuer une opération financière sur le compte covoiturage
 * @access  Private (Admin)
 */
router.post('/utilisateurs/:id/operation-financiere', [
  authMiddleware,
  adminMiddleware,
  rateLimiter.operationsFinancieres,
  ...validationOperationFinanciere
], operationFinanciere);

/**
 * @route   DELETE /api/admin/utilisateurs/:id
 * @desc    Supprimer un utilisateur (soft delete)
 * @access  Private (Admin)
 */
router.delete('/utilisateurs/:id', [
  authMiddleware,
  adminMiddleware,
  rateLimiter.suppression
], supprimerUtilisateur);

// =====================================================
// ROUTES TABLEAU DE BORD ET STATISTIQUES
// =====================================================

/**
 * @route   GET /api/admin/dashboard
 * @desc    Obtenir les statistiques globales du tableau de bord
 * @access  Private (Admin)
 */
router.get('/dashboard', [
  authMiddleware,
  adminMiddleware,
  rateLimiter.general
], obtenirDashboard);

/**
 * @route   GET /api/admin/rapports
 * @desc    Obtenir des rapports avancés
 * @access  Private (Admin)
 * @params  ?type=inscriptions&dateDebut=2024-01-01&dateFin=2024-12-31
 */
router.get('/rapports', [
  authMiddleware,
  adminMiddleware,
  rateLimiter.rapports
], obtenirRapports);

// =====================================================
// MIDDLEWARE DE GESTION D'ERREURS POUR LES ROUTES ADMIN
// =====================================================

// Gestion des erreurs 404 pour les routes admin non trouvées
router.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route administrateur introuvable',
    code: 'ADMIN_ROUTE_NOT_FOUND',
    requestedPath: req.originalUrl
  });
});

// Gestion globale des erreurs pour les routes admin
router.use((error, req, res, _next) => {
  console.error('Erreur dans les routes admin:', error);
  
  // Erreur de validation Mongoose
  if (error.name === 'ValidationError') {
    const erreurs = Object.values(error.errors).map(err => ({
      champ: err.path,
      message: err.message
    }));
    
    return res.status(400).json({
      success: false,
      message: 'Erreur de validation',
      code: 'MONGOOSE_VALIDATION_ERROR',
      data: { erreurs }
    });
  }
  
  // Erreur de cast (ID invalide)
  if (error.name === 'CastError') {
    return res.status(400).json({
      success: false,
      message: 'ID utilisateur invalide',
      code: 'INVALID_USER_ID'
    });
  }
  
  // Erreur JWT
  if (error.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      message: 'Token invalide',
      code: 'INVALID_TOKEN'
    });
  }
  
  // Erreur JWT expiré
  if (error.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      message: 'Token expiré',
      code: 'TOKEN_EXPIRED'
    });
  }
  
  // Erreur par défaut
  res.status(error.statusCode || 500).json({
    success: false,
    message: error.message || 'Erreur serveur interne',
    code: error.code || 'INTERNAL_SERVER_ERROR'
  });
});

module.exports = router;