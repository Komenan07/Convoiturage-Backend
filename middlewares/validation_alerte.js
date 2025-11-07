// Middlewares/validation_alerte.js
const { body, validationResult } = require('express-validator');

// === CONSTANTES DE VALIDATION ===

const NIVEAUX_GRAVITE = ['FAIBLE', 'MOYEN', 'CRITIQUE'];

const TYPES_ALERTE = [
  'SOS', 'ACCIDENT', 'AGRESSION', 'PANNE', 'MALAISE',
  'PASSAGER_SUSPECT', 'CONDUCTEUR_DANGEREUX', 'HARCELEMENT',
  'VOL', 'CHANGEMENT_ITINERAIRE', 'POINT_RENCONTRE_INSECURE',
  'DEMANDE_ARGENT_SUPPLEMENTAIRE', 'VEHICULE_NON_CONFORME',
  'RETARD_IMPORTANT', 'AUTRE'
];

const VILLES_COTE_IVOIRE = [
  'Abidjan', 'Yamoussoukro', 'Bouaké', 'Daloa', 'San-Pédro',
  'Korhogo', 'Man', 'Gagnoa', 'Abengourou', 'Divo',
  'Soubré', 'Agboville', 'Grand-Bassam', 'Dimbokro', 'Issia',
  'Bondoukou', 'Oumé', 'Bingerville', 'Adzopé', 'Dabou',
  'Tiassalé', 'Sassandra', 'Ferkessédougou', 'Toumodi',
  'Séguéla', 'Katiola', 'Odienné', 'Toulepleu', 'Lakota',
  'm\'bahiakro', 'Sakassou', 'Vavoua', 'Zouan-Hounien',
  'Autre'
];

const RELATIONS_CONTACT = [
  'FAMILLE', 'AMI', 'COLLEGUE', 'CONTACT_URGENCE',
  'COVOITUREUR', 'CONDUCTEUR', 'MEDECIN', 'AUTRE'
];

const CANAUX_NOTIFICATION = ['SMS', 'APPEL', 'WHATSAPP', 'APP'];

// === VALIDATEURS PERSONNALISÉS ===

// Validation du format téléphone ivoirien
const isValidIvorianPhone = (value) => {
  if (!value) return false;
  const cleaned = value.replace(/[\s.-]/g, '');
  return /^(?:(?:\+225|0)[0-9]{10})$/.test(cleaned);
};

// Validation des coordonnées GPS
const isValidCoordinates = (value) => {
  if (!value || !Array.isArray(value) || value.length !== 2) {
    return false;
  }
  const [longitude, latitude] = value;
  return (
    typeof longitude === 'number' &&
    typeof latitude === 'number' &&
    longitude >= -180 && longitude <= 180 &&
    latitude >= -90 && latitude <= 90
  );
};

// Validation ObjectId MongoDB
const isValidObjectId = (value) => {
  return /^[0-9a-fA-F]{24}$/.test(value);
};

// === RÈGLES DE VALIDATION ===

const validationRulesDeclencherAlerte = [
  // Champs obligatoires de base
  body('trajetId')
    .notEmpty()
    .withMessage('L\'ID du trajet est requis')
    .custom(isValidObjectId)
    .withMessage('Format d\'ID de trajet invalide'),

  body('typeAlerte')
    .notEmpty()
    .withMessage('Le type d\'alerte est requis')
    .isIn(TYPES_ALERTE)
    .withMessage(`Type d'alerte invalide. Valeurs acceptées : ${TYPES_ALERTE.join(', ')}`),

  body('description')
    .notEmpty()
    .withMessage('La description est requise')
    .isLength({ min: 10, max: 1000 })
    .withMessage('La description doit contenir entre 10 et 1000 caractères')
    .trim(),

  body('niveauGravite')
    .notEmpty()
    .withMessage('Le niveau de gravité est requis')
    .isIn(NIVEAUX_GRAVITE)
    .withMessage(`Niveau de gravité invalide. Utilisez : ${NIVEAUX_GRAVITE.join(', ')}`),

  // Position GPS
  body('position')
    .notEmpty()
    .withMessage('La position GPS est requise'),

  body('position.type')
    .optional()
    .equals('Point')
    .withMessage('Le type de position doit être "Point"'),

  body('position.coordinates')
    .notEmpty()
    .withMessage('Les coordonnées GPS sont requises')
    .custom(isValidCoordinates)
    .withMessage('Coordonnées GPS invalides. Format attendu : [longitude, latitude]'),

  // Ville (optionnelle mais validée si présente)
  body('ville')
    .optional()
    .isIn(VILLES_COTE_IVOIRE)
    .withMessage('Ville non reconnue en Côte d\'Ivoire'),

  body('commune')
    .optional()
    .isLength({ max: 100 })
    .withMessage('Le nom de la commune ne peut dépasser 100 caractères'),

  body('adresseApproximative')
    .optional()
    .isLength({ max: 500 })
    .withMessage('L\'adresse ne peut dépasser 500 caractères'),

  // Personnes présentes (OBLIGATOIRE)
  body('personnesPresentes')
    .notEmpty()
    .withMessage('La liste des personnes présentes est requise')
    .isArray({ min: 1, max: 8 })
    .withMessage('Entre 1 et 8 personnes présentes requises'),

  body('personnesPresentes.*.nom')
    .notEmpty()
    .withMessage('Le nom de chaque personne est requis')
    .trim()
    .isLength({ max: 100 })
    .withMessage('Le nom ne peut dépasser 100 caractères'),

  body('personnesPresentes.*.telephone')
    .notEmpty()
    .withMessage('Le téléphone de chaque personne est requis')
    .custom(isValidIvorianPhone)
    .withMessage('Format téléphone invalide. Utilisez +225XXXXXXXXXX ou 0XXXXXXXXXX'),

  body('personnesPresentes.*.estConducteur')
    .optional()
    .isBoolean()
    .withMessage('estConducteur doit être un booléen'),

  body('personnesPresentes.*.utilisateurId')
    .optional()
    .custom((value) => !value || isValidObjectId(value))
    .withMessage('Format d\'ID utilisateur invalide'),

  // Contacts alertés (optionnel)
  body('contactsAlertes')
    .optional()
    .isArray({ max: 20 })
    .withMessage('Maximum 20 contacts d\'alerte'),

  body('contactsAlertes.*.nom')
    .if(body('contactsAlertes').exists())
    .notEmpty()
    .withMessage('Le nom du contact est requis')
    .trim()
    .isLength({ max: 100 })
    .withMessage('Le nom ne peut dépasser 100 caractères'),

  body('contactsAlertes.*.telephone')
    .if(body('contactsAlertes').exists())
    .notEmpty()
    .withMessage('Le téléphone du contact est requis')
    .custom(isValidIvorianPhone)
    .withMessage('Format téléphone du contact invalide'),

  body('contactsAlertes.*.relation')
    .if(body('contactsAlertes').exists())
    .notEmpty()
    .withMessage('La relation avec le contact est requise')
    .isIn(RELATIONS_CONTACT)
    .withMessage(`Relation invalide. Valeurs acceptées : ${RELATIONS_CONTACT.join(', ')}`),

  body('contactsAlertes.*.canal')
    .optional()
    .isIn(CANAUX_NOTIFICATION)
    .withMessage(`Canal de notification invalide. Valeurs acceptées : ${CANAUX_NOTIFICATION.join(', ')}`),

  // Informations trajet (optionnel)
  body('infoTrajet.depart')
    .optional()
    .isString()
    .withMessage('Le point de départ doit être une chaîne de caractères'),

  body('infoTrajet.destination')
    .optional()
    .isString()
    .withMessage('La destination doit être une chaîne de caractères'),

  body('infoTrajet.immatriculationVehicule')
    .optional()
    .isString()
    .withMessage('L\'immatriculation doit être une chaîne de caractères'),

  body('infoTrajet.marqueVehicule')
    .optional()
    .isString()
    .withMessage('La marque du véhicule doit être une chaîne de caractères')
];

// === RÈGLES POUR LA RÉSOLUTION D'ALERTE ===

const validationRulesResoudreAlerte = [
  body('commentaireResolution')
    .notEmpty()
    .withMessage('Le commentaire de résolution est requis')
    .isLength({ min: 10, max: 1000 })
    .withMessage('Le commentaire doit contenir entre 10 et 1000 caractères')
    .trim(),

  body('typeResolution')
    .optional()
    .isIn(['RESOLUE', 'FAUSSE_ALERTE'])
    .withMessage('Type de résolution invalide')
];

// === RÈGLES POUR LA MISE À JOUR DE STATUT ===

const validationRulesMettreAJourStatut = [
  body('statutAlerte')
    .notEmpty()
    .withMessage('Le statut est requis')
    .isIn(['ACTIVE', 'EN_TRAITEMENT', 'RESOLUE', 'FAUSSE_ALERTE'])
    .withMessage('Statut invalide')
];

// === MIDDLEWARE DE GESTION DES ERREURS ===

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map(error => ({
      champ: error.path || error.param,
      message: error.msg,
      valeurRecue: error.value
    }));

    return res.status(400).json({
      success: false,
      message: 'Erreur de validation des données',
      erreurs: formattedErrors,
      nombreErreurs: formattedErrors.length
    });
  }
  
  next();
};

// === VALIDATIONS PERSONNALISÉES SUPPLÉMENTAIRES ===

const validationSupplementaireDeclencherAlerte = (req, res, next) => {
  const { personnesPresentes, typeAlerte, niveauGravite } = req.body;

  // Vérifier qu'au moins une personne est marquée comme conducteur
  if (personnesPresentes && personnesPresentes.length > 0) {
    const hasConducteur = personnesPresentes.some(p => p.estConducteur === true);
    
    if (!hasConducteur) {
      return res.status(400).json({
        success: false,
        message: 'Au moins une personne doit être marquée comme conducteur',
        conseil: 'Ajoutez estConducteur: true à l\'une des personnes présentes'
      });
    }
  }

  // Validation logique : certains types d'alerte devraient avoir une gravité minimale
  const alertesCritiquesObligatoires = ['SOS', 'ACCIDENT', 'AGRESSION', 'VOL', 'MALAISE'];
  if (alertesCritiquesObligatoires.includes(typeAlerte) && niveauGravite === 'FAIBLE') {
    return res.status(400).json({
      success: false,
      message: `Le type d'alerte "${typeAlerte}" ne peut pas avoir une gravité "FAIBLE"`,
      conseil: 'Utilisez au minimum "MOYEN" pour ce type d\'alerte'
    });
  }

  next();
};

// === EXPORTS ===

module.exports = {
  // Règles de validation
  validationRulesDeclencherAlerte,
  validationRulesResoudreAlerte,
  validationRulesMettreAJourStatut,
  
  // Middleware de gestion des erreurs
  handleValidationErrors,
  
  // Validations supplémentaires
  validationSupplementaireDeclencherAlerte,
  
  // Constantes (pour réutilisation dans d'autres fichiers)
  NIVEAUX_GRAVITE,
  TYPES_ALERTE,
  VILLES_COTE_IVOIRE,
  RELATIONS_CONTACT,
  CANAUX_NOTIFICATION
};