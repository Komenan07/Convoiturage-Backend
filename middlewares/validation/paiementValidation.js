// controllers/payment/validationPaiement.js
// Système complet de validation de paiement intégré avec la vérification

const User = require('../../models/Utilisateur');
const Transaction = require('../../models/Transaction');
const Paiement = require('../../models/Paiement');
const { logger } = require('../../utils/logger');
const AppError = require('../../utils/constants/errorConstants');
const sendEmail = require('../../utils/emailService');
const crypto = require('crypto');

/**
 * Configuration des limites de paiement selon le statut de vérification
 */
const LIMITES_PAIEMENT = {
  NON_VERIFIE: {
    montantMaxParTransaction: 50000, // 50k FCFA
    montantMaxParJour: 100000, // 100k FCFA
    montantMaxParMois: 500000, // 500k FCFA
    nombreMaxTransactionsParJour: 5
  },
  VERIFIE: {
    montantMaxParTransaction: 500000, // 500k FCFA
    montantMaxParJour: 1000000, // 1M FCFA
    montantMaxParMois: 5000000, // 5M FCFA
    nombreMaxTransactionsParJour: 20
  },
  PREMIUM: {
    montantMaxParTransaction: 2000000, // 2M FCFA
    montantMaxParJour: 5000000, // 5M FCFA
    montantMaxParMois: 20000000, // 20M FCFA
    nombreMaxTransactionsParJour: 50
  }
};

/**
 * Valider les limites de paiement selon le statut de vérification
 */
const validerLimitesPaiement = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const { montant, typeTransaction = 'PAIEMENT' } = req.body;

    // Récupérer l'utilisateur avec ses infos de vérification
    const user = await User.findById(userId).select('documentIdentite abonnement');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    // Déterminer le niveau de l'utilisateur
    let niveauUtilisateur = 'NON_VERIFIE';
    
    if (user.documentIdentite?.statutVerification === 'VERIFIE') {
      // Vérifier si la vérification n'est pas expirée
      const dateVerification = new Date(user.documentIdentite.dateVerification);
      const maintenant = new Date();
      const deuxAns = 2 * 365 * 24 * 60 * 60 * 1000;
      
      if (maintenant - dateVerification <= deuxAns) {
        niveauUtilisateur = user.abonnement?.type === 'PREMIUM' ? 'PREMIUM' : 'VERIFIE';
      }
    }

    const limites = LIMITES_PAIEMENT[niveauUtilisateur];

    // Validation du montant de la transaction
    if (montant > limites.montantMaxParTransaction) {
      return res.status(400).json({
        success: false,
        message: `Montant maximum par transaction dépassé (${limites.montantMaxParTransaction.toLocaleString()} FCFA)`,
        code: 'TRANSACTION_LIMIT_EXCEEDED',
        limiteActuelle: limites.montantMaxParTransaction,
        niveauUtilisateur,
        upgradeInfo: niveauUtilisateur === 'NON_VERIFIE' ? {
          message: 'Vérifiez votre identité pour augmenter vos limites',
          redirectTo: '/verification'
        } : null
      });
    }

    // Vérifier les limites journalières et mensuelles
    const maintenant = new Date();
    const debutJour = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate());
    const debutMois = new Date(maintenant.getFullYear(), maintenant.getMonth(), 1);

    // Transactions du jour
    const transactionsJour = await Transaction.find({
      userId,
      dateCreation: { $gte: debutJour },
      statut: { $in: ['CONFIRME', 'EN_COURS'] },
      type: typeTransaction
    });

    const montantJour = transactionsJour.reduce((total, t) => total + t.montant, 0);
    const nombreTransactionsJour = transactionsJour.length;

    if (montantJour + montant > limites.montantMaxParJour) {
      return res.status(400).json({
        success: false,
        message: `Limite journalière dépassée (${limites.montantMaxParJour.toLocaleString()} FCFA)`,
        code: 'DAILY_LIMIT_EXCEEDED',
        montantUtiliseAujourdhui: montantJour,
        limiteJournaliere: limites.montantMaxParJour
      });
    }

    if (nombreTransactionsJour >= limites.nombreMaxTransactionsParJour) {
      return res.status(400).json({
        success: false,
        message: `Nombre maximum de transactions par jour atteint (${limites.nombreMaxTransactionsParJour})`,
        code: 'TRANSACTION_COUNT_LIMIT_EXCEEDED'
      });
    }

    // Transactions du mois
    const transactionsMois = await Transaction.find({
      userId,
      dateCreation: { $gte: debutMois },
      statut: { $in: ['CONFIRME', 'EN_COURS'] },
      type: typeTransaction
    });

    const montantMois = transactionsMois.reduce((total, t) => total + t.montant, 0);

    if (montantMois + montant > limites.montantMaxParMois) {
      return res.status(400).json({
        success: false,
        message: `Limite mensuelle dépassée (${limites.montantMaxParMois.toLocaleString()} FCFA)`,
        code: 'MONTHLY_LIMIT_EXCEEDED',
        montantUtiliseCeMois: montantMois,
        limiteMensuelle: limites.montantMaxParMois
      });
    }

    // Ajouter les infos de limites à la requête pour les contrôleurs suivants
    req.limitesUtilisateur = {
      niveau: niveauUtilisateur,
      limites: limites,
      utilisationJour: { montant: montantJour, transactions: nombreTransactionsJour },
      utilisationMois: { montant: montantMois, transactions: transactionsMois.length }
    };

    next();

  } catch (error) {
    logger.error('Erreur validation limites paiement:', error);
    return next(AppError.serverError('Erreur de validation des limites'));
  }
};

/**
 * Valider les données de paiement
 */
const validerDonneesPaiement = (req, res, next) => {
  try {
    const { 
      montant, 
      methodePaiement, 
      numeroTelephone, 
      codeTransaction,
      typeTransaction = 'PAIEMENT'
    } = req.body;

    const errors = [];

    // Validation du montant
    if (!montant || typeof montant !== 'number' || montant <= 0) {
      errors.push('Montant invalide');
    }

    if (montant < 100) { // Minimum 100 FCFA
      errors.push('Montant minimum : 100 FCFA');
    }

    if (montant > 10000000) { // Maximum 10M FCFA
      errors.push('Montant maximum dépassé');
    }

    // Validation de la méthode de paiement
    const methodesValides = ['ORANGE_MONEY', 'MTN_MONEY', 'MOOV_MONEY', 'WAVE', 'CARTE_BANCAIRE'];
    if (!methodePaiement || !methodesValides.includes(methodePaiement)) {
      errors.push('Méthode de paiement invalide');
    }

    // Validation du numéro de téléphone pour mobile money
    const mobileMoneyMethods = ['ORANGE_MONEY', 'MTN_MONEY', 'MOOV_MONEY'];
    if (mobileMoneyMethods.includes(methodePaiement)) {
      if (!numeroTelephone) {
        errors.push('Numéro de téléphone requis pour le mobile money');
      } else {
        // Validation du format (exemple pour Côte d'Ivoire)
        const phoneRegex = /^(\+225|0)?[0-9]{8,10}$/;
        if (!phoneRegex.test(numeroTelephone)) {
          errors.push('Format de numéro de téléphone invalide');
        }
      }
    }

    // Validation du code de transaction si fourni
    if (codeTransaction && codeTransaction.length < 6) {
      errors.push('Code de transaction invalide');
    }

    // Validation du type de transaction
    const typesValides = ['PAIEMENT', 'RECHARGE', 'RETRAIT', 'REMBOURSEMENT'];
    if (!typesValides.includes(typeTransaction)) {
      errors.push('Type de transaction invalide');
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Données de paiement invalides',
        errors: errors
      });
    }

    next();

  } catch (error) {
    logger.error('Erreur validation données paiement:', error);
    return next(AppError.serverError('Erreur de validation'));
  }
};

/**
 * Détecter et valider les transactions suspectes
 */
const detecterTransactionSuspecte = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const { montant, methodePaiement, numeroTelephone } = req.body;

    let scoreRisque = 0;
    const alertes = [];

    // Récupérer l'historique récent de l'utilisateur
    const maintenant = new Date();
    const il24h = new Date(maintenant.getTime() - 24 * 60 * 60 * 1000);
    const il1h = new Date(maintenant.getTime() - 60 * 60 * 1000);

    const transactionsRecentes = await Transaction.find({
      userId,
      dateCreation: { $gte: il24h }
    });

    const transactionsDerniereHeure = transactionsRecentes.filter(
      t => t.dateCreation >= il1h
    );

    // 1. Fréquence élevée de transactions
    if (transactionsDerniereHeure.length >= 5) {
      scoreRisque += 30;
      alertes.push('Fréquence de transactions élevée (5+ en 1h)');
    }

    // 2. Montants répétitifs suspects
    const montantsRecents = transactionsRecentes.map(t => t.montant);
    const montantsIdentiques = montantsRecents.filter(m => m === montant).length;
    if (montantsIdentiques >= 3) {
      scoreRisque += 25;
      alertes.push('Montants répétitifs détectés');
    }

    // 3. Changement de méthode de paiement fréquent
    const methodesRecentes = new Set(transactionsRecentes.map(t => t.methodePaiement));
    if (methodesRecentes.size > 3) {
      scoreRisque += 20;
      alertes.push('Multiples méthodes de paiement utilisées');
    }

    // 4. Montant anormalement élevé par rapport à l'historique
    if (transactionsRecentes.length > 0) {
      const montantMoyen = transactionsRecentes.reduce((sum, t) => sum + t.montant, 0) / transactionsRecentes.length;
      if (montant > montantMoyen * 5) {
        scoreRisque += 35;
        alertes.push('Montant anormalement élevé par rapport à l\'historique');
      }
    }

    // 5. Utilisateur récemment créé avec grosse transaction
    const user = await User.findById(userId).select('dateCreation documentIdentite');
    const compteAge = (maintenant - new Date(user.dateCreation)) / (1000 * 60 * 60 * 24); // en jours
    
    if (compteAge < 7 && montant > 100000) {
      scoreRisque += 40;
      alertes.push('Compte récent avec transaction importante');
    }

    // 6. Utilisateur non vérifié avec transaction importante
    if (!user.documentIdentite?.statutVerification === 'VERIFIE' && montant > 50000) {
      scoreRisque += 25;
      alertes.push('Utilisateur non vérifié avec transaction importante');
    }

    // 7. Transactions en heures inhabituelles (minuit - 6h)
    const heure = maintenant.getHours();
    if (heure >= 0 && heure < 6) {
      scoreRisque += 15;
      alertes.push('Transaction en heure inhabituelle');
    }
    // 8. Paiement en cash avec montant élevé
    if (methodePaiement === 'cash' && montant > 100000) {
      scoreRisque += 20;
      alertes.push('Transaction en cash avec montant élevé');
    }
    // 9. Numéro de téléphone suspect (exemple : hors zone CI)
    if (numeroTelephone && !numeroTelephone.startsWith('+225')) {
      scoreRisque += 10;
      alertes.push('Numéro de téléphone hors zone Côte d’Ivoire');
    }
    // Actions selon le score de risque
    if (scoreRisque >= 80) {
      // Blocage automatique - score très élevé
      logger.error('Transaction bloquée - score de risque élevé', {
        userId,
        scoreRisque,
        montant,
        alertes
      });

      return res.status(403).json({
        success: false,
        message: 'Transaction bloquée pour des raisons de sécurité',
        code: 'TRANSACTION_BLOCKED_SECURITY',
        contactSupport: true
      });

    } else if (scoreRisque >= 50) {
      // Validation manuelle requise - score modéré
      req.validationManuelleRequise = true;
      req.scoreRisque = scoreRisque;
      req.alertes = alertes;

      logger.warn('Transaction nécessitant validation manuelle', {
        userId,
        scoreRisque,
        montant,
        alertes
      });

    } else if (scoreRisque >= 25) {
      // Surveillance renforcée - score faible
      req.surveillanceRenforcee = true;
      req.scoreRisque = scoreRisque;
      req.alertes = alertes;

      logger.info('Transaction sous surveillance renforcée', {
        userId,
        scoreRisque,
        montant,
        alertes
      });
    }

    next();

  } catch (error) {
    logger.error('Erreur détection transaction suspecte:', error);
    // En cas d'erreur, laisser passer mais logger
    next();
  }
};

/**
 * Traiter les paiements nécessitant une validation manuelle
 */
const traiterValidationManuelle = async (req, res, next) => {
  try {
    if (!req.validationManuelleRequise) {
      return next();
    }

    const userId = req.user.userId;
    const { montant, methodePaiement } = req.body;

    // Créer une entrée de validation en attente
    const validationEnAttente = new Paiement({
      userId,
      montant,
      methodePaiement,
      statut: 'EN_VALIDATION_MANUELLE',
      scoreRisque: req.scoreRisque,
      alertes: req.alertes,
      dateCreation: new Date(),
      validationRequise: true
    });

    await validationEnAttente.save();

    // Notifier les administrateurs
    await envoyerNotificationAdmin({
      type: 'VALIDATION_MANUELLE_REQUISE',
      paiementId: validationEnAttente._id,
      userId,
      montant,
      scoreRisque: req.scoreRisque,
      alertes: req.alertes
    });

    logger.info('Paiement mis en attente de validation manuelle', {
      paiementId: validationEnAttente._id,
      userId,
      scoreRisque: req.scoreRisque
    });

    return res.status(202).json({
      success: true,
      message: 'Transaction en cours de validation pour des raisons de sécurité',
      code: 'MANUAL_VALIDATION_REQUIRED',
      paiementId: validationEnAttente._id,
      tempsAttente: '15-30 minutes',
      statut: 'EN_VALIDATION_MANUELLE'
    });

  } catch (error) {
    logger.error('Erreur traitement validation manuelle:', error);
    return next(AppError.serverError('Erreur de traitement'));
  }
};

/**
 * Valider la signature/hash d'une transaction
 */
const validerSignatureTransaction = (req, res, next) => {
  try {
    const { signature, ...donneesTransaction } = req.body;

    if (!signature) {
      return res.status(400).json({
        success: false,
        message: 'Signature de transaction requise'
      });
    }

    // Créer le hash des données de transaction
    const donneesString = JSON.stringify(donneesTransaction);
    const secretKey = process.env.TRANSACTION_SECRET_KEY;
    
    if (!secretKey) {
      logger.error('TRANSACTION_SECRET_KEY manquante');
      return next(AppError.serverError('Configuration de sécurité manquante'));
    }

    const hashAttendu = crypto
      .createHmac('sha256', secretKey)
      .update(donneesString)
      .digest('hex');

    if (signature !== hashAttendu) {
      logger.error('Signature de transaction invalide', {
        userId: req.user.userId,
        signatureRecue: signature,
        hashAttendu
      });

      return res.status(400).json({
        success: false,
        message: 'Signature de transaction invalide',
        code: 'INVALID_SIGNATURE'
      });
    }

    next();

  } catch (error) {
    logger.error('Erreur validation signature:', error);
    return next(AppError.serverError('Erreur de validation de signature'));
  }
};

/**
 * Vérifier le statut du compte utilisateur
 */
const verifierStatutCompte = async (req, res, next) => {
  try {
    const userId = req.user.userId;

    const user = await User.findById(userId).select('statut compteBloqueRaison dernierPaiement');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    // Vérifier si le compte est actif
    if (user.statut !== 'ACTIF') {
      return res.status(403).json({
        success: false,
        message: 'Compte inactif - paiements non autorisés',
        code: 'ACCOUNT_INACTIVE',
        statut: user.statut,
        raison: user.compteBloqueRaison
      });
    }

    // Vérifier les restrictions temporaires
    if (user.dernierPaiement?.restriction?.actif) {
      const finRestriction = new Date(user.dernierPaiement.restriction.dateFin);
      if (new Date() < finRestriction) {
        return res.status(403).json({
          success: false,
          message: 'Restrictions temporaires sur les paiements',
          code: 'TEMPORARY_PAYMENT_RESTRICTION',
          finRestriction,
          raison: user.dernierPaiement.restriction.raison
        });
      }
    }

    next();

  } catch (error) {
    logger.error('Erreur vérification statut compte:', error);
    return next(AppError.serverError('Erreur de vérification du compte'));
  }
};

/**
 * Envoyer notification aux administrateurs
 */
const envoyerNotificationAdmin = async (data) => {
  try {
    const admins = await User.find({ 
      role: { $in: ['ADMIN', 'MODERATEUR'] },
      statut: 'ACTIF'
    }).select('email nom prenom');

    const { type, paiementId, userId, montant, scoreRisque, alertes } = data;

    for (const admin of admins) {
      await sendEmail({
        to: admin.email,
        subject: `WAYZ-ECO - ${type.replace('_', ' ')}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #ff6b35;">Alerte de Sécurité - Paiement</h2>
            <p>Bonjour ${admin.prenom},</p>
            
            <div style="background-color: #fff3cd; padding: 15px; border-left: 4px solid #ff6b35; margin: 20px 0;">
              <h4>Transaction nécessitant votre attention</h4>
              <ul>
                <li><strong>ID Paiement:</strong> ${paiementId}</li>
                <li><strong>ID Utilisateur:</strong> ${userId}</li>
                <li><strong>Montant:</strong> ${montant.toLocaleString()} FCFA</li>
                <li><strong>Score de risque:</strong> ${scoreRisque}/100</li>
              </ul>
            </div>

            ${alertes?.length ? `
            <div style="background-color: #f8d7da; padding: 15px; border-left: 4px solid #dc3545; margin: 20px 0;">
              <h4>Alertes détectées:</h4>
              <ul>
                ${alertes.map(alerte => `<li>${alerte}</li>`).join('')}
              </ul>
            </div>
            ` : ''}

            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.ADMIN_URL || 'http://localhost:3000/admin'}/payments/validate/${paiementId}" 
                 style="background-color: #007bff; color: white; padding: 15px 30px; 
                        text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
                Valider la transaction
              </a>
            </div>
          </div>
        `
      });
    }

  } catch (error) {
    logger.error('Erreur envoi notification admin:', error);
  }
};

/**
 * Middleware d'logging des transactions
 */
const loggerTransaction = (action) => {
  return (req, res, next) => {
    const { montant, methodePaiement } = req.body;
    
    logger.info('Action de paiement', {
      action,
      userId: req.user?.userId,
      montant,
      methodePaiement,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      timestamp: new Date(),
      scoreRisque: req.scoreRisque,
      validationManuelle: req.validationManuelleRequise
    });

    next();
  };
};

/**
 * Nettoyer les sessions de paiement expirées
 */
const nettoyerSessionsExpirees = async (req, res, next) => {
  try {
    // Nettoyer les paiements en attente de plus de 30 minutes
    const il30min = new Date(Date.now() - 30 * 60 * 1000);
    
    await Paiement.updateMany(
      {
        statut: 'EN_ATTENTE',
        dateCreation: { $lt: il30min }
      },
      {
        statut: 'EXPIRE',
        dateExpiration: new Date()
      }
    );

    next();

  } catch (error) {
    logger.error('Erreur nettoyage sessions:', error);
    next(); // Continue malgré l'erreur
  }
};

module.exports = {
  validerLimitesPaiement,
  validerDonneesPaiement,
  detecterTransactionSuspecte,
  traiterValidationManuelle,
  validerSignatureTransaction,
  verifierStatutCompte,
  loggerTransaction,
  nettoyerSessionsExpirees,
  LIMITES_PAIEMENT
};