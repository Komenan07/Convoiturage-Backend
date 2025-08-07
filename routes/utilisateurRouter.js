const express = require('express');
const router = express.Router();
const userController = require('../controllers/utilisateurController');
const { authenticateToken, validateUserData, checkEmailExists } = require('../middleware/auth');

// Routes publiques
router.post('/register', validateUserData, checkEmailExists, userController.register);
router.post('/login', userController.login);

// Routes protégées (nécessitent authentification)
router.use(authenticateToken); // Applique à toutes les routes suivantes

router.get('/profile', userController.getProfile); // → Voir le profil
router.get('/nearby', userController.getNearbyUsers); // → Voir les utilisateurs à proximité
router.get('/:id/stats', userController.getUserStats); // → Statistiques d’un utilisateur

router.put('/profile', userController.updateProfile);  // → Modifier son profil
router.put('/change-password', userController.changePassword); // → Changer son mot de passe

router.post('/:id/vehicle', userController.addVehicle); // → Ajouter un véhicule
router.post('/:id/emergency-contact', userController.addEmergencyContact); // → Ajouter un contact d’urgence

router.delete('/vehicle/:vehicleId', userController.removeVehicle); // → Supprimer un véhicule
router.delete('/account', userController.deleteAccount); // → Supprimer son compte

module.exports = router;
