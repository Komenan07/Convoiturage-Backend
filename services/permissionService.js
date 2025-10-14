/**
 * Service de gestion des permissions et rôles
 * Logique métier centralisée pour l'autorisation et les contrôles d'accès
 */

const {
  ROLE_ADMIN,
  PERMISSIONS,
  STATUT_COMPTE,
  STATUT_VERIFICATION,
  STATUT_TRAJET,
  STATUT_RESERVATION,
  STATUT_ALERTE,
  BADGES_UTILISATEUR,
  TYPE_EVALUATEUR,
  CODES_ERREUR
} = require('../utils/constants');

const Utilisateur = require('../models/Utilisateur');
const Administrateur = require('../models/admin');
const Trajet = require('../models/Trajet');
const Reservation = require('../models/Reservation');
const Evaluation = require('../models/Evaluation');
const Message = require('../models/Message');
const Signalement = require('../models/Signalement');
const AlerteUrgence = require('../models/AlerteUrgence');

// ========================================
// CONSTANTES DE CONFIGURATION
// ========================================

// Hiérarchie des rôles administratifs (plus le chiffre est élevé, plus le rôle est puissant)
const ROLE_HIERARCHY = {
  [ROLE_ADMIN.SUPPORT]: 1,
  [ROLE_ADMIN.MODERATEUR]: 2,
  [ROLE_ADMIN.SUPER_ADMIN]: 3
};

// Mapping des permissions par rôle par défaut
const DEFAULT_PERMISSIONS_BY_ROLE = {
  [ROLE_ADMIN.SUPPORT]: [
    PERMISSIONS.SUPPORT_CLIENT,
    PERMISSIONS.ANALYTICS
  ],
  [ROLE_ADMIN.MODERATEUR]: [
    PERMISSIONS.SUPPORT_CLIENT,
    PERMISSIONS.MODERATION,
    PERMISSIONS.GESTION_UTILISATEURS,
    PERMISSIONS.ANALYTICS
  ],
  [ROLE_ADMIN.SUPER_ADMIN]: [PERMISSIONS.ALL]
};

// Permissions requises par action
const ACTION_PERMISSIONS = {
  // Gestion utilisateurs
  'user.view': [PERMISSIONS.GESTION_UTILISATEURS, PERMISSIONS.SUPPORT_CLIENT],
  'user.update': [PERMISSIONS.GESTION_UTILISATEURS],
  'user.suspend': [PERMISSIONS.GESTION_UTILISATEURS],
  'user.delete': [PERMISSIONS.GESTION_UTILISATEURS],
  'user.verify': [PERMISSIONS.GESTION_UTILISATEURS],
  
  // Modération
  'moderation.view': [PERMISSIONS.MODERATION],
  'moderation.handle': [PERMISSIONS.MODERATION],
  'signalement.view': [PERMISSIONS.MODERATION],
  'signalement.process': [PERMISSIONS.MODERATION],
  
  // Trajets
  'trajet.moderate': [PERMISSIONS.GESTION_TRAJETS, PERMISSIONS.MODERATION],
  'trajet.suspend': [PERMISSIONS.GESTION_TRAJETS],
  
  // Paiements
  'paiement.view': [PERMISSIONS.GESTION_PAIEMENTS],
  'paiement.refund': [PERMISSIONS.GESTION_PAIEMENTS],
  'paiement.dispute': [PERMISSIONS.GESTION_PAIEMENTS],
  
  // Analytics
  'analytics.view': [PERMISSIONS.ANALYTICS],
  'analytics.export': [PERMISSIONS.ANALYTICS],
  
  // Support
  'support.chat': [PERMISSIONS.SUPPORT_CLIENT],
  'support.ticket': [PERMISSIONS.SUPPORT_CLIENT]
};

// ========================================
// CLASSE PRINCIPALE DU SERVICE
// ========================================

class PermissionService {
  
  // ====================================
  // MÉTHODES DE VÉRIFICATION DES RÔLES
  // ====================================

  /**
   * Vérifie si un rôle est supérieur ou égal à un autre
   * @param {string} userRole - Rôle de l'utilisateur
   * @param {string} requiredRole - Rôle requis minimum
   * @returns {boolean}
   */
  static hasRoleLevel(userRole, requiredRole) {
    const userLevel = ROLE_HIERARCHY[userRole] || 0;
    const requiredLevel = ROLE_HIERARCHY[requiredRole] || 0;
    return userLevel >= requiredLevel;
  }

  /**
   * Obtient le niveau numérique d'un rôle
   * @param {string} role - Rôle à évaluer
   * @returns {number}
   */
  static getRoleLevel(role) {
    return ROLE_HIERARCHY[role] || 0;
  }

  /**
   * Vérifie si un utilisateur peut effectuer une action sur un autre utilisateur
   * @param {string} actorRole - Rôle de l'utilisateur qui effectue l'action
   * @param {string} targetRole - Rôle de l'utilisateur cible
   * @returns {boolean}
   */
  static canActOnUser(actorRole, targetRole) {
    // Un utilisateur ne peut pas agir sur quelqu'un de niveau supérieur ou égal
    return this.getRoleLevel(actorRole) > this.getRoleLevel(targetRole);
  }

  // ====================================
  // MÉTHODES DE VÉRIFICATION DES PERMISSIONS
  // ====================================

  /**
   * Vérifie si un utilisateur a une permission spécifique
   * @param {Array} userPermissions - Permissions de l'utilisateur
   * @param {string} requiredPermission - Permission requise
   * @returns {boolean}
   */
  static hasPermission(userPermissions, requiredPermission) {
    if (!userPermissions || !Array.isArray(userPermissions)) {
      return false;
    }

    // Permission ALL donne accès à tout
    if (userPermissions.includes(PERMISSIONS.ALL)) {
      return true;
    }

    return userPermissions.includes(requiredPermission);
  }

  /**
   * Vérifie si un utilisateur a au moins une des permissions dans une liste
   * @param {Array} userPermissions - Permissions de l'utilisateur
   * @param {Array} requiredPermissions - Liste des permissions acceptées
   * @returns {boolean}
   */
  static hasAnyPermission(userPermissions, requiredPermissions) {
    if (!userPermissions || !Array.isArray(userPermissions) || !Array.isArray(requiredPermissions)) {
      return false;
    }

    if (userPermissions.includes(PERMISSIONS.ALL)) {
      return true;
    }

    return requiredPermissions.some(permission => userPermissions.includes(permission));
  }

  /**
   * Vérifie si un utilisateur peut effectuer une action spécifique
   * @param {Array} userPermissions - Permissions de l'utilisateur
   * @param {string} action - Action à effectuer
   * @returns {boolean}
   */
  static canPerformAction(userPermissions, action) {
    const requiredPermissions = ACTION_PERMISSIONS[action];
    if (!requiredPermissions) {
      return false; // Action non définie = accès refusé
    }

    return this.hasAnyPermission(userPermissions, requiredPermissions);
  }

  /**
   * Obtient les permissions par défaut pour un rôle
   * @param {string} role - Rôle administrateur
   * @returns {Array}
   */
  static getDefaultPermissions(role) {
    return DEFAULT_PERMISSIONS_BY_ROLE[role] || [];
  }

  // ====================================
  // MÉTHODES DE VÉRIFICATION D'ÉTAT
  // ====================================

  /**
   * Vérifie si un utilisateur est actif et vérifié
   * @param {Object} user - Objet utilisateur
   * @returns {Object} Résultat de la vérification
   */
  static async checkUserStatus(user) {
    if (!user) {
      return {
        isValid: false,
        reason: 'UTILISATEUR_INEXISTANT',
        message: 'Utilisateur non trouvé'
      };
    }

    if (user.statutCompte !== STATUT_COMPTE.ACTIF) {
      return {
        isValid: false,
        reason: 'COMPTE_INACTIF',
        message: `Compte ${user.statutCompte.toLowerCase()}`,
        status: user.statutCompte
      };
    }

    return {
      isValid: true,
      user: user
    };
  }

  /**
   * Vérifie si un administrateur est actif
   * @param {Object} admin - Objet administrateur
   * @returns {Object} Résultat de la vérification
   */
  static async checkAdminStatus(admin) {
    if (!admin) {
      return {
        isValid: false,
        reason: 'ADMIN_INEXISTANT',
        message: 'Administrateur non trouvé'
      };
    }

    if (admin.statutCompte !== STATUT_COMPTE.ACTIF) {
      return {
        isValid: false,
        reason: 'COMPTE_ADMIN_INACTIF',
        message: `Compte administrateur ${admin.statutCompte.toLowerCase()}`,
        status: admin.statutCompte
      };
    }

    return {
      isValid: true,
      admin: admin
    };
  }

  /**
   * Vérifie si un utilisateur peut créer des trajets
   * @param {Object} user - Objet utilisateur
   * @returns {Object} Résultat de la vérification
   */
  static async checkConductorEligibility(user) {
    const userStatus = await this.checkUserStatus(user);
    if (!userStatus.isValid) {
      return userStatus;
    }

    // Vérifier la vérification d'identité
    if (!user.estVerifie) {
      return {
        isValid: false,
        reason: 'IDENTITE_NON_VERIFIEE',
        message: 'Identité non vérifiée',
        requiresAction: 'VERIFY_IDENTITY'
      };
    }

    // Vérifier la présence d'un véhicule
    if (!user.vehicules || user.vehicules.length === 0) {
      return {
        isValid: false,
        reason: 'VEHICULE_MANQUANT',
        message: 'Aucun véhicule enregistré',
        requiresAction: 'ADD_VEHICLE'
      };
    }

    // Vérifier la validité des documents du véhicule
    const vehicule = user.vehicules[0];
    const now = new Date();

    if (vehicule.assurance.dateExpiration < now) {
      return {
        isValid: false,
        reason: 'ASSURANCE_EXPIREE',
        message: 'Assurance expirée',
        expirationDate: vehicule.assurance.dateExpiration,
        requiresAction: 'UPDATE_INSURANCE'
      };
    }

    if (vehicule.visiteTechnique.dateExpiration < now) {
      return {
        isValid: false,
        reason: 'VISITE_TECHNIQUE_EXPIREE',
        message: 'Visite technique expirée',
        expirationDate: vehicule.visiteTechnique.dateExpiration,
        requiresAction: 'UPDATE_TECHNICAL_VISIT'
      };
    }

    return {
      isValid: true,
      vehicule: vehicule
    };
  }

  // ====================================
  // MÉTHODES DE VÉRIFICATION DE PROPRIÉTÉ
  // ====================================

  /**
   * Vérifie si un utilisateur est propriétaire d'un trajet
   * @param {string} userId - ID de l'utilisateur
   * @param {string} trajetId - ID du trajet
   * @returns {Object} Résultat de la vérification
   */
  static async checkTrajetOwnership(userId, trajetId) {
    try {
      const trajet = await Trajet.findById(trajetId);
      
      if (!trajet) {
        return {
          isOwner: false,
          reason: 'TRAJET_INEXISTANT',
          message: 'Trajet non trouvé'
        };
      }

      const isOwner = trajet.conducteurId.toString() === userId;
      
      return {
        isOwner: isOwner,
        trajet: trajet,
        role: isOwner ? 'conducteur' : 'tiers'
      };
    } catch (error) {
      return {
        isOwner: false,
        reason: 'ERREUR_VERIFICATION',
        message: error.message
      };
    }
  }

  /**
   * Vérifie si un utilisateur est propriétaire d'une réservation
   * @param {string} userId - ID de l'utilisateur
   * @param {string} reservationId - ID de la réservation
   * @returns {Object} Résultat de la vérification
   */
  static async checkReservationOwnership(userId, reservationId) {
    try {
      const reservation = await Reservation.findById(reservationId).populate('trajetId');
      
      if (!reservation) {
        return {
          isOwner: false,
          reason: 'RESERVATION_INEXISTANTE',
          message: 'Réservation non trouvée'
        };
      }

      const isPassager = reservation.passagerId.toString() === userId;
      const isConducteur = reservation.trajetId.conducteurId.toString() === userId;
      
      return {
        isOwner: isPassager || isConducteur,
        reservation: reservation,
        role: isPassager ? 'passager' : (isConducteur ? 'conducteur' : 'tiers')
      };
    } catch (error) {
      return {
        isOwner: false,
        reason: 'ERREUR_VERIFICATION',
        message: error.message
      };
    }
  }

  /**
   * Vérifie si un utilisateur participe à un trajet (conducteur ou passager confirmé)
   * @param {string} userId - ID de l'utilisateur
   * @param {string} trajetId - ID du trajet
   * @returns {Object} Résultat de la vérification
   */
  static async checkTrajetParticipation(userId, trajetId) {
    try {
      const trajet = await Trajet.findById(trajetId);
      
      if (!trajet) {
        return {
          isParticipant: false,
          reason: 'TRAJET_INEXISTANT',
          message: 'Trajet non trouvé'
        };
      }

      // Vérifier si l'utilisateur est le conducteur
      if (trajet.conducteurId.toString() === userId) {
        return {
          isParticipant: true,
          trajet: trajet,
          role: 'conducteur'
        };
      }

      // Vérifier si l'utilisateur est un passager confirmé
      const reservation = await Reservation.findOne({
        trajetId: trajetId,
        passagerId: userId,
        statutReservation: STATUT_RESERVATION.CONFIRMEE
      });

      return {
        isParticipant: !!reservation,
        trajet: trajet,
        reservation: reservation,
        role: reservation ? 'passager' : 'tiers'
      };
    } catch (error) {
      return {
        isParticipant: false,
        reason: 'ERREUR_VERIFICATION',
        message: error.message
      };
    }
  }

  // ====================================
  // MÉTHODES DE VÉRIFICATION CONTEXTUELLE
  // ====================================

  /**
   * Vérifie si un utilisateur peut évaluer un autre utilisateur pour un trajet
   * @param {string} evaluateurId - ID de l'évaluateur
   * @param {string} evalueId - ID de l'évalué
   * @param {string} trajetId - ID du trajet
   * @returns {Object} Résultat de la vérification
   */
  static async canEvaluate(evaluateurId, evalueId, trajetId) {
    try {
      // Vérifier que le trajet est terminé
      const trajet = await Trajet.findById(trajetId);
      if (!trajet || trajet.statutTrajet !== STATUT_TRAJET.TERMINE) {
        return {
          canEvaluate: false,
          reason: 'TRAJET_NON_TERMINE',
          message: 'Le trajet doit être terminé pour évaluer'
        };
      }

      // Vérifier la participation de l'évaluateur
      const evaluateurParticipation = await this.checkTrajetParticipation(evaluateurId, trajetId);
      if (!evaluateurParticipation.isParticipant) {
        return {
          canEvaluate: false,
          reason: 'NON_PARTICIPANT',
          message: 'Vous devez avoir participé au trajet pour évaluer'
        };
      }

      // Vérifier la participation de l'évalué
      const evalueParticipation = await this.checkTrajetParticipation(evalueId, trajetId);
      if (!evalueParticipation.isParticipant) {
        return {
          canEvaluate: false,
          reason: 'EVALUE_NON_PARTICIPANT',
          message: 'La personne à évaluer n\'a pas participé au trajet'
        };
      }

      // Vérifier qu'une évaluation n'existe pas déjà
      const evaluationExistante = await Evaluation.findOne({
        trajetId: trajetId,
        evaluateurId: evaluateurId,
        evalueId: evalueId
      });

      if (evaluationExistante) {
        return {
          canEvaluate: false,
          reason: 'EVALUATION_EXISTANTE',
          message: 'Vous avez déjà évalué cette personne pour ce trajet'
        };
      }

      return {
        canEvaluate: true,
        evaluateurRole: evaluateurParticipation.role,
        evalueRole: evalueParticipation.role,
        trajet: trajet
      };
    } catch (error) {
      return {
        canEvaluate: false,
        reason: 'ERREUR_VERIFICATION',
        message: error.message
      };
    }
  }

  /**
   * Vérifie si un utilisateur peut annuler une réservation
   * @param {string} userId - ID de l'utilisateur
   * @param {string} reservationId - ID de la réservation
   * @returns {Object} Résultat de la vérification
   */
  static async canCancelReservation(userId, reservationId) {
    try {
      const reservationCheck = await this.checkReservationOwnership(userId, reservationId);
      
      if (!reservationCheck.isOwner) {
        return {
          canCancel: false,
          reason: 'NON_AUTORISE',
          message: 'Vous ne pouvez annuler que vos propres réservations'
        };
      }

      const reservation = reservationCheck.reservation;
      const trajet = reservation.trajetId;

      // Vérifier le statut de la réservation
      if (reservation.statutReservation === STATUT_RESERVATION.ANNULEE) {
        return {
          canCancel: false,
          reason: 'DEJA_ANNULEE',
          message: 'Cette réservation est déjà annulée'
        };
      }

      if (reservation.statutReservation === STATUT_RESERVATION.TERMINEE) {
        return {
          canCancel: false,
          reason: 'TRAJET_TERMINE',
          message: 'Impossible d\'annuler une réservation pour un trajet terminé'
        };
      }

      // Vérifier le délai d'annulation
      const now = new Date();
      const dateTrajet = new Date(trajet.dateDepart + ' ' + trajet.heureDepart);
      const deuxHeuresAvant = new Date(dateTrajet.getTime() - (2 * 60 * 60 * 1000));

      const isGratuitous = now <= deuxHeuresAvant;

      return {
        canCancel: true,
        reservation: reservation,
        isGratuitous: isGratuitous,
        remainingTime: deuxHeuresAvant - now
      };
    } catch (error) {
      return {
        canCancel: false,
        reason: 'ERREUR_VERIFICATION',
        message: error.message
      };
    }
  }

  /**
   * Vérifie si un utilisateur peut déclencher une alerte d'urgence
   * @param {string} userId - ID de l'utilisateur
   * @param {string} trajetId - ID du trajet (optionnel)
   * @returns {Object} Résultat de la vérification
   */
  static async canTriggerEmergencyAlert(userId, trajetId = null) {
    try {
      const user = await Utilisateur.findById(userId);
      const userStatus = await this.checkUserStatus(user);
      
      if (!userStatus.isValid) {
        return userStatus;
      }

      // Si un trajet est spécifié, vérifier la participation
      if (trajetId) {
        const participation = await this.checkTrajetParticipation(userId, trajetId);
        if (!participation.isParticipant) {
          return {
            canTrigger: false,
            reason: 'NON_PARTICIPANT_TRAJET',
            message: 'Vous devez participer au trajet pour déclencher une alerte'
          };
        }

        // Vérifier que le trajet est en cours
        const trajet = participation.trajet;
        if (trajet.statutTrajet !== STATUT_TRAJET.EN_COURS) {
          return {
            canTrigger: false,
            reason: 'TRAJET_NON_EN_COURS',
            message: 'Le trajet doit être en cours pour déclencher une alerte'
          };
        }
      }

      // Vérifier qu'il n'y a pas d'alerte active récente
      const alerteRecente = await AlerteUrgence.findOne({
        declencheurId: userId,
        statutAlerte: { $in: [STATUT_ALERTE.ACTIVE, STATUT_ALERTE.EN_TRAITEMENT] },
        createdAt: { $gte: new Date(Date.now() - 30 * 60 * 1000) } // 30 minutes
      });

      if (alerteRecente) {
        return {
          canTrigger: false,
          reason: 'ALERTE_ACTIVE',
          message: 'Vous avez déjà une alerte active',
          activeAlert: alerteRecente
        };
      }

      return {
        canTrigger: true,
        user: user
      };
    } catch (error) {
      return {
        canTrigger: false,
        reason: 'ERREUR_VERIFICATION',
        message: error.message
      };
    }
  }

  // ====================================
  // MÉTHODES D'ANALYSE DES PERMISSIONS
  // ====================================

  /**
   * Obtient toutes les actions qu'un utilisateur peut effectuer
   * @param {Array} userPermissions - Permissions de l'utilisateur
   * @returns {Array} Liste des actions autorisées
   */
  static getAuthorizedActions(userPermissions) {
    const authorizedActions = [];
    
    for (const [action, requiredPermissions] of Object.entries(ACTION_PERMISSIONS)) {
      if (this.hasAnyPermission(userPermissions, requiredPermissions)) {
        authorizedActions.push(action);
      }
    }

    return authorizedActions;
  }

  /**
   * Génère un résumé des permissions pour un utilisateur
   * @param {Object} admin - Objet administrateur
   * @returns {Object} Résumé des permissions
   */
  static generatePermissionSummary(admin) {
    const authorizedActions = this.getAuthorizedActions(admin.permissions);
    const roleLevel = this.getRoleLevel(admin.role);
    
    return {
      userId: admin._id,
      role: admin.role,
      roleLevel: roleLevel,
      permissions: admin.permissions,
      authorizedActions: authorizedActions,
      canManageUsers: this.hasPermission(admin.permissions, PERMISSIONS.GESTION_UTILISATEURS),
      canModerate: this.hasPermission(admin.permissions, PERMISSIONS.MODERATION),
      canViewAnalytics: this.hasPermission(admin.permissions, PERMISSIONS.ANALYTICS),
      canManagePayments: this.hasPermission(admin.permissions, PERMISSIONS.GESTION_PAIEMENTS),
      isSupport: this.hasPermission(admin.permissions, PERMISSIONS.SUPPORT_CLIENT),
      hasFullAccess: this.hasPermission(admin.permissions, PERMISSIONS.ALL)
    };
  }
}

// ========================================
// MÉTHODES STATIQUES UTILITAIRES
// ========================================

/**
 * Crée une réponse d'erreur standardisée
 * @param {string} reason - Raison de l'erreur
 * @param {string} message - Message d'erreur
 * @param {Object} additionalData - Données supplémentaires
 * @returns {Object}
 */
const createErrorResponse = (reason, message, additionalData = {}) => {
  return {
    success: false,
    reason: reason,
    message: message,
    code: CODES_ERREUR.AUTHORIZATION_ERROR,
    ...additionalData
  };
};

/**
 * Crée une réponse de succès standardisée
 * @param {Object} data - Données de succès
 * @returns {Object}
 */
const createSuccessResponse = (data = {}) => {
  return {
    success: true,
    ...data
  };
};

// ========================================
// EXPORTS
// ========================================

module.exports = {
  PermissionService,
  ROLE_HIERARCHY,
  DEFAULT_PERMISSIONS_BY_ROLE,
  ACTION_PERMISSIONS,
  createErrorResponse,
  createSuccessResponse
};