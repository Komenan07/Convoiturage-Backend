// =====================================================
// 2. CONTROLLER - LOGIQUE MÉTIER PAIEMENT
// =====================================================

const Paiement = require('../models/Paiement');
const mongoose = require('mongoose');
const crypto = require('crypto');
const AppError = require('../utils/AppError');

class PaiementController {

  // ===== OPÉRATIONS CRUD =====

  /**
   * CREATE - Initier un nouveau paiement
   * @param {Object} req - Requête Express
   * @param {Object} res - Réponse Express
   */
  static async initierPaiement(req, res) {
    try {
      const { 
        reservationId, 
        payeurId, 
        beneficiaireId, 
        montantTotal, 
        methodePaiement,
        repartitionFrais = {},
        numeroTelephone,
        typeCourse = 'URBAIN'
      } = req.body;

      // === VALIDATION MÉTIER ===
      
      // Vérifier que la réservation existe
      const reservation = await mongoose.model('Reservation').findById(reservationId);
      if (!reservation) {
        return res.status(404).json({ 
          success: false, 
          message: 'Réservation introuvable',
          code: 'RESERVATION_NOT_FOUND'
        });
      }

      // Vérifier que les utilisateurs existent
      const [payeur, beneficiaire] = await Promise.all([
        mongoose.model('Utilisateur').findById(payeurId),
        mongoose.model('Utilisateur').findById(beneficiaireId)
      ]);

      if (!payeur) {
        return res.status(404).json({
          success: false,
          message: 'Payeur introuvable',
          code: 'PAYEUR_NOT_FOUND'
        });
      }

      if (!beneficiaire) {
        return res.status(404).json({
          success: false,
          message: 'Bénéficiaire introuvable',
          code: 'BENEFICIAIRE_NOT_FOUND'
        });
      }

      // Vérifier qu'il n'y a pas déjà un paiement pour cette réservation
      const paiementExistant = await Paiement.findOne({ 
        reservationId, 
        statutPaiement: { $nin: ['ECHEC', 'REMBOURSE'] }
      });

      if (paiementExistant) {
        return res.status(400).json({
          success: false,
          message: 'Un paiement existe déjà pour cette réservation',
          code: 'PAYMENT_ALREADY_EXISTS'
        });
      }

      // === CRÉATION DU PAIEMENT ===
      
      const paiement = new Paiement({
        reservationId,
        payeurId,
        beneficiaireId,
        montantTotal,
        methodePaiement,
        repartitionFrais
      });

      // Calculer la commission selon le type de course
      const tauxCommission = PaiementController._obtenirTauxCommission(typeCourse);
      paiement.calculerCommission(tauxCommission);

      // Ajouter log d'initiation
      paiement.ajouterLog('INITIATION', {
        utilisateur: payeurId,
        montant: montantTotal,
        methode: methodePaiement
      });

      // === TRAITEMENT SELON LA MÉTHODE DE PAIEMENT ===
      
      if (paiement.estPaiementMobile) {
        // Validation numéro de téléphone pour mobile money
        if (!numeroTelephone) {
          return res.status(400).json({
            success: false,
            message: 'Numéro de téléphone requis pour le paiement mobile',
            code: 'PHONE_NUMBER_REQUIRED'
          });
        }

        const resultatMobileMoney = await PaiementController._initierPaiementMobile(
          paiement, 
          numeroTelephone
        );
        
        if (resultatMobileMoney.success) {
          paiement.referencePaiementMobile = resultatMobileMoney.reference;
          paiement.callbackData.set('providerResponse', resultatMobileMoney.data);
          paiement.ajouterLog('MOBILE_MONEY_INITIATED', resultatMobileMoney.data);
        } else {
          paiement.statutPaiement = 'ECHEC';
          paiement.ajouterLog('MOBILE_MONEY_FAILED', { error: resultatMobileMoney.error });
        }
      } else if (methodePaiement === 'ESPECES') {
        // Pour les espèces, le paiement passe directement en statut "TRAITE"
        paiement.statutPaiement = 'TRAITE';
        paiement.ajouterLog('CASH_PAYMENT', { note: 'Paiement en espèces' });
      }

      // Sauvegarder le paiement
      await paiement.save();

      // Populer les données pour la réponse
      await paiement.populate([
        { path: 'payeurId', select: 'nom prenom telephone email' },
        { path: 'beneficiaireId', select: 'nom prenom telephone email' },
        { path: 'reservationId', select: 'itineraire dateDepart statut' }
      ]);

      res.status(201).json({
        success: true,
        message: 'Paiement initié avec succès',
        data: paiement,
        meta: {
          referenceTransaction: paiement.referenceTransaction,
          statutPaiement: paiement.statutPaiement,
          montantTotal: paiement.montantTotal,
          commission: paiement.commissionPlateforme
        }
      });

    } catch (error) {
      console.error('Erreur initiation paiement:', error);
      return next(AppError.serverError('Erreur serveur lors de l\'initiation du paiement', { originalError: error.message }));
    }
  }

  /**
   * READ - Obtenir l'historique des paiements avec filtres avancés
   * @param {Object} req - Requête Express
   * @param {Object} res - Réponse Express
   */
  static async obtenirHistoriquePaiements(req, res) {
    try {
      const filtres = {
        utilisateurId: req.query.utilisateurId,
        statutPaiement: req.query.statutPaiement,
        methodePaiement: req.query.methodePaiement,
        dateDebut: req.query.dateDebut,
        dateFin: req.query.dateFin,
        montantMin: req.query.montantMin ? parseFloat(req.query.montantMin) : undefined,
        montantMax: req.query.montantMax ? parseFloat(req.query.montantMax) : undefined
      };

      const options = {
        page: parseInt(req.query.page) || 1,
        limite: Math.min(parseInt(req.query.limite) || 10, 100), // Max 100 par page
        tri: req.query.tri ? JSON.parse(req.query.tri) : { dateInitiation: -1 }
      };

      const resultats = await Paiement.rechercherAvancee(filtres, options);

      res.json({
        success: true,
        message: 'Historique récupéré avec succès',
        data: resultats.paiements,
        pagination: resultats.pagination,
        filtres: {
          ...filtres,
          nombreResultats: resultats.pagination.total
        }
      });

    } catch (error) {
      console.error('Erreur récupération historique:', error);
      return next(AppError.serverError('Erreur serveur lors de la récupération de l\'historique', { originalError: error.message }));
    }
  }

  /**
   * READ - Obtenir les détails d'un paiement spécifique
   * @param {Object} req - Requête Express
   * @param {Object} res - Réponse Express
   */
  static async obtenirDetailsPaiement(req, res) {
    try {
      const { paiementId } = req.params;

      const paiement = await Paiement.findById(paiementId)
        .populate('payeurId', 'nom prenom telephone email avatar')
        .populate('beneficiaireId', 'nom prenom telephone email avatar')
        .populate('reservationId');

      if (!paiement) {
        return res.status(404).json({
          success: false,
          message: 'Paiement introuvable',
          code: 'PAYMENT_NOT_FOUND'
        });
      }

      // Vérifier les autorisations (utilisateur connecté doit être payeur, bénéficiaire ou admin)
      const utilisateurConnecte = req.user?.id;
      const autorise = !utilisateurConnecte || 
                      paiement.payeurId._id.toString() === utilisateurConnecte ||
                      paiement.beneficiaireId._id.toString() === utilisateurConnecte ||
                      req.user?.role === 'ADMIN';

      if (!autorise) {
        return res.status(403).json({
          success: false,
          message: 'Accès non autorisé à ce paiement',
          code: 'UNAUTHORIZED_ACCESS'
        });
      }

      res.json({
        success: true,
        message: 'Détails du paiement récupérés avec succès',
        data: paiement,
        meta: {
          peutEtreRembourse: paiement.peutEtreRembourse(),
          dureeTraitement: paiement.dureeTraitement,
          urlRecu: paiement.urlRecu
        }
      });

    } catch (error) {
      console.error('Erreur récupération détails paiement:', error);
      return next(AppError.serverError('Erreur serveur lors de la récupération du paiement', { originalError: error.message }));
    }
  }

  /**
   * UPDATE - Mettre à jour le statut d'un paiement
   * @param {Object} req - Requête Express
   * @param {Object} res - Réponse Express
   */
  static async mettreAJourStatutPaiement(req, res) {
    try {
      const { paiementId } = req.params;
      const { nouveauStatut, motif, metadata = {} } = req.body;

      const paiement = await Paiement.findById(paiementId);
      if (!paiement) {
        return res.status(404).json({
          success: false,
          message: 'Paiement introuvable',
          code: 'PAYMENT_NOT_FOUND'
        });
      }

      // Vérifier si la transition de statut est valide
      if (!paiement.peutChangerStatut(nouveauStatut)) {
        return res.status(400).json({
          success: false,
          message: `Transition de statut invalide: ${paiement.statutPaiement} -> ${nouveauStatut}`,
          code: 'INVALID_STATUS_TRANSITION',
          data: {
            statutActuel: paiement.statutPaiement,
            statutDemande: nouveauStatut
          }
        });
      }

      const ancienStatut = paiement.statutPaiement;
      paiement.statutPaiement = nouveauStatut;

      // Ajouter un log de la modification
      paiement.ajouterLog('STATUS_CHANGE', {
        ancienStatut,
        nouveauStatut,
        motif,
        utilisateur: req.user?.id,
        metadata
      });

      await paiement.save();

      // === ACTIONS POST-MISE À JOUR ===
      await PaiementController._executerActionsPostMiseAJour(paiement, ancienStatut, nouveauStatut);

      res.json({
        success: true,
        message: 'Statut du paiement mis à jour avec succès',
        data: {
          id: paiement._id,
          referenceTransaction: paiement.referenceTransaction,
          ancienStatut,
          nouveauStatut,
          dateModification: new Date()
        },
        meta: {
          peutEtreRembourse: paiement.peutEtreRembourse(),
          urlRecu: paiement.urlRecu
        }
      });

    } catch (error) {
      console.error('Erreur mise à jour statut:', error);
      return next(AppError.serverError('Erreur serveur lors de la mise à jour du statut', { originalError: error.message }));
    }
  }

  /**
   * UPDATE - Traiter un remboursement
   * @param {Object} req - Requête Express
   * @param {Object} res - Réponse Express
   */
  static async traiterRemboursement(req, res) {
    try {
      const { paiementId } = req.params;
      const { motifRemboursement, montantRemboursement, typeRemboursement = 'TOTAL' } = req.body;

      const paiement = await Paiement.findById(paiementId)
        .populate('payeurId', 'nom prenom telephone')
        .populate('beneficiaireId', 'nom prenom telephone');

      if (!paiement) {
        return res.status(404).json({
          success: false,
          message: 'Paiement introuvable',
          code: 'PAYMENT_NOT_FOUND'
        });
      }

      // Vérifier si le paiement peut être remboursé
      if (!paiement.peutEtreRembourse()) {
        return res.status(400).json({
          success: false,
          message: 'Ce paiement ne peut pas être remboursé',
          code: 'REFUND_NOT_ALLOWED',
          data: {
            statutActuel: paiement.statutPaiement,
            methodePaiement: paiement.methodePaiement
          }
        });
      }

      // Validation du montant de remboursement
      const montantAValider = montantRemboursement || paiement.montantTotal;
      if (montantAValider > paiement.montantTotal) {
        return res.status(400).json({
          success: false,
          message: 'Le montant de remboursement ne peut pas dépasser le montant total',
          code: 'INVALID_REFUND_AMOUNT'
        });
      }

      // Ajouter un log avant le remboursement
      paiement.ajouterLog('REFUND_INITIATED', {
        motif: motifRemboursement,
        montant: montantAValider,
        type: typeRemboursement,
        utilisateur: req.user?.id
      });

      let resultatRemboursement;

      // === TRAITEMENT DU REMBOURSEMENT ===
      if (paiement.estPaiementMobile) {
        resultatRemboursement = await PaiementController._initierRemboursementMobile(
          paiement, 
          montantAValider
        );
      } else {
        // Pour les espèces, c'est un traitement manuel
        resultatRemboursement = { 
          success: true, 
          message: 'Remboursement espèces à traiter manuellement',
          referenceRemboursement: `CASH_REFUND_${Date.now()}`
        };
      }

      if (resultatRemboursement.success) {
        paiement.statutPaiement = 'REMBOURSE';
        paiement.callbackData.set('refundData', {
          montant: montantAValider,
          reference: resultatRemboursement.referenceRemboursement,
          date: new Date(),
          motif: motifRemboursement
        });

        paiement.ajouterLog('REFUND_COMPLETED', {
          reference: resultatRemboursement.referenceRemboursement,
          montant: montantAValider,
          success: true
        });

        await paiement.save();

        res.json({
          success: true,
          message: 'Remboursement traité avec succès',
          data: {
            id: paiement._id,
            referenceTransaction: paiement.referenceTransaction,
            referenceRemboursement: resultatRemboursement.referenceRemboursement,
            montantRembourse: montantAValider,
            statutPaiement: paiement.statutPaiement
          }
        });
      } else {
        paiement.ajouterLog('REFUND_FAILED', {
          error: resultatRemboursement.error,
          montant: montantAValider
        });

        res.status(400).json({
          success: false,
          message: 'Échec du remboursement',
          code: 'REFUND_FAILED',
          error: resultatRemboursement.error
        });
      }

    } catch (error) {
      console.error('Erreur traitement remboursement:', error);
      return next(AppError.serverError('Erreur serveur lors du traitement du remboursement', { originalError: error.message }));
    }
  }

  /**
   * DELETE - Annuler une transaction
   * @param {Object} req - Requête Express
   * @param {Object} res - Réponse Express
   */
  static async annulerTransaction(req, res) {
    try {
      const { paiementId } = req.params;
      const { motifAnnulation } = req.body;

      const paiement = await Paiement.findById(paiementId);
      if (!paiement) {
        return res.status(404).json({
          success: false,
          message: 'Paiement introuvable',
          code: 'PAYMENT_NOT_FOUND'
        });
      }

      // Vérifier si la transaction peut être annulée
      const statutsAnnulables = ['EN_ATTENTE', 'ECHEC'];
      if (!statutsAnnulables.includes(paiement.statutPaiement)) {
        return res.status(400).json({
          success: false,
          message: 'Cette transaction ne peut pas être annulée',
          code: 'CANCELLATION_NOT_ALLOWED',
          data: {
            statutActuel: paiement.statutPaiement,
            statutsPermis: statutsAnnulables
          }
        });
      }

      // Log de l'annulation avant suppression
      console.log(`Annulation transaction: ${paiement.referenceTransaction}`, {
        motif: motifAnnulation,
        utilisateur: req.user?.id,
        date: new Date()
      });

      await Paiement.findByIdAndDelete(paiementId);

      res.json({
        success: true,
        message: 'Transaction annulée avec succès',
        data: {
          referenceTransaction: paiement.referenceTransaction,
          motifAnnulation,
          dateAnnulation: new Date()
        }
      });

    } catch (error) {
      console.error('Erreur annulation transaction:', error);
      return next(AppError.serverError('Erreur serveur lors de l\'annulation de la transaction', { originalError: error.message }));
    }
  }

  // ===== ACTIONS SPÉCIALISÉES =====

  /**
   * Traiter les callbacks des providers Mobile Money
   * @param {Object} req - Requête Express
   * @param {Object} res - Réponse Express
   */
  static async traiterCallbackMobileMoney(req, res) {
    try {
      const { 
        referenceTransaction, 
        statutTransaction, 
        referencePaiementMobile,
        montant,
        frais,
        messageProvider,
        timestampProvider
      } = req.body;

      const paiement = await Paiement.findOne({ referenceTransaction });
      if (!paiement) {
        return res.status(404).json({
          success: false,
          message: 'Transaction introuvable',
          code: 'TRANSACTION_NOT_FOUND'
        });
      }

      // Mapper le statut du provider au statut interne
      const mappingStatuts = {
        'SUCCESS': 'COMPLETE',
        'COMPLETED': 'COMPLETE',
        'PENDING': 'TRAITE',
        'PROCESSING': 'TRAITE',
        'FAILED': 'ECHEC',
        'CANCELLED': 'ECHEC',
        'EXPIRED': 'ECHEC'
      };

      const nouveauStatut = mappingStatuts[statutTransaction?.toUpperCase()] || 'ECHEC';
      const ancienStatut = paiement.statutPaiement;

      // Vérifier la cohérence du callback
      if (montant && Math.abs(montant - paiement.montantTotal) > 0.01) {
        console.warn(`Incohérence montant callback: ${montant} vs ${paiement.montantTotal}`);
      }

      paiement.statutPaiement = nouveauStatut;
      paiement.referencePaiementMobile = referencePaiementMobile || paiement.referencePaiementMobile;

      // Stocker les données du callback
      paiement.callbackData.set('lastCallback', {
        statutProvider: statutTransaction,
        montant,
        frais,
        message: messageProvider,
        timestamp: timestampProvider || new Date(),
        receivedAt: new Date()
      });

      // Ajouter un log détaillé
      paiement.ajouterLog('MOBILE_MONEY_CALLBACK', {
        ancienStatut,
        nouveauStatut,
        statutProvider: statutTransaction,
        montant,
        frais,
        referencePaiementMobile
      });

      await paiement.save();

      // Actions post-callback
      await PaiementController._executerActionsPostMiseAJour(paiement, ancienStatut, nouveauStatut);

      res.json({
        success: true,
        message: 'Callback traité avec succès',
        data: { 
          referenceTransaction, 
          statut: nouveauStatut,
          timestamp: new Date()
        }
      });

    } catch (error) {
      console.error('Erreur traitement callback:', error);
      return next(AppError.serverError('Erreur serveur lors du traitement du callback', { originalError: error.message }));
    }
  }

  /**
   * Générer un reçu de paiement
   * @param {Object} req - Requête Express
   * @param {Object} res - Réponse Express
   */
  static async genererRecu(req, res) {
    try {
      const { paiementId, numeroRecu } = req.params;

      const paiement = await Paiement.findById(paiementId)
        .populate('payeurId', 'nom prenom telephone email')
        .populate('beneficiaireId', 'nom prenom telephone email')
        .populate('reservationId', 'itineraire dateDepart dateArrivee');

      if (!paiement || paiement.statutPaiement !== 'COMPLETE') {
        return res.status(404).json({
          success: false,
          message: 'Reçu non disponible pour ce paiement',
          code: 'RECEIPT_NOT_AVAILABLE'
        });
      }

      // Vérifier que le numéro de reçu correspond
      if (numeroRecu && paiement.numeroRecu !== numeroRecu) {
        return res.status(404).json({
          success: false,
          message: 'Numéro de reçu invalide',
          code: 'INVALID_RECEIPT_NUMBER'
        });
      }

      const recu = {
        // Informations du reçu
        numeroRecu: paiement.numeroRecu,
        referenceTransaction: paiement.referenceTransaction,
        dateEmission: paiement.dateCompletion,
        
        // Informations des parties
        payeur: {
          nom: `${paiement.payeurId.prenom} ${paiement.payeurId.nom}`,
          telephone: paiement.payeurId.telephone,
          email: paiement.payeurId.email
        },
        beneficiaire: {
          nom: `${paiement.beneficiaireId.prenom} ${paiement.beneficiaireId.nom}`,
          telephone: paiement.beneficiaireId.telephone,
          email: paiement.beneficiaireId.email
        },
        
        // Informations financières
        montants: {
          total: paiement.montantTotal,
          conducteur: paiement.montantConducteur,
          commission: paiement.commissionPlateforme,
          fraisTransaction: paiement.fraisTransaction
        },
        
        // Méthode et détails
        methodePaiement: paiement.methodePaiement,
        referencePaiementMobile: paiement.referencePaiementMobile,
        
        // Répartition des frais
        repartitionFrais: paiement.repartitionFrais,
        
        // Informations de la course
        course: paiement.reservationId ? {
          itineraire: paiement.reservationId.itineraire,
          dateDepart: paiement.reservationId.dateDepart,
          dateArrivee: paiement.reservationId.dateArrivee
        } : null,
        
        // Métadonnées
        meta: {
          plateforme: 'VotrePlateforme',
          version: '1.0',
          dateGeneration: new Date()
        }
      };

      res.json({
        success: true,
        message: 'Reçu généré avec succès',
        data: recu
      });

    } catch (error) {
      console.error('Erreur génération reçu:', error);
      return next(AppError.serverError('Erreur serveur lors de la génération du reçu', { originalError: error.message }));
    }
  }

  /**
   * Calculer la commission de la plateforme
   * @param {Object} req - Requête Express
   * @param {Object} res - Réponse Express
   */
  static async calculerCommissionPlateforme(req, res) {
    try {
      const { montantTotal, typeCourse = 'URBAIN', distanceKm, dureeMinutes } = req.body;

      if (!montantTotal || montantTotal <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Montant total invalide',
          code: 'INVALID_AMOUNT'
        });
      }

      const tauxCommission = PaiementController._obtenirTauxCommission(typeCourse, distanceKm, dureeMinutes);
      const commission = Math.round(montantTotal * tauxCommission * 100) / 100;
      const montantConducteur = montantTotal - commission;

      // Calcul des frais de transaction estimés
      const fraisTransaction = PaiementController._calculerFraisTransaction(montantTotal);
      const montantConducteurNet = montantConducteur - fraisTransaction;

      res.json({
        success: true,
        message: 'Commission calculée avec succès',
        data: {
          montantTotal,
          tauxCommission: Math.round(tauxCommission * 10000) / 100, // Pourcentage avec 2 décimales
          commission,
          montantConducteur,
          fraisTransactionEstimes: fraisTransaction,
          montantConducteurNet,
          typeCourse,
          criteres: {
            distanceKm,
            dureeMinutes
          }
        }
      });

    } catch (error) {
      console.error('Erreur calcul commission:', error);
      return next(AppError.serverError('Erreur serveur lors du calcul de commission', { originalError: error.message }));
    }
  }

  /**
   * Effectuer un rapprochement comptable
   * @param {Object} req - Requête Express
   * @param {Object} res - Réponse Express
   */
  static async effectuerRapprochementComptable(req, res) {
    try {
      const { dateDebut, dateFin, methodePaiement, formatExport } = req.query;

      if (!dateDebut || !dateFin) {
        return res.status(400).json({
          success: false,
          message: 'Dates de début et fin requises',
          code: 'MISSING_DATE_RANGE'
        });
      }

      const debut = new Date(dateDebut);
      const fin = new Date(dateFin);

      // Validation des dates
      if (debut >= fin) {
        return res.status(400).json({
          success: false,
          message: 'La date de début doit être antérieure à la date de fin',
          code: 'INVALID_DATE_RANGE'
        });
      }

      const rapport = await Paiement.obtenirRapportFinancier({ dateDebut: debut, dateFin: fin });

      // Calculs des totaux généraux
      const totauxGeneraux = rapport.reduce((acc, item) => ({
        nombreTransactions: acc.nombreTransactions + item.nombreTransactions,
        chiffreAffaires: acc.chiffreAffaires + item.chiffreAffaires,
        commissionsPerçues: acc.commissionsPerçues + item.commissionsPerçues,
        montantVerseConducteurs: acc.montantVerseConducteurs + item.montantVerseConducteurs,
        fraisTransactionTotal: acc.fraisTransactionTotal + item.fraisTransactionTotal
      }), {
        nombreTransactions: 0,
        chiffreAffaires: 0,
        commissionsPerçues: 0,
        montantVerseConducteurs: 0,
        fraisTransactionTotal: 0
      });

      // Calculs de ratios
      const ratios = {
        tauxCommissionMoyen: totauxGeneraux.chiffreAffaires > 0 
          ? (totauxGeneraux.commissionsPerçues / totauxGeneraux.chiffreAffaires * 100).toFixed(2)
          : 0,
        montantMoyenTransaction: totauxGeneraux.nombreTransactions > 0
          ? (totauxGeneraux.chiffreAffaires / totauxGeneraux.nombreTransactions).toFixed(2)
          : 0,
        rentabilitePlateforme: totauxGeneraux.commissionsPerçues - totauxGeneraux.fraisTransactionTotal
      };

      const rapprochement = {
        periode: { dateDebut, dateFin },
        detailsParMethodeEtDate: rapport,
        totauxGeneraux,
        ratios,
        meta: {
          nombreJoursAnalyses: Math.ceil((fin - debut) / (1000 * 60 * 60 * 24)),
          dateGeneration: new Date()
        }
      };

      res.json({
        success: true,
        message: 'Rapprochement comptable effectué avec succès',
        data: rapprochement
      });

    } catch (error) {
      console.error('Erreur rapprochement comptable:', error);
      return next(AppError.serverError('Erreur serveur lors du rapprochement comptable', { originalError: error.message }));
    }
  }

  // ===== MÉTHODES PRIVÉES UTILITAIRES =====

  /**
   * Obtenir le taux de commission selon le type de course
   * @private
   */
  static _obtenirTauxCommission(typeCourse, distanceKm = 0, dureeMinutes = 0) {
    const baremeBase = {
      'URBAIN': 0.05,          // 5%
      'INTERURBAIN': 0.07,     // 7%
      'LONGUE_DISTANCE': 0.10, // 10%
      'PREMIUM': 0.08,         // 8%
      'ECONOMIQUE': 0.04       // 4%
    };

    let taux = baremeBase[typeCourse] || 0.05;

    // Ajustements selon la distance
    if (distanceKm > 100) {
      taux += 0.01; // +1% pour les longues distances
    }
    
    // Ajustements selon la durée
    if (dureeMinutes > 120) {
      taux += 0.005; // +0.5% pour les longs trajets
    }

    return Math.min(taux, 0.15); // Maximum 15%
  }

  /**
   * Calculer les frais de transaction selon le montant
   * @private
   */
  static _calculerFraisTransaction(montant) {
    // Simulation de frais dégressifs
    if (montant < 1000) return 25;      // 25 FCFA
    if (montant < 5000) return 50;      // 50 FCFA
    if (montant < 10000) return 75;     // 75 FCFA
    return Math.min(montant * 0.01, 200); // 1% max 200 FCFA
  }

  /**
   * Initier un paiement mobile money (simulation d'intégration)
   * @private
   */
  static async _initierPaiementMobile(paiement, numeroTelephone) {
    try {
      // Simulation des différents providers
      const providers = {
        'WAVE': () => PaiementController._simulerWaveAPI(paiement, numeroTelephone),
        'ORANGE_MONEY': () => PaiementController._simulerOrangeMoneyAPI(paiement, numeroTelephone),
        'MTN_MONEY': () => PaiementController._simulerMTNAPI(paiement, numeroTelephone),
        'MOOV_MONEY': () => PaiementController._simulerMoovAPI(paiement, numeroTelephone)
      };

      const provider = providers[paiement.methodePaiement];
      if (!provider) {
        return { success: false, error: 'Méthode de paiement non supportée' };
      }

      return await provider();

    } catch (error) {
      console.error('Erreur initiation paiement mobile:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Initier un remboursement mobile money
   * @private
   */
  static async _initierRemboursementMobile(paiement, montant) {
    try {
      // Simulation d'API de remboursement
      const delay = Math.random() * 2000 + 1000; // 1-3 secondes
      await new Promise(resolve => setTimeout(resolve, delay));

      // Simuler un succès dans 90% des cas
      if (Math.random() > 0.1) {
        return {
          success: true,
          referenceRemboursement: `REFUND_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
          montant,
          dateTraitement: new Date()
        };
      } else {
        return {
          success: false,
          error: 'Échec du remboursement côté provider'
        };
      }

    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Exécuter les actions post mise à jour de statut
   * @private
   */
  static async _executerActionsPostMiseAJour(paiement, ancienStatut, nouveauStatut) {
    try {
      switch (nouveauStatut) {
        case 'COMPLETE':
          // Générer URL du reçu
          paiement.genererUrlRecu();
          await paiement.save();
          
          // TODO: Notifier les utilisateurs
          // await NotificationService.envoyerNotificationPaiementComplete(paiement);
          
          // TODO: Mettre à jour le statut de la réservation
          // await ReservationService.marquerCommePayee(paiement.reservationId);
          
          break;
          
        case 'ECHEC':
          // TODO: Notifier l'échec
          // await NotificationService.envoyerNotificationPaiementEchec(paiement);
          
          break;
          
        case 'REMBOURSE':
          // TODO: Notifier le remboursement
          // await NotificationService.envoyerNotificationRemboursement(paiement);
          
          break;
      }
      
    } catch (error) {
      console.error('Erreur actions post-mise à jour:', error);
    }
  }

  // Simulations d'APIs des providers (à remplacer par les vraies intégrations)
  static async _simulerWaveAPI(paiement, numeroTelephone) {
    await new Promise(resolve => setTimeout(resolve, 1500));
    return {
      success: Math.random() > 0.1,
      reference: `WAVE_${Date.now()}`,
      data: { transactionId: `wave_${crypto.randomBytes(8).toString('hex')}`, numeroTelephone }
    };
  }

  static async _simulerOrangeMoneyAPI(paiement, numeroTelephone) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    return {
      success: Math.random() > 0.15,
      reference: `OM_${Date.now()}`,
      data: { transactionId: `om_${crypto.randomBytes(8).toString('hex')}`, numeroTelephone }
    };
  }

  static async _simulerMTNAPI(paiement, numeroTelephone) {
    await new Promise(resolve => setTimeout(resolve, 1800));
    return {
      success: Math.random() > 0.12,
      reference: `MTN_${Date.now()}`,
      data: { transactionId: `mtn_${crypto.randomBytes(8).toString('hex')}`, numeroTelephone }
    };
  }

  static async _simulerMoovAPI(paiement, numeroTelephone) {
    await new Promise(resolve => setTimeout(resolve, 2200));
    return {
      success: Math.random() > 0.08,
      reference: `MOOV_${Date.now()}`,
      data: { transactionId: `moov_${crypto.randomBytes(8).toString('hex')}`, numeroTelephone }
    };
  }
}

module.exports = PaiementController;