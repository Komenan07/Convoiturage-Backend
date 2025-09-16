// routes/commissions.js
// Routes complètes pour la gestion des commissions WAYZ-ECO

const express = require('express');
const router = express.Router();

// Import des middlewares d'authentification et autorisation
const { authenticate, authorizeRole } = require('../../middlewares/auth/authMiddleware');

// Import des middlewares de validation
const { validateObjectId, validatePagination, validateQueryParams } = require('../../middlewares/validation/userValidation');

// Import du contrôleur de commissions
const commissionController = require('../../controllers/paiement/commissionController');

// Import des utilitaires
const { logger } = require('../../utils/logger');

// Middleware de logging des actions commissions
const logCommissionAction = (action) => {
  return (req, res, next) => {
    req.commissionAction = action;
    req.timestamp = new Date();
    req.adminInfo = {
      userId: req.user?.userId,
      role: req.user?.role,
      ip: req.ip
    };
    next();
  };
};

// Middleware de validation pour les actions en lot
const validateBulkActions = (req, res, next) => {
  const { paiementIds, action } = req.body;

  if (!paiementIds || !Array.isArray(paiementIds)) {
    return res.status(400).json({
      success: false,
      message: 'Liste des IDs de paiement requise (tableau)'
    });
  }

  if (paiementIds.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Au moins un ID de paiement requis'
    });
  }

  if (paiementIds.length > 100) {
    return res.status(400).json({
      success: false,
      message: 'Maximum 100 paiements par action en lot'
    });
  }

  const actionsValides = ['retry', 'waive', 'manual'];
  if (action && !actionsValides.includes(action)) {
    return res.status(400).json({
      success: false,
      message: 'Action invalide (retry, waive, manual)',
      actionsDisponibles: actionsValides
    });
  }

  next();
};

// Middleware de validation pour l'ajustement de taux
const validateTauxAjustement = (req, res, next) => {
  const { nouveauTaux, appliquerAux, raison, paiementIds } = req.body;

  // Validation taux
  if (typeof nouveauTaux !== 'number') {
    return res.status(400).json({
      success: false,
      message: 'Le nouveau taux doit être un nombre'
    });
  }

  if (nouveauTaux < 0 || nouveauTaux > 0.5) {
    return res.status(400).json({
      success: false,
      message: 'Taux de commission invalide (0% à 50%)'
    });
  }

  // Validation raison
  if (!raison || typeof raison !== 'string' || raison.trim().length < 10) {
    return res.status(400).json({
      success: false,
      message: 'Raison de l\'ajustement requise (minimum 10 caractères)'
    });
  }

  // Validation selon le mode d'application
  const modesValides = ['nouveaux', 'specifiques'];
  if (!appliquerAux || !modesValides.includes(appliquerAux)) {
    return res.status(400).json({
      success: false,
      message: 'Mode d\'application invalide (nouveaux, specifiques)',
      modesDisponibles: modesValides
    });
  }

  if (appliquerAux === 'specifiques') {
    if (!paiementIds || !Array.isArray(paiementIds) || paiementIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'IDs de paiements requis pour application spécifique'
      });
    }

    if (paiementIds.length > 50) {
      return res.status(400).json({
        success: false,
        message: 'Maximum 50 paiements pour ajustement de taux'
      });
    }
  }

  next();
};

// ============================================================================
// ROUTES D'ADMINISTRATION DES COMMISSIONS (ADMIN SEULEMENT)
// ============================================================================

/**
 * Obtenir les statistiques globales des commissions
 * GET /api/commissions/stats
 */
router.get('/stats',
  authenticate,
  authorizeRole(['ADMIN', 'MODERATEUR']),
  logCommissionAction('VIEW_COMMISSION_STATS'),
  validateQueryParams(['dateDebut', 'dateFin', 'periode']),
  commissionController.getCommissionStats
);

/**
 * Traiter manuellement les commissions en échec
 * POST /api/commissions/traiter-echecs
 */
router.post('/traiter-echecs',
  authenticate,
  authorizeRole(['ADMIN']),
  logCommissionAction('PROCESS_FAILED_COMMISSIONS'),
  validateBulkActions,
  commissionController.traiterCommissionsEnEchec
);

/**
 * Ajuster le taux de commission
 * POST /api/commissions/ajuster-taux
 */
router.post('/ajuster-taux',
  authenticate,
  authorizeRole(['ADMIN']),
  logCommissionAction('ADJUST_COMMISSION_RATE'),
  validateTauxAjustement,
  commissionController.ajusterTauxCommission
);

/**
 * Obtenir le détail d'une commission spécifique
 * GET /api/commissions/detail/:paiementId
 */
router.get('/detail/:paiementId',
  authenticate,
  authorizeRole(['ADMIN', 'MODERATEUR']),
  validateObjectId('paiementId'),
  logCommissionAction('VIEW_COMMISSION_DETAIL'),
  commissionController.getCommissionDetail
);

/**
 * Générer un rapport de commissions
 * GET /api/commissions/rapport
 */
router.get('/rapport',
  authenticate,
  authorizeRole(['ADMIN', 'MODERATEUR']),
  logCommissionAction('GENERATE_COMMISSION_REPORT'),
  validateQueryParams(['format', 'dateDebut', 'dateFin', 'groupePar', 'includeDetails']),
  // Validation custom pour les paramètres de rapport
  (req, res, next) => {
    const { format, groupePar } = req.query;

    if (format) {
      const formatsValides = ['json', 'pdf', 'csv'];
      if (!formatsValides.includes(format.toLowerCase())) {
        return res.status(400).json({
          success: false,
          message: 'Format invalide (json, pdf, csv)',
          formatsDisponibles: formatsValides
        });
      }
    }

    if (groupePar) {
      const groupementsValides = ['heure', 'jour', 'semaine', 'mois'];
      if (!groupementsValides.includes(groupePar)) {
        return res.status(400).json({
          success: false,
          message: 'Groupement invalide (heure, jour, semaine, mois)',
          groupementsDisponibles: groupementsValides
        });
      }
    }

    next();
  },
  commissionController.genererRapportCommissions
);

/**
 * Surveiller les commissions en temps réel
 * GET /api/commissions/surveillance
 */
router.get('/surveillance',
  authenticate,
  authorizeRole(['ADMIN', 'MODERATEUR']),
  logCommissionAction('MONITOR_COMMISSIONS'),
  commissionController.surveillerCommissions
);

/**
 * Envoyer des notifications pour alertes critiques
 * POST /api/commissions/notification-critique
 */
router.post('/notification-critique',
  authenticate,
  authorizeRole(['ADMIN']),
  logCommissionAction('SEND_CRITICAL_NOTIFICATION'),
  // Validation des données de notification
  (req, res, next) => {
    const { typeAlerte, message, valeurSeuil, valeurActuelle, emailsDestinaires } = req.body;

    if (!typeAlerte || typeof typeAlerte !== 'string' || typeAlerte.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Type d\'alerte requis'
      });
    }

    if (!message || typeof message !== 'string' || message.trim().length < 10) {
      return res.status(400).json({
        success: false,
        message: 'Message d\'alerte requis (minimum 10 caractères)'
      });
    }

    if (valeurSeuil && typeof valeurSeuil !== 'number') {
      return res.status(400).json({
        success: false,
        message: 'Valeur seuil doit être numérique'
      });
    }

    if (valeurActuelle && typeof valeurActuelle !== 'number') {
      return res.status(400).json({
        success: false,
        message: 'Valeur actuelle doit être numérique'
      });
    }

    if (emailsDestinaires && !Array.isArray(emailsDestinaires)) {
      return res.status(400).json({
        success: false,
        message: 'Emails destinataires doit être un tableau'
      });
    }

    next();
  },
  commissionController.envoyerNotificationCommissionCritique
);

/**
 * Réconcilier les commissions avec les paiements
 * POST /api/commissions/reconcilier
 */
router.post('/reconcilier',
  authenticate,
  authorizeRole(['ADMIN']),
  logCommissionAction('RECONCILE_COMMISSIONS'),
  // Validation des paramètres de réconciliation
  (req, res, next) => {
    const { dateDebut, dateFin, forcerReconciliation } = req.body;

    if (!dateDebut || !dateFin) {
      return res.status(400).json({
        success: false,
        message: 'Dates de début et de fin requises'
      });
    }

    const debut = new Date(dateDebut);
    const fin = new Date(dateFin);

    if (isNaN(debut.getTime()) || isNaN(fin.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Format de date invalide (YYYY-MM-DD)'
      });
    }

    if (debut >= fin) {
      return res.status(400).json({
        success: false,
        message: 'Date de début doit être antérieure à date de fin'
      });
    }

    // Limiter la période de réconciliation (max 90 jours)
    const diffJours = (fin - debut) / (1000 * 60 * 60 * 24);
    if (diffJours > 90) {
      return res.status(400).json({
        success: false,
        message: 'Période de réconciliation maximum 90 jours'
      });
    }

    if (forcerReconciliation !== undefined && typeof forcerReconciliation !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'forcerReconciliation doit être un booléen'
      });
    }

    next();
  },
  commissionController.reconcilierCommissions
);

// ============================================================================
// ROUTES D'INFORMATION POUR LES CONDUCTEURS
// ============================================================================

/**
 * Obtenir ses propres commissions (conducteurs)
 * GET /api/commissions/mes-commissions
 */
router.get('/mes-commissions',
  authenticate,
  validatePagination,
  validateQueryParams(['dateDebut', 'dateFin', 'statut']),
  async (req, res, next) => {
    try {
      const userId = req.user.userId;
      const { page = 1, limit = 10 } = req.pagination;
      const { dateDebut, dateFin, statut } = req.query;

      // Import du modèle Paiement ici pour éviter les problèmes de dépendance circulaire
      const Paiement = require('../models/Paiement');

      // Construire les filtres
      const filtres = { beneficiaireId: userId };

      if (dateDebut || dateFin) {
        filtres.dateCompletion = {};
        if (dateDebut) filtres.dateCompletion.$gte = new Date(dateDebut);
        if (dateFin) filtres.dateCompletion.$lte = new Date(dateFin);
      }

      if (statut) {
        const statutsValides = ['preleve', 'en_attente', 'echec'];
        if (statutsValides.includes(statut)) {
          filtres['commission.statutPrelevement'] = statut;
        }
      }

      const paiements = await Paiement.find(filtres)
        .select('referenceTransaction montantTotal commission statutPaiement dateCompletion')
        .populate('reservationId', 'nombrePlaces')
        .sort({ dateCompletion: -1 })
        .skip((page - 1) * limit)
        .limit(limit);

      const total = await Paiement.countDocuments(filtres);

      // Statistiques personnelles
      const stats = await Paiement.aggregate([
        { $match: filtres },
        {
          $group: {
            _id: null,
            totalCommissions: { $sum: '$commission.montant' },
            nombrePaiements: { $sum: 1 },
            commissionsPrelevees: {
              $sum: {
                $cond: [
                  { $eq: ['$commission.statutPrelevement', 'preleve'] },
                  '$commission.montant',
                  0
                ]
              }
            }
          }
        }
      ]);

      const [statistiques] = stats.length > 0 ? stats : [{}];

      res.json({
        success: true,
        data: {
          commissions: paiements.map(p => ({
            id: p._id,
            referenceTransaction: p.referenceTransaction,
            montantTotal: p.montantTotal,
            commission: {
              montant: p.commission.montant,
              taux: p.commission.taux,
              statut: p.commission.statutPrelevement,
              datePrelevement: p.commission.datePrelevement
            },
            statutPaiement: p.statutPaiement,
            dateCompletion: p.dateCompletion,
            nombrePlaces: p.reservationId?.nombrePlaces || 1
          })),
          pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit)
          },
          statistiques: {
            totalCommissions: statistiques.totalCommissions || 0,
            nombrePaiements: statistiques.nombrePaiements || 0,
            commissionsPrelevees: statistiques.commissionsPrelevees || 0,
            tauxPrelevement: statistiques.totalCommissions > 0 ? 
              Math.round((statistiques.commissionsPrelevees / statistiques.totalCommissions) * 100) : 0
          }
        }
      });

    } catch (error) {
      logger.error('Erreur consultation commissions personnelles:', error);
      return next(new Error('Erreur consultation des commissions'));
    }
  }
);

/**
 * Obtenir le résumé des commissions pour un conducteur
 * GET /api/commissions/resume-conducteur
 */
router.get('/resume-conducteur',
  authenticate,
  async (req, res, next) => {
    try {
      const userId = req.user.userId;
      const mongoose = require('mongoose');
      const Paiement = require('../models/Paiement');
      
      const maintenant = new Date();
      const debutMois = new Date(maintenant.getFullYear(), maintenant.getMonth(), 1);

      // Statistiques globales
      const statsGlobales = await Paiement.aggregate([
        {
          $match: {
            beneficiaireId: mongoose.Types.ObjectId(userId),
            statutPaiement: 'COMPLETE'
          }
        },
        {
          $group: {
            _id: null,
            totalCommissions: { $sum: '$commission.montant' },
            nombrePaiements: { $sum: 1 },
            moyenneCommission: { $avg: '$commission.montant' },
            premierPaiement: { $min: '$dateCompletion' },
            dernierPaiement: { $max: '$dateCompletion' }
          }
        }
      ]);

      // Statistiques mensuelles
      const statsMois = await Paiement.aggregate([
        {
          $match: {
            beneficiaireId: mongoose.Types.ObjectId(userId),
            statutPaiement: 'COMPLETE',
            dateCompletion: { $gte: debutMois }
          }
        },
        {
          $group: {
            _id: null,
            commissionsCompteMois: { $sum: '$commission.montant' },
            paiementsCeMois: { $sum: 1 }
          }
        }
      ]);

      const [globales] = statsGlobales.length > 0 ? statsGlobales : [{}];
      const [mensuelles] = statsMois.length > 0 ? statsMois : [{}];

      res.json({
        success: true,
        data: {
          conducteurId: userId,
          resumeGlobal: {
            totalCommissions: globales.totalCommissions || 0,
            nombrePaiements: globales.nombrePaiements || 0,
            moyenneCommission: Math.round(globales.moyenneCommission || 0),
            premierPaiement: globales.premierPaiement,
            dernierPaiement: globales.dernierPaiement
          },
          performanceMois: {
            commissionsCompteMois: mensuelles.commissionsCompteMois || 0,
            paiementsCeMois: mensuelles.paiementsCeMois || 0,
            moyenneCommissionMois: mensuelles.paiementsCeMois > 0 ? 
              Math.round(mensuelles.commissionsCompteMois / mensuelles.paiementsCeMois) : 0
          },
          informations: {
            tauxCommissionStandard: '10%',
            modePrelevementPrincipal: 'Compte rechargé ou mobile money',
            delaiPrelevementMoyen: '< 24 heures'
          }
        }
      });

    } catch (error) {
      logger.error('Erreur résumé commissions conducteur:', error);
      return next(new Error('Erreur consultation du résumé'));
    }
  }
);

// ============================================================================
// ROUTES DE DÉVELOPPEMENT ET TEST
// ============================================================================

if (process.env.NODE_ENV === 'development') {
  /**
   * Simuler des commissions pour tests
   * POST /api/commissions/dev/simuler
   */
  router.post('/dev/simuler',
    authenticate,
    authorizeRole(['ADMIN']),
    async (req, res) => {
      try {
        const { 
          nombreCommissions = 10, 
          statutPrelevement = 'preleve',
          dateDebut = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
        } = req.body;

        const Paiement = require('../models/Paiement');
        const User = require('../models/Utilisateur');

        // Obtenir des utilisateurs conducteurs pour simulation
        const conducteurs = await User.find({ 
          role: { $in: ['conducteur', 'les_deux'] } 
        }).limit(5);

        if (conducteurs.length === 0) {
          return res.status(400).json({
            success: false,
            message: 'Aucun conducteur trouvé pour simulation'
          });
        }

        const commissionsCreees = [];
        
        for (let i = 0; i < nombreCommissions; i++) {
          const conducteur = conducteurs[Math.floor(Math.random() * conducteurs.length)];
          const montantTotal = Math.floor(Math.random() * 50000) + 5000; // 5k à 55k FCFA
          const commission = Math.floor(montantTotal * 0.1); // 10%

          const paiementSimule = new Paiement({
            payeurId: conducteur._id,
            beneficiaireId: conducteur._id,
            montantTotal,
            montantConducteur: montantTotal - commission,
            commissionPlateforme: commission,
            fraisTransaction: 0,
            commission: {
              taux: 0.10,
              montant: commission,
              modePrelevement: 'compte_recharge',
              statutPrelevement,
              datePrelevement: statutPrelevement === 'preleve' ? new Date() : undefined
            },
            methodePaiement: 'ESPECES',
            statutPaiement: 'COMPLETE',
            dateInitiation: new Date(dateDebut.getTime() + i * 60 * 60 * 1000),
            dateCompletion: new Date(dateDebut.getTime() + (i + 1) * 60 * 60 * 1000)
          });

          await paiementSimule.save();
          commissionsCreees.push({
            id: paiementSimule._id,
            conducteur: `${conducteur.prenom} ${conducteur.nom}`,
            montantTotal,
            commission,
            statut: statutPrelevement
          });
        }

        res.json({
          success: true,
          message: `${nombreCommissions} commissions simulées créées`,
          data: {
            commissionsCreees,
            parametres: { nombreCommissions, statutPrelevement, dateDebut }
          }
        });

      } catch (error) {
        logger.error('Erreur simulation commissions:', error);
        res.status(500).json({
          success: false,
          message: 'Erreur lors de la simulation'
        });
      }
    }
  );

  /**
   * Nettoyer les données de test
   * DELETE /api/commissions/dev/nettoyer
   */
  router.delete('/dev/nettoyer',
    authenticate,
    authorizeRole(['ADMIN']),
    async (req, res) => {
      try {
        const Paiement = require('../models/Paiement');
        
        // Supprimer les paiements créés dans les dernières 24h (probablement des tests)
        const il24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const result = await Paiement.deleteMany({
          createdAt: { $gte: il24h },
          methodePaiement: 'ESPECES' // Filtrer sur les paiements simulés
        });

        res.json({
          success: true,
          message: `${result.deletedCount} paiements de test supprimés`,
          data: {
            nombreSupprimes: result.deletedCount
          }
        });

      } catch (error) {
        logger.error('Erreur nettoyage données test:', error);
        res.status(500).json({
          success: false,
          message: 'Erreur lors du nettoyage'
        });
      }
    }
  );
}

// ============================================================================
// MIDDLEWARE DE GESTION D'ERREURS SPÉCIFIQUE AUX COMMISSIONS
// ============================================================================

router.use((error, req, res, next) => {
  // Erreurs spécifiques aux commissions
  if (error.name === 'CommissionError') {
    return res.status(400).json({
      success: false,
      message: error.message,
      code: error.code || 'COMMISSION_ERROR',
      details: error.details
    });
  }

  // Erreurs de validation commission
  if (error.code === 'COMMISSION_VALIDATION_ERROR') {
    return res.status(400).json({
      success: false,
      message: 'Erreur de validation des données de commission',
      code: 'COMMISSION_VALIDATION_ERROR',
      errors: error.errors
    });
  }

  // Erreurs d'autorisation
  if (error.code === 'COMMISSION_UNAUTHORIZED') {
    return res.status(403).json({
      success: false,
      message: 'Actions sur les commissions non autorisées',
      code: 'COMMISSION_UNAUTHORIZED'
    });
  }

  next(error);
});

module.exports = router;