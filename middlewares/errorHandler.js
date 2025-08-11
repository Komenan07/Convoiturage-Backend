const mongoose = require('mongoose');
const winston = require('winston');

/**
 * Configuration du logger pour les erreurs
 */
const errorLogger = winston.createLogger({
    level: 'error',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    defaultMeta: { service: 'covoiturage-api' },
    transports: [
        new winston.transports.File({ 
            filename: 'logs/error.log',
            maxsize: 5242880, // 5MB
            maxFiles: 5
        }),
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        })
    ]
});

/**
 * Codes d'erreur personnalisés pour l'application de covoiturage
 */
const ERROR_CODES = {
    // AUTHENTIFICATION
    AUTH_INVALID_CREDENTIALS: 'AUTH_001',
    AUTH_TOKEN_EXPIRED: 'AUTH_002',
    AUTH_TOKEN_INVALID: 'AUTH_003',
    AUTH_ACCOUNT_LOCKED: 'AUTH_004',
    AUTH_ACCOUNT_NOT_VERIFIED: 'AUTH_005',
    AUTH_INSUFFICIENT_PERMISSIONS: 'AUTH_006',
    
    // UTILISATEUR
    USER_NOT_FOUND: 'USER_001',
    USER_EMAIL_EXISTS: 'USER_002',
    USER_PHONE_EXISTS: 'USER_003',
    USER_DOCUMENT_VERIFICATION_PENDING: 'USER_004',
    USER_DOCUMENT_REJECTED: 'USER_005',
    USER_PROFILE_INCOMPLETE: 'USER_006',
    USER_SUSPENDED: 'USER_007',
    USER_BLOCKED: 'USER_008',
    USER_LOW_TRUST_SCORE: 'USER_009',
    USER_VEHICLE_NOT_FOUND: 'USER_010',
    USER_VEHICLE_INVALID: 'USER_011',
    
    // TRAJETS
    TRIP_NOT_FOUND: 'TRIP_001',
    TRIP_FULL: 'TRIP_002',
    TRIP_EXPIRED: 'TRIP_003',
    TRIP_CANCELLED: 'TRIP_004',
    TRIP_IN_PROGRESS: 'TRIP_005',
    TRIP_COMPLETED: 'TRIP_006',
    TRIP_UNAUTHORIZED_ACCESS: 'TRIP_007',
    TRIP_INVALID_ROUTE: 'TRIP_008',
    TRIP_INVALID_DATE: 'TRIP_009',
    TRIP_INVALID_PRICE: 'TRIP_010',
    TRIP_DUPLICATE_ROUTE_TIME: 'TRIP_011',
    TRIP_SEATS_EXCEEDED: 'TRIP_012',
    
    // RÉSERVATIONS
    RESERVATION_NOT_FOUND: 'RESERVATION_001',
    RESERVATION_ALREADY_EXISTS: 'RESERVATION_002',
    RESERVATION_CANCELLED: 'RESERVATION_003',
    RESERVATION_CONFIRMED: 'RESERVATION_004',
    RESERVATION_REFUSED: 'RESERVATION_005',
    RESERVATION_EXPIRED: 'RESERVATION_006',
    RESERVATION_PAYMENT_REQUIRED: 'RESERVATION_007',
    RESERVATION_SELF_BOOKING: 'RESERVATION_008',
    RESERVATION_SEATS_UNAVAILABLE: 'RESERVATION_009',
    RESERVATION_TOO_LATE: 'RESERVATION_010',
    
    // PAIEMENTS
    PAYMENT_FAILED: 'PAYMENT_001',
    PAYMENT_INSUFFICIENT_FUNDS: 'PAYMENT_002',
    PAYMENT_INVALID_METHOD: 'PAYMENT_003',
    PAYMENT_TRANSACTION_NOT_FOUND: 'PAYMENT_004',
    PAYMENT_ALREADY_PROCESSED: 'PAYMENT_005',
    PAYMENT_REFUND_FAILED: 'PAYMENT_006',
    PAYMENT_WEBHOOK_INVALID: 'PAYMENT_007',
    PAYMENT_AMOUNT_MISMATCH: 'PAYMENT_008',
    PAYMENT_PROVIDER_ERROR: 'PAYMENT_009',
    
    // MESSAGES ET CONVERSATIONS
    MESSAGE_NOT_FOUND: 'MESSAGE_001',
    MESSAGE_CONVERSATION_NOT_FOUND: 'MESSAGE_002',
    MESSAGE_UNAUTHORIZED: 'MESSAGE_003',
    MESSAGE_BLOCKED_USER: 'MESSAGE_004',
    MESSAGE_SPAM_DETECTED: 'MESSAGE_005',
    MESSAGE_INAPPROPRIATE_CONTENT: 'MESSAGE_006',
    MESSAGE_FILE_TOO_LARGE: 'MESSAGE_007',
    MESSAGE_INVALID_TYPE: 'MESSAGE_008',
    
    // ÉVALUATIONS
    EVALUATION_NOT_FOUND: 'EVALUATION_001',
    EVALUATION_ALREADY_EXISTS: 'EVALUATION_002',
    EVALUATION_TRIP_NOT_COMPLETED: 'EVALUATION_003',
    EVALUATION_UNAUTHORIZED: 'EVALUATION_004',
    EVALUATION_INVALID_SCORE: 'EVALUATION_005',
    EVALUATION_SELF_RATING: 'EVALUATION_006',
    
    // ÉVÉNEMENTS
    EVENT_NOT_FOUND: 'EVENT_001',
    EVENT_EXPIRED: 'EVENT_002',
    EVENT_CANCELLED: 'EVENT_003',
    EVENT_FULL: 'EVENT_004',
    EVENT_INVALID_DATE: 'EVENT_005',
    EVENT_UNAUTHORIZED: 'EVENT_006',
    
    // ALERTES D'URGENCE
    ALERT_NOT_FOUND: 'ALERT_001',
    ALERT_ALREADY_RESOLVED: 'ALERT_002',
    ALERT_INVALID_TYPE: 'ALERT_003',
    ALERT_UNAUTHORIZED: 'ALERT_004',
    ALERT_SPAM_DETECTED: 'ALERT_005',
    
    // SIGNALEMENTS
    REPORT_NOT_FOUND: 'REPORT_001',
    REPORT_ALREADY_EXISTS: 'REPORT_002',
    REPORT_INVALID_TYPE: 'REPORT_003',
    REPORT_SELF_REPORT: 'REPORT_004',
    REPORT_INSUFFICIENT_EVIDENCE: 'REPORT_005',
    
    // UPLOADS ET FICHIERS
    UPLOAD_FILE_TOO_LARGE: 'UPLOAD_001',
    UPLOAD_INVALID_FORMAT: 'UPLOAD_002',
    UPLOAD_UPLOAD_FAILED: 'UPLOAD_003',
    UPLOAD_VIRUS_DETECTED: 'UPLOAD_004',
    UPLOAD_STORAGE_FULL: 'UPLOAD_005',
    UPLOAD_DOCUMENT_INVALID: 'UPLOAD_006',
    UPLOAD_IMAGE_CORRUPTED: 'UPLOAD_007',
    
    // GÉOLOCALISATION
    GEO_INVALID_COORDINATES: 'GEO_001',
    GEO_SERVICE_UNAVAILABLE: 'GEO_002',
    GEO_ROUTE_NOT_FOUND: 'GEO_003',
    GEO_DISTANCE_TOO_LONG: 'GEO_004',
    GEO_INVALID_ADDRESS: 'GEO_005',
    
    // ADMINISTRATION
    ADMIN_INSUFFICIENT_PERMISSIONS: 'ADMIN_001',
    ADMIN_ACTION_NOT_ALLOWED: 'ADMIN_002',
    ADMIN_USER_NOT_FOUND: 'ADMIN_003',
    ADMIN_INVALID_OPERATION: 'ADMIN_004',
    
    // SYSTÈME
    SYSTEM_DATABASE_ERROR: 'SYSTEM_001',
    SYSTEM_EXTERNAL_API_ERROR: 'SYSTEM_002',
    SYSTEM_RATE_LIMIT_EXCEEDED: 'SYSTEM_003',
    SYSTEM_MAINTENANCE_MODE: 'SYSTEM_004',
    SYSTEM_VALIDATION_ERROR: 'SYSTEM_005',
    SYSTEM_TIMEOUT: 'SYSTEM_006'
};

/**
 * Messages d'erreur personnalisés en français (contexte ivoirien)
 */
const ERROR_MESSAGES = {
    [ERROR_CODES.AUTH_INVALID_CREDENTIALS]: 'Email ou mot de passe incorrect',
    [ERROR_CODES.AUTH_TOKEN_EXPIRED]: 'Votre session a expiré, veuillez vous reconnecter',
    [ERROR_CODES.AUTH_TOKEN_INVALID]: 'Token d\'authentification invalide',
    [ERROR_CODES.AUTH_ACCOUNT_LOCKED]: 'Votre compte est verrouillé. Contactez le support',
    [ERROR_CODES.AUTH_ACCOUNT_NOT_VERIFIED]: 'Votre compte n\'est pas encore vérifié',
    [ERROR_CODES.AUTH_INSUFFICIENT_PERMISSIONS]: 'Vous n\'avez pas les permissions nécessaires',
    
    [ERROR_CODES.USER_NOT_FOUND]: 'Utilisateur introuvable',
    [ERROR_CODES.USER_EMAIL_EXISTS]: 'Cette adresse email est déjà utilisée',
    [ERROR_CODES.USER_PHONE_EXISTS]: 'Ce numéro de téléphone est déjà utilisé',
    [ERROR_CODES.USER_DOCUMENT_VERIFICATION_PENDING]: 'Vérification de votre pièce d\'identité en cours',
    [ERROR_CODES.USER_DOCUMENT_REJECTED]: 'Votre pièce d\'identité a été rejetée',
    [ERROR_CODES.USER_PROFILE_INCOMPLETE]: 'Veuillez compléter votre profil',
    [ERROR_CODES.USER_SUSPENDED]: 'Votre compte est suspendu',
    [ERROR_CODES.USER_BLOCKED]: 'Votre compte est bloqué',
    [ERROR_CODES.USER_LOW_TRUST_SCORE]: 'Score de confiance insuffisant pour cette action',
    [ERROR_CODES.USER_VEHICLE_NOT_FOUND]: 'Véhicule non trouvé',
    [ERROR_CODES.USER_VEHICLE_INVALID]: 'Informations du véhicule invalides',
    
    [ERROR_CODES.TRIP_NOT_FOUND]: 'Trajet introuvable',
    [ERROR_CODES.TRIP_FULL]: 'Ce trajet est complet',
    [ERROR_CODES.TRIP_EXPIRED]: 'Ce trajet a expiré',
    [ERROR_CODES.TRIP_CANCELLED]: 'Ce trajet a été annulé',
    [ERROR_CODES.TRIP_IN_PROGRESS]: 'Ce trajet est en cours',
    [ERROR_CODES.TRIP_COMPLETED]: 'Ce trajet est terminé',
    [ERROR_CODES.TRIP_UNAUTHORIZED_ACCESS]: 'Accès non autorisé à ce trajet',
    [ERROR_CODES.TRIP_INVALID_ROUTE]: 'Itinéraire invalide',
    [ERROR_CODES.TRIP_INVALID_DATE]: 'Date de départ invalide',
    [ERROR_CODES.TRIP_INVALID_PRICE]: 'Prix invalide',
    [ERROR_CODES.TRIP_DUPLICATE_ROUTE_TIME]: 'Vous avez déjà un trajet similaire à cette heure',
    [ERROR_CODES.TRIP_SEATS_EXCEEDED]: 'Nombre de places dépasse la capacité du véhicule',
    
    [ERROR_CODES.RESERVATION_NOT_FOUND]: 'Réservation introuvable',
    [ERROR_CODES.RESERVATION_ALREADY_EXISTS]: 'Vous avez déjà une réservation pour ce trajet',
    [ERROR_CODES.RESERVATION_CANCELLED]: 'Cette réservation a été annulée',
    [ERROR_CODES.RESERVATION_CONFIRMED]: 'Cette réservation est déjà confirmée',
    [ERROR_CODES.RESERVATION_REFUSED]: 'Cette réservation a été refusée',
    [ERROR_CODES.RESERVATION_EXPIRED]: 'Cette réservation a expiré',
    [ERROR_CODES.RESERVATION_PAYMENT_REQUIRED]: 'Paiement requis pour confirmer la réservation',
    [ERROR_CODES.RESERVATION_SELF_BOOKING]: 'Vous ne pouvez pas réserver votre propre trajet',
    [ERROR_CODES.RESERVATION_SEATS_UNAVAILABLE]: 'Places indisponibles',
    [ERROR_CODES.RESERVATION_TOO_LATE]: 'Réservation trop tardive',
    
    [ERROR_CODES.PAYMENT_FAILED]: 'Le paiement a échoué',
    [ERROR_CODES.PAYMENT_INSUFFICIENT_FUNDS]: 'Fonds insuffisants',
    [ERROR_CODES.PAYMENT_INVALID_METHOD]: 'Méthode de paiement invalide',
    [ERROR_CODES.PAYMENT_TRANSACTION_NOT_FOUND]: 'Transaction introuvable',
    [ERROR_CODES.PAYMENT_ALREADY_PROCESSED]: 'Paiement déjà traité',
    [ERROR_CODES.PAYMENT_REFUND_FAILED]: 'Remboursement échoué',
    [ERROR_CODES.PAYMENT_WEBHOOK_INVALID]: 'Webhook de paiement invalide',
    [ERROR_CODES.PAYMENT_AMOUNT_MISMATCH]: 'Montant incorrect',
    [ERROR_CODES.PAYMENT_PROVIDER_ERROR]: 'Erreur du prestataire de paiement',
    
    [ERROR_CODES.MESSAGE_NOT_FOUND]: 'Message introuvable',
    [ERROR_CODES.MESSAGE_CONVERSATION_NOT_FOUND]: 'Conversation introuvable',
    [ERROR_CODES.MESSAGE_UNAUTHORIZED]: 'Accès non autorisé à cette conversation',
    [ERROR_CODES.MESSAGE_BLOCKED_USER]: 'Utilisateur bloqué',
    [ERROR_CODES.MESSAGE_SPAM_DETECTED]: 'Spam détecté',
    [ERROR_CODES.MESSAGE_INAPPROPRIATE_CONTENT]: 'Contenu inapproprié',
    [ERROR_CODES.MESSAGE_FILE_TOO_LARGE]: 'Fichier trop volumineux',
    [ERROR_CODES.MESSAGE_INVALID_TYPE]: 'Type de message invalide',
    
    [ERROR_CODES.EVALUATION_NOT_FOUND]: 'Évaluation introuvable',
    [ERROR_CODES.EVALUATION_ALREADY_EXISTS]: 'Vous avez déjà évalué ce trajet',
    [ERROR_CODES.EVALUATION_TRIP_NOT_COMPLETED]: 'Le trajet doit être terminé pour être évalué',
    [ERROR_CODES.EVALUATION_UNAUTHORIZED]: 'Non autorisé à évaluer',
    [ERROR_CODES.EVALUATION_INVALID_SCORE]: 'Note invalide',
    [ERROR_CODES.EVALUATION_SELF_RATING]: 'Auto-évaluation interdite',
    
    [ERROR_CODES.EVENT_NOT_FOUND]: 'Événement introuvable',
    [ERROR_CODES.EVENT_EXPIRED]: 'Événement expiré',
    [ERROR_CODES.EVENT_CANCELLED]: 'Événement annulé',
    [ERROR_CODES.EVENT_FULL]: 'Événement complet',
    [ERROR_CODES.EVENT_INVALID_DATE]: 'Date d\'événement invalide',
    [ERROR_CODES.EVENT_UNAUTHORIZED]: 'Accès non autorisé à cet événement',
    
    [ERROR_CODES.ALERT_NOT_FOUND]: 'Alerte introuvable',
    [ERROR_CODES.ALERT_ALREADY_RESOLVED]: 'Alerte déjà résolue',
    [ERROR_CODES.ALERT_INVALID_TYPE]: 'Type d\'alerte invalide',
    [ERROR_CODES.ALERT_UNAUTHORIZED]: 'Accès non autorisé à cette alerte',
    [ERROR_CODES.ALERT_SPAM_DETECTED]: 'Fausse alerte détectée',
    
    [ERROR_CODES.REPORT_NOT_FOUND]: 'Signalement introuvable',
    [ERROR_CODES.REPORT_ALREADY_EXISTS]: 'Vous avez déjà signalé cet élément',
    [ERROR_CODES.REPORT_INVALID_TYPE]: 'Type de signalement invalide',
    [ERROR_CODES.REPORT_SELF_REPORT]: 'Auto-signalement interdit',
    [ERROR_CODES.REPORT_INSUFFICIENT_EVIDENCE]: 'Preuves insuffisantes',
    
    [ERROR_CODES.UPLOAD_FILE_TOO_LARGE]: 'Fichier trop volumineux',
    [ERROR_CODES.UPLOAD_INVALID_FORMAT]: 'Format de fichier invalide',
    [ERROR_CODES.UPLOAD_UPLOAD_FAILED]: 'Échec de l\'upload',
    [ERROR_CODES.UPLOAD_VIRUS_DETECTED]: 'Virus détecté dans le fichier',
    [ERROR_CODES.UPLOAD_STORAGE_FULL]: 'Espace de stockage plein',
    [ERROR_CODES.UPLOAD_DOCUMENT_INVALID]: 'Document invalide',
    [ERROR_CODES.UPLOAD_IMAGE_CORRUPTED]: 'Image corrompue',
    
    [ERROR_CODES.GEO_INVALID_COORDINATES]: 'Coordonnées invalides',
    [ERROR_CODES.GEO_SERVICE_UNAVAILABLE]: 'Service de géolocalisation indisponible',
    [ERROR_CODES.GEO_ROUTE_NOT_FOUND]: 'Itinéraire introuvable',
    [ERROR_CODES.GEO_DISTANCE_TOO_LONG]: 'Distance trop longue',
    [ERROR_CODES.GEO_INVALID_ADDRESS]: 'Adresse invalide',
    
    [ERROR_CODES.ADMIN_INSUFFICIENT_PERMISSIONS]: 'Permissions administrateur insuffisantes',
    [ERROR_CODES.ADMIN_ACTION_NOT_ALLOWED]: 'Action non autorisée',
    [ERROR_CODES.ADMIN_USER_NOT_FOUND]: 'Utilisateur administrateur introuvable',
    [ERROR_CODES.ADMIN_INVALID_OPERATION]: 'Opération administrative invalide',
    
    [ERROR_CODES.SYSTEM_DATABASE_ERROR]: 'Erreur de base de données',
    [ERROR_CODES.SYSTEM_EXTERNAL_API_ERROR]: 'Erreur d\'API externe',
    [ERROR_CODES.SYSTEM_RATE_LIMIT_EXCEEDED]: 'Limite de requêtes dépassée',
    [ERROR_CODES.SYSTEM_MAINTENANCE_MODE]: 'Maintenance en cours',
    [ERROR_CODES.SYSTEM_VALIDATION_ERROR]: 'Erreur de validation',
    [ERROR_CODES.SYSTEM_TIMEOUT]: 'Délai d\'attente dépassé'
};

/**
 * Classe d'erreur personnalisée
 */
class AppError extends Error {
    constructor(message, statusCode, errorCode, isOperational = true, additionalData = {}) {
        super(message);
        this.statusCode = statusCode;
        this.errorCode = errorCode;
        this.isOperational = isOperational;
        this.additionalData = additionalData;
        this.timestamp = new Date().toISOString();
        
        Error.captureStackTrace(this, this.constructor);
    }

    toJSON() {
        return {
            success: false,
            error: {
                code: this.errorCode,
                message: this.message,
                statusCode: this.statusCode,
                timestamp: this.timestamp,
                ...this.additionalData
            }
        };
    }
}

/**
 * Factory pour créer des erreurs spécifiques au domaine
 */
class ErrorFactory {
    // Erreurs d'authentification
    static invalidCredentials() {
        return new AppError(
            ERROR_MESSAGES[ERROR_CODES.AUTH_INVALID_CREDENTIALS],
            401,
            ERROR_CODES.AUTH_INVALID_CREDENTIALS
        );
    }

    static tokenExpired() {
        return new AppError(
            ERROR_MESSAGES[ERROR_CODES.AUTH_TOKEN_EXPIRED],
            401,
            ERROR_CODES.AUTH_TOKEN_EXPIRED
        );
    }

    static insufficientPermissions() {
        return new AppError(
            ERROR_MESSAGES[ERROR_CODES.AUTH_INSUFFICIENT_PERMISSIONS],
            403,
            ERROR_CODES.AUTH_INSUFFICIENT_PERMISSIONS
        );
    }

    // Erreurs utilisateur
    static userNotFound(userId) {
        return new AppError(
            ERROR_MESSAGES[ERROR_CODES.USER_NOT_FOUND],
            404,
            ERROR_CODES.USER_NOT_FOUND,
            true,
            { userId }
        );
    }

    static userEmailExists(email) {
        return new AppError(
            ERROR_MESSAGES[ERROR_CODES.USER_EMAIL_EXISTS],
            409,
            ERROR_CODES.USER_EMAIL_EXISTS,
            true,
            { email }
        );
    }

    static userSuspended(reason) {
        return new AppError(
            ERROR_MESSAGES[ERROR_CODES.USER_SUSPENDED],
            403,
            ERROR_CODES.USER_SUSPENDED,
            true,
            { reason }
        );
    }

    // Erreurs trajet
    static tripNotFound(tripId) {
        return new AppError(
            ERROR_MESSAGES[ERROR_CODES.TRIP_NOT_FOUND],
            404,
            ERROR_CODES.TRIP_NOT_FOUND,
            true,
            { tripId }
        );
    }

    static tripFull(availableSeats) {
        return new AppError(
            ERROR_MESSAGES[ERROR_CODES.TRIP_FULL],
            409,
            ERROR_CODES.TRIP_FULL,
            true,
            { availableSeats }
        );
    }

    static tripCancelled(reason) {
        return new AppError(
            ERROR_MESSAGES[ERROR_CODES.TRIP_CANCELLED],
            409,
            ERROR_CODES.TRIP_CANCELLED,
            true,
            { reason }
        );
    }

    // Erreurs réservation
    static reservationExists(reservationId) {
        return new AppError(
            ERROR_MESSAGES[ERROR_CODES.RESERVATION_ALREADY_EXISTS],
            409,
            ERROR_CODES.RESERVATION_ALREADY_EXISTS,
            true,
            { reservationId }
        );
    }

    static reservationNotFound(reservationId) {
        return new AppError(
            ERROR_MESSAGES[ERROR_CODES.RESERVATION_NOT_FOUND],
            404,
            ERROR_CODES.RESERVATION_NOT_FOUND,
            true,
            { reservationId }
        );
    }

    static selfBooking() {
        return new AppError(
            ERROR_MESSAGES[ERROR_CODES.RESERVATION_SELF_BOOKING],
            400,
            ERROR_CODES.RESERVATION_SELF_BOOKING
        );
    }

    // Erreurs paiement
    static paymentFailed(transactionId, reason) {
        return new AppError(
            ERROR_MESSAGES[ERROR_CODES.PAYMENT_FAILED],
            402,
            ERROR_CODES.PAYMENT_FAILED,
            true,
            { transactionId, reason }
        );
    }

    static insufficientFunds(available, required) {
        return new AppError(
            ERROR_MESSAGES[ERROR_CODES.PAYMENT_INSUFFICIENT_FUNDS],
            402,
            ERROR_CODES.PAYMENT_INSUFFICIENT_FUNDS,
            true,
            { available, required }
        );
    }

    // Erreurs upload
    static fileTooLarge(maxSize, actualSize) {
        return new AppError(
            ERROR_MESSAGES[ERROR_CODES.UPLOAD_FILE_TOO_LARGE],
            413,
            ERROR_CODES.UPLOAD_FILE_TOO_LARGE,
            true,
            { maxSize, actualSize }
        );
    }

    static invalidFileFormat(expected, received) {
        return new AppError(
            ERROR_MESSAGES[ERROR_CODES.UPLOAD_INVALID_FORMAT],
            400,
            ERROR_CODES.UPLOAD_INVALID_FORMAT,
            true,
            { expected, received }
        );
    }

    // Erreurs système
    static databaseError(details) {
        return new AppError(
            ERROR_MESSAGES[ERROR_CODES.SYSTEM_DATABASE_ERROR],
            500,
            ERROR_CODES.SYSTEM_DATABASE_ERROR,
            false,
            { details }
        );
    }

    static validationError(fields) {
        return new AppError(
            ERROR_MESSAGES[ERROR_CODES.SYSTEM_VALIDATION_ERROR],
            400,
            ERROR_CODES.SYSTEM_VALIDATION_ERROR,
            true,
            { fields }
        );
    }
}

/**
 * Gestionnaire d'erreurs MongoDB/Mongoose
 */
const handleMongooseError = (err) => {
    // Erreur de validation
    if (err.name === 'ValidationError') {
        const fields = Object.keys(err.errors).map(key => ({
            field: key,
            message: err.errors[key].message,
            value: err.errors[key].value
        }));
        return ErrorFactory.validationError(fields);
    }

    // Erreur de clé dupliquée
    if (err.code === 11000) {
        const field = Object.keys(err.keyValue)[0];
        const value = err.keyValue[field];
        
        if (field === 'email') {
            return ErrorFactory.userEmailExists(value);
        }
        if (field === 'telephone') {
            return new AppError(
                ERROR_MESSAGES[ERROR_CODES.USER_PHONE_EXISTS],
                409,
                ERROR_CODES.USER_PHONE_EXISTS,
                true,
                { phone: value }
            );
        }
        
        return new AppError(
            `${field} déjà existant: ${value}`,
            409,
            ERROR_CODES.SYSTEM_VALIDATION_ERROR,
            true,
            { field, value }
        );
    }

    // Erreur de cast (mauvais ObjectId)
    if (err.name === 'CastError') {
        if (err.path === '_id') {
            return new AppError(
                'ID invalide',
                400,
                ERROR_CODES.SYSTEM_VALIDATION_ERROR,
                true,
                { invalidId: err.value }
            );
        }
    }

    // Erreur de connexion MongoDB
    if (err.name === 'MongoNetworkError') {
        return ErrorFactory.databaseError('Connexion à la base de données impossible');
    }

    return ErrorFactory.databaseError(err.message);
};

/**
 * Gestionnaire d'erreurs JWT
 */
const handleJWTError = (err) => {
    if (err.name === 'TokenExpiredError') {
        return ErrorFactory.tokenExpired();
    }
    if (err.name === 'JsonWebTokenError') {
        return new AppError(
            ERROR_MESSAGES[ERROR_CODES.AUTH_TOKEN_INVALID],
            401,
            ERROR_CODES.AUTH_TOKEN_INVALID
        );
    }
    return ErrorFactory.invalidCredentials();
};

/**
 * Gestionnaire d'erreurs Multer (upload)
 */
const handleMulterError = (err) => {
    if (err.code === 'LIMIT_FILE_SIZE') {
        return ErrorFactory.fileTooLarge(err.limit, err.fileSize);
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
        return new AppError(
            'Trop de fichiers uploadés',
            400,
            ERROR_CODES.UPLOAD_INVALID_FORMAT,
            true,
            { maxFiles: err.limit }
        );
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        return new AppError(
            'Champ de fichier inattendu',
            400,
            ERROR_CODES.UPLOAD_INVALID_FORMAT,
            true,
            { field: err.field }
        );
    }
    
    return new AppError(
        ERROR_MESSAGES[ERROR_CODES.UPLOAD_UPLOAD_FAILED],
        400,
        ERROR_CODES.UPLOAD_UPLOAD_FAILED,
        true,
        { originalError: err.message }
    );
};

/**
 * Middleware principal de gestion d'erreurs
 */
const errorHandler = (err, req, res, next) => {
    let error = { ...err };
    error.message = err.message;

    // Log de l'erreur avec contexte
    const errorContext = {
        url: req.originalUrl,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        user: req.user?.id,
        body: req.method !== 'GET' ? req.body : undefined,
        query: req.query,
        params: req.params,
        timestamp: new Date().toISOString()
    };

    // Gestion des différents types d'erreurs
    if (err.name === 'ValidationError' || err.name === 'CastError' || err.code === 11000) {
        error = handleMongooseError(err);
    } else if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
        error = handleJWTError(err);
    } else if (err.code && err.code.startsWith('LIMIT_')) {
        error = handleMulterError(err);
    } else if (!(err instanceof AppError)) {
        // Erreur générique non gérée
        error = new AppError(
            process.env.NODE_ENV === 'production' 
                ? 'Une erreur inattendue s\'est produite' 
                : err.message,
            err.statusCode || 500,
            ERROR_CODES.SYSTEM_DATABASE_ERROR,
            false
        );
    }

    // Log selon la gravité
    if (!error.isOperational || error.statusCode >= 500) {
        errorLogger.error('Erreur système', {
            error: {
                message: error.message,
                stack: error.stack,
                statusCode: error.statusCode,
                errorCode: error.errorCode
            },
            context: errorContext
        });
    } else {
        errorLogger.warn('Erreur opérationnelle', {
            error: {
                message: error.message,
                statusCode: error.statusCode,
                errorCode: error.errorCode
            },
            context: errorContext
        });
    }

    // Réponse selon l'environnement
    const response = {
        success: false,
        error: {
            code: error.errorCode || ERROR_CODES.SYSTEM_DATABASE_ERROR,
            message: error.message,
            timestamp: error.timestamp || new Date().toISOString(),
            ...(error.additionalData && { data: error.additionalData })
        }
    };

    // En développement, inclure la stack trace
    if (process.env.NODE_ENV === 'development') {
        response.error.stack = error.stack;
        response.context = errorContext;
    }

    // Headers de sécurité
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');

    res.status(error.statusCode || 500).json(response);
};

/**
 * Gestionnaire pour les routes non trouvées (404)
 */
const notFoundHandler = (req, res, next) => {
    const error = new AppError(
        `Route ${req.originalUrl} introuvable`,
        404,
        'ROUTE_NOT_FOUND',
        true,
        {
            method: req.method,
            path: req.path,
            availableRoutes: getAvailableRoutes(req.app)
        }
    );
    next(error);
};

/**
 * Gestionnaire pour les erreurs asynchrones
 */
const catchAsync = (fn) => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};

/**
 * Middleware de validation des erreurs métier spécifiques
 */
const businessRuleValidator = {
    // Validation des règles de covoiturage
    validateTripRules: (trip, user) => {
        // Vérifier si l'utilisateur peut créer un trajet
        if (!user.estVerifie) {
            throw new AppError(
                ERROR_MESSAGES[ERROR_CODES.USER_DOCUMENT_VERIFICATION_PENDING],
                403,
                ERROR_CODES.USER_DOCUMENT_VERIFICATION_PENDING
            );
        }

        if (user.scoreConfiance < 50) {
            throw ErrorFactory.userLowTrustScore();
        }

        // Vérifier la date du trajet
        const tripDate = new Date(trip.dateDepart);
        const now = new Date();
        const maxAdvanceBooking = 30; // 30 jours
        
        if (tripDate <= now) {
            throw new AppError(
                ERROR_MESSAGES[ERROR_CODES.TRIP_INVALID_DATE],
                400,
                ERROR_CODES.TRIP_INVALID_DATE
            );
        }

        if (tripDate > new Date(now.getTime() + maxAdvanceBooking * 24 * 60 * 60 * 1000)) {
            throw new AppError(
                'Impossible de créer un trajet plus de 30 jours à l\'avance',
                400,
                ERROR_CODES.TRIP_INVALID_DATE,
                true,
                { maxAdvanceDays: maxAdvanceBooking }
            );
        }
    },

    // Validation des règles de réservation
    validateReservationRules: (reservation, trip, user) => {
        // Vérifier si c'est son propre trajet
        if (trip.conducteurId.toString() === user._id.toString()) {
            throw ErrorFactory.selfBooking();
        }

        // Vérifier les places disponibles
        if (trip.nombrePlacesDisponibles < reservation.nombrePlacesReservees) {
            throw ErrorFactory.tripFull(trip.nombrePlacesDisponibles);
        }

        // Vérifier le délai de réservation
        const tripDate = new Date(trip.dateDepart);
        const now = new Date();
        const minBookingTime = 30; // 30 minutes avant le départ
        
        if (tripDate <= new Date(now.getTime() + minBookingTime * 60 * 1000)) {
            throw new AppError(
                ERROR_MESSAGES[ERROR_CODES.RESERVATION_TOO_LATE],
                400,
                ERROR_CODES.RESERVATION_TOO_LATE,
                true,
                { minBookingMinutes: minBookingTime }
            );
        }
    },

    // Validation des règles de paiement
    validatePaymentRules: (payment, reservation, user) => {
        // Vérifier le montant
        if (payment.montantTotal !== reservation.montantTotal) {
            throw new AppError(
                ERROR_MESSAGES[ERROR_CODES.PAYMENT_AMOUNT_MISMATCH],
                400,
                ERROR_CODES.PAYMENT_AMOUNT_MISMATCH,
                true,
                { expected: reservation.montantTotal, received: payment.montantTotal }
            );
        }

        // Vérifier la méthode de paiement
        const allowedMethods = ['ESPECES', 'WAVE', 'ORANGE_MONEY', 'MTN_MONEY', 'MOOV_MONEY'];
        if (!allowedMethods.includes(payment.methodePaiement)) {
            throw new AppError(
                ERROR_MESSAGES[ERROR_CODES.PAYMENT_INVALID_METHOD],
                400,
                ERROR_CODES.PAYMENT_INVALID_METHOD,
                true,
                { allowedMethods }
            );
        }
    }
};

/**
 * Gestionnaire d'erreurs spécifiques aux webhooks
 */
const webhookErrorHandler = (err, req, res, next) => {
    // Log spécial pour les webhooks
    errorLogger.error('Erreur webhook', {
        error: err.message,
        provider: req.headers['x-provider'],
        signature: req.headers['x-signature'],
        body: req.body,
        timestamp: new Date().toISOString()
    });

    // Réponse simple pour les webhooks
    res.status(200).json({ received: true, error: err.message });
};

/**
 * Utilitaires pour la gestion des erreurs
 */
const errorUtils = {
    // Créer une erreur de validation personnalisée
    createValidationError: (field, message, value) => {
        return new AppError(
            message,
            400,
            ERROR_CODES.SYSTEM_VALIDATION_ERROR,
            true,
            { field, value }
        );
    },

    // Vérifier si une erreur est opérationnelle
    isOperationalError: (error) => {
        return error instanceof AppError && error.isOperational;
    },

    // Extraire le code d'erreur d'une erreur
    getErrorCode: (error) => {
        return error.errorCode || ERROR_CODES.SYSTEM_DATABASE_ERROR;
    },

    // Formatter une erreur pour les logs
    formatErrorForLogging: (error, context = {}) => {
        return {
            message: error.message,
            stack: error.stack,
            code: error.errorCode,
            statusCode: error.statusCode,
            isOperational: error.isOperational,
            timestamp: new Date().toISOString(),
            context
        };
    }
};

/**
 * Gestionnaire d'erreurs pour les tâches en arrière-plan
 */
const backgroundTaskErrorHandler = (taskName) => {
    return (error) => {
        errorLogger.error(`Erreur tâche en arrière-plan: ${taskName}`, {
            task: taskName,
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        });

        // Ici, vous pourriez ajouter une logique pour:
        // - Retry automatique
        // - Notification aux admins
        // - Mise en queue pour traitement ultérieur
    };
};

/**
 * Helper pour obtenir les routes disponibles (pour les erreurs 404)
 */
const getAvailableRoutes = (app) => {
    const routes = [];
    
    if (app._router && app._router.stack) {
        app._router.stack.forEach((middleware) => {
            if (middleware.route) {
                routes.push(`${Object.keys(middleware.route.methods).join(', ').toUpperCase()} ${middleware.route.path}`);
            }
        });
    }
    
    return routes.slice(0, 10); // Limiter à 10 routes pour éviter les réponses trop longues
};

/**
 * Middleware de sanitisation des erreurs (pour éviter les fuites d'informations)
 */
const sanitizeError = (error) => {
    const sensitiveFields = ['password', 'motDePasse', 'token', 'secret', 'key'];
    
    if (error.additionalData) {
        Object.keys(error.additionalData).forEach(key => {
            if (sensitiveFields.some(field => key.toLowerCase().includes(field))) {
                error.additionalData[key] = '[REDACTED]';
            }
        });
    }
    
    return error;
};

/**
 * Gestionnaire d'erreurs pour la production avec monitoring
 */
const productionErrorHandler = (err, req, res, next) => {
    let error = sanitizeError(err instanceof AppError ? err : new AppError(
        'Une erreur inattendue s\'est produite',
        500,
        ERROR_CODES.SYSTEM_DATABASE_ERROR,
        false
    ));

    // Monitoring/alerting pour les erreurs critiques
    if (!error.isOperational && error.statusCode >= 500) {
        // Ici vous pourriez intégrer:
        // - Sentry
        // - New Relic
        // - DataDog
        // - Slack notifications
        // - Email alerts
        console.error('ERREUR CRITIQUE DÉTECTÉE:', {
            message: error.message,
            stack: error.stack,
            user: req.user?.id,
            url: req.originalUrl,
            timestamp: new Date().toISOString()
        });
    }

    res.status(error.statusCode).json({
        success: false,
        error: {
            code: error.errorCode,
            message: error.message,
            timestamp: error.timestamp
        }
    });
};

module.exports = {
    // Classes principales
    AppError,
    ErrorFactory,
    
    // Middlewares
    errorHandler,
    notFoundHandler,
    webhookErrorHandler,
    productionErrorHandler,
    
    // Utilitaires
    catchAsync,
    businessRuleValidator,
    backgroundTaskErrorHandler,
    errorUtils,
    
    // Constantes
    ERROR_CODES,
    ERROR_MESSAGES,
    
    // Configuration
    errorLogger
};