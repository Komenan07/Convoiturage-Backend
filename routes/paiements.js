// routes/paiements.js
const express = require('express');
const router = express.Router();
const paiementController = require('../controllers/paiementController');

// ✅ Import correct des middlewares d'authentification
const { authMiddleware, roleMiddleware } = require('../middlewares/authMiddleware');

// Alias pour compatibilité
const authenticateToken = authMiddleware;
const requireRole = (roles) => roleMiddleware(roles);

// Import des validations
const {
  // Paiements trajets
  validatePaiement,
  validateConfirmerPaiementEspeces,
  
  // Recharges
  validateRecharge,
  validateConfirmerRecharge,
  validateHistoriqueRecharges,
  validateAutoRecharge,
  validateAnnulerRecharge,
  
  // Communes
  validateReferenceTransaction,
  validatePaiementId,
  validateTrajetId,
  validateHistoriquePaiements,

  // Webhooks
  validateWebhookCinetPay
} = require('../middlewares/validation');

// =========================
// MIDDLEWARE CONDITIONNEL POUR WEBHOOK OU ADMIN
// =========================
const webhookOuAdmin = (req, res, next) => {
  // Vérifier si c'est un webhook
  const estWebhook = req.headers['x-webhook-signature'] || req.body.webhook === true;
  
  if (estWebhook) {
    // Webhook → Passer sans authentification
    return next();
  }
  
  // Sinon, authentification obligatoire
  authenticateToken(req, res, (err) => {
    if (err) return;
    
    // Vérifier rôle admin pour confirmation manuelle
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'AUTORISATION_REQUISE',
        message: 'Seuls les administrateurs peuvent confirmer manuellement une recharge'
      });
    }
    
    next();
  });
};

// =========================
// ROUTES PUBLIQUES (SANS AUTH)
// =========================

/**
 * @route   POST /api/paiements/webhook/cinetpay
 * @desc    Webhook pour les notifications CinetPay
 * @access  Public (Webhook)
 */
router.post('/webhook/cinetpay', 
  validateWebhookCinetPay, 
  paiementController.webhookCinetPay
);

/**
 * @route   GET /api/paiements/retour/:referenceTransaction
 * @desc    Page de retour après paiement
 * @access  Public
 */
router.get('/retour/:referenceTransaction', 
  validateReferenceTransaction, 
  paiementController.pageRetour
);

// =========================
// MIDDLEWARE D'AUTHENTIFICATION
// =========================
// Toutes les routes suivantes nécessitent une authentification
router.use(authenticateToken);

// =========================
// GESTION DES PAIEMENTS TRAJETS
// =========================

/**
 * @route   POST /api/paiements/initier
 * @desc    Initier un paiement pour une réservation de trajet
 * @access  Private (Passager)
 */
router.post('/initier', 
  validatePaiement, 
  paiementController.initierPaiement
);

/**
 * 🆕 @route   GET /api/paiements/trajets/:trajetId/methodes-disponibles
 * @desc    Obtenir les méthodes de paiement disponibles pour un trajet
 * @access  Private
 */
router.get('/trajets/:trajetId/methodes-disponibles', 
  validateTrajetId,
  paiementController.obtenirMethodesPaiementDisponibles
);

/**
 * 🆕 @route   POST /api/paiements/especes/reservation/:reservationId/confirmer
 * @desc    Confirmer un paiement en espèces après le trajet (via reservationId)
 * @access  Private (Conducteur ou Passager)
 * @note    Alternative à la route par referenceTransaction — utilisée par le mobile
 */
router.post('/especes/reservation/:reservationId/confirmer', 
  validateConfirmerPaiementEspeces,
  paiementController.confirmerPaiementEspeces
);

/**
 * 🆕 @route   POST /api/paiements/especes/:referenceTransaction/confirmer
 * @desc    Confirmer un paiement en espèces après le trajet
 * @access  Private (Conducteur ou Passager)
 */
router.post('/especes/:referenceTransaction/confirmer', 
  validateReferenceTransaction,
  validateConfirmerPaiementEspeces,
  paiementController.confirmerPaiementEspeces
);

/**
 * @route   GET /api/paiements/statut/:referenceTransaction
 * @desc    Vérifier le statut d'une transaction
 * @access  Private
 */
router.get('/statut/:referenceTransaction', 
  validateReferenceTransaction, 
  paiementController.verifierStatut
);

/**
 * @route   GET /api/paiements/historique
 * @desc    Historique des paiements de l'utilisateur
 * @access  Private
 */
router.get('/historique', 
  validateHistoriquePaiements, 
  paiementController.historiquePaiements
);

/**
 * @route   GET /api/paiements/methodes/disponibles
 * @desc    Obtenir toutes les méthodes de paiement disponibles
 * @access  Private
 */
router.get('/methodes/disponibles', 
  paiementController.obtenirMethodesDisponibles
);

/**
 * @route   GET /api/paiements/:paiementId
 * @desc    Obtenir les détails d'un paiement spécifique
 * @access  Private
 */
router.get('/:paiementId', 
  validatePaiementId, 
  paiementController.obtenirPaiement
);

// =========================
// GESTION DES RECHARGES
// =========================

/**
 * @route   POST /api/paiements/recharge/initier
 * @desc    Initier une recharge de compte conducteur
 * @access  Private (Conducteur)
 */
router.post('/recharge/initier', 
  requireRole(['conducteur']), 
  validateRecharge, 
  paiementController.initierRecharge
);

/**
 * 🔒 @route   POST /api/paiements/recharge/confirmer
 * @desc    Confirmer une recharge (webhook automatique OU admin manuel)
 * @access  Public (Webhook) OU Private (Admin uniquement)
 * @note    Utilise un middleware spécial pour autoriser webhooks sans auth
 */
router.post('/recharge/confirmer', 
  webhookOuAdmin,  // ✅ Middleware conditionnel
  validateConfirmerRecharge, 
  paiementController.confirmerRecharge
);

/**
 * @route   GET /api/paiements/recharge/historique
 * @desc    Obtenir l'historique des recharges de l'utilisateur
 * @access  Private (Conducteur)
 */
router.get('/recharge/historique', 
  requireRole(['conducteur']), 
  validateHistoriqueRecharges,
  paiementController.obtenirHistoriqueRecharges
);

/**
 * @route   GET /api/paiements/recharge/statut/:referenceTransaction
 * @desc    Obtenir le statut d'une recharge spécifique
 * @access  Private (Conducteur)
 */
router.get('/recharge/statut/:referenceTransaction', 
  requireRole(['conducteur']), 
  validateReferenceTransaction,
  paiementController.obtenirStatutRecharge
);

/**
 * @route   POST /api/paiements/recharge/auto-config
 * @desc    Configurer la recharge automatique
 * @access  Private (Conducteur)
 */
router.post('/recharge/auto-config', 
  requireRole(['conducteur']), 
  validateAutoRecharge,
  paiementController.configurerRechargeAutomatique
);

/**
 * @route   DELETE /api/paiements/recharge/annuler/:referenceTransaction
 * @desc    Annuler une recharge en attente
 * @access  Private (Conducteur)
 */
router.delete('/recharge/annuler/:referenceTransaction', 
  requireRole(['conducteur']), 
  validateAnnulerRecharge,
  paiementController.annulerRecharge
);

module.exports = router;