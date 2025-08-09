// routes/utilisateurs.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const Utilisateur = require('../models/Utilisateur');
const { auth, authOptional } = require('../middleware/auth');
const { admin, superAdmin, ownerOrAdmin } = require('../middleware/admin');
const { validationResult, body, param, query } = require('express-validator');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

// Middleware de validation des erreurs - DÉFINI EN PREMIER
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Erreurs de validation',
      errors: errors.array()
    });
  }
  next();
};

// Ajoutez ces lignes au début de votre fichier routes/utilisateur.js pour debug
// MAINTENANT QUE handleValidationErrors EST DÉFINIE
console.log('Type of auth:', typeof auth);
console.log('Type of admin:', typeof admin);
console.log('Type of handleValidationErrors:', typeof handleValidationErrors);
console.log('Auth function:', auth);
console.log('Admin function:', admin);

// Vérifiez aussi que vos imports sont corrects :
console.log('body function:', typeof body);
console.log('param function:', typeof param);
console.log('query function:', typeof query);

// Configuration multer pour l'upload des fichiers
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = file.fieldname === 'photoProfil' ? 'uploads/profils/' : 'uploads/documents/';
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  },
  fileFilter: function (req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|pdf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Type de fichier non autorisé'));
    }
  }
});

// Rate limiting
const createAccountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 3, // 3 tentatives par IP
  message: 'Trop de tentatives de création de compte'
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Trop de tentatives de connexion'
});

// ================================
// CRUD OPERATIONS - CREATE
// ================================

/**
 * @route POST /api/utilisateurs/inscription
 * @desc Inscription d'un nouvel utilisateur
 * @access Public
 */
router.post('/inscription', 
  createAccountLimiter,
  [
    body('email').isEmail().withMessage('Email invalide'),
    body('telephone').matches(/^(\+225)?[0-9]{8,10}$/).withMessage('Numéro de téléphone invalide'),
    body('motDePasse').isLength({ min: 8 }).matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .withMessage('Mot de passe doit contenir au moins 8 caractères, une majuscule, une minuscule et un chiffre'),
    body('nom').isLength({ min: 2, max: 50 }).withMessage('Nom entre 2 et 50 caractères'),
    body('prenom').isLength({ min: 2, max: 50 }).withMessage('Prénom entre 2 et 50 caractères'),
    body('dateNaissance').isISO8601().withMessage('Date de naissance invalide'),
    body('sexe').isIn(['M', 'F']).withMessage('Sexe doit être M ou F'),
    body('adresse.commune').notEmpty().withMessage('Commune requise'),
    body('adresse.quartier').notEmpty().withMessage('Quartier requis')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { email, telephone } = req.body;

      // Vérifier si l'utilisateur existe déjà
      const utilisateurExistant = await Utilisateur.findOne({
        $or: [{ email }, { telephone }]
      });

      if (utilisateurExistant) {
        return res.status(400).json({
          success: false,
          message: 'Un utilisateur avec cet email ou téléphone existe déjà'
        });
      }

      // Créer le nouvel utilisateur
      const utilisateur = new Utilisateur(req.body);
      await utilisateur.save();

      // Retourner les données sans le mot de passe
      const utilisateurReponse = utilisateur.toObject();
      delete utilisateurReponse.motDePasse;

      res.status(201).json({
        success: true,
        message: 'Inscription réussie',
        data: utilisateurReponse
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de l\'inscription',
        error: error.message
      });
    }
  }
);

/**
 * @route POST /api/utilisateurs/connexion
 * @desc Connexion utilisateur
 * @access Public
 */
router.post('/connexion',
  loginLimiter,
  [
    body('identifiant').notEmpty().withMessage('Email ou téléphone requis'),
    body('motDePasse').notEmpty().withMessage('Mot de passe requis')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { identifiant, motDePasse } = req.body;

      // Trouver l'utilisateur par email ou téléphone
      const utilisateur = await Utilisateur.findOne({
        $or: [{ email: identifiant }, { telephone: identifiant }]
      }).select('+motDePasse');

      if (!utilisateur) {
        return res.status(401).json({
          success: false,
          message: 'Identifiants incorrects'
        });
      }

      // Vérifier si l'utilisateur peut se connecter
      const peutSeConnecter = utilisateur.peutSeConnecter();
      if (!peutSeConnecter.autorise) {
        return res.status(423).json({
          success: false,
          message: peutSeConnecter.raison,
          deblocageA: peutSeConnecter.deblocageA
        });
      }

      // Vérifier le mot de passe
      const motDePasseValide = await utilisateur.verifierMotDePasse(motDePasse);
      if (!motDePasseValide) {
        await utilisateur.incrementerTentativesEchouees();
        return res.status(401).json({
          success: false,
          message: 'Identifiants incorrects'
        });
      }

      // Mettre à jour la dernière connexion
      await utilisateur.mettreAJourDerniereConnexion();

      // Générer le token JWT (à implémenter selon votre système d'auth)
      const token = generateJWT(utilisateur._id);

      res.json({
        success: true,
        message: 'Connexion réussie',
        data: {
          utilisateur: {
            id: utilisateur._id,
            email: utilisateur.email,
            nomComplet: utilisateur.nomComplet,
            statutCompte: utilisateur.statutCompte
          },
          token
        }
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la connexion',
        error: error.message
      });
    }
  }
);
/**
 * @route POST /api/utilisateurs/:id/photo
 * @desc Upload photo de profil
 * @access Private
 */
router.post('/:id/photo',
  auth,
  [
    param('id').isMongoId().withMessage('ID utilisateur invalide')
  ],
  handleValidationErrors,
  upload.single('photoProfil'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'Aucun fichier fourni'
        });
      }

      const utilisateur = await Utilisateur.findByIdAndUpdate(
        req.params.id,
        { photoProfil: `/uploads/profils/${req.file.filename}` },
        { new: true }
      );

      if (!utilisateur) {
        return res.status(404).json({
          success: false,
          message: 'Utilisateur non trouvé'
        });
      }

      res.json({
        success: true,
        message: 'Photo de profil mise à jour',
        data: {
          photoProfil: utilisateur.photoProfil
        }
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de l\'upload',
        error: error.message
      });
    }
  }
);
/**
 * @route POST /api/utilisateurs/:id/document
 * @desc Upload document d'identité
 * @access Private
 */
router.post('/:id/document',
  auth,
  [
    param('id').isMongoId().withMessage('ID utilisateur invalide'),
    body('type').isIn(['CNI', 'PASSEPORT']).withMessage('Type de document invalide'),
    body('numero').notEmpty().withMessage('Numéro de document requis')
  ],
  handleValidationErrors,
  upload.single('photoDocument'),
  async (req, res) => {
    try {
      const { type, numero } = req.body;
      
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'Photo du document requise'
        });
      }

      const utilisateur = await Utilisateur.findByIdAndUpdate(
        req.params.id,
        {
          'documentIdentite.type': type,
          'documentIdentite.numero': numero,
          'documentIdentite.photoDocument': `/uploads/documents/${req.file.filename}`,
          'documentIdentite.statutVerification': 'EN_ATTENTE'
        },
        { new: true }
      );

      if (!utilisateur) {
        return res.status(404).json({
          success: false,
          message: 'Utilisateur non trouvé'
        });
      }

      res.json({
        success: true,
        message: 'Document d\'identité ajouté avec succès',
        data: {
          documentIdentite: utilisateur.documentIdentite
        }
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de l\'ajout du document',
        error: error.message
      });
    }
  }
);

// ================================
// CRUD OPERATIONS - READ
// ================================

/**
 * @route GET /api/utilisateurs/profil/:id
 * @desc Obtenir le profil complet d'un utilisateur
 * @access Private
 */
router.get('/profil/:id',
  auth,
  [param('id').isMongoId().withMessage('ID utilisateur invalide')],
  handleValidationErrors,
  async (req, res) => {
    try {
      const utilisateur = await Utilisateur.findById(req.params.id)
        .populate('documentIdentite.verificateurId', 'nom prenom')
        .populate('historiqueStatuts.administrateurId', 'nom prenom');

      if (!utilisateur) {
        return res.status(404).json({
          success: false,
          message: 'Utilisateur non trouvé'
        });
      }

      res.json({
        success: true,
        data: utilisateur
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération du profil',
        error: error.message
      });
    }
  }
);

/**
 * @route GET /api/utilisateurs/public/:id
 * @desc Obtenir le profil public d'un utilisateur
 * @access Public
 */
router.get('/public/:id',
  [param('id').isMongoId().withMessage('ID utilisateur invalide')],
  handleValidationErrors,
  async (req, res) => {
    try {
      const utilisateur = await Utilisateur.findById(req.params.id)
        .select('prenom photoProfil scoreConfiance noteGenerale badges nombreTrajetsEffectues preferences.conversation preferences.musique preferences.climatisation');

      if (!utilisateur) {
        return res.status(404).json({
          success: false,
          message: 'Utilisateur non trouvé'
        });
      }

      res.json({
        success: true,
        data: utilisateur
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération du profil public',
        error: error.message
      });
    }
  }
);

/**
 * @route GET /api/utilisateurs/recherche
 * @desc Rechercher des utilisateurs par critères
 * @access Private
 */
router.get('/recherche',
  auth,
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page doit être un entier positif'),
    query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limite entre 1 et 50'),
    query('longitude').optional().isFloat().withMessage('Longitude invalide'),
    query('latitude').optional().isFloat().withMessage('Latitude invalide'),
    query('rayon').optional().isFloat({ min: 0.1, max: 100 }).withMessage('Rayon entre 0.1 et 100 km')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;

      let query = { statutCompte: 'ACTIF' };
      let utilisateursQuery;

      // Recherche par proximité géographique
      if (req.query.longitude && req.query.latitude) {
        const rayon = parseFloat(req.query.rayon) || 10;
        utilisateursQuery = Utilisateur.rechercherParProximite(
          parseFloat(req.query.longitude),
          parseFloat(req.query.latitude),
          rayon
        );
      } else {
        utilisateursQuery = Utilisateur.find(query);
      }

      // Filtres additionnels
      if (req.query.nom) {
        query.nom = new RegExp(req.query.nom, 'i');
      }
      if (req.query.commune) {
        query['adresse.commune'] = new RegExp(req.query.commune, 'i');
      }
      if (req.query.scoreMin) {
        query.scoreConfiance = { $gte: parseInt(req.query.scoreMin) };
      }

      const utilisateurs = await utilisateursQuery
        .find(query)
        .select('prenom nom photoProfil scoreConfiance noteGenerale badges nombreTrajetsEffectues adresse.commune adresse.quartier')
        .skip(skip)
        .limit(limit)
        .sort({ scoreConfiance: -1, noteGenerale: -1 });

      const total = await Utilisateur.countDocuments(query);

      res.json({
        success: true,
        data: {
          utilisateurs,
          pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit)
          }
        }
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la recherche',
        error: error.message
      });
    }
  }
);

/**
 * @route GET /api/utilisateurs/:id/statistiques
 * @desc Obtenir les statistiques d'un utilisateur
 * @access Private
 */
router.get('/:id/statistiques',
  auth,
  [param('id').isMongoId().withMessage('ID utilisateur invalide')],
  handleValidationErrors,
  async (req, res) => {
    try {
      const utilisateur = await Utilisateur.findById(req.params.id);

      if (!utilisateur) {
        return res.status(404).json({
          success: false,
          message: 'Utilisateur non trouvé'
        });
      }

      const statistiques = {
        scoreConfiance: utilisateur.scoreConfiance,
        noteGenerale: utilisateur.noteGenerale,
        nombreTrajetsEffectues: utilisateur.nombreTrajetsEffectues,
        nombreTrajetsAnnules: utilisateur.nombreTrajetsAnnules,
        tauxAnnulation: utilisateur.tauxAnnulation,
        badges: utilisateur.badges,
        age: utilisateur.age,
        anciennete: Math.floor((Date.now() - utilisateur.dateInscription.getTime()) / (1000 * 60 * 60 * 24)),
        estVerifie: utilisateur.estVerifie,
        estDocumentVerifie: utilisateur.estDocumentVerifie
      };

      res.json({
        success: true,
        data: statistiques
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des statistiques',
        error: error.message
      });
    }
  }
);

/**
 * @route GET /api/utilisateurs/statistiques/globales
 * @desc Obtenir les statistiques globales des utilisateurs
 * @access Admin
 */
router.get('/statistiques/globales',
  auth,
  admin,
  async (req, res) => {
    try {
      const statistiques = await Utilisateur.statistiquesGlobales();

      res.json({
        success: true,
        data: statistiques
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des statistiques',
        error: error.message
      });
    }
  }
);

// ================================
// CRUD OPERATIONS - UPDATE
// ================================

/**
 * @route PUT /api/utilisateurs/:id/informations
 * @desc Modifier les informations personnelles
 * @access Private
 */
router.put('/:id/informations',
  auth,
  [
    param('id').isMongoId().withMessage('ID utilisateur invalide'),
    body('nom').optional().isLength({ min: 2, max: 50 }).withMessage('Nom entre 2 et 50 caractères'),
    body('prenom').optional().isLength({ min: 2, max: 50 }).withMessage('Prénom entre 2 et 50 caractères'),
    body('dateNaissance').optional().isISO8601().withMessage('Date de naissance invalide'),
    body('sexe').optional().isIn(['M', 'F']).withMessage('Sexe doit être M ou F')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const champsAutorisés = ['nom', 'prenom', 'dateNaissance', 'sexe'];
      const miseAJour = {};

      // Filtrer les champs autorisés
      champsAutorisés.forEach(champ => {
        if (req.body[champ] !== undefined) {
          miseAJour[champ] = req.body[champ];
        }
      });

      const utilisateur = await Utilisateur.findByIdAndUpdate(
        req.params.id,
        miseAJour,
        { new: true, runValidators: true }
      );

      if (!utilisateur) {
        return res.status(404).json({
          success: false,
          message: 'Utilisateur non trouvé'
        });
      }

      res.json({
        success: true,
        message: 'Informations mises à jour avec succès',
        data: utilisateur
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la mise à jour',
        error: error.message
      });
    }
  }
);

/**
 * @route PUT /api/utilisateurs/:id/adresse
 * @desc Modifier l'adresse et la localisation
 * @access Private
 */
router.put('/:id/adresse',
  auth,
  [
    param('id').isMongoId().withMessage('ID utilisateur invalide'),
    body('commune').optional().notEmpty().withMessage('Commune requise'),
    body('quartier').optional().notEmpty().withMessage('Quartier requis'),
    body('ville').optional().notEmpty().withMessage('Ville requise'),
    body('longitude').optional().isFloat({ min: -180, max: 180 }).withMessage('Longitude invalide'),
    body('latitude').optional().isFloat({ min: -90, max: 90 }).withMessage('Latitude invalide')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { commune, quartier, ville, longitude, latitude } = req.body;
      const miseAJour = {};

      if (commune) miseAJour['adresse.commune'] = commune;
      if (quartier) miseAJour['adresse.quartier'] = quartier;
      if (ville) miseAJour['adresse.ville'] = ville;

      if (longitude !== undefined && latitude !== undefined) {
        miseAJour['adresse.coordonnees'] = {
          type: 'Point',
          coordinates: [longitude, latitude]
        };
      }

      const utilisateur = await Utilisateur.findByIdAndUpdate(
        req.params.id,
        miseAJour,
        { new: true, runValidators: true }
      );

      if (!utilisateur) {
        return res.status(404).json({
          success: false,
          message: 'Utilisateur non trouvé'
        });
      }

      res.json({
        success: true,
        message: 'Adresse mise à jour avec succès',
        data: {
          adresse: utilisateur.adresse
        }
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la mise à jour de l\'adresse',
        error: error.message
      });
    }
  }
);

/**
 * @route PUT /api/utilisateurs/:id/preferences
 * @desc Modifier les préférences utilisateur
 * @access Private
 */
router.put('/:id/preferences',
  auth,
  [
    param('id').isMongoId().withMessage('ID utilisateur invalide'),
    body('musique').optional().isBoolean().withMessage('Musique doit être boolean'),
    body('climatisation').optional().isBoolean().withMessage('Climatisation doit être boolean'),
    body('conversation').optional().isIn(['BAVARD', 'CALME', 'NEUTRE']).withMessage('Préférence conversation invalide'),
    body('languePreferee').optional().isIn(['FR', 'ANG']).withMessage('Langue préférée invalide')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { musique, climatisation, conversation, languePreferee } = req.body;
      const miseAJour = {};

      if (musique !== undefined) miseAJour['preferences.musique'] = musique;
      if (climatisation !== undefined) miseAJour['preferences.climatisation'] = climatisation;
      if (conversation) miseAJour['preferences.conversation'] = conversation;
      if (languePreferee) miseAJour['preferences.languePreferee'] = languePreferee;

      const utilisateur = await Utilisateur.findByIdAndUpdate(
        req.params.id,
        miseAJour,
        { new: true, runValidators: true }
      );

      if (!utilisateur) {
        return res.status(404).json({
          success: false,
          message: 'Utilisateur non trouvé'
        });
      }

      res.json({
        success: true,
        message: 'Préférences mises à jour avec succès',
        data: {
          preferences: utilisateur.preferences
        }
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la mise à jour des préférences',
        error: error.message
      });
    }
  }
);

/**
 * @route PUT /api/utilisateurs/:id/contacts-urgence
 * @desc Modifier les contacts d'urgence
 * @access Private
 */
router.put('/:id/contacts-urgence',
  auth,
  [
    param('id').isMongoId().withMessage('ID utilisateur invalide'),
    body('contactsUrgence').isArray().withMessage('Contacts d\'urgence doit être un tableau'),
    body('contactsUrgence.*.nom').notEmpty().withMessage('Nom du contact requis'),
    body('contactsUrgence.*.telephone').matches(/^(\+225)?[0-9]{8,10}$/).withMessage('Téléphone du contact invalide'),
    body('contactsUrgence.*.relation').isIn(['FAMILLE', 'AMI', 'COLLEGUE']).withMessage('Relation invalide')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const utilisateur = await Utilisateur.findByIdAndUpdate(
        req.params.id,
        { contactsUrgence: req.body.contactsUrgence },
        { new: true, runValidators: true }
      );

      if (!utilisateur) {
        return res.status(404).json({
          success: false,
          message: 'Utilisateur non trouvé'
        });
      }

      res.json({
        success: true,
        message: 'Contacts d\'urgence mis à jour avec succès',
        data: {
          contactsUrgence: utilisateur.contactsUrgence
        }
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la mise à jour des contacts d\'urgence',
        error: error.message
      });
    }
  }
);

/**
 * @route PUT /api/utilisateurs/:id/mot-de-passe
 * @desc Changer le mot de passe
 * @access Private
 */
router.put('/:id/mot-de-passe',
  auth,
  [
    param('id').isMongoId().withMessage('ID utilisateur invalide'),
    body('motDePasseActuel').notEmpty().withMessage('Mot de passe actuel requis'),
    body('nouveauMotDePasse').isLength({ min: 8 }).matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .withMessage('Nouveau mot de passe doit contenir au moins 8 caractères, une majuscule, une minuscule et un chiffre')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { motDePasseActuel, nouveauMotDePasse } = req.body;

      const utilisateur = await Utilisateur.findById(req.params.id).select('+motDePasse');
      if (!utilisateur) {
        return res.status(404).json({
          success: false,
          message: 'Utilisateur non trouvé'
        });
      }

      // Vérifier l'ancien mot de passe
      const motDePasseValide = await utilisateur.verifierMotDePasse(motDePasseActuel);
      if (!motDePasseValide) {
        return res.status(400).json({
          success: false,
          message: 'Mot de passe actuel incorrect'
        });
      }

      // Mettre à jour le mot de passe
      utilisateur.motDePasse = nouveauMotDePasse;
      await utilisateur.save();

      res.json({
        success: true,
        message: 'Mot de passe modifié avec succès'
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors du changement de mot de passe',
        error: error.message
      });
    }
  }
);

// ================================
// CRUD OPERATIONS - DELETE
// ================================

/**
 * @route DELETE /api/utilisateurs/:id
 * @desc Supprimer un compte (soft delete)
 * @access Private
 */
router.delete('/:id',
  auth,
  [param('id').isMongoId().withMessage('ID utilisateur invalide')],
  handleValidationErrors,
  async (req, res) => {
    try {
      const utilisateur = await Utilisateur.findById(req.params.id);
      
      if (!utilisateur) {
        return res.status(404).json({
          success: false,
          message: 'Utilisateur non trouvé'
        });
      }

      const utilisateurModifie = await Utilisateur.findByIdAndUpdate(
        req.params.id,
        {
          statutCompte: 'BLOQUE',
          email: `deleted_${Date.now()}_${utilisateur.email}`, 
          telephone: `deleted_${Date.now()}_${utilisateur.telephone}` 
        },
        { new: true }
      );

      res.json({
        success: true,
        message: 'Compte supprimé avec succès'
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la suppression du compte',
        error: error.message
      });
    }
  }
);

/**
 * @route DELETE /api/utilisateurs/:id/photo
 * @desc Supprimer la photo de profil
 * @access Private
 */
router.delete('/:id/photo',
  auth,
  [param('id').isMongoId().withMessage('ID utilisateur invalide')],
  handleValidationErrors,
  async (req, res) => {
    try {
      const utilisateur = await Utilisateur.findByIdAndUpdate(
        req.params.id,
        { $unset: { photoProfil: 1 } },
        { new: true }
      );

      if (!utilisateur) {
        return res.status(404).json({
          success: false,
          message: 'Utilisateur non trouvé'
        });
      }

      res.json({
        success: true,
        message: 'Photo de profil supprimée avec succès'
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la suppression de la photo',
        error: error.message
      });
    }
  }
);

// ================================
// ACTIONS SPÉCIALISÉES
// ================================

/**
 * @route POST /api/utilisateurs/:id/verification
 * @desc Vérification d'identité par un administrateur
 * @access Admin
 */
router.post('/:id/verification',
  auth,
  admin,
  [
    param('id').isMongoId().withMessage('ID utilisateur invalide'),
    body('statut').isIn(['VERIFIE', 'REJETE']).withMessage('Statut de vérification invalide'),
    body('raisonRejet').optional().notEmpty().withMessage('Raison de rejet requise si rejeté')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { statut, raisonRejet } = req.body;
      const administrateurId = req.user.id; // Supposant que l'ID admin est dans req.user

      const miseAJour = {
        'documentIdentite.statutVerification': statut,
        'documentIdentite.dateVerification': new Date(),
        'documentIdentite.verificateurId': administrateurId
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
        return res.status(404).json({
          success: false,
          message: 'Utilisateur non trouvé'
        });
      }

      res.json({
        success: true,
        message: `Document ${statut === 'VERIFIE' ? 'vérifié' : 'rejeté'} avec succès`,
        data: {
          documentIdentite: utilisateur.documentIdentite,
          estVerifie: utilisateur.estVerifie,
          statutCompte: utilisateur.statutCompte
        }
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la vérification',
        error: error.message
      });
    }
  }
);

/**
 * @route POST /api/utilisateurs/:id/score-confiance
 * @desc Calcul automatique du score de confiance
 * @access System/Admin
 */
router.post('/:id/score-confiance',
  auth,
  admin,
  [param('id').isMongoId().withMessage('ID utilisateur invalide')],
  handleValidationErrors,
  async (req, res) => {
    try {
      const utilisateur = await Utilisateur.findById(req.params.id);
      
      if (!utilisateur) {
        return res.status(404).json({
          success: false,
          message: 'Utilisateur non trouvé'
        });
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
      if (utilisateur.noteGenerale >= 4) score += 10;
      else if (utilisateur.noteGenerale >= 3) score += 5;

      // Facteurs négatifs
      if (utilisateur.tauxAnnulation > 20) score -= 15;
      else if (utilisateur.tauxAnnulation > 10) score -= 10;
      else if (utilisateur.tauxAnnulation > 5) score -= 5;

      // Ancienneté du compte
      const ancienneteJours = Math.floor((Date.now() - utilisateur.dateInscription.getTime()) / (1000 * 60 * 60 * 24));
      if (ancienneteJours > 365) score += 10;
      else if (ancienneteJours > 90) score += 5;

      // S'assurer que le score reste dans les limites
      score = Math.max(0, Math.min(100, score));

      utilisateur.scoreConfiance = score;
      await utilisateur.save({ validateBeforeSave: false });

      res.json({
        success: true,
        message: 'Score de confiance recalculé',
        data: {
          scoreConfiance: score,
          facteurs: {
            documentVerifie: utilisateur.estDocumentVerifie,
            photoProfil: !!utilisateur.photoProfil,
            contactsUrgence: utilisateur.contactsUrgence.length,
            trajetsEffectues: utilisateur.nombreTrajetsEffectues,
            noteGenerale: utilisateur.noteGenerale,
            tauxAnnulation: utilisateur.tauxAnnulation,
            ancienneteJours
          }
        }
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors du calcul du score',
        error: error.message
      });
    }
  }
);

/**
 * @route PUT /api/utilisateurs/:id/statistiques-trajet
 * @desc Mise à jour des statistiques de trajet
 * @access System
 */
router.put('/:id/statistiques-trajet',
  auth, // Middleware pour vérifier que c'est un appel système autorisé
  [
    param('id').isMongoId().withMessage('ID utilisateur invalide'),
    body('action').isIn(['COMPLETE', 'ANNULE']).withMessage('Action invalide'),
    body('note').optional().isFloat({ min: 0, max: 5 }).withMessage('Note entre 0 et 5')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { action, note } = req.body;
      const utilisateur = await Utilisateur.findById(req.params.id);

      if (!utilisateur) {
        return res.status(404).json({
          success: false,
          message: 'Utilisateur non trouvé'
        });
      }

      if (action === 'COMPLETE') {
        utilisateur.nombreTrajetsEffectues += 1;
        
        // Mise à jour de la note générale (moyenne pondérée)
        if (note !== undefined) {
          const totalNotes = utilisateur.nombreTrajetsEffectues;
          const ancienneMoyenne = utilisateur.noteGenerale || 0;
          utilisateur.noteGenerale = ((ancienneMoyenne * (totalNotes - 1)) + note) / totalNotes;
        }
      } else if (action === 'ANNULE') {
        utilisateur.nombreTrajetsAnnules += 1;
      }

      await utilisateur.save({ validateBeforeSave: false });

      // Recalculer automatiquement le score de confiance
      // (Appel interne à l'algorithme de calcul)

      res.json({
        success: true,
        message: 'Statistiques mises à jour',
        data: {
          nombreTrajetsEffectues: utilisateur.nombreTrajetsEffectues,
          nombreTrajetsAnnules: utilisateur.nombreTrajetsAnnules,
          tauxAnnulation: utilisateur.tauxAnnulation,
          noteGenerale: utilisateur.noteGenerale
        }
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la mise à jour des statistiques',
        error: error.message
      });
    }
  }
);

/**
 * @route POST /api/utilisateurs/:id/badges
 * @desc Gestion des badges utilisateur
 * @access System/Admin
 */
router.post('/:id/badges',
  auth,
  [
    param('id').isMongoId().withMessage('ID utilisateur invalide'),
    body('action').isIn(['AJOUTER', 'SUPPRIMER']).withMessage('Action invalide'),
    body('badge').isIn([
      'PONCTUEL', 'PROPRE', 'SYMPATHIQUE', 'CONDUCTEUR_SECURISE',
      'COMMUNICATIF', 'RESPECTUEUX', 'ECO_CONDUITE', 'NOUVEAU',
      'VETERAN', 'TOP_RATED'
    ]).withMessage('Badge invalide')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { action, badge } = req.body;
      const utilisateur = await Utilisateur.findById(req.params.id);

      if (!utilisateur) {
        return res.status(404).json({
          success: false,
          message: 'Utilisateur non trouvé'
        });
      }

      if (action === 'AJOUTER') {
        await utilisateur.ajouterBadge(badge);
      } else {
        await utilisateur.supprimerBadge(badge);
      }

      res.json({
        success: true,
        message: `Badge ${action === 'AJOUTER' ? 'ajouté' : 'supprimé'} avec succès`,
        data: {
          badges: utilisateur.badges
        }
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la gestion du badge',
        error: error.message
      });
    }
  }
);

/**
 * @route POST /api/utilisateurs/:id/statut
 * @desc Blocage/déblocage de compte
 * @access Admin
 */
router.post('/:id/statut',
  auth,
  admin,
  [
    param('id').isMongoId().withMessage('ID utilisateur invalide'),
    body('nouveauStatut').isIn(['ACTIF', 'SUSPENDU', 'BLOQUE']).withMessage('Statut invalide'),
    body('raison').notEmpty().withMessage('Raison requise')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { nouveauStatut, raison } = req.body;
      const administrateurId = req.user.id;

      const utilisateur = await Utilisateur.findById(req.params.id);
      if (!utilisateur) {
        return res.status(404).json({
          success: false,
          message: 'Utilisateur non trouvé'
        });
      }

      await utilisateur.changerStatut(nouveauStatut, raison, administrateurId);

      res.json({
        success: true,
        message: `Compte ${nouveauStatut.toLowerCase()} avec succès`,
        data: {
          statutCompte: utilisateur.statutCompte,
          historiqueStatuts: utilisateur.historiqueStatuts.slice(-5) // 5 derniers changements
        }
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors du changement de statut',
        error: error.message
      });
    }
  }
);

/**
 * @route POST /api/utilisateurs/mot-de-passe-oublie
 * @desc Demande de réinitialisation de mot de passe
 * @access Public
 */
router.post('/mot-de-passe-oublie',
  [body('email').isEmail().withMessage('Email invalide')],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { email } = req.body;
      const utilisateur = await Utilisateur.findOne({ email });

      if (!utilisateur) {
        // Ne pas révéler si l'email existe ou non
        return res.json({
          success: true,
          message: 'Si cet email existe, vous recevrez un lien de réinitialisation'
        });
      }

      // Générer un token de réinitialisation
      const resetToken = crypto.randomBytes(32).toString('hex');
      const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

      utilisateur.tokenResetMotDePasse = hashedToken;
      utilisateur.expirationTokenReset = Date.now() + 10 * 60 * 1000; // 10 minutes
      await utilisateur.save({ validateBeforeSave: false });

      // Ici, vous devriez envoyer un email avec le lien de réinitialisation
      // const lienReset = `${req.protocol}://${req.get('host')}/reset-password/${resetToken}`;
      // await envoyerEmailReset(utilisateur.email, lienReset);

      res.json({
        success: true,
        message: 'Email de réinitialisation envoyé'
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la demande de réinitialisation',
        error: error.message
      });
    }
  }
);

/**
 * @route POST /api/utilisateurs/reset-mot-de-passe/:token
 * @desc Réinitialisation du mot de passe
 * @access Public
 */
router.post('/reset-mot-de-passe/:token',
  [
    param('token').notEmpty().withMessage('Token requis'),
    body('nouveauMotDePasse').isLength({ min: 8 }).matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .withMessage('Mot de passe doit contenir au moins 8 caractères, une majuscule, une minuscule et un chiffre')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { nouveauMotDePasse } = req.body;
      const hashedToken = crypto.createHash('sha256').update(req.params.token).digest('hex');

      const utilisateur = await Utilisateur.findOne({
        tokenResetMotDePasse: hashedToken,
        expirationTokenReset: { $gt: Date.now() }
      });

      if (!utilisateur) {
        return res.status(400).json({
          success: false,
          message: 'Token invalide ou expiré'
        });
      }

      // Réinitialiser le mot de passe
      utilisateur.motDePasse = nouveauMotDePasse;
      utilisateur.tokenResetMotDePasse = undefined;
      utilisateur.expirationTokenReset = undefined;
      utilisateur.tentativesConnexionEchouees = 0;
      utilisateur.compteBloqueTempJusqu = undefined;

      await utilisateur.save();

      res.json({
        success: true,
        message: 'Mot de passe réinitialisé avec succès'
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la réinitialisation',
        error: error.message
      });
    }
  }
);

/**
 * @route GET /api/utilisateurs/proximite
 * @desc Rechercher des utilisateurs à proximité
 * @access Private
 */
router.get('/proximite',
  auth,
  [
    query('longitude').isFloat().withMessage('Longitude requise'),
    query('latitude').isFloat().withMessage('Latitude requise'),
    query('rayon').optional().isFloat({ min: 0.1, max: 50 }).withMessage('Rayon entre 0.1 et 50 km')
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { longitude, latitude, rayon = 10 } = req.query;

      const utilisateurs = await Utilisateur.rechercherParProximite(
        parseFloat(longitude),
        parseFloat(latitude),
        parseFloat(rayon)
      ).select('prenom photoProfil scoreConfiance noteGenerale badges adresse.commune adresse.quartier');

      res.json({
        success: true,
        data: {
          utilisateurs,
          criteres: {
            longitude: parseFloat(longitude),
            latitude: parseFloat(latitude),
            rayon: parseFloat(rayon)
          }
        }
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la recherche de proximité',
        error: error.message
      });
    }
  }
);

// Fonction utilitaire pour générer un JWT (à adapter selon votre implémentation)
function generateJWT(userId) {
  const jwt = require('jsonwebtoken');
  return jwt.sign(
    { userId },
    process.env.JWT_SECRET || 'your-secret-key',
    { expiresIn: process.env.JWT_EXPIRE || '7d' }
  );
}

// Middleware d'erreur global pour cette route
router.use((error, req, res, next) => {
  // Erreurs de validation Mongoose
  if (error.name === 'ValidationError') {
    const errors = Object.values(error.errors).map(err => err.message);
    return res.status(400).json({
      success: false,
      message: 'Erreurs de validation',
      errors
    });
  }

  // Erreurs de duplication (email/téléphone)
  if (error.code === 11000) {
    const field = Object.keys(error.keyValue)[0];
    return res.status(400).json({
      success: false,
      message: `${field} déjà utilisé`
    });
  }

  // Erreurs Multer (upload de fichiers)
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'Fichier trop volumineux (max 5MB)'
      });
    }
  }

  res.status(500).json({
    success: false,
    message: 'Erreur serveur interne',
    error: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
});

module.exports = router;