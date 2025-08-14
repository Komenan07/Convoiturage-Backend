// routes/authRoute.js
const express = require('express');
const router = express.Router();
const {
  inscription,
  connexion,
  connexionAdmin,
  deconnexion,
  verifierToken,
  obtenirUtilisateurConnecte,
  rafraichirToken,
  motDePasseOublie,
  reinitialiserMotDePasse,
  demandeReinitialisationMotDePasse,
  confirmerReinitialisationMotDePasse,
  confirmerEmail, 
  renvoyerConfirmationEmail 
} = require('../controllers/authController');
// Import du middleware d'authentification
const { authMiddleware } = require('../middlewares/authMiddleware');
const AppError = require('../utils/AppError');

// =============== ROUTES PUBLIQUES ===============

/**
 * @route   POST /api/auth/inscription
 * @desc    Inscription d'un nouvel utilisateur avec envoi d'email de confirmation
 * @access  Public
 */
router.post('/inscription', inscription);

/**
 * @route   POST /api/auth/connexion
 * @desc    Connexion utilisateur
 * @access  Public
 */
router.post('/connexion', connexion);

/**
 * @route   POST /api/auth/login
 * @desc    Alias pour connexion
 * @access  Public
 */
router.post('/login', connexion);

/**
 * @route   POST /api/auth/admin/connexion
 * @desc    Connexion administrateur
 * @access  Public
 */
router.post('/admin/connexion', connexionAdmin);

/**
 * @route   POST /api/auth/admin/login
 * @desc    Alias pour connexion admin
 * @access  Public
 */
router.post('/admin/login', connexionAdmin);

/**
 * @route   POST /api/auth/refresh
 * @desc    Rafraîchir le token d'accès
 * @access  Public
 */
router.post('/refresh', rafraichirToken);

/**
 * @route   POST /api/auth/forgot-password
 * @desc    Demande de réinitialisation de mot de passe
 * @access  Public
 */
router.post('/forgot-password', motDePasseOublie);

/**
 * @route   POST /api/auth/mot-de-passe-oublie
 * @desc    Demande de réinitialisation (version française)
 * @access  Public
 */
router.post('/mot-de-passe-oublie', demandeReinitialisationMotDePasse);

/**
 * @route   GET /api/auth/reset-password/:token
 * @desc    Vérifier la validité du token de réinitialisation
 * @access  Public
 */
router.get('/reset-password/:token', confirmerReinitialisationMotDePasse);

/**
 * @route   POST /api/auth/reset-password/:token
 * @desc    Réinitialiser le mot de passe
 * @access  Public
 */
router.post('/reset-password/:token', reinitialiserMotDePasse);

/**
 * @route   GET /api/auth/confirm-email/:token
 * @desc    Confirmer l'email de l'utilisateur via un token
 * @access  Public
 */
router.get('/confirm-email/:token', confirmerEmail);

/**
 * @route   GET /api/auth/confirm-email
 * @desc    Confirmer l'email via query param (?token=...)
 * @access  Public
 */
router.get('/confirm-email', confirmerEmail);

/**
 * @route   POST /api/auth/resend-confirmation
 * @desc    Renvoyer l'email de confirmation
 * @access  Public
 */
router.post('/resend-confirmation', renvoyerConfirmationEmail);

// =============== ROUTES PROTÉGÉES ===============

/**
 * @route   POST /api/auth/deconnexion
 * @desc    Déconnexion utilisateur
 * @access  Privé
 */
router.post('/deconnexion', authMiddleware, deconnexion);

/**
 * @route   POST /api/auth/logout
 * @desc    Alias pour déconnexion
 * @access  Privé
 */
router.post('/logout', authMiddleware, deconnexion);

/**
 * @route   GET /api/auth/verify
 * @desc    Vérifier la validité du token
 * @access  Privé
 */
router.get('/verify', authMiddleware, verifierToken);

/**
 * @route   GET /api/auth/me
 * @desc    Obtenir les informations de l'utilisateur connecté
 * @access  Privé
 */
router.get('/me', authMiddleware, obtenirUtilisateurConnecte);

/**
 * @route   GET /api/auth/profil
 * @desc    Alias pour obtenir le profil utilisateur
 * @access  Privé
 */
router.get('/profil', authMiddleware, obtenirUtilisateurConnecte);

/**
 * @route   GET /api/auth/user
 * @desc    Alias pour obtenir l'utilisateur connecté
 * @access  Privé
 */
router.get('/user', authMiddleware, obtenirUtilisateurConnecte);

// =============== ROUTES DE TEST/SANTÉ ===============

/**
 * @route   GET /api/auth/health
 * @desc    Vérifier l'état du service d'authentification
 * @access  Public
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Service d\'authentification opérationnel',
    timestamp: new Date().toISOString(),
    version: '2.0.0',
    features: {
      emailConfirmation: true,
      passwordReset: true,
      refreshToken: true,
      adminAccess: true
    },
    routes: {
      publiques: [
        'POST /inscription',
        'POST /connexion',
        'POST /login',
        'POST /admin/connexion',
        'POST /admin/login',
        'POST /refresh',
        'POST /forgot-password',
        'POST /mot-de-passe-oublie',
        'GET /reset-password/:token',
        'POST /reset-password/:token',
        'GET /confirm-email/:token',
        'GET /confirm-email',
        'POST /resend-confirmation'
      ],
      protegees: [
        'POST /deconnexion',
        'POST /logout',
        'GET /verify',
        'GET /me',
        'GET /profil',
        'GET /user'
      ],
      test: [
        'GET /health',
        'GET /test'
      ]
    }
  });
});

/**
 * @route   GET /api/auth/test
 * @desc    Route de test simple
 * @access  Public
 */
router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'Route d\'authentification accessible',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

/**
 * @route   GET /api/auth/status
 * @desc    Statut détaillé du système d'authentification
 * @access  Public
 */
router.get('/status', (req, res) => {
  const requiredEnvVars = [
    'JWT_SECRET',
    'JWT_REFRESH_SECRET',
    'EMAIL_HOST',
    'EMAIL_PORT',
    'EMAIL_USER',
    'EMAIL_PASS'
  ];
  
  const envStatus = requiredEnvVars.reduce((acc, varName) => {
    acc[varName] = process.env[varName] ? 'Configuré' : 'Manquant';
    return acc;
  }, {});
  
  res.json({
    success: true,
    message: 'Statut du système d\'authentification',
    timestamp: new Date().toISOString(),
    configuration: {
      environment: process.env.NODE_ENV || 'development',
      frontendUrl: process.env.FRONTEND_URL || 'Non configuré',
      variables: envStatus
    },
    services: {
      database: 'Opérationnel', // Vous pourriez ajouter une vérification réelle
      email: process.env.EMAIL_HOST ? 'Configuré' : 'Non configuré',
      jwt: process.env.JWT_SECRET ? 'Configuré' : 'Non configuré'
    }
  });
});

// =============== GESTION D'ERREURS ===============

/**
 * Middleware d'erreurs spécifique au router d'authentification
 * Respecte la structure AppError unifié ou propage l'erreur
 */
router.use((error, req, res, next) => {
  // Log de l'erreur pour le débogage
  console.error('Erreur dans le router auth:', {
    message: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    timestamp: new Date().toISOString()
  });

  // Respecter notre AppError unifié
  if (error instanceof AppError || (error && typeof error.status === 'number' && typeof error.code === 'string')) {
    return res.status(error.status).json({
      success: false,
      code: error.code,
      message: error.message,
      ...(error.context ? { context: error.context } : {}),
      timestamp: new Date().toISOString()
    });
  }

  // Gestion spécifique des erreurs JWT
  if (error.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      code: 'INVALID_TOKEN',
      message: 'Token invalide',
      timestamp: new Date().toISOString()
    });
  }

  if (error.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      code: 'TOKEN_EXPIRED',
      message: 'Token expiré',
      timestamp: new Date().toISOString()
    });
  }

  // Gestion des erreurs de validation Express
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({
      success: false,
      code: 'INVALID_JSON',
      message: 'Format JSON invalide',
      timestamp: new Date().toISOString()
    });
  }

  // Pour toutes les autres erreurs, laisser le handler global décider
  return next(error);
});

module.exports = router;