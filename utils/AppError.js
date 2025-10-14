// utils/AppError.js
const CODES = require('./errorCodes');

class AppError extends Error {
  constructor(message, { code, status = 400, context, isOperational = true } = {}) {
    super(message);
    this.code = code;
    this.status = status;
    this.context = context;
    this.isOperational = isOperational;
    this.timestamp = new Date().toISOString();
    Error.captureStackTrace?.(this, this.constructor);
  }

  toJSON() {
    return {
      success: false,
      message: this.message,
      code: this.code,
      timestamp: this.timestamp,
      ...(this.context ? { context: this.context } : {})
    };
  }

  // Factories
  static accountDisabled(context) {
    return new AppError('Compte désactivé. Contactez le support.', {
      code: CODES.ACCOUNT_DISABLED,
      status: 403,
      context
    });
  }

  static accountSuspended(context) {
    return new AppError('Votre compte a été suspendu. Contactez le support.', {
      code: CODES.ACCOUNT_SUSPENDED,
      status: 403,
      context
    });
  }

  static accountPermanentlyBlocked(context) {
    return new AppError('Votre compte a été définitivement bloqué. Contactez le support.', {
      code: CODES.ACCOUNT_PERMANENTLY_BLOCKED,
      status: 403,
      context
    });
  }

  static accountPendingVerification(context) {
    return new AppError('Votre compte est en attente de vérification.', {
      code: CODES.ACCOUNT_PENDING_VERIFICATION,
      status: 403,
      context
    });
  }

  static accountTemporarilyBlocked(context) {
    return new AppError('Votre compte est temporairement bloqué.', {
      code: CODES.ACCOUNT_TEMPORARILY_BLOCKED,
      status: 403,
      context
    });
  }

  static userNotFound(context) {
    return new AppError('Utilisateur non trouvé. Token invalide.', {
      code: CODES.USER_NOT_FOUND,
      status: 401,
      context
    });
  }

  static tokenMissing() {
    return new AppError("Accès refusé. Token d'authentification manquant.", {
      code: CODES.AUTH_TOKEN_MISSING,
      status: 401
    });
  }

  static invalidToken() {
    return new AppError('Token invalide.', {
      code: CODES.INVALID_TOKEN,
      status: 401
    });
  }

  static tokenExpired() {
    return new AppError('Token expiré. Veuillez vous reconnecter.', {
      code: CODES.TOKEN_EXPIRED,
      status: 401
    });
  }

  static serverError(message = "Erreur serveur", context) {
    return new AppError(message, {
      code: CODES.SERVER_ERROR,
      status: 500,
      context,
      isOperational: false
    });
  }
}

module.exports = AppError;


