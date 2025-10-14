const winston = require('winston');
const path = require('path');
const fs = require('fs');
const DailyRotateFile = require('winston-daily-rotate-file');

// Création du dossier de logs s'il n'existe pas
const createLogDir = () => {
  const logDir = path.join(__dirname, '../logs');
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  return logDir;
};

const logDir = createLogDir();

// Configuration des couleurs pour les niveaux de log
const logColors = {
  error: 'red',
  warn: 'yellow', 
  info: 'green',
  http: 'magenta',
  debug: 'blue'
};

winston.addColors(logColors);

// Format personnalisé pour les logs
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.prettyPrint()
);

// Format pour la console avec couleurs
const consoleFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.colorize({ all: true }),
  winston.format.printf(({ timestamp, level, message, service, userId, ip, endpoint, ...meta }) => {
    let logMessage = `${timestamp} [${level}]`;
    
    if (service) {
      logMessage += ` [${service}]`;
    }
    
    logMessage += `: ${message}`;
    
    // Ajout des métadonnées importantes
    if (userId) {
      logMessage += ` | UserID: ${userId}`;
    }
    
    if (endpoint) {
      logMessage += ` | ${endpoint}`;
    }
    
    if (ip) {
      logMessage += ` | IP: ${ip}`;
    }
    
    // Ajout des métadonnées supplémentaires si présentes
    if (Object.keys(meta).length > 0) {
      logMessage += ` | Meta: ${JSON.stringify(meta)}`;
    }
    
    return logMessage;
  })
);

// Configuration de la rotation des fichiers de logs
const fileRotateTransport = new DailyRotateFile({
  filename: path.join(logDir, 'covoiturage-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: '20m',
  maxFiles: '14d',
  format: logFormat,
  auditFile: path.join(logDir, 'audit.json')
});

// Configuration des transports d'erreurs avec rotation
const errorRotateTransport = new DailyRotateFile({
  filename: path.join(logDir, 'error-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  level: 'error',
  maxSize: '20m',
  maxFiles: '30d',
  format: logFormat,
  auditFile: path.join(logDir, 'error-audit.json')
});

// Configuration des logs d'authentification
const authRotateTransport = new DailyRotateFile({
  filename: path.join(logDir, 'auth-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: '10m',
  maxFiles: '30d',
  format: logFormat,
  auditFile: path.join(logDir, 'auth-audit.json')
});

// Configuration des logs de transactions
const transactionRotateTransport = new DailyRotateFile({
  filename: path.join(logDir, 'transaction-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: '10m',
  maxFiles: '90d',
  format: logFormat,
  auditFile: path.join(logDir, 'transaction-audit.json')
});

// Configuration des logs de sécurité
const securityRotateTransport = new DailyRotateFile({
  filename: path.join(logDir, 'security-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  level: 'warn',
  maxSize: '10m',
  maxFiles: '90d',
  format: logFormat,
  auditFile: path.join(logDir, 'security-audit.json')
});

// Logger principal
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: {
    service: 'covoiturage-api',
    environment: process.env.NODE_ENV || 'development',
    version: process.env.APP_VERSION || '1.0.0'
  },
  transports: [
    // Transport pour tous les logs
    fileRotateTransport,
    
    // Transport pour les erreurs uniquement
    errorRotateTransport,
    
    // Transport console pour le développement
    ...(process.env.NODE_ENV !== 'production' ? [
      new winston.transports.Console({
        format: consoleFormat,
        level: 'debug'
      })
    ] : [])
  ],
  // Gestion des exceptions non capturées
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(logDir, 'exceptions.log'),
      format: logFormat
    })
  ],
  // Gestion des rejections de promesses non capturées
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(logDir, 'rejections.log'),
      format: logFormat
    })
  ]
});

// Logger spécialisé pour l'authentification
const authLogger = winston.createLogger({
  level: 'info',
  format: logFormat,
  defaultMeta: {
    service: 'auth-service',
    environment: process.env.NODE_ENV || 'development'
  },
  transports: [
    authRotateTransport,
    ...(process.env.NODE_ENV !== 'production' ? [
      new winston.transports.Console({
        format: consoleFormat
      })
    ] : [])
  ]
});

// Logger spécialisé pour les transactions
const transactionLogger = winston.createLogger({
  level: 'info',
  format: logFormat,
  defaultMeta: {
    service: 'transaction-service',
    environment: process.env.NODE_ENV || 'development'
  },
  transports: [
    transactionRotateTransport,
    fileRotateTransport,
    ...(process.env.NODE_ENV !== 'production' ? [
      new winston.transports.Console({
        format: consoleFormat
      })
    ] : [])
  ]
});

// Logger spécialisé pour la sécurité
const securityLogger = winston.createLogger({
  level: 'warn',
  format: logFormat,
  defaultMeta: {
    service: 'security-service',
    environment: process.env.NODE_ENV || 'development'
  },
  transports: [
    securityRotateTransport,
    errorRotateTransport,
    ...(process.env.NODE_ENV !== 'production' ? [
      new winston.transports.Console({
        format: consoleFormat
      })
    ] : [])
  ]
});

// Middleware Express pour logger les requêtes HTTP
const httpLogger = (req, res, next) => {
  const start = Date.now();
  
  // Log de la requête entrante
  logger.http('Requête HTTP entrante', {
    method: req.method,
    url: req.originalUrl,
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get('User-Agent'),
    userId: req.utilisateur?.id,
    sessionId: req.sessionID
  });

  // Override de res.end pour logger la réponse
  const originalEnd = res.end;
  res.end = function(chunk, encoding) {
    const duration = Date.now() - start;
    const contentLength = res.get('Content-Length') || 0;
    
    // Déterminer le niveau de log selon le status code
    let logLevel = 'http';
    if (res.statusCode >= 400 && res.statusCode < 500) {
      logLevel = 'warn';
    } else if (res.statusCode >= 500) {
      logLevel = 'error';
    }
    
    logger.log(logLevel, 'Réponse HTTP', {
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      contentLength,
      responseTime: `${duration}ms`,
      ip: req.ip || req.connection.remoteAddress,
      userId: req.utilisateur?.id
    });
    
    originalEnd.call(res, chunk, encoding);
  };
  
  next();
};

// Fonctions utilitaires pour les logs spécialisés

/**
 * Log des événements d'authentification
 */
const logAuth = {
  login: (userId, email, ip, success = true) => {
    authLogger.info(`Tentative de connexion ${success ? 'réussie' : 'échouée'}`, {
      event: 'login_attempt',
      userId,
      email,
      ip,
      success,
      timestamp: new Date().toISOString()
    });
  },
  
  logout: (userId, email, ip) => {
    authLogger.info('Déconnexion utilisateur', {
      event: 'logout',
      userId,
      email,
      ip,
      timestamp: new Date().toISOString()
    });
  },
  
  registration: (userId, email, ip) => {
    authLogger.info('Nouvel utilisateur inscrit', {
      event: 'registration',
      userId,
      email,
      ip,
      timestamp: new Date().toISOString()
    });
  },
  
  passwordReset: (userId, email, ip) => {
    authLogger.info('Demande de réinitialisation de mot de passe', {
      event: 'password_reset_request',
      userId,
      email,
      ip,
      timestamp: new Date().toISOString()
    });
  },
  
  tokenRefresh: (userId, email, ip) => {
    authLogger.info('Token rafraîchi', {
      event: 'token_refresh',
      userId,
      email,
      ip,
      timestamp: new Date().toISOString()
    });
  }
};

/**
 * Log des événements de sécurité
 */
const logSecurity = {
  suspiciousActivity: (userId, activity, details, ip) => {
    securityLogger.warn('Activité suspecte détectée', {
      event: 'suspicious_activity',
      userId,
      activity,
      details,
      ip,
      timestamp: new Date().toISOString()
    });
  },
  
  rateLimitExceeded: (ip, endpoint, userId = null) => {
    securityLogger.warn('Limite de taux dépassée', {
      event: 'rate_limit_exceeded',
      ip,
      endpoint,
      userId,
      timestamp: new Date().toISOString()
    });
  },
  
  accountBlocked: (userId, reason, adminId) => {
    securityLogger.error('Compte bloqué', {
      event: 'account_blocked',
      userId,
      reason,
      adminId,
      timestamp: new Date().toISOString()
    });
  },
  
  failedAuth: (email, ip, reason) => {
    securityLogger.warn('Échec d\'authentification', {
      event: 'auth_failed',
      email,
      ip,
      reason,
      timestamp: new Date().toISOString()
    });
  },
  
  dataAccess: (userId, resource, action, ip) => {
    securityLogger.info('Accès aux données sensibles', {
      event: 'sensitive_data_access',
      userId,
      resource,
      action,
      ip,
      timestamp: new Date().toISOString()
    });
  }
};

/**
 * Log des transactions financières
 */
const logTransaction = {
  paymentInitiated: (transactionId, userId, amount, method) => {
    transactionLogger.info('Paiement initié', {
      event: 'payment_initiated',
      transactionId,
      userId,
      amount,
      method,
      timestamp: new Date().toISOString()
    });
  },
  
  paymentCompleted: (transactionId, userId, amount, method) => {
    transactionLogger.info('Paiement complété', {
      event: 'payment_completed',
      transactionId,
      userId,
      amount,
      method,
      timestamp: new Date().toISOString()
    });
  },
  
  paymentFailed: (transactionId, userId, amount, method, reason) => {
    transactionLogger.error('Échec de paiement', {
      event: 'payment_failed',
      transactionId,
      userId,
      amount,
      method,
      reason,
      timestamp: new Date().toISOString()
    });
  },
  
  refund: (transactionId, userId, amount, reason) => {
    transactionLogger.info('Remboursement effectué', {
      event: 'refund_processed',
      transactionId,
      userId,
      amount,
      reason,
      timestamp: new Date().toISOString()
    });
  }
};

/**
 * Log des événements métier spécifiques au covoiturage
 */
const logBusiness = {
  tripCreated: (tripId, conductorId, origin, destination) => {
    logger.info('Nouveau trajet créé', {
      event: 'trip_created',
      tripId,
      conductorId,
      origin,
      destination,
      timestamp: new Date().toISOString()
    });
  },
  
  reservationMade: (reservationId, tripId, passengerId) => {
    logger.info('Nouvelle réservation', {
      event: 'reservation_made',
      reservationId,
      tripId,
      passengerId,
      timestamp: new Date().toISOString()
    });
  },
  
  tripCompleted: (tripId, conductorId, passengerIds) => {
    logger.info('Trajet terminé', {
      event: 'trip_completed',
      tripId,
      conductorId,
      passengerCount: passengerIds.length,
      timestamp: new Date().toISOString()
    });
  },
  
  emergencyAlert: (alertId, userId, location, type) => {
    logger.error('Alerte d\'urgence déclenchée', {
      event: 'emergency_alert',
      alertId,
      userId,
      location,
      type,
      priority: 'CRITICAL',
      timestamp: new Date().toISOString()
    });
  },
  
  userReported: (reportId, reporterId, reportedId, reason) => {
    logger.warn('Signalement d\'utilisateur', {
      event: 'user_reported',
      reportId,
      reporterId,
      reportedId,
      reason,
      timestamp: new Date().toISOString()
    });
  }
};

// Gestion des événements de rotation des fichiers
fileRotateTransport.on('rotate', (oldFilename, newFilename) => {
  logger.info('Rotation des fichiers de logs', {
    event: 'log_rotation',
    oldFile: oldFilename,
    newFile: newFilename
  });
});

// Gestion des erreurs de transport
logger.on('error', (error) => {
  console.error('Erreur du système de logging:', error);
});

// Export du logger principal et des utilitaires
module.exports = {
  // Logger principal
  logger,
  
  // Loggers spécialisés
  authLogger,
  transactionLogger,
  securityLogger,
  
  // Middleware
  httpLogger,
  
  // Utilitaires de logging
  logAuth,
  logSecurity,
  logTransaction,
  logBusiness,
  
  // Méthodes de commodité
  info: (message, meta = {}) => logger.info(message, meta),
  error: (message, meta = {}) => logger.error(message, meta),
  warn: (message, meta = {}) => logger.warn(message, meta),
  debug: (message, meta = {}) => logger.debug(message, meta),
  http: (message, meta = {}) => logger.http(message, meta)
};