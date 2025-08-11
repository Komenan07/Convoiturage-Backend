// utils/errorResponse.js

/**
 * Classe personnalisée pour les erreurs avec code de statut HTTP
 */
class ErrorResponse extends Error {
  constructor(message, statusCode, validationErrors = null) {
    super(message);
    this.statusCode = statusCode;
    this.validationErrors = validationErrors;

    // Capturer la stack trace
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = ErrorResponse;