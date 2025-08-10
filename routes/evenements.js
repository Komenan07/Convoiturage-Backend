// ========================================
// ROUTES ÉVÉNEMENTS (/api/evenements)
// ========================================
const express = require('express');
const router = express.Router();

// Import sécurisé d'asyncHandler
let asyncHandler;
try {
  asyncHandler = require('express-async-handler');
} catch (error) {
  console.warn('⚠️ express-async-handler non trouvé, utilisation d\'une version simplifiée');
  asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// Import du contrôleur
const evenementController = require('../controllers/evenementController');

// Import sécurisé des middlewares
let auth = (req, res, next) => {
  console.warn('⚠️ Middleware auth non disponible, accès autorisé');
  req.user = { id: 'user_test_' + Date.now(), role: 'user' };
  next();
};

let upload = {
  single: (fieldName) => (req, res, next) => {
    console.warn(`⚠️ Middleware upload.single('${fieldName}') non disponible`);
    req.file = null;
    next();
  }
};

try {
  const middleware = require('../middleware');
  if (middleware.auth) auth = middleware.auth;
  if (middleware.upload) upload = middleware.upload;
  console.log('✅ Middlewares événements chargés avec succès');
} catch (error) {
  console.warn('⚠️ Middlewares non trouvés, utilisation des middlewares par défaut');
}

// =============== MIDDLEWARES DE VALIDATION ===============

// Validation des IDs MongoDB
const validerIdEvenement = (req, res, next) => {
  const { id, evenementId } = req.params;
  const idToValidate = id || evenementId;
  
  if (idToValidate && (idToValidate.length !== 24 || !/^[0-9a-fA-F]{24}$/.test(idToValidate))) {
    return res.status(400).json({
      success: false,
      message: 'Format ID événement invalide',
      id_fourni: idToValidate
    });
  }
  next();
};

// Validation des IDs de groupe
const validerIdGroupe = (req, res, next) => {
  const { groupeId } = req.params;
  if (groupeId && (groupeId.length !== 24 || !/^[0-9a-fA-F]{24}$/.test(groupeId))) {
    return res.status(400).json({
      success: false,
      message: 'Format ID groupe invalide',
      id_fourni: groupeId
    });
  }
  next();
};

// Logger spécifique aux événements
const loggerEvenements = (req, res, next) => {
  console.log(`🎉 [EVENEMENTS] ${req.method} ${req.originalUrl} - User: ${req.user?.id || 'Anonymous'}`);
  next();
};

// Validation des paramètres de proximité
const validerProximite = (req, res, next) => {
  const { longitude, latitude, rayon } = req.query;
  
  if (longitude && (isNaN(longitude) || longitude < -180 || longitude > 180)) {
    return res.status(400).json({
      success: false,
      message: 'Longitude invalide (doit être entre -180 et 180)'
    });
  }
  
  if (latitude && (isNaN(latitude) || latitude < -90 || latitude > 90)) {
    return res.status(400).json({
      success: false,
      message: 'Latitude invalide (doit être entre -90 et 90)'
    });
  }
  
  if (rayon && (isNaN(rayon) || rayon < 0 || rayon > 1000)) {
    return res.status(400).json({
      success: false,
      message: 'Rayon invalide (doit être entre 0 et 1000 km)'
    });
  }
  
  next();
};

// Appliquer le logger sur toutes les routes
router.use(loggerEvenements);

// =============== ROUTES PUBLIQUES ===============

// Obtenir les statistiques des événements (route spécifique en premier)
router.get('/statistiques', evenementController.obtenirStatistiques);

// Obtenir les événements à venir
router.get('/avenir', evenementController.obtenirEvenementsAVenir);

// Rechercher des événements par proximité géographique
router.get('/proximite', 
  validerProximite,
  evenementController.rechercherParProximite
);

// Exporter des événements
router.get('/export', evenementController.exporterEvenements);

// Obtenir tous les événements avec filtres
router.get('/', evenementController.obtenirEvenements);

// Recherche avancée d'événements
router.post('/recherche-avancee', evenementController.rechercheAvancee);

// Obtenir un événement spécifique par ID
router.get('/:id', 
  validerIdEvenement,
  evenementController.obtenirEvenement
);

// Obtenir les groupes de covoiturage d'un événement
router.get('/:id/groupes-covoiturage', 
  validerIdEvenement,
  evenementController.obtenirGroupesCovoiturage
);

// =============== ROUTES PROTÉGÉES (AUTHENTIFICATION REQUISE) ===============

// Créer un nouvel événement
router.post('/', 
  auth,
  upload.single('imageEvenement'), // Optionnel pour l'image de l'événement
  evenementController.creerEvenement
);

// Mettre à jour un événement
router.put('/:id', 
  auth,
  validerIdEvenement,
  upload.single('imageEvenement'),
  evenementController.mettreAJourEvenement
);

// Changer le statut d'un événement
router.patch('/:id/statut', 
  auth,
  validerIdEvenement,
  evenementController.changerStatut
);

// Supprimer un événement
router.delete('/:id', 
  auth,
  validerIdEvenement,
  evenementController.supprimerEvenement
);

// =============== ROUTES GROUPES DE COVOITURAGE ===============

// Ajouter un groupe de covoiturage à un événement
router.post('/:id/groupes-covoiturage', 
  auth,
  validerIdEvenement,
  evenementController.ajouterGroupeCovoiturage
);

// Supprimer un groupe de covoiturage
router.delete('/:id/groupes-covoiturage/:groupeId', 
  auth,
  validerIdEvenement,
  validerIdGroupe,
  evenementController.supprimerGroupeCovoiturage
);

// Rejoindre un groupe de covoiturage
router.post('/:id/groupes-covoiturage/:groupeId/rejoindre', 
  auth,
  validerIdEvenement,
  validerIdGroupe,
  evenementController.rejoindrGroupe
);

// Quitter un groupe de covoiturage
router.delete('/:id/groupes-covoiturage/:groupeId/quitter', 
  auth,
  validerIdEvenement,
  validerIdGroupe,
  evenementController.quitterGroupe
);

// =============== ROUTES DE TEST (DÉVELOPPEMENT) ===============

if (process.env.NODE_ENV !== 'production') {
  // Route de test pour vérifier la structure
  router.get('/test/structure', (req, res) => {
    res.json({
      success: true,
      message: 'Routes événements fonctionnelles',
      controlleur_charge: !!evenementController.creerEvenement,
      middlewares_charges: {
        auth: typeof auth === 'function',
        upload: typeof upload.single === 'function',
        asyncHandler: !!asyncHandler
      },
      routes_publiques: [
        'GET /api/evenements',
        'GET /api/evenements/a-venir',
        'GET /api/evenements/proximite',
        'GET /api/evenements/statistiques',
        'GET /api/evenements/export',
        'POST /api/evenements/recherche-avancee',
        'GET /api/evenements/:id',
        'GET /api/evenements/:id/groupes-covoiturage'
      ],
      routes_protegees: [
        'POST /api/evenements',
        'PUT /api/evenements/:id',
        'PATCH /api/evenements/:id/statut',
        'DELETE /api/evenements/:id',
        'POST /api/evenements/:id/groupes-covoiturage',
        'DELETE /api/evenements/:id/groupes-covoiturage/:groupeId',
        'POST /api/evenements/:id/groupes-covoiturage/:groupeId/rejoindre',
        'DELETE /api/evenements/:id/groupes-covoiturage/:groupeId/quitter'
      ]
    });
  });

  // Route de test pour créer un événement de démonstration
  router.post('/test/demo', auth, (req, res) => {
    const demoEvent = {
      nom: 'Événement de Test',
      description: 'Ceci est un événement de démonstration créé automatiquement',
      typeEvenement: 'SOCIAL',
      dateDebut: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // Dans 7 jours
      dateFin: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000 + 4 * 60 * 60 * 1000), // 4h plus tard
      lieu: {
        adresse: 'Cocody, Abidjan, Côte d\'Ivoire',
        ville: 'Abidjan',
        coordonnees: {
          latitude: 5.3599517,
          longitude: -3.9615917
        }
      },
      capaciteEstimee: 50,
      organisateur: req.user.id,
      tags: ['test', 'demo', 'covoiturage']
    };

    res.json({
      success: true,
      message: 'Événement de test créé (simulation)',
      data: {
        ...demoEvent,
        id: 'demo_event_' + Date.now(),
        statutEvenement: 'PROGRAMME',
        participantsInscrits: 0,
        groupesCovoiturage: []
      },
      note: 'Utilisez POST /api/evenements avec de vraies données pour créer un vrai événement'
    });
  });

  // Route pour tester la recherche par proximité
  router.get('/test/proximite-demo', (req, res) => {
    const abidjanCoords = {
      latitude: 5.3599517,
      longitude: -3.9615917
    };
    
    res.json({
      success: true,
      message: 'Test de proximité - Coordonnées d\'Abidjan',
      exemple_url: `/api/evenements/proximite?latitude=${abidjanCoords.latitude}&longitude=${abidjanCoords.longitude}&rayon=20`,
      coordonnees_test: abidjanCoords,
      note: 'Utilisez ces coordonnées pour tester la recherche par proximité'
    });
  });
}

// =============== GESTION D'ERREURS ===============

// Middleware de gestion d'erreurs spécifique aux événements
router.use((error, req, res, _next) => {
  console.error(`💥 [EVENEMENTS] Erreur ${req.method} ${req.originalUrl}:`, {
    message: error.message,
    stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    user: req.user?.id,
    params: req.params,
    query: req.query,
    timestamp: new Date().toISOString()
  });
  
  // Erreurs spécifiques aux événements
  if (error.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      message: 'Données d\'événement invalides',
      details: error.message
    });
  }
  
  if (error.name === 'CastError') {
    return res.status(400).json({
      success: false,
      message: 'ID d\'événement invalide',
      details: error.message
    });
  }

  if (error.message && error.message.includes('Event not found')) {
    return res.status(404).json({
      success: false,
      message: 'Événement non trouvé'
    });
  }

  if (error.message && error.message.includes('Unauthorized')) {
    return res.status(403).json({
      success: false,
      message: 'Vous n\'êtes pas autorisé à effectuer cette action'
    });
  }
  
  // Erreur générale
  res.status(500).json({
    success: false,
    message: 'Erreur lors du traitement de l\'événement',
    ...(process.env.NODE_ENV === 'development' && { 
      error: error.message,
      stack: error.stack 
    })
  });
});

module.exports = router;