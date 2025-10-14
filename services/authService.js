// routes/auth.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authService = require('../services/authService');
const { loginValidation, registerValidation, resetPasswordValidation } = require('../validators/authValidator');
const { validationResult } = require('express-validator');

// Middleware de validation
const validate = (validations) => {
  return async (req, res, next) => {
    await Promise.all(validations.map(validation => validation.run(req)));
    
    const errors = validationResult(req);
    if (errors.isEmpty()) return next();
    
    res.status(400).json({
      success: false,
      errors: errors.array()
    });
  };
};

// =============== ROUTES PUBLIQUES ===============

// Inscription
router.post(
  '/register',
  validate(registerValidation),
  authController.inscription
);

// Connexion standard
router.post(
  '/login',
  validate(loginValidation),
  authController.connexion
);

// Connexion administrateur
router.post(
  '/admin/login',
  validate(loginValidation),
  authController.connexionAdmin
);

// Demande de réinitialisation de mot de passe
router.post(
  '/forgot-password',
  authController.motDePasseOublie
);

// Confirmation du token de réinitialisation
router.get(
  '/confirm-reset/:token',
  authController.confirmerReinitialisationMotDePasse
);

// Réinitialisation du mot de passe
router.post(
  '/reset-password/:token',
  validate(resetPasswordValidation),
  authController.reinitialiserMotDePasse
);

// =============== ROUTES PROTÉGÉES ===============

// Middleware d'authentification
const authenticate = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Token d\'authentification manquant'
      });
    }

    const decoded = authService.verifyToken(token);
    req.user = decoded;
    
    next();
  } catch (error) {
    const status = error.name === 'TokenExpiredError' ? 401 : 403;
    res.status(status).json({
      success: false,
      message: error.message
    });
  }
};

// Vérification de token
router.get(
  '/verify',
  authenticate,
  authController.verifierToken
);

// Déconnexion
router.post(
  '/logout',
  authenticate,
  authController.deconnexion
);

// Rafraîchissement de token
router.post(
  '/refresh-token',
  authenticate,
  authController.rafraichirToken
);

// Récupération du profil utilisateur
router.get(
  '/me',
  authenticate,
  authController.obtenirUtilisateurConnecte
);

module.exports = router;