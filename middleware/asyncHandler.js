// middleware/asyncHandler.js

/**
 * Wrapper pour les fonctions async qui gère automatiquement
 * les erreurs et les passe au middleware d'erreur Express
 */
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

module.exports = asyncHandler;