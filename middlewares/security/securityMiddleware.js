// middleware/securityMiddleware.js
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const hpp = require('hpp');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const Utilisateur = require('../../models/Utilisateur');

// =========================
// CONFIGURATION HELMET
// =========================
const helmetConfig = helmet({
  // Politique de sécurité du contenu
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      scriptSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
      connectSrc: [
        "'self'",
        "https://api.wave.com",
        "https://api.orangemoney.ci",
        "https://api.mtn.ci",
        "https://api.moovmoney.ci"
      ]
    }
  },
  
  // Prévenir le clickjacking
  frameGuard: { action: 'deny' },
  
  // Forcer HTTPS en production
  hsts: process.env.NODE_ENV === 'production' ? {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  } : false,
  
  // Masquer les infos serveur
  hidePoweredBy: true,
  
  // Prévenir le sniffing MIME
  noSniff: true,
  
  // Protection XSS
  xssFilter: true,
  
  // Référer policy
  referrerPolicy: { policy: "same-origin" }
});

// =========================
// RATE LIMITING
// =========================

// Rate limiter général
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limite chaque IP à 100 requêtes par fenêtre
  message: {
    success: false,
    error: 'RATE_LIMIT_EXCEEDED',
    message: 'Trop de requêtes, réessayez plus tard',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Exclure les IPs d'administration
    const adminIPs = ['127.0.0.1', '::1'];
    return adminIPs.includes(req.ip);
  }
});

// Rate limiter pour l'authentification
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 tentatives de connexion max
  message: {
    success: false,
    error: 'AUTH_RATE_LIMIT',
    message: 'Trop de tentatives de connexion, réessayez dans 15 minutes',
    code: 'AUTH_001'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true
});

// Rate limiter pour les paiements
const paymentLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 heure
  max: 10, // 10 transactions max par heure
  message: {
    success: false,
    error: 'PAYMENT_RATE_LIMIT',
    message: 'Limite de transactions atteinte, réessayez plus tard',
    code: 'PAY_001'
  },
  keyGenerator: (req) => {
    // Limiter par utilisateur authentifié plutôt que par IP
    return req.user ? req.user._id.toString() : req.ip;
  }
});

// Rate limiter pour les recharges de compte
const rechargeLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 heures
  max: 5, // 5 recharges max par jour
  message: {
    success: false,
    error: 'RECHARGE_LIMIT',
    message: 'Limite de recharges quotidienne atteinte',
    code: 'RECHARGE_001'
  },
  keyGenerator: (req) => req.user ? req.user._id.toString() : req.ip
});

// Rate limiter pour les uploads
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 heure
  max: 20, // 20 uploads max par heure
  message: {
    success: false,
    error: 'UPLOAD_RATE_LIMIT',
    message: 'Limite d\'uploads atteinte',
    code: 'UPLOAD_001'
  }
});

// =========================
// AUTHENTIFICATION JWT
// =========================
const authenticateToken = async (req, res, next) => {
  try {
    let token;
    
    // Récupérer le token depuis le header Authorization
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
      token = req.headers.authorization.split(' ')[1];
    }
    
    // Récupérer depuis les cookies si pas dans le header
    if (!token && req.cookies && req.cookies.jwt) {
      token = req.cookies.jwt;
    }
    
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'TOKEN_MISSING',
        message: 'Token d\'accès requis',
        code: 'AUTH_002'
      });
    }
    
    // Vérifier le token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'votre-cle-secrete-super-longue-et-complexe');
    
    // Récupérer l'utilisateur
    const utilisateur = await Utilisateur.findById(decoded.userId).select('-motDePasse');
    
    if (!utilisateur) {
      return res.status(401).json({
        success: false,
        error: 'USER_NOT_FOUND',
        message: 'Utilisateur introuvable',
        code: 'AUTH_003'
      });
    }
    
    // Vérifier si l'utilisateur peut se connecter
    const connexionAutorisee = utilisateur.peutSeConnecter();
    if (!connexionAutorisee.autorise) {
      return res.status(403).json({
        success: false,
        error: 'ACCOUNT_RESTRICTED',
        message: connexionAutorisee.raison,
        code: 'AUTH_004',
        action: connexionAutorisee.action
      });
    }
    
    // Mettre à jour la dernière connexion
    utilisateur.derniereConnexion = new Date();
    await utilisateur.save({ validateBeforeSave: false });
    
    req.user = utilisateur;
    next();
    
  } catch (error) {
    console.error('Erreur authentification:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        error: 'INVALID_TOKEN',
        message: 'Token invalide',
        code: 'AUTH_005'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'TOKEN_EXPIRED',
        message: 'Token expiré',
        code: 'AUTH_006'
      });
    }
    
    return res.status(500).json({
      success: false,
      error: 'AUTH_SERVER_ERROR',
      message: 'Erreur serveur d\'authentification',
      code: 'AUTH_007'
    });
  }
};

// =========================
// AUTORISATION PAR RÔLE
// =========================
const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'Authentification requise',
        code: 'AUTH_008'
      });
    }
    
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'INSUFFICIENT_PERMISSIONS',
        message: 'Permissions insuffisantes',
        code: 'AUTH_009',
        requiredRoles: roles,
        userRole: req.user.role
      });
    }
    
    next();
  };
};

// =========================
// VÉRIFICATION COMPTE RECHARGÉ
// =========================
const requireRechargedAccount = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'UNAUTHORIZED',
      message: 'Authentification requise',
      code: 'AUTH_010'
    });
  }
  
  if (!req.user.compteCovoiturage.estRecharge) {
    return res.status(403).json({
      success: false,
      error: 'ACCOUNT_NOT_RECHARGED',
      message: 'Compte non rechargé - certaines fonctionnalités sont limitées',
      code: 'PAY_002',
      action: 'RECHARGE_ACCOUNT'
    });
  }
  
  next();
};

// =========================
// VALIDATION UTILISATEUR VÉRIFIÉ
// =========================
const requireVerifiedUser = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'UNAUTHORIZED',
      message: 'Authentification requise',
      code: 'AUTH_011'
    });
  }
  
  if (!req.user.estVerifie) {
    return res.status(403).json({
      success: false,
      error: 'USER_NOT_VERIFIED',
      message: 'Utilisateur non vérifié',
      code: 'AUTH_012',
      action: 'VERIFY_IDENTITY'
    });
  }
  
  next();
};

// =========================
// PROTECTION INJECTION & XSS
// =========================
const sanitizeMiddleware = [
  // Nettoyer les injections NoSQL
  mongoSanitize({
    replaceWith: '_'
  }),
  
  // Nettoyer les scripts XSS
  xss(),
  
  // Prévenir la pollution de paramètres HTTP
  hpp({
    whitelist: ['sort', 'fields', 'page', 'limit', 'roles']
  })
];

// =========================
// VALIDATION SIGNATURE WEBHOOK
// =========================
const validateWebhookSignature = (secret) => {
  return (req, res, next) => {
    const signature = req.headers['x-webhook-signature'];
    
    if (!signature) {
      return res.status(401).json({
        success: false,
        error: 'WEBHOOK_SIGNATURE_MISSING',
        message: 'Signature webhook manquante',
        code: 'WEBHOOK_001'
      });
    }
    
    // Calculer la signature attendue
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(JSON.stringify(req.body))
      .digest('hex');
    
    const receivedSignature = signature.replace('sha256=', '');
    
    // Comparaison sécurisée
    if (!crypto.timingSafeEqual(
      Buffer.from(expectedSignature, 'hex'),
      Buffer.from(receivedSignature, 'hex')
    )) {
      console.warn('🚨 Signature webhook invalide:', {
        expected: expectedSignature,
        received: receivedSignature,
        ip: req.ip,
        userAgent: req.headers['user-agent']
      });
      
      return res.status(401).json({
        success: false,
        error: 'WEBHOOK_SIGNATURE_INVALID',
        message: 'Signature webhook invalide',
        code: 'WEBHOOK_002'
      });
    }
    
    next();
  };
};

// =========================
// DÉTECTION TENTATIVES MALVEILLANTES
// =========================
const detectMaliciousActivity = (req, res, next) => {
  const suspiciousPatterns = [
    /(\bselect\b|\bunion\b|\binsert\b|\bdelete\b|\bupdate\b|\bdrop\b)/i,
    /<script[^>]*>.*?<\/script>/gi,
    /javascript:/i,
    /on\w+\s*=/i,
    /(\.\.\/|\.\.\\)/g,
    /\b(admin|root|administrator)\b/i
  ];
  
  const requestData = JSON.stringify({
    body: req.body,
    query: req.query,
    params: req.params,
    headers: req.headers
  });
  
  const isSuspicious = suspiciousPatterns.some(pattern => pattern.test(requestData));
  
  if (isSuspicious) {
    console.warn('🚨 Activité suspecte détectée:', {
      ip: req.ip,
      method: req.method,
      url: req.url,
      userAgent: req.headers['user-agent'],
      timestamp: new Date().toISOString()
    });
    
    return res.status(400).json({
      success: false,
      error: 'MALICIOUS_REQUEST',
      message: 'Requête potentiellement malveillante détectée',
      code: 'SEC_001'
    });
  }
  
  next();
};

// =========================
// MIDDLEWARE DE LOGGING SÉCURISÉ
// =========================
const securityLogger = (req, res, next) => {
  // Ne logger que les informations non sensibles
  const logData = {
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    timestamp: new Date().toISOString(),
    userId: req.user ? req.user._id : null
  };
  
  // Logger les tentatives sur endpoints sensibles
  const sensitiveEndpoints = ['/auth/', '/payment/', '/admin/'];
  if (sensitiveEndpoints.some(endpoint => req.url.includes(endpoint))) {
    console.log('🔐 Accès endpoint sensible:', logData);
  }
  
  next();
};

// =========================
// EXPORTS
// =========================
module.exports = {
  // Configuration helmet
  helmetConfig,
  
  // Rate limiters
  generalLimiter,
  authLimiter,
  paymentLimiter,
  rechargeLimiter,
  uploadLimiter,
  
  // Authentification & autorisation
  authenticateToken,
  authorizeRoles,
  requireRechargedAccount,
  requireVerifiedUser,
  
  // Sanitization
  sanitizeMiddleware,
  
  // Webhooks
  validateWebhookSignature,
  
  // Sécurité avancée
  detectMaliciousActivity,
  securityLogger,
  
  // Fonction utilitaire pour combiner les middlewares de sécurité
  getSecurityMiddlewares: () => [
    helmetConfig,
    ...sanitizeMiddleware,
    detectMaliciousActivity,
    securityLogger
  ],
  
  // Middleware spécifique pour les routes de paiement
  getPaymentSecurityMiddlewares: () => [
    helmetConfig,
    paymentLimiter,
    authenticateToken,
    requireVerifiedUser,
    ...sanitizeMiddleware,
    detectMaliciousActivity
  ],
  
  // Middleware pour les routes admin
  getAdminSecurityMiddlewares: () => [
    helmetConfig,
    generalLimiter,
    authenticateToken,
    authorizeRoles('admin'),
    ...sanitizeMiddleware,
    detectMaliciousActivity,
    securityLogger
  ]
};