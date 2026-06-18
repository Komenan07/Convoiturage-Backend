// middlewares/authMiddleware.js - Version corrigée
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

    // 5. Vérifier le statut du compte - CORRECTION ICI
    // Utiliser la méthode peutSeConnecter() pour une vérification cohérente
    const statutAutorise = user.peutSeConnecter();
    if (!statutAutorise.autorise) {
      securityLogger.warn('Accès refusé - Compte désactivé', {
        event: 'account_disabled',
        userId: user._id,
        statut: user.statutCompte,
        raison: statutAutorise.raison,
        ip: req.ip,
        endpoint: `${req.method} ${req.originalUrl}`
      });
      
      const context = {
        userId: user._id,
        statut: user.statutCompte,
        raison: statutAutorise.raison,
        deblocageA: statutAutorise.deblocageA
      };

      // Retourner des erreurs spécifiques selon le statut
      if (user.statutCompte === 'BLOQUE') {
        return next(AppError.accountPermanentlyBlocked(context));
      } else if (user.statutCompte === 'SUSPENDU') {
        return next(AppError.accountSuspended(context));
      } else if (user.statutCompte === 'EN_ATTENTE_VERIFICATION') {
        return next(AppError.accountPendingVerification(context));
      } else if (statutAutorise.raison === 'Compte temporairement bloqué') {
        return next(AppError.accountTemporarilyBlocked(context));
      }
      return next(AppError.accountDisabled(context));
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
const _tryDecodeUser = async (req) => {
  let token = null;

  const authHeader = req.header('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  }

  if (!token) token = req.header('x-auth-token');
  if (!token && req.cookies?.token) token = req.cookies.token;

  if (!token) return null;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.userId).select('-password -refreshToken');
    if (!user) return null;

    const statut = user.peutSeConnecter();
    if (!statut.autorise) return null;

    return {
      userObj: {
        id: user._id,
        userId: user._id,
        email: user.email,
        role: user.role,
        nom: user.nom,
        prenom: user.prenom
      },
      userProfile: user
    };
  } catch {
    return null;
  }
};

/**
 * Middleware optionnel - n'échoue pas si pas de token
 * Utile pour les routes qui peuvent être publiques ou privées
 */
const optionalAuthMiddleware = async (req, res, next) => {
  try {
    const result = await _tryDecodeUser(req);
    req.user = result?.userObj || null;
    req.userProfile = result?.userProfile || null;
    req.isAuthenticated = !!result;
    next();
  } catch (error) {
    console.error('Erreur dans optionalAuthMiddleware:', error);
    req.user = null;
    req.userProfile = null;
    req.isAuthenticated = false;
    next();
  }
};

/**
 * ⭐  Middleware pour vérifier le refresh token
 * À utiliser sur les routes de rafraîchissement de token
 */
const refreshTokenMiddleware = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        message: 'Refresh token manquant',
        code: 'NO_REFRESH_TOKEN'
      });
    }

    // Vérifier la validité du refresh token
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET);
    } catch (jwtError) {
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Refresh token expiré. Veuillez vous reconnecter.',
          code: 'REFRESH_TOKEN_EXPIRED'
        });
      }
      return res.status(401).json({
        success: false,
        message: 'Refresh token invalide',
        code: 'INVALID_REFRESH_TOKEN'
      });
    }

    // Vérifier que l'utilisateur existe et que le refresh token correspond
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur introuvable',
        code: 'USER_NOT_FOUND'
      });
    }

    // Vérifier que le refresh token dans la DB correspond
    if (user.refreshToken !== refreshToken) {
      securityLogger.warn('Tentative d\'utilisation d\'un ancien refresh token', {
        userId: user._id,
        ip: req.ip
      });
      return res.status(401).json({
        success: false,
        message: 'Refresh token révoqué ou invalide',
        code: 'REFRESH_TOKEN_REVOKED'
      });
    }

    // Ajouter les informations utilisateur à la requête
    req.user = {
      id: user._id,
      userId: user._id,
      email: user.email,
      role: user.role
    };
    req.userProfile = user;
    req.refreshToken = refreshToken;

    next();

  } catch (error) {
    console.error('Erreur dans refreshTokenMiddleware:', error);
    return next(AppError.serverError('Erreur lors de la vérification du refresh token', { originalError: error.message }));
  }
};

/**
 * ⭐ Middleware pour vérifier le rôle conducteur/passager
 * @param {Array<string>} rolesRequis - ['conducteur', 'passager', 'les_deux']
 */
const roleCovoiturageMiddleware = (rolesRequis = []) => {
  return async (req, res, next) => {
    try {
      if (!req.userProfile) {
        return res.status(401).json({
          success: false,
          message: 'Authentification requise',
          code: 'AUTH_REQUIRED'
        });
      }

      const userRole = req.userProfile.role;

      // Si l'utilisateur a le rôle "les_deux", il peut tout faire
      if (userRole === 'les_deux') {
        return next();
      }

      // Vérifier si le rôle de l'utilisateur est dans les rôles requis
      if (!rolesRequis.includes(userRole) && !rolesRequis.includes('les_deux')) {
        return res.status(403).json({
          success: false,
          message: `Cette action nécessite le rôle: ${rolesRequis.join(' ou ')}`,
          code: 'ROLE_COVOITURAGE_REQUIRED',
          requiredRoles: rolesRequis,
          userRole: userRole
        });
      }

      next();
    } catch (error) {
      console.error('Erreur dans roleCovoiturageMiddleware:', error);
      return next(AppError.serverError('Erreur lors de la vérification du rôle covoiturage', { originalError: error.message }));
    }
  };
};

/**
 * ⭐ Middleware pour vérifier le solde du compte covoiturage
 * À utiliser sur les routes qui nécessitent un solde minimum
 */
const checkSoldeMiddleware = (montantMinimum = 0) => {
  return async (req, res, next) => {
    try {
      if (!req.userProfile) {
        return res.status(401).json({
          success: false,
          message: 'Authentification requise',
          code: 'AUTH_REQUIRED'
        });
      }

      const user = req.userProfile;

      // Vérifier si l'utilisateur a un compte covoiturage
      if (!user.compteCovoiturage) {
        return res.status(400).json({
          success: false,
          message: 'Compte covoiturage non initialisé',
          code: 'NO_COVOITURAGE_ACCOUNT'
        });
      }

      const soldeActuel = user.compteCovoiturage.solde || 0;

      // Vérifier si le solde est suffisant
      if (soldeActuel < montantMinimum) {
        return res.status(402).json({
          success: false,
          message: `Solde insuffisant. Minimum requis: ${montantMinimum} FCFA`,
          code: 'INSUFFICIENT_BALANCE',
          soldeActuel: soldeActuel,
          montantMinimum: montantMinimum,
          manquant: montantMinimum - soldeActuel
        });
      }

      // Ajouter le solde dans req pour utilisation ultérieure
      req.soldeActuel = soldeActuel;

      next();
    } catch (error) {
      console.error('Erreur dans checkSoldeMiddleware:', error);
      return next(AppError.serverError('Erreur lors de la vérification du solde', { originalError: error.message }));
    }
  };
};

/**
 * ⭐  Middleware pour vérifier la vérification du compte
 * Nécessite que le compte soit vérifié (email ou SMS)
 */
const requireVerifiedAccount = async (req, res, next) => {
  try {
    if (!req.userProfile) {
      return res.status(401).json({
        success: false,
        message: 'Authentification requise',
        code: 'AUTH_REQUIRED'
      });
    }

    const user = req.userProfile;

    // Vérifier si le compte est vérifié
    if (!user.emailVerifie && !user.telephoneVerifie) {
      return res.status(403).json({
        success: false,
        message: 'Veuillez vérifier votre compte (email ou téléphone) pour accéder à cette fonctionnalité',
        code: 'ACCOUNT_NOT_VERIFIED',
        emailVerifie: user.emailVerifie,
        telephoneVerifie: user.telephoneVerifie
      });
    }

    next();
  } catch (error) {
    console.error('Erreur dans requireVerifiedAccount:', error);
    return next(AppError.serverError('Erreur lors de la vérification du compte', { originalError: error.message }));
  }
};

/**
 * ⭐  Middleware pour vérifier l'auto-recharge
 * Vérifie que l'utilisateur a configuré l'auto-recharge
 */
const checkAutoRechargeEnabled = async (req, res, next) => {
  try {
    if (!req.userProfile) {
      return res.status(401).json({
        success: false,
        message: 'Authentification requise',
        code: 'AUTH_REQUIRED'
      });
    }

    const user = req.userProfile;

    if (!user.compteCovoiturage || !user.compteCovoiturage.autoRechargeActive) {
      return res.status(400).json({
        success: false,
        message: 'La recharge automatique n\'est pas activée',
        code: 'AUTO_RECHARGE_NOT_ENABLED'
      });
    }

    next();
  } catch (error) {
    console.error('Erreur dans checkAutoRechargeEnabled:', error);
    return next(AppError.serverError('Erreur lors de la vérification de l\'auto-recharge', { originalError: error.message }));
  }
};

/**
 * ⭐  Middleware pour vérifier les permissions de modification de profil
 * L'utilisateur ne peut modifier que son propre profil (sauf admin)
 */
const canModifyProfile = async (req, res, next) => {
  try {
    const targetUserId = req.params.userId || req.params.id || req.body.userId;
    
    // Admin peut tout modifier
    if (req.user.role === 'admin') {
      return next();
    }

    // Vérifier que l'utilisateur modifie son propre profil
    if (!targetUserId || req.user.userId.toString() !== targetUserId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Vous ne pouvez modifier que votre propre profil',
        code: 'CANNOT_MODIFY_OTHER_PROFILE'
      });
    }

    next();
  } catch (error) {
    console.error('Erreur dans canModifyProfile:', error);
    return next(AppError.serverError('Erreur lors de la vérification des permissions', { originalError: error.message }));
  }
};

/**
 * ⭐  Middleware pour logger les actions sensibles
 */
const logSensitiveAction = (actionType) => {
  return (req, res, next) => {
    securityLogger.info('Action sensible', {
      actionType: actionType,
      userId: req.user ? req.user.userId : 'anonymous',
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      endpoint: `${req.method} ${req.originalUrl}`,
      timestamp: new Date().toISOString()
    });
    next();
  };
};


// Reste des middlewares inchangé
const adminMiddleware = async (req, res, next) => {
  try {
    // Vérifier que l'authentification a déjà été faite
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentification requise',
        code: 'AUTH_REQUIRED'
      });
    }

    // Vérifier le rôle admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Accès refusé. Droits administrateur requis.',
        code: 'ADMIN_REQUIRED'
      });
    }
    
    next();
  } catch (error) {
    return next(AppError.serverError('Erreur lors de la vérification des droits admin', { originalError: error.message }));
  }
};

const roleMiddleware = (rolesAutorises) => {
  return (req, res, next) => {
    try {
      // Vérifier que authMiddleware a déjà été exécuté en amont
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentification requise',
          code: 'AUTH_REQUIRED'
        });
      }

      // Vérifier si le rôle utilisateur est dans la liste autorisée
      if (!rolesAutorises.includes(req.user.role)) {
        return res.status(403).json({
          success: false,
          message: `Accès refusé. Rôles autorisés: ${rolesAutorises.join(', ')}`,
          code: 'ROLE_NOT_AUTHORIZED'
        });
      }

      next();
    } catch (error) {
      console.error('Erreur dans roleMiddleware:', error);
      return next(AppError.serverError('Erreur serveur lors de la vérification des rôles', { originalError: error.message }));
    }
  };
};

const ownershipMiddleware = async (req, res, next) => {
  try {
    // Vérifier que authMiddleware a déjà été exécuté
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentification requise',
        code: 'AUTH_REQUIRED'
      });
    }

    const targetUserId = req.params.userId || req.params.id;

    // Vérifier que l'ID cible est présent
    if (!targetUserId) {
      return res.status(400).json({
        success: false,
        message: 'ID cible manquant',
        code: 'MISSING_TARGET_ID'
      });
    }

    // Admin peut accéder à tout
    if (req.user.role === 'admin') {
      return next();
    }

    // Vérifier que l'utilisateur accède à ses propres données
    if (req.user.userId.toString() !== targetUserId.toString()) {
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

const logAuthMiddleware = (req, res, next) => {
  if (req.user) {
    console.log(`🔐 Accès authentifié: ${req.method} ${req.originalUrl} - User: ${req.user.userId} (${req.user.role})`);
  } else {
    console.log(`🔓 Accès public: ${req.method} ${req.originalUrl}`);
  }
  next();
};

/**
 * ⭐ Middleware pour les routes publiques
 * Utile pour les endpoints qui peuvent être accessibles avec ou sans auth
 * (comme les recherches de lieux basiques)
 */
const publicOrAuthMiddleware = async (req, res, next) => {
  try {
    const result = await _tryDecodeUser(req);
    req.user = result?.userObj || null;
    req.userProfile = result?.userProfile || null;
    req.isAuthenticated = !!result;
    next();
  } catch (error) {
    console.error('Erreur dans publicOrAuthMiddleware:', error);
    req.user = null;
    req.userProfile = null;
    req.isAuthenticated = false;
    next();
  }
};
// Ajouter cette fonction après publicOrAuthMiddleware

/**
 * ⭐ Middleware spécifique pour les endpoints de lieux
 * L'authentification est optionnelle mais si présente, elle est validée
 * Idéal pour les recherches de lieux où on veut des données enrichies
 */
const placesAuthMiddleware = async (req, res, next) => {
  try {
    const result = await _tryDecodeUser(req);
    req.user = result?.userObj || null;
    req.userProfile = result?.userProfile || null;
    req.isAuthenticated = !!result;
    next();
  } catch (error) {
    console.error('Erreur dans placesAuthMiddleware:', error);
    req.user = null;
    req.userProfile = null;
    req.isAuthenticated = false;
    next();
  }
};
// Ajouter cette fonction

/**
 * ⭐ Middleware pour les endpoints sensibles
 * Authentification requise ET compte vérifié
 */
const sensitiveAuthMiddleware = async (req, res, next) => {
  try {
    if (!req.userProfile) {
      return res.status(401).json({
        success: false,
        message: 'Authentification requise pour accéder à cette ressource',
        code: 'AUTH_REQUIRED'
      });
    }

    if (!req.userProfile.emailVerifie && !req.userProfile.telephoneVerifie) {
      return res.status(403).json({
        success: false,
        message: 'Veuillez vérifier votre compte (email ou téléphone)',
        code: 'ACCOUNT_NOT_VERIFIED'
      });
    }

    next();
  } catch (error) {
    console.error('Erreur dans sensitiveAuthMiddleware:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de l\'authentification',
      code: 'SERVER_ERROR'
    });
  }
};

/**
 * ⭐ Middleware de développement
 * Désactive l'auth en développement
 */
const devAuthMiddleware = (req, res, next) => {
  if (process.env.NODE_ENV === 'development' && process.env.DISABLE_AUTH === 'true') {
    // Créer un utilisateur fictif pour le développement
    req.user = {
      id: 'dev_user_id',
      userId: 'dev_user_id',
      email: 'dev@example.com',
      role: 'admin',
      nom: 'Dev',
      prenom: 'User'
    };
    req.userProfile = {
      _id: 'dev_user_id',
      email: 'dev@example.com',
      role: 'admin',
      statutCompte: 'ACTIF',
      peutSeConnecter: () => ({ autorise: true })
    };
    req.isAuthenticated = true;
    return next();
  }
  
  // En production, utiliser le middleware normal
  return authMiddleware(req, res, next);
};
module.exports = {
  authMiddleware,
  adminMiddleware,
  roleMiddleware,
  optionalAuthMiddleware,
  ownershipMiddleware,
  logAuthMiddleware,

  publicOrAuthMiddleware,
  placesAuthMiddleware,
  sensitiveAuthMiddleware,
  devAuthMiddleware,

  refreshTokenMiddleware,
  roleCovoiturageMiddleware,
  checkSoldeMiddleware,
  requireVerifiedAccount,
  checkAutoRechargeEnabled,
  canModifyProfile,
  logSensitiveAction,
  
  // Alias pour compatibilité
  protect: authMiddleware,
  requireAuth: authMiddleware,
  isAdmin: adminMiddleware,
  checkRole: roleMiddleware,

  optionalAuth: optionalAuthMiddleware,
  publicOrAuth: publicOrAuthMiddleware,
  placesAuth: placesAuthMiddleware,
  sensitiveAuth: sensitiveAuthMiddleware,
  devAuth: devAuthMiddleware
};