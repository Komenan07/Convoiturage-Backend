/**
 * Middleware de vérification des rôles et permissions
 * Gère l'autorisation pour tous les types d'utilisateurs de l'application
 */

const {
  ROLE_ADMIN,
  PERMISSIONS,
  STATUT_COMPTE,
  CODES_ERREUR,
  MESSAGES_ERREUR
} = require('../utils/constants');

const Utilisateur = require('../models/Utilisateur');
const Administrateur = require('../models/Administrateur');
const Trajet = require('../models/Trajet');
const Reservation = require('../models/Reservation');

// ========================================
// FONCTIONS UTILITAIRES
// ========================================

/**
 * Vérifie si un utilisateur a une permission spécifique
 * @param {Array} userPermissions - Permissions de l'utilisateur
 * @param {string} requiredPermission - Permission requise
 * @returns {boolean}
 */
const hasPermission = (userPermissions, requiredPermission) => {
  if (!userPermissions || !Array.isArray(userPermissions)) {
    return false;
  }

  // Si l'utilisateur a la permission ALL, il a toutes les permissions
  if (userPermissions.includes(PERMISSIONS.ALL)) {
    return true;
  }

  // Vérification de la permission spécifique
  return userPermissions.includes(requiredPermission);
};

/**
 * Vérifie si un rôle est supérieur ou égal à un autre
 * @param {string} userRole - Rôle de l'utilisateur
 * @param {string} requiredRole - Rôle requis minimum
 * @returns {boolean}
 */
const hasRoleLevel = (userRole, requiredRole) => {
  const roleHierarchy = {
    [ROLE_ADMIN.SUPPORT]: 1,
    [ROLE_ADMIN.MODERATEUR]: 2,
    [ROLE_ADMIN.SUPER_ADMIN]: 3
  };

  const userLevel = roleHierarchy[userRole] || 0;
  const requiredLevel = roleHierarchy[requiredRole] || 0;

  return userLevel >= requiredLevel;
};

/**
 * Récupère les informations complètes d'un utilisateur avec vérification du statut
 * @param {string} userId - ID de l'utilisateur
 * @returns {object} Informations utilisateur
 */
const getUserWithStatus = async (userId) => {
  const user = await Utilisateur.findById(userId).select('+statutCompte');
  
  if (!user) {
    throw new Error(MESSAGES_ERREUR.UTILISATEUR_NON_TROUVE);
  }

  if (user.statutCompte !== STATUT_COMPTE.ACTIF) {
    throw new Error('Compte utilisateur suspendu ou bloqué');
  }

  return user;
};

/**
 * Récupère les informations complètes d'un administrateur avec vérification du statut
 * @param {string} adminId - ID de l'administrateur
 * @returns {object} Informations administrateur
 */
const getAdminWithStatus = async (adminId) => {
  const admin = await Administrateur.findById(adminId).select('+statutCompte +permissions');
  
  if (!admin) {
    throw new Error('Administrateur non trouvé');
  }

  if (admin.statutCompte !== STATUT_COMPTE.ACTIF) {
    throw new Error('Compte administrateur suspendu');
  }

  return admin;
};

// ========================================
// MIDDLEWARES DE BASE
// ========================================

/**
 * Vérifie qu'un utilisateur est connecté et actif
 */
const requireAuth = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        message: MESSAGES_ERREUR.TOKEN_INVALIDE,
        code: CODES_ERREUR.AUTHENTICATION_ERROR
      });
    }

    // Vérifier que l'utilisateur existe toujours et est actif
    const user = await getUserWithStatus(req.user.id);
    req.user.userData = user;

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: error.message,
      code: CODES_ERREUR.AUTHENTICATION_ERROR
    });
  }
};

/**
 * Vérifie qu'un administrateur est connecté et actif
 */
const requireAdminAuth = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id || req.user.type !== 'admin') {
      return res.status(401).json({
        success: false,
        message: MESSAGES_ERREUR.ACCES_NON_AUTORISE,
        code: CODES_ERREUR.AUTHENTICATION_ERROR
      });
    }

    // Vérifier que l'admin existe toujours et est actif
    const admin = await getAdminWithStatus(req.user.id);
    req.user.adminData = admin;

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: error.message,
      code: CODES_ERREUR.AUTHENTICATION_ERROR
    });
  }
};

// ========================================
// MIDDLEWARES DE PERMISSIONS ADMINISTRATIVES
// ========================================

/**
 * Vérifie qu'un administrateur a une permission spécifique
 * @param {string} permission - Permission requise
 * @returns {function} Middleware
 */
const requirePermission = (permission) => {
  return async (req, res, next) => {
    try {
      await requireAdminAuth(req, res, () => {});
      
      const admin = req.user.adminData;
      
      if (!hasPermission(admin.permissions, permission)) {
        return res.status(403).json({
          success: false,
          message: `Permission ${permission} requise`,
          code: CODES_ERREUR.AUTHORIZATION_ERROR
        });
      }

      next();
    } catch (error) {
      return res.status(403).json({
        success: false,
        message: MESSAGES_ERREUR.ACCES_NON_AUTORISE,
        code: CODES_ERREUR.AUTHORIZATION_ERROR
      });
    }
  };
};

/**
 * Vérifie qu'un administrateur a un rôle minimum requis
 * @param {string} requiredRole - Rôle minimum requis
 * @returns {function} Middleware
 */
const requireRole = (requiredRole) => {
  return async (req, res, next) => {
    try {
      await requireAdminAuth(req, res, () => {});
      
      const admin = req.user.adminData;
      
      if (!hasRoleLevel(admin.role, requiredRole)) {
        return res.status(403).json({
          success: false,
          message: `Rôle ${requiredRole} ou supérieur requis`,
          code: CODES_ERREUR.AUTHORIZATION_ERROR
        });
      }

      next();
    } catch (error) {
      return res.status(403).json({
        success: false,
        message: MESSAGES_ERREUR.ACCES_NON_AUTORISE,
        code: CODES_ERREUR.AUTHORIZATION_ERROR
      });
    }
  };
};

// ========================================
// MIDDLEWARES DE PROPRIÉTÉ ET ACCÈS
// ========================================

/**
 * Vérifie qu'un utilisateur est propriétaire d'une ressource ou admin
 * @param {string} resourceModel - Nom du modèle de la ressource
 * @param {string} ownerField - Champ contenant l'ID du propriétaire
 * @returns {function} Middleware
 */
const requireOwnershipOrAdmin = (resourceModel, ownerField = 'userId') => {
  return async (req, res, next) => {
    try {
      const resourceId = req.params.id;
      
      if (!resourceId) {
        return res.status(400).json({
          success: false,
          message: 'ID de ressource requis',
          code: CODES_ERREUR.VALIDATION_ERROR
        });
      }

      // Si c'est un admin, autoriser l'accès
      if (req.user.type === 'admin') {
        await requireAdminAuth(req, res, () => {});
        return next();
      }

      // Sinon, vérifier la propriété
      await requireAuth(req, res, () => {});
      
      let Resource;
      switch (resourceModel) {
        case 'Trajet':
          Resource = Trajet;
          break;
        case 'Reservation':
          Resource = Reservation;
          break;
        case 'Utilisateur':
          Resource = Utilisateur;
          break;
        default:
          throw new Error('Modèle de ressource non supporté');
      }

      const resource = await Resource.findById(resourceId);
      
      if (!resource) {
        return res.status(404).json({
          success: false,
          message: 'Ressource non trouvée',
          code: CODES_ERREUR.NOT_FOUND
        });
      }

      // Vérifier la propriété
      const ownerId = resource[ownerField]?.toString() || resource._id.toString();
      if (ownerId !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'Accès non autorisé à cette ressource',
          code: CODES_ERREUR.AUTHORIZATION_ERROR
        });
      }

      req.resource = resource;
      next();
    } catch (error) {
      return next(AppError.serverError('Erreur serveur lors de la vérification des permissions', { originalError: error.message }));
    }
  };
};

/**
 * Vérifie qu'un utilisateur est conducteur d'un trajet
 */
const requireConducteur = async (req, res, next) => {
  try {
    await requireAuth(req, res, () => {});
    
    const trajetId = req.params.trajetId || req.body.trajetId;
    
    if (!trajetId) {
      return res.status(400).json({
        success: false,
        message: 'ID de trajet requis',
        code: CODES_ERREUR.VALIDATION_ERROR
      });
    }

    const trajet = await Trajet.findById(trajetId);
    
    if (!trajet) {
      return res.status(404).json({
        success: false,
        message: MESSAGES_ERREUR.TRAJET_NON_TROUVE,
        code: CODES_ERREUR.NOT_FOUND
      });
    }

    if (trajet.conducteurId.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Seul le conducteur peut effectuer cette action',
        code: CODES_ERREUR.AUTHORIZATION_ERROR
      });
    }

    req.trajet = trajet;
    next();
  } catch (error) {
    return next(AppError.serverError('Erreur serveur lors de la vérification du conducteur', { originalError: error.message }));
  }
};

/**
 * Vérifie qu'un utilisateur est passager d'une réservation
 */
const requirePassager = async (req, res, next) => {
  try {
    await requireAuth(req, res, () => {});
    
    const reservationId = req.params.reservationId || req.body.reservationId;
    
    if (!reservationId) {
      return res.status(400).json({
        success: false,
        message: 'ID de réservation requis',
        code: CODES_ERREUR.VALIDATION_ERROR
      });
    }

    const reservation = await Reservation.findById(reservationId);
    
    if (!reservation) {
      return res.status(404).json({
        success: false,
        message: MESSAGES_ERREUR.RESERVATION_NON_TROUVE,
        code: CODES_ERREUR.NOT_FOUND
      });
    }

    if (reservation.passagerId.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Seul le passager peut effectuer cette action',
        code: CODES_ERREUR.AUTHORIZATION_ERROR
      });
    }

    req.reservation = reservation;
    next();
  } catch (error) {
    return next(AppError.serverError('Erreur serveur lors de la vérification du passager', { originalError: error.message }));
  }
};

/**
 * Vérifie qu'un utilisateur participe à un trajet (conducteur ou passager)
 */
const requireParticipant = async (req, res, next) => {
  try {
    await requireAuth(req, res, () => {});
    
    const trajetId = req.params.trajetId || req.body.trajetId;
    
    if (!trajetId) {
      return res.status(400).json({
        success: false,
        message: 'ID de trajet requis',
        code: CODES_ERREUR.VALIDATION_ERROR
      });
    }

    const trajet = await Trajet.findById(trajetId);
    
    if (!trajet) {
      return res.status(404).json({
        success: false,
        message: MESSAGES_ERREUR.TRAJET_NON_TROUVE,
        code: CODES_ERREUR.NOT_FOUND
      });
    }

    // Vérifier si l'utilisateur est le conducteur
    const isConducteur = trajet.conducteurId.toString() === req.user.id;
    
    // Vérifier si l'utilisateur est un passager
    const reservation = await Reservation.findOne({
      trajetId: trajetId,
      passagerId: req.user.id,
      statutReservation: 'CONFIRMEE'
    });
    
    const isPassager = !!reservation;

    if (!isConducteur && !isPassager) {
      return res.status(403).json({
        success: false,
        message: 'Vous devez participer à ce trajet pour effectuer cette action',
        code: CODES_ERREUR.AUTHORIZATION_ERROR
      });
    }

    req.trajet = trajet;
    req.userRole = isConducteur ? 'conducteur' : 'passager';
    req.reservation = reservation;
    
    next();
  } catch (error) {
    return next(AppError.serverError('Erreur serveur lors de la vérification du participant', { originalError: error.message }));
  }
};

// ========================================
// MIDDLEWARES DE VÉRIFICATION D'IDENTITÉ
// ========================================

/**
 * Vérifie qu'un utilisateur a un compte vérifié
 */
const requireVerifiedUser = async (req, res, next) => {
  try {
    await requireAuth(req, res, () => {});
    
    const user = req.user.userData;
    
    if (!user.estVerifie) {
      return res.status(403).json({
        success: false,
        message: 'Compte non vérifié. Veuillez compléter la vérification de votre identité.',
        code: CODES_ERREUR.AUTHORIZATION_ERROR,
        requiresVerification: true
      });
    }

    next();
  } catch (error) {
    return next(AppError.serverError('Erreur serveur lors de la vérification de l\'utilisateur', { originalError: error.message }));
  }
};

/**
 * Vérifie qu'un utilisateur a un véhicule enregistré (pour être conducteur)
 */
const requireVehicule = async (req, res, next) => {
  try {
    await requireVerifiedUser(req, res, () => {});
    
    const user = req.user.userData;
    
    if (!user.vehicules || user.vehicules.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'Vous devez enregistrer un véhicule pour créer des trajets.',
        code: CODES_ERREUR.AUTHORIZATION_ERROR,
        requiresVehicle: true
      });
    }

    // Vérifier que le véhicule a une assurance et visite technique valides
    const vehicule = user.vehicules[0];
    const now = new Date();
    
    if (vehicule.assurance.dateExpiration < now) {
      return res.status(403).json({
        success: false,
        message: 'L\'assurance de votre véhicule a expiré.',
        code: CODES_ERREUR.AUTHORIZATION_ERROR,
        requiresInsuranceUpdate: true
      });
    }

    if (vehicule.visiteTechnique.dateExpiration < now) {
      return res.status(403).json({
        success: false,
        message: 'La visite technique de votre véhicule a expiré.',
        code: CODES_ERREUR.AUTHORIZATION_ERROR,
        requiresTechnicalVisitUpdate: true
      });
    }

    req.vehicule = vehicule;
    next();
  } catch (error) {
    return next(AppError.serverError('Erreur serveur lors de la vérification du véhicule', { originalError: error.message }));
  }
};

// ========================================
// MIDDLEWARES COMBINÉS POUR PERMISSIONS SPÉCIFIQUES
// ========================================

// Permissions administratives courantes
const requireGestionUtilisateurs = requirePermission(PERMISSIONS.GESTION_UTILISATEURS);
const requireModeration = requirePermission(PERMISSIONS.MODERATION);
const requireAnalytics = requirePermission(PERMISSIONS.ANALYTICS);
const requireGestionTrajets = requirePermission(PERMISSIONS.GESTION_TRAJETS);
const requireGestionPaiements = requirePermission(PERMISSIONS.GESTION_PAIEMENTS);
const requireSupportClient = requirePermission(PERMISSIONS.SUPPORT_CLIENT);

// Rôles administratifs
const requireSuperAdmin = requireRole(ROLE_ADMIN.SUPER_ADMIN);
const requireModerateur = requireRole(ROLE_ADMIN.MODERATEUR);
const requireSupport = requireRole(ROLE_ADMIN.SUPPORT);

// Propriétés de ressources
const requireOwnershipUtilisateur = requireOwnershipOrAdmin('Utilisateur', '_id');
const requireOwnershipTrajet = requireOwnershipOrAdmin('Trajet', 'conducteurId');
const requireOwnershipReservation = requireOwnershipOrAdmin('Reservation', 'passagerId');

// ========================================
// EXPORTS
// ========================================

module.exports = {
  // Middlewares de base
  requireAuth,
  requireAdminAuth,
  
  // Middlewares de permissions
  requirePermission,
  requireRole,
  
  // Middlewares de propriété
  requireOwnershipOrAdmin,
  requireConducteur,
  requirePassager,
  requireParticipant,
  
  // Middlewares de vérification
  requireVerifiedUser,
  requireVehicule,
  
  // Middlewares combinés - Permissions
  requireGestionUtilisateurs,
  requireModeration,
  requireAnalytics,
  requireGestionTrajets,
  requireGestionPaiements,
  requireSupportClient,
  
  // Middlewares combinés - Rôles
  requireSuperAdmin,
  requireModerateur,
  requireSupport,
  
  // Middlewares combinés - Propriétés
  requireOwnershipUtilisateur,
  requireOwnershipTrajet,
  requireOwnershipReservation,
  
  // Fonctions utilitaires
  hasPermission,
  hasRoleLevel,
  getUserWithStatus,
  getAdminWithStatus
};