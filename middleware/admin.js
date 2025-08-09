// middleware/admin.js
const ErrorResponse = require('../utils/errorResponse');

/**
 * Middleware pour vérifier les droits administrateur
 * Doit être utilisé après le middleware auth
 */
const admin = (req, res, next) => {
  // Vérifier si l'utilisateur est connecté
  if (!req.user) {
    return next(new ErrorResponse('Accès non autorisé - connexion requise', 401));
  }

  // Vérifier si l'utilisateur a les droits admin
  if (req.user.role !== 'admin' && req.user.role !== 'superadmin') {
    return next(new ErrorResponse('Accès refusé - droits administrateur requis', 403));
  }

  // Vérifier que le compte admin est actif
  if (req.user.statutCompte !== 'ACTIF') {
    return next(new ErrorResponse('Compte administrateur inactif', 403));
  }

  next();
};

/**
 * Middleware pour les super-administrateurs uniquement
 */
const superAdmin = (req, res, next) => {
  if (!req.user) {
    return next(new ErrorResponse('Accès non autorisé - connexion requise', 401));
  }

  if (req.user.role !== 'superadmin') {
    return next(new ErrorResponse('Accès refusé - droits super-administrateur requis', 403));
  }

  if (req.user.statutCompte !== 'ACTIF') {
    return next(new ErrorResponse('Compte super-administrateur inactif', 403));
  }

  next();
};

/**
 * Middleware pour vérifier que l'utilisateur accède à ses propres données
 * ou qu'il est admin
 */
const ownerOrAdmin = (req, res, next) => {
  if (!req.user) {
    return next(new ErrorResponse('Accès non autorisé - connexion requise', 401));
  }

  const isOwner = req.user.id === req.params.id;
  const isAdmin = req.user.role === 'admin' || req.user.role === 'superadmin';

  if (!isOwner && !isAdmin) {
    return next(new ErrorResponse('Accès refusé - vous ne pouvez accéder qu\'à vos propres données', 403));
  }

  next();
};

module.exports = { admin, superAdmin, ownerOrAdmin };