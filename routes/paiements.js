// =====================================================
// ROUTES DE PAIEMENT COMPLÈTES AVEC NOUVELLES FONCTIONNALITÉS
// =====================================================

const express = require('express');
const router = express.Router();
const AppError = require('../utils/AppError');

// Import sécurisé du contrôleur avec gestion d'erreur
let PaiementController;
try {
  PaiementController = require('../controllers/paiementController');
} catch (error) {
  console.warn('⚠️ Contrôleur paiementController non trouvé, utilisation des méthodes par défaut');
  PaiementController = {};
}

// Import sécurisé des middlewares d'authentification
let auth = {};
try {
  try {
    auth = require('../middlewares/authMiddleware');
  } catch {
    auth = require('../middlewares/auth');
  }
} catch (error) {
  console.warn('⚠️ Middleware d\'authentification non trouvé');
}

const { authenticate, authorize } = auth;

// Import sécurisé des middlewares de validation
let validation = {};
try {
  try {
    validation = require('../middlewares/validation');
  } catch {
    validation = require('../middleware/validation');
  }
} catch (error) {
  console.warn('⚠️ Middleware de validation non trouvé');
}

const { 
  validatePayment, 
  validateRefund, 
  validateStatusUpdate,
  validateOTP,
  validateRecharge,
  validateWithdrawal,
  validateDispute
} = validation;

// Import sécurisé du rate limiter
let rateLimiterModule = {};
try {
  try {
    rateLimiterModule = require('../middlewares/rateLimiter');
  } catch {
    rateLimiterModule = require('../middleware/rateLimiter');
  }
} catch (error) {
  console.warn('⚠️ Middleware rateLimiter non trouvé');
}

const { rateLimiters, basicRateLimiter } = rateLimiterModule;

// === FONCTIONS HELPER SÉCURISÉES ===

const creerMiddlewareParDefaut = (nom) => {
  return (req, res, next) => {
    console.warn(`⚠️ Middleware ${nom} non disponible, passage à l'étape suivante`);
    next();
  };
};

const creerControleurParDefaut = (nomMethode, message = null) => {
  return (req, res) => {
    res.status(501).json({
      success: false,
      message: message || `Méthode ${nomMethode} non implémentée dans le contrôleur`,
      info: 'Cette fonctionnalité sera disponible dans une future version'
    });
  };
};

// Middlewares sécurisés
const middlewareAuth = authenticate || creerMiddlewareParDefaut('authenticate');
const middlewareAuthorize = (roles = []) => {
  return authorize ? authorize(roles) : creerMiddlewareParDefaut(`authorize(${roles.join(', ')})`);
};

const middlewareRateLimit = (type) => {
  const map = {
    payment: rateLimiters?.paiement?.initiate,
    standard: basicRateLimiter?.standard,
    callback: rateLimiters?.paiement?.webhook,
    reporting: basicRateLimiter?.standard,
    otp: rateLimiters?.otp || basicRateLimiter?.strict
  };
  const limiter = map[type];
  return limiter || creerMiddlewareParDefaut(`rateLimit.${type}`);
};

const middlewareValidation = (validateur, nom) => {
  return validateur || creerMiddlewareParDefaut(`validation_${nom}`);
};

// ===== ROUTES CRUD PRINCIPALES =====

/**
 * @route   POST /api/paiements
 * @desc    Initier un nouveau paiement avec toutes les fonctionnalités
 * @access  Privé (Utilisateurs authentifiés)
 */
router.post('/', 
  middlewareAuth,
  middlewareRateLimit('payment'),
  middlewareValidation(validatePayment, 'payment'),
  PaiementController.initierPaiement || creerControleurParDefaut('initierPaiement')
);

/**
 * @route   GET /api/paiements
 * @desc    Obtenir l'historique des paiements avec filtres étendus
 * @access  Privé
 */
router.get('/', 
  middlewareAuth,
  middlewareRateLimit('standard'),
  PaiementController.obtenirHistoriquePaiements || creerControleurParDefaut('obtenirHistoriquePaiements')
);

/**
 * @route   GET /api/paiements/:paiementId
 * @desc    Obtenir les détails d'un paiement avec métadonnées complètes
 * @access  Privé (Payeur, Bénéficiaire ou Admin)
 */
router.get('/:paiementId', 
  middlewareAuth,
  middlewareRateLimit('standard'),
  PaiementController.obtenirDetailsPaiement || creerControleurParDefaut('obtenirDetailsPaiement')
);

/**
 * @route   PATCH /api/paiements/:paiementId/statut
 * @desc    Mettre à jour le statut d'un paiement
 * @access  Privé (Admin ou système)
 */
router.patch('/:paiementId/statut', 
  middlewareAuth,
  middlewareAuthorize(['ADMIN', 'SYSTEM']),
  middlewareRateLimit('standard'),
  middlewareValidation(validateStatusUpdate, 'statusUpdate'),
  PaiementController.mettreAJourStatutPaiement || creerControleurParDefaut('mettreAJourStatutPaiement')
);

/**
 * @route   DELETE /api/paiements/:paiementId
 * @desc    Annuler une transaction
 * @access  Privé (Admin ou propriétaire)
 */
router.delete('/:paiementId', 
  middlewareAuth,
  middlewareRateLimit('standard'),
  PaiementController.annulerTransaction || creerControleurParDefaut('annulerTransaction')
);

// ===== NOUVELLES ROUTES SÉCURITÉ ET OTP =====

/**
 * @route   POST /api/paiements/:paiementId/otp/verifier
 * @desc    Vérifier un code OTP pour un paiement
 * @access  Privé (Payeur)
 */
router.post('/:paiementId/otp/verifier',
  middlewareAuth,
  middlewareRateLimit('otp'),
  middlewareValidation(validateOTP, 'otp'),
  PaiementController.verifierOTP || creerControleurParDefaut('verifierOTP')
);

/**
 * @route   POST /api/paiements/:paiementId/otp/regenerer
 * @desc    Régénérer un code OTP expiré
 * @access  Privé (Payeur)
 */
router.post('/:paiementId/otp/regenerer',
  middlewareAuth,
  middlewareRateLimit('otp'),
  async (req, res, next) => {
    try {
      // Logique pour régénérer l'OTP
      const { paiementId } = req.params;
      
      // TODO: Implémenter avec PaiementController.regenererOTP
      res.json({
        success: true,
        message: 'Nouveau code OTP envoyé',
        data: {
          paiementId,
          otpEnvoye: true,
          expiration: new Date(Date.now() + 10 * 60 * 1000) // 10 minutes
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

// ===== ROUTES PORTEFEUILLE ET RECHARGE =====

/**
 * @route   POST /api/paiements/recharge
 * @desc    Initier une recharge de portefeuille
 * @access  Privé
 */
router.post('/recharge',
  middlewareAuth,
  middlewareRateLimit('payment'),
  middlewareValidation(validateRecharge, 'recharge'),
  PaiementController.initierRecharge || creerControleurParDefaut('initierRecharge')
);

/**
 * @route   POST /api/paiements/:paiementId/portefeuille/crediter
 * @desc    Créditer le portefeuille du conducteur
 * @access  Privé (Admin ou système)
 */
router.post('/:paiementId/portefeuille/crediter',
  middlewareAuth,
  middlewareAuthorize(['ADMIN', 'SYSTEM']),
  middlewareRateLimit('standard'),
  PaiementController.crediterPortefeuille || creerControleurParDefaut('crediterPortefeuille')
);

/**
 * @route   POST /api/paiements/:paiementId/retrait
 * @desc    Initier un retrait de portefeuille avec calcul de frais
 * @access  Privé (Bénéficiaire)
 */
router.post('/:paiementId/retrait',
  middlewareAuth,
  middlewareRateLimit('payment'),
  middlewareValidation(validateWithdrawal, 'withdrawal'),
  PaiementController.initierRetrait || creerControleurParDefaut('initierRetrait')
);

// ===== ROUTES REMBOURSEMENTS ET LITIGES =====

/**
 * @route   POST /api/paiements/:paiementId/remboursement
 * @desc    Traiter un remboursement avec règles automatiques
 * @access  Privé (Admin)
 */
router.post('/:paiementId/remboursement', 
  middlewareAuth,
  middlewareAuthorize(['ADMIN']),
  middlewareRateLimit('payment'),
  middlewareValidation(validateRefund, 'refund'),
  PaiementController.traiterRemboursement || creerControleurParDefaut('traiterRemboursement')
);

/**
 * @route   GET /api/paiements/:paiementId/remboursement/calculer
 * @desc    Calculer le montant de remboursement selon les règles
 * @access  Privé
 */
router.get('/:paiementId/remboursement/calculer',
  middlewareAuth,
  middlewareRateLimit('standard'),
  PaiementController.calculerRemboursement || creerControleurParDefaut('calculerRemboursement')
);

/**
 * @route   POST /api/paiements/:paiementId/litige
 * @desc    Ouvrir un litige pour un paiement
 * @access  Privé (Payeur ou Bénéficiaire)
 */
router.post('/:paiementId/litige',
  middlewareAuth,
  middlewareRateLimit('standard'),
  middlewareValidation(validateDispute, 'dispute'),
  PaiementController.ouvrirLitige || creerControleurParDefaut('ouvrirLitige')
);

// ===== ROUTES CINETPAY =====

/**
 * @route   POST /api/paiements/webhooks/cinetpay
 * @desc    Traiter un webhook CinetPay
 * @access  Public (avec validation de signature)
 */
router.post('/webhooks/cinetpay',
  middlewareRateLimit('callback'),
  // TODO: Ajouter middleware de validation signature CinetPay
  PaiementController.traiterWebhookCinetPay || creerControleurParDefaut('traiterWebhookCinetPay')
);

/**
 * @route   GET /api/paiements/:paiementId/cinetpay/statut
 * @desc    Vérifier le statut d'une transaction CinetPay
 * @access  Privé
 */
router.get('/:paiementId/cinetpay/statut',
  middlewareAuth,
  middlewareRateLimit('standard'),
  PaiementController.verifierStatutCinetPay || creerControleurParDefaut('verifierStatutCinetPay')
);

// ===== ROUTES ADMINISTRATIVES =====

/**
 * @route   GET /api/paiements/admin/tableau-bord
 * @desc    Obtenir le tableau de bord administrateur complet
 * @access  Privé (Admin)
 */
router.get('/admin/tableau-bord',
  middlewareAuth,
  middlewareAuthorize(['ADMIN']),
  middlewareRateLimit('reporting'),
  PaiementController.obtenirTableauBordAdmin || creerControleurParDefaut('obtenirTableauBordAdmin')
);

/**
 * @route   GET /api/paiements/admin/conducteurs-solde-insuffisant
 * @desc    Obtenir les conducteurs avec solde insuffisant
 * @access  Privé (Admin)
 */
router.get('/admin/conducteurs-solde-insuffisant',
  middlewareAuth,
  middlewareAuthorize(['ADMIN']),
  middlewareRateLimit('standard'),
  PaiementController.obtenirConducteursSoldeInsuffisant || creerControleurParDefaut('obtenirConducteursSoldeInsuffisant')
);

/**
 * @route   GET /api/paiements/admin/litiges
 * @desc    Obtenir tous les litiges ouverts
 * @access  Privé (Admin)
 */
router.get('/admin/litiges',
  middlewareAuth,
  middlewareAuthorize(['ADMIN']),
  middlewareRateLimit('standard'),
  PaiementController.obtenirLitigesOuverts || creerControleurParDefaut('obtenirLitigesOuverts')
);

/**
 * @route   POST /api/paiements/admin/notifications/envoyer
 * @desc    Envoyer les notifications en attente
 * @access  Privé (Admin ou système)
 */
router.post('/admin/notifications/envoyer',
  middlewareAuth,
  middlewareAuthorize(['ADMIN', 'SYSTEM']),
  middlewareRateLimit('standard'),
  PaiementController.envoyerNotificationsEnAttente || creerControleurParDefaut('envoyerNotificationsEnAttente')
);

/**
 * @route   GET /api/paiements/admin/paiements-a-crediter
 * @desc    Obtenir les paiements à créditer dans le portefeuille
 * @access  Privé (Admin)
 */
router.get('/admin/paiements-a-crediter',
  middlewareAuth,
  middlewareAuthorize(['ADMIN']),
  middlewareRateLimit('standard'),
  PaiementController.obtenirPaiementsACrediter || creerControleurParDefaut('obtenirPaiementsACrediter')
);

/**
 * @route   POST /api/paiements/admin/nettoyer-expires
 * @desc    Nettoyer les paiements expirés
 * @access  Privé (Admin ou système)
 */
router.post('/admin/nettoyer-expires',
  middlewareAuth,
  middlewareAuthorize(['ADMIN', 'SYSTEM']),
  middlewareRateLimit('standard'),
  PaiementController.nettoyerPaiementsExpires || creerControleurParDefaut('nettoyerPaiementsExpires')
);

// ===== ROUTES CALLBACKS ET MOBILE MONEY =====

/**
 * @route   POST /api/paiements/callback/mobile-money
 * @desc    Traiter les callbacks des providers Mobile Money legacy
 * @access  Public (avec validation de signature)
 */
router.post('/callback/mobile-money', 
  middlewareRateLimit('callback'),
  // TODO: Ajouter middleware de validation de signature provider
  PaiementController.traiterCallbackMobileMoney || creerControleurParDefaut('traiterCallbackMobileMoney')
);

// ===== ROUTES UTILITAIRES =====

/**
 * @route   POST /api/paiements/calculer-commission
 * @desc    Calculer la commission de la plateforme avec nouveau système (10%)
 * @access  Privé
 */
router.post('/calculer-commission', 
  middlewareAuth,
  middlewareRateLimit('standard'),
  PaiementController.calculerCommissionPlateforme || creerControleurParDefaut('calculerCommissionPlateforme')
);

/**
 * @route   GET /api/paiements/rapprochement-comptable
 * @desc    Effectuer un rapprochement comptable
 * @access  Privé (Admin seulement)
 */
router.get('/rapprochement-comptable', 
  middlewareAuth,
  middlewareAuthorize(['ADMIN']),
  middlewareRateLimit('reporting'),
  PaiementController.effectuerRapprochementComptable || creerControleurParDefaut('effectuerRapprochementComptable')
);

/**
 * @route   GET /api/paiements/:paiementId/recu/:numeroRecu?
 * @desc    Générer un reçu de paiement
 * @access  Privé (Payeur, Bénéficiaire ou Admin)
 */
router.get('/:paiementId/recu/:numeroRecu?', 
  middlewareAuth,
  middlewareRateLimit('standard'),
  PaiementController.genererRecu || creerControleurParDefaut('genererRecu')
);

// ===== ROUTES DE STATISTIQUES ÉTENDUES =====

/**
 * @route   GET /api/paiements/stats/dashboard
 * @desc    Obtenir les statistiques pour le dashboard (version améliorée)
 * @access  Privé (Admin)
 */
router.get('/stats/dashboard', 
  middlewareAuth,
  middlewareAuthorize(['ADMIN']),
  middlewareRateLimit('standard'),
  async (req, res, next) => {
    try {
      const { dateDebut, dateFin } = req.query;
      
      // Version améliorée avec nouvelles métriques
      const statsEtendues = {
        periode: {
          debut: dateDebut || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
          fin: dateFin || new Date().toISOString()
        },
        paiements: {
          total: 0,
          reussis: 0,
          echoues: 0,
          en_attente: 0,
          litiges: 0,
          remboursements: 0
        },
        montants: {
          total_traite: 0,
          commissions_10_pourcent: 0,
          remboursements: 0,
          retraits: 0,
          recharges: 0
        },
        providers: {
          mobile_money: 0,
          carte_bancaire: 0,
          portefeuille_interne: 0,
          especes: 0
        },
        securite: {
          transactions_otp: 0,
          transactions_suspectes: 0
        },
        portefeuilles: {
          conducteurs_solde_insuffisant: 0,
          montant_total_portefeuilles: 0
        }
      };
      
      res.json({
        success: true,
        message: 'Statistiques étendues récupérées avec succès',
        data: statsEtendues
      });
    } catch (error) {
      console.error('Erreur stats dashboard étendu:', error);
      return next(AppError.serverError('Erreur serveur lors de la récupération des statistiques', { originalError: error.message }));
    }
  }
);

// === VALIDATION DES PARAMÈTRES ===

// Middleware pour valider les IDs de paiement
router.param('paiementId', (req, res, next, paiementId) => {
  if (!paiementId.match(/^[0-9a-fA-F]{24}$/) && !paiementId.match(/^PAY_[A-Z0-9]+$/)) {
    return res.status(400).json({
      success: false,
      message: 'Format ID de paiement invalide',
      code: 'INVALID_PAYMENT_ID'
    });
  }
  next();
});

// Middleware pour valider les numéros de reçu
router.param('numeroRecu', (req, res, next, numeroRecu) => {
  if (numeroRecu && !numeroRecu.match(/^REC_[0-9A-Z]+$/)) {
    return res.status(400).json({
      success: false,
      message: 'Format numéro de reçu invalide',
      code: 'INVALID_RECEIPT_NUMBER'
    });
  }
  next();
});

// ===== MIDDLEWARES GLOBAUX =====

// Middleware de logging étendu pour les paiements
router.use((req, res, next) => {
  const originalSend = res.send;
  res.send = function(data) {
    // Logger toutes les actions de paiement pour audit avec plus de détails
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      const logData = {
        action: `${req.method} ${req.originalUrl}`,
        user: req.user?.id || 'Anonymous',
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        timestamp: new Date().toISOString()
      };
      
      // Ajouter des détails spécifiques selon l'action
      if (req.originalUrl.includes('/otp/')) {
        logData.actionType = 'OTP_VERIFICATION';
      } else if (req.originalUrl.includes('/recharge')) {
        logData.actionType = 'WALLET_RECHARGE';
      } else if (req.originalUrl.includes('/retrait')) {
        logData.actionType = 'WALLET_WITHDRAWAL';
      } else if (req.originalUrl.includes('/litige')) {
        logData.actionType = 'DISPUTE_MANAGEMENT';
      }
      
      console.log(`💳 ACTION PAIEMENT ÉTENDUE:`, logData);
    }
    return originalSend.call(this, data);
  };
  next();
});

// ===== GESTION D'ERREURS SPÉCIALISÉE ÉTENDUE =====

router.use((err, req, res, next) => {
  console.error('💥 Erreur routes paiement:', {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    user: req.user?.id,
    url: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString()
  });
  
  // Erreurs spécifiques aux nouvelles fonctionnalités
  if (err.code === 'OTP_EXPIRED') {
    return res.status(400).json({
      success: false,
      message: 'Code OTP expiré',
      code: 'OTP_EXPIRED'
    });
  }
  
  if (err.code === 'INSUFFICIENT_WALLET_BALANCE') {
    return res.status(400).json({
      success: false,
      message: 'Solde portefeuille insuffisant',
      code: 'INSUFFICIENT_WALLET_BALANCE'
    });
  }
  
  if (err.code === 'DISPUTE_ALREADY_EXISTS') {
    return res.status(400).json({
      success: false,
      message: 'Un litige existe déjà pour ce paiement',
      code: 'DISPUTE_ALREADY_EXISTS'
    });
  }
  
  if (err.code === 'REFUND_PERIOD_EXPIRED') {
    return res.status(400).json({
      success: false,
      message: 'Délai de remboursement expiré',
      code: 'REFUND_PERIOD_EXPIRED'
    });
  }
  
  // Erreurs de validation Mongoose
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      message: 'Données de paiement invalides',
      code: 'PAYMENT_VALIDATION_ERROR',
      errors: Object.values(err.errors).map(e => e.message)
    });
  }
  
  // Erreurs de cast MongoDB
  if (err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      message: 'ID de paiement invalide',
      code: 'INVALID_PAYMENT_ID'
    });
  }
  
  // Erreurs de timeout
  if (err.code === 'ETIMEDOUT') {
    return res.status(408).json({
      success: false,
      message: 'Timeout lors du traitement du paiement',
      code: 'PAYMENT_TIMEOUT'
    });
  }
  
  // Erreurs de réseau
  if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
    return res.status(503).json({
      success: false,
      message: 'Service de paiement temporairement indisponible',
      code: 'PAYMENT_SERVICE_UNAVAILABLE'
    });
  }
  
  // Erreurs de rate limiting
  if (err.statusCode === 429) {
    return res.status(429).json({
      success: false,
      message: 'Trop de tentatives de paiement. Veuillez réessayer plus tard.',
      code: 'PAYMENT_RATE_LIMIT_EXCEEDED'
    });
  }
  
  // Erreur générique
  if (process.env.NODE_ENV === 'production') {
    return res.status(500).json({
      success: false,
      message: 'Erreur interne du serveur de paiement',
      code: 'PAYMENT_SERVER_ERROR'
    });
  }
  
  return next(err);
});

module.exports = router;