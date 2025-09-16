// middlewares/adminMiddleware.js

const { logger } = require('../../utils/logger');
const User = require('../../models/Utilisateur');

/**
 * Middleware principal pour vérifier les droits administrateur
 */
const adminMiddleware = async (req, res, next) => {
  try {
    // Vérifier que l'utilisateur est déjà authentifié via authMiddleware
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentification requise',
        code: 'AUTH_REQUIRED'
      });
    }

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

    // Si admin, continuer
    next();
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
 * Middleware pour vérifier les droits administrateur sur les comptes utilisateurs
 */
const userAdminMiddleware = async (req, res, next) => {
  try {
    // Vérifier d'abord les droits admin
    await adminMiddleware(req, res, () => {
      // Vérifier si l'ID utilisateur est spécifié
      const userId = req.params.userId || req.params.id || req.body.userId;
      
      if (!userId) {
        return res.status(400).json({
          success: false,
          message: 'ID utilisateur manquant',
          code: 'USER_ID_REQUIRED'
        });
      }
      
      // Récupérer l'utilisateur cible
      User.findById(userId)
        .then(user => {
          if (!user) {
            return res.status(404).json({
              success: false,
              message: 'Utilisateur non trouvé',
              code: 'USER_NOT_FOUND'
            });
          }
          
          // Ajouter l'utilisateur cible à la requête
          req.targetUser = user;
          next();
        })
        .catch(err => {
          logger.error('Erreur lors de la récupération de l\'utilisateur cible:', err);
          return res.status(500).json({
            success: false,
            message: 'Erreur serveur lors de la récupération de l\'utilisateur',
            code: 'USER_RETRIEVAL_ERROR'
          });
        });
    });
  } catch (error) {
    logger.error('Erreur dans userAdminMiddleware:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      code: 'SERVER_ERROR'
    });
  }
};

/**
 * Middleware pour gérer les statuts de compte utilisateur
 */
const compteStatutMiddleware = async (req, res, next) => {
  try {
    // Vérifier d'abord les droits admin
    await adminMiddleware(req, res, () => {
      // Vérifier si le statut est valide
      const { statutCompte, raison } = req.body;
      
      if (!statutCompte) {
        return res.status(400).json({
          success: false,
          message: 'Statut de compte manquant',
          code: 'STATUS_REQUIRED'
        });
      }
      
      // Vérifier si le statut est valide
      const statutsValides = ['ACTIF', 'SUSPENDU', 'BLOQUE', 'EN_ATTENTE_VERIFICATION'];
      if (!statutsValides.includes(statutCompte)) {
        return res.status(400).json({
          success: false,
          message: 'Statut de compte invalide',
          code: 'INVALID_STATUS',
          statutsValides
        });
      }
      
      // Vérifier si une raison est fournie pour les statuts restrictifs
      if (['SUSPENDU', 'BLOQUE'].includes(statutCompte) && !raison) {
        return res.status(400).json({
          success: false,
          message: 'Une raison est requise pour suspendre ou bloquer un compte',
          code: 'REASON_REQUIRED'
        });
      }
      
      next();
    });
  } catch (error) {
    logger.error('Erreur dans compteStatutMiddleware:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      code: 'SERVER_ERROR'
    });
  }
};

/**
 * Middleware pour vérifier les documents d'identité
 */
const verificationDocumentMiddleware = async (req, res, next) => {
  try {
    // Vérifier d'abord les droits admin
    await adminMiddleware(req, res, () => {
      // Vérifier le statut de vérification
      const { statutVerification, raisonRejet } = req.body;
      
      if (!statutVerification) {
        return res.status(400).json({
          success: false,
          message: 'Statut de vérification manquant',
          code: 'VERIFICATION_STATUS_REQUIRED'
        });
      }
      
      // Vérifier si le statut est valide
      const statutsValides = ['EN_ATTENTE', 'VERIFIE', 'REJETE'];
      if (!statutsValides.includes(statutVerification)) {
        return res.status(400).json({
          success: false,
          message: 'Statut de vérification invalide',
          code: 'INVALID_VERIFICATION_STATUS',
          statutsValides
        });
      }
      
      // Si rejeté, une raison est requise
      if (statutVerification === 'REJETE' && !raisonRejet) {
        return res.status(400).json({
          success: false,
          message: 'Une raison de rejet est requise',
          code: 'REJECTION_REASON_REQUIRED'
        });
      }
      
      next();
    });
  } catch (error) {
    logger.error('Erreur dans verificationDocumentMiddleware:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      code: 'SERVER_ERROR'
    });
  }
};

/**
 * Middleware pour les opérations financières administratives
 */
const compteCovoiturageAdminMiddleware = async (req, res, next) => {
  try {
    // Vérifier d'abord les droits admin
    await adminMiddleware(req, res, () => {
      // Vérifier si les paramètres financiers sont valides
      const { montant, operation, raison } = req.body;
      
      if (!montant || !operation) {
        return res.status(400).json({
          success: false,
          message: 'Montant et type d\'opération requis',
          code: 'FINANCIAL_PARAMS_REQUIRED'
        });
      }
      
      // Vérifier si le montant est un nombre positif
      if (isNaN(montant) || montant <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Le montant doit être un nombre positif',
          code: 'INVALID_AMOUNT'
        });
      }
      
      // Vérifier si l'opération est valide
      const operationsValides = ['crediter', 'debiter', 'rembourser_commission', 'ajuster_solde'];
      if (!operationsValides.includes(operation)) {
        return res.status(400).json({
          success: false,
          message: 'Type d\'opération invalide',
          code: 'INVALID_OPERATION',
          operationsValides
        });
      }
      
      // Raison obligatoire pour toutes les opérations financières
      if (!raison) {
        return res.status(400).json({
          success: false,
          message: 'Une raison est requise pour toute opération financière',
          code: 'REASON_REQUIRED'
        });
      }
      
      next();
    });
  } catch (error) {
    logger.error('Erreur dans compteCovoiturageAdminMiddleware:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      code: 'SERVER_ERROR'
    });
  }
};

/**
 * Middleware pour les opérations statistiques administratives
 */
const statsAdminMiddleware = async (req, res, next) => {
  try {
    // Vérifier d'abord les droits admin
    await adminMiddleware(req, res, () => {
      // Vérifier les paramètres de filtre pour les statistiques
      const { dateDebut, dateFin } = req.query;
      
      // Valider les dates si elles sont fournies
      if (dateDebut && !isValidDate(dateDebut)) {
        return res.status(400).json({
          success: false,
          message: 'Format de date de début invalide',
          code: 'INVALID_START_DATE'
        });
      }
      
      if (dateFin && !isValidDate(dateFin)) {
        return res.status(400).json({
          success: false,
          message: 'Format de date de fin invalide',
          code: 'INVALID_END_DATE'
        });
      }
      
      // Vérifier si la date de fin est postérieure à la date de début
      if (dateDebut && dateFin && new Date(dateFin) < new Date(dateDebut)) {
        return res.status(400).json({
          success: false,
          message: 'La date de fin doit être postérieure à la date de début',
          code: 'INVALID_DATE_RANGE'
        });
      }
      
      next();
    });
  } catch (error) {
    logger.error('Erreur dans statsAdminMiddleware:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      code: 'SERVER_ERROR'
    });
  }
};

// Fonction utilitaire pour valider les dates
function isValidDate(dateString) {
  const date = new Date(dateString);
  return !isNaN(date.getTime());
}

module.exports = {
  adminMiddleware,
  userAdminMiddleware,
  compteStatutMiddleware,
  verificationDocumentMiddleware,
  compteCovoiturageAdminMiddleware,
  statsAdminMiddleware,
  
  // Alias pour compatibilité
  isAdmin: adminMiddleware,
  requireAdmin: adminMiddleware,
  adminUserCheck: userAdminMiddleware,
  adminFinanceCheck: compteCovoiturageAdminMiddleware
};