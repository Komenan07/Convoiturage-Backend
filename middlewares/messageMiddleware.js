// middlewares/messageMiddleware.js
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { body, param, validationResult } = require('express-validator');
const { Message } = require('../models/Message');
const Utilisateur = require('../models/Utilisateur');
const Conversation = require('../models/Conversation');
const AppError = require('../utils/AppError');

// ===========================================
// MIDDLEWARE D'AUTHENTIFICATION CORRIGÉ
// ===========================================

const authentificationRequise = async (req, res, next) => {
  try {
    // Extraction du token avec debugging
    const authHeader = req.header('Authorization');
    const cookieToken = req.cookies?.authToken;
    
    console.log('🔍 Debug Auth - Header Authorization:', authHeader ? 'Présent' : 'Absent');
    console.log('🔍 Debug Auth - Cookie authToken:', cookieToken ? 'Présent' : 'Absent');

    const token = authHeader?.replace('Bearer ', '') || cookieToken;

    if (!token) {
      console.log('❌ Aucun token fourni');
      return res.status(401).json({
        succes: false,
        erreur: 'Token d\'authentification requis',
        code: 'TOKEN_MISSING',
        debug: {
          authHeader: !!authHeader,
          cookieToken: !!cookieToken
        }
      });
    }

    console.log('🔑 Token extrait:', token.substring(0, 20) + '...');

    // Vérification de la variable JWT_SECRET
    if (!process.env.JWT_SECRET) {
      console.error('❌ JWT_SECRET non défini dans les variables d\'environnement');
      return res.status(500).json({
        succes: false,
        erreur: 'Configuration serveur incorrecte',
        code: 'JWT_SECRET_MISSING'
      });
    }

    // Décodage du token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('✅ Token décodé avec succès - ID utilisateur:', decoded.id);
    console.log('🕒 Token expires:', new Date(decoded.exp * 1000));

    // Validation de l'ID utilisateur (accepte différents formats)
    const userId = decoded.id || decoded.userId || decoded._id || decoded.user_id;
    
    if (!userId) {
      console.log('❌ Pas d\'ID utilisateur dans le token');
      console.log('Token décodé:', decoded);
      return res.status(401).json({
        succes: false,
        erreur: 'Token invalide - ID utilisateur manquant',
        code: 'INVALID_TOKEN_STRUCTURE',
        debug: {
          tokenPayload: decoded
        }
      });
    }

    // Recherche de l'utilisateur avec debugging détaillé
    console.log('🔍 Recherche utilisateur avec ID:', userId);
    
    const utilisateur = await Utilisateur.findById(userId)
      .select('-motDePasse')
      .lean(); // Optimisation avec lean()

    if (!utilisateur) {
      console.log('Utilisateur non trouvé avec ID:', userId);
      
      // Vérification si l'ID est au bon format
      const mongoose = require('mongoose');
      if (!mongoose.Types.ObjectId.isValid(userId)) {
        console.log('ID utilisateur invalide (format MongoDB)');
        return res.status(401).json({
          succes: false,
          erreur: 'Token invalide - ID utilisateur malformé',
          code: 'INVALID_USER_ID_FORMAT'
        });
      }

      return res.status(401).json({
        succes: false,
        erreur: 'Utilisateur non trouvé',
        code: 'USER_NOT_FOUND',
        debug: {
          userId: userId,
          tokenValid: true,
          userExists: false
        }
      });
    }

    console.log('✅ Utilisateur trouvé:', utilisateur.email);

    // Vérification du statut actif
    if (utilisateur.statutCompte !== 'ACTIF') {
    return res.status(403).json({
    succes: false,
    erreur: 'Compte désactivé',
     code: 'ACCOUNT_DISABLED'
    });
  }

    console.log('✅ Authentification réussie pour:', utilisateur.email);

    // Ajouter l'utilisateur à la requête avec format compatible contrôleur
    req.user = {
      id: utilisateur._id,
      email: utilisateur.email,
      nom: utilisateur.nom,
      prenom: utilisateur.prenom,
      role: utilisateur.role
    };

    // Alias pour certains middlewares
    req.utilisateur = req.user;

    next();
  } catch (error) {
    console.error('❌ Erreur authentification:', error);

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        succes: false,
        erreur: 'Token invalide',
        code: 'INVALID_TOKEN',
        debug: {
          errorMessage: error.message
        }
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        succes: false,
        erreur: 'Token expiré',
        code: 'TOKEN_EXPIRED',
        debug: {
          expiredAt: error.expiredAt
        }
      });
    }

    if (error.name === 'NotBeforeError') {
      return res.status(401).json({
        succes: false,
        erreur: 'Token pas encore valide',
        code: 'TOKEN_NOT_ACTIVE'
      });
    }

    // Erreur de base de données
    if (error.name === 'CastError') {
      return res.status(401).json({
        succes: false,
        erreur: 'ID utilisateur invalide',
        code: 'INVALID_USER_ID'
      });
    }

    return next(new AppError("Erreur d'authentification", 500, error));
  }
};

// ===========================================
// MIDDLEWARE DE VÉRIFICATION D'ACCÈS AMÉLIORÉ
// ===========================================

const verifierAccesConversation = async (req, res, next) => {
  try {
    const conversationId = req.params.conversationId || req.body.conversationId;
    const userId = req.user.id;

    console.log('🔍 Vérification accès conversation:', conversationId, 'pour utilisateur:', userId);

    if (!conversationId) {
      return res.status(400).json({
        succes: false,
        erreur: 'ID de conversation requis',
        code: 'CONVERSATION_ID_MISSING'
      });
    }

    // Validation du format de l'ID
    const mongoose = require('mongoose');
    if (!mongoose.Types.ObjectId.isValid(conversationId)) {
      return res.status(400).json({
        succes: false,
        erreur: 'Format d\'ID de conversation invalide',
        code: 'INVALID_CONVERSATION_ID_FORMAT'
      });
    }

    // Vérifier si l'utilisateur fait partie de la conversation
    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: userId
    }).lean();

    if (!conversation) {
      console.log('❌ Accès refusé à la conversation:', conversationId);
      return res.status(403).json({
        succes: false,
        erreur: 'Accès refusé à cette conversation',
        code: 'CONVERSATION_ACCESS_DENIED',
        debug: {
          conversationId,
          userId
        }
      });
    }

    console.log('✅ Accès autorisé à la conversation:', conversationId);
    req.conversation = conversation;
    next();
  } catch (error) {
    console.error('❌ Erreur vérification accès conversation:', error);
    return next(new AppError('Erreur de vérification d\'accès', 500, error));
  }
};

// ===========================================
// MIDDLEWARE DE LIMITATION DE TAUX
// ===========================================

const limiterTaux = {
  // Envoi de messages - 30 par minute (raisonnable)
  envoyerMessage: rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 30,
    message: {
      succes: false,
      erreur: 'Trop de messages envoyés',
      details: 'Limite de 30 messages par minute atteinte',
      code: 'RATE_LIMIT_EXCEEDED'
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.user?.id || req.ip,
    handler: (req, res) => {
      console.log('❌ Rate limit atteint pour envoi message:', req.user?.id || req.ip);
      res.status(429).json({
        succes: false,
        erreur: 'Trop de messages envoyés',
        details: 'Limite de 30 messages par minute atteinte',
        code: 'RATE_LIMIT_EXCEEDED'
      });
    }
  }),

  // Lecture de messages - 100 par minute
  lireMessages: rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    message: {
      succes: false,
      erreur: 'Trop de requêtes de lecture',
      details: 'Limite de 100 lectures par minute atteinte',
      code: 'RATE_LIMIT_EXCEEDED'
    },
    keyGenerator: (req) => req.user?.id || req.ip
  }),

  // Recherche - 20 par minute
  rechercherMessages: rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    message: {
      succes: false,
      erreur: 'Trop de recherches',
      details: 'Limite de 20 recherches par minute atteinte',
      code: 'RATE_LIMIT_EXCEEDED'
    },
    keyGenerator: (req) => req.user?.id || req.ip
  }),

  // Marquage lu - 50 par minute
  marquerLu: rateLimit({
    windowMs: 60 * 1000,
    max: 50,
    message: {
      succes: false,
      erreur: 'Trop de marquages de lecture',
      details: 'Limite de 50 marquages par minute atteinte',
      code: 'RATE_LIMIT_EXCEEDED'
    },
    keyGenerator: (req) => req.user?.id || req.ip
  }),

  // Signalement - 5 par heure
  signalerMessage: rateLimit({
    windowMs: 60 * 60 * 1000, // 1 heure
    max: 5,
    message: {
      succes: false,
      erreur: 'Trop de signalements',
      details: 'Limite de 5 signalements par heure atteinte',
      code: 'RATE_LIMIT_EXCEEDED'
    },
    keyGenerator: (req) => req.user?.id || req.ip
  }),

  // Suppression - 10 par heure
  supprimerMessage: rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 10,
    message: {
      succes: false,
      erreur: 'Trop de suppressions',
      details: 'Limite de 10 suppressions par heure atteinte',
      code: 'RATE_LIMIT_EXCEEDED'
    },
    keyGenerator: (req) => req.user?.id || req.ip
  }),

  // Statistiques - 20 par heure
  obtenirStatistiques: rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 20,
    message: {
      succes: false,
      erreur: 'Trop de demandes de statistiques',
      details: 'Limite de 20 demandes par heure atteinte',
      code: 'RATE_LIMIT_EXCEEDED'
    },
    keyGenerator: (req) => req.user?.id || req.ip
  }),

  // Recherche géospatiale - 15 par heure
  rechercheGeospatiale: rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 15,
    message: {
      succes: false,
      erreur: 'Trop de recherches géospatiales',
      details: 'Limite de 15 recherches géospatiales par heure atteinte',
      code: 'RATE_LIMIT_EXCEEDED'
    },
    keyGenerator: (req) => req.user?.id || req.ip
  })
};

// ===========================================
// MIDDLEWARES DE VALIDATION AMÉLIORÉS
// ===========================================

// Validation pour message texte
const validerMessage = [
  body('conversationId')
    .notEmpty()
    .withMessage('ID de conversation requis')
    .isMongoId()
    .withMessage('ID de conversation invalide'),
  
  body('destinataireId')
    .optional()
    .isMongoId()
    .withMessage('ID de destinataire invalide'),
  
  body('contenu')
    .trim()
    .isLength({ min: 1, max: 1000 })
    .withMessage('Le contenu doit contenir entre 1 et 1000 caractères')
    .matches(/^[^<>]*$/)
    .withMessage('Caractères HTML non autorisés'),
    
  // Middleware de validation des erreurs
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.log('❌ Erreurs de validation message:', errors.array());
      return res.status(400).json({
        succes: false,
        erreur: 'Erreurs de validation',
        code: 'VALIDATION_ERROR',
        details: errors.array().map(err => ({
          champ: err.path || err.param,
          valeur: err.value,
          message: err.msg
        }))
      });
    }
    console.log('✅ Validation message réussie');
    next();
  }
];

// Validation pour position GPS
const validerPosition = [
  body('conversationId')
    .notEmpty()
    .withMessage('ID de conversation requis')
    .isMongoId()
    .withMessage('ID de conversation invalide'),
  
  body('destinataireId')
    .optional()
    .isMongoId()
    .withMessage('ID de destinataire invalide'),
  
  body('longitude')
    .notEmpty()
    .withMessage('Longitude requise')
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude invalide (-180 à 180)'),
  
  body('latitude')
    .notEmpty()
    .withMessage('Latitude requise')
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude invalide (-90 à 90)'),
  
  body('contenu')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Description limitée à 200 caractères'),
    
  // Middleware de validation des erreurs
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        succes: false,
        erreur: 'Erreurs de validation',
        code: 'VALIDATION_ERROR',
        details: errors.array()
      });
    }
    next();
  }
];

// Validation pour modèle prédéfini
const validerModelePredefini = [
  body('conversationId')
    .notEmpty()
    .withMessage('ID de conversation requis')
    .isMongoId()
    .withMessage('ID de conversation invalide'),
  
  body('destinataireId')
    .optional()
    .isMongoId()
    .withMessage('ID de destinataire invalide'),
  
  body('modeleUtilise')
    .notEmpty()
    .withMessage('Modèle prédéfini requis')
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('Nom du modèle requis (1-200 caractères)')
    .isIn([
      'ARRIVEE_PROCHE', 'RETARD', 'ARRIVEE', 'PROBLEME_CIRCULATION',
      'PROBLEME_VOITURE', 'MERCI', 'LOCALISATION_DEMANDE',
      'CONFIRMATION', 'ANNULATION'
    ])
    .withMessage('Modèle prédéfini invalide'),
  
  body('contenu')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Contenu limité à 1000 caractères'),
    
  body('parametres')
    .optional()
    .isObject()
    .withMessage('Les paramètres doivent être un objet'),
    
  // Middleware de validation des erreurs
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        succes: false,
        erreur: 'Erreurs de validation',
        code: 'VALIDATION_ERROR',
        details: errors.array()
      });
    }
    next();
  }
];

// Validation pour signalement
const validerSignalement = [
  param('messageId')
    .isMongoId()
    .withMessage('ID de message invalide'),
  
  body('motif')
    .trim()
    .isLength({ min: 3, max: 500 })
    .withMessage('Motif de signalement requis (3-500 caractères)'),
    
  body('description')
    .optional()
    .trim()
    .isLength({ max: 1000 })
    .withMessage('Description limitée à 1000 caractères'),
    
  // Middleware de validation des erreurs
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        succes: false,
        erreur: 'Erreurs de validation',
        code: 'VALIDATION_ERROR',
        details: errors.array()
      });
    }
    next();
  }
];

// Validation des coordonnées GPS améliorée
const validerCoordonnees = (req, res, next) => {
  const { longitude, latitude } = req.body;
  
  if (longitude === undefined || latitude === undefined) {
    return res.status(400).json({
      succes: false,
      erreur: 'Coordonnées GPS requises',
      code: 'GPS_COORDINATES_MISSING'
    });
  }
  
  const lon = parseFloat(longitude);
  const lat = parseFloat(latitude);
  
  if (isNaN(lon) || isNaN(lat)) {
    return res.status(400).json({
      succes: false,
      erreur: 'Coordonnées GPS invalides',
      code: 'GPS_COORDINATES_INVALID'
    });
  }
  
  if (lon < -180 || lon > 180 || lat < -90 || lat > 90) {
    return res.status(400).json({
      succes: false,
      erreur: 'Coordonnées GPS hors limites',
      code: 'GPS_COORDINATES_OUT_OF_RANGE',
      details: 'Longitude: -180 à 180, Latitude: -90 à 90'
    });
  }
  
  next();
};

// ===========================================
// MIDDLEWARE DE SÉCURITÉ
// ===========================================

const verifierProprietaireMessage = async (req, res, next) => {
  try {
    const { messageId } = req.params;
    const userId = req.user.id;

    if (!messageId) {
      return res.status(400).json({
        succes: false,
        erreur: 'ID de message requis',
        code: 'MESSAGE_ID_MISSING'
      });
    }

    const message = await Message.findOne({
      _id: messageId,
      expediteurId: userId
    }).lean();

    if (!message) {
      return res.status(403).json({
        succes: false,
        erreur: 'Accès refusé',
        details: 'Vous ne pouvez modifier que vos propres messages',
        code: 'MESSAGE_ACCESS_DENIED'
      });
    }

    req.message = message;
    next();
  } catch (error) {
    console.error('❌ Erreur vérification propriétaire:', error);
    return next(new AppError('Erreur de vérification', 500, error));
  }
};

const verifierStatutUtilisateur = async (req, res, next) => {
  try {
    const userId = req.user.id;
    
    // Vérifier si l'utilisateur est toujours actif
    const utilisateur = await Utilisateur.findById(userId).lean();
    
    if (!utilisateur || !utilisateur.estActif) {
      return res.status(403).json({
        succes: false,
        erreur: 'Compte inactif',
        details: 'Votre compte a été désactivé',
        code: 'ACCOUNT_INACTIVE'
      });
    }

    // Vérifier si l'utilisateur est suspendu
    if (utilisateur.estSuspendu && utilisateur.finSuspension && utilisateur.finSuspension > new Date()) {
      return res.status(403).json({
        succes: false,
        erreur: 'Compte suspendu',
        details: `Votre compte est suspendu jusqu'au ${utilisateur.finSuspension.toLocaleDateString()}`,
        code: 'ACCOUNT_SUSPENDED',
        finSuspension: utilisateur.finSuspension
      });
    }

    next();
  } catch (error) {
    console.error('❌ Erreur vérification statut utilisateur:', error);
    return next(new AppError('Erreur de vérification du statut', 500, error));
  }
};

// ===========================================
// MIDDLEWARE DE FILTRAGE DE CONTENU
// ===========================================

const filtrerContenu = (req, res, next) => {
  const motsInterdits = [
    'spam', 'scam', 'arnaque', 'virus', 'malware', 'hack', 'pirate',
    'viagra', 'casino', 'loterie', 'gagnant', 'urgent', 'gratuit'
  ];

  const { contenu } = req.body;
  
  if (contenu && typeof contenu === 'string') {
    const contenuMinuscule = contenu.toLowerCase();
    const motTrouve = motsInterdits.find(mot => contenuMinuscule.includes(mot));
    
    if (motTrouve) {
      console.log('❌ Contenu filtré - mot interdit:', motTrouve);
      return res.status(400).json({
        succes: false,
        erreur: 'Contenu inapproprié détecté',
        details: 'Votre message contient du contenu non autorisé',
        code: 'CONTENT_FILTERED'
      });
    }
  }

  next();
};

// ===========================================
// MIDDLEWARE D'ADMINISTRATION
// ===========================================

const middlewareAdmin = (req, res, next) => {
  if (!req.user || (req.user.role !== 'ADMIN' && req.user.role !== 'MODERATEUR')) {
    return res.status(403).json({
      succes: false,
      erreur: 'Accès administrateur requis',
      code: 'ADMIN_ACCESS_REQUIRED'
    });
  }
  next();
};

const middlewareModerateur = (req, res, next) => {
  const rolesAutorises = ['ADMIN', 'MODERATEUR'];
  if (!req.user || !rolesAutorises.includes(req.user.role)) {
    return res.status(403).json({
      succes: false,
      erreur: 'Accès modérateur requis',
      code: 'MODERATOR_ACCESS_REQUIRED'
    });
  }
  next();
};

// ===========================================
// MIDDLEWARE DE LOGGING AMÉLIORÉ
// ===========================================

const loggerActiviteMessage = (action) => {
  return (req, res, next) => {
    const startTime = Date.now();
    
    // Logger au début de la requête
    console.log(`📝 [${new Date().toISOString()}] ${action} - Utilisateur: ${req.user?.id} - IP: ${req.ip}`);
    
    // Logger à la fin de la requête
    const originalSend = res.send;
    res.send = function(data) {
      const duration = Date.now() - startTime;
      const statusEmoji = res.statusCode >= 400 ? '❌' : '✅';
      
      console.log(`${statusEmoji} [${new Date().toISOString()}] ${action} terminé - Durée: ${duration}ms - Status: ${res.statusCode}`);
      
      // Si erreur, logger les détails
      if (res.statusCode >= 400) {
        try {
          const errorData = typeof data === 'string' ? JSON.parse(data) : data;
          console.error(`❌ Erreur ${action}:`, errorData);
        } catch (parseError) {
          console.error(`❌ Erreur ${action} (données non parsables):`, data);
        }
      }
      
      originalSend.call(this, data);
    };
    
    next();
  };
};

// ===========================================
// MIDDLEWARE DE DIAGNOSTIC
// ===========================================

const diagnosticAuth = (req, res, next) => {
  console.log('🔍 === DIAGNOSTIC AUTHENTIFICATION ===');
  console.log('Headers:', {
    authorization: req.headers.authorization ? 'Présent' : 'Absent',
    'content-type': req.headers['content-type']
  });
  console.log('Cookies:', req.cookies ? Object.keys(req.cookies) : 'Aucun');
  console.log('Body keys:', req.body ? Object.keys(req.body) : 'Aucun');
  console.log('Params:', req.params);
  console.log('Query:', req.query);
  console.log('User après auth:', req.user ? 'Présent' : 'Absent');
  console.log('========================================');
  next();
};

// ===========================================
// EXPORTS
// ===========================================

module.exports = {
  // Authentification et autorisation
  authentificationRequise,
  verifierAccesConversation,
  verifierProprietaireMessage,
  verifierStatutUtilisateur,
  middlewareAdmin,
  middlewareModerateur,
  
  // Limitation de taux
  limiterTaux,
  
  // Validation
  validerMessage,
  validerPosition,
  validerModelePredefini,
  validerSignalement,
  validerCoordonnees,
  
  // Sécurité et filtrage
  filtrerContenu,
  
  // Utilitaires
  loggerActiviteMessage,
  diagnosticAuth
};