// controllers/utilisateurController.js
const Utilisateur = require('../models/Utilisateur');
const asyncHandler = require('../middleware/asyncHandler');
const ErrorResponse = require('../utils/errorResponse');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs').promises;
const sharp = require('sharp'); // Pour le traitement d'images
const { validationResult } = require('express-validator');

/**
 * @desc    Inscription d'un nouvel utilisateur
 * @route   POST /api/utilisateurs/inscription
 * @access  Public
 */
exports.inscription = asyncHandler(async (req, res, next) => {
  // Vérifier les erreurs de validation
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(new ErrorResponse('Erreurs de validation', 400, errors.array()));
  }

  const { email, telephone } = req.body;

  // Vérifier si l'utilisateur existe déjà
  const utilisateurExistant = await Utilisateur.findOne({
    $or: [
      { email: email.toLowerCase() },
      { telephone }
    ]
  });

  if (utilisateurExistant) {
    return next(new ErrorResponse('Un utilisateur avec cet email ou téléphone existe déjà', 400));
  }

  // Créer le nouvel utilisateur
  const utilisateur = await Utilisateur.create({
    ...req.body,
    email: email.toLowerCase()
  });

  // Générer le token JWT et envoyer la réponse
  sendTokenResponse(utilisateur, 201, res, 'Inscription réussie');
});

/**
 * @desc    Connexion utilisateur
 * @route   POST /api/utilisateurs/connexion
 * @access  Public
 */
exports.connexion = asyncHandler(async (req, res, next) => {
  const { identifiant, motDePasse } = req.body;

  // Validation des champs requis
  if (!identifiant || !motDePasse) {
    return next(new ErrorResponse('Veuillez fournir un email/téléphone et un mot de passe', 400));
  }

  // Trouver l'utilisateur avec le mot de passe
  const utilisateur = await Utilisateur.findOne({
    $or: [
      { email: identifiant.toLowerCase() },
      { telephone: identifiant }
    ]
  }).select('+motDePasse');

  if (!utilisateur) {
    return next(new ErrorResponse('Identifiants incorrects', 401));
  }

  // Vérifier si l'utilisateur peut se connecter
  const peutSeConnecter = utilisateur.peutSeConnecter();
  if (!peutSeConnecter.autorise) {
    const error = new ErrorResponse(peutSeConnecter.raison, 423);
    if (peutSeConnecter.deblocageA) {
      error.deblocageA = peutSeConnecter.deblocageA;
    }
    return next(error);
  }

  // Vérifier le mot de passe
  const motDePasseValide = await utilisateur.verifierMotDePasse(motDePasse);
  if (!motDePasseValide) {
    await utilisateur.incrementerTentativesEchouees();
    return next(new ErrorResponse('Identifiants incorrects', 401));
  }

  // Mettre à jour la dernière connexion
  await utilisateur.mettreAJourDerniereConnexion();

  sendTokenResponse(utilisateur, 200, res, 'Connexion réussie');
});

/**
 * @desc    Déconnexion utilisateur
 * @route   POST /api/utilisateurs/deconnexion
 * @access  Private
 */
exports.deconnexion = asyncHandler(async (req, res, next) => {
  res.cookie('token', 'none', {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true
  });

  res.status(200).json({
    success: true,
    message: 'Déconnexion réussie'
  });
});

/**
 * @desc    Obtenir le profil de l'utilisateur connecté
 * @route   GET /api/utilisateurs/moi
 * @access  Private
 */
exports.getMoi = asyncHandler(async (req, res, next) => {
  const utilisateur = await Utilisateur.findById(req.user.id)
    .populate('documentIdentite.verificateurId', 'nom prenom')
    .populate('historiqueStatuts.administrateurId', 'nom prenom');

  res.status(200).json({
    success: true,
    data: utilisateur
  });
});

/**
 * @desc    Obtenir un profil utilisateur par ID
 * @route   GET /api/utilisateurs/:id
 * @access  Private
 */
exports.getUtilisateur = asyncHandler(async (req, res, next) => {
  // Profil complet pour l'utilisateur lui-même, profil public pour les autres
  const estProprietaire = req.user.id === req.params.id;
  
  let selectFields = 'prenom photoProfil scoreConfiance noteGenerale badges nombreTrajetsEffectues preferences.conversation preferences.musique preferences.climatisation adresse.commune adresse.quartier';
  
  if (estProprietaire || req.user.role === 'admin') {
    selectFields = ''; // Tous les champs
  }

  const utilisateur = await Utilisateur.findById(req.params.id)
    .select(selectFields)
    .populate('documentIdentite.verificateurId', 'nom prenom');

  if (!utilisateur) {
    return next(new ErrorResponse('Utilisateur non trouvé', 404));
  }

  res.status(200).json({
    success: true,
    data: utilisateur
  });
});

/**
 * @desc    Mettre à jour le profil utilisateur
 * @route   PUT /api/utilisateurs/moi
 * @access  Private
 */
exports.updateProfil = asyncHandler(async (req, res, next) => {
  const champsAutorisés = [
    'nom', 'prenom', 'dateNaissance', 'sexe', 'photoProfil',
    'adresse', 'preferences', 'contactsUrgence'
  ];

  const champsAMettreAJour = {};
  
  // Filtrer les champs autorisés
  Object.keys(req.body).forEach(key => {
    if (champsAutorisés.includes(key)) {
      champsAMettreAJour[key] = req.body[key];
    }
  });

  const utilisateur = await Utilisateur.findByIdAndUpdate(
    req.user.id,
    champsAMettreAJour,
    {
      new: true,
      runValidators: true
    }
  );

  res.status(200).json({
    success: true,
    message: 'Profil mis à jour avec succès',
    data: utilisateur
  });
});

/**
 * @desc    Changer le mot de passe
 * @route   PUT /api/utilisateurs/mot-de-passe
 * @access  Private
 */
exports.updateMotDePasse = asyncHandler(async (req, res, next) => {
  const utilisateur = await Utilisateur.findById(req.user.id).select('+motDePasse');

  // Vérifier l'ancien mot de passe
  if (!(await utilisateur.verifierMotDePasse(req.body.motDePasseActuel))) {
    return next(new ErrorResponse('Mot de passe actuel incorrect', 401));
  }

  utilisateur.motDePasse = req.body.nouveauMotDePasse;
  await utilisateur.save();

  sendTokenResponse(utilisateur, 200, res, 'Mot de passe modifié avec succès');
});

/**
 * @desc    Upload photo de profil
 * @route   POST /api/utilisateurs/photo
 * @access  Private
 */
exports.uploadPhoto = asyncHandler(async (req, res, next) => {
  const utilisateur = await Utilisateur.findById(req.user.id);

  if (!utilisateur) {
    return next(new ErrorResponse('Utilisateur non trouvé', 404));
  }

  if (!req.file) {
    return next(new ErrorResponse('Veuillez télécharger un fichier', 400));
  }

  const file = req.file;

  // Vérifier si c'est une image
  if (!file.mimetype.startsWith('image')) {
    return next(new ErrorResponse('Veuillez télécharger un fichier image', 400));
  }

  // Vérifier la taille du fichier
  if (file.size > process.env.MAX_FILE_UPLOAD || 1000000) {
    return next(new ErrorResponse('Image trop volumineuse (max 1MB)', 400));
  }

  try {
    // Traitement de l'image avec Sharp
    const filename = `photo_${utilisateur._id}_${Date.now()}.jpeg`;
    const filepath = path.join(process.env.FILE_UPLOAD_PATH || './uploads/profils', filename);

    await sharp(file.buffer)
      .resize(300, 300)
      .jpeg({ quality: 80 })
      .toFile(filepath);

    // Supprimer l'ancienne photo si elle existe
    if (utilisateur.photoProfil) {
      const anciennePhoto = path.join(process.env.FILE_UPLOAD_PATH || './uploads/profils', path.basename(utilisateur.photoProfil));
      try {
        await fs.unlink(anciennePhoto);
      } catch (err) {
        console.log('Erreur lors de la suppression de l\'ancienne photo:', err);
      }
    }

    // Mettre à jour l'utilisateur
    await Utilisateur.findByIdAndUpdate(req.user.id, {
      photoProfil: `/uploads/profils/${filename}`
    });

    res.status(200).json({
      success: true,
      message: 'Photo téléchargée avec succès',
      data: `/uploads/profils/${filename}`
    });

  } catch (error) {
    console.error('Erreur lors du traitement de l\'image:', error);
    return next(new ErrorResponse('Erreur lors du traitement de l\'image', 500));
  }
});

/**
 * @desc    Upload document d'identité
 * @route   POST /api/utilisateurs/document
 * @access  Private
 */
exports.uploadDocument = asyncHandler(async (req, res, next) => {
  const utilisateur = await Utilisateur.findById(req.user.id);

  if (!utilisateur) {
    return next(new ErrorResponse('Utilisateur non trouvé', 404));
  }

  if (!req.file) {
    return next(new ErrorResponse('Veuillez télécharger un document', 400));
  }

  const { type, numero } = req.body;

  if (!type || !numero) {
    return next(new ErrorResponse('Type et numéro de document requis', 400));
  }

  const file = req.file;
  const filename = `document_${utilisateur._id}_${Date.now()}${path.extname(file.originalname)}`;
  const filepath = path.join(process.env.FILE_UPLOAD_PATH || './uploads/documents', filename);

  try {
    await fs.writeFile(filepath, file.buffer);

    // Mettre à jour l'utilisateur
    const utilisateurMisAJour = await Utilisateur.findByIdAndUpdate(
      req.user.id,
      {
        'documentIdentite.type': type,
        'documentIdentite.numero': numero,
        'documentIdentite.photoDocument': `/uploads/documents/${filename}`,
        'documentIdentite.statutVerification': 'EN_ATTENTE'
      },
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      message: 'Document téléchargé avec succès',
      data: utilisateurMisAJour.documentIdentite
    });

  } catch (error) {
    console.error('Erreur lors de l\'enregistrement du document:', error);
    return next(new ErrorResponse('Erreur lors de l\'enregistrement du document', 500));
  }
});

/**
 * @desc    Rechercher des utilisateurs
 * @route   GET /api/utilisateurs/recherche
 * @access  Private
 */
exports.rechercherUtilisateurs = asyncHandler(async (req, res, next) => {
  // Copier req.query
  const reqQuery = { ...req.query };

  // Champs à exclure de la recherche
  const removeFields = ['select', 'sort', 'page', 'limit'];
  removeFields.forEach(param => delete reqQuery[param]);

  // Créer la chaîne de requête
  let queryStr = JSON.stringify(reqQuery);
  
  // Créer les opérateurs MongoDB ($gt, $gte, etc.)
  queryStr = queryStr.replace(/\b(gt|gte|lt|lte|in)\b/g, match => `$${match}`);

  // Trouver les ressources
  let query = Utilisateur.find({
    ...JSON.parse(queryStr),
    statutCompte: 'ACTIF'
  });

  // Select Fields
  if (req.query.select) {
    const fields = req.query.select.split(',').join(' ');
    query = query.select(fields);
  } else {
    // Champs par défaut pour la recherche
    query = query.select('prenom nom photoProfil scoreConfiance noteGenerale badges nombreTrajetsEffectues adresse.commune adresse.quartier');
  }

  // Sort
  if (req.query.sort) {
    const sortBy = req.query.sort.split(',').join(' ');
    query = query.sort(sortBy);
  } else {
    query = query.sort('-scoreConfiance -noteGenerale');
  }

  // Pagination
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 25;
  const startIndex = (page - 1) * limit;
  const endIndex = page * limit;
  const total = await Utilisateur.countDocuments({
    ...JSON.parse(queryStr),
    statutCompte: 'ACTIF'
  });

  query = query.skip(startIndex).limit(limit);

  // Exécuter la requête
  const utilisateurs = await query;

  // Pagination result
  const pagination = {};

  if (endIndex < total) {
    pagination.next = {
      page: page + 1,
      limit
    };
  }

  if (startIndex > 0) {
    pagination.prev = {
      page: page - 1,
      limit
    };
  }

  res.status(200).json({
    success: true,
    count: utilisateurs.length,
    pagination,
    data: utilisateurs
  });
});

/**
 * @desc    Rechercher par proximité
 * @route   GET /api/utilisateurs/proximite
 * @access  Private
 */
exports.rechercherParProximite = asyncHandler(async (req, res, next) => {
  const { longitude, latitude, rayon = 10 } = req.query;

  if (!longitude || !latitude) {
    return next(new ErrorResponse('Longitude et latitude requises', 400));
  }

  const utilisateurs = await Utilisateur.rechercherParProximite(
    parseFloat(longitude),
    parseFloat(latitude),
    parseFloat(rayon)
  ).select('prenom photoProfil scoreConfiance noteGenerale badges adresse.commune adresse.quartier');

  res.status(200).json({
    success: true,
    count: utilisateurs.length,
    data: utilisateurs
  });
});

/**
 * @desc    Obtenir les statistiques d'un utilisateur
 * @route   GET /api/utilisateurs/:id/statistiques
 * @access  Private
 */
exports.getStatistiques = asyncHandler(async (req, res, next) => {
  const utilisateur = await Utilisateur.findById(req.params.id);

  if (!utilisateur) {
    return next(new ErrorResponse('Utilisateur non trouvé', 404));
  }

  const statistiques = {
    informationsGenerales: {
      nomComplet: utilisateur.nomComplet,
      age: utilisateur.age,
      anciennete: Math.floor((Date.now() - utilisateur.dateInscription.getTime()) / (1000 * 60 * 60 * 24))
    },
    reputation: {
      scoreConfiance: utilisateur.scoreConfiance,
      noteGenerale: utilisateur.noteGenerale,
      badges: utilisateur.badges
    },
    activite: {
      nombreTrajetsEffectues: utilisateur.nombreTrajetsEffectues,
      nombreTrajetsAnnules: utilisateur.nombreTrajetsAnnules,
      tauxAnnulation: utilisateur.tauxAnnulation
    },
    verification: {
      estVerifie: utilisateur.estVerifie,
      estDocumentVerifie: utilisateur.estDocumentVerifie,
      statutCompte: utilisateur.statutCompte
    }
  };

  res.status(200).json({
    success: true,
    data: statistiques
  });
});

/**
 * @desc    Demande de réinitialisation de mot de passe
 * @route   POST /api/utilisateurs/mot-de-passe-oublie
 * @access  Public
 */
exports.motDePasseOublie = asyncHandler(async (req, res, next) => {
  const utilisateur = await Utilisateur.findOne({ email: req.body.email });

  if (!utilisateur) {
    // Ne pas révéler si l'email existe
    return res.status(200).json({
      success: true,
      message: 'Email envoyé'
    });
  }

  // Générer le token de réinitialisation
  const resetToken = crypto.randomBytes(20).toString('hex');

  // Hash du token et définition de l'expiration
  utilisateur.tokenResetMotDePasse = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');

  utilisateur.expirationTokenReset = Date.now() + 10 * 60 * 1000; // 10 minutes

  await utilisateur.save({ validateBeforeSave: false });

  // Créer l'URL de réinitialisation
  const resetUrl = `${req.protocol}://${req.get('host')}/api/utilisateurs/reset-mot-de-passe/${resetToken}`;

  const message = `Vous recevez cet email car vous (ou quelqu'un d'autre) avez demandé la réinitialisation d'un mot de passe. Veuillez cliquer sur ce lien: \n\n ${resetUrl}`;

  try {
    // Ici, vous devriez envoyer l'email
    // await sendEmail({
    //   email: utilisateur.email,
    //   subject: 'Token de réinitialisation de mot de passe',
    //   message
    // });

    res.status(200).json({
      success: true,
      message: 'Email envoyé',
      // En développement seulement
      ...(process.env.NODE_ENV === 'development' && { resetUrl })
    });
  } catch (err) {
    console.log(err);
    utilisateur.tokenResetMotDePasse = undefined;
    utilisateur.expirationTokenReset = undefined;

    await utilisateur.save({ validateBeforeSave: false });

    return next(new ErrorResponse('Email n\'a pas pu être envoyé', 500));
  }
});

/**
 * @desc    Réinitialiser le mot de passe
 * @route   PUT /api/utilisateurs/reset-mot-de-passe/:resettoken
 * @access  Public
 */
exports.resetMotDePasse = asyncHandler(async (req, res, next) => {
  // Obtenir le token hashé
  const resetPasswordToken = crypto
    .createHash('sha256')
    .update(req.params.resettoken)
    .digest('hex');

  const utilisateur = await Utilisateur.findOne({
    tokenResetMotDePasse: resetPasswordToken,
    expirationTokenReset: { $gt: Date.now() }
  });

  if (!utilisateur) {
    return next(new ErrorResponse('Token invalide', 400));
  }

  // Définir le nouveau mot de passe
  utilisateur.motDePasse = req.body.motDePasse;
  utilisateur.tokenResetMotDePasse = undefined;
  utilisateur.expirationTokenReset = undefined;
  // Réinitialiser les tentatives de connexion échouées
  utilisateur.tentativesConnexionEchouees = 0;
  utilisateur.compteBloqueTempJusqu = undefined;

  await utilisateur.save();

  sendTokenResponse(utilisateur, 200, res, 'Mot de passe réinitialisé avec succès');
});

/**
 * @desc    Supprimer le compte utilisateur
 * @route   DELETE /api/utilisateurs/moi
 * @access  Private
 */
exports.supprimerCompte = asyncHandler(async (req, res, next) => {
  // Soft delete - changer le statut au lieu de supprimer
  const utilisateur = await Utilisateur.findByIdAndUpdate(
    req.user.id,
    {
      statutCompte: 'BLOQUE',
      email: `deleted_${Date.now()}_${req.user.email}`,
      telephone: `deleted_${Date.now()}_${req.user.telephone}`,
      dateSuppressionCompte: new Date()
    },
    { new: true }
  );

  res.status(200).json({
    success: true,
    message: 'Compte supprimé avec succès'
  });
});

// ========================================
// MÉTHODES POUR ADMINISTRATEURS
// ========================================

/**
 * @desc    Obtenir tous les utilisateurs (Admin)
 * @route   GET /api/utilisateurs
 * @access  Admin
 */
exports.getUtilisateurs = asyncHandler(async (req, res, next) => {
  res.status(200).json(res.advancedResults);
});

/**
 * @desc    Vérifier un document d'identité (Admin)
 * @route   PUT /api/utilisateurs/:id/verification
 * @access  Admin
 */
exports.verifierDocument = asyncHandler(async (req, res, next) => {
  const { statut, raisonRejet } = req.body;

  if (!['VERIFIE', 'REJETE'].includes(statut)) {
    return next(new ErrorResponse('Statut invalide', 400));
  }

  const miseAJour = {
    'documentIdentite.statutVerification': statut,
    'documentIdentite.dateVerification': new Date(),
    'documentIdentite.verificateurId': req.user.id
  };

  if (statut === 'REJETE' && raisonRejet) {
    miseAJour['documentIdentite.raisonRejet'] = raisonRejet;
  }

  const utilisateur = await Utilisateur.findByIdAndUpdate(
    req.params.id,
    miseAJour,
    { new: true, runValidators: true }
  );

  if (!utilisateur) {
    return next(new ErrorResponse('Utilisateur non trouvé', 404));
  }

  res.status(200).json({
    success: true,
    message: `Document ${statut === 'VERIFIE' ? 'vérifié' : 'rejeté'} avec succès`,
    data: utilisateur
  });
});

/**
 * @desc    Changer le statut d'un utilisateur (Admin)
 * @route   PUT /api/utilisateurs/:id/statut
 * @access  Admin
 */
exports.changerStatut = asyncHandler(async (req, res, next) => {
  const { nouveauStatut, raison } = req.body;

  const utilisateur = await Utilisateur.findById(req.params.id);
  if (!utilisateur) {
    return next(new ErrorResponse('Utilisateur non trouvé', 404));
  }

  await utilisateur.changerStatut(nouveauStatut, raison, req.user.id);

  res.status(200).json({
    success: true,
    message: `Statut changé vers ${nouveauStatut}`,
    data: {
      statutCompte: utilisateur.statutCompte,
      historiqueStatuts: utilisateur.historiqueStatuts.slice(-3)
    }
  });
});

/**
 * @desc    Recalculer le score de confiance (Admin/System)
 * @route   POST /api/utilisateurs/:id/recalculer-score
 * @access  Admin
 */
exports.recalculerScore = asyncHandler(async (req, res, next) => {
  const utilisateur = await Utilisateur.findById(req.params.id);
  
  if (!utilisateur) {
    return next(new ErrorResponse('Utilisateur non trouvé', 404));
  }

  // Algorithme de calcul du score de confiance
  let score = 50; // Score de base

  // Facteurs positifs
  if (utilisateur.estDocumentVerifie) score += 20;
  if (utilisateur.photoProfil) score += 5;
  if (utilisateur.contactsUrgence.length > 0) score += 5;
  if (utilisateur.nombreTrajetsEffectues > 0) {
    score += Math.min(utilisateur.nombreTrajetsEffectues * 2, 20);
  }
  if (utilisateur.noteGenerale >= 4.5) score += 15;
  else if (utilisateur.noteGenerale >= 4) score += 10;
  else if (utilisateur.noteGenerale >= 3) score += 5;

  // Facteurs négatifs
  const tauxAnnulation = utilisateur.tauxAnnulation;
  if (tauxAnnulation > 30) score -= 25;
  else if (tauxAnnulation > 20) score -= 15;
  else if (tauxAnnulation > 10) score -= 10;
  else if (tauxAnnulation > 5) score -= 5;

  // Ancienneté du compte
  const ancienneteJours = Math.floor((Date.now() - utilisateur.dateInscription.getTime()) / (1000 * 60 * 60 * 24));
  if (ancienneteJours > 365) score += 10;
  else if (ancienneteJours > 180) score += 7;
  else if (ancienneteJours > 90) score += 5;
  else if (ancienneteJours > 30) score += 2;

  // Badges bonus
  if (utilisateur.badges.includes('TOP_RATED')) score += 10;
  if (utilisateur.badges.includes('VETERAN')) score += 5;
  if (utilisateur.badges.includes('PONCTUEL')) score += 3;

  // S'assurer que le score reste dans les limites
  score = Math.max(0, Math.min(100, score));

  // Mettre à jour le score
  utilisateur.scoreConfiance = score;
  await utilisateur.save({ validateBeforeSave: false });

  res.status(200).json({
    success: true,
    message: 'Score de confiance recalculé',
    data: {
      ancienScore: utilisateur.scoreConfiance,
      nouveauScore: score,
      facteurs: {
        documentVerifie: utilisateur.estDocumentVerifie,
        photoProfil: !!utilisateur.photoProfil,
        contactsUrgence: utilisateur.contactsUrgence.length,
        trajetsEffectues: utilisateur.nombreTrajetsEffectues,
        noteGenerale: utilisateur.noteGenerale,
        tauxAnnulation,
        ancienneteJours,
        badges: utilisateur.badges
      }
    }
  });
});

/**
 * @desc    Obtenir les statistiques globales (Admin)
 * @route   GET /api/utilisateurs/statistiques/globales
 * @access  Admin
 */
exports.getStatistiquesGlobales = asyncHandler(async (req, res, next) => {
  const statistiques = await Utilisateur.statistiquesGlobales();

  // Statistiques additionnelles
  const statsSupplementaires = await Utilisateur.aggregate([
    {
      $group: {
        _id: '$statutCompte',
        count: { $sum: 1 }
      }
    }
  ]);

  const repartitionStatuts = {};
  statsSupplementaires.forEach(stat => {
    repartitionStatuts[stat._id] = stat.count;
  });

  res.status(200).json({
    success: true,
    data: {
      ...statistiques,
      repartitionStatuts,
      dateCalcul: new Date()
    }
  });
});

// ========================================
// FONCTIONS UTILITAIRES
// ========================================

// Obtenir le token JWT, créer un cookie et envoyer la réponse
const sendTokenResponse = (user, statusCode, res, message = 'Succès') => {
  // Créer le token
  const token = user.getSignedJwtToken();

  const options = {
    expires: new Date(
      Date.now() + process.env.JWT_COOKIE_EXPIRE * 24 * 60 * 60 * 1000
    ),
    httpOnly: true
  };

  if (process.env.NODE_ENV === 'production') {
    options.secure = true;
  }

  // Exclure le mot de passe de la réponse
  const userData = user.toObject();
  delete userData.motDePasse;

  res.status(statusCode)
    .cookie('token', token, options)
    .json({
      success: true,
      message,
      token,
      data: userData
    });
};