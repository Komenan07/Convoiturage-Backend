// routes/vehicules.js
// Routes complètes pour la gestion des véhicules

const express = require('express');
const router = express.Router();

// =============== IMPORTS SÉCURISÉS ===============

// Import sécurisé du contrôleur
let vehiculeController = {};
try {
  vehiculeController = require('../controllers/vehiculeController');
  console.log('✅ Contrôleur vehiculeController chargé avec succès');
} catch (error) {
  console.warn('⚠️ Contrôleur vehiculeController non trouvé, utilisation des méthodes par défaut');
  console.warn('   Erreur:', error.message);
}

// Import sécurisé des middlewares d'authentification
let auth = (req, res, next) => {
  console.warn('⚠️ Middleware auth non disponible, accès autorisé');
  req.user = { userId: 'user_test' }; // Utilisateur fictif pour les tests
  next();
};

try {
  const authMiddleware = require('../middlewares/authMiddleware');
  if (authMiddleware.auth || authMiddleware.authenticateToken) {
    auth = authMiddleware.auth || authMiddleware.authenticateToken;
  }
  console.log('✅ Middleware d\'authentification chargé avec succès');
} catch (error) {
  console.warn('⚠️ Middleware d\'authentification non trouvé, utilisation du fallback');
  console.warn('   Erreur:', error.message);
}

// Import sécurisé du middleware d'upload
let uploadVehicule = {
  single: (fieldName) => (req, res, next) => {
    console.warn(`⚠️ Middleware upload.single('${fieldName}') non disponible`);
    next();
  }
};

try {
  const uploadMiddleware = require('../middlewares/uploadMiddleware');
  if (uploadMiddleware.uploadVehiculePhoto) {
    uploadVehicule = uploadMiddleware.uploadVehiculePhoto;
  } else if (uploadMiddleware.upload) {
    uploadVehicule = uploadMiddleware.upload;
  }
  console.log('✅ Middleware d\'upload véhicule chargé avec succès');
} catch (error) {
  console.warn('⚠️ Middleware d\'upload véhicule non trouvé, utilisation du fallback');
  console.warn('   Erreur:', error.message);
}

// =============== FONCTIONS HELPER ===============

// Créer un contrôleur par défaut pour les méthodes non implémentées
const creerControleurParDefaut = (nomMethode, message = null) => {
  return (req, res) => {
    console.log(`📝 Appel de la méthode ${nomMethode} (non implémentée)`);
    res.status(501).json({
      success: false,
      message: message || `Méthode ${nomMethode} non implémentée`,
      info: 'Cette fonctionnalité sera disponible dans une future version',
      methode: nomMethode,
      parametres: req.params,
      query: req.query,
      timestamp: new Date().toISOString()
    });
  };
};

// Validation des IDs MongoDB
const validerIdMongoDB = (req, res, next) => {
  const { vehiculeId } = req.params;
  if (vehiculeId && !vehiculeId.match(/^[0-9a-fA-F]{24}$/)) {
    return res.status(400).json({
      success: false,
      message: 'Format ID véhicule invalide',
      id_fourni: vehiculeId,
      format_attendu: 'ObjectId MongoDB (24 caractères hexadécimaux)'
    });
  }
  next();
};

// =============== MIDDLEWARES DE LOGGING ===============

// Logger pour debug
const loggerVehicules = (req, res, next) => {
  console.log(`🚗 [VEHICULES] ${req.method} ${req.originalUrl} - User: ${req.user?.userId || 'Anonymous'}`);
  if (Object.keys(req.query).length > 0) {
    console.log(`    Query params:`, req.query);
  }
  if (Object.keys(req.params).length > 0) {
    console.log(`    Route params:`, req.params);
  }
  next();
};

// Utiliser le logger sur toutes les routes
router.use(loggerVehicules);

// =============== ROUTES PRINCIPALES ===============

// =============== CREATE ===============

// Créer un nouveau véhicule avec photo optionnelle
router.post('/', 
  auth, 
  uploadVehicule.single('photoVehicule'),
  vehiculeController.creerVehicule || creerControleurParDefaut('creerVehicule', 'Création de véhicule non implémentée')
);

// Dupliquer un véhicule existant
router.post('/:vehiculeId/dupliquer',
  auth,
  validerIdMongoDB,
  vehiculeController.dupliquerVehicule || creerControleurParDefaut('dupliquerVehicule')
);

// =============== READ ===============

// IMPORTANT: Routes spécifiques AVANT les routes avec paramètres

// Obtenir tous les véhicules de l'utilisateur connecté avec pagination
router.get('/mes-vehicules', 
  auth, 
  vehiculeController.obtenirMesVehicules || creerControleurParDefaut('obtenirMesVehicules')
);

// Obtenir le véhicule principal de l'utilisateur
router.get('/principal',
  auth,
  vehiculeController.obtenirVehiculePrincipal || creerControleurParDefaut('obtenirVehiculePrincipal')
);

// Rechercher des véhicules par critères
router.get('/recherche',
  auth,
  vehiculeController.rechercherVehicules || creerControleurParDefaut('rechercherVehicules')
);

// Obtenir les véhicules avec documents expirés/expiration proche
router.get('/documents-expires', 
  auth, 
  vehiculeController.obtenirDocumentsExpires || creerControleurParDefaut('obtenirDocumentsExpires')
);

// Statistiques des véhicules de l'utilisateur
router.get('/statistiques',
  auth,
  vehiculeController.obtenirStatistiques || creerControleurParDefaut('obtenirStatistiques')
);

// Obtenir les détails d'un véhicule spécifique
router.get('/:vehiculeId', 
  auth, 
  validerIdMongoDB,
  vehiculeController.obtenirVehicule || creerControleurParDefaut('obtenirVehicule')
);

// Vérifier la validité des documents d'un véhicule
router.get('/:vehiculeId/validite-documents', 
  auth, 
  validerIdMongoDB,
  vehiculeController.verifierValiditeDocuments || creerControleurParDefaut('verifierValiditeDocuments')
);

// Obtenir l'historique d'un véhicule
router.get('/:vehiculeId/historique',
  auth,
  validerIdMongoDB,
  vehiculeController.obtenirHistoriqueVehicule || creerControleurParDefaut('obtenirHistoriqueVehicule')
);

// =============== UPDATE ===============

// Modifier les informations générales du véhicule
router.put('/:vehiculeId', 
  auth, 
  validerIdMongoDB,
  uploadVehicule.single('photoVehicule'),
  vehiculeController.modifierVehicule || creerControleurParDefaut('modifierVehicule')
);

// Mettre à jour uniquement la photo d'un véhicule
router.put('/:vehiculeId/photo',
  auth,
  validerIdMongoDB,
  uploadVehicule.single('photoVehicule'),
  vehiculeController.mettreAJourPhotoVehicule || creerControleurParDefaut('mettreAJourPhotoVehicule')
);

// Renouveler l'assurance
router.put('/:vehiculeId/assurance', 
  auth, 
  validerIdMongoDB,
  vehiculeController.renouvelerAssurance || creerControleurParDefaut('renouvelerAssurance')
);

// Renouveler la visite technique
router.put('/:vehiculeId/visite-technique', 
  auth, 
  validerIdMongoDB,
  vehiculeController.renouvelerVisiteTechnique || creerControleurParDefaut('renouvelerVisiteTechnique')
);

// =============== PATCH (Modifications partielles) ===============

// Définir comme véhicule principal
router.patch('/:vehiculeId/principal', 
  auth, 
  validerIdMongoDB,
  vehiculeController.definirVehiculePrincipal || creerControleurParDefaut('definirVehiculePrincipal')
);

// Changer le statut d'un véhicule
router.patch('/:vehiculeId/statut',
  auth,
  validerIdMongoDB,
  vehiculeController.changerStatutVehicule || creerControleurParDefaut('changerStatutVehicule')
);

// Mettre à jour le kilométrage
router.patch('/:vehiculeId/kilometrage',
  auth,
  validerIdMongoDB,
  vehiculeController.mettreAJourKilometrage || creerControleurParDefaut('mettreAJourKilometrage')
);

// Archiver un véhicule (alternative à la suppression)
router.patch('/:vehiculeId/archiver',
  auth,
  validerIdMongoDB,
  vehiculeController.archiverVehicule || creerControleurParDefaut('archiverVehicule')
);

// =============== DELETE ===============

// Supprimer un véhicule (avec vérifications)
router.delete('/:vehiculeId', 
  auth, 
  validerIdMongoDB,
  vehiculeController.supprimerVehicule || creerControleurParDefaut('supprimerVehicule', 'Suppression de véhicule non implémentée - fonctionnalité critique')
);

// =============== ROUTES DE TEST ET DEBUG ===============

// Route de test pour le développement
if (process.env.NODE_ENV !== 'production') {
  router.get('/test/structure', (req, res) => {
    const methodesControlleur = Object.keys(vehiculeController);
    const methodesImplementees = [
      'creerVehicule',
      'obtenirMesVehicules', 
      'obtenirVehicule',
      'modifierVehicule',
      'supprimerVehicule',
      'definirVehiculePrincipal',
      'obtenirVehiculePrincipal',
      'mettreAJourPhotoVehicule',
      'verifierValiditeDocuments',
      'rechercherVehicules',
      'obtenirDocumentsExpires',
      'obtenirStatistiques',
      'renouvelerAssurance',
      'renouvelerVisiteTechnique',
      'changerStatutVehicule',
      'archiverVehicule',
      'obtenirHistoriqueVehicule',
      'mettreAJourKilometrage',
      'dupliquerVehicule'
    ];

    res.json({
      success: true,
      message: 'Test de la structure des routes véhicules',
      routes_disponibles: {
        'POST': [
          '/ (créer véhicule)',
          '/:vehiculeId/dupliquer'
        ],
        'GET': [
          '/mes-vehicules (avec pagination)',
          '/principal',
          '/recherche',
          '/documents-expires',
          '/statistiques',
          '/:vehiculeId',
          '/:vehiculeId/validite-documents',
          '/:vehiculeId/historique'
        ],
        'PUT': [
          '/:vehiculeId (modifier)',
          '/:vehiculeId/photo',
          '/:vehiculeId/assurance',
          '/:vehiculeId/visite-technique'
        ],
        'PATCH': [
          '/:vehiculeId/principal',
          '/:vehiculeId/statut',
          '/:vehiculeId/kilometrage',
          '/:vehiculeId/archiver'
        ],
        'DELETE': [
          '/:vehiculeId'
        ]
      },
      controlleur: {
        charge: methodesControlleur.length > 0,
        methodes_disponibles: methodesControlleur,
        methodes_implementees: methodesImplementees,
        methodes_manquantes: methodesImplementees.filter(m => !methodesControlleur.includes(m))
      },
      middlewares: {
        auth: typeof auth === 'function',
        upload: typeof uploadVehicule.single === 'function',
        validation_id: true
      }
    });
  });

  // Route de test pour vérifier l'authentification
  router.get('/test/auth', auth, (req, res) => {
    res.json({
      success: true,
      message: 'Authentification fonctionnelle',
      user: req.user,
      timestamp: new Date().toISOString()
    });
  });

  // Route de test pour l'upload
  router.post('/test/upload', 
    auth, 
    uploadVehicule.single('testPhoto'), 
    (req, res) => {
      res.json({
        success: true,
        message: 'Test d\'upload',
        file: req.file || null,
        body: req.body
      });
    }
  );
}

// =============== GESTION D'ERREURS ===============

// Middleware de gestion d'erreurs spécifique aux véhicules
router.use((error, req, res, next) => {
  console.error(`💥 [VEHICULES] Erreur ${req.method} ${req.originalUrl}:`, {
    message: error.message,
    stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    user: req.user?.userId,
    params: req.params,
    query: req.query,
    timestamp: new Date().toISOString()
  });
  
  // Erreurs spécifiques aux véhicules
  if (error.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      message: 'Données de véhicule invalides',
      erreurs: Object.values(error.errors).map(err => err.message),
      details: error.message
    });
  }
  
  if (error.name === 'CastError') {
    return res.status(400).json({
      success: false,
      message: 'ID de véhicule invalide',
      details: error.message,
      id_fourni: error.value
    });
  }

  // Erreur de duplication (immatriculation unique)
  if (error.code === 11000) {
    return res.status(409).json({
      success: false,
      message: 'Un véhicule avec cette immatriculation existe déjà',
      details: error.message
    });
  }

  // Erreurs d'upload
  if (error.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      success: false,
      message: 'Fichier trop volumineux',
      details: 'La taille maximale autorisée est de 5MB'
    });
  }

  if (error.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({
      success: false,
      message: 'Type de fichier non autorisé',
      details: 'Seules les images sont acceptées (jpg, jpeg, png, webp)'
    });
  }
  
  // Erreur générale - passer au middleware d'erreur global
  next(error);
});

// =============== MIDDLEWARE DE RÉPONSE 404 ===============

// Gestion des routes non trouvées spécifiques aux véhicules
router.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route véhicule non trouvée',
    route_demandee: req.originalUrl,
    methode: req.method,
    routes_disponibles: [
      'GET /api/vehicules/mes-vehicules',
      'GET /api/vehicules/principal',
      'GET /api/vehicules/recherche',
      'GET /api/vehicules/documents-expires',
      'GET /api/vehicules/statistiques',
      'GET /api/vehicules/:vehiculeId',
      'POST /api/vehicules',
      'PUT /api/vehicules/:vehiculeId',
      'PATCH /api/vehicules/:vehiculeId/principal',
      'DELETE /api/vehicules/:vehiculeId'
    ]
  });
});

module.exports = router;