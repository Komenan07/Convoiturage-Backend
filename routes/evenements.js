// routes/evenementRoutes.js
const express = require('express');
const router = express.Router();
const EvenementController = require('../controllers/evenementController');

// Instanciation du contrôleur
const evenementController = new EvenementController();

// Import du middleware d'authentification
let protect;
try {
  const authMiddleware = require('../middlewares/authMiddleware');
  protect = authMiddleware.protect;
} catch (error) {
  console.warn('⚠️ Middleware protect non trouvé');
  // Middleware temporaire pour les tests
  protect = (req, res, next) => {
    req.user = { 
      id: '68a5f9e043391dafa36887e4', 
      role: 'utilisateur',
      nom: 'SIGATOUGO',
      prenom: 'BORIS CONSTANT'
    };
    next();
  };
}

// =============== MIDDLEWARES DE VALIDATION ===============

// Validation des IDs MongoDB
const validerIdEvenement = (req, res, next) => {
  const { id } = req.params;
  if (id && (id.length !== 24 || !/^[0-9a-fA-F]{24}$/.test(id))) {
    return res.status(400).json({
      success: false,
      message: 'Format ID événement invalide',
      id_fourni: id
    });
  }
  next();
};

// Validation des IDs de groupe
const validerIdGroupe = (req, res, next) => {
  const { groupeId } = req.params;
  if (groupeId && (groupeId.length !== 24 || !/^[0-9a-fA-F]{24}$/.test(groupeId))) {
    return res.status(400).json({
      success: false,
      message: 'Format ID groupe invalide',
      id_fourni: groupeId
    });
  }
  next();
};

// Validation des paramètres de localisation
const validerLocalisation = (req, res, next) => {
  const { longitude, latitude, rayon } = req.query;

  if (longitude && (isNaN(longitude) || longitude < -180 || longitude > 180)) {
    return res.status(400).json({
      success: false,
      message: 'Longitude invalide (doit être entre -180 et 180)'
    });
  }

  if (latitude && (isNaN(latitude) || latitude < -90 || latitude > 90)) {
    return res.status(400).json({
      success: false,
      message: 'Latitude invalide (doit être entre -90 et 90)'
    });
  }

  if (rayon && (isNaN(rayon) || rayon < 0 || rayon > 1000)) {
    return res.status(400).json({
      success: false,
      message: 'Rayon invalide (doit être entre 0 et 1000 km)'
    });
  }

  next();
};

// Logger pour le debugging
const loggerEvenements = (req, res, next) => {
  console.log(`🎉 [EVENEMENTS] ${req.method} ${req.originalUrl} - User: ${req.user?.id || 'Anonymous'}`);
  next();
};

router.use(loggerEvenements);

/**
 * @swagger
 * components:
 *   schemas:
 *     Evenement:
 *       type: object
 *       required:
 *         - nom
 *         - description
 *         - typeEvenement
 *         - dateDebut
 *         - dateFin
 *         - lieu
 *       properties:
 *         _id:
 *           type: string
 *         nom:
 *           type: string
 *           maxLength: 200
 *         description:
 *           type: string
 *           maxLength: 2000
 *         typeEvenement:
 *           type: string
 *           enum: [SPORT, CONCERT, FESTIVAL, CONFERENCE]
 *         dateDebut:
 *           type: string
 *           format: date-time
 *         dateFin:
 *           type: string
 *           format: date-time
 *         lieu:
 *           type: object
 *         statutEvenement:
 *           type: string
 *           enum: [PROGRAMME, EN_COURS, TERMINE, ANNULE]
 *         sourceDetection:
 *           type: string
 *           enum: [MANUEL, AUTOMATIQUE, API_EXTERNE]
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 */

/**
 * @swagger
 * tags:
 *   - name: Événements - CREATE
 *     description: Création d'événements et groupes de covoiturage
 *   - name: Événements - READ
 *     description: Consultation des événements
 *   - name: Événements - UPDATE
 *     description: Modification des événements
 *   - name: Événements - DELETE
 *     description: Suppression et annulation
 *   - name: Événements - ADMIN
 *     description: Administration et détection automatique
 *   - name: Événements - STATS
 *     description: Statistiques et analytics
 *   - name: Événements - FAVORIS
 *     description: Gestion des favoris utilisateur
 *   - name: Événements - SOCIAL
 *     description: Partage social
 *   - name: Événements - NOTIFICATIONS
 *     description: Rappels et notifications
 *   - name: Événements - EXPORT
 *     description: Export de données
 *   - name: Événements - TRAJETS
 *     description: Trajets automatiques
 */

// ===============================================
// ROUTES ADMIN (Détection Auto, Maintenance)
// ===============================================

// Lancer la détection automatique d'événements
router.post('/admin/detecter-automatique', protect, evenementController.lancerDetectionAutomatique);

// Nettoyer les événements passés
router.delete('/admin/nettoyer-passes', protect, evenementController.nettoyerEvenementsPasses);

// Mettre à jour les statuts automatiquement
router.patch('/admin/maj-statuts-auto', protect, evenementController.mettreAJourStatutsAuto);

// ===============================================
// ROUTES STATS & ANALYTICS
// ===============================================

// Obtenir les statistiques
router.get('/statistiques', evenementController.obtenirStatistiques);

// Obtenir les événements populaires
router.get('/populaires', evenementController.obtenirEvenementsPopulaires);

// ===============================================
// ROUTES FAVORIS
// ===============================================

// Obtenir les favoris de l'utilisateur
router.get('/favoris', protect, evenementController.obtenirFavoris);

// ===============================================
// ROUTES EXPORT
// ===============================================

// Exporter les événements (CSV ou JSON)
router.get('/export', evenementController.exporterEvenements);

// ===============================================
// ROUTES RECOMMANDATIONS & PERSONNALISATION
// ===============================================

// Obtenir des recommandations personnalisées
router.get('/recommandations', protect, evenementController.obtenirRecommandations);

// ===============================================
// ROUTES QUARTIERS ABIDJAN
// ===============================================

// Obtenir les événements par quartier d'Abidjan
router.get('/quartier/:commune', evenementController.obtenirEvenementsParQuartier);

// ===============================================
// ROUTES CREATE
// ===============================================

// Créer un événement manuellement
router.post('/creer-manuel', protect, evenementController.creerEvenementManuel);

// Importer des événements depuis une API externe
router.post('/import-api', protect, evenementController.importerEvenementsAPI);

// ===============================================
// ROUTES READ (Générales)
// ===============================================

// Obtenir les événements à venir
router.get('/a-venir', evenementController.obtenirEvenementsAVenir);

// Rechercher par localisation
router.get('/recherche-localisation', validerLocalisation, evenementController.rechercherParLocalisation);

// ===============================================
// ROUTES SPÉCIFIQUES À UN ÉVÉNEMENT
// ===============================================

// Valider la cohérence d'un événement (ADMIN)
router.get('/:id/valider', protect, validerIdEvenement, evenementController.validerCoherence);

// Vérifier les conflits d'horaire
router.get('/:id/conflits-horaire', protect, validerIdEvenement, evenementController.verifierConflitsHoraire);

// Générer les liens de partage
router.get('/:id/partage', validerIdEvenement, evenementController.genererLienPartage);

// Obtenir les trajets associés
router.get('/:id/trajets', validerIdEvenement, evenementController.obtenirTrajetsAssocies);

// Proposer des trajets automatiques
router.get('/:id/trajets-proposes', validerIdEvenement, evenementController.proposerTrajetsAutomatiques);

// Obtenir les groupes de covoiturage
router.get('/:id/groupes-covoiturage', validerIdEvenement, evenementController.obtenirGroupesCovoiturage);

// Créer un groupe de covoiturage
router.post('/:id/groupes-covoiturage', protect, validerIdEvenement, evenementController.creerGroupeCovoiturage);

// Envoyer un rappel pour l'événement
router.post('/:id/rappel', protect, validerIdEvenement, evenementController.envoyerRappelEvenement);

// Ajouter aux favoris
router.post('/:id/favoris', protect, validerIdEvenement, evenementController.ajouterAuxFavoris);

// Retirer des favoris
router.delete('/:id/favoris', protect, validerIdEvenement, evenementController.retirerDesFavoris);

// Modifier les détails d'un événement
router.put('/:id', protect, validerIdEvenement, evenementController.modifierDetailsEvenement);

// Mettre à jour le statut
router.patch('/:id/statut', protect, validerIdEvenement, evenementController.mettreAJourStatut);

// Annuler un événement
router.patch('/:id/annuler', protect, validerIdEvenement, evenementController.annulerEvenement);

// Obtenir un événement spécifique
router.get('/:id', validerIdEvenement, evenementController.obtenirEvenement);

// ===============================================
// ROUTES GROUPES DE COVOITURAGE
// ===============================================

// Créer un trajet depuis un groupe
router.post(
  '/:id/groupes-covoiturage/:groupeId/creer-trajet', 
  protect, 
  validerIdEvenement, 
  validerIdGroupe, 
  evenementController.creerTrajetDepuisGroupe
);

// Modifier un groupe de covoiturage
router.put(
  '/:id/groupes-covoiturage/:groupeId', 
  protect, 
  validerIdEvenement, 
  validerIdGroupe, 
  evenementController.modifierGroupeCovoiturage
);

// Rejoindre un groupe de covoiturage
router.post(
  '/:id/groupes-covoiturage/:groupeId/rejoindre', 
  protect, 
  validerIdEvenement, 
  validerIdGroupe, 
  evenementController.rejoindreGroupeCovoiturage
);

// Quitter un groupe de covoiturage
router.delete(
  '/:id/groupes-covoiturage/:groupeId/quitter', 
  protect, 
  validerIdEvenement, 
  validerIdGroupe, 
  evenementController.quitterGroupeCovoiturage
);

// Supprimer un groupe de covoiturage
router.delete(
  '/:id/groupes-covoiturage/:groupeId', 
  protect, 
  validerIdEvenement, 
  validerIdGroupe, 
  evenementController.supprimerGroupeCovoiturage
);

// ===============================================
// ROUTE GÉNÉRALE (DOIT ÊTRE EN DERNIER)
// ===============================================

// Obtenir tous les événements (doit être en dernier des GET)
router.get('/', evenementController.obtenirTousEvenements);

// ===============================================
// ROUTE DE TEST (DÉVELOPPEMENT)
// ===============================================

router.get('/test/structure', (req, res) => {
  res.json({
    success: true,
    message: 'API Événements opérationnelle - Version Complète',
    version: '2.0.0',
    routes_disponibles: {
      admin: [
        'POST /admin/detecter-automatique - Détection automatique',
        'DELETE /admin/nettoyer-passes - Nettoyage événements passés',
        'PATCH /admin/maj-statuts-auto - MAJ statuts automatique'
      ],
      stats: [
        'GET /statistiques - Statistiques événements',
        'GET /populaires - Événements populaires'
      ],
      favoris: [
        'GET /favoris - Liste favoris utilisateur',
        'POST /:id/favoris - Ajouter aux favoris',
        'DELETE /:id/favoris - Retirer des favoris'
      ],
      personnalisation: [
        'GET /recommandations - Recommandations personnalisées',
        'GET /quartier/:commune - Événements par quartier Abidjan'
      ],
      create: [
        'POST /creer-manuel - Créer événement manuel',
        'POST /import-api - Import événements API externe',
        'POST /:id/groupes-covoiturage - Créer groupe covoiturage'
      ],
      read: [
        'GET /a-venir - Événements à venir',
        'GET /recherche-localisation - Recherche par localisation',
        'GET /:id/trajets - Trajets associés',
        'GET /:id/trajets-proposes - Trajets proposés automatiquement',
        'GET /:id/groupes-covoiturage - Groupes covoiturage',
        'GET /:id/conflits-horaire - Vérifier conflits horaire',
        'GET /:id/partage - Liens de partage',
        'GET /:id/valider - Valider cohérence (ADMIN)',
        'GET /:id - Événement spécifique',
        'GET / - Tous les événements'
      ],
      update: [
        'PUT /:id - Modifier détails événement',
        'PATCH /:id/statut - Mettre à jour statut',
        'PUT /:id/groupes-covoiturage/:groupeId - Modifier groupe',
        'POST /:id/groupes-covoiturage/:groupeId/rejoindre - Rejoindre groupe',
        'DELETE /:id/groupes-covoiturage/:groupeId/quitter - Quitter groupe'
      ],
      delete: [
        'PATCH /:id/annuler - Annuler événement',
        'DELETE /:id/groupes-covoiturage/:groupeId - Supprimer groupe'
      ],
      notifications: [
        'POST /:id/rappel - Envoyer rappel événement'
      ],
      export: [
        'GET /export - Exporter événements (CSV/JSON)'
      ],
      trajets: [
        'POST /:id/groupes-covoiturage/:groupeId/creer-trajet - Créer trajet auto',
        'GET /:id/trajets-proposes - Proposer trajets'
      ]
    },
    nouvelles_fonctionnalites: {
      '✅ Détection automatique': 'Importe événements depuis APIs externes',
      '✅ Favoris': 'Gestion favoris utilisateur',
      '✅ Recommandations': 'Suggestions personnalisées',
      '✅ Quartiers Abidjan': 'Recherche par commune/quartier',
      '✅ Conflits horaire': 'Vérification automatique',
      '✅ Partage social': 'Génération liens WhatsApp/Facebook',
      '✅ Rappels': 'Notifications automatiques',
      '✅ Export': 'CSV et JSON',
      '✅ Statistiques': 'Analytics avancés',
      '✅ Trajets auto': 'Création et proposition automatiques',
      '✅ Validation': 'Cohérence des données',
      '✅ Maintenance': 'Nettoyage et MAJ automatiques'
    },
    middlewares: {
      auth: typeof protect === 'function',
      validation: true,
      logging: true
    },
    total_routes: Object.keys(router.stack).length
  });
});

// ===============================================
// GESTION D'ERREURS
// ===============================================

router.use((error, req, res, next) => {
  console.error(`💥 [EVENEMENTS] Erreur ${req.method} ${req.originalUrl}:`, {
    message: error.message,
    stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    user: req.user?.id,
    params: req.params,
    query: req.query,
    timestamp: new Date().toISOString()
  });

  // Erreurs de validation MongoDB
  if (error.name === 'ValidationError') {
    const errors = Object.values(error.errors).map(err => ({
      field: err.path,
      message: err.message
    }));
    return res.status(400).json({
      success: false,
      message: 'Erreurs de validation',
      errors
    });
  }

  // Erreur de cast (ID invalide)
  if (error.name === 'CastError') {
    return res.status(400).json({
      success: false,
      message: 'ID invalide',
      details: `${error.path}: ${error.value}`
    });
  }

  // Erreur de duplication
  if (error.code === 11000) {
    return res.status(400).json({
      success: false,
      message: 'Données dupliquées',
      details: error.keyPattern
    });
  }

  // Erreurs spécifiques aux événements
  if (error.message?.includes('Événement non trouvé')) {
    return res.status(404).json({
      success: false,
      message: 'Événement non trouvé'
    });
  }

  if (error.message?.includes('Non autorisé')) {
    return res.status(403).json({
      success: false,
      message: 'Action non autorisée'
    });
  }

  // Passer au gestionnaire d'erreurs global
  next(error);
});

module.exports = router;