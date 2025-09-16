// utils/constants/errorConstants.js
const CODES = require('./errorCodes');

class AppError extends Error {
  constructor(message, options = {}) {
    // Validation du message
    if (!message || typeof message !== 'string') {
      throw new TypeError('Le message d\'erreur est requis et doit être une chaîne');
    }

    super(message);
    
    // Destructuration avec valeurs par défaut
    const { 
      code, 
      status = 400, 
      context, 
      isOperational = true 
    } = options;

    // Validation du status
    if (typeof status !== 'number' || status < 100 || status > 599) {
      throw new TypeError('Le status doit être un nombre HTTP valide (100-599)');
    }

    this.name = this.constructor.name;
    this.code = code;
    this.status = status;
    this.context = context;
    this.isOperational = isOperational;
    this.timestamp = new Date().toISOString();

    // Capturer la stack trace si disponible
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Sérialisation JSON avec gestion conditionnelle des propriétés
   */
  toJSON() {
    const response = {
      success: false,
      message: this.message,
      timestamp: this.timestamp
    };

    // Ajouter le code seulement s'il existe
    if (this.code) {
      response.code = this.code;
    }

    // Ajouter le status
    response.status = this.status;

    // Ajouter le contexte seulement s'il existe et n'est pas vide
    if (this.context && typeof this.context === 'object' && Object.keys(this.context).length > 0) {
      response.context = this.context;
    }

    // Ajouter la stack trace en développement
    if (process.env.NODE_ENV === 'development' && this.stack) {
      response.stack = this.stack;
    }

    return response;
  }

  /**
   * Méthode pour obtenir une représentation courte de l'erreur
   */
  toString() {
    return `${this.name}: ${this.message} (${this.code || 'NO_CODE'}) [${this.status}]`;
  }

  /**
   * Vérifier si l'erreur est opérationnelle
   */
  isOperationalError() {
    return this.isOperational;
  }

  // =============== FACTORY METHODS - AUTHENTIFICATION ===============

  static tokenMissing() {
    this._validateCode('AUTH_TOKEN_MISSING');
    return new AppError("Accès refusé. Token d'authentification manquant.", {
      code: CODES.AUTH_TOKEN_MISSING,
      status: 401
    });
  }

  static invalidToken(context) {
    this._validateCode('INVALID_TOKEN');
    return new AppError('Token invalide.', {
      code: CODES.INVALID_TOKEN,
      status: 401,
      context
    });
  }

  static tokenExpired(context) {
    this._validateCode('TOKEN_EXPIRED');
    return new AppError('Token expiré. Veuillez vous reconnecter.', {
      code: CODES.TOKEN_EXPIRED,
      status: 401,
      context
    });
  }

  static userNotFound(context) {
    this._validateCode('USER_NOT_FOUND');
    return new AppError('Utilisateur non trouvé.', {
      code: CODES.USER_NOT_FOUND,
      status: 404,
      context
    });
  }

  // =============== FACTORY METHODS - STATUTS DE COMPTE ===============

  static accountDisabled(context) {
    this._validateCode('ACCOUNT_DISABLED');
    return new AppError('Compte désactivé. Contactez le support.', {
      code: CODES.ACCOUNT_DISABLED,
      status: 403,
      context
    });
  }

  static accountSuspended(context) {
    this._validateCode('ACCOUNT_SUSPENDED');
    return new AppError('Votre compte a été suspendu. Contactez le support.', {
      code: CODES.ACCOUNT_SUSPENDED,
      status: 403,
      context
    });
  }

  static accountPermanentlyBlocked(context) {
    this._validateCode('ACCOUNT_PERMANENTLY_BLOCKED');
    return new AppError('Votre compte a été définitivement bloqué. Contactez le support.', {
      code: CODES.ACCOUNT_PERMANENTLY_BLOCKED,
      status: 403,
      context
    });
  }

  static accountTemporarilyBlocked(context) {
    this._validateCode('ACCOUNT_TEMPORARILY_BLOCKED');
    return new AppError('Votre compte est temporairement bloqué. Veuillez réessayer plus tard.', {
      code: CODES.ACCOUNT_TEMPORARILY_BLOCKED,
      status: 403,
      context
    });
  }

  static accountPendingVerification(context) {
    this._validateCode('ACCOUNT_PENDING_VERIFICATION');
    return new AppError('Votre compte est en attente de vérification. Vérifiez votre email ou SMS.', {
      code: CODES.ACCOUNT_PENDING_VERIFICATION,
      status: 403,
      context
    });
  }

  // =============== FACTORY METHODS - VALIDATION ===============

  static validationError(errors, context) {
    this._validateCode('VALIDATION_ERROR');
    const errorContext = {
      ...context,
      errors: Array.isArray(errors) ? errors : [errors]
    };

    return new AppError('Erreurs de validation des données.', {
      code: CODES.VALIDATION_ERROR,
      status: 400,
      context: errorContext
    });
  }

  static missingField(field, context) {
    this._validateCode('MISSING_FIELD');
    return new AppError(`Le champ '${field}' est requis.`, {
      code: CODES.MISSING_FIELD,
      status: 400,
      context: { ...context, field }
    });
  }

  static invalidField(field, value, expectedFormat, context) {
    this._validateCode('INVALID_FIELD');
    return new AppError(`Le champ '${field}' est invalide.`, {
      code: CODES.INVALID_FIELD,
      status: 400,
      context: { 
        ...context, 
        field, 
        value, 
        expectedFormat 
      }
    });
  }

  // =============== FACTORY METHODS - RESSOURCES ===============

  static notFound(resource = 'Ressource', context) {
    this._validateCode('NOT_FOUND');
    return new AppError(`${resource} non trouvé(e).`, {
      code: CODES.NOT_FOUND,
      status: 404,
      context
    });
  }

  static alreadyExists(resource = 'Ressource', context) {
    this._validateCode('ALREADY_EXISTS');
    return new AppError(`${resource} existe déjà.`, {
      code: CODES.ALREADY_EXISTS,
      status: 409,
      context
    });
  }

  static forbidden(action = 'Cette action', context) {
    this._validateCode('FORBIDDEN');
    return new AppError(`${action} n'est pas autorisée.`, {
      code: CODES.FORBIDDEN,
      status: 403,
      context
    });
  }

  // =============== FACTORY METHODS - RATE LIMITING ===============

  static rateLimitExceeded(limit, windowMs, context) {
    this._validateCode('RATE_LIMIT_EXCEEDED');
    return new AppError(`Trop de requêtes. Limite: ${limit} requêtes par ${Math.round(windowMs/60000)} minute(s).`, {
      code: CODES.RATE_LIMIT_EXCEEDED,
      status: 429,
      context: { ...context, limit, windowMs }
    });
  }

  // =============== FACTORY METHODS - SERVEUR ===============

  static serverError(message = "Erreur interne du serveur", context) {
    this._validateCode('SERVER_ERROR');
    return new AppError(message, {
      code: CODES.SERVER_ERROR,
      status: 500,
      context,
      isOperational: false
    });
  }

  static databaseError(operation = 'opération de base de données', context) {
    this._validateCode('DATABASE_ERROR');
    return new AppError(`Erreur lors de l'${operation}.`, {
      code: CODES.DATABASE_ERROR,
      status: 500,
      context,
      isOperational: false
    });
  }

  static serviceUnavailable(service = 'service', context) {
    this._validateCode('SERVICE_UNAVAILABLE');
    return new AppError(`Le ${service} est temporairement indisponible.`, {
      code: CODES.SERVICE_UNAVAILABLE,
      status: 503,
      context
    });
  }

  // =============== FACTORY METHODS - PAIEMENT/COVOITURAGE ===============

  static insufficientFunds(available, required, context) {
    this._validateCode('INSUFFICIENT_FUNDS');
    return new AppError(`Solde insuffisant. Disponible: ${available}, Requis: ${required}`, {
      code: CODES.INSUFFICIENT_FUNDS,
      status: 400,
      context: { ...context, available, required }
    });
  }

  static paymentFailed(reason, context) {
    this._validateCode('PAYMENT_FAILED');
    return new AppError(`Échec du paiement: ${reason}`, {
      code: CODES.PAYMENT_FAILED,
      status: 400,
      context
    });
  }

  static rideNotAvailable(context) {
    this._validateCode('RIDE_NOT_AVAILABLE');
    return new AppError('Ce trajet n\'est plus disponible.', {
      code: CODES.RIDE_NOT_AVAILABLE,
      status: 409,
      context
    });
  }

  // =============== MÉTHODES UTILITAIRES PRIVÉES ===============

  /**
   * Valider qu'un code d'erreur existe
   * @private
   */
  static _validateCode(codeKey) {
    if (!CODES[codeKey]) {
      console.warn(`Code d'erreur '${codeKey}' non défini dans errorCodes.js`);
    }
  }

  /**
   * Créer une erreur personnalisée
   */
  static custom(message, code, status = 400, context) {
    return new AppError(message, {
      code,
      status,
      context
    });
  }

  /**
   * Wrapper pour les erreurs MongoDB
   */
  static fromMongoError(error, context) {
    if (error.code === 11000) {
      // Erreur de duplication
      const field = Object.keys(error.keyPattern || {})[0] || 'champ';
      return this.alreadyExists(`${field}`, context);
    }

    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => err.message);
      return this.validationError(errors, context);
    }

    if (error.name === 'CastError') {
      return this.invalidField(error.path, error.value, error.kind, context);
    }

    return this.serverError('Erreur de base de données', { ...context, originalError: error.message });
  }

  /**
   * Wrapper pour les erreurs JWT
   */
  static fromJWTError(error, context) {
    if (error.name === 'TokenExpiredError') {
      return this.tokenExpired(context);
    }

    if (error.name === 'JsonWebTokenError') {
      return this.invalidToken(context);
    }

    return this.serverError('Erreur de token', { ...context, originalError: error.message });
  }
}

module.exports = AppError;