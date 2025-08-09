// routes/evaluations.js
const express = require('express');
const router = express.Router();
const { authenticateToken, isAdmin } = require('../middleware/auth');

module.exports = (evaluationController) => {
  // Routes publiques (lecture)
  router.get('/user/:userId', evaluationController.obtenirEvaluationsUtilisateur.bind(evaluationController));
  router.get('/user/:userId/moyenne', evaluationController.obtenirMoyenneUtilisateur.bind(evaluationController));
  router.get('/trajet/:trajetId', evaluationController.obtenirEvaluationsTrajet.bind(evaluationController));

  // Routes authentifiées
  router.use(authenticateToken);
  
  // Création et gestion des évaluations
  router.post('/', evaluationController.creerEvaluation.bind(evaluationController));
  router.put('/:id/reponse', evaluationController.repondreEvaluation.bind(evaluationController));
  router.post('/:id/signaler', evaluationController.signalerEvaluationAbusive.bind(evaluationController));
  
  // Détection et gestion des scores
  router.get('/user/:userId/suspectes', evaluationController.detecterEvaluationsSuspectes.bind(evaluationController));
  router.put('/user/:userId/score', evaluationController.recalculerScoreConfiance.bind(evaluationController));

  // Routes admin uniquement
  router.delete('/:id', isAdmin, evaluationController.supprimerEvaluation.bind(evaluationController));
  router.get('/statistiques', isAdmin, evaluationController.obtenirStatistiquesGlobales.bind(evaluationController));

  return router;
};