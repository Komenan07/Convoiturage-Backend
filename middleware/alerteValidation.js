// middleware/alerteValidation.js - Validation spécialisée pour les alertes d'urgence
const { body, query, validationResult } = require('express-validator');
const { AppError } = require('../utils/helpers');

/**
 * Middleware pour traiter les erreurs de validation
 */
const gererErreursValidation = (req, res, next) => {
  const erreurs = validationResult(req);
  
  if (!erreurs.isEmpty()) {
    const messagesErreurs = erreurs.array().map(erreur => ({
      champ: erreur.path || erreur.param,
      message: erreur.msg,
      valeurRecue: erreur.value
    }));
    
    // Log spécial pour erreurs de validation d'urgence
    console.error('🚨 ERREUR VALIDATION ALERTE URGENCE:', {
      erreurs: messagesErreurs,
      utilisateur: req.user?.id || 'anonyme',
      body: req.body,
      timestamp: new Date().toISOString()
    });
    
    return res.status(400).json({
      success: false,
      message: 'Erreurs de validation critiques pour alerte d\'urgence',
      erreurs: messagesErreurs,
      aide: 'Vérifiez les données requises pour déclencher une alerte'
    });
  }
  
  next();
};

/**
 * Validation pour le déclenchement d'une alerte d'urgence
 */
const validerAlerteUrgence = [
  // ID du trajet (requis)
  body('trajetId')
    .notEmpty()
    .withMessage('L\'ID du trajet est requis pour déclencher une alerte')
    .isMongoId()
    .withMessage('Format d\'ID de trajet invalide'),

  // Position GPS (critique)
  body('position.type')
    .equals('Point')
    .withMessage('Le type de position doit être "Point"'),

  body('position.coordinates')
    .isArray({ min: 2, max: 2 })
    .withMessage('Les coordonnées doivent contenir exactement 2 valeurs [longitude, latitude]'),

  body('position.coordinates.0')
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude invalide (doit être entre -180 et 180)'),

  body('position.coordinates.1')
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude invalide (doit être entre -90 et 90)'),

  // Type d'alerte (critique)
  body('typeAlerte')
    .notEmpty()
    .withMessage('Le type d\'alerte est requis')
    .isIn(['SOS', 'ACCIDENT', 'AGRESSION', 'PANNE', 'MALAISE', 'AUTRE'])
    .withMessage('Type d\'alerte invalide'),

  // Description (requise)
  body('description')
    .notEmpty()
    .withMessage('Une description de l\'urgence est requise')
    .isLength({ min: 10, max: 1000 })
    .withMessage('La description doit contenir entre 10 et 1000 caractères')
    .trim(),

  // Niveau de gravité (critique)
  body('niveauGravite')
    .notEmpty()
    .withMessage('Le niveau de gravité est requis')
    .isIn(['FAIBLE', 'MOYEN', 'CRITIQUE'])
    .withMessage('Niveau de gravité invalide (FAIBLE, MOYEN, CRITIQUE)'),

  // Personnes présentes (au moins une)
  body('personnesPresentes')
    .isArray({ min: 1, max: 8 })
    .withMessage('Au moins 1 personne présente requise (maximum 8)'),

  body('personnesPresentes.*.utilisateurId')
    .isMongoId()
    .withMessage('ID utilisateur invalide pour personne présente'),

  body('personnesPresentes.*.nom')
    .notEmpty()
    .withMessage('Le nom de la personne présente est requis')
    .isLength({ max: 100 })
    .withMessage('Le nom ne peut pas dépasser 100 caractères')
    .trim(),

  body('personnesPresentes.*.telephone')
    .notEmpty()
    .withMessage('Le téléphone de la personne présente est requis')
    .matches(/^(?:(?:\+33|0)[1-9](?:[0-9]{8}))$/)
    .withMessage('Format de téléphone invalide'),

  // Contacts à alerter (optionnel)
  body('contactsAlertes')
    .optional()
    .isArray({ max: 20 })
    .withMessage('Maximum 20 contacts peuvent être alertés'),

  body('contactsAlertes.*.nom')
    .if(body('contactsAlertes').exists())
    .notEmpty()
    .withMessage('Le nom du contact est requis')
    .isLength({ max: 100 })
    .withMessage('Le nom du contact ne peut pas dépasser 100 caractères')
    .trim(),

  body('contactsAlertes.*.telephone')
    .if(body('contactsAlertes').exists())
    .notEmpty()
    .withMessage('Le téléphone du contact est requis')
    .matches(/^(?:(?:\+33|0)[1-9](?:[0-9]{8}))$/)
    .withMessage('Format de téléphone du contact invalide'),

  body('contactsAlertes.*.relation')
    .if(body('contactsAlertes').exists())
    .isIn(['FAMILLE', 'AMI', 'COLLEGUE', 'CONTACT_URGENCE', 'AUTRE'])
    .withMessage('Type de relation invalide'),

  // Validation de sécurité - empêcher la modification du déclencheur
  body('declencheurId')
    .isEmpty()
    .withMessage('Le déclencheur sera automatiquement défini'),

  // Validation de cohérence
  body()
    .custom((value) => {
      // Si c'est une alerte critique, vérifier qu'il y a des contacts
      if (value.niveauGravite === 'CRITIQUE' && 
          (!value.contactsAlertes || value.contactsAlertes.length === 0)) {
        console.warn('⚠️ Alerte critique sans contacts d\'urgence');
      }
      
      // Validation croisée type/gravité
      const typesGraves = ['SOS', 'ACCIDENT', 'AGRESSION', 'MALAISE'];
      if (typesGraves.includes(value.typeAlerte) && value.niveauGravite === 'FAIBLE') {
        throw new Error('Une alerte SOS/ACCIDENT/AGRESSION/MALAISE ne peut pas être de gravité FAIBLE');
      }
      
      return true;
    }),

  gererErreursValidation
];

/**
 * Validation pour la mise à jour du statut d'une alerte
 */
const validerMiseAJourStatut = [
  body('statutAlerte')
    .notEmpty()
    .withMessage('Le nouveau statut est requis')
    .isIn(['ACTIVE', 'EN_TRAITEMENT', 'RESOLUE', 'FAUSSE_ALERTE'])
    .withMessage('Statut d\'alerte invalide'),

  body('commentaire')
    .if(body('statutAlerte').equals('RESOLUE'))
    .notEmpty()
    .withMessage('Un commentaire de résolution est requis')
    .isLength({ min: 10, max: 1000 })
    .withMessage('Le commentaire doit contenir entre 10 et 1000 caractères')
    .trim(),

  body('commentaire')
    .if(body('statutAlerte').equals('FAUSSE_ALERTE'))
    .notEmpty()
    .withMessage('Une raison est requise pour marquer comme fausse alerte')
    .isLength({ min: 10, max: 1000 })
    .withMessage('La raison doit contenir entre 10 et 1000 caractères')
    .trim(),

  body('premiersSecours')
    .optional()
    .isBoolean()
    .withMessage('Le champ premiers secours doit être un booléen'),

  body('policeContactee')
    .optional()
    .isBoolean()
    .withMessage('Le champ police contactée doit être un booléen'),

  // Validation de logique métier
  body()
    .custom((value) => {
      // Si premiers secours = true, doit être au moins EN_TRAITEMENT
      if (value.premiersSecours && value.statutAlerte === 'ACTIVE') {
        throw new Error('L\'alerte doit être en traitement si les premiers secours sont contactés');
      }
      
      return true;
    }),

  gererErreursValidation
];

/**
 * Validation pour l'ajout d'un contact d'urgence
 */
const validerContact = [
  body('nom')
    .notEmpty()
    .withMessage('Le nom du contact est requis')
    .isLength({ min: 2, max: 100 })
    .withMessage('Le nom doit contenir entre 2 et 100 caractères')
    .trim()
    .escape(),

  body('telephone')
    .notEmpty()
    .withMessage('Le numéro de téléphone est requis')
    .matches(/^(?:(?:\+33|0)[1-9](?:[0-9]{8}))$/)
    .withMessage('Format de téléphone français invalide (ex: 0123456789 ou +33123456789)'),

  body('relation')
    .notEmpty()
    .withMessage('La relation avec le contact est requise')
    .isIn(['FAMILLE', 'AMI', 'COLLEGUE', 'CONTACT_URGENCE', 'AUTRE'])
    .withMessage('Type de relation invalide'),

  // Nettoyage et validation du téléphone
  body('telephone')
    .customSanitizer((value) => {
      // Nettoyer le numéro (supprimer espaces, tirets, points)
      return value.replace(/[\s.-]/g, '');
    }),

  gererErreursValidation
];

/**
 * Validation des paramètres de recherche par proximité
 */
const validerParametresProximite = [
  query('longitude')
    .notEmpty()
    .withMessage('La longitude est requise pour la recherche par proximité')
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude invalide (doit être entre -180 et 180)'),

  query('latitude')
    .notEmpty()
    .withMessage('La latitude est requise pour la recherche par proximité')
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude invalide (doit être entre -90 et 90)'),

  query('rayon')
    .optional()
    .isFloat({ min: 0.1, max: 1000 })
    .withMessage('Le rayon doit être entre 0.1 et 1000 km'),

  query('typeAlerte')
    .optional()
    .isIn(['SOS', 'ACCIDENT', 'AGRESSION', 'PANNE', 'MALAISE', 'AUTRE'])
    .withMessage('Type d\'alerte invalide pour le filtre'),

  query('niveauGravite')
    .optional()
    .isIn(['FAIBLE', 'MOYEN', 'CRITIQUE'])
    .withMessage('Niveau de gravité invalide pour le filtre'),

  gererErreursValidation
];

/**
 * Validation des filtres de recherche d'alertes
 */
const validerFiltresAlertes = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Le numéro de page doit être un entier positif'),

  query('limite')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('La limite doit être entre 1 et 100'),

  query('statutAlerte')
    .optional()
    .custom((value) => {
      const statuts = value.split(',');
      const statutsValides = ['ACTIVE', 'EN_TRAITEMENT', 'RESOLUE', 'FAUSSE_ALERTE'];
      
      for (const statut of statuts) {
        if (!statutsValides.includes(statut.trim())) {
          throw new Error(`Statut invalide: ${statut}`);
        }
      }
      return true;
    }),

  query('typeAlerte')
    .optional()
    .custom((value) => {
      const types = value.split(',');
      const typesValides = ['SOS', 'ACCIDENT', 'AGRESSION', 'PANNE', 'MALAISE', 'AUTRE'];
      
      for (const type of types) {
        if (!typesValides.includes(type.trim())) {
          throw new Error(`Type d\'alerte invalide: ${type}`);
        }
      }
      return true;
    }),

  query('niveauGravite')
    .optional()
    .custom((value) => {
      const niveaux = value.split(',');
      const niveauxValides = ['FAIBLE', 'MOYEN', 'CRITIQUE'];
      
      for (const niveau of niveaux) {
        if (!niveauxValides.includes(niveau.trim())) {
          throw new Error(`Niveau de gravité invalide: ${niveau}`);
        }
      }
      return true;
    }),

  query('ville')
    .optional()
    .isLength({ min: 2, max: 100 })
    .withMessage('Le nom de ville doit contenir entre 2 et 100 caractères')
    .trim(),

  query('dateDebut')
    .optional()
    .isISO8601()
    .withMessage('Format de date de début invalide (ISO 8601 requis)'),

  query('dateFin')
    .optional()
    .isISO8601()
    .withMessage('Format de date de fin invalide (ISO 8601 requis)')
    .custom((valeur, { req }) => {
      if (req.query.dateDebut) {
        const dateFin = new Date(valeur);
        const dateDebut = new Date(req.query.dateDebut);
        
        if (dateFin <= dateDebut) {
          throw new Error('La date de fin doit être postérieure à la date de début');
        }
      }
      return true;
    }),

  query('declencheurId')
    .optional()
    .isMongoId()
    .withMessage('Format d\'ID de déclencheur invalide'),

  query('tri')
    .optional()
    .isIn([
      'priorite', 'priorite_desc', 'priorite_asc',
      'date', 'date_desc', 'date_asc',
      'gravite', 'gravite_desc',
      'statut', 'type'
    ])
    .withMessage('Critère de tri invalide'),

  gererErreursValidation
];

/**
 * Validation pour la recherche avancée
 */
const validerRechercheAvancee = [
  body('filtres')
    .optional()
    .isObject()
    .withMessage('Les filtres doivent être un objet'),

  body('filtres.statutAlerte')
    .optional()
    .custom((value) => {
      if (Array.isArray(value)) {
        const statutsValides = ['ACTIVE', 'EN_TRAITEMENT', 'RESOLUE', 'FAUSSE_ALERTE'];
        return value.every(statut => statutsValides.includes(statut));
      }
      return ['ACTIVE', 'EN_TRAITEMENT', 'RESOLUE', 'FAUSSE_ALERTE'].includes(value);
    })
    .withMessage('Statuts d\'alerte invalides'),

  body('filtres.typeAlerte')
    .optional()
    .custom((value) => {
      if (Array.isArray(value)) {
        const typesValides = ['SOS', 'ACCIDENT', 'AGRESSION', 'PANNE', 'MALAISE', 'AUTRE'];
        return value.every(type => typesValides.includes(type));
      }
      return ['SOS', 'ACCIDENT', 'AGRESSION', 'PANNE', 'MALAISE', 'AUTRE'].includes(value);
    })
    .withMessage('Types d\'alerte invalides'),

  body('options')
    .optional()
    .isObject()
    .withMessage('Les options doivent être un objet'),

  body('options.page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Le numéro de page doit être un entier positif'),

  body('options.limite')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('La limite doit être entre 1 et 100'),

  body('proximite')
    .optional()
    .isObject()
    .withMessage('La proximité doit être un objet'),

  body('proximite.longitude')
    .if(body('proximite').exists())
    .notEmpty()
    .withMessage('La longitude est requise pour la recherche par proximité')
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude invalide'),

  body('proximite.latitude')
    .if(body('proximite').exists())
    .notEmpty()
    .withMessage('La latitude est requise pour la recherche par proximité')
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude invalide'),

  body('proximite.rayon')
    .optional()
    .isFloat({ min: 0.1, max: 1000 })
    .withMessage('Le rayon doit être entre 0.1 et 1000 km'),

  gererErreursValidation
];

/**
 * Validation de sécurité pour les actions critiques
 */
const validerActionCritique = (req, res, next) => {
  // Vérifier l'origine de la requête
  const userAgent = req.get('User-Agent');
  const origin = req.get('Origin');
  
  // Log de sécurité
  console.log('🔒 Action critique sur alerte d\'urgence:', {
    utilisateur: req.user?.id,
    action: req.method + ' ' + req.originalUrl,
    userAgent,
    origin,
    ip: req.ip,
    timestamp: new Date().toISOString()
  });
  
  // Vérifications de sécurité supplémentaires
  if (process.env.NODE_ENV === 'production') {
    // En production, vérifier l'origine
    const originesAutorisees = process.env.ALLOWED_ORIGINS?.split(',') || [];
    if (origin && !originesAutorisees.includes(origin)) {
      console.warn('⚠️ Origine non autorisée pour action critique:', origin);
    }
    
    // Vérifier que ce n'est pas un bot
    if (!userAgent || /bot|crawler|spider/i.test(userAgent)) {
      return res.status(403).json({
        success: false,
        message: 'Actions critiques non autorisées pour les bots'
      });
    }
  }
  
  next();
};

/**
 * Middleware de nettoyage des données sensibles
 */
const nettoyerDonneesSensibles = (req, res, next) => {
  // Nettoyer les numéros de téléphone
  const nettoyerTelephone = (obj, chemin) => {
    if (obj[chemin]) {
      obj[chemin] = obj[chemin].replace(/[\s.-]/g, '');
    }
  };
  
  // Nettoyer dans le body
  if (req.body) {
    // Personnes présentes
    if (req.body.personnesPresentes) {
      req.body.personnesPresentes.forEach(personne => {
        nettoyerTelephone(personne, 'telephone');
      });
    }
    
    // Contacts d'urgence
    if (req.body.contactsAlertes) {
      req.body.contactsAlertes.forEach(contact => {
        nettoyerTelephone(contact, 'telephone');
      });
    }
    
    // Contact direct
    nettoyerTelephone(req.body, 'telephone');
  }
  
  next();
};

module.exports = {
  validerAlerteUrgence,
  validerMiseAJourStatut,
  validerContact,
  validerParametresProximite,
  validerFiltresAlertes,
  validerRechercheAvancee,
  validerActionCritique,
  nettoyerDonneesSensibles,
  gererErreursValidation
};