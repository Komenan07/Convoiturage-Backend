// ========================================
// ROUTES VÉHICULES (/api/vehicules)
// ========================================

const express = require('express');
const router = express.Router();
const vehiculeController = require('../controllers/vehiculeController');
const { auth, upload } = require('../middleware');

// =============== CREATE ===============
// Ajouter nouveau véhicule avec photo
router.post('/', auth, upload.single('photoVehicule'), vehiculeController.creerVehicule);

// =============== READ ===============
// Obtenir tous les véhicules de l'utilisateur connecté
router.get('/mes-vehicules', auth, vehiculeController.obtenirMesVehicules);

// Obtenir détails d'un véhicule spécifique
router.get('/:vehiculeId', auth, vehiculeController.obtenirVehicule);

// Vérifier validité des documents d'un véhicule
router.get('/:vehiculeId/validite-documents', auth, vehiculeController.verifierValiditeDocuments);

// Obtenir véhicules avec documents expirés/expiration proche
router.get('/mes-vehicules/documents-expires', auth, vehiculeController.obtenirDocumentsExpires);

// =============== UPDATE ===============
// Modifier informations générales du véhicule
router.put('/:vehiculeId', auth, upload.single('photoVehicule'), vehiculeController.modifierVehicule);

// Renouveler assurance
router.put('/:vehiculeId/assurance', auth, vehiculeController.renouvellerAssurance);

// Renouveler visite technique
router.put('/:vehiculeId/visite-technique', auth, upload.single('certificat'), vehiculeController.renouvellerVisiteTechnique);

// Définir comme véhicule principal
router.patch('/:vehiculeId/principal', auth, vehiculeController.definirVehiculePrincipal);

// =============== DELETE ===============
// Supprimer véhicule (avec vérifications)
router.delete('/:vehiculeId', auth, vehiculeController.supprimerVehicule);

module.exports = router;