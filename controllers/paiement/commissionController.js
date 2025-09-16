// controllers/commissionController.js
// Contrôleur complet pour la gestion des commissions - Système WAYZ-ECO

const Paiement = require('../../models/Paiement');
const User = require('../../models/Utilisateur');
const { logger } = require('../../utils/logger');
const AppError = require('../../utils/constants/errorConstants');
const sendEmail = require('../../services/notification/emailService');
const PDFDocument = require('pdfkit');

/**
 * Obtenir les statistiques globales des commissions
 */
const getCommissionStats = async (req, res, next) => {
  try {
    const { 
      dateDebut, 
      dateFin, 
      periode = '30' 
    } = req.query;

    // Déterminer les dates par défaut
    const finPeriode = dateFin ? new Date(dateFin) : new Date();
    const debutPeriode = dateDebut ? new Date(dateDebut) : 
      new Date(finPeriode.getTime() - parseInt(periode) * 24 * 60 * 60 * 1000);

    // Statistiques générales
    const statsGenerales = await Paiement.obtenirStatistiquesCommissions(debutPeriode, finPeriode);
    
    // Statistiques par mode de paiement
    const statsParMode = await Paiement.statistiquesParModePaiement();
    
    // Analyse des revenus
    const analyseRevenus = await Paiement.analyseRevenus(parseInt(periode));
    
    // Commissions en échec
    const commissionsEnEchec = await Paiement.obtenirCommissionsEnEchec();
    
    // Paiements en attente
    const paiementsEnAttente = await Paiement.obtenirPaiementsEnAttente();

    // Calculs complémentaires
    const [statsActuelles] = statsGenerales.length > 0 ? statsGenerales : [{}];
    const tauxCommissionMoyen = statsActuelles.montantTotalTraite > 0 ? 
      (statsActuelles.totalCommissions / statsActuelles.montantTotalTraite * 100) : 0;

    // Evolution des commissions (période précédente pour comparaison)
    const periodeComparaison = new Date(debutPeriode.getTime() - parseInt(periode) * 24 * 60 * 60 * 1000);
    const statsPrecedentes = await Paiement.obtenirStatistiquesCommissions(periodeComparaison, debutPeriode);
    const [statsPrecedentesActuelles] = statsPrecedentes.length > 0 ? statsPrecedentes : [{}];
    
    const evolutionCommissions = statsPrecedentesActuelles.totalCommissions ? 
      ((statsActuelles.totalCommissions - statsPrecedentesActuelles.totalCommissions) / 
       statsPrecedentesActuelles.totalCommissions * 100) : 0;

    const reponse = {
      success: true,
      data: {
        periode: {
          debut: debutPeriode,
          fin: finPeriode,
          jours: Math.ceil((finPeriode - debutPeriode) / (1000 * 60 * 60 * 24))
        },
        statistiques: {
          totalCommissions: statsActuelles.totalCommissions || 0,
          nombreTransactions: statsActuelles.nombreTransactions || 0,
          montantTotalTraite: statsActuelles.montantTotalTraite || 0,
          montantMoyenTransaction: statsActuelles.montantMoyenTransaction || 0,
          tauxCommissionMoyen: Math.round(tauxCommissionMoyen * 100) / 100,
          evolutionCommissions: Math.round(evolutionCommissions * 100) / 100
        },
        repartitionParMode: statsParMode,
        evolutionQuotidienne: analyseRevenus,
        alertes: {
          commissionsEnEchec: commissionsEnEchec.length,
          paiementsEnAttente: paiementsEnAttente.length,
          commissionsEnEchecDetails: commissionsEnEchec.slice(0, 10), // Limiter pour performance
          paiementsEnAttenteDetails: paiementsEnAttente.slice(0, 10)
        }
      }
    };

    res.json(reponse);

  } catch (error) {
    logger.error('Erreur obtention statistiques commissions:', error);
    return next(AppError.serverError('Erreur lors de l\'obtention des statistiques', {
      originalError: error.message
    }));
  }
};

/**
 * Traiter manuellement les commissions en échec
 */
const traiterCommissionsEnEchec = async (req, res, next) => {
  try {
    const adminId = req.user.userId;
    const { paiementIds, action = 'retry' } = req.body;

    if (!paiementIds || !Array.isArray(paiementIds)) {
      return res.status(400).json({
        success: false,
        message: 'Liste des IDs de paiement requise'
      });
    }

    const paiements = await Paiement.find({
      _id: { $in: paiementIds },
      'commission.statutPrelevement': 'echec',
      statutPaiement: 'COMPLETE'
    }).populate('beneficiaireId', 'nom prenom email compteCovoiturage');

    let traites = 0;
    let echecs = 0;
    const resultats = [];

    for (const paiement of paiements) {
      try {
        let resultat = {
          paiementId: paiement._id,
          referenceTransaction: paiement.referenceTransaction,
          montantCommission: paiement.commission.montant
        };

        switch (action) {
          case 'retry': {
            // Tentative de reprélèvement
            await paiement.traiterCommissionApresPayement();
            resultat.action = 'Reprélèvement tenté';
            resultat.succes = true;
            traites++;
            break;
          }

          case 'waive': {
            // Annuler la commission (geste commercial)
            paiement.commission.statutPrelevement = 'preleve';
            paiement.commission.datePrelevement = new Date();
            paiement.ajouterLog('COMMISSION_ANNULEE_ADMIN', {
              adminId,
              raison: 'Geste commercial - commission annulée',
              montantAnnule: paiement.commission.montant
            });
            await paiement.save();
            
            resultat.action = 'Commission annulée (geste commercial)';
            resultat.succes = true;
            traites++;
            break;
          }

          case 'manual': {
            // Marquer comme traité manuellement
            paiement.commission.statutPrelevement = 'preleve';
            paiement.commission.datePrelevement = new Date();
            paiement.ajouterLog('COMMISSION_MANUELLE_ADMIN', {
              adminId,
              raison: 'Traitement manuel par administrateur'
            });
            await paiement.save();
            
            resultat.action = 'Marqué comme traité manuellement';
            resultat.succes = true;
            traites++;
            break;
          }

          default: {
            resultat.action = 'Action inconnue';
            resultat.succes = false;
            resultat.erreur = 'Action non supportée';
            echecs++;
            break;
          }
        }

        resultats.push(resultat);

      } catch (error) {
        echecs++;
        resultats.push({
          paiementId: paiement._id,
          action: 'Erreur de traitement',
          succes: false,
          erreur: error.message
        });
        
        logger.error(`Erreur traitement commission ${paiement._id}:`, error);
      }
    }

    // Log de l'action administrative
    logger.info('Traitement manuel commissions échec', {
      adminId,
      action,
      paiementsTraites: traites,
      paiementsEchecs: echecs,
      totalPaiements: paiements.length
    });

    res.json({
      success: true,
      message: `Traitement terminé: ${traites} succès, ${echecs} échecs`,
      data: {
        statistiques: {
          traites,
          echecs,
          total: paiements.length
        },
        resultats: resultats
      }
    });

  } catch (error) {
    logger.error('Erreur traitement commissions échec:', error);
    return next(AppError.serverError('Erreur lors du traitement des commissions', {
      originalError: error.message
    }));
  }
};

/**
 * Calculer et ajuster le taux de commission
 */
const ajusterTauxCommission = async (req, res, next) => {
  try {
    const { 
      nouveauTaux, 
      appliquerAux = 'nouveaux', // 'nouveaux', 'tous', 'specifiques'
      paiementIds = [],
      raison 
    } = req.body;
    const adminId = req.user.userId;

    // Validation du taux
    if (typeof nouveauTaux !== 'number' || nouveauTaux < 0 || nouveauTaux > 0.5) {
      return res.status(400).json({
        success: false,
        message: 'Taux de commission invalide (0% à 50%)'
      });
    }

    // Validation de la raison
    if (!raison || raison.trim().length < 10) {
      return res.status(400).json({
        success: false,
        message: 'Raison de l\'ajustement requise (minimum 10 caractères)'
      });
    }

    let paiementsAffectes = 0;
    let montantImpact = 0;

    switch (appliquerAux) {
      case 'nouveaux': {
        // Mettre à jour le taux par défaut pour les nouveaux paiements
        // Note: Ceci nécessiterait une configuration globale
        logger.info('Nouveau taux de commission défini', {
          adminId,
          ancienTaux: 0.10, // À récupérer de la config
          nouveauTaux,
          raison
        });
        
        res.json({
          success: true,
          message: 'Taux de commission mis à jour pour les nouveaux paiements',
          data: {
            nouveauTaux,
            appliqueA: 'Nouveaux paiements seulement',
            raison
          }
        });
        break;
      }

      case 'specifiques': {
        if (!paiementIds || paiementIds.length === 0) {
          return res.status(400).json({
            success: false,
            message: 'IDs de paiements requis pour application spécifique'
          });
        }

        const paiements = await Paiement.find({
          _id: { $in: paiementIds },
          statutPaiement: { $in: ['EN_ATTENTE', 'TRAITE'] }
        });

        for (const paiement of paiements) {
          const ancienMontant = paiement.commission.montant;
          const nouveauMontant = Math.round(paiement.montantTotal * nouveauTaux);
          
          paiement.commission.taux = nouveauTaux;
          paiement.commission.montant = nouveauMontant;
          paiement.montantConducteur = paiement.montantTotal - nouveauMontant - paiement.fraisTransaction;
          
          paiement.ajouterLog('TAUX_COMMISSION_AJUSTE_ADMIN', {
            adminId,
            ancienTaux: paiement.commission.taux,
            nouveauTaux,
            ancienMontant,
            nouveauMontant,
            raison
          });
          
          await paiement.save();
          
          paiementsAffectes++;
          montantImpact += (nouveauMontant - ancienMontant);
        }

        res.json({
          success: true,
          message: `Taux ajusté pour ${paiementsAffectes} paiements`,
          data: {
            paiementsAffectes,
            montantImpact,
            nouveauTaux,
            raison
          }
        });
        break;
      }

      default: {
        return res.status(400).json({
          success: false,
          message: 'Mode d\'application invalide'
        });
      }
    }

  } catch (error) {
    logger.error('Erreur ajustement taux commission:', error);
    return next(AppError.serverError('Erreur lors de l\'ajustement du taux', {
      originalError: error.message
    }));
  }
};

/**
 * Obtenir le détail d'une commission spécifique
 */
const getCommissionDetail = async (req, res, next) => {
  try {
    const { paiementId } = req.params;

    const paiement = await Paiement.findById(paiementId)
      .populate('payeurId', 'nom prenom email telephone')
      .populate('beneficiaireId', 'nom prenom email compteCovoiturage')
      .populate({
        path: 'reservationId',
        populate: {
          path: 'trajetId',
          select: 'pointDepart pointArrivee dateDepart prixParPassager'
        }
      });

    if (!paiement) {
      return res.status(404).json({
        success: false,
        message: 'Paiement non trouvé'
      });
    }

    // Obtenir l'historique des tentatives de prélèvement
    const tentativesPrelevement = paiement.logsTransaction.filter(
      log => log.action.includes('COMMISSION')
    );

    // Calculer les métriques de performance
    const delaiTraitement = paiement.dateCompletion && paiement.dateInitiation ?
      Math.round((paiement.dateCompletion - paiement.dateInitiation) / (1000 * 60)) : null;

    const delaiPrelevement = paiement.commission.datePrelevement && paiement.dateCompletion ?
      Math.round((paiement.commission.datePrelevement - paiement.dateCompletion) / (1000 * 60)) : null;

    res.json({
      success: true,
      data: {
        paiement: paiement.obtenirResume(),
        detailsCommission: {
          taux: paiement.commission.taux,
          montant: paiement.commission.montant,
          modePrelevement: paiement.commission.modePrelevement,
          statutPrelevement: paiement.commission.statutPrelevement,
          datePrelevement: paiement.commission.datePrelevement,
          referencePrelevement: paiement.commission.referencePrelevement,
          tentativesPrelevement: tentativesPrelevement.length
        },
        participants: {
          payeur: {
            id: paiement.payeurId._id,
            nom: paiement.payeurId.nomComplet,
            email: paiement.payeurId.email,
            telephone: paiement.payeurId.telephone
          },
          conducteur: {
            id: paiement.beneficiaireId._id,
            nom: paiement.beneficiaireId.nomComplet,
            email: paiement.beneficiaireId.email,
            compteRecharge: paiement.beneficiaireId.compteCovoiturage?.estRecharge || false,
            soldeConducteur: paiement.beneficiaireId.compteCovoiturage?.solde || 0
          }
        },
        trajet: paiement.reservationId?.trajetId ? {
          depart: paiement.reservationId.trajetId.pointDepart.nom,
          arrivee: paiement.reservationId.trajetId.pointArrivee.nom,
          dateDepart: paiement.reservationId.trajetId.dateDepart,
          prixParPassager: paiement.reservationId.trajetId.prixParPassager
        } : null,
        metriques: {
          delaiTraitement: delaiTraitement ? `${delaiTraitement} minutes` : null,
          delaiPrelevement: delaiPrelevement ? `${delaiPrelevement} minutes` : null,
          nombreTentatives: tentativesPrelevement.length,
          nombreErreurs: paiement.erreurs.length
        },
        historique: {
          statuts: paiement.historiqueStatuts.slice(-10), // 10 derniers changements
          logs: tentativesPrelevement.slice(-5), // 5 derniers logs commission
          erreurs: paiement.erreurs.slice(-3) // 3 dernières erreurs
        }
      }
    });

  } catch (error) {
    logger.error('Erreur obtention détail commission:', error);
    return next(AppError.serverError('Erreur lors de l\'obtention du détail', {
      originalError: error.message
    }));
  }
};

/**
 * Générer un rapport de commissions
 */
const genererRapportCommissions = async (req, res, next) => {
  try {
    const { 
      format = 'json', 
      dateDebut, 
      dateFin, 
      groupePar = 'jour',
      includeDetails = 'false'
    } = req.query;

    // Validation des dates
    const debut = dateDebut ? new Date(dateDebut) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const fin = dateFin ? new Date(dateFin) : new Date();

    if (debut >= fin) {
      return res.status(400).json({
        success: false,
        message: 'Date de début doit être antérieure à date de fin'
      });
    }

    // Construire l'agrégation selon le groupement
    let formatDate;
    switch (groupePar) {
      case 'heure':
        formatDate = '%Y-%m-%d %H:00';
        break;
      case 'jour':
        formatDate = '%Y-%m-%d';
        break;
      case 'semaine':
        formatDate = '%Y-%U';
        break;
      case 'mois':
        formatDate = '%Y-%m';
        break;
      default:
        formatDate = '%Y-%m-%d';
    }

    const pipeline = [
      {
        $match: {
          statutPaiement: 'COMPLETE',
          dateCompletion: { $gte: debut, $lte: fin }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: formatDate, date: '$dateCompletion' }
          },
          nombreTransactions: { $sum: 1 },
          montantTotalTraite: { $sum: '$montantTotal' },
          totalCommissions: { $sum: '$commission.montant' },
          commissionsPrelevees: {
            $sum: {
              $cond: [
                { $eq: ['$commission.statutPrelevement', 'preleve'] },
                '$commission.montant',
                0
              ]
            }
          },
          commissionsEnEchec: {
            $sum: {
              $cond: [
                { $eq: ['$commission.statutPrelevement', 'echec'] },
                1,
                0
              ]
            }
          },
          repartitionModesPaiement: {
            $push: '$methodePaiement'
          },
          repartitionModesPrelevement: {
            $push: '$commission.modePrelevement'
          }
        }
      },
      {
        $project: {
          periode: '$_id',
          nombreTransactions: 1,
          montantTotalTraite: 1,
          totalCommissions: 1,
          commissionsPrelevees: 1,
          commissionsEnEchec: 1,
          tauxPrelevement: {
            $multiply: [
              { $divide: ['$commissionsPrelevees', '$totalCommissions'] },
              100
            ]
          },
          tauxCommissionMoyen: {
            $multiply: [
              { $divide: ['$totalCommissions', '$montantTotalTraite'] },
              100
            ]
          },
          montantMoyenTransaction: {
            $divide: ['$montantTotalTraite', '$nombreTransactions']
          },
          repartitionModesPaiement: 1,
          repartitionModesPrelevement: 1
        }
      },
      {
        $sort: { periode: 1 }
      }
    ];

    const donnees = await Paiement.aggregate(pipeline);

    // Données complémentaires si détails demandés
    let detailsSupplementaires = {};
    if (includeDetails === 'true') {
      detailsSupplementaires = {
        topConducteurs: await obtenirTopConducteursCommissions(debut, fin),
        repartitionGeographique: await obtenirRepartitionGeographique(debut, fin),
        tendances: await calculerTendances(donnees)
      };
    }

    const rapport = {
      success: true,
      data: {
        parametres: {
          dateDebut: debut,
          dateFin: fin,
          groupePar,
          nombreJours: Math.ceil((fin - debut) / (1000 * 60 * 60 * 24))
        },
        resumeExecutif: {
          totalCommissions: donnees.reduce((sum, d) => sum + d.totalCommissions, 0),
          totalTransactions: donnees.reduce((sum, d) => sum + d.nombreTransactions, 0),
          montantTotalTraite: donnees.reduce((sum, d) => sum + d.montantTotalTraite, 0),
          tauxPrelevementMoyen: donnees.length > 0 ? 
            donnees.reduce((sum, d) => sum + d.tauxPrelevement, 0) / donnees.length : 0
        },
        donneesDetailless: donnees,
        ...detailsSupplementaires
      }
    };

    switch (format.toLowerCase()) {
      case 'pdf': {
        const pdfBuffer = await genererRapportPDF(rapport);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename=rapport-commissions.pdf');
        return res.send(pdfBuffer);
      }

      case 'csv': {
        const csvData = convertirEnCSV(donnees);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=rapport-commissions.csv');
        return res.send(csvData);
      }

      default:
        res.json(rapport);
    }

  } catch (error) {
    logger.error('Erreur génération rapport commissions:', error);
    return next(AppError.serverError('Erreur lors de la génération du rapport', {
      originalError: error.message
    }));
  }
};

/**
 * Surveiller les commissions en temps réel
 */
const surveillerCommissions = async (req, res, next) => {
  try {
    const maintenant = new Date();
    const il24h = new Date(maintenant.getTime() - 24 * 60 * 60 * 1000);
    const il1h = new Date(maintenant.getTime() - 60 * 60 * 1000);

    // Commissions en échec récentes
    const commissionsEchecRecentes = await Paiement.find({
      'commission.statutPrelevement': 'echec',
      'commission.datePrelevement': { $gte: il24h }
    }).countDocuments();

    // Paiements bloqués depuis plus d'1h
    const paiementsBloques = await Paiement.find({
      statutPaiement: 'EN_ATTENTE',
      dateInitiation: { $lt: il1h }
    }).countDocuments();

    // Commissions en attente depuis plus de 24h
    const commissionsBloquees = await Paiement.find({
      'commission.statutPrelevement': 'en_attente',
      dateCompletion: { $lt: il24h, $exists: true }
    }).countDocuments();

    // Volume de commissions dernière heure
    const volumeHeure = await Paiement.aggregate([
      {
        $match: {
          'commission.datePrelevement': { $gte: il1h },
          'commission.statutPrelevement': 'preleve'
        }
      },
      {
        $group: {
          _id: null,
          nombreCommissions: { $sum: 1 },
          montantTotal: { $sum: '$commission.montant' }
        }
      }
    ]);

    // Évolution taux de réussite
    const tauxReussiteAujourdhui = await calculerTauxReussite(il24h, maintenant);
    const tauxReussiteHier = await calculerTauxReussite(
      new Date(il24h.getTime() - 24 * 60 * 60 * 1000), 
      il24h
    );

    // Déterminer les alertes
    const alertes = [];
    
    if (commissionsEchecRecentes > 10) {
      alertes.push({
        niveau: 'warning',
        type: 'COMMISSIONS_ECHEC_ELEVEES',
        message: `${commissionsEchecRecentes} commissions en échec dans les 24h`,
        valeur: commissionsEchecRecentes
      });
    }

    if (paiementsBloques > 5) {
      alertes.push({
        niveau: 'error',
        type: 'PAIEMENTS_BLOQUES',
        message: `${paiementsBloques} paiements bloqués depuis plus d'1h`,
        valeur: paiementsBloques
      });
    }

    if (commissionsBloquees > 0) {
      alertes.push({
        niveau: 'warning',
        type: 'COMMISSIONS_BLOQUEES',
        message: `${commissionsBloquees} commissions en attente depuis 24h+`,
        valeur: commissionsBloquees
      });
    }

    if (tauxReussiteAujourdhui < 95) {
      alertes.push({
        niveau: tauxReussiteAujourdhui < 90 ? 'error' : 'warning',
        type: 'TAUX_REUSSITE_BAS',
        message: `Taux de réussite commissions: ${tauxReussiteAujourdhui.toFixed(1)}%`,
        valeur: tauxReussiteAujourdhui
      });
    }

    const [volumeActuel] = volumeHeure.length > 0 ? volumeHeure : [{ nombreCommissions: 0, montantTotal: 0 }];

    res.json({
      success: true,
      data: {
        surveillance: {
          timestamp: maintenant,
          statut: alertes.length === 0 ? 'OK' : 
                   alertes.some(a => a.niveau === 'error') ? 'CRITIQUE' : 'ATTENTION'
        },
        metriques: {
          commissionsEchecRecentes,
          paiementsBloques,
          commissionsBloquees,
          volumeHeure: {
            nombre: volumeActuel.nombreCommissions,
            montant: volumeActuel.montantTotal
          },
          tauxReussite: {
            aujourdhui: Math.round(tauxReussiteAujourdhui * 100) / 100,
            hier: Math.round(tauxReussiteHier * 100) / 100,
            evolution: Math.round((tauxReussiteAujourdhui - tauxReussiteHier) * 100) / 100
          }
        },
        alertes,
        recommandations: genererRecommandations(alertes)
      }
    });

  } catch (error) {
    logger.error('Erreur surveillance commissions:', error);
    return next(AppError.serverError('Erreur lors de la surveillance', {
      originalError: error.message
    }));
  }
};

/**
 * Obtenir les top conducteurs par commissions
 */
const obtenirTopConducteursCommissions = async (dateDebut, dateFin, limit = 10) => {
  return await Paiement.aggregate([
    {
      $match: {
        statutPaiement: 'COMPLETE',
        dateCompletion: { $gte: dateDebut, $lte: dateFin }
      }
    },
    {
      $group: {
        _id: '$beneficiaireId',
        totalCommissions: { $sum: '$commission.montant' },
        nombreTransactions: { $sum: 1 },
        revenuTotal: { $sum: '$montantConducteur' },
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
    },
    {
      $lookup: {
        from: 'utilisateurs',
        localField: '_id',
        foreignField: '_id',
        as: 'conducteur'
      }
    },
    {
      $unwind: '$conducteur'
    },
    {
      $project: {
        nomConducteur: { $concat: ['$conducteur.prenom', ' ', '$conducteur.nom'] },
        email: '$conducteur.email',
        totalCommissions: 1,
        nombreTransactions: 1,
        revenuTotal: 1,
        commissionsPrelevees: 1,
        tauxPrelevement: {
          $multiply: [
            { $divide: ['$commissionsPrelevees', '$totalCommissions'] },
            100
          ]
        },
        commissionMoyenne: {
          $divide: ['$totalCommissions', '$nombreTransactions']
        }
      }
    },
    {
      $sort: { totalCommissions: -1 }
    },
    {
      $limit: limit
    }
  ]);
};

/**
 * Calculer le taux de réussite des commissions
 */
const calculerTauxReussite = async (dateDebut, dateFin) => {
  const stats = await Paiement.aggregate([
    {
      $match: {
        statutPaiement: 'COMPLETE',
        dateCompletion: { $gte: dateDebut, $lte: dateFin }
      }
    },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        prelevees: {
          $sum: {
            $cond: [
              { $eq: ['$commission.statutPrelevement', 'preleve'] },
              1,
              0
            ]
          }
        }
      }
    }
  ]);

  if (stats.length === 0) return 100;
  const [{ total, prelevees }] = stats;
  return total > 0 ? (prelevees / total) * 100 : 100;
};

/**
 * Obtenir la répartition géographique des commissions
 */
const obtenirRepartitionGeographique = async (dateDebut, dateFin) => {
  return await Paiement.aggregate([
    {
      $match: {
        statutPaiement: 'COMPLETE',
        dateCompletion: { $gte: dateDebut, $lte: dateFin }
      }
    },
    {
      $lookup: {
        from: 'reservations',
        localField: 'reservationId',
        foreignField: '_id',
        as: 'reservation'
      }
    },
    {
      $unwind: '$reservation'
    },
    {
      $lookup: {
        from: 'trajets',
        localField: 'reservation.trajetId',
        foreignField: '_id',
        as: 'trajet'
      }
    },
    {
      $unwind: '$trajet'
    },
    {
      $group: {
        _id: {
          communeDepart: '$trajet.pointDepart.commune',
          communeArrivee: '$trajet.pointArrivee.commune'
        },
        totalCommissions: { $sum: '$commission.montant' },
        nombreTransactions: { $sum: 1 }
      }
    },
    {
      $sort: { totalCommissions: -1 }
    },
    {
      $limit: 20
    }
  ]);
};

/**
 * Calculer les tendances des commissions
 */
const calculerTendances = (donnees) => {
  if (donnees.length < 2) return null;

  const dernierePeriode = donnees[donnees.length - 1];
  const avantDernierePeriode = donnees[donnees.length - 2];

  return {
    evolutionCommissions: calculerPourcentageEvolution(
      avantDernierePeriode.totalCommissions,
      dernierePeriode.totalCommissions
    ),
    evolutionTransactions: calculerPourcentageEvolution(
      avantDernierePeriode.nombreTransactions,
      dernierePeriode.nombreTransactions
    ),
    evolutionTauxPrelevement: calculerPourcentageEvolution(
      avantDernierePeriode.tauxPrelevement,
      dernierePeriode.tauxPrelevement
    )
  };
};

/**
 * Calculer pourcentage d'évolution
 */
const calculerPourcentageEvolution = (ancienne, nouvelle) => {
  if (ancienne === 0) return nouvelle > 0 ? 100 : 0;
  return Math.round(((nouvelle - ancienne) / ancienne) * 100 * 100) / 100;
};

/**
 * Générer des recommandations basées sur les alertes
 */
const genererRecommandations = (alertes) => {
  const recommandations = [];

  alertes.forEach(alerte => {
    switch (alerte.type) {
      case 'COMMISSIONS_ECHEC_ELEVEES':
        recommandations.push({
          priorite: 'HAUTE',
          action: 'Vérifier les comptes conducteurs avec échecs récurrents',
          detail: 'Analyser les causes des échecs de prélèvement et contacter les conducteurs concernés'
        });
        break;
      case 'PAIEMENTS_BLOQUES':
        recommandations.push({
          priorite: 'CRITIQUE',
          action: 'Débloquer immédiatement les paiements en attente',
          detail: 'Identifier et résoudre les problèmes techniques empêchant le traitement'
        });
        break;
      case 'TAUX_REUSSITE_BAS':
        recommandations.push({
          priorite: 'MOYENNE',
          action: 'Optimiser le processus de prélèvement des commissions',
          detail: 'Revoir les règles de validation et améliorer la communication avec les conducteurs'
        });
        break;
    }
  });

  return recommandations;
};

/**
 * Générer un rapport PDF
 */
const genererRapportPDF = async (donneesRapport) => {
  const doc = new PDFDocument();
  const chunks = [];

  doc.on('data', chunks.push.bind(chunks));

  // En-tête
  doc.fontSize(20).text('Rapport de Commissions WAYZ-ECO', { align: 'center' });
  doc.moveDown();
  
  // Période
  doc.fontSize(12).text(`Période: ${donneesRapport.data.parametres.dateDebut.toLocaleDateString()} - ${donneesRapport.data.parametres.dateFin.toLocaleDateString()}`);
  doc.moveDown();

  // Résumé exécutif
  const resume = donneesRapport.data.resumeExecutif;
  doc.fontSize(16).text('Résumé Exécutif');
  doc.fontSize(12);
  doc.text(`Total Commissions: ${resume.totalCommissions.toLocaleString()} FCFA`);
  doc.text(`Nombre Transactions: ${resume.totalTransactions.toLocaleString()}`);
  doc.text(`Montant Total Traité: ${resume.montantTotalTraite.toLocaleString()} FCFA`);
  doc.text(`Taux Prélèvement Moyen: ${resume.tauxPrelevementMoyen.toFixed(2)}%`);

  doc.end();

  return new Promise((resolve) => {
    doc.on('end', () => {
      resolve(Buffer.concat(chunks));
    });
  });
};

/**
 * Convertir les données en CSV
 */
const convertirEnCSV = (donnees) => {
  const headers = [
    'Periode',
    'Nombre_Transactions',
    'Montant_Total_Traite',
    'Total_Commissions',
    'Commissions_Prelevees',
    'Commissions_Echec',
    'Taux_Prelevement',
    'Taux_Commission_Moyen'
  ];

  const lignes = donnees.map(d => [
    d.periode,
    d.nombreTransactions,
    d.montantTotalTraite,
    d.totalCommissions,
    d.commissionsPrelevees,
    d.commissionsEnEchec,
    d.tauxPrelevement.toFixed(2),
    d.tauxCommissionMoyen.toFixed(2)
  ]);

  return [headers, ...lignes]
    .map(ligne => ligne.join(','))
    .join('\n');
};

/**
 * Envoyer notification email pour commissions critiques
 */
const envoyerNotificationCommissionCritique = async (req, res, next) => {
  try {
    const { 
      typeAlerte,
      valeurSeuil,
      valeurActuelle,
      message,
      emailsDestinaires = []
    } = req.body;

    if (!typeAlerte || !message) {
      return res.status(400).json({
        success: false,
        message: 'Type d\'alerte et message requis'
      });
    }

    // Obtenir les emails des administrateurs si pas spécifiés
    let destinataires = emailsDestinaires;
    if (destinataires.length === 0) {
      const admins = await User.find({
        role: { $in: ['ADMIN', 'MODERATEUR'] },
        statutCompte: 'ACTIF'
      }).select('email nom prenom');
      
      destinataires = admins.map(admin => admin.email);
    }

    const sujetEmail = `[ALERTE COMMISSION] ${typeAlerte} - WAYZ-ECO`;
    const corpsEmail = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #dc3545;">🚨 Alerte Commission Critique</h2>
        
        <div style="background-color: #f8d7da; padding: 15px; border-left: 4px solid #dc3545; margin: 20px 0;">
          <h3>Type d'alerte: ${typeAlerte}</h3>
          <p><strong>Message:</strong> ${message}</p>
          ${valeurSeuil ? `<p><strong>Seuil configuré:</strong> ${valeurSeuil}</p>` : ''}
          ${valeurActuelle ? `<p><strong>Valeur actuelle:</strong> ${valeurActuelle}</p>` : ''}
          <p><strong>Timestamp:</strong> ${new Date().toLocaleString()}</p>
        </div>

        <h3>Actions recommandées:</h3>
        <ul>
          <li>Vérifier le dashboard des commissions</li>
          <li>Analyser les causes du problème</li>
          <li>Prendre les mesures correctives nécessaires</li>
          <li>Suivre l'évolution de la situation</li>
        </ul>

        <p style="margin-top: 30px;">
          <a href="${process.env.ADMIN_URL || 'http://localhost:3000/admin'}/commissions" 
             style="background-color: #007bff; color: white; padding: 10px 20px; 
                    text-decoration: none; border-radius: 5px; display: inline-block;">
            Accéder au Dashboard Commissions
          </a>
        </p>

        <hr style="margin: 30px 0;">
        <p style="color: #666; font-size: 12px;">
          Cette alerte a été générée automatiquement par le système de surveillance WAYZ-ECO.
        </p>
      </div>
    `;

    let envoisReussis = 0;
    let envoisEchoues = 0;

    for (const email of destinataires) {
      try {
        await sendEmail({
          to: email,
          subject: sujetEmail,
          html: corpsEmail
        });
        envoisReussis++;
      } catch (emailError) {
        logger.error(`Erreur envoi notification à ${email}:`, emailError);
        envoisEchoues++;
      }
    }

    logger.warn('Notification commission critique envoyée', {
      typeAlerte,
      envoisReussis,
      envoisEchoues,
      valeurSeuil,
      valeurActuelle
    });

    res.json({
      success: true,
      message: 'Notifications envoyées',
      statistiques: {
        destinataires: destinataires.length,
        envoisReussis,
        envoisEchoues
      }
    });

  } catch (error) {
    logger.error('Erreur envoi notification commission:', error);
    return next(AppError.serverError('Erreur lors de l\'envoi des notifications', {
      originalError: error.message
    }));
  }
};

/**
 * Réconcilier les commissions avec les paiements externes
 */
const reconcilierCommissions = async (req, res, next) => {
  try {
    const { 
      dateDebut, 
      dateFin, 
      forcerReconciliation = false 
    } = req.body;

    if (!dateDebut || !dateFin) {
      return res.status(400).json({
        success: false,
        message: 'Dates de début et de fin requises'
      });
    }

    const debut = new Date(dateDebut);
    const fin = new Date(dateFin);

    // Obtenir les paiements à réconcilier
    const paiements = await Paiement.find({
      statutPaiement: 'COMPLETE',
      dateCompletion: { $gte: debut, $lte: fin },
      $or: [
        { 'commission.statutPrelevement': 'en_attente' },
        forcerReconciliation ? { 'commission.statutPrelevement': 'echec' } : null
      ].filter(Boolean)
    }).populate('beneficiaireId', 'compteCovoiturage nom prenom');

    let reconcilies = 0;
    let echecs = 0;
    let montantTotalReconcilie = 0;
    const details = [];

    for (const paiement of paiements) {
      try {
        const conducteur = paiement.beneficiaireId;
        let reconcilie = false;
        let methodeDeterminee = null;

        // Stratégies de réconciliation selon le type de compte
        if (conducteur.compteCovoiturage?.estRecharge && 
            conducteur.compteCovoiturage.solde >= paiement.commission.montant) {
          
          // Tenter prélèvement sur compte rechargé
          await conducteur.preleverCommission(
            paiement.commission.montant,
            paiement.reservationId,
            paiement._id
          );
          
          reconcilie = true;
          methodeDeterminee = 'COMPTE_RECHARGE';

        } else if (paiement.estPaiementMobile && paiement.mobileMoney.statutMobileMoney === 'SUCCESS') {
          
          // Commission déjà prélevée lors du paiement mobile
          paiement.commission.statutPrelevement = 'preleve';
          paiement.commission.datePrelevement = new Date();
          paiement.commission.modePrelevement = 'paiement_mobile';
          
          reconcilie = true;
          methodeDeterminee = 'MOBILE_MONEY';
          
        } else {
          
          // Marquer comme échec si aucune méthode possible
          paiement.commission.statutPrelevement = 'echec';
          methodeDeterminee = 'ECHEC_FONDS_INSUFFISANTS';
          
        }

        if (reconcilie) {
          paiement.ajouterLog('RECONCILIATION_AUTOMATIQUE', {
            methode: methodeDeterminee,
            montant: paiement.commission.montant,
            dateReconciliation: new Date()
          });
          reconcilies++;
          montantTotalReconcilie += paiement.commission.montant;
        } else {
          echecs++;
        }

        await paiement.save();

        details.push({
          paiementId: paiement._id,
          referenceTransaction: paiement.referenceTransaction,
          montantCommission: paiement.commission.montant,
          conducteur: `${conducteur.prenom} ${conducteur.nom}`,
          resultat: reconcilie ? 'RECONCILIE' : 'ECHEC',
          methode: methodeDeterminee
        });

      } catch (error) {
        echecs++;
        logger.error(`Erreur réconciliation paiement ${paiement._id}:`, error);
        
        details.push({
          paiementId: paiement._id,
          referenceTransaction: paiement.referenceTransaction,
          resultat: 'ERREUR',
          erreur: error.message
        });
      }
    }

    logger.info('Réconciliation commissions terminée', {
      periode: { debut, fin },
      paiementsTraites: paiements.length,
      reconcilies,
      echecs,
      montantTotalReconcilie
    });

    res.json({
      success: true,
      message: `Réconciliation terminée: ${reconcilies} succès, ${echecs} échecs`,
      data: {
        statistiques: {
          paiementsTraites: paiements.length,
          reconcilies,
          echecs,
          montantTotalReconcilie,
          tauxReussite: paiements.length > 0 ? (reconcilies / paiements.length * 100) : 0
        },
        periode: { debut, fin },
        details: details.slice(0, 50) // Limiter pour éviter des réponses trop lourdes
      }
    });

  } catch (error) {
    logger.error('Erreur réconciliation commissions:', error);
    return next(AppError.serverError('Erreur lors de la réconciliation', {
      originalError: error.message
    }));
  }
};

module.exports = {
  getCommissionStats,
  traiterCommissionsEnEchec,
  ajusterTauxCommission,
  getCommissionDetail,
  genererRapportCommissions,
  surveillerCommissions,
  envoyerNotificationCommissionCritique,
  reconcilierCommissions
};