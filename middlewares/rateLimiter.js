const rateLimit = require('express-rate-limit');
const env = require('../config/env');

// Version simplifiée sans MongoStore pour éviter les erreurs de démarrage
let MongoStore;
try {
    MongoStore = require('rate-limit-mongo');
} catch (error) {
    console.warn('[WARNING] rate-limit-mongo non installé, utilisation du store mémoire');
    MongoStore = null;
}

/**
 * Configuration centralisée des limites de requêtes
 * Version adaptée pour votre application de covoiturage
 */
class RateLimiterConfig {
    constructor() {
        this.mongoUri = env.mongoUri;
        // Store MongoDB si disponible, sinon store mémoire
        this.store = null;
        if (MongoStore && this.mongoUri) {
            try {
                this.store = new MongoStore({
                    uri: this.mongoUri,
                    collectionName: 'rate_limits',
                    expireTimeMs: 15 * 60 * 1000,
                });
            } catch (error) {
                console.warn('[WARNING] Erreur MongoDB store, utilisation du store mémoire:', error.message);
                this.store = null;
            }
        }
    }

    /**
     * Configuration des limites par type d'endpoint
     */
    getLimits() {
        return {
            // AUTHENTIFICATION - Endpoints sensibles
            auth: {
                login: {
                    windowMs: 15 * 60 * 1000, // 15 minutes
                    max: 5, // 5 tentatives par IP
                    message: 'Trop de tentatives de connexion. Réessayez dans 15 minutes.',
                    standardHeaders: true,
                    legacyHeaders: false,
                    skipSuccessfulRequests: true
                },
                register: {
                    windowMs: 60 * 60 * 1000, // 1 heure
                    max: 3, // 3 inscriptions par IP par heure
                    message: 'Trop d\'inscriptions depuis cette IP. Réessayez dans 1 heure.',
                    standardHeaders: true,
                    legacyHeaders: false
                }
            },
            // TRAJETS - Création et gestion
            trajet: {
                create: {
                    windowMs: 60 * 60 * 1000, // 1 heure
                    max: 10, // 10 trajets par conducteur par heure
                    message: 'Limite de création de trajets atteinte.',
                    keyGenerator: (req) => req.user?.id || req.ip
                },
                search: {
                    windowMs: 60 * 1000, // 1 minute
                    max: 30, // 30 recherches par minute
                    message: 'Trop de recherches. Réessayez dans 1 minute.',
                    keyGenerator: (req) => req.user?.id || req.ip
                }
            },
            // RÉSERVATIONS
            reservation: {
                create: {
                    windowMs: 5 * 60 * 1000, // 5 minutes
                    max: 5, // 5 réservations par 5 minutes
                    message: 'Trop de réservations. Attendez 5 minutes.',
                    keyGenerator: (req) => req.user?.id || req.ip
                }
            },
            // MESSAGES
            message: {
                send: {
                    windowMs: 60 * 1000, // 1 minute
                    max: 30, // 30 messages par minute
                    message: 'Trop de messages. Attendez 1 minute.',
                    keyGenerator: (req) => req.user?.id || req.ip
                }
            },
            // PAIEMENTS
            paiement: {
                initiate: {
                    windowMs: 60 * 60 * 1000, // 1 heure
                    max: 20, // 20 paiements par heure
                    message: 'Limite de transactions atteinte.',
                    keyGenerator: (req) => req.user?.id || req.ip
                },
                webhook: {
                    windowMs: 60 * 1000, // 1 minute
                    max: 100, // 100 webhooks par minute
                    message: 'Trop de webhooks.',
                    keyGenerator: (req) => req.get('X-Forwarded-For') || req.ip
                }
            },
            // ALERTES D'URGENCE
            alerteUrgence: {
                create: {
                    windowMs: 5 * 60 * 1000, // 5 minutes
                    max: 3, // 3 alertes par 5 minutes
                    message: 'Limite d\'alertes d\'urgence atteinte.',
                    keyGenerator: (req) => req.user?.id || req.ip,
                    skipSuccessfulRequests: false
                }
            },
            // UPLOADS
            upload: {
                document: {
                    windowMs: 60 * 60 * 1000, // 1 heure
                    max: 10, // 10 documents par heure
                    message: 'Limite d\'upload de documents atteinte.',
                    keyGenerator: (req) => req.user?.id || req.ip
                },
                image: {
                    windowMs: 30 * 60 * 1000, // 30 minutes
                    max: 20, // 20 images par 30 minutes
                    message: 'Limite d\'upload d\'images atteinte.',
                    keyGenerator: (req) => req.user?.id || req.ip
                }
            },
            // LIMITE GÉNÉRALE API
            general: {
                api: {
                    windowMs: env.rateLimitWindowMs || 15 * 60 * 1000, // 15 minutes
                    max: env.rateLimitMaxRequests || 1000, // 1000 requêtes par IP
                    message: 'Trop de requêtes. Réessayez dans 15 minutes.',
                    standardHeaders: true,
                    legacyHeaders: false
                }
            }
        };
    }

    /**
     * Crée un middleware de rate limiting
     */
    createLimiter(category, type) {
        const limits = this.getLimits();
        const config = limits[category]?.[type] || limits.general.api;
        const limiterConfig = {
            windowMs: config.windowMs,
            max: config.max,
            message: {
                error: config.message,
                retryAfter: Math.ceil(config.windowMs / 1000)
            },
            standardHeaders: config.standardHeaders || true,
            legacyHeaders: config.legacyHeaders || false,
            keyGenerator: config.keyGenerator || ((req) => req.ip),
            skipSuccessfulRequests: config.skipSuccessfulRequests || false,
            // Handler personnalisé pour les dépassements
            handler: (req, res) => {
                console.warn(`[RATE_LIMIT] Limite dépassée pour ${category}.${type}`, {
                    ip: req.ip,
                    user: req.user?.id,
                    path: req.path,
                    method: req.method
                });
                res.status(429).json({
                    success: false,
                    message: config.message,
                    retryAfter: Math.ceil(config.windowMs / 1000)
                });
            },
            // Skip pour certaines conditions
            skip: (req) => {
                // Skip pour les super admins en développement
                if (env.nodeEnv === 'development' && req.user?.role === 'SUPER_ADMIN') {
                    return true;
                }
                return false;
            }
        };
        // Ajouter le store MongoDB si disponible
        if (this.store) {
            limiterConfig.store = this.store;
        }
        return rateLimit(limiterConfig);
    }
}

// Instance principale du configurateur
const rateLimiterConfig = new RateLimiterConfig();

/**
 * Factory pour créer des limiters spécifiques
 */
const createRateLimiter = (category, type) => {
    return rateLimiterConfig.createLimiter(category, type);
};

/**
 * Middlewares pré-configurés pour les endpoints principaux
 */
const rateLimiters = {
    // Authentification
    auth: {
        login: createRateLimiter('auth', 'login'),
        register: createRateLimiter('auth', 'register')
    },
    // Trajets
    trajet: {
        create: createRateLimiter('trajet', 'create'),
        search: createRateLimiter('trajet', 'search')
    },
    // Réservations
    reservation: {
        create: createRateLimiter('reservation', 'create')
    },
    // Messages
    message: {
        send: createRateLimiter('message', 'send')
    },
    // Paiements
    paiement: {
        initiate: createRateLimiter('paiement', 'initiate'),
        webhook: createRateLimiter('paiement', 'webhook')
    },
    // Alertes d'urgence
    alerteUrgence: {
        create: createRateLimiter('alerteUrgence', 'create')
    },
    // Uploads
    upload: {
        document: createRateLimiter('upload', 'document'),
        image: createRateLimiter('upload', 'image')
    },
    // Limite générale
    general: createRateLimiter('general', 'api')
};

// Configuration générale pour le rate limiting
const createBasicRateLimiter = (windowMs, max, message, skipSuccessfulRequests = false) => {
    return rateLimit({
        windowMs, // Fenêtre de temps en millisecondes
        max, // Limite de requêtes par fenêtre
        message: {
            success: false,
            message,
            code: 'RATE_LIMIT_EXCEEDED'
        },
        standardHeaders: true, // Retourner les infos de rate limit dans les headers `RateLimit-*`
        legacyHeaders: false, // Désactiver les headers `X-RateLimit-*`
        skipSuccessfulRequests, // Ne pas compter les requêtes réussies
        handler: (req, res) => {
            res.status(429).json({
                success: false,
                message,
                code: 'RATE_LIMIT_EXCEEDED',
                retryAfter: Math.ceil(windowMs / 1000)
            });
        }
    });
};

// Différents niveaux de rate limiting
const basicRateLimiter = {
    // Standard : 100 requêtes par 15 minutes
    standard: createBasicRateLimiter(
        15 * 60 * 1000, // 15 minutes
        100,
        'Trop de requêtes. Veuillez réessayer dans quelques minutes.'
    ),
    // Strict : 20 requêtes par 15 minutes pour les actions sensibles
    strict: createBasicRateLimiter(
        15 * 60 * 1000, // 15 minutes
        20,
        'Trop de tentatives. Veuillez patienter avant de réessayer.',
        true // Ne pas compter les requêtes réussies
    ),
    // Auth : 5 tentatives par 15 minutes pour l'authentification
    auth: createBasicRateLimiter(
        15 * 60 * 1000, // 15 minutes
        5,
        'Trop de tentatives de connexion. Compte temporairement bloqué.',
        true
    ),
    // Création : 10 créations par heure
    create: createBasicRateLimiter(
        60 * 60 * 1000, // 1 heure
        10,
        'Limite de création atteinte. Veuillez patienter avant de créer du nouveau contenu.'
    ),
    // Messages : 50 messages par 10 minutes
    messages: createBasicRateLimiter(
        10 * 60 * 1000, // 10 minutes
        50,
        'Trop de messages envoyés. Veuillez ralentir.'
    ),
    // Upload : 5 uploads par 10 minutes
    upload: createBasicRateLimiter(
        10 * 60 * 1000, // 10 minutes
        5,
        'Limite d\'upload atteinte. Veuillez patienter avant d\'envoyer d\'autres fichiers.'
    )
};

// Rate limiter par IP et par utilisateur
const createUserBasedRateLimiter = (windowMs, max, message) => {
    return rateLimit({
        windowMs,
        max,
        keyGenerator: (req) => {
            // Utiliser l'ID utilisateur si disponible, sinon l'IP
            return req.user?.id || req.ip;
        },
        message: {
            success: false,
            message,
            code: 'RATE_LIMIT_EXCEEDED'
        },
        standardHeaders: true,
        legacyHeaders: false,
        handler: (req, res) => {
            res.status(429).json({
                success: false,
                message,
                code: 'RATE_LIMIT_EXCEEDED',
                retryAfter: Math.ceil(windowMs / 1000)
            });
        }
    });
};

// Rate limiters spécialisés par utilisateur
const userBasedRateLimiter = {
    // Actions utilisateur : 200 requêtes par heure par utilisateur
    userActions: createUserBasedRateLimiter(
        60 * 60 * 1000, // 1 heure
        200,
        'Limite d\'actions utilisateur atteinte. Veuillez patienter.'
    ),
    // Recherches : 100 recherches par heure par utilisateur
    searches: createUserBasedRateLimiter(
        60 * 60 * 1000, // 1 heure
        100,
        'Trop de recherches effectuées. Veuillez patienter.'
    )
};

/**
 * Middleware global à appliquer sur toutes les routes
 */
const globalRateLimit = rateLimiters.general;

/**
 * Middleware intelligent qui applique le bon limiteur selon le path
 */
const smartRateLimit = (req, res, next) => {
    const path = req.path.toLowerCase();
    const method = req.method.toLowerCase();
    // Détection automatique du type de limiteur à appliquer
    let limiter = globalRateLimit;
    if (path.includes('/auth/login')) {
        limiter = rateLimiters.auth.login;
    } else if (path.includes('/auth/register')) {
        limiter = rateLimiters.auth.register;
    } else if (path.includes('/trajets') && method === 'post') {
        limiter = rateLimiters.trajet.create;
    } else if (path.includes('/trajets/search')) {
        limiter = rateLimiters.trajet.search;
    } else if (path.includes('/reservations') && method === 'post') {
        limiter = rateLimiters.reservation.create;
    } else if (path.includes('/messages') && method === 'post') {
        limiter = rateLimiters.message.send;
    } else if (path.includes('/alertes-urgence') && method === 'post') {
        limiter = rateLimiters.alerteUrgence.create;
    } else if (path.includes('/paiements/webhook')) {
        limiter = rateLimiters.paiement.webhook;
    }
    return limiter(req, res, next);
};

// Export compatible avec votre server.js actuel
module.exports = {
    globalRateLimit,
    rateLimiters,
    smartRateLimit,
    createRateLimiter,
    basicRateLimiter,
    userBasedRateLimiter,
    createUserBasedRateLimiter
};
