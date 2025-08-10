const express = require('express');
const router = express.Router();
const EvaluationService = require('../services/evaluationService');
const EvaluationController = require('../controllers/evaluationController');
const { protect, isAdmin } = require('../middleware/authMiddleware');

const controller = new EvaluationController(new EvaluationService());

// Création
router.post('/', protect, controller.creerEvaluation);

// Réponse à une évaluation
router.put('/:id/reponse', protect, controller.repondreEvaluation);

// Signalement abusif
router.post('/:id/signaler', protect, controller.signalerEvaluationAbusive);

// Suppression (admin)
router.delete('/:id', protect, isAdmin, controller.supprimerEvaluation);

// Évaluations par utilisateur
router.get('/user/:userId', protect, controller.obtenirEvaluationsUtilisateur);

// Moyenne des notes
router.get('/user/:userId/moyenne', protect, controller.obtenirMoyenneUtilisateur);

// Détection suspecte
router.get('/user/:userId/suspectes', protect, controller.detecterEvaluationsSuspectes);

// Évaluations par trajet
router.get('/trajet/:trajetId', protect, controller.obtenirEvaluationsTrajet);

// Statistiques globales
router.get('/statistiques', protect, controller.obtenirStatistiquesGlobales);

// Recalcul score de confiance
router.put('/user/:userId/score', protect, controller.recalculerScoreConfiance);

module.exports = router;
