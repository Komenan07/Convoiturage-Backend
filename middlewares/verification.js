// middleware/verification.js
// Middleware complet pour le système de vérification

const User = require('../models/Utilisateur');
const { logger } = require('../utils/logger');
const AppError = require('../utils/AppError');

/**
 * Vérifier si l'utilisateur a un document d'identité soumis
 */
const hasSubmittedDocument = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    
    const user = await User.findById(userId).select('documentIdentite');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    if (!user.documentIdentite) {
      return res.status(403).json({
        success: false,
        message: 'Aucun document d\'identité soumis',
        code: 'DOCUMENT_NOT_SUBMITTED',
        redirectTo: '/verification/submit'
      });
    }

    req.userDocument = user.documentIdentite;
    next();

  } catch (error) {
    logger.error('Erreur vérification document soumis:', error);
    return next(AppError.serverError('Erreur de vérification du document'));
  }
};

/**
 * Vérifier si l'utilisateur est vérifié (document approuvé)
 */
const isVerified = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    
    const user = await User.findById(userId).select('documentIdentite');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    if (!user.documentIdentite || user.documentIdentite.statutVerification !== 'VERIFIE') {
      return res.status(403).json({
        success: false,
        message: 'Vérification d\'identité requise',
        code: 'VERIFICATION_REQUIRED',
        currentStatus: user.documentIdentite?.statutVerification || 'NOT_SUBMITTED',
        redirectTo: '/verification'
      });
    }

    // Vérifier si la vérification n'est pas expirée (2 ans)
    const dateVerification = new Date(user.documentIdentite.dateVerification);
    const maintenant = new Date();
    const deuxAns = 2 * 365 * 24 * 60 * 60 * 1000; // 2 ans en millisecondes

    if (maintenant - dateVerification > deuxAns) {
      return res.status(403).json({
        success: false,
        message: 'Vérification expirée, renouvellement requis',
        code: 'VERIFICATION_EXPIRED',
        verificationDate: user.documentIdentite.dateVerification,
        redirectTo: '/verification/renew'
      });
    }

    req.userDocument = user.documentIdentite;
    next();

  } catch (error) {
    logger.error('Erreur vérification statut:', error);
    return next(AppError.serverError('Erreur de vérification du statut'));
  }
};

/**
 * Middleware optionnel - permet l'accès mais ajoute les infos de vérification
 */
const checkVerificationStatus = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    
    const user = await User.findById(userId).select('documentIdentite');
    
    if (user && user.documentIdentite) {
      req.verificationStatus = {
        hasDocument: true,
        status: user.documentIdentite.statutVerification,
        verificationDate: user.documentIdentite.dateVerification,
        isVerified: user.documentIdentite.statutVerification === 'VERIFIE',
        isPending: user.documentIdentite.statutVerification === 'EN_ATTENTE',
        isRejected: user.documentIdentite.statutVerification === 'REJETE'
      };

      // Vérifier expiration si vérifié
      if (user.documentIdentite.statutVerification === 'VERIFIE') {
        const dateVerification = new Date(user.documentIdentite.dateVerification);
        const maintenant = new Date();
        const deuxAns = 2 * 365 * 24 * 60 * 60 * 1000;
        
        req.verificationStatus.isExpired = (maintenant - dateVerification > deuxAns);
      }
    } else {
      req.verificationStatus = {
        hasDocument: false,
        status: 'NOT_SUBMITTED',
        isVerified: false,
        isPending: false,
        isRejected: false,
        isExpired: false
      };
    }

    next();

  } catch (error) {
    logger.error('Erreur check statut vérification:', error);
    req.verificationStatus = {
      hasDocument: false,
      status: 'ERROR',
      error: true
    };
    next();
  }
};

/**
 * Vérifier les permissions admin pour les actions de vérification
 */
const canManageVerifications = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const userRole = req.user.role;

    // Vérifier le rôle admin/moderateur
    if (!['ADMIN', 'MODERATEUR'].includes(userRole)) {
      return res.status(403).json({
        success: false,
        message: 'Permissions insuffisantes pour gérer les vérifications',
        code: 'INSUFFICIENT_PERMISSIONS'
      });
    }

    // Log de l'action admin
    logger.info('Action admin vérification', {
      adminId: userId,
      adminRole: userRole,
      action: req.method + ' ' + req.originalUrl,
      ip: req.ip
    });

    next();

  } catch (error) {
    logger.error('Erreur vérification permissions admin:', error);
    return next(AppError.serverError('Erreur de vérification des permissions'));
  }
};

/**
 * Middleware pour limiter les soumissions répétées
 */
const limitDocumentSubmissions = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    
    const user = await User.findById(userId).select('documentIdentite historiqueStatuts');
    
    if (user && user.documentIdentite) {
      // Si en attente, bloquer nouvelle soumission
      if (user.documentIdentite.statutVerification === 'EN_ATTENTE') {
        return res.status(429).json({
          success: false,
          message: 'Un document est déjà en cours de vérification',
          code: 'SUBMISSION_PENDING',
          submissionDate: user.documentIdentite.dateUpload
        });
      }

      // Limiter les soumissions après rejet (max 3 par jour)
      if (user.documentIdentite.statutVerification === 'REJETE') {
        const maintenant = new Date();
        const il24h = new Date(maintenant.getTime() - 24 * 60 * 60 * 1000);

        const soumissionsRecentes = user.historiqueStatuts.filter(statut => 
          statut.dateModification > il24h && 
          statut.nouveauStatut === 'EN_ATTENTE' &&
          statut.raison.includes('soumission')
        ).length;

        if (soumissionsRecentes >= 3) {
          return res.status(429).json({
            success: false,
            message: 'Limite de soumissions atteinte (3 par 24h)',
            code: 'SUBMISSION_LIMIT_REACHED',
            nextAllowedSubmission: new Date(maintenant.getTime() + 24 * 60 * 60 * 1000)
          });
        }
      }
    }

    next();

  } catch (error) {
    logger.error('Erreur limitation soumissions:', error);
    return next(AppError.serverError('Erreur de vérification des limitations'));
  }
};

/**
 * Valider les données de document d'identité
 */
const validateDocumentData = (req, res, next) => {
  try {
    const { type, numero, dateExpiration, photoDocument } = req.body;

    const errors = [];

    // Validation du type
    const typesValides = ['CNI', 'PASSEPORT', 'PERMIS_CONDUIRE'];
    if (!type || !typesValides.includes(type)) {
      errors.push('Type de document invalide');
    }

    // Validation du numéro
    if (!numero || numero.trim().length < 5) {
      errors.push('Numéro de document invalide (minimum 5 caractères)');
    }

    // Validation de la date d'expiration
    if (dateExpiration) {
      const dateExp = new Date(dateExpiration);
      const maintenant = new Date();
      
      if (dateExp <= maintenant) {
        errors.push('Le document ne doit pas être expiré');
      }
    }

    // Validation de la photo
    if (!photoDocument) {
      errors.push('Photo du document requise');
    } else {
      // Vérifier le format base64 ou URL
      const isBase64 = photoDocument.startsWith('data:image/');
      const isUrl = photoDocument.startsWith('http');
      
      if (!isBase64 && !isUrl) {
        errors.push('Format de photo invalide');
      }

      // Limiter la taille si base64 (ex: 5MB)
      if (isBase64 && photoDocument.length > 5 * 1024 * 1024 * 4/3) {
        errors.push('Taille de photo trop importante (max 5MB)');
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Données de document invalides',
        errors: errors
      });
    }

    next();

  } catch (error) {
    logger.error('Erreur validation document:', error);
    return next(AppError.serverError('Erreur de validation'));
  }
};

/**
 * Middleware pour vérifier l'accès aux fonctionnalités premium
 */
const requireVerificationForPremium = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    
    const user = await User.findById(userId).select('documentIdentite');
    
    if (!user || 
        !user.documentIdentite || 
        user.documentIdentite.statutVerification !== 'VERIFIE') {
      
      return res.status(403).json({
        success: false,
        message: 'Fonctionnalité réservée aux utilisateurs vérifiés',
        code: 'VERIFICATION_REQUIRED_PREMIUM',
        benefits: [
          'Accès aux trajets premium',
          'Commissions réduites',
          'Support prioritaire',
          'Fonctionnalités avancées'
        ],
        redirectTo: '/verification'
      });
    }

    next();

  } catch (error) {
    logger.error('Erreur vérification premium:', error);
    return next(AppError.serverError('Erreur de vérification premium'));
  }
};

/**
 * Ajouter les informations de vérification à la réponse
 */
const addVerificationInfo = async (req, res, next) => {
  try {
    const originalJson = res.json;
    
    res.json = function(data) {
      if (req.verificationStatus) {
        data.userVerification = req.verificationStatus;
      }
      
      return originalJson.call(this, data);
    };

    next();

  } catch (error) {
    logger.error('Erreur ajout info vérification:', error);
    next();
  }
};

/**
 * Middleware pour logger les actions de vérification
 */
const logVerificationAction = (action) => {
  return (req, res, next) => {
    logger.info('Action de vérification', {
      action,
      userId: req.user?.userId,
      userRole: req.user?.role,
      targetUserId: req.params?.userId,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      timestamp: new Date()
    });
    
    next();
  };
};

module.exports = {
  hasSubmittedDocument,
  isVerified,
  checkVerificationStatus,
  canManageVerifications,
  limitDocumentSubmissions,
  validateDocumentData,
  requireVerificationForPremium,
  addVerificationInfo,
  logVerificationAction
};