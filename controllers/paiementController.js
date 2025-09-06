// =====================================================
// CONTROLLER - LOGIQUE MÉTIER PAIEMENT COMPLET
// =====================================================

const Paiement = require('../models/Paiement');
const mongoose = require('mongoose');
const crypto = require('crypto');
const AppError = require('../utils/AppError');
const SMSService = require('../services/SMSService');


class PaiementController {

  // ===== OPÉRATIONS CRUD ÉTENDUES =====

  /**
   * CREATE - Initier un nouveau paiement avec toutes les fonctionnalités
   * @param {Object} req - Requête Express
   * @param {Object} res - Réponse Express
   * @param {Function} next - Middleware suivant
   */
  static async initierPaiement(req, res, next) {
    try {
      const { 
        reservationId, 
        payeurId, 
        beneficiaireId, 
        montantTotal, 
        methodePaiement,
        repartitionFrais = {},
        numeroTelephone,
        typeCourse = 'URBAIN',
        customerEmail,
        customerName,
        tauxCommissionPersonnalise,
        soldeMinimumRequis = 5000
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
        statutPaiement: { $nin: ['ECHEC', 'REMBOURSE', 'EXPIRE'] }
      });

      if (paiementExistant) {
        return res.status(400).json({
          success: false,
          message: 'Un paiement existe déjà pour cette réservation',
          code: 'PAYMENT_ALREADY_EXISTS'
        });
      }

      // === VALIDATION SOLDE MINIMUM POUR CONDUCTEUR ===
      if (methodePaiement === 'PORTEFEUILLE_INTERNE') {
        const soldeConducteur = await PaiementController._obtenirSoldeConducteur(beneficiaireId);
        if (soldeConducteur < soldeMinimumRequis) {
          return res.status(400).json({
            success: false,
            message: 'Solde insuffisant pour accepter des passagers',
            code: 'INSUFFICIENT_BALANCE',
            data: {
              soldeActuel: soldeConducteur,
              soldeMinimumRequis
            }
          });
        }
      }

      // === CRÉATION DU PAIEMENT ===
      
      const paiement = new Paiement({
        reservationId,
        payeurId,
        beneficiaireId,
        montantTotal,
        methodePaiement,
        repartitionFrais,
        'portefeuille.soldeMinimumRequis': soldeMinimumRequis
      });

      // Calculer la commission (10% par défaut ou personnalisée)
      const tauxCommission = tauxCommissionPersonnalise || PaiementController._obtenirTauxCommission(typeCourse);
      paiement.calculerCommission(tauxCommission);

      // Générer OTP si requis (montants > 10,000 FCFA)
if (paiement.necessiteOTP) {
  const codeOTP = paiement.genererOTP();
  
    try {
      // Envoyer OTP par SMS
      await SMSService.envoyerOTP(numeroTelephone, codeOTP);
      paiement.programmerNotification('OTP_ENVOYE', 'PAYEUR', 'SMS');
    } catch (error) {
      console.error('Erreur envoi OTP:', error);
      paiement.programmerNotification('OTP_ERREUR', 'PAYEUR', 'SMS');
    }
  }

      // Ajouter log d'initiation
      paiement.ajouterLog('INITIATION', {
        utilisateur: payeurId,
        montant: montantTotal,
        methode: methodePaiement,
        tauxCommission
      });

      // === TRAITEMENT SELON LA MÉTHODE DE PAIEMENT ===
      
      if (paiement.estPaiementMobile || paiement.estPaiementCarte) {
        // Validation numéro de téléphone pour mobile money
        if (paiement.estPaiementMobile && !numeroTelephone) {
          return res.status(400).json({
            success: false,
            message: 'Numéro de téléphone requis pour le paiement mobile',
            code: 'PHONE_NUMBER_REQUIRED'
          });
        }

        // Initialiser CinetPay pour les paiements électroniques
        const resultatCinetPay = await PaiementController._initierPaiementCinetPay(
          paiement, 
          numeroTelephone,
          customerEmail || payeur.email,
          customerName || `${payeur.prenom} ${payeur.nom}`
        );
        
        if (resultatCinetPay.success) {
          paiement.initialiserCinetPay(resultatCinetPay.data);
        } else {
          paiement.statutPaiement = 'ECHEC';
          paiement.ajouterErreur('CINETPAY_INIT_FAILED', resultatCinetPay.error);
        }
      } else if (methodePaiement === 'ESPECES') {
        // Pour les espèces, le paiement passe directement en statut "TRAITE"
        paiement.statutPaiement = 'TRAITE';
        paiement.ajouterLog('CASH_PAYMENT', { note: 'Paiement en espèces' });
      } else if (methodePaiement === 'PORTEFEUILLE_INTERNE') {
        // Traitement via portefeuille interne
        paiement.statutPaiement = 'TRAITE';
        paiement.ajouterLog('WALLET_PAYMENT', { 
          note: 'Paiement via portefeuille interne',
          soldeAvant: soldeConducteur
        });
      }

      // Sauvegarder le paiement
      await paiement.save();

      // Populer les données pour la réponse
      await paiement.populate([
        { path: 'payeurId', select: 'nom prenom telephone email' },
        { path: 'beneficiaireId', select: 'nom prenom telephone email' },
        { path: 'reservationId', select: 'itineraire dateDepart statut' }
      ]);

      const responseData = {
        id: paiement._id,
        referenceTransaction: paiement.referenceTransaction,
        statutPaiement: paiement.statutPaiement,
        montantTotal: paiement.montantTotal,
        commission: paiement.commissionPlateforme,
        methodePaiement: paiement.methodePaiement,
        otpRequis: paiement.necessiteOTP,
        soldeInsuffisant: paiement.soldeInsuffisant
      };

      // Ajouter les données CinetPay si disponibles
      if (paiement.estCinetPay) {
        responseData.cinetpay = {
          transactionId: paiement.cinetpay.transactionId,
          paymentUrl: paiement.cinetpay.paymentUrl,
          status: paiement.cinetpay.status,
          expirationDate: paiement.cinetpay.expirationDate
        };
      }

      // Programmer notifications
      paiement.programmerNotification('CONFIRMATION_PAIEMENT', 'PAYEUR', 'PUSH');
      
      if (paiement.soldeInsuffisant) {
        paiement.programmerNotification('SOLDE_INSUFFISANT', 'BENEFICIAIRE', 'SMS');
      }

      res.status(201).json({
        success: true,
        message: 'Paiement initié avec succès',
        data: responseData
      });

    } catch (error) {
      console.error('Erreur initiation paiement:', error);
      return next(AppError.serverError('Erreur serveur lors de l\'initiation du paiement', { originalError: error.message }));
    }
  }

  /**
   * Vérifier un code OTP
   * @param {Object} req - Requête Express
   * @param {Object} res - Réponse Express
   * @param {Function} next - Middleware suivant
   */
  static async verifierOTP(req, res, next) {
    try {
      const { paiementId } = req.params;
      const { codeOTP } = req.body;

      const paiement = await Paiement.findById(paiementId);
      if (!paiement) {
        return res.status(404).json({
          success: false,
          message: 'Paiement introuvable',
          code: 'PAYMENT_NOT_FOUND'
        });
      }

      const otpValide = paiement.verifierOTP(codeOTP);
      
      if (otpValide) {
        // Continuer le processus de paiement
        if (paiement.statutPaiement === 'EN_ATTENTE') {
          paiement.statutPaiement = 'TRAITE';
        }
        
        await paiement.save();

        res.json({
          success: true,
          message: 'OTP vérifié avec succès',
          data: {
            paiementId: paiement._id,
            statutPaiement: paiement.statutPaiement,
            otpVerifie: true
          }
        });
      } else {
        res.status(400).json({
          success: false,
          message: 'Code OTP invalide ou expiré',
          code: 'INVALID_OTP',
          data: {
            tentativesRestantes: 3 - paiement.securite.tentativesOTP
          }
        });
      }

    } catch (error) {
      console.error('Erreur vérification OTP:', error);
      return next(AppError.serverError('Erreur serveur lors de la vérification OTP', { originalError: error.message }));
    }
  }

  /**
   * Initier une recharge de portefeuille
   * @param {Object} req - Requête Express
   * @param {Object} res - Réponse Express
   * @param {Function} next - Middleware suivant
   */
  static async initierRecharge(req, res, next) {
    try {
      const { 
        utilisateurId, 
        montantRecharge, 
        methodeRecharge, 
        numeroTelephone,
        partenaireAgree 
      } = req.body;
      console.log("Numéro reçu :", numeroTelephone); 
      // Validation des données
      if (!utilisateurId || !montantRecharge || !methodeRecharge) {
        return res.status(400).json({
          success: false,
          message: 'Données de recharge incomplètes',
          code: 'INCOMPLETE_RECHARGE_DATA'
        });
      }

      // Créer un paiement de type recharge
      const paiementRecharge = new Paiement({
        payeurId: utilisateurId,
        beneficiaireId: utilisateurId, // Auto-recharge
        montantTotal: montantRecharge,
        methodePaiement: methodeRecharge === 'DEPOT_PARTENAIRE' ? 'ESPECES' : methodeRecharge,
        'recharge.estRecharge': true,
        'recharge.methodeRecharge': methodeRecharge
      });

      // Calculer commission réduite pour les recharges (2%)
      paiementRecharge.calculerCommission(0.02);

      if (partenaireAgree) {
        paiementRecharge.recharge.partenaireAgree = partenaireAgree;
      }

      paiementRecharge.initierRecharge(methodeRecharge, partenaireAgree);

      // Ajouter log
      paiementRecharge.ajouterLog('RECHARGE_INITIEE', {
        utilisateur: utilisateurId,
        montant: montantRecharge,
        methode: methodeRecharge
      });

      await paiementRecharge.save();

      res.status(201).json({
        success: true,
        message: 'Recharge initiée avec succès',
        data: {
          id: paiementRecharge._id,
          referenceTransaction: paiementRecharge.referenceTransaction,
          montantRecharge,
          methodeRecharge,
          statutRecharge: paiementRecharge.recharge.statutRecharge
        }
      });

    } catch (error) {
      console.error('Erreur initiation recharge:', error);
      return next(AppError.serverError('Erreur serveur lors de l\'initiation de la recharge', { originalError: error.message }));
    }
  }

  /**
   * Initier un retrait avec calcul des frais
   * @param {Object} req - Requête Express
   * @param {Object} res - Réponse Express
   * @param {Function} next - Middleware suivant
   */
  static async initierRetrait(req, res, next) {
    try {
      const { paiementId } = req.params;
      const { numeroMobile, operateur, nomTitulaire, delai = '24H' } = req.body;

      if (!numeroMobile || !operateur || !nomTitulaire) {
        return res.status(400).json({
          success: false,
          message: 'Informations du compte destinataire requises',
          code: 'MISSING_WITHDRAWAL_INFO'
        });
      }

      const paiement = await Paiement.findById(paiementId);
      if (!paiement) {
        return res.status(404).json({
          success: false,
          message: 'Paiement introuvable',
          code: 'PAYMENT_NOT_FOUND'
        });
      }

      if (!paiement.portefeuille.crediteDansPortefeuille) {
        return res.status(400).json({
          success: false,
          message: 'Le portefeuille n\'a pas été crédité pour ce paiement',
          code: 'WALLET_NOT_CREDITED'
        });
      }

      const compteDestinataire = { 
        numeroMobile, 
        operateur, 
        nomTitulaire,
        typeBanque: operateur === 'WAVE' ? 'MOBILE_MONEY' : 'MOBILE_MONEY'
      };

      // Calculer les frais de retrait
      const fraisRetrait = paiement.calculerFraisRetrait(paiement.montantConducteur);
      const montantNet = paiement.montantConducteur - fraisRetrait;

      paiement.initierRetrait(compteDestinataire, delai);
      await paiement.save();

      res.json({
        success: true,
        message: 'Retrait initié avec succès',
        data: {
          paiementId: paiement._id,
          montantBrut: paiement.montantConducteur,
          fraisRetrait,
          montantNet,
          compteDestinataire,
          statutRetrait: paiement.portefeuille.statutRetrait,
          delaiRetrait: delai
        }
      });

    } catch (error) {
      console.error('Erreur initiation retrait:', error);
      return next(AppError.serverError('Erreur serveur lors de l\'initiation du retrait', { originalError: error.message }));
    }
  }

  /**
   * Ouvrir un litige
   * @param {Object} req - Requête Express
   * @param {Object} res - Réponse Express
   * @param {Function} next - Middleware suivant
   */
  static async ouvrirLitige(req, res, next) {
    try {
      const { paiementId } = req.params;
      const { motifLitige, descriptionLitige } = req.body;

      if (!motifLitige || !descriptionLitige) {
        return res.status(400).json({
          success: false,
          message: 'Motif et description du litige requis',
          code: 'INCOMPLETE_DISPUTE_DATA'
        });
      }

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

      // Vérifier que le paiement peut faire l'objet d'un litige
      const statutsLitigeables = ['COMPLETE', 'TRAITE', 'ECHEC'];
      if (!statutsLitigeables.includes(paiement.statutPaiement)) {
        return res.status(400).json({
          success: false,
          message: 'Ce paiement ne peut pas faire l\'objet d\'un litige',
          code: 'DISPUTE_NOT_ALLOWED',
          data: {
            statutActuel: paiement.statutPaiement
          }
        });
      }

      const numeroLitige = paiement.ouvrirLitige(motifLitige, descriptionLitige);
      await paiement.save();

      // Programmer notifications
      paiement.programmerNotification('LITIGE', 'ADMIN', 'EMAIL');
      paiement.programmerNotification('LITIGE', 'PAYEUR', 'PUSH');
      paiement.programmerNotification('LITIGE', 'BENEFICIAIRE', 'PUSH');

      res.json({
        success: true,
        message: 'Litige ouvert avec succès',
        data: {
          numeroLitige,
          motifLitige,
          statutLitige: paiement.litige.statutLitige,
          dateOuverture: paiement.litige.dateOuvertureLitige
        }
      });

    } catch (error) {
      console.error('Erreur ouverture litige:', error);
      return next(AppError.serverError('Erreur serveur lors de l\'ouverture du litige', { originalError: error.message }));
    }
  }

  /**
   * Calculer le montant de remboursement selon les règles
   * @param {Object} req - Requête Express
   * @param {Object} res - Réponse Express
   * @param {Function} next - Middleware suivant
   */
  static async calculerRemboursement(req, res, next) {
    try {
      const { paiementId } = req.params;

      const paiement = await Paiement.findById(paiementId);
      if (!paiement) {
        return res.status(404).json({
          success: false,
          message: 'Paiement introuvable',
          code: 'PAYMENT_NOT_FOUND'
        });
      }

      const peutEtreRembourse = paiement.peutEtreRembourse();
      const montantRemboursable = paiement.calculerMontantRemboursement();

      // Calculer le délai écoulé depuis l'initiation
      const delaiEcoule = (new Date() - paiement.dateInitiation) / (1000 * 60); // en minutes
      const estAnnulationTardive = delaiEcoule > paiement.remboursement.regleAnnulation.delaiAnnulationGratuite;

      res.json({
        success: true,
        message: 'Calcul de remboursement effectué',
        data: {
          peutEtreRembourse,
          montantOriginal: paiement.montantTotal,
          montantRemboursable,
          typeRemboursement: paiement.remboursement.typeRemboursement,
          delaiEcoule: Math.round(delaiEcoule),
          delaiGratuit: paiement.remboursement.regleAnnulation.delaiAnnulationGratuite,
          estAnnulationTardive,
          fraisAnnulationTardive: estAnnulationTardive ? 
            (paiement.montantTotal * paiement.remboursement.regleAnnulation.fraisAnnulationTardive) : 0
        }
      });

    } catch (error) {
      console.error('Erreur calcul remboursement:', error);
      return next(AppError.serverError('Erreur serveur lors du calcul de remboursement', { originalError: error.message }));
    }
  }

  // ===== TABLEAUX DE BORD ADMINISTRATIFS =====

  /**
   * Obtenir le tableau de bord administrateur
   * @param {Object} req - Requête Express
   * @param {Object} res - Réponse Express
   * @param {Function} next - Middleware suivant
   */
  static async obtenirTableauBordAdmin(req, res, next) {
    try {
      const { dateDebut, dateFin } = req.query;
      const debut = dateDebut ? new Date(dateDebut) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 jours par défaut
      const fin = dateFin ? new Date(dateFin) : new Date();

      // Obtenir les statistiques générales
      const [
        statistiquesCommissions,
        conducteursSoldeInsuffisant,
        transactionsOTPRequis,
        litigesOuverts,
        paiementsACrediter,
        notificationsEnAttente
      ] = await Promise.all([
        Paiement.obtenirStatistiquesCommissions(debut, fin),
        Paiement.obtenirConducteursSoldeInsuffisant(),
        Paiement.obtenirTransactionsOTPRequis(),
        Paiement.obtenirLitigesOuverts(),
        Paiement.obtenirPaiementsACrediter(),
        Paiement.obtenirNotificationsEnAttente()
      ]);

      // Obtenir les transactions par statut
      const transactionsParStatut = await Paiement.aggregate([
        {
          $match: {
            dateInitiation: { $gte: debut, $lte: fin }
          }
        },
        {
          $group: {
            _id: '$statutPaiement',
            nombre: { $sum: 1 },
            montantTotal: { $sum: '$montantTotal' }
          }
        }
      ]);

      // Obtenir les méthodes de paiement les plus utilisées
      const methodesPopulaires = await Paiement.aggregate([
        {
          $match: {
            dateInitiation: { $gte: debut, $lte: fin },
            statutPaiement: 'COMPLETE'
          }
        },
        {
          $group: {
            _id: '$methodePaiement',
            nombre: { $sum: 1 },
            montantTotal: { $sum: '$montantTotal' }
          }
        },
        { $sort: { nombre: -1 } }
      ]);

      // Transactions suspectes ou à surveiller
      const transactionsSuspectes = await Paiement.find({
        'tracking.categorieTransaction': { $in: ['SUSPECTE', 'A_SURVEILLER'] },
        dateInitiation: { $gte: debut, $lte: fin }
      }).populate('payeurId beneficiaireId', 'nom prenom telephone');

      const tableauBord = {
        periode: { debut, fin },
        statistiquesGenerales: {
          commissions: statistiquesCommissions[0] || {},
          transactionsParStatut,
          methodesPopulaires
        },
        alertes: {
          conducteursSoldeInsuffisant: conducteursSoldeInsuffisant.length,
          transactionsOTPRequis: transactionsOTPRequis.length,
          litigesOuverts: litigesOuverts.length,
          paiementsACrediter: paiementsACrediter.length,
          notificationsEnAttente: notificationsEnAttente.length
        },
        transactionsSuspectes,
        meta: {
          dateGeneration: new Date(),
          nombreJoursAnalyses: Math.ceil((fin - debut) / (1000 * 60 * 60 * 24))
        }
      };

      res.json({
        success: true,
        message: 'Tableau de bord administrateur généré avec succès',
        data: tableauBord
      });

    } catch (error) {
      console.error('Erreur tableau de bord admin:', error);
      return next(AppError.serverError('Erreur serveur lors de la génération du tableau de bord', { originalError: error.message }));
    }
  }

  /**
   * Obtenir les conducteurs avec solde insuffisant
   * @param {Object} req - Requête Express
   * @param {Object} res - Réponse Express
   * @param {Function} next - Middleware suivant
   */
  static async obtenirConducteursSoldeInsuffisant(req, res, next) {
    try {
      const conducteurs = await Paiement.obtenirConducteursSoldeInsuffisant();
      
      res.json({
        success: true,
        message: 'Conducteurs avec solde insuffisant récupérés',
        data: conducteurs,
        meta: {
          nombreConducteurs: conducteurs.length,
          seuil: 5000 // FCFA
        }
      });

    } catch (error) {
      console.error('Erreur récupération conducteurs solde insuffisant:', error);
      return next(AppError.serverError('Erreur serveur lors de la récupération', { originalError: error.message }));
    }
  }

  /**
   * Obtenir les litiges ouverts
   * @param {Object} req - Requête Express
   * @param {Object} res - Réponse Express
   * @param {Function} next - Middleware suivant
   */
  static async obtenirLitigesOuverts(req, res, next) {
    try {
      const litiges = await Paiement.obtenirLitigesOuverts();
      
      res.json({
        success: true,
        message: 'Litiges ouverts récupérés avec succès',
        data: litiges,
        meta: {
          nombreLitiges: litiges.length,
          dateConsultation: new Date()
        }
      });

    } catch (error) {
      console.error('Erreur récupération litiges:', error);
      return next(AppError.serverError('Erreur serveur lors de la récupération des litiges', { originalError: error.message }));
    }
  }

  /**
   * Envoyer des notifications en attente
   * @param {Object} req - Requête Express
   * @param {Object} res - Réponse Express
   * @param {Function} next - Middleware suivant
   */
  static async envoyerNotificationsEnAttente(req, res, next) {
    try {
      const paiementsAvecNotifications = await Paiement.obtenirNotificationsEnAttente();
      
      let nombreNotificationsEnvoyees = 0;
      
      for (const paiement of paiementsAvecNotifications) {
        for (const notification of paiement.notifications.typesNotifications) {
          if (!notification.envoye) {
            // Simuler l'envoi de notification
            try {
              await PaiementController._envoyerNotification(notification, paiement);
              notification.envoye = true;
              notification.dateEnvoi = new Date();
              nombreNotificationsEnvoyees++;
            } catch (error) {
              console.error('Erreur envoi notification:', error);
            }
          }
        }
        await paiement.save();
      }

      res.json({
        success: true,
        message: 'Notifications envoyées avec succès',
        data: {
          nombrePaiements: paiementsAvecNotifications.length,
          nombreNotificationsEnvoyees,
          dateTraitement: new Date()
        }
      });

    } catch (error) {
      console.error('Erreur envoi notifications:', error);
      return next(AppError.serverError('Erreur serveur lors de l\'envoi des notifications', { originalError: error.message }));
    }
  }

  // ===== MÉTHODES PRIVÉES UTILITAIRES ÉTENDUES =====

  /**
   * Obtenir le solde d'un conducteur
   * @private
   */
  static async _obtenirSoldeConducteur(conducteurId) {
    const result = await Paiement.aggregate([
      {
        $match: {
          beneficiaireId: new mongoose.Types.ObjectId(conducteurId),
          'portefeuille.crediteDansPortefeuille': true
        }
      },
      {
        $group: {
          _id: null,
          soldeTotal: { $sum: '$portefeuille.montantCreditePortefeuille' }
        }
      }
    ]);
    
    return result[0]?.soldeTotal || 0;
  }

  /**
   * Envoyer une notification
   * @private
   */
  static async _envoyerNotification(notification, paiement) {
    // Simulation d'envoi de notification
    console.log(`Envoi notification pour paiement ${paiement._id}:`, notification);
    // Simulation d'envoi de notification
    console.log(`Envoi notification ${notification.type} via ${notification.canal} à ${notification.destinataire}`);
    
    switch (notification.canal) {
      case 'SMS':
        // TODO: Intégrer avec service SMS réel
        // await SMSService.envoyer(notification.destinataire, notification.message);
        break;
      case 'EMAIL':
        // TODO: Intégrer avec service email réel
        // await EmailService.envoyer(notification.destinataire, notification.subject, notification.message);
        break;
      case 'PUSH':
        // TODO: Intégrer avec service push réel
        // await PushService.envoyer(notification.destinataire, notification.message);
        break;
      case 'IN_APP':
        // TODO: Créer notification in-app
        break;
    }
    
    return true;
  }

  /**
   * Obtenir le taux de commission selon le type de course (maintenant 10% par défaut)
   * @private
   */
  static _obtenirTauxCommission(typeCourse, distanceKm = 0, dureeMinutes = 0) {
    const baremeBase = {
      'URBAIN': 0.10,          // 10%
      'INTERURBAIN': 0.12,     // 12%
      'LONGUE_DISTANCE': 0.15, // 15%
      'PREMIUM': 0.12,         // 12%
      'ECONOMIQUE': 0.08       // 8%
    };

    let taux = baremeBase[typeCourse] || 0.10;

    // Ajustements selon la distance
    if (distanceKm > 100) {
      taux += 0.01; // +1% pour les longues distances
    }
    
    // Ajustements selon la durée
    if (dureeMinutes > 120) {
      taux += 0.005; // +0.5% pour les longs trajets
    }

    return Math.min(taux, 0.20); // Maximum 20%
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
   * Initier un paiement CinetPay
   * @private
   */
  static async _initierPaiementCinetPay(paiement, numeroTelephone, email, nom) {
    try {
      // Configuration CinetPay (à adapter selon votre configuration)
      const configCinetPay = {
        apiKey: process.env.CINETPAY_API_KEY,
        siteId: process.env.CINETPAY_SITE_ID,
        secretKey: process.env.CINETPAY_SECRET_KEY,
        baseUrl: process.env.CINETPAY_BASE_URL || 'https://api.cinetpay.com'
      };

      const donneesTransaction = {
        amount: paiement.montantTotal,
        currency: 'XOF',
        transaction_id: paiement.referenceTransaction,
        description: `Paiement course - ${paiement.referenceTransaction}`,
        customer_phone_number: numeroTelephone,
        customer_email: email,
        customer_name: nom,
        return_url: `${process.env.BASE_URL}/paiements/${paiement._id}/retour`,
        notify_url: `${process.env.BASE_URL}/api/webhooks/cinetpay`,
        channels: PaiementController._mapperMethodeVersCinetPay(paiement.methodePaiement)
      };

      // TODO: Remplacer par l'appel réel à l'API CinetPay
      const reponseAPI = await PaiementController._simulerAPICinetPay(donneesTransaction);

      if (reponseAPI.success) {
        return {
          success: true,
          data: {
            transactionId: reponseAPI.data.transaction_id,
            paymentToken: reponseAPI.data.payment_token,
            paymentUrl: reponseAPI.data.payment_url,
            siteId: configCinetPay.siteId,
            returnUrl: donneesTransaction.return_url,
            notifyUrl: donneesTransaction.notify_url,
            customerPhone: numeroTelephone,
            customerEmail: email,
            customerName: nom,
            currency: 'XOF',
            expirationDate: new Date(Date.now() + 30 * 60 * 1000) // 30 minutes
          }
        };
      } else {
        return {
          success: false,
          error: reponseAPI.error || 'Erreur initiation CinetPay'
        };
      }

    } catch (error) {
      console.error('Erreur initiation CinetPay:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Mapper la méthode de paiement vers les canaux CinetPay
   * @private
   */
  static _mapperMethodeVersCinetPay(methodePaiement) {
    const mapping = {
      'ORANGE_MONEY': 'ORANGE_MONEY_CI',
      'MTN_MONEY': 'MTN_MONEY_CI',
      'MOOV_MONEY': 'MOOV_MONEY_CI',
      'WAVE': 'WAVE_CI',
      'VISA': 'VISA',
      'MASTERCARD': 'MASTERCARD'
    };
    
    return mapping[methodePaiement] || 'ALL';
  }

  /**
   * Simuler l'API CinetPay (à remplacer par l'intégration réelle)
   * @private
   */
  static async _simulerAPICinetPay(donneesTransaction) {
    // Simulation d'appel API
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Simuler un succès dans 95% des cas
    if (Math.random() > 0.05) {
      return {
        success: true,
        data: {
          transaction_id: donneesTransaction.transaction_id,
          payment_token: `token_${crypto.randomBytes(16).toString('hex')}`,
          payment_url: `https://checkout.cinetpay.com/payment/${donneesTransaction.transaction_id}`,
          status: 'PENDING'
        }
      };
    } else {
      return {
        success: false,
        error: 'Erreur initiation paiement CinetPay'
      };
    }
  }

  /**
   * Vérifier le statut d'une transaction CinetPay
   * @private
   */
  static async _verifierStatutTransactionCinetPay(_transactionId) {
    try {
      // TODO: Remplacer par l'appel réel à l'API CinetPay
      // const response = await axios.post(`${configCinetPay.baseUrl}/v2/payment/check`, {
      //   apikey: configCinetPay.apiKey,
      //   site_id: configCinetPay.siteId,
      //   transaction_id: transactionId
      // });

      // Simulation pour le moment
      await new Promise(resolve => setTimeout(resolve, 500));
      
      return {
        status: Math.random() > 0.3 ? 'COMPLETED' : 'PENDING',
        operator_transaction_id: `OP_${Date.now()}`,
        payment_method: 'ORANGE_MONEY',
        amount: 1000,
        currency: 'XOF'
      };

    } catch (error) {
      console.error('Erreur vérification statut CinetPay:', error);
      return null;
    }
  }

  /**
   * Initier un remboursement CinetPay
   * @private
   */
  static async _initierRemboursementCinetPay(paiement, montant) {
    try {
      // TODO: Implémenter l'appel réel à l'API de remboursement CinetPay
      // const response = await axios.post(`${configCinetPay.baseUrl}/v2/payment/refund`, {
      //   apikey: configCinetPay.apiKey,
      //   site_id: configCinetPay.siteId,
      //   transaction_id: paiement.cinetpay.transactionId,
      //   amount: montant
      // });

      // Simulation pour le moment
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      if (Math.random() > 0.1) {
        return {
          success: true,
          referenceRemboursement: `REFUND_CP_${Date.now()}`,
          montant,
          dateTraitement: new Date()
        };
      } else {
        return {
          success: false,
          error: 'Échec du remboursement CinetPay'
        };
      }

    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Annuler une transaction CinetPay
   * @private
   */
  static async _annulerTransactionCinetPay(paiement) {
    try {
      // TODO: Implémenter l'appel réel à l'API d'annulation CinetPay
      console.log(`Annulation CinetPay pour transaction: ${paiement.cinetpay.transactionId}`);
      
      paiement.cinetpay.status = 'CANCELLED';
      paiement.ajouterLog('CINETPAY_CANCELLED', {
        transactionId: paiement.cinetpay.transactionId
      }, 'SYSTEM');
      
      return true;
    } catch (error) {
      console.error('Erreur annulation CinetPay:', error);
      return false;
    }
  }

  /**
   * Initier un remboursement mobile money legacy
   * @private
   */
  static async _initierRemboursementMobile(paiement, montant) {
    try {
      // Simulation d'API de remboursement legacy
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
          // Créditer automatiquement le portefeuille si configuré
          if (process.env.AUTO_CREDIT_WALLET === 'true') {
            paiement.crediterPortefeuille();
            await paiement.save();
          }
          
          // Programmer notifications automatiques
          paiement.programmerNotification('CONFIRMATION_PAIEMENT', 'PAYEUR', 'SMS');
          paiement.programmerNotification('COMMISSION_PRELEVEE', 'ADMIN', 'EMAIL');
          
          // TODO: Mettre à jour le statut de la réservation
          // await ReservationService.marquerCommePayee(paiement.reservationId);
          
          break;
          
        case 'ECHEC':
          paiement.programmerNotification('ECHEC_PAIEMENT', 'PAYEUR', 'PUSH');
          break;
          
        case 'REMBOURSE':
          paiement.programmerNotification('REMBOURSEMENT', 'PAYEUR', 'SMS');
          break;
          
        case 'EXPIRE':
          paiement.programmerNotification('EXPIRATION_PAIEMENT', 'PAYEUR', 'SMS');
          break;

        case 'LITIGE':
          paiement.programmerNotification('LITIGE', 'ADMIN', 'EMAIL');
          break;
      }
      
    } catch (error) {
      console.error('Erreur actions post-mise à jour:', error);
      // Ne pas faire échouer la transaction principale
    }
  }

  // ===== MÉTHODES EXISTANTES MAINTENUES =====

  /**
   * READ - Obtenir l'historique des paiements avec filtres avancés
   */
  static async obtenirHistoriquePaiements(req, res, next) {
    try {
      // Construction des filtres de recherche
      const filtres = {};
      
      if (req.query.utilisateurId) {
        filtres.$or = [
          { payeurId: req.query.utilisateurId },
          { beneficiaireId: req.query.utilisateurId }
        ];
      }
      
      if (req.query.statutPaiement) {
        filtres.statutPaiement = req.query.statutPaiement;
      }
      
      if (req.query.methodePaiement) {
        filtres.methodePaiement = req.query.methodePaiement;
      }
      
      if (req.query.dateDebut && req.query.dateFin) {
        filtres.dateInitiation = {
          $gte: new Date(req.query.dateDebut),
          $lte: new Date(req.query.dateFin)
        };
      }
      
      if (req.query.montantMin || req.query.montantMax) {
        filtres.montantTotal = {};
        if (req.query.montantMin) filtres.montantTotal.$gte = parseFloat(req.query.montantMin);
        if (req.query.montantMax) filtres.montantTotal.$lte = parseFloat(req.query.montantMax);
      }

      // Filtres supplémentaires
      if (req.query.estRecharge === 'true') {
        filtres['recharge.estRecharge'] = true;
      }

      if (req.query.estRetrait === 'true') {
        filtres['portefeuille.estRetrait'] = true;
      }

      if (req.query.enLitige === 'true') {
        filtres['litige.estEnLitige'] = true;
      }

      // Options de pagination et tri
      const page = parseInt(req.query.page) || 1;
      const limite = Math.min(parseInt(req.query.limite) || 10, 100);
      const tri = req.query.tri ? JSON.parse(req.query.tri) : { dateInitiation: -1 };

      // Exécution de la requête
      const [paiements, total] = await Promise.all([
        Paiement.find(filtres)
          .populate('payeurId', 'nom prenom telephone')
          .populate('beneficiaireId', 'nom prenom telephone')
          .populate('reservationId', 'itineraire dateDepart')
          .sort(tri)
          .skip((page - 1) * limite)
          .limit(limite),
        Paiement.countDocuments(filtres)
      ]);

      const pagination = {
        page,
        limite,
        total,
        pages: Math.ceil(total / limite),
        hasNext: page < Math.ceil(total / limite),
        hasPrev: page > 1
      };

      res.json({
        success: true,
        message: 'Historique récupéré avec succès',
        data: paiements,
        pagination,
        filtres: {
          ...req.query,
          nombreResultats: total
        }
      });

    } catch (error) {
      console.error('Erreur récupération historique:', error);
      return next(AppError.serverError('Erreur serveur lors de la récupération de l\'historique', { originalError: error.message }));
    }
  }

  /**
   * READ - Obtenir les détails d'un paiement spécifique
   */
  static async obtenirDetailsPaiement(req, res, next) {
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

      // Vérifier l'expiration automatiquement
      const aExpire = paiement.verifierExpiration();
      if (aExpire) {
        await paiement.save();
      }

      // Marquer comme vu par l'admin si c'est un admin
      if (req.user?.role === 'ADMIN') {
        paiement.tracking.vueParAdmin = true;
        paiement.tracking.dateVueAdmin = new Date();
        await paiement.save();
      }

      res.json({
        success: true,
        message: 'Détails du paiement récupérés avec succès',
        data: paiement,
        meta: {
          peutEtreRembourse: paiement.peutEtreRembourse(),
          montantRemboursable: paiement.calculerMontantRemboursement(),
          estExpire: paiement.estExpire,
          necessiteOTP: paiement.necessiteOTP,
          soldeInsuffisant: paiement.soldeInsuffisant,
          enLitige: paiement.enLitige,
          statutDetailne: paiement.statutDetailne,
          urlRecu: paiement.urlRecu
        }
      });

    } catch (error) {
      console.error('Erreur récupération détails paiement:', error);
      return next(AppError.serverError('Erreur serveur lors de la récupération du paiement', { originalError: error.message }));
    }
  }

  // Les autres méthodes existantes (traiterRemboursement, annulerTransaction, etc.) 
  // restent identiques à la version précédente mais avec support des nouvelles fonctionnalités
}

module.exports = PaiementController;