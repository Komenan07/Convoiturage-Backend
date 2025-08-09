const rateLimit = require('express-rate-limit');
const MongoStore = require('rate-limit-mongo');

// Configuration de base pour MongoDB
const createMongoStore = (collectionName) => {
  return new MongoStore({
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/covoiturage',
    collectionName: collectionName,
    expireTimeMs: 15 * 60 * 1000 // 15 minutes
  });
};

const rateLimitMiddleware = {
  // Limitation pour la création de conversations
  createConversation: rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 conversations par fenêtre
    message: {
      success: false,
      message: 'Trop de tentatives de création de conversation. Réessayez dans 15 minutes.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    store: createMongoStore('conversation_create_limits'),
    keyGenerator: (req) => {
      return req.user?.id || req.ip;
    }
  }),

  // Limitation pour la mise à jour de conversations
  updateConversation: rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: 20, // 20 mises à jour par fenêtre
    message: {
      success: false,
      message: 'Trop de tentatives de modification. Réessayez dans quelques minutes.'
    },
    store: createMongoStore('conversation_update_limits'),
    keyGenerator: (req) => req.user?.id || req.ip
  }),

  // Limitation pour la lecture de conversations
  readConversation: rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 60, // 60 lectures par minute
    message: {
      success: false,
      message: 'Trop de requêtes de lecture. Ralentissez un peu.'
    },
    store: createMongoStore('conversation_read_limits'),
    keyGenerator: (req) => req.user?.id || req.ip,
    skip: (req) => {
      // Ignorer la limitation pour les WebSockets et les longpolling
      return req.headers['upgrade'] === 'websocket';
    }
  }),

  // Limitation pour la suppression de conversations
  deleteConversation: rateLimit({
    windowMs: 60 * 60 * 1000, // 1 heure
    max: 3, // 3 suppressions par heure
    message: {
      success: false,
      message: 'Trop de suppressions. Réessayez dans une heure.'
    },
    store: createMongoStore('conversation_delete_limits'),
    keyGenerator: (req) => req.user?.id || req.ip
  }),

  // Limitation pour l'envoi de messages
  sendMessage: rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 30, // 30 messages par minute
    message: {
      success: false,
      message: 'Trop de messages envoyés. Attendez un peu avant d\'envoyer d\'autres messages.'
    },
    store: createMongoStore('message_send_limits'),
    keyGenerator: (req) => req.user?.id || req.ip,
    // Limitation progressive
    onLimitReached: async (req, res, options) => {
      // Log pour surveillance
      console.warn(`Rate limit atteint pour l'utilisateur ${req.user?.id} (IP: ${req.ip})`);
      
      // Optionnel: notifier l'admin si abus répétés
      const userId = req.user?.id;
      if (userId) {
        // Logique de notification d'abus
      }
    }
  }),

  // Limitation pour l'upload de fichiers dans les messages
  uploadFile: rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // 10 uploads par fenêtre
    message: {
      success: false,
      message: 'Trop d\'uploads de fichiers. Réessayez dans 15 minutes.'
    },
    store: createMongoStore('file_upload_limits'),
    keyGenerator: (req) => req.user?.id || req.ip
  }),

  // Limitation pour la recherche
  search: rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 20, // 20 recherches par minute
    message: {
      success: false,
      message: 'Trop de requêtes de recherche. Réessayez dans une minute.'
    },
    store: createMongoStore('search_limits'),
    keyGenerator: (req) => req.user?.id || req.ip
  }),

  // Limitation globale pour les API
  global: rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 100, // 100 requêtes par minute par utilisateur
    message: {
      success: false,
      message: 'Trop de requêtes. Ralentissez votre utilisation.'
    },
    store: createMongoStore('global_limits'),
    keyGenerator: (req) => req.user?.id || req.ip,
    skip: (req) => {
      // Ignorer pour les requêtes de santé et de statut
      return req.path.includes('/health') || req.path.includes('/status');
    }
  }),

  // Limitation spécifique pour les invités (plus restrictive)
  guest: rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 20, // 20 requêtes par fenêtre pour les non-authentifiés
    message: {
      success: false,
      message: 'Trop de requêtes. Connectez-vous pour une limite plus élevée.'
    },
    store: createMongoStore('guest_limits'),
    keyGenerator: (req) => req.ip,
    skip: (req) => {
      // Appliquer seulement aux utilisateurs non authentifiés
      return !!req.user;
    }
  }),

  // Limitation pour l'export de conversations
  export: rateLimit({
    windowMs: 60 * 60 * 1000, // 1 heure
    max: 5, // 5 exports par heure
    message: {
      success: false,
      message: 'Trop d\'exports demandés. Réessayez dans une heure.'
    },
    store: createMongoStore('export_limits'),
    keyGenerator: (req) => req.user?.id || req.ip
  }),

  // Middleware personnalisé pour la limitation progressive
  progressiveLimit: (baseMax, windowMs = 15 * 60 * 1000) => {
    return rateLimit({
      windowMs,
      max: (req) => {
        // Augmenter la limite pour les utilisateurs vérifiés
        if (req.user?.estVerifie) {
          return baseMax * 2;
        }
        // Augmenter légèrement pour les utilisateurs premium
        if (req.user?.typePremium) {
          return Math.floor(baseMax * 1.5);
        }
        return baseMax;
      },
      message: {
        success: false,
        message: 'Limite de requêtes atteinte. Améliorez votre compte pour des limites plus élevées.'
      },
      store: createMongoStore('progressive_limits'),
      keyGenerator: (req) => req.user?.id || req.ip
    });
  }
};

// Middleware pour compter les tentatives d'abus
const abuseTracker = {
  track: async (userId, action, req) => {
    try {
      const AbuseLog = require('../models/AbuseLog');
      
      await AbuseLog.create({
        userId,
        action,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        timestamp: new Date()
      });

      // Vérifier s'il y a trop de tentatives d'abus
      const recentAbuses = await AbuseLog.countDocuments({
        userId,
        timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // 24h
      });

      if (recentAbuses > 50) {
        // Notifier les administrateurs
        console.warn(`Activité suspecte détectée pour l'utilisateur ${userId}: ${recentAbuses} actions en 24h`);
        
        // Optionnel: bloquer temporairement l'utilisateur
        const Utilisateur = require('../models/Utilisateur');
        await Utilisateur.findByIdAndUpdate(userId, {
          $set: { 
            estSuspendu: true,
            raisonSuspension: 'Activité suspecte détectée automatiquement',
            dateSuspension: new Date()
          }
        });
      }
    } catch (error) {
      console.error('Erreur tracking abus:', error);
    }
  }
};

// Middleware pour gérer les erreurs de rate limiting
const rateLimitErrorHandler = (error, req, res, next) => {
  if (error && error.status === 429) {
    // Logger la tentative de dépassement de limite
    console.warn(`Rate limit dépassé:`, {
      userId: req.user?.id,
      ip: req.ip,
      path: req.path,
      method: req.method,
      userAgent: req.get('User-Agent')
    });

    return res.status(429).json({
      success: false,
      message: 'Trop de requêtes. Veuillez réessayer plus tard.',
      retryAfter: error.retryAfter,
      type: 'RATE_LIMIT_EXCEEDED'
    });
  }
  next(error);
};

// Configuration dynamique des limites selon l'environnement
const getDynamicLimits = () => {
  const env = process.env.NODE_ENV || 'development';
  
  const limits = {
    development: {
      messages: 100,
      conversations: 20,
      uploads: 50
    },
    production: {
      messages: 30,
      conversations: 5,
      uploads: 10
    },
    test: {
      messages: 1000,
      conversations: 100,
      uploads: 100
    }
  };

  return limits[env] || limits.production;
};

// Middleware de nettoyage des anciens enregistrements de rate limiting
const cleanupOldLimits = async () => {
  try {
    const collections = [
      'conversation_create_limits',
      'conversation_update_limits',
      'conversation_read_limits',
      'message_send_limits',
      'global_limits'
    ];

    const cutoffDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24h

    for (const collection of collections) {
      await mongoose.connection.db
        .collection(collection)
        .deleteMany({ createdAt: { $lt: cutoffDate } });
    }

    console.log('Nettoyage des anciens rate limits terminé');
  } catch (error) {
    console.error('Erreur nettoyage rate limits:', error);
  }
};

// Planifier le nettoyage quotidien
if (process.env.NODE_ENV === 'production') {
  const cron = require('node-cron');
  
  // Chaque jour à 2h du matin
  cron.schedule('0 2 * * *', cleanupOldLimits);
}

module.exports = {
  ...rateLimitMiddleware,
  abuseTracker,
  rateLimitErrorHandler,
  getDynamicLimits,
  cleanupOldLimits
};