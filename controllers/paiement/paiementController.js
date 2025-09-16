// controllers/PaiementController.js
const Paiement = require('../../models/Paiement');
const Reservation = require('../../models/Reservation');
//const Utilisateur = require('../models/Utilisateur');
const { validationResult } = require('express-validator');
const crypto = require('crypto');

class PaiementController {
  // ===== CRÉATION ET INITIATION =====

  /**
   * Créer un nouveau paiement
   */
  async creerPaiement(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Données invalides',
          errors: errors.array()
        });
      }

      const {
        reservationId,
        payeurId,
        beneficiaireId,
        montantTotal,
        methodePaiement,
        fraisTransaction = 0,
        numeroTelephone,
        operateur,
        deviceId,
        repartitionFrais = {}
      } = req.body;

      // Vérifier que la réservation existe
      const reservation = await Reservation.findById(reservationId)
        .populate('trajetId');
      
      if (!reservation) {
        return res.status(404).json({
          success: false,
          message: 'Réservation introuvable'
        });
      }

      // Créer le paiement avec commission 10%
      const paiement = new Paiement({
        reservationId,
        payeurId,
        beneficiaireId,
        montantTotal,
        methodePaiement: methodePaiement.toUpperCase(),
        fraisTransaction,
        repartitionFrais,
        securite: {
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
          deviceId
        }
      });

      // Calculer automatiquement la commission
      paiement.calculerCommission();

      // Valider les règles de paiement
      const reglesValides = await paiement.validerReglesPaiement();
      if (!reglesValides) {
        return res.status(400).json({
          success: false,
          message: 'Mode de paiement non autorisé pour cette réservation',
          details: paiement.reglesPaiement
        });
      }

      // Si c'est un paiement mobile, l'initialiser
      if (paiement.estPaiementMobile && numeroTelephone && operateur) {
        paiement.initierPaiementMobile(numeroTelephone, operateur);
      }

      await paiement.save();

      paiement.ajouterLog('PAIEMENT_CREE', {
        utilisateurId: req.user?.id,
        montantTotal,
        commission: paiement.commission.montant
      }, 'USER');

      res.status(201).json({
        success: true,
        message: 'Paiement créé avec succès',
        data: paiement.obtenirResume()
      });

    } catch (error) {
      console.error('Erreur création paiement:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la création du paiement',
        error: error.message
      });
    }
  }

  /**
   * Initier un paiement mobile money
   */
  async initierPaiementMobile(req, res) {
    try {
      const { paiementId } = req.params;
      const { numeroTelephone, operateur, codePin } = req.body;

      const paiement = await Paiement.findById(paiementId);
      if (!paiement) {
        return res.status(404).json({
          success: false,
          message: 'Paiement introuvable'
        });
      }

      if (paiement.statutPaiement !== 'EN_ATTENTE') {
        return res.status(400).json({
          success: false,
          message: 'Ce paiement ne peut plus être modifié'
        });
      }

      // Initialiser le paiement mobile
      paiement.initierPaiementMobile(numeroTelephone, operateur);
      paiement.statutPaiement = 'TRAITE';

      // Stocker le code PIN si fourni (pour certains opérateurs)
      if (codePin) {
        paiement.ajouterLog('CODE_PIN_FOURNI', {
          operateur: operateur.toUpperCase(),
          timestamp: new Date()
        }, 'USER', 'INFO');
      }

      await paiement.save();

      // Ici, vous intégreriez avec l'API du fournisseur mobile money
      // Le codePin serait utilisé dans l'appel API réel
      const apiPayload = {
        numeroTelephone,
        operateur: operateur.toUpperCase(),
        montant: paiement.montantTotal,
        reference: paiement.referenceTransaction,
        ...(codePin && { codePin }) // Inclure le PIN si fourni
      };

      // Simulation d'une réponse API
      const transactionId = `TXN_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      
      paiement.ajouterLog('API_MOBILE_MONEY_APPELE', {
        apiPayload: { ...apiPayload, codePin: codePin ? '****' : null }, // Masquer le PIN dans les logs
        transactionId
      });

      res.status(200).json({
        success: true,
        message: 'Paiement mobile initié',
        data: {
          transactionId,
          montant: paiement.montantTotal,
          operateur: operateur.toUpperCase(),
          statut: 'PENDING',
          instructions: codePin ? 
            `Paiement en cours de traitement avec le code PIN fourni` :
            `Composez le code USSD pour confirmer le paiement de ${paiement.montantTotal} FCFA`
        }
      });

    } catch (error) {
      console.error('Erreur initiation paiement mobile:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de l\'initiation du paiement mobile',
        error: error.message
      });
    }
  }

  // ===== GESTION DES STATUTS =====

  /**
   * Mettre à jour le statut d'un paiement
   */
  async mettreAJourStatut(req, res) {
    try {
      const { paiementId } = req.params;
      const { nouveauStatut, raison } = req.body;

      const paiement = await Paiement.findById(paiementId);
      if (!paiement) {
        return res.status(404).json({
          success: false,
          message: 'Paiement introuvable'
        });
      }

      if (!paiement.peutChangerStatut(nouveauStatut)) {
        return res.status(400).json({
          success: false,
          message: `Transition de statut invalide: ${paiement.statutPaiement} → ${nouveauStatut}`
        });
      }

      const ancienStatut = paiement.statutPaiement;
      paiement.statutPaiement = nouveauStatut;

      // Ajouter à l'historique
      paiement.historiqueStatuts.push({
        ancienStatut,
        nouveauStatut,
        dateChangement: new Date(),
        raisonChangement: raison || 'Mise à jour manuelle',
        utilisateurId: req.user?.id
      });

      paiement.ajouterLog('STATUT_MODIFIE', {
        ancienStatut,
        nouveauStatut,
        utilisateurId: req.user?.id,
        raison
      }, 'ADMIN');

      await paiement.save();

      res.status(200).json({
        success: true,
        message: 'Statut mis à jour avec succès',
        data: paiement.obtenirResume()
      });

    } catch (error) {
      console.error('Erreur mise à jour statut:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la mise à jour du statut',
        error: error.message
      });
    }
  }

  /**
   * Traiter le callback des paiements mobile money
   */
  async traiterCallbackMobile(req, res) {
    try {
      const {
        transactionId,
        statut,
        codeTransaction,
        montant,
        fraisOperateur,
        referencePaiement
      } = req.body;

      // Trouver le paiement par référence
      const paiement = await Paiement.findOne({
        $or: [
          { 'mobileMoney.transactionId': transactionId },
          { referenceTransaction: referencePaiement }
        ]
      });

      if (!paiement) {
        return res.status(404).json({
          success: false,
          message: 'Transaction introuvable'
        });
      }

      // Traiter le callback
      const donneesCallback = {
        transactionId,
        codeTransaction,
        statut: statut.toUpperCase(),
        montant,
        fraisOperateur
      };

      paiement.traiterCallbackMobile(donneesCallback);
      
      if (fraisOperateur) {
        paiement.mobileMoney.fraisOperateur = fraisOperateur;
      }

      await paiement.save();

      // Répondre au fournisseur mobile money
      res.status(200).json({
        success: true,
        message: 'Callback traité avec succès',
        transactionId
      });

    } catch (error) {
      console.error('Erreur callback mobile:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors du traitement du callback',
        error: error.message
      });
    }
  }

  // ===== CONSULTATION =====

  /**
   * Obtenir un paiement par ID
   */
  async obtenirPaiement(req, res) {
    try {
      const { paiementId } = req.params;

      const paiement = await Paiement.findById(paiementId)
        .populate('payeurId', 'nom prenom email telephone')
        .populate('beneficiaireId', 'nom prenom email telephone')
        .populate({
          path: 'reservationId',
          populate: {
            path: 'trajetId',
            select: 'villeDepart villeArrivee dateDepart prix'
          }
        });

      if (!paiement) {
        return res.status(404).json({
          success: false,
          message: 'Paiement introuvable'
        });
      }

      res.status(200).json({
        success: true,
        data: paiement
      });

    } catch (error) {
      console.error('Erreur récupération paiement:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération du paiement',
        error: error.message
      });
    }
  }

  /**
   * Lister les paiements avec filtres
   */
  async listerPaiements(req, res) {
    try {
      const {
        page = 1,
        limit = 10,
        statutPaiement,
        methodePaiement,
        payeurId,
        beneficiaireId,
        dateDebut,
        dateFin,
        montantMin,
        montantMax
      } = req.query;

      // Construire les filtres
      const filtres = {};

      if (statutPaiement) filtres.statutPaiement = statutPaiement;
      if (methodePaiement) filtres.methodePaiement = methodePaiement;
      if (payeurId) filtres.payeurId = payeurId;
      if (beneficiaireId) filtres.beneficiaireId = beneficiaireId;

      if (dateDebut || dateFin) {
        filtres.dateInitiation = {};
        if (dateDebut) filtres.dateInitiation.$gte = new Date(dateDebut);
        if (dateFin) filtres.dateInitiation.$lte = new Date(dateFin);
      }

      if (montantMin || montantMax) {
        filtres.montantTotal = {};
        if (montantMin) filtres.montantTotal.$gte = parseFloat(montantMin);
        if (montantMax) filtres.montantTotal.$lte = parseFloat(montantMax);
      }

      const options = {
        page: parseInt(page),
        limit: parseInt(limit),
        sort: { dateInitiation: -1 },
        populate: [
          { path: 'payeurId', select: 'nom prenom email' },
          { path: 'beneficiaireId', select: 'nom prenom email' },
          { path: 'reservationId', select: 'numeroReservation' }
        ]
      };

      const resultats = await Paiement.paginate(filtres, options);

      res.status(200).json({
        success: true,
        data: resultats.docs,
        pagination: {
          page: resultats.page,
          pages: resultats.totalPages,
          total: resultats.totalDocs,
          limit: resultats.limit
        }
      });

    } catch (error) {
      console.error('Erreur liste paiements:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des paiements',
        error: error.message
      });
    }
  }

  /**
   * Obtenir l'historique des paiements d'un utilisateur
   */
  async historiquePaiementsUtilisateur(req, res) {
    try {
      const { utilisateurId } = req.params;
      const { page = 1, limit = 10 } = req.query;

      const paiements = await Paiement.find({
        $or: [
          { payeurId: utilisateurId },
          { beneficiaireId: utilisateurId }
        ]
      })
      .populate('reservationId', 'numeroReservation')
      .populate('payeurId beneficiaireId', 'nom prenom')
      .sort({ dateInitiation: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

      const total = await Paiement.countDocuments({
        $or: [
          { payeurId: utilisateurId },
          { beneficiaireId: utilisateurId }
        ]
      });

      res.status(200).json({
        success: true,
        data: paiements.map(p => p.obtenirResume()),
        pagination: {
          page: parseInt(page),
          pages: Math.ceil(total / limit),
          total,
          limit: parseInt(limit)
        }
      });

    } catch (error) {
      console.error('Erreur historique paiements:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération de l\'historique',
        error: error.message
      });
    }
  }

  // ===== GESTION DES COMMISSIONS =====

  /**
   * Obtenir les statistiques des commissions
   */
  async statistiquesCommissions(req, res) {
    try {
      const { dateDebut, dateFin } = req.query;
      
      const debut = dateDebut ? new Date(dateDebut) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const fin = dateFin ? new Date(dateFin) : new Date();

      const statistiques = await Paiement.obtenirStatistiquesCommissions(debut, fin);
      const commissionsEchec = await Paiement.obtenirCommissionsEnEchec();

      res.status(200).json({
        success: true,
        data: {
          periode: { dateDebut: debut, dateFin: fin },
          statistiques: statistiques[0] || {},
          commissionsEnEchec: commissionsEchec.length,
          detailsEchecs: commissionsEchec.slice(0, 10) // Limiter l'affichage
        }
      });

    } catch (error) {
      console.error('Erreur statistiques commissions:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors du calcul des statistiques',
        error: error.message
      });
    }
  }

  /**
   * Retraiter les commissions en échec
   */
  async retraiterCommissionsEchec(req, res) {
    try {
      const commissionsEchec = await Paiement.obtenirCommissionsEnEchec();
      const resultats = [];

      for (const paiement of commissionsEchec) {
        try {
          await paiement.traiterCommissionApresPayement();
          resultats.push({
            paiementId: paiement._id,
            statut: 'SUCCESS',
            message: 'Commission retraitée avec succès'
          });
        } catch (error) {
          resultats.push({
            paiementId: paiement._id,
            statut: 'FAILED',
            message: error.message
          });
        }
      }

      res.status(200).json({
        success: true,
        message: `${resultats.filter(r => r.statut === 'SUCCESS').length} commissions retraitées`,
        data: resultats
      });

    } catch (error) {
      console.error('Erreur retraitement commissions:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors du retraitement des commissions',
        error: error.message
      });
    }
  }

  // ===== RAPPORTS ET ANALYTICS =====

  /**
   * Générer un rapport de revenus
   */
  async rapportRevenus(req, res) {
    try {
      const { periode = 30 } = req.query;
      
      const analyseRevenus = await Paiement.analyseRevenus(parseInt(periode));
      const statistiquesModePaiement = await Paiement.statistiquesParModePaiement();

      res.status(200).json({
        success: true,
        data: {
          evolution: analyseRevenus,
          repartitionModesPaiement: statistiquesModePaiement,
          periode: `${periode} derniers jours`
        }
      });

    } catch (error) {
      console.error('Erreur rapport revenus:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la génération du rapport',
        error: error.message
      });
    }
  }

  /**
   * Dashboard administrateur
   */
  async dashboardAdmin(req, res) {
    try {
      const aujourd_hui = new Date();
      const il_y_a_30_jours = new Date(aujourd_hui.getTime() - 30 * 24 * 60 * 60 * 1000);

      // Statistiques générales
      const [
        paiementsEnAttente,
        statistiquesCommissions,
        analyseRevenus,
        statistiquesModePaiement
      ] = await Promise.all([
        Paiement.obtenirPaiementsEnAttente(),
        Paiement.obtenirStatistiquesCommissions(il_y_a_30_jours, aujourd_hui),
        Paiement.analyseRevenus(30),
        Paiement.statistiquesParModePaiement()
      ]);

      res.status(200).json({
        success: true,
        data: {
          paiementsEnAttente: paiementsEnAttente.length,
          statistiquesCommissions: statistiquesCommissions[0] || {},
          evolutionRevenus: analyseRevenus,
          repartitionModesPaiement: statistiquesModePaiement,
          alertes: {
            paiementsBloque: paiementsEnAttente.filter(p => 
              p.dateInitiation < new Date(Date.now() - 60 * 60 * 1000)
            ).length,
            commissionsEchec: await Paiement.countDocuments({
              'commission.statutPrelevement': 'echec'
            })
          }
        }
      });

    } catch (error) {
      console.error('Erreur dashboard admin:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la génération du dashboard',
        error: error.message
      });
    }
  }

  // ===== GESTION DES REMBOURSEMENTS =====

  /**
   * Initier un remboursement
   */
  async initierRemboursement(req, res) {
    try {
      const { paiementId } = req.params;
      const { motif, montantRemboursement } = req.body;

      const paiement = await Paiement.findById(paiementId);
      if (!paiement) {
        return res.status(404).json({
          success: false,
          message: 'Paiement introuvable'
        });
      }

      if (!paiement.peutChangerStatut('REMBOURSE')) {
        return res.status(400).json({
          success: false,
          message: 'Ce paiement ne peut pas être remboursé'
        });
      }

      const montant = montantRemboursement || paiement.montantTotal;
      
      paiement.statutPaiement = 'REMBOURSE';
      paiement.ajouterLog('REMBOURSEMENT_INITIE', {
        montantRemboursement: montant,
        motif,
        utilisateurId: req.user?.id
      }, 'ADMIN');

      await paiement.save();

      res.status(200).json({
        success: true,
        message: 'Remboursement initié avec succès',
        data: {
          paiementId: paiement._id,
          montantRembourse: montant,
          motif
        }
      });

    } catch (error) {
      console.error('Erreur remboursement:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de l\'initiation du remboursement',
        error: error.message
      });
    }
  }

  // ===== VÉRIFICATION ET SÉCURITÉ =====

  /**
   * Vérifier l'intégrité d'un paiement
   */
  async verifierIntegrite(req, res) {
    try {
      const { paiementId } = req.params;

      const paiement = await Paiement.findById(paiementId);
      if (!paiement) {
        return res.status(404).json({
          success: false,
          message: 'Paiement introuvable'
        });
      }

      const verification = {
        coherenceMontants: true,
        empreinteValide: true,
        commissionsCorrectes: true,
        erreurs: []
      };

      // Vérifier cohérence des montants
      const montantCalcule = paiement.montantConducteur + paiement.commission.montant + paiement.fraisTransaction;
      if (Math.abs(paiement.montantTotal - montantCalcule) > 0.01) {
        verification.coherenceMontants = false;
        verification.erreurs.push('Incohérence dans la répartition des montants');
      }

      // Vérifier la commission
      const commissionCalculee = Math.round(paiement.montantTotal * paiement.commission.taux);
      if (paiement.commission.montant !== commissionCalculee) {
        verification.commissionsCorrectes = false;
        verification.erreurs.push('Commission incorrecte');
      }

      verification.integre = verification.coherenceMontants && 
                            verification.empreinteValide && 
                            verification.commissionsCorrectes;

      res.status(200).json({
        success: true,
        data: {
          paiementId: paiement._id,
          verification,
          resume: paiement.obtenirResume()
        }
      });

    } catch (error) {
      console.error('Erreur vérification intégrité:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la vérification',
        error: error.message
      });
    }
  }
}

module.exports = new PaiementController();