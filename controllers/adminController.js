// =====================================================
// CONTRÔLEUR ADMINISTRATEUR - Version corrigée
// =====================================================

const Administrateur = require('../models/Administrateur');
const User = require('../models/Utilisateur');
const Vehicule = require('../models/Vehicule');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

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

/**
 * Valider le passage d'un utilisateur en conducteur (ADMIN UNIQUEMENT)
 * VÉRIFIE TOUS LES CRITÈRES REQUIS AVANT VALIDATION
 */
const validerPassageConducteur = async (req, res, next) => {
  try {
    const { utilisateurId } = req.params;
    const { approuve, commentaire } = req.body;

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

    // ===== SI REFUS, PAS BESOIN DE VÉRIFIER LES CRITÈRES =====
    if (!approuve) {
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

      // TODO: Envoyer notification email/SMS
      
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
    
    if (erreursCritiques.length > 0) {
      logger.warn('⚠️ Tentative validation avec erreurs critiques', {
        userId: utilisateur._id,
        adminId: req.user.id,  // ✅ CORRIGÉ
        nombreErreurs: erreursCritiques.length
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
          contactUtilisateur: true
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

    // TODO: Envoyer notification email/SMS de validation
    
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
module.exports = {
  // Authentification
  connexionAdmin,
  obtenirProfil,
  validerPassageConducteur,
  listerDemandesPassageConducteur,
  
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