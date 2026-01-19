// =====================================================
// CONTRÔLEUR ADMINISTRATEUR - Version corrigée
// =====================================================

const Administrateur = require('../models/Administrateur');
const User = require('../models/Utilisateur');
const Vehicule = require('../models/Vehicule');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const AppError = require('../utils/AppError');
const Trajet = require('../models/Trajet');
const Reservation = require('../models/Reservation');
const Paiement = require('../models/Paiement');
const Signalement = require('../models/Signalement');
const Evenement = require('../models/Evenement');
const Evaluation = require('../models/Evaluation');
const AlerteUrgence = require('../models/AlerteUrgence');
const { logger } = require('../utils/logger');
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
    logger.error('❌ Erreur connexionAdmin:', erreur);
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

// =====================================================
// GESTION DES TRAJETS (ADMIN)
// =====================================================

/**
 * @desc    Lister tous les trajets (admin)
 * @route   GET /api/admin/trajets
 * @access  Private (Admin avec permission GESTION_TRAJETS)
 */
const listerTrajets = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      search,
      statut,
      dateDebut,
      dateFin,
      villeDepart,
      villeArrivee,
      conducteurId,
      sortBy = 'dateDepart',
      order = 'desc'
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = Math.min(parseInt(limit), 100);

    const filtres = {};

    if (statut) {
      filtres.statut = statut.toUpperCase();
    }

    if (dateDebut || dateFin) {
      filtres.dateDepart = {};
      if (dateDebut) filtres.dateDepart.$gte = new Date(dateDebut);
      if (dateFin) filtres.dateDepart.$lte = new Date(dateFin);
    }

    if (villeDepart) {
      filtres['depart.ville'] = { $regex: villeDepart, $options: 'i' };
    }

    if (villeArrivee) {
      filtres['arrivee.ville'] = { $regex: villeArrivee, $options: 'i' };
    }

    if (conducteurId) {
      filtres.conducteur = conducteurId;
    }

    if (search) {
      filtres.$or = [
        { 'depart.ville': { $regex: search, $options: 'i' } },
        { 'arrivee.ville': { $regex: search, $options: 'i' } }
      ];
    }

    const sortOptions = {};
    sortOptions[sortBy] = order === 'asc' ? 1 : -1;

    const trajets = await Trajet.find(filtres)
      .populate('conducteurId', 'nom prenom email telephone photo')
      // .populate('vehicule', 'marque modele couleur immatriculation')
      .sort(sortOptions)
      .limit(limitNum)
      .skip((pageNum - 1) * limitNum)
      .lean();

    const total = await Trajet.countDocuments(filtres);

    res.status(200).json({
      success: true,
      data: {
        trajets,
        pagination: {
          currentPage: pageNum,
          totalPages: Math.ceil(total / limitNum),
          totalItems: total,
          itemsPerPage: limitNum
        }
      }
    });

  } catch (error) {
    logger.error('Erreur listerTrajets:', error);
    return next(AppError.serverError('Erreur lors de la récupération des trajets', { originalError: error.message }));
  }
};

/**
 * @desc    Obtenir les détails d'un trajet (admin)
 * @route   GET /api/admin/trajets/:id
 * @access  Private (Admin)
 */
const obtenirTrajet = async (req, res, next) => {
  try {
    const trajet = await Trajet.findById(req.params.id)
      .populate('conducteurId', 'nom prenom email telephone photo statut')
      .lean();

    if (!trajet) {
      return next(AppError.notFound('Trajet introuvable'));
    }

    const reservations = await Reservation.find({ trajet: trajet._id })
      .populate('passagerId', 'nom prenom email telephone photo')
      .lean();

    res.status(200).json({
      success: true,
      data: { trajet, reservations }
    });

  } catch (error) {
    console.log('erreur obtenir trajet : ', error)
    return next(AppError.serverError('Erreur lors de la récupération du trajet', { originalError: error.message }));
  }
};

/**
 * @desc    Obtenir les réservations d'un trajet (admin)
 * @route   GET /api/admin/trajets/:id/reservations
 * @access  Private (Admin)
 */
const obtenirReservationsTrajet = async (req, res, next) => {
  try {
    const reservations = await Reservation.find({ trajet: req.params.id })
      .populate('passagerId', 'nom prenom email telephone photo')
      .sort('-createdAt')
      .lean();

    res.status(200).json({
      success: true,
      data: { reservations }
    });

  } catch (error) {
    return next(AppError.serverError('Erreur lors de la récupération des réservations', { originalError: error.message }));
  }
};

/**
 * @desc    Annuler un trajet (admin)
 * @route   POST /api/admin/trajets/:id/annuler
 * @access  Private (Admin avec permission ANNULATION_TRAJETS)
 */
const annulerTrajet = async (req, res, next) => {
  try {
    const { motif } = req.body;

    if (!motif || motif.trim().length < 10) {
      return next(AppError.badRequest('Motif d\'annulation requis (minimum 10 caractères)'));
    }

    const trajet = await Trajet.findById(req.params.id);

    if (!trajet) {
      return next(AppError.notFound('Trajet introuvable'));
    }

    if (trajet.statut === 'ANNULE') {
      return next(AppError.badRequest('Ce trajet est déjà annulé'));
    }

    trajet.statut = 'ANNULE';
    trajet.motifAnnulation = `[ADMIN] ${motif}`;
    trajet.dateAnnulation = new Date();
    await trajet.save();

    // Annuler les réservations associées
    await Reservation.updateMany(
      { trajet: trajet._id, statut: { $in: ['CONFIRMEE', 'EN_ATTENTE'] } },
      { statut: 'ANNULEE', motifAnnulation: `Trajet annulé par l'administrateur: ${motif}` }
    );

    res.status(200).json({
      success: true,
      message: 'Trajet annulé avec succès'
    });

  } catch (error) {
    return next(AppError.serverError('Erreur lors de l\'annulation du trajet', { originalError: error.message }));
  }
};

/**
 * @desc    Supprimer un trajet (admin)
 * @route   DELETE /api/admin/trajets/:id
 * @access  Private (Admin)
 */
const supprimerTrajet = async (req, res, next) => {
  try {
    const reservationsActives = await Reservation.countDocuments({
      trajet: req.params.id,
      statut: { $in: ['CONFIRMEE', 'EN_ATTENTE'] }
    });

    if (reservationsActives > 0) {
      return next(AppError.badRequest('Impossible de supprimer un trajet avec des réservations actives'));
    }

    await Trajet.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Trajet supprimé avec succès'
    });

  } catch (error) {
    return next(AppError.serverError('Erreur lors de la suppression du trajet', { originalError: error.message }));
  }
};

// =====================================================
// GESTION DES UTILISATEURS (ADMIN)
// =====================================================

/**
 * @desc    Lister tous les utilisateurs (admin)
 * @route   GET /api/admin/utilisateurs
 * @access  Private (Admin avec permission GESTION_UTILISATEURS)
 */
const listerUtilisateurs = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      search,
      role,
      statut,
      sortBy = 'nom',
      order = 'desc'
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = Math.min(parseInt(limit), 100);

    const filtres = {};

    if (role) {
      filtres.role = role.toUpperCase();
    }

    if (statut) {
      filtres.statut = statut.toUpperCase();
    }

    if (search) {
      filtres.$or = [
        { nom: { $regex: search, $options: 'i' } },
        { prenom: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { telephone: { $regex: search, $options: 'i' } }
      ];
    }

    const sortOptions = {};
    sortOptions[sortBy] = order === 'asc' ? 1 : -1;

    const utilisateurs = await User.find(filtres)
      .select('-motDePasse')
      .sort(sortOptions)
      .limit(limitNum)
      .skip((pageNum - 1) * limitNum)
      .lean();

    const total = await User.countDocuments(filtres);

    res.status(200).json({
      success: true,
      data: {
        utilisateurs,
        pagination: {
          currentPage: pageNum,
          totalPages: Math.ceil(total / limitNum),
          totalItems: total,
          itemsPerPage: limitNum
        }
      }
    });

  } catch (error) {
    return next(AppError.serverError('Erreur lors de la récupération des utilisateurs', { originalError: error.message }));
  }
};

/**
 * @desc    Obtenir les détails d'un utilisateur (admin)
 * @route   GET /api/admin/utilisateurs/:id
 * @access  Private (Admin)
 */
const obtenirUtilisateur = async (req, res, next) => {
  try {
    const utilisateur = await User.findById(req.params.id)
      .select('-motDePasse')
      .lean();

    if (!utilisateur) {
      return next(AppError.notFound('Utilisateur introuvable'));
    }

    res.status(200).json({
      success: true,
      data: { utilisateur }
    });

  } catch (error) {
    return next(AppError.serverError('Erreur lors de la récupération de l\'utilisateur', { originalError: error.message }));
  }
};

/**
 * @desc    Obtenir les statistiques d'un utilisateur (admin)
 * @route   GET /api/admin/utilisateurs/:id/statistiques
 * @access  Private (Admin)
 */
const obtenirStatistiquesUtilisateur = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return next(AppError.notFound('Utilisateur introuvable'));
    }

    const [trajets, reservations] = await Promise.all([
      Trajet.countDocuments({ conducteurId: user._id }),
      Reservation.countDocuments({ passagerId: user._id })
    ]);

    res.status(200).json({
      success: true,
      data: {
        trajets: { total: trajets },
        reservations: { total: reservations }
      }
    });

  } catch (error) {
    return next(AppError.serverError('Erreur lors de la récupération des statistiques', { originalError: error.message }));
  }
};

/**
 * @desc    Obtenir les trajets d'un utilisateur (admin)
 * @route   GET /api/admin/utilisateurs/:id/trajets
 * @access  Private (Admin)
 */
const obtenirTrajetsUtilisateur = async (req, res, next) => {
  try {
    const trajets = await Trajet.find({ conducteurId: req.params.id })
      .sort('-dateDepart')
      .limit(50)
      .lean();

    res.status(200).json({
      success: true,
      data: { trajets }
    });

  } catch (error) {
    return next(AppError.serverError('Erreur lors de la récupération des trajets', { originalError: error.message }));
  }
};

/**
 * @desc    Obtenir les réservations d'un utilisateur (admin)
 * @route   GET /api/admin/utilisateurs/:id/reservations
 * @access  Private (Admin)
 */
const obtenirReservationsUtilisateur = async (req, res, next) => {
  try {
    const reservations = await Reservation.find({ passagerId: req.params.id })
      .populate('trajetId', 'depart arrivee dateDepart prix')
      .sort('-createdAt')
      .limit(50)
      .lean();

    res.status(200).json({
      success: true,
      data: { reservations }
    });

  } catch (error) {
    return next(AppError.serverError('Erreur lors de la récupération des réservations', { originalError: error.message }));
  }
};

/**
 * @desc    Obtenir les véhicules d'un utilisateur (admin)
 * @route   GET /api/admin/utilisateurs/:id/vehicules
 * @access  Private (Admin)
 */
const obtenirVehiculesUtilisateur = async (req, res, next) => {
  try {
    const vehicules = await Vehicule.find({ 
      proprietaireId: req.params.id 
    })
      .populate('proprietaireId', 'nom prenom email')
      .sort('-createdAt')
      .lean();

    res.status(200).json({
      success: true,
      data: { vehicules }
    });

  } catch (error) {
    return next(AppError.serverError('Erreur lors de la récupération des véhicules', { originalError: error.message }));
  }
};

/**
 * @desc    Suspendre un utilisateur (admin)
 * @route   POST /api/admin/utilisateurs/:id/suspendre
 * @access  Private (Admin)
 */
const suspendreUtilisateur = async (req, res, next) => {
  try {
    const { motif, duree } = req.body;

    if (!motif || motif.trim().length < 10) {
      return next(AppError.badRequest('Motif de suspension requis (minimum 10 caractères)'));
    }

    const user = await User.findById(req.params.id);

    if (!user) {
      return next(AppError.notFound('Utilisateur introuvable'));
    }

    const dateFin = new Date();
    dateFin.setDate(dateFin.getDate() + parseInt(duree || 7));

    user.statut = 'SUSPENDU';
    user.suspensionDebut = new Date();
    user.suspensionFin = dateFin;
    user.motifSuspension = `[ADMIN] ${motif}`;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Utilisateur suspendu avec succès'
    });

  } catch (error) {
    return next(AppError.serverError('Erreur lors de la suspension', { originalError: error.message }));
  }
};

/**
 * @desc    Activer/Réactiver un utilisateur (admin)
 * @route   POST /api/admin/utilisateurs/:id/activer
 * @access  Private (Admin)
 */
const activerUtilisateur = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      return next(AppError.notFound('Utilisateur introuvable'));
    }

    user.statut = 'ACTIF';
    user.suspensionDebut = undefined;
    user.suspensionFin = undefined;
    user.motifSuspension = undefined;
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Utilisateur activé avec succès'
    });

  } catch (error) {
    return next(AppError.serverError('Erreur lors de l\'activation', { originalError: error.message }));
  }
};

/**
 * @desc    Supprimer un utilisateur (admin)
 * @route   DELETE /api/admin/utilisateurs/:id
 * @access  Private (Admin)
 */
const supprimerUtilisateur = async (req, res, next) => {
  try {
    const [trajetsActifs, reservationsActives] = await Promise.all([
      Trajet.countDocuments({
        conducteurId: req.params.id,
        statut: { $in: ['PLANIFIE', 'EN_COURS'] }
      }),
      Reservation.countDocuments({
        passagerId: req.params.id,
        statut: { $in: ['CONFIRMEE', 'EN_ATTENTE'] }
      })
    ]);

    if (trajetsActifs > 0 || reservationsActives > 0) {
      return next(AppError.badRequest('Impossible de supprimer un utilisateur avec des trajets/réservations actifs'));
    }

    await User.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Utilisateur supprimé avec succès'
    });

  } catch (error) {
    return next(AppError.serverError('Erreur lors de la suppression', { originalError: error.message }));
  }
};

/**
 * @desc    Exporter les utilisateurs (admin)
 * @route   GET /api/admin/utilisateurs/export
 * @access  Private (Admin)
 */
const exporterUtilisateurs = async (req, res, next) => {
  try {
    const { role, statut } = req.query;
    const filtres = {};

    if (role) filtres.role = role.toUpperCase();
    if (statut) filtres.statut = statut.toUpperCase();

    const utilisateurs = await User.find(filtres)
      .select('nom prenom email telephone role statut createdAt')
      .lean();

    res.status(200).json({
      success: true,
      data: { utilisateurs }
    });

  } catch (error) {
    return next(AppError.serverError('Erreur lors de l\'export', { originalError: error.message }));
  }
};

// =====================================================
// GESTION DES RÉSERVATIONS (ADMIN)
// =====================================================

/**
 * @desc    Lister toutes les réservations (admin)
 * @route   GET /api/admin/reservations
 * @access  Private (Admin)
 */
const listerReservations = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      //search,
      statut,
      dateDebut,
      dateFin
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = Math.min(parseInt(limit), 100);

    const filtres = {};

    if (statut) {
      filtres.statut = statut.toUpperCase();
    }

    if (dateDebut || dateFin) {
      filtres.createdAt = {};
      if (dateDebut) filtres.createdAt.$gte = new Date(dateDebut);
      if (dateFin) filtres.createdAt.$lte = new Date(dateFin);
    }

    const reservations = await Reservation.find(filtres)
      .populate('passagerId', 'nom prenom email')
      .populate('trajetId', 'pointDepart pointArrivee photoProfil dateDepart')
      .sort('-createdAt')
      .limit(limitNum)
      .skip((pageNum - 1) * limitNum)
      .lean();

    const total = await Reservation.countDocuments(filtres);

    res.status(200).json({
      success: true,
      data: {
        reservations,
        pagination: {
          currentPage: pageNum,
          totalPages: Math.ceil(total / limitNum),
          totalItems: total
        }
      }
    });

  } catch (error) {
    console.log("erreur admin liste reservations : ",error)
    return next(AppError.serverError('Erreur lors de la récupération des réservations', { originalError: error.message }));
  }
};

/**
 * @desc    Obtenir les détails d'une réservation (admin)
 * @route   GET /api/admin/reservations/:id
 * @access  Private (Admin)
 */
const obtenirReservation = async (req, res, next) => {
  try {
    const reservation = await Reservation.findById(req.params.id)
      .populate('passagerId', 'nom prenom email photoProfil telephone')
      .populate({
        path:'trajetId',
        populate: {
          path: 'conducteurId',
          select: 'nom prenom email photoProfil telephone'
        }
      })
      .lean();

    if (!reservation) {
      return next(AppError.notFound('Réservation introuvable'));
    }

    res.status(200).json({
      success: true,
      data: { reservation }
    });

  } catch (error) {
    console.log(error)
    return next(AppError.serverError('Erreur lors de la récupération de la réservation', { originalError: error.message }));
  }
};

/**
 * @desc    Confirmer une réservation (admin)
 * @route   POST /api/admin/reservations/:id/confirmer
 * @access  Private (Admin)
 */
const confirmerReservation = async (req, res, next) => {
  try {
    const reservation = await Reservation.findById(req.params.id);

    if (!reservation) {
      return next(AppError.notFound('Réservation introuvable'));
    }

    reservation.statut = 'CONFIRMEE';
    await reservation.save();

    res.status(200).json({
      success: true,
      message: 'Réservation confirmée avec succès'
    });

  } catch (error) {
    return next(AppError.serverError('Erreur lors de la confirmation', { originalError: error.message }));
  }
};

/**
 * @desc    Annuler une réservation (admin)
 * @route   POST /api/admin/reservations/:id/annuler
 * @access  Private (Admin)
 */
const annulerReservation = async (req, res, next) => {
  try {
    const { motif } = req.body;

    if (!motif || motif.trim().length < 10) {
      return next(AppError.badRequest('Motif d\'annulation requis (minimum 10 caractères)'));
    }

    const reservation = await Reservation.findById(req.params.id);

    if (!reservation) {
      return next(AppError.notFound('Réservation introuvable'));
    }

    reservation.statut = 'ANNULEE';
    reservation.motifAnnulation = `[ADMIN] ${motif}`;
    await reservation.save();

    res.status(200).json({
      success: true,
      message: 'Réservation annulée avec succès'
    });

  } catch (error) {
    return next(AppError.serverError('Erreur lors de l\'annulation', { originalError: error.message }));
  }
};

// =====================================================
// GESTION DES PAIEMENTS (ADMIN)
// =====================================================

/**
 * @desc    Lister tous les paiements (admin)
 * @route   GET /api/admin/paiements
 * @access  Private (Admin)
 */
const listerPaiements = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      statut,
      methode,
      dateDebut,
      dateFin
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = Math.min(parseInt(limit), 100);

    const filtres = {};

    if (statut) filtres.statut = statut.toUpperCase();
    if (methode) filtres.methode = methode.toUpperCase();

    if (dateDebut || dateFin) {
      filtres.createdAt = {};
      if (dateDebut) filtres.createdAt.$gte = new Date(dateDebut);
      if (dateFin) filtres.createdAt.$lte = new Date(dateFin);
    }

    const paiements = await Paiement.find(filtres)
      .populate('utilisateur', 'nom prenom email')
      .sort('-createdAt')
      .limit(limitNum)
      .skip((pageNum - 1) * limitNum)
      .lean();

    const total = await Paiement.countDocuments(filtres);

    res.status(200).json({
      success: true,
      data: {
        paiements,
        pagination: {
          currentPage: pageNum,
          totalPages: Math.ceil(total / limitNum),
          totalItems: total
        }
      }
    });

  } catch (error) {
    logger.error('Erreur listerPaiements:', error);
    return next(AppError.serverError('Erreur lors de la récupération des paiements', { originalError: error.message }));
  }
};

/**
 * @desc    Obtenir les détails d'un paiement (admin)
 * @route   GET /api/admin/paiements/:id
 * @access  Private (Admin)
 */
const obtenirPaiement = async (req, res, next) => {
  try {
    const paiement = await Paiement.findById(req.params.id)
      .populate('utilisateur')
      .lean();

    if (!paiement) {
      return next(AppError.notFound('Paiement introuvable'));
    }

    res.status(200).json({
      success: true,
      data: { paiement }
    });

  } catch (error) {
    return next(AppError.serverError('Erreur lors de la récupération du paiement', { originalError: error.message }));
  }
};

/**
 * @desc    Rembourser un paiement (admin)
 * @route   POST /api/admin/paiements/:id/rembourser
 * @access  Private (Admin)
 */
const rembourserPaiement = async (req, res, next) => {
  try {
    const { motif, montant } = req.body;

    if (!motif) {
      return next(AppError.badRequest('Motif de remboursement requis'));
    }

    const paiement = await Paiement.findById(req.params.id);

    if (!paiement) {
      return next(AppError.notFound('Paiement introuvable'));
    }

    // Logique de remboursement à implémenter selon le système de paiement
    paiement.statut = 'REMBOURSE';
    paiement.montantRembourse = montant || paiement.montant;
    paiement.motifRemboursement = motif;
    await paiement.save();

    res.status(200).json({
      success: true,
      message: 'Remboursement effectué avec succès'
    });

  } catch (error) {
    return next(AppError.serverError('Erreur lors du remboursement', { originalError: error.message }));
  }
};

/**
 * @desc    Obtenir les statistiques des paiements (admin)
 * @route   GET /api/admin/paiements/statistiques
 * @access  Private (Admin)
 */
const obtenirStatistiquesPaiements = async (req, res, next) => {
  try {
    const { periode = 'today' } = req.query;
    
    let dateDebut = new Date();
    if (periode === 'today') {
      dateDebut.setHours(0, 0, 0, 0);
    } else if (periode === 'week') {
      dateDebut.setDate(dateDebut.getDate() - 7);
    } else if (periode === 'month') {
      dateDebut.setMonth(dateDebut.getMonth() - 1);
    }

    const stats = await Paiement.aggregate([
      {
        $match: {
          createdAt: { $gte: dateDebut }
        }
      },
      {
        $group: {
          _id: '$statut',
          count: { $sum: 1 },
          total: { $sum: '$montant' }
        }
      }
    ]);

    res.status(200).json({
      success: true,
      data: { statistiques: stats, periode }
    });

  } catch (error) {
    return next(AppError.serverError('Erreur lors de la récupération des statistiques', { originalError: error.message }));
  }
};

/**
 * @desc    Obtenir statistiques des commissions (admin)
 * @route   GET /api/admin/paiements/commissions/statistiques
 * @access  Private (Admin avec permission ANALYTICS)
 */
const obtenirStatistiquesCommissions = async (req, res, next) => {
  try {
    const { 
      dateDebut, 
      dateFin, 
      periode = '30' 
    } = req.query;

    const finPeriode = dateFin ? new Date(dateFin) : new Date();
    const debutPeriode = dateDebut ? new Date(dateDebut) : 
      new Date(finPeriode.getTime() - parseInt(periode) * 24 * 60 * 60 * 1000);

    const stats = await Paiement.obtenirStatistiquesCommissions(debutPeriode, finPeriode);
    const commissionsEchec = await Paiement.obtenirCommissionsEnEchec();
    const statsModePaiement = await Paiement.statistiquesParModePaiement();
    const analyseRevenus = await Paiement.analyseRevenus(parseInt(periode));

    const [statsActuelles] = stats.length > 0 ? stats : [{}];
    const tauxCommissionMoyen = statsActuelles.montantTotalTraite > 0 ? 
      (statsActuelles.totalCommissions / statsActuelles.montantTotalTraite * 100) : 0;

    res.status(200).json({
      success: true,
      data: {
        periode: {
          debut: debutPeriode,
          fin: finPeriode,
          jours: Math.ceil((finPeriode - debutPeriode) / (1000 * 60 * 60 * 24))
        },
        statistiques: {
          totalCommissions: statsActuelles.totalCommissions || 0,
          nombreTransactions: statsActuelles.nombreTransactions || 0,
          montantTotalTraite: statsActuelles.montantTotalTraite || 0,
          montantMoyenTransaction: statsActuelles.montantMoyenTransaction || 0,
          tauxCommissionMoyen: Math.round(tauxCommissionMoyen * 100) / 100,
          totalBonus: statsActuelles.totalBonus || 0
        },
        repartitionParMode: statsModePaiement,
        evolutionQuotidienne: analyseRevenus,
        alertes: {
          commissionsEnEchec: commissionsEchec.length,
          commissionsEnEchecDetails: commissionsEchec.slice(0, 10)
        }
      }
    });

  } catch (error) {
    logger.error('Erreur statistiques commissions:', error);
    return next(AppError.serverError('Erreur lors de la récupération des statistiques', { 
      originalError: error.message 
    }));
  }
};

const traiterCommissionsEnEchec = async (req, res, next) => {
  try {
    const adminId = req.user.id;
    const { paiementIds, action = 'retry' } = req.body;

    if (!paiementIds || !Array.isArray(paiementIds)) {
      return res.status(400).json({
        success: false,
        message: 'Liste des IDs de paiement requise',
        code: 'DONNEES_INVALIDES'
      });
    }

    if (!['retry', 'waive', 'manual'].includes(action)) {
      return res.status(400).json({
        success: false,
        message: 'Action invalide. Actions possibles: retry, waive, manual',
        code: 'ACTION_INVALIDE'
      });
    }

    const paiements = await Paiement.find({
      _id: { $in: paiementIds },
      'commission.statutPrelevement': { $in: ['echec', 'insuffisant'] },
      statutPaiement: 'COMPLETE'
    }).populate('beneficiaireId', 'nom prenom email compteCovoiturage');

    if (paiements.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Aucun paiement éligible trouvé',
        code: 'AUCUN_PAIEMENT'
      });
    }

    let traites = 0;
    let echecs = 0;
    const resultats = [];

    for (const paiement of paiements) {
      try {
        let resultat = {
          paiementId: paiement._id,
          referenceTransaction: paiement.referenceTransaction,
          montantCommission: paiement.commission.montant
        };

        switch (action) {
          case 'retry':
            await paiement.traiterCommissionApresPayement();
            resultat.action = 'Reprélèvement tenté';
            resultat.nouveauStatut = paiement.commission.statutPrelevement;
            resultat.succes = true;
            traites++;
            break;

          case 'waive':
            paiement.commission.statutPrelevement = 'preleve';
            paiement.commission.datePrelevement = new Date();
            paiement.ajouterLog('COMMISSION_ANNULEE_ADMIN', {
              adminId,
              raison: 'Geste commercial - commission annulée',
              montantAnnule: paiement.commission.montant
            });
            await paiement.save();
            resultat.action = 'Commission annulée (geste commercial)';
            resultat.succes = true;
            traites++;
            break;

          case 'manual':
            paiement.commission.statutPrelevement = 'preleve';
            paiement.commission.datePrelevement = new Date();
            paiement.ajouterLog('COMMISSION_MANUELLE_ADMIN', {
              adminId,
              raison: 'Traitement manuel par administrateur'
            });
            await paiement.save();
            resultat.action = 'Marqué comme traité manuellement';
            resultat.succes = true;
            traites++;
            break;
        }

        resultats.push(resultat);

      } catch (error) {
        echecs++;
        resultats.push({
          paiementId: paiement._id,
          referenceTransaction: paiement.referenceTransaction,
          action: 'Erreur de traitement',
          succes: false,
          erreur: error.message
        });
        
        logger.error(`Erreur traitement commission ${paiement._id}:`, error);
      }
    }

    logger.info('Traitement manuel commissions échec', {
      adminId,
      action,
      paiementsTraites: traites,
      paiementsEchecs: echecs
    });

    res.status(200).json({
      success: true,
      message: `Traitement terminé: ${traites} succès, ${echecs} échecs`,
      data: {
        statistiques: { 
          traites, 
          echecs, 
          total: paiements.length 
        },
        resultats
      }
    });

  } catch (error) {
    logger.error('Erreur traitement commissions échec:', error);
    return next(AppError.serverError('Erreur lors du traitement des commissions', { 
      originalError: error.message 
    }));
  }
};

/**
 * @desc    Générer rapport des commissions (admin)
 * @route   GET /api/admin/paiements/commissions/rapport
 * @access  Private (Admin avec permission ANALYTICS)
 */
const genererRapportCommissions = async (req, res, next) => {
  try {
    const { 
      format = 'json', 
      dateDebut, 
      dateFin, 
      groupePar = 'jour'
    } = req.query;

    const debut = dateDebut ? new Date(dateDebut) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const fin = dateFin ? new Date(dateFin) : new Date();

    if (debut >= fin) {
      return res.status(400).json({
        success: false,
        message: 'Date de début doit être antérieure à date de fin',
        code: 'DATES_INVALIDES'
      });
    }

    if (!['heure', 'jour', 'semaine', 'mois'].includes(groupePar)) {
      return res.status(400).json({
        success: false,
        message: 'Groupement invalide. Valeurs possibles: heure, jour, semaine, mois',
        code: 'GROUPEMENT_INVALIDE'
      });
    }

    let formatDate;
    switch (groupePar) {
      case 'heure':
        formatDate = '%Y-%m-%d %H:00';
        break;
      case 'jour':
        formatDate = '%Y-%m-%d';
        break;
      case 'semaine':
        formatDate = '%Y-%U';
        break;
      case 'mois':
        formatDate = '%Y-%m';
        break;
    }

    const donnees = await Paiement.aggregate([
      {
        $match: {
          statutPaiement: 'COMPLETE',
          dateCompletion: { $gte: debut, $lte: fin }
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: formatDate, date: '$dateCompletion' } },
          nombreTransactions: { $sum: 1 },
          montantTotalTraite: { $sum: '$montantTotal' },
          totalCommissions: { $sum: '$commission.montant' },
          totalBonus: { 
            $sum: { 
              $add: ['$bonus.bonusRecharge', '$bonus.primePerformance'] 
            } 
          },
          commissionsPrelevees: {
            $sum: {
              $cond: [
                { $eq: ['$commission.statutPrelevement', 'preleve'] },
                '$commission.montant',
                0
              ]
            }
          }
        }
      },
      {
        $project: {
          periode: '$_id',
          nombreTransactions: 1,
          montantTotalTraite: 1,
          totalCommissions: 1,
          totalBonus: 1,
          commissionsPrelevees: 1,
          tauxPrelevement: {
            $multiply: [
              { $divide: ['$commissionsPrelevees', '$totalCommissions'] },
              100
            ]
          }
        }
      },
      { $sort: { periode: 1 } }
    ]);

    const rapport = {
      success: true,
      data: {
        parametres: { dateDebut: debut, dateFin: fin, groupePar },
        resumeExecutif: {
          totalCommissions: donnees.reduce((sum, d) => sum + d.totalCommissions, 0),
          totalBonus: donnees.reduce((sum, d) => sum + d.totalBonus, 0),
          totalTransactions: donnees.reduce((sum, d) => sum + d.nombreTransactions, 0),
          montantTotalTraite: donnees.reduce((sum, d) => sum + d.montantTotalTraite, 0)
        },
        donneesDetaillees: donnees
      }
    };

    switch (format.toLowerCase()) {
      case 'pdf':
        // TODO: Implémenter génération PDF
        return res.status(501).json({
          success: false,
          message: 'Format PDF en cours de développement',
          code: 'FORMAT_NON_DISPONIBLE'
        });

      case 'csv': {
        const csvData = convertirEnCSV(donnees);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=rapport-commissions.csv');
        return res.send(csvData);
      }

      default:
        return res.json(rapport);
    }

  } catch (error) {
    logger.error('Erreur génération rapport:', error);
    return next(AppError.serverError('Erreur lors de la génération du rapport', { 
      originalError: error.message 
    }));
  }
};

/**
 * @desc    Surveiller les commissions (admin)
 * @route   GET /api/admin/paiements/commissions/surveiller
 * @access  Private (Admin)
 */
const surveillerCommissions = async (req, res, next) => {
  try {
    const maintenant = new Date();
    const il24h = new Date(maintenant.getTime() - 24 * 60 * 60 * 1000);
    const il1h = new Date(maintenant.getTime() - 60 * 60 * 1000);

    const commissionsEchecRecentes = await Paiement.countDocuments({
      'commission.statutPrelevement': { $in: ['echec', 'insuffisant'] },
      'commission.datePrelevement': { $gte: il24h }
    });

    const paiementsBloques = await Paiement.countDocuments({
      statutPaiement: { $in: ['EN_ATTENTE', 'BLOQUE'] },
      dateInitiation: { $lt: il1h }
    });

    const commissionsEnAttente = await Paiement.countDocuments({
      'commission.statutPrelevement': 'en_attente',
      statutPaiement: 'COMPLETE',
      dateCompletion: { $gte: il24h }
    });

    const alertes = [];
    
    if (commissionsEchecRecentes > 10) {
      alertes.push({
        niveau: 'warning',
        type: 'COMMISSIONS_ECHEC_ELEVEES',
        message: `${commissionsEchecRecentes} commissions en échec dans les 24h`,
        valeur: commissionsEchecRecentes,
        action: 'Vérifier les soldes conducteurs et traiter les échecs'
      });
    }

    if (paiementsBloques > 5) {
      alertes.push({
        niveau: 'error',
        type: 'PAIEMENTS_BLOQUES',
        message: `${paiementsBloques} paiements bloqués depuis plus d'1h`,
        valeur: paiementsBloques,
        action: 'Débloquer ou annuler les paiements en attente'
      });
    }

    if (commissionsEnAttente > 20) {
      alertes.push({
        niveau: 'info',
        type: 'COMMISSIONS_EN_ATTENTE',
        message: `${commissionsEnAttente} commissions en attente de prélèvement`,
        valeur: commissionsEnAttente,
        action: 'Surveiller le traitement automatique'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        surveillance: {
          timestamp: maintenant,
          statut: alertes.length === 0 ? 'OK' : 
                   alertes.some(a => a.niveau === 'error') ? 'CRITIQUE' : 
                   alertes.some(a => a.niveau === 'warning') ? 'ATTENTION' : 'INFO'
        },
        metriques: {
          commissionsEchecRecentes,
          paiementsBloques,
          commissionsEnAttente
        },
        alertes
      }
    });

  } catch (error) {
    logger.error('Erreur surveillance commissions:', error);
    return next(AppError.serverError('Erreur lors de la surveillance', { 
      originalError: error.message 
    }));
  }
};

/**
 * @desc    Obtenir détail d'une commission (admin)
 * @route   GET /api/admin/paiements/:paiementId/commission
 * @access  Private (Admin)
 */
const obtenirDetailCommission = async (req, res, next) => {
  try {
    const { paiementId } = req.params;

    const paiement = await Paiement.findById(paiementId)
      .populate('payeurId', 'nom prenom email telephone')
      .populate('beneficiaireId', 'nom prenom email compteCovoiturage')
      .populate({
        path: 'reservationId',
        populate: {
          path: 'trajetId',
          select: 'pointDepart pointArrivee dateDepart prixParPassager distanceKm'
        }
      });

    if (!paiement) {
      return res.status(404).json({
        success: false,
        message: 'Paiement non trouvé',
        code: 'PAIEMENT_NON_TROUVE'
      });
    }

    const tentativesPrelevement = paiement.logsTransaction.filter(
      log => log.action.includes('COMMISSION')
    );

    const delaiTraitement = paiement.dateCompletion && paiement.dateInitiation ?
      Math.round((paiement.dateCompletion - paiement.dateInitiation) / (1000 * 60)) : null;

    res.status(200).json({
      success: true,
      data: {
        paiement: paiement.obtenirResume(),
        detailsCommission: {
          taux: paiement.commission.taux,
          tauxOriginal: paiement.commission.tauxOriginal,
          montant: paiement.commission.montant,
          reductionAppliquee: paiement.commission.reductionAppliquee,
          raisonReduction: paiement.commission.raisonReduction,
          typeTarification: paiement.commission.typeTarification,
          modePrelevement: paiement.commission.modePrelevement,
          statutPrelevement: paiement.commission.statutPrelevement,
          datePrelevement: paiement.commission.datePrelevement,
          referencePrelevement: paiement.commission.referencePrelevement,
          tentativesPrelevement: tentativesPrelevement.length
        },
        bonus: paiement.bonus,
        participants: {
          payeur: {
            id: paiement.payeurId._id,
            nom: `${paiement.payeurId.prenom} ${paiement.payeurId.nom}`,
            email: paiement.payeurId.email
          },
          conducteur: {
            id: paiement.beneficiaireId._id,
            nom: `${paiement.beneficiaireId.prenom} ${paiement.beneficiaireId.nom}`,
            email: paiement.beneficiaireId.email,
            compteRecharge: paiement.beneficiaireId.compteCovoiturage?.estRecharge || false,
            solde: paiement.beneficiaireId.compteCovoiturage?.solde || 0
          }
        },
        metriques: {
          delaiTraitement: delaiTraitement ? `${delaiTraitement} minutes` : null,
          nombreTentatives: tentativesPrelevement.length,
          nombreErreurs: paiement.erreurs.length
        },
        historique: {
          logs: tentativesPrelevement.slice(-5),
          erreurs: paiement.erreurs.slice(-3)
        }
      }
    });

  } catch (error) {
    logger.error('Erreur détail commission:', error);
    return next(AppError.serverError('Erreur lors de la récupération du détail', { 
      originalError: error.message 
    }));
  }
};

/**
 * @desc    Exporter les paiements (admin)
 * @route   GET /api/admin/paiements/export
 * @access  Private (Admin)
 */
const exporterPaiements = async (req, res, next) => {
  try {
    const { dateDebut, dateFin, statut, methode } = req.query;
    const filtres = {};

    if (statut) filtres.statut = statut;
    if (methode) filtres.methode = methode;
    if (dateDebut || dateFin) {
      filtres.createdAt = {};
      if (dateDebut) filtres.createdAt.$gte = new Date(dateDebut);
      if (dateFin) filtres.createdAt.$lte = new Date(dateFin);
    }

    const paiements = await Paiement.find(filtres)
      .populate('utilisateur', 'nom prenom email')
      .lean();

    res.status(200).json({
      success: true,
      data: { paiements }
    });

  } catch (error) {
    return next(AppError.serverError('Erreur lors de l\'export', { originalError: error.message }));
  }
};
// =====================================================
// STATISTIQUES RECHARGES (ADMIN)
// =====================================================

/**
 * @desc    Obtenir statistiques des recharges (admin)
 * @route   GET /api/admin/paiements/recharges/statistiques
 * @access  Private (Admin avec permission ANALYTICS)
 */
const obtenirStatistiquesRecharges = async (req, res, next) => {
  try {
    const { 
      dateDebut, 
      dateFin, 
      groupePar = 'jour' 
    } = req.query;

    const fin = dateFin ? new Date(dateFin) : new Date();
    const debut = dateDebut ? new Date(dateDebut) : 
      new Date(fin.getTime() - 30 * 24 * 60 * 60 * 1000);

    if (!['heure', 'jour', 'semaine', 'mois'].includes(groupePar)) {
      return res.status(400).json({
        success: false,
        message: 'Groupement invalide',
        code: 'GROUPEMENT_INVALIDE'
      });
    }

    let formatDate;
    switch (groupePar) {
      case 'heure':
        formatDate = '%Y-%m-%d %H:00';
        break;
      case 'jour':
        formatDate = '%Y-%m-%d';
        break;
      case 'semaine':
        formatDate = '%Y-%U';
        break;
      case 'mois':
        formatDate = '%Y-%m';
        break;
    }

    // Statistiques globales
    const statsGlobales = await Paiement.aggregate([
      {
        $match: {
          $expr: { $eq: ['$payeurId', '$beneficiaireId'] },
          methodePaiement: { $in: ['WAVE', 'ORANGE_MONEY', 'MTN_MONEY', 'MOOV_MONEY'] },
          dateInitiation: { $gte: debut, $lte: fin }
        }
      },
      {
        $group: {
          _id: null,
          totalRecharges: { $sum: 1 },
          montantTotalRecharge: { $sum: '$montantTotal' },
          montantNetCredite: { $sum: '$montantConducteur' },
          fraisTotaux: { $sum: '$fraisTransaction' },
          bonusTotaux: { $sum: '$bonus.bonusRecharge' },
          rechargesReussies: {
            $sum: { $cond: [{ $eq: ['$statutPaiement', 'COMPLETE'] }, 1, 0] }
          },
          rechargesEnCours: {
            $sum: { $cond: [{ $eq: ['$statutPaiement', 'EN_ATTENTE'] }, 1, 0] }
          },
          rechargesEchouees: {
            $sum: { $cond: [{ $eq: ['$statutPaiement', 'ECHEC'] }, 1, 0] }
          },
          montantMoyenRecharge: { $avg: '$montantTotal' }
        }
      }
    ]);

    // Évolution temporelle
    const evolutionTemporelle = await Paiement.aggregate([
      {
        $match: {
          $expr: { $eq: ['$payeurId', '$beneficiaireId'] },
          methodePaiement: { $in: ['WAVE', 'ORANGE_MONEY', 'MTN_MONEY', 'MOOV_MONEY'] },
          dateInitiation: { $gte: debut, $lte: fin }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: formatDate, date: '$dateInitiation' }
          },
          nombreRecharges: { $sum: 1 },
          montantTotal: { $sum: '$montantTotal' },
          montantNetCredite: { $sum: '$montantConducteur' },
          bonusTotaux: { $sum: '$bonus.bonusRecharge' },
          rechargesReussies: {
            $sum: { $cond: [{ $eq: ['$statutPaiement', 'COMPLETE'] }, 1, 0] }
          }
        }
      },
      {
        $sort: { '_id': 1 }
      }
    ]);

    // Répartition par opérateur
    const repartitionOperateurs = await Paiement.aggregate([
      {
        $match: {
          $expr: { $eq: ['$payeurId', '$beneficiaireId'] },
          methodePaiement: { $in: ['WAVE', 'ORANGE_MONEY', 'MTN_MONEY', 'MOOV_MONEY'] },
          dateInitiation: { $gte: debut, $lte: fin },
          statutPaiement: 'COMPLETE'
        }
      },
      {
        $group: {
          _id: '$methodePaiement',
          nombreRecharges: { $sum: 1 },
          montantTotal: { $sum: '$montantTotal' },
          fraisMoyens: { $avg: '$fraisTransaction' },
          bonusMoyens: { $avg: '$bonus.bonusRecharge' }
        }
      },
      {
        $sort: { nombreRecharges: -1 }
      }
    ]);

    const [stats] = statsGlobales.length > 0 ? statsGlobales : [{}];
    const tauxReussite = stats.totalRecharges > 0 ? 
      (stats.rechargesReussies / stats.totalRecharges * 100) : 0;

    res.json({
      success: true,
      data: {
        periode: { debut, fin, groupePar },
        resumeGlobal: {
          totalRecharges: stats.totalRecharges || 0,
          montantTotalRecharge: stats.montantTotalRecharge || 0,
          montantNetCredite: stats.montantNetCredite || 0,
          bonusTotaux: stats.bonusTotaux || 0,
          fraisTotaux: stats.fraisTotaux || 0,
          montantMoyenRecharge: Math.round(stats.montantMoyenRecharge || 0),
          tauxReussite: Math.round(tauxReussite * 100) / 100
        },
        repartitionStatuts: {
          reussies: stats.rechargesReussies || 0,
          enCours: stats.rechargesEnCours || 0,
          echouees: stats.rechargesEchouees || 0
        },
        evolutionTemporelle,
        repartitionOperateurs,
        metriques: {
          tauxConversionMoyen: stats.fraisTotaux > 0 ? 
            Math.round((stats.fraisTotaux / stats.montantTotalRecharge) * 100 * 100) / 100 : 0,
          volumeQuotidienMoyen: Math.round(stats.montantTotalRecharge / 
            Math.max(1, Math.ceil((fin - debut) / (1000 * 60 * 60 * 24))))
        }
      }
    });

  } catch (error) {
    logger.error('Erreur statistiques recharges:', error);
    return next(AppError.serverError('Erreur lors de la récupération des statistiques', { 
      originalError: error.message 
    }));
  }
};

/**
 * @desc    Traiter les recharges en attente (admin)
 * @route   POST /api/admin/paiements/recharges/traiter-attentes
 * @access  Private (Admin avec permission GESTION_PAIEMENTS)
 */
const traiterRechargesEnAttente = async (req, res, next) => {
  try {
    const { forcerExpiration = false } = req.body;

    const delaiExpiration = 2 * 60 * 60 * 1000; // 2 heures
    const maintenant = new Date();
    const limiteExpiration = new Date(maintenant.getTime() - delaiExpiration);

    let criteres = {
      statutPaiement: 'EN_ATTENTE',
      $expr: { $eq: ['$payeurId', '$beneficiaireId'] },
      methodePaiement: { $in: ['WAVE', 'ORANGE_MONEY', 'MTN_MONEY', 'MOOV_MONEY'] }
    };

    if (!forcerExpiration) {
      criteres.dateInitiation = { $lte: limiteExpiration };
    }

    const rechargesEnAttente = await Paiement.find(criteres)
      .populate('payeurId', 'nom prenom email compteCovoiturage');

    if (rechargesEnAttente.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'Aucune recharge en attente à traiter',
        data: {
          statistiques: {
            total: 0,
            traitees: 0,
            expirees: 0
          }
        }
      });
    }

    let traitees = 0;
    let expirees = 0;
    const resultats = [];

    for (const recharge of rechargesEnAttente) {
      try {
        let resultat = {
          paiementId: recharge._id,
          referenceTransaction: recharge.referenceTransaction,
          conducteur: `${recharge.payeurId.prenom} ${recharge.payeurId.nom}`
        };

        const delaiDepuisInitiation = maintenant - recharge.dateInitiation;

        if (forcerExpiration || delaiDepuisInitiation > delaiExpiration) {
          // Expirer la recharge
          recharge.statutPaiement = 'ECHEC';
          recharge.ajouterErreur('RECHARGE_EXPIREE', 'Délai de confirmation dépassé');
          
          await recharge.payeurId.confirmerRecharge(
            recharge.referenceTransaction, 
            'echec'
          );

          await recharge.save();

          resultat.action = 'Expirée';
          resultat.raison = 'Délai de confirmation dépassé';
          expirees++;
        } else {
          resultat.action = 'En attente';
          resultat.tempRestant = Math.round((delaiExpiration - delaiDepuisInitiation) / (1000 * 60)) + ' minutes';
        }

        resultats.push(resultat);

      } catch (erreurTraitement) {
        logger.error(`Erreur traitement recharge ${recharge._id}:`, erreurTraitement);
        resultats.push({
          paiementId: recharge._id,
          referenceTransaction: recharge.referenceTransaction,
          action: 'Erreur de traitement',
          erreur: erreurTraitement.message
        });
      }
    }

    logger.info('Traitement recharges en attente terminé', {
      adminId: req.user.id,
      rechargesTraitees: traitees,
      rechargesExpirees: expirees,
      total: rechargesEnAttente.length
    });

    res.json({
      success: true,
      message: `Traitement terminé: ${expirees} expirées`,
      data: {
        statistiques: {
          total: rechargesEnAttente.length,
          traitees,
          expirees,
          enAttente: rechargesEnAttente.length - traitees - expirees
        },
        resultats
      }
    });

  } catch (error) {
    logger.error('Erreur traitement recharges en attente:', error);
    return next(AppError.serverError('Erreur lors du traitement des recharges', { 
      originalError: error.message 
    }));
  }
};

// =====================================================
// GESTION DES SIGNALEMENTS (ADMIN)
// =====================================================

/**
 * @desc    Lister tous les signalements (admin)
 * @route   GET /api/admin/signalements
 * @access  Private (Admin)
 */
const listerSignalements = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      statut = 'en_attente',
      type,
      priorite
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = Math.min(parseInt(limit), 100);

    const filtres = {};

    if (statut) filtres.statut = statut;
    if (type) filtres.type = type;
    if (priorite) filtres.priorite = priorite;

    const signalements = await Signalement.find(filtres)
      .populate('signaleur', 'nom prenom email')
      .populate('signale', 'nom prenom email')
      .sort('-createdAt')
      .limit(limitNum)
      .skip((pageNum - 1) * limitNum)
      .lean();

    const total = await Signalement.countDocuments(filtres);

    res.status(200).json({
      success: true,
      data: {
        signalements,
        pagination: {
          currentPage: pageNum,
          totalPages: Math.ceil(total / limitNum),
          totalItems: total
        }
      }
    });

  } catch (error) {
    return next(AppError.serverError('Erreur lors de la récupération des signalements', { originalError: error.message }));
  }
};

/**
 * @desc    Obtenir les détails d'un signalement (admin)
 * @route   GET /api/admin/signalements/:id
 * @access  Private (Admin)
 */
const obtenirSignalement = async (req, res, next) => {
  try {
    const signalement = await Signalement.findById(req.params.id)
      .populate('signaleur', 'nom prenom email')
      .populate('signale', 'nom prenom email')
      .lean();

    if (!signalement) {
      return next(AppError.notFound('Signalement introuvable'));
    }

    res.status(200).json({
      success: true,
      data: { signalement }
    });

  } catch (error) {
    return next(AppError.serverError('Erreur lors de la récupération du signalement', { originalError: error.message }));
  }
};

/**
 * @desc    Traiter un signalement (admin)
 * @route   POST /api/admin/signalements/:id/traiter
 * @access  Private (Admin)
 */
const traiterSignalement = async (req, res, next) => {
  try {
    const { decision, commentaire, action, duree } = req.body;

    if (!decision || !['valide', 'rejete'].includes(decision)) {
      return next(AppError.badRequest('Décision invalide'));
    }

    if (!commentaire || commentaire.length < 10) {
      return next(AppError.badRequest('Commentaire requis (minimum 10 caractères)'));
    }

    const signalement = await Signalement.findById(req.params.id);

    if (!signalement) {
      return next(AppError.notFound('Signalement introuvable'));
    }

    signalement.statut = decision === 'valide' ? 'traite' : 'rejete';
    signalement.commentaireAdmin = commentaire;
    signalement.dateTraitement = new Date();
    await signalement.save();

    // Si validé et action définie, appliquer la sanction
    if (decision === 'valide' && action) {
      const utilisateur = await User.findById(signalement.signale);
      if (utilisateur) {
        if (action === 'avertissement') {
          // Logique d'avertissement
        } else if (action === 'suspension') {
          const dateFin = new Date();
          dateFin.setDate(dateFin.getDate() + (parseInt(duree) || 7));
          utilisateur.statut = 'SUSPENDU';
          utilisateur.suspensionFin = dateFin;
          await utilisateur.save();
        } else if (action === 'bannissement') {
          utilisateur.statut = 'BANNI';
          await utilisateur.save();
        }
      }
    }

    res.status(200).json({
      success: true,
      message: 'Signalement traité avec succès'
    });

  } catch (error) {
    return next(AppError.serverError('Erreur lors du traitement', { originalError: error.message }));
  }
};

/**
 * @desc    Marquer un signalement comme prioritaire (admin)
 * @route   POST /api/admin/signalements/:id/priorite
 * @access  Private (Admin)
 */
const marquerPrioritaire = async (req, res, next) => {
  try {
    const signalement = await Signalement.findById(req.params.id);

    if (!signalement) {
      return next(AppError.notFound('Signalement introuvable'));
    }

    signalement.priorite = 'haute';
    await signalement.save();

    res.status(200).json({
      success: true,
      message: 'Signalement marqué comme prioritaire'
    });

  } catch (error) {
    return next(AppError.serverError('Erreur lors de la modification', { originalError: error.message }));
  }
};

// =====================================================
// GESTION DES ÉVÉNEMENTS (ADMIN)
// =====================================================

/**
 * @desc    Lister tous les événements (admin)
 * @route   GET /api/admin/evenements
 * @access  Private (Admin)
 */
const listerEvenements = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      statut,
      dateDebut,
      dateFin
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = Math.min(parseInt(limit), 100);

    const filtres = {};

    if (statut) filtres.statut = statut;
    if (dateDebut || dateFin) {
      filtres.dateDebut = {};
      if (dateDebut) filtres.dateDebut.$gte = new Date(dateDebut);
      if (dateFin) filtres.dateDebut.$lte = new Date(dateFin);
    }

    const evenements = await Evenement.find(filtres)
      .sort('-dateDebut')
      .limit(limitNum)
      .skip((pageNum - 1) * limitNum)
      .lean();

    const total = await Evenement.countDocuments(filtres);

    res.status(200).json({
      success: true,
      data: {
        evenements,
        pagination: {
          currentPage: pageNum,
          totalPages: Math.ceil(total / limitNum),
          totalItems: total
        }
      }
    });

  } catch (error) {
    return next(AppError.serverError('Erreur lors de la récupération des événements', { originalError: error.message }));
  }
};

/**
 * @desc    Créer un événement (admin)
 * @route   POST /api/admin/evenements
 * @access  Private (Admin)
 */
const creerEvenement = async (req, res, next) => {
  try {
    const evenement = await Evenement.create(req.body);

    res.status(201).json({
      success: true,
      message: 'Événement créé avec succès',
      data: { evenement }
    });

  } catch (error) {
    return next(AppError.serverError('Erreur lors de la création', { originalError: error.message }));
  }
};

/**
 * @desc    Obtenir les détails d'un événement (admin)
 * @route   GET /api/admin/evenements/:id
 * @access  Private (Admin)
 */
const obtenirEvenement = async (req, res, next) => {
  try {
    const evenement = await Evenement.findById(req.params.id).lean();

    if (!evenement) {
      return next(AppError.notFound('Événement introuvable'));
    }

    res.status(200).json({
      success: true,
      data: { evenement }
    });

  } catch (error) {
    return next(AppError.serverError('Erreur lors de la récupération de l\'événement', { originalError: error.message }));
  }
};

/**
 * @desc    Obtenir les participants d'un événement (admin)
 * @route   GET /api/admin/evenements/:id/participants
 * @access  Private (Admin)
 */
const obtenirParticipantsEvenement = async (req, res, next) => {
  try {
    const evenement = await Evenement.findById(req.params.id)
      .populate('participants', 'nom prenom email')
      .lean();

    if (!evenement) {
      return next(AppError.notFound('Événement introuvable'));
    }

    res.status(200).json({
      success: true,
      data: { participants: evenement.participants || [] }
    });

  } catch (error) {
    return next(AppError.serverError('Erreur lors de la récupération des participants', { originalError: error.message }));
  }
};

/**
 * @desc    Modifier un événement (admin)
 * @route   PUT /api/admin/evenements/:id
 * @access  Private (Admin)
 */
const modifierEvenement = async (req, res, next) => {
  try {
    // Récupérer l'événement existant pour vérifier les dates
    const evenementExistant = await Evenement.findById(req.params.id);
    
    if (!evenementExistant) {
      return next(AppError.notFound('Événement introuvable'));
    }

    // Validation manuelle pour dateFin > dateDebut si les deux sont fournies
    if (req.body.dateDebut && req.body.dateFin) {
      const debut = new Date(req.body.dateDebut);
      const fin = new Date(req.body.dateFin);
      if (fin < debut) {
        return next(AppError.badRequest('La date de fin doit être postérieure à la date de début'));
      }
    } else if (req.body.dateFin && !req.body.dateDebut) {
      // Si seulement dateFin est modifiée, vérifier avec dateDebut existante
      const fin = new Date(req.body.dateFin);
      if (fin < evenementExistant.dateDebut) {
        return next(AppError.badRequest('La date de fin doit être postérieure à la date de début'));
      }
    }

    // Mise à jour sans runValidators pour éviter la validation "date dans le futur"
    const evenement = await Evenement.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: false }
    );

    res.status(200).json({
      success: true,
      message: 'Événement mis à jour avec succès',
      data: { evenement }
    });

  } catch (error) {
    console.log(error);
    return next(AppError.serverError('Erreur lors de la mise à jour', { originalError: error.message }));
  }
};

/**
 * @desc    Annuler un événement (admin)
 * @route   POST /api/admin/evenements/:id/annuler
 * @access  Private (Admin)
 */
const annulerEvenement = async (req, res, next) => {
  try {
    const { motif } = req.body;

    if (!motif || motif.length < 10) {
      return next(AppError.badRequest('Motif d\'annulation requis'));
    }

    const evenement = await Evenement.findById(req.params.id);

    if (!evenement) {
      return next(AppError.notFound('Événement introuvable'));
    }

    evenement.statut = 'ANNULE';
    evenement.motifAnnulation = motif;
    await evenement.save();

    res.status(200).json({
      success: true,
      message: 'Événement annulé avec succès'
    });

  } catch (error) {
    return next(AppError.serverError('Erreur lors de l\'annulation', { originalError: error.message }));
  }
};

/**
 * @desc    Supprimer un événement (admin)
 * @route   DELETE /api/admin/evenements/:id
 * @access  Private (Admin)
 */
const supprimerEvenement = async (req, res, next) => {
  try {
    await Evenement.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Événement supprimé avec succès'
    });

  } catch (error) {
    return next(AppError.serverError('Erreur lors de la suppression', { originalError: error.message }));
  }
};

// =====================================================
// GESTION DES ÉVALUATIONS (ADMIN)
// =====================================================

/**
 * @desc    Lister toutes les évaluations (admin)
 * @route   GET /api/admin/evaluations
 * @access  Private (Admin)
 */
const listerEvaluations = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      note,
      signale
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = Math.min(parseInt(limit), 100);

    const filtres = {};

    if (note) filtres.note = parseInt(note);
    if (signale === 'true') filtres.signale = true;

    const evaluations = await Evaluation.find(filtres)
      .populate('auteur', 'nom prenom')
      .populate('cible', 'nom prenom')
      .sort('-createdAt')
      .limit(limitNum)
      .skip((pageNum - 1) * limitNum)
      .lean();

    const total = await Evaluation.countDocuments(filtres);

    res.status(200).json({
      success: true,
      data: {
        evaluations,
        pagination: {
          currentPage: pageNum,
          totalPages: Math.ceil(total / limitNum),
          totalItems: total
        }
      }
    });

  } catch (error) {
    return next(AppError.serverError('Erreur lors de la récupération des évaluations', { originalError: error.message }));
  }
};

/**
 * @desc    Obtenir les détails d'une évaluation (admin)
 * @route   GET /api/admin/evaluations/:id
 * @access  Private (Admin)
 */
const obtenirEvaluation = async (req, res, next) => {
  try {
    const evaluation = await Evaluation.findById(req.params.id)
      .populate('auteur', 'nom prenom email')
      .populate('cible', 'nom prenom email')
      .lean();

    if (!evaluation) {
      return next(AppError.notFound('Évaluation introuvable'));
    }

    res.status(200).json({
      success: true,
      data: { evaluation }
    });

  } catch (error) {
    return next(AppError.serverError('Erreur lors de la récupération de l\'évaluation', { originalError: error.message }));
  }
};

/**
 * @desc    Supprimer une évaluation (admin)
 * @route   DELETE /api/admin/evaluations/:id
 * @access  Private (Admin)
 */
const supprimerEvaluation = async (req, res, next) => {
  try {
    await Evaluation.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Évaluation supprimée avec succès'
    });

  } catch (error) {
    return next(AppError.serverError('Erreur lors de la suppression', { originalError: error.message }));
  }
};

/**
 * @desc    Marquer une évaluation comme signalée (admin)
 * @route   POST /api/admin/evaluations/:id/signaler
 * @access  Private (Admin)
 */
const signalerEvaluation = async (req, res, next) => {
  try {
    const evaluation = await Evaluation.findById(req.params.id);

    if (!evaluation) {
      return next(AppError.notFound('Évaluation introuvable'));
    }

    evaluation.signale = true;
    await evaluation.save();

    res.status(200).json({
      success: true,
      message: 'Évaluation signalée'
    });

  } catch (error) {
    return next(AppError.serverError('Erreur lors du signalement', { originalError: error.message }));
  }
};

/**
 * @desc    Obtenir les statistiques des évaluations (admin)
 * @route   GET /api/admin/evaluations/statistiques
 * @access  Private (Admin)
 */
const obtenirStatistiquesEvaluations = async (req, res, next) => {
  try {
    const stats = await Evaluation.aggregate([
      {
        $group: {
          _id: '$note',
          count: { $sum: 1 }
        }
      },
      {
        $sort: { _id: -1 }
      }
    ]);

    const total = await Evaluation.countDocuments();
    const signalees = await Evaluation.countDocuments({ signale: true });

    res.status(200).json({
      success: true,
      data: {
        statistiques: stats,
        total,
        signalees
      }
    });

  } catch (error) {
    return next(AppError.serverError('Erreur lors de la récupération des statistiques', { originalError: error.message }));
  }
};

// =====================================================
// GESTION DES ALERTES D'URGENCE (ADMIN)
// =====================================================

/**
 * @desc    Lister toutes les alertes d'urgence (admin)
 * @route   GET /api/admin/alertes-urgence
 * @access  Private (Admin)
 */
const listerAlertes = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      statut = 'active',
      type
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = Math.min(parseInt(limit), 100);

    const filtres = {};

    if (statut) filtres.statut = statut;
    if (type) filtres.type = type;

    const alertes = await AlerteUrgence.find(filtres)
      .populate('utilisateur', 'nom prenom email telephone')
      .populate('trajet', 'depart arrivee')
      .sort('-createdAt')
      .limit(limitNum)
      .skip((pageNum - 1) * limitNum)
      .lean();

    const total = await AlerteUrgence.countDocuments(filtres);

    res.status(200).json({
      success: true,
      data: {
        alertes,
        pagination: {
          currentPage: pageNum,
          totalPages: Math.ceil(total / limitNum),
          totalItems: total
        }
      }
    });

  } catch (error) {
    return next(AppError.serverError('Erreur lors de la récupération des alertes', { originalError: error.message }));
  }
};

/**
 * @desc    Obtenir les détails d'une alerte (admin)
 * @route   GET /api/admin/alertes-urgence/:id
 * @access  Private (Admin)
 */
const obtenirAlerte = async (req, res, next) => {
  try {
    const alerte = await AlerteUrgence.findById(req.params.id)
      .populate('utilisateur', 'nom prenom email telephone')
      .populate('trajet')
      .lean();

    if (!alerte) {
      return next(AppError.notFound('Alerte introuvable'));
    }

    res.status(200).json({
      success: true,
      data: { alerte }
    });

  } catch (error) {
    return next(AppError.serverError('Erreur lors de la récupération de l\'alerte', { originalError: error.message }));
  }
};

/**
 * @desc    Traiter une alerte d'urgence (admin)
 * @route   POST /api/admin/alertes-urgence/:id/traiter
 * @access  Private (Admin)
 */
const traiterAlerte = async (req, res, next) => {
  try {
    const { action, commentaire } = req.body;

    if (!action || !['en_cours', 'resolu', 'fausse_alerte'].includes(action)) {
      return next(AppError.badRequest('Action invalide'));
    }

    if (!commentaire || commentaire.length < 10) {
      return next(AppError.badRequest('Commentaire requis (minimum 10 caractères)'));
    }

    const alerte = await AlerteUrgence.findById(req.params.id);

    if (!alerte) {
      return next(AppError.notFound('Alerte introuvable'));
    }

    alerte.statut = action;
    alerte.commentaireAdmin = commentaire;
    alerte.dateTraitement = new Date();
    await alerte.save();

    res.status(200).json({
      success: true,
      message: 'Alerte traitée avec succès'
    });

  } catch (error) {
    return next(AppError.serverError('Erreur lors du traitement', { originalError: error.message }));
  }
};

/**
 * @desc    Contacter l'utilisateur en urgence (admin)
 * @route   POST /api/admin/alertes-urgence/:id/contacter
 * @access  Private (Admin)
 */
const contacterAlerte = async (req, res, next) => {
  try {
    const alerte = await AlerteUrgence.findById(req.params.id)
      .populate('utilisateur');

    if (!alerte) {
      return next(AppError.notFound('Alerte introuvable'));
    }

    // Logique d'envoi de notification push/SMS
    // À implémenter selon le système de notification

    res.status(200).json({
      success: true,
      message: 'Notification envoyée à l\'utilisateur'
    });

  } catch (error) {
    return next(AppError.serverError('Erreur lors de l\'envoi de la notification', { originalError: error.message }));
  }
};

/**
 * @desc    Clôturer une alerte (admin)
 * @route   POST /api/admin/alertes-urgence/:id/cloturer
 * @access  Private (Admin)
 */
const cloturerAlerte = async (req, res, next) => {
  try {
    const alerte = await AlerteUrgence.findById(req.params.id);

    if (!alerte) {
      return next(AppError.notFound('Alerte introuvable'));
    }

    alerte.statut = 'cloture';
    alerte.dateCloture = new Date();
    await alerte.save();

    res.status(200).json({
      success: true,
      message: 'Alerte clôturée avec succès'
    });

  } catch (error) {
    return next(AppError.serverError('Erreur lors de la clôture', { originalError: error.message }));
  }
};

function construireMessageDocumentsManquants(documentsManquants, commentaireAdmin, nombreTotal) {
  let message = `🔔 Bonjour,\n\n`;
  message += `Votre demande pour devenir conducteur nécessite quelques compléments.\n\n`;
  message += `📋 **${nombreTotal} élément(s) à compléter** :\n\n`;

  if (documentsManquants.identite.length > 0) {
    message += `**📇 Documents d'identité :**\n`;
    documentsManquants.identite.forEach(doc => {
      message += `  • ${doc.message}\n`;
    });
    message += `\n`;
  }

  if (documentsManquants.vehicules.length > 0) {
    message += `**🚗 Informations véhicule :**\n`;
    documentsManquants.vehicules.forEach(doc => {
      message += `  • ${doc.message}\n`;
    });
    message += `\n`;
  }

  if (documentsManquants.photos.length > 0) {
    message += `**📸 Photos du véhicule :**\n`;
    documentsManquants.photos.forEach(doc => {
      message += `  • ${doc.message}\n`;
    });
    message += `\n`;
  }

  if (documentsManquants.documents.length > 0) {
    message += `**📄 Documents obligatoires :**\n`;
    documentsManquants.documents.forEach(doc => {
      message += `  • ${doc.message}\n`;
    });
    message += `\n`;
  }

  if (documentsManquants.equipements.length > 0) {
    message += `**🛡️ Équipements de sécurité :**\n`;
    documentsManquants.equipements.forEach(doc => {
      message += `  • ${doc.message}\n`;
    });
    message += `\n`;
  }

  if (commentaireAdmin) {
    message += `**💬 Message de l'administrateur :**\n${commentaireAdmin}\n\n`;
  }

  message += `Merci de compléter ces informations depuis votre profil pour que nous puissions valider votre compte conducteur.\n\n`;
  message += `L'équipe CoCovoi 🚗`;

  return message;
}

/**
 * Valider le passage d'un utilisateur en conducteur (ADMIN UNIQUEMENT)
 * VÉRIFIE TOUS LES CRITÈRES REQUIS AVANT VALIDATION
 */
const validerPassageConducteur = async (req, res, next) => {
  try {
    const { utilisateurId } = req.params;
    const { approuve,
       commentaire,
       validationForcee = false, 
       action = 'valider'

    } = req.body;

    const utilisateur = await User.findById(utilisateurId);
    
    if (!utilisateur) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé',
        code: 'USER_NOT_FOUND'
      });
    }

    // Vérifier que l'utilisateur est bien en attente
    if (utilisateur.statutCompte !== 'CONDUCTEUR_EN_ATTENTE_VERIFICATION') {
      return res.status(400).json({
        success: false,
        message: 'Cet utilisateur n\'est pas en attente de validation conducteur',
        code: 'NOT_PENDING',
        currentStatus: utilisateur.statutCompte
      });
    }

    // ===== VÉRIFICATIONS COMPLÈTES DES CRITÈRES =====
    const erreursValidation = [];
    const avertissements = [];

    // 1. VÉRIFICATION IDENTITÉ
    if (!utilisateur.estVerifie) {
      erreursValidation.push({
        categorie: 'IDENTITE',
        champ: 'estVerifie',
        message: 'L\'utilisateur n\'est pas vérifié',
        severite: 'CRITIQUE'
      });
    }

    if (!utilisateur.documentIdentite || 
        utilisateur.documentIdentite.statutVerification !== 'VERIFIE') {
      erreursValidation.push({
        categorie: 'IDENTITE',
        champ: 'documentIdentite.statutVerification',
        message: 'Le document d\'identité n\'est pas vérifié',
        statut: utilisateur.documentIdentite?.statutVerification || 'NON_SOUMIS',
        severite: 'CRITIQUE'
      });
    }

    if (utilisateur.documentIdentite) {
      if (!utilisateur.documentIdentite.type) {
        erreursValidation.push({
          categorie: 'IDENTITE',
          champ: 'documentIdentite.type',
          message: 'Type de document d\'identité manquant',
          severite: 'CRITIQUE'
        });
      }

      if (!utilisateur.documentIdentite.numero) {
        erreursValidation.push({
          categorie: 'IDENTITE',
          champ: 'documentIdentite.numero',
          message: 'Numéro du document d\'identité manquant',
          severite: 'CRITIQUE'
        });
      }

      if (!utilisateur.documentIdentite.documentPath && !utilisateur.documentIdentite.photoDocument) {
        erreursValidation.push({
          categorie: 'IDENTITE',
          champ: 'documentIdentite.photoDocument',
          message: 'Photo du document d\'identité manquante',
          severite: 'CRITIQUE'
        });
      }

      if (!utilisateur.documentIdentite.selfiePath && !utilisateur.documentIdentite.photoSelfie) {
        erreursValidation.push({
          categorie: 'IDENTITE',
          champ: 'documentIdentite.photoSelfie',
          message: 'Photo selfie avec document manquante',
          severite: 'CRITIQUE'
        });
      }
    }

    // 2. VÉRIFICATION EMAIL ET TÉLÉPHONE
    if (!utilisateur.email) {
      erreursValidation.push({
        categorie: 'CONTACT',
        champ: 'email',
        message: 'Email manquant',
        severite: 'CRITIQUE'
      });
    }

    if (!utilisateur.telephone) {
      erreursValidation.push({
        categorie: 'CONTACT',
        champ: 'telephone',
        message: 'Numéro de téléphone manquant',
        severite: 'CRITIQUE'
      });
    }

    // 3. VÉRIFICATION VÉHICULE(S)
    const vehicules = await Vehicule.find({ 
      proprietaireId: utilisateurId,
      statut: { $ne: 'HORS_SERVICE' }
    });

    if (vehicules.length === 0) {
      erreursValidation.push({
        categorie: 'VEHICULE',
        champ: 'vehicules',
        message: 'Aucun véhicule ajouté',
        severite: 'CRITIQUE',
        action: 'L\'utilisateur doit ajouter au moins un véhicule'
      });
    } else {
      // Vérifier chaque véhicule
      vehicules.forEach((vehicule, index) => {
        const prefixe = `Véhicule ${index + 1} (${vehicule.marque} ${vehicule.modele})`;

        // 3.1 Informations de base du véhicule
        if (!vehicule.marque) {
          erreursValidation.push({
            categorie: 'VEHICULE',
            vehiculeId: vehicule._id,
            champ: 'marque',
            message: `${prefixe} - Marque manquante`,
            severite: 'CRITIQUE'
          });
        }

        if (!vehicule.modele) {
          erreursValidation.push({
            categorie: 'VEHICULE',
            vehiculeId: vehicule._id,
            champ: 'modele',
            message: `${prefixe} - Modèle manquant`,
            severite: 'CRITIQUE'
          });
        }

        if (!vehicule.annee) {
          erreursValidation.push({
            categorie: 'VEHICULE',
            vehiculeId: vehicule._id,
            champ: 'annee',
            message: `${prefixe} - Année manquante`,
            severite: 'CRITIQUE'
          });
        } else {
          const age = new Date().getFullYear() - vehicule.annee;
          if (age > 15) {
            erreursValidation.push({
              categorie: 'VEHICULE',
              vehiculeId: vehicule._id,
              champ: 'annee',
              message: `${prefixe} - Véhicule trop ancien (${age} ans, max 15 ans)`,
              severite: 'CRITIQUE'
            });
          }
        }

        if (!vehicule.couleur) {
          erreursValidation.push({
            categorie: 'VEHICULE',
            vehiculeId: vehicule._id,
            champ: 'couleur',
            message: `${prefixe} - Couleur manquante`,
            severite: 'ELEVEE'
          });
        }

        if (!vehicule.immatriculation) {
          erreursValidation.push({
            categorie: 'VEHICULE',
            vehiculeId: vehicule._id,
            champ: 'immatriculation',
            message: `${prefixe} - Immatriculation manquante`,
            severite: 'CRITIQUE'
          });
        }

        if (!vehicule.nombrePlaces || vehicule.nombrePlaces < 2) {
          erreursValidation.push({
            categorie: 'VEHICULE',
            vehiculeId: vehicule._id,
            champ: 'nombrePlaces',
            message: `${prefixe} - Nombre de places invalide`,
            severite: 'CRITIQUE'
          });
        }

        // 3.2 PHOTOS DU VÉHICULE (OBLIGATOIRES)
        if (!vehicule.photos || !vehicule.photos.avant) {
          erreursValidation.push({
            categorie: 'VEHICULE_PHOTOS',
            vehiculeId: vehicule._id,
            champ: 'photos.avant',
            message: `${prefixe} - Photo avant manquante`,
            severite: 'CRITIQUE'
          });
        }

        if (!vehicule.photos || !vehicule.photos.arriere) {
          erreursValidation.push({
            categorie: 'VEHICULE_PHOTOS',
            vehiculeId: vehicule._id,
            champ: 'photos.arriere',
            message: `${prefixe} - Photo arrière manquante`,
            severite: 'CRITIQUE'
          });
        }

        if (!vehicule.photos || !vehicule.photos.interieur) {
          erreursValidation.push({
            categorie: 'VEHICULE_PHOTOS',
            vehiculeId: vehicule._id,
            champ: 'photos.interieur',
            message: `${prefixe} - Photo intérieur manquante`,
            severite: 'CRITIQUE'
          });
        }

        // Photos optionnelles mais recommandées
        if (!vehicule.photos?.lateral_gauche || !vehicule.photos?.lateral_droit) {
          avertissements.push({
            categorie: 'VEHICULE_PHOTOS',
            vehiculeId: vehicule._id,
            message: `${prefixe} - Photos latérales recommandées`,
            severite: 'FAIBLE'
          });
        }

        // 3.3 CARTE GRISE (OBLIGATOIRE)
        if (!vehicule.carteGrise || !vehicule.carteGrise.numero) {
          erreursValidation.push({
            categorie: 'DOCUMENTS',
            vehiculeId: vehicule._id,
            champ: 'carteGrise.numero',
            message: `${prefixe} - Numéro de carte grise manquant`,
            severite: 'CRITIQUE'
          });
        }

        if (!vehicule.carteGrise || !vehicule.carteGrise.numeroChassis) {
          erreursValidation.push({
            categorie: 'DOCUMENTS',
            vehiculeId: vehicule._id,
            champ: 'carteGrise.numeroChassis',
            message: `${prefixe} - Numéro de châssis manquant`,
            severite: 'CRITIQUE'
          });
        }

        if (!vehicule.carteGrise || !vehicule.carteGrise.dateEmission) {
          erreursValidation.push({
            categorie: 'DOCUMENTS',
            vehiculeId: vehicule._id,
            champ: 'carteGrise.dateEmission',
            message: `${prefixe} - Date d'émission carte grise manquante`,
            severite: 'ELEVEE'
          });
        }

        // 3.4 ASSURANCE (OBLIGATOIRE ET VALIDE)
        if (!vehicule.assurance || !vehicule.assurance.numeroPolice) {
          erreursValidation.push({
            categorie: 'DOCUMENTS',
            vehiculeId: vehicule._id,
            champ: 'assurance.numeroPolice',
            message: `${prefixe} - Numéro de police d'assurance manquant`,
            severite: 'CRITIQUE'
          });
        }

        if (!vehicule.assurance || !vehicule.assurance.compagnie) {
          erreursValidation.push({
            categorie: 'DOCUMENTS',
            vehiculeId: vehicule._id,
            champ: 'assurance.compagnie',
            message: `${prefixe} - Compagnie d'assurance manquante`,
            severite: 'CRITIQUE'
          });
        }

        if (!vehicule.assurance || !vehicule.assurance.type) {
          erreursValidation.push({
            categorie: 'DOCUMENTS',
            vehiculeId: vehicule._id,
            champ: 'assurance.type',
            message: `${prefixe} - Type d'assurance manquant`,
            severite: 'CRITIQUE'
          });
        }

        if (!vehicule.assurance || !vehicule.assurance.dateExpiration) {
          erreursValidation.push({
            categorie: 'DOCUMENTS',
            vehiculeId: vehicule._id,
            champ: 'assurance.dateExpiration',
            message: `${prefixe} - Date d'expiration assurance manquante`,
            severite: 'CRITIQUE'
          });
        } else {
          // Vérifier que l'assurance n'est pas expirée
          const dateExpiration = new Date(vehicule.assurance.dateExpiration);
          const maintenant = new Date();
          
          if (dateExpiration < maintenant) {
            erreursValidation.push({
              categorie: 'DOCUMENTS',
              vehiculeId: vehicule._id,
              champ: 'assurance.dateExpiration',
              message: `${prefixe} - Assurance expirée depuis le ${dateExpiration.toLocaleDateString('fr-FR')}`,
              severite: 'CRITIQUE'
            });
          } else {
            const joursRestants = Math.ceil((dateExpiration - maintenant) / (1000 * 60 * 60 * 24));
            if (joursRestants <= 30) {
              avertissements.push({
                categorie: 'DOCUMENTS',
                vehiculeId: vehicule._id,
                message: `${prefixe} - Assurance expire dans ${joursRestants} jours`,
                severite: 'MOYEN'
              });
            }
          }
        }

        // 3.5 VISITE TECHNIQUE (OBLIGATOIRE ET VALIDE)
        if (!vehicule.visiteTechnique || !vehicule.visiteTechnique.dateExpiration) {
          erreursValidation.push({
            categorie: 'DOCUMENTS',
            vehiculeId: vehicule._id,
            champ: 'visiteTechnique.dateExpiration',
            message: `${prefixe} - Date d'expiration visite technique manquante`,
            severite: 'CRITIQUE'
          });
        } else {
          const dateExpiration = new Date(vehicule.visiteTechnique.dateExpiration);
          const maintenant = new Date();
          
          if (dateExpiration < maintenant) {
            erreursValidation.push({
              categorie: 'DOCUMENTS',
              vehiculeId: vehicule._id,
              champ: 'visiteTechnique.dateExpiration',
              message: `${prefixe} - Visite technique expirée depuis le ${dateExpiration.toLocaleDateString('fr-FR')}`,
              severite: 'CRITIQUE'
            });
          } else {
            const joursRestants = Math.ceil((dateExpiration - maintenant) / (1000 * 60 * 60 * 24));
            if (joursRestants <= 30) {
              avertissements.push({
                categorie: 'DOCUMENTS',
                vehiculeId: vehicule._id,
                message: `${prefixe} - Visite technique expire dans ${joursRestants} jours`,
                severite: 'MOYEN'
              });
            }
          }
        }

        if (!vehicule.visiteTechnique || !vehicule.visiteTechnique.numeroAttestation) {
          erreursValidation.push({
            categorie: 'DOCUMENTS',
            vehiculeId: vehicule._id,
            champ: 'visiteTechnique.numeroAttestation',
            message: `${prefixe} - Numéro d'attestation visite technique manquant`,
            severite: 'ELEVEE'
          });
        }

        // 3.6 VIGNETTE (OBLIGATOIRE ET VALIDE)
        if (!vehicule.vignette || !vehicule.vignette.annee) {
          erreursValidation.push({
            categorie: 'DOCUMENTS',
            vehiculeId: vehicule._id,
            champ: 'vignette.annee',
            message: `${prefixe} - Année de vignette manquante`,
            severite: 'CRITIQUE'
          });
        }

        if (!vehicule.vignette || !vehicule.vignette.numero) {
          erreursValidation.push({
            categorie: 'DOCUMENTS',
            vehiculeId: vehicule._id,
            champ: 'vignette.numero',
            message: `${prefixe} - Numéro de vignette manquant`,
            severite: 'CRITIQUE'
          });
        }

        if (!vehicule.vignette || !vehicule.vignette.dateExpiration) {
          erreursValidation.push({
            categorie: 'DOCUMENTS',
            vehiculeId: vehicule._id,
            champ: 'vignette.dateExpiration',
            message: `${prefixe} - Date d'expiration vignette manquante`,
            severite: 'CRITIQUE'
          });
        } else {
          const dateExpiration = new Date(vehicule.vignette.dateExpiration);
          const maintenant = new Date();
          
          if (dateExpiration < maintenant) {
            erreursValidation.push({
              categorie: 'DOCUMENTS',
              vehiculeId: vehicule._id,
              champ: 'vignette.dateExpiration',
              message: `${prefixe} - Vignette expirée depuis le ${dateExpiration.toLocaleDateString('fr-FR')}`,
              severite: 'CRITIQUE'
            });
          }
        }

        // 3.7 CARTE DE TRANSPORT (OBLIGATOIRE POUR COVOITURAGE)
        if (!vehicule.carteTransport || !vehicule.carteTransport.numero) {
          erreursValidation.push({
            categorie: 'DOCUMENTS',
            vehiculeId: vehicule._id,
            champ: 'carteTransport.numero',
            message: `${prefixe} - Numéro de carte de transport manquant`,
            severite: 'CRITIQUE'
          });
        }

        if (!vehicule.carteTransport || !vehicule.carteTransport.dateExpiration) {
          erreursValidation.push({
            categorie: 'DOCUMENTS',
            vehiculeId: vehicule._id,
            champ: 'carteTransport.dateExpiration',
            message: `${prefixe} - Date d'expiration carte de transport manquante`,
            severite: 'CRITIQUE'
          });
        } else {
          const dateExpiration = new Date(vehicule.carteTransport.dateExpiration);
          const maintenant = new Date();
          
          if (dateExpiration < maintenant) {
            erreursValidation.push({
              categorie: 'DOCUMENTS',
              vehiculeId: vehicule._id,
              champ: 'carteTransport.dateExpiration',
              message: `${prefixe} - Carte de transport expirée depuis le ${dateExpiration.toLocaleDateString('fr-FR')}`,
              severite: 'CRITIQUE'
            });
          }
        }

        if (!vehicule.carteTransport || !vehicule.carteTransport.categorieAutorisee) {
          erreursValidation.push({
            categorie: 'DOCUMENTS',
            vehiculeId: vehicule._id,
            champ: 'carteTransport.categorieAutorisee',
            message: `${prefixe} - Catégorie autorisée carte de transport manquante`,
            severite: 'CRITIQUE'
          });
        }

        // 3.8 ÉQUIPEMENTS DE SÉCURITÉ OBLIGATOIRES
        if (!vehicule.equipements) {
          erreursValidation.push({
            categorie: 'EQUIPEMENTS',
            vehiculeId: vehicule._id,
            champ: 'equipements',
            message: `${prefixe} - Informations sur les équipements manquantes`,
            severite: 'CRITIQUE'
          });
        } else {
          // Ceintures de sécurité
          if (!vehicule.equipements.ceintures || vehicule.equipements.ceintures === 'NON') {
            erreursValidation.push({
              categorie: 'EQUIPEMENTS',
              vehiculeId: vehicule._id,
              champ: 'equipements.ceintures',
              message: `${prefixe} - Ceintures de sécurité non renseignées ou absentes`,
              severite: 'CRITIQUE'
            });
          }

          // Trousse de secours
          if (!vehicule.equipements.trousseSecours) {
            erreursValidation.push({
              categorie: 'EQUIPEMENTS',
              vehiculeId: vehicule._id,
              champ: 'equipements.trousseSecours',
              message: `${prefixe} - Trousse de secours manquante`,
              severite: 'CRITIQUE'
            });
          }

          // Extincteur
          if (!vehicule.equipements.extincteur) {
            erreursValidation.push({
              categorie: 'EQUIPEMENTS',
              vehiculeId: vehicule._id,
              champ: 'equipements.extincteur',
              message: `${prefixe} - Extincteur manquant`,
              severite: 'CRITIQUE'
            });
          }

          // Triangle de signalisation
          if (!vehicule.equipements.triangleSignalisation) {
            erreursValidation.push({
              categorie: 'EQUIPEMENTS',
              vehiculeId: vehicule._id,
              champ: 'equipements.triangleSignalisation',
              message: `${prefixe} - Triangle de signalisation manquant`,
              severite: 'CRITIQUE'
            });
          }

          // Gilet de sécurité
          if (!vehicule.equipements.giletSecurite) {
            erreursValidation.push({
              categorie: 'EQUIPEMENTS',
              vehiculeId: vehicule._id,
              champ: 'equipements.giletSecurite',
              message: `${prefixe} - Gilet de sécurité manquant`,
              severite: 'CRITIQUE'
            });
          }

          // Roue de secours
          if (!vehicule.equipements.roueDeSecours) {
            erreursValidation.push({
              categorie: 'EQUIPEMENTS',
              vehiculeId: vehicule._id,
              champ: 'equipements.roueDeSecours',
              message: `${prefixe} - Roue de secours manquante`,
              severite: 'CRITIQUE'
            });
          }

          // Cric et clé
          if (!vehicule.equipements.cricCle) {
            erreursValidation.push({
              categorie: 'EQUIPEMENTS',
              vehiculeId: vehicule._id,
              champ: 'equipements.cricCle',
              message: `${prefixe} - Cric et clé manquants`,
              severite: 'CRITIQUE'
            });
          }
        }

        // 3.9 Vérifier le statut de validation du véhicule
        if (!vehicule.validation || vehicule.validation.statutValidation === 'REJETE') {
          erreursValidation.push({
            categorie: 'VEHICULE',
            vehiculeId: vehicule._id,
            champ: 'validation.statutValidation',
            message: `${prefixe} - Véhicule rejeté précédemment`,
            severite: 'CRITIQUE',
            details: vehicule.validation?.commentairesAdmin
          });
        }

        // Vérifier documentsComplets
        if (!vehicule.documentsComplets) {
          avertissements.push({
            categorie: 'VEHICULE',
            vehiculeId: vehicule._id,
            message: `${prefixe} - Documents incomplets selon le système`,
            severite: 'MOYEN'
          });
        }
      });
    }

    // 4. VÉRIFIER CONTACTS D'URGENCE (RECOMMANDÉ)
    if (!utilisateur.contactsUrgence || utilisateur.contactsUrgence.length === 0) {
      avertissements.push({
        categorie: 'PROFIL',
        champ: 'contactsUrgence',
        message: 'Aucun contact d\'urgence renseigné (recommandé pour conducteurs)',
        severite: 'MOYEN'
      });
    }
    if (action === 'demander_complement') {
  const erreursCritiques = erreursValidation.filter(e => e.severite === 'CRITIQUE');
  
  if (erreursCritiques.length === 0) {
    return res.status(400).json({
      success: false,
      message: 'Aucun document manquant - le conducteur peut être validé',
      code: 'NO_MISSING_DOCUMENTS'
    });
  }

  // Créer un résumé clair pour le conducteur
  const documentsManquants = {
    identite: [],
    vehicules: [],
    documents: [],
    equipements: [],
    photos: []
  };

  erreursValidation.forEach(erreur => {
    const categorie = erreur.categorie.toLowerCase();
    if (categorie.includes('identite') || categorie.includes('contact')) {
      documentsManquants.identite.push({
        champ: erreur.champ,
        message: erreur.message,
        severite: erreur.severite
      });
    } else if (categorie.includes('vehicule') && !categorie.includes('photos')) {
      documentsManquants.vehicules.push({
        champ: erreur.champ,
        message: erreur.message,
        vehiculeId: erreur.vehiculeId,
        severite: erreur.severite
      });
    } else if (categorie.includes('photos')) {
      documentsManquants.photos.push({
        champ: erreur.champ,
        message: erreur.message,
        vehiculeId: erreur.vehiculeId,
        severite: erreur.severite
      });
    } else if (categorie.includes('documents')) {
      documentsManquants.documents.push({
        champ: erreur.champ,
        message: erreur.message,
        vehiculeId: erreur.vehiculeId,
        severite: erreur.severite
      });
    } else if (categorie.includes('equipements')) {
      documentsManquants.equipements.push({
        champ: erreur.champ,
        message: erreur.message,
        vehiculeId: erreur.vehiculeId,
        severite: erreur.severite
      });
    }
  });

  // Créer un message personnalisé
  const messageComplet = construireMessageDocumentsManquants(
    documentsManquants, 
    commentaire,
    erreursValidation.length
  );

  // Sauvegarder dans l'historique
  utilisateur.historiqueStatuts.push({
    ancienStatut: 'CONDUCTEUR_EN_ATTENTE_VERIFICATION',
    nouveauStatut: 'CONDUCTEUR_EN_ATTENTE_VERIFICATION',
    raison: `Documents incomplets - ${erreursValidation.length} élément(s) à compléter`,
    dateModification: new Date(),
    administrateurId: req.user.id
  });

  // Ajouter notification pour le conducteur
  if (!utilisateur.notifications) {
    utilisateur.notifications = [];
  }

  utilisateur.notifications.push({
    type: 'DOCUMENTS_MANQUANTS',
    titre: '📋 Documents à compléter',
    message: messageComplet,
    dateEnvoi: new Date(),
    lue: false,
    donnees: {
      nombreDocuments: erreursValidation.length,
      documentsManquants: documentsManquants,
      commentaireAdmin: commentaire
    }
  });

  await utilisateur.save({ validateBeforeSave: false });

  logger.info('📨 Demande de complément envoyée', {
    userId: utilisateur._id,
    adminId: req.user.id,
    nombreManquants: erreursValidation.length
  });
// ========================================
  // ✅ ENVOI EMAIL ET WHATSAPP
  // ========================================
  let emailEnvoye = false;
  let whatsappEnvoye = false;

// Envoyer par Email si disponible
if (utilisateur.email) {
  try {
    const emailService = require('../services/emailService');
    // ✅ Filtrer seulement les erreurs CRITIQUES
    const listeHTML = erreursCritiques  // ← CORRECTION ICI
      .map((doc, index) => `
        <li style="padding: 15px; margin-bottom: 12px; background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%); border-left: 4px solid #FF9800; border-radius: 8px; color: #333; font-size: 15px; font-weight: 500; list-style: none;">
          <span style="display: inline-block; width: 28px; height: 28px; background: linear-gradient(135deg, #FF9800 0%, #F57C00 100%); color: white; border-radius: 50%; text-align: center; line-height: 28px; font-size: 14px; font-weight: 700; margin-right: 15px;">${index + 1}</span>
          ${doc.message}
        </li>
      `)
      .join('');
    
      await emailService.envoyerEmail({
        to: utilisateur.email,
        subject: '📋 Documents à compléter - WAYZ-ECO',
        template: 'documents-manquants',
        data: {
          nomComplet: `${utilisateur.prenom} ${utilisateur.nom}`,
          prenom: utilisateur.prenom,
          nombreTotal: erreursCritiques.length,
          listeDocuments: listeHTML,  
          commentaireAdmin: commentaire || 'Merci de compléter vos documents pour finaliser votre inscription conducteur.',
          frontendUrl: process.env.FRONTEND_URL || 'https://wayzeco.com',
          year: new Date().getFullYear()
        }
      });
      
      emailEnvoye = true;
      logger.info('📧 Email documents manquants envoyé', { userId: utilisateur._id });
    } catch (emailError) {
      logger.error('❌ Erreur envoi email documents manquants:', emailError);
    }
  }
  if (utilisateur.telephone) {
    try {
      const whatsappService = require('../services/whatsappService');
      
      await whatsappService.envoyerMessage(
        utilisateur.telephone,
        messageComplet
      );
      
      whatsappEnvoye = true;
      logger.info('📱 WhatsApp documents manquants envoyé', { userId: utilisateur._id });
    } catch (whatsappError) {
      logger.error('❌ Erreur envoi WhatsApp documents manquants:', whatsappError);
    }
  }

  // ✅ WEBSOCKET - AJOUTE ICI
  try {
    const { notifyDocumentsManquants } = require('../realtime/socket');
    const io = req.app.get('io');
    
    if (io) {
      notifyDocumentsManquants(io, utilisateur._id.toString(), {
        userId: utilisateur._id.toString(),
        message: messageComplet,
        documentsManquants: documentsManquants,
        nombreTotal: erreursValidation.length,
        timestamp: new Date()
      });
      logger.info('🔔 Notification WebSocket envoyée (documents manquants)', { userId: utilisateur._id });
    }
  } catch (notifError) {
    logger.error('Erreur envoi notification WebSocket:', notifError);
  }


  return res.status(200).json({
    success: true,
    message: '📨 Demande de complément envoyée au conducteur',
    data: {
      utilisateur: {
        id: utilisateur._id,
        nom: utilisateur.nom,
        prenom: utilisateur.prenom,
        email: utilisateur.email,
        telephone: utilisateur.telephone
      },
      documentsManquants: {
        total: erreursValidation.length,
        critiques: erreursCritiques.length,
        details: documentsManquants
      },
      messageEnvoye: messageComplet,
      notificationEnvoyee: true,
      emailEnvoye: emailEnvoye,
      whatsappEnvoye: whatsappEnvoye
    }
  });
}

    // ===== SI REFUS, PAS BESOIN DE VÉRIFIER LES CRITÈRES =====
    if (!approuve && action === 'rejeter') {
      // Repasser en passager actif
      utilisateur.role = 'passager';
      utilisateur.statutCompte = 'ACTIF';

      // Historique
      utilisateur.historiqueStatuts.push({
        ancienStatut: 'CONDUCTEUR_EN_ATTENTE_VERIFICATION',
        nouveauStatut: 'ACTIF',
        raison: `Demande conducteur refusée${commentaire ? ` - ${commentaire}` : ''}`,
        dateModification: new Date(),
        administrateurId: req.user.id  // ✅ CORRIGÉ
      });

      await utilisateur.save({ validateBeforeSave: false });

      logger.warn('❌ Passage conducteur refusé par admin', { 
        userId: utilisateur._id,
        adminId: req.user.id,  // ✅ CORRIGÉ
        raison: commentaire
      });

      // Envoyer notification de refus
      try {
        const { notifyDriverValidation } = require('../realtime/socket');
        const io = req.app.get('io');
        
        if (io) {
          notifyDriverValidation(io, utilisateur._id.toString(), {
            userId: utilisateur._id.toString(),
            approved: false,
            reason: commentaire || 'Votre demande de passage conducteur a été refusée.',
            timestamp: new Date(),
            adminId: req.user.id
          });
          logger.info('🔔 Notification WebSocket envoyée (refus validation)', { userId: utilisateur._id });
        }

        // TODO: Push notification (pas encore disponible)
        // await notificationService.sendPushNotification(
        //   utilisateur._id,
        //   'Demande Conducteur Refusée',
        //   commentaire || 'Votre demande a été refusée.',
        //   { type: 'DRIVER_VALIDATION_REJECTED' }
        // );

        // TODO: Email notification (à implémenter plus tard)
        // await notificationService.sendEmail(
        //   utilisateur.email,
        //   'Demande Conducteur Refusée',
        //   ...
        // );
      } catch (notifError) {
        logger.error('Erreur envoi notification refus validation:', notifError);
      }
      
      return res.status(200).json({
        success: true,
        message: '❌ Demande de passage conducteur refusée',
        data: {
          utilisateur: {
            id: utilisateur._id,
            nom: utilisateur.nom,
            prenom: utilisateur.prenom,
            email: utilisateur.email,
            role: utilisateur.role,
            statutCompte: utilisateur.statutCompte
          },
          validation: {
            approuve: false,
            refusePar: req.user.id,  // ✅ CORRIGÉ
            dateRefus: new Date(),
            raisonRefus: commentaire || 'Non spécifiée'
          }
        }
      });
    }

    // ===== SI APPROBATION, VÉRIFIER QU'IL N'Y A AUCUNE ERREUR CRITIQUE =====
    const erreursCritiques = erreursValidation.filter(e => e.severite === 'CRITIQUE');
    
    if (approuve && validationForcee && erreursCritiques.length > 0) {
  logger.warn('⚠️ VALIDATION FORCÉE par admin malgré erreurs critiques', {
    userId: utilisateur._id,
    adminId: req.user.id,
    nombreErreurs: erreursCritiques.length,
    commentaire: commentaire
  });

  // Changer le rôle en conducteur
  utilisateur.role = 'conducteur';
  utilisateur.statutCompte = 'ACTIF';
  
  // Ajouter badge
  if (!utilisateur.badges.includes('NOUVEAU')) {
    utilisateur.badges.push('NOUVEAU');
  }

  // Historique avec mention de validation forcée
  utilisateur.historiqueStatuts.push({
    ancienStatut: 'CONDUCTEUR_EN_ATTENTE_VERIFICATION',
    nouveauStatut: 'ACTIF',
    raison: `✅ VALIDATION FORCÉE par admin (${erreursCritiques.length} erreur(s) ignorée(s))${commentaire ? ` - ${commentaire}` : ''}`,
    dateModification: new Date(),
    administrateurId: req.user.id
  });

  await utilisateur.save({ validateBeforeSave: false });

  // Mettre à jour les véhicules
  await Promise.all(
    vehicules.map(async (vehicule) => {
      if (!vehicule.validation) {
        vehicule.validation = {};
      }
      vehicule.validation.statutValidation = 'VALIDE';
      vehicule.validation.validePar = req.user.id;
      vehicule.validation.dateValidation = new Date();
      vehicule.validation.commentairesAdmin = `VALIDATION FORCÉE - ${commentaire || 'Documents incomplets acceptés'}`;
      vehicule.validation.validationForcee = true;
      vehicule.statut = 'ACTIF';
      await vehicule.save();
    })
  );

  logger.info('✅ Passage conducteur validé (FORCÉ)', { 
    userId: utilisateur._id,
    adminId: req.user.id,
    nombreVehicules: vehicules.length,
    erreursIgnorees: erreursCritiques.length
  });

   // ========================================
  // ✅ ENVOI EMAIL ET WHATSAPP - VALIDATION FORCÉE
  // ========================================
  // ========================================
// ✅ ENVOI EMAIL - VALIDATION FORCÉE
// ========================================
let emailEnvoye = false;
let whatsappEnvoye = false;

const messageValidationForcee = `🎉 Félicitations ${utilisateur.prenom} !

Votre compte conducteur a été validé sur CoCovoi !

⚠️ Attention : Certains documents sont encore manquants (${erreursCritiques.length} élément(s)). Vous avez été validé de manière exceptionnelle.

📋 Documents à compléter dès que possible :
${erreursCritiques.map((e, i) => `${i + 1}. ${e.message}`).join('\n')}

${commentaire ? `\n💬 Message de l'administrateur :\n${commentaire}\n` : ''}

Vous pouvez maintenant créer des trajets et accepter des passagers. Merci de compléter vos documents rapidement.

Bonne route ! 🚗
L'équipe CoCovoi`;

// Envoyer par Email si disponible
if (utilisateur.email) {
  try {
    const emailService = require('../services/emailService');
    
    // ✅ Construire la liste HTML des documents manquants
    const listeHTML = erreursCritiques
      .map((doc, index) => `
        <li style="padding: 12px; margin-bottom: 8px; background: #fff; border-left: 3px solid #FF9800; border-radius: 6px; color: #555; font-size: 14px; list-style: none;">
          <span style="color: #FF9800; font-weight: 700; margin-right: 8px;">${index + 1}.</span>
          ${doc.message}
        </li>
      `)
      .join('');
    
    await emailService.envoyerEmail({
      to: utilisateur.email,
      subject: '🎉 Compte conducteur validé - WAYZ-ECO',
      template: 'validation-forcee',
      data: {
        prenom: utilisateur.prenom,
        nomComplet: `${utilisateur.prenom} ${utilisateur.nom}`,
        nombreDocuments: erreursCritiques.length,
        listeDocuments: listeHTML,
        commentaireAdmin: commentaire || 'Votre compte a été validé de manière exceptionnelle. Merci de compléter vos documents rapidement.',
        frontendUrl: process.env.FRONTEND_URL || 'https://wayzeco.com',
        year: new Date().getFullYear()
      }
    });
    
    emailEnvoye = true;
    logger.info('📧 Email validation forcée envoyé', { userId: utilisateur._id });
  } catch (emailError) {
    logger.error('❌ Erreur envoi email validation forcée:', emailError);
  }
}
  // Envoyer par WhatsApp si disponible
  if (utilisateur.telephone) {
    try {
      const whatsappService = require('../services/whatsappService');
      
      await whatsappService.envoyerMessage(
        utilisateur.telephone,
        messageValidationForcee
      );
      
      whatsappEnvoye = true;
      logger.info('📱 WhatsApp validation forcée envoyé', { userId: utilisateur._id });
    } catch (whatsappError) {
      logger.error('❌ Erreur envoi WhatsApp validation forcée:', whatsappError);
    }
  }

  // Notification WebSocket
  try {
    const { notifyDriverValidation } = require('../realtime/socket');
    const io = req.app.get('io');
    
    if (io) {
      notifyDriverValidation(io, utilisateur._id.toString(), {
        userId: utilisateur._id.toString(),
        approved: true,
        forced: true,
        reason: commentaire || 'Félicitations ! Vous êtes maintenant conducteur sur CoCovoi.',
        timestamp: new Date(),
        adminId: req.user.id,
        userName: `${utilisateur.prenom} ${utilisateur.nom}`,
        vehiculesCount: vehicules.length,
        documentsManquants: erreursCritiques.length
      });
    }
  } catch (notifError) {
    logger.error('Erreur envoi notification validation forcée:', notifError);
  }

  return res.status(200).json({
    success: true,
    message: '✅ Demande de passage conducteur approuvée (VALIDATION FORCÉE)',
    warning: `${erreursCritiques.length} erreur(s) critique(s) ont été ignorées`,
    data: {
      utilisateur: {
        id: utilisateur._id,
        nom: utilisateur.nom,
        prenom: utilisateur.prenom,
        email: utilisateur.email,
        telephone: utilisateur.telephone,
        role: utilisateur.role,
        statutCompte: utilisateur.statutCompte,
        badges: utilisateur.badges,
        nombreVehicules: vehicules.length
      },
      validation: {
        approuve: true,
        validationForcee: true,
        validePar: req.user.id,
        dateValidation: new Date(),
        commentaire: commentaire || null,
        erreursIgnorees: {
          nombre: erreursCritiques.length,
          details: erreursCritiques
        }
      },
      notifications: {
        emailEnvoye: emailEnvoye,
        whatsappEnvoye: whatsappEnvoye
      },
      avertissements: avertissements.length > 0 ? {
        nombre: avertissements.length,
        details: avertissements
      } : null,
      vehiculesValides: vehicules.map(v => ({
        id: v._id,
        marque: v.marque,
        modele: v.modele,
        immatriculation: v.immatriculation,
        statut: 'ACTIF',
        validationForcee: true
      }))
    }
  });
}

  // Envoyer notification d'approbation

    if (erreursCritiques.length > 0) {
      logger.warn('⚠️ Tentative validation avec erreurs critiques', {
        userId: utilisateur._id,
        adminId: req.user.id,  // ✅ CORRIGÉ
        nombreErreurs: erreursCritiques.length,
        error: erreursCritiques
      });

      return res.status(400).json({
        success: false,
        message: '❌ Impossible de valider : critères obligatoires non remplis',
        code: 'VALIDATION_CRITERIA_NOT_MET',
        data: {
          erreursValidation: {
            total: erreursValidation.length,
            critiques: erreursCritiques.length,
            elevees: erreursValidation.filter(e => e.severite === 'ELEVEE').length,
            moyennes: erreursValidation.filter(e => e.severite === 'MOYEN').length
          },
          detailsErreurs: erreursValidation,
          avertissements: avertissements,
          categoriesManquantes: {
            identite: erreursValidation.filter(e => e.categorie === 'IDENTITE').length > 0,
            contact: erreursValidation.filter(e => e.categorie === 'CONTACT').length > 0,
            vehicule: erreursValidation.filter(e => e.categorie === 'VEHICULE').length > 0,
            photos: erreursValidation.filter(e => e.categorie === 'VEHICULE_PHOTOS').length > 0,
            documents: erreursValidation.filter(e => e.categorie === 'DOCUMENTS').length > 0,
            equipements: erreursValidation.filter(e => e.categorie === 'EQUIPEMENTS').length > 0
          },
          resumeManquant: {
            identite: erreursValidation.filter(e => e.categorie === 'IDENTITE').map(e => e.message),
            vehicules: erreursValidation.filter(e => e.categorie === 'VEHICULE').map(e => e.message),
            documents: erreursValidation.filter(e => e.categorie === 'DOCUMENTS').map(e => e.message),
            equipements: erreursValidation.filter(e => e.categorie === 'EQUIPEMENTS').map(e => e.message),
            photos: erreursValidation.filter(e => e.categorie === 'VEHICULE_PHOTOS').map(e => e.message)
          }
        },
        actions: {
          message: 'L\'utilisateur doit compléter les informations manquantes avant validation',
          priorite: 'Corriger d\'abord les erreurs critiques',
          contactUtilisateur: true,
        validationForcee: {
            description: 'Approuver malgré les documents manquants',
            endpoint: 'PATCH /api/admin/users/:userId/valider-conducteur',
            body: {
              approuve: true,
              validationForcee: true,
              commentaire: 'Raison de la validation forcée'
            }
          },
          demanderComplement: {
            description: 'Demander au conducteur de compléter ses documents',
            endpoint: 'PATCH /api/admin/users/:userId/valider-conducteur',
            body: {
              action: 'demander_complement',
              commentaire: 'Message personnalisé pour le conducteur'
            }
          },
          rejeter: {
            description: 'Rejeter la demande',
            endpoint: 'PATCH /api/admin/users/:userId/valider-conducteur',
            body: {
              approuve: false,
              action: 'rejeter',
              commentaire: 'Raison du rejet'
            }
          }
        }
      });
    }

    // ===== VALIDATION APPROUVÉE - TOUS LES CRITÈRES SONT REMPLIS =====
    
    // Changer le rôle en conducteur
    utilisateur.role = 'conducteur';
    utilisateur.statutCompte = 'ACTIF';
    
    // Ajouter badge nouveau conducteur
    if (!utilisateur.badges.includes('NOUVEAU')) {
      utilisateur.badges.push('NOUVEAU');
    }

    // Historique
    utilisateur.historiqueStatuts.push({
      ancienStatut: 'CONDUCTEUR_EN_ATTENTE_VERIFICATION',
      nouveauStatut: 'ACTIF',
      raison: `Demande conducteur approuvée${commentaire ? ` - ${commentaire}` : ''}`,
      dateModification: new Date(),
      administrateurId: req.user.id  // ✅ CORRIGÉ
    });

    await utilisateur.save({ validateBeforeSave: false });

    // Mettre à jour le statut de validation des véhicules
    await Promise.all(
      vehicules.map(async (vehicule) => {
        if (!vehicule.validation) {
          vehicule.validation = {};
        }
        vehicule.validation.statutValidation = 'VALIDE';
        vehicule.validation.validePar = req.user.id;  // ✅ CORRIGÉ
        vehicule.validation.dateValidation = new Date();
        vehicule.validation.commentairesAdmin = commentaire;
        vehicule.statut = 'ACTIF';
        await vehicule.save();
      })
    );

    logger.info('✅ Passage conducteur validé avec succès', { 
      userId: utilisateur._id,
      adminId: req.user.id,  // ✅ CORRIGÉ
      nombreVehicules: vehicules.length,
      avertissements: avertissements.length
    });

    // Envoyer notification d'approbation
    try {
      const { notifyDriverValidation } = require('../realtime/socket');
      const io = req.app.get('io');
      
      if (io) {
        notifyDriverValidation(io, utilisateur._id.toString(), {
          userId: utilisateur._id.toString(),
          approved: true,
          reason: commentaire || 'Félicitations ! Vous êtes maintenant conducteur sur CoCovoi.',
          timestamp: new Date(),
          adminId: req.user.id,
          userName: `${utilisateur.prenom} ${utilisateur.nom}`,
          vehiculesCount: vehicules.length
        });
        logger.info('🔔 Notification WebSocket envoyée (approbation validation)', { userId: utilisateur._id });
      }

      // TODO: Push notification (pas encore disponible)
      // await notificationService.sendPushNotification(
      //   utilisateur._id,
      //   '🎉 Validation Conducteur',
      //   'Félicitations ! Vous êtes maintenant conducteur.',
      //   { type: 'DRIVER_VALIDATION_APPROVED' }
      // );

      // TODO: Email notification (à implémenter plus tard)
      // await notificationService.sendEmail(
      //   utilisateur.email,
      //   '🎉 Validation Conducteur - CoCovoi',
      //   ...
      // );
    } catch (notifError) {
      logger.error('Erreur envoi notification approbation validation:', notifError);
    }
    
    res.status(200).json({
      success: true,
      message: '✅ Demande de passage conducteur approuvée avec succès',
      data: {
        utilisateur: {
          id: utilisateur._id,
          nom: utilisateur.nom,
          prenom: utilisateur.prenom,
          email: utilisateur.email,
          telephone: utilisateur.telephone,
          role: utilisateur.role,
          statutCompte: utilisateur.statutCompte,
          badges: utilisateur.badges,
          nombreVehicules: vehicules.length
        },
        validation: {
          approuve: true,
          validePar: req.user.id,  // ✅ CORRIGÉ
          dateValidation: new Date(),
          commentaire: commentaire || null,
          criteresVerifies: {
            identite: true,
            vehicules: true,
            documents: true,
            equipements: true,
            photos: true
          }
        },
        avertissements: avertissements.length > 0 ? {
          nombre: avertissements.length,
          details: avertissements
        } : null,
        vehiculesValides: vehicules.map(v => ({
          id: v._id,
          marque: v.marque,
          modele: v.modele,
          immatriculation: v.immatriculation,
          statut: 'ACTIF'
        }))
      }
    });

  } catch (error) {
    logger.error('❌ Erreur validation passage conducteur:', error);
    return next(AppError.serverError('Erreur lors de la validation', { 
      originalError: error.message
    }));
  }
};
/**
 * Lister les demandes de passage conducteur en attente (ADMIN)
 * AVEC VÉRIFICATION COMPLÈTE DES CRITÈRES
 */
const listerDemandesPassageConducteur = async (req, res, next) => {
  try {
    const demandes = await User.find({
      statutCompte: 'CONDUCTEUR_EN_ATTENTE_VERIFICATION'
    })
    .select('nom prenom email telephone dateInscription documentIdentite historiqueStatuts estVerifie contactsUrgence')
    .sort({ updatedAt: -1 });

    // Enrichir avec les informations de véhicules ET vérifications complètes
    const demandesEnrichies = await Promise.all(
      demandes.map(async (demande) => {
        const vehicules = await Vehicule.find({
          proprietaireId: demande._id,
          statut: { $ne: 'HORS_SERVICE' }
        });

        const dateDemande = demande.historiqueStatuts
          .filter(h => h.nouveauStatut === 'CONDUCTEUR_EN_ATTENTE_VERIFICATION')
          .sort((a, b) => b.dateModification - a.dateModification)[0]?.dateModification;

        // ===== VÉRIFICATIONS COMPLÈTES (même logique que validerPassageConducteur) =====
        const erreursValidation = [];
        const avertissements = [];

        // 1. VÉRIFICATION IDENTITÉ
        if (!demande.estVerifie) {
          erreursValidation.push({
            categorie: 'IDENTITE',
            champ: 'estVerifie',
            message: 'Utilisateur non vérifié',
            severite: 'CRITIQUE'
          });
        }

        if (!demande.documentIdentite || 
            demande.documentIdentite.statutVerification !== 'VERIFIE') {
          erreursValidation.push({
            categorie: 'IDENTITE',
            champ: 'documentIdentite',
            message: 'Document d\'identité non vérifié',
            statut: demande.documentIdentite?.statutVerification || 'NON_SOUMIS',
            severite: 'CRITIQUE'
          });
        }

        if (demande.documentIdentite) {
          if (!demande.documentIdentite.type) {
            erreursValidation.push({
              categorie: 'IDENTITE',
              champ: 'documentIdentite.type',
              message: 'Type de document manquant',
              severite: 'CRITIQUE'
            });
          }

          if (!demande.documentIdentite.numero) {
            erreursValidation.push({
              categorie: 'IDENTITE',
              champ: 'documentIdentite.numero',
              message: 'Numéro du document manquant',
              severite: 'CRITIQUE'
            });
          }

          if (!demande.documentIdentite.documentPath && !demande.documentIdentite.photoDocument) {
            erreursValidation.push({
              categorie: 'IDENTITE',
              champ: 'documentIdentite.photoDocument',
              message: 'Photo du document manquante',
              severite: 'CRITIQUE'
            });
          }

          if (!demande.documentIdentite.selfiePath && !demande.documentIdentite.photoSelfie) {
            erreursValidation.push({
              categorie: 'IDENTITE',
              champ: 'documentIdentite.photoSelfie',
              message: 'Photo selfie manquante',
              severite: 'CRITIQUE'
            });
          }
        }

        // 2. CONTACT
        if (!demande.email) {
          erreursValidation.push({
            categorie: 'CONTACT',
            champ: 'email',
            message: 'Email manquant',
            severite: 'CRITIQUE'
          });
        }

        if (!demande.telephone) {
          erreursValidation.push({
            categorie: 'CONTACT',
            champ: 'telephone',
            message: 'Téléphone manquant',
            severite: 'CRITIQUE'
          });
        }

        // 3. VÉHICULE(S)
        if (vehicules.length === 0) {
          erreursValidation.push({
            categorie: 'VEHICULE',
            champ: 'vehicules',
            message: 'Aucun véhicule ajouté',
            severite: 'CRITIQUE'
          });
        } else {
          // Vérifier chaque véhicule
          vehicules.forEach((vehicule, index) => {
            const prefixe = `Véhicule ${index + 1}`;

            // Informations de base
            if (!vehicule.marque) erreursValidation.push({
              categorie: 'VEHICULE', vehiculeId: vehicule._id, champ: 'marque',
              message: `${prefixe} - Marque manquante`, severite: 'CRITIQUE'
            });

            if (!vehicule.modele) erreursValidation.push({
              categorie: 'VEHICULE', vehiculeId: vehicule._id, champ: 'modele',
              message: `${prefixe} - Modèle manquant`, severite: 'CRITIQUE'
            });

            if (!vehicule.annee) {
              erreursValidation.push({
                categorie: 'VEHICULE', vehiculeId: vehicule._id, champ: 'annee',
                message: `${prefixe} - Année manquante`, severite: 'CRITIQUE'
              });
            } else {
              const age = new Date().getFullYear() - vehicule.annee;
              if (age > 15) {
                erreursValidation.push({
                  categorie: 'VEHICULE', vehiculeId: vehicule._id, champ: 'annee',
                  message: `${prefixe} - Véhicule trop ancien (${age} ans)`, severite: 'CRITIQUE'
                });
              }
            }

            if (!vehicule.couleur) erreursValidation.push({
              categorie: 'VEHICULE', vehiculeId: vehicule._id, champ: 'couleur',
              message: `${prefixe} - Couleur manquante`, severite: 'ELEVEE'
            });

            if (!vehicule.immatriculation) erreursValidation.push({
              categorie: 'VEHICULE', vehiculeId: vehicule._id, champ: 'immatriculation',
              message: `${prefixe} - Immatriculation manquante`, severite: 'CRITIQUE'
            });

            if (!vehicule.nombrePlaces || vehicule.nombrePlaces < 2) erreursValidation.push({
              categorie: 'VEHICULE', vehiculeId: vehicule._id, champ: 'nombrePlaces',
              message: `${prefixe} - Nombre de places invalide`, severite: 'CRITIQUE'
            });

            // PHOTOS
            if (!vehicule.photos?.avant) erreursValidation.push({
              categorie: 'VEHICULE_PHOTOS', vehiculeId: vehicule._id, champ: 'photos.avant',
              message: `${prefixe} - Photo avant manquante`, severite: 'CRITIQUE'
            });

            if (!vehicule.photos?.arriere) erreursValidation.push({
              categorie: 'VEHICULE_PHOTOS', vehiculeId: vehicule._id, champ: 'photos.arriere',
              message: `${prefixe} - Photo arrière manquante`, severite: 'CRITIQUE'
            });

            if (!vehicule.photos?.interieur) erreursValidation.push({
              categorie: 'VEHICULE_PHOTOS', vehiculeId: vehicule._id, champ: 'photos.interieur',
              message: `${prefixe} - Photo intérieur manquante`, severite: 'CRITIQUE'
            });

            // CARTE GRISE
            if (!vehicule.carteGrise?.numero) erreursValidation.push({
              categorie: 'DOCUMENTS', vehiculeId: vehicule._id, champ: 'carteGrise.numero',
              message: `${prefixe} - Numéro carte grise manquant`, severite: 'CRITIQUE'
            });

            if (!vehicule.carteGrise?.numeroChassis) erreursValidation.push({
              categorie: 'DOCUMENTS', vehiculeId: vehicule._id, champ: 'carteGrise.numeroChassis',
              message: `${prefixe} - Numéro de châssis manquant`, severite: 'CRITIQUE'
            });

            if (!vehicule.carteGrise?.dateEmission) erreursValidation.push({
              categorie: 'DOCUMENTS', vehiculeId: vehicule._id, champ: 'carteGrise.dateEmission',
              message: `${prefixe} - Date émission carte grise manquante`, severite: 'ELEVEE'
            });

            // ASSURANCE
            if (!vehicule.assurance?.numeroPolice) erreursValidation.push({
              categorie: 'DOCUMENTS', vehiculeId: vehicule._id, champ: 'assurance.numeroPolice',
              message: `${prefixe} - Numéro police assurance manquant`, severite: 'CRITIQUE'
            });

            if (!vehicule.assurance?.compagnie) erreursValidation.push({
              categorie: 'DOCUMENTS', vehiculeId: vehicule._id, champ: 'assurance.compagnie',
              message: `${prefixe} - Compagnie assurance manquante`, severite: 'CRITIQUE'
            });

            if (!vehicule.assurance?.type) erreursValidation.push({
              categorie: 'DOCUMENTS', vehiculeId: vehicule._id, champ: 'assurance.type',
              message: `${prefixe} - Type assurance manquant`, severite: 'CRITIQUE'
            });

            if (!vehicule.assurance?.dateExpiration) {
              erreursValidation.push({
                categorie: 'DOCUMENTS', vehiculeId: vehicule._id, champ: 'assurance.dateExpiration',
                message: `${prefixe} - Date expiration assurance manquante`, severite: 'CRITIQUE'
              });
            } else {
              const dateExpiration = new Date(vehicule.assurance.dateExpiration);
              const maintenant = new Date();
              
              if (dateExpiration < maintenant) {
                erreursValidation.push({
                  categorie: 'DOCUMENTS', vehiculeId: vehicule._id, champ: 'assurance.dateExpiration',
                  message: `${prefixe} - Assurance expirée`, severite: 'CRITIQUE'
                });
              } else {
                const joursRestants = Math.ceil((dateExpiration - maintenant) / (1000 * 60 * 60 * 24));
                if (joursRestants <= 30) {
                  avertissements.push({
                    categorie: 'DOCUMENTS', vehiculeId: vehicule._id,
                    message: `${prefixe} - Assurance expire dans ${joursRestants} jours`, severite: 'MOYEN'
                  });
                }
              }
            }

            // VISITE TECHNIQUE
            if (!vehicule.visiteTechnique?.dateExpiration) {
              erreursValidation.push({
                categorie: 'DOCUMENTS', vehiculeId: vehicule._id, champ: 'visiteTechnique.dateExpiration',
                message: `${prefixe} - Date expiration visite technique manquante`, severite: 'CRITIQUE'
              });
            } else {
              const dateExpiration = new Date(vehicule.visiteTechnique.dateExpiration);
              const maintenant = new Date();
              
              if (dateExpiration < maintenant) {
                erreursValidation.push({
                  categorie: 'DOCUMENTS', vehiculeId: vehicule._id, champ: 'visiteTechnique.dateExpiration',
                  message: `${prefixe} - Visite technique expirée`, severite: 'CRITIQUE'
                });
              } else {
                const joursRestants = Math.ceil((dateExpiration - maintenant) / (1000 * 60 * 60 * 24));
                if (joursRestants <= 30) {
                  avertissements.push({
                    categorie: 'DOCUMENTS', vehiculeId: vehicule._id,
                    message: `${prefixe} - Visite technique expire dans ${joursRestants} jours`, severite: 'MOYEN'
                  });
                }
              }
            }

            if (!vehicule.visiteTechnique?.numeroAttestation) erreursValidation.push({
              categorie: 'DOCUMENTS', vehiculeId: vehicule._id, champ: 'visiteTechnique.numeroAttestation',
              message: `${prefixe} - Numéro attestation visite technique manquant`, severite: 'ELEVEE'
            });

            // VIGNETTE
            if (!vehicule.vignette?.annee) erreursValidation.push({
              categorie: 'DOCUMENTS', vehiculeId: vehicule._id, champ: 'vignette.annee',
              message: `${prefixe} - Année vignette manquante`, severite: 'CRITIQUE'
            });

            if (!vehicule.vignette?.numero) erreursValidation.push({
              categorie: 'DOCUMENTS', vehiculeId: vehicule._id, champ: 'vignette.numero',
              message: `${prefixe} - Numéro vignette manquant`, severite: 'CRITIQUE'
            });

            if (!vehicule.vignette?.dateExpiration) {
              erreursValidation.push({
                categorie: 'DOCUMENTS', vehiculeId: vehicule._id, champ: 'vignette.dateExpiration',
                message: `${prefixe} - Date expiration vignette manquante`, severite: 'CRITIQUE'
              });
            } else {
              const dateExpiration = new Date(vehicule.vignette.dateExpiration);
              if (dateExpiration < new Date()) {
                erreursValidation.push({
                  categorie: 'DOCUMENTS', vehiculeId: vehicule._id, champ: 'vignette.dateExpiration',
                  message: `${prefixe} - Vignette expirée`, severite: 'CRITIQUE'
                });
              }
            }

            // CARTE DE TRANSPORT
            if (!vehicule.carteTransport?.numero) erreursValidation.push({
              categorie: 'DOCUMENTS', vehiculeId: vehicule._id, champ: 'carteTransport.numero',
              message: `${prefixe} - Numéro carte transport manquant`, severite: 'CRITIQUE'
            });

            if (!vehicule.carteTransport?.dateExpiration) {
              erreursValidation.push({
                categorie: 'DOCUMENTS', vehiculeId: vehicule._id, champ: 'carteTransport.dateExpiration',
                message: `${prefixe} - Date expiration carte transport manquante`, severite: 'CRITIQUE'
              });
            } else {
              const dateExpiration = new Date(vehicule.carteTransport.dateExpiration);
              if (dateExpiration < new Date()) {
                erreursValidation.push({
                  categorie: 'DOCUMENTS', vehiculeId: vehicule._id, champ: 'carteTransport.dateExpiration',
                  message: `${prefixe} - Carte transport expirée`, severite: 'CRITIQUE'
                });
              }
            }

            if (!vehicule.carteTransport?.categorieAutorisee) erreursValidation.push({
              categorie: 'DOCUMENTS', vehiculeId: vehicule._id, champ: 'carteTransport.categorieAutorisee',
              message: `${prefixe} - Catégorie carte transport manquante`, severite: 'CRITIQUE'
            });

            // ÉQUIPEMENTS OBLIGATOIRES
            if (!vehicule.equipements) {
              erreursValidation.push({
                categorie: 'EQUIPEMENTS', vehiculeId: vehicule._id, champ: 'equipements',
                message: `${prefixe} - Équipements non renseignés`, severite: 'CRITIQUE'
              });
            } else {
              if (!vehicule.equipements.ceintures || vehicule.equipements.ceintures === 'NON') {
                erreursValidation.push({
                  categorie: 'EQUIPEMENTS', vehiculeId: vehicule._id, champ: 'equipements.ceintures',
                  message: `${prefixe} - Ceintures non renseignées`, severite: 'CRITIQUE'
                });
              }

              if (!vehicule.equipements.trousseSecours) erreursValidation.push({
                categorie: 'EQUIPEMENTS', vehiculeId: vehicule._id, champ: 'equipements.trousseSecours',
                message: `${prefixe} - Trousse de secours manquante`, severite: 'CRITIQUE'
              });

              if (!vehicule.equipements.extincteur) erreursValidation.push({
                categorie: 'EQUIPEMENTS', vehiculeId: vehicule._id, champ: 'equipements.extincteur',
                message: `${prefixe} - Extincteur manquant`, severite: 'CRITIQUE'
              });

              if (!vehicule.equipements.triangleSignalisation) erreursValidation.push({
                categorie: 'EQUIPEMENTS', vehiculeId: vehicule._id, champ: 'equipements.triangleSignalisation',
                message: `${prefixe} - Triangle signalisation manquant`, severite: 'CRITIQUE'
              });

              if (!vehicule.equipements.giletSecurite) erreursValidation.push({
                categorie: 'EQUIPEMENTS', vehiculeId: vehicule._id, champ: 'equipements.giletSecurite',
                message: `${prefixe} - Gilet sécurité manquant`, severite: 'CRITIQUE'
              });

              if (!vehicule.equipements.roueDeSecours) erreursValidation.push({
                categorie: 'EQUIPEMENTS', vehiculeId: vehicule._id, champ: 'equipements.roueDeSecours',
                message: `${prefixe} - Roue de secours manquante`, severite: 'CRITIQUE'
              });

              if (!vehicule.equipements.cricCle) erreursValidation.push({
                categorie: 'EQUIPEMENTS', vehiculeId: vehicule._id, champ: 'equipements.cricCle',
                message: `${prefixe} - Cric et clé manquants`, severite: 'CRITIQUE'
              });
            }

            if (!vehicule.documentsComplets) {
              avertissements.push({
                categorie: 'VEHICULE', vehiculeId: vehicule._id,
                message: `${prefixe} - Documents incomplets`, severite: 'MOYEN'
              });
            }
          });
        }

        // 4. CONTACTS D'URGENCE (RECOMMANDÉ)
        if (!demande.contactsUrgence || demande.contactsUrgence.length === 0) {
          avertissements.push({
            categorie: 'PROFIL', champ: 'contactsUrgence',
            message: 'Aucun contact d\'urgence', severite: 'MOYEN'
          });
        }

        // Calculer les erreurs critiques
        const erreursCritiques = erreursValidation.filter(e => e.severite === 'CRITIQUE');
        const erreursElevees = erreursValidation.filter(e => e.severite === 'ELEVEE');
        
        // Calculer pourcentage de complétion
        const totalCriteres = 30; // Nombre approximatif de critères obligatoires
        const criteresManquants = erreursCritiques.length;
        const pourcentageCompletion = Math.max(0, ((totalCriteres - criteresManquants) / totalCriteres) * 100).toFixed(0);

        // Déterminer le statut de validation
        let statutValidation;
        let couleurStatut;
        if (erreursCritiques.length === 0) {
          statutValidation = 'PRET_VALIDATION';
          couleurStatut = 'success';
        } else if (erreursCritiques.length <= 5) {
          statutValidation = 'PRESQUE_PRET';
          couleurStatut = 'warning';
        } else {
          statutValidation = 'INCOMPLET';
          couleurStatut = 'danger';
        }

        return {
          id: demande._id,
          nom: demande.nom,
          prenom: demande.prenom,
          nomComplet: `${demande.prenom} ${demande.nom}`,
          email: demande.email,
          telephone: demande.telephone,
          dateInscription: demande.dateInscription,
          dateDemande: dateDemande,
          
          // Identité
          identite: {
            estVerifie: demande.estVerifie,
            documentType: demande.documentIdentite?.type,
            documentStatut: demande.documentIdentite?.statutVerification || 'NON_SOUMIS',
            documentNumero: demande.documentIdentite?.numero ? '***' + demande.documentIdentite.numero.slice(-4) : null,
            photoDocumentPresente: !!(demande.documentIdentite?.documentPath || demande.documentIdentite?.photoDocument),
            photoSelfiePresente: !!(demande.documentIdentite?.selfiePath || demande.documentIdentite?.photoSelfie)
          },
          
          // Véhicules
          vehicules: vehicules.map(v => ({
            id: v._id,
            marque: v.marque,
            modele: v.modele,
            annee: v.annee,
            age: v.annee ? new Date().getFullYear() - v.annee : null,
            immatriculation: v.immatriculation,
            statut: v.statut,
            documentsComplets: v.documentsComplets,
            validationStatut: v.validation?.statutValidation,
            
            // Documents résumés
            documents: {
              carteGrise: !!v.carteGrise?.numero,
              assurance: !!v.assurance?.numeroPolice && v.assurance?.dateExpiration > new Date(),
              visiteTechnique: !!v.visiteTechnique?.dateExpiration && v.visiteTechnique?.dateExpiration > new Date(),
              vignette: !!v.vignette?.numero && v.vignette?.dateExpiration > new Date(),
              carteTransport: !!v.carteTransport?.numero && v.carteTransport?.dateExpiration > new Date()
            },
            
            // Photos résumées
            photos: {
              avant: !!v.photos?.avant,
              arriere: !!v.photos?.arriere,
              interieur: !!v.photos?.interieur,
              total: [v.photos?.avant, v.photos?.arriere, v.photos?.lateral_gauche, 
                     v.photos?.lateral_droit, v.photos?.interieur, v.photos?.tableau_bord]
                     .filter(Boolean).length
            },
            
            // Équipements résumés
            equipements: {
              obligatoiresPresents: !!(
                v.equipements?.ceintures &&
                v.equipements?.trousseSecours &&
                v.equipements?.extincteur &&
                v.equipements?.triangleSignalisation &&
                v.equipements?.giletSecurite &&
                v.equipements?.roueDeSecours &&
                v.equipements?.cricCle
              )
            }
          })),
          nombreVehicules: vehicules.length,
          
          // Validation
          validation: {
            statutValidation: statutValidation,
            couleurStatut: couleurStatut,
            peutEtreValide: erreursCritiques.length === 0,
            pourcentageCompletion: parseInt(pourcentageCompletion),
            
            erreurs: {
              total: erreursValidation.length,
              critiques: erreursCritiques.length,
              elevees: erreursElevees.length,
              details: erreursValidation
            },
            
            avertissements: {
              total: avertissements.length,
              details: avertissements
            },
            
            resumeManquant: {
              identite: erreursValidation.filter(e => e.categorie === 'IDENTITE').length > 0,
              contact: erreursValidation.filter(e => e.categorie === 'CONTACT').length > 0,
              vehicule: erreursValidation.filter(e => e.categorie === 'VEHICULE').length > 0,
              photos: erreursValidation.filter(e => e.categorie === 'VEHICULE_PHOTOS').length > 0,
              documents: erreursValidation.filter(e => e.categorie === 'DOCUMENTS').length > 0,
              equipements: erreursValidation.filter(e => e.categorie === 'EQUIPEMENTS').length > 0
            }
          },
          
          // Temps écoulé depuis demande
          tempsEcouleDemande: dateDemande ? Math.floor((new Date() - dateDemande) / (1000 * 60 * 60)) : null // en heures
        };
      })
    );

    // Trier par priorité (prêts à valider en premier)
    demandesEnrichies.sort((a, b) => {
      if (a.validation.peutEtreValide && !b.validation.peutEtreValide) return -1;
      if (!a.validation.peutEtreValide && b.validation.peutEtreValide) return 1;
      return b.validation.pourcentageCompletion - a.validation.pourcentageCompletion;
    });

    logger.info('📋 Liste demandes passage conducteur récupérée avec détails', { 
      adminId: req.user.id,  // ✅ CORRIGÉ
      nombreDemandes: demandesEnrichies.length
    });

    res.status(200).json({
      success: true,
      message: `${demandesEnrichies.length} demande(s) en attente`,
      data: {
        demandes: demandesEnrichies,
        statistiques: {
          total: demandesEnrichies.length,
          pretsPourValidation: demandesEnrichies.filter(d => d.validation.peutEtreValide).length,
          presquePrets: demandesEnrichies.filter(d => d.validation.statutValidation === 'PRESQUE_PRET').length,
          incomplets: demandesEnrichies.filter(d => d.validation.statutValidation === 'INCOMPLET').length,
          avecVehicule: demandesEnrichies.filter(d => d.nombreVehicules > 0).length,
          sansVehicule: demandesEnrichies.filter(d => d.nombreVehicules === 0).length,
          identiteVerifiee: demandesEnrichies.filter(d => d.identite.estVerifie).length,
          moyenneCompletion: (demandesEnrichies.reduce((sum, d) => sum + d.validation.pourcentageCompletion, 0) / demandesEnrichies.length).toFixed(0) + '%'
        },
        filtres: {
          pretsPourValidation: demandesEnrichies.filter(d => d.validation.peutEtreValide),
          presquePrets: demandesEnrichies.filter(d => d.validation.statutValidation === 'PRESQUE_PRET'),
          incomplets: demandesEnrichies.filter(d => d.validation.statutValidation === 'INCOMPLET')
        }
      }
    });

  } catch (error) {
    logger.error('❌ Erreur liste demandes conducteur:', error);
    return next(AppError.serverError('Erreur lors de la récupération des demandes', { 
      originalError: error.message
    }));
  }
};
/**
 * Convertir données en CSV
 */
function convertirEnCSV(donnees) {
  const headers = [
    'Periode',
    'Nombre_Transactions',
    'Montant_Total_Traite',
    'Total_Commissions',
    'Total_Bonus',
    'Commissions_Prelevees',
    'Taux_Prelevement'
  ];

  const lignes = donnees.map(d => [
    d.periode,
    d.nombreTransactions,
    d.montantTotalTraite,
    d.totalCommissions,
    d.totalBonus || 0,
    d.commissionsPrelevees,
    d.tauxPrelevement ? d.tauxPrelevement.toFixed(2) : '0.00'
  ]);

  return [headers, ...lignes]
    .map(ligne => ligne.join(','))
    .join('\n');
}
// =====================================================
// GESTION DES VÉHICULES (ADMIN)
// =====================================================

/**
 * @desc    Lister tous les véhicules (admin)
 * @route   GET /api/admin/vehicules
 * @access  Private (Admin)
 */
const listerVehiculesAdmin = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      search,
      statut,
      statutValidation,
      marque,
      modele,
      proprietaireId,
      dateDebut,
      dateFin,
      documentsComplets,
      disponibleCovoiturage,
      sortBy = 'createdAt',
      order = 'desc'
    } = req.query;

    const pageNum = parseInt(page);
    const limitNum = Math.min(parseInt(limit), 100);

    // Construction des filtres
    const filtres = {};

    // Filtre par statut
    if (statut) {
      if (Array.isArray(statut)) {
        filtres.statut = { $in: statut };
      } else {
        filtres.statut = statut.toUpperCase();
      }
    }

    // Filtre par statut de validation
    if (statutValidation) {
      filtres['validation.statutValidation'] = statutValidation.toUpperCase();
    }

    // Filtre par marque
    if (marque) {
      filtres.marque = { $regex: marque, $options: 'i' };
    }

    // Filtre par modèle
    if (modele) {
      filtres.modele = { $regex: modele, $options: 'i' };
    }

    // Filtre par propriétaire
    if (proprietaireId) {
      filtres.proprietaireId = proprietaireId;
    }

    // Filtre par date de création
    if (dateDebut || dateFin) {
      filtres.createdAt = {};
      if (dateDebut) filtres.createdAt.$gte = new Date(dateDebut);
      if (dateFin) filtres.createdAt.$lte = new Date(dateFin);
    }

    // Filtre documents complets
    if (documentsComplets !== undefined) {
      filtres.documentsComplets = documentsComplets === 'true';
    }

    // Filtre disponibilité covoiturage
    if (disponibleCovoiturage !== undefined) {
      filtres.disponibilitePourCourse = disponibleCovoiturage === 'true';
    }

    // Recherche globale
    if (search) {
      filtres.$or = [
        { marque: { $regex: search, $options: 'i' } },
        { modele: { $regex: search, $options: 'i' } },
        { immatriculation: { $regex: search, $options: 'i' } },
        { couleur: { $regex: search, $options: 'i' } }
      ];
    }

    // Options de tri
    const sortOptions = {};
    sortOptions[sortBy] = order === 'asc' ? 1 : -1;

    // Exécution de la requête
    const vehicules = await Vehicule.find(filtres)
      .populate('proprietaireId', 'nom prenom email telephone photo statut role')
      .populate('validation.validePar', 'nom prenom')
      .sort(sortOptions)
      .limit(limitNum)
      .skip((pageNum - 1) * limitNum)
      .lean();

    const total = await Vehicule.countDocuments(filtres);

    // Enrichir les données avec des calculs
    const vehiculesEnrichis = vehicules.map(vehicule => {
      // Calcul de l'âge du véhicule
      const age = vehicule.annee ? new Date().getFullYear() - vehicule.annee : null;

      // Vérification des documents
      const documentsValides = {
        carteGrise: !!(vehicule.carteGrise?.numero && vehicule.carteGrise?.numeroChassis),
        assurance: !!(vehicule.assurance?.numeroPolice && 
                     vehicule.assurance?.dateExpiration && 
                     new Date(vehicule.assurance.dateExpiration) > new Date()),
        visiteTechnique: !!(vehicule.visiteTechnique?.dateExpiration && 
                           new Date(vehicule.visiteTechnique.dateExpiration) > new Date()),
        vignette: !!(vehicule.vignette?.numero && 
                    vehicule.vignette?.dateExpiration && 
                    new Date(vehicule.vignette.dateExpiration) > new Date()),
        carteTransport: !!(vehicule.carteTransport?.numero && 
                          vehicule.carteTransport?.dateExpiration && 
                          new Date(vehicule.carteTransport.dateExpiration) > new Date())
      };

      // Photos disponibles
      const photosDisponibles = {
        avant: !!vehicule.photos?.avant,
        arriere: !!vehicule.photos?.arriere,
        lateral_gauche: !!vehicule.photos?.lateral_gauche,
        lateral_droit: !!vehicule.photos?.lateral_droit,
        interieur: !!vehicule.photos?.interieur,
        tableau_bord: !!vehicule.photos?.tableau_bord
      };

      const nombrePhotos = Object.values(photosDisponibles).filter(Boolean).length;

      // Équipements obligatoires
      const equipementsObligatoires = {
        ceintures: vehicule.equipements?.ceintures && vehicule.equipements.ceintures !== 'NON',
        trousseSecours: vehicule.equipements?.trousseSecours,
        extincteur: vehicule.equipements?.extincteur,
        triangleSignalisation: vehicule.equipements?.triangleSignalisation,
        giletSecurite: vehicule.equipements?.giletSecurite,
        roueDeSecours: vehicule.equipements?.roueDeSecours,
        cricCle: vehicule.equipements?.cricCle
      };

      const equipementsComplets = Object.values(equipementsObligatoires).every(Boolean);

      return {
        ...vehicule,
        age,
        documentsValides,
        photosDisponibles,
        nombrePhotos,
        equipementsObligatoires,
        equipementsComplets,
        tousDocumentsValides: Object.values(documentsValides).every(Boolean)
      };
    });

    // Statistiques rapides
    const statistiques = {
      total,
      actifs: vehicules.filter(v => v.statut === 'ACTIF' || v.statut === 'DISPONIBLE').length,
      enAttenteVerification: vehicules.filter(v => v.statut === 'EN_ATTENTE_VERIFICATION').length,
      valides: vehicules.filter(v => v.validation?.statutValidation === 'VALIDE').length,
      rejetes: vehicules.filter(v => v.validation?.statutValidation === 'REJETE').length,
      documentsComplets: vehicules.filter(v => v.documentsComplets).length,
      disponiblesCovoiturage: vehicules.filter(v => v.disponibilitePourCourse).length
    };

    res.status(200).json({
      success: true,
      message: 'Liste des véhicules récupérée',
      data: {
        vehicules: vehiculesEnrichis,
        pagination: {
          currentPage: pageNum,
          totalPages: Math.ceil(total / limitNum),
          totalItems: total,
          itemsPerPage: limitNum,
          hasNextPage: pageNum < Math.ceil(total / limitNum),
          hasPrevPage: pageNum > 1
        },
        statistiques,
        filtresAppliques: {
          statut,
          statutValidation,
          marque,
          modele,
          search,
          documentsComplets,
          disponibleCovoiturage
        }
      }
    });

  } catch (error) {
    logger.error('Erreur listerVehiculesAdmin:', error);
    return next(AppError.serverError('Erreur lors de la récupération des véhicules', { 
      originalError: error.message 
    }));
  }
};

/**
 * @desc    Obtenir les détails d'un véhicule (admin)
 * @route   GET /api/admin/vehicules/:id
 * @access  Private (Admin)
 */
const obtenirVehiculeAdmin = async (req, res, next) => {
  try {
    const vehicule = await Vehicule.findById(req.params.id)
      .populate('proprietaireId', 'nom prenom email telephone photo statut role dateInscription')
      .populate('validation.validePar', 'nom prenom email')
      .populate('trajetActif', 'pointDepart pointArrivee dateDepart statut')
      .lean();

    if (!vehicule) {
      return next(AppError.notFound('Véhicule introuvable'));
    }

    // Enrichir avec des informations calculées
    const age = vehicule.annee ? new Date().getFullYear() - vehicule.annee : null;

    // Vérifier chaque document en détail
    const documentsDetails = {
      carteGrise: {
        presente: !!(vehicule.carteGrise?.numero),
        numero: vehicule.carteGrise?.numero,
        numeroChassis: vehicule.carteGrise?.numeroChassis,
        dateEmission: vehicule.carteGrise?.dateEmission,
        complete: !!(vehicule.carteGrise?.numero && vehicule.carteGrise?.numeroChassis)
      },
      assurance: {
        presente: !!(vehicule.assurance?.numeroPolice),
        numeroPolice: vehicule.assurance?.numeroPolice,
        compagnie: vehicule.assurance?.compagnie,
        type: vehicule.assurance?.type,
        dateExpiration: vehicule.assurance?.dateExpiration,
        valide: vehicule.assurance?.dateExpiration && new Date(vehicule.assurance.dateExpiration) > new Date(),
        joursRestants: vehicule.assurance?.dateExpiration ? 
          Math.ceil((new Date(vehicule.assurance.dateExpiration) - new Date()) / (1000 * 60 * 60 * 24)) : null
      },
      visiteTechnique: {
        presente: !!(vehicule.visiteTechnique?.dateExpiration),
        dateExpiration: vehicule.visiteTechnique?.dateExpiration,
        numeroAttestation: vehicule.visiteTechnique?.numeroAttestation,
        resultat: vehicule.visiteTechnique?.resultat,
        valide: vehicule.visiteTechnique?.dateExpiration && new Date(vehicule.visiteTechnique.dateExpiration) > new Date(),
        joursRestants: vehicule.visiteTechnique?.dateExpiration ? 
          Math.ceil((new Date(vehicule.visiteTechnique.dateExpiration) - new Date()) / (1000 * 60 * 60 * 24)) : null
      },
      vignette: {
        presente: !!(vehicule.vignette?.numero),
        numero: vehicule.vignette?.numero,
        annee: vehicule.vignette?.annee,
        dateExpiration: vehicule.vignette?.dateExpiration,
        valide: vehicule.vignette?.dateExpiration && new Date(vehicule.vignette.dateExpiration) > new Date(),
        joursRestants: vehicule.vignette?.dateExpiration ? 
          Math.ceil((new Date(vehicule.vignette.dateExpiration) - new Date()) / (1000 * 60 * 60 * 24)) : null
      },
      carteTransport: {
        presente: !!(vehicule.carteTransport?.numero),
        numero: vehicule.carteTransport?.numero,
        categorieAutorisee: vehicule.carteTransport?.categorieAutorisee,
        dateExpiration: vehicule.carteTransport?.dateExpiration,
        valide: vehicule.carteTransport?.dateExpiration && new Date(vehicule.carteTransport.dateExpiration) > new Date(),
        joursRestants: vehicule.carteTransport?.dateExpiration ? 
          Math.ceil((new Date(vehicule.carteTransport.dateExpiration) - new Date()) / (1000 * 60 * 60 * 24)) : null
      }
    };

    // Historique des trajets (si disponible)
    const nombreTrajets = vehicule.statistiques?.nombreTrajets || 0;

    res.status(200).json({
      success: true,
      data: {
        vehicule: {
          ...vehicule,
          age,
          documentsDetails,
          nombreTrajets
        }
      }
    });

  } catch (error) {
    logger.error('Erreur obtenirVehiculeAdmin:', error);
    return next(AppError.serverError('Erreur lors de la récupération du véhicule', { 
      originalError: error.message 
    }));
  }
};

/**
 * @desc    Obtenir le propriétaire d'un véhicule (admin)
 * @route   GET /api/admin/vehicules/:id/proprietaire
 * @access  Private (Admin)
 */
const obtenirProprietaireVehicule = async (req, res, next) => {
  try {
    const vehicule = await Vehicule.findById(req.params.id)
      .populate({
        path: 'proprietaireId',
        select: '-motDePasse'
      })
      .lean();

    if (!vehicule) {
      return next(AppError.notFound('Véhicule introuvable'));
    }

    if (!vehicule.proprietaireId) {
      return next(AppError.notFound('Propriétaire introuvable'));
    }

    // Compter les véhicules du propriétaire
    const nombreVehicules = await Vehicule.countDocuments({ 
      proprietaireId: vehicule.proprietaireId._id 
    });

    res.status(200).json({
      success: true,
      data: {
        proprietaire: {
          ...vehicule.proprietaireId,
          nombreVehicules
        }
      }
    });

  } catch (error) {
    logger.error('Erreur obtenirProprietaireVehicule:', error);
    return next(AppError.serverError('Erreur lors de la récupération du propriétaire', { 
      originalError: error.message 
    }));
  }
};

/**
 * @desc    Valider un véhicule (admin)
 * @route   POST /api/admin/vehicules/:id/valider
 * @access  Private (Admin)
 */
const validerVehiculeAdmin = async (req, res, next) => {
  try {
    const { commentaire } = req.body;
    const adminId = req.user.id;

    const vehicule = await Vehicule.findById(req.params.id);

    if (!vehicule) {
      return next(AppError.notFound('Véhicule introuvable'));
    }

    // Utiliser la méthode du modèle
    await vehicule.valider(adminId, commentaire);

    logger.info('✅ Véhicule validé par admin', {
      vehiculeId: vehicule._id,
      adminId,
      marque: vehicule.marque,
      modele: vehicule.modele
    });

    res.status(200).json({
      success: true,
      message: 'Véhicule validé avec succès',
      data: {
        vehicule: {
          id: vehicule._id,
          marque: vehicule.marque,
          modele: vehicule.modele,
          statut: vehicule.statut,
          validation: vehicule.validation
        }
      }
    });

  } catch (error) {
    logger.error('Erreur validerVehiculeAdmin:', error);
    return next(AppError.serverError(error.message, { 
      originalError: error.message 
    }));
  }
};

/**
 * @desc    Rejeter un véhicule (admin)
 * @route   POST /api/admin/vehicules/:id/rejeter
 * @access  Private (Admin)
 */
const rejeterVehiculeAdmin = async (req, res, next) => {
  try {
    const { raison } = req.body;
    const adminId = req.user.id;

    if (!raison || raison.length < 10) {
      return next(AppError.badRequest('Raison du rejet requise (minimum 10 caractères)'));
    }

    const vehicule = await Vehicule.findById(req.params.id);

    if (!vehicule) {
      return next(AppError.notFound('Véhicule introuvable'));
    }

    // Utiliser la méthode du modèle
    await vehicule.rejeter(raison, adminId);

    logger.info('❌ Véhicule rejeté par admin', {
      vehiculeId: vehicule._id,
      adminId,
      raison
    });

    res.status(200).json({
      success: true,
      message: 'Véhicule rejeté',
      data: {
        vehicule: {
          id: vehicule._id,
          marque: vehicule.marque,
          modele: vehicule.modele,
          statut: vehicule.statut,
          raisonRejet: vehicule.raisonRejet
        }
      }
    });

  } catch (error) {
    logger.error('Erreur rejeterVehiculeAdmin:', error);
    return next(AppError.serverError('Erreur lors du rejet du véhicule', { 
      originalError: error.message 
    }));
  }
};

/**
 * @desc    Obtenir les statistiques globales des véhicules (admin)
 * @route   GET /api/admin/vehicules/statistiques/globales
 * @access  Private (Admin)
 */
const obtenirStatistiquesVehiculesAdmin = async (req, res, next) => {
  try {
    const stats = await Vehicule.statistiquesGlobales();

    // Statistiques par marque (top 10)
    const statsMarques = await Vehicule.aggregate([
      {
        $group: {
          _id: '$marque',
          nombre: { $sum: 1 },
          ageMoyen: { $avg: { $subtract: [new Date().getFullYear(), '$annee'] } }
        }
      },
      { $sort: { nombre: -1 } },
      { $limit: 10 }
    ]);

    // Répartition par statut
    const statsStatuts = await Vehicule.aggregate([
      {
        $group: {
          _id: '$statut',
          nombre: { $sum: 1 }
        }
      },
      { $sort: { nombre: -1 } }
    ]);

    // Répartition par statut de validation
    const statsValidation = await Vehicule.aggregate([
      {
        $group: {
          _id: '$validation.statutValidation',
          nombre: { $sum: 1 }
        }
      },
      { $sort: { nombre: -1 } }
    ]);

    // Documents expirés dans les 30 prochains jours
    const date30Jours = new Date();
    date30Jours.setDate(date30Jours.getDate() + 30);

    const documentsProchesExpiration = await Vehicule.countDocuments({
      $or: [
        { 'assurance.dateExpiration': { $lte: date30Jours, $gt: new Date() } },
        { 'visiteTechnique.dateExpiration': { $lte: date30Jours, $gt: new Date() } },
        { 'vignette.dateExpiration': { $lte: date30Jours, $gt: new Date() } },
        { 'carteTransport.dateExpiration': { $lte: date30Jours, $gt: new Date() } }
      ]
    });

    res.status(200).json({
      success: true,
      data: {
        statistiquesGlobales: stats,
        topMarques: statsMarques,
        repartitionStatuts: statsStatuts,
        repartitionValidation: statsValidation,
        alertes: {
          documentsProchesExpiration
        }
      }
    });

  } catch (error) {
    logger.error('Erreur obtenirStatistiquesVehiculesAdmin:', error);
    return next(AppError.serverError('Erreur lors de la récupération des statistiques', { 
      originalError: error.message 
    }));
  }
};
module.exports = {
  // Authentification
  connexionAdmin,
  obtenirProfil,
  validerPassageConducteur,
  listerDemandesPassageConducteur,
  
  // CRUD Admins
  creerAdmin,
  listerAdmins,
  obtenirAdminParId,
  modifierAdmin,
  changerStatutAdmin,
  desactiverAdmin,
  
  // Analytics
  obtenirDashboard,
  obtenirStatistiques,
  feedAdmin,

  // Gestion Trajets
  listerTrajets,
  obtenirTrajet,
  obtenirReservationsTrajet,
  annulerTrajet,
  supprimerTrajet,

  // Gestion Utilisateurs
  listerUtilisateurs,
  obtenirUtilisateur,
  obtenirStatistiquesUtilisateur,
  obtenirTrajetsUtilisateur,
  obtenirReservationsUtilisateur,
  obtenirVehiculesUtilisateur,
  suspendreUtilisateur,
  activerUtilisateur,
  supprimerUtilisateur,
  exporterUtilisateurs,

  // Gestion Réservations
  listerReservations,
  obtenirReservation,
  confirmerReservation,
  annulerReservation,

  // Gestion Paiements
  listerPaiements,
  obtenirPaiement,
  rembourserPaiement,
  obtenirStatistiquesPaiements,
  obtenirStatistiquesCommissions,
  obtenirDetailCommission,
  traiterCommissionsEnEchec,
  genererRapportCommissions,
  surveillerCommissions,
  exporterPaiements,

  // Gestion Recharges
  obtenirStatistiquesRecharges,
  traiterRechargesEnAttente,

  // Gestion Signalements
  listerSignalements,
  obtenirSignalement,
  traiterSignalement,
  marquerPrioritaire,

  // Gestion Événements
  listerEvenements,
  creerEvenement,
  obtenirEvenement,
  obtenirParticipantsEvenement,
  modifierEvenement,
  annulerEvenement,
  supprimerEvenement,

  // Gestion Évaluations
  listerEvaluations,
  obtenirEvaluation,
  supprimerEvaluation,
  signalerEvaluation,
  obtenirStatistiquesEvaluations,

  // Gestion Alertes Urgence
  listerAlertes,
  obtenirAlerte,
  traiterAlerte,
  contacterAlerte,
  cloturerAlerte,
  // Gestion Véhicules (NOUVEAU)
  listerVehiculesAdmin,
  obtenirVehiculeAdmin,
  obtenirProprietaireVehicule,
  validerVehiculeAdmin,
  rejeterVehiculeAdmin,
  obtenirStatistiquesVehiculesAdmin
};