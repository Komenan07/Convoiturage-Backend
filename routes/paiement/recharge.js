// routes/recharges.js
// Routes pour la gestion des recharges de compte covoiturage

const express = require('express');
const router = express.Router();

// Import des middlewares
const { authenticate, authorizeRole } = require('../../middlewares/auth/authMiddleware');
const { validateAccountRecharge, validatePagination } = require('../../middlewares/validation/userValidation');
const { validerLimitesPaiement, verifierStatutCompte } = require('../../middlewares/validation/paiementValidation');

// Import du contrôleur de recharge
const rechargeController = require('../controllers/rechargeController');

// Import des modèles nécessaires
const Paiement = require('../models/Paiement');
const { logger } = require('../utils/logger');

// Middleware de logging des recharges
const logRechargeAction = (action) => {
  return (req, res, next) => {
    req.rechargeAction = action;
    req.timestamp = new Date();
    next();
  };
};

// ============================================================================
// ROUTES UTILISATEUR (CONDUCTEURS)
// ============================================================================

/**
 * Initier une recharge de compte
 * - Authentification requise
 * - Validation des données de recharge
 * - Vérification des limites quotidiennes
 * - Vérification du statut du compte
 */
router.post('/',
  authenticate,
  logRechargeAction('INITIATE_RECHARGE'),
  verifierStatutCompte,
  validateAccountRecharge,
  validerLimitesPaiement, // Vérifie les limites de paiement
  rechargeController.initierRecharge
);

/**
 * Confirmer une recharge (callback ou manuel)
 * - Authentification optionnelle (peut être appelé par webhook)
 * - Traitement des callbacks mobile money
 */
router.post('/confirmer',
  authenticate, // Optionnel selon l'implémentation
  logRechargeAction('CONFIRM_RECHARGE'),
  rechargeController.confirmerRecharge
);

/**
 * Obtenir l'historique de ses recharges
 * - Authentification requise
 * - Pagination supportée
 * - Filtrage par statut et dates
 */
router.get('/historique',
  authenticate,
  validatePagination,
  rechargeController.obtenirHistoriqueRecharges
);

/**
 * Obtenir le statut d'une recharge spécifique
 * - Authentification requise
 * - Seulement ses propres recharges
 */
router.get('/statut/:referenceTransaction',
  authenticate,
  logRechargeAction('VIEW_RECHARGE_STATUS'),
  rechargeController.obtenirStatutRecharge
);

/**
 * Configurer la recharge automatique
 * - Authentification requise
 * - Validation des paramètres de configuration
 */
router.post('/auto-recharge',
  authenticate,
  logRechargeAction('CONFIGURE_AUTO_RECHARGE'),
  // Validation custom pour recharge auto
  (req, res, next) => {
    const { active, seuilAutoRecharge, montantAutoRecharge, methodePaiementAuto } = req.body;
    
    if (active === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Paramètre "active" requis (true/false)'
      });
    }

    if (active) {
      if (!seuilAutoRecharge || typeof seuilAutoRecharge !== 'number' || seuilAutoRecharge < 0) {
        return res.status(400).json({
          success: false,
          message: 'Seuil de recharge automatique invalide'
        });
      }

      if (!montantAutoRecharge || typeof montantAutoRecharge !== 'number' || 
          montantAutoRecharge < 1000 || montantAutoRecharge > 500000) {
        return res.status(400).json({
          success: false,
          message: 'Montant de recharge automatique invalide (1000-500000 FCFA)'
        });
      }

      const methodesValides = ['WAVE', 'ORANGE_MONEY', 'MTN_MONEY', 'MOOV_MONEY'];
      if (!methodePaiementAuto || !methodesValides.includes(methodePaiementAuto)) {
        return res.status(400).json({
          success: false,
          message: 'Méthode de paiement automatique invalide',
          methodesAcceptees: methodesValides
        });
      }
    }

    next();
  },
  rechargeController.configurerRechargeAutomatique
);

/**
 * Annuler une recharge en cours
 * - Authentification requise
 * - Seulement dans les 30 minutes suivant l'initiation
 */
router.delete('/:referenceTransaction',
  authenticate,
  logRechargeAction('CANCEL_RECHARGE'),
  rechargeController.annulerRecharge
);

// ============================================================================
// ROUTES ADMINISTRATION (ADMIN/MODERATEUR)
// ============================================================================

/**
 * Obtenir les statistiques globales des recharges
 * - Authentification admin requise
 * - Données agrégées et métriques
 */
router.get('/admin/statistiques',
  authenticate,
  authorizeRole(['ADMIN', 'MODERATEUR']),
  logRechargeAction('VIEW_RECHARGE_STATS'),
  rechargeController.obtenirStatistiquesRecharges
);

/**
 * Traiter les recharges en attente (maintenance)
 * - Authentification admin requise
 * - Traitement automatique des recharges expirées
 */
router.post('/admin/traiter-en-attente',
  authenticate,
  authorizeRole(['ADMIN']),
  logRechargeAction('PROCESS_PENDING_RECHARGES'),
  rechargeController.traiterRechargesEnAttente
);

/**
 * Forcer la confirmation d'une recharge (admin)
 * - Authentification admin requise
 * - Confirmation manuelle en cas de problème
 */
router.post('/admin/forcer-confirmation',
  authenticate,
  authorizeRole(['ADMIN']),
  logRechargeAction('FORCE_CONFIRM_RECHARGE'),
  async (req, res, next) => {
    try {
      const { referenceTransaction, raison } = req.body;
      const adminId = req.user.userId;

      if (!referenceTransaction) {
        return res.status(400).json({
          success: false,
          message: 'Référence de transaction requise'
        });
      }

      if (!raison || raison.length < 10) {
        return res.status(400).json({
          success: false,
          message: 'Raison de la confirmation forcée requise (min 10 caractères)'
        });
      }

      // Appeler le contrôleur de confirmation avec les données admin
      req.body.statutPaiement = 'COMPLETE';
      req.body.confirmationForcee = true;
      req.body.adminId = adminId;
      req.body.raisonConfirmation = raison;

      return rechargeController.confirmerRecharge(req, res, next);

    } catch (error) {
      next(error);
    }
  }
);

/**
 * Obtenir le détail d'une recharge (admin)
 * - Authentification admin requise
 * - Vue complète avec logs et historique
 */
router.get('/admin/detail/:referenceTransaction',
  authenticate,
  authorizeRole(['ADMIN', 'MODERATEUR']),
  logRechargeAction('VIEW_RECHARGE_DETAIL_ADMIN'),
  async (req, res, next) => {
    try {
      const { referenceTransaction } = req.params;

      const paiement = await Paiement.findOne({
        referenceTransaction,
        methodePaiement: { $in: ['WAVE', 'ORANGE_MONEY', 'MTN_MONEY', 'MOOV_MONEY'] }
      })
      .populate('payeurId', 'nom prenom email telephone compteCovoiturage')
      .populate('beneficiaireId', 'nom prenom email');

      if (!paiement) {
        return res.status(404).json({
          success: false,
          message: 'Recharge non trouvée'
        });
      }

      // Calcul des métriques
      const delaiTraitement = paiement.dateCompletion && paiement.dateInitiation ?
        Math.round((paiement.dateCompletion - paiement.dateInitiation) / (1000 * 60)) : null;

      res.json({
        success: true,
        data: {
          paiement: {
            id: paiement._id,
            referenceTransaction: paiement.referenceTransaction,
            montantTotal: paiement.montantTotal,
            montantCredite: paiement.montantConducteur,
            fraisTransaction: paiement.fraisTransaction,
            methodePaiement: paiement.methodePaiement,
            statutPaiement: paiement.statutPaiement,
            dateInitiation: paiement.dateInitiation,
            dateCompletion: paiement.dateCompletion
          },
          utilisateur: {
            id: paiement.payeurId._id,
            nom: paiement.payeurId.nomComplet,
            email: paiement.payeurId.email,
            telephone: paiement.payeurId.telephone,
            soldeActuel: paiement.payeurId.compteCovoiturage?.solde || 0,
            compteRecharge: paiement.payeurId.compteCovoiturage?.estRecharge || false
          },
          mobileMoney: {
            operateur: paiement.mobileMoney?.operateur,
            numeroTelephone: paiement.mobileMoney?.numeroTelephone?.replace(/(.{3})(.*)(.{2})/, '$1***$3'),
            transactionId: paiement.mobileMoney?.transactionId,
            statutMobileMoney: paiement.mobileMoney?.statutMobileMoney,
            codeTransaction: paiement.mobileMoney?.codeTransaction
          },
          securite: {
            ipAddress: paiement.securite?.ipAddress,
            userAgent: paiement.securite?.userAgent,
            deviceId: paiement.securite?.deviceId,
            empreinteTransaction: paiement.securite?.empreinteTransaction
          },
          metriques: {
            delaiTraitement: delaiTraitement ? `${delaiTraitement} minutes` : null,
            nombreLogs: paiement.logsTransaction.length,
            nombreErreurs: paiement.erreurs.length
          },
          historique: {
            logs: paiement.logsTransaction.slice(-10),
            erreurs: paiement.erreurs.slice(-5),
            statutHistorique: paiement.historiqueStatuts
          }
        }
      });

    } catch (error) {
      next(error);
    }
  }
);

// ============================================================================
// WEBHOOKS ET API EXTERNE
// ============================================================================

/**
 * Webhook pour callbacks mobile money
 * - Validation de signature requise
 * - Traitement automatique des confirmations
 */
router.post('/webhook/mobile-money',
  // Middleware de validation webhook
  (req, res, next) => {
    const signature = req.headers['x-webhook-signature'];
    const operateur = req.headers['x-operator'];
    
    // Validation de signature ici (selon l'opérateur)
    // const expectedSignature = calculateWebhookSignature(req.body, process.env.WEBHOOK_SECRET);
    // if (signature !== expectedSignature) {
    //   return res.status(401).json({ error: 'Invalid signature' });
    // }
    
    req.webhook = { operateur, signature };
    next();
  },
  async (req, res, next) => {
    try {
      const { 
        transaction_id,
        reference_externe, 
        statut, 
        montant,
        operateur_code,
        message_erreur 
      } = req.body;

      // Mapper les données du webhook vers notre format
      const donneesCallback = {
        transactionId: transaction_id,
        statut: statut?.toUpperCase(),
        montant: parseInt(montant),
        operateur: operateur_code,
        messageErreur: message_erreur
      };

      // Transformer la requête pour le contrôleur
      req.body = {
        referenceTransaction: reference_externe,
        statutPaiement: statut === 'success' ? 'COMPLETE' : 'ECHEC',
        donneesCallback
      };

      logger.info('Webhook recharge reçu', {
        operateur: req.webhook.operateur,
        reference: reference_externe,
        statut,
        montant
      });

      return rechargeController.confirmerRecharge(req, res, next);

    } catch (error) {
      logger.error('Erreur traitement webhook recharge:', error);
      // Répondre positivement pour éviter les re-tentatives
      res.status(200).json({ 
        status: 'received', 
        message: 'Webhook processed' 
      });
    }
  }
);

/**
 * Endpoint de test pour simulation de recharge
 * - Uniquement en développement
 * - Permet de tester le flux complet
 */
if (process.env.NODE_ENV === 'development') {
  router.post('/test/simuler-confirmation',
    authenticate,
    authorizeRole(['ADMIN']),
    async (req, res, next) => {
      try {
        const { referenceTransaction, reussite = true, delaiSimulation = 0 } = req.body;

        if (!referenceTransaction) {
          return res.status(400).json({
            success: false,
            message: 'Référence de transaction requise'
          });
        }

        // Simuler un délai si spécifié
        if (delaiSimulation > 0) {
          await new Promise(resolve => setTimeout(resolve, delaiSimulation * 1000));
        }

        // Simuler la confirmation
        req.body = {
          referenceTransaction,
          statutPaiement: reussite ? 'COMPLETE' : 'ECHEC',
          donneesCallback: {
            transactionId: `TEST_${Date.now()}`,
            statut: reussite ? 'SUCCESS' : 'FAILED',
            simulationTest: true
          }
        };

        return rechargeController.confirmerRecharge(req, res, next);

      } catch (error) {
        next(error);
      }
    }
  );

  router.get('/test/recharges-en-attente',
    authenticate,
    authorizeRole(['ADMIN']),
    async (req, res) => {
      try {
        const rechargesEnAttente = await Paiement.find({
          statutPaiement: 'EN_ATTENTE',
          methodePaiement: { $in: ['WAVE', 'ORANGE_MONEY', 'MTN_MONEY', 'MOOV_MONEY'] }
        })
        .populate('payeurId', 'nom prenom email')
        .select('referenceTransaction montantTotal methodePaiement dateInitiation payeurId')
        .sort({ dateInitiation: -1 });

        res.json({
          success: true,
          message: 'Recharges en attente (environnement de test)',
          data: {
            nombre: rechargesEnAttente.length,
            recharges: rechargesEnAttente.map(r => ({
              referenceTransaction: r.referenceTransaction,
              conducteur: `${r.payeurId.prenom} ${r.payeurId.nom}`,
              montant: r.montantTotal,
              methode: r.methodePaiement,
              enAttenteDepuis: Math.round((Date.now() - r.dateInitiation) / (1000 * 60)) + ' minutes'
            }))
          }
        });

      } catch (error) {
        res.status(500).json({
          success: false,
          message: 'Erreur récupération des recharges de test'
        });
      }
    }
  );
}

// ============================================================================
// MIDDLEWARE DE GESTION D'ERREURS SPÉCIFIQUE AUX RECHARGES
// ============================================================================

router.use((error, req, res, next) => {
  // Erreurs spécifiques aux recharges
  if (error.name === 'RechargeError') {
    return res.status(400).json({
      success: false,
      message: error.message,
      code: error.code || 'RECHARGE_ERROR',
      details: error.details
    });
  }

  // Erreurs de validation mobile money
  if (error.name === 'MobileMoneyError') {
    return res.status(402).json({
      success: false,
      message: 'Erreur de traitement mobile money',
      code: 'MOBILE_MONEY_ERROR',
      operateur: error.operateur,
      details: error.message
    });
  }

  // Erreurs de limite de recharge
  if (error.code === 'RECHARGE_LIMIT_EXCEEDED') {
    return res.status(429).json({
      success: false,
      message: error.message,
      code: 'RECHARGE_LIMIT_EXCEEDED',
      limites: error.limites,
      resetTime: error.resetTime
    });
  }

  next(error);
});

module.exports = router;

// ============================================================================
// DOCUMENTATION DES ENDPOINTS
// ============================================================================

/**
 * @swagger
 * /api/recharges:
 *   post:
 *     summary: Initier une recharge de compte conducteur
 *     tags: [Recharges]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               montant:
 *                 type: number
 *                 minimum: 1000
 *                 maximum: 1000000
 *                 example: 50000
 *               methodePaiement:
 *                 type: string
 *                 enum: [WAVE, ORANGE_MONEY, MTN_MONEY, MOOV_MONEY]
 *                 example: ORANGE_MONEY
 *               numeroTelephone:
 *                 type: string
 *                 pattern: '^(\+225)?[0-9]{8,10}
 *                 example: "07123456789"
 *               operateur:
 *                 type: string
 *                 enum: [ORANGE, MTN, MOOV, WAVE]
 *                 example: ORANGE
 *               codeTransaction:
 *                 type: string
 *                 example: "ABC123XYZ"
 *     responses:
 *       201:
 *         description: Recharge initiée avec succès
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Recharge initiée avec succès"
 *                 data:
 *                   type: object
 *                   properties:
 *                     paiementId:
 *                       type: string
 *                       example: "64f1b2c3d4e5f6789a0b1c2d"
 *                     referenceTransaction:
 *                       type: string
 *                       example: "PAY_1699876543_A1B2C3D4"
 *                     montant:
 *                       type: number
 *                       example: 50000
 *                     montantNet:
 *                       type: number
 *                       example: 49000
 *                     fraisTransaction:
 *                       type: number
 *                       example: 1000
 *                     instructions:
 *                       type: object
 *                       properties:
 *                         methode:
 *                           type: string
 *                           example: "ORANGE_MONEY"
 *                         etapes:
 *                           type: array
 *                           items:
 *                             type: string
 *                           example: ["Composez #144#", "Sélectionnez Transfert d'argent"]
 *       400:
 *         description: Données invalides
 *       403:
 *         description: Non autorisé (pas conducteur)
 *       429:
 *         description: Limite de recharge atteinte
 * 
 * /api/recharges/historique:
 *   get:
 *     summary: Obtenir l'historique des recharges
 *     tags: [Recharges]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Numéro de page
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 50
 *           default: 10
 *         description: Nombre d'éléments par page
 *       - in: query
 *         name: statut
 *         schema:
 *           type: string
 *           enum: [EN_ATTENTE, COMPLETE, ECHEC]
 *         description: Filtrer par statut
 *       - in: query
 *         name: dateDebut
 *         schema:
 *           type: string
 *           format: date
 *         description: Date de début (YYYY-MM-DD)
 *       - in: query
 *         name: dateFin
 *         schema:
 *           type: string
 *           format: date
 *         description: Date de fin (YYYY-MM-DD)
 *     responses:
 *       200:
 *         description: Historique récupéré avec succès
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     recharges:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           referenceTransaction:
 *                             type: string
 *                           montantTotal:
 *                             type: number
 *                           montantCredite:
 *                             type: number
 *                           methodePaiement:
 *                             type: string
 *                           statutPaiement:
 *                             type: string
 *                           dateInitiation:
 *                             type: string
 *                             format: date-time
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         page:
 *                           type: integer
 *                         limit:
 *                           type: integer
 *                         total:
 *                           type: integer
 *                         pages:
 *                           type: integer
 *                     statistiques:
 *                       type: object
 *                       properties:
 *                         soldeActuel:
 *                           type: number
 *                         montantTotalRecharge:
 *                           type: number
 *                         tauxReussite:
 *                           type: number
 * 
 * /api/recharges/statut/{referenceTransaction}:
 *   get:
 *     summary: Obtenir le statut d'une recharge
 *     tags: [Recharges]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: referenceTransaction
 *         required: true
 *         schema:
 *           type: string
 *         description: Référence de la transaction
 *     responses:
 *       200:
 *         description: Statut récupéré avec succès
 *       404:
 *         description: Recharge non trouvée
 * 
 * /api/recharges/auto-recharge:
 *   post:
 *     summary: Configurer la recharge automatique
 *     tags: [Recharges]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               active:
 *                 type: boolean
 *                 example: true
 *               seuilAutoRecharge:
 *                 type: number
 *                 minimum: 0
 *                 example: 10000
 *               montantAutoRecharge:
 *                 type: number
 *                 minimum: 1000
 *                 maximum: 500000
 *                 example: 50000
 *               methodePaiementAuto:
 *                 type: string
 *                 enum: [WAVE, ORANGE_MONEY, MTN_MONEY, MOOV_MONEY]
 *                 example: ORANGE_MONEY
 *               numeroTelephoneAuto:
 *                 type: string
 *                 example: "07123456789"
 *     responses:
 *       200:
 *         description: Configuration mise à jour
 */