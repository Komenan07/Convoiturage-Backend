// controllers/auth/utilisateurController.js
const User = require('../../models/Utilisateur');
const { logger } = require('../../utils/logger');
const AppError = require('../../utils/constants/errorConstants');
//const sendEmail = require('../../utils/emailService');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

// Configuration multer pour l'upload de fichiers
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = path.join(process.cwd(), 'uploads', 'users');
    // Créer le dossier s'il n'existe pas
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname);
    const prefix = file.fieldname === 'photoProfil' ? 'profil' : 'document';
    cb(null, `${prefix}-${req.user.userId}-${uniqueSuffix}${extension}`);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Type de fichier non autorisé. Seuls JPEG, PNG et GIF sont acceptés.'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  }
});

/**
 * Mettre à jour le profil utilisateur
 */
const mettreAJourProfil = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const updateData = req.body;

    // Champs autorisés pour la mise à jour
    const champsAutorises = [
      'nom', 'prenom', 'dateNaissance', 'sexe', 'photoProfil',
      'adresse', 'preferences', 'contactsUrgence'
    ];

    // Filtrer les données pour ne garder que les champs autorisés
    const donneesFiltre = {};
    Object.keys(updateData).forEach(key => {
      if (champsAutorises.includes(key)) {
        donneesFiltre[key] = updateData[key];
      }
    });

    if (Object.keys(donneesFiltre).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Aucune donnée valide à mettre à jour',
        champsAutorises
      });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      donneesFiltre,
      { 
        new: true, 
        runValidators: true,
        select: '-motDePasse -tokenConfirmationEmail -expirationTokenConfirmation -tokenResetMotDePasse -expirationTokenReset -codeSMS -expirationCodeSMS'
      }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    logger.info('Profil mis à jour', { userId, champsModifies: Object.keys(donneesFiltre) });

    res.json({
      success: true,
      message: 'Profil mis à jour avec succès',
      user: {
        id: user._id,
        nom: user.nom,
        prenom: user.prenom,
        nomComplet: user.nomComplet,
        email: user.email,
        telephone: user.telephone,
        dateNaissance: user.dateNaissance,
        age: user.age,
        sexe: user.sexe,
        photoProfil: user.photoProfil,
        role: user.role,
        adresse: user.adresse,
        preferences: user.preferences,
        contactsUrgence: user.contactsUrgence,
        compteCovoiturage: user.obtenirResumeCompte()
      }
    });

  } catch (error) {
    logger.error('Erreur mise à jour profil:', error);
    
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

/**
 * Upload photo de profil
 */
const uploadPhotoProfil = async (req, res, next) => {
  try {
    const uploadSingle = upload.single('photoProfil');
    
    uploadSingle(req, res, async (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            success: false,
            message: 'Fichier trop volumineux. Taille maximum : 5MB'
          });
        }
        return res.status(400).json({
          success: false,
          message: 'Erreur d\'upload : ' + err.message
        });
      } else if (err) {
        return res.status(400).json({
          success: false,
          message: err.message
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'Aucun fichier fourni'
        });
      }

      try {
        const userId = req.user.userId;
        const photoUrl = `/uploads/users/${req.file.filename}`;

        const user = await User.findByIdAndUpdate(
          userId,
          { photoProfil: photoUrl },
          { new: true, select: '-motDePasse' }
        );

        if (!user) {
          // Supprimer le fichier uploadé si l'utilisateur n'existe pas
          fs.unlinkSync(req.file.path);
          return res.status(404).json({
            success: false,
            message: 'Utilisateur non trouvé'
          });
        }

        logger.info('Photo de profil uploadée', { userId, filename: req.file.filename });

        res.json({
          success: true,
          message: 'Photo de profil mise à jour avec succès',
          photoProfil: photoUrl
        });

      } catch (dbError) {
        // Supprimer le fichier en cas d'erreur de base de données
        if (req.file) {
          fs.unlinkSync(req.file.path);
        }
        throw dbError;
      }
    });

  } catch (error) {
    logger.error('Erreur upload photo profil:', error);
    return next(AppError.serverError('Erreur serveur lors de l\'upload', { 
      originalError: error.message 
    }));
  }
};

/**
 * Upload document d'identité
 */
const uploadDocumentIdentite = async (req, res, next) => {
  try {
    const uploadSingle = upload.single('documentIdentite');
    
    uploadSingle(req, res, async (err) => {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            success: false,
            message: 'Fichier trop volumineux. Taille maximum : 5MB'
          });
        }
        return res.status(400).json({
          success: false,
          message: 'Erreur d\'upload : ' + err.message
        });
      } else if (err) {
        return res.status(400).json({
          success: false,
          message: err.message
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'Aucun fichier fourni'
        });
      }

      const { type, numero } = req.body;

      if (!type || !numero) {
        // Supprimer le fichier uploadé
        fs.unlinkSync(req.file.path);
        return res.status(400).json({
          success: false,
          message: 'Type de document et numéro sont requis'
        });
      }

      if (!['CNI', 'PASSEPORT'].includes(type)) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({
          success: false,
          message: 'Type de document invalide. Utilisez CNI ou PASSEPORT'
        });
      }

      try {
        const userId = req.user.userId;
        const documentUrl = `/uploads/users/${req.file.filename}`;

        const user = await User.findById(userId);
        if (!user) {
          fs.unlinkSync(req.file.path);
          return res.status(404).json({
            success: false,
            message: 'Utilisateur non trouvé'
          });
        }

        // Mettre à jour les informations du document
        user.documentIdentite = {
          type: type,
          numero: numero,
          photoDocument: documentUrl,
          statutVerification: 'EN_ATTENTE',
          dateVerification: null,
          verificateurId: null,
          raisonRejet: null
        };

        await user.save();

        logger.info('Document d\'identité uploadé', { 
          userId, 
          type, 
          filename: req.file.filename 
        });

        res.json({
          success: true,
          message: 'Document d\'identité soumis avec succès. En attente de vérification.',
          documentIdentite: {
            type: user.documentIdentite.type,
            numero: user.documentIdentite.numero,
            statutVerification: user.documentIdentite.statutVerification,
            photoDocument: user.documentIdentite.photoDocument
          }
        });

      } catch (dbError) {
        if (req.file) {
          fs.unlinkSync(req.file.path);
        }
        throw dbError;
      }
    });

  } catch (error) {
    logger.error('Erreur upload document identité:', error);
    return next(AppError.serverError('Erreur serveur lors de l\'upload', { 
      originalError: error.message 
    }));
  }
};

/**
 * Changer le mot de passe
 */
const changerMotDePasse = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const { motDePasseActuel, nouveauMotDePasse } = req.body;

    if (!motDePasseActuel || !nouveauMotDePasse) {
      return res.status(400).json({
        success: false,
        message: 'Mot de passe actuel et nouveau mot de passe sont requis'
      });
    }

    // Récupérer l'utilisateur avec le mot de passe
    const user = await User.findById(userId).select('+motDePasse');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    // Vérifier le mot de passe actuel
    const isMatch = await user.verifierMotDePasse(motDePasseActuel);
    if (!isMatch) {
      logger.warn('Changement mot de passe - Mot de passe actuel incorrect', { userId });
      return res.status(401).json({
        success: false,
        message: 'Mot de passe actuel incorrect',
        champ: 'motDePasseActuel'
      });
    }

    // Le nouveau mot de passe sera hashé par le middleware pre-save
    user.motDePasse = nouveauMotDePasse;
    await user.save();

    logger.info('Mot de passe changé avec succès', { userId });

    res.json({
      success: true,
      message: 'Mot de passe changé avec succès'
    });

  } catch (error) {
    logger.error('Erreur changement mot de passe:', error);
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Erreur de validation du nouveau mot de passe',
        details: messages
      });
    }

    return next(AppError.serverError('Erreur serveur lors du changement de mot de passe', { 
      originalError: error.message 
    }));
  }
};

/**
 * Mettre à jour les informations du véhicule (pour conducteurs)
 */
const mettreAJourVehicule = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const vehiculeData = req.body;

    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    // Vérifier que l'utilisateur peut être conducteur
    if (user.role !== 'conducteur' && user.role !== 'les_deux') {
      return res.status(403).json({
        success: false,
        message: 'Seuls les conducteurs peuvent mettre à jour les informations du véhicule'
      });
    }

    // Champs autorisés pour le véhicule
    const champsVehiculeAutorises = [
      'marque', 'modele', 'couleur', 'immatriculation', 'nombrePlaces',
      'photoVehicule', 'assurance', 'visiteTechnique'
    ];

    // Filtrer les données du véhicule
    const vehiculeFiltre = {};
    Object.keys(vehiculeData).forEach(key => {
      if (champsVehiculeAutorises.includes(key)) {
        vehiculeFiltre[key] = vehiculeData[key];
      }
    });

    if (Object.keys(vehiculeFiltre).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Aucune donnée valide à mettre à jour pour le véhicule',
        champsAutorises: champsVehiculeAutorises
      });
    }

    // Mettre à jour le véhicule
    user.vehicule = { ...user.vehicule, ...vehiculeFiltre };
    await user.save();

    logger.info('Informations véhicule mises à jour', { userId, champsModifies: Object.keys(vehiculeFiltre) });

    res.json({
      success: true,
      message: 'Informations du véhicule mises à jour avec succès',
      vehicule: user.vehicule
    });

  } catch (error) {
    logger.error('Erreur mise à jour véhicule:', error);
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Erreur de validation des données du véhicule',
        details: messages
      });
    }

    return next(AppError.serverError('Erreur serveur lors de la mise à jour du véhicule', { 
      originalError: error.message 
    }));
  }
};

/**
 * Mettre à jour les coordonnées géographiques
 */
const mettreAJourCoordonnees = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const { longitude, latitude, commune, quartier, ville } = req.body;

    if (!longitude || !latitude) {
      return res.status(400).json({
        success: false,
        message: 'Longitude et latitude sont requis'
      });
    }

    // Validation des coordonnées
    if (longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
      return res.status(400).json({
        success: false,
        message: 'Coordonnées invalides'
      });
    }

    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    // Mettre à jour les coordonnées et l'adresse
    user.adresse = {
      ...user.adresse,
      coordonnees: {
        type: 'Point',
        coordinates: [parseFloat(longitude), parseFloat(latitude)]
      }
    };

    // Mettre à jour les autres champs d'adresse si fournis
    if (commune) user.adresse.commune = commune;
    if (quartier) user.adresse.quartier = quartier;
    if (ville) user.adresse.ville = ville;

    await user.save();

    logger.info('Coordonnées mises à jour', { userId, longitude, latitude });

    res.json({
      success: true,
      message: 'Coordonnées mises à jour avec succès',
      adresse: user.adresse
    });

  } catch (error) {
    logger.error('Erreur mise à jour coordonnées:', error);
    return next(AppError.serverError('Erreur serveur lors de la mise à jour des coordonnées', { 
      originalError: error.message 
    }));
  }
};

/**
 * Changer le rôle de l'utilisateur (passager <-> conducteur)
 */
const changerRole = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const { nouveauRole } = req.body;

    if (!nouveauRole || !['passager', 'conducteur', 'les_deux'].includes(nouveauRole)) {
      return res.status(400).json({
        success: false,
        message: 'Rôle invalide',
        rolesAutorises: ['passager', 'conducteur', 'les_deux']
      });
    }

    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    const ancienRole = user.role;
    user.role = nouveauRole;

    // Si l'utilisateur devient conducteur et n'a pas de véhicule, initialiser
    if ((nouveauRole === 'conducteur' || nouveauRole === 'les_deux') && !user.vehicule.marque) {
      user.vehicule = {
        marque: '',
        modele: '',
        couleur: '',
        immatriculation: '',
        nombrePlaces: 4,
        photoVehicule: null,
        assurance: {},
        visiteTechnique: {}
      };
    }

    await user.save();

    // Ajouter à l'historique des statuts si nécessaire
    if (ancienRole !== nouveauRole) {
      user.historiqueStatuts.push({
        ancienStatut: `role_${ancienRole}`,
        nouveauStatut: `role_${nouveauRole}`,
        raison: 'Changement de rôle par l\'utilisateur',
        dateModification: new Date()
      });
      await user.save();
    }

    logger.info('Rôle utilisateur changé', { userId, ancienRole, nouveauRole });

    res.json({
      success: true,
      message: `Rôle changé avec succès de ${ancienRole} à ${nouveauRole}`,
      user: {
        id: user._id,
        role: user.role,
        peutAccepterCourses: user.peutAccepterCourses,
        vehicule: user.vehicule,
        compteCovoiturage: user.obtenirResumeCompte()
      }
    });

  } catch (error) {
    logger.error('Erreur changement rôle:', error);
    return next(AppError.serverError('Erreur serveur lors du changement de rôle', { 
      originalError: error.message 
    }));
  }
};

/**
 * Rechercher des utilisateurs
 */
const rechercherUtilisateurs = async (req, res, next) => {
  try {
    const { 
      nom, 
      email, 
      role, 
      statutCompte, 
      ville,
      longitude,
      latitude,
      rayonKm = 10,
      page = 1, 
      limit = 20 
    } = req.query;

    let query = {};
    
    // Construire la requête de recherche
    if (nom) {
      query.$or = [
        { nom: { $regex: nom, $options: 'i' } },
        { prenom: { $regex: nom, $options: 'i' } }
      ];
    }
    
    if (email) {
      query.email = { $regex: email, $options: 'i' };
    }
    
    if (role && ['passager', 'conducteur', 'les_deux', 'admin'].includes(role)) {
      query.role = role;
    }
    
    if (statutCompte && ['ACTIF', 'SUSPENDU', 'BLOQUE', 'EN_ATTENTE_VERIFICATION'].includes(statutCompte)) {
      query.statutCompte = statutCompte;
    }
    
    if (ville) {
      query['adresse.ville'] = { $regex: ville, $options: 'i' };
    }

    // Recherche par proximité géographique
    if (longitude && latitude) {
      const long = parseFloat(longitude);
      const lat = parseFloat(latitude);
      const rayon = parseFloat(rayonKm);
      
      if (long >= -180 && long <= 180 && lat >= -90 && lat <= 90 && rayon > 0) {
        query['adresse.coordonnees'] = {
          $near: {
            $geometry: {
              type: 'Point',
              coordinates: [long, lat]
            },
            $maxDistance: rayon * 1000 // Convertir km en mètres
          }
        };
      }
    }

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      select: '-motDePasse -tokenResetMotDePasse -expirationTokenReset -tokenConfirmationEmail -expirationTokenConfirmation -codeSMS -expirationCodeSMS',
      sort: { dateInscription: -1 }
    };

    const users = await User.paginate(query, options);

    res.json({
      success: true,
      data: {
        utilisateurs: users.docs,
        pagination: {
          currentPage: users.page,
          totalPages: users.totalPages,
          totalCount: users.totalDocs,
          hasNextPage: users.hasNextPage,
          hasPrevPage: users.hasPrevPage
        }
      }
    });

  } catch (error) {
    logger.error('Erreur recherche utilisateurs:', error);
    return next(AppError.serverError('Erreur serveur lors de la recherche', { 
      originalError: error.message 
    }));
  }
};

/**
 * Obtenir tous les utilisateurs (admin seulement)
 */
const obtenirTousLesUtilisateurs = async (req, res, next) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      role, 
      statutCompte, 
      sortBy = 'dateInscription',
      sortOrder = 'desc'
    } = req.query;

    let query = {};
    
    if (role && ['passager', 'conducteur', 'les_deux', 'admin'].includes(role)) {
      query.role = role;
    }
    
    if (statutCompte && ['ACTIF', 'SUSPENDU', 'BLOQUE', 'EN_ATTENTE_VERIFICATION'].includes(statutCompte)) {
      query.statutCompte = statutCompte;
    }

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      select: '-motDePasse -tokenResetMotDePasse -expirationTokenReset -tokenConfirmationEmail -expirationTokenConfirmation -codeSMS -expirationCodeSMS',
      sort: sortOptions,
      populate: [
        { path: 'documentIdentite.verificateurId', select: 'nom prenom' }
      ]
    };

    const users = await User.paginate(query, options);

    res.json({
      success: true,
      data: {
        utilisateurs: users.docs,
        pagination: {
          currentPage: users.page,
          totalPages: users.totalPages,
          totalCount: users.totalDocs,
          hasNextPage: users.hasNextPage,
          hasPrevPage: users.hasPrevPage
        }
      }
    });

  } catch (error) {
    logger.error('Erreur obtention tous utilisateurs:', error);
    return next(AppError.serverError('Erreur serveur lors de la récupération', { 
      originalError: error.message 
    }));
  }
};

/**
 * Supprimer le compte utilisateur
 */
const supprimerCompte = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const { motDePasse, confirmation } = req.body;

    if (!motDePasse || confirmation !== 'SUPPRIMER_MON_COMPTE') {
      return res.status(400).json({
        success: false,
        message: 'Mot de passe et confirmation requis',
        confirmation: 'SUPPRIMER_MON_COMPTE'
      });
    }

    const user = await User.findById(userId).select('+motDePasse');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    // Vérifier le mot de passe
    const isMatch = await user.verifierMotDePasse(motDePasse);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Mot de passe incorrect',
        champ: 'motDePasse'
      });
    }

    // Vérifier s'il y a des fonds dans le compte
    if (user.compteCovoiturage.solde > 0) {
      return res.status(409).json({
        success: false,
        message: 'Impossible de supprimer le compte : solde non nul',
        details: `Solde actuel : ${user.compteCovoiturage.solde} FCFA. Veuillez retirer vos fonds avant de supprimer votre compte.`
      });
    }

    // Anonymiser les données au lieu de supprimer complètement
    const dateSupression = new Date();
    user.nom = `Utilisateur_${user._id}`;
    user.prenom = 'Supprimé';
    user.email = `deleted_${user._id}@wayzeco.local`;
    user.telephone = `+225${Date.now().toString().slice(-8)}`;
    user.motDePasse = undefined;
    user.photoProfil = null;
    user.statutCompte = 'BLOQUE';
    user.contactsUrgence = [];
    user.adresse = {};
    user.preferences = {};
    
    // Marquer comme supprimé dans l'historique
    user.historiqueStatuts.push({
      ancienStatut: user.statutCompte,
      nouveauStatut: 'COMPTE_SUPPRIME',
      raison: 'Suppression demandée par l\'utilisateur',
      dateModification: dateSupression
    });

    await user.save();

    logger.info('Compte utilisateur supprimé', { userId, dateSupression });

    res.json({
      success: true,
      message: 'Compte supprimé avec succès',
      dateSupression
    });

  } catch (error) {
    logger.error('Erreur suppression compte:', error);
    return next(AppError.serverError('Erreur serveur lors de la suppression du compte', { 
      originalError: error.message 
    }));
  }
};

/**
 * Obtenir les statistiques personnelles de l'utilisateur
 */
const obtenirStatistiques = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    const maintenant = new Date();
    const inscriptionDepuis = Math.floor((maintenant - user.dateInscription) / (1000 * 60 * 60 * 24));

    const statistiques = {
      profil: {
        dateInscription: user.dateInscription,
        inscriptionDepuis: `${inscriptionDepuis} jours`,
        scoreConfiance: user.scoreConfiance,
        noteGenerale: user.noteGenerale,
        badges: user.badges,
        estVerifie: user.estVerifie,
        estDocumentVerifie: user.estDocumentVerifie
      },
      activite: {
        nombreTrajetsEffectues: user.nombreTrajetsEffectues,
        nombreTrajetsAnnules: user.nombreTrajetsAnnules,
        tauxAnnulation: user.tauxAnnulation,
        derniereConnexion: user.derniereConnexion
      },
      compteCovoiturage: user.obtenirResumeCompte()
    };

    // Ajouter des statistiques spécifiques aux conducteurs
    if (user.role === 'conducteur' || user.role === 'les_deux') {
      statistiques.conducteur = {
        vehiculeConfigured: !!(user.vehicule && user.vehicule.marque),
        compteRechargeActif: user.compteRechargeActif,
        peutAccepterCourses: user.peutAccepterCourses
      };
    }

    res.json({
      success: true,
      data: statistiques
    });

  } catch (error) {
    logger.error('Erreur statistiques personnelles:', error);
    return next(AppError.serverError('Erreur serveur lors de la récupération des statistiques', { 
      originalError: error.message 
    }));
  }
};

/**
 * Obtenir les statistiques globales (admin seulement)
 */
const obtenirStatistiquesGlobales = async (req, res, next) => {
  try {
    // Statistiques générales des utilisateurs
    const statsUtilisateurs = await User.statistiquesGlobales();
    
    // Statistiques des comptes covoiturage
    const statsComptes = await User.statistiquesComptesCovoiturage();
    
    // Statistiques par mois (derniers 12 mois)
    const maintenant = new Date();
    const debutPeriode = new Date(maintenant.getFullYear(), maintenant.getMonth() - 11, 1);
    
    const statsParMois = await User.aggregate([
      {
        $match: {
          dateInscription: { $gte: debutPeriode }
        }
      },
      {
        $group: {
          _id: {
            annee: { $year: '$dateInscription' },
            mois: { $month: '$dateInscription' }
          },
          nouvellesToujours: { $sum: 1 },
          nouveauxConducteurs: {
            $sum: { $cond: [{ $in: ['$role', ['conducteur', 'les_deux']] }, 1, 0] }
          },
          nouveauxPassagers: {
            $sum: { $cond: [{ $in: ['$role', ['passager', 'les_deux']] }, 1, 0] }
          }
        }
      },
      {
        $sort: { '_id.annee': 1, '_id.mois': 1 }
      }
    ]);

    // Statistiques de vérification des documents
    const statsDocuments = await User.aggregate([
      {
        $group: {
          _id: '$documentIdentite.statutVerification',
          count: { $sum: 1 }
        }
      }
    ]);

    // Top 10 des villes
    const topVilles = await User.aggregate([
      {
        $match: {
          'adresse.ville': { $exists: true, $ne: '' }
        }
      },
      {
        $group: {
          _id: '$adresse.ville',
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      },
      {
        $limit: 10
      }
    ]);

    // Statistiques des recharges
    const statsRecharges = await User.aggregate([
      {
        $match: {
          'compteCovoiturage.historiqueRecharges': { $exists: true, $ne: [] }
        }
      },
      {
        $unwind: '$compteCovoiturage.historiqueRecharges'
      },
      {
        $match: {
          'compteCovoiturage.historiqueRecharges.statut': 'reussi'
        }
      },
      {
        $group: {
          _id: null,
          totalRecharges: { $sum: 1 },
          montantTotalRecharge: { $sum: '$compteCovoiturage.historiqueRecharges.montant' },
          montantMoyenRecharge: { $avg: '$compteCovoiturage.historiqueRecharges.montant' },
          rechargesParMethode: {
            $push: '$compteCovoiturage.historiqueRecharges.methodePaiement'
          }
        }
      }
    ]);

    const statistiquesGlobales = {
      utilisateurs: statsUtilisateurs,
      comptesCovoiturage: statsComptes[0] || {},
      evolutionParMois: statsParMois,
      documentsVerification: statsDocuments.reduce((acc, item) => {
        acc[item._id || 'non_defini'] = item.count;
        return acc;
      }, {}),
      topVilles: topVilles.map(ville => ({
        ville: ville._id,
        utilisateurs: ville.count
      })),
      recharges: statsRecharges[0] || {
        totalRecharges: 0,
        montantTotalRecharge: 0,
        montantMoyenRecharge: 0
      },
      resumeSysteme: {
        dateGeneration: new Date(),
        totalUtilisateurs: statsUtilisateurs.totalUtilisateurs || 0,
        utilisateursActifs: statsUtilisateurs.utilisateursActifs || 0,
        tauxActivation: statsUtilisateurs.totalUtilisateurs > 0 ? 
          Math.round((statsUtilisateurs.utilisateursActifs / statsUtilisateurs.totalUtilisateurs) * 100) : 0,
        soldeTotalSysteme: statsComptes[0]?.soldeTotalComptes || 0,
        commissionsGenerees: statsComptes[0]?.totalCommissionsGlobal || 0
      }
    };

    res.json({
      success: true,
      data: statistiquesGlobales
    });

  } catch (error) {
    logger.error('Erreur statistiques globales:', error);
    return next(AppError.serverError('Erreur serveur lors de la récupération des statistiques globales', { 
      originalError: error.message 
    }));
  }
};

/**
 * Mettre à jour les préférences utilisateur
 */
const mettreAJourPreferences = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const { preferences } = req.body;

    if (!preferences || typeof preferences !== 'object') {
      return res.status(400).json({
        success: false,
        message: 'Préférences requises'
      });
    }

    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    // Valider les préférences
    const preferencesValides = {};
    
    if (preferences.musique !== undefined) {
      preferencesValides.musique = Boolean(preferences.musique);
    }
    
    if (preferences.climatisation !== undefined) {
      preferencesValides.climatisation = Boolean(preferences.climatisation);
    }
    
    if (preferences.conversation !== undefined) {
      const conversationValide = ['BAVARD', 'CALME', 'NEUTRE'];
      if (conversationValide.includes(preferences.conversation)) {
        preferencesValides.conversation = preferences.conversation;
      }
    }
    
    if (preferences.languePreferee !== undefined) {
      const languesValides = ['FR', 'ANG'];
      if (languesValides.includes(preferences.languePreferee)) {
        preferencesValides.languePreferee = preferences.languePreferee;
      }
    }

    // Mettre à jour les préférences
    user.preferences = { ...user.preferences, ...preferencesValides };
    await user.save();

    logger.info('Préférences mises à jour', { userId, preferences: preferencesValides });

    res.json({
      success: true,
      message: 'Préférences mises à jour avec succès',
      preferences: user.preferences
    });

  } catch (error) {
    logger.error('Erreur mise à jour préférences:', error);
    return next(AppError.serverError('Erreur serveur lors de la mise à jour des préférences', { 
      originalError: error.message 
    }));
  }
};

/**
 * Ajouter un contact d'urgence
 */
const ajouterContactUrgence = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const { nom, telephone, relation } = req.body;

    if (!nom || !telephone || !relation) {
      return res.status(400).json({
        success: false,
        message: 'Nom, téléphone et relation sont requis'
      });
    }

    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    // Vérifier le nombre maximum de contacts (par exemple 3)
    if (user.contactsUrgence.length >= 3) {
      return res.status(400).json({
        success: false,
        message: 'Nombre maximum de contacts d\'urgence atteint (3)'
      });
    }

    // Vérifier si le numéro existe déjà
    const numeroExiste = user.contactsUrgence.some(contact => contact.telephone === telephone);
    if (numeroExiste) {
      return res.status(409).json({
        success: false,
        message: 'Ce numéro de téléphone existe déjà dans vos contacts d\'urgence'
      });
    }

    const nouveauContact = {
      nom: nom.trim(),
      telephone: telephone.trim(),
      relation
    };

    user.contactsUrgence.push(nouveauContact);
    await user.save();

    logger.info('Contact d\'urgence ajouté', { userId, contact: nouveauContact });

    res.json({
      success: true,
      message: 'Contact d\'urgence ajouté avec succès',
      contact: nouveauContact,
      contactsUrgence: user.contactsUrgence
    });

  } catch (error) {
    logger.error('Erreur ajout contact urgence:', error);
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Erreur de validation',
        details: messages
      });
    }

    return next(AppError.serverError('Erreur serveur lors de l\'ajout du contact d\'urgence', { 
      originalError: error.message 
    }));
  }
};

/**
 * Supprimer un contact d'urgence
 */
const supprimerContactUrgence = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const { contactId } = req.params;

    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    const contactIndex = user.contactsUrgence.findIndex(
      contact => contact._id.toString() === contactId
    );

    if (contactIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Contact d\'urgence non trouvé'
      });
    }

    const contactSupprime = user.contactsUrgence[contactIndex];
    user.contactsUrgence.splice(contactIndex, 1);
    await user.save();

    logger.info('Contact d\'urgence supprimé', { userId, contactSupprime });

    res.json({
      success: true,
      message: 'Contact d\'urgence supprimé avec succès',
      contactsUrgence: user.contactsUrgence
    });

  } catch (error) {
    logger.error('Erreur suppression contact urgence:', error);
    return next(AppError.serverError('Erreur serveur lors de la suppression du contact d\'urgence', { 
      originalError: error.message 
    }));
  }
};

/**
 * Configurer les paramètres de retrait des gains
 */
const configurerParametresRetrait = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const { numeroMobile, operateur, nomTitulaire } = req.body;

    if (!numeroMobile || !operateur || !nomTitulaire) {
      return res.status(400).json({
        success: false,
        message: 'Numéro mobile, opérateur et nom du titulaire sont requis'
      });
    }

    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    // Vérifier que l'utilisateur peut être conducteur
    if (user.role !== 'conducteur' && user.role !== 'les_deux') {
      return res.status(403).json({
        success: false,
        message: 'Seuls les conducteurs peuvent configurer les paramètres de retrait'
      });
    }

    try {
      await user.configurerRetraitGains(numeroMobile, operateur, nomTitulaire);
      
      logger.info('Paramètres de retrait configurés', { userId, operateur });

      res.json({
        success: true,
        message: 'Paramètres de retrait configurés avec succès',
        parametresRetrait: user.compteCovoiturage.parametresRetrait,
        peutRetirerGains: user.peutRetirerGains
      });

    } catch (validationError) {
      return res.status(400).json({
        success: false,
        message: validationError.message
      });
    }

  } catch (error) {
    logger.error('Erreur configuration paramètres retrait:', error);
    return next(AppError.serverError('Erreur serveur lors de la configuration', { 
      originalError: error.message 
    }));
  }
};

/**
 * Configurer la recharge automatique
 */
const configurerAutoRecharge = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const { seuilAutoRecharge, montantAutoRecharge, methodePaiementAuto } = req.body;

    if (!seuilAutoRecharge || !montantAutoRecharge || !methodePaiementAuto) {
      return res.status(400).json({
        success: false,
        message: 'Seuil, montant et méthode de paiement automatique sont requis'
      });
    }

    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    // Vérifier que l'utilisateur peut être conducteur
    if (user.role !== 'conducteur' && user.role !== 'les_deux') {
      return res.status(403).json({
        success: false,
        message: 'Seuls les conducteurs peuvent configurer la recharge automatique'
      });
    }

    try {
      await user.configurerAutoRecharge(seuilAutoRecharge, montantAutoRecharge, methodePaiementAuto);
      
      logger.info('Recharge automatique configurée', { userId, seuil: seuilAutoRecharge, montant: montantAutoRecharge });

      res.json({
        success: true,
        message: 'Recharge automatique configurée avec succès',
        modeAutoRecharge: user.compteCovoiturage.modeAutoRecharge
      });

    } catch (validationError) {
      return res.status(400).json({
        success: false,
        message: validationError.message
      });
    }

  } catch (error) {
    logger.error('Erreur configuration auto-recharge:', error);
    return next(AppError.serverError('Erreur serveur lors de la configuration', { 
      originalError: error.message 
    }));
  }
};

/**
 * Désactiver la recharge automatique
 */
const desactiverAutoRecharge = async (req, res, next) => {
  try {
    const userId = req.user.userId;

    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    await user.desactiverAutoRecharge();
    
    logger.info('Recharge automatique désactivée', { userId });

    res.json({
      success: true,
      message: 'Recharge automatique désactivée avec succès',
      modeAutoRecharge: user.compteCovoiturage.modeAutoRecharge
    });

  } catch (error) {
    logger.error('Erreur désactivation auto-recharge:', error);
    return next(AppError.serverError('Erreur serveur lors de la désactivation', { 
      originalError: error.message 
    }));
  }
};

/**
 * Obtenir le dashboard utilisateur avec toutes les informations essentielles
 */
const obtenirDashboard = async (req, res, next) => {
  try {
    const userId = req.user.userId;

    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    // Données du dashboard
    const dashboard = {
      utilisateur: {
        id: user._id,
        nomComplet: user.nomComplet,
        email: user.email,
        photoProfil: user.photoProfil,
        role: user.role,
        scoreConfiance: user.scoreConfiance,
        noteGenerale: user.noteGenerale,
        badges: user.badges,
        estVerifie: user.estVerifie,
        estDocumentVerifie: user.estDocumentVerifie
      },
      statistiques: {
        nombreTrajetsEffectues: user.nombreTrajetsEffectues,
        nombreTrajetsAnnules: user.nombreTrajetsAnnules,
        tauxAnnulation: user.tauxAnnulation
      },
      compteCovoiturage: user.obtenirResumeCompte(),
      alertes: []
    };

    // Ajouter des alertes importantes
    if (!user.estVerifie) {
      dashboard.alertes.push({
        type: 'warning',
        message: 'Votre document d\'identité n\'est pas encore vérifié',
        action: 'verifier_identite'
      });
    }

    if ((user.role === 'conducteur' || user.role === 'les_deux') && !user.vehicule.marque) {
      dashboard.alertes.push({
        type: 'info',
        message: 'Complétez les informations de votre véhicule',
        action: 'configurer_vehicule'
      });
    }

    if ((user.role === 'conducteur' || user.role === 'les_deux') && user.compteCovoiturage.totalGagnes > 0 && !user.peutRetirerGains) {
      dashboard.alertes.push({
        type: 'info',
        message: 'Configurez vos paramètres de retrait pour récupérer vos gains',
        action: 'configurer_retrait'
      });
    }

    // Vérifier si une recharge automatique est nécessaire
    const autoRecharge = user.verifierAutoRecharge();
    if (autoRecharge.necessite) {
      dashboard.alertes.push({
        type: 'warning',
        message: `Recharge automatique nécessaire: ${autoRecharge.montant} FCFA`,
        action: 'recharge_auto'
      });
    }

    res.json({
      success: true,
      data: dashboard
    });

  } catch (error) {
    logger.error('Erreur dashboard:', error);
    return next(AppError.serverError('Erreur serveur lors de la récupération du dashboard', { 
      originalError: error.message 
    }));
  }
};

module.exports = {
  mettreAJourProfil,
  uploadPhotoProfil,
  uploadDocumentIdentite,
  changerMotDePasse,
  mettreAJourVehicule,
  mettreAJourCoordonnees,
  changerRole,
  rechercherUtilisateurs,
  obtenirTousLesUtilisateurs,
  supprimerCompte,
  obtenirStatistiques,
  obtenirStatistiquesGlobales,
  mettreAJourPreferences,
  ajouterContactUrgence,
  supprimerContactUrgence,
  configurerParametresRetrait,
  configurerAutoRecharge,
  desactiverAutoRecharge,
  obtenirDashboard
};