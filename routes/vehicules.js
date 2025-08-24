const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const VehiculeController = require('../controllers/vehiculeController');

const router = express.Router();

// Configuration de multer pour l'upload de fichiers
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = 'public/uploads/vehicules/';
    
    // Créer le répertoire s'il n'existe pas
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    // Générer un nom unique pour le fichier
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname);
    cb(null, `vehicule-${uniqueSuffix}${extension}`);
  }
});

// Filtres pour les types de fichiers acceptés
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|pdf/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Seuls les fichiers JPEG, JPG, PNG et PDF sont autorisés'));
  }
};

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB max
  },
  fileFilter: fileFilter
});

// Middleware pour gérer les erreurs multer
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'Le fichier est trop volumineux. Taille maximum : 5MB'
      });
    }
  } else if (err) {
    return res.status(400).json({
      success: false,
      message: err.message
    });
  }
  next();
};

/**
 * @route   POST /api/vehicules
 * @desc    Ajouter un nouveau véhicule
 * @access  Private
 */
router.post('/', 
  upload.single('photoVehicule'), 
  handleMulterError,
  VehiculeController.ajouterVehicule
);

/**
 * @route   GET /api/vehicules/utilisateur/:utilisateurId
 * @desc    Obtenir tous les véhicules d'un utilisateur
 * @access  Private
 * @params  utilisateurId - ID de l'utilisateur
 * @query   statut - Filtrer par statut (optionnel)
 * @query   page - Numéro de page pour la pagination (défaut: 1)
 * @query   limit - Nombre d'éléments par page (défaut: 10)
 */
router.get('/utilisateur/:utilisateurId', VehiculeController.obtenirVehiculesUtilisateur);

/**
 * @route   GET /api/vehicules/:vehiculeId
 * @desc    Obtenir les détails d'un véhicule
 * @access  Private
 * @params  vehiculeId - ID du véhicule
 */
router.get('/:vehiculeId', VehiculeController.obtenirDetailsVehicule);

/**
 * @route   PUT /api/vehicules/:vehiculeId
 * @desc    Modifier les informations d'un véhicule
 * @access  Private
 * @params  vehiculeId - ID du véhicule
 */
router.put('/:vehiculeId', 
  upload.single('photoVehicule'), 
  handleMulterError,
  VehiculeController.modifierVehicule
);

/**
 * @route   PATCH /api/vehicules/:vehiculeId/principal
 * @desc    Définir un véhicule comme principal
 * @access  Private
 * @params  vehiculeId - ID du véhicule
 */
router.patch('/:vehiculeId/principal', VehiculeController.definirVehiculePrincipal);

/**
 * @route   PATCH /api/vehicules/:vehiculeId/assurance
 * @desc    Renouveler l'assurance d'un véhicule
 * @access  Private
 * @params  vehiculeId - ID du véhicule
 */
router.patch('/:vehiculeId/assurance', VehiculeController.renouvellerAssurance);

/**
 * @route   PATCH /api/vehicules/:vehiculeId/visite-technique
 * @desc    Renouveler la visite technique d'un véhicule
 * @access  Private
 * @params  vehiculeId - ID du véhicule
 */
router.patch('/:vehiculeId/visite-technique', 
  upload.single('certificat'), 
  handleMulterError,
  VehiculeController.renouvellerVisiteTechnique
);

/**
 * @route   GET /api/vehicules/:vehiculeId/validite-documents
 * @desc    Vérifier la validité des documents d'un véhicule
 * @access  Private
 * @params  vehiculeId - ID du véhicule
 */
router.get('/:vehiculeId/validite-documents', VehiculeController.verifierValiditeDocuments);

/**
 * @route   DELETE /api/vehicules/:vehiculeId
 * @desc    Supprimer un véhicule
 * @access  Private
 * @params  vehiculeId - ID du véhicule
 */
router.delete('/:vehiculeId', VehiculeController.supprimerVehicule);

/**
 * @route   GET /api/vehicules/documents/expires
 * @desc    Obtenir les véhicules avec documents expirés ou à expirer
 * @access  Private
 * @query   jours - Nombre de jours avant expiration (défaut: 30)
 */
router.get('/documents/expires', VehiculeController.obtenirVehiculesExpiresOuAExpirer);

module.exports = router;