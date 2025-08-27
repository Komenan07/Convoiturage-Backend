// routes/message.js
const express = require('express');
const router = express.Router();
const MessageController = require('../controllers/messageController');
const { 
  authentificationRequise,
  verifierAccesConversation,
  limiterTaux,
  validerMessage,
  validerPosition,
  validerModelePredefini,
  validerSignalement,
  validerCoordonnees,
} = require('../middlewares/messageMiddleware');

// ===========================================
// MIDDLEWARE DE DEBUG GLOBAL (TEMPORAIRE)
// ===========================================
router.use((req, res, next) => {
  console.log('\n=== DEBUG ROUTE MESSAGE ===');
  console.log('Timestamp:', new Date().toISOString());
  console.log('Method:', req.method);
  console.log('URL:', req.originalUrl);
  console.log('IP:', req.ip);
  console.log('Headers Authorization:', req.headers.authorization ? 'PRESENT' : 'ABSENT');
  if (req.headers.authorization) {
    console.log('Authorization Preview:', req.headers.authorization.substring(0, 30) + '...');
  }
  console.log('Content-Type:', req.headers['content-type']);
  console.log('Body keys:', Object.keys(req.body || {}));
  console.log('============================\n');
  next();
});

// ===========================================
// ROUTES CREATE - Création de messages
// ===========================================

// POST /api/messages/texte - Envoyer message texte
router.post('/texte',
  // 1. Debug des données reçues
  (req, res, next) => {
    console.log('STEP 1: Avant authentification');
    console.log('Body complet:', JSON.stringify(req.body, null, 2));
    next();
  },
  
  // 2. Authentification avec debug
  (req, res, next) => {
    console.log('STEP 2: Début authentification');
    next();
  },
  authentificationRequise,
  (req, res, next) => {
    console.log('STEP 3: Après authentification');
    console.log('req.user:', req.user ? 'DEFINI' : 'NON DEFINI');
    if (req.user) {
      console.log('User ID:', req.user.id);
      console.log('User Email:', req.user.email);
    }
    next();
  },
  
  // 3. Rate limiting
  limiterTaux.envoyerMessage,
  
  // 4. Validation
  validerMessage,
  
  // 5. Contrôleur
  (req, res, next) => {
    console.log('STEP 4: Avant contrôleur');
    next();
  },
  MessageController.envoyerMessageTexte
);

// POST /api/messages/position - Envoyer position GPS
router.post('/position',
  authentificationRequise,
  limiterTaux.envoyerMessage,
  validerPosition,
  validerCoordonnees,
  MessageController.envoyerPosition
);

// POST /api/messages/modele - Utiliser modèle prédéfini
router.post('/modele',
  authentificationRequise,
  limiterTaux.envoyerMessage,
  validerModelePredefini,
  MessageController.utiliserModelePredefini
);

// ===========================================
// ROUTES READ - Lecture de messages
// ===========================================

// GET /api/messages/conversation/:conversationId - Obtenir messages d'une conversation
// Supporte les paramètres: page, limite, depuisDate (alignés avec le service)
router.get('/conversation/:conversationId',
  authentificationRequise,
  verifierAccesConversation,
  limiterTaux.lireMessages,
  MessageController.obtenirMessagesConversation
);

// GET /api/messages/recherche - Rechercher dans les messages
// Paramètres: q (terme de recherche), page, limite, typeMessage
router.get('/recherche',
  authentificationRequise,
  limiterTaux.rechercherMessages,
  (req, res, next) => {
    // Validation du terme de recherche
    if (!req.query.q || req.query.q.length < 2) {
      return res.status(400).json({
        succes: false,
        erreur: 'Le paramètre "q" est requis et doit contenir au moins 2 caractères'
      });
    }
    next();
  },
  MessageController.rechercherMessages
);

// GET /api/messages/non-lus - Obtenir messages non lus
router.get('/non-lus',
  authentificationRequise,
  limiterTaux.lireMessages,
  MessageController.obtenirMessagesNonLus
);

// GET /api/messages/statistiques - Obtenir statistiques utilisateur
// Paramètre optionnel: periode (nombre de jours, par défaut 30)
router.get('/statistiques',
  authentificationRequise,
  limiterTaux.obtenirStatistiques,
  MessageController.obtenirStatistiques
);

// GET /api/messages/proximite - Recherche géospatiale
// Paramètres requis: longitude, latitude
// Paramètre optionnel: rayon (en km, par défaut 10)
router.get('/proximite',
  authentificationRequise,
  limiterTaux.rechercheGeospatiale,
  (req, res, next) => {
    // Validation des coordonnées requises
    const { longitude, latitude } = req.query;
    if (!longitude || !latitude) {
      return res.status(400).json({
        succes: false,
        erreur: 'Les paramètres longitude et latitude sont requis'
      });
    }
    
    const lon = parseFloat(longitude);
    const lat = parseFloat(latitude);
    
    if (isNaN(lon) || isNaN(lat) || lon < -180 || lon > 180 || lat < -90 || lat > 90) {
      return res.status(400).json({
        succes: false,
        erreur: 'Coordonnées invalides'
      });
    }
    
    next();
  },
  MessageController.rechercherMessagesProximite
);

// ===========================================
// ROUTE DE TEST (TEMPORAIRE)
// ===========================================

router.get('/test-auth', 
  (req, res, next) => {
    console.log('TEST AUTH - Headers:', req.headers.authorization ? 'PRESENT' : 'ABSENT');
    next();
  },
  authentificationRequise,
  (req, res) => {
    console.log('TEST AUTH - User après auth:', req.user ? 'DEFINI' : 'NON DEFINI');
    res.json({
      succes: true,
      message: 'Authentification réussie !',
      utilisateur: {
        id: req.user.id,
        email: req.user.email,
        nom: req.user.nom,
        prenom: req.user.prenom
      }
    });
  }
);

// ===========================================
// ROUTES UPDATE - Modification de messages
// ===========================================

// PUT /api/messages/:messageId/lu - Marquer message comme lu
router.put('/:messageId/lu',
  authentificationRequise,
  limiterTaux.marquerLu,
  (req, res, next) => {
    // Validation de l'ID du message
    const { messageId } = req.params;
    if (!messageId || !/^[0-9a-fA-F]{24}$/.test(messageId)) {
      return res.status(400).json({
        succes: false,
        erreur: 'ID de message invalide'
      });
    }
    next();
  },
  MessageController.marquerCommeLu
);

// PUT /api/messages/conversation/:conversationId/lu - Marquer conversation comme lue
router.put('/conversation/:conversationId/lu',
  authentificationRequise,
  verifierAccesConversation,
  limiterTaux.marquerLu,
  MessageController.marquerConversationCommeLue
);

// PUT /api/messages/:messageId/signaler - Signaler message
router.put('/:messageId/signaler',
  authentificationRequise,
  limiterTaux.signalerMessage,
  validerSignalement,
  (req, res, next) => {
    // Validation de l'ID du message
    const { messageId } = req.params;
    if (!messageId || !/^[0-9a-fA-F]{24}$/.test(messageId)) {
      return res.status(400).json({
        succes: false,
        erreur: 'ID de message invalide'
      });
    }
    
    // Validation du motif de signalement
    const { motif } = req.body;
    if (!motif || motif.length < 3) {
      return res.status(400).json({
        succes: false,
        erreur: 'Le motif de signalement est requis (minimum 3 caractères)'
      });
    }
    
    next();
  },
  MessageController.signalerMessage
);

// ===========================================
// ROUTES DELETE - Suppression de messages
// ===========================================

// DELETE /api/messages/:messageId - Supprimer message
router.delete('/:messageId',
  authentificationRequise,
  limiterTaux.supprimerMessage,
  (req, res, next) => {
    // Validation de l'ID du message
    const { messageId } = req.params;
    if (!messageId || !/^[0-9a-fA-F]{24}$/.test(messageId)) {
      return res.status(400).json({
        succes: false,
        erreur: 'ID de message invalide'
      });
    }
    next();
  },
  MessageController.supprimerMessage
);

// ===========================================
// ROUTES ADMIN - Administration
// ===========================================

// GET /api/messages/admin/signales - Messages signalés (admin seulement)
router.get('/admin/signales',
  authentificationRequise,
  // middlewareAdmin, // À décommenter quand le middleware admin sera disponible
  (req, res, next) => {
    // Validation des paramètres de pagination
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    
    if (page < 1 || limit < 1 || limit > 100) {
      return res.status(400).json({
        succes: false,
        erreur: 'Paramètres de pagination invalides'
      });
    }
    
    next();
  },
  MessageController.obtenirMessagesSignales
);

// PUT /api/messages/admin/:messageId/moderer - Modérer message (admin seulement)
router.put('/admin/:messageId/moderer',
  authentificationRequise,
  // middlewareAdmin, // À décommenter quand le middleware admin sera disponible
  (req, res, next) => {
    // Validation de l'ID du message
    const { messageId } = req.params;
    if (!messageId || !/^[0-9a-fA-F]{24}$/.test(messageId)) {
      return res.status(400).json({
        succes: false,
        erreur: 'ID de message invalide'
      });
    }
    
    // Validation de l'action de modération
    const { action } = req.body;
    const actionsValides = ['APPROVE', 'DELETE', 'WARN'];
    
    if (!action || !actionsValides.includes(action)) {
      return res.status(400).json({
        succes: false,
        erreur: 'Action de modération invalide. Actions valides: APPROVE, DELETE, WARN'
      });
    }
    
    next();
  },
  MessageController.modererMessage
);

// ===========================================
// ROUTES WebSocket - Temps réel
// ===========================================

// POST /api/messages/websocket/rejoindre - Rejoindre une conversation en temps réel
router.post('/websocket/rejoindre',
  authentificationRequise,
  (req, res, next) => {
    // Validation de l'ID de conversation
    const { conversationId } = req.body;
    if (!conversationId || !/^[0-9a-fA-F]{24}$/.test(conversationId)) {
      return res.status(400).json({
        succes: false,
        erreur: 'ID de conversation invalide'
      });
    }
    next();
  },
  MessageController.rejoindreSalleWebSocket
);

// POST /api/messages/websocket/quitter - Quitter une conversation en temps réel
router.post('/websocket/quitter',
  authentificationRequise,
  (req, res, next) => {
    // Validation de l'ID de conversation
    const { conversationId } = req.body;
    if (!conversationId || !/^[0-9a-fA-F]{24}$/.test(conversationId)) {
      return res.status(400).json({
        succes: false,
        erreur: 'ID de conversation invalide'
      });
    }
    next();
  },
  MessageController.quitterSalleWebSocket
);

// ===========================================
// ROUTES UTILITAIRES - Basées sur le service
// ===========================================

// GET /api/messages/modeles - Obtenir la liste des modèles prédéfinis disponibles
router.get('/modeles',
  authentificationRequise,
  (req, res) => {
    const modeles = {
      'ARRIVEE_PROCHE': {
        nom: 'Arrivée proche',
        description: 'Indiquer que vous arrivez bientôt',
        parametres: ['minutes']
      },
      'RETARD': {
        nom: 'Retard',
        description: 'Signaler un retard',
        parametres: ['minutes']
      },
      'ARRIVEE': {
        nom: 'Arrivée',
        description: 'Confirmer votre arrivée'
      },
      'PROBLEME_CIRCULATION': {
        nom: 'Problème de circulation',
        description: 'Signaler des embouteillages'
      },
      'PROBLEME_VOITURE': {
        nom: 'Problème de voiture',
        description: 'Signaler un problème technique'
      },
      'MERCI': {
        nom: 'Remerciement',
        description: 'Remercier après le voyage'
      },
      'LOCALISATION_DEMANDE': {
        nom: 'Demande de localisation',
        description: 'Demander la position de l\'autre personne'
      },
      'CONFIRMATION': {
        nom: 'Confirmation',
        description: 'Confirmer le rendez-vous'
      },
      'ANNULATION': {
        nom: 'Annulation',
        description: 'Annuler le voyage'
      }
    };

    res.json({
      succes: true,
      data: modeles
    });
  }
);

// GET /api/messages/types - Obtenir les types de messages supportés
router.get('/types',
  authentificationRequise,
  (req, res) => {
    const types = [
      {
        code: 'TEXTE',
        nom: 'Message texte',
        description: 'Message texte classique'
      },
      {
        code: 'POSITION',
        nom: 'Position GPS',
        description: 'Partage de localisation'
      },
      {
        code: 'MODELE_PREDEFINI',
        nom: 'Modèle prédéfini',
        description: 'Message basé sur un modèle prédéfini'
      }
    ];

    res.json({
      succes: true,
      data: types
    });
  }
);

// ===========================================
// GESTION D'ERREURS
// ===========================================

// Middleware de gestion d'erreurs pour les routes de messages
router.use((err, req, res, next) => {
  console.error('Erreur route message:', err);
  
  // Erreur de validation MongoDB
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      succes: false,
      erreur: 'Erreur de validation',
      details: Object.values(err.errors).map(e => e.message)
    });
  }
  
  // Erreur de cast (ID MongoDB invalide)
  if (err.name === 'CastError') {
    return res.status(400).json({
      succes: false,
      erreur: 'ID invalide',
      details: 'Format d\'identifiant MongoDB incorrect'
    });
  }
  
  // Erreur de limite de taux
  if (err.status === 429) {
    return res.status(429).json({
      succes: false,
      erreur: 'Trop de requêtes',
      details: 'Veuillez patienter avant de réessayer',
      retryAfter: err.retryAfter
    });
  }
  
  // Erreur d'autorisation
  if (err.status === 403) {
    return res.status(403).json({
      succes: false,
      erreur: 'Accès refusé',
      details: err.message || 'Vous n\'avez pas l\'autorisation d\'accéder à cette ressource'
    });
  }
  
  // Erreur de ressource non trouvée
  if (err.status === 404) {
    return res.status(404).json({
      succes: false,
      erreur: 'Ressource non trouvée',
      details: err.message || 'La ressource demandée n\'existe pas'
    });
  }
  
  // Erreur générique - passer au middleware d'erreurs global
  return next(err);
});

// Route catch-all pour les routes non définies
router.use('*', (req, res) => {
  res.status(404).json({
    succes: false,
    erreur: 'Route non trouvée',
    details: `La route ${req.method} ${req.originalUrl} n'existe pas`,
    routesDisponibles: {
      'POST /api/messages/texte': 'Envoyer un message texte',
      'POST /api/messages/position': 'Partager une position GPS',
      'POST /api/messages/modele': 'Utiliser un modèle prédéfini',
      'GET /api/messages/conversation/:id': 'Obtenir les messages d\'une conversation',
      'GET /api/messages/recherche': 'Rechercher dans les messages',
      'GET /api/messages/non-lus': 'Obtenir les messages non lus',
      'GET /api/messages/statistiques': 'Obtenir les statistiques',
      'GET /api/messages/proximite': 'Recherche géospatiale',
      'GET /api/messages/modeles': 'Liste des modèles prédéfinis',
      'GET /api/messages/types': 'Types de messages supportés'
    }
  });
});

module.exports = router;