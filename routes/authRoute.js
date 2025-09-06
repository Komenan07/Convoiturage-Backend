// routes/authRoute.js
const express = require('express');
const router = express.Router();

// =============== IMPORTS ===============
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
  renvoyerConfirmationEmail,
  // NOUVELLES FONCTIONS PORTEFEUILLE
  obtenirStatutPortefeuille,
  verifierEligibiliteRetrait,
  initialiserPortefeuille,
  obtenirHistoriqueRecentPortefeuille
} = require('../controllers/authController');

const { authMiddleware } = require('../middlewares/authMiddleware');
const AppError = require('../utils/AppError');

// =============== ROUTES PUBLIQUES - INSCRIPTION ===============

/**
 * @route   POST /api/auth/inscription
 * @desc    Inscription d'un nouvel utilisateur avec envoi d'email de confirmation
 * @access  Public
 */
router.post('/inscription', inscription);

// =============== ROUTES PUBLIQUES - CONNEXION ===============

/**
 * @route   POST /api/auth/connexion
 * @route   POST /api/auth/login (alias)
 * @desc    Connexion utilisateur standard
 * @access  Public
 */
router.post('/connexion', connexion);
router.post('/login', connexion);

/**
 * @route   POST /api/auth/admin/connexion
 * @route   POST /api/auth/admin/login (alias)
 * @desc    Connexion administrateur
 * @access  Public
 */
router.post('/admin/connexion', connexionAdmin);
router.post('/admin/login', connexionAdmin);

// =============== ROUTES PUBLIQUES - GESTION DES TOKENS ===============

/**
 * @route   POST /api/auth/refresh
 * @desc    Rafraîchir le token d'accès avec le refresh token
 * @access  Public
 */
router.post('/refresh', rafraichirToken);

// =============== ROUTES PUBLIQUES - MOT DE PASSE OUBLIÉ ===============

/**
 * @route   POST /api/auth/forgot-password
 * @route   POST /api/auth/mot-de-passe-oublie (alias français)
 * @desc    Demande de réinitialisation de mot de passe
 * @access  Public
 */
router.post('/forgot-password', motDePasseOublie);
router.post('/mot-de-passe-oublie', demandeReinitialisationMotDePasse);

/**
 * @route   GET /api/auth/reset-password/:token
 * @desc    Vérifier la validité du token de réinitialisation
 * @access  Public
 */
router.get('/reset-password/:token', confirmerReinitialisationMotDePasse);

/**
 * @route   POST /api/auth/reset-password/:token
 * @desc    Réinitialiser le mot de passe avec le token
 * @access  Public
 */
router.post('/reset-password/:token', reinitialiserMotDePasse);

// =============== ROUTES PUBLIQUES - CONFIRMATION EMAIL ===============

/**
 * @route   GET /api/auth/confirm-email/:token
 * @route   GET /api/auth/confirm-email (avec query param ?token=...)
 * @desc    Confirmer l'email de l'utilisateur via un token
 * @access  Public
 */
router.get('/confirm-email/:token', confirmerEmail);
router.get('/confirm-email', confirmerEmail);

/**
 * @route   POST /api/auth/resend-confirmation
 * @desc    Renvoyer l'email de confirmation
 * @access  Public
 */
router.post('/resend-confirmation', renvoyerConfirmationEmail);

// =============== ROUTES PROTÉGÉES - DÉCONNEXION ===============

/**
 * @route   POST /api/auth/deconnexion
 * @route   POST /api/auth/logout (alias anglais)
 * @desc    Déconnexion utilisateur
 * @access  Privé - Token requis
 */
router.post('/deconnexion', authMiddleware, deconnexion);
router.post('/logout', authMiddleware, deconnexion);

// =============== ROUTES PROTÉGÉES - VÉRIFICATION ET PROFIL ===============

/**
 * @route   GET /api/auth/verify
 * @desc    Vérifier la validité du token d'authentification
 * @access  Privé - Token requis
 */
router.get('/verify', authMiddleware, verifierToken);

/**
 * @route   GET /api/auth/me
 * @route   GET /api/auth/profil (alias français)
 * @route   GET /api/auth/user (alias)
 * @desc    Obtenir les informations de l'utilisateur connecté
 * @access  Privé - Token requis
 */
router.get('/me', authMiddleware, obtenirUtilisateurConnecte);
router.get('/profil', authMiddleware, obtenirUtilisateurConnecte);
router.get('/user', authMiddleware, obtenirUtilisateurConnecte);

// =============== NOUVELLES ROUTES PROTÉGÉES - PORTEFEUILLE ===============

/**
 * @route   GET /api/auth/portefeuille/statut
 * @route   GET /api/auth/wallet/status (alias anglais)
 * @desc    Obtenir le statut complet du portefeuille de l'utilisateur
 * @access  Privé - Token requis
 */
router.get('/portefeuille/statut', authMiddleware, obtenirStatutPortefeuille);
router.get('/wallet/status', authMiddleware, obtenirStatutPortefeuille);

/**
 * @route   GET /api/auth/portefeuille/eligibilite-retrait
 * @route   GET /api/auth/wallet/withdrawal-eligibility (alias anglais)
 * @desc    Vérifier l'éligibilité de l'utilisateur pour effectuer des retraits
 * @access  Privé - Token requis
 */
router.get('/portefeuille/eligibilite-retrait', authMiddleware, verifierEligibiliteRetrait);
router.get('/wallet/withdrawal-eligibility', authMiddleware, verifierEligibiliteRetrait);

/**
 * @route   POST /api/auth/portefeuille/initialiser
 * @route   POST /api/auth/wallet/initialize (alias anglais)
 * @desc    Initialiser le portefeuille pour les nouveaux utilisateurs
 * @access  Privé - Token requis
 */
router.post('/portefeuille/initialiser', authMiddleware, initialiserPortefeuille);
router.post('/wallet/initialize', authMiddleware, initialiserPortefeuille);

/**
 * @route   GET /api/auth/portefeuille/historique-recent
 * @route   GET /api/auth/wallet/recent-history (alias anglais)
 * @desc    Obtenir l'historique récent du portefeuille (pour dashboard)
 * @query   ?limit=10 (nombre de transactions à récupérer, défaut: 10)
 * @access  Privé - Token requis
 */
router.get('/portefeuille/historique-recent', authMiddleware, obtenirHistoriqueRecentPortefeuille);
router.get('/wallet/recent-history', authMiddleware, obtenirHistoriqueRecentPortefeuille);

// =============== ROUTES DE MONITORING ET DIAGNOSTICS ===============

/**
 * @route   GET /api/auth/health
 * @desc    Vérifier l'état de santé du service d'authentification
 * @access  Public
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Service d\'authentification opérationnel',
    timestamp: new Date().toISOString(),
    version: '2.1.0',
    features: {
      emailConfirmation: true,
      passwordReset: true,
      refreshToken: true,
      adminAccess: true,
      walletIntegration: true,
      withdrawalEligibility: true
    },
    routes: {
      publiques: [
        'POST /inscription',
        'POST /connexion | /login',
        'POST /admin/connexion | /admin/login',
        'POST /refresh',
        'POST /forgot-password | /mot-de-passe-oublie',
        'GET /reset-password/:token',
        'POST /reset-password/:token',
        'GET /confirm-email/:token | /confirm-email',
        'POST /resend-confirmation'
      ],
      protegees: [
        'POST /deconnexion | /logout',
        'GET /verify',
        'GET /me | /profil | /user',
        'GET /portefeuille/statut | /wallet/status',
        'GET /portefeuille/eligibilite-retrait | /wallet/withdrawal-eligibility',
        'POST /portefeuille/initialiser | /wallet/initialize',
        'GET /portefeuille/historique-recent | /wallet/recent-history'
      ],
      monitoring: [
        'GET /health',
        'GET /test',
        'GET /status'
      ]
    }
  });
});

/**
 * @route   GET /api/auth/test
 * @desc    Route de test simple pour vérifier la connectivité
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
    'EMAIL_PASS',
    'BONUS_BIENVENUE'
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
      baseUrl: process.env.BASE_URL || 'Non configuré',
      bonusBienvenue: process.env.BONUS_BIENVENUE || 'Non configuré',
      variables: envStatus
    },
    services: {
      database: 'Opérationnel',
      email: process.env.EMAIL_HOST ? 'Configuré' : 'Non configuré',
      jwt: process.env.JWT_SECRET ? 'Configuré' : 'Non configuré',
      wallet: 'Intégré'
    },
    newFeatures: {
      walletStatus: 'Actif',
      withdrawalEligibility: 'Actif',
      walletInitialization: 'Actif',
      recentHistory: 'Actif'
    }
  });
});

/**
 * @route   GET /api/auth/portefeuille/info
 * @desc    Informations générales sur les fonctionnalités portefeuille
 * @access  Public
 */
router.get('/portefeuille/info', (req, res) => {
  res.json({
    success: true,
    message: 'Informations sur les fonctionnalités portefeuille',
    fonctionnalites: {
      statut: {
        description: 'Obtenir le solde et les informations générales du portefeuille',
        endpoint: 'GET /api/auth/portefeuille/statut',
        authentification: 'Requise'
      },
      eligibiliteRetrait: {
        description: 'Vérifier si l\'utilisateur peut effectuer des retraits',
        endpoint: 'GET /api/auth/portefeuille/eligibilite-retrait',
        authentification: 'Requise'
      },
      initialisation: {
        description: 'Initialiser le portefeuille avec bonus de bienvenue éventuel',
        endpoint: 'POST /api/auth/portefeuille/initialiser',
        authentification: 'Requise'
      },
      historiqueRecent: {
        description: 'Obtenir les dernières transactions du portefeuille',
        endpoint: 'GET /api/auth/portefeuille/historique-recent?limit=10',
        authentification: 'Requise'
      }
    },
    integration: {
      connexion: 'Les informations portefeuille sont automatiquement incluses lors de la connexion',
      inscription: 'Le portefeuille est initialisé automatiquement à l\'inscription',
      rafraichissement: 'Les données portefeuille sont mises à jour lors du refresh token'
    }
  });
});

// =============== GESTION CENTRALISÉE DES ERREURS ===============

/**
 * Middleware d'erreurs spécifique au router d'authentification
 * Gère les erreurs selon le format AppError unifié
 */
router.use((error, req, res, next) => {
  // Log détaillé de l'erreur pour le debugging
  console.error('Erreur dans le router auth:', {
    message: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    timestamp: new Date().toISOString(),
    userAgent: req.get('User-Agent'),
    ip: req.ip
  });

  // Gestion des erreurs AppError ou erreurs avec structure similaire
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

  // Gestion des erreurs de parsing JSON Express
  if (error.type === 'entity.parse.failed') {
    return res.status(400).json({
      success: false,
      code: 'INVALID_JSON',
      message: 'Format JSON invalide',
      timestamp: new Date().toISOString()
    });
  }

  // Gestion des erreurs de validation Express
  if (error.type === 'entity.too.large') {
    return res.status(413).json({
      success: false,
      code: 'PAYLOAD_TOO_LARGE',
      message: 'Données trop volumineuses',
      timestamp: new Date().toISOString()
    });
  }

  // Gestion des erreurs spécifiques au portefeuille
  if (error.message && error.message.includes('portefeuille')) {
    return res.status(400).json({
      success: false,
      code: 'WALLET_ERROR',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }

  // Pour toutes les autres erreurs, les propager au handler global
  return next(error);
});

// =============== EXPORT DU ROUTER ===============

module.exports = router;