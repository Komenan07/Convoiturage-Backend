// routes/paiementRoutes.js
const express = require('express');
const router = express.Router();
const { body, param, query } = require('express-validator');
const PaiementController = require('../../controllers/PaiementController');
const authMiddleware = require('../../middlewares/auth/authMiddleware');
const adminMiddleware = require('../../middlewares/auth/authMiddleware').adminMiddleware;
const rateLimiter = require('../../middlewares/rateLimiter');

// ===== MIDDLEWARES DE VALIDATION =====

const validationCreerPaiement = [
  body('reservationId')
    .isMongoId()
    .withMessage('ID de réservation invalide'),
  
  body('payeurId')
    .isMongoId()
    .withMessage('ID de payeur invalide'),
  
  body('beneficiaireId')
    .isMongoId()
    .withMessage('ID de bénéficiaire invalide'),
  
  body('montantTotal')
    .isFloat({ min: 0.01 })
    .withMessage('Le montant total doit être supérieur à 0'),
  
  body('methodePaiement')
    .isIn(['ESPECES', 'WAVE', 'ORANGE_MONEY', 'MTN_MONEY', 'MOOV_MONEY', 'COMPTE_RECHARGE'])
    .withMessage('Méthode de paiement non supportée'),
  
  body('fraisTransaction')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Les frais de transaction doivent être positifs'),
  
  body('numeroTelephone')
    .optional()
    .matches(/^(\+225)?[0-9]{8,10}$/)
    .withMessage('Numéro de téléphone invalide'),
  
  body('operateur')
    .optional()
    .isIn(['WAVE', 'ORANGE', 'MTN', 'MOOV'])
    .withMessage('Opérateur mobile money invalide'),
  
  body('deviceId')
    .optional()
    .isString()
    .withMessage('Device ID invalide'),
  
  body('repartitionFrais.peages')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Frais de péages invalides'),
  
  body('repartitionFrais.carburant')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Frais de carburant invalides'),
  
  body('repartitionFrais.usureVehicule')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Frais d\'usure véhicule invalides')
];

const validationPaiementMobile = [
  param('paiementId')
    .isMongoId()
    .withMessage('ID de paiement invalide'),
  
  body('numeroTelephone')
    .matches(/^(\+225)?[0-9]{8,10}$/)
    .withMessage('Numéro de téléphone invalide'),
  
  body('operateur')
    .isIn(['WAVE', 'ORANGE', 'MTN', 'MOOV'])
    .withMessage('Opérateur mobile money invalide'),
  
  body('codePin')
    .optional()
    .isString()
    .isLength({ min: 4, max: 6 })
    .withMessage('Code PIN invalide')
];

const validationMiseAJourStatut = [
  param('paiementId')
    .isMongoId()
    .withMessage('ID de paiement invalide'),
  
  body('nouveauStatut')
    .isIn(['EN_ATTENTE', 'TRAITE', 'COMPLETE', 'ECHEC', 'REMBOURSE'])
    .withMessage('Statut de paiement invalide'),
  
  body('raison')
    .optional()
    .isString()
    .isLength({ max: 500 })
    .withMessage('La raison ne peut dépasser 500 caractères')
];

const validationCallback = [
  body('transactionId')
    .isString()
    .notEmpty()
    .withMessage('ID de transaction requis'),
  
  body('statut')
    .isIn(['SUCCESS', 'FAILED', 'TIMEOUT', 'PENDING'])
    .withMessage('Statut de transaction invalide'),
  
  body('codeTransaction')
    .optional()
    .isString(),
  
  body('montant')
    .optional()
    .isFloat({ min: 0 }),
  
  body('fraisOperateur')
    .optional()
    .isFloat({ min: 0 }),
  
  body('referencePaiement')
    .optional()
    .isString()
];

const validationListePaiements = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Numéro de page invalide'),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limite invalide (1-100)'),
  
  query('statutPaiement')
    .optional()
    .isIn(['EN_ATTENTE', 'TRAITE', 'COMPLETE', 'ECHEC', 'REMBOURSE']),
  
  query('methodePaiement')
    .optional()
    .isIn(['ESPECES', 'WAVE', 'ORANGE_MONEY', 'MTN_MONEY', 'MOOV_MONEY', 'COMPTE_RECHARGE']),
  
  query('payeurId')
    .optional()
    .isMongoId()
    .withMessage('ID de payeur invalide'),
  
  query('beneficiaireId')
    .optional()
    .isMongoId()
    .withMessage('ID de bénéficiaire invalide'),
  
  query('dateDebut')
    .optional()
    .isISO8601()
    .withMessage('Date de début invalide'),
  
  query('dateFin')
    .optional()
    .isISO8601()
    .withMessage('Date de fin invalide'),
  
  query('montantMin')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Montant minimum invalide'),
  
  query('montantMax')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Montant maximum invalide')
];

const validationRemboursement = [
  param('paiementId')
    .isMongoId()
    .withMessage('ID de paiement invalide'),
  
  body('motif')
    .isString()
    .isLength({ min: 10, max: 500 })
    .withMessage('Le motif doit contenir entre 10 et 500 caractères'),
  
  body('montantRemboursement')
    .optional()
    .isFloat({ min: 0.01 })
    .withMessage('Le montant de remboursement doit être supérieur à 0')
];

const validationStatistiques = [
  query('dateDebut')
    .optional()
    .isISO8601()
    .withMessage('Date de début invalide'),
  
  query('dateFin')
    .optional()
    .isISO8601()
    .withMessage('Date de fin invalide'),
  
  query('periode')
    .optional()
    .isInt({ min: 1, max: 365 })
    .withMessage('Période invalide (1-365 jours)')
];

// ===== MIDDLEWARE DE RATE LIMITING =====
const rateLimitPaiement = rateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 paiements max par 15 minutes
  message: 'Trop de tentatives de paiement. Réessayez dans 15 minutes.',
  keyGenerator: (req) => `payment_${req.user?.id || req.ip}`
});

const rateLimitCallback = rateLimiter({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // 100 callbacks max par minute
  message: 'Trop de callbacks. Réessayez dans 1 minute.',
  skip: (req) => req.ip === process.env.MOBILE_MONEY_CALLBACK_IP
});

// ===== ROUTES PUBLIQUES =====

/**
 * @route   POST /api/paiements/callback/mobile-money
 * @desc    Callback des fournisseurs mobile money
 * @access  Public (avec vérification IP)
 */
router.post('/callback/mobile-money', 
  rateLimitCallback,
  validationCallback,
  PaiementController.traiterCallbackMobile
);

// ===== ROUTES AUTHENTIFIÉES =====

/**
 * @route   POST /api/paiements
 * @desc    Créer un nouveau paiement
 * @access  Private
 */
router.post('/',
  authMiddleware,
  rateLimitPaiement,
  validationCreerPaiement,
  PaiementController.creerPaiement
);

/**
 * @route   POST /api/paiements/:paiementId/mobile
 * @desc    Initier un paiement mobile money
 * @access  Private
 */
router.post('/:paiementId/mobile',
  authMiddleware,
  rateLimitPaiement,
  validationPaiementMobile,
  PaiementController.initierPaiementMobile
);

/**
 * @route   GET /api/paiements/:paiementId
 * @desc    Obtenir les détails d'un paiement
 * @access  Private
 */
router.get('/:paiementId',
  authMiddleware,
  param('paiementId').isMongoId().withMessage('ID de paiement invalide'),
  PaiementController.obtenirPaiement
);

/**
 * @route   GET /api/paiements
 * @desc    Lister les paiements avec filtres
 * @access  Private
 */
router.get('/',
  authMiddleware,
  validationListePaiements,
  PaiementController.listerPaiements
);

/**
 * @route   GET /api/paiements/utilisateur/:utilisateurId/historique
 * @desc    Historique des paiements d'un utilisateur
 * @access  Private
 */
router.get('/utilisateur/:utilisateurId/historique',
  authMiddleware,
  param('utilisateurId').isMongoId().withMessage('ID utilisateur invalide'),
  query('page').optional().isInt({ min: 1 }).withMessage('Page invalide'),
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limite invalide'),
  PaiementController.historiquePaiementsUtilisateur
);

/**
 * @route   PUT /api/paiements/:paiementId/statut
 * @desc    Mettre à jour le statut d'un paiement
 * @access  Private (Admin uniquement)
 */
router.put('/:paiementId/statut',
  authMiddleware,
  adminMiddleware,
  validationMiseAJourStatut,
  PaiementController.mettreAJourStatut
);

/**
 * @route   POST /api/paiements/:paiementId/remboursement
 * @desc    Initier un remboursement
 * @access  Private (Admin uniquement)
 */
router.post('/:paiementId/remboursement',
  authMiddleware,
  adminMiddleware,
  validationRemboursement,
  PaiementController.initierRemboursement
);

/**
 * @route   GET /api/paiements/:paiementId/integrite
 * @desc    Vérifier l'intégrité d'un paiement
 * @access  Private (Admin uniquement)
 */
router.get('/:paiementId/integrite',
  authMiddleware,
  adminMiddleware,
  param('paiementId').isMongoId().withMessage('ID de paiement invalide'),
  PaiementController.verifierIntegrite
);

// ===== ROUTES ADMINISTRATIVES =====

/**
 * @route   GET /api/paiements/admin/dashboard
 * @desc    Dashboard administrateur des paiements
 * @access  Private (Admin uniquement)
 */
router.get('/admin/dashboard',
  authMiddleware,
  adminMiddleware,
  PaiementController.dashboardAdmin
);

/**
 * @route   GET /api/paiements/admin/commissions/statistiques
 * @desc    Statistiques des commissions
 * @access  Private (Admin uniquement)
 */
router.get('/admin/commissions/statistiques',
  authMiddleware,
  adminMiddleware,
  validationStatistiques,
  PaiementController.statistiquesCommissions
);

/**
 * @route   POST /api/paiements/admin/commissions/retraiter
 * @desc    Retraiter les commissions en échec
 * @access  Private (Admin uniquement)
 */
router.post('/admin/commissions/retraiter',
  authMiddleware,
  adminMiddleware,
  PaiementController.retraiterCommissionsEchec
);

/**
 * @route   GET /api/paiements/admin/rapports/revenus
 * @desc    Rapport de revenus
 * @access  Private (Admin uniquement)
 */
router.get('/admin/rapports/revenus',
  authMiddleware,
  adminMiddleware,
  validationStatistiques,
  PaiementController.rapportRevenus
);

// ===== ROUTES SPÉCIALISÉES =====

/**
 * @route   GET /api/paiements/statistiques/modes-paiement
 * @desc    Statistiques par mode de paiement
 * @access  Private (Admin uniquement)
 */
router.get('/statistiques/modes-paiement',
  authMiddleware,
  adminMiddleware,
  async (req, res) => {
    try {
      const Paiement = require('../models/Paiement');
      const statistiques = await Paiement.statistiquesParModePaiement();
      
      res.status(200).json({
        success: true,
        data: statistiques
      });
    } catch (error) {
      console.error('Erreur statistiques modes paiement:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors du calcul des statistiques',
        error: error.message
      });
    }
  }
);

/**
 * @route   GET /api/paiements/en-attente
 * @desc    Paiements en attente de traitement
 * @access  Private (Admin uniquement)
 */
router.get('/en-attente',
  authMiddleware,
  adminMiddleware,
  async (req, res) => {
    try {
      const Paiement = require('../models/Paiement');
      const paiementsEnAttente = await Paiement.obtenirPaiementsEnAttente();
      
      res.status(200).json({
        success: true,
        data: paiementsEnAttente,
        total: paiementsEnAttente.length
      });
    } catch (error) {
      console.error('Erreur paiements en attente:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des paiements en attente',
        error: error.message
      });
    }
  }
);

/**
 * @route   GET /api/paiements/commissions/echec
 * @desc    Commissions en échec
 * @access  Private (Admin uniquement)
 */
router.get('/commissions/echec',
  authMiddleware,
  adminMiddleware,
  async (req, res) => {
    try {
      const Paiement = require('../models/Paiement');
      const commissionsEchec = await Paiement.obtenirCommissionsEnEchec();
      
      res.status(200).json({
        success: true,
        data: commissionsEchec.map(p => ({
          paiementId: p._id,
          referenceTransaction: p.referenceTransaction,
          montantCommission: p.commission.montant,
          beneficiaire: p.beneficiaireId,
          reservation: p.reservationId,
          dateEchec: p.commission.datePrelevement,
          erreur: p.erreurs[p.erreurs.length - 1]
        })),
        total: commissionsEchec.length
      });
    } catch (error) {
      console.error('Erreur commissions échec:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des commissions en échec',
        error: error.message
      });
    }
  }
);

// ===== ROUTES DE RECHERCHE AVANCÉE =====

/**
 * @route   POST /api/paiements/recherche
 * @desc    Recherche avancée de paiements
 * @access  Private (Admin uniquement)
 */
router.post('/recherche',
  authMiddleware,
  adminMiddleware,
  [
    body('criteres').isObject().withMessage('Critères de recherche requis'),
    body('criteres.referenceTransaction').optional().isString(),
    body('criteres.numeroTelephone').optional().matches(/^(\+225)?[0-9]{8,10}$/),
    body('criteres.transactionId').optional().isString(),
    body('criteres.plageCommission').optional().isObject(),
    body('sortBy').optional().isString(),
    body('sortOrder').optional().isIn(['asc', 'desc']),
    body('page').optional().isInt({ min: 1 }),
    body('limit').optional().isInt({ min: 1, max: 100 })
  ],
  async (req, res) => {
    try {
      const {
        criteres,
        sortBy = 'dateInitiation',
        sortOrder = 'desc',
        page = 1,
        limit = 20
      } = req.body;

      const Paiement = require('../models/Paiement');
      
      // Construire la requête de recherche
      let query = {};
      
      if (criteres.referenceTransaction) {
        query.referenceTransaction = new RegExp(criteres.referenceTransaction, 'i');
      }
      
      if (criteres.numeroTelephone) {
        query['mobileMoney.numeroTelephone'] = criteres.numeroTelephone;
      }
      
      if (criteres.transactionId) {
        query['mobileMoney.transactionId'] = criteres.transactionId;
      }
      
      if (criteres.plageCommission) {
        query['commission.montant'] = {};
        if (criteres.plageCommission.min) {
          query['commission.montant'].$gte = criteres.plageCommission.min;
        }
        if (criteres.plageCommission.max) {
          query['commission.montant'].$lte = criteres.plageCommission.max;
        }
      }

      // Exécuter la recherche
      const sort = {};
      sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

      const resultats = await Paiement.find(query)
        .populate('payeurId beneficiaireId', 'nom prenom email telephone')
        .populate('reservationId', 'numeroReservation')
        .sort(sort)
        .limit(limit * 1)
        .skip((page - 1) * limit);

      const total = await Paiement.countDocuments(query);

      res.status(200).json({
        success: true,
        data: resultats.map(p => p.obtenirResume()),
        pagination: {
          page: parseInt(page),
          pages: Math.ceil(total / limit),
          total,
          limit: parseInt(limit)
        },
        criteres
      });

    } catch (error) {
      console.error('Erreur recherche avancée:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la recherche',
        error: error.message
      });
    }
  }
);

// ===== ROUTES D'EXPORT =====

/**
 * @route   GET /api/paiements/export/csv
 * @desc    Exporter les paiements en CSV
 * @access  Private (Admin uniquement)
 */
router.get('/export/csv',
  authMiddleware,
  adminMiddleware,
  validationListePaiements,
  async (req, res) => {
    try {
      const {
        dateDebut,
        dateFin,
        statutPaiement,
        methodePaiement
      } = req.query;

      // Construire les filtres
      const filtres = {};
      if (statutPaiement) filtres.statutPaiement = statutPaiement;
      if (methodePaiement) filtres.methodePaiement = methodePaiement;
      
      if (dateDebut || dateFin) {
        filtres.dateInitiation = {};
        if (dateDebut) filtres.dateInitiation.$gte = new Date(dateDebut);
        if (dateFin) filtres.dateInitiation.$lte = new Date(dateFin);
      }

      const Paiement = require('../models/Paiement');
      const paiements = await Paiement.find(filtres)
        .populate('payeurId beneficiaireId', 'nom prenom email')
        .populate('reservationId', 'numeroReservation')
        .sort({ dateInitiation: -1 })
        .limit(1000); // Limiter l'export

      // Générer le CSV
      const csv = require('csv-writer');
      const createCsvWriter = csv.createObjectCsvWriter;
      
      const csvWriter = createCsvWriter({
        path: `/tmp/paiements_export_${Date.now()}.csv`,
        header: [
          {id: 'referenceTransaction', title: 'Référence'},
          {id: 'payeur', title: 'Payeur'},
          {id: 'beneficiaire', title: 'Bénéficiaire'},
          {id: 'montantTotal', title: 'Montant Total'},
          {id: 'commission', title: 'Commission'},
          {id: 'montantConducteur', title: 'Montant Conducteur'},
          {id: 'methodePaiement', title: 'Mode Paiement'},
          {id: 'statutPaiement', title: 'Statut'},
          {id: 'dateInitiation', title: 'Date Initiation'},
          {id: 'dateCompletion', title: 'Date Completion'}
        ]
      });

      const donnees = paiements.map(p => ({
        referenceTransaction: p.referenceTransaction,
        payeur: `${p.payeurId?.nom} ${p.payeurId?.prenom}`,
        beneficiaire: `${p.beneficiaireId?.nom} ${p.beneficiaireId?.prenom}`,
        montantTotal: p.montantTotal,
        commission: p.commission.montant,
        montantConducteur: p.montantConducteur,
        methodePaiement: p.methodePaiement,
        statutPaiement: p.statutPaiement,
        dateInitiation: p.dateInitiation?.toISOString(),
        dateCompletion: p.dateCompletion?.toISOString()
      }));

      await csvWriter.writeRecords(donnees);

      res.status(200).json({
        success: true,
        message: 'Export CSV généré avec succès',
        data: {
          nombreEnregistrements: donnees.length,
          filtres: req.query
        }
      });

    } catch (error) {
      console.error('Erreur export CSV:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de l\'export CSV',
        error: error.message
      });
    }
  }
);

// ===== GESTION D'ERREURS =====
router.use((error, req, res, _next) => {
  console.error('Erreur route paiement:', error);
  
  if (error.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      message: 'Erreur de validation',
      errors: Object.values(error.errors).map(err => err.message)
    });
  }

  if (error.name === 'CastError') {
    return res.status(400).json({
      success: false,
      message: 'ID invalide'
    });
  }

  res.status(500).json({
    success: false,
    message: 'Erreur serveur interne',
    error: process.env.NODE_ENV === 'development' ? error.message : 'Une erreur est survenue'
  });
});

module.exports = router;