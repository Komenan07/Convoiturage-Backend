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
  
  // Recharges
  validateRecharge,
  validateConfirmerRecharge,
  validateHistoriqueRecharges,
  validateAutoRecharge,
  validateAnnulerRecharge,
  
  // Communes
  validateReferenceTransaction,
  validatePaiementId,
  validateHistoriquePaiements,
  validateRemboursement,
  
  // Admin - Commissions
  validateStatistiquesCommissions,
  validateTraiterCommissionsEchec,
  validateRapportCommissions,
  
  // Admin - Recharges
  validateStatistiquesRecharges,
  validateTraiterRechargesAttente,
  
  // Webhooks
  validateWebhookCinetPay
} = require('../middlewares/validation');

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
router.post('/initier', validatePaiement, paiementController.initierPaiement);

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
 * @desc    Obtenir les méthodes de paiement disponibles
 * @access  Private
 */
router.get('/methodes/disponibles', paiementController.obtenirMethodesDisponibles);

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
  requireRole(['conducteur', 'les_deux']), 
  validateRecharge, 
  paiementController.initierRecharge
);

/**
 * @route   POST /api/paiements/recharge/confirmer
 * @desc    Confirmer une recharge (callback mobile money)
 * @access  Private (Conducteur)
 */
router.post('/recharge/confirmer', 
  requireRole(['conducteur', 'les_deux']), 
  validateConfirmerRecharge, 
  paiementController.confirmerRecharge
);

/**
 * @route   GET /api/paiements/recharge/historique
 * @desc    Obtenir l'historique des recharges de l'utilisateur
 * @access  Private (Conducteur)
 */
router.get('/recharge/historique', 
  requireRole(['conducteur', 'les_deux']), 
  validateHistoriqueRecharges,
  paiementController.obtenirHistoriqueRecharges
);

/**
 * @route   GET /api/paiements/recharge/statut/:referenceTransaction
 * @desc    Obtenir le statut d'une recharge spécifique
 * @access  Private (Conducteur)
 */
router.get('/recharge/statut/:referenceTransaction', 
  requireRole(['conducteur', 'les_deux']), 
  validateReferenceTransaction,
  paiementController.obtenirStatutRecharge
);

/**
 * @route   POST /api/paiements/recharge/auto-config
 * @desc    Configurer la recharge automatique
 * @access  Private (Conducteur)
 */
router.post('/recharge/auto-config', 
  requireRole(['conducteur', 'les_deux']), 
  validateAutoRecharge,
  paiementController.configurerRechargeAutomatique
);

/**
 * @route   DELETE /api/paiements/recharge/annuler/:referenceTransaction
 * @desc    Annuler une recharge en attente
 * @access  Private (Conducteur)
 */
router.delete('/recharge/annuler/:referenceTransaction', 
  requireRole(['conducteur', 'les_deux']), 
  validateAnnulerRecharge,
  paiementController.annulerRecharge
);

// =========================
// ROUTES ADMIN
// =========================

/**
 * @route   POST /api/paiements/rembourser
 * @desc    Rembourser un paiement (admin)
 * @access  Private (Admin)
 */
router.post('/rembourser', 
  requireRole(['admin']), 
  validateRemboursement,
  paiementController.rembourserPaiement
);

/**
 * @route   GET /api/paiements/admin/commissions/statistiques
 * @desc    Statistiques des commissions pour les admins
 * @access  Private (Admin)
 */
router.get('/admin/commissions/statistiques', 
  requireRole(['admin']), 
  validateStatistiquesCommissions,
  paiementController.obtenirStatistiquesCommissions
);

/**
 * @route   POST /api/paiements/admin/commissions/traiter-echecs
 * @desc    Traiter les commissions en échec
 * @access  Private (Admin)
 */
router.post('/admin/commissions/traiter-echecs', 
  requireRole(['admin']), 
  validateTraiterCommissionsEchec,
  paiementController.traiterCommissionsEnEchec
);

/**
 * @route   GET /api/paiements/admin/commissions/detail/:paiementId
 * @desc    Détail d'une commission spécifique
 * @access  Private (Admin ou propriétaire)
 */
router.get('/admin/commissions/detail/:paiementId', 
  validatePaiementId,
  paiementController.obtenirDetailCommission
);

/**
 * @route   GET /api/paiements/admin/commissions/rapport
 * @desc    Générer un rapport des commissions
 * @access  Private (Admin)
 */
router.get('/admin/commissions/rapport', 
  requireRole(['admin']), 
  validateRapportCommissions,
  paiementController.genererRapportCommissions
);

/**
 * @route   GET /api/paiements/admin/commissions/surveillance
 * @desc    Surveillance en temps réel des commissions
 * @access  Private (Admin)
 */
router.get('/admin/commissions/surveillance', 
  requireRole(['admin']), 
  paiementController.surveillerCommissions
);

/**
 * @route   GET /api/paiements/admin/recharges/statistiques
 * @desc    Statistiques des recharges pour les admins
 * @access  Private (Admin)
 */
router.get('/admin/recharges/statistiques', 
  requireRole(['admin']), 
  validateStatistiquesRecharges,
  paiementController.obtenirStatistiquesRecharges
);

/**
 * @route   POST /api/paiements/admin/recharges/traiter-attente
 * @desc    Traiter les recharges en attente
 * @access  Private (Admin)
 */
router.post('/admin/recharges/traiter-attente', 
  requireRole(['admin']), 
  validateTraiterRechargesAttente,
  paiementController.traiterRechargesEnAttente
);

module.exports = router;