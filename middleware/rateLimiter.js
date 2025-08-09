const rateLimit = require('express-rate-limit');

/**
 * Configuration de base pour le rate limiting
 * Compatible avec express-rate-limit v6+
 */
const createBaseLimiter = (options = {}) => {
  const defaultOptions = {
    windowMs: 15 * 60 * 1000, // 15 minutes par défaut
    max: 100, // limite par défaut
    message: {
      success: false,
      message: 'Trop de requêtes, veuillez réessayer plus tard.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    // Remplace onLimitReached (déprécié) par handler
    handler: (req, res) => {
      const retryAfter = Math.ceil((options.windowMs || 15 * 60 * 1000) / 1000);
      console.log(`Rate limit atteint - IP: ${req.ip}, Route: ${req.originalUrl}, User: ${req.user?._id || 'Non connecté'}`);
      
      res.status(429).json({
        success: false,
        message: options.message?.message || 'Limite de requêtes atteinte',
        retryAfter: retryAfter,
        limit: options.max || 100,
        windowMs: options.windowMs || 15 * 60 * 1000
      });
    },
    skip: (req) => {
      // Whitelist pour certaines IPs (développement, monitoring)
      const whitelistedIPs = process.env.RATE_LIMIT_WHITELIST?.split(',') || [];
      return whitelistedIPs.includes(req.ip);
    },
    keyGenerator: (req) => {
      // Par défaut utiliser l'IP, mais peut être overridé
      return req.ip;
    }
  };

  return rateLimit({ ...defaultOptions, ...options });
};

/**
 * Configuration des limites de taux par type d'opération pour limiterTaux
 */
const rateLimitConfigs = {
  // Lecture standard
  lecture: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requêtes par fenêtre
    message: {
      success: false,
      message: 'Trop de requêtes de lecture, veuillez réessayer plus tard.'
    }
  },
  
  // Recherches (plus coûteuses)
  recherche: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 50, // 50 recherches par fenêtre
    message: {
      success: false,
      message: 'Trop de recherches, veuillez réessayer plus tard.'
    }
  },
  
  // Création d'alertes d'urgence (très stricte)
  creation_urgence: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Seulement 5 alertes d'urgence par fenêtre
    message: {
      success: false,
      message: 'Limite d\'alertes d\'urgence atteinte. Contactez les services d\'urgence directement si nécessaire.'
    }
  },
  
  // Création standard
  creation: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // 10 créations par fenêtre
    message: {
      success: false,
      message: 'Trop de créations, veuillez réessayer plus tard.'
    }
  },
  
  // Modifications
  modification: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 30, // 30 modifications par fenêtre
    message: {
      success: false,
      message: 'Trop de modifications, veuillez réessayer plus tard.'
    }
  },
  
  // Actions diverses
  action: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // 20 actions par fenêtre
    message: {
      success: false,
      message: 'Trop d\'actions, veuillez réessayer plus tard.'
    }
  },
  
  // Export (très limité)
  export: {
    windowMs: 60 * 60 * 1000, // 1 heure
    max: 5, // 5 exports par heure
    message: {
      success: false,
      message: 'Limite d\'exports atteinte, veuillez réessayer dans une heure.'
    }
  },
  
  // Administration
  admin: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 200, // 200 actions admin par fenêtre
    message: {
      success: false,
      message: 'Limite d\'actions administratives atteinte.'
    }
  },
  
  // Suppression (très restrictive)
  suppression: {
    windowMs: 60 * 60 * 1000, // 1 heure
    max: 10, // 10 suppressions par heure
    message: {
      success: false,
      message: 'Limite de suppressions atteinte, veuillez réessayer dans une heure.'
    }
  }
};

/**
 * Fonction limiterTaux compatible avec votre code existant
 * Créer un limiteur de taux basé sur le type d'opération
 * @param {string} type - Type d'opération (lecture, creation, etc.)
 * @param {object} customConfig - Configuration personnalisée (optionnelle)
 * @returns {Function} Middleware de limitation de taux
 */
const limiterTaux = (type, customConfig = {}) => {
  // Récupérer la configuration par défaut pour ce type
  const defaultConfig = rateLimitConfigs[type] || rateLimitConfigs.lecture;
  
  // Fusionner avec la configuration personnalisée
  const config = {
    ...defaultConfig,
    ...customConfig
  };
  
  return rateLimit({
    windowMs: config.windowMs,
    max: config.max,
    message: config.message,
    standardHeaders: true, // Retourner les infos de limite dans les headers
    legacyHeaders: false, // Désactiver les anciens headers X-RateLimit-*
    
    // Fonction pour identifier les clients (par IP par défaut)
    keyGenerator: (req) => {
      // Si l'utilisateur est authentifié, utiliser son ID
      if (req.user && req.user.id) {
        return `user_${req.user.id}`;
      }
      // Sinon utiliser l'IP
      return req.ip;
    },
    
    // Fonction appelée quand la limite est dépassée
    handler: (req, res) => {
      const retryAfter = Math.ceil(config.windowMs / 1000);
      
      console.warn(`🚫 Limite de taux atteinte:`, {
        type: type,
        key: req.ip,
        user: req.user?.id || 'anonyme',
        path: req.originalUrl,
        timestamp: new Date().toISOString()
      });
      
      // Log spécial pour les alertes d'urgence
      if (type === 'creation_urgence') {
        console.error(`🚨 LIMITE ALERTE URGENCE ATTEINTE par ${req.user?.id || req.ip}`);
      }
      
      res.status(429).json({
        success: false,
        message: config.message.message,
        retryAfter: retryAfter,
        limit: config.max,
        windowMs: config.windowMs
      });
    }
  });
};

/**
 * Rate limiter général pour toutes les routes
 */
const generalLimiter = createBaseLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // 200 requêtes par IP
  message: {
    success: false,
    message: 'Limite générale atteinte. Maximum 200 requêtes par 15 minutes.'
  }
});

/**
 * Rate limiter strict pour l'authentification
 */
const authLimiter = createBaseLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 tentatives de connexion par IP
  message: {
    success: false,
    message: 'Trop de tentatives de connexion. Réessayez dans 15 minutes.'
  },
  skipSuccessfulRequests: true, // Ne compte que les échecs
  handler: (req, res) => {
    console.log(`Tentatives de connexion multiples détectées - IP: ${req.ip}, Email: ${req.body?.email || 'Non fourni'}`);
    res.status(429).json({
      success: false,
      message: 'Compte temporairement verrouillé pour sécurité. Réessayez dans 15 minutes.',
      retryAfter: 900, // 15 minutes
      securityAlert: true
    });
  }
});

/**
 * Rate limiter pour la création de trajets
 */
const createTrajetLimiter = createBaseLimiter({
  windowMs: 60 * 60 * 1000, // 1 heure
  max: 10, // 10 trajets par heure par utilisateur
  message: {
    success: false,
    message: 'Limite de création de trajets atteinte. Maximum 10 trajets par heure.'
  },
  keyGenerator: (req) => {
    // Utiliser l'ID utilisateur pour les utilisateurs connectés
    return req.user ? `trajet_${req.user._id.toString()}` : `trajet_ip_${req.ip}`;
  },
  handler: (req, res) => {
    console.log(`Limite création trajets - User: ${req.user?._id || req.ip}`);
    res.status(429).json({
      success: false,
      message: 'Vous avez atteint la limite de création de trajets.',
      retryAfter: 3600, // 1 heure
      conseil: 'Planifiez vos trajets à l\'avance pour éviter cette limitation.'
    });
  }
});

/**
 * Rate limiter pour les réservations
 */
const reservationLimiter = createBaseLimiter({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 15, // 15 réservations par 10 minutes
  message: {
    success: false,
    message: 'Limite de réservations atteinte. Maximum 15 réservations par 10 minutes.'
  },
  keyGenerator: (req) => {
    return req.user ? `reservation_${req.user._id.toString()}` : `reservation_ip_${req.ip}`;
  }
});

/**
 * Rate limiter pour les messages de chat
 */
const messageLimiter = createBaseLimiter({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 30, // 30 messages par minute
  message: {
    success: false,
    message: 'Limite de messages atteinte. Maximum 30 messages par minute.'
  },
  keyGenerator: (req) => {
    return req.user ? `message_${req.user._id.toString()}` : `message_ip_${req.ip}`;
  },
  handler: (req, res) => {
    res.status(429).json({
      success: false,
      message: 'Vous envoyez trop de messages rapidement.',
      retryAfter: 60,
      conseil: 'Patientez un moment avant d\'envoyer d\'autres messages.'
    });
  }
});

/**
 * Rate limiter pour les recherches de trajets
 */
const searchLimiter = createBaseLimiter({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 60, // 60 recherches par minute
  message: {
    success: false,
    message: 'Trop de recherches. Maximum 60 recherches par minute.'
  },
  keyGenerator: (req) => {
    return req.user ? `search_${req.user._id.toString()}` : `search_ip_${req.ip}`;
  }
});

/**
 * Rate limiter pour les uploads de fichiers (photos, documents)
 */
const uploadLimiter = createBaseLimiter({
  windowMs: 60 * 60 * 1000, // 1 heure
  max: 20, // 20 uploads par heure
  message: {
    success: false,
    message: 'Limite d\'upload atteinte. Maximum 20 fichiers par heure.'
  },
  keyGenerator: (req) => {
    return req.user ? `upload_${req.user._id.toString()}` : `upload_ip_${req.ip}`;
  }
});

/**
 * Rate limiter spécial pour les alertes d'urgence
 */
const emergencyLimiter = createBaseLimiter({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 3, // 3 alertes d'urgence maximum par 5 minutes
  message: {
    success: false,
    message: 'Limite d\'alertes d\'urgence atteinte.'
  },
  keyGenerator: (req) => {
    return req.user ? `emergency_${req.user._id.toString()}` : `emergency_ip_${req.ip}`;
  },
  handler: (req, res) => {
    console.log(`ALERTE: Tentatives multiples d'alertes d'urgence - User: ${req.user?._id || req.ip}`);
    res.status(429).json({
      success: false,
      message: 'Trop d\'alertes d\'urgence envoyées.',
      retryAfter: 300,
      urgence: 'Si c\'est une vraie urgence, appelez directement les services d\'urgence: 110, 111, 112'
    });
  }
});

/**
 * Rate limiter pour les évaluations
 */
const evaluationLimiter = createBaseLimiter({
  windowMs: 60 * 60 * 1000, // 1 heure
  max: 25, // 25 évaluations par heure
  message: {
    success: false,
    message: 'Limite d\'évaluations atteinte. Maximum 25 évaluations par heure.'
  },
  keyGenerator: (req) => {
    return req.user ? `eval_${req.user._id.toString()}` : `eval_ip_${req.ip}`;
  }
});

/**
 * Rate limiter pour les signalements
 */
const reportLimiter = createBaseLimiter({
  windowMs: 60 * 60 * 1000, // 1 heure
  max: 5, // 5 signalements par heure maximum
  message: {
    success: false,
    message: 'Limite de signalements atteinte. Maximum 5 signalements par heure.'
  },
  keyGenerator: (req) => {
    return req.user ? `report_${req.user._id.toString()}` : `report_ip_${req.ip}`;
  },
  handler: (req, res) => {
    console.log(`Signalements multiples - User: ${req.user?._id || req.ip}`);
    res.status(429).json({
      success: false,
      message: 'Vous avez atteint la limite de signalements.',
      retryAfter: 3600,
      note: 'Les signalements abusifs peuvent entraîner des sanctions.'
    });
  }
});

/**
 * Rate limiter permissif pour les administrateurs
 */
const adminLimiter = createBaseLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // 1000 requêtes pour les admins
  message: {
    success: false,
    message: 'Limite administrative atteinte.'
  },
  keyGenerator: (req) => {
    return req.admin ? `admin_${req.admin._id.toString()}` : `admin_ip_${req.ip}`;
  }
});

/**
 * Rate limiter pour la vérification d'identité
 */
const verificationLimiter = createBaseLimiter({
  windowMs: 60 * 60 * 1000, // 1 heure
  max: 3, // 3 tentatives de vérification par heure
  message: {
    success: false,
    message: 'Limite de vérifications d\'identité atteinte. Maximum 3 tentatives par heure.'
  },
  keyGenerator: (req) => {
    return req.user ? `verify_${req.user._id.toString()}` : `verify_ip_${req.ip}`;
  }
});

/**
 * Rate limiter pour les paiements
 */
const paymentLimiter = createBaseLimiter({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 10, // 10 tentatives de paiement par 10 minutes
  message: {
    success: false,
    message: 'Limite de transactions atteinte. Maximum 10 paiements par 10 minutes.'
  },
  keyGenerator: (req) => {
    return req.user ? `payment_${req.user._id.toString()}` : `payment_ip_${req.ip}`;
  },
  handler: (req, res) => {
    console.log(`Tentatives de paiement multiples - User: ${req.user?._id || req.ip}`);
    res.status(429).json({
      success: false,
      message: 'Trop de tentatives de paiement.',
      retryAfter: 600,
      securite: 'Pour votre sécurité, patientez avant de réessayer.'
    });
  }
});

/**
 * Middleware adaptatif basé sur le score de confiance utilisateur
 */
const adaptiveLimiter = (req, res, next) => {
  // Admin : limites très élevées
  if (req.admin) {
    return adminLimiter(req, res, next);
  }
  
  // Utilisateur avec score de confiance élevé
  if (req.user && req.user.estVerifie && req.user.scoreConfiance >= 80) {
    const trustedUserLimiter = createBaseLimiter({
      windowMs: 15 * 60 * 1000,
      max: 300, // Limites élevées pour utilisateurs de confiance
      message: {
        success: false,
        message: 'Limite atteinte (utilisateur vérifié).'
      },
      keyGenerator: (req) => `trusted_${req.user._id.toString()}`
    });
    return trustedUserLimiter(req, res, next);
  }
  
  // Utilisateur vérifié mais score moyen
  if (req.user && req.user.estVerifie && req.user.scoreConfiance >= 50) {
    const verifiedUserLimiter = createBaseLimiter({
      windowMs: 15 * 60 * 1000,
      max: 150, // Limites moyennes
      message: {
        success: false,
        message: 'Limite atteinte (utilisateur vérifié).'
      },
      keyGenerator: (req) => `verified_${req.user._id.toString()}`
    });
    return verifiedUserLimiter(req, res, next);
  }
  
  // Utilisateur connecté mais non vérifié ou score faible
  if (req.user) {
    const basicUserLimiter = createBaseLimiter({
      windowMs: 15 * 60 * 1000,
      max: 80, // Limites réduites
      message: {
        success: false,
        message: 'Limite atteinte. Vérifiez votre identité pour augmenter vos limites.'
      },
      keyGenerator: (req) => `basic_${req.user._id.toString()}`
    });
    return basicUserLimiter(req, res, next);
  }
  
  // Utilisateur non connecté : limites les plus strictes
  return generalLimiter(req, res, next);
};

/**
 * Rate limiter spécifique pour les événements
 */
const eventLimiter = createBaseLimiter({
  windowMs: 30 * 60 * 1000, // 30 minutes
  max: 50, // 50 requêtes liées aux événements
  message: {
    success: false,
    message: 'Limite d\'accès aux événements atteinte.'
  },
  keyGenerator: (req) => {
    return req.user ? `event_${req.user._id.toString()}` : `event_ip_${req.ip}`;
  }
});

/**
 * Rate limiter pour les notifications
 */
const notificationLimiter = createBaseLimiter({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 20, // 20 notifications par 5 minutes
  message: {
    success: false,
    message: 'Limite de notifications atteinte.'
  },
  keyGenerator: (req) => {
    return req.user ? `notif_${req.user._id.toString()}` : `notif_ip_${req.ip}`;
  }
});

/**
 * Rate limiter pour les mises à jour de profil
 */
const profileUpdateLimiter = createBaseLimiter({
  windowMs: 60 * 60 * 1000, // 1 heure
  max: 10, // 10 mises à jour de profil par heure
  message: {
    success: false,
    message: 'Limite de mises à jour de profil atteinte.'
  },
  keyGenerator: (req) => {
    return req.user ? `profile_${req.user._id.toString()}` : `profile_ip_${req.ip}`;
  }
});

/**
 * Rate limiter pour les conversations
 */
const conversationLimiter = createBaseLimiter({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // 100 actions de conversation par minute
  message: {
    success: false,
    message: 'Limite d\'activité de conversation atteinte.'
  },
  keyGenerator: (req) => {
    return req.user ? `conv_${req.user._id.toString()}` : `conv_ip_${req.ip}`;
  }
});

/**
 * Rate limiter pour la géolocalisation
 */
const geoLimiter = createBaseLimiter({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 120, // 120 requêtes de géolocalisation par minute
  message: {
    success: false,
    message: 'Limite de requêtes de géolocalisation atteinte.'
  },
  keyGenerator: (req) => {
    return req.user ? `geo_${req.user._id.toString()}` : `geo_ip_${req.ip}`;
  }
});

/**
 * Rate limiter pour l'API publique (sans authentification)
 */
const publicApiLimiter = createBaseLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // 50 requêtes pour l'API publique
  message: {
    success: false,
    message: 'Limite API publique atteinte. Connectez-vous pour des limites plus élevées.'
  }
});

/**
 * Rate limiter spécial pour les opérations sensibles
 */
const sensitiveLimiter = createBaseLimiter({
  windowMs: 60 * 60 * 1000, // 1 heure
  max: 3, // 3 opérations sensibles par heure
  message: {
    success: false,
    message: 'Limite d\'opérations sensibles atteinte.'
  },
  keyGenerator: (req) => {
    return req.user ? `sensitive_${req.user._id.toString()}` : `sensitive_ip_${req.ip}`;
  },
  handler: (req, res) => {
    console.log(`SÉCURITÉ: Opérations sensibles multiples - User: ${req.user?._id || req.ip}, Route: ${req.originalUrl}`);
    res.status(429).json({
      success: false,
      message: 'Opération bloquée pour sécurité.',
      retryAfter: 3600,
      contact: 'Contactez le support si vous pensez qu\'il s\'agit d\'une erreur.'
    });
  }
});

/**
 * Fonction principale rateLimiter (pour compatibilité)
 */
const rateLimiter = (options = {}) => {
  return createBaseLimiter(options);
};

// Export principal de la fonction rateLimiter
module.exports = rateLimiter;

// Export de la fonction limiterTaux (AJOUTÉ POUR VOTRE COMPATIBILITÉ)
module.exports.limiterTaux = limiterTaux;

// Export des limiters prédéfinis
module.exports.general = generalLimiter;
module.exports.auth = authLimiter;
module.exports.createTrajet = createTrajetLimiter;
module.exports.reservation = reservationLimiter;
module.exports.message = messageLimiter;
module.exports.search = searchLimiter;
module.exports.upload = uploadLimiter;
module.exports.emergency = emergencyLimiter;
module.exports.evaluation = evaluationLimiter;
module.exports.report = reportLimiter;
module.exports.admin = adminLimiter;
module.exports.adaptive = adaptiveLimiter;
module.exports.event = eventLimiter;
module.exports.notification = notificationLimiter;
module.exports.profileUpdate = profileUpdateLimiter;
module.exports.conversation = conversationLimiter;
module.exports.geo = geoLimiter;
module.exports.publicApi = publicApiLimiter;
module.exports.sensitive = sensitiveLimiter;
module.exports.payment = paymentLimiter;
module.exports.verification = verificationLimiter;

// Alias pour différentes conventions de nommage
module.exports.authLimiter = authLimiter;
module.exports.createTrajetLimiter = createTrajetLimiter;
module.exports.reservationLimiter = reservationLimiter;
module.exports.messageLimiter = messageLimiter;
module.exports.searchLimiter = searchLimiter;
module.exports.uploadLimiter = uploadLimiter;
module.exports.emergencyLimiter = emergencyLimiter;
module.exports.evaluationLimiter = evaluationLimiter;
module.exports.reportLimiter = reportLimiter;
module.exports.adminLimiter = adminLimiter;
module.exports.adaptiveLimiter = adaptiveLimiter;