// middlewares/authMiddleware.js - Version corrigée
const jwt = require('jsonwebtoken');
const User = require('../../models/Utilisateur');
//const AppError = require('../../utils/constants/errorConstants');
const { logger } = require('../../utils/logger');

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
    const user = await User.findById(decoded.userId)
      .select('-motDePasse -tokenResetMotDePasse -expirationTokenReset -tokenConfirmationEmail -expirationTokenConfirmation -codeSMS -expirationCodeSMS');
    
    if (!user) {
      logger.warn('Token valide mais utilisateur introuvable', { 
        tokenUserId: decoded.userId,
        ip: req.ip 
      });
      return res.status(401).json({
        success: false,
        message: 'Utilisateur non trouvé.',
        code: 'USER_NOT_FOUND'
      });
    }

    // 5. Vérifier le statut du compte
    const statutAutorise = user.peutSeConnecter();
    if (!statutAutorise.autorise) {
      logger.warn('Accès refusé - Compte désactivé', {
        event: 'account_disabled',
        userId: user._id,
        statut: user.statutCompte,
        raison: statutAutorise.raison,
        ip: req.ip,
        endpoint: `${req.method} ${req.originalUrl}`
      });
      
      // Retourner des erreurs spécifiques selon le statut
      let message = '';
      let code = '';
      
      switch (user.statutCompte) {
        case 'BLOQUE':
          message = 'Votre compte a été bloqué définitivement.';
          code = 'ACCOUNT_BLOCKED';
          break;
        case 'SUSPENDU':
          message = 'Votre compte est temporairement suspendu.';
          code = 'ACCOUNT_SUSPENDED';
          break;
        case 'EN_ATTENTE_VERIFICATION':
          message = 'Votre compte n\'est pas encore vérifié. Vérifiez votre email ou SMS.';
          code = 'ACCOUNT_NOT_VERIFIED';
          break;
        default:
          if (statutAutorise.raison === 'Compte temporairement bloqué') {
            message = 'Votre compte est temporairement bloqué suite à plusieurs tentatives de connexion échouées.';
            code = 'ACCOUNT_TEMP_BLOCKED';
          } else {
            message = 'Votre compte est désactivé.';
            code = 'ACCOUNT_DISABLED';
          }
      }

      return res.status(403).json({
        success: false,
        message,
        code,
        raison: statutAutorise.raison,
        deblocageA: statutAutorise.deblocageA || null
      });
    }

    // 6. Ajouter les informations utilisateur à la requête
    req.user = {
      id: user._id, // alias pour compatibilité avec le code existant
      userId: user._id,
      email: user.email,
      telephone: user.telephone,
      role: user.role,
      nom: user.nom,
      prenom: user.prenom,
      statutCompte: user.statutCompte,
      estVerifie: user.estVerifie
    };

    // 7. Ajouter l'objet utilisateur complet (optionnel)
    req.userProfile = user;

    next();

  } catch (error) {
    logger.error('Erreur middleware authentification:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de l\'authentification',
      code: 'AUTH_SERVER_ERROR'
    });
  }
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
      const user = await User.findById(decoded.userId)
        .select('-motDePasse -tokenResetMotDePasse -expirationTokenReset -tokenConfirmationEmail -expirationTokenConfirmation -codeSMS -expirationCodeSMS');
      
      if (user) {
        const statutAutorise = user.peutSeConnecter();
        if (statutAutorise.autorise) {
          req.user = {
            id: user._id,
            userId: user._id,
            email: user.email,
            telephone: user.telephone,
            role: user.role,
            nom: user.nom,
            prenom: user.prenom,
            statutCompte: user.statutCompte,
            estVerifie: user.estVerifie
          };
          req.userProfile = user;
        } else {
          req.user = null;
          req.userProfile = null;
        }
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
    logger.error('Erreur dans optionalAuthMiddleware:', error);
    // En cas d'erreur, continuer sans authentification
    req.user = null;
    req.userProfile = null;
    return next();
  }
};

/**
 * Middleware pour vérifier les droits administrateur
 */
const adminMiddleware = async (req, res, next) => {
  try {
    // D'abord, vérifier l'authentification
    await authMiddleware(req, res, () => {
      // Vérifier le rôle admin
      if (req.user.role !== 'admin') {
        logger.warn('Tentative d\'accès admin non autorisée', {
          userId: req.user.userId,
          role: req.user.role,
          endpoint: `${req.method} ${req.originalUrl}`,
          ip: req.ip
        });
        
        return res.status(403).json({
          success: false,
          message: 'Accès refusé. Droits administrateur requis.',
          code: 'ADMIN_REQUIRED'
        });
      }
      next();
    });
  } catch (error) {
    logger.error('Erreur dans adminMiddleware:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la vérification des droits admin',
      code: 'ADMIN_CHECK_ERROR'
    });
  }
};

/**
 * Middleware pour vérifier les rôles spécifiques
 */
const roleMiddleware = (rolesAutorises) => {
  return async (req, res, next) => {
    try {
      // D'abord, vérifier l'authentification
      await authMiddleware(req, res, () => {
        // Vérifier si le rôle utilisateur est dans la liste autorisée
        if (!rolesAutorises.includes(req.user.role)) {
          logger.warn('Tentative d\'accès avec rôle non autorisé', {
            userId: req.user.userId,
            roleUtilisateur: req.user.role,
            rolesAutorises,
            endpoint: `${req.method} ${req.originalUrl}`,
            ip: req.ip
          });
          
          return res.status(403).json({
            success: false,
            message: `Accès refusé. Rôles autorisés: ${rolesAutorises.join(', ')}`,
            code: 'ROLE_NOT_AUTHORIZED'
          });
        }
        next();
      });
    } catch (error) {
      logger.error('Erreur dans roleMiddleware:', error);
      return res.status(500).json({
        success: false,
        message: 'Erreur serveur lors de la vérification des rôles',
        code: 'ROLE_CHECK_ERROR'
      });
    }
  };
};

/**
 * Middleware pour vérifier la propriété des données
 */
const ownershipMiddleware = async (req, res, next) => {
  try {
    const targetUserId = req.params.userId || req.params.id;
    
    // Vérifier que l'utilisateur accède à ses propres données ou est admin
    if (req.user.userId.toString() !== targetUserId && req.user.role !== 'admin') {
      logger.warn('Tentative d\'accès à des données non autorisées', {
        userId: req.user.userId,
        targetUserId,
        endpoint: `${req.method} ${req.originalUrl}`,
        ip: req.ip
      });
      
      return res.status(403).json({
        success: false,
        message: 'Accès refusé. Vous ne pouvez accéder qu\'à vos propres données.',
        code: 'OWNERSHIP_REQUIRED'
      });
    }
    
    next();
  } catch (error) {
    logger.error('Erreur dans ownershipMiddleware:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la vérification des droits',
      code: 'OWNERSHIP_CHECK_ERROR'
    });
  }
};

/**
 * Middleware pour vérifier si l'utilisateur peut agir comme conducteur
 */
const conducteurMiddleware = async (req, res, next) => {
  try {
    // Vérifier que l'utilisateur est authentifié
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentification requise',
        code: 'AUTH_REQUIRED'
      });
    }

    // Vérifier le rôle conducteur
    if (!['conducteur', 'les_deux'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Accès refusé. Vous devez être enregistré comme conducteur.',
        code: 'DRIVER_ROLE_REQUIRED'
      });
    }

    // Vérifier si le compte est vérifié
    if (!req.user.estVerifie) {
      return res.status(403).json({
        success: false,
        message: 'Votre compte doit être vérifié pour agir comme conducteur.',
        code: 'ACCOUNT_VERIFICATION_REQUIRED'
      });
    }

    next();
  } catch (error) {
    logger.error('Erreur dans conducteurMiddleware:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la vérification des droits conducteur',
      code: 'DRIVER_CHECK_ERROR'
    });
  }
};

/**
 * Middleware pour vérifier si l'utilisateur peut agir comme passager
 */
const passagerMiddleware = async (req, res, next) => {
  try {
    // Vérifier que l'utilisateur est authentifié
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentification requise',
        code: 'AUTH_REQUIRED'
      });
    }

    // Vérifier le rôle passager
    if (!['passager', 'les_deux'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Accès refusé. Vous devez être enregistré comme passager.',
        code: 'PASSENGER_ROLE_REQUIRED'
      });
    }

    next();
  } catch (error) {
    logger.error('Erreur dans passagerMiddleware:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la vérification des droits passager',
      code: 'PASSENGER_CHECK_ERROR'
    });
  }
};

/**
 * Middleware de logging des accès
 */
const logAuthMiddleware = (req, res, next) => {
  if (req.user) {
    logger.info(`Accès authentifié: ${req.method} ${req.originalUrl}`, {
      userId: req.user.userId,
      role: req.user.role,
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
  } else {
    logger.info(`Accès public: ${req.method} ${req.originalUrl}`, {
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
  }
  next();
};

/**
 * Middleware pour vérifier si le compte covoiturage est actif
 */
const compteCovoiturageActifMiddleware = async (req, res, next) => {
  try {
    if (!req.userProfile) {
      return res.status(401).json({
        success: false,
        message: 'Profil utilisateur requis',
        code: 'PROFILE_REQUIRED'
      });
    }

    // Vérifier si le compte covoiturage est configuré et actif
    if (!req.userProfile.compteCovoiturage) {
      return res.status(403).json({
        success: false,
        message: 'Compte covoiturage non configuré',
        code: 'CARPOOLING_ACCOUNT_NOT_CONFIGURED'
      });
    }

    // Pour les conducteurs, vérifier des conditions supplémentaires
    if (['conducteur', 'les_deux'].includes(req.user.role)) {
      const capaciteAcceptation = req.userProfile.peutAccepterCourse();
      if (!capaciteAcceptation.autorise) {
        return res.status(403).json({
          success: false,
          message: capaciteAcceptation.raison,
          code: 'CANNOT_ACCEPT_RIDES',
          modesAcceptes: capaciteAcceptation.modesAcceptes || []
        });
      }
    }

    next();
  } catch (error) {
    logger.error('Erreur dans compteCovoiturageActifMiddleware:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la vérification du compte covoiturage',
      code: 'CARPOOLING_CHECK_ERROR'
    });
  }
};

module.exports = {
  authMiddleware,
  adminMiddleware,
  roleMiddleware,
  optionalAuthMiddleware,
  ownershipMiddleware,
  conducteurMiddleware,
  passagerMiddleware,
  logAuthMiddleware,
  compteCovoiturageActifMiddleware,
  
  // Alias pour compatibilité
  protect: authMiddleware,
  requireAuth: authMiddleware,
  isAdmin: adminMiddleware,
  checkRole: roleMiddleware,
  requireDriver: conducteurMiddleware,
  requirePassenger: passagerMiddleware
};