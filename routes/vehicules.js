// ========================================
// ROUTES VÉHICULES (/api/vehicules)
// ========================================
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

// Import sécurisé des middlewares
let auth = (req, res, next) => {
  console.warn('⚠️ Middleware auth non disponible, accès autorisé');
  req.user = { id: 'user_test' }; // Utilisateur fictif pour les tests
  next();
};

let upload = {
  single: (fieldName) => (req, res, next) => {
    console.warn(`⚠️ Middleware upload.single('${fieldName}') non disponible`);
    next();
  }
};

try {
  const middleware = require('../middleware');
  if (middleware.auth) auth = middleware.auth;
  if (middleware.upload) upload = middleware.upload;
  console.log('✅ Middlewares auth et upload chargés avec succès');
} catch (error) {
  console.warn('⚠️ Middlewares non trouvés, utilisation des middlewares par défaut');
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
      id_fourni: vehiculeId
    });
  }
  next();
};

// =============== MIDDLEWARES DE LOGGING ===============

// Logger pour debug
const loggerVehicules = (req, res, next) => {
  console.log(`🚗 [VEHICULES] ${req.method} ${req.originalUrl} - User: ${req.user?.id || 'Anonymous'}`);
  next();
};

// Utiliser le logger sur toutes les routes
router.use(loggerVehicules);

// =============== CREATE ===============

// Ajouter un nouveau véhicule avec photo
router.post('/', 
  auth, 
  upload.single('photoVehicule'), 
  vehiculeController.creerVehicule || creerControleurParDefaut('creerVehicule', 'Création de véhicule non implémentée')
);

// =============== READ ===============

// IMPORTANT: Routes spécifiques AVANT les routes avec paramètres

// Obtenir les véhicules avec documents expirés/expiration proche
router.get('/mes-vehicules/documents-expires', 
  auth, 
  vehiculeController.obtenirDocumentsExpires || creerControleurParDefaut('obtenirDocumentsExpires')
);

// Obtenir tous les véhicules de l'utilisateur connecté
router.get('/mes-vehicules', 
  auth, 
  vehiculeController.obtenirMesVehicules || creerControleurParDefaut('obtenirMesVehicules')
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

// =============== UPDATE ===============

// Modifier les informations générales du véhicule
router.put('/:vehiculeId', 
  auth, 
  validerIdMongoDB,
  upload.single('photoVehicule'), 
  vehiculeController.modifierVehicule || creerControleurParDefaut('modifierVehicule')
);

// Renouveler l'assurance
router.put('/:vehiculeId/assurance', 
  auth, 
  validerIdMongoDB,
  vehiculeController.renouvelerAssurance || vehiculeController.renouvellerAssurance || creerControleurParDefaut('renouvelerAssurance')
);

// Renouveler la visite technique
router.put('/:vehiculeId/visite-technique', 
  auth, 
  validerIdMongoDB,
  upload.single('certificat'), 
  vehiculeController.renouvelerVisiteTechnique || vehiculeController.renouvellerVisiteTechnique || creerControleurParDefaut('renouvelerVisiteTechnique')
);

// Définir comme véhicule principal
router.patch('/:vehiculeId/principal', 
  auth, 
  validerIdMongoDB,
  vehiculeController.definirVehiculePrincipal || creerControleurParDefaut('definirVehiculePrincipal')
);

// =============== DELETE ===============

// Supprimer un véhicule (avec vérifications)
router.delete('/:vehiculeId', 
  auth, 
  validerIdMongoDB,
  vehiculeController.supprimerVehicule || creerControleurParDefaut('supprimerVehicule', 'Suppression de véhicule non implémentée - fonctionnalité critique')
);

// =============== ROUTES DE TEST (DÉVELOPPEMENT) ===============

// Route de test pour le développement
if (process.env.NODE_ENV !== 'production') {
  router.get('/test/structure', (req, res) => {
    res.json({
      success: true,
      message: 'Test de la structure des routes véhicules',
      routes_disponibles: [
        'POST /',
        'GET /mes-vehicules',
        'GET /mes-vehicules/documents-expires',
        'GET /statistiques',
        'GET /:vehiculeId',
        'GET /:vehiculeId/validite-documents',
        'PUT /:vehiculeId',
        'PUT /:vehiculeId/assurance',
        'PUT /:vehiculeId/visite-technique',
        'PATCH /:vehiculeId/principal',
        'DELETE /:vehiculeId'
      ],
      controlleur_charge: !!vehiculeController.creerVehicule,
      middlewares_charges: {
        auth: typeof auth === 'function',
        upload: typeof upload.single === 'function'
      }
    });
  });
}

// =============== GESTION D'ERREURS ===============

// Middleware de gestion d'erreurs spécifique aux véhicules
router.use((error, req, res, _next) => {
  console.error(`💥 [VEHICULES] Erreur ${req.method} ${req.originalUrl}:`, {
    message: error.message,
    stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    user: req.user?.id,
    params: req.params,
    timestamp: new Date().toISOString()
  });
  
  // Erreurs spécifiques aux véhicules
  if (error.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      message: 'Données de véhicule invalides',
      details: error.message
    });
  }
  
  if (error.name === 'CastError') {
    return res.status(400).json({
      success: false,
      message: 'ID de véhicule invalide',
      details: error.message
    });
  }
  
  // Erreur générale
  res.status(500).json({
    success: false,
    message: 'Erreur interne lors du traitement de la demande véhicule',
    ...(process.env.NODE_ENV === 'development' && { error: error.message })
  });
});

module.exports = router;