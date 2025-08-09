// middleware/errorHandler.js
const ErrorResponse = require('../utils/errorResponse');

/**
 * Middleware global de gestion des erreurs
 * Doit être placé en dernier dans app.js
 */
const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log pour le développement
  if (process.env.NODE_ENV === 'development') {
    console.error('🚨 Erreur détectée:', {
      name: err.name,
      message: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method
    });
  }

  // Erreur de validation Mongoose
  if (err.name === 'ValidationError') {
    const message = 'Erreurs de validation';
    const validationErrors = Object.values(err.errors).map(val => ({
      field: val.path,
      message: val.message,
      value: val.value
    }));
    error = new ErrorResponse(message, 400, validationErrors);
  }

  // Erreur de cast Mongoose (ID invalide)
  if (err.name === 'CastError') {
    const message = 'Ressource non trouvée - ID invalide';
    error = new ErrorResponse(message, 404);
  }

  // Erreur de clé dupliquée (unique constraint)
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    const value = err.keyValue[field];
    const message = `${field} "${value}" existe déjà`;
    error = new ErrorResponse(message, 400);
  }

  // Erreur JWT
  if (err.name === 'JsonWebTokenError') {
    const message = 'Token JWT invalide';
    error = new ErrorResponse(message, 401);
  }

  // Token JWT expiré
  if (err.name === 'TokenExpiredError') {
    const message = 'Token JWT expiré';
    error = new ErrorResponse(message, 401);
  }

  // Erreur de connexion à la base de données
  if (err.name === 'MongoNetworkError' || err.name === 'MongooseServerSelectionError') {
    const message = 'Erreur de connexion à la base de données';
    error = new ErrorResponse(message, 500);
  }

  // Réponse d'erreur
  const response = {
    success: false,
    message: error.message || 'Erreur serveur',
    ...(error.validationErrors && { errors: error.validationErrors }),
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  };

  // Codes d'erreur spéciaux
  if (error.deblocageA) {
    response.deblocageA = error.deblocageA;
  }

  res.status(error.statusCode || 500).json(response);
};

module.exports = errorHandler;