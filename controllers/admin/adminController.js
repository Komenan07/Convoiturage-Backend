// =====================================================
// CONTRÔLEUR ADMINISTRATEUR - Version mise à jour
// =====================================================

const Utilisateur = require('../../models/Utilisateur');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const AppError = require('../../utils/AppError');
const { logger } = require('../../utils/logger');

/**
 * Utilitaire pour générer un token JWT
 */
const genererToken = (adminId) => {
  return jwt.sign(
    { userId: adminId, role: 'admin', type: 'admin' },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE || '24h' }
  );
};

// =====================================================
// AUTHENTIFICATION
// =====================================================

/**
 * @desc    Connexion administrateur
 * @route   POST /api/admin/auth/login
 * @access  Public
 */
const connexionAdmin = async (req, res, next) => {
  try {
    // Validation des erreurs
    const erreurs = validationResult(req);
    if (!erreurs.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Données invalides',
        code: 'VALIDATION_ERROR',
        data: { erreurs: erreurs.array() }
      });
    }

    const { email, motDePasse } = req.body;

    // Rechercher l'administrateur
    const admin = await Utilisateur.findOne({ 
      email: email.toLowerCase(), 
      role: 'admin' 
    }).select('+motDePasse');
    
    if (!admin) {
      logger.warn('Tentative de connexion admin avec identifiants invalides', {
        email,
        ip: req.ip
      });
      return res.status(401).json({
        success: false,
        message: 'Identifiants incorrects',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // Vérifier si le compte est actif
    const statutAutorise = admin.peutSeConnecter();
    if (!statutAutorise.autorise) {
      logger.warn('Tentative de connexion à un compte admin non autorisé', {
        userId: admin._id,
        statut: admin.statutCompte,
        raison: statutAutorise.raison,
        ip: req.ip
      });
      return res.status(403).json({
        success: false,
        message: statutAutorise.raison,
        code: 'ACCOUNT_RESTRICTED',
        deblocageA: statutAutorise.deblocageA || null
      });
    }

    // Vérifier le mot de passe
    const motDePasseValide = await admin.verifierMotDePasse(motDePasse);
    
    if (!motDePasseValide) {
      // Incrémenter le compteur de tentatives échouées
      admin.tentativesConnexionEchouees += 1;
      
      // Si 5 tentatives échouées, bloquer temporairement le compte
      if (admin.tentativesConnexionEchouees >= 5) {
        admin.compteBloqueLe = new Date();
        logger.warn('Compte admin bloqué après 5 tentatives échouées', {
          userId: admin._id,
          email: admin.email,
          ip: req.ip
        });
      }
      
      admin.derniereTentativeConnexion = new Date();
      await admin.save();
      
      logger.warn('Échec de connexion admin - mot de passe incorrect', {
        userId: admin._id,
        email: admin.email,
        tentatives: admin.tentativesConnexionEchouees,
        ip: req.ip
      });
      
      return res.status(401).json({
        success: false,
        message: 'Identifiants incorrects',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // Réinitialiser le compteur de tentatives échouées
    admin.tentativesConnexionEchouees = 0;
    admin.compteBloqueLe = null;
    admin.derniereConnexion = new Date();
    await admin.save();

    // Générer le token
    const token = genererToken(admin._id);

    logger.info('Connexion admin réussie', {
      userId: admin._id,
      email: admin.email,
      ip: req.ip
    });

    res.status(200).json({
      success: true,
      message: 'Connexion réussie',
      data: {
        token,
        admin: {
          id: admin._id,
          email: admin.email,
          nom: admin.nom,
          prenom: admin.prenom,
          role: admin.role,
          nomComplet: `${admin.prenom} ${admin.nom}`
        }
      }
    });

  } catch (erreur) {
    logger.error('Erreur serveur lors de la connexion admin', {
      error: erreur.message,
      stack: erreur.stack
    });
    return next(new AppError('Erreur serveur lors de la connexion', 500));
  }
};

/**
 * @desc    Obtenir le profil de l'admin connecté
 * @route   GET /api/admin/auth/profil
 * @access  Private (Admin)
 */
const obtenirProfil = async (req, res, next) => {
  try {
    // Vérification simple de l'authentification
    if (!req.user || !req.user.userId) {
      return res.status(401).json({
        success: false,
        message: 'Utilisateur non authentifié',
        code: 'UNAUTHORIZED'
      });
    }

    const admin = await Utilisateur.findById(req.user.userId);

    if (!admin || admin.role !== 'admin') {
      return res.status(404).json({
        success: false,
        message: 'Administrateur introuvable',
        code: 'ADMIN_NOT_FOUND'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        id: admin._id,
        nom: admin.nom,
        prenom: admin.prenom,
        email: admin.email,
        telephone: admin.telephone,
        role: admin.role,
        photoProfil: admin.photoProfil,
        dateInscription: admin.dateInscription,
        derniereConnexion: admin.derniereConnexion,
        nomComplet: admin.nomComplet
      }
    });

  } catch (erreur) {
    logger.error('Erreur serveur lors de la récupération du profil admin', {
      error: erreur.message,
      userId: req.user?.userId
    });
    return next(new AppError('Erreur serveur lors de la récupération du profil', 500));
  }
};

// =====================================================
// GESTION DES UTILISATEURS
// =====================================================

/**
 * @desc    Obtenir la liste de tous les utilisateurs
 * @route   GET /api/admin/utilisateurs
 * @access  Private (Admin)
 */
const listerUtilisateurs = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      sort = '-dateInscription',
      role,
      email,
      telephone,
      nom,
      statutCompte,
      estVerifie,
      dateDebut,
      dateFin
    } = req.query;

    // Construire les filtres
    const filtres = {};
    
    if (role) filtres.role = role;
    if (email) filtres.email = new RegExp(email, 'i');
    if (telephone) filtres.telephone = new RegExp(telephone, 'i');
    if (nom) {
      const regex = new RegExp(nom, 'i');
      filtres.$or = [
        { nom: regex },
        { prenom: regex }
      ];
    }
    if (statutCompte) filtres.statutCompte = statutCompte;
    if (estVerifie !== undefined) filtres.estVerifie = estVerifie === 'true';
    
    if (dateDebut || dateFin) {
      filtres.dateInscription = {};
      if (dateDebut) filtres.dateInscription.$gte = new Date(dateDebut);
      if (dateFin) filtres.dateInscription.$lte = new Date(dateFin);
    }

    // Exclure les mots de passe et autres champs sensibles
    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort,
      select: '-motDePasse -tokenResetMotDePasse -expirationTokenReset -tokenConfirmationEmail -expirationTokenConfirmation -codeSMS -expirationCodeSMS',
      lean: true
    };

    // Exécuter la requête paginée
    const utilisateurs = await Utilisateur.paginate(filtres, options);

    res.status(200).json({
      success: true,
      data: utilisateurs
    });

  } catch (erreur) {
    logger.error('Erreur lors de la récupération des utilisateurs', {
      error: erreur.message,
      stack: erreur.stack
    });
    return next(new AppError('Erreur serveur lors de la récupération des utilisateurs', 500));
  }
};

/**
 * @desc    Obtenir un utilisateur par ID
 * @route   GET /api/admin/utilisateurs/:id
 * @access  Private (Admin)
 */
const obtenirUtilisateurParId = async (req, res, next) => {
  try {
    const utilisateur = await Utilisateur.findById(req.params.id)
      .select('-motDePasse -tokenResetMotDePasse -expirationTokenReset -tokenConfirmationEmail -expirationTokenConfirmation -codeSMS -expirationCodeSMS');

    if (!utilisateur) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur introuvable',
        code: 'USER_NOT_FOUND'
      });
    }

    res.status(200).json({
      success: true,
      data: utilisateur
    });

  } catch (erreur) {
    logger.error('Erreur lors de la récupération d\'un utilisateur', {
      error: erreur.message,
      userId: req.params.id
    });
    return next(new AppError('Erreur serveur lors de la récupération de l\'utilisateur', 500));
  }
};

/**
 * @desc    Modifier le statut d'un utilisateur
 * @route   PATCH /api/admin/utilisateurs/:id/statut
 * @access  Private (Admin)
 */
const modifierStatutUtilisateur = async (req, res, next) => {
  try {
    const { statutCompte, raison } = req.body;

    if (!['ACTIF', 'SUSPENDU', 'BLOQUE', 'EN_ATTENTE_VERIFICATION'].includes(statutCompte)) {
      return res.status(400).json({
        success: false,
        message: 'Statut invalide',
        code: 'INVALID_STATUS'
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

    // Enregistrer l'historique du changement de statut
    utilisateur.historiqueStatuts.push({
      ancienStatut: utilisateur.statutCompte,
      nouveauStatut: statutCompte,
      raison: raison || 'Action administrative',
      administrateurId: req.user.userId
    });

    // Mettre à jour le statut
    utilisateur.statutCompte = statutCompte;
    await utilisateur.save();

    logger.info('Statut utilisateur modifié', {
      userId: utilisateur._id,
      ancienStatut: utilisateur.historiqueStatuts[utilisateur.historiqueStatuts.length - 1].ancienStatut,
      nouveauStatut: statutCompte,
      adminId: req.user.userId,
      raison
    });

    res.status(200).json({
      success: true,
      message: `Statut de l'utilisateur modifié en ${statutCompte}`,
      data: {
        id: utilisateur._id,
        statutCompte: utilisateur.statutCompte,
        historiqueStatuts: utilisateur.historiqueStatuts
      }
    });

  } catch (erreur) {
    logger.error('Erreur lors de la modification du statut d\'un utilisateur', {
      error: erreur.message,
      userId: req.params.id
    });
    return next(new AppError('Erreur serveur lors de la modification du statut', 500));
  }
};

/**
 * @desc    Vérifier les documents d'identité d'un utilisateur
 * @route   PATCH /api/admin/utilisateurs/:id/verification-document
 * @access  Private (Admin)
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

/**
 * @desc    Opérations financières sur le compte covoiturage
 * @route   POST /api/admin/utilisateurs/:id/operation-financiere
 * @access  Private (Admin)
 */
const operationFinanciere = async (req, res, next) => {
  try {
    const { operation, montant, raison, referenceTransaction } = req.body;

    if (!['crediter', 'debiter', 'rembourser_commission', 'ajuster_solde'].includes(operation)) {
      return res.status(400).json({
        success: false,
        message: 'Type d\'opération invalide',
        code: 'INVALID_OPERATION'
      });
    }

    if (!montant || isNaN(montant) || montant <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Montant invalide',
        code: 'INVALID_AMOUNT'
      });
    }

    if (!raison) {
      return res.status(400).json({
        success: false,
        message: 'Raison requise pour l\'opération financière',
        code: 'REASON_REQUIRED'
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

    // Vérifier si le compte covoiturage est configuré
    if (!utilisateur.compteCovoiturage) {
      return res.status(400).json({
        success: false,
        message: 'Compte covoiturage non configuré',
        code: 'NO_CARPOOLING_ACCOUNT'
      });
    }

    let message = '';

    // Exécuter l'opération demandée
    switch (operation) {
      case 'crediter':
        // Créditer le solde
        utilisateur.compteCovoiturage.solde += montant;
        message = `Compte crédité de ${montant} FCFA`;
        
        // Ajouter à l'historique des recharges
        utilisateur.compteCovoiturage.historiqueRecharges.push({
          montant,
          date: new Date(),
          methodePaiement: 'admin',
          referenceTransaction: referenceTransaction || `ADMIN-${Date.now()}`,
          statut: 'reussi',
          fraisTransaction: 0
        });
        
        // Marquer le compte comme rechargé
        utilisateur.compteCovoiturage.estRecharge = true;
        break;
        
      case 'debiter':
        // Vérifier le solde disponible
        if (utilisateur.compteCovoiturage.solde < montant) {
          return res.status(400).json({
            success: false,
            message: 'Solde insuffisant',
            code: 'INSUFFICIENT_BALANCE'
          });
        }
        
        // Débiter le solde
        utilisateur.compteCovoiturage.solde -= montant;
        message = `Compte débité de ${montant} FCFA`;
        break;
        
      case 'rembourser_commission':
        // Rembourser une commission prélevée
        utilisateur.compteCovoiturage.solde += montant;
        utilisateur.compteCovoiturage.totalCommissionsPayees -= montant;
        message = `Commission remboursée: ${montant} FCFA`;
        
        // Ajouter à l'historique des commissions
        utilisateur.compteCovoiturage.historiqueCommissions.push({
          montant,
          date: new Date(),
          typePrelevement: 'remboursement_admin',
          statut: 'rembourse'
        });
        break;
        
      case 'ajuster_solde': {
        // Ajuster directement le solde (remplacement)
        const ancienSolde = utilisateur.compteCovoiturage.solde;
        utilisateur.compteCovoiturage.solde = montant;
        message = `Solde ajusté de ${ancienSolde} à ${montant} FCFA`;
        break;
  }
    }

    await utilisateur.save();

    logger.info('Opération financière effectuée', {
      userId: utilisateur._id,
      operation,
      montant,
      adminId: req.user.userId,
      raison,
      nouveauSolde: utilisateur.compteCovoiturage.solde
    });

    res.status(200).json({
      success: true,
      message,
      data: {
        id: utilisateur._id,
        operation,
        montant,
        soldeActuel: utilisateur.compteCovoiturage.solde,
        historiqueRecharges: utilisateur.compteCovoiturage.historiqueRecharges.slice(-5),
        historiqueCommissions: utilisateur.compteCovoiturage.historiqueCommissions.slice(-5)
      }
    });

  } catch (erreur) {
    logger.error('Erreur lors de l\'opération financière', {
      error: erreur.message,
      userId: req.params.id
    });
    return next(new AppError('Erreur serveur lors de l\'opération financière', 500));
  }
};

// =====================================================
// TABLEAU DE BORD ET STATISTIQUES
// =====================================================

/**
 * @desc    Obtenir les statistiques globales
 * @route   GET /api/admin/dashboard
 * @access  Private (Admin)
 */
const obtenirDashboard = async (req, res, next) => {
  try {
    // Statistiques générales des utilisateurs
    const statsUtilisateurs = await Utilisateur.statistiquesGlobales();

    // Statistiques des comptes de covoiturage
    const statsCompteCovoiturage = await Utilisateur.statistiquesComptesCovoiturage();

    // Utilisateurs récemment inscrits
    const nouveauxUtilisateurs = await Utilisateur.find()
      .sort({ dateInscription: -1 })
      .limit(10)
      .select('nom prenom email role dateInscription estVerifie');

    // Conducteurs avec solde élevé
    const conducteursSoldeEleve = await Utilisateur.obtenirConducteursSoldeEleve(50000);

    // Utilisateurs par statut
    const utilisateursParStatut = await Utilisateur.aggregate([
      {
        $group: {
          _id: "$statutCompte",
          count: { $sum: 1 }
        }
      }
    ]);

    // Utilisateurs par rôle
    const utilisateursParRole = await Utilisateur.aggregate([
      {
        $group: {
          _id: "$role",
          count: { $sum: 1 }
        }
      }
    ]);

    res.status(200).json({
      success: true,
      data: {
        statistiquesUtilisateurs: statsUtilisateurs,
        statistiquesCompteCovoiturage: statsCompteCovoiturage[0] || {},
        nouveauxUtilisateurs,
        conducteursSoldeEleve,
        utilisateursParStatut,
        utilisateursParRole
      }
    });

  } catch (erreur) {
    logger.error('Erreur lors de la récupération du dashboard', {
      error: erreur.message,
      stack: erreur.stack
    });
    return next(new AppError('Erreur serveur lors de la récupération du dashboard', 500));
  }
};

/**
 * @desc    Obtenir les rapports avancés
 * @route   GET /api/admin/rapports
 * @access  Private (Admin)
 */
const obtenirRapports = async (req, res, next) => {
  try {
    const { type, dateDebut, dateFin } = req.query;

    if (!type) {
      return res.status(400).json({
        success: false,
        message: 'Type de rapport requis',
        code: 'REPORT_TYPE_REQUIRED'
      });
    }

    let rapport = {};
    let periode = {};

    // Configurer la période
    if (dateDebut) periode.debut = new Date(dateDebut);
    if (dateFin) periode.fin = new Date(dateFin);

    // Générer le rapport selon le type demandé
    switch (type) {
      case 'inscriptions':
        rapport = await genererRapportInscriptions(periode);
        break;
      case 'financier':
        rapport = await genererRapportFinancier(periode);
        break;
      case 'verification':
        rapport = await genererRapportVerification(periode);
        break;
      default:
        return res.status(400).json({
          success: false,
          message: 'Type de rapport invalide',
          code: 'INVALID_REPORT_TYPE'
        });
    }

    res.status(200).json({
      success: true,
      data: {
        type,
        periode: {
          debut: periode.debut || 'Toutes dates',
          fin: periode.fin || 'Aujourd\'hui'
        },
        rapport
      }
    });

  } catch (erreur) {
    logger.error('Erreur lors de la génération du rapport', {
      error: erreur.message,
      type: req.query.type
    });
    return next(new AppError('Erreur serveur lors de la génération du rapport', 500));
  }
};

// Fonctions utilitaires pour les rapports

async function genererRapportInscriptions(periode = {}) {
  const filtres = {};
  
  if (periode.debut || periode.fin) {
    filtres.dateInscription = {};
    if (periode.debut) filtres.dateInscription.$gte = periode.debut;
    if (periode.fin) filtres.dateInscription.$lte = periode.fin;
  }

  // Inscriptions par jour
  const inscriptionsParJour = await Utilisateur.aggregate([
    { $match: filtres },
    {
      $group: {
        _id: {
          year: { $year: "$dateInscription" },
          month: { $month: "$dateInscription" },
          day: { $dayOfMonth: "$dateInscription" }
        },
        count: { $sum: 1 }
      }
    },
    { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } }
  ]);

  // Inscriptions par rôle
  const inscriptionsParRole = await Utilisateur.aggregate([
    { $match: filtres },
    {
      $group: {
        _id: "$role",
        count: { $sum: 1 }
      }
    }
  ]);

  // Taux de vérification
  const tauxVerification = await Utilisateur.aggregate([
    { $match: filtres },
    {
      $group: {
        _id: "$estVerifie",
        count: { $sum: 1 }
      }
    }
  ]);

  return {
    inscriptionsParJour,
    inscriptionsParRole,
    tauxVerification
  };
}

async function genererRapportFinancier(periode = {}) {
  const filtres = {};
  
  if (periode.debut || periode.fin) {
    filtres['compteCovoiturage.historiqueRecharges.date'] = {};
    if (periode.debut) filtres['compteCovoiturage.historiqueRecharges.date'].$gte = periode.debut;
    if (periode.fin) filtres['compteCovoiturage.historiqueRecharges.date'].$lte = periode.fin;
  }

  // Recharges par jour
  const rechargesParJour = await Utilisateur.aggregate([
    { $unwind: "$compteCovoiturage.historiqueRecharges" },
    {
      $match: {
        'compteCovoiturage.historiqueRecharges.statut': 'reussi',
        ...filtres
      }
    },
    {
      $group: {
        _id: {
          year: { $year: "$compteCovoiturage.historiqueRecharges.date" },
          month: { $month: "$compteCovoiturage.historiqueRecharges.date" },
          day: { $dayOfMonth: "$compteCovoiturage.historiqueRecharges.date" }
        },
        montantTotal: { $sum: "$compteCovoiturage.historiqueRecharges.montant" },
        count: { $sum: 1 }
      }
    },
    { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } }
  ]);

  // Recharges par méthode de paiement
  const rechargesParMethode = await Utilisateur.aggregate([
    { $unwind: "$compteCovoiturage.historiqueRecharges" },
    {
      $match: {
        'compteCovoiturage.historiqueRecharges.statut': 'reussi',
        ...filtres
      }
    },
    {
      $group: {
        _id: "$compteCovoiturage.historiqueRecharges.methodePaiement",
        montantTotal: { $sum: "$compteCovoiturage.historiqueRecharges.montant" },
        count: { $sum: 1 }
      }
    }
  ]);

  // Commissions prélevées
  const commissionsPrelevees = await Utilisateur.aggregate([
    { $unwind: "$compteCovoiturage.historiqueCommissions" },
    {
      $match: {
        'compteCovoiturage.historiqueCommissions.statut': 'preleve',
        ...filtres
      }
    },
    {
      $group: {
        _id: {
          year: { $year: "$compteCovoiturage.historiqueCommissions.date" },
          month: { $month: "$compteCovoiturage.historiqueCommissions.date" },
          day: { $dayOfMonth: "$compteCovoiturage.historiqueCommissions.date" }
        },
        montantTotal: { $sum: "$compteCovoiturage.historiqueCommissions.montant" },
        count: { $sum: 1 }
      }
    },
    { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } }
  ]);

  return {
    rechargesParJour,
    rechargesParMethode,
    commissionsPrelevees
  };
}

async function genererRapportVerification(periode = {}) {
  const filtres = {};
  
  if (periode.debut || periode.fin) {
    filtres['documentIdentite.dateVerification'] = {};
    if (periode.debut) filtres['documentIdentite.dateVerification'].$gte = periode.debut;
    if (periode.fin) filtres['documentIdentite.dateVerification'].$lte = periode.fin;
  }

  // Vérifications par jour
  const verificationsParJour = await Utilisateur.aggregate([
    { 
      $match: { 
        'documentIdentite.dateVerification': { $exists: true, $ne: null },
        ...filtres
      } 
    },
    {
      $group: {
        _id: {
            year: { $year: "$documentIdentite.dateVerification" },
          month: { $month: "$documentIdentite.dateVerification" },
          day: { $dayOfMonth: "$documentIdentite.dateVerification" }
        },
        count: { $sum: 1 }
      }
    },
    { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } }
  ]);

  // Vérifications par statut
  const verificationsParStatut = await Utilisateur.aggregate([
    { 
      $match: { 
        'documentIdentite.dateVerification': { $exists: true, $ne: null },
        ...filtres
      } 
    },
    {
      $group: {
        _id: "$documentIdentite.statutVerification",
        count: { $sum: 1 }
      }
    }
  ]);

  // Vérifications par type de document
  const verificationsParTypeDocument = await Utilisateur.aggregate([
    { 
      $match: { 
        'documentIdentite.dateVerification': { $exists: true, $ne: null },
        ...filtres
      } 
    },
    {
      $group: {
        _id: "$documentIdentite.type",
        count: { $sum: 1 }
      }
    }
  ]);

  return {
    verificationsParJour,
    verificationsParStatut,
    verificationsParTypeDocument
  };
}

/**
 * @desc    Créer un administrateur
 * @route   POST /api/admin/utilisateurs/creer-admin
 * @access  Private (Admin)
 */
const creerAdmin = async (req, res, next) => {
  try {
    // Validation des erreurs
    const erreurs = validationResult(req);
    if (!erreurs.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Données invalides',
        code: 'VALIDATION_ERROR',
        data: { erreurs: erreurs.array() }
      });
    }

    const { email, motDePasse, nom, prenom, telephone } = req.body;

    // Vérifier si l'email existe déjà
    const emailExiste = await Utilisateur.findOne({ email: email.toLowerCase() });
    if (emailExiste) {
      return res.status(400).json({
        success: false,
        message: 'Cet email est déjà utilisé',
        code: 'EMAIL_EXISTS'
      });
    }

    // Vérifier si le téléphone existe déjà
    const telephoneExiste = await Utilisateur.findOne({ telephone });
    if (telephoneExiste) {
      return res.status(400).json({
        success: false,
        message: 'Ce numéro de téléphone est déjà utilisé',
        code: 'PHONE_EXISTS'
      });
    }

    // Créer le nouvel administrateur
    const nouvelAdmin = new Utilisateur({
      email: email.toLowerCase(),
      motDePasse,
      nom,
      prenom,
      telephone,
      role: 'admin',
      statutCompte: 'ACTIF',
      estVerifie: true,
      adresse: {
        ville: 'Abidjan'
      }
    });

    // Enregistrer le nouvel administrateur
    await nouvelAdmin.save();

    logger.info('Nouvel administrateur créé', {
      adminId: nouvelAdmin._id,
      createurId: req.user.userId
    });

    res.status(201).json({
      success: true,
      message: 'Administrateur créé avec succès',
      data: {
        id: nouvelAdmin._id,
        email: nouvelAdmin.email,
        nom: nouvelAdmin.nom,
        prenom: nouvelAdmin.prenom,
        role: nouvelAdmin.role
      }
    });

  } catch (erreur) {
    logger.error('Erreur lors de la création d\'un administrateur', {
      error: erreur.message,
      stack: erreur.stack
    });
    return next(new AppError('Erreur serveur lors de la création de l\'administrateur', 500));
  }
};

/**
 * @desc    Supprimer un utilisateur (soft delete)
 * @route   DELETE /api/admin/utilisateurs/:id
 * @access  Private (Admin)
 */
const supprimerUtilisateur = async (req, res, next) => {
  try {
    const utilisateur = await Utilisateur.findById(req.params.id);

    if (!utilisateur) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur introuvable',
        code: 'USER_NOT_FOUND'
      });
    }

    // Vérifier qu'un admin ne peut pas se supprimer lui-même
    if (utilisateur._id.toString() === req.user.userId && utilisateur.role === 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Vous ne pouvez pas supprimer votre propre compte administrateur',
        code: 'CANNOT_DELETE_SELF'
      });
    }

    // Soft delete - changer le statut et désactiver le compte
    utilisateur.statutCompte = 'BLOQUE';
    utilisateur.historiqueStatuts.push({
      ancienStatut: utilisateur.statutCompte,
      nouveauStatut: 'BLOQUE',
      raison: 'Suppression par administrateur',
      administrateurId: req.user.userId,
      dateModification: new Date()
    });

    await utilisateur.save();

    logger.info('Utilisateur supprimé (soft delete)', {
      userId: utilisateur._id,
      adminId: req.user.userId
    });

    res.status(200).json({
      success: true,
      message: 'Utilisateur supprimé avec succès'
    });

  } catch (erreur) {
    logger.error('Erreur lors de la suppression d\'un utilisateur', {
      error: erreur.message,
      userId: req.params.id
    });
    return next(new AppError('Erreur serveur lors de la suppression de l\'utilisateur', 500));
  }
};

module.exports = {
  // Authentification
  connexionAdmin,
  obtenirProfil,
  
  // Gestion des utilisateurs
  listerUtilisateurs,
  obtenirUtilisateurParId,
  modifierStatutUtilisateur,
  verifierDocumentIdentite,
  operationFinanciere,
  creerAdmin,
  supprimerUtilisateur,
  
  // Tableau de bord et statistiques
  obtenirDashboard,
  obtenirRapports
};