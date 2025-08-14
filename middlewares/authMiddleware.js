// middlewares/authMiddleware.js
const jwt = require('jsonwebtoken');
const User = require('../models/Utilisateur');
const AppError = require('../utils/AppError');
const { securityLogger } = require('../utils/logger');

/**
 * Middleware d'authentification principal
 * Vérifie la présence et la validité du token JWT
 */
const authMiddleware = async (req, res, next) => {
  try {
    // 1. Récupération du token depuis les headers
    let token = null;
    
    // Vérifier le header Authorization (Bearer token)
    const authHeader = req.header('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7); // Enlever "Bearer "
    }
    
    // Fallback: vérifier le header x-auth-token
    if (!token) {
      token = req.header('x-auth-token');
    }
    
    // Fallback: vérifier dans les cookies (si configuré)
    if (!token && req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    // 2. Vérifier la présence du token
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Accès refusé. Token d\'authentification manquant.',
        code: 'NO_TOKEN'
      });
    }

    // 3. Vérifier la validité du token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (jwtError) {
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Token expiré. Veuillez vous reconnecter.',
          code: 'TOKEN_EXPIRED'
        });
      } else if (jwtError.name === 'JsonWebTokenError') {
        return res.status(401).json({
          success: false,
          message: 'Token invalide.',
          code: 'INVALID_TOKEN'
        });
      } else {
        throw jwtError;
      }
    }

    // 4. Vérifier l'utilisateur dans la base de données
    const user = await User.findById(decoded.userId).select('-password -refreshToken');
    if (!user) {
      return next(AppError.userNotFound({ tokenUserId: decoded.userId }));
    }

    // 5. Vérifier le statut du compte
    if (user.statut !== 'actif') {
      securityLogger.warn('Accès refusé - Compte désactivé', {
        event: 'account_disabled',
        userId: user._id,
        statut: user.statut,
        ip: req.ip,
        endpoint: `${req.method} ${req.originalUrl}`
      });
      return next(AppError.accountDisabled({ userId: user._id, statut: user.statut }));
    }

    // 6. Ajouter les informations utilisateur à la requête
    req.user = {
      id: user._id, // alias pour compatibilité avec le code existant
      userId: user._id,
      email: user.email,
      role: user.role,
      nom: user.nom,
      prenom: user.prenom
    };

    // 7. Ajouter l'objet utilisateur complet (optionnel)
    req.userProfile = user;

    next();

  } catch (error) {
    return next(AppError.serverError("Erreur serveur lors de l'authentification", { originalError: error.message }));
  }
};

/**
 * Middleware pour vérifier les rôles administrateur
 */
const adminMiddleware = async (req, res, next) => {
  try {
    // D'abord, vérifier l'authentification
    await authMiddleware(req, res, () => {
      // Vérifier le rôle admin
      if (req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Accès refusé. Droits administrateur requis.',
          code: 'ADMIN_REQUIRED'
        });
      }
      next();
    });
  } catch (error) {
    console.error('Erreur dans adminMiddleware:', error);
    return next(AppError.serverError('Erreur serveur lors de la vérification des droits admin', { originalError: error.message }));
  }
};

/**
 * Middleware pour vérifier plusieurs rôles autorisés
 */
const roleMiddleware = (rolesAutorises) => {
  return async (req, res, next) => {
    try {
      // D'abord, vérifier l'authentification
      await authMiddleware(req, res, () => {
        // Vérifier si le rôle utilisateur est dans la liste autorisée
        if (!rolesAutorises.includes(req.user.role)) {
          return res.status(403).json({
            success: false,
            message: `Accès refusé. Rôles autorisés: ${rolesAutorises.join(', ')}`,
            code: 'ROLE_NOT_AUTHORIZED'
          });
        }
        next();
      });
    } catch (error) {
      console.error('Erreur dans roleMiddleware:', error);
      return next(AppError.serverError('Erreur serveur lors de la vérification des rôles', { originalError: error.message }));
    }
  };
};

/**
 * Middleware optionnel - n'échoue pas si pas de token
 * Utile pour les routes qui peuvent être publiques ou privées
 */
const optionalAuthMiddleware = async (req, res, next) => {
  try {
    // Récupération du token
    let token = null;
    const authHeader = req.header('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
    
    if (!token) {
      token = req.header('x-auth-token');
    }

    // Si pas de token, continuer sans authentification
    if (!token) {
      req.user = null;
      req.userProfile = null;
      return next();
    }

    // Si token présent, essayer de l'authentifier
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.userId).select('-password -refreshToken');
      
      if (user && user.statut === 'actif') {
        req.user = {
          userId: user._id,
          email: user.email,
          role: user.role,
          nom: user.nom,
          prenom: user.prenom
        };
        req.userProfile = user;
      } else {
        req.user = null;
        req.userProfile = null;
      }
    } catch (jwtError) {
      // Si erreur JWT, continuer sans authentification
      req.user = null;
      req.userProfile = null;
    }

    next();

  } catch (error) {
    console.error('Erreur dans optionalAuthMiddleware:', error);
    // En cas d'erreur, continuer sans authentification
    req.user = null;
    req.userProfile = null;
    return next(AppError.serverError('Erreur serveur lors de l\'authentification optionnelle', { originalError: error.message }));
  }
};

/**
 * Middleware pour vérifier que l'utilisateur accède à ses propres données
 * Utilise req.params.userId ou req.params.id
 */
const ownershipMiddleware = async (req, res, next) => {
  try {
    const targetUserId = req.params.userId || req.params.id;
    
    // Vérifier que l'utilisateur accède à ses propres données ou est admin
    if (req.user.userId.toString() !== targetUserId && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Accès refusé. Vous ne pouvez accéder qu\'à vos propres données.',
        code: 'OWNERSHIP_REQUIRED'
      });
    }
    
    next();
  } catch (error) {
    console.error('Erreur dans ownershipMiddleware:', error);
    return next(AppError.serverError('Erreur serveur lors de la vérification des droits', { originalError: error.message }));
  }
};

/**
 * Middleware de logging des accès authentifiés
 */
const logAuthMiddleware = (req, res, next) => {
  if (req.user) {
    console.log(`🔐 Accès authentifié: ${req.method} ${req.originalUrl} - User: ${req.user.userId} (${req.user.role})`);
  } else {
    console.log(`🔓 Accès public: ${req.method} ${req.originalUrl}`);
  }
  next();
};

module.exports = {
  authMiddleware,
  adminMiddleware,
  roleMiddleware,
  optionalAuthMiddleware,
  ownershipMiddleware,
  logAuthMiddleware,
  
  // Alias pour compatibilité
  protect: authMiddleware,
  requireAuth: authMiddleware,
  isAdmin: adminMiddleware,
  checkRole: roleMiddleware
};