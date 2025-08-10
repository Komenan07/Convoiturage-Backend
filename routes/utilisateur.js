const express = require('express');
const router = express.Router();

// Importation des contrôleurs
const {
  creerUtilisateur,
  obtenirProfilComplet,
  obtenirProfilPublic,
  rechercherUtilisateurs,
  mettreAJourProfil,
  changerMotDePasse,
  uploadPhotoProfil,
  uploadDocumentIdentite,
  obtenirStatistiques,
  mettreAJourCoordonnees,
  supprimerCompte,
  obtenirTousLesUtilisateurs,
  obtenirStatistiquesGlobales
} = require('../controllers/utilisateurController');

// Importation des middlewares
const { protect, authorize } = require('../middleware/authMiddleware');
const { validateRequest } = require('../utils/validators');

// Validation schemas
const { body, param, query } = require('express-validator');

// Schémas de validation
const validateUserCreation = [
  body('email')
    .isEmail()
    .withMessage('Email invalide')
    .normalizeEmail(),
  body('telephone')
    .matches(/^(\+225)?[0-9]{8,10}$/)
    .withMessage('Numéro de téléphone invalide'),
  body('motDePasse')
    .isLength({ min: 8 })
    .withMessage('Le mot de passe doit contenir au moins 8 caractères')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Le mot de passe doit contenir au moins une majuscule, une minuscule et un chiffre'),
  body('nom')
    .isLength({ min: 2, max: 50 })
    .withMessage('Le nom doit contenir entre 2 et 50 caractères')
    .trim(),
  body('prenom')
    .isLength({ min: 2, max: 50 })
    .withMessage('Le prénom doit contenir entre 2 et 50 caractères')
    .trim(),
  body('dateNaissance')
    .isISO8601()
    .withMessage('Date de naissance invalide'),
  body('sexe')
    .isIn(['M', 'F'])
    .withMessage('Le sexe doit être M ou F'),
  body('adresse.commune')
    .notEmpty()
    .withMessage('La commune est requise')
    .trim(),
  body('adresse.quartier')
    .notEmpty()
    .withMessage('Le quartier est requis')
    .trim(),
  body('adresse.ville')
    .optional()
    .trim(),
  validateRequest
];

const validateProfileUpdate = [
  body('nom')
    .optional()
    .isLength({ min: 2, max: 50 })
    .withMessage('Le nom doit contenir entre 2 et 50 caractères')
    .trim(),
  body('prenom')
    .optional()
    .isLength({ min: 2, max: 50 })
    .withMessage('Le prénom doit contenir entre 2 et 50 caractères')
    .trim(),
  body('telephone')
    .optional()
    .matches(/^(\+225)?[0-9]{8,10}$/)
    .withMessage('Numéro de téléphone invalide'),
  body('adresse.commune')
    .optional()
    .notEmpty()
    .withMessage('La commune ne peut être vide')
    .trim(),
  body('adresse.quartier')
    .optional()
    .notEmpty()
    .withMessage('Le quartier ne peut être vide')
    .trim(),
  body('preferences.conversation')
    .optional()
    .isIn(['BAVARD', 'CALME', 'NEUTRE'])
    .withMessage('Préférence de conversation invalide'),
  body('preferences.languePreferee')
    .optional()
    .isIn(['FR', 'ANG'])
    .withMessage('Langue préférée invalide'),
  validateRequest
];

const validatePasswordChange = [
  body('ancienMotDePasse')
    .notEmpty()
    .withMessage('L\'ancien mot de passe est requis'),
  body('nouveauMotDePasse')
    .isLength({ min: 8 })
    .withMessage('Le nouveau mot de passe doit contenir au moins 8 caractères')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Le nouveau mot de passe doit contenir au moins une majuscule, une minuscule et un chiffre'),
  validateRequest
];

const validateDocumentUpload = [
  body('type')
    .isIn(['CNI', 'PASSEPORT'])
    .withMessage('Type de document invalide'),
  body('numero')
    .notEmpty()
    .withMessage('Le numéro du document est requis'),
  validateRequest
];

const validateCoordinates = [
  body('longitude')
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude invalide'),
  body('latitude')
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude invalide'),
  validateRequest
];

const validateSearch = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Le numéro de page doit être un entier positif'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('La limite doit être entre 1 et 100'),
  query('scoreMin')
    .optional()
    .isInt({ min: 0, max: 100 })
    .withMessage('Le score minimum doit être entre 0 et 100'),
  query('longitude')
    .optional()
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude invalide'),
  query('latitude')
    .optional()
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude invalide'),
  query('rayon')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Le rayon doit être entre 1 et 100 km'),
  validateRequest
];

const validateUserId = [
  param('id')
    .isMongoId()
    .withMessage('ID utilisateur invalide'),
  validateRequest
];

const validateAccountDeletion = [
  body('motDePasse')
    .notEmpty()
    .withMessage('Le mot de passe est requis pour supprimer le compte'),
  validateRequest
];

// Routes publiques

// Créer un utilisateur (peut être utilisé en cas de création directe, sinon utiliser auth/inscription)
router.post(
  '/',
  validateUserCreation,
  creerUtilisateur
);

// Obtenir le profil public d'un utilisateur
router.get(
  '/:id/public',
  validateUserId,
  obtenirProfilPublic
);

// Routes protégées (utilisateur connecté)

// Obtenir son profil complet
router.get(
  '/profil',
  protect,
  obtenirProfilComplet
);

// Mettre à jour son profil
router.put(
  '/profil',
  protect,
  validateProfileUpdate,
  mettreAJourProfil
);

// Changer son mot de passe
router.put(
  '/mot-de-passe',
  protect,
  validatePasswordChange,
  changerMotDePasse
);

// Upload photo de profil
router.put(
  '/photo-profil',
  protect,
  uploadPhotoProfil
);

// Upload document d'identité
router.put(
  '/document-identite',
  protect,
  validateDocumentUpload,
  uploadDocumentIdentite
);

// Obtenir ses statistiques
router.get(
  '/statistiques',
  protect,
  obtenirStatistiques
);

// Mettre à jour ses coordonnées GPS
router.put(
  '/coordonnees',
  protect,
  validateCoordinates,
  mettreAJourCoordonnees
);

// Rechercher des utilisateurs
router.get(
  '/rechercher',
  protect,
  validateSearch,
  rechercherUtilisateurs
);

// Supprimer son compte
router.delete(
  '/compte',
  protect,
  validateAccountDeletion,
  supprimerCompte
);

// Routes administrateur

// Obtenir tous les utilisateurs (Admin)
router.get(
  '/',
  protect,
  authorize('admin', 'superadmin'),
  validateSearch,
  obtenirTousLesUtilisateurs
);

// Obtenir les statistiques globales (Admin)
router.get(
  '/statistiques/globales',
  protect,
  authorize('admin', 'superadmin'),
  obtenirStatistiquesGlobales
);

module.exports = router;