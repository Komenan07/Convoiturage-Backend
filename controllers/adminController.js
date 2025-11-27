// =====================================================
// CONTRÔLEUR ADMINISTRATEUR - Version corrigée
// =====================================================

const Administrateur = require('../models/Administrateur');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const AppError = require('../utils/AppError');

/**
 * Utilitaire pour générer un token JWT
 */
const genererToken = (adminId) => {
  return jwt.sign(
    { id: adminId, type: 'admin' },
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
    const admin = await Administrateur.trouverParEmail(email);
    
    if (!admin) {
      return res.status(401).json({
        success: false,
        message: 'Identifiants incorrects',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // Vérifier si le compte est actif
    if (admin.statutCompte !== 'ACTIF') {
      return res.status(403).json({
        success: false,
        message: 'Compte administrateur suspendu',
        code: 'ACCOUNT_SUSPENDED'
      });
    }

    // Vérifier le mot de passe
    const motDePasseValide = await admin.verifierMotDePasse(motDePasse);
    
    if (!motDePasseValide) {
      return res.status(401).json({
        success: false,
        message: 'Identifiants incorrects',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // Mettre à jour la dernière connexion
    await admin.mettreAJourConnexion();

    // Générer le token
    const token = genererToken(admin._id);

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
          permissions: admin.permissions,
          nomComplet: admin.nomComplet
        }
      }
    });

  } catch (erreur) {
    return next(AppError.serverError('Erreur serveur lors de la connexion', { originalError: erreur.message }));
  }
};

/**
 * @desc    Obtenir le profil de l'admin connecté
 * @route   GET /api/admin/auth/profil
 * @access  Private (Admin)
 */
const obtenirProfil = async (req, res, next) => {
  try {
    // L'admin est déjà chargé par le middleware protectAdmin
    const admin = req.admin;

    res.status(200).json({
      success: true,
      data: { admin }
    });

  } catch (erreur) {
    return next(AppError.serverError('Erreur serveur lors de la récupération du profil', { originalError: erreur.message }));
  }
};
const feedAdmin = async (req, res, next) => {
  try {
    // Vérifier si admin existe déjà
    const adminExiste = await Administrateur.findOne({ 
      email: 'komenanjean07@gmail.com' 
    });
    
    if (adminExiste) {
      return res.status(200).json({
        success: true,
        message: 'Admin principal existe déjà',
        data: {
          id: adminExiste._id,
          email: adminExiste.email,
          role: adminExiste.role
        }
      });
    }

    // Créer l'admin
    const admin = await Administrateur.create({
      nom: 'Admin',
      prenom: 'Principal',
      email: 'komenanjean07@gmail.com',
      motDePasse: 'Je@nM@rc79',
      role: 'SUPER_ADMIN',
      permissions: ['ALL']
    });

    res.status(201).json({
      success: true,
      message: 'Admin principal créé avec succès',
      data: {
        id: admin._id,
        email: admin.email,
        role: admin.role
      }
    });

  } catch (erreur) {
    // Gérer duplication d'email
    if (erreur.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'Un admin avec cet email existe déjà',
        code: 'DUPLICATE_EMAIL'
      });
    }
    
    return next(AppError.serverError('Erreur création admin', { 
      originalError: erreur.message 
    }));
  }
};

// =====================================================
// CRUD ADMINISTRATEURS
// =====================================================

/**
 * @desc    Créer un nouvel administrateur
 * @route   POST /api/admin/admins
 * @access  Private (Super Admin)
 */
const creerAdmin = async (req, res, next) => {
  try {
    // L'admin actuel est disponible via req.user (défini par le middleware)
    const currentAdminId = req.user.id;

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

    const { email, motDePasse, nom, prenom, role, permissions } = req.body;

    // ✅ Vérifier si l'email existe déjà
    const adminExistant = await Administrateur.findOne({ email });
    if (adminExistant) {
      return res.status(409).json({
        success: false,
        message: 'Un administrateur avec cet email existe déjà',
        code: 'DUPLICATE_EMAIL'
      });
    }

    // ✅ Créer l'administrateur DIRECTEMENT avec .create()
    const admin = await Administrateur.create({
      email,
      motDePasse,
      nom,
      prenom,
      role: role || 'SUPPORT',
      permissions: permissions || ['MODERATION'],
      createdBy: currentAdminId,
      statutCompte: 'ACTIF'
    });

    // ✅ Retourner l'admin sans le mot de passe
    const adminResponse = {
      id: admin._id,
      email: admin.email,
      nom: admin.nom,
      prenom: admin.prenom,
      nomComplet: `${admin.prenom} ${admin.nom}`,
      role: admin.role,
      permissions: admin.permissions,
      statutCompte: admin.statutCompte,
      createdAt: admin.createdAt
    };

    res.status(201).json({
      success: true,
      message: 'Administrateur créé avec succès',
      data: { admin: adminResponse }
    });

  } catch (erreur) {
    console.error('❌ Erreur création admin:', erreur);
    
    // Gérer duplication d'email (sécurité supplémentaire)
    if (erreur.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'Un administrateur avec cet email existe déjà',
        code: 'DUPLICATE_EMAIL'
      });
    }
    
    return next(AppError.serverError('Erreur serveur lors de la création de l\'administrateur', { 
      originalError: erreur.message 
    }));
  }
};

/**
 * @desc    Obtenir la liste des administrateurs
 * @route   GET /api/admin/admins
 * @access  Private (Admin avec permission GESTION_UTILISATEURS)
 */
const listerAdmins = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 10,
      sort = '-createdAt',
      email,
      nom,
      role,
      statutCompte,
      dateDebut,
      dateFin
    } = req.query;

    // Validation des paramètres de pagination
    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    if (isNaN(pageNum) || pageNum < 1) {
      return res.status(400).json({
        success: false,
        message: 'Numéro de page invalide',
        code: 'INVALID_PAGE'
      });
    }

    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      return res.status(400).json({
        success: false,
        message: 'Limite invalide (min: 1, max: 100)',
        code: 'INVALID_LIMIT'
      });
    }

    // Construction des filtres
    const filtres = {};
    
    if (email) {
      filtres.email = email;
    }
    
    if (nom) {
      filtres.nom = nom;
    }
    
    if (role) {
      // Validation du rôle
      const rolesValides = ['SUPER_ADMIN', 'MODERATEUR', 'SUPPORT'];
      if (!rolesValides.includes(role)) {
        return res.status(400).json({
          success: false,
          message: 'Rôle invalide',
          code: 'INVALID_ROLE',
          data: { rolesValides }
        });
      }
      filtres.role = role;
    }
    
    if (statutCompte) {
      // Validation du statut
      const statutsValides = ['ACTIF', 'SUSPENDU'];
      if (!statutsValides.includes(statutCompte)) {
        return res.status(400).json({
          success: false,
          message: 'Statut invalide',
          code: 'INVALID_STATUS',
          data: { statutsValides }
        });
      }
      filtres.statutCompte = statutCompte;
    }
    
    if (dateDebut || dateFin) {
      filtres.dateCreation = {};
      if (dateDebut) {
        filtres.dateCreation.debut = dateDebut;
      }
      if (dateFin) {
        filtres.dateCreation.fin = dateFin;
      }
    }

    const options = {
      page: pageNum,
      limit: limitNum,
      sort,
      populate: true
    };

    console.log('📋 Recherche admins avec filtres:', filtres);
    console.log('📋 Options:', options);

    const resultat = await Administrateur.rechercheAvancee(filtres, options);

    res.status(200).json({
      success: true,
      message: 'Liste des administrateurs récupérée',
      data: resultat
    });

  } catch (erreur) {
    console.error('❌ Erreur listerAdmins:', erreur);
    return next(AppError.serverError(
      'Erreur serveur lors de la récupération de la liste des administrateurs', 
      { 
        originalError: erreur.message,
        stack: process.env.NODE_ENV === 'development' ? erreur.stack : undefined
      }
    ));
  }
};

/**
 * @desc    Obtenir un administrateur par ID
 * @route   GET /api/admin/admins/:id
 * @access  Private (Admin avec permission GESTION_UTILISATEURS)
 */
const obtenirAdminParId = async (req, res, next) => {
  try {
    const admin = await Administrateur.findById(req.params.id)
      .populate('createdBy', 'nom prenom email')
      .populate('modifiedBy', 'nom prenom email')

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'Administrateur introuvable',
        code: 'ADMIN_NOT_FOUND'
      });
    }

    res.status(200).json({
      success: true,
      data: { admin }
    });

  } catch (erreur) {
    return next(AppError.serverError('Erreur serveur lors de la récupération de l\'administrateur', { originalError: erreur.message }));
  }
};

/**
 * @desc    Modifier un administrateur
 * @route   PUT /api/admin/admins/:id
 * @access  Private (Super Admin)
 */
const modifierAdmin = async (req, res, next) => {
  try {
    const currentAdminId = req.user.id;

    console.log('🔄 Début modification admin:', {
      adminId: req.params.id,
      currentAdminId,
      body: req.body
    });

    // Validation des erreurs
    const erreurs = validationResult(req);
    if (!erreurs.isEmpty()) {
      console.log('❌ Erreurs de validation:', erreurs.array());
      return res.status(400).json({
        success: false,
        message: 'Données invalides',
        code: 'VALIDATION_ERROR',
        data: { erreurs: erreurs.array() }
      });
    }

    // Vérifier si l'admin existe
    const admin = await Administrateur.findById(req.params.id);

    if (!admin) {
      console.log('❌ Admin non trouvé:', req.params.id);
      return res.status(404).json({
        success: false,
        message: 'Administrateur introuvable',
        code: 'ADMIN_NOT_FOUND'
      });
    }

    console.log('✅ Admin trouvé:', {
      id: admin._id,
      email: admin.email,
      role: admin.role
    });

    // Construire les modifications
    const champsModifiables = ['nom', 'prenom', 'role', 'permissions', 'statutCompte'];
    const modifications = {};

    champsModifiables.forEach(champ => {
      if (req.body[champ] !== undefined) {
        modifications[champ] = req.body[champ];
      }
    });

    // Ajouter les métadonnées
    modifications.modifiedBy = currentAdminId;

    console.log('📝 Modifications à appliquer:', modifications);

    // Appliquer les modifications manuellement
    Object.keys(modifications).forEach(key => {
      admin[key] = modifications[key];
    });

    // Sauvegarder avec validation
    await admin.save();

    console.log('✅ Admin sauvegardé avec succès');

    // Récupérer l'admin modifié avec les relations
    const adminModifie = await Administrateur.findById(req.params.id)
      .populate('createdBy', 'nom prenom email')
      .populate('modifiedBy', 'nom prenom email')
      .lean();

    console.log('✅ Admin modifié récupéré:', adminModifie);

    res.status(200).json({
      success: true,
      message: 'Administrateur modifié avec succès',
      data: { admin: adminModifie }
    });

  } catch (erreur) {
    console.error('❌ Erreur modifierAdmin:', {
      message: erreur.message,
      name: erreur.name,
      stack: erreur.stack,
      code: erreur.code
    });

    // Gestion d'erreurs spécifiques
    if (erreur.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Erreur de validation',
        code: 'VALIDATION_ERROR',
        data: {
          erreurs: Object.values(erreur.errors).map(e => ({
            field: e.path,
            message: e.message
          }))
        }
      });
    }

    if (erreur.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'ID invalide',
        code: 'INVALID_ID'
      });
    }

    return next(AppError.serverError(
      'Erreur serveur lors de la modification de l\'administrateur', 
      { 
        originalError: erreur.message,
        errorName: erreur.name,
        errorCode: erreur.code
      }
    ));
  }
};

/**
 * @desc    Changer le statut d'un administrateur
 * @route   PATCH /api/admin/admins/:id/statut
 * @access  Private (Super Admin)
 */
const changerStatutAdmin = async (req, res, next) => {
  try {
    const currentAdminId = req.user.id;
    const { statutCompte } = req.body;

    if (!['ACTIF', 'SUSPENDU'].includes(statutCompte)) {
      return res.status(400).json({
        success: false,
        message: 'Statut invalide',
        code: 'INVALID_STATUS'
      });
    }

    const admin = await Administrateur.findById(req.params.id);

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'Administrateur introuvable',
        code: 'ADMIN_NOT_FOUND'
      });
    }

    await admin.changerStatut(statutCompte, currentAdminId);

    res.status(200).json({
      success: true,
      message: `Compte ${statutCompte.toLowerCase()} avec succès`,
      data: { admin }
    });

  } catch (erreur) {
    return next(AppError.serverError('Erreur serveur lors du changement de statut', { originalError: erreur.message }));
  }
};

/**
 * @desc    Désactiver un administrateur (soft delete)
 * @route   DELETE /api/admin/admins/:id
 * @access  Private (Super Admin)
 */
const desactiverAdmin = async (req, res, next) => {
  try {
    const currentAdminId = req.user.id;

    const admin = await Administrateur.findById(req.params.id);

    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'Administrateur introuvable',
        code: 'ADMIN_NOT_FOUND'
      });
    }

    // Changer le statut plutôt que de supprimer réellement
    await admin.changerStatut('SUSPENDU', currentAdminId);

    res.status(200).json({
      success: true,
      message: 'Administrateur désactivé avec succès'
    });

  } catch (erreur) {
    return next(AppError.serverError('Erreur serveur lors de la désactivation', { originalError: erreur.message }));
  }
};

// =====================================================
// ANALYTICS ET RAPPORTS
// =====================================================

/**
 * @desc    Obtenir le dashboard analytics
 * @route   GET /api/admin/dashboard
 * @access  Private (Admin avec permission ANALYTICS)
 */
const obtenirDashboard = async (req, res, next) => {
  try {
    // Statistiques des administrateurs
    const statsAdmins = await Administrateur.obtenirStatistiques();

    // Activité récente (dernières connexions)
    const activiteRecente = await Administrateur.find({
      derniereConnexion: { $exists: true, $ne: null }
    })
    .sort({ derniereConnexion: -1 })
    .limit(10)
    .select('nom prenom email role derniereConnexion');

    // Admins créés récemment
    const nouveauxAdmins = await Administrateur.find({
      createdAt: { 
        $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // 30 derniers jours
      }
    })
    .sort({ createdAt: -1 })
    .limit(5)
    .select('nom prenom email role createdAt');

    res.status(200).json({
      success: true,
      data: {
        statistiques: statsAdmins,
        activiteRecente,
        nouveauxAdmins
      }
    });

  } catch (erreur) {
    return next(AppError.serverError('Erreur serveur lors de la récupération du dashboard', { originalError: erreur.message }));
  }
};

/**
 * @desc    Obtenir les statistiques détaillées
 * @route   GET /api/admin/statistiques
 * @access  Private (Admin avec permission ANALYTICS)
 */
const obtenirStatistiques = async (req, res, next) => {
  try {
    const { periode = '30' } = req.query;
    const joursArriere = parseInt(periode);
    const dateDebut = new Date(Date.now() - joursArriere * 24 * 60 * 60 * 1000);

    // Évolution du nombre d'admins
    const evolutionAdmins = await Administrateur.aggregate([
      {
        $match: {
          createdAt: { $gte: dateDebut }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 }
      }
    ]);

    // Répartition par rôle
    const repartitionRoles = await Administrateur.aggregate([
      {
        $group: {
          _id: '$role',
          count: { $sum: 1 }
        }
      }
    ]);

    // Connexions récentes
    const connexionsRecentes = await Administrateur.aggregate([
      {
        $match: {
          derniereConnexion: { $gte: dateDebut }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$derniereConnexion' },
            month: { $month: '$derniereConnexion' },
            day: { $dayOfMonth: '$derniereConnexion' }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1 }
      }
    ]);

    res.status(200).json({
      success: true,
      data: {
        periode: `${joursArriere} derniers jours`,
        evolutionAdmins,
        repartitionRoles,
        connexionsRecentes
      }
    });

  } catch (erreur) {
    return next(AppError.serverError('Erreur serveur lors de la récupération des statistiques', { originalError: erreur.message }));
  }
};

module.exports = {
  // Authentification
  connexionAdmin,
  obtenirProfil,
  
  // CRUD
  creerAdmin,
  listerAdmins,
  obtenirAdminParId,
  modifierAdmin,
  changerStatutAdmin,
  desactiverAdmin,
  
  // Analytics
  obtenirDashboard,
  obtenirStatistiques,
  feedAdmin
};