/**
 * Middleware de vérification des rôles et permissions
 * Gère l'autorisation pour tous les types d'utilisateurs de l'application
 */

// Import simplifié pour éviter les dépendances circulaires
const Utilisateur = require('../models/Utilisateur');

// ========================================
// FONCTIONS UTILITAIRES SIMPLIFIÉES
// ========================================

/**
 * Vérifie si un utilisateur a un rôle spécifique
 * @param {string} userRole - Rôle de l'utilisateur
 * @param {Array|string} requiredRoles - Rôle(s) requis
 * @returns {boolean}
 */
const hasRole = (userRole, requiredRoles) => {
  if (!userRole) return false;
  
  const rolesArray = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];
  return rolesArray.includes(userRole);
};

/**
 * Récupère les informations d'un utilisateur avec vérification du statut
 * @param {string} userId - ID de l'utilisateur
 * @returns {object} Informations utilisateur
 */
const getUserWithStatus = async (userId) => {
  const user = await Utilisateur.findById(userId).select('+statutCompte');
  
  if (!user) {
    throw new Error('Utilisateur non trouvé');
  }

  // Vérification basique du statut (adaptez selon votre modèle)
  if (user.statutCompte && user.statutCompte === 'BLOQUE') {
    throw new Error('Compte utilisateur bloqué');
  }

  return user;
};

// ========================================
// MIDDLEWARES DE BASE
// ========================================

/**
 * Vérifie qu'un utilisateur est connecté et actif
 * CORRIGÉ : Évite les réponses multiples
 */
const requireAuth = async (req, res, next) => {
  try {
    if (!req.user || !req.user._id) {
      return res.status(401).json({
        success: false,
        message: 'Utilisateur non authentifié',
        code: 'UNAUTHORIZED'
      });
    }

    // Vérifier que l'utilisateur existe toujours et est actif
    const user = await getUserWithStatus(req.user._id);
    req.user.userData = user;

    next();
  } catch (error) {
    console.error('Erreur requireAuth:', error);
    return res.status(401).json({
      success: false,
      message: error.message || 'Erreur d\'authentification',
      code: 'AUTHENTICATION_ERROR'
    });
  }
};

/**
 * Vérifie qu'un utilisateur a un ou plusieurs rôles spécifiques
 * CORRIGÉ : Structure simplifiée, une seule réponse possible
 * @param {Array|string} roles - Rôles autorisés
 * @returns {function} Middleware
 */
const requireRole = (roles) => {
  return async (req, res, next) => {
    try {
      // Vérification de l'authentification d'abord
      if (!req.user || !req.user._id) {
        return res.status(401).json({
          success: false,
          message: 'Utilisateur non authentifié',
          code: 'UNAUTHORIZED'
        });
      }

      // Récupérer les infos utilisateur si pas encore fait
      if (!req.user.userData) {
        try {
          const user = await getUserWithStatus(req.user._id);
          req.user.userData = user;
        } catch (error) {
          return res.status(401).json({
            success: false,
            message: error.message,
            code: 'AUTHENTICATION_ERROR'
          });
        }
      }

      const userRole = req.user.role || req.user.userData?.role;

      // Vérification du rôle
      if (!hasRole(userRole, roles)) {
        return res.status(403).json({
          success: false,
          message: `Accès refusé. Rôles requis: ${Array.isArray(roles) ? roles.join(', ') : roles}`,
          code: 'FORBIDDEN'
        });
      }

      // Tout est OK, passer au middleware suivant
      next();
    } catch (error) {
      console.error('Erreur requireRole:', error);
      return res.status(500).json({
        success: false,
        message: 'Erreur serveur lors de la vérification des permissions',
        code: 'SERVER_ERROR'
      });
    }
  };
};

// ========================================
// MIDDLEWARES DE PROPRIÉTÉ SIMPLIFIÉS
// ========================================

/**
 * Vérifie qu'un utilisateur est propriétaire d'une ressource ou admin
 * CORRIGÉ : Structure simplifiée
 * @param {string} resourceField - Champ contenant l'ID à vérifier (ex: 'id', 'userId')
 * @returns {function} Middleware
 */
const requireOwnership = (resourceField = 'id') => {
  return async (req, res, next) => {
    try {
      // Vérification de l'authentification
      if (!req.user || !req.user._id) {
        return res.status(401).json({
          success: false,
          message: 'Utilisateur non authentifié',
          code: 'UNAUTHORIZED'
        });
      }

      const resourceId = req.params[resourceField] || req.body[resourceField];
      
      if (!resourceId) {
        return res.status(400).json({
          success: false,
          message: `Paramètre ${resourceField} requis`,
          code: 'MISSING_PARAMETER'
        });
      }

      // Si c'est un admin, autoriser l'accès
      const userRole = req.user.role || req.user.userData?.role;
      if (userRole === 'ADMIN' || userRole === 'MODERATEUR') {
        return next();
      }

      // Vérifier la propriété
      if (resourceId !== req.user._id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Accès non autorisé à cette ressource',
          code: 'FORBIDDEN'
        });
      }

      next();
    } catch (error) {
      console.error('Erreur requireOwnership:', error);
      return res.status(500).json({
        success: false,
        message: 'Erreur serveur lors de la vérification des permissions',
        code: 'SERVER_ERROR'
      });
    }
  };
};

/**
 * Vérifie qu'un utilisateur a un compte vérifié
 * CORRIGÉ : Structure simplifiée
 */
const requireVerifiedUser = async (req, res, next) => {
  try {
    // Vérification de l'authentification
    if (!req.user || !req.user._id) {
      return res.status(401).json({
        success: false,
        message: 'Utilisateur non authentifié',
        code: 'UNAUTHORIZED'
      });
    }

    // Récupérer les infos utilisateur si pas encore fait
    if (!req.user.userData) {
      try {
        const user = await getUserWithStatus(req.user._id);
        req.user.userData = user;
      } catch (error) {
        return res.status(401).json({
          success: false,
          message: error.message,
          code: 'AUTHENTICATION_ERROR'
        });
      }
    }

    const user = req.user.userData;
    
    if (!user.estVerifie) {
      return res.status(403).json({
        success: false,
        message: 'Compte non vérifié. Veuillez compléter la vérification de votre identité.',
        code: 'ACCOUNT_NOT_VERIFIED',
        requiresVerification: true
      });
    }

    next();
  } catch (error) {
    console.error('Erreur requireVerifiedUser:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la vérification',
      code: 'SERVER_ERROR'
    });
  }
};

// ========================================
// MIDDLEWARES COMBINÉS SIMPLIFIÉS
// ========================================

// Permissions administratives courantes
const requireAdmin = requireRole(['ADMIN']);
const requireModerator = requireRole(['ADMIN', 'MODERATEUR']);
const requireAdminOrModerator = requireRole(['ADMIN', 'MODERATEUR']);

// Propriétés de ressources
const requireOwnershipOrAdmin = requireOwnership('id');
const requireUserOwnership = requireOwnership('userId');

// ========================================
// EXPORTS SIMPLIFIÉS
// ========================================

module.exports = {
  // Middlewares de base
  requireAuth,
  requireRole,
  
  // Middlewares de propriété
  requireOwnership,
  requireOwnershipOrAdmin,
  requireUserOwnership,
  
  // Middlewares de vérification
  requireVerifiedUser,
  
  // Middlewares combinés
  requireAdmin,
  requireModerator,
  requireAdminOrModerator,
  
  // Fonctions utilitaires
  hasRole,
  getUserWithStatus
};