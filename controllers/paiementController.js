// controllers/paiementController.js
const CinetPayService = require('../services/CinetPayService');
const Paiement = require('../models/Paiement');
const Utilisateur = require('../models/Utilisateur');
const firebaseService = require('../services/firebaseService');
const Trajet = require('../models/Trajet');
const Reservation = require('../models/Reservation');
const { logger } = require('../utils/logger');
const sendEmail = require('../utils/emailService');
const PDFDocument = require('pdfkit');
const crypto = require('crypto');

class PaiementController {
  constructor() {
    this.cinetPayService = new CinetPayService();
    
    const proto = Object.getPrototypeOf(this);
    Object.getOwnPropertyNames(proto)
      .filter(name => typeof this[name] === 'function' && name !== 'constructor')
      .forEach(name => {
        this[name] = this[name].bind(this);
      });
  }

  // =========================
  // GESTION DES PAIEMENTS TRAJETS
  // =========================

  async initierPaiement(req, res) {
    try {
      const { 
        reservationId, 
        montant, 
        methodePaiement = 'WAVE',
        numeroTelephone,
        operateur 
      } = req.body;
      const userId = req.user._id || req.user.id;

      // Validation des données
      if (!reservationId || !montant) {
        return res.status(400).json({
          success: false,
          error: 'DONNEES_MANQUANTES',
          message: 'Réservation ID et montant requis'
        });
      }

      // Validation du montant
      if (montant < 100 || montant > 1000000) {
        return res.status(400).json({
          success: false,
          error: 'MONTANT_INVALIDE',
          message: 'Montant doit être entre 100 et 1,000,000 FCFA'
        });
      }

      // Vérifier que l'utilisateur est le propriétaire de la réservation
      const reservation = await Reservation.findOne({
        _id: reservationId,
        passagerId: userId
      }).populate({
        path: 'trajetId',
        populate: {
          path: 'conducteurId',
          select: 'nom prenom compteCovoiturage noteGenerale statistiques'
        }
      });

      if (!reservation) {
        return res.status(404).json({
          success: false,
          error: 'RESERVATION_NON_TROUVEE',
          message: 'Réservation non trouvée ou non autorisée'
        });
      }

      // Vérifier que la réservation n'a pas déjà été payée
      const paiementExistant = await Paiement.findOne({
        reservationId,
        statutPaiement: { $in: ['COMPLETE', 'TRAITE'] }
      });

      if (paiementExistant) {
        return res.status(400).json({
          success: false,
          error: 'DEJA_PAYE',
          message: 'Cette réservation a déjà été payée'
        });
      }

      const trajet = reservation.trajetId;
      const conducteur = trajet.conducteurId;

      // 🆕 VALIDATION CRITIQUE : Vérifier si le mode de paiement est autorisé
      if (methodePaiement === 'ESPECES') {
        // Vérifier compte rechargé
        if (!conducteur.compteCovoiturage?.estRecharge) {
          return res.status(403).json({
            success: false,
            error: 'PAIEMENT_ESPECES_NON_AUTORISE',
            message: 'Le conducteur n\'accepte pas les paiements en espèces. Veuillez choisir un paiement numérique.',
            methodesDisponibles: ['WAVE', 'ORANGE_MONEY', 'MTN_MONEY', 'MOOV_MONEY']
          });
        }

        // Vérifier solde minimum
        const soldeConducteur = conducteur.compteCovoiturage?.solde || 0;
        const soldeMinimum = 1000;

        if (soldeConducteur < soldeMinimum) {
          return res.status(403).json({
            success: false,
            error: 'SOLDE_INSUFFISANT_CONDUCTEUR',
            message: `Le conducteur doit avoir un solde minimum de ${soldeMinimum} FCFA pour accepter les paiements en espèces`,
            methodesDisponibles: ['WAVE', 'ORANGE_MONEY', 'MTN_MONEY', 'MOOV_MONEY']
          });
        }
      }

      // Calculer les frais de transaction
      const fraisTransaction = methodePaiement !== 'ESPECES' 
        ? Math.max(Math.round(montant * 0.02), 50) 
        : 0;

      // Créer le paiement
      const paiement = new Paiement({
        reservationId,
        payeurId: userId,
        beneficiaireId: conducteur._id,
        montantTotal: montant,
        montantConducteur: 0, // Sera calculé après commission
        commissionPlateforme: 0, // Sera calculé
        fraisTransaction,
        methodePaiement: methodePaiement.toUpperCase(),
        
        commission: {
          taux: 0.10,
          tauxOriginal: 0.10,
          montant: 0,
          modePrelevement: methodePaiement === 'ESPECES' ? 'compte_recharge' : 'paiement_mobile',
          statutPrelevement: 'en_attente'
        },

        reglesPaiement: {
          conducteurCompteRecharge: conducteur.compteCovoiturage?.estRecharge || false,
          soldeConducteurAvant: conducteur.compteCovoiturage?.solde || 0,
          soldeMinimumRequis: 1000,
          soldeSuffisant: false,
          modesAutorises: [],
          verificationsPassees: false
        },

        securite: {
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
          deviceId: req.get('X-Device-ID')
        }
      });

      // 🆕 Calculer commission dynamique selon distance et note
      const distanceKm = trajet.distanceKm || 0;
      const noteConducteur = conducteur.noteGenerale || 0;
      await paiement.calculerCommissionDynamique(distanceKm, noteConducteur);

      // 🆕 Appliquer bonus si applicable
      const nombreTrajetsMois = conducteur.statistiques?.trajetsEffectuesMois || 0;
      paiement.appliquerPrimePerformance(noteConducteur, nombreTrajetsMois);

      // Valider les règles de paiement
      const validationOk = await paiement.validerReglesPaiement();
      
      if (!validationOk) {
        return res.status(403).json({
          success: false,
          error: 'VALIDATION_ECHEC',
          message: paiement.reglesPaiement.raisonValidation || 'Paiement non autorisé',
          details: {
            blocageActif: paiement.reglesPaiement.blocageActif,
            raisonBlocage: paiement.reglesPaiement.raisonBlocage,
            methodesDisponibles: paiement.reglesPaiement.modesAutorises
          }
        });
      }

      // Initier paiement mobile si nécessaire
      if (methodePaiement !== 'ESPECES') {
        paiement.initierPaiementMobile(
          numeroTelephone, 
          operateur || methodePaiement.replace('_MONEY', '')
        );
      }

      await paiement.save();

      logger.info('Paiement initié', {
        userId,
        reservationId,
        montant,
        methodePaiement,
        commission: paiement.commission.montant,
        bonus: paiement.bonus,
        referenceTransaction: paiement.referenceTransaction
      });

      // Réponse selon le type de paiement
      if (methodePaiement === 'ESPECES') {
        return res.status(201).json({
          success: true,
          message: 'Paiement en espèces enregistré',
          data: {
            paiementId: paiement._id,
            referenceTransaction: paiement.referenceTransaction,
            montantTotal: paiement.montantTotal,
            montantConducteur: paiement.montantConducteur,
            commission: {
              montant: paiement.commission.montant,
              taux: paiement.commission.taux,
              reductionAppliquee: paiement.commission.reductionAppliquee,
              raisonReduction: paiement.commission.raisonReduction
            },
            bonus: paiement.bonus,
            methodePaiement: paiement.methodePaiement,
            statutPaiement: paiement.statutPaiement,
            instructions: 'Payez le conducteur en espèces à la fin du trajet'
          }
        });
      } else {
        // Paiement mobile - utiliser CinetPay
        const result = await this.cinetPayService.initierPaiement(
          reservationId, 
          montant,
          {
            methodePaiement,
            numeroTelephone,
            operateur,
            referenceInterne: paiement.referenceTransaction
          }
        );
        
        // Si CinetPay renvoie une erreur (ex: solde marchand insuffisant)
        if (!result || result.success === false) {
          logger.warn('CinetPay initiation failed', { 
            reservationId, 
            reference: paiement.referenceTransaction, 
            err: result?.message 
          });
          
          // Marquer le paiement comme échoué
          paiement.statutPaiement = 'ECHEC';
          paiement.ajouterErreur('CINETPAY_INITIATION_ECHEC', result?.message || 'Erreur CinetPay');
          await paiement.save();
          
          return res.status(402).json({
            success: false,
            error: 'CINETPAY_ERREUR',
            message: result?.message || 'Erreur lors de l\'initiation du paiement CinetPay. Solde ou configuration peut être insuffisante.'
          });
        }
        
        return res.status(201).json({
          success: true,
          message: 'Paiement mobile initié',
          data: {
            ...result,
            paiementId: paiement._id,
            commission: {
              montant: paiement.commission.montant,
              taux: paiement.commission.taux
            },
            bonus: paiement.bonus
          }
        });
      }

    } catch (error) {
      logger.error('Erreur initiation paiement:', error);
      return res.status(500).json({
        success: false,
        error: 'ERREUR_PAIEMENT',
        message: error.message
      });
    }
  }

  // 🆕 Obtenir les méthodes de paiement disponibles pour un trajet
  async obtenirMethodesPaiementDisponibles(req, res) {
    try {
      const { trajetId } = req.params;

      const trajet = await Trajet.findById(trajetId)
        .populate('conducteurId', 'nom prenom compteCovoiturage noteGenerale');

      if (!trajet) {
        return res.status(404).json({
          success: false,
          message: 'Trajet non trouvé'
        });
      }

      const conducteur = trajet.conducteurId;
      const soldeConducteur = conducteur.compteCovoiturage?.solde || 0;
      const soldeMinimum = 1000;
      const compteRecharge = conducteur.compteCovoiturage?.estRecharge && soldeConducteur >= soldeMinimum;

      // Méthodes numériques toujours disponibles
      const methodesNumeriques = [
        {
          id: 'WAVE',
          nom: 'Wave',
          type: 'mobile_money',
          frais: '0%',
          actif: true,
          commission: '10%',
          description: 'Commission prélevée automatiquement'
        },
        {
          id: 'ORANGE_MONEY',
          nom: 'Orange Money',
          type: 'mobile_money',
          frais: '1.5%',
          actif: true,
          commission: '10%',
          description: 'Commission prélevée automatiquement'
        },
        {
          id: 'MTN_MONEY',
          nom: 'MTN Money',
          type: 'mobile_money',
          frais: '1.5%',
          actif: true,
          commission: '10%',
          description: 'Commission prélevée automatiquement'
        },
        {
          id: 'MOOV_MONEY',
          nom: 'Moov Money',
          type: 'mobile_money',
          frais: '1.5%',
          actif: true,
          commission: '10%',
          description: 'Commission prélevée automatiquement'
        }
      ];

      const methodes = [...methodesNumeriques];

      // Espèces uniquement si compte rechargé
      if (compteRecharge) {
        methodes.unshift({
          id: 'ESPECES',
          nom: 'Espèces',
          type: 'cash',
          frais: '0%',
          actif: true,
          commission: '10%',
          description: 'Payez le conducteur directement - Commission prélevée du solde conducteur',
          note: 'Le conducteur a un compte rechargé'
        });
      }

      return res.status(200).json({
        success: true,
        data: {
          methodesDisponibles: methodes,
          conducteur: {
            nom: `${conducteur.prenom} ${conducteur.nom}`,
            compteRecharge,
            solde: compteRecharge ? soldeConducteur : 0,
            noteGenerale: conducteur.noteGenerale || 0 
          },
          informations: {
            commissionPlateforme: 'Commission de base 10% (peut être réduite selon la note du conducteur)',
            paiementsNumeriques: 'Toujours disponibles - Commission prélevée automatiquement',
            paiementsEspece: compteRecharge 
              ? `Disponible - Le conducteur a un solde de ${soldeConducteur.toLocaleString()} FCFA` 
              : `Non disponible - Le conducteur doit avoir un solde minimum de ${soldeMinimum.toLocaleString()} FCFA`
          },
          soldeMinimumRequis: soldeMinimum
        }
      });

    } catch (error) {
      logger.error('Erreur méthodes paiement disponibles:', error);
      return res.status(500).json({
        success: false,
        error: 'ERREUR_METHODES',
        message: error.message
      });
    }
  }

  // 🆕 Confirmer un paiement en espèces (après le trajet)
  async confirmerPaiementEspeces(req, res) {
    try {
      const { referenceTransaction } = req.params;
      const { codeConfirmation } = req.body;
      const userId = req.user._id;

      const paiement = await Paiement.findOne({
        referenceTransaction,
        methodePaiement: 'ESPECES',
        statutPaiement: 'EN_ATTENTE'
      }).populate('beneficiaireId', 'compteCovoiturage nom prenom email');

      if (!paiement) {
        return res.status(404).json({
          success: false,
          message: 'Paiement en espèces non trouvé ou déjà traité'
        });
      }

      // Vérifier que c'est le conducteur ou le passager qui confirme
      const estConducteur = paiement.beneficiaireId._id.toString() === userId.toString();
      const estPassager = paiement.payeurId.toString() === userId.toString();

      if (!estConducteur && !estPassager) {
        return res.status(403).json({
          success: false,
          message: 'Non autorisé à confirmer ce paiement'
        });
      }

      // Vérifier à nouveau le solde du conducteur
      const conducteur = paiement.beneficiaireId;
      const soldeConducteur = conducteur.compteCovoiturage?.solde || 0;

      if (soldeConducteur < paiement.commission.montant) {
        return res.status(400).json({
          success: false,
          error: 'SOLDE_INSUFFISANT',
          message: `Le solde du conducteur est insuffisant pour prélever la commission (${soldeConducteur} FCFA < ${paiement.commission.montant} FCFA)`
        });
      }

      // Confirmer le paiement
      paiement.statutPaiement = 'COMPLETE';
      paiement.dateCompletion = new Date();
      paiement.reglesPaiement.soldeConducteurAvant = soldeConducteur;

      paiement.ajouterLog('PAIEMENT_ESPECES_CONFIRME', {
        confirmePar: estConducteur ? 'conducteur' : 'passager',
        userId,
        codeConfirmation,
        dateConfirmation: new Date()
      });

      // Traiter la commission
      await paiement.traiterCommissionApresPayement();

      await paiement.save();

      // Envoyer notification
      await this.envoyerEmailConfirmationPaiement(conducteur, paiement);

      // Notification Firebase au conducteur
      try {
        if (conducteur.notificationsActivees('paiements')) {
          await firebaseService.notifyPaymentSuccess(
            conducteur._id,
            {
              montant: paiement.montantTotal,
              transactionId: paiement.referenceTransaction,
              methode: 'especes'
            },
            Utilisateur
          );
          
          logger.info('📱 Notification Firebase envoyée au conducteur', {
            conducteurId: conducteur._id,
            montant: paiement.montantTotal
          });
        }
      } catch (notifError) {
        logger.error('❌ Erreur notification Firebase conducteur:', notifError);
      }
      
      // Notification Firebase au passager
      try {
        const passager = await Utilisateur.findById(paiement.payeurId);
        if (passager && passager.notificationsActivees('paiements')) {
          await firebaseService.notifyPaymentSuccess(
            passager._id,
            {
              montant: paiement.montantTotal,
              transactionId: paiement.referenceTransaction,
              methode: 'especes'
            },
            Utilisateur
          );
          
          logger.info('📱 Notification Firebase envoyée au passager', {
            passagerId: passager._id,
            montant: paiement.montantTotal
          });
        }
      } catch (notifError) {
        logger.error('❌ Erreur notification Firebase passager:', notifError);
      }

      logger.info('Paiement espèces confirmé', {
        paiementId: paiement._id,
        referenceTransaction,
        confirmePar: estConducteur ? 'conducteur' : 'passager'
      });

      res.json({
        success: true,
        message: 'Paiement en espèces confirmé avec succès',
        data: {
          paiementId: paiement._id,
          referenceTransaction: paiement.referenceTransaction,
          montantTotal: paiement.montantTotal,
          montantConducteur: paiement.montantConducteur,
          commission: {
            montant: paiement.commission.montant,
            statutPrelevement: paiement.commission.statutPrelevement
          },
          nouveauSoldeConducteur: paiement.reglesPaiement.soldeConducteurApres,
          statutPaiement: paiement.statutPaiement,
          dateCompletion: paiement.dateCompletion
        }
      });

    } catch (error) {
      logger.error('Erreur confirmation paiement espèces:', error);
      return res.status(500).json({
        success: false,
        error: 'ERREUR_CONFIRMATION',
        message: error.message
      });
    }
  }

  // =========================
  // GESTION DES RECHARGES
  // =========================
  /**
 * ✅ MÉTHODE 1/2 : INITIER RECHARGE (SIMPLIFIÉE - 100% CINETPAY)
 * 
 * Remplacez la méthode initierRecharge existante par celle-ci
 */
async initierRecharge(req, res) {
  try {
    const { montant, methodePaiement } = req.body;
    const userId = req.user.userId;

    // Vérifier utilisateur
    const user = await Utilisateur.findById(userId)
      .select('role compteCovoiturage nom prenom email telephone');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    // Vérifier rôle conducteur
    if (!['conducteur'].includes(user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Seuls les conducteurs peuvent recharger leur compte',
        code: 'ROLE_INSUFFICIENT'
      });
    }

    // Validation montant
    if (montant < 1000 || montant > 1000000) {
      return res.status(400).json({
        success: false,
        message: 'Montant invalide (1000 à 1 000 000 FCFA)',
        limites: {
          minimum: 1000,
          maximum: 1000000
        }
      });
    }

    // Validation méthode de paiement
    const methodesValides = ['WAVE', 'ORANGE_MONEY', 'MTN_MONEY', 'MOOV_MONEY'];
    if (!methodesValides.includes(methodePaiement)) {
      return res.status(400).json({
        success: false,
        message: 'Méthode de paiement non supportée',
        methodesAcceptees: methodesValides
      });
    }

    // Vérifier limites quotidiennes
    const limiteQuotidienne = await this.verifierLimitesRecharge(userId, montant);
    if (!limiteQuotidienne.autorise) {
      return res.status(429).json({
        success: false,
        message: limiteQuotidienne.message,
        limites: limiteQuotidienne.details
      });
    }

    // Calculer frais de transaction (2% minimum 50 FCFA)
    const fraisTransaction = Math.max(Math.round(montant * 0.02), 50);
    const montantNet = montant - fraisTransaction;

    // Créer l'enregistrement de paiement
    const paiement = new Paiement({
      payeurId: userId,
      beneficiaireId: userId,
      montantTotal: montant,
      montantConducteur: montantNet,
      commissionPlateforme: 0,
      fraisTransaction,
      
      commission: {
        taux: 0,
        tauxOriginal: 0,
        montant: 0,
        modePrelevement: 'paiement_mobile',
        statutPrelevement: 'preleve'
      },

      methodePaiement: methodePaiement,
      
      reglesPaiement: {
        conducteurCompteRecharge: user.compteCovoiturage?.estRecharge || false,
        modesAutorises: ['WAVE', 'ORANGE_MONEY', 'MTN_MONEY', 'MOOV_MONEY'],
        raisonValidation: 'Recharge de compte via CinetPay',
        verificationsPassees: true,
        soldeSuffisant: true
      },

      securite: {
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        deviceId: req.get('X-Device-ID')
      }
    });

    // Appliquer bonus de recharge si éligible (≥10 000 FCFA)
    paiement.appliquerBonusRecharge(montant);

    await paiement.save();

    // Ajouter à l'historique utilisateur (statut EN_ATTENTE)
    if (!user.compteCovoiturage.historiqueRecharges) {
      user.compteCovoiturage.historiqueRecharges = [];
    }
    
    user.compteCovoiturage.historiqueRecharges.push({
      montant,
      methodePaiement,
      referenceTransaction: paiement.referenceTransaction,
      fraisTransaction,
      statut: 'en_attente',
      dateRecharge: new Date()
    });
    
    await user.save();

    paiement.ajouterLog('RECHARGE_INITIEE_CINETPAY', {
      userId,
      montant,
      montantNet,
      fraisTransaction,
      bonusRecharge: paiement.bonus.bonusRecharge,
      methodePaiement,
      note: 'Recharge 100% CinetPay - Pas de formulaire manuel'
    });

    logger.info('🚀 Recharge CinetPay initiée', {
      userId,
      paiementId: paiement._id,
      montant,
      bonusRecharge: paiement.bonus.bonusRecharge,
      methodePaiement,
      referenceTransaction: paiement.referenceTransaction
    });

    // ✅ APPEL CINETPAY POUR GÉNÉRER URL DE PAIEMENT
    try {
      const resultCinetPay = await this.cinetPayService.initierPaiement(
        null, // Pas de reservationId pour recharge
        montant,
        {
          methodePaiement,
          referenceInterne: paiement.referenceTransaction,
          isRecharge: true,
          userId,
          userEmail: user.email,
          userNom: `${user.prenom} ${user.nom}`,
          userTelephone: user.telephone,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent'),
          deviceId: req.get('X-Device-ID')
        }
      );

      // Vérifier si CinetPay a réussi
      if (!resultCinetPay || resultCinetPay.success === false) {
        logger.error('❌ CinetPay initiation recharge échouée', {
          userId,
          reference: paiement.referenceTransaction,
          error: resultCinetPay?.message
        });

        // Marquer comme échoué
        paiement.statutPaiement = 'ECHEC';
        paiement.ajouterErreur('CINETPAY_INIT_FAILED', 
          resultCinetPay?.message || 'Erreur initialisation CinetPay');
        await paiement.save();

        return res.status(502).json({
          success: false,
          error: 'CINETPAY_ERREUR',
          message: resultCinetPay?.message || 'Erreur lors de l\'initialisation du paiement CinetPay',
          details: 'Impossible de générer le lien de paiement. Veuillez réessayer.'
        });
      }

      // ✅ SUCCÈS - Retourner l'URL de paiement CinetPay
      logger.info('✅ URL paiement CinetPay générée', {
        userId,
        paiementId: paiement._id,
        reference: paiement.referenceTransaction,
        urlPaiement: resultCinetPay.urlPaiement
      });

      res.status(201).json({
        success: true,
        message: 'Recharge initiée avec succès - Redirection vers CinetPay',
        data: {
          paiementId: paiement._id,
          referenceTransaction: paiement.referenceTransaction,
          montant,
          montantNet,
          fraisTransaction,
          bonusRecharge: paiement.bonus.bonusRecharge || 0,
          montantTotalACrediter: montantNet + (paiement.bonus.bonusRecharge || 0),
          methodePaiement,
          statutPaiement: paiement.statutPaiement,
          dateInitiation: paiement.dateInitiation,
          
          // 🎯 URL DE PAIEMENT CINETPAY (à ouvrir dans le navigateur)
          paymentUrl: resultCinetPay.urlPaiement,
          paymentToken: resultCinetPay.token,
          
          instructions: [
            '1️⃣ Cliquez sur le lien de paiement ci-dessous',
            '2️⃣ Complétez votre paiement sur la page CinetPay',
            '3️⃣ Votre solde sera crédité automatiquement après confirmation',
            `💰 Vous recevrez ${(montantNet + (paiement.bonus.bonusRecharge || 0)).toLocaleString()} FCFA`,
            paiement.bonus.bonusRecharge > 0 ? `🎁 Bonus de ${paiement.bonus.bonusRecharge.toLocaleString()} FCFA inclus !` : ''
          ].filter(Boolean),
          
          important: {
            delaiConfirmation: '15 minutes maximum',
            support: 'En cas de problème, contactez le support avec votre référence',
            annulationPossible: 'Vous pouvez annuler dans les 30 minutes si non payé'
          }
        }
      });

    } catch (cinetpayError) {
      logger.error('❌ Exception CinetPay recharge:', cinetpayError);
      
      // Marquer comme échoué
      paiement.statutPaiement = 'ECHEC';
      paiement.ajouterErreur('CINETPAY_EXCEPTION', cinetpayError.message);
      await paiement.save();

      return res.status(500).json({
        success: false,
        error: 'ERREUR_CINETPAY',
        message: 'Une erreur s\'est produite lors de la communication avec CinetPay',
        details: cinetpayError.message
      });
    }

  } catch (error) {
    logger.error('❌ Erreur initiation recharge:', error);
    return res.status(500).json({
      success: false,
      error: 'ERREUR_RECHARGE',
      message: error.message
    });
  }
}

/**
 * ✅ MÉTHODE 2/2 : CONFIRMER RECHARGE (WEBHOOK AUTO + MANUEL ADMIN)
 * 
 * la méthode confirmerRecharge existante par celle-ci
 */
async confirmerRecharge(req, res) {
  try {
    const {
      referenceTransaction,
      statutPaiement = 'COMPLETE',
      // Champs webhook CinetPay
      cpm_trans_id,
      cpm_trans_status,
      cpm_amount,
      cpm_custom
    } = req.body;

    // Détecter si c'est un webhook CinetPay
    const estWebhook = req.headers['x-webhook-signature'] || 
                       req.body.webhook === true ||
                       cpm_trans_id; // Si contient ID transaction CinetPay

    if (!referenceTransaction) {
      return res.status(400).json({
        success: false,
        message: 'Référence de transaction requise'
      });
    }

    // Trouver le paiement de recharge
    const paiement = await Paiement.findOne({
      referenceTransaction,
      methodePaiement: { $in: ['WAVE', 'ORANGE_MONEY', 'MTN_MONEY', 'MOOV_MONEY'] }
    }).populate('payeurId', 'compteCovoiturage nom prenom email');

    if (!paiement) {
      return res.status(404).json({
        success: false,
        message: 'Transaction de recharge non trouvée'
      });
    }

    if (paiement.statutPaiement !== 'EN_ATTENTE') {
      return res.status(400).json({
        success: false,
        message: 'Cette recharge a déjà été traitée',
        statutActuel: paiement.statutPaiement
      });
    }

    // 🔒 SÉCURITÉ : Si confirmation manuelle (admin), vérifier avec CinetPay
    if (!estWebhook) {
      const userId = req.user?.userId;
      const userRole = req.user?.role;
      
      if (userRole !== 'admin') {
        logger.warn('⚠️ Tentative confirmation manuelle non autorisée', {
          userId,
          userRole,
          referenceTransaction
        });
        
        return res.status(403).json({
          success: false,
          error: 'AUTORISATION_REQUISE',
          message: 'Seuls les administrateurs peuvent confirmer manuellement',
          note: 'Les confirmations automatiques se font via webhook CinetPay'
        });
      }

      // Vérifier le statut réel auprès de CinetPay
      logger.info('🔍 Vérification CinetPay avant confirmation manuelle', {
        referenceTransaction,
        adminId: userId
      });

      try {
        const verificationCinetPay = await this.cinetPayService.verifierStatutTransaction(
          referenceTransaction
        );

        if (verificationCinetPay.statutPaiement !== statutPaiement) {
          logger.warn('⚠️ Discordance statut CinetPay vs demande admin', {
            referenceTransaction,
            statutDemande: statutPaiement,
            statutCinetPay: verificationCinetPay.statutPaiement,
            adminId: userId
          });

          return res.status(400).json({
            success: false,
            error: 'STATUT_DISCORDANT',
            message: 'Le statut demandé ne correspond pas au statut CinetPay',
            statutCinetPay: verificationCinetPay.statutPaiement,
            statutDemande: statutPaiement,
            recommandation: 'Vérifiez le statut réel sur le dashboard CinetPay'
          });
        }

        logger.info('✅ Vérification CinetPay réussie', {
          referenceTransaction,
          statutConfirme: verificationCinetPay.statutPaiement
        });

      } catch (cinetpayError) {
        logger.error('❌ Erreur vérification CinetPay:', cinetpayError);
        
        return res.status(503).json({
          success: false,
          error: 'CINETPAY_INDISPONIBLE',
          message: 'Impossible de vérifier le statut auprès de CinetPay',
          details: cinetpayError.message,
          recommandation: 'Réessayez dans quelques instants'
        });
      }

      paiement.ajouterLog('CONFIRMATION_MANUELLE_ADMIN', {
        adminId: userId,
        dateConfirmation: new Date(),
        verificationCinetPay: 'effectuee'
      });
    } else {
      logger.info('📨 Webhook CinetPay reçu pour recharge', {
        referenceTransaction,
        cpm_trans_id,
        cpm_trans_status,
        cpm_amount,      
        cpm_custom 
      });
    }

    // ✅ TRAITER SELON LE STATUT
    if (statutPaiement === 'COMPLETE' || cpm_trans_status === 'COMPLETED') {
      // RECHARGE RÉUSSIE
      paiement.statutPaiement = 'COMPLETE';
      paiement.dateCompletion = new Date();
      
      // Enregistrer données CinetPay si webhook
      if (cpm_trans_id) {
        paiement.mobileMoney.transactionId = cpm_trans_id;
        paiement.mobileMoney.statutMobileMoney = 'SUCCESS';
        paiement.referencePaiementMobile = cpm_trans_id;
        paiement.mobileMoney.dateTransaction = new Date();
      }

      // Créditer le compte utilisateur
      const user = paiement.payeurId;
      const montantACrediter = paiement.montantConducteur + 
                               (paiement.bonus.bonusRecharge || 0);
      
      await user.confirmerRecharge(referenceTransaction, 'reussi', montantACrediter);

      // Envoyer email de confirmation
      await this.envoyerEmailConfirmationRecharge(user, paiement);
      
      // Notification Firebase
      try {
        if (user.notificationsActivees('paiements')) {
          await firebaseService.notifyPaymentSuccess(
            user._id,
            {
              montant: montantACrediter,
              transactionId: referenceTransaction,
              methode: paiement.methodePaiement.toLowerCase()
            },
            Utilisateur
          );
          
          logger.info('📱 Notification Firebase recharge réussie envoyée', {
            userId: user._id,
            montant: montantACrediter,
            nouveauSolde: user.compteCovoiturage.solde
          });
        }
      } catch (notifError) {
        logger.error('❌ Erreur notification Firebase recharge:', notifError);
      }

      paiement.ajouterLog('RECHARGE_CONFIRMEE_CINETPAY', {
        montantCredite: montantACrediter,
        montantBase: paiement.montantConducteur,
        bonusRecharge: paiement.bonus.bonusRecharge,
        nouveauSolde: user.compteCovoiturage.solde,
        modeConfirmation: estWebhook ? 'webhook_auto' : 'manuel_admin',
        cpm_trans_id: cpm_trans_id || null
      });

      logger.info('✅ Recharge confirmée avec succès', {
        paiementId: paiement._id,
        userId: user._id,
        montant: paiement.montantTotal,
        montantCredite: montantACrediter,
        nouveauSolde: user.compteCovoiturage.solde,
        modeConfirmation: estWebhook ? 'webhook' : 'manuel_admin'
      });

      await paiement.save();

      res.json({
        success: true,
        message: 'Recharge confirmée avec succès',
        data: {
          paiementId: paiement._id,
          referenceTransaction: paiement.referenceTransaction,
          montantCredite: montantACrediter,
          montantBase: paiement.montantConducteur,
          bonusRecharge: paiement.bonus.bonusRecharge || 0,
          nouveauSolde: user.compteCovoiturage.solde,
          statutPaiement: paiement.statutPaiement,
          dateCompletion: paiement.dateCompletion,
          modeConfirmation: estWebhook ? 'automatique' : 'manuel',
          transactionCinetPay: cpm_trans_id || null
        }
      });

    } else if (statutPaiement === 'ECHEC' || cpm_trans_status === 'FAILED') {
      // RECHARGE ÉCHOUÉE
      paiement.statutPaiement = 'ECHEC';
      
      if (cpm_trans_id) {
        paiement.mobileMoney.transactionId = cpm_trans_id;
        paiement.mobileMoney.statutMobileMoney = 'FAILED';
      }

      // Marquer comme échoué dans l'historique utilisateur
      const user = paiement.payeurId;
      await user.confirmerRecharge(referenceTransaction, 'echec');

      paiement.ajouterErreur('RECHARGE_ECHEC_CINETPAY', 
        'Échec du paiement confirmé par CinetPay');

      // Notification Firebase - Échec
      try {
        if (user.notificationsActivees('paiements')) {
          await firebaseService.notifyPaymentFailed(
            user._id,
            {
              montant: paiement.montantTotal,
              transactionId: referenceTransaction,
              reason: 'Paiement échoué sur CinetPay'
            },
            Utilisateur
          );
          
          logger.info('📱 Notification Firebase recharge échouée envoyée', {
            userId: user._id
          });
        }
      } catch (notifError) {
        logger.error('❌ Erreur notification Firebase échec:', notifError);
      }

      await paiement.save();

      logger.warn('⚠️ Recharge échouée', {
        paiementId: paiement._id,
        userId: user._id,
        referenceTransaction,
        cpm_trans_id: cpm_trans_id || null
      });

      res.json({
        success: true,
        message: 'Statut de recharge mis à jour (échec)',
        data: {
          paiementId: paiement._id,
          referenceTransaction: paiement.referenceTransaction,
          statutPaiement: paiement.statutPaiement,
          raisonEchec: 'Paiement échoué sur CinetPay',
          transactionCinetPay: cpm_trans_id || null
        }
      });
    }

  } catch (error) {
    logger.error('❌ Erreur confirmation recharge:', error);
    return res.status(500).json({
      success: false,
      error: 'ERREUR_CONFIRMATION',
      message: error.message
    });
  }
}

  async obtenirHistoriqueRecharges(req, res) {
    try {
      const userId = req.user.userId;
      const { 
        page = 1, 
        limit = 10, 
        statut,
        dateDebut,
        dateFin 
      } = req.query;

      const user = await Utilisateur.findById(userId).select('compteCovoiturage nom prenom');
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'Utilisateur non trouvé'
        });
      }

      // Construire les filtres
      const filtres = {
        payeurId: userId,
        beneficiaireId: userId,
        methodePaiement: { $in: ['WAVE', 'ORANGE_MONEY', 'MTN_MONEY', 'MOOV_MONEY'] }
      };

      if (statut) {
        filtres.statutPaiement = statut.toUpperCase();
      }

      if (dateDebut || dateFin) {
        filtres.dateInitiation = {};
        if (dateDebut) filtres.dateInitiation.$gte = new Date(dateDebut);
        if (dateFin) filtres.dateInitiation.$lte = new Date(dateFin);
      }

      // Obtenir les recharges avec pagination
      const recharges = await Paiement.find(filtres)
        .select('referenceTransaction montantTotal montantConducteur fraisTransaction methodePaiement statutPaiement dateInitiation dateCompletion mobileMoney bonus')
        .sort({ dateInitiation: -1 })
        .skip((page - 1) * limit)
        .limit(parseInt(limit));

      const total = await Paiement.countDocuments(filtres);

      // Statistiques des recharges
      const stats = await Paiement.aggregate([
        { $match: filtres },
        {
          $group: {
            _id: null,
            montantTotalRecharge: { $sum: '$montantTotal' },
            montantNetCredite: { $sum: '$montantConducteur' },
            fraisTotaux: { $sum: '$fraisTransaction' },
            bonusTotaux: { $sum: '$bonus.bonusRecharge' },
            nombreRecharges: { $sum: 1 },
            rechargesReussies: {
              $sum: { $cond: [{ $eq: ['$statutPaiement', 'COMPLETE'] }, 1, 0] }
            }
          }
        }
      ]);

      const [statistiques] = stats.length > 0 ? stats : [{}];

      res.json({
        success: true,
        data: {
          recharges: recharges.map(r => ({
            id: r._id,
            referenceTransaction: r.referenceTransaction,
            montantTotal: r.montantTotal,
            montantCredite: r.montantConducteur,
            bonusRecharge: r.bonus?.bonusRecharge || 0,
            montantTotalCredite: r.montantConducteur + (r.bonus?.bonusRecharge || 0),
            fraisTransaction: r.fraisTransaction,
            methodePaiement: r.methodePaiement,
            operateur: r.mobileMoney?.operateur,
            statutPaiement: r.statutPaiement,
            dateInitiation: r.dateInitiation,
            dateCompletion: r.dateCompletion,
            transactionMobileMoney: r.mobileMoney?.transactionId
          })),
          pagination: {
            page: parseInt(page),
            limit: parseInt(limit),
            total,
            pages: Math.ceil(total / limit)
          },
          statistiques: {
            soldeActuel: user.compteCovoiturage?.solde || 0,
            montantTotalRecharge: statistiques.montantTotalRecharge || 0,
            montantNetCredite: statistiques.montantNetCredite || 0,
            bonusTotaux: statistiques.bonusTotaux || 0,
            fraisTotaux: statistiques.fraisTotaux || 0,
            nombreRecharges: statistiques.nombreRecharges || 0,
            tauxReussite: statistiques.nombreRecharges > 0 ? 
              Math.round((statistiques.rechargesReussies / statistiques.nombreRecharges) * 100) : 0
          }
        }
      });

    } catch (error) {
      logger.error('Erreur historique recharges:', error);
      return res.status(500).json({
        success: false,
        error: 'ERREUR_HISTORIQUE',
        message: error.message
      });
    }
  }

  async obtenirStatutRecharge(req, res) {
    try {
      const { referenceTransaction } = req.params;
      const userId = req.user.userId;

      const paiement = await Paiement.findOne({
        referenceTransaction,
        payeurId: userId
      }).select('referenceTransaction montantTotal montantConducteur fraisTransaction methodePaiement statutPaiement dateInitiation dateCompletion mobileMoney logsTransaction erreurs bonus');

      if (!paiement) {
        return res.status(404).json({
          success: false,
          message: 'Recharge non trouvée'
        });
      }

      // Déterminer les étapes du processus
      const etapes = [
        {
          nom: 'Initiation',
          statut: 'COMPLETE',
          date: paiement.dateInitiation,
          description: 'Demande de recharge enregistrée'
        },
        {
          nom: 'Paiement Mobile Money',
          statut: paiement.mobileMoney?.statutMobileMoney === 'SUCCESS' ? 'COMPLETE' : 
                  paiement.mobileMoney?.statutMobileMoney === 'FAILED' ? 'ECHEC' : 'EN_COURS',
          date: paiement.mobileMoney?.dateTransaction,
          description: `Paiement via ${paiement.mobileMoney?.operateur || paiement.methodePaiement}`
        },
        {
          nom: 'Crédit du compte',
          statut: paiement.statutPaiement === 'COMPLETE' ? 'COMPLETE' : 
                  paiement.statutPaiement === 'ECHEC' ? 'ECHEC' : 'EN_ATTENTE',
          date: paiement.dateCompletion,
          description: 'Crédit du solde conducteur'
        }
      ];

      const montantTotalACrediter = paiement.montantConducteur + (paiement.bonus?.bonusRecharge || 0);

      res.json({
        success: true,
        data: {
          referenceTransaction: paiement.referenceTransaction,
          montantTotal: paiement.montantTotal,
          montantACrediter: paiement.montantConducteur,
          bonusRecharge: paiement.bonus?.bonusRecharge || 0,
          montantTotalACrediter,
          fraisTransaction: paiement.fraisTransaction,
          methodePaiement: paiement.methodePaiement,
          statutGlobal: paiement.statutPaiement,
          dateInitiation: paiement.dateInitiation,
          dateCompletion: paiement.dateCompletion,
          etapesProcessus: etapes,
          mobileMoney: {
            operateur: paiement.mobileMoney?.operateur,
            numeroTelephone: paiement.mobileMoney?.numeroTelephone?.replace(/(.{3})(.*)(.{2})/, '$1***$3'),
            transactionId: paiement.mobileMoney?.transactionId,
            statut: paiement.mobileMoney?.statutMobileMoney
          },
          logsRecents: paiement.logsTransaction.slice(-3),
          erreurs: paiement.erreurs.slice(-2)
        }
      });

    } catch (error) {
      logger.error('Erreur statut recharge:', error);
      return res.status(500).json({
        success: false,
        error: 'ERREUR_STATUT',
        message: error.message
      });
    }
  }

  async configurerRechargeAutomatique(req, res) {
    try {
      const userId = req.user.userId;
      const {
        active,
        seuilAutoRecharge,
        montantAutoRecharge,
        methodePaiementAuto,
        numeroTelephoneAuto
      } = req.body;

      const user = await Utilisateur.findById(userId).select('compteCovoiturage nom prenom');
      
      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'Utilisateur non trouvé'
        });
      }

      if (active) {
        // Validation des paramètres pour activation
        if (!seuilAutoRecharge || !montantAutoRecharge || !methodePaiementAuto) {
          return res.status(400).json({
            success: false,
            message: 'Paramètres requis pour activer la recharge automatique',
            parametresRequis: ['seuilAutoRecharge', 'montantAutoRecharge', 'methodePaiementAuto']
          });
        }

        // Validation numéro selon méthode
        const validationNumero = this.validerNumeroOperateur(numeroTelephoneAuto, methodePaiementAuto);
        if (!validationNumero.valide) {
          return res.status(400).json({
            success: false,
            message: validationNumero.message
          });
        }

        // Configurer la recharge automatique
        await user.configurerAutoRecharge(seuilAutoRecharge, montantAutoRecharge, methodePaiementAuto);
        
        // Mettre à jour le numéro si fourni
        if (numeroTelephoneAuto) {
          user.compteCovoiturage.modeAutoRecharge.numeroTelephoneAuto = numeroTelephoneAuto;
          await user.save();
        }

        logger.info('Recharge automatique configurée', {
          userId,
          seuilAutoRecharge,
          montantAutoRecharge,
          methodePaiementAuto
        });

        res.json({
          success: true,
          message: 'Recharge automatique activée',
          data: {
            configuration: {
              active: true,
              seuilAutoRecharge,
              montantAutoRecharge,
              methodePaiementAuto,
              numeroTelephone: numeroTelephoneAuto?.replace(/(.{3})(.*)(.{2})/, '$1***$3')
            }
          }
        });

      } else {
        // Désactiver la recharge automatique
        await user.desactiverAutoRecharge();

        logger.info('Recharge automatique désactivée', { userId });

        res.json({
          success: true,
          message: 'Recharge automatique désactivée',
          data: {
            configuration: {
              active: false
            }
          }
        });
      }

    } catch (error) {
      logger.error('Erreur configuration recharge auto:', error);
      return res.status(500).json({
        success: false,
        error: 'ERREUR_CONFIGURATION',
        message: error.message
      });
    }
  }

  async annulerRecharge(req, res) {
    try {
      const { referenceTransaction } = req.params;
      const { raison } = req.body;
      const userId = req.user.userId;

      const paiement = await Paiement.findOne({
        referenceTransaction,
        payeurId: userId,
        statutPaiement: 'EN_ATTENTE'
      });

      if (!paiement) {
        return res.status(404).json({
          success: false,
          message: 'Recharge non trouvée ou déjà traitée'
        });
      }

      // Vérifier si l'annulation est possible (moins de 30 minutes)
      const maintenant = new Date();
      const delaiAnnulation = 30 * 60 * 1000;
      
      if (maintenant - paiement.dateInitiation > delaiAnnulation) {
        return res.status(400).json({
          success: false,
          message: 'Délai d\'annulation dépassé (30 minutes)',
          delaiMaximum: '30 minutes'
        });
      }

      // Annuler la recharge
      paiement.statutPaiement = 'ANNULE';
      paiement.ajouterLog('RECHARGE_ANNULEE_UTILISATEUR', {
        raison: raison || 'Annulation par l\'utilisateur',
        dateAnnulation: maintenant
      });

      await paiement.save();

      logger.info('Recharge annulée par utilisateur', {
        paiementId: paiement._id,
        userId,
        referenceTransaction,
        raison
      });

      res.json({
        success: true,
        message: 'Recharge annulée avec succès',
        data: {
          referenceTransaction,
          statutPaiement: paiement.statutPaiement,
          dateAnnulation: maintenant
        }
      });

    } catch (error) {
      logger.error('Erreur annulation recharge:', error);
      return res.status(500).json({
        success: false,
        error: 'ERREUR_ANNULATION',
        message: error.message
      });
    }
  }

  // =========================
  // FONCTIONS COMMUNES PAIEMENTS
  // =========================

  async verifierStatut(req, res) {
    try {
      const { referenceTransaction } = req.params;

      const result = await this.cinetPayService.verifierStatutTransaction(referenceTransaction);

      return res.status(200).json({
        success: true,
        ...result
      });

    } catch (error) {
      logger.error('Erreur vérification statut:', error);
      return res.status(500).json({
        success: false,
        error: 'ERREUR_VERIFICATION',
        message: error.message
      });
    }
  }

  async webhookCinetPay(req, res) {
    try {
      const webhookData = req.body;
      
      logger.info('Webhook CinetPay reçu', webhookData);

      const result = await this.cinetPayService.traiterWebhook(webhookData);

      // Envoyer notification Firebase selon le résultat
      if (result.success && result.paiement) {
        const paiement = result.paiement;
        
        try {
          // Notification selon le statut du paiement
          if (paiement.statutPaiement === 'COMPLETE') {
            // Paiement réussi
            const utilisateur = await Utilisateur.findById(paiement.payeurId);
            
            if (utilisateur && utilisateur.notificationsActivees('paiements')) {
              await firebaseService.notifyPaymentSuccess(
                utilisateur._id,
                {
                  montant: paiement.montantTotal,
                  transactionId: paiement.referenceTransaction,
                  methode: paiement.methodePaiement.toLowerCase()
                },
                Utilisateur
              );
              
              logger.info('📱 Notification Firebase webhook (succès) envoyée', {
                userId: utilisateur._id,
                paiementId: paiement._id
              });
            }
            
          } else if (paiement.statutPaiement === 'ECHEC') {
            // Paiement échoué
            const utilisateur = await Utilisateur.findById(paiement.payeurId);
            
            if (utilisateur && utilisateur.notificationsActivees('paiements')) {
              await firebaseService.notifyPaymentFailed(
                utilisateur._id,
                {
                  montant: paiement.montantTotal,
                  transactionId: paiement.referenceTransaction,
                  reason: 'Échec du paiement'
                },
                Utilisateur
              );
              
              logger.info('📱 Notification Firebase webhook (échec) envoyée', {
                userId: utilisateur._id,
                paiementId: paiement._id
              });
            }
          }
        } catch (notifError) {
          // Ne pas bloquer le webhook si notification échoue
          logger.error('❌ Erreur notification Firebase dans webhook:', notifError);
        }
      }

      return res.status(200).json(result);

    } catch (error) {
      logger.error('Erreur webhook CinetPay:', error);
      return res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  async pageRetour(req, res) {
    try {
      const { referenceTransaction } = req.params;

      const result = await this.cinetPayService.verifierStatutTransaction(referenceTransaction);
      
      const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      
      switch (result.statutPaiement) {
        case 'COMPLETE':
          return res.redirect(`${baseUrl}/paiement/succes?ref=${referenceTransaction}`);
        case 'ECHEC':
          return res.redirect(`${baseUrl}/paiement/echec?ref=${referenceTransaction}`);
        default:
          return res.redirect(`${baseUrl}/paiement/attente?ref=${referenceTransaction}`);
      }

    } catch (error) {
      logger.error('Erreur page retour:', error);
      const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      return res.redirect(`${baseUrl}/paiement/erreur`);
    }
  }

  async historiquePaiements(req, res) {
    try {
      const userId = req.user._id;
      const {
        page = 1,
        limit = 20,
        statut = null,
        dateDebut = null,
        dateFin = null,
        type = 'tous'
      } = req.query;

      const skip = (page - 1) * limit;
      
      // Filtres de base
      let filtres = {
        $or: [{ payeurId: userId }, { beneficiaireId: userId }]
      };
      
      // Filtrer par type
      if (type === 'trajets') {
        filtres.reservationId = { $exists: true, $ne: null };
      } else if (type === 'recharges') {
        filtres.payeurId = userId;
        filtres.beneficiaireId = userId;
        filtres.methodePaiement = { $in: ['WAVE', 'ORANGE_MONEY', 'MTN_MONEY', 'MOOV_MONEY'] };
      }
      
      if (statut) {
        filtres.statutPaiement = statut.toUpperCase();
      }

      if (dateDebut || dateFin) {
        filtres.dateInitiation = {};
        if (dateDebut) filtres.dateInitiation.$gte = new Date(dateDebut);
        if (dateFin) filtres.dateInitiation.$lte = new Date(dateFin);
      }

      const paiements = await Paiement.find(filtres)
        .populate('reservationId', 'trajetId nombrePlaces')
        .populate('beneficiaireId', 'nom prenom')
        .sort({ dateInitiation: -1 })
        .skip(skip)
        .limit(parseInt(limit));

      const total = await Paiement.countDocuments(filtres);

      return res.status(200).json({
        success: true,
        paiements: paiements.map(p => p.obtenirResume()),
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      });

    } catch (error) {
      logger.error('Erreur historique paiements:', error);
      return res.status(500).json({
        success: false,
        error: 'ERREUR_HISTORIQUE',
        message: error.message
      });
    }
  }

  async obtenirPaiement(req, res) {
    try {
      const { paiementId } = req.params;
      const userId = req.user._id;

      const paiement = await Paiement.findOne({
        _id: paiementId,
        $or: [{ payeurId: userId }, { beneficiaireId: userId }]
      })
      .populate('reservationId')
      .populate('payeurId', 'nom prenom')
      .populate('beneficiaireId', 'nom prenom');

      if (!paiement) {
        return res.status(404).json({
          success: false,
          error: 'PAIEMENT_NON_TROUVE',
          message: 'Paiement non trouvé'
        });
      }

      return res.status(200).json({
        success: true,
        paiement: paiement.obtenirResume()
      });

    } catch (error) {
      logger.error('Erreur obtenir paiement:', error);
      return res.status(500).json({
        success: false,
        error: 'ERREUR_OBTENIR_PAIEMENT',
        message: error.message
      });
    }
  }
  
  async obtenirMethodesDisponibles(req, res) {
    try {
      const methodes = [
        {
          id: 'WAVE',
          nom: 'Wave',
          type: 'mobile_money',
          frais: '0%',
          actif: true
        },
        {
          id: 'ORANGE_MONEY',
          nom: 'Orange Money',
          type: 'mobile_money',
          frais: '1.5%',
          actif: true
        },
        {
          id: 'MTN_MONEY',
          nom: 'MTN Money',
          type: 'mobile_money',
          frais: '1.5%',
          actif: true
        },
        {
          id: 'MOOV_MONEY',
          nom: 'Moov Money',
          type: 'mobile_money',
          frais: '1.5%',
          actif: true
        }
      ];

      return res.status(200).json({
        success: true,
        methodes
      });

    } catch (error) {
      logger.error('Erreur méthodes disponibles:', error);
      return res.status(500).json({
        success: false,
        error: 'ERREUR_METHODES',
        message: error.message
      });
    }
  }

  // =========================
  // MÉTHODES UTILITAIRES
  // =========================

  async genererRapportPDF(donneesRapport) {
    const doc = new PDFDocument();
    const chunks = [];

    doc.on('data', chunks.push.bind(chunks));

    doc.fontSize(20).text('Rapport de Commissions', { align: 'center' });
    doc.moveDown();
    
    const resume = donneesRapport.data.resumeExecutif;
    doc.fontSize(16).text('Résumé Exécutif');
    doc.fontSize(12);
    doc.text(`Total Commissions: ${resume.totalCommissions.toLocaleString()} FCFA`);
    doc.text(`Total Bonus: ${resume.totalBonus.toLocaleString()} FCFA`);
    doc.text(`Nombre Transactions: ${resume.totalTransactions.toLocaleString()}`);
    doc.text(`Montant Total Traité: ${resume.montantTotalTraite.toLocaleString()} FCFA`);

    doc.end();

    return new Promise((resolve) => {
      doc.on('end', () => {
        resolve(Buffer.concat(chunks));
      });
    });
  }

  convertirEnCSV(donnees) {
    const headers = [
      'Periode',
      'Nombre_Transactions',
      'Montant_Total_Traite',
      'Total_Commissions',
      'Total_Bonus',
      'Commissions_Prelevees',
      'Taux_Prelevement'
    ];

    const lignes = donnees.map(d => [
      d.periode,
      d.nombreTransactions,
      d.montantTotalTraite,
      d.totalCommissions,
      d.totalBonus || 0,
      d.commissionsPrelevees,
      d.tauxPrelevement.toFixed(2)
    ]);

    return [headers, ...lignes]
      .map(ligne => ligne.join(','))
      .join('\n');
  }

  validerNumeroOperateur(numeroTelephone, operateur) {
    if (!numeroTelephone) {
      return { valide: false, message: 'Numéro de téléphone requis' };
    }

    const regexOperateurs = {
      'ORANGE': /^(\+225)?07[0-9]{8}$/,
      'ORANGE_MONEY': /^(\+225)?07[0-9]{8}$/,
      'MTN': /^(\+225)?05[0-9]{8}$/,
      'MTN_MONEY': /^(\+225)?05[0-9]{8}$/,
      'MOOV': /^(\+225)?01[0-9]{8}$/,
      'MOOV_MONEY': /^(\+225)?01[0-9]{8}$/,
      'WAVE': /^(\+225)?[0-9]{8,10}$/
    };

    const regex = regexOperateurs[operateur.toUpperCase()];
    if (!regex) {
      return { valide: false, message: 'Opérateur non supporté' };
    }

    if (!regex.test(numeroTelephone)) {
      return { 
        valide: false, 
        message: `Format de numéro invalide pour ${operateur}` 
      };
    }

    return { valide: true };
  }

  async verifierLimitesRecharge(userId, montant) {
    const maintenant = new Date();
    const debutJour = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate());

    const rechargesAujourdhui = await Paiement.find({
      payeurId: userId,
      dateInitiation: { $gte: debutJour },
      statutPaiement: { $in: ['COMPLETE', 'EN_ATTENTE'] },
      methodePaiement: { $in: ['WAVE', 'ORANGE_MONEY', 'MTN_MONEY', 'MOOV_MONEY'] }
    });

    const montantRechargeAujourdhui = rechargesAujourdhui.reduce((sum, r) => sum + r.montantTotal, 0);
    const nombreRechargesAujourdhui = rechargesAujourdhui.length;

    const LIMITE_MONTANT_QUOTIDIEN = 500000;
    const LIMITE_NOMBRE_QUOTIDIEN = 5;

    if (montantRechargeAujourdhui + montant > LIMITE_MONTANT_QUOTIDIEN) {
      return {
        autorise: false,
        message: 'Limite quotidienne de montant dépassée',
        details: {
          limiteQuotidienne: LIMITE_MONTANT_QUOTIDIEN,
          montantUtiliseAujourdhui: montantRechargeAujourdhui,
          montantRestant: LIMITE_MONTANT_QUOTIDIEN - montantRechargeAujourdhui
        }
      };
    }

    if (nombreRechargesAujourdhui >= LIMITE_NOMBRE_QUOTIDIEN) {
      return {
        autorise: false,
        message: 'Nombre maximum de recharges quotidiennes atteint',
        details: {
          limiteNombre: LIMITE_NOMBRE_QUOTIDIEN,
          nombreEffectueAujourdhui: nombreRechargesAujourdhui
        }
      };
    }

    return { autorise: true };
  }

  genererInstructionsRecharge(methodePaiement, numeroTelephone, montant) {
    const instructions = {
      'ORANGE_MONEY': [
        'Composez #144# sur votre téléphone Orange Money',
        'Sélectionnez "Transfert d\'argent"',
        'Sélectionnez "Vers un marchand"',
        `Entrez le montant: ${montant} FCFA`,
        'Confirmez la transaction'
      ],
      'MTN_MONEY': [
        'Composez *133# sur votre téléphone MTN Money',
        'Sélectionnez "Paiement marchand"',
        `Entrez le montant: ${montant} FCFA`,
        'Suivez les instructions pour finaliser'
      ],
      'MOOV_MONEY': [
        'Composez *555# sur votre téléphone Moov Money',
        'Sélectionnez "Paiement"',
        `Entrez le montant: ${montant} FCFA`,
        'Confirmez votre paiement'
      ],
      'WAVE': [
        'Ouvrez votre application Wave',
        'Sélectionnez "Envoyer de l\'argent"',
        `Envoyez ${montant} FCFA au marchand WAYZ-ECO`,
        'Notez le code de transaction reçu'
      ]
    };

    return {
      methode: methodePaiement,
      etapes: instructions[methodePaiement] || [],
      informationsImportantes: [
        'Conservez votre code de transaction',
        'La recharge sera créditée sous 15 minutes maximum',
        'Bonus de 2% pour recharge ≥ 10 000 FCFA',
        'En cas de problème, contactez notre support'
      ]
    };
  }

  async envoyerEmailConfirmationPaiement(conducteur, paiement) {
    try {
      await sendEmail({
        to: conducteur.email,
        subject: 'Paiement reçu - WAYZ-ECO',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #28a745;">✅ Paiement reçu avec succès</h2>
            <p>Bonjour ${conducteur.prenom},</p>
            
            <div style="background-color: #d4edda; padding: 20px; border-left: 4px solid #28a745; margin: 20px 0;">
              <h3>Détails du paiement</h3>
              <ul style="list-style: none; padding: 0;">
                <li><strong>Référence:</strong> ${paiement.referenceTransaction}</li>
                <li><strong>Montant total:</strong> ${paiement.montantTotal.toLocaleString()} FCFA</li>
                <li><strong>Commission plateforme:</strong> ${paiement.commission.montant.toLocaleString()} FCFA (${(paiement.commission.taux * 100).toFixed(1)}%)</li>
                ${paiement.commission.reductionAppliquee > 0 ? `<li><strong>Réduction appliquée:</strong> ${(paiement.commission.reductionAppliquee * 100).toFixed(1)}% - ${paiement.commission.raisonReduction}</li>` : ''}
                ${paiement.bonus.primePerformance > 0 ? `<li><strong>Prime performance:</strong> +${paiement.bonus.primePerformance.toLocaleString()} FCFA</li>` : ''}
                <li><strong>Montant crédité:</strong> ${paiement.montantNetConducteur.toLocaleString()} FCFA</li>
                <li><strong>Méthode:</strong> ${paiement.methodePaiement}</li>
                <li><strong>Date:</strong> ${paiement.dateCompletion.toLocaleString()}</li>
              </ul>
            </div>

            <div style="background-color: #e3f2fd; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <p><strong>Nouveau solde après transaction:</strong> ${paiement.reglesPaiement.soldeConducteurApres?.toLocaleString() || 'N/A'} FCFA</p>
            </div>

            <hr style="margin: 30px 0;">
            <p style="color: #666; font-size: 12px;">
              Cette confirmation vous est envoyée automatiquement. 
              Conservez-la pour vos dossiers.
            </p>
          </div>
        `
      });
    } catch (emailError) {
      logger.error('Erreur envoi email confirmation paiement:', emailError);
    }
  }

  async envoyerEmailConfirmationRecharge(user, paiement) {
    try {
      const montantTotal = paiement.montantConducteur + (paiement.bonus.bonusRecharge || 0);
      
      await sendEmail({
        to: user.email,
        subject: 'Recharge confirmée - WAYZ-ECO',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #28a745;">✅ Recharge confirmée avec succès</h2>
            <p>Bonjour ${user.prenom},</p>
            
            <div style="background-color: #d4edda; padding: 20px; border-left: 4px solid #28a745; margin: 20px 0;">
              <h3>Détails de votre recharge</h3>
              <ul style="list-style: none; padding: 0;">
                <li><strong>Référence:</strong> ${paiement.referenceTransaction}</li>
                <li><strong>Montant rechargé:</strong> ${paiement.montantTotal.toLocaleString()} FCFA</li>
                <li><strong>Montant net:</strong> ${paiement.montantConducteur.toLocaleString()} FCFA</li>
                ${paiement.bonus.bonusRecharge > 0 ? `<li><strong>🎁 Bonus recharge:</strong> +${paiement.bonus.bonusRecharge.toLocaleString()} FCFA</li>` : ''}
                <li><strong>Montant total crédité:</strong> ${montantTotal.toLocaleString()} FCFA</li>
                <li><strong>Frais de transaction:</strong> ${paiement.fraisTransaction.toLocaleString()} FCFA</li>
                <li><strong>Méthode:</strong> ${paiement.methodePaiement}</li>
                <li><strong>Date:</strong> ${paiement.dateCompletion.toLocaleString()}</li>
              </ul>
            </div>

            <div style="background-color: #e3f2fd; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <p><strong>Nouveau solde disponible:</strong> ${user.compteCovoiturage.solde.toLocaleString()} FCFA</p>
              <p>✅ Vous pouvez maintenant accepter les paiements en espèces et bénéficier de tous les avantages conducteur !</p>
            </div>

            ${paiement.bonus.bonusRecharge > 0 ? `
            <div style="background-color: #fff3cd; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <p><strong>🎉 Bonus fidélité:</strong> Vous avez reçu un bonus de ${(paiement.bonus.bonusRecharge / paiement.montantTotal * 100).toFixed(1)}% pour votre recharge !</p>
            </div>
            ` : ''}

            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/conducteur/compte" 
                 style="background-color: #007bff; color: white; padding: 15px 30px; 
                        text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
                Voir mon compte conducteur
              </a>
            </div>

            <hr style="margin: 30px 0;">
            <p style="color: #666; font-size: 12px;">
              Conservez cette confirmation pour vos dossiers. 
              En cas de question, contactez notre support client.
            </p>
          </div>
        `
      });
    } catch (emailError) {
      logger.error('Erreur envoi email confirmation recharge:', emailError);
    }
  }

  async verifierStatutMobileMoney(recharge) {
    const delaiMinimum = 5 * 60 * 1000;
    const maintenant = new Date();
    
    if (maintenant - recharge.dateInitiation < delaiMinimum) {
      return { confirme: false, raison: 'Délai minimum non atteint' };
    }

    const probabiliteConfirmation = Math.random();
    
    if (probabiliteConfirmation > 0.15) {
      return {
        confirme: true,
        transactionId: `EXT_${Date.now()}_${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
        dateConfirmation: maintenant
      };
    }

    return { confirme: false, raison: 'Transaction non confirmée par l\'opérateur' };
  }

}

module.exports = new PaiementController();
