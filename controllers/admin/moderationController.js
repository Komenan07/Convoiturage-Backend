// =====================================================
// CONTRÔLEUR MODÉRATEUR
// =====================================================

const Utilisateur = require('../../models/Utilisateur');
const Trajet = require('../../models/Trajet');
const Signalement = require('../../models/Signalement');
const AppError = require('../../utils/AppError');
const { logger } = require('../../utils/logger');

// =====================================================
// GESTION DES SIGNALEMENTS
// =====================================================

/**
 * @desc    Obtenir tous les signalements
 * @route   GET /api/moderateur/signalements
 * @access  Private (Modérateur)
 */
const obtenirSignalements = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      statut,
      type,
      dateDebut,
      dateFin,
      sort = '-dateCreation'
    } = req.query;

    // Construire les filtres
    const filtres = {};
    
    if (statut) filtres.statut = statut;
    if (type) filtres.type = type;
    
    if (dateDebut || dateFin) {
      filtres.dateCreation = {};
      if (dateDebut) filtres.dateCreation.$gte = new Date(dateDebut);
      if (dateFin) filtres.dateCreation.$lte = new Date(dateFin);
    }

    // Exécuter la requête paginée
    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort,
      populate: [
        { path: 'signalePar', select: 'nom prenom email telephone' },
        { path: 'utilisateurSignale', select: 'nom prenom email telephone role' },
        { path: 'trajetId', select: 'depart destination dateDepart' }
      ],
      lean: true
    };

    const signalements = await Signalement.paginate(filtres, options);

    res.status(200).json({
      success: true,
      data: signalements
    });

  } catch (erreur) {
    logger.error('Erreur lors de la récupération des signalements', {
      error: erreur.message,
      stack: erreur.stack
    });
    return next(new AppError('Erreur serveur lors de la récupération des signalements', 500));
  }
};

/**
 * @desc    Obtenir un signalement par ID
 * @route   GET /api/moderateur/signalements/:id
 * @access  Private (Modérateur)
 */
const obtenirSignalementParId = async (req, res, next) => {
  try {
    const signalement = await Signalement.findById(req.params.id)
      .populate('signalePar', 'nom prenom email telephone')
      .populate('utilisateurSignale', 'nom prenom email telephone role statutCompte')
      .populate('trajetId', 'depart destination dateDepart statut')
      .populate('moderateurId', 'nom prenom email');

    if (!signalement) {
      return res.status(404).json({
        success: false,
        message: 'Signalement introuvable',
        code: 'REPORT_NOT_FOUND'
      });
    }

    res.status(200).json({
      success: true,
      data: signalement
    });

  } catch (erreur) {
    logger.error('Erreur lors de la récupération du signalement', {
      error: erreur.message,
      id: req.params.id
    });
    return next(new AppError('Erreur serveur lors de la récupération du signalement', 500));
  }
};

/**
 * @desc    Traiter un signalement
 * @route   PATCH /api/moderateur/signalements/:id/traiter
 * @access  Private (Modérateur)
 */
const traiterSignalement = async (req, res, next) => {
  try {
    const { decision, commentaire, actionUtilisateur } = req.body;
    
    if (!['ACCEPTE', 'REJETE', 'EN_ATTENTE'].includes(decision)) {
      return res.status(400).json({
        success: false,
        message: 'Décision invalide',
        code: 'INVALID_DECISION'
      });
    }

    const signalement = await Signalement.findById(req.params.id);
    
    if (!signalement) {
      return res.status(404).json({
        success: false,
        message: 'Signalement introuvable',
        code: 'REPORT_NOT_FOUND'
      });
    }

    // Mettre à jour le signalement
    signalement.statut = decision;
    signalement.commentaireModerateurTraitant = commentaire || '';
    signalement.dateDernierChangementStatut = new Date();
    signalement.moderateurId = req.user.userId;

    await signalement.save();

    // Si une action est requise sur l'utilisateur signalé
    if (actionUtilisateur && signalement.utilisateurSignale) {
      const utilisateur = await Utilisateur.findById(signalement.utilisateurSignale);
      
      if (utilisateur) {
        if (actionUtilisateur === 'AVERTISSEMENT') {
          // Ajouter un avertissement à l'utilisateur
          if (!utilisateur.avertissements) utilisateur.avertissements = [];
          
          utilisateur.avertissements.push({
            date: new Date(),
            raison: `Signalement #${signalement._id}: ${signalement.motif}`,
            moderateurId: req.user.userId,
            signalementId: signalement._id
          });
          
          // Mettre à jour le score de confiance
          utilisateur.scoreConfiance = Math.max(0, utilisateur.scoreConfiance - 5);
          
        } else if (actionUtilisateur === 'SUSPENSION') {
          // Suspendre l'utilisateur
          utilisateur.statutCompte = 'SUSPENDU';
          
          // Ajouter à l'historique des statuts
          utilisateur.historiqueStatuts.push({
            ancienStatut: utilisateur.statutCompte,
            nouveauStatut: 'SUSPENDU',
            raison: `Signalement #${signalement._id}: ${signalement.motif}`,
            administrateurId: req.user.userId,
            dateModification: new Date()
          });
          
          // Mettre à jour le score de confiance
          utilisateur.scoreConfiance = Math.max(0, utilisateur.scoreConfiance - 15);
          
        } else if (actionUtilisateur === 'BLOCAGE') {
          // Bloquer l'utilisateur
          utilisateur.statutCompte = 'BLOQUE';
          
          // Ajouter à l'historique des statuts
          utilisateur.historiqueStatuts.push({
            ancienStatut: utilisateur.statutCompte,
            nouveauStatut: 'BLOQUE',
            raison: `Signalement #${signalement._id}: ${signalement.motif}`,
            administrateurId: req.user.userId,
            dateModification: new Date()
          });
          
          // Mettre à jour le score de confiance
          utilisateur.scoreConfiance = 0;
        }
        
        await utilisateur.save();
        
        // Mettre à jour le signalement avec l'action effectuée
        signalement.actionSurUtilisateur = actionUtilisateur;
        await signalement.save();
      }
    }

    logger.info('Signalement traité', {
      signalementId: signalement._id,
      decision,
      moderateurId: req.user.userId,
      actionUtilisateur: actionUtilisateur || 'AUCUNE'
    });

    res.status(200).json({
      success: true,
      message: `Signalement ${decision.toLowerCase()}`,
      data: { signalement }
    });

  } catch (erreur) {
    logger.error('Erreur lors du traitement du signalement', {
      error: erreur.message,
      id: req.params.id
    });
    return next(new AppError('Erreur serveur lors du traitement du signalement', 500));
  }
};

// =====================================================
// MODÉRATION DE CONTENU
// =====================================================

/**
 * @desc    Obtenir les utilisateurs à modérer
 * @route   GET /api/moderateur/utilisateurs-a-moderer
 * @access  Private (Modérateur)
 */
const obtenirUtilisateursAModerer = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      type = 'NOUVEAUX',
      sort = '-dateInscription'
    } = req.query;

    let filtres = {};
    
    switch (type) {
      case 'NOUVEAUX':
        // Nouveaux utilisateurs inscrits dans les 7 derniers jours
        filtres = {
          dateInscription: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
        };
        break;
      
      case 'NON_VERIFIES':
        // Utilisateurs avec documents soumis mais non vérifiés
        filtres = {
          'documentIdentite.statutVerification': 'EN_ATTENTE',
          'documentIdentite.type': { $exists: true },
          'documentIdentite.numero': { $exists: true }
        };
        break;
      
      case 'CONDUCTEURS':
        // Conducteurs avec potentiels problèmes
        filtres = {
          role: { $in: ['conducteur', 'les_deux'] },
          $or: [
            { scoreConfiance: { $lt: 30 } },
            { nombreTrajetsAnnules: { $gt: 3 } }
          ]
        };
        break;
      
      case 'SIGNALEMENTS': {
        // Utilisateurs avec signalements récents
        const utilisateursSignales = await Signalement.distinct('utilisateurSignale', {
          dateCreation: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
        });

        filtres = {
          _id: { $in: utilisateursSignales }
        };
        break;
      }
    }

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort,
      select: 'nom prenom email telephone role statutCompte dateInscription scoreConfiance nombreTrajetsEffectues nombreTrajetsAnnules documentIdentite',
      lean: true
    };

    const utilisateurs = await Utilisateur.paginate(filtres, options);

    res.status(200).json({
      success: true,
      data: utilisateurs
    });

  } catch (erreur) {
    logger.error('Erreur lors de la récupération des utilisateurs à modérer', {
      error: erreur.message,
      stack: erreur.stack
    });
    return next(new AppError('Erreur serveur lors de la récupération des utilisateurs', 500));
  }
};

/**
 * @desc    Obtenir les trajets à modérer
 * @route   GET /api/moderateur/trajets-a-moderer
 * @access  Private (Modérateur)
 */
const obtenirTrajetsAModerer = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      type = 'SIGNALES',
      sort = '-dateCreation'
    } = req.query;

    let filtres = {};
    
    switch (type) {
      case 'SIGNALES': {
        // Trajets signalés
        const trajetsSignales = await Signalement.distinct('trajetId', {
          type: 'TRAJET',
          dateCreation: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } // derniers 30 jours
        });
        
        filtres = {
          _id: { $in: trajetsSignales }
        };
        break;
      }
      
      case 'PRIX_ANORMAUX': {
        // Trajets avec prix potentiellement anormaux (trop bas ou trop élevés)
        filtres = {
          $or: [
            { prix: { $lt: 500 } },  // Prix trop bas (moins de 500 FCFA)
            { prix: { $gt: 20000 } } // Prix trop élevé (plus de 20000 FCFA)
          ]
        };
        break;
      }
      
      case 'NOUVEAUX':
        // Nouveaux trajets créés dans les dernières 24h
        filtres = {
          dateCreation: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        };
        break;
    }

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort,
      populate: { path: 'conducteurId', select: 'nom prenom email telephone role' },
      lean: true
    };

    const trajets = await Trajet.paginate(filtres, options);

    res.status(200).json({
      success: true,
      data: trajets
    });

  } catch (erreur) {
    logger.error('Erreur lors de la récupération des trajets à modérer', {
      error: erreur.message,
      stack: erreur.stack
    });
    return next(new AppError('Erreur serveur lors de la récupération des trajets', 500));
  }
};

/**
 * @desc    Modérer un trajet
 * @route   PATCH /api/moderateur/trajets/:id/moderer
 * @access  Private (Modérateur)
 */
const modererTrajet = async (req, res, next) => {
  try {
    const { action, raison } = req.body;
    
    if (!['APPROUVER', 'REJETER', 'SUSPENDRE'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'Action invalide',
        code: 'INVALID_ACTION'
      });
    }

    if (action !== 'APPROUVER' && !raison) {
      return res.status(400).json({
        success: false,
        message: 'Raison requise pour cette action',
        code: 'REASON_REQUIRED'
      });
    }

    const trajet = await Trajet.findById(req.params.id);
    
    if (!trajet) {
      return res.status(404).json({
        success: false,
        message: 'Trajet introuvable',
        code: 'TRIP_NOT_FOUND'
      });
    }

    // Appliquer l'action de modération
    switch (action) {
      case 'APPROUVER': {
        trajet.estValideParModerateur = true;
        trajet.dateModeration = new Date();
        trajet.moderateurId = req.user.userId;
        break;
      }
      
      case 'REJETER': {
        trajet.estValideParModerateur = false;
        trajet.statut = 'ANNULE';
        trajet.dateModeration = new Date();
        trajet.moderateurId = req.user.userId;
        trajet.raisonRejet = raison;
        
        // Mettre à jour les statistiques du conducteur
        const conducteur = await Utilisateur.findById(trajet.conducteurId);
        if (conducteur) {
          conducteur.nombreTrajetsAnnules += 1;
          await conducteur.save();
        }
        break;
      }
      
      case 'SUSPENDRE': {
        trajet.estValideParModerateur = false;
        trajet.statut = 'SUSPENDU';
        trajet.dateModeration = new Date();
        trajet.moderateurId = req.user.userId;
        trajet.raisonSuspension = raison;
        break;
      }
    }

    await trajet.save();

    logger.info('Trajet modéré', {
      trajetId: trajet._id,
      action,
      moderateurId: req.user.userId,
      raison: raison || null
    });

    res.status(200).json({
      success: true,
      message: `Trajet ${action === 'APPROUVER' ? 'approuvé' : action === 'REJETER' ? 'rejeté' : 'suspendu'}`,
      data: { trajet }
    });

  } catch (erreur) {
    logger.error('Erreur lors de la modération du trajet', {
      error: erreur.message,
      id: req.params.id
    });
    return next(new AppError('Erreur serveur lors de la modération du trajet', 500));
  }
};

/**
 * @desc    Vérifier un document d'identité
 * @route   PATCH /api/moderateur/utilisateurs/:id/verifier-document
 * @access  Private (Modérateur)
 */
const verifierDocumentIdentite = async (req, res, next) => {
  try {
    const { statutVerification, raisonRejet } = req.body;

    if (!['VERIFIE', 'REJETE', 'EN_ATTENTE'].includes(statutVerification)) {
      return res.status(400).json({
        success: false,
        message: 'Statut de vérification invalide',
        code: 'INVALID_VERIFICATION_STATUS'
      });
    }

    const utilisateur = await Utilisateur.findById(req.params.id);

    if (!utilisateur) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur introuvable',
        code: 'USER_NOT_FOUND'
      });
    }

    if (!utilisateur.documentIdentite || !utilisateur.documentIdentite.type) {
      return res.status(400).json({
        success: false,
        message: 'Aucun document d\'identité à vérifier',
        code: 'NO_DOCUMENT'
      });
    }

    // Mettre à jour le statut de vérification du document
    utilisateur.documentIdentite.statutVerification = statutVerification;
    utilisateur.documentIdentite.dateVerification = new Date();
    utilisateur.documentIdentite.verificateurId = req.user.userId;

    if (statutVerification === 'REJETE') {
      if (!raisonRejet) {
        return res.status(400).json({
          success: false,
          message: 'Raison de rejet requise',
          code: 'REJECTION_REASON_REQUIRED'
        });
      }
      utilisateur.documentIdentite.raisonRejet = raisonRejet;
    } else {
      utilisateur.documentIdentite.raisonRejet = null;
    }

    await utilisateur.save();

    logger.info('Document d\'identité vérifié', {
      userId: utilisateur._id,
      statutVerification,
      verificateurId: req.user.userId,
      raisonRejet: raisonRejet || null
    });

    res.status(200).json({
      success: true,
      message: `Document d'identité ${statutVerification.toLowerCase()}`,
      data: {
        id: utilisateur._id,
        documentIdentite: utilisateur.documentIdentite,
        estVerifie: utilisateur.estVerifie
      }
    });

  } catch (erreur) {
    logger.error('Erreur lors de la vérification du document d\'identité', {
      error: erreur.message,
      userId: req.params.id
    });
    return next(new AppError('Erreur serveur lors de la vérification du document', 500));
  }
};

// =====================================================
// TABLEAU DE BORD MODÉRATEUR
// =====================================================

/**
 * @desc    Obtenir le tableau de bord du modérateur
 * @route   GET /api/moderateur/dashboard
 * @access  Private (Modérateur)
 */
const obtenirDashboard = async (req, res, next) => {
  try {
    // Signalements en attente
    const signalementsPendants = await Signalement.countDocuments({ statut: 'EN_ATTENTE' });
    
    // Documents à vérifier
    const documentsAVerifier = await Utilisateur.countDocuments({
      'documentIdentite.statutVerification': 'EN_ATTENTE',
      'documentIdentite.type': { $exists: true }
    });
    
    // Signalements récents (7 derniers jours)
    const dateRecente = new Date();
    dateRecente.setDate(dateRecente.getDate() - 7);
    
    const signalementsRecents = await Signalement.countDocuments({ 
      dateCreation: { $gte: dateRecente } 
    });
    
    // Statistiques des signalements
    const statsSignalements = await Signalement.aggregate([
      {
        $group: {
          _id: '$statut',
          count: { $sum: 1 }
        }
      }
    ]);
    
    // Statistiques des documents vérifiés
    const statsDocuments = await Utilisateur.aggregate([
      {
        $match: {
          'documentIdentite.statutVerification': { $exists: true }
        }
      },
      {
        $group: {
          _id: '$documentIdentite.statutVerification',
          count: { $sum: 1 }
        }
      }
    ]);
    
    // Signalements récents
    const signalementsRecentsList = await Signalement.find()
      .sort({ dateCreation: -1 })
      .limit(5)
      .populate('signalePar', 'nom prenom')
      .populate('utilisateurSignale', 'nom prenom')
      .select('type motif statut dateCreation');
    
    // Documents récemment soumis
    const documentsRecents = await Utilisateur.find({
      'documentIdentite.type': { $exists: true },
      'documentIdentite.statutVerification': 'EN_ATTENTE'
    })
    .sort({ 'dateInscription': -1 })
    .limit(5)
    .select('nom prenom email telephone documentIdentite.type documentIdentite.dateAjout');

    res.status(200).json({
      success: true,
      data: {
        signalementsPendants,
        documentsAVerifier,
        signalementsRecents,
        statsSignalements,
        statsDocuments,
        signalementsRecentsList,
        documentsRecents
      }
    });

  } catch (erreur) {
    logger.error('Erreur lors de la récupération du dashboard modérateur', {
      error: erreur.message,
      stack: erreur.stack
    });
    return next(new AppError('Erreur serveur lors de la récupération du dashboard', 500));
  }
};

module.exports = {
  // Gestion des signalements
  obtenirSignalements,
  obtenirSignalementParId,
  traiterSignalement,
  
  // Modération de contenu
  obtenirUtilisateursAModerer,
  obtenirTrajetsAModerer,
  modererTrajet,
  verifierDocumentIdentite,
  
  // Tableau de bord
  obtenirDashboard
};