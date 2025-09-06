const express = require('express');
const router = express.Router();
const { uploadSingle } = require('../uploads/photos');
const { uploadDocument } = require('../uploads/documents');
const {
  creerUtilisateur,
  obtenirProfilComplet,
  obtenirProfilPublic,
  mettreAJourProfil,
  changerMotDePasse,
  uploadPhotoProfil,
  uploadDocumentIdentite,
  obtenirStatistiques,
  mettreAJourCoordonnees,
  rechercherUtilisateurs,
  supprimerCompte,
  obtenirTousLesUtilisateurs,
  obtenirStatistiquesGlobales,
  // NOUVELLES FONCTIONS PORTEFEUILLE
  obtenirPortefeuille,
  obtenirHistoriquePortefeuille,
  configurerParametresRetrait,
  verifierLimitesRetrait,
  crediterPortefeuilleManuel,
  obtenirStatistiquesPortefeuillesGlobales,
  obtenirUtilisateursSoldeEleve,
  obtenirTransactionsSuspectes,
  obtenirPortefeuilleUtilisateur,
  gererMontantBloque
} = require('../controllers/utilisateurController');

const { protect, roleMiddleware } = require('../middlewares/authMiddleware');

// Validation schemas
const { body, param, query, validationResult } = require('express-validator');

// Middleware pour vérifier les erreurs de validation
const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Erreur de validation',
      errors: errors.array()
    });
  }
  next();
};

// Schéma de validation pour la création d'utilisateur
const validateUserCreation = [
  body('email').isEmail().withMessage('Email invalide').normalizeEmail(),
  body('telephone').matches(/^(\+225)?[0-9]{8,10}$/).withMessage('Numéro de téléphone invalide'),
  body('motDePasse').isLength({ min: 8 }).withMessage('Le mot de passe doit contenir au moins 8 caractères')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).withMessage('Le mot de passe doit contenir au moins une majuscule, une minuscule et un chiffre'),
  body('nom').isLength({ min: 2, max: 50 }).withMessage('Le nom doit contenir entre 2 et 50 caractères').trim(),
  body('prenom').isLength({ min: 2, max: 50 }).withMessage('Le prénom doit contenir entre 2 et 50 caractères').trim(),
  body('dateNaissance').optional().isISO8601().withMessage('Date de naissance invalide'),
  body('sexe').optional().isIn(['M', 'F']).withMessage('Le sexe doit être M ou F'),
  body('adresse.commune').optional().notEmpty().withMessage('La commune ne peut être vide').trim(),
  body('adresse.quartier').optional().notEmpty().withMessage('Le quartier ne peut être vide').trim(),
  body('adresse.ville').optional().trim(),
  validateRequest
];

// Schéma de validation pour la mise à jour du profil
const validateProfileUpdate = [
  body('nom').optional().isLength({ min: 2, max: 50 }).withMessage('Le nom doit contenir entre 2 et 50 caractères').trim(),
  body('prenom').optional().isLength({ min: 2, max: 50 }).withMessage('Le prénom doit contenir entre 2 et 50 caractères').trim(),
  body('telephone').optional().matches(/^(\+225)?[0-9]{8,10}$/).withMessage('Numéro de téléphone invalide'),
  body('dateNaissance').optional().isISO8601().withMessage('Date de naissance invalide'),
  body('sexe').optional().isIn(['M', 'F']).withMessage('Le sexe doit être M ou F'),
  body('adresse.commune').optional().notEmpty().withMessage('La commune ne peut être vide').trim(),
  body('adresse.quartier').optional().notEmpty().withMessage('Le quartier ne peut être vide').trim(),
  body('adresse.ville').optional().trim(),
  body('preferences.conversation').optional().isIn(['BAVARD', 'CALME', 'NEUTRE']).withMessage('Préférence de conversation invalide'),
  body('preferences.languePreferee').optional().isIn(['FR', 'ANG']).withMessage('Langue préférée invalide'),
  validateRequest
];

// Schéma de validation pour le changement de mot de passe
const validatePasswordChange = [
  body('ancienMotDePasse').notEmpty().withMessage('L\'ancien mot de passe est requis'),
  body('nouveauMotDePasse').isLength({ min: 8 }).withMessage('Le nouveau mot de passe doit contenir au moins 8 caractères')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).withMessage('Le nouveau mot de passe doit contenir au moins une majuscule, une minuscule et un chiffre'),
  validateRequest
];

// Schéma de validation pour l'upload de document
const validateDocumentUpload = [
  body('type').isIn(['CNI', 'PASSEPORT']).withMessage('Type de document invalide'),
  body('numero').notEmpty().withMessage('Le numéro du document est requis'),
  validateRequest
];

// Schéma de validation pour les coordonnées
const validateCoordinates = [
  body('longitude').isFloat({ min: -180, max: 180 }).withMessage('Longitude invalide'),
  body('latitude').isFloat({ min: -90, max: 90 }).withMessage('Latitude invalide'),
  validateRequest
];

// Schéma de validation pour la recherche
const validateSearch = [
  query('page').optional().isInt({ min: 1 }).withMessage('Le numéro de page doit être un entier positif'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('La limite doit être entre 1 et 100'),
  query('scoreMin').optional().isFloat({ min: 0, max: 5 }).withMessage('Le score minimum doit être entre 0 et 5'),
  query('longitude').optional().isFloat({ min: -180, max: 180 }).withMessage('Longitude invalide'),
  query('latitude').optional().isFloat({ min: -90, max: 90 }).withMessage('Latitude invalide'),
  query('rayon').optional().isInt({ min: 1, max: 100 }).withMessage('Le rayon doit être entre 1 et 100 km'),
  validateRequest
];

// Schéma de validation pour l'ID utilisateur
const validateUserId = [
  param('id').isMongoId().withMessage('ID utilisateur invalide'),
  validateRequest
];

// Schéma de validation pour la suppression de compte
const validateAccountDeletion = [
  body('motDePasse').notEmpty().withMessage('Le mot de passe est requis pour supprimer le compte'),
  validateRequest
];

// Schéma de validation pour les filtres admin
const validateAdminFilters = [
  query('page').optional().isInt({ min: 1 }).withMessage('Le numéro de page doit être un entier positif'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('La limite doit être entre 1 et 100'),
  query('statut').optional().isIn(['ACTIF', 'SUSPENDU', 'DESACTIVE']).withMessage('Statut invalide'),
  query('verification').optional().isIn(['verifie', 'non_verifie']).withMessage('Filtre de vérification invalide'),
  query('search').optional().isString().withMessage('Le terme de recherche doit être une chaîne'),
  validateRequest
];

// ===== NOUVELLES VALIDATIONS PORTEFEUILLE =====

// Validation pour la configuration des paramètres de retrait
const validateRetraitParams = [
  body('numeroMobile').matches(/^(\+225)?[0-9]{8,10}$/).withMessage('Numéro de téléphone invalide'),
  body('operateur').isIn(['ORANGE', 'MTN', 'MOOV']).withMessage('Opérateur doit être ORANGE, MTN ou MOOV'),
  body('nomTitulaire').isLength({ min: 2, max: 100 }).withMessage('Nom du titulaire requis (2-100 caractères)').trim(),
  validateRequest
];

// Validation pour vérifier les limites de retrait
const validateRetraitLimits = [
  query('montant').isFloat({ min: 0.01 }).withMessage('Montant doit être supérieur à 0'),
  validateRequest
];

// Validation pour l'historique du portefeuille
const validatePortefeuilleHistory = [
  query('type').optional().isIn(['CREDIT', 'DEBIT', 'RETRAIT', 'REMBOURSEMENT']).withMessage('Type de transaction invalide'),
  query('statut').optional().isIn(['PENDING', 'COMPLETE', 'FAILED']).withMessage('Statut de transaction invalide'),
  query('limit').optional().isInt({ min: 1, max: 200 }).withMessage('Limite doit être entre 1 et 200'),
  query('dateDebut').optional().isISO8601().withMessage('Date de début invalide'),
  query('dateFin').optional().isISO8601().withMessage('Date de fin invalide'),
  validateRequest
];

// Validation pour crédit manuel (admin)
const validateCreditManuel = [
  body('montant').isFloat({ min: 0.01 }).withMessage('Montant doit être supérieur à 0'),
  body('description').isLength({ min: 5, max: 200 }).withMessage('Description requise (5-200 caractères)').trim(),
  validateRequest
];

// Validation pour gestion montant bloqué (admin)
const validateGestionMontantBloque = [
  body('action').isIn(['bloquer', 'debloquer']).withMessage('Action doit être "bloquer" ou "debloquer"'),
  body('montant').isFloat({ min: 0.01 }).withMessage('Montant doit être supérieur à 0'),
  body('description').optional().isLength({ max: 200 }).withMessage('Description trop longue (max 200 caractères)').trim(),
  validateRequest
];

// Validation pour les statistiques portefeuilles
const validatePortefeuilleStats = [
  query('seuilSolde').optional().isFloat({ min: 0 }).withMessage('Seuil de solde invalide'),
  validateRequest
];

// ===== ROUTES PUBLIQUES =====
// POST /api/utilisateurs - Créer un nouvel utilisateur (inscription)
router.post('/', validateUserCreation, creerUtilisateur);

// GET /api/utilisateurs/:id/public - Obtenir le profil public d'un utilisateur
router.get('/:id/public', validateUserId, obtenirProfilPublic);

// GET /api/utilisateurs/rechercher - Rechercher des utilisateurs
router.get('/rechercher', validateSearch, rechercherUtilisateurs);

// ===== ROUTES PROTÉGÉES (UTILISATEUR CONNECTÉ) =====
// GET /api/utilisateurs/profil - Obtenir son profil complet
router.get('/profil', protect, obtenirProfilComplet);

// PUT /api/utilisateurs/profil - Mettre à jour son profil
router.put('/profil', protect, validateProfileUpdate, mettreAJourProfil);

// POST /api/utilisateurs/profil - Créer/Mettre à jour son profil (alternative)
router.post('/profil', protect, validateProfileUpdate, mettreAJourProfil);

// PUT /api/utilisateurs/mot-de-passe - Changer son mot de passe
router.put('/mot-de-passe', protect, validatePasswordChange, changerMotDePasse);

// POST /api/utilisateurs/photo-profil - Upload photo de profil
router.post('/photo-profil', protect, uploadSingle, uploadPhotoProfil);

// POST /api/utilisateurs/document-identite - Upload document d'identité
router.post('/document-identite', protect, uploadDocument, validateDocumentUpload, uploadDocumentIdentite);

// GET /api/utilisateurs/statistiques - Obtenir ses propres statistiques
router.get('/statistiques', protect, obtenirStatistiques);

// PUT /api/utilisateurs/coordonnees - Mettre à jour ses coordonnées GPS
router.put('/coordonnees', protect, validateCoordinates, mettreAJourCoordonnees);

// DELETE /api/utilisateurs/compte - Supprimer son compte
router.delete('/compte', protect, validateAccountDeletion, supprimerCompte);

// ===== NOUVELLES ROUTES PORTEFEUILLE (UTILISATEUR) =====

// GET /api/utilisateurs/portefeuille - Obtenir son portefeuille
router.get('/portefeuille', protect, obtenirPortefeuille);

// GET /api/utilisateurs/portefeuille/historique - Obtenir l'historique de son portefeuille
router.get('/portefeuille/historique', protect, validatePortefeuilleHistory, obtenirHistoriquePortefeuille);

// POST /api/utilisateurs/portefeuille/parametres-retrait - Configurer les paramètres de retrait
router.post('/portefeuille/parametres-retrait', protect, validateRetraitParams, configurerParametresRetrait);

// GET /api/utilisateurs/portefeuille/verification-limites - Vérifier les limites de retrait
router.get('/portefeuille/verification-limites', protect, validateRetraitLimits, verifierLimitesRetrait);

// ===== ROUTES ADMINISTRATEUR =====
// GET /api/utilisateurs/admin/tous - Obtenir tous les utilisateurs (admin)
router.get('/admin/tous', protect, roleMiddleware(['admin', 'superadmin']), validateAdminFilters, obtenirTousLesUtilisateurs);

// GET /api/utilisateurs/admin/statistiques-globales - Statistiques globales (admin)
router.get('/admin/statistiques-globales', protect, roleMiddleware(['admin', 'superadmin']), obtenirStatistiquesGlobales);

// ===== NOUVELLES ROUTES PORTEFEUILLE (ADMIN) =====

// GET /api/utilisateurs/admin/portefeuilles/statistiques - Statistiques globales des portefeuilles (admin)
router.get('/admin/portefeuilles/statistiques', protect, roleMiddleware(['admin', 'superadmin']), obtenirStatistiquesPortefeuillesGlobales);

// GET /api/utilisateurs/admin/portefeuilles/solde-eleve - Utilisateurs avec solde élevé (admin)
router.get('/admin/portefeuilles/solde-eleve', protect, roleMiddleware(['admin', 'superadmin']), validatePortefeuilleStats, obtenirUtilisateursSoldeEleve);

// GET /api/utilisateurs/admin/portefeuilles/transactions-suspectes - Transactions suspectes (admin)
router.get('/admin/portefeuilles/transactions-suspectes', protect, roleMiddleware(['admin', 'superadmin']), obtenirTransactionsSuspectes);

// POST /api/utilisateurs/admin/:id/portefeuille/crediter - Créditer manuellement un portefeuille (admin)
router.post('/admin/:id/portefeuille/crediter', protect, roleMiddleware(['admin', 'superadmin']), validateUserId, validateCreditManuel, crediterPortefeuilleManuel);

// GET /api/utilisateurs/admin/:id/portefeuille - Obtenir le portefeuille d'un utilisateur (admin)
router.get('/admin/:id/portefeuille', protect, roleMiddleware(['admin', 'superadmin']), validateUserId, obtenirPortefeuilleUtilisateur);

// POST /api/utilisateurs/admin/:id/portefeuille/gerer-blocage - Bloquer/débloquer un montant (admin)
router.post('/admin/:id/portefeuille/gerer-blocage', protect, roleMiddleware(['admin', 'superadmin']), validateUserId, validateGestionMontantBloque, gererMontantBloque);

// ===== ROUTES DE GESTION UTILISATEUR =====
// Routes pour les actions sur des utilisateurs spécifiques (admin uniquement)
// GET /api/utilisateurs/:id - Obtenir les détails d'un utilisateur spécifique
router.get('/:id', protect, roleMiddleware(['admin', 'superadmin']), validateUserId, obtenirProfilComplet);

// PUT /api/utilisateurs/:id - Modifier un utilisateur spécifique (admin)
router.put('/:id', protect, roleMiddleware(['admin', 'superadmin']), validateUserId, validateProfileUpdate, mettreAJourProfil);

// DELETE /api/utilisateurs/:id - Supprimer un utilisateur (admin)
router.delete('/:id', protect, roleMiddleware(['admin', 'superadmin']), validateUserId, supprimerCompte);

module.exports = router;