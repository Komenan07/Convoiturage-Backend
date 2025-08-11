// =====================================================
// MIDDLEWARES DE RATE LIMITING
// =====================================================

const rateLimit = require('express-rate-limit');
const MongoStore = require('rate-limit-mongo');

/**
 * Configuration des rate limiters
 */
const createRateLimiter = (windowMs, max, message, skipSuccessfulRequests = false) => {
  return rateLimit({
    store: MongoStore.create({
      uri: process.env.MONGODB_URI,
      collectionName: 'rateLimits',
      expireTimeMs: windowMs
    }),
    windowMs,
    max,
    skipSuccessfulRequests,
    message: {
      success: false,
      message,
      code: 'RATE_LIMIT_EXCEEDED'
    },
    standardHeaders: true,
    legacyHeaders: false,
    // Fonction pour identifier l'utilisateur
    keyGenerator: (req) => {
      return req.user?.id || req.ip;
    },
    // Handler personnalisé pour le rate limiting
    handler: (req, res) => {
      console.warn(`Rate limit dépassé: ${req.ip} - ${req.originalUrl}`);
      res.status(429).json({
        success: false,
        message,
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: Math.round(windowMs / 1000)
      });
    }
  });
};

/**
 * Rate limiters spécialisés
 */
const rateLimiter = {
  // Limiter les tentatives de paiement
  payment: createRateLimiter(
    15 * 60 * 1000, // 15 minutes
    5, // 5 tentatives max
    'Trop de tentatives de paiement. Réessayez dans 15 minutes.',
    false
  ),

  // Limiter les requêtes standard
  standard: createRateLimiter(
    1 * 60 * 1000, // 1 minute
    30, // 30 requêtes max
    'Trop de requêtes. Réessayez dans 1 minute.',
    true
  ),

  // Limiter les callbacks (plus permissif)
  callback: createRateLimiter(
    1 * 60 * 1000, // 1 minute
    100, // 100 callbacks max
    'Trop de callbacks reçus.',
    false
  ),

  // Limiter les rapports (plus restrictif)
  reporting: createRateLimiter(
    60 * 60 * 1000, // 1 heure
    10, // 10 rapports max par heure
    'Limite de génération de rapports atteinte. Réessayez dans 1 heure.',
    false
  ),

  // Limiter les authentifications
  auth: createRateLimiter(
    15 * 60 * 1000, // 15 minutes
    5, // 5 tentatives de connexion max
    'Trop de tentatives de connexion. Réessayez dans 15 minutes.',
    false
  )
};

/**
 * Rate limiter dynamique basé sur le rôle utilisateur
 */
const createDynamicRateLimiter = (config) => {
  return rateLimit({
    store: MongoStore.create({
      uri: process.env.MONGODB_URI,
      collectionName: 'rateLimits',
      expireTimeMs: config.windowMs
    }),
    windowMs: config.windowMs,
    max: (req) => {
      // Différentes limites selon le rôle
      const role = req.user?.role;
      switch (role) {
        case 'ADMIN':
          return config.limits.admin || config.limits.default * 5;
        case 'PREMIUM':
          return config.limits.premium || config.limits.default * 2;
        case 'USER':
        default:
          return config.limits.default;
      }
    },
    keyGenerator: (req) => {
      return req.user?.id || req.ip;
    },
    handler: (req, res) => {
      const role = req.user?.role || 'anonymous';
      console.warn(`Rate limit dépassé pour ${role}: ${req.ip} - ${req.originalUrl}`);
      res.status(429).json({
        success: false,
        message: config.message,
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: Math.round(config.windowMs / 1000),
        userRole: role
      });
    }
  });
};

/**
 * Rate limiter intelligent qui s'adapte aux patterns d'usage
 */
const createAdaptiveRateLimiter = (baseConfig) => {
  return rateLimit({
    store: MongoStore.create({
      uri: process.env.MONGODB_URI,
      collectionName: 'adaptiveRateLimits',
      expireTimeMs: baseConfig.windowMs
    }),
    windowMs: baseConfig.windowMs,
    max: (req) => {
      const hour = new Date().getHours();
      const isBusinessHours = hour >= 9 && hour <= 17;
      const multiplier = isBusinessHours ? 1.5 : 1;
      
      return Math.floor(baseConfig.max * multiplier);
    },
    keyGenerator: (req) => {
      return req.user?.id || req.ip;
    },
    handler: (req, res) => {
      console.warn(`Rate limit adaptatif dépassé: ${req.ip} - ${req.originalUrl}`);
      res.status(429).json({
        success: false,
        message: baseConfig.message,
        code: 'ADAPTIVE_RATE_LIMIT_EXCEEDED',
        retryAfter: Math.round(baseConfig.windowMs / 1000)
      });
    }
  });
};

module.exports = {
  rateLimiter,
  createRateLimiter,
  createDynamicRateLimiter,
  createAdaptiveRateLimiter
};