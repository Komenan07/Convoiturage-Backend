// routes/vehicules.js
// Routes complètes pour la gestion des véhicules - Côte d'Ivoire 2024

const express = require('express');
const router = express.Router();

// =============== IMPORTS ===============

const vehiculeController = require('../controllers/vehiculeController');

// Middleware d'authentification - fallback si non disponible
let auth = (req, res, next) => {
  req.user = { userId: 'user_test', role: 'USER' };
  next();
};

let isAdmin = (req, res, next) => next();

try {
  const authMiddleware = require('../middlewares/authMiddleware');
  // Utiliser authMiddleware, requireAuth ou protect selon ce qui est disponible
  auth = authMiddleware.authMiddleware || authMiddleware.requireAuth || authMiddleware.protect || auth;
  isAdmin = authMiddleware.isAdmin || authMiddleware.adminMiddleware || isAdmin;
} catch (error) {
  console.warn('⚠️ Middleware d\'authentification non trouvé, utilisation fallback');
}

// Middleware d'upload - fallback si non disponible
let upload = {
  fields: (_fields) => (req, res, next) => next()
};

try {
  const uploadMiddleware = require('../middlewares/uploadMiddleware');
  upload = uploadMiddleware.upload || upload;
} catch (error) {
  console.warn('⚠️ Middleware d\'upload non trouvé, utilisation fallback');
}

// =============== MIDDLEWARES UTILITAIRES ===============

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

const loggerVehicules = (req, res, next) => {
  console.log(`🚗 [VEHICULES] ${req.method} ${req.originalUrl} - User: ${req.user?.userId || 'Anonymous'}`);
  next();
};

const champsPhotosMultiples = upload.fields([
  { name: 'avant', maxCount: 1 },
  { name: 'arriere', maxCount: 1 },
  { name: 'lateral_gauche', maxCount: 1 },
  { name: 'lateral_droit', maxCount: 1 },
  { name: 'interieur', maxCount: 1 },
  { name: 'tableau_bord', maxCount: 1 }
]);

router.use(loggerVehicules);

// =============== ROUTES SPÉCIFIQUES (AVANT :vehiculeId) ===============

/**
 * @route   GET /api/vehicules/mes-vehicules
 * @desc    Obtenir tous les véhicules de l'utilisateur
 */
router.get('/mes-vehicules', auth, vehiculeController.obtenirMesVehicules);

/**
 * @route   GET /api/vehicules/principal
 * @desc    Obtenir le véhicule principal
 */
router.get('/principal', auth, vehiculeController.obtenirVehiculePrincipal);

/**
 * @route   GET /api/vehicules/disponibles
 * @desc    Rechercher véhicules disponibles
 */
router.get('/disponibles', auth, vehiculeController.rechercherVehiculesDisponibles);

/**
 * @route   GET /api/vehicules/documents-expires
 * @desc    Véhicules avec documents expirés
 */
router.get('/documents-expires', auth, vehiculeController.obtenirDocumentsExpires);

/**
 * @route   GET /api/vehicules/maintenance-requise
 * @desc    Véhicules nécessitant maintenance
 */
router.get('/maintenance-requise', auth, vehiculeController.obtenirVehiculesMaintenanceRequise);

/**
 * @route   GET /api/vehicules/statistiques
 * @desc    Statistiques des véhicules
 */
router.get('/statistiques', auth, vehiculeController.obtenirStatistiques);

/**
 * @route   GET /api/vehicules/top-notes
 * @desc    Top véhicules par note
 */
router.get('/top-notes', vehiculeController.obtenirTopVehicules);

/**
 * @route   GET /api/vehicules/recherche-avancee
 * @desc    Recherche avancée
 */
router.get('/recherche-avancee', auth, vehiculeController.rechercheAvancee);

// =============== ROUTES ADMIN SPÉCIFIQUES ===============

/**
 * @route   GET /api/vehicules/admin/en-attente-validation
 * @desc    Véhicules en attente validation
 */
router.get('/admin/en-attente-validation', auth, isAdmin, vehiculeController.obtenirVehiculesEnAttenteValidation);

/**
 * @route   GET /api/vehicules/admin/signalements
 * @desc    Véhicules signalés
 */
router.get('/admin/signalements', auth, isAdmin, vehiculeController.obtenirVehiculesSignales);

/**
 * @route   GET /api/vehicules/admin/statistiques-globales
 * @desc    Statistiques globales
 */
router.get('/admin/statistiques-globales', auth, isAdmin, vehiculeController.obtenirStatistiquesGlobales);

// =============== ROUTES CRUD STANDARD ===============

/**
 * @route   POST /api/vehicules
 * @desc    Créer un véhicule
 */
router.post('/', auth, champsPhotosMultiples, vehiculeController.creerVehicule);

/**
 * @route   GET /api/vehicules/:vehiculeId
 * @desc    Obtenir un véhicule
 */
router.get('/:vehiculeId', auth, validerIdMongoDB, vehiculeController.obtenirVehicule);

/**
 * @route   PUT /api/vehicules/:vehiculeId
 * @desc    Modifier un véhicule
 */
router.put('/:vehiculeId', auth, validerIdMongoDB, champsPhotosMultiples, vehiculeController.modifierVehicule);

/**
 * @route   DELETE /api/vehicules/:vehiculeId
 * @desc    Supprimer un véhicule
 */
router.delete('/:vehiculeId', auth, validerIdMongoDB, vehiculeController.supprimerVehicule);

// =============== GESTION DOCUMENTS ===============

/**
 * @route   PUT /api/vehicules/:vehiculeId/documents
 * @desc    Compléter documents
 */
router.put('/:vehiculeId/documents', auth, validerIdMongoDB, vehiculeController.completerDocuments);

/**
 * @route   GET /api/vehicules/:vehiculeId/validite-documents
 * @desc    Vérifier validité documents
 */
router.get('/:vehiculeId/validite-documents', auth, validerIdMongoDB, vehiculeController.verifierValiditeDocuments);

// =============== GESTION COVOITURAGE ===============

/**
 * @route   POST /api/vehicules/:vehiculeId/activer-covoiturage
 * @desc    Activer pour covoiturage
 */
router.post('/:vehiculeId/activer-covoiturage', auth, validerIdMongoDB, vehiculeController.activerPourCovoiturage);

/**
 * @route   POST /api/vehicules/:vehiculeId/desactiver-covoiturage
 * @desc    Désactiver pour covoiturage
 */
router.post('/:vehiculeId/desactiver-covoiturage', auth, validerIdMongoDB, vehiculeController.desactiverPourCovoiturage);

/**
 * @route   GET /api/vehicules/:vehiculeId/disponibilite-trajet
 * @desc    Vérifier disponibilité
 */
router.get('/:vehiculeId/disponibilite-trajet', auth, validerIdMongoDB, vehiculeController.verifierDisponibiliteTrajet);

// =============== GESTION MAINTENANCE ===============

/**
 * @route   POST /api/vehicules/:vehiculeId/maintenance
 * @desc    Ajouter maintenance
 */
router.post('/:vehiculeId/maintenance', auth, validerIdMongoDB, vehiculeController.ajouterMaintenance);

/**
 * @route   PUT /api/vehicules/:vehiculeId/position
 * @desc    Mettre à jour position
 */
router.put('/:vehiculeId/position', auth, validerIdMongoDB, vehiculeController.mettreAJourPosition);

// =============== GESTION ADMINISTRATIVE ===============

/**
 * @route   POST /api/vehicules/:vehiculeId/valider
 * @desc    Valider véhicule (Admin)
 */
router.post('/:vehiculeId/valider', auth, isAdmin, validerIdMongoDB, vehiculeController.validerVehicule);

/**
 * @route   POST /api/vehicules/:vehiculeId/rejeter
 * @desc    Rejeter véhicule (Admin)
 */
router.post('/:vehiculeId/rejeter', auth, isAdmin, validerIdMongoDB, vehiculeController.rejeterVehicule);

/**
 * @route   POST /api/vehicules/:vehiculeId/signaler
 * @desc    Signaler véhicule
 */
router.post('/:vehiculeId/signaler', auth, validerIdMongoDB, vehiculeController.signalerVehicule);

// =============== MÉTHODES SPÉCIFIQUES ===============

/**
 * @route   PATCH /api/vehicules/:vehiculeId/principal
 * @desc    Définir comme principal
 */
router.patch('/:vehiculeId/principal', auth, validerIdMongoDB, vehiculeController.definirVehiculePrincipal);

/**
 * @route   PUT /api/vehicules/:vehiculeId/photos
 * @desc    Mettre à jour photos
 */
router.put('/:vehiculeId/photos', auth, validerIdMongoDB, champsPhotosMultiples, vehiculeController.mettreAJourPhotos);

/**
 * @route   PATCH /api/vehicules/:vehiculeId/archiver
 * @desc    Archiver véhicule
 */
router.patch('/:vehiculeId/archiver', auth, validerIdMongoDB, vehiculeController.archiverVehicule);

/**
 * @route   POST /api/vehicules/:vehiculeId/enregistrer-trajet
 * @desc    Enregistrer trajet complété
 */
router.post('/:vehiculeId/enregistrer-trajet', auth, validerIdMongoDB, vehiculeController.enregistrerTrajet);

/**
 * @route   POST /api/vehicules/:vehiculeId/noter
 * @desc    Noter véhicule
 */
router.post('/:vehiculeId/noter', auth, validerIdMongoDB, vehiculeController.noterVehicule);

/**
 * @route   GET /api/vehicules/:vehiculeId/exporter
 * @desc    Exporter données
 */
router.get('/:vehiculeId/exporter', auth, validerIdMongoDB, vehiculeController.exporterDonneesVehicule);

// =============== GESTION D'ERREURS ===============

router.use((error, req, res, next) => {
  console.error(`💥 [VEHICULES] Erreur ${req.method} ${req.originalUrl}:`, error.message);
  
  if (error.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      message: 'Données de véhicule invalides',
      erreurs: Object.values(error.errors).map(err => err.message)
    });
  }
  
  if (error.name === 'CastError') {
    return res.status(400).json({
      success: false,
      message: 'ID de véhicule invalide'
    });
  }

  if (error.code === 11000) {
    const field = Object.keys(error.keyPattern)[0];
    return res.status(409).json({
      success: false,
      message: `Un véhicule avec cette ${field} existe déjà`
    });
  }

  if (error.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      success: false,
      message: 'Fichier trop volumineux (max 5MB par photo)'
    });
  }

  if (error.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).json({
      success: false,
      message: 'Champ de fichier inattendu',
      details: 'Photos acceptées: avant, arriere, lateral_gauche, lateral_droit, interieur, tableau_bord'
    });
  }
  
  next(error);
});

// =============== MIDDLEWARE 404 ===============

router.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route véhicule non trouvée',
    route_demandee: req.originalUrl,
    methode: req.method
  });
});

module.exports = router;