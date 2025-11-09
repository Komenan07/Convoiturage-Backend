// controllers/utilisateurController.js 
const User = require('../models/Utilisateur');
const { logger } = require('../utils/logger');
const AppError = require('../utils/AppError');
const fs = require('fs');
const multer = require('multer');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { uploadProfilPhoto, uploadDocument } = require('../middlewares/uploadMiddleware');


// // Configuration multer pour l'upload de fichiers
// const storage = multer.diskStorage({
//   destination: function (req, file, cb) {
//     const uploadPath = path.join(process.cwd(), 'uploads', 'users');
//     if (!fs.existsSync(uploadPath)) {
//       fs.mkdirSync(uploadPath, { recursive: true });
//     }
//     cb(null, uploadPath);
//   },
//   filename: function (req, file, cb) {
//     const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
//     const extension = path.extname(file.originalname);
//     const prefix = file.fieldname === 'photoProfil' ? 'profil' : 'document';
//     cb(null, `${prefix}-${req.user.userId}-${uniqueSuffix}${extension}`);
//   }
// });

// const fileFilter = (req, file, cb) => {
//   const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
//   if (allowedTypes.includes(file.mimetype)) {
//     cb(null, true);
//   } else {
//     cb(new Error('Type de fichier non autorisé. Seuls JPEG, PNG et GIF sont acceptés.'), false);
//   }
// };

// const upload = multer({
//   storage: storage,
//   fileFilter: fileFilter,
//   limits: {
//     fileSize: 5 * 1024 * 1024 // 5MB
//   }
// });

// // Helper pour construire l'URL complète des images

//=============== FONCTIONS CRUD DE BASE ===============

/**
 * Obtenir la liste paginée des utilisateurs
 */
const obtenirUtilisateurs = async (req, res, next) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      role, 
      statutCompte, 
      ville,
      commune,
      scoreMin,
      dateInscriptionDebut,
      dateInscriptionFin,
      sortBy = 'dateInscription',
      sortOrder = 'desc',
      q
    } = req.query;

    let query = {};
    
    // Filtre par rôle
    if (role && ['conducteur', 'passager', 'les_deux', 'admin', 'moderateur'].includes(role)) {
      query.role = role;
    }
    
    // Filtre par statut
    if (statutCompte && ['ACTIF', 'SUSPENDU', 'BLOQUE', 'EN_ATTENTE_VERIFICATION'].includes(statutCompte)) {
      query.statutCompte = statutCompte;
    }
    
    // Filtre par ville
    if (ville) {
      query['adresse.ville'] = { $regex: ville, $options: 'i' };
    }
    
    // Filtre par commune
    if (commune) {
      query['adresse.commune'] = { $regex: commune, $options: 'i' };
    }
    
    // Filtre par score de confiance minimum
    if (scoreMin) {
      query.scoreConfiance = { $gte: parseFloat(scoreMin) };
    }
    
    // Filtre par période d'inscription
    if (dateInscriptionDebut || dateInscriptionFin) {
      query.dateInscription = {};
      if (dateInscriptionDebut) {
        query.dateInscription.$gte = new Date(dateInscriptionDebut);
      }
      if (dateInscriptionFin) {
        query.dateInscription.$lte = new Date(dateInscriptionFin);
      }
    }
    
    // Recherche textuelle
    if (q) {
      query.$or = [
        { nom: { $regex: q, $options: 'i' } },
        { prenom: { $regex: q, $options: 'i' } },
        { email: { $regex: q, $options: 'i' } },
        { telephone: { $regex: q, $options: 'i' } }
      ];
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
          hasPrevPage: users.hasPrevPage,
          limit: users.limit
        },
        filtres: {
          role,
          statutCompte,
          ville,
          commune,
          scoreMin,
          dateInscriptionDebut,
          dateInscriptionFin,
          recherche: q
        }
      }
    });

  } catch (error) {
    logger.error('Erreur obtention utilisateurs:', error);
    return next(AppError.serverError('Erreur serveur lors de la récupération des utilisateurs', { 
      originalError: error.message 
    }));
  }
};

/**
 * Obtenir un utilisateur spécifique par ID
 */
const obtenirUtilisateur = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const user = await User.findById(id)
      .select('-motDePasse -tokenResetMotDePasse -expirationTokenReset -tokenConfirmationEmail -expirationTokenConfirmation -codeSMS -expirationCodeSMS')
      .populate('documentIdentite.verificateurId', 'nom prenom');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé',
        code: 'USER_NOT_FOUND'
      });
    }

    res.json({
      success: true,
      data: {
        utilisateur: user,
        compteCovoiturage: user.obtenirResumeCompte(),
        statistiques: {
          inscriptionDepuis: Math.floor((Date.now() - user.dateInscription) / (1000 * 60 * 60 * 24)),
          nombreTrajetsEffectues: user.nombreTrajetsEffectues,
          tauxAnnulation: user.tauxAnnulation
        }
      }
    });

  } catch (error) {
    logger.error('Erreur obtention utilisateur:', error);
    return next(AppError.serverError('Erreur serveur lors de la récupération de l\'utilisateur', { 
      originalError: error.message 
    }));
  }
};

/**
 * Créer un nouvel utilisateur (Admin uniquement)
 */
const creerUtilisateur = async (req, res, next) => {
  try {
    const userData = req.body;
    const createdBy = req.user.userId;

    // Vérifier si l'email ou le téléphone existe déjà
    const existingUser = await User.findOne({
      $or: [
        { email: userData.email },
        { telephone: userData.telephone }
      ]
    });

    if (existingUser) {
      const field = existingUser.email === userData.email ? 'email' : 'telephone';
      return res.status(409).json({
        success: false,
        message: `Un utilisateur avec cet ${field === 'email' ? 'email' : 'numéro de téléphone'} existe déjà`,
        code: 'USER_ALREADY_EXISTS',
        field
      });
    }

    // Créer le nouvel utilisateur
    const newUser = new User({
      ...userData,
      emailConfirme: true, // Auto-confirmé par admin
      statutCompte: 'ACTIF',
      createdBy
    });

    await newUser.save();

    logger.info('Nouvel utilisateur créé par admin', { 
      userId: newUser._id, 
      email: newUser.email,
      createdBy 
    });

    res.status(201).json({
      success: true,
      message: 'Utilisateur créé avec succès',
      data: {
        utilisateur: {
          id: newUser._id,
          nom: newUser.nom,
          prenom: newUser.prenom,
          email: newUser.email,
          telephone: newUser.telephone,
          role: newUser.role,
          statutCompte: newUser.statutCompte,
          dateInscription: newUser.dateInscription
        }
      }
    });

  } catch (error) {
    logger.error('Erreur création utilisateur:', error);
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Erreur de validation',
        code: 'VALIDATION_ERROR',
        details: messages
      });
    }

    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(409).json({
        success: false,
        message: `Un utilisateur avec cette ${field === 'email' ? 'adresse email' : 'information'} existe déjà`,
        code: 'DUPLICATE_ERROR',
        field
      });
    }

    return next(AppError.serverError('Erreur serveur lors de la création de l\'utilisateur', { 
      originalError: error.message 
    }));
  }
};

/**
 * Mettre à jour un utilisateur
 */
const mettreAJourUtilisateur = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    const updatedBy = req.user.userId;
    const userRole = req.user.role;

    // Retirer les champs non modifiables
    const champsProtege = [
      'motDePasse', 'emailConfirme', 'compteCovoiturage', 
      'dateInscription', '_id', '__v', 'createdBy'
    ];
    
    champsProtege.forEach(field => delete updateData[field]);

    // Seuls les admins peuvent modifier certains champs
    if (userRole !== 'admin') {
      const champsAdminOnly = ['role', 'statutCompte', 'scoreConfiance', 'badges'];
      champsAdminOnly.forEach(field => delete updateData[field]);
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé',
        code: 'USER_NOT_FOUND'
      });
    }

    // Mettre à jour les données
    Object.assign(user, updateData);
    user.updatedBy = updatedBy;
    
    await user.save();

    logger.info('Utilisateur mis à jour', { 
      userId: id, 
      updatedBy,
      champsModifies: Object.keys(updateData)
    });

    res.json({
      success: true,
      message: 'Utilisateur mis à jour avec succès',
      data: {
        utilisateur: await User.findById(id)
          .select('-motDePasse -tokenResetMotDePasse -expirationTokenReset')
      }
    });

  } catch (error) {
    logger.error('Erreur mise à jour utilisateur:', error);
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Erreur de validation',
        details: messages
      });
    }

    return next(AppError.serverError('Erreur serveur lors de la mise à jour', { 
      originalError: error.message 
    }));
  }
};

/**
 * Alias pour mettreAJourUtilisateur
 */
const modifierUtilisateur = mettreAJourUtilisateur;
const updateUtilisateur = mettreAJourUtilisateur;

/**
 * Supprimer définitivement un utilisateur
 */
const supprimerUtilisateur = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { confirmation, raison } = req.body;
    const deletedBy = req.user.userId;

    if (confirmation !== 'SUPPRIMER_DEFINITIVEMENT') {
      return res.status(400).json({
        success: false,
        message: 'Confirmation requise: SUPPRIMER_DEFINITIVEMENT',
        code: 'CONFIRMATION_REQUIRED'
      });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé',
        code: 'USER_NOT_FOUND'
      });
    }

    // Vérifier s'il y a des fonds dans le compte
    if (user.compteCovoiturage.solde > 0) {
      return res.status(409).json({
        success: false,
        message: 'Impossible de supprimer : solde non nul',
        code: 'ACCOUNT_HAS_BALANCE',
        solde: user.compteCovoiturage.solde
      });
    }

    // Sauvegarder les informations pour les logs
    const userInfo = {
      id: user._id,
      nom: user.nom,
      prenom: user.prenom,
      email: user.email,
      telephone: user.telephone,
      dateInscription: user.dateInscription
    };

    await User.findByIdAndDelete(id);

    logger.warn('Utilisateur supprimé définitivement', { 
      userInfo, 
      deletedBy, 
      raison,
      dateSupression: new Date()
    });

    res.json({
      success: true,
      message: 'Utilisateur supprimé définitivement',
      dateSupression: new Date()
    });

  } catch (error) {
    logger.error('Erreur suppression utilisateur:', error);
    return next(AppError.serverError('Erreur serveur lors de la suppression', { 
      originalError: error.message 
    }));
  }
};

// =============== FONCTIONS AVANCÉES ===============

/**
 * Changer le statut d'un utilisateur
 */
const changerStatutUtilisateur = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { nouveauStatut, raison, duree } = req.body;
    const changedBy = req.user.userId;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé',
        code: 'USER_NOT_FOUND'
      });
    }

    const ancienStatut = user.statutCompte;
    
    // Appliquer le nouveau statut
    user.statutCompte = nouveauStatut;
    
    // Ajouter à l'historique
    user.historiqueStatuts.push({
      ancienStatut,
      nouveauStatut,
      raison,
      duree: duree ? parseInt(duree) : null,
      dateModification: new Date(),
      modifiePar: changedBy
    });

    await user.save();

    logger.info('Statut utilisateur changé', { 
      userId: id, 
      ancienStatut, 
      nouveauStatut, 
      changedBy,
      raison
    });

    res.json({
      success: true,
      message: `Statut changé de ${ancienStatut} à ${nouveauStatut}`,
      data: {
        utilisateur: {
          id: user._id,
          statutCompte: user.statutCompte,
          historiqueStatuts: user.historiqueStatuts.slice(-5) // 5 derniers changements
        }
      }
    });

  } catch (error) {
    logger.error('Erreur changement statut:', error);
    return next(AppError.serverError('Erreur serveur lors du changement de statut', { 
      originalError: error.message 
    }));
  }
};

/**
 * Rechercher des utilisateurs avec critères avancés
 */
const rechercherUtilisateurs = async (req, res, next) => {
  try {
    const { 
      q, 
      role, 
      statutCompte, 
      ville, 
      commune,
      scoreMin,
      dateInscriptionDebut,
      dateInscriptionFin,
      page = 1, 
      limit = 20,
      sortBy = 'scoreConfiance',
      sortOrder = 'desc'
    } = req.query;

    let query = {};
    
    // Recherche textuelle
    if (q) {
      query.$or = [
        { nom: { $regex: q, $options: 'i' } },
        { prenom: { $regex: q, $options: 'i' } },
        { email: { $regex: q, $options: 'i' } }
      ];
    }
    
    // Filtres
    if (role && ['conducteur', 'passager', 'les_deux', 'admin', 'moderateur'].includes(role)) {
      query.role = role;
    }
    
    if (statutCompte) {
      query.statutCompte = statutCompte;
    }
    
    if (ville) {
      query['adresse.ville'] = { $regex: ville, $options: 'i' };
    }
    
    if (commune) {
      query['adresse.commune'] = { $regex: commune, $options: 'i' };
    }
    
    if (scoreMin) {
      query.scoreConfiance = { $gte: parseFloat(scoreMin) };
    }
    
    // Période d'inscription
    if (dateInscriptionDebut || dateInscriptionFin) {
      query.dateInscription = {};
      if (dateInscriptionDebut) {
        query.dateInscription.$gte = new Date(dateInscriptionDebut);
      }
      if (dateInscriptionFin) {
        query.dateInscription.$lte = new Date(dateInscriptionFin);
      }
    }

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      select: 'nom prenom email telephone role statutCompte scoreConfiance dateInscription adresse.ville adresse.commune',
      sort: sortOptions
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
        },
        criteres: { q, role, statutCompte, ville, commune, scoreMin }
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
 * Obtenir les statistiques des utilisateurs
 */
const obtenirStatistiquesUtilisateurs = async (req, res, next) => {
  try {
    const stats = await User.aggregate([
      {
        $group: {
          _id: null,
          totalUtilisateurs: { $sum: 1 },
          utilisateursActifs: {
            $sum: { $cond: [{ $eq: ['$statutCompte', 'ACTIF'] }, 1, 0] }
          },
          utilisateursSuspendus: {
            $sum: { $cond: [{ $eq: ['$statutCompte', 'SUSPENDU'] }, 1, 0] }
          },
          utilisateursBloquee: {
            $sum: { $cond: [{ $eq: ['$statutCompte', 'BLOQUE'] }, 1, 0] }
          },
          utilisateursEnAttente: {
            $sum: { $cond: [{ $eq: ['$statutCompte', 'EN_ATTENTE_VERIFICATION'] }, 1, 0] }
          },
          conducteurs: {
            $sum: { $cond: [{ $in: ['$role', ['conducteur', 'les_deux']] }, 1, 0] }
          },
          passagers: {
            $sum: { $cond: [{ $in: ['$role', ['passager', 'les_deux']] }, 1, 0] }
          },
          utilisateursVerifies: {
            $sum: { $cond: ['$estVerifie', 1, 0] }
          },
          scoreConfianceMoyen: { $avg: '$scoreConfiance' },
          totalTrajets: { $sum: '$nombreTrajetsEffectues' }
        }
      }
    ]);

    // Statistiques par période (derniers 30 jours)
    const il30Jours = new Date();
    il30Jours.setDate(il30Jours.getDate() - 30);

    const nouveauxUtilisateurs = await User.countDocuments({
      dateInscription: { $gte: il30Jours }
    });

    // Top 10 des villes
    const topVilles = await User.aggregate([
      { $match: { 'adresse.ville': { $exists: true, $ne: '' } } },
      { $group: { _id: '$adresse.ville', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    const statistiques = {
      ...stats[0],
      nouveauxUtilisateurs30j: nouveauxUtilisateurs,
      tauxCroissance30j: stats[0]?.totalUtilisateurs ? 
        Math.round((nouveauxUtilisateurs / stats[0].totalUtilisateurs) * 100 * 100) / 100 : 0,
      topVilles: topVilles.map(v => ({ ville: v._id, count: v.count })),
      dateGeneration: new Date()
    };

    res.json({
      success: true,
      data: statistiques
    });

  } catch (error) {
    logger.error('Erreur statistiques utilisateurs:', error);
    return next(AppError.serverError('Erreur serveur lors de la récupération des statistiques', { 
      originalError: error.message 
    }));
  }
};

/**
 * Exporter les données utilisateurs
 */
const exporterUtilisateurs = async (req, res, next) => {
  try {
    const { format = 'csv', champs, filtre } = req.query;
    
    let query = {};
    if (filtre) {
      try {
        query = JSON.parse(filtre);
      } catch (e) {
        return res.status(400).json({
          success: false,
          message: 'Filtre JSON invalide',
          code: 'INVALID_JSON_FILTER'
        });
      }
    }

    const champsExport = champs ? champs.split(',') : [
      'nom', 'prenom', 'email', 'telephone', 'role', 'statutCompte', 
      'dateInscription', 'scoreConfiance', 'nombreTrajetsEffectues'
    ];

    const users = await User.find(query)
      .select(champsExport.join(' '))
      .limit(10000); // Limite pour éviter les exports trop volumineux

    if (format === 'json') {
      res.json({
        success: true,
        data: {
          utilisateurs: users,
          totalExporte: users.length,
          dateExport: new Date()
        }
      });
    } else if (format === 'csv') {
      const csv = users.map(user => {
        const row = {};
        champsExport.forEach(field => {
          row[field] = user[field] || '';
        });
        return row;
      });

      // Convertir en CSV
      const csvHeader = champsExport.join(',');
      const csvRows = csv.map(row => 
        champsExport.map(field => `"${row[field]}"`).join(',')
      );
      const csvContent = [csvHeader, ...csvRows].join('\n');

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=utilisateurs.csv');
      res.send(csvContent);
    } else if (format === 'xlsx') {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Utilisateurs');

      // En-têtes
      worksheet.columns = champsExport.map(field => ({
        header: field,
        key: field,
        width: 20
      }));

      // Données
      users.forEach(user => {
        const row = {};
        champsExport.forEach(field => {
          row[field] = user[field];
        });
        worksheet.addRow(row);
      });

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=utilisateurs.xlsx');
      
      await workbook.xlsx.write(res);
      res.end();
    }

    logger.info('Export utilisateurs généré', { 
      format, 
      nombreUtilisateurs: users.length,
      exportedBy: req.user.userId
    });

  } catch (error) {
    logger.error('Erreur export utilisateurs:', error);
    return next(AppError.serverError('Erreur serveur lors de l\'export', { 
      originalError: error.message 
    }));
  }
};

/**
 * Obtenir les utilisateurs par rôle
 */
const obtenirUtilisateursParRole = async (req, res, next) => {
  try {
    const { role } = req.params;
    const { page = 1, limit = 20 } = req.query;

    if (!['conducteur', 'passager', 'les_deux', 'admin', 'moderateur'].includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Rôle invalide',
        code: 'INVALID_ROLE'
      });
    }

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      select: '-motDePasse -tokenResetMotDePasse -expirationTokenReset',
      sort: { dateInscription: -1 }
    };

    const users = await User.paginate({ role }, options);

    res.json({
      success: true,
      data: {
        role,
        utilisateurs: users.docs,
        pagination: {
          currentPage: users.page,
          totalPages: users.totalPages,
          totalCount: users.totalDocs
        }
      }
    });

  } catch (error) {
    logger.error('Erreur utilisateurs par rôle:', error);
    return next(AppError.serverError('Erreur serveur lors de la récupération', { 
      originalError: error.message 
    }));
  }
};

/**
 * Obtenir les utilisateurs actifs
 */
const obtenirUtilisateursActifs = async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      select: 'nom prenom email role derniereConnexion scoreConfiance nombreTrajetsEffectues',
      sort: { derniereConnexion: -1 }
    };

    const users = await User.paginate({ statutCompte: 'ACTIF' }, options);

    res.json({
      success: true,
      data: {
        utilisateursActifs: users.docs,
        pagination: {
          currentPage: users.page,
          totalPages: users.totalPages,
          totalCount: users.totalDocs
        }
      }
    });

  } catch (error) {
    logger.error('Erreur utilisateurs actifs:', error);
    return next(AppError.serverError('Erreur serveur lors de la récupération', { 
      originalError: error.message 
    }));
  }
};

/**
 * Obtenir les utilisateurs récemment inscrits
 */
const obtenirUtilisateursRecents = async (req, res, next) => {
  try {
    const { jours = 7, page = 1, limit = 20 } = req.query;
    
    const dateDebut = new Date();
    dateDebut.setDate(dateDebut.getDate() - parseInt(jours));

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      select: 'nom prenom email role dateInscription statutCompte scoreConfiance',
      sort: { dateInscription: -1 }
    };

    const users = await User.paginate(
      { dateInscription: { $gte: dateDebut } }, 
      options
    );

    res.json({
      success: true,
      data: {
        periodeJours: parseInt(jours),
        utilisateursRecents: users.docs,
        pagination: {
          currentPage: users.page,
          totalPages: users.totalPages,
          totalCount: users.totalDocs
        }
      }
    });

  } catch (error) {
    logger.error('Erreur utilisateurs récents:', error);
    return next(AppError.serverError('Erreur serveur lors de la récupération', { 
      originalError: error.message 
    }));
  }
};

// =============== FONCTIONS DE GESTION ET MODÉRATION ===============

/**
 * Bloquer un utilisateur
 */
const bloquerUtilisateur = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { raison } = req.body;
    const blockedBy = req.user.userId;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé',
        code: 'USER_NOT_FOUND'
      });
    }

    if (user.statutCompte === 'BLOQUE') {
      return res.status(409).json({
        success: false,
        message: 'Utilisateur déjà bloqué',
        code: 'ALREADY_BLOCKED'
      });
    }

    const ancienStatut = user.statutCompte;
    user.statutCompte = 'BLOQUE';
    
    // Ajouter à l'historique
    user.historiqueStatuts.push({
      ancienStatut,
      nouveauStatut: 'BLOQUE',
      raison,
      dateModification: new Date(),
      modifiePar: blockedBy,
      typeAction: 'BLOCAGE'
    });

    await user.save();

    logger.warn('Utilisateur bloqué', { 
      userId: id, 
      blockedBy, 
      raison,
      ancienStatut
    });

    res.json({
      success: true,
      message: 'Utilisateur bloqué avec succès',
      data: {
        utilisateur: {
          id: user._id,
          statutCompte: user.statutCompte,
          dateBlocage: new Date()
        }
      }
    });

  } catch (error) {
    logger.error('Erreur blocage utilisateur:', error);
    return next(AppError.serverError('Erreur serveur lors du blocage', { 
      originalError: error.message 
    }));
  }
};

/**
 * Débloquer un utilisateur
 */
const debloquerUtilisateur = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { raison } = req.body;
    const unblockedBy = req.user.userId;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé',
        code: 'USER_NOT_FOUND'
      });
    }

    if (user.statutCompte !== 'BLOQUE') {
      return res.status(409).json({
        success: false,
        message: 'Utilisateur non bloqué',
        code: 'NOT_BLOCKED'
      });
    }

    user.statutCompte = 'ACTIF';
    
    // Ajouter à l'historique
    user.historiqueStatuts.push({
      ancienStatut: 'BLOQUE',
      nouveauStatut: 'ACTIF',
      raison,
      dateModification: new Date(),
      modifiePar: unblockedBy,
      typeAction: 'DEBLOCAGE'
    });

    await user.save();

    logger.info('Utilisateur débloqué', { 
      userId: id, 
      unblockedBy, 
      raison
    });

    res.json({
      success: true,
      message: 'Utilisateur débloqué avec succès',
      data: {
        utilisateur: {
          id: user._id,
          statutCompte: user.statutCompte,
          dateDeblocage: new Date()
        }
      }
    });

  } catch (error) {
    logger.error('Erreur déblocage utilisateur:', error);
    return next(AppError.serverError('Erreur serveur lors du déblocage', { 
      originalError: error.message 
    }));
  }
};

/**
 * Suspendre temporairement un utilisateur
 */
const suspendreUtilisateur = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { raison, duree } = req.body;
    const suspendedBy = req.user.userId;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé',
        code: 'USER_NOT_FOUND'
      });
    }

    if (user.statutCompte === 'SUSPENDU') {
      return res.status(409).json({
        success: false,
        message: 'Utilisateur déjà suspendu',
        code: 'ALREADY_SUSPENDED'
      });
    }

    const ancienStatut = user.statutCompte;
    user.statutCompte = 'SUSPENDU';
    
    // Calculer la date de fin de suspension
    const dateFin = new Date();
    dateFin.setDate(dateFin.getDate() + parseInt(duree));
    
    // Ajouter à l'historique
    user.historiqueStatuts.push({
      ancienStatut,
      nouveauStatut: 'SUSPENDU',
      raison,
      duree: parseInt(duree),
      dateFin,
      dateModification: new Date(),
      modifiePar: suspendedBy,
      typeAction: 'SUSPENSION'
    });

    await user.save();

    logger.warn('Utilisateur suspendu', { 
      userId: id, 
      suspendedBy, 
      raison,
      duree: parseInt(duree),
      dateFin
    });

    res.json({
      success: true,
      message: `Utilisateur suspendu pour ${duree} jours`,
      data: {
        utilisateur: {
          id: user._id,
          statutCompte: user.statutCompte,
          dateSuspension: new Date(),
          dateFin,
          dureeJours: parseInt(duree)
        }
      }
    });

  } catch (error) {
    logger.error('Erreur suspension utilisateur:', error);
    return next(AppError.serverError('Erreur serveur lors de la suspension', { 
      originalError: error.message 
    }));
  }
};

/**
 * Réactiver un utilisateur suspendu
 */
const reactiverUtilisateur = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { raison } = req.body;
    const reactivatedBy = req.user.userId;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé',
        code: 'USER_NOT_FOUND'
      });
    }

    if (user.statutCompte !== 'SUSPENDU') {
      return res.status(409).json({
        success: false,
        message: 'Utilisateur non suspendu',
        code: 'NOT_SUSPENDED'
      });
    }

    user.statutCompte = 'ACTIF';
    
    // Ajouter à l'historique
    user.historiqueStatuts.push({
      ancienStatut: 'SUSPENDU',
      nouveauStatut: 'ACTIF',
      raison,
      dateModification: new Date(),
      modifiePar: reactivatedBy,
      typeAction: 'REACTIVATION'
    });

    await user.save();

    logger.info('Utilisateur réactivé', { 
      userId: id, 
      reactivatedBy, 
      raison
    });

    res.json({
      success: true,
      message: 'Utilisateur réactivé avec succès',
      data: {
        utilisateur: {
          id: user._id,
          statutCompte: user.statutCompte,
          dateReactivation: new Date()
        }
      }
    });

  } catch (error) {
    logger.error('Erreur réactivation utilisateur:', error);
    return next(AppError.serverError('Erreur serveur lors de la réactivation', { 
      originalError: error.message 
    }));
  }
};

/**
 * Vérifier le document d'identité d'un utilisateur
 */
const verifierDocumentUtilisateur = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { commentaire } = req.body;
    const verificateurId = req.user.userId;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé',
        code: 'USER_NOT_FOUND'
      });
    }

    if (!user.documentIdentite || !user.documentIdentite.photoDocument) {
      return res.status(400).json({
        success: false,
        message: 'Aucun document d\'identité soumis',
        code: 'NO_DOCUMENT_SUBMITTED'
      });
    }

    if (user.documentIdentite.statutVerification === 'VERIFIE') {
      return res.status(409).json({
        success: false,
        message: 'Document déjà vérifié',
        code: 'ALREADY_VERIFIED'
      });
    }

    // Mettre à jour le statut de vérification
    user.documentIdentite.statutVerification = 'VERIFIE';
    user.documentIdentite.dateVerification = new Date();
    user.documentIdentite.verificateurId = verificateurId;
    user.documentIdentite.commentaireVerification = commentaire;
    
    // Marquer l'utilisateur comme vérifié
    user.estVerifie = true;
    user.estDocumentVerifie = true;
    
    // Améliorer le score de confiance
    user.scoreConfiance = Math.min(100, user.scoreConfiance + 15);

    await user.save();

    logger.info('Document utilisateur vérifié', { 
      userId: id, 
      verificateurId,
      commentaire
    });

    res.json({
      success: true,
      message: 'Document d\'identité vérifié avec succès',
      data: {
        utilisateur: {
          id: user._id,
          estVerifie: user.estVerifie,
          estDocumentVerifie: user.estDocumentVerifie,
          scoreConfiance: user.scoreConfiance,
          documentIdentite: {
            statutVerification: user.documentIdentite.statutVerification,
            dateVerification: user.documentIdentite.dateVerification
          }
        }
      }
    });

  } catch (error) {
    logger.error('Erreur vérification document:', error);
    return next(AppError.serverError('Erreur serveur lors de la vérification', { 
      originalError: error.message 
    }));
  }
};

/**
 * Rejeter le document d'identité d'un utilisateur
 */
const rejeterDocumentUtilisateur = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { raison, typeProbleme, commentaire } = req.body;
    const verificateurId = req.user.userId;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé',
        code: 'USER_NOT_FOUND'
      });
    }

    if (!user.documentIdentite || !user.documentIdentite.photoDocument) {
      return res.status(400).json({
        success: false,
        message: 'Aucun document d\'identité soumis',
        code: 'NO_DOCUMENT_SUBMITTED'
      });
    }

    // Mettre à jour le statut de vérification
    user.documentIdentite.statutVerification = 'REJETE';
    user.documentIdentite.dateVerification = new Date();
    user.documentIdentite.verificateurId = verificateurId;
    user.documentIdentite.raisonRejet = raison;
    user.documentIdentite.typeProbleme = typeProbleme;
    user.documentIdentite.commentaireVerification = commentaire;
    
    // L'utilisateur devra soumettre à nouveau son document
    user.estDocumentVerifie = false;

    await user.save();

    logger.warn('Document utilisateur rejeté', { 
      userId: id, 
      verificateurId,
      raison,
      typeProbleme
    });

    res.json({
      success: true,
      message: 'Document d\'identité rejeté',
      data: {
        utilisateur: {
          id: user._id,
          estDocumentVerifie: user.estDocumentVerifie,
          documentIdentite: {
            statutVerification: user.documentIdentite.statutVerification,
            raisonRejet: user.documentIdentite.raisonRejet,
            typeProbleme: user.documentIdentite.typeProbleme,
            dateVerification: user.documentIdentite.dateVerification
          }
        }
      }
    });

  } catch (error) {
    logger.error('Erreur rejet document:', error);
    return next(AppError.serverError('Erreur serveur lors du rejet', { 
      originalError: error.message 
    }));
  }
};

// =============== FONCTIONS DE STATISTIQUES ===============

/**
 * Obtenir les statistiques globales
 */
const obtenirStatistiquesGlobales = async (req, res, next) => {
  try {
    // Statistiques générales
    const statsGenerales = await User.aggregate([
      {
        $group: {
          _id: null,
          totalUtilisateurs: { $sum: 1 },
          utilisateursActifs: {
            $sum: { $cond: [{ $eq: ['$statutCompte', 'ACTIF'] }, 1, 0] }
          },
          utilisateursSuspendus: {
            $sum: { $cond: [{ $eq: ['$statutCompte', 'SUSPENDU'] }, 1, 0] }
          },
          utilisateursBloquee: {
            $sum: { $cond: [{ $eq: ['$statutCompte', 'BLOQUE'] }, 1, 0] }
          },
          conducteurs: {
            $sum: { $cond: [{ $in: ['$role', ['conducteur', 'les_deux']] }, 1, 0] }
          },
          passagers: {
            $sum: { $cond: [{ $in: ['$role', ['passager', 'les_deux']] }, 1, 0] }
          },
          utilisateursVerifies: {
            $sum: { $cond: ['$estVerifie', 1, 0] }
          },
          scoreConfianceMoyen: { $avg: '$scoreConfiance' },
          totalTrajets: { $sum: '$nombreTrajetsEffectues' },
          soldeTotalSystem: { $sum: '$compteCovoiturage.solde' }
        }
      }
    ]);

    // Statistiques des comptes covoiturage
    const statsComptes = await User.aggregate([
      {
        $group: {
          _id: null,
          totalRecharges: { $sum: { $size: { $ifNull: ['$compteCovoiturage.historiqueRecharges', []] } } },
          totalRetraits: { $sum: { $size: { $ifNull: ['$compteCovoiturage.historiqueRetraits', []] } } },
          montantTotalRecharge: { 
            $sum: { 
              $reduce: {
                input: { $ifNull: ['$compteCovoiturage.historiqueRecharges', []] },
                initialValue: 0,
                in: { $add: ['$value', '$this.montant'] }
              }
            }
          },
          montantTotalRetraits: { 
            $sum: { 
              $reduce: {
                input: { $ifNull: ['$compteCovoiturage.historiqueRetraits', []] },
                initialValue: 0,
                in: { $add: ['$value', '$this.montant'] }
              }
            }
          }
        }
      }
    ]);

    // Évolution par mois (12 derniers mois)
    const maintenant = new Date();
    const debut12Mois = new Date(maintenant.getFullYear(), maintenant.getMonth() - 11, 1);

    const evolutionMensuelle = await User.aggregate([
      { $match: { dateInscription: { $gte: debut12Mois } } },
      {
        $group: {
          _id: {
            annee: { $year: '$dateInscription' },
            mois: { $month: '$dateInscription' }
          },
          nouveauxUtilisateurs: { $sum: 1 },
          nouveauxConducteurs: {
            $sum: { $cond: [{ $in: ['$role', ['conducteur', 'les_deux']] }, 1, 0] }
          }
        }
      },
      { $sort: { '_id.annee': 1, '_id.mois': 1 } }
    ]);

    const statistiques = {
      generales: statsGenerales[0] || {},
      comptes: statsComptes[0] || {},
      evolutionMensuelle,
      dateGeneration: new Date()
    };

    res.json({
      success: true,
      data: statistiques
    });

  } catch (error) {
    logger.error('Erreur statistiques globales:', error);
    return next(AppError.serverError('Erreur serveur lors de la récupération des statistiques', { 
      originalError: error.message 
    }));
  }
};

/**
 * Obtenir les statistiques par période
 */
const obtenirStatistiquesParPeriode = async (req, res, next) => {
  try {
    const { 
      periode, 
      dateDebut, 
      dateFin, 
      granularite = 'jour' 
    } = req.query;

    let dateDebutPeriode, dateFinPeriode;
    const maintenant = new Date();

    // Calculer les dates selon la période
    switch (periode) {
      case 'jour': {
        dateDebutPeriode = new Date(maintenant.setHours(0, 0, 0, 0));
        dateFinPeriode = new Date(maintenant.setHours(23, 59, 59, 999));
        break;
      }
      case 'semaine': {
        const debutSemaine = new Date(maintenant);
        debutSemaine.setDate(maintenant.getDate() - maintenant.getDay());
        dateDebutPeriode = new Date(debutSemaine.setHours(0, 0, 0, 0));
        dateFinPeriode = new Date();
        break;
      }
      case 'mois': {
        dateDebutPeriode = new Date(maintenant.getFullYear(), maintenant.getMonth(), 1);
        dateFinPeriode = new Date();
        break;
      }
      case 'trimestre': {
        const moisTrimestre = Math.floor(maintenant.getMonth() / 3) * 3;
        dateDebutPeriode = new Date(maintenant.getFullYear(), moisTrimestre, 1);
        dateFinPeriode = new Date();
        break;
      }
      case 'annee': {
        dateDebutPeriode = new Date(maintenant.getFullYear(), 0, 1);
        dateFinPeriode = new Date();
        break;
      }
      default: {
        if (dateDebut) dateDebutPeriode = new Date(dateDebut);
        if (dateFin) dateFinPeriode = new Date(dateFin);
      }
    }

    if (!dateDebutPeriode || !dateFinPeriode) {
      return res.status(400).json({
        success: false,
        message: 'Période ou dates invalides',
        code: 'INVALID_PERIOD'
      });
    }

    // Format de regroupement selon la granularité
    let groupFormat;
    switch (granularite) {
      case 'heure':
        groupFormat = {
          annee: { $year: '$dateInscription' },
          mois: { $month: '$dateInscription' },
          jour: { $dayOfMonth: '$dateInscription' },
          heure: { $hour: '$dateInscription' }
        };
        break;
      case 'jour':
        groupFormat = {
          annee: { $year: '$dateInscription' },
          mois: { $month: '$dateInscription' },
          jour: { $dayOfMonth: '$dateInscription' }
        };
        break;
      case 'semaine':
        groupFormat = {
          annee: { $year: '$dateInscription' },
          semaine: { $week: '$dateInscription' }
        };
        break;
      default:
        groupFormat = {
          annee: { $year: '$dateInscription' },
          mois: { $month: '$dateInscription' },
          jour: { $dayOfMonth: '$dateInscription' }
        };
    }

    const statistiques = await User.aggregate([
      {
        $match: {
          dateInscription: {
            $gte: dateDebutPeriode,
            $lte: dateFinPeriode
          }
        }
      },
      {
        $group: {
          _id: groupFormat,
          nouveauxUtilisateurs: { $sum: 1 },
          nouveauxConducteurs: {
            $sum: { $cond: [{ $in: ['$role', ['conducteur', 'les_deux']] }, 1, 0] }
          },
          nouveauxPassagers: {
            $sum: { $cond: [{ $in: ['$role', ['passager', 'les_deux']] }, 1, 0] }
          },
          scoreConfianceMoyen: { $avg: '$scoreConfiance' }
        }
      },
      { $sort: { '_id': 1 } }
    ]);

    res.json({
      success: true,
      data: {
        periode,
        granularite,
        dateDebut: dateDebutPeriode,
        dateFin: dateFinPeriode,
        statistiques,
        resume: {
          totalNouveaux: statistiques.reduce((sum, stat) => sum + stat.nouveauxUtilisateurs, 0),
          totalConducteurs: statistiques.reduce((sum, stat) => sum + stat.nouveauxConducteurs, 0),
          totalPassagers: statistiques.reduce((sum, stat) => sum + stat.nouveauxPassagers, 0)
        }
      }
    });

  } catch (error) {
    logger.error('Erreur statistiques par période:', error);
    return next(AppError.serverError('Erreur serveur lors de la récupération', { 
      originalError: error.message 
    }));
  }
};

/**
 * Obtenir un rapport d'activité détaillé
 */
const obtenirRapportActivite = async (req, res, next) => {
  try {
    const { 
      type = 'complet',
      format = 'json',
      dateDebut,
      dateFin
    } = req.query;

    // Note: includeGraphiques pourrait être utilisé pour des fonctionnalités futures
    // eslint-disable-next-line no-unused-vars
    const includeGraphiques = req.query.includeGraphiques || false;

    // Définir la période par défaut (30 derniers jours)
    const finPeriode = dateFin ? new Date(dateFin) : new Date();
    const debutPeriode = dateDebut ? new Date(dateDebut) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Données pour le rapport
    const rapportData = {};

    if (type === 'complet' || type === 'resume') {
      // Statistiques générales
      const statsGenerales = await User.aggregate([
        {
          $group: {
            _id: null,
            totalUtilisateurs: { $sum: 1 },
            utilisateursActifs: {
              $sum: { $cond: [{ $eq: ['$statutCompte', 'ACTIF'] }, 1, 0] }
            },
            tauxVerification: {
              $avg: { $cond: ['$estVerifie', 100, 0] }
            },
            scoreConfianceMoyen: { $avg: '$scoreConfiance' }
          }
        }
      ]);

      rapportData.resume = statsGenerales[0];
    }

    if (type === 'complet' || type === 'tendances') {
      // Évolution des inscriptions
      const evolutionInscriptions = await User.aggregate([
        {
          $match: {
            dateInscription: { $gte: debutPeriode, $lte: finPeriode }
          }
        },
        {
          $group: {
            _id: {
              annee: { $year: '$dateInscription' },
              mois: { $month: '$dateInscription' },
              jour: { $dayOfMonth: '$dateInscription' }
            },
            inscriptions: { $sum: 1 }
          }
        },
        { $sort: { '_id': 1 } }
      ]);

      rapportData.tendances = {
        evolutionInscriptions,
        periodeAnalysee: {
          debut: debutPeriode,
          fin: finPeriode,
          dureeJours: Math.ceil((finPeriode - debutPeriode) / (1000 * 60 * 60 * 24))
        }
      };
    }

    if (type === 'complet') {
      // Top des villes
      const topVilles = await User.aggregate([
        { $match: { 'adresse.ville': { $exists: true, $ne: '' } } },
        { $group: { _id: '$adresse.ville', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ]);

      // Répartition des rôles
      const repartitionRoles = await User.aggregate([
        { $group: { _id: '$role', count: { $sum: 1 } } }
      ]);

      rapportData.detailsComplete = {
        topVilles,
        repartitionRoles,
        dateGeneration: new Date()
      };
    }

    // Générer le rapport selon le format demandé
    if (format === 'json') {
      res.json({
        success: true,
        data: {
          typeRapport: type,
          format,
          ...rapportData
        }
      });
    } else if (format === 'pdf') {
      // Générer un PDF simple
      const doc = new PDFDocument();
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename=rapport-activite.pdf');
      
      doc.pipe(res);
      
      doc.fontSize(20).text('Rapport d\'Activité - Utilisateurs', 100, 100);
      doc.fontSize(12).text(`Période: ${debutPeriode.toLocaleDateString()} - ${finPeriode.toLocaleDateString()}`, 100, 130);
      
      if (rapportData.resume) {
        doc.text(`Total utilisateurs: ${rapportData.resume.totalUtilisateurs}`, 100, 160);
        doc.text(`Utilisateurs actifs: ${rapportData.resume.utilisateursActifs}`, 100, 180);
        doc.text(`Score de confiance moyen: ${Math.round(rapportData.resume.scoreConfianceMoyen)}`, 100, 200);
      }
      
      doc.end();
    } else if (format === 'csv') {
      // Format CSV simple
      let csvContent = 'Type,Valeur\n';
      if (rapportData.resume) {
        csvContent += `Total Utilisateurs,${rapportData.resume.totalUtilisateurs}\n`;
        csvContent += `Utilisateurs Actifs,${rapportData.resume.utilisateursActifs}\n`;
        csvContent += `Score Confiance Moyen,${Math.round(rapportData.resume.scoreConfianceMoyen)}\n`;
      }
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=rapport-activite.csv');
      res.send(csvContent);
    }

    logger.info('Rapport d\'activité généré', { 
      type, 
      format, 
      generatedBy: req.user.userId,
      periode: { dateDebut: debutPeriode, dateFin: finPeriode }
    });

  } catch (error) {
    logger.error('Erreur génération rapport:', error);
    return next(AppError.serverError('Erreur serveur lors de la génération du rapport', { 
      originalError: error.message 
    }));
  }
};

// =============== FONCTIONS DE MODÉRATION ===============

/**
 * Obtenir les utilisateurs signalés
 */
const obtenirUtilisateursSignales = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, statut } = req.query;

    let query = { 'signalements.0': { $exists: true } }; // Utilisateurs ayant au moins un signalement
    
    if (statut && ['EN_ATTENTE', 'TRAITE', 'REJETE'].includes(statut)) {
      query['signalements.statut'] = statut;
    }

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      select: 'nom prenom email role statutCompte signalements dateInscription',
      sort: { 'signalements.dateSignalement': -1 }
    };

    const users = await User.paginate(query, options);

    res.json({
      success: true,
      data: {
        utilisateursSignales: users.docs,
        pagination: {
          currentPage: users.page,
          totalPages: users.totalPages,
          totalCount: users.totalDocs
        },
        statistiques: {
          totalSignalements: users.totalDocs,
          enAttente: users.docs.filter(u => u.signalements.some(s => s.statut === 'EN_ATTENTE')).length
        }
      }
    });

  } catch (error) {
    logger.error('Erreur utilisateurs signalés:', error);
    return next(AppError.serverError('Erreur serveur lors de la récupération', { 
      originalError: error.message 
    }));
  }
};

/**
 * Traiter un signalement
 */
const traiterSignalement = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { action, raison, duree } = req.body;
    const moderateurId = req.user.userId;

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé',
        code: 'USER_NOT_FOUND'
      });
    }

    // Vérifier s'il y a des signalements en attente
    const signalementEnAttente = user.signalements.find(s => s.statut === 'EN_ATTENTE');
    if (!signalementEnAttente) {
      return res.status(400).json({
        success: false,
        message: 'Aucun signalement en attente pour cet utilisateur',
        code: 'NO_PENDING_REPORT'
      });
    }

    let nouvelleAction = '';
    let nouveauStatut = user.statutCompte;

    // Exécuter l'action de modération
    switch (action) {
      case 'BLOQUER':
        if (user.statutCompte !== 'BLOQUE') {
          nouveauStatut = 'BLOQUE';
          nouvelleAction = 'Utilisateur bloqué suite au signalement';
        }
        break;
      
      case 'SUSPENDRE':
        if (user.statutCompte !== 'SUSPENDU') {
          nouveauStatut = 'SUSPENDU';
          nouvelleAction = `Utilisateur suspendu pour ${duree} jours suite au signalement`;
        }
        break;
      
      case 'VERIFIER_DOCUMENT':
        if (user.documentIdentite && user.documentIdentite.statutVerification !== 'VERIFIE') {
          user.documentIdentite.statutVerification = 'VERIFIE';
          user.documentIdentite.dateVerification = new Date();
          user.documentIdentite.verificateurId = moderateurId;
          user.estVerifie = true;
          user.estDocumentVerifie = true;
          nouvelleAction = 'Document vérifié suite à la modération';
        }
        break;
      
      case 'REJETER_DOCUMENT':
        if (user.documentIdentite) {
          user.documentIdentite.statutVerification = 'REJETE';
          user.documentIdentite.dateVerification = new Date();
          user.documentIdentite.verificateurId = moderateurId;
          user.documentIdentite.raisonRejet = raison;
          user.estDocumentVerifie = false;
          nouvelleAction = 'Document rejeté suite à la modération';
        }
        break;
      
      default:
        return res.status(400).json({
          success: false,
          message: 'Action de modération invalide',
          code: 'INVALID_ACTION'
        });
    }

    // Mettre à jour le signalement
    signalementEnAttente.statut = 'TRAITE';
    signalementEnAttente.dateTraitement = new Date();
    signalementEnAttente.traitePar = moderateurId;
    signalementEnAttente.actionPrise = action;
    signalementEnAttente.commentaireModerator = raison;

    // Mettre à jour le statut de l'utilisateur si nécessaire
    if (nouveauStatut !== user.statutCompte) {
      const ancienStatut = user.statutCompte;
      user.statutCompte = nouveauStatut;
      
      user.historiqueStatuts.push({
        ancienStatut,
        nouveauStatut,
        raison: `Modération suite à signalement: ${raison}`,
        duree: duree ? parseInt(duree) : null,
        dateModification: new Date(),
        modifiePar: moderateurId,
        typeAction: 'MODERATION'
      });
    }

    await user.save();

    logger.info('Signalement traité', { 
      userId: id, 
      moderateurId, 
      action, 
      raison
    });

    res.json({
      success: true,
      message: `Signalement traité avec succès. ${nouvelleAction}`,
      data: {
        utilisateur: {
          id: user._id,
          statutCompte: user.statutCompte,
          signalementTraite: {
            action,
            dateTraitement: new Date(),
            traitePar: moderateurId
          }
        }
      }
    });

  } catch (error) {
    logger.error('Erreur traitement signalement:', error);
    return next(AppError.serverError('Erreur serveur lors du traitement', { 
      originalError: error.message 
    }));
  }
};

/**
 * Obtenir l'historique des actions de modération
 */
const obtenirHistoriqueModeration = async (req, res, next) => {
  try {
    const { 
      page = 1, 
      limit = 50, 
      moderateur, 
      dateDebut, 
      dateFin,
      typeAction 
    } = req.query;

    let matchQuery = {
      'historiqueStatuts.0': { $exists: true }
    };

    // Filtrer par modérateur
    if (moderateur) {
      matchQuery['historiqueStatuts.modifiePar'] = moderateur;
    }

    // Filtrer par type d'action
    if (typeAction && ['BLOCAGE', 'SUSPENSION', 'MODERATION', 'REACTIVATION'].includes(typeAction)) {
      matchQuery['historiqueStatuts.typeAction'] = typeAction;
    }

    // Filtrer par date
    if (dateDebut || dateFin) {
      matchQuery['historiqueStatuts.dateModification'] = {};
      if (dateDebut) {
        matchQuery['historiqueStatuts.dateModification'].$gte = new Date(dateDebut);
      }
      if (dateFin) {
        matchQuery['historiqueStatuts.dateModification'].$lte = new Date(dateFin);
      }
    }

    const historique = await User.aggregate([
      { $match: matchQuery },
      { $unwind: '$historiqueStatuts' },
      {
        $lookup: {
          from: 'users',
          localField: 'historiqueStatuts.modifiePar',
          foreignField: '_id',
          as: 'moderateurInfo',
          pipeline: [{ $project: { nom: 1, prenom: 1, role: 1 } }]
        }
      },
      {
        $project: {
          utilisateur: {
            id: '$_id',
            nom: '$nom',
            prenom: '$prenom',
            email: '$email'
          },
          action: {
            ancienStatut: '$historiqueStatuts.ancienStatut',
            nouveauStatut: '$historiqueStatuts.nouveauStatut',
            raison: '$historiqueStatuts.raison',
            dateModification: '$historiqueStatuts.dateModification',
            typeAction: '$historiqueStatuts.typeAction',
            duree: '$historiqueStatuts.duree'
          },
          moderateur: { $arrayElemAt: ['$moderateurInfo', 0] }
        }
      },
      { $sort: { 'action.dateModification': -1 } },
      { $skip: (parseInt(page) - 1) * parseInt(limit) },
      { $limit: parseInt(limit) }
    ]);

    // Compter le total pour la pagination
    const totalCount = await User.aggregate([
      { $match: matchQuery },
      { $unwind: '$historiqueStatuts' },
      { $count: 'total' }
    ]);

    const total = totalCount[0]?.total || 0;
    const totalPages = Math.ceil(total / parseInt(limit));

    res.json({
      success: true,
      data: {
        historique,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalCount: total,
          hasNextPage: parseInt(page) < totalPages,
          hasPrevPage: parseInt(page) > 1
        },
        filtres: {
          moderateur,
          dateDebut,
          dateFin,
          typeAction
        }
      }
    });

  } catch (error) {
    logger.error('Erreur historique modération:', error);
    return next(AppError.serverError('Erreur serveur lors de la récupération', { 
      originalError: error.message 
    }));
  }
};

// =============== FONCTIONS DE PROFIL UTILISATEUR ===============

/**
 * Mettre à jour le profil utilisateur
 */
const mettreAJourProfil = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const updateData = req.body;

    // Champs autorisés pour la mise à jour
    const champsAutorises = [
      'nom', 'prenom','email', 'telephone', 'dateNaissance', 'sexe',
      'adresse' 
      // , 'preferences', 'contactsUrgence'
    ];
    // ✅ VALIDATION : Ne pas accepter photoProfil depuis le client
    // L'upload d'image doit passer par la route uploadPhotoProfil
    if (updateData.photoProfil) {
      logger.warn('⚠️ Tentative de mise à jour de photoProfil via mettreAJourProfil ignorée', { 
        userId, 
        photoProfilFournie: updateData.photoProfil 
      });
      delete updateData.photoProfil; // Ignorer ce champ
    }
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
// En haut de votre fichier contrôleur, importez le bon uploader

const uploadPhotoProfil = async (req, res, next) => {
  try {
    const uploadSingle = uploadProfilPhoto.single('photoProfil');
    
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
        const photoUrl = `/uploads/profils/${req.file.filename}`;

        const user = await User.findByIdAndUpdate(
          userId,
          { photoProfil: photoUrl },
          { new: true, select: '-motDePasse' }
        );

        if (!user) {
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
    const uploadSingle = uploadDocument.single('documentIdentite');
    
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
        const documentUrl = `/uploads/documents/${req.file.filename}`;

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

    // Vérifier que les mots de passe sont différents
    if (motDePasseActuel === nouveauMotDePasse) {
      return res.status(400).json({
        success: false,
        message: 'Le nouveau mot de passe doit être différent de l\'ancien'
      });
    }

    const user = await User.findById(userId).select('+motDePasse');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }
    
    const isMatch = await user.verifierMotDePasse(motDePasseActuel);
    if (!isMatch) {
      logger.warn('Changement mot de passe - Mot de passe actuel incorrect', { userId });
      return res.status(401).json({
        success: false,
        message: 'Mot de passe actuel incorrect',
        champ: 'motDePasseActuel'
      });
    }

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
 * Obtenir le dashboard utilisateur
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

// =============== EXPORT DU MODULE ===============

module.exports = {
  // CRUD de base
  obtenirUtilisateurs,
  obtenirUtilisateur,
  creerUtilisateur,
  mettreAJourUtilisateur,
  modifierUtilisateur,
  updateUtilisateur,
  supprimerUtilisateur,
  
  // Fonctions avancées
  changerStatutUtilisateur,
  obtenirStatistiquesUtilisateurs,
  rechercherUtilisateurs,
  exporterUtilisateurs,
  obtenirUtilisateursParRole,
  obtenirUtilisateursActifs,
  obtenirUtilisateursRecents,
  
  // Fonctions de gestion
  bloquerUtilisateur,
  debloquerUtilisateur,
  suspendreUtilisateur,
  reactiverUtilisateur,
  verifierDocumentUtilisateur,
  rejeterDocumentUtilisateur,
  
  // Fonctions de statistiques
  obtenirStatistiquesGlobales,
  obtenirStatistiquesParPeriode,
  obtenirRapportActivite,
  
  // Fonctions de modération
  obtenirUtilisateursSignales,
  traiterSignalement,
  obtenirHistoriqueModeration,
  
  // Fonctions de profil utilisateur
  mettreAJourProfil,
  uploadPhotoProfil,
  uploadDocumentIdentite,
  changerMotDePasse,
  obtenirDashboard
};