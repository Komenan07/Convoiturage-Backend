// middlewares/adminMiddleware.js
const Administrateur = require('../models/Administrateur');
const AppError = require('../utils/AppError');
const { securityLogger } = require('../utils/logger');

/**
 * Middleware de vérification des droits administrateur complet
 * Vérifie que l'utilisateur authentifié est un administrateur actif avec les permissions appropriées
 */
const adminMiddleware = async (req, res, next) => {
  try {
    // 1. Vérifier que l'authentification a déjà été faite
    if (!req.user || !req.user.id) {
      securityLogger.warn('Tentative d\'accès admin sans authentification préalable', {
        event: 'admin_access_no_auth',
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        endpoint: `${req.method} ${req.originalUrl}`
      });

      return res.status(401).json({
        success: false,
        message: 'Authentification requise pour accéder aux ressources administrateur',
        code: 'AUTH_REQUIRED'
      });
    }

    // 2. Chercher l'administrateur dans la base de données avec toutes les informations nécessaires
    const admin = await Administrateur.findById(req.user.id)
      .select('-motDePasse -refreshToken -tokenReinitialisation -historiqueMdpChanges')
      .populate('createdBy', 'nom prenom email')
      .populate('modifiedBy', 'nom prenom email');

    if (!admin) {
      securityLogger.warn('Tentative d\'accès admin sans compte administrateur valide', {
        event: 'admin_access_denied',
        userId: req.user.id,
        userEmail: req.user.email,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        endpoint: `${req.method} ${req.originalUrl}`
      });

      return res.status(403).json({
        success: false,
        message: 'Accès refusé. Compte administrateur non trouvé.',
        code: 'ADMIN_ACCOUNT_NOT_FOUND',
        userId: req.user.id
      });
    }

    // 3. Vérifier le statut du compte administrateur
    if (admin.statutCompte !== 'ACTIF') {
      securityLogger.warn('Tentative d\'accès avec compte admin inactif', {
        event: 'admin_account_inactive',
        adminId: admin._id,
        statutCompte: admin.statutCompte,
        nomComplet: admin.nomComplet,
        ip: req.ip,
        endpoint: `${req.method} ${req.originalUrl}`
      });

      const context = {
        adminId: admin._id,
        statut: admin.statutCompte,
        nomComplet: admin.nomComplet
      };

      // Messages spécifiques selon le statut
      if (admin.statutCompte === 'SUSPENDU') {
        return next(AppError.accountSuspended(context));
      } else if (admin.statutCompte === 'INACTIF') {
        return next(AppError.accountDisabled(context));
      } else if (admin.statutCompte === 'EN_ATTENTE') {
        return res.status(403).json({
          success: false,
          message: 'Votre compte administrateur est en attente d\'activation.',
          code: 'ADMIN_PENDING_ACTIVATION',
          statut: admin.statutCompte
        });
      }

      return res.status(403).json({
        success: false,
        message: 'Compte administrateur non actif.',
        code: 'ADMIN_ACCOUNT_INACTIVE',
        statut: admin.statutCompte
      });
    }

    // 4. Vérifier si le compte est verrouillé temporairement
    if (admin.estVerrouille) {
      securityLogger.warn('Tentative d\'accès avec compte admin verrouillé', {
        event: 'admin_account_locked',
        adminId: admin._id,
        nomComplet: admin.nomComplet,
        tentativesEchouees: admin.tentativesConnexionEchouees,
        dateVerrouillage: admin.dateVerrouillagCompte,
        ip: req.ip,
        endpoint: `${req.method} ${req.originalUrl}`
      });

      return res.status(423).json({
        success: false,
        message: 'Compte temporairement verrouillé suite à plusieurs tentatives de connexion échouées. Veuillez réessayer dans 30 minutes.',
        code: 'ADMIN_ACCOUNT_LOCKED',
        tentativesEchouees: admin.tentativesConnexionEchouees,
        dateVerrouillage: admin.dateVerrouillagCompte
      });
    }

    // 5. Vérifier la disponibilité de l'admin (si requis pour les actions critiques)
    if (req.method !== 'GET' && !admin.estDisponible) {
      securityLogger.warn('Tentative d\'action critique par admin non disponible', {
        event: 'admin_not_available',
        adminId: admin._id,
        nomComplet: admin.nomComplet,
        disponibilite: admin.disponibilite.statut,
        ip: req.ip,
        endpoint: `${req.method} ${req.originalUrl}`
      });

      return res.status(423).json({
        success: false,
        message: 'Action non autorisée. Votre statut de disponibilité ne permet pas cette action.',
        code: 'ADMIN_NOT_AVAILABLE',
        disponibilite: admin.disponibilite.statut,
        statutRequis: 'EN_LIGNE'
      });
    }

    // 6. Ajouter les informations administrateur complètes à la requête
    req.admin = {
      // Identité
      id: admin._id,
      _id: admin._id,
      nomComplet: admin.nomComplet,
      email: admin.email,
      telephone: admin.telephone,
      photo: admin.photo,
      
      // Localisation
      ville: admin.ville,
      commune: admin.commune,
      langue: admin.langue,
      fuseauHoraire: admin.fuseauHoraire,
      
      // Rôles et permissions
      role: admin.role,
      permissions: admin.permissions || [],
      regionResponsable: admin.regionResponsable || [],
      
      // Statut et activité
      statutCompte: admin.statutCompte,
      disponibilite: admin.disponibilite,
      derniereConnexion: admin.derniereConnexion,
      nombreConnexions: admin.nombreConnexions,
      
      // Statistiques
      statistiques: admin.statistiques || {},
      
      // Métadonnées
      createdBy: admin.createdBy,
      modifiedBy: admin.modifiedBy,
      tags: admin.tags || [],
      
      // Flags utiles
      estSuperAdmin: admin.estSuperAdmin,
      estActif: admin.estActif,
      estVerrouille: admin.estVerrouille,
      estDisponible: admin.estDisponible
    };

    // 7. Ajouter l'objet administrateur complet (pour les méthodes)
    req.adminProfile = admin;

    // 8. Logger l'accès admin réussi
    securityLogger.info('Accès administrateur autorisé', {
      event: 'admin_access_granted',
      adminId: admin._id,
      nomComplet: admin.nomComplet,
      role: admin.role,
      permissions: admin.permissions,
      ip: req.ip,
      endpoint: `${req.method} ${req.originalUrl}`,
      userAgent: req.get('User-Agent')
    });

    next();

  } catch (error) {
    securityLogger.error('Erreur critique dans adminMiddleware', {
      event: 'admin_middleware_critical_error',
      userId: req.user ? req.user.id : 'unknown',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      ip: req.ip,
      endpoint: `${req.method} ${req.originalUrl}`
    });

    return next(AppError.serverError('Erreur lors de la vérification des droits administrateur', { 
      originalError: error.message 
    }));
  }
};

/**
 * Middleware de vérification des rôles administrateur
 * @param {Array} rolesAutorises - Rôles autorisés ['SUPER_ADMIN', 'ADMIN_REGIONAL', etc.]
 */
const requireAdminRole = (rolesAutorises = []) => {
  return (req, res, next) => {
    try {
      if (!req.admin) {
        return res.status(401).json({
          success: false,
          message: 'Authentification administrateur requise',
          code: 'ADMIN_AUTH_REQUIRED'
        });
      }

      // Si aucun rôle spécifié, tout admin authentifié peut accéder
      if (rolesAutorises.length === 0) {
        return next();
      }

      // Vérifier si l'admin a un des rôles autorisés
      if (!rolesAutorises.includes(req.admin.role)) {
        securityLogger.warn('Tentative d\'accès avec rôle admin insuffisant', {
          event: 'admin_role_insufficient',
          adminId: req.admin.id,
          roleActuel: req.admin.role,
          rolesRequis: rolesAutorises,
          ip: req.ip,
          endpoint: `${req.method} ${req.originalUrl}`
        });

        return res.status(403).json({
          success: false,
          message: `Accès refusé. Rôle requis: ${rolesAutorises.join(', ')}`,
          code: 'ADMIN_ROLE_INSUFFICIENT',
          roleActuel: req.admin.role,
          rolesRequis: rolesAutorises,
          nomComplet: req.admin.nomComplet
        });
      }

      next();
    } catch (error) {
      securityLogger.error('Erreur dans requireAdminRole', {
        event: 'admin_role_middleware_error',
        adminId: req.admin ? req.admin.id : 'unknown',
        error: error.message
      });

      return next(AppError.serverError('Erreur lors de la vérification du rôle administrateur'));
    }
  };
};

/**
 * Middleware de vérification des permissions administrateur
 * @param {Array} permissionsRequises - Permissions requises ['GESTION_UTILISATEURS', 'VALIDATION_CONDUCTEURS', etc.]
 */
const requireAdminPermission = (permissionsRequises = []) => {
  return (req, res, next) => {
    try {
      if (!req.admin) {
        return res.status(401).json({
          success: false,
          message: 'Authentification administrateur requise',
          code: 'ADMIN_AUTH_REQUIRED'
        });
      }

      // Si l'admin a la permission ALL, il passe directement
      if (req.admin.permissions.includes('ALL')) {
        return next();
      }

      // Vérifier si l'admin a toutes les permissions requises
      const permissionsManquantes = permissionsRequises.filter(
        permission => !req.admin.permissions.includes(permission)
      );

      if (permissionsManquantes.length > 0) {
        securityLogger.warn('Tentative d\'accès avec permissions admin insuffisantes', {
          event: 'admin_permissions_insufficient',
          adminId: req.admin.id,
          nomComplet: req.admin.nomComplet,
          permissionsActuelles: req.admin.permissions,
          permissionsRequis: permissionsRequises,
          permissionsManquantes: permissionsManquantes,
          ip: req.ip,
          endpoint: `${req.method} ${req.originalUrl}`
        });

        return res.status(403).json({
          success: false,
          message: 'Permissions insuffisantes pour cette action',
          code: 'ADMIN_PERMISSIONS_INSUFFICIENT',
          permissionsManquantes: permissionsManquantes,
          permissionsActuelles: req.admin.permissions,
          permissionsRequis: permissionsRequises
        });
      }

      next();
    } catch (error) {
      securityLogger.error('Erreur dans requireAdminPermission', {
        event: 'admin_permission_middleware_error',
        adminId: req.admin ? req.admin.id : 'unknown',
        error: error.message
      });

      return next(AppError.serverError('Erreur lors de la vérification des permissions administrateur'));
    }
  };
};

/**
 * Middleware de vérification de la région d'action
 * @param {String} regionRequise - Région requise pour l'action
 */
const requireAdminRegion = (regionRequise = null) => {
  return (req, res, next) => {
    try {
      if (!req.admin) {
        return res.status(401).json({
          success: false,
          message: 'Authentification administrateur requise',
          code: 'ADMIN_AUTH_REQUIRED'
        });
      }

      // Si pas de région spécifiée ou admin SUPER_ADMIN, autoriser
      if (!regionRequise || req.admin.estSuperAdmin) {
        return next();
      }

      // Vérifier si l'admin peut agir dans cette région
      const peutAgir = req.adminProfile.peutAgirDansRegion(regionRequise);
      
      if (!peutAgir) {
        securityLogger.warn('Tentative d\'action hors région autorisée', {
          event: 'admin_region_unauthorized',
          adminId: req.admin.id,
          nomComplet: req.admin.nomComplet,
          regionRequise: regionRequise,
          regionsAutorisees: req.admin.regionResponsable,
          ip: req.ip,
          endpoint: `${req.method} ${req.originalUrl}`
        });

        return res.status(403).json({
          success: false,
          message: `Action non autorisée dans la région: ${regionRequise}`,
          code: 'ADMIN_REGION_UNAUTHORIZED',
          regionRequise: regionRequise,
          regionsAutorisees: req.admin.regionResponsable
        });
      }

      next();
    } catch (error) {
      securityLogger.error('Erreur dans requireAdminRegion', {
        event: 'admin_region_middleware_error',
        adminId: req.admin ? req.admin.id : 'unknown',
        error: error.message
      });

      return next(AppError.serverError('Erreur lors de la vérification de la région administrateur'));
    }
  };
};

/**
 * Middleware pour vérifier la disponibilité en temps réel
 * Vérifie si l'admin est disponible selon ses horaires configurés
 */
const requireAdminAvailable = async (req, res, next) => {
  try {
    if (!req.adminProfile) {
      return res.status(401).json({
        success: false,
        message: 'Authentification administrateur requise',
        code: 'ADMIN_AUTH_REQUIRED'
      });
    }

    // Vérifier la disponibilité en temps réel
    const estDisponible = req.adminProfile.estDisponibleMaintenant();
    
    if (!estDisponible) {
      securityLogger.warn('Tentative d\'action par admin hors horaire', {
        event: 'admin_out_of_schedule',
        adminId: req.admin.id,
        nomComplet: req.admin.nomComplet,
        disponibilite: req.admin.disponibilite,
        ip: req.ip,
        endpoint: `${req.method} ${req.originalUrl}`
      });

      return res.status(423).json({
        success: false,
        message: 'Action non autorisée en dehors de vos heures de disponibilité configurées',
        code: 'ADMIN_OUT_OF_SCHEDULE',
        disponibilite: req.admin.disponibilite
      });
    }

    next();
  } catch (error) {
    securityLogger.error('Erreur dans requireAdminAvailable', {
      event: 'admin_availability_middleware_error',
      adminId: req.admin ? req.admin.id : 'unknown',
      error: error.message
    });

    return next(AppError.serverError('Erreur lors de la vérification de la disponibilité administrateur'));
  }
};

/**
 * Middleware pour les actions critiques (suppression, suspension, etc.)
 */
const requireAdminForCriticalAction = (req, res, next) => {
  try {
    if (!req.admin) {
      return res.status(401).json({
        success: false,
        message: 'Authentification administrateur requise pour cette action critique',
        code: 'ADMIN_AUTH_REQUIRED_CRITICAL'
      });
    }

    // Pour les actions critiques, nécessite au moins ADMIN_REGIONAL
    const rolesAutorisesCritiques = ['SUPER_ADMIN', 'ADMIN_REGIONAL'];
    
    if (!rolesAutorisesCritiques.includes(req.admin.role)) {
      securityLogger.warn('Tentative d\'action critique avec rôle insuffisant', {
        event: 'admin_critical_action_denied',
        adminId: req.admin.id,
        nomComplet: req.admin.nomComplet,
        roleActuel: req.admin.role,
        action: `${req.method} ${req.originalUrl}`,
        ip: req.ip
      });

      return res.status(403).json({
        success: false,
        message: 'Rôle insuffisant pour cette action critique',
        code: 'ADMIN_ROLE_INSUFFICIENT_CRITICAL',
        roleActuel: req.admin.role,
        rolesRequis: rolesAutorisesCritiques
      });
    }

    // Logger l'action critique
    securityLogger.info('Action critique administrateur initiée', {
      event: 'admin_critical_action_initiated',
      adminId: req.admin.id,
      nomComplet: req.admin.nomComplet,
      role: req.admin.role,
      action: `${req.method} ${req.originalUrl}`,
      ip: req.ip,
      timestamp: new Date().toISOString()
    });

    next();
  } catch (error) {
    securityLogger.error('Erreur dans requireAdminForCriticalAction', {
      event: 'admin_critical_action_middleware_error',
      adminId: req.admin ? req.admin.id : 'unknown',
      error: error.message
    });

    return next(AppError.serverError('Erreur lors de la vérification des droits pour action critique'));
  }
};

/**
 * Middleware pour enregistrer les actions d'administration
 * À placer après l'action pour capturer la réponse
 */
const logAdminAction = (actionType, metadata = {}) => {
  return async (req, res, next) => {
    const originalSend = res.send;
    
    res.send = function(data) {
      // Enregistrer l'action après que la réponse a été envoyée
      if (req.adminProfile && res.statusCode >= 200 && res.statusCode < 300) {
        try {
          // Récupérer l'ID de la cible si disponible
          const cibleId = req.params.id || req.body.id || metadata.cibleId;
          const onModel = metadata.onModel || determinerModeleCible(req.originalUrl);
          
          req.adminProfile.enregistrerAction(
            actionType,
            cibleId,
            onModel,
            metadata.details || `Action: ${req.method} ${req.originalUrl}`,
            {
              ...metadata,
              method: req.method,
              endpoint: req.originalUrl,
              statusCode: res.statusCode,
              ip: req.ip
            },
            req.ip
          ).catch(err => {
            securityLogger.error('Erreur lors de l\'enregistrement de l\'action admin', {
              event: 'admin_action_log_failed',
              adminId: req.adminProfile._id,
              actionType: actionType,
              error: err.message
            });
          });
        } catch (error) {
          securityLogger.error('Erreur dans logAdminAction', {
            event: 'admin_action_middleware_error',
            adminId: req.adminProfile ? req.adminProfile._id : 'unknown',
            error: error.message
          });
        }
      }
      
      originalSend.call(this, data);
    };
    
    next();
  };
};

// Fonction utilitaire pour déterminer le modèle cible basé sur l'URL
function determinerModeleCible(url) {
  if (url.includes('/utilisateurs/')) return 'Utilisateur';
  if (url.includes('/vehicules/')) return 'Vehicule';
  if (url.includes('/trajets/')) return 'Trajet';
  if (url.includes('/reservations/')) return 'Reservation';
  if (url.includes('/signalements/')) return 'Signalement';
  if (url.includes('/transactions/')) return 'Transaction';
  if (url.includes('/admins/')) return 'Administrateur';
  return 'Autre';
}

/**
 * Middleware pour vérifier l'accès aux données régionales
 */
const requireRegionalAccess = (req, res, next) => {
  try {
    if (!req.admin) {
      return res.status(401).json({
        success: false,
        message: 'Authentification administrateur requise',
        code: 'ADMIN_AUTH_REQUIRED'
      });
    }

    // Si SUPER_ADMIN, accès complet
    if (req.admin.estSuperAdmin) {
      return next();
    }

    // Vérifier si la requête concerne une région spécifique
    const regionRequise = req.query.region || req.body.region || req.params.region;
    
    if (regionRequise && regionRequise !== 'Toute la CI') {
      const peutAcceder = req.adminProfile.peutAgirDansRegion(regionRequise);
      
      if (!peutAcceder) {
        return res.status(403).json({
          success: false,
          message: `Accès refusé à la région: ${regionRequise}`,
          code: 'REGIONAL_ACCESS_DENIED',
          regionRequise: regionRequise,
          regionsAutorisees: req.admin.regionResponsable
        });
      }
    }

    next();
  } catch (error) {
    securityLogger.error('Erreur dans requireRegionalAccess', {
      event: 'regional_access_middleware_error',
      adminId: req.admin ? req.admin.id : 'unknown',
      error: error.message
    });

    return next(AppError.serverError('Erreur lors de la vérification de l\'accès régional'));
  }
};

module.exports = {
  adminMiddleware,
  requireAdminRole,
  requireAdminPermission,
  requireAdminRegion,
  requireAdminAvailable,
  requireAdminForCriticalAction,
  logAdminAction,
  requireRegionalAccess
};