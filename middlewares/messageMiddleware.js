// middlewares/messageMiddleware.js
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { body, param,  validationResult } = require('express-validator');
const { Message } = require('../models/Message');
const Utilisateur = require('../models/Utilisateur');
const AppError = require('../utils/AppError');
const { securityLogger } = require('../utils/logger');
const Conversation = require('../models/Conversation');

// ===========================================
// MIDDLEWARE D'AUTHENTIFICATION
// ===========================================

const authentificationRequise = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '') || 
                  req.cookies?.authToken;

    if (!token) {
      return next(AppError.tokenMissing());
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Récupérer l'utilisateur complet
    const utilisateur = await Utilisateur.findById(decoded.id)
      .select('-motDePasse')
      .populate('conversations', '_id nom');

    if (!utilisateur) {
      return next(AppError.userNotFound({ tokenUserId: decoded.id }));
    }

    if (!utilisateur.estActif) {
      securityLogger.warn('Accès conversation refusé - Compte désactivé', {
        event: 'account_disabled',
        userId: utilisateur._id,
        statut: 'INACTIF',
        ip: req.ip,
        endpoint: `${req.method} ${req.originalUrl}`
      });
      return next(AppError.accountDisabled({ userId: utilisateur._id, statut: 'INACTIF' }));
    }

    // Ajouter l'utilisateur à la requête
    req.utilisateur = {
      id: utilisateur._id,
      email: utilisateur.email,
      nom: utilisateur.nom,
      prenom: utilisateur.prenom,
      role: utilisateur.role,
      conversations: utilisateur.conversations.map(c => c._id.toString())
    };
    // Alias de compatibilité avec certains contrôleurs
    req.user = { id: req.utilisateur.id, role: req.utilisateur.role };

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return next(AppError.invalidToken());
    }
    if (error.name === 'TokenExpiredError') {
      return next(AppError.tokenExpired());
    }
    return next(AppError.serverError("Erreur d'authentification", { originalError: error.message }));
  }
};

// ===========================================
// MIDDLEWARE DE VÉRIFICATION D'ACCÈS
// ===========================================

const verifierAccesConversation = async (req, res, next) => {
  try {
    const { conversationId } = req.params;
    const utilisateurId = req.utilisateur.id || req.user.id;

    // Vérifier si l'utilisateur fait partie de la conversation
    const conversation = await Conversation.findOne({
      _id: conversationId,
      participants: utilisateurId
    });

    if (!conversation) {
      return res.status(403).json({
        succes: false,
        erreur: 'Accès refusé à cette conversation',
        code: 'CONVERSATION_ACCESS_DENIED'
      });
    }

    req.conversation = conversation;
    next();
  } catch (error) {
    console.error('Erreur vérification accès conversation:', error);
    return next(AppError.serverError('Erreur de vérification d\'accès', { originalError: error.message }));
  }
};

// ===========================================
// MIDDLEWARE DE LIMITATION DE TAUX - CORRIGÉ IPv6
// ===========================================

const limiterTaux = {
  // Envoi de messages - 60 par minute
  envoyerMessage: rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 60,
    message: {
      succes: false,
      erreur: 'Trop de messages envoyés',
      details: 'Limite de 60 messages par minute atteinte'
    },
    standardHeaders: true,
    legacyHeaders: false,
    // ✅ CORRIGÉ: Supprime keyGenerator pour utiliser le comportement par défaut sécurisé IPv6
    keyGenerator: undefined // Utilise le keyGenerator par défaut qui gère IPv6
  }),

  // Lecture de messages - 200 par minute
  lireMessages: rateLimit({
    windowMs: 60 * 1000,
    max: 200,
    message: {
      succes: false,
      erreur: 'Trop de requêtes de lecture',
      details: 'Limite de 200 lectures par minute atteinte'
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: undefined
  }),

  // Recherche - 30 par minute
  rechercherMessages: rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    message: {
      succes: false,
      erreur: 'Trop de recherches',
      details: 'Limite de 30 recherches par minute atteinte'
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: undefined
  }),

  // Marquage lu - 100 par minute
  marquerLu: rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    message: {
      succes: false,
      erreur: 'Trop de marquages de lecture',
      details: 'Limite de 100 marquages par minute atteinte'
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: undefined
  }),

  // Signalement - 10 par heure
  signalerMessage: rateLimit({
    windowMs: 60 * 60 * 1000, // 1 heure
    max: 10,
    message: {
      succes: false,
      erreur: 'Trop de signalements',
      details: 'Limite de 10 signalements par heure atteinte'
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: undefined
  }),

  // Suppression - 20 par heure
  supprimerMessage: rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 20,
    message: {
      succes: false,
      erreur: 'Trop de suppressions',
      details: 'Limite de 20 suppressions par heure atteinte'
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: undefined
  }),

  // Statistiques - 30 par heure
  obtenirStatistiques: rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 30,
    message: {
      succes: false,
      erreur: 'Trop de demandes de statistiques',
      details: 'Limite de 30 demandes par heure atteinte'
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: undefined
  }),

  // Recherche géospatiale - 20 par heure
  rechercheGeospatiale: rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 20,
    message: {
      succes: false,
      erreur: 'Trop de recherches géospatiales',
      details: 'Limite de 20 recherches géospatiales par heure atteinte'
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: undefined
  })
};

// ===========================================
// MIDDLEWARES DE VALIDATION
// ===========================================

// Validation pour message texte
const validerMessage = [
  body('conversationId')
    .isMongoId()
    .withMessage('ID de conversation invalide'),
  
  body('destinataireId')
    .isMongoId()
    .withMessage('ID de destinataire invalide'),
  
  body('contenu')
    .trim()
    .isLength({ min: 1, max: 1000 })
    .withMessage('Le contenu doit contenir entre 1 et 1000 caractères')
    .matches(/^[^<>]*$/)
    .withMessage('Caractères HTML non autorisés'),
];

// Validation pour position GPS
const validerPosition = [
  body('conversationId')
    .isMongoId()
    .withMessage('ID de conversation invalide'),
  
  body('destinataireId')
    .isMongoId()
    .withMessage('ID de destinataire invalide'),
  
  body('longitude')
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude invalide (-180 à 180)'),
  
  body('latitude')
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude invalide (-90 à 90)'),
  
  body('contenu')
    .optional()
    .trim()
    .isLength({ max: 200 })
    .withMessage('Description limitée à 200 caractères'),
];

// Validation pour modèle prédéfini
const validerModelePredefini = [
  body('conversationId')
    .isMongoId()
    .withMessage('ID de conversation invalide'),
  
  body('destinataireId')
    .isMongoId()
    .withMessage('ID de destinataire invalide'),
  
  body('modeleUtilise')
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('Nom du modèle requis (1-200 caractères)')
    .matches(/^[a-zA-Z0-9_-]+$/)
    .withMessage('Nom de modèle invalide (lettres, chiffres, _ et - seulement)'),
  
  body('contenu')
    .trim()
    .isLength({ min: 1, max: 1000 })
    .withMessage('Contenu requis (1-1000 caractères)'),
];

// Validation pour signalement
const validerSignalement = [
  param('messageId')
    .isMongoId()
    .withMessage('ID de message invalide'),
  
  body('motifSignalement')
    .trim()
    .isLength({ min: 5, max: 500 })
    .withMessage('Motif de signalement requis (5-500 caractères)')
    .isIn(['SPAM', 'HARCELEMENT', 'CONTENU_INAPPROPRIE', 'VIOLENCE', 'AUTRE'])
    .withMessage('Motif de signalement invalide'),
];

// ===========================================
// MIDDLEWARE DE VALIDATION DE FICHIERS
// ===========================================

const validerFichierImage = (req, res, next) => {
  if (!req.file) {
    return next();
  }

  // Vérifier le type de fichier
  const typesAutorises = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
  if (!typesAutorises.includes(req.file.mimetype)) {
    return res.status(400).json({
      succes: false,
      erreur: 'Type de fichier non autorisé',
      details: 'Seuls les fichiers JPEG, PNG, GIF et WebP sont acceptés'
    });
  }

  // Vérifier la taille (5MB max)
  const tailleLimite = 5 * 1024 * 1024; // 5MB
  if (req.file.size > tailleLimite) {
    return res.status(400).json({
      succes: false,
      erreur: 'Fichier trop volumineux',
      details: 'La taille maximale autorisée est de 5MB'
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
    const utilisateurId = req.utilisateur.id || req.user.id;

    const message = await Message.findOne({
      _id: messageId,
      expediteurId: utilisateurId
    });

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
    console.error('Erreur vérification propriétaire:', error);
    return next(AppError.serverError('Erreur de vérification', { originalError: error.message }));
  }
};

const verifierStatutUtilisateur = async (req, res, next) => {
  try {
    const utilisateurId = req.utilisateur.id || req.user.id;
    
    // Vérifier si l'utilisateur est toujours actif
    const utilisateur = await Utilisateur.findById(utilisateurId);
    
    if (!utilisateur || !utilisateur.estActif) {
      return res.status(403).json({
        succes: false,
        erreur: 'Compte inactif',
        details: 'Votre compte a été désactivé',
        code: 'ACCOUNT_INACTIVE'
      });
    }

    // Vérifier si l'utilisateur est suspendu
    if (utilisateur.estSuspendu && utilisateur.finSuspension > new Date()) {
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
    console.error('Erreur vérification statut utilisateur:', error);
    return next(AppError.serverError('Erreur de vérification du statut', { originalError: error.message }));
  }
};

// ===========================================
// MIDDLEWARE DE FILTRAGE DE CONTENU
// ===========================================

const filtrerContenu = (req, res, next) => {
  // Liste de mots interdits (à adapter selon vos besoins)
  const motsInterdits = [
    'spam', 'scam', 'arnaque', 'virus', 'malware',
    // Ajoutez d'autres mots selon vos règles
  ];

  const { contenu } = req.body;
  
  if (contenu) {
    const contenuMinuscule = contenu.toLowerCase();
    const motTrouve = motsInterdits.find(mot => contenuMinuscule.includes(mot));
    
    if (motTrouve) {
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
// MIDDLEWARE DE LOGGING
// ===========================================

const loggerActiviteMessage = (action) => {
  return (req, res, next) => {
    const startTime = Date.now();
    
    // Logger au début de la requête
    console.log(`[${new Date().toISOString()}] ${action} - Utilisateur: ${req.utilisateur?.id} - IP: ${req.ip}`);
    
    // Logger à la fin de la requête
    const originalSend = res.send;
    res.send = function(data) {
      const duration = Date.now() - startTime;
      console.log(`[${new Date().toISOString()}] ${action} terminé - Durée: ${duration}ms - Status: ${res.statusCode}`);
      
      // Si erreur, logger les détails
      if (res.statusCode >= 400) {
        console.error(`Erreur ${action}:`, data);
      }
      
      originalSend.call(this, data);
    };
    
    next();
  };
};

// ===========================================
// MIDDLEWARE D'ADMINISTRATION
// ===========================================

const middlewareAdmin = (req, res, next) => {
  if (req.utilisateur.role !== 'ADMIN' && req.utilisateur.role !== 'MODERATEUR') {
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
  if (!rolesAutorises.includes(req.utilisateur.role)) {
    return res.status(403).json({
      succes: false,
      erreur: 'Accès modérateur requis',
      code: 'MODERATOR_ACCESS_REQUIRED'
    });
  }
  next();
};

// ===========================================
// MIDDLEWARE DE CACHE
// ===========================================

const cacheMiddleware = (duree = 300) => { // 5 minutes par défaut
  const cache = new Map();
  
  return (req, res, next) => {
    // Créer une clé de cache unique
    const cleCache = `${req.utilisateur.id || req.user.id}-${req.originalUrl}-${JSON.stringify(req.query)}`;
    
    // Vérifier si la réponse est en cache
    const donneesCache = cache.get(cleCache);
    if (donneesCache && (Date.now() - donneesCache.timestamp < duree * 1000)) {
      return res.json(donneesCache.data);
    }
    
    // Intercepter la réponse pour la mettre en cache
    const originalSend = res.send;
    res.send = function(data) {
      if (res.statusCode === 200) {
        cache.set(cleCache, {
          data: JSON.parse(data),
          timestamp: Date.now()
        });
        
        // Nettoyer le cache périodiquement
        if (cache.size > 1000) {
          const cleASupprimer = cache.keys().next().value;
          cache.delete(cleASupprimer);
        }
      }
      
      originalSend.call(this, data);
    };
    
    next();
  };
};

// ===========================================
// MIDDLEWARE DE VALIDATION AVANCÉE
// ===========================================

const validerRequeteComplete = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    return res.status(400).json({
      succes: false,
      erreur: 'Erreurs de validation',
      details: errors.array().map(err => ({
        champ: err.path || err.param,
        valeur: err.value,
        message: err.msg
      })),
      code: 'VALIDATION_ERROR'
    });
  }
  
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
  validerFichierImage,
  validerRequeteComplete,
  
  // Sécurité
  filtrerContenu,
  
  // Utilitaires
  loggerActiviteMessage,
  cacheMiddleware
};