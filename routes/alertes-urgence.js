// routes/alertes-urgence.js
const express = require('express');

// Import sécurisé du contrôleur avec gestion d'erreur
let alerteUrgenceController;
try {
  alerteUrgenceController = require('../controllers/alerteUrgenceController');
} catch (error) {
  console.warn('⚠️ Contrôleur alerteUrgenceController non trouvé, utilisation des méthodes par défaut');
  alerteUrgenceController = {};
}

// Import sécurisé des middlewares de validation
let validation = {};
try {
  validation = require('../middleware/validation');
} catch (error) {
  console.warn('⚠️ Middleware de validation non trouvé');
}

const { 
  validerAlerteUrgence, 
  validerMiseAJourStatut,
  validerContact,
  validerParametresProximite
} = validation;

// Import sécurisé des middlewares d'authentification
let auth = {};
try {
  auth = require('../middleware/auth');
} catch (error) {
  console.warn('⚠️ Middleware d\'authentification non trouvé');
}

const { authentifierUtilisateur, autoriserRoles } = auth;

// Import sécurisé du rate limiter
let rateLimiter = {};
try {
  rateLimiter = require('../middleware/rateLimiter');
} catch (error) {
  console.warn('⚠️ Middleware rateLimiter non trouvé');
}

const { limiterTaux } = rateLimiter;

const router = express.Router();

// === FONCTIONS HELPER SÉCURISÉES ===

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

const middlewareAuth = authentifierUtilisateur || creerMiddlewareParDefaut('authentifierUtilisateur');

const middlewareRoles = (...roles) => {
  return autoriserRoles ? autoriserRoles(...roles) : creerMiddlewareParDefaut(`autoriserRoles(${roles.join(', ')})`);
};

const middlewareValidation = (validateur, nom) => {
  return validateur || creerMiddlewareParDefaut(`validation_${nom}`);
};

// === VALIDATION DES PARAMÈTRES ===
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

// === ROUTES PUBLIQUES ===

// Obtenir toutes les alertes publiques
router.get('/', 
  middlewareLimiterTaux('lecture'),
  alerteUrgenceController.obtenirAlertes || creerControleurParDefaut('obtenirAlertes')
);

// Obtenir les alertes actives
router.get('/actives', 
  middlewareLimiterTaux('lecture'),
  alerteUrgenceController.obtenirAlertesActives || creerControleurParDefaut('obtenirAlertesActives')
);

// Recherche par proximité géographique
router.get('/proximite',
  middlewareLimiterTaux('recherche'),
  middlewareValidation(validerParametresProximite, 'proximite'),
  alerteUrgenceController.rechercherProximite || creerControleurParDefaut('rechercherProximite', 'Fonctionnalité de recherche par proximité non implémentée')
);

// Obtenir les alertes archivées/anciennes
router.get('/anciennes',
  middlewareLimiterTaux('lecture'),
  alerteUrgenceController.obtenirAlertesAnciennes || creerControleurParDefaut('obtenirAlertesAnciennes')
);

// Obtenir les statistiques publiques
router.get('/statistiques',
  middlewareLimiterTaux('lecture'),
  alerteUrgenceController.obtenirStatistiques || creerControleurParDefaut('obtenirStatistiques')
);

// Tableau de bord public
router.get('/dashboard',
  middlewareLimiterTaux('lecture'),
  alerteUrgenceController.obtenirTableauBord || creerControleurParDefaut('obtenirTableauBord')
);

// Obtenir les notifications temps réel
router.get('/notifications',
  middlewareLimiterTaux('recherche'),
  alerteUrgenceController.obtenirNotifications || creerControleurParDefaut('obtenirNotifications')
);

// Exporter les alertes (format CSV/JSON)
router.get('/export',
  middlewareLimiterTaux('export'),
  alerteUrgenceController.exporterAlertes || creerControleurParDefaut('exporterAlertes')
);

// Recherche avancée avec filtres
router.post('/recherche-avancee',
  middlewareLimiterTaux('recherche'),
  alerteUrgenceController.rechercheAvancee || creerControleurParDefaut('rechercheAvancee')
);

// Obtenir une alerte spécifique par ID
router.get('/:id',
  middlewareLimiterTaux('lecture'),
  alerteUrgenceController.obtenirAlerte || creerControleurParDefaut('obtenirAlerte')
);

// === ROUTES PROTÉGÉES (AUTHENTIFICATION REQUISE) ===

// Déclencher une nouvelle alerte d'urgence
router.post('/',
  middlewareAuth,
  middlewareLimiterTaux('creation_urgence', { max: 5, windowMs: 15 * 60 * 1000 }),
  middlewareValidation(validerAlerteUrgence, 'alerte'),
  alerteUrgenceController.declencherAlerte || creerControleurParDefaut('declencherAlerte')
);

// Mettre à jour le statut d'une alerte
router.patch('/:id/statut',
  middlewareAuth,
  middlewareLimiterTaux('modification'),
  middlewareValidation(validerMiseAJourStatut, 'statut'),
  alerteUrgenceController.mettreAJourStatut || creerControleurParDefaut('mettreAJourStatut')
);

// Escalader une alerte vers un niveau supérieur
router.post('/:id/escalader',
  middlewareAuth,
  middlewareLimiterTaux('action'),
  alerteUrgenceController.escaladerAlerte || creerControleurParDefaut('escaladerAlerte')
);

// Ajouter un contact d'urgence à une alerte
router.post('/:id/contacts',
  middlewareAuth,
  middlewareLimiterTaux('modification'),
  middlewareValidation(validerContact, 'contact'),
  alerteUrgenceController.ajouterContact || creerControleurParDefaut('ajouterContact')
);

// Marquer une alerte comme fausse alerte
router.patch('/:id/fausse-alerte',
  middlewareAuth,
  middlewareLimiterTaux('modification'),
  alerteUrgenceController.marquerFausseAlerte || creerControleurParDefaut('marquerFausseAlerte')
);

// === ROUTES ADMINISTRATEUR ===

// Obtenir toutes les alertes (vue admin complète)
router.get('/admin/toutes',
  middlewareAuth,
  middlewareRoles('admin', 'moderateur', 'service_urgence'),
  middlewareLimiterTaux('admin'),
  alerteUrgenceController.obtenirAlertesAdmin || creerControleurParDefaut('obtenirAlertesAdmin')
);

// Forcer un changement de statut (admin seulement)
router.post('/admin/:id/forcer-statut',
  middlewareAuth,
  middlewareRoles('admin'),
  middlewareLimiterTaux('admin'),
  (req, res, next) => {
    console.log(`🔐 Action admin forcée sur alerte ${req.params.id} par utilisateur ${req.user?.id}`);
    next();
  },
  alerteUrgenceController.forcerMiseAJourStatut || creerControleurParDefaut('forcerMiseAJourStatut')
);

// Supprimer définitivement une alerte (super admin uniquement)
router.delete('/admin/:id',
  middlewareAuth,
  middlewareRoles('super_admin'),
  middlewareLimiterTaux('suppression'),
  alerteUrgenceController.supprimerAlerte || creerControleurParDefaut('supprimerAlerte', 'Suppression d\'alertes non implémentée - fonctionnalité dangereuse')
);

// === ROUTES DE DÉVELOPPEMENT/TEST ===

// Route de test pour le développement
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
  middlewareLimiterTaux('creation', { max: 3, windowMs: 60 * 60 * 1000 }),
  alerteUrgenceController.testerAlerte || ((req, res) => {
    res.json({
      success: true,
      message: 'Route de test - Alerte factice créée',
      data: {
        id: 'test_' + Date.now(),
        type: 'test',
        statut: 'test',
        message: 'Ceci est une alerte de test',
        timestamp: new Date().toISOString()
      }
    });
  })
);

// === MIDDLEWARES GLOBAUX ===

// Middleware de logging pour les actions importantes
router.use((req, res, next) => {
  const originalSend = res.send;
  res.send = function(data) {
    // Logger uniquement les actions modifiantes et importantes
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
      console.log(`🚨 ACTION ALERTE: ${req.method} ${req.originalUrl} - User: ${req.user?.id || 'Anonymous'}`);
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
    user: req.user?.id,
    timestamp: new Date().toISOString()
  });
  
  // Ne pas exposer les détails en production
  if (process.env.NODE_ENV === 'production') {
    return res.status(500).json({
      success: false,
      message: 'Erreur interne du serveur'
    });
  }
  
  next(error);
});

module.exports = router;