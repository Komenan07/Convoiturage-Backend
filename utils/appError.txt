// appError.js

class AppError extends Error {
  constructor(message, statusCode, code, details = {}) {
    super(message);
    
    // Propriétés personnalisées
    this.statusCode = statusCode || 500;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.code = code || 'INTERNAL_ERROR';
    this.details = details;
    this.isOperational = true;
    this.timestamp = new Date().toISOString();
    
    // Capture de la stack trace
    Error.captureStackTrace(this, this.constructor);
  }
  
  // Méthode pour formater l'erreur pour la réponse API
  toJSON() {
    return {
      success: false,
      code: this.code,
      message: this.message,
      ...(process.env.NODE_ENV === 'development' && {
        stack: this.stack,
        details: this.details
      })
    };
  }
  
  // Méthode pour créer des erreurs pré-définies
  static badRequest(message = 'Requête invalide', details) {
    return new AppError(message, 400, 'BAD_REQUEST', details);
  }
  
  static unauthorized(message = 'Non autorisé') {
    return new AppError(message, 401, 'UNAUTHORIZED');
  }
  
  static forbidden(message = 'Accès interdit') {
    return new AppError(message, 403, 'FORBIDDEN');
  }
  
  static notFound(message = 'Ressource non trouvée') {
    return new AppError(message, 404, 'NOT_FOUND');
  }
  
  static conflict(message = 'Conflit de données') {
    return new AppError(message, 409, 'CONFLICT');
  }
  
  static validationError(errors) {
    return new AppError('Erreur de validation', 422, 'VALIDATION_ERROR', { errors });
  }
  
  static internalError(message = 'Erreur interne du serveur') {
    return new AppError(message, 500, 'INTERNAL_ERROR');
  }
}

module.exports = AppError;