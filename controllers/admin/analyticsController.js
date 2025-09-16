// =====================================================
// CONTRÔLEUR ANALYTICS
// =====================================================

const Utilisateur = require('../../models/Utilisateur');
const Trajet = require('../../models/Trajet');
const Reservation = require('../../models/Reservation');
const Signalement = require('../../models/Signalement');
const { validationResult } = require('express-validator');
const AppError = require('../../utils/AppError');
const { logger } = require('../../utils/logger');

// =====================================================
// STATISTIQUES GÉNÉRALES
// =====================================================

/**
 * @desc    Obtenir les statistiques générales de la plateforme
 * @route   GET /api/analytics/general
 * @access  Private (Admin)
 */
const obtenirStatistiquesGenerales = async (req, res, next) => {
  try {
    // Période d'analyse
    const { periode = '30' } = req.query;
    const joursAnalyse = parseInt(periode);
    const dateDebut = new Date();
    dateDebut.setDate(dateDebut.getDate() - joursAnalyse);

    // Stats des utilisateurs
    const totalUtilisateurs = await Utilisateur.countDocuments();
    const nouveauxUtilisateurs = await Utilisateur.countDocuments({
      dateInscription: { $gte: dateDebut }
    });
    
    // Stats par rôle
    const statsRoles = await Utilisateur.aggregate([
      {
        $group: {
          _id: '$role',
          count: { $sum: 1 }
        }
      }
    ]);
    
    // Stats par statut de compte
    const statsStatuts = await Utilisateur.aggregate([
      {
        $group: {
          _id: '$statutCompte',
          count: { $sum: 1 }
        }
      }
    ]);
    
    // Stats des trajets
    const totalTrajets = await Trajet.countDocuments();
    const nouveauxTrajets = await Trajet.countDocuments({
      dateCreation: { $gte: dateDebut }
    });
    
    // Stats des réservations
    const totalReservations = await Reservation.countDocuments();
    const nouvellesReservations = await Reservation.countDocuments({
      dateCreation: { $gte: dateDebut }
    });
    
    // Taux de complétion des trajets
    const trajetsCompletes = await Trajet.countDocuments({ statut: 'TERMINE' });
    const tauxCompletion = totalTrajets > 0 ? (trajetsCompletes / totalTrajets) * 100 : 0;
    
    // Statistiques financières globales (si disponibles)
    const statsFinancieres = await Utilisateur.aggregate([
      {
        $group: {
          _id: null,
          totalSolde: { $sum: '$compteCovoiturage.solde' },
          totalCommissions: { $sum: '$compteCovoiturage.totalCommissionsPayees' },
          totalGains: { $sum: '$compteCovoiturage.totalGagnes' },
          comptesRecharges: { 
            $sum: { 
              $cond: [{ $eq: ['$compteCovoiturage.estRecharge', true] }, 1, 0] 
            } 
          }
        }
      }
    ]);

    res.status(200).json({
      success: true,
      data: {
        utilisateurs: {
          total: totalUtilisateurs,
          nouveaux: nouveauxUtilisateurs,
          parRole: statsRoles,
          parStatut: statsStatuts
        },
        trajets: {
          total: totalTrajets,
          nouveaux: nouveauxTrajets,
          tauxCompletion
        },
        reservations: {
          total: totalReservations,
          nouvelles: nouvellesReservations
        },
        financier: statsFinancieres[0] || {}
      }
    });

  } catch (erreur) {
    logger.error('Erreur lors de la récupération des statistiques générales', {
      error: erreur.message,
      stack: erreur.stack
    });
    return next(new AppError('Erreur serveur lors de la récupération des statistiques', 500));
  }
};

// =====================================================
// STATISTIQUES ÉVOLUTIVES
// =====================================================

/**
 * @desc    Obtenir l'évolution des inscriptions
 * @route   GET /api/analytics/evolution-inscriptions
 * @access  Private (Admin)
 */
const obtenirEvolutionInscriptions = async (req, res, next) => {
  try {
    const { periode = '30', grouper = 'jour' } = req.query;
    const joursAnalyse = parseInt(periode);
    const dateDebut = new Date();
    dateDebut.setDate(dateDebut.getDate() - joursAnalyse);

    // Construire le pipeline d'agrégation en fonction du groupement
    let groupStage = {};
    
    if (grouper === 'jour') {
      groupStage = {
        $group: {
          _id: {
            year: { $year: '$dateInscription' },
            month: { $month: '$dateInscription' },
            day: { $dayOfMonth: '$dateInscription' }
          },
          count: { $sum: 1 }
        }
      };
    } else if (grouper === 'semaine') {
      groupStage = {
        $group: {
          _id: {
            year: { $year: '$dateInscription' },
            week: { $week: '$dateInscription' }
          },
          count: { $sum: 1 }
        }
      };
    } else if (grouper === 'mois') {
      groupStage = {
        $group: {
          _id: {
            year: { $year: '$dateInscription' },
            month: { $month: '$dateInscription' }
          },
          count: { $sum: 1 }
        }
      };
    }

    // Exécuter l'agrégation
    const evolution = await Utilisateur.aggregate([
      {
        $match: {
          dateInscription: { $gte: dateDebut }
        }
      },
      groupStage,
      {
        $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1, '_id.week': 1 }
      }
    ]);

    // Évolution par rôle
    const evolutionParRole = await Utilisateur.aggregate([
      {
        $match: {
          dateInscription: { $gte: dateDebut }
        }
      },
      {
        $group: {
          _id: {
            role: '$role',
            year: { $year: '$dateInscription' },
            month: { $month: '$dateInscription' }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1, '_id.role': 1 }
      }
    ]);

    res.status(200).json({
      success: true,
      data: {
        evolution,
        evolutionParRole
      }
    });

  } catch (erreur) {
    logger.error('Erreur lors de la récupération de l\'évolution des inscriptions', {
      error: erreur.message,
      stack: erreur.stack
    });
    return next(new AppError('Erreur serveur lors de la récupération de l\'évolution des inscriptions', 500));
  }
};

/**
 * @desc    Obtenir l'évolution des trajets
 * @route   GET /api/analytics/evolution-trajets
 * @access  Private (Admin)
 */
const obtenirEvolutionTrajets = async (req, res, next) => {
  try {
    const { periode = '30', grouper = 'jour' } = req.query;
    const joursAnalyse = parseInt(periode);
    const dateDebut = new Date();
    dateDebut.setDate(dateDebut.getDate() - joursAnalyse);

    // Construire le pipeline d'agrégation
    let groupStage = {};
    
    if (grouper === 'jour') {
      groupStage = {
        $group: {
          _id: {
            year: { $year: '$dateCreation' },
            month: { $month: '$dateCreation' },
            day: { $dayOfMonth: '$dateCreation' }
          },
          count: { $sum: 1 }
        }
      };
    } else if (grouper === 'semaine') {
      groupStage = {
        $group: {
          _id: {
            year: { $year: '$dateCreation' },
            week: { $week: '$dateCreation' }
          },
          count: { $sum: 1 }
        }
      };
    } else if (grouper === 'mois') {
      groupStage = {
        $group: {
          _id: {
            year: { $year: '$dateCreation' },
            month: { $month: '$dateCreation' }
          },
          count: { $sum: 1 }
        }
      };
    }

    // Exécuter l'agrégation
    const evolution = await Trajet.aggregate([
      {
        $match: {
          dateCreation: { $gte: dateDebut }
        }
      },
      groupStage,
      {
        $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1, '_id.week': 1 }
      }
    ]);

    // Évolution par statut
    const evolutionParStatut = await Trajet.aggregate([
      {
        $match: {
          dateCreation: { $gte: dateDebut }
        }
      },
      {
        $group: {
          _id: {
            statut: '$statut',
            year: { $year: '$dateCreation' },
            month: { $month: '$dateCreation' }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1, '_id.statut': 1 }
      }
    ]);

    res.status(200).json({
      success: true,
      data: {
        evolution,
        evolutionParStatut
      }
    });

  } catch (erreur) {
    logger.error('Erreur lors de la récupération de l\'évolution des trajets', {
      error: erreur.message,
      stack: erreur.stack
    });
    return next(new AppError('Erreur serveur lors de la récupération de l\'évolution des trajets', 500));
  }
};

/**
 * @desc    Obtenir l'évolution des réservations
 * @route   GET /api/analytics/evolution-reservations
 * @access  Private (Admin)
 */
const obtenirEvolutionReservations = async (req, res, next) => {
  try {
    const { periode = '30', grouper = 'jour' } = req.query;
    const joursAnalyse = parseInt(periode);
    const dateDebut = new Date();
    dateDebut.setDate(dateDebut.getDate() - joursAnalyse);

    // Construire le pipeline d'agrégation
    let groupStage = {};
    
    if (grouper === 'jour') {
      groupStage = {
        $group: {
          _id: {
            year: { $year: '$dateCreation' },
            month: { $month: '$dateCreation' },
            day: { $dayOfMonth: '$dateCreation' }
          },
          count: { $sum: 1 }
        }
      };
    } else if (grouper === 'semaine') {
      groupStage = {
        $group: {
          _id: {
            year: { $year: '$dateCreation' },
            week: { $week: '$dateCreation' }
          },
          count: { $sum: 1 }
        }
      };
    } else if (grouper === 'mois') {
      groupStage = {
        $group: {
          _id: {
            year: { $year: '$dateCreation' },
            month: { $month: '$dateCreation' }
          },
          count: { $sum: 1 }
        }
      };
    }

    // Exécuter l'agrégation
    const evolution = await Reservation.aggregate([
      {
        $match: {
          dateCreation: { $gte: dateDebut }
        }
      },
      groupStage,
      {
        $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1, '_id.week': 1 }
      }
    ]);

    // Évolution par statut
    const evolutionParStatut = await Reservation.aggregate([
      {
        $match: {
          dateCreation: { $gte: dateDebut }
        }
      },
      {
        $group: {
          _id: {
            statut: '$statut',
            year: { $year: '$dateCreation' },
            month: { $month: '$dateCreation' }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1, '_id.statut': 1 }
      }
    ]);

    res.status(200).json({
      success: true,
      data: {
        evolution,
        evolutionParStatut
      }
    });

  } catch (erreur) {
    logger.error('Erreur lors de la récupération de l\'évolution des réservations', {
      error: erreur.message,
      stack: erreur.stack
    });
    return next(new AppError('Erreur serveur lors de la récupération de l\'évolution des réservations', 500));
  }
};

// =====================================================
// STATISTIQUES FINANCIÈRES
// =====================================================

/**
 * @desc    Obtenir les statistiques financières
 * @route   GET /api/analytics/financier
 * @access  Private (Admin)
 */
const obtenirStatistiquesFinancieres = async (req, res, next) => {
  try {
    const { periode = '30' } = req.query;
    const joursAnalyse = parseInt(periode);
    const dateDebut = new Date();
    dateDebut.setDate(dateDebut.getDate() - joursAnalyse);

    // Statistiques générales des comptes covoiturage
    const statsComptes = await Utilisateur.aggregate([
      {
        $group: {
          _id: null,
          soldeTotal: { $sum: '$compteCovoiturage.solde' },
          commissionsTotal: { $sum: '$compteCovoiturage.totalCommissionsPayees' },
          gainsTotal: { $sum: '$compteCovoiturage.totalGagnes' },
          comptesRecharges: { 
            $sum: { 
              $cond: [{ $eq: ['$compteCovoiturage.estRecharge', true] }, 1, 0] 
            } 
          }
        }
      }
    ]);

    // Évolution des recharges
    const evolutionRecharges = await Utilisateur.aggregate([
      { $unwind: '$compteCovoiturage.historiqueRecharges' },
      {
        $match: {
          'compteCovoiturage.historiqueRecharges.statut': 'reussi',
          'compteCovoiturage.historiqueRecharges.date': { $gte: dateDebut }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$compteCovoiturage.historiqueRecharges.date' },
            month: { $month: '$compteCovoiturage.historiqueRecharges.date' },
            day: { $dayOfMonth: '$compteCovoiturage.historiqueRecharges.date' }
          },
          montantTotal: { $sum: '$compteCovoiturage.historiqueRecharges.montant' },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 }
      }
    ]);

    // Répartition des recharges par méthode de paiement
    const rechargesParMethode = await Utilisateur.aggregate([
      { $unwind: '$compteCovoiturage.historiqueRecharges' },
      {
        $match: {
          'compteCovoiturage.historiqueRecharges.statut': 'reussi',
          'compteCovoiturage.historiqueRecharges.date': { $gte: dateDebut }
        }
      },
      {
        $group: {
          _id: '$compteCovoiturage.historiqueRecharges.methodePaiement',
          montantTotal: { $sum: '$compteCovoiturage.historiqueRecharges.montant' },
          count: { $sum: 1 }
        }
      }
    ]);

    // Évolution des commissions prélevées
    const evolutionCommissions = await Utilisateur.aggregate([
      { $unwind: '$compteCovoiturage.historiqueCommissions' },
      {
        $match: {
          'compteCovoiturage.historiqueCommissions.statut': 'preleve',
          'compteCovoiturage.historiqueCommissions.date': { $gte: dateDebut }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$compteCovoiturage.historiqueCommissions.date' },
            month: { $month: '$compteCovoiturage.historiqueCommissions.date' },
            day: { $dayOfMonth: '$compteCovoiturage.historiqueCommissions.date' }
          },
          montantTotal: { $sum: '$compteCovoiturage.historiqueCommissions.montant' },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 }
      }
    ]);

    res.status(200).json({
      success: true,
      data: {
        statsComptes: statsComptes[0] || {},
        evolutionRecharges,
        rechargesParMethode,
        evolutionCommissions
      }
    });

  } catch (erreur) {
    logger.error('Erreur lors de la récupération des statistiques financières', {
      error: erreur.message,
      stack: erreur.stack
    });
    return next(new AppError('Erreur serveur lors de la récupération des statistiques financières', 500));
  }
};

// =====================================================
// RAPPORTS PERSONNALISÉS
// =====================================================

/**
 * @desc    Générer un rapport personnalisé
 * @route   POST /api/analytics/rapport-personnalise
 * @access  Private (Admin)
 */
const genererRapportPersonnalise = async (req, res, next) => {
  try {
    const { 
      type, 
      dateDebut, 
      dateFin, 
      filtres = {}, 
      champs = [],
      grouper
    } = req.body;

    // Validation
    const erreurs = validationResult(req);
    if (!erreurs.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Paramètres invalides',
        code: 'INVALID_PARAMETERS',
        erreurs: erreurs.array()
      });
    }

    // Définir les dates de début et fin
    const debut = dateDebut ? new Date(dateDebut) : new Date(0);
    const fin = dateFin ? new Date(dateFin) : new Date();

    // Préparation des filtres
    const filtrePeriode = {
      $gte: debut,
      $lte: fin
    };

    let modele;
    let champDate;
    let rapport = {};

    // Sélectionner le modèle approprié
    switch (type) {
      case 'utilisateurs': {
        modele = Utilisateur;
        champDate = 'dateInscription';
        break;
      }
      case 'trajets': {
        modele = Trajet;
        champDate = 'dateCreation';
        break;
      }
      case 'reservations': {
        modele = Reservation;
        champDate = 'dateCreation';
        break;
      }
      case 'signalements': {
        modele = Signalement;
        champDate = 'dateCreation';
        break;
      }
      default:
        return res.status(400).json({
          success: false,
          message: 'Type de rapport invalide',
          code: 'INVALID_REPORT_TYPE'
        });
    }

    // Construire les filtres complets
    const filtresComplets = { ...filtres };
    filtresComplets[champDate] = filtrePeriode;

    // Si regroupement demandé
    if (grouper) {
      let groupStage = {};
      
      if (grouper === 'jour') {
        groupStage = {
          $group: {
            _id: {
              year: { $year: `$${champDate}` },
              month: { $month: `$${champDate}` },
              day: { $dayOfMonth: `$${champDate}` }
            },
            count: { $sum: 1 }
          }
        };
      } else if (grouper === 'mois') {
        groupStage = {
          $group: {
            _id: {
              year: { $year: `$${champDate}` },
              month: { $month: `$${champDate}` }
            },
            count: { $sum: 1 }
          }
        };
      } else if (Object.keys(filtres).includes(grouper)) {
        // Grouper par un champ spécifique
        groupStage = {
          $group: {
            _id: `$${grouper}`,
            count: { $sum: 1 }
          }
        };
      }

      // Exécuter l'agrégation
      rapport.agregation = await modele.aggregate([
        { $match: filtresComplets },
        groupStage,
        { $sort: { '_id': 1 } }
      ]);
    } else {
      // Récupérer les données sans regroupement
      rapport.total = await modele.countDocuments(filtresComplets);
      
      // Limiter les champs si spécifiés
      const projection = {};
      if (champs.length > 0) {
        champs.forEach(champ => {
          projection[champ] = 1;
        });
      }
      
      // Récupérer les données (limité à 100 pour éviter les problèmes de performance)
      rapport.donnees = await modele.find(filtresComplets, projection)
        .sort({ [champDate]: -1 })
        .limit(100)
        .lean();
    }

    res.status(200).json({
      success: true,
      data: {
        type,
        periode: {
          debut,
          fin
        },
        filtres: filtresComplets,
        grouper,
        rapport
      }
    });

  } catch (erreur) {
    logger.error('Erreur lors de la génération du rapport personnalisé', {
      error: erreur.message,
      stack: erreur.stack
    });
    return next(new AppError('Erreur serveur lors de la génération du rapport', 500));
  }
};

/**
 * @desc    Obtenir les données pour export CSV/Excel
 * @route   GET /api/analytics/export-donnees
 * @access  Private (Admin)
 */
const exporterDonnees = async (req, res, next) => {
  try {
    const { 
      type, 
      dateDebut, 
      dateFin, 
      filtres = {},
      format = 'json',
      champsTri = '-dateCreation',
      limite = 1000
    } = req.query;

    // Validation de base
    if (!type || !['utilisateurs', 'trajets', 'reservations', 'signalements'].includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Type de données invalide',
        code: 'INVALID_DATA_TYPE'
      });
    }

    // Définir les dates de début et fin
    const debut = dateDebut ? new Date(dateDebut) : new Date(0);
    const fin = dateFin ? new Date(dateFin) : new Date();

    let modele;
    let champDate;
    let projection = {};

    // Sélectionner le modèle approprié
    switch (type) {
      case 'utilisateurs': {
        modele = Utilisateur;
        champDate = 'dateInscription';
        // Exclure les champs sensibles
        projection = {
          motDePasse: 0,
          tokenResetMotDePasse: 0,
          expirationTokenReset: 0,
          tokenConfirmationEmail: 0,
          expirationTokenConfirmation: 0,
          codeSMS: 0,
          expirationCodeSMS: 0
        };
        break;
      }
      case 'trajets': {
        modele = Trajet;
        champDate = 'dateCreation';
        break;
      }
      case 'reservations': {
        modele = Reservation;
        champDate = 'dateCreation';
        break;
      }
      case 'signalements': {
        modele = Signalement;
        champDate = 'dateCreation';
        break;
      }
    }

    // Construire les filtres
    const filtresComplets = { 
      ...filtres,
      [champDate]: { $gte: debut, $lte: fin }
    };

    // Récupérer les données
    const donnees = await modele.find(filtresComplets, projection)
      .sort(champsTri)
      .limit(parseInt(limite))
      .lean();

    // Formater selon le format demandé
    if (format === 'csv') {
      // Cette fonction serait implémentée pour transformer les données en CSV
      // Pour l'exemple, retournons simplement un message
      return res.status(200).json({
        success: true,
        message: 'Format CSV non implémenté dans cet exemple',
        data: { count: donnees.length }
      });
    } else {
      // Format JSON par défaut
      res.status(200).json({
        success: true,
        data: {
          type,
          count: donnees.length,
          donnees
        }
      });
    }

  } catch (erreur) {
    logger.error('Erreur lors de l\'export des données', {
      error: erreur.message,
      stack: erreur.stack
    });
    return next(new AppError('Erreur serveur lors de l\'export des données', 500));
  }
};

/**
 * @desc    Obtenir les cartes thermiques d'activité
 * @route   GET /api/analytics/cartes-thermiques
 * @access  Private (Admin)
 */
const obtenirCartesThermiques = async (req, res, next) => {
  try {
    const { type = 'trajets', periode = '30' } = req.query;
    const joursAnalyse = parseInt(periode);
    const dateDebut = new Date();
    dateDebut.setDate(dateDebut.getDate() - joursAnalyse);

    let donnees = [];

    switch (type) {
      case 'trajets': {
        // Carte thermique des départs de trajets
        donnees = await Trajet.aggregate([
          {
            $match: {
              dateCreation: { $gte: dateDebut },
              'depart.coordonnees': { $exists: true }
            }
          },
          {
            $group: {
              _id: {
                lat: { $arrayElemAt: ['$depart.coordonnees.coordinates', 1] },
                lng: { $arrayElemAt: ['$depart.coordonnees.coordinates', 0] }
              },
              count: { $sum: 1 }
            }
          },
          {
            $project: {
              _id: 0,
              lat: '$_id.lat',
              lng: '$_id.lng',
              intensite: '$count'
            }
          }
        ]);
        break;
      }
      case 'utilisateurs': {
        // Carte thermique des adresses des utilisateurs
        donnees = await Utilisateur.aggregate([
          {
            $match: {
              'adresse.coordonnees.coordinates': { $exists: true, $ne: [] }
            }
          },
          {
            $group: {
              _id: {
                lat: { $arrayElemAt: ['$adresse.coordonnees.coordinates', 1] },
                lng: { $arrayElemAt: ['$adresse.coordonnees.coordinates', 0] }
              },
              count: { $sum: 1 }
            }
          },
          {
            $project: {
              _id: 0,
              lat: '$_id.lat',
              lng: '$_id.lng',
              intensite: '$count'
            }
          }
        ]);
        break;
      }
      case 'reservations': {
        // Carte thermique des destinations de réservations
        donnees = await Reservation.aggregate([
          {
            $match: {
              dateCreation: { $gte: dateDebut }
            }
          },
          {
            $lookup: {
              from: 'trajets',
              localField: 'trajetId',
              foreignField: '_id',
              as: 'trajet'
            }
          },
          {
            $unwind: '$trajet'
          },
          {
            $match: {
              'trajet.destination.coordonnees': { $exists: true }
            }
          },
          {
            $group: {
              _id: {
                lat: { $arrayElemAt: ['$trajet.destination.coordonnees.coordinates', 1] },
                lng: { $arrayElemAt: ['$trajet.destination.coordonnees.coordinates', 0] }
              },
              count: { $sum: 1 }
            }
          },
          {
            $project: {
              _id: 0,
              lat: '$_id.lat',
              lng: '$_id.lng',
              intensite: '$count'
            }
          }
        ]);
        break;
      }
    }

    res.status(200).json({
      success: true,
      data: {
        type,
        periode: joursAnalyse,
        donnees
      }
    });

  } catch (erreur) {
    logger.error('Erreur lors de la récupération des cartes thermiques', {
      error: erreur.message,
      stack: erreur.stack
    });
    return next(new AppError('Erreur serveur lors de la récupération des cartes thermiques', 500));
  }
};

/**
 * @desc    Obtenir les statistiques des signalements
 * @route   GET /api/analytics/signalements
 * @access  Private (Admin)
 */
const obtenirStatistiquesSignalements = async (req, res, next) => {
  try {
    const { periode = '30' } = req.query;
    const joursAnalyse = parseInt(periode);
    const dateDebut = new Date();
    dateDebut.setDate(dateDebut.getDate() - joursAnalyse);

    // Signalements par statut
    const parStatut = await Signalement.aggregate([
      {
        $match: {
          dateCreation: { $gte: dateDebut }
        }
      },
      {
        $group: {
          _id: '$statut',
          count: { $sum: 1 }
        }
      }
    ]);

    // Signalements par type
    const parType = await Signalement.aggregate([
      {
        $match: {
          dateCreation: { $gte: dateDebut }
        }
      },
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 }
        }
      }
    ]);

    // Évolution des signalements dans le temps
    const evolution = await Signalement.aggregate([
      {
        $match: {
          dateCreation: { $gte: dateDebut }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$dateCreation' },
            month: { $month: '$dateCreation' },
            day: { $dayOfMonth: '$dateCreation' }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 }
      }
    ]);

    // Utilisateurs les plus signalés
    const utilisateursPlusSignales = await Signalement.aggregate([
      {
        $match: {
          dateCreation: { $gte: dateDebut },
          utilisateurSignale: { $exists: true, $ne: null }
        }
      },
      {
        $group: {
          _id: '$utilisateurSignale',
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      },
      {
        $limit: 10
      },
      {
        $lookup: {
          from: 'utilisateurs',
          localField: '_id',
          foreignField: '_id',
          as: 'utilisateur'
        }
      },
      {
        $unwind: '$utilisateur'
      },
      {
        $project: {
          _id: 1,
          count: 1,
          'utilisateur.nom': 1,
          'utilisateur.prenom': 1,
          'utilisateur.email': 1,
          'utilisateur.role': 1,
          'utilisateur.statutCompte': 1
        }
      }
    ]);

    res.status(200).json({
      success: true,
      data: {
        parStatut,
        parType,
        evolution,
        utilisateursPlusSignales
      }
    });

  } catch (erreur) {
    logger.error('Erreur lors de la récupération des statistiques de signalements', {
      error: erreur.message,
      stack: erreur.stack
    });
    return next(new AppError('Erreur serveur lors de la récupération des statistiques de signalements', 500));
  }
};

/**
 * @desc    Obtenir les métriques de performance
 * @route   GET /api/analytics/performance
 * @access  Private (Admin)
 */
const obtenirMetriquesPerformance = async (req, res, next) => {
  try {
    const { periode = '30' } = req.query;
    const joursAnalyse = parseInt(periode);
    const dateDebut = new Date();
    dateDebut.setDate(dateDebut.getDate() - joursAnalyse);

    // Taux de conversion (réservations / nombre de trajets publiés)
    const totalTrajets = await Trajet.countDocuments({
      dateCreation: { $gte: dateDebut }
    });

    const totalReservations = await Reservation.countDocuments({
      dateCreation: { $gte: dateDebut }
    });

    const tauxConversion = totalTrajets > 0 ? (totalReservations / totalTrajets) * 100 : 0;

    // Taux d'annulation des trajets
    const trajetsAnnules = await Trajet.countDocuments({
      dateCreation: { $gte: dateDebut },
      statut: 'ANNULE'
    });

    const tauxAnnulation = totalTrajets > 0 ? (trajetsAnnules / totalTrajets) * 100 : 0;

    // Taux de complétion des trajets
    const trajetsCompletes = await Trajet.countDocuments({
      dateCreation: { $gte: dateDebut },
      statut: 'TERMINE'
    });

    const tauxCompletion = totalTrajets > 0 ? (trajetsCompletes / totalTrajets) * 100 : 0;

    // Temps moyen entre inscription et premier trajet
    const tempsInscriptionPremierTrajet = await Utilisateur.aggregate([
      {
        $match: {
          dateInscription: { $gte: dateDebut },
          role: { $in: ['conducteur', 'les_deux'] }
        }
      },
      {
        $lookup: {
          from: 'trajets',
          localField: '_id',
          foreignField: 'conducteurId',
          as: 'trajets'
        }
      },
      {
        $match: {
          'trajets.0': { $exists: true }
        }
      },
      {
        $project: {
          _id: 1,
          dateInscription: 1,
          premierTrajet: { $min: '$trajets.dateCreation' },
          delaiEnJours: {
            $divide: [
              { $subtract: [{ $min: '$trajets.dateCreation' }, '$dateInscription'] },
              1000 * 60 * 60 * 24
            ]
          }
        }
      },
      {
        $group: {
          _id: null,
          moyenneJours: { $avg: '$delaiEnJours' },
          min: { $min: '$delaiEnJours' },
          max: { $max: '$delaiEnJours' }
        }
      }
    ]);

    // Taux de fidélisation (utilisateurs ayant effectué plus d'un trajet)
    const utilisateursUniques = await Trajet.aggregate([
      {
        $match: {
          dateCreation: { $gte: dateDebut }
        }
      },
      {
        $group: {
          _id: '$conducteurId',
          count: { $sum: 1 }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          plusieursTrajetCount: {
            $sum: {
              $cond: [{ $gt: ['$count', 1] }, 1, 0]
            }
          }
        }
      },
      {
        $project: {
          _id: 0,
          total: 1,
          plusieursTrajetCount: 1,
          tauxFidelisation: {
            $multiply: [
              { $divide: ['$plusieursTrajetCount', '$total'] },
              100
            ]
          }
        }
      }
    ]);

    res.status(200).json({
      success: true,
      data: {
        tauxConversion,
        tauxAnnulation,
        tauxCompletion,
        tempsInscriptionPremierTrajet: tempsInscriptionPremierTrajet[0] || {},
        tauxFidelisation: utilisateursUniques[0] || {}
      }
    });

  } catch (erreur) {
    logger.error('Erreur lors de la récupération des métriques de performance', {
      error: erreur.message,
      stack: erreur.stack
    });
    return next(new AppError('Erreur serveur lors de la récupération des métriques de performance', 500));
  }
};

module.exports = {
  // Statistiques générales
  obtenirStatistiquesGenerales,
  
  // Statistiques évolutives
  obtenirEvolutionInscriptions,
  obtenirEvolutionTrajets,
  obtenirEvolutionReservations,
  
  // Statistiques financières
  obtenirStatistiquesFinancieres,
  
  // Rapports personnalisés
  genererRapportPersonnalise,
  exporterDonnees,
  
  // Cartes thermiques
  obtenirCartesThermiques,
  
  // Signalements
  obtenirStatistiquesSignalements,
  
  // Métriques de performance
  obtenirMetriquesPerformance
};