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

    if (!req.user?.userId) {
      return res.status(400).json({ 
        success: false, 
        message: 'ID utilisateur manquant' 
      });
    }

    const utilisateur = await Utilisateur.findById(req.user.userId);
    if (!utilisateur) {
      return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });
    }

    const isPasswordValid = await bcrypt.compare(ancienMotDePasse, utilisateur.motDePasse);
    if (!isPasswordValid) {
      return res.status(400).json({ success: false, message: 'Ancien mot de passe incorrect' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(nouveauMotDePasse, salt);
    utilisateur.motDePasse = hashedPassword;
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
  obtenirStatistiquesGlobales
};