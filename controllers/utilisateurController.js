const Utilisateur = require('../models/Utilisateur');
const bcrypt = require('bcryptjs');
const validator = require('validator');
const AppError = require('../utils/AppError');
const { logger } = require('../utils/logger');

// =============== CREATE ===============
const creerUtilisateur = async (req, res, next) => {
  try {
    const {
      email,
      telephone,
      motDePasse,
      nom,
      prenom,
      dateNaissance,
      sexe,
      adresse,
      preferences,
      contactsUrgence
    } = req.body;

    // Validation des champs requis
    if (!nom || !prenom || !email || !motDePasse) {
      return res.status(400).json({ 
        success: false, 
        message: 'Les champs nom, prénom, email et mot de passe sont requis' 
      });
    }

    if (!validator.isEmail(email || '')) {
      return res.status(400).json({ success: false, message: 'Email invalide' });
    }
    
    if (telephone && !validator.isMobilePhone(telephone || '', 'any', { strictMode: false })) {
      return res.status(400).json({ success: false, message: 'Numéro de téléphone invalide' });
    }

    const utilisateurExistant = await Utilisateur.findOne({ 
      $or: [
        { email }, 
        ...(telephone ? [{ telephone }] : [])
      ] 
    });
    
    if (utilisateurExistant) {
      return res.status(409).json({ 
        success: false, 
        message: 'Un utilisateur avec cet email ou ce téléphone existe déjà' 
      });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(motDePasse, salt);

    const nouvelUtilisateur = new Utilisateur({
      email,
      telephone,
      motDePasse: hashedPassword,
      nom,
      prenom,
      dateNaissance: dateNaissance ? new Date(dateNaissance) : undefined,
      sexe,
      adresse,
      preferences,
      contactsUrgence,
      role: 'utilisateur',
      statutCompte: 'ACTIF'
    });

    await nouvelUtilisateur.save();

    const utilisateurSansMotDePasse = nouvelUtilisateur.toObject();
    delete utilisateurSansMotDePasse.motDePasse;
    delete utilisateurSansMotDePasse.tokenResetMotDePasse;

    logger.info('Nouvel utilisateur créé', { userId: nouvelUtilisateur._id, email });

    res.status(201).json({ 
      success: true, 
      message: 'Utilisateur créé avec succès', 
      data: utilisateurSansMotDePasse 
    });
  } catch (error) {
    logger.error('Erreur création utilisateur:', error);
    
    // Gestion des erreurs de duplication MongoDB
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'Un utilisateur avec cet email ou ce téléphone existe déjà'
      });
    }
    
    // Gestion des erreurs de validation
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Erreur de validation',
        details: messages
      });
    }
    
    return next(AppError.serverError("Erreur serveur lors de la création de l'utilisateur", { 
      originalError: error.message 
    }));
  }
};

// =============== READ ===============
const obtenirProfilComplet = async (req, res, next) => {
  try {
    // Vérifier si on a un utilisateur ID (soit depuis req.user.userId soit depuis req.params.id)
    const userId = req.user?.userId || req.params?.id;
    
    if (!userId) {
      return res.status(400).json({ 
        success: false, 
        message: 'ID utilisateur manquant' 
      });
    }

    const utilisateur = await Utilisateur.findById(userId)
      .select('-motDePasse -tokenResetMotDePasse -expirationTokenReset')
      .populate('vehicules', 'marque modele couleur')
      .populate('documentIdentite.verificateurId', 'nom prenom');

    if (!utilisateur) {
      return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });
    }

    res.status(200).json({ success: true, data: utilisateur });
  } catch (error) {
    logger.error('Erreur récupération profil:', error);
    return next(AppError.serverError('Erreur serveur lors de la récupération du profil', { 
      originalError: error.message 
    }));
  }
};

const obtenirProfilPublic = async (req, res, next) => {
  try {
    const utilisateur = await Utilisateur.findById(req.params.id)
      .select('nom prenom photoProfil noteMoyenne nombreTrajets preferences.conversation preferences.languePreferee estVerifie dateInscription')
      .populate('vehicules', 'marque modele couleur');

    if (!utilisateur) {
      return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });
    }

    res.status(200).json({ success: true, data: utilisateur });
  } catch (error) {
    logger.error('Erreur récupération profil public:', error);
    return next(AppError.serverError('Erreur serveur lors de la récupération du profil public', { 
      originalError: error.message 
    }));
  }
};

// =============== UPDATE ===============
const mettreAJourProfil = async (req, res, next) => {
  try {
    // Vérifier si on a un utilisateur ID (soit depuis req.user.userId soit depuis req.params.id)
    const userId = req.user?.userId || req.params?.id;
    
    if (!userId) {
      return res.status(400).json({ 
        success: false, 
        message: 'ID utilisateur manquant' 
      });
    }

    const { nom, prenom, telephone, dateNaissance, sexe, adresse, preferences } = req.body;
    const updates = {};
    
    if (nom !== undefined) updates.nom = nom;
    if (prenom !== undefined) updates.prenom = prenom;
    if (telephone !== undefined) {
      // Vérifier l'unicité du téléphone si modifié
      if (telephone) {
        const existingUser = await Utilisateur.findOne({ 
          telephone, 
          _id: { $ne: userId } 
        });
        if (existingUser) {
          return res.status(409).json({
            success: false,
            message: 'Ce numéro de téléphone est déjà utilisé'
          });
        }
      }
      updates.telephone = telephone;
    }
    if (dateNaissance !== undefined) updates.dateNaissance = dateNaissance ? new Date(dateNaissance) : null;
    if (sexe !== undefined) updates.sexe = sexe;
    if (adresse !== undefined) updates.adresse = adresse;
    if (preferences !== undefined) updates.preferences = preferences;

    const utilisateur = await Utilisateur.findByIdAndUpdate(
      userId,
      { $set: updates },
      { new: true, runValidators: true }
    ).select('-motDePasse -tokenResetMotDePasse -expirationTokenReset');

    if (!utilisateur) {
      return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });
    }

    logger.info('Profil mis à jour', { userId });

    res.status(200).json({ 
      success: true, 
      message: 'Profil mis à jour avec succès', 
      data: utilisateur 
    });
  } catch (error) {
    logger.error('Erreur mise à jour profil:', error);
    
    // Gestion des erreurs de validation
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Erreur de validation',
        details: messages
      });
    }
    
    return next(AppError.serverError('Erreur serveur lors de la mise à jour du profil', { 
      originalError: error.message 
    }));
  }
};

const changerMotDePasse = async (req, res, next) => {
  try {
    const { ancienMotDePasse, nouveauMotDePasse } = req.body;

    if (!ancienMotDePasse || !nouveauMotDePasse) {
      return res.status(400).json({ 
        success: false, 
        message: 'Ancien et nouveau mot de passe requis' 
      });
    }

    if (!req.user?.userId) {
      return res.status(400).json({ 
        success: false, 
        message: 'ID utilisateur manquant' 
      });
    }

    // Sélectionner explicitement le mot de passe
    const utilisateur = await Utilisateur.findById(req.user.userId).select('+motDePasse');
    if (!utilisateur) {
      return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });
    }

    console.log("Ancien reçu:", ancienMotDePasse);
    console.log("Mot de passe BDD:", utilisateur.motDePasse);

    const isPasswordValid = await bcrypt.compare(ancienMotDePasse, utilisateur.motDePasse);
    if (!isPasswordValid) {
      return res.status(400).json({ success: false, message: 'Ancien mot de passe incorrect' });
    }

    const salt = await bcrypt.genSalt(10);
    utilisateur.motDePasse = await bcrypt.hash(nouveauMotDePasse, salt);
    await utilisateur.save();

    logger.info('Mot de passe modifié', { userId: req.user.userId });

    res.status(200).json({ success: true, message: 'Mot de passe modifié avec succès' });
  } catch (error) {
    logger.error('Erreur changement mot de passe:', error);
    return next(AppError.serverError("Erreur serveur lors du changement de mot de passe", { 
      originalError: error.message 
    }));
  }
};

// =============== UPLOADS ===============
const uploadPhotoProfil = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Aucun fichier uploadé' });
    }

    if (!req.user?.userId) {
      return res.status(400).json({ 
        success: false, 
        message: 'ID utilisateur manquant' 
      });
    }

    // Récupérer l'utilisateur actuel pour supprimer l'ancienne photo
    const utilisateurActuel = await Utilisateur.findById(req.user.userId);
    if (!utilisateurActuel) {
      return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });
    }

    // Supprimer l'ancienne photo si elle existe
    if (utilisateurActuel.photoProfil) {
      try {
        const { deleteFile } = require('../uploads/photos');
        const oldFilename = utilisateurActuel.photoProfil.split('/').pop();
        deleteFile(oldFilename);
      } catch (deleteError) {
        logger.warn('Erreur suppression ancienne photo:', deleteError);
      }
    }

    // Générer l'URL publique de la nouvelle photo
    const { getPublicUrl } = require('../uploads/photos');
    const photoUrl = getPublicUrl(req.file.filename);

    // Mettre à jour l'utilisateur avec la nouvelle URL
    const utilisateur = await Utilisateur.findByIdAndUpdate(
      req.user.userId,
      { photoProfil: photoUrl },
      { new: true }
    ).select('-motDePasse -tokenResetMotDePasse -expirationTokenReset');

    res.status(200).json({ 
      success: true, 
      message: 'Photo de profil uploadée avec succès', 
      data: { 
        photoProfil: utilisateur.photoProfil,
        filename: req.file.filename
      } 
    });
  } catch (error) {
    logger.error('Erreur upload photo:', error);
    return next(AppError.serverError("Erreur serveur lors de l'upload de la photo", { 
      originalError: error.message 
    }));
  }
};

const uploadDocumentIdentite = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Aucun fichier uploadé' });
    }

    if (!req.user?.userId) {
      return res.status(400).json({ 
        success: false, 
        message: 'ID utilisateur manquant' 
      });
    }

    const { type, numero } = req.body;
    
    // Récupérer l'utilisateur actuel pour supprimer l'ancien document
    const utilisateurActuel = await Utilisateur.findById(req.user.userId);
    if (!utilisateurActuel) {
      return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });
    }

    // Supprimer l'ancien document si il existe
    if (utilisateurActuel.documentIdentite && utilisateurActuel.documentIdentite.photoDocument) {
      try {
        const { deleteFile } = require('../uploads/documents');
        const oldFilename = utilisateurActuel.documentIdentite.photoDocument.split('/').pop();
        deleteFile(oldFilename);
      } catch (deleteError) {
        logger.warn('Erreur suppression ancien document:', deleteError);
      }
    }

    // Générer l'URL publique du nouveau document
    const { getPublicUrl } = require('../uploads/documents');
    const photoUrl = getPublicUrl(req.file.filename);

    const documentData = {
      type,
      numero,
      photoDocument: photoUrl,
      statutVerification: 'EN_ATTENTE',
      dateVerification: null,
      verificateurId: null,
      raisonRejet: null
    };

    const utilisateur = await Utilisateur.findByIdAndUpdate(
      req.user.userId,
      {
        $set: {
          documentIdentite: documentData,
          estVerifie: false
        }
      },
      { new: true }
    ).select('-motDePasse -tokenResetMotDePasse -expirationTokenReset');

    res.status(200).json({ 
      success: true, 
      message: "Document d'identité uploadé avec succès", 
      data: { 
        documentIdentite: utilisateur.documentIdentite,
        filename: req.file.filename
      } 
    });
  } catch (error) {
    logger.error('Erreur upload document:', error);
    return next(AppError.serverError("Erreur serveur lors de l'upload du document", { 
      originalError: error.message 
    }));
  }
};

// =============== STATS ===============
const obtenirStatistiques = async (req, res, next) => {
  try {
    if (!req.user?.userId) {
      return res.status(400).json({ 
        success: false, 
        message: 'ID utilisateur manquant' 
      });
    }

    const utilisateur = await Utilisateur.findById(req.user.userId)
      .select('noteMoyenne nombreTrajets nombreVoyages nombreReservations dateInscription');

    if (!utilisateur) {
      return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });
    }

    res.status(200).json({ success: true, data: utilisateur });
  } catch (error) {
    logger.error('Erreur récupération statistiques:', error);
    return next(AppError.serverError('Erreur serveur lors de la récupération des statistiques', { 
      originalError: error.message 
    }));
  }
};

const mettreAJourCoordonnees = async (req, res, next) => {
  try {
    const { longitude, latitude } = req.body;

    if (!req.user?.userId) {
      return res.status(400).json({ 
        success: false, 
        message: 'ID utilisateur manquant' 
      });
    }

    const utilisateur = await Utilisateur.findByIdAndUpdate(
      req.user.userId,
      {
        $set: {
          coordonnees: { longitude, latitude },
          derniereMiseAJourCoordonnees: new Date()
        }
      },
      { new: true }
    ).select('-motDePasse -tokenResetMotDePasse -expirationTokenReset');

    if (!utilisateur) {
      return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });
    }

    res.status(200).json({ 
      success: true, 
      message: 'Coordonnées mises à jour avec succès', 
      data: { coordonnees: utilisateur.coordonnees } 
    });
  } catch (error) {
    logger.error('Erreur mise à jour coordonnées:', error);
    return next(AppError.serverError("Erreur serveur lors de la mise à jour des coordonnées", { 
      originalError: error.message 
    }));
  }
};

// =============== SEARCH ===============
const rechercherUtilisateurs = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, scoreMin, longitude, latitude, rayon = 10, search } = req.query;

    const query = { statutCompte: 'ACTIF' }; // Exclure les comptes désactivés
    
    if (scoreMin) {
      query.noteMoyenne = { $gte: parseFloat(scoreMin) };
    }
    
    if (longitude && latitude) {
      query.coordonnees = {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [parseFloat(longitude), parseFloat(latitude)]
          },
          $maxDistance: parseInt(rayon) * 1000
        }
      };
    }
    
    if (search) {
      query.$or = [
        { nom: new RegExp(search, 'i') },
        { prenom: new RegExp(search, 'i') }
      ];
    }

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      select: 'nom prenom photoProfil noteMoyenne nombreTrajets preferences estVerifie coordonnees',
      sort: { noteMoyenne: -1 }
    };

    const result = await Utilisateur.paginate(query, options);
    
    res.status(200).json({ 
      success: true, 
      data: result.docs, 
      pagination: { 
        page: result.page, 
        limit: result.limit, 
        total: result.totalDocs, 
        pages: result.totalPages 
      } 
    });
  } catch (error) {
    logger.error('Erreur recherche utilisateurs:', error);
    return next(AppError.serverError("Erreur serveur lors de la recherche d'utilisateurs", { 
      originalError: error.message 
    }));
  }
};

// =============== DELETE ===============
const supprimerCompte = async (req, res, next) => {
  try {
    // Pour la suppression par l'utilisateur lui-même
    if (req.user?.userId && !req.params.id) {
      const { motDePasse } = req.body;
      
      if (!motDePasse) {
        return res.status(400).json({
          success: false,
          message: 'Mot de passe requis pour supprimer le compte'
        });
      }

      const utilisateur = await Utilisateur.findById(req.user.userId);
      if (!utilisateur) {
        return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });
      }

      const isPasswordValid = await bcrypt.compare(motDePasse, utilisateur.motDePasse);
      if (!isPasswordValid) {
        return res.status(400).json({ success: false, message: 'Mot de passe incorrect' });
      }

      await Utilisateur.findByIdAndDelete(req.user.userId);
      logger.info('Compte supprimé par l\'utilisateur', { userId: req.user.userId });
      
      return res.status(200).json({ success: true, message: 'Compte supprimé avec succès' });
    }
    
    // Pour la suppression par un admin
    if (req.params.id) {
      const utilisateur = await Utilisateur.findById(req.params.id);
      if (!utilisateur) {
        return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });
      }

      await Utilisateur.findByIdAndDelete(req.params.id);
      logger.info('Compte supprimé par admin', { 
        userId: req.params.id, 
        adminId: req.user.userId 
      });
      
      return res.status(200).json({ success: true, message: 'Utilisateur supprimé avec succès' });
    }

    return res.status(400).json({
      success: false,
      message: 'ID utilisateur manquant'
    });

  } catch (error) {
    logger.error('Erreur suppression compte:', error);
    return next(AppError.serverError('Erreur serveur lors de la suppression du compte', { 
      originalError: error.message 
    }));
  }
};

// =============== ADMIN ===============
const obtenirTousLesUtilisateurs = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, statut, verification, search } = req.query;

    const query = {};
    if (statut) query.statutCompte = statut;
    if (verification === 'verifie') query.estVerifie = true;
    if (verification === 'non_verifie') query.estVerifie = false;
    if (search) {
      query.$or = [
        { nom: new RegExp(search, 'i') },
        { prenom: new RegExp(search, 'i') },
        { email: new RegExp(search, 'i') },
        { telephone: new RegExp(search, 'i') }
      ];
    }

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      select: '-motDePasse -tokenResetMotDePasse -expirationTokenReset',
      sort: { dateInscription: -1 },
      populate: { path: 'documentIdentite.verificateurId', select: 'nom prenom' }
    };

    const result = await Utilisateur.paginate(query, options);
    
    res.status(200).json({ 
      success: true, 
      data: result.docs, 
      pagination: { 
        page: result.page, 
        limit: result.limit, 
        total: result.totalDocs, 
        pages: result.totalPages 
      } 
    });
  } catch (error) {
    logger.error('Erreur récupération utilisateurs:', error);
    return next(AppError.serverError('Erreur serveur lors de la récupération des utilisateurs', { 
      originalError: error.message 
    }));
  }
};

const obtenirStatistiquesGlobales = async (req, res, next) => {
  try {
    // Statistiques de base si la méthode existe dans le modèle
    let statistiques = {};
    if (typeof Utilisateur.statistiquesGlobales === 'function') {
      statistiques = await Utilisateur.statistiquesGlobales();
    } else {
      // Calcul manuel des statistiques
      const totalUtilisateurs = await Utilisateur.countDocuments();
      const utilisateursActifs = await Utilisateur.countDocuments({ statutCompte: 'ACTIF' });
      const utilisateursVerifies = await Utilisateur.countDocuments({ estVerifie: true });
      
      statistiques = {
        totalUtilisateurs,
        utilisateursActifs,
        utilisateursVerifies,
        tauxVerification: totalUtilisateurs > 0 ? (utilisateursVerifies / totalUtilisateurs * 100).toFixed(2) : 0
      };
    }

    const statsParStatut = await Utilisateur.aggregate([
      { $group: { _id: '$statutCompte', count: { $sum: 1 } } }
    ]);

    const statsParMois = await Utilisateur.aggregate([
      { 
        $group: { 
          _id: { 
            year: { $year: '$dateInscription' }, 
            month: { $month: '$dateInscription' } 
          }, 
          count: { $sum: 1 } 
        } 
      },
      { $sort: { '_id.year': -1, '_id.month': -1 } },
      { $limit: 12 }
    ]);

    res.status(200).json({ 
      success: true, 
      data: { 
        ...statistiques, 
        repartitionStatuts: statsParStatut, 
        inscriptionsParMois: statsParMois 
      } 
    });
  } catch (error) {
    logger.error('Erreur récupération statistiques globales:', error);
    return next(AppError.serverError('Erreur serveur lors de la récupération des statistiques globales', { 
      originalError: error.message 
    }));
  }
};

// =============== NOUVELLES FONCTIONNALITÉS PORTEFEUILLE ===============

/**
 * Obtenir le résumé du portefeuille de l'utilisateur connecté
 */
const obtenirPortefeuille = async (req, res, next) => {
  try {
    const userId = req.user?.userId;
    
    if (!userId) {
      return res.status(400).json({ 
        success: false, 
        message: 'ID utilisateur manquant' 
      });
    }

    const utilisateur = await Utilisateur.findById(userId);
    if (!utilisateur) {
      return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });
    }

    const resume = utilisateur.obtenirResumePortefeuille();

    res.status(200).json({ 
      success: true, 
      data: resume 
    });
  } catch (error) {
    logger.error('Erreur récupération portefeuille:', error);
    return next(AppError.serverError('Erreur serveur lors de la récupération du portefeuille', { 
      originalError: error.message 
    }));
  }
};

/**
 * Obtenir l'historique des transactions du portefeuille
 */
const obtenirHistoriquePortefeuille = async (req, res, next) => {
  try {
    const userId = req.user?.userId;
    const { 
      type, 
      statut, 
      limit = 50, 
      dateDebut, 
      dateFin 
    } = req.query;
    
    if (!userId) {
      return res.status(400).json({ 
        success: false, 
        message: 'ID utilisateur manquant' 
      });
    }

    const utilisateur = await Utilisateur.findById(userId);
    if (!utilisateur) {
      return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });
    }

    const historique = utilisateur.obtenirHistoriquePortefeuille({
      type,
      statut,
      limit: parseInt(limit),
      dateDebut,
      dateFin
    });

    res.status(200).json({ 
      success: true, 
      data: historique 
    });
  } catch (error) {
    logger.error('Erreur récupération historique portefeuille:', error);
    return next(AppError.serverError('Erreur serveur lors de la récupération de l\'historique', { 
      originalError: error.message 
    }));
  }
};

/**
 * Configurer les paramètres de retrait
 */
const configurerParametresRetrait = async (req, res, next) => {
  try {
    const userId = req.user?.userId;
    const { numeroMobile, operateur, nomTitulaire } = req.body;

    if (!userId) {
      return res.status(400).json({ 
        success: false, 
        message: 'ID utilisateur manquant' 
      });
    }

    // Validation des données
    if (!numeroMobile || !operateur || !nomTitulaire) {
      return res.status(400).json({
        success: false,
        message: 'Numéro mobile, opérateur et nom titulaire sont obligatoires'
      });
    }

    const operateursValides = ['ORANGE', 'MTN', 'MOOV'];
    if (!operateursValides.includes(operateur)) {
      return res.status(400).json({
        success: false,
        message: 'Opérateur non supporté. Utilisez ORANGE, MTN ou MOOV'
      });
    }

    const utilisateur = await Utilisateur.findById(userId);
    if (!utilisateur) {
      return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });
    }

    await utilisateur.configurerParametresRetrait(numeroMobile, operateur, nomTitulaire);

    logger.info('Paramètres de retrait configurés', { userId, operateur });

    res.status(200).json({
      success: true,
      message: 'Paramètres de retrait configurés avec succès',
      data: {
        parametresRetrait: utilisateur.portefeuille.parametresRetrait
      }
    });
  } catch (error) {
    logger.error('Erreur configuration paramètres retrait:', error);
    return next(AppError.serverError('Erreur serveur lors de la configuration', { 
      originalError: error.message 
    }));
  }
};

/**
 * Vérifier les limites de retrait pour un montant donné
 */
const verifierLimitesRetrait = async (req, res, next) => {
  try {
    const userId = req.user?.userId;
    const { montant } = req.query;

    if (!userId) {
      return res.status(400).json({ 
        success: false, 
        message: 'ID utilisateur manquant' 
      });
    }

    if (!montant || isNaN(montant) || montant <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Montant valide requis'
      });
    }

    const utilisateur = await Utilisateur.findById(userId);
    if (!utilisateur) {
      return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });
    }

    const verification = utilisateur.verifierLimitesRetrait(parseFloat(montant));

    res.status(200).json({
      success: true,
      data: verification
    });
  } catch (error) {
    logger.error('Erreur vérification limites retrait:', error);
    return next(AppError.serverError('Erreur serveur lors de la vérification', { 
      originalError: error.message 
    }));
  }
};

/**
 * Créditer manuellement le portefeuille d'un utilisateur (admin uniquement)
 */
const crediterPortefeuilleManuel = async (req, res, next) => {
  try {
    // Vérifier les permissions admin
    if (req.user?.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Accès réservé aux administrateurs'
      });
    }

    const { userId } = req.params;
    const { montant, description } = req.body;

    if (!montant || isNaN(montant) || montant <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Montant valide requis'
      });
    }

    if (!description) {
      return res.status(400).json({
        success: false,
        message: 'Description requise'
      });
    }

    const utilisateur = await Utilisateur.findById(userId);
    if (!utilisateur) {
      return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });
    }

    const reference = `ADMIN_${Date.now()}_${req.user.userId}`;
    await utilisateur.crediterPortefeuille(montant, description, reference);

    logger.info('Portefeuille crédité manuellement', { 
      userId, 
      montant, 
      adminId: req.user.userId 
    });

    res.status(200).json({
      success: true,
      message: 'Portefeuille crédité avec succès',
      data: {
        nouveauSolde: utilisateur.portefeuille.solde,
        montantCredite: montant
      }
    });
  } catch (error) {
    logger.error('Erreur crédit manuel portefeuille:', error);
    return next(AppError.serverError('Erreur serveur lors du crédit manuel', { 
      originalError: error.message 
    }));
  }
};

/**
 * Obtenir les statistiques globales des portefeuilles (admin uniquement)
 */
const obtenirStatistiquesPortefeuillesGlobales = async (req, res, next) => {
  try {
    // Vérifier les permissions admin
    if (req.user?.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Accès réservé aux administrateurs'
      });
    }

    const stats = await Utilisateur.statistiquesPortefeuillesGlobales();

    res.status(200).json({
      success: true,
      data: stats[0] || {}
    });
  } catch (error) {
    logger.error('Erreur récupération statistiques portefeuilles:', error);
    return next(AppError.serverError('Erreur serveur lors de la récupération des statistiques', { 
      originalError: error.message 
    }));
  }
};

/**
 * Obtenir les utilisateurs avec solde élevé (admin uniquement)
 */
const obtenirUtilisateursSoldeEleve = async (req, res, next) => {
  try {
    // Vérifier les permissions admin
    if (req.user?.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Accès réservé aux administrateurs'
      });
    }

    const { seuilSolde = 100000 } = req.query;

    const utilisateurs = await Utilisateur.obtenirUtilisateursSoldeEleve(parseFloat(seuilSolde));

    res.status(200).json({
      success: true,
      data: utilisateurs
    });
  } catch (error) {
    logger.error('Erreur récupération utilisateurs solde élevé:', error);
    return next(AppError.serverError('Erreur serveur lors de la récupération', { 
      originalError: error.message 
    }));
  }
};

/**
 * Obtenir les transactions suspectes (admin uniquement)
 */
const obtenirTransactionsSuspectes = async (req, res, next) => {
  try {
    // Vérifier les permissions admin
    if (req.user?.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Accès réservé aux administrateurs'
      });
    }

    const transactionsSuspectes = await Utilisateur.obtenirTransactionsSuspectes();

    res.status(200).json({
      success: true,
      data: transactionsSuspectes
    });
  } catch (error) {
    logger.error('Erreur récupération transactions suspectes:', error);
    return next(AppError.serverError('Erreur serveur lors de la récupération', { 
      originalError: error.message 
    }));
  }
};

/**
 * Obtenir le portefeuille d'un utilisateur spécifique (admin uniquement)
 */
const obtenirPortefeuilleUtilisateur = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const utilisateurConnecte = req.user?.userId;

    // Vérifier que l'utilisateur peut accéder à ce portefeuille
    if (utilisateurConnecte !== userId && req.user?.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Accès non autorisé à ce portefeuille'
      });
    }

    const utilisateur = await Utilisateur.findById(userId);
    if (!utilisateur) {
      return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });
    }

    const resume = utilisateur.obtenirResumePortefeuille();

    res.status(200).json({
      success: true,
      data: resume
    });
  } catch (error) {
    logger.error('Erreur récupération portefeuille utilisateur:', error);
    return next(AppError.serverError('Erreur serveur lors de la récupération du portefeuille', { 
      originalError: error.message 
    }));
  }
};

/**
 * Bloquer ou débloquer un montant dans le portefeuille (admin uniquement)
 */
const gererMontantBloque = async (req, res, next) => {
  try {
    // Vérifier les permissions admin
    if (req.user?.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Accès réservé aux administrateurs'
      });
    }

    const { userId } = req.params;
    const { action, montant, description } = req.body; // action: 'bloquer' ou 'debloquer'

    if (!['bloquer', 'debloquer'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'Action doit être "bloquer" ou "debloquer"'
      });
    }

    if (!montant || isNaN(montant) || montant <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Montant valide requis'
      });
    }

    const utilisateur = await Utilisateur.findById(userId);
    if (!utilisateur) {
      return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });
    }

    if (action === 'bloquer') {
      await utilisateur.bloquerMontant(montant, description || 'Blocage administratif');
    } else {
      await utilisateur.debloquerMontant(montant, description || 'Déblocage administratif');
    }

    logger.info(`Montant ${action === 'bloquer' ? 'bloqué' : 'débloqué'} par admin`, { 
      userId, 
      montant, 
      adminId: req.user.userId 
    });

    res.status(200).json({
      success: true,
      message: `Montant ${action === 'bloquer' ? 'bloqué' : 'débloqué'} avec succès`,
      data: {
        solde: utilisateur.portefeuille.solde,
        soldeBloquer: utilisateur.portefeuille.soldeBloquer,
        soldeDisponible: utilisateur.soldeDisponible
      }
    });
  } catch (error) {
    logger.error('Erreur gestion montant bloqué:', error);
    return next(AppError.serverError('Erreur serveur lors de la gestion du montant', { 
      originalError: error.message 
    }));
  }
};

module.exports = {
  creerUtilisateur,
  obtenirProfilComplet,
  obtenirProfilPublic,
  mettreAJourProfil,
  changerMotDePasse,
  uploadPhotoProfil,
  uploadDocumentIdentite,
  obtenirStatistiques,
  mettreAJourCoordonnees,
  rechercherUtilisateurs,
  supprimerCompte,
  obtenirTousLesUtilisateurs,
  obtenirStatistiquesGlobales,
  // NOUVELLES MÉTHODES PORTEFEUILLE
  obtenirPortefeuille,
  obtenirHistoriquePortefeuille,
  configurerParametresRetrait,
  verifierLimitesRetrait,
  crediterPortefeuilleManuel,
  obtenirStatistiquesPortefeuillesGlobales,
  obtenirUtilisateursSoldeEleve,
  obtenirTransactionsSuspectes,
  obtenirPortefeuilleUtilisateur,
  gererMontantBloque
};