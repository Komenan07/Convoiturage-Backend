// controllers/rechargeController.js
// Contrôleur complet pour la gestion des recharges de compte covoiturage

const User = require('../../models/Utilisateur');
const Paiement = require('../../models/Paiement');
const { logger } = require('../../utils/logger');
const AppError = require('../../utils/constants/errorConstants');
const sendEmail = require('../../utils/emailService');
const crypto = require('crypto');

/**
 * Initier une recharge de compte
 */
const initierRecharge = async (req, res, next) => {
  try {
    const {
      montant,
      methodePaiement,
      numeroTelephone,
      operateur,
      codeTransaction
    } = req.body;
    const userId = req.user.userId;

    // Vérifier l'utilisateur
    const user = await User.findById(userId).select('role compteCovoiturage nom prenom email telephone');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    // Vérifier que l'utilisateur peut recharger (conducteur)
    if (!['conducteur', 'les_deux'].includes(user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Seuls les conducteurs peuvent recharger leur compte',
        code: 'ROLE_INSUFFICIENT'
      });
    }

    // Validation du montant
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

    // Validation de la méthode de paiement
    const methodesValides = ['WAVE', 'ORANGE_MONEY', 'MTN_MONEY', 'MOOV_MONEY'];
    if (!methodesValides.includes(methodePaiement)) {
      return res.status(400).json({
        success: false,
        message: 'Méthode de paiement non supportée',
        methodesAcceptees: methodesValides
      });
    }

    // Validation du numéro selon l'opérateur
    const validationNumero = validerNumeroOperateur(numeroTelephone, operateur || methodePaiement);
    if (!validationNumero.valide) {
      return res.status(400).json({
        success: false,
        message: validationNumero.message
      });
    }

    // Vérifier les limites quotidiennes
    const limiteQuotidienne = await verifierLimitesRecharge(userId, montant);
    if (!limiteQuotidienne.autorise) {
      return res.status(429).json({
        success: false,
        message: limiteQuotidienne.message,
        limites: limiteQuotidienne.details
      });
    }

    // Calculer les frais de transaction (exemple: 2% avec minimum 50 FCFA)
    const fraisTransaction = Math.max(Math.round(montant * 0.02), 50);
    const montantNet = montant - fraisTransaction;

    // Créer l'enregistrement de paiement pour la recharge
    const paiement = new Paiement({
      // On utilise l'utilisateur comme payeur et bénéficiaire pour une recharge
      payeurId: userId,
      beneficiaireId: userId,
      montantTotal: montant,
      montantConducteur: montantNet,
      commissionPlateforme: 0, // Pas de commission sur les recharges
      fraisTransaction,
      
      // Commission (structure par défaut mais pas applicable)
      commission: {
        taux: 0,
        montant: 0,
        modePrelevement: 'paiement_mobile',
        statutPrelevement: 'preleve' // Pas de commission à prélever
      },

      methodePaiement: methodePaiement,
      
      // Règles de paiement spécifiques recharge
      reglesPaiement: {
        conducteurCompteRecharge: user.compteCovoiturage?.estRecharge || false,
        modesAutorises: ['wave', 'orange_money', 'mtn_money', 'moov_money'],
        raisonValidation: 'Recharge de compte conducteur',
        verificationsPassees: true
      },

      // Mobile money
      mobileMoney: {
        operateur: operateur || methodePaiement.replace('_MONEY', ''),
        numeroTelephone: numeroTelephone,
        codeTransaction: codeTransaction,
        statutMobileMoney: 'PENDING'
      },

      // Sécurité
      securite: {
        ipAddress: req.ip,
        userAgent: req.get('User-Agent'),
        deviceId: req.get('X-Device-ID')
      }
    });

    await paiement.save();

    // Ajouter à l'historique des recharges de l'utilisateur
    await user.rechargerCompte(
      montant, 
      methodePaiement.toLowerCase().replace('_', '_'),
      paiement.referenceTransaction,
      fraisTransaction
    );

    paiement.ajouterLog('RECHARGE_INITIEE', {
      userId,
      montant,
      montantNet,
      fraisTransaction,
      methodePaiement,
      operateur: operateur || methodePaiement.replace('_MONEY', '')
    });

    logger.info('Recharge initiée', {
      userId,
      paiementId: paiement._id,
      montant,
      methodePaiement,
      referenceTransaction: paiement.referenceTransaction
    });

    res.status(201).json({
      success: true,
      message: 'Recharge initiée avec succès',
      data: {
        paiementId: paiement._id,
        referenceTransaction: paiement.referenceTransaction,
        montant,
        montantNet,
        fraisTransaction,
        methodePaiement,
        statutPaiement: paiement.statutPaiement,
        dateInitiation: paiement.dateInitiation,
        instructions: genererInstructionsRecharge(methodePaiement, numeroTelephone, montant)
      }
    });

  } catch (error) {
    logger.error('Erreur initiation recharge:', error);
    return next(AppError.serverError('Erreur lors de l\'initiation de la recharge', {
      originalError: error.message
    }));
  }
};

/**
 * Confirmer une recharge (callback ou vérification manuelle)
 */
const confirmerRecharge = async (req, res, next) => {
  try {
    const {
      referenceTransaction,
      codeVerification,
      statutPaiement = 'COMPLETE',
      donneesCallback = {}
    } = req.body;

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

    // Traiter selon le nouveau statut
    if (statutPaiement === 'COMPLETE') {
      // Recharge réussie
      paiement.statutPaiement = 'COMPLETE';
      paiement.dateCompletion = new Date();
      
      // Traiter le callback mobile money si fourni
      if (donneesCallback.transactionId) {
        paiement.traiterCallbackMobile({
          transactionId: donneesCallback.transactionId,
          statut: 'SUCCESS',
          codeTransaction: codeVerification || donneesCallback.codeTransaction,
          ...donneesCallback
        });
      }

      // Confirmer la recharge dans le compte utilisateur
      const user = paiement.payeurId;
      await user.confirmerRecharge(referenceTransaction, 'reussi');

      // Envoyer email de confirmation
      await envoyerEmailConfirmationRecharge(user, paiement);

      paiement.ajouterLog('RECHARGE_CONFIRMEE', {
        montantCredite: paiement.montantConducteur,
        nouveauSolde: user.compteCovoiturage.solde,
        codeVerification
      });

      logger.info('Recharge confirmée', {
        paiementId: paiement._id,
        userId: user._id,
        montant: paiement.montantTotal,
        nouveauSolde: user.compteCovoiturage.solde
      });

      res.json({
        success: true,
        message: 'Recharge confirmée avec succès',
        data: {
          paiementId: paiement._id,
          referenceTransaction: paiement.referenceTransaction,
          montantCredite: paiement.montantConducteur,
          nouveauSolde: user.compteCovoiturage.solde,
          statutPaiement: paiement.statutPaiement,
          dateCompletion: paiement.dateCompletion
        }
      });

    } else if (statutPaiement === 'ECHEC') {
      // Recharge échouée
      paiement.statutPaiement = 'ECHEC';
      
      if (donneesCallback.transactionId) {
        paiement.traiterCallbackMobile({
          transactionId: donneesCallback.transactionId,
          statut: 'FAILED',
          ...donneesCallback
        });
      }

      // Marquer comme échoué dans l'historique utilisateur
      const user = paiement.payeurId;
      await user.confirmerRecharge(referenceTransaction, 'echec');

      paiement.ajouterErreur('RECHARGE_ECHEC', 
        donneesCallback.messageErreur || 'Échec du paiement mobile money');

      res.json({
        success: true,
        message: 'Statut de recharge mis à jour (échec)',
        data: {
          paiementId: paiement._id,
          referenceTransaction: paiement.referenceTransaction,
          statutPaiement: paiement.statutPaiement,
          raisonEchec: donneesCallback.messageErreur || 'Paiement non confirmé'
        }
      });
    }

    await paiement.save();

  } catch (error) {
    logger.error('Erreur confirmation recharge:', error);
    return next(AppError.serverError('Erreur lors de la confirmation de la recharge', {
      originalError: error.message
    }));
  }
};

/**
 * Obtenir l'historique des recharges de l'utilisateur
 */
const obtenirHistoriqueRecharges = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const { 
      page = 1, 
      limit = 10, 
      statut,
      dateDebut,
      dateFin 
    } = req.query;

    const user = await User.findById(userId).select('compteCovoiturage nom prenom');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    // Construire les filtres
    const filtres = {
      payeurId: userId,
      beneficiaireId: userId, // Pour les recharges, payeur = bénéficiaire
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
      .select('referenceTransaction montantTotal montantConducteur fraisTransaction methodePaiement statutPaiement dateInitiation dateCompletion mobileMoney.operateur mobileMoney.transactionId')
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
          fraisTotaux: statistiques.fraisTotaux || 0,
          nombreRecharges: statistiques.nombreRecharges || 0,
          tauxReussite: statistiques.nombreRecharges > 0 ? 
            Math.round((statistiques.rechargesReussies / statistiques.nombreRecharges) * 100) : 0
        }
      }
    });

  } catch (error) {
    logger.error('Erreur historique recharges:', error);
    return next(AppError.serverError('Erreur lors de l\'obtention de l\'historique', {
      originalError: error.message
    }));
  }
};

/**
 * Obtenir le statut d'une recharge spécifique
 */
const obtenirStatutRecharge = async (req, res, next) => {
  try {
    const { referenceTransaction } = req.params;
    const userId = req.user.userId;

    const paiement = await Paiement.findOne({
      referenceTransaction,
      payeurId: userId
    }).select('referenceTransaction montantTotal montantConducteur fraisTransaction methodePaiement statutPaiement dateInitiation dateCompletion mobileMoney logsTransaction erreurs');

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

    res.json({
      success: true,
      data: {
        referenceTransaction: paiement.referenceTransaction,
        montantTotal: paiement.montantTotal,
        montantACrediter: paiement.montantConducteur,
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
    return next(AppError.serverError('Erreur lors de l\'obtention du statut', {
      originalError: error.message
    }));
  }
};

/**
 * Configurer la recharge automatique
 */
const configurerRechargeAutomatique = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const {
      active,
      seuilAutoRecharge,
      montantAutoRecharge,
      methodePaiementAuto,
      numeroTelephoneAuto
    } = req.body;

    const user = await User.findById(userId).select('compteCovoiturage nom prenom');
    
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
      const validationNumero = validerNumeroOperateur(numeroTelephoneAuto, methodePaiementAuto);
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
    return next(AppError.serverError('Erreur lors de la configuration', {
      originalError: error.message
    }));
  }
};

/**
 * Annuler une recharge en cours
 */
const annulerRecharge = async (req, res, next) => {
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
    const delaiAnnulation = 30 * 60 * 1000; // 30 minutes en millisecondes
    
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
    return next(AppError.serverError('Erreur lors de l\'annulation', {
      originalError: error.message
    }));
  }
};

/**
 * FONCTIONS UTILITAIRES
 */

/**
 * Valider le numéro de téléphone selon l'opérateur
 */
const validerNumeroOperateur = (numeroTelephone, operateur) => {
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
};

/**
 * Vérifier les limites de recharge quotidiennes
 */
const verifierLimitesRecharge = async (userId, montant) => {
  const maintenant = new Date();
  const debutJour = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate());

  // Obtenir les recharges du jour
  const rechargesAujourdhui = await Paiement.find({
    payeurId: userId,
    dateInitiation: { $gte: debutJour },
    statutPaiement: { $in: ['COMPLETE', 'EN_ATTENTE'] },
    methodePaiement: { $in: ['WAVE', 'ORANGE_MONEY', 'MTN_MONEY', 'MOOV_MONEY'] }
  });

  const montantRechargeAujourdhui = rechargesAujourdhui.reduce((sum, r) => sum + r.montantTotal, 0);
  const nombreRechargesAujourdhui = rechargesAujourdhui.length;

  // Limites quotidiennes
  const LIMITE_MONTANT_QUOTIDIEN = 500000; // 500k FCFA
  const LIMITE_NOMBRE_QUOTIDIEN = 5; // 5 recharges max/jour

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
};

/**
 * Générer les instructions de recharge selon la méthode
 */
const genererInstructionsRecharge = (methodePaiement, numeroTelephone, montant) => {
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
      'En cas de problème, contactez notre support'
    ]
  };
};

/**
 * Envoyer email de confirmation de recharge
 */
const envoyerEmailConfirmationRecharge = async (user, paiement) => {
  try {
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
              <li><strong>Montant crédité:</strong> ${paiement.montantConducteur.toLocaleString()} FCFA</li>
              <li><strong>Frais de transaction:</strong> ${paiement.fraisTransaction.toLocaleString()} FCFA</li>
              <li><strong>Méthode:</strong> ${paiement.methodePaiement}</li>
              <li><strong>Date:</strong> ${paiement.dateCompletion.toLocaleString()}</li>
            </ul>
          </div>

          <div style="background-color: #e3f2fd; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p><strong>Nouveau solde disponible:</strong> ${user.compteCovoiturage.solde.toLocaleString()} FCFA</p>
            <p>Vous pouvez maintenant accepter les paiements en espèces et bénéficier de tous les avantages conducteur !</p>
          </div>

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
};

/**
 * Obtenir les statistiques de recharge (ADMIN)
 */
const obtenirStatistiquesRecharges = async (req, res, next) => {
  try {
    const { 
      dateDebut, 
      dateFin, 
      groupePar = 'jour' 
    } = req.query;

    // Dates par défaut (30 derniers jours)
    const fin = dateFin ? new Date(dateFin) : new Date();
    const debut = dateDebut ? new Date(dateDebut) : 
      new Date(fin.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Format de date selon le groupement
    let formatDate;
    switch (groupePar) {
      case 'heure': {
        formatDate = '%Y-%m-%d %H:00';
        break;
      }
      case 'jour': {
        formatDate = '%Y-%m-%d';
        break;
      }
      case 'semaine': {
        formatDate = '%Y-%U';
        break;
      }
      case 'mois': {
        formatDate = '%Y-%m';
        break;
      }
      default: {
        formatDate = '%Y-%m-%d';
        break;
      }
    }

    // Statistiques globales des recharges
    const statsGlobales = await Paiement.aggregate([
      {
        $match: {
          payeurId: { $eq: { $toObjectId: '$beneficiaireId' } }, // Recharges uniquement
          methodePaiement: { $in: ['WAVE', 'ORANGE_MONEY', 'MTN_MONEY', 'MOOV_MONEY'] },
          dateInitiation: { $gte: debut, $lte: fin }
        }
      },
      {
        $group: {
          _id: null,
          totalRecharges: { $sum: 1 },
          montantTotalRecharge: { $sum: '$montantTotal' },
          montantNetCredite: { $sum: '$montantConducteur' },
          fraisTotaux: { $sum: '$fraisTransaction' },
          rechargesReussies: {
            $sum: { $cond: [{ $eq: ['$statutPaiement', 'COMPLETE'] }, 1, 0] }
          },
          rechargesEnCours: {
            $sum: { $cond: [{ $eq: ['$statutPaiement', 'EN_ATTENTE'] }, 1, 0] }
          },
          rechargesEchouees: {
            $sum: { $cond: [{ $eq: ['$statutPaiement', 'ECHEC'] }, 1, 0] }
          },
          montantMoyenRecharge: { $avg: '$montantTotal' }
        }
      }
    ]);

    // Évolution temporelle
    const evolutionTemporelle = await Paiement.aggregate([
      {
        $match: {
          payeurId: { $eq: { $toObjectId: '$beneficiaireId' } },
          methodePaiement: { $in: ['WAVE', 'ORANGE_MONEY', 'MTN_MONEY', 'MOOV_MONEY'] },
          dateInitiation: { $gte: debut, $lte: fin }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: formatDate, date: '$dateInitiation' }
          },
          nombreRecharges: { $sum: 1 },
          montantTotal: { $sum: '$montantTotal' },
          montantNetCredite: { $sum: '$montantConducteur' },
          rechargesReussies: {
            $sum: { $cond: [{ $eq: ['$statutPaiement', 'COMPLETE'] }, 1, 0] }
          }
        }
      },
      {
        $sort: { '_id': 1 }
      }
    ]);

    // Répartition par opérateur
    const repartitionOperateurs = await Paiement.aggregate([
      {
        $match: {
          payeurId: { $eq: { $toObjectId: '$beneficiaireId' } },
          methodePaiement: { $in: ['WAVE', 'ORANGE_MONEY', 'MTN_MONEY', 'MOOV_MONEY'] },
          dateInitiation: { $gte: debut, $lte: fin },
          statutPaiement: 'COMPLETE'
        }
      },
      {
        $group: {
          _id: '$methodePaiement',
          nombreRecharges: { $sum: 1 },
          montantTotal: { $sum: '$montantTotal' },
          fraisMoyens: { $avg: '$fraisTransaction' }
        }
      },
      {
        $sort: { nombreRecharges: -1 }
      }
    ]);

    const [stats] = statsGlobales.length > 0 ? statsGlobales : [{}];
    const tauxReussite = stats.totalRecharges > 0 ? 
      (stats.rechargesReussies / stats.totalRecharges * 100) : 0;

    res.json({
      success: true,
      data: {
        periode: { debut, fin, groupePar },
        resumeGlobal: {
          totalRecharges: stats.totalRecharges || 0,
          montantTotalRecharge: stats.montantTotalRecharge || 0,
          montantNetCredite: stats.montantNetCredite || 0,
          fraisTotaux: stats.fraisTotaux || 0,
          montantMoyenRecharge: Math.round(stats.montantMoyenRecharge || 0),
          tauxReussite: Math.round(tauxReussite * 100) / 100
        },
        repartitionStatuts: {
          reussies: stats.rechargesReussies || 0,
          enCours: stats.rechargesEnCours || 0,
          echouees: stats.rechargesEchouees || 0
        },
        evolutionTemporelle,
        repartitionOperateurs,
        metriques: {
          tauxConversionMoyen: stats.fraisTotaux > 0 ? 
            Math.round((stats.fraisTotaux / stats.montantTotalRecharge) * 100 * 100) / 100 : 0,
          volumeQuotidienMoyen: Math.round(stats.montantTotalRecharge / 
            Math.max(1, Math.ceil((fin - debut) / (1000 * 60 * 60 * 24))))
        }
      }
    });

  } catch (error) {
    logger.error('Erreur statistiques recharges:', error);
    return next(AppError.serverError('Erreur lors de l\'obtention des statistiques', {
      originalError: error.message
    }));
  }
};

/**
 * Traiter les recharges en attente (CRON/ADMIN)
 */
const traiterRechargesEnAttente = async (req, res, next) => {
  try {
    const { forcerExpiration = false } = req.body;

    // Délai d'expiration : 2 heures pour les recharges
    const delaiExpiration = 2 * 60 * 60 * 1000;
    const maintenant = new Date();
    const limiteExpiration = new Date(maintenant.getTime() - delaiExpiration);

    let criteres = {
      statutPaiement: 'EN_ATTENTE',
      methodePaiement: { $in: ['WAVE', 'ORANGE_MONEY', 'MTN_MONEY', 'MOOV_MONEY'] }
    };

    if (forcerExpiration) {
      // Traiter toutes les recharges en attente
      criteres.payeurId = { $eq: { $toObjectId: '$beneficiaireId' } };
    } else {
      // Seulement celles qui ont dépassé le délai
      criteres.dateInitiation = { $lte: limiteExpiration };
      criteres.payeurId = { $eq: { $toObjectId: '$beneficiaireId' } };
    }

    const rechargesEnAttente = await Paiement.find(criteres)
      .populate('payeurId', 'nom prenom email compteCovoiturage');

    let traitees = 0;
    let expirees = 0;
    const resultats = [];

    for (const recharge of rechargesEnAttente) {
      try {
        // Vérifier le statut avec l'opérateur mobile money (simulation)
        const statutExterne = await verifierStatutMobileMoney(recharge);
        
        let resultat = {
          paiementId: recharge._id,
          referenceTransaction: recharge.referenceTransaction,
          conducteur: `${recharge.payeurId.prenom} ${recharge.payeurId.nom}`
        };

        if (statutExterne.confirme) {
          // Recharge confirmée
          recharge.statutPaiement = 'COMPLETE';
          recharge.dateCompletion = new Date();
          
          // Créditer le compte
          await recharge.payeurId.confirmerRecharge(
            recharge.referenceTransaction, 
            'reussi'
          );

          recharge.ajouterLog('RECHARGE_AUTO_CONFIRMEE', {
            statutExterne,
            dateTraitement: new Date()
          });

          // Envoyer email de confirmation
          await envoyerEmailConfirmationRecharge(recharge.payeurId, recharge);

          resultat.action = 'Confirmée automatiquement';
          resultat.nouveauSolde = recharge.payeurId.compteCovoiturage.solde;
          traitees++;

        } else if (forcerExpiration || (maintenant - recharge.dateInitiation) > delaiExpiration) {
          // Expirer la recharge
          recharge.statutPaiement = 'ECHEC';
          recharge.ajouterErreur('RECHARGE_EXPIREE', 'Délai de confirmation dépassé');
          
          // Marquer comme échoué dans l'historique
          await recharge.payeurId.confirmerRecharge(
            recharge.referenceTransaction, 
            'echec'
          );

          resultat.action = 'Expirée';
          resultat.raison = 'Délai de confirmation dépassé';
          expirees++;
        } else {
          resultat.action = 'En attente';
          resultat.tempRestant = Math.round((limiteExpiration - recharge.dateInitiation) / (1000 * 60)) + ' minutes';
        }

        await recharge.save();
        resultats.push(resultat);

      } catch (erreurTraitement) {
        logger.error(`Erreur traitement recharge ${recharge._id}:`, erreurTraitement);
        resultats.push({
          paiementId: recharge._id,
          referenceTransaction: recharge.referenceTransaction,
          action: 'Erreur de traitement',
          erreur: erreurTraitement.message
        });
      }
    }

    logger.info('Traitement recharges en attente terminé', {
      rechargesTraitees: traitees,
      rechargesExpirees: expirees,
      total: rechargesEnAttente.length
    });

    res.json({
      success: true,
      message: `Traitement terminé: ${traitees} confirmées, ${expirees} expirées`,
      data: {
        statistiques: {
          total: rechargesEnAttente.length,
          traitees,
          expirees,
          enAttente: rechargesEnAttente.length - traitees - expirees
        },
        resultats
      }
    });

  } catch (error) {
    logger.error('Erreur traitement recharges en attente:', error);
    return next(AppError.serverError('Erreur lors du traitement', {
      originalError: error.message
    }));
  }
};

/**
 * Vérifier le statut avec l'opérateur mobile money (simulation)
 */
const verifierStatutMobileMoney = async (recharge) => {
  // Simulation de vérification externe
  // En production, ceci ferait appel aux APIs des opérateurs
  
  const delaiMinimum = 5 * 60 * 1000; // 5 minutes minimum
  const maintenant = new Date();
  
  if (maintenant - recharge.dateInitiation < delaiMinimum) {
    return { confirme: false, raison: 'Délai minimum non atteint' };
  }

  // Simulation : 85% de chance de confirmation après 5 minutes
  const probabiliteConfirmation = Math.random();
  
  if (probabiliteConfirmation > 0.15) {
    return {
      confirme: true,
      transactionId: `EXT_${Date.now()}_${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
      dateConfirmation: maintenant
    };
  }

  return { confirme: false, raison: 'Transaction non confirmée par l\'opérateur' };
};

module.exports = {
  initierRecharge,
  confirmerRecharge,
  obtenirHistoriqueRecharges,
  obtenirStatutRecharge,
  configurerRechargeAutomatique,
  annulerRecharge,
  obtenirStatistiquesRecharges,
  traiterRechargesEnAttente
};