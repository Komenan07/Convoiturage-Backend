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
  confirmerReinitialisationMotDePasse
} = require('../controllers/authController');

// Import du middleware d'authentification
const { authMiddleware } = require('../middlewares/authMiddleware');

// =============== ROUTES PUBLIQUES ===============

/**
 * @route   POST /api/auth/inscription
 * @desc    Inscription d'un nouvel utilisateur
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
        'POST /reset-password/:token'
      ],
      protegees: [
        'POST /deconnexion',
        'POST /logout',
        'GET /verify',
        'GET /me',
        'GET /profil',
        'GET /user'
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
    timestamp: new Date().toISOString()
  });
});

// =============== GESTION D'ERREURS ===============

// Middleware de gestion d'erreurs pour les routes d'authentification
router.use((error, req, res, _next) => {
  console.error('Erreur dans les routes d\'authentification:', {
    error: error.message,
    stack: error.stack,
    url: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString()
  });

  // Erreurs JWT spécifiques
  if (error.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      message: 'Token invalide'
    });
  }

  if (error.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      message: 'Token expiré'
    });
  }

  // Erreurs de validation
  if (error.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      message: 'Données de requête invalides',
      details: error.message
    });
  }

  // Erreur générique
  res.status(500).json({
    success: false,
    message: 'Erreur interne du serveur d\'authentification',
    ...(process.env.NODE_ENV === 'development' && {
      error: error.message,
      stack: error.stack
    })
  });
});

module.exports = router;