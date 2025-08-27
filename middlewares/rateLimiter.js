// middlewares/rateLimiter.js
const rateLimit = require('express-rate-limit');

/**
 * Configuration simplifiée des rate limiters pour application de covoiturage
 * Intégration avec le système de messages existant
 */

// Configuration de base pour tous les limiters
const baseConfig = {
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    console.warn('[RATE_LIMIT] Limite dépassée:', {
      ip: req.ip,
      user: req.user?.id,
      path: req.path,
      method: req.method
    });
    
    res.status(429).json({
      succes: false,
      erreur: 'Trop de requêtes',
      details: 'Limite de taux dépassée, veuillez patienter',
      code: 'RATE_LIMIT_EXCEEDED'
    });
  },
  keyGenerator: (req) => req.user?.id || req.ip
};

/**
 * Rate limiters spécialisés pour l'application de covoiturage
 */
const rateLimiters = {
  
  // AUTHENTIFICATION - Sécurité renforcée
  auth: {
    login: rateLimit({
      ...baseConfig,
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 5, // 5 tentatives par IP/utilisateur
      message: 'Trop de tentatives de connexion. Réessayez dans 15 minutes.',
      skipSuccessfulRequests: true, // Ne pas compter les connexions réussies
      keyGenerator: (req) => req.ip // Par IP pour les tentatives de login
    }),
    
    register: rateLimit({
      ...baseConfig,
      windowMs: 60 * 60 * 1000, // 1 heure
      max: 3, // 3 inscriptions par IP par heure
      message: 'Trop d\'inscriptions depuis cette adresse. Réessayez dans 1 heure.',
      keyGenerator: (req) => req.ip
    }),
    
    resetPassword: rateLimit({
      ...baseConfig,
      windowMs: 60 * 60 * 1000, // 1 heure
      max: 3, // 3 demandes de reset par IP par heure
      message: 'Trop de demandes de réinitialisation. Réessayez dans 1 heure.',
      keyGenerator: (req) => req.ip
    })
  },

  // TRAJETS - Gestion des annonces
  trajet: {
    create: rateLimit({
      ...baseConfig,
      windowMs: 60 * 60 * 1000, // 1 heure
      max: 10, // 10 trajets par conducteur par heure
      message: 'Limite de création de trajets atteinte. Attendez 1 heure.'
    }),
    
    search: rateLimit({
      ...baseConfig,
      windowMs: 60 * 1000, // 1 minute
      max: 50, // 50 recherches par minute par utilisateur
      message: 'Trop de recherches. Attendez 1 minute.'
    }),
    
    update: rateLimit({
      ...baseConfig,
      windowMs: 30 * 60 * 1000, // 30 minutes
      max: 20, // 20 modifications par 30 minutes
      message: 'Trop de modifications. Attendez 30 minutes.'
    })
  },

  // RÉSERVATIONS - Actions importantes
  reservation: {
    create: rateLimit({
      ...baseConfig,
      windowMs: 5 * 60 * 1000, // 5 minutes
      max: 5, // 5 réservations par 5 minutes
      message: 'Trop de réservations. Attendez 5 minutes.'
    }),
    
    cancel: rateLimit({
      ...baseConfig,
      windowMs: 60 * 60 * 1000, // 1 heure
      max: 10, // 10 annulations par heure
      message: 'Trop d\'annulations. Attendez 1 heure.'
    })
  },

  // MESSAGES - Compatible avec votre système existant
  message: {
    send: rateLimit({
      ...baseConfig,
      windowMs: 60 * 1000, // 1 minute
      max: 30, // 30 messages par minute (identique à votre middleware)
      message: 'Trop de messages envoyés. Attendez 1 minute.'
    }),
    
    read: rateLimit({
      ...baseConfig,
      windowMs: 60 * 1000, // 1 minute
      max: 100, // 100 lectures par minute
      message: 'Trop de requêtes de lecture. Attendez 1 minute.'
    }),
    
    search: rateLimit({
      ...baseConfig,
      windowMs: 60 * 1000, // 1 minute
      max: 20, // 20 recherches par minute
      message: 'Trop de recherches dans les messages. Attendez 1 minute.'
    })
  },

  // PAIEMENTS - Sécurité maximale
  paiement: {
    initiate: rateLimit({
      ...baseConfig,
      windowMs: 60 * 60 * 1000, // 1 heure
      max: 20, // 20 paiements par heure par utilisateur
      message: 'Limite de transactions atteinte. Attendez 1 heure.'
    }),
    
    webhook: rateLimit({
      ...baseConfig,
      windowMs: 60 * 1000, // 1 minute
      max: 100, // 100 webhooks par minute
      message: 'Trop de webhooks de paiement.',
      keyGenerator: (req) => req.get('X-Forwarded-For') || req.ip
    })
  },

  // PROFIL UTILISATEUR
  profil: {
    update: rateLimit({
      ...baseConfig,
      windowMs: 60 * 60 * 1000, // 1 heure
      max: 10, // 10 modifications de profil par heure
      message: 'Trop de modifications de profil. Attendez 1 heure.'
    }),
    
    uploadPhoto: rateLimit({
      ...baseConfig,
      windowMs: 60 * 60 * 1000, // 1 heure
      max: 5, // 5 uploads de photo par heure
      message: 'Trop d\'uploads de photo. Attendez 1 heure.'
    })
  },

  // ÉVALUATIONS ET AVIS
  evaluation: {
    create: rateLimit({
      ...baseConfig,
      windowMs: 60 * 60 * 1000, // 1 heure
      max: 10, // 10 évaluations par heure
      message: 'Trop d\'évaluations. Attendez 1 heure.'
    })
  },

  // SIGNALEMENTS - Actions sensibles
  signalement: {
    create: rateLimit({
      ...baseConfig,
      windowMs: 60 * 60 * 1000, // 1 heure
      max: 5, // 5 signalements par heure
      message: 'Trop de signalements. Attendez 1 heure.'
    })
  }
};

/**
 * Rate limiter général pour toute l'API
 */
const globalRateLimit = rateLimit({
  ...baseConfig,
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'production' ? 1000 : 5000, // Plus permissif en développement
  message: 'Trop de requêtes depuis cette IP. Réessayez dans 15 minutes.',
  keyGenerator: (req) => req.ip, // Par IP pour le rate limit global
  skip: (req) => {
    // Skip pour les routes de santé
    return req.path === '/api/health' || req.path === '/health';
  }
});

/**
 * Rate limiter intelligent selon l'endpoint
 */
const smartRateLimit = (req, res, next) => {
  const path = req.path.toLowerCase();
  const method = req.method.toLowerCase();
  
  // Détection automatique du limiteur approprié
  let limiter = null;
  
  // Authentification
  if (path.includes('/auth/login')) {
    limiter = rateLimiters.auth.login;
  } else if (path.includes('/auth/register')) {
    limiter = rateLimiters.auth.register;
  } else if (path.includes('/auth/reset-password')) {
    limiter = rateLimiters.auth.resetPassword;
  }
  // Trajets
  else if (path.includes('/trajets') && method === 'post') {
    limiter = rateLimiters.trajet.create;
  } else if (path.includes('/trajets/search')) {
    limiter = rateLimiters.trajet.search;
  } else if (path.includes('/trajets') && method === 'put') {
    limiter = rateLimiters.trajet.update;
  }
  // Réservations
  else if (path.includes('/reservations') && method === 'post') {
    limiter = rateLimiters.reservation.create;
  } else if (path.includes('/reservations') && method === 'delete') {
    limiter = rateLimiters.reservation.cancel;
  }
  // Messages (compatible avec vos routes existantes)
  else if (path.includes('/messages/texte') || path.includes('/messages/position') || path.includes('/messages/modele')) {
    limiter = rateLimiters.message.send;
  } else if (path.includes('/messages/conversation')) {
    limiter = rateLimiters.message.read;
  } else if (path.includes('/messages/recherche')) {
    limiter = rateLimiters.message.search;
  }
  // Paiements
  else if (path.includes('/paiements') && method === 'post') {
    limiter = rateLimiters.paiement.initiate;
  } else if (path.includes('/paiements/webhook')) {
    limiter = rateLimiters.paiement.webhook;
  }
  // Profil
  else if (path.includes('/profil') && method === 'put') {
    limiter = rateLimiters.profil.update;
  } else if (path.includes('/profil/photo')) {
    limiter = rateLimiters.profil.uploadPhoto;
  }
  // Évaluations
  else if (path.includes('/evaluations') && method === 'post') {
    limiter = rateLimiters.evaluation.create;
  }
  // Signalements
  else if (path.includes('/signalements') || path.endsWith('/signaler')) {
    limiter = rateLimiters.signalement.create;
  }
  
  // Appliquer le limiteur spécifique ou passer au suivant
  if (limiter) {
    return limiter(req, res, next);
  }
  
  next();
};

/**
 * Utilitaires pour créer des limiteurs personnalisés
 */
const createCustomLimiter = (windowMs, max, message, options = {}) => {
  return rateLimit({
    ...baseConfig,
    ...options,
    windowMs,
    max,
    message
  });
};

/**
 * Limiteurs par rôle utilisateur
 */
const createRoleLimiter = (windowMs, limits) => {
  return rateLimit({
    ...baseConfig,
    windowMs,
    max: (req) => {
      const userRole = req.user?.role || 'UTILISATEUR';
      return limits[userRole] || limits.UTILISATEUR || 100;
    },
    keyGenerator: (req) => req.user?.id || req.ip
  });
};

// Exemple d'utilisation des limiteurs par rôle
const apiLimiterByRole = createRoleLimiter(60 * 60 * 1000, { // 1 heure
  UTILISATEUR: 500,
  CONDUCTEUR: 800,
  MODERATEUR: 2000,
  ADMIN: 5000
});

module.exports = {
  // Limiteurs principaux
  globalRateLimit,
  smartRateLimit,
  rateLimiters,
  
  // Utilitaires
  createCustomLimiter,
  createRoleLimiter,
  apiLimiterByRole,
  
  // Export de baseConfig pour extensions
  baseConfig
};