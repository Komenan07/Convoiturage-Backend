const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { validationResult } = require('express-validator');
const mongoose = require('mongoose');

// Models
const Signalement = require('../models/Signalement');
const User = require('../models/Utilisateur');
const Trajet = require('../models/Trajet');
const Message = require('../models/Message');

// Utils
const { uploadToCloudinary } = require('../utils/cloudinaryConfig');
const notificationService = require('../services/notificationService');

// Configuration de Multer pour les preuves
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../temp/signalements');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname);
    cb(null, `preuve-${uniqueSuffix}${extension}`);
  }
});

// Filtrage des types de fichiers autorisés
const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'image/jpeg', 'image/png', 'image/gif',
    'application/pdf',
    'video/mp4', 'video/quicktime'
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Type de fichier non autorisé pour les preuves'), false);
  }
};

// Configuration Multer avec gestion d'erreur
const uploadPreuves = (req, res, next) => {
  const upload = multer({
    storage: storage,
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB maximum par fichier
      files: 5 // Maximum 5 fichiers
    },
    fileFilter: fileFilter
  }).array('preuves', 5);

  upload(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      let message = 'Erreur lors de l\'upload des fichiers';
      
      switch (err.code) {
        case 'LIMIT_FILE_SIZE':
          message = 'Fichier trop volumineux (max 10MB par fichier)';
          break;
        case 'LIMIT_FILE_COUNT':
          message = 'Trop de fichiers (max 5 fichiers)';
          break;
        case 'LIMIT_UNEXPECTED_FILE':
          message = 'Champ de fichier inattendu';
          break;
      }

      return res.status(400).json({
        success: false,
        message: message,
        code: 'UPLOAD_ERROR',
        details: err.message
      });
    }

    if (err) {
      return res.status(400).json({
        success: false,
        message: err.message || 'Erreur lors de l\'upload',
        code: 'FILE_ERROR'
      });
    }

    next();
  });
};

// Fonctions utilitaires internes

const validerDonnees = (req) => {
  const erreurs = validationResult(req);
  if (!erreurs.isEmpty()) {
    return {
      success: false,
      message: 'Données invalides',
      erreurs: erreurs.array(),
      code: 'VALIDATION_ERROR'
    };
  }
  return null;
};

const calculerPriorite = (typeSignalement, motif) => {
  const prioritesCritiques = [
    'MENACES', 'CONDUITE_DANGEREUSE', 'VEHICULE_NON_CONFORME',
    'USURPATION_IDENTITE', 'VIOLENCE_VERBALE'
  ];

  const prioritesHautes = [
    'HARCELEMENT', 'DISCRIMINATION', 'COMPORTEMENT_INAPPROPRIE',
    'FAUX_PROFIL', 'CONTENU_OFFENSANT'
  ];

  if (prioritesCritiques.includes(motif)) return 'CRITIQUE';
  if (prioritesHautes.includes(motif)) return 'HAUTE';
  if (typeSignalement === 'SECURITE') return 'HAUTE';
  if (typeSignalement === 'FRAUDE') return 'NORMALE';

  return 'BASSE';
};

const nettoyerFichiersTemp = (fichiers) => {
  if (fichiers && fichiers.length > 0) {
    fichiers.forEach(fichier => {
      fs.unlink(fichier.path, (err) => {
        if (err) console.error('Erreur suppression fichier temp:', err);
      });
    });
  }
};

const appliquerActionsDisciplinaires = async (userId, actions) => {
  try {
    const utilisateur = await User.findById(userId);
    if (!utilisateur) return false;

    for (const action of actions) {
      switch (action) {
        case 'AVERTISSEMENT':
          utilisateur.compteurAvertissements = (utilisateur.compteurAvertissements || 0) + 1;
          break;

        case 'SUSPENSION_1_JOUR':
          utilisateur.suspendJusqu = new Date(Date.now() + 24 * 60 * 60 * 1000);
          break;

        case 'SUSPENSION_7_JOURS':
          utilisateur.suspendJusqu = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
          break;

        case 'SUSPENSION_30_JOURS':
          utilisateur.suspendJusqu = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
          break;

        case 'BLOCAGE_DEFINITIF':
          utilisateur.statutCompte = 'BLOQUE';
          utilisateur.dateBlockage = new Date();
          break;

        case 'LIMITATION_FONCTIONNALITES':
          utilisateur.fonctionnalitesLimitees = true;
          break;

        case 'VERIFICATION_IDENTITE_REQUISE':
          utilisateur.verificationRequise = true;
          break;
      }
    }

    await utilisateur.save();
    
    // Gestion d'erreur pour les notifications
    try {
      if (notificationService && typeof notificationService.envoyerNotificationSanction === 'function') {
        await notificationService.envoyerNotificationSanction(utilisateur, actions);
      }
    } catch (notifError) {
      console.error('Erreur notification sanction:', notifError);
      // Continue sans faire échouer l'opération
    }

    return true;
  } catch (error) {
    console.error('Erreur application actions disciplinaires:', error);
    return false;
  }
};

// Validation des ObjectIds
const isValidObjectId = (id) => {
  return mongoose.Types.ObjectId.isValid(id);
};

// Fonction utilitaire pour obtenir l'ID utilisateur
const getUserId = (user) => {
  return user._id || user.id || user.userId;
};

// Contrôleurs principaux

const creerSignalement = async (req, res, _next) => {
  try {
    console.log('=== DEBUT CREATION SIGNALEMENT ===');

    // Normaliser l'ID utilisateur dès le début
    const userId = getUserId(req.user);

    // 1. Validation des données d'entrée
    const erreurValidation = validerDonnees(req);
    if (erreurValidation) {
      nettoyerFichiersTemp(req.files);
      return res.status(400).json(erreurValidation);
    }

    // 2. Vérification de l'utilisateur connecté
    if (!req.user || !userId) {
      nettoyerFichiersTemp(req.files);
      return res.status(401).json({
        success: false,
        message: 'Utilisateur non authentifié',
        code: 'UNAUTHORIZED'
      });
    }

    // 3. Extraction et validation des données
    const { signaleId, typeSignalement, motif, description, trajetId, messageId } = req.body;

    // Validation des champs obligatoires
    if (!signaleId || !typeSignalement || !motif || !description) {
      nettoyerFichiersTemp(req.files);
      return res.status(400).json({
        success: false,
        message: 'Champs obligatoires manquants',
        code: 'MISSING_REQUIRED_FIELDS',
        details: {
          signaleId: !signaleId ? 'requis' : 'ok',
          typeSignalement: !typeSignalement ? 'requis' : 'ok',
          motif: !motif ? 'requis' : 'ok',
          description: !description ? 'requis' : 'ok'
        }
      });
    }

    // Validation des ObjectIds
    if (!isValidObjectId(signaleId)) {
      nettoyerFichiersTemp(req.files);
      return res.status(400).json({
        success: false,
        message: 'ID utilisateur signalé invalide',
        code: 'INVALID_USER_ID'
      });
    }

    if (trajetId && !isValidObjectId(trajetId)) {
      nettoyerFichiersTemp(req.files);
      return res.status(400).json({
        success: false,
        message: 'ID trajet invalide',
        code: 'INVALID_TRAJET_ID'
      });
    }

    if (messageId && !isValidObjectId(messageId)) {
      nettoyerFichiersTemp(req.files);
      return res.status(400).json({
        success: false,
        message: 'ID message invalide',
        code: 'INVALID_MESSAGE_ID'
      });
    }

    // 4. Vérification auto-signalement
    if (signaleId === userId.toString()) {
      nettoyerFichiersTemp(req.files);
      return res.status(400).json({
        success: false,
        message: 'Vous ne pouvez pas vous signaler vous-même',
        code: 'SELF_REPORT_NOT_ALLOWED'
      });
    }

    // 5. Vérification de l'existence de l'utilisateur signalé
    const utilisateurSignale = await User.findById(signaleId);
    if (!utilisateurSignale) {
      nettoyerFichiersTemp(req.files);
      return res.status(404).json({
        success: false,
        message: 'Utilisateur signalé introuvable',
        code: 'USER_NOT_FOUND'
      });
    }

    // 6. Vérification du trajet si fourni
    let trajet = null;
    if (trajetId) {
      try {
        trajet = await Trajet.findById(trajetId);
        if (!trajet) {
          nettoyerFichiersTemp(req.files);
          return res.status(404).json({
            success: false,
            message: 'Trajet référencé introuvable',
            code: 'TRAJET_NOT_FOUND'
          });
        }
      } catch (trajetError) {
        console.error('Erreur recherche trajet:', trajetError);
        nettoyerFichiersTemp(req.files);
        return res.status(500).json({
          success: false,
          message: 'Erreur lors de la recherche du trajet',
          code: 'TRAJET_SEARCH_ERROR'
        });
      }
    }

    // 7. Vérification du message si fourni
    let message = null;
    if (messageId) {
      try {
        message = await Message.findById(messageId);
        if (!message) {
          nettoyerFichiersTemp(req.files);
          return res.status(404).json({
            success: false,
            message: 'Message référencé introuvable',
            code: 'MESSAGE_NOT_FOUND'
          });
        }
      } catch (messageError) {
        console.error('Erreur recherche message:', messageError);
        nettoyerFichiersTemp(req.files);
        return res.status(500).json({
          success: false,
          message: 'Erreur lors de la recherche du message',
          code: 'MESSAGE_SEARCH_ERROR'
        });
      }
    }

    // 8. Traitement des preuves
    let preuves = [];
    if (req.files && req.files.length > 0) {
      try {
        for (const fichier of req.files) {
          // Vérifier que le service Cloudinary est disponible
          if (!uploadToCloudinary || typeof uploadToCloudinary !== 'function') {
            throw new Error('Service de téléchargement non disponible');
          }

          const resultatUpload = await uploadToCloudinary(fichier.path, {
            folder: 'signalements/preuves',
            resource_type: fichier.mimetype.startsWith('video/') ? 'video' : 'image'
          });

          preuves.push({
            url: resultatUpload.secure_url,
            publicId: resultatUpload.public_id,
            nomOriginal: fichier.originalname,
            type: fichier.mimetype,
            taille: fichier.size
          });
        }

        nettoyerFichiersTemp(req.files);
        console.log(`${preuves.length} preuves uploadées avec succès`);
      } catch (uploadError) {
        nettoyerFichiersTemp(req.files);
        console.error('Erreur upload preuves:', uploadError);
        return res.status(500).json({
          success: false,
          message: 'Erreur lors du téléchargement des preuves',
          code: 'UPLOAD_ERROR',
          details: uploadError.message
        });
      }
    }

    // 9. Calcul de la priorité
    const priorite = calculerPriorite(typeSignalement, motif);

    // 10. Création du signalement
    const donneesSignalement = {
      rapportePar: userId,
      signaleId: new mongoose.Types.ObjectId(signaleId),
      typeSignalement,
      motif,
      description,
      preuves,
      priorite,
      statut: 'EN_ATTENTE',
      dateCreation: new Date()
    };

    // Ajouter les références optionnelles seulement si elles existent
    if (trajetId && trajet) {
      donneesSignalement.trajetId = new mongoose.Types.ObjectId(trajetId);
    }
    if (messageId && message) {
      donneesSignalement.messageId = new mongoose.Types.ObjectId(messageId);
    }

    let nouveauSignalement;
    try {
      nouveauSignalement = new Signalement(donneesSignalement);
      await nouveauSignalement.save();
      console.log('Signalement créé avec ID:', nouveauSignalement._id);
    } catch (saveError) {
      console.error('Erreur sauvegarde signalement:', saveError);
      return res.status(500).json({
        success: false,
        message: 'Erreur lors de la sauvegarde du signalement',
        code: 'SAVE_ERROR',
        details: saveError.message
      });
    }

    // 11. Population des données
    try {
      await nouveauSignalement.populate([
        { path: 'rapportePar', select: 'nom prenom email' },
        { path: 'signaleId', select: 'nom prenom email' }
      ]);
    } catch (populateError) {
      console.error('Erreur population:', populateError);
      // Continue même si la population échoue
    }

    // 12. Notifications pour priorité haute/critique
    if (['HAUTE', 'CRITIQUE'].includes(priorite)) {
      try {
        if (notificationService && typeof notificationService.notifierModerateursPriorite === 'function') {
          await notificationService.notifierModerateursPriorite(nouveauSignalement);
          console.log('Notification modérateurs envoyée');
        }
      } catch (notifError) {
        console.error('Erreur notification:', notifError);
        // Continue même si la notification échoue
      }
    }

    console.log('=== SIGNALEMENT CREE AVEC SUCCES ===');
    res.status(201).json({
      success: true,
      message: 'Signalement créé avec succès',
      data: {
        signalement: nouveauSignalement
      }
    });

  } catch (error) {
    console.error('=== ERREUR GENERALE CREATION SIGNALEMENT ===');
    console.error('Type:', error.constructor.name);
    console.error('Message:', error.message);
    console.error('Stack:', error.stack);
    
    nettoyerFichiersTemp(req.files);
    
    // Retourner une réponse JSON au lieu de laisser Express générer du HTML
    return res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la création du signalement',
      code: 'SERVER_ERROR',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Erreur interne'
    });
  }
};

const uploaderPreuves = async (req, res, _next) => {
  try {
    const userId = getUserId(req.user);
    const { signalementId } = req.body;

    if (!signalementId || !isValidObjectId(signalementId)) {
      nettoyerFichiersTemp(req.files);
      return res.status(400).json({
        success: false,
        message: 'ID signalement invalide',
        code: 'INVALID_SIGNALEMENT_ID'
      });
    }

    const signalement = await Signalement.findById(signalementId);
    if (!signalement) {
      nettoyerFichiersTemp(req.files);
      return res.status(404).json({
        success: false,
        message: 'Signalement introuvable',
        code: 'SIGNALEMENT_NOT_FOUND'
      });
    }

    if (signalement.rapportePar.toString() !== userId.toString()) {
      nettoyerFichiersTemp(req.files);
      return res.status(403).json({
        success: false,
        message: 'Non autorisé à modifier ce signalement',
        code: 'UNAUTHORIZED'
      });
    }

    if (signalement.statut !== 'EN_ATTENTE') {
      nettoyerFichiersTemp(req.files);
      return res.status(400).json({
        success: false,
        message: 'Ce signalement ne peut plus être modifié',
        code: 'SIGNALEMENT_NOT_MODIFIABLE'
      });
    }

    let nouvellesPreuves = [];
    if (req.files && req.files.length > 0) {
      try {
        for (const fichier of req.files) {
          const resultatUpload = await uploadToCloudinary(fichier.path, {
            folder: 'signalements/preuves',
            resource_type: fichier.mimetype.startsWith('video/') ? 'video' : 'image'
          });

          nouvellesPreuves.push({
            url: resultatUpload.secure_url,
            publicId: resultatUpload.public_id,
            nomOriginal: fichier.originalname,
            type: fichier.mimetype,
            taille: fichier.size
          });
        }

        nettoyerFichiersTemp(req.files);
      } catch (uploadError) {
        nettoyerFichiersTemp(req.files);
        return res.status(500).json({
          success: false,
          message: 'Erreur lors du téléchargement des preuves',
          code: 'UPLOAD_ERROR',
          details: uploadError.message
        });
      }
    }

    signalement.preuves.push(...nouvellesPreuves);
    signalement.dateModification = new Date();
    await signalement.save();

    res.json({
      success: true,
      message: 'Preuves ajoutées avec succès',
      data: {
        preuves: nouvellesPreuves,
        totalPreuves: signalement.preuves.length
      }
    });
  } catch (error) {
    nettoyerFichiersTemp(req.files);
    console.error('Erreur upload preuves:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de l\'upload des preuves',
      code: 'SERVER_ERROR',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Erreur interne'
    });
  }
};

const obtenirQueueModeration = async (req, res, _next) => {
  try {
    const erreurValidation = validerDonnees(req);
    if (erreurValidation) {
      return res.status(400).json(erreurValidation);
    }

    const userId = getUserId(req.user);
    const page = parseInt(req.query.page) || 1;
    const limite = parseInt(req.query.limite) || 20;
    const skip = (page - 1) * limite;

    let filtres = {};

    if (req.query.statut) {
      const statuts = req.query.statut.split(',');
      filtres.statut = { $in: statuts };
    } else {
      filtres.statut = { $in: ['EN_ATTENTE', 'EN_COURS'] };
    }

    if (req.query.priorite) filtres.priorite = req.query.priorite;
    if (req.query.type) filtres.typeSignalement = req.query.type;

    if (req.user.role === 'MODERATEUR') {
      filtres.$or = [
        { moderateurAssigne: userId },
        { moderateurAssigne: { $exists: false } }
      ];
    }

    const tri = {
      priorite: { 'CRITIQUE': 4, 'HAUTE': 3, 'NORMALE': 2, 'BASSE': 1 },
      dateCreation: -1
    };

    const [signalements, total] = await Promise.all([
      Signalement.find(filtres)
        .populate('rapportePar', 'nom prenom email photo')
        .populate('signaleId', 'nom prenom email photo')
        .populate('moderateurAssigne', 'nom prenom email')
        .populate('trajetId', 'depart destination dateDepart')
        .sort(tri)
        .skip(skip)
        .limit(limite),
      Signalement.countDocuments(filtres)
    ]);

    const statistiques = await Signalement.aggregate([
      { $match: filtres },
      {
        $group: {
          _id: '$statut',
          count: { $sum: 1 }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        signalements,
        pagination: {
          page,
          limite,
          total,
          pages: Math.ceil(total / limite)
        },
        statistiques: statistiques.reduce((acc, stat) => {
          acc[stat._id] = stat.count;
          return acc;
        }, {})
      }
    });
  } catch (error) {
    console.error('Erreur queue modération:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la récupération de la queue',
      code: 'SERVER_ERROR'
    });
  }
};

const obtenirHistoriqueSignalements = async (req, res, _next) => {
  try {
    const erreurValidation = validerDonnees(req);
    if (erreurValidation) {
      return res.status(400).json(erreurValidation);
    }

    const userId = getUserId(req.user);
    const page = parseInt(req.query.page) || 1;
    const limite = parseInt(req.query.limite) || 20;
    const skip = (page - 1) * limite;

    let filtres = {};

    if (req.query.userId) {
      if (req.user.role === 'ADMIN' || req.query.userId === userId.toString()) {
        if (!isValidObjectId(req.query.userId)) {
          return res.status(400).json({
            success: false,
            message: 'ID utilisateur invalide',
            code: 'INVALID_USER_ID'
          });
        }
        filtres.rapportePar = req.query.userId;
      } else {
        return res.status(403).json({
          success: false,
          message: 'Non autorisé à voir ces signalements',
          code: 'UNAUTHORIZED'
        });
      }
    }

    if (req.query.dateDebut || req.query.dateFin) {
      filtres.dateCreation = {};
      if (req.query.dateDebut) filtres.dateCreation.$gte = new Date(req.query.dateDebut);
      if (req.query.dateFin) filtres.dateCreation.$lte = new Date(req.query.dateFin);
    }

    if (req.query.statut) {
      const statuts = req.query.statut.split(',');
      filtres.statut = { $in: statuts };
    }

    const [signalements, total] = await Promise.all([
      Signalement.find(filtres)
        .populate('rapportePar', 'nom prenom email')
        .populate('signaleId', 'nom prenom email')
        .populate('moderateurAssigne', 'nom prenom')
        .populate('trajetId', 'depart destination dateDepart')
        .sort({ dateCreation: -1 })
        .skip(skip)
        .limit(limite),
      Signalement.countDocuments(filtres)
    ]);

    res.json({
      success: true,
      data: {
        signalements,
        pagination: {
          page,
          limite,
          total,
          pages: Math.ceil(total / limite)
        }
      }
    });
  } catch (error) {
    console.error('Erreur historique signalements:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la récupération de l\'historique',
      code: 'SERVER_ERROR'
    });
  }
};

const obtenirSignalement = async (req, res, _next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: 'ID signalement invalide',
        code: 'INVALID_SIGNALEMENT_ID'
      });
    }

    const signalement = await Signalement.findById(req.params.id)
      .populate('rapportePar', 'nom prenom email photo')
      .populate('signaleId', 'nom prenom email photo compteurAvertissements suspendJusqu')
      .populate('moderateurAssigne', 'nom prenom email')
      .populate('trajetId', 'depart destination dateDepart prix')
      .populate('messageId', 'contenu dateEnvoi');

    if (!signalement) {
      return res.status(404).json({
        success: false,
        message: 'Signalement introuvable',
        code: 'SIGNALEMENT_NOT_FOUND'
      });
    }

    const historiqueActions = await Signalement.findById(req.params.id)
      .select('historique')
      .populate('historique.moderateur', 'nom prenom');

    res.json({
      success: true,
      data: {
        signalement: {
          ...signalement.toObject(),
          historique: historiqueActions.historique
        }
      }
    });
  } catch (error) {
    console.error('Erreur récupération signalement:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la récupération du signalement',
      code: 'SERVER_ERROR'
    });
  }
};

const traiterSignalement = async (req, res, _next) => {
  try {
    const erreurValidation = validerDonnees(req);
    if (erreurValidation) {
      return res.status(400).json(erreurValidation);
    }

    const userId = getUserId(req.user);

    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: 'ID signalement invalide',
        code: 'INVALID_SIGNALEMENT_ID'
      });
    }

    const { action, actionsDisciplinaires = [], commentaire } = req.body;

    if (!['APPROUVER', 'REJETER'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'Action invalide',
        code: 'INVALID_ACTION'
      });
    }

    const signalement = await Signalement.findById(req.params.id)
      .populate('rapportePar', 'nom prenom email')
      .populate('signaleId', 'nom prenom email');

    if (!signalement) {
      return res.status(404).json({
        success: false,
        message: 'Signalement introuvable',
        code: 'SIGNALEMENT_NOT_FOUND'
      });
    }

    if (!['EN_ATTENTE', 'EN_COURS'].includes(signalement.statut)) {
      return res.status(400).json({
        success: false,
        message: 'Ce signalement a déjà été traité',
        code: 'ALREADY_PROCESSED'
      });
    }

    if (req.user.role === 'MODERATEUR' &&
        signalement.moderateurAssigne &&
        signalement.moderateurAssigne.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Vous n\'êtes pas assigné à ce signalement',
        code: 'NOT_ASSIGNED'
      });
    }

    let nouveauStatut;
    if (action === 'APPROUVER') {
      nouveauStatut = 'TRAITE';

      if (actionsDisciplinaires.length > 0) {
        const succes = await appliquerActionsDisciplinaires(
          signalement.signaleId._id,
          actionsDisciplinaires
        );

        if (!succes) {
          return res.status(500).json({
            success: false,
            message: 'Erreur lors de l\'application des sanctions',
            code: 'SANCTIONS_ERROR'
          });
        }
      }
    } else {
      nouveauStatut = 'REJETE';
    }

    signalement.statut = nouveauStatut;
    signalement.dateTraitement = new Date();
    signalement.traitePar = userId;
    signalement.actionsDisciplinaires = actionsDisciplinaires;
    signalement.commentaireModeration = commentaire;

    signalement.historique.push({
      action: action,
      moderateur: userId,
      date: new Date(),
      commentaire: commentaire || `Signalement ${action.toLowerCase()}`
    });

    await signalement.save();

    // Notifications avec gestion d'erreur
    try {
      if (notificationService) {
        await Promise.all([
          typeof notificationService.notifierRapporteur === 'function' ? 
            notificationService.notifierRapporteur(signalement, action) : Promise.resolve(),
          action === 'APPROUVER' && typeof notificationService.notifierUtilisateurSignale === 'function' ?
            notificationService.notifierUtilisateurSignale(signalement, actionsDisciplinaires) :
            Promise.resolve()
        ]);
      }
    } catch (notifError) {
      console.error('Erreur notifications:', notifError);
      // Continue sans faire échouer l'opération
    }

    res.json({
      success: true,
      message: `Signalement ${action.toLowerCase()} avec succès`,
      data: {
        signalement,
        actionsDisciplinaires: actionsDisciplinaires
      }
    });
  } catch (error) {
    console.error('Erreur traitement signalement:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur serveur lors du traitement du signalement',
      code: 'SERVER_ERROR'
    });
  }
};

const assignerModerateur = async (req, res, _next) => {
  try {
    const erreurValidation = validerDonnees(req);
    if (erreurValidation) {
      return res.status(400).json(erreurValidation);
    }

    const userId = getUserId(req.user);

    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: 'ID signalement invalide',
        code: 'INVALID_SIGNALEMENT_ID'
      });
    }

    const { moderateurId } = req.body;

    if (!moderateurId || !isValidObjectId(moderateurId)) {
      return res.status(400).json({
        success: false,
        message: 'ID modérateur invalide',
        code: 'INVALID_MODERATOR_ID'
      });
    }

    const moderateur = await User.findById(moderateurId);
    if (!moderateur || !['ADMIN', 'MODERATEUR'].includes(moderateur.role)) {
      return res.status(404).json({
        success: false,
        message: 'Modérateur introuvable ou rôle invalide',
        code: 'MODERATOR_NOT_FOUND'
      });
    }

    const signalement = await Signalement.findById(req.params.id);
    if (!signalement) {
      return res.status(404).json({
        success: false,
        message: 'Signalement introuvable',
        code: 'SIGNALEMENT_NOT_FOUND'
      });
    }

    if (!['EN_ATTENTE', 'EN_COURS'].includes(signalement.statut)) {
      return res.status(400).json({
        success: false,
        message: 'Ce signalement ne peut plus être assigné',
        code: 'NOT_ASSIGNABLE'
      });
    }

    signalement.moderateurAssigne = moderateurId;
    signalement.statut = 'EN_COURS';
    signalement.dateAssignation = new Date();

    signalement.historique.push({
      action: 'ASSIGNE',
      moderateur: userId,
      date: new Date(),
      commentaire: `Assigné à ${moderateur.nom} ${moderateur.prenom}`
    });

    await signalement.save();

    // Notification avec gestion d'erreur
    try {
      if (notificationService && typeof notificationService.notifierAssignationModerateur === 'function') {
        await notificationService.notifierAssignationModerateur(moderateur, signalement);
      }
    } catch (notifError) {
      console.error('Erreur notification assignation:', notifError);
    }

    await signalement.populate([
      { path: 'moderateurAssigne', select: 'nom prenom email' },
      { path: 'rapportePar', select: 'nom prenom' },
      { path: 'signaleId', select: 'nom prenom' }
    ]);

    res.json({
      success: true,
      message: 'Modérateur assigné avec succès',
      data: {
        signalement
      }
    });
  } catch (error) {
    console.error('Erreur assignation modérateur:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de l\'assignation',
      code: 'SERVER_ERROR'
    });
  }
};

const classerSignalement = async (req, res, _next) => {
  try {
    const erreurValidation = validerDonnees(req);
    if (erreurValidation) {
      return res.status(400).json(erreurValidation);
    }

    const userId = getUserId(req.user);

    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: 'ID signalement invalide',
        code: 'INVALID_SIGNALEMENT_ID'
      });
    }

    const { raison } = req.body;

    const signalement = await Signalement.findById(req.params.id);
    if (!signalement) {
      return res.status(404).json({
        success: false,
        message: 'Signalement introuvable',
        code: 'SIGNALEMENT_NOT_FOUND'
      });
    }

    if (signalement.statut === 'TRAITE') {
      return res.status(400).json({
        success: false,
        message: 'Ce signalement a déjà été traité',
        code: 'ALREADY_PROCESSED'
      });
    }

    if (req.user.role === 'MODERATEUR' &&
        signalement.moderateurAssigne &&
        signalement.moderateurAssigne.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Vous n\'êtes pas assigné à ce signalement',
        code: 'NOT_ASSIGNED'
      });
    }

    signalement.statut = 'CLASSE_SANS_SUITE';
    signalement.dateTraitement = new Date();
    signalement.traitePar = userId;
    signalement.commentaireModeration = raison || 'Classé sans suite';

    signalement.historique.push({
      action: 'CLASSE_SANS_SUITE',
      moderateur: userId,
      date: new Date(),
      commentaire: raison || 'Classé sans suite'
    });

    await signalement.save();

    // Notification avec gestion d'erreur
    try {
      if (notificationService && typeof notificationService.notifierClassementSansSuite === 'function') {
        await notificationService.notifierClassementSansSuite(signalement);
      }
    } catch (notifError) {
      console.error('Erreur notification classement:', notifError);
    }

    res.json({
      success: true,
      message: 'Signalement classé sans suite',
      data: {
        signalement
      }
    });
  } catch (error) {
    console.error('Erreur classement signalement:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur serveur lors du classement',
      code: 'SERVER_ERROR'
    });
  }
};

const rechercherSignalements = async (req, res, _next) => {
  try {
    const erreurValidation = validerDonnees(req);
    if (erreurValidation) {
      return res.status(400).json(erreurValidation);
    }

    const page = parseInt(req.query.page) || 1;
    const limite = parseInt(req.query.limite) || 20;
    const skip = (page - 1) * limite;

    // Validation des paramètres de pagination
    if (page < 1 || limite < 1 || limite > 100) {
      return res.status(400).json({
        success: false,
        message: 'Paramètres de pagination invalides',
        code: 'INVALID_PAGINATION'
      });
    }

    let filtres = {};

    if (req.query.q) {
      filtres.$or = [
        { description: { $regex: req.query.q, $options: 'i' } },
        { commentaireModeration: { $regex: req.query.q, $options: 'i' } }
      ];
    }

    if (req.query.type) filtres.typeSignalement = req.query.type;
    if (req.query.motif) filtres.motif = { $regex: req.query.motif, $options: 'i' };
    if (req.query.priorite) filtres.priorite = req.query.priorite;
    
    if (req.query.moderateurId) {
      if (!isValidObjectId(req.query.moderateurId)) {
        return res.status(400).json({
          success: false,
          message: 'ID modérateur invalide',
          code: 'INVALID_MODERATOR_ID'
        });
      }
      filtres.moderateurAssigne = req.query.moderateurId;
    }

    if (req.query.statut) {
      const statuts = req.query.statut.split(',');
      filtres.statut = { $in: statuts };
    }

    if (req.query.dateDebut || req.query.dateFin) {
      filtres.dateCreation = {};
      if (req.query.dateDebut) {
        const dateDebut = new Date(req.query.dateDebut);
        if (isNaN(dateDebut.getTime())) {
          return res.status(400).json({
            success: false,
            message: 'Date de début invalide',
            code: 'INVALID_START_DATE'
          });
        }
        filtres.dateCreation.$gte = dateDebut;
      }
      if (req.query.dateFin) {
        const dateFin = new Date(req.query.dateFin);
        if (isNaN(dateFin.getTime())) {
          return res.status(400).json({
            success: false,
            message: 'Date de fin invalide',
            code: 'INVALID_END_DATE'
          });
        }
        filtres.dateCreation.$lte = dateFin;
      }
    }

    const pipeline = [
      { $match: filtres },
      {
        $lookup: {
          from: 'users',
          localField: 'rapportePar',
          foreignField: '_id',
          as: 'rapporteur'
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: 'signaleId',
          foreignField: '_id',
          as: 'signale'
        }
      },
      {
        $lookup: {
          from: 'users',
          localField: 'moderateurAssigne',
          foreignField: '_id',
          as: 'moderateur'
        }
      },
      {
        $addFields: {
          rapporteur: { $arrayElemAt: ['$rapporteur', 0] },
          signale: { $arrayElemAt: ['$signale', 0] },
          moderateur: { $arrayElemAt: ['$moderateur', 0] }
        }
      },
      { $sort: { dateCreation: -1 } },
      {
        $facet: {
          signalements: [
            { $skip: skip },
            { $limit: limite }
          ],
          total: [
            { $count: 'count' }
          ]
        }
      }
    ];

    const [resultats] = await Signalement.aggregate(pipeline);
    const signalements = resultats.signalements;
    const total = resultats.total[0]?.count || 0;

    res.json({
      success: true,
      data: {
        signalements,
        pagination: {
          page,
          limite,
          total,
          pages: Math.ceil(total / limite)
        },
        filtres: req.query
      }
    });
  } catch (error) {
    console.error('Erreur recherche signalements:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la recherche',
      code: 'SERVER_ERROR'
    });
  }
};

const obtenirStatistiquesModeration = async (req, res, _next) => {
  try {
    const erreurValidation = validerDonnees(req);
    if (erreurValidation) {
      return res.status(400).json(erreurValidation);
    }

    const dateFin = req.query.dateFin ? new Date(req.query.dateFin) : new Date();
    const dateDebut = req.query.dateDebut ?
      new Date(req.query.dateDebut) :
      new Date(dateFin.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Validation des dates
    if (isNaN(dateDebut.getTime()) || isNaN(dateFin.getTime())) {
      return res.status(400).json({
        success: false,
        message: 'Dates invalides',
        code: 'INVALID_DATES'
      });
    }

    if (dateDebut > dateFin) {
      return res.status(400).json({
        success: false,
        message: 'La date de début doit être antérieure à la date de fin',
        code: 'INVALID_DATE_RANGE'
      });
    }

    const filtres = {
      dateCreation: { $gte: dateDebut, $lte: dateFin }
    };

    if (req.query.moderateurId) {
      if (!isValidObjectId(req.query.moderateurId)) {
        return res.status(400).json({
          success: false,
          message: 'ID modérateur invalide',
          code: 'INVALID_MODERATOR_ID'
        });
      }
      filtres.traitePar = req.query.moderateurId;
    }

    const [
      statistiquesGenerales,
      repartitionTypes,
      repartitionMotifs,
      repartitionPriorites,
      evolutionTemporelle,
      performanceModerateurs,
      tempsTraitementMoyen
    ] = await Promise.all([
      Signalement.aggregate([
        { $match: filtres },
        {
          $group: {
            _id: '$statut',
            count: { $sum: 1 }
          }
        }
      ]),
      Signalement.aggregate([
        { $match: filtres },
        {
          $group: {
            _id: '$typeSignalement',
            count: { $sum: 1 }
          }
        }
      ]),
      Signalement.aggregate([
        { $match: filtres },
        {
          $group: {
            _id: '$motif',
            count: { $sum: 1 }
          }
        },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ]),
      Signalement.aggregate([
        { $match: filtres },
        {
          $group: {
            _id: '$priorite',
            count: { $sum: 1 }
          }
        }
      ]),
      Signalement.aggregate([
        { $match: filtres },
        {
          $group: {
            _id: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$dateCreation'
              }
            },
            nouveaux: { $sum: 1 },
            traites: {
              $sum: {
                $cond: [
                  { $in: ['$statut', ['TRAITE', 'REJETE', 'CLASSE_SANS_SUITE']] },
                  1,
                  0
                ]
              }
            }
          }
        },
        { $sort: { '_id': 1 } }
      ]),
      Signalement.aggregate([
        {
          $match: {
            ...filtres,
            traitePar: { $exists: true },
            statut: { $in: ['TRAITE', 'REJETE', 'CLASSE_SANS_SUITE'] }
          }
        },
        {
          $lookup: {
            from: 'users',
            localField: 'traitePar',
            foreignField: '_id',
            as: 'moderateur'
          }
        },
        {
          $unwind: '$moderateur'
        },
        {
          $group: {
            _id: '$traitePar',
            nom: { $first: '$moderateur.nom' },
            prenom: { $first: '$moderateur.prenom' },
            signalementsTraites: { $sum: 1 },
            approuves: {
              $sum: { $cond: [{ $eq: ['$statut', 'TRAITE'] }, 1, 0] }
            },
            rejetes: {
              $sum: { $cond: [{ $eq: ['$statut', 'REJETE'] }, 1, 0] }
            },
            classes: {
              $sum: { $cond: [{ $eq: ['$statut', 'CLASSE_SANS_SUITE'] }, 1, 0] }
            }
          }
        },
        { $sort: { signalementsTraites: -1 } }
      ]),
      Signalement.aggregate([
        {
          $match: {
            ...filtres,
            dateTraitement: { $exists: true }
          }
        },
        {
          $addFields: {
            tempsTraitement: {
              $divide: [
                { $subtract: ['$dateTraitement', '$dateCreation'] },
                1000 * 60 * 60
              ]
            }
          }
        },
        {
          $group: {
            _id: null,
            tempsTraitementMoyen: { $avg: '$tempsTraitement' },
            tempsTraitementMedian: { $avg: '$tempsTraitement' },
            tempsMin: { $min: '$tempsTraitement' },
            tempsMax: { $max: '$tempsTraitement' }
          }
        }
      ])
    ]);

    const statistiques = {
      periode: {
        dateDebut: dateDebut.toISOString(),
        dateFin: dateFin.toISOString()
      },
      general: statistiquesGenerales.reduce((acc, stat) => {
        acc[stat._id] = stat.count;
        return acc;
      }, {}),
      repartitionTypes: repartitionTypes.reduce((acc, stat) => {
        acc[stat._id] = stat.count;
        return acc;
      }, {}),
      topMotifs: repartitionMotifs,
      repartitionPriorites: repartitionPriorites.reduce((acc, stat) => {
        acc[stat._id] = stat.count;
        return acc;
      }, {}),
      evolutionTemporelle: evolutionTemporelle,
      performanceModerateurs: performanceModerateurs,
      tempsTraitement: tempsTraitementMoyen[0] || {
        tempsTraitementMoyen: 0,
        tempsMin: 0,
        tempsMax: 0
      }
    };

    res.json({
      success: true,
      data: statistiques
    });
  } catch (error) {
    console.error('Erreur statistiques modération:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur serveur lors du calcul des statistiques',
      code: 'SERVER_ERROR'
    });
  }
};

const obtenirMetriquesTempsReel = async (req, res, _next) => {
  try {
    const hier = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [
      signalements24h,
      enAttente,
      enCours,
      tempsAttenteMoyen,
      chargeModerateurs
    ] = await Promise.all([
      Signalement.countDocuments({
        dateCreation: { $gte: hier }
      }),
      Signalement.countDocuments({
        statut: 'EN_ATTENTE'
      }),
      Signalement.countDocuments({
        statut: 'EN_COURS'
      }),
      Signalement.aggregate([
        {
          $match: {
            statut: { $in: ['EN_ATTENTE', 'EN_COURS'] }
          }
        },
        {
          $addFields: {
            tempsAttente: {
              $divide: [
                { $subtract: [new Date(), '$dateCreation'] },
                1000 * 60 * 60
              ]
            }
          }
        },
        {
          $group: {
            _id: null,
            tempsAttenteMoyen: { $avg: '$tempsAttente' }
          }
        }
      ]),
      Signalement.aggregate([
        {
          $match: {
            statut: 'EN_COURS',
            moderateurAssigne: { $exists: true }
          }
        },
        {
          $lookup: {
            from: 'users',
            localField: 'moderateurAssigne',
            foreignField: '_id',
            as: 'moderateur'
          }
        },
        {
          $unwind: '$moderateur'
        },
        {
          $group: {
            _id: '$moderateurAssigne',
            nom: { $first: '$moderateur.nom' },
            prenom: { $first: '$moderateur.prenom' },
            signalementsEnCours: { $sum: 1 }
          }
        },
        { $sort: { signalementsEnCours: -1 } }
      ])
    ]);

    const alertes = [];

    if (enAttente > 50) {
      alertes.push({
        type: 'CHARGE_ELEVEE',
        message: `${enAttente} signalements en attente`,
        niveau: 'CRITIQUE'
      });
    }

    const tempsAttenteMoyenHeures = tempsAttenteMoyen[0]?.tempsAttenteMoyen || 0;
    if (tempsAttenteMoyenHeures > 48) {
      alertes.push({
        type: 'TEMPS_ATTENTE_LONG',
        message: `Temps d'attente moyen: ${Math.round(tempsAttenteMoyenHeures)}h`,
        niveau: 'HAUTE'
      });
    }

    res.json({
      success: true,
      data: {
        metriques: {
          signalements24h,
          enAttente,
          enCours,
          tempsAttenteMoyenHeures: Math.round(tempsAttenteMoyenHeures * 10) / 10,
          chargeModerateurs
        },
        alertes,
        derniereMAJ: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Erreur métriques temps réel:', error);
    return res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la récupération des métriques',
      code: 'SERVER_ERROR'
    });
  }
};

// Fonctions utilitaires publiques

const nettoyerSignalementsExpires = async () => {
  try {
    const il90jours = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    const signalementSupprimes = await Signalement.deleteMany({
      statut: 'CLASSE_SANS_SUITE',
      dateTraitement: { $lt: il90jours }
    });

    console.log(`${signalementSupprimes.deletedCount} signalements expirés supprimés`);
    return signalementSupprimes.deletedCount;
  } catch (error) {
    console.error('Erreur nettoyage signalements expirés:', error);
    return 0;
  }
};

const obtenirSignalementsUtilisateur = async (userId) => {
  try {
    if (!isValidObjectId(userId)) {
      console.error('ID utilisateur invalide:', userId);
      return [];
    }

    return await Signalement.find({
      $or: [
        { rapportePar: userId },
        { signaleId: userId }
      ]
    })
    .populate('rapportePar', 'nom prenom')
    .populate('signaleId', 'nom prenom')
    .sort({ dateCreation: -1 });
  } catch (error) {
    console.error('Erreur récupération signalements utilisateur:', error);
    return [];
  }
};

const verifierSignalementsEnCours = async (userId) => {
  try {
    if (!isValidObjectId(userId)) {
      console.error('ID utilisateur invalide:', userId);
      return false;
    }

    const count = await Signalement.countDocuments({
      signaleId: userId,
      statut: { $in: ['EN_ATTENTE', 'EN_COURS'] }
    });
    return count > 0;
  } catch (error) {
    console.error('Erreur vérification signalements:', error);
    return false;
  }
};

const escaladerSignalementsUrgents = async () => {
  try {
    const seuil = new Date(Date.now() - 2 * 60 * 60 * 1000);

    const signalements = await Signalement.find({
      priorite: 'CRITIQUE',
      statut: 'EN_ATTENTE',
      dateCreation: { $lt: seuil }
    }).populate('rapportePar signaleId', 'nom prenom email');

    for (const signalement of signalements) {
      try {
        if (notificationService && typeof notificationService.notifierEscalade === 'function') {
          await notificationService.notifierEscalade(signalement);
        }

        signalement.escalade = true;
        signalement.dateEscalade = new Date();
        await signalement.save();
      } catch (escaladeError) {
        console.error(`Erreur escalade signalement ${signalement._id}:`, escaladeError);
      }
    }

    return signalements.length;
  } catch (error) {
    console.error('Erreur escalade signalements:', error);
    return 0;
  }
};

// Exports

module.exports = {
  uploadPreuves,
  creerSignalement,
  uploaderPreuves,
  obtenirQueueModeration,
  obtenirHistoriqueSignalements,
  obtenirSignalement,
  traiterSignalement,
  assignerModerateur,
  classerSignalement,
  rechercherSignalements,
  obtenirStatistiquesModeration,
  obtenirMetriquesTempsReel,
  nettoyerSignalementsExpires,
  obtenirSignalementsUtilisateur,
  verifierSignalementsEnCours,
  escaladerSignalementsUrgents,
  _calculerPriorite: calculerPriorite,
  _appliquerActionsDisciplinaires: appliquerActionsDisciplinaires
};