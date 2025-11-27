// =====================================================
// MIDDLEWARE D'AUTHENTIFICATION ADMINISTRATEUR
// =====================================================

const jwt = require('jsonwebtoken');
const Administrateur = require('../models/Administrateur');
const AppError = require('../utils/AppError');
const { securityLogger } = require('../utils/logger');

/**
 * Middleware d'authentification pour les administrateurs
 * Vérifie le token et charge l'administrateur depuis la DB
 */
const protectAdmin = async (req, res, next) => {
  try {
    // 1. Récupération du token
    let token = null;
    
    const authHeader = req.header('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
    
    if (!token) {
      token = req.header('x-auth-token');
    }
    
    if (!token && req.cookies && req.cookies.adminToken) {
      token = req.cookies.adminToken;
    }

    // 2. Vérifier la présence du token
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Accès refusé. Token d\'authentification administrateur manquant.',
        code: 'NO_ADMIN_TOKEN'
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
          message: 'Token administrateur expiré. Veuillez vous reconnecter.',
          code: 'ADMIN_TOKEN_EXPIRED'
        });
      }
      return res.status(401).json({
        success: false,
        message: 'Token administrateur invalide.',
        code: 'INVALID_ADMIN_TOKEN'
      });
    }

    // 4. Vérifier que c'est bien un token admin
    if (decoded.type !== 'admin') {
      securityLogger.warn('Tentative d\'accès admin avec un token utilisateur', {
        tokenType: decoded.type,
        tokenId: decoded.id,
        ip: req.ip,
        endpoint: `${req.method} ${req.originalUrl}`
      });
      
      return res.status(403).json({
        success: false,
        message: 'Ce token n\'est pas valide pour l\'espace administrateur.',
        code: 'NOT_ADMIN_TOKEN'
      });
    }

    // 5. Charger l'administrateur depuis la base de données
    const admin = await Administrateur.findById(decoded.id).select('+motDePasse');
    
    if (!admin) {
      return res.status(401).json({
        success: false,
        message: 'Administrateur introuvable.',
        code: 'ADMIN_NOT_FOUND'
      });
    }

    // 6. Vérifier le statut du compte
    if (admin.statutCompte !== 'ACTIF') {
      securityLogger.warn('Accès refusé - Compte administrateur suspendu', {
        event: 'admin_account_suspended',
        adminId: admin._id,
        statut: admin.statutCompte,
        ip: req.ip,
        endpoint: `${req.method} ${req.originalUrl}`
      });
      
      return res.status(403).json({
        success: false,
        message: 'Compte administrateur suspendu.',
        code: 'ADMIN_ACCOUNT_SUSPENDED'
      });
    }

    // 7. Ajouter les informations admin à la requête
    req.user = {
      id: admin._id,
      type: 'admin',
      email: admin.email,
      role: admin.role,
      permissions: admin.permissions,
      nom: admin.nom,
      prenom: admin.prenom
    };

    req.admin = admin;

    next();

  } catch (error) {
    console.error('Erreur dans protectAdmin:', error);
    return next(AppError.serverError("Erreur serveur lors de l'authentification admin", { 
      originalError: error.message 
    }));
  }
};

/**
 * Middleware pour autoriser seulement certains rôles admin
 * @param {Array<string>} roles - Rôles autorisés (ex: ['SUPER_ADMIN', 'MODERATEUR'])
 * @param {Array<string>} permissions - Permissions requises (optionnel)
 */
const authorize = (roles = [], permissions = []) => {
  return (req, res, next) => {
    try {
      // Vérifier que l'admin est authentifié
      if (!req.user || req.user.type !== 'admin') {
        return res.status(401).json({
          success: false,
          message: 'Authentification administrateur requise.',
          code: 'ADMIN_AUTH_REQUIRED'
        });
      }

      const admin = req.admin;
      const userPermissions = req.user.permissions || admin.permissions || [];
      const userRole = req.user.role || admin.role;

      // Vérifier le rôle
      if (roles.length > 0 && !roles.includes(userRole)) {
        securityLogger.warn('Accès refusé - Rôle insuffisant', {
          adminId: admin._id,
          roleAdmin: userRole,
          rolesRequis: roles,
          endpoint: `${req.method} ${req.originalUrl}`
        });

        return res.status(403).json({
          success: false,
          message: `Rôle insuffisant. Rôles autorisés: ${roles.join(', ')}`,
          code: 'INSUFFICIENT_ROLE',
          requiredRoles: roles,
          currentRole: userRole
        });
      }

      // Vérifier les permissions (si spécifiées)
      if (permissions.length > 0) {
        // ✅ Vérification améliorée des permissions
        const hasPermission = permissions.some(p => {
          // Si l'admin a la permission ALL, il a toutes les permissions
          if (userPermissions.includes('ALL')) return true;
          // Sinon vérifier si la permission spécifique existe
          return userPermissions.includes(p);
        });
        
        if (!hasPermission) {
          securityLogger.warn('Accès refusé - Permission insuffisante', {
            adminId: admin._id,
            permissionsAdmin: userPermissions,
            permissionsRequises: permissions,
            endpoint: `${req.method} ${req.originalUrl}`
          });

          return res.status(403).json({
            success: false,
            message: `Permission insuffisante. Permissions requises: ${permissions.join(' ou ')}`,
            code: 'INSUFFICIENT_PERMISSION',
            requiredPermissions: permissions,
            currentPermissions: userPermissions
          });
        }
      }

      next();

    } catch (error) {
      console.error('Erreur dans authorize:', error);
      return next(AppError.serverError('Erreur lors de la vérification des autorisations', { 
        originalError: error.message 
      }));
    }
  };
};

/**
 * Middleware pour logger les actions sensibles des administrateurs
 * @param {string} actionType - Type d'action (ex: 'ADMIN_LOGIN', 'USER_BLOCK')
 */
const logSensitiveAction = (actionType) => {
  return (req, res, next) => {
    const logData = {
      actionType: actionType,
      adminId: req.user ? req.user.id : 'anonymous',
      adminEmail: req.user ? req.user.email : 'anonymous',
      adminRole: req.user ? req.user.role : 'N/A',
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      endpoint: `${req.method} ${req.originalUrl}`,
      timestamp: new Date().toISOString()
    };

    // Ajouter le body pour certaines actions (sans les mots de passe)
    if (['ADMIN_CREATE', 'ADMIN_UPDATE', 'USER_BLOCK', 'USER_SUSPEND'].includes(actionType)) {
      const sanitizedBody = { ...req.body };
      delete sanitizedBody.motDePasse;
      delete sanitizedBody.password;
      logData.body = sanitizedBody;
    }

    securityLogger.info('Action administrative sensible', logData);

    // Logger aussi la réponse
    const originalSend = res.send;
    res.send = function(data) {
      try {
        const responseData = typeof data === 'string' ? JSON.parse(data) : data;
        securityLogger.info('Résultat action administrative', {
          ...logData,
          statusCode: res.statusCode,
          success: responseData.success || false
        });
      } catch (e) {
        // Ignorer les erreurs de parsing
      }
      return originalSend.call(this, data);
    };

    next();
  };
};

/**
 * Middleware pour vérifier qu'un admin ne modifie pas son propre compte
 */
const preventSelfModification = (req, res, next) => {
  try {
    const targetAdminId = req.params.id;
    const currentAdminId = req.user.id.toString();

    if (targetAdminId === currentAdminId) {
      return res.status(403).json({
        success: false,
        message: 'Vous ne pouvez pas modifier votre propre compte. Demandez à un autre administrateur.',
        code: 'CANNOT_MODIFY_SELF'
      });
    }

    next();
  } catch (error) {
    console.error('Erreur dans preventSelfModification:', error);
    return next(AppError.serverError('Erreur lors de la vérification', { 
      originalError: error.message 
    }));
  }
};

/**
 * Middleware pour vérifier qu'un SUPER_ADMIN ne peut pas être modifié par un MODERATEUR
 */
const preventModifyingSuperAdmin = async (req, res, next) => {
  try {
    const targetAdminId = req.params.id;
    const currentAdminRole = req.user.role;

    // Si l'admin actuel est SUPER_ADMIN, il peut tout modifier
    if (currentAdminRole === 'SUPER_ADMIN') {
      return next();
    }

    // Charger l'admin cible
    const targetAdmin = await Administrateur.findById(targetAdminId);
    
    if (!targetAdmin) {
      return res.status(404).json({
        success: false,
        message: 'Administrateur cible introuvable',
        code: 'TARGET_ADMIN_NOT_FOUND'
      });
    }

    // Vérifier si l'admin cible est SUPER_ADMIN
    if (targetAdmin.role === 'SUPER_ADMIN') {
      return res.status(403).json({
        success: false,
        message: 'Seul un SUPER_ADMIN peut modifier un autre SUPER_ADMIN.',
        code: 'CANNOT_MODIFY_SUPER_ADMIN'
      });
    }

    next();
  } catch (error) {
    console.error('Erreur dans preventModifyingSuperAdmin:', error);
    return next(AppError.serverError('Erreur lors de la vérification', { 
      originalError: error.message 
    }));
  }
};

module.exports = {
  protectAdmin,
  authorize,
  logSensitiveAction,
  preventSelfModification,
  preventModifyingSuperAdmin
};