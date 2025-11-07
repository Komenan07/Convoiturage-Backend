// routes/alertes-urgence.js
const express = require('express');

// =============== IMPORTS SÉCURISÉS ===============

// Import sécurisé du contrôleur avec gestion d'erreur
let alerteUrgenceController;
try {
  alerteUrgenceController = require('../controllers/alerteUrgenceController');
} catch (error) {
  console.warn('⚠️ Contrôleur alerteUrgenceController non trouvé, utilisation des méthodes par défaut');
  alerteUrgenceController = {};
}

// ✅ Import du nouveau middleware de validation
let validationAlerte = {};
try {
  validationAlerte = require('../middlewares/validation_alerte');
  console.log('✅ Middleware validation_alerte chargé avec succès');
} catch (error) {
  console.warn('⚠️ Middleware validation_alerte non trouvé:', error.message);
}

const {
  validationRulesDeclencherAlerte,
  handleValidationErrors,
  validationSupplementaireDeclencherAlerte,
  validationRulesMettreAJourStatut
} = validationAlerte;

// Import sécurisé des anciens validators (backup)
let validation = {};
try {
  validation = require('../utils/validators');
} catch (error) {
  console.warn('⚠️ Middlewares de validation utils non trouvé');
}

const { 
  validerAlerteUrgence, 
  validerMiseAJourStatut: validerStatutAncien,
  validerContact,
  validerParametresProximite
} = validation;

// Import sécurisé des middlewares d'authentification
let auth = {};
try {
  auth = require('../middlewares/authMiddleware');
} catch (error) {
  console.warn('⚠️ Middleware d\'authentification non trouvé');
}

const { authMiddleware, autoriserRoles } = auth;

// Import sécurisé du rate limiter
let rateLimiter = {};
try {
  rateLimiter = require('../middlewares/rateLimiter');
} catch (error) {
  console.warn('⚠️ Middleware rateLimiter non trouvé');
}

// Construire un shim limiterTaux à partir des rate limiters existants
let limiterTaux = null;
try {
  const { rateLimiters, basicRateLimiter } = rateLimiter;
  limiterTaux = (type, _options = {}) => {
    const map = {
      lecture: basicRateLimiter?.standard,
      recherche: basicRateLimiter?.standard,
      creation_urgence: rateLimiters?.alerteUrgence?.create,
      admin: basicRateLimiter?.strict,
      export: basicRateLimiter?.standard,
      modification: basicRateLimiter?.strict,
      action: basicRateLimiter?.strict,
      suppression: basicRateLimiter?.strict
    };
    return map[type] || ((_req, _res, next) => next());
  };
} catch (_e) {
  limiterTaux = null;
}

const router = express.Router();

// =============== FONCTIONS HELPER SÉCURISÉES ===============

// Fonction helper pour créer des middlewares par défaut
const creerMiddlewareParDefaut = (nom) => {
  return (req, res, next) => {
    console.warn(`⚠️ Middleware ${nom} non disponible, passage à l'étape suivante`);
    next();
  };
};

// Fonction helper pour créer des contrôleurs par défaut
const creerControleurParDefaut = (nomMethode, message = null) => {
  return (req, res) => {
    res.status(501).json({
      success: false,
      message: message || `Méthode ${nomMethode} non implémentée dans le contrôleur`,
      info: 'Cette fonctionnalité sera disponible dans une future version'
    });
  };
};

// Middlewares sécurisés
const middlewareLimiterTaux = (type, options = {}) => {
  return limiterTaux ? limiterTaux(type, options) : creerMiddlewareParDefaut(`limiterTaux(${type})`);
};

const middlewareAuth = authMiddleware || creerMiddlewareParDefaut('authMiddleware');

const middlewareRoles = (...roles) => {
  return autoriserRoles ? autoriserRoles(...roles) : creerMiddlewareParDefaut(`autoriserRoles(${roles.join(', ')})`);
};

const middlewareValidation = (validateur, nom) => {
  return validateur || creerMiddlewareParDefaut(`validation_${nom}`);
};

// =============== VALIDATION DES PARAMÈTRES ===============

// Middleware pour valider l'ID MongoDB
router.param('id', (req, res, next, id) => {
  if (!id.match(/^[0-9a-fA-F]{24}$/)) {
    return res.status(400).json({
      success: false,
      message: 'Format ID invalide'
    });
  }
  next();
});

router.param('contactId', (req, res, next, contactId) => {
  if (!contactId.match(/^[0-9a-fA-F]{24}$/)) {
    return res.status(400).json({
      success: false,
      message: 'Format contactId invalide'
    });
  }
  next();
});

// =============== ROUTES PUBLIQUES ===============

/**
 * @route   GET /api/alertes-urgence
 * @desc    Obtenir toutes les alertes avec pagination et filtres
 * @access  Public
 * @query   page, limit, statut, ville, typeAlerte, niveauGravite, dateDebut, dateFin
 */
router.get('/', 
  middlewareLimiterTaux('lecture'),
  alerteUrgenceController.obtenirAlertes || creerControleurParDefaut('obtenirAlertes')
);

/**
 * @route   GET /api/alertes-urgence/actives
 * @desc    Obtenir uniquement les alertes actives
 * @access  Public
 */
router.get('/actives', 
  middlewareLimiterTaux('lecture'),
  alerteUrgenceController.obtenirAlertesActives || creerControleurParDefaut('obtenirAlertesActives')
);

/**
 * @route   GET /api/alertes-urgence/covoiturage
 * @desc    Obtenir les alertes spécifiques au covoiturage
 * @access  Public
 */
router.get('/covoiturage',
  middlewareLimiterTaux('lecture'),
  alerteUrgenceController.obtenirAlertesCovoiturage || creerControleurParDefaut('obtenirAlertesCovoiturage')
);

/**
 * @route   GET /api/alertes-urgence/anciennes
 * @desc    Obtenir les alertes non résolues depuis 2h+
 * @access  Public
 */
router.get('/anciennes',
  middlewareLimiterTaux('lecture'),
  alerteUrgenceController.obtenirAlertesAnciennes || creerControleurParDefaut('obtenirAlertesAnciennes')
);

/**
 * @route   GET /api/alertes-urgence/proximite
 * @desc    Rechercher des alertes par proximité géographique
 * @access  Public
 * @query   longitude, latitude, rayon (en km, défaut: 50)
 */
router.get('/proximite',
  middlewareLimiterTaux('recherche'),
  middlewareValidation(validerParametresProximite, 'proximite'),
  alerteUrgenceController.rechercherProximite || creerControleurParDefaut('rechercherProximite')
);

/**
 * @route   POST /api/alertes-urgence/recherche-avancee
 * @desc    Recherche avancée avec filtres multiples
 * @access  Public
 * @body    types, gravites, statuts, villes, dateDebut, dateFin, prioriteMin, prioriteMax
 */
router.post('/recherche-avancee',
  middlewareLimiterTaux('recherche'),
  alerteUrgenceController.rechercheAvancee || creerControleurParDefaut('rechercheAvancee')
);

/**
 * @route   GET /api/alertes-urgence/statistiques
 * @desc    Obtenir les statistiques globales
 * @access  Public
 * @query   dateDebut, dateFin
 */
router.get('/statistiques',
  middlewareLimiterTaux('lecture'),
  alerteUrgenceController.obtenirStatistiques || creerControleurParDefaut('obtenirStatistiques')
);

/**
 * @route   GET /api/alertes-urgence/dashboard
 * @desc    Tableau de bord public temps réel
 * @access  Public
 */
router.get('/dashboard',
  middlewareLimiterTaux('lecture'),
  alerteUrgenceController.obtenirTableauBord || creerControleurParDefaut('obtenirTableauBord')
);

/**
 * @route   GET /api/alertes-urgence/notifications
 * @desc    Obtenir les notifications des 5 dernières minutes
 * @access  Public
 */
router.get('/notifications',
  middlewareLimiterTaux('recherche'),
  alerteUrgenceController.obtenirNotifications || creerControleurParDefaut('obtenirNotifications')
);

/**
 * @route   GET /api/alertes-urgence/export
 * @desc    Exporter les alertes en CSV ou JSON
 * @access  Public
 * @query   format (json|csv), dateDebut, dateFin, ville, statut
 */
router.get('/export',
  middlewareLimiterTaux('export'),
  alerteUrgenceController.exporterAlertes || creerControleurParDefaut('exporterAlertes')
);

/**
 * @route   GET /api/alertes-urgence/rapport
 * @desc    Générer un rapport d'activité détaillé
 * @access  Public
 * @query   dateDebut, dateFin, ville
 */
router.get('/rapport',
  middlewareLimiterTaux('lecture'),
  alerteUrgenceController.genererRapport || creerControleurParDefaut('genererRapport')
);

/**
 * @route   GET /api/alertes-urgence/:id
 * @desc    Obtenir une alerte spécifique par ID
 * @access  Public
 */
router.get('/:id',
  middlewareLimiterTaux('lecture'),
  alerteUrgenceController.obtenirAlerte || creerControleurParDefaut('obtenirAlerte')
);

// =============== ROUTES PROTÉGÉES (AUTHENTIFICATION REQUISE) ===============

/**
 * ✅ ROUTE MISE À JOUR AVEC VALIDATION EXPRESS-VALIDATOR
 * @route   POST /api/alertes-urgence
 * @desc    Déclencher une nouvelle alerte d'urgence
 * @access  Privé (Utilisateur authentifié)
 * @body    trajetId, typeAlerte, description, position, niveauGravite, ville, commune, etc.
 */
router.post('/',
  middlewareAuth,
  middlewareLimiterTaux('creation_urgence', { max: 5, windowMs: 15 * 60 * 1000 }),
  // ✅ Utiliser le nouveau middleware de validation si disponible
  ...(validationRulesDeclencherAlerte ? [
    ...validationRulesDeclencherAlerte,
    handleValidationErrors,
    validationSupplementaireDeclencherAlerte
  ] : [
    middlewareValidation(validerAlerteUrgence, 'alerte')
  ]),
  alerteUrgenceController.declencherAlerte || creerControleurParDefaut('declencherAlerte')
);

/**
 * ✅ NOUVELLE ROUTE - Obtenir mes alertes
 * @route   GET /api/alertes-urgence/mes-alertes
 * @desc    Obtenir les alertes de l'utilisateur connecté
 * @access  Privé
 * @query   page, limit, statut
 */
router.get('/mes-alertes',
  middlewareAuth,
  middlewareLimiterTaux('lecture'),
  alerteUrgenceController.obtenirMesAlertes || creerControleurParDefaut('obtenirMesAlertes')
);

/**
 * ✅ NOUVELLE ROUTE - Mes statistiques
 * @route   GET /api/alertes-urgence/mes-statistiques
 * @desc    Obtenir les statistiques personnelles de l'utilisateur
 * @access  Privé
 */
router.get('/mes-statistiques',
  middlewareAuth,
  middlewareLimiterTaux('lecture'),
  alerteUrgenceController.obtenirMesStatistiques || creerControleurParDefaut('obtenirMesStatistiques')
);

/**
 * ✅ ROUTE MISE À JOUR
 * @route   PATCH /api/alertes-urgence/:id/statut
 * @desc    Mettre à jour le statut d'une alerte
 * @access  Privé (Propriétaire de l'alerte)
 * @body    statutAlerte, commentaire (optionnel)
 */
router.patch('/:id/statut',
  middlewareAuth,
  middlewareLimiterTaux('modification'),
  // ✅ Utiliser le nouveau middleware de validation si disponible
  ...(validationRulesMettreAJourStatut ? [
    ...validationRulesMettreAJourStatut,
    handleValidationErrors
  ] : [
    middlewareValidation(validerStatutAncien, 'statut')
  ]),
  alerteUrgenceController.mettreAJourStatut || creerControleurParDefaut('mettreAJourStatut')
);

/**
 * @route   POST /api/alertes-urgence/:id/escalader
 * @desc    Escalader une alerte vers un niveau de gravité supérieur
 * @access  Privé (Propriétaire de l'alerte)
 */
router.post('/:id/escalader',
  middlewareAuth,
  middlewareLimiterTaux('action'),
  alerteUrgenceController.escaladerAlerte || creerControleurParDefaut('escaladerAlerte')
);

/**
 * @route   PATCH /api/alertes-urgence/:id/fausse-alerte
 * @desc    Marquer une alerte comme fausse alerte
 * @access  Privé (Propriétaire de l'alerte)
 * @body    raison
 */
router.patch('/:id/fausse-alerte',
  middlewareAuth,
  middlewareLimiterTaux('modification'),
  alerteUrgenceController.marquerFausseAlerte || creerControleurParDefaut('marquerFausseAlerte')
);

/**
 * @route   POST /api/alertes-urgence/:id/contacts
 * @desc    Ajouter un contact d'urgence à une alerte
 * @access  Privé (Propriétaire de l'alerte)
 * @body    nom, telephone, relation, canal
 */
router.post('/:id/contacts',
  middlewareAuth,
  middlewareLimiterTaux('modification'),
  middlewareValidation(validerContact, 'contact'),
  alerteUrgenceController.ajouterContact || creerControleurParDefaut('ajouterContact')
);

/**
 * @route   PATCH /api/alertes-urgence/:id/contacts/:contactId
 * @desc    Mettre à jour le statut d'un contact
 * @access  Privé (Propriétaire de l'alerte)
 * @body    statut (ENVOYE, RECU, ECHEC, EN_ATTENTE)
 */
router.patch('/:id/contacts/:contactId',
  middlewareAuth,
  middlewareLimiterTaux('modification'),
  alerteUrgenceController.mettreAJourStatutContact || creerControleurParDefaut('mettreAJourStatutContact')
);

// =============== ROUTES ADMINISTRATEUR ===============

/**
 * @route   GET /api/alertes-urgence/admin/toutes
 * @desc    Obtenir toutes les alertes (vue admin complète)
 * @access  Admin uniquement
 * @query   page, limit
 */
router.get('/admin/toutes',
  middlewareAuth,
  middlewareRoles('admin', 'superadmin', 'moderateur', 'service_urgence'),
  middlewareLimiterTaux('admin'),
  alerteUrgenceController.obtenirAlertesAdmin || creerControleurParDefaut('obtenirAlertesAdmin')
);

/**
 * @route   GET /api/alertes-urgence/admin/statistiques-avancees
 * @desc    Obtenir des statistiques avancées
 * @access  Admin uniquement
 * @query   dateDebut, dateFin
 */
router.get('/admin/statistiques-avancees',
  middlewareAuth,
  middlewareRoles('admin', 'superadmin'),
  middlewareLimiterTaux('admin'),
  alerteUrgenceController.obtenirStatistiquesAvancees || creerControleurParDefaut('obtenirStatistiquesAvancees')
);

/**
 * @route   PATCH /api/alertes-urgence/admin/:id/statut
 * @desc    Forcer la mise à jour du statut d'une alerte (pouvoir admin)
 * @access  Admin uniquement
 * @body    statutAlerte, commentaire
 */
router.patch('/admin/:id/statut',
  middlewareAuth,
  middlewareRoles('admin', 'superadmin'),
  middlewareLimiterTaux('admin'),
  (req, res, next) => {
    console.log(`🔐 Action admin forcée sur alerte ${req.params.id} par utilisateur ${req.user?.userId || req.user?.id}`);
    next();
  },
  alerteUrgenceController.forcerMiseAJourStatut || creerControleurParDefaut('forcerMiseAJourStatut')
);

/**
 * @route   DELETE /api/alertes-urgence/admin/:id
 * @desc    Supprimer définitivement une alerte
 * @access  Super Admin uniquement
 */
router.delete('/admin/:id',
  middlewareAuth,
  middlewareRoles('superadmin'),
  middlewareLimiterTaux('suppression'),
  alerteUrgenceController.supprimerAlerte || creerControleurParDefaut('supprimerAlerte', 'Suppression d\'alertes non implémentée - fonctionnalité dangereuse')
);

// =============== ROUTES DE DÉVELOPPEMENT/TEST ===============

/**
 * @route   POST /api/alertes-urgence/test
 * @desc    Route de test pour le développement uniquement
 * @access  Privé (Dev uniquement)
 */
router.post('/test',
  // Vérification de l'environnement en premier
  (req, res, next) => {
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({
        success: false,
        message: 'Routes de test non disponibles en production'
      });
    }
    next();
  },
  middlewareAuth,
  middlewareLimiterTaux('creation_urgence', { max: 3, windowMs: 60 * 60 * 1000 }),
  alerteUrgenceController.testerAlerte || ((req, res) => {
    res.json({
      success: true,
      message: 'Route de test - Alerte factice créée',
      data: {
        id: 'test_' + Date.now(),
        numeroUrgence: 'URG-TEST-' + Date.now(),
        type: 'test',
        statut: 'test',
        message: 'Ceci est une alerte de test',
        timestamp: new Date().toISOString(),
        servicesUrgenceCI: {
          police: '110 / 111',
          pompiers: '180',
          ambulance: '185',
          samu: '185'
        }
      }
    });
  })
);

// =============== MIDDLEWARES GLOBAUX ===============

// Middleware de logging pour les actions importantes
router.use((req, res, next) => {
  const originalSend = res.send;
  res.send = function(data) {
    // Logger uniquement les actions modifiantes et importantes
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      console.log(`🚨 ACTION ALERTE: ${req.method} ${req.originalUrl} - User: ${req.user?.userId || req.user?.id || 'Anonymous'}`);
    }
    return originalSend.call(this, data);
  };
  next();
});

// Middleware de gestion des erreurs spécifique aux alertes
router.use((error, req, res, next) => {
  console.error(`💥 ERREUR ALERTE [${req.method} ${req.originalUrl}]:`, {
    message: error.message,
    stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    user: req.user?.userId || req.user?.id,
    timestamp: new Date().toISOString()
  });
  
  // Ne pas exposer les détails en production
  if (process.env.NODE_ENV === 'production') {
    return res.status(500).json({
      success: false,
      message: 'Erreur interne du serveur'
    });
  }
  
  return next(error);
});

module.exports = router;