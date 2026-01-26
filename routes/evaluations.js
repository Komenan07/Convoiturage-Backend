const express = require('express');
const router = express.Router();
const EvaluationController = require('../controllers/EvaluationController');
const { protect, isAdmin } = require('../middlewares/authMiddleware');

const controller = EvaluationController;

// ========================================
// 🆕 WORKFLOW ÉVALUATION EN ATTENTE
// ========================================

// Créer évaluation en attente (appelée automatiquement après fin de trajet)
router.post('/en-attente', protect, controller.creerEvaluationEnAttente);

// Obtenir les évaluations en attente de l'utilisateur connecté
router.get('/en-attente', protect, controller.obtenirEvaluationsEnAttente);

// Compléter une évaluation en attente (ROUTE PRINCIPALE D'ÉVALUATION)
router.put('/:id/completer', protect, controller.completerEvaluation);

// Vérifier le délai restant pour compléter une évaluation
router.get('/:id/delai', protect, controller.verifierDelaiEvaluation);

// ========================================
// 🆕 VALIDATION LANGUE FRANÇAISE
// ========================================

// Valider la langue d'un commentaire avant soumission
router.post('/valider-langue', protect, controller.validerLangueCommentaire);

// ========================================
// 🆕 SIGNALEMENT PRISE EN CHARGE (ANTI-FRAUDE)
// ========================================

// Signaler qu'un passager a été pris en charge
router.post('/prise-en-charge', protect, controller.signalerPriseEnCharge);

// Obtenir l'historique des prises en charge d'un trajet
router.get('/trajet/:trajetId/prises-en-charge', protect, controller.obtenirPrisesEnChargeTrajet);

// ========================================
// 📊 STATISTIQUES & BADGES
// ========================================

// Statistiques globales de la plateforme
router.get('/statistiques', protect, controller.obtenirStatistiquesGlobales);

// Statistiques pour l'attribution de badges
router.get('/user/:userId/stats-badges', protect, controller.obtenirStatsPourBadges);

// Meilleures évaluations de la plateforme
router.get('/meilleures', protect, controller.obtenirMeilleuresEvaluations);

// ========================================
// 📝 GESTION DES ÉVALUATIONS
// ========================================

// Création d'évaluation (ancienne méthode - à déprécier au profit de en-attente + completer)
router.post('/', protect, controller.creerEvaluation);

// Répondre à une évaluation
router.put('/:id/reponse', protect, controller.repondreEvaluation);

router.get('/mes-evaluations-a-repondre', protect, controller.getEvaluationPourRepondre);

// Signaler une évaluation abusive
router.post('/:id/signaler', protect, controller.signalerEvaluationAbusive);

// ========================================
// 👨‍💼 MODÉRATION ADMIN
// ========================================

// Masquer une évaluation (modération)
router.put('/:id/masquer', protect, isAdmin, controller.masquerEvaluation);

// Démasquer une évaluation
router.put('/:id/demasquer', protect, isAdmin, controller.demasquerEvaluation);

// Supprimer une évaluation
router.delete('/:id', protect, isAdmin, controller.supprimerEvaluation);

// ========================================
// 📖 CONSULTATION DES ÉVALUATIONS
// ========================================

// Évaluations d'un utilisateur (avec filtres)
router.get('/user/:userId', protect, controller.obtenirEvaluationsUtilisateur);

// Moyenne des notes d'un utilisateur
router.get('/user/:userId/moyenne', protect, controller.obtenirMoyenneUtilisateur);

// Détecter évaluations suspectes d'un utilisateur
router.get('/user/:userId/suspectes', protect, controller.detecterEvaluationsSuspectes);

// Recalculer le score de confiance d'un utilisateur
router.put('/user/:userId/score', protect, controller.recalculerScoreConfiance);

// Évaluations d'un trajet spécifique
router.get('/trajet/:trajetId', protect, controller.obtenirEvaluationsTrajet);

module.exports = router;