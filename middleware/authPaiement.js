// =====================================================
// MIDDLEWARES D'AUTHENTIFICATION ET AUTORISATION
// =====================================================

const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

/**
 * Middleware d'authentification JWT
 */
const authenticate = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '') || 
                  req.header('x-auth-token') ||
                  req.cookies?.authToken;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Token d\'authentification manquant',
        code: 'MISSING_AUTH_TOKEN'
      });
    }

    // Vérifier et décoder le token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Récupérer l'utilisateur complet
    const Utilisateur = mongoose.model('Utilisateur');
    const utilisateur = await Utilisateur.findById(decoded.id).select('-motDePasse');
    
    if (!utilisateur) {
      return res.status(401).json({
        success: false,
        message: 'Utilisateur introuvable',
        code: 'USER_NOT_FOUND'
      });
    }

    // Vérifier si l'utilisateur est actif
    if (utilisateur.statut !== 'ACTIF') {
      return res.status(403).json({
        success: false,
        message: 'Compte utilisateur inactif',
        code: 'INACTIVE_USER'
      });
    }

    // Vérifier si le token n'est pas dans la blacklist (optionnel)
    if (await estTokenBlackliste(token)) {
      return res.status(401).json({
        success: false,
        message: 'Token révoqué',
        code: 'REVOKED_TOKEN'
      });
    }

    // Attacher l'utilisateur à la requête
    req.user = {
      id: utilisateur._id.toString(),
      nom: utilisateur.nom,
      prenom: utilisateur.prenom,
      email: utilisateur.email,
      telephone: utilisateur.telephone,
      role: utilisateur.role,
      permissions: utilisateur.permissions || []
    };

    // Logger la requête authentifiée
    console.log(`Requête authentifiée: ${req.method} ${req.originalUrl} - Utilisateur: ${req.user.id}`);

    next();

  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Token invalide',
        code: 'INVALID_TOKEN'
      });
    }

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expiré',
        code: 'EXPIRED_TOKEN'
      });
    }

    console.error('Erreur authentification:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur d\'authentification',
      code: 'AUTH_ERROR'
    });
  }
};

/**
 * Middleware d'autorisation basé sur les rôles
 */
const authorize = (rolesAutorises = [], permissionsRequises = []) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentification requise',
        code: 'AUTHENTICATION_REQUIRED'
      });
    }

    // Vérifier les rôles
    if (rolesAutorises.length > 0) {
      if (!rolesAutorises.includes(req.user.role)) {
        return res.status(403).json({
          success: false,
          message: 'Rôle insuffisant pour cette action',
          code: 'INSUFFICIENT_ROLE',
          data: {
            roleUtilisateur: req.user.role,
            rolesRequis: rolesAutorises
          }
        });
      }
    }

    // Vérifier les permissions spécifiques
    if (permissionsRequises.length > 0) {
      const permissionsUtilisateur = req.user.permissions || [];
      const permissionsManquantes = permissionsRequises.filter(
        permission => !permissionsUtilisateur.includes(permission)
      );

      if (permissionsManquantes.length > 0) {
        return res.status(403).json({
          success: false,
          message: 'Permissions insuffisantes',
          code: 'INSUFFICIENT_PERMISSIONS',
          data: {
            permissionsManquantes
          }
        });
      }
    }

    next();
  };
};

/**
 * Middleware d'authentification optionnelle (pour les routes publiques avec contexte)
 */
const optionalAuth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const Utilisateur = mongoose.model('Utilisateur');
      const utilisateur = await Utilisateur.findById(decoded.id).select('-motDePasse');
      
      if (utilisateur && utilisateur.statut === 'ACTIF') {
        req.user = {
          id: utilisateur._id.toString(),
          role: utilisateur.role,
          permissions: utilisateur.permissions || []
        };
      }
    }

    next();

  } catch (error) {
    // En cas d'erreur, continuer sans utilisateur
    next();
  }
};

/**
 * Middleware de validation des permissions sur les ressources
 */
const checkResourcePermission = (getResourceId, checkOwnership = true) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentification requise',
          code: 'AUTHENTICATION_REQUIRED'
        });
      }

      // Les admins ont accès à tout
      if (req.user.role === 'ADMIN') {
        return next();
      }

      if (checkOwnership) {
        const resourceId = typeof getResourceId === 'function' 
          ? getResourceId(req) 
          : req.params[getResourceId];

        if (!resourceId) {
          return res.status(400).json({
            success: false,
            message: 'ID de ressource manquant',
            code: 'MISSING_RESOURCE_ID'
          });
        }

        // Pour les paiements, vérifier si l'utilisateur est payeur ou bénéficiaire
        const Paiement = mongoose.model('Paiement');
        const paiement = await Paiement.findById(resourceId);

        if (!paiement) {
          return res.status(404).json({
            success: false,
            message: 'Ressource introuvable',
            code: 'RESOURCE_NOT_FOUND'
          });
        }

        const isPayeur = paiement.payeurId.toString() === req.user.id;
        const isBeneficiaire = paiement.beneficiaireId.toString() === req.user.id;

        if (!isPayeur && !isBeneficiaire) {
          return res.status(403).json({
            success: false,
            message: 'Accès non autorisé à cette ressource',
            code: 'UNAUTHORIZED_RESOURCE_ACCESS'
          });
        }
      }

      next();

    } catch (error) {
      console.error('Erreur vérification permission ressource:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur de vérification des permissions',
        code: 'PERMISSION_CHECK_ERROR'
      });
    }
  };
};

/**
 * Middleware de logging des actions sensibles
 */
const logSensitiveAction = (action) => {
  return (req, res, next) => {
    const logData = {
      action,
      utilisateur: req.user?.id || 'anonyme',
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      timestamp: new Date(),
      url: req.originalUrl,
      method: req.method
    };

    console.log('Action sensible:', JSON.stringify(logData, null, 2));
    
    // Ici vous pourriez sauvegarder en base de données
    // await AuditLog.create(logData);

    next();
  };
};

/**
 * Fonction utilitaire pour vérifier si un token est blacklisté
 * À implémenter selon vos besoins (Redis, MongoDB, etc.)
 */
const estTokenBlackliste = async (token) => {
  // Implémentation à ajouter selon votre système de blacklist
  return false;
};

module.exports = {
  authenticate,
  authorize,
  optionalAuth,
  checkResourcePermission,
  logSensitiveAction
};