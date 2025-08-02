const express = require("express");
const router = express.Router();
const utilisateurController = require("../controllers/utilisateurController");

// Créer un utilisateur
router.post("/ajouter", utilisateurController.creerUtilisateur);

// Lister tous les utilisateurs
router.get("/liste", utilisateurController.listerUtilisateurs);

// Obtenir un utilisateur spécifique
router.get("/details/:id", utilisateurController.obtenirUtilisateur);

// Modifier un utilisateur
router.put("/modifier/:id", utilisateurController.modifierUtilisateur);

// Supprimer un utilisateur
router.delete("/supprimer/:id", utilisateurController.supprimerUtilisateur);

module.exports = router;
