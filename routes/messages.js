// routes/messageRoutes.js
const express = require('express');
const router = express.Router();
const MessageController = require('../controllers/messageController');
const { 
  verifierAccesConversation,
  limiterTaux,
  validerMessage,
  validerPosition,
  validerModelePredefini,
  validerSignalement
} = require('../middlewares/messageMiddleware');

<<<<<<< HEAD
const {protect:authentificationRequise } = require('../middlewares/authMiddleware');
=======
const {protect : authentificationRequise} = require('../middlewares/authMiddleware')
>>>>>>> 95519eb28bd9451922d648c82967dc486ccebaf0

// ===========================================
// ROUTES CREATE - Création de messages
// ===========================================

// POST /api/messages/texte - Envoyer message texte
router.post('/texte',
  authentificationRequise,
  limiterTaux.envoyerMessage,
  validerMessage,
  MessageController.envoyerMessageTexte
);

// POST /api/messages/position - Envoyer position GPS
router.post('/position',
  authentificationRequise,
  limiterTaux.envoyerMessage,
  validerPosition,
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
router.get('/conversation/:conversationId',
  authentificationRequise,
  verifierAccesConversation,
  limiterTaux.lireMessages,
  MessageController.obtenirMessagesConversation
);

// GET /api/messages/recherche - Rechercher dans les messages
router.get('/recherche',
  authentificationRequise,
  limiterTaux.rechercherMessages,
  MessageController.rechercherMessages
);

// GET /api/messages/non-lus - Obtenir messages non lus
router.get('/non-lus',
  authentificationRequise,
  limiterTaux.lireMessages,
  MessageController.obtenirMessagesNonLus
);

// GET /api/messages/statistiques - Obtenir statistiques utilisateur
router.get('/statistiques',
  authentificationRequise,
  limiterTaux.obtenirStatistiques,
  MessageController.obtenirStatistiques
);

// GET /api/messages/proximite - Recherche géospatiale
router.get('/proximite',
  authentificationRequise,
  limiterTaux.rechercheGeospatiale,
  MessageController.rechercherMessagesProximite
);

// ===========================================
// ROUTES UPDATE - Modification de messages
// ===========================================

// PUT /api/messages/:messageId/lu - Marquer message comme lu
router.put('/:messageId/lu',
  authentificationRequise,
  limiterTaux.marquerLu,
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
  MessageController.signalerMessage
);

// ===========================================
// ROUTES DELETE - Suppression de messages
// ===========================================

// DELETE /api/messages/:messageId - Supprimer message
router.delete('/:messageId',
  authentificationRequise,
  limiterTaux.supprimerMessage,
  MessageController.supprimerMessage
);

// ===========================================
// ROUTES ADMIN - Administration (optionnel)
// ===========================================

// GET /api/messages/admin/signales - Messages signalés (admin seulement)
router.get('/admin/signales',
  authentificationRequise,
  // middlewareAdmin,
  MessageController.obtenirMessagesSignales
);

// PUT /api/messages/admin/:messageId/moderer - Modérer message (admin seulement)
router.put('/admin/:messageId/moderer',
  authentificationRequise,
  // middlewareAdmin,
  MessageController.modererMessage
);

// ===========================================
// ROUTES WebSocket - Temps réel (optionnel)
// ===========================================

// POST /api/messages/websocket/rejoindre - Rejoindre une conversation en temps réel
router.post('/websocket/rejoindre',
  authentificationRequise,
  MessageController.rejoindreSalleWebSocket
);

// POST /api/messages/websocket/quitter - Quitter une conversation en temps réel
router.post('/websocket/quitter',
  authentificationRequise,
  MessageController.quitterSalleWebSocket
);

// ===========================================
// GESTION D'ERREURS
// ===========================================

// Middleware de gestion d'erreurs pour les routes de messages
router.use((err, req, res, next) => {
  console.error('Erreur route message:', err);
  
  // Erreur de validation
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
      details: 'Format d\'identifiant incorrect'
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
  
  // Erreur générique
  return next(err);
});

// Route non trouvée
router.use('*', (req, res) => {
  res.status(404).json({
    succes: false,
    erreur: 'Route non trouvée',
    details: `La route ${req.method} ${req.originalUrl} n'existe pas`
  });
});

module.exports = router;