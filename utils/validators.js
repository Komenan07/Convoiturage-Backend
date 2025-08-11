/**
 * Validateurs Joi pour l'application de covoiturage
 * Validation complète de toutes les entités et requêtes
 */
const Joi = require('joi');

const {
  SEXE,
  TYPE_DOCUMENT_IDENTITE,
  STATUT_VERIFICATION,
  TYPE_CONVERSATION,
  LANGUE_PREFEREE,
  RELATION_CONTACT_URGENCE,
  BADGES_UTILISATEUR,
  STATUT_COMPTE,
  TYPE_TRAJET,
  JOURS_SEMAINE,
  TYPE_BAGAGES,
  STATUT_TRAJET,
  STATUT_RESERVATION,
  STATUT_PAIEMENT,
  METHODE_PAIEMENT,
  TYPE_NOTIFICATION,
  TYPE_MESSAGE,
  TYPE_PIECE_JOINTE,
  TYPE_EVALUATEUR,
  ASPECTS_POSITIFS,
  ASPECTS_A_AMELIORER,
  GRAVITE_SIGNALEMENT,
  TYPE_EVENEMENT,
  STATUT_EVENEMENT,
  SOURCE_DETECTION,
  TYPE_ALERTE,
  NIVEAU_GRAVITE,
  STATUT_ALERTE,
  STATUT_NOTIFICATION_URGENCE,
  STATUT_PAIEMENT_DETAILLE,
  ROLE_ADMIN,
  PERMISSIONS,
  TYPE_SIGNALEMENT,
  STATUT_TRAITEMENT,
  ACTIONS_MODERATION,
  MARQUES_VEHICULES,
  COULEURS_VEHICULES,
  COMMUNES_ABIDJAN,
  VILLES_COTE_DIVOIRE,
  REGEX_PATTERNS,
  LIMITES
} = require('./constants');

// ========================================
// SCHÉMAS DE BASE RÉUTILISABLES
// ========================================
const objectIdSchema = Joi.string().pattern(/^[0-9a-fA-F]{24}$/).message('Doit être un ObjectId valide');

const coordonneesSchema = Joi.object({
  type: Joi.string().valid('Point').required(),
  coordinates: Joi.array().items(Joi.number()).length(2).required() // [longitude, latitude]
});

const adresseSchema = Joi.object({
  commune: Joi.string().valid(...Object.values(COMMUNES_ABIDJAN)).required(),
  quartier: Joi.string().trim().min(2).max(100).required(),
  ville: Joi.string().valid(...Object.values(VILLES_COTE_DIVOIRE)).default('ABIDJAN'),
  coordonnees: coordonneesSchema.required()
});

const pointSchema = Joi.object({
  nom: Joi.string().trim().min(2).max(200).required(),
  adresse: Joi.string().trim().min(5).max(300).required(),
  commune: Joi.string().valid(...Object.values(COMMUNES_ABIDJAN)).required(),
  quartier: Joi.string().trim().min(2).max(100).required(),
  coordonnees: coordonneesSchema.required()
});

// ========================================
// VALIDATEURS UTILISATEUR
// ========================================
const utilisateurSchema = {
  // Inscription
  inscription: Joi.object({
    email: Joi.string().email().lowercase().required().messages({
      'string.email': 'Format email invalide',
      'any.required': 'L\'email est obligatoire'
    }),
    telephone: Joi.string().pattern(REGEX_PATTERNS.TELEPHONE_CI).required().messages({
      'string.pattern.base': 'Numéro de téléphone invalide pour la Côte d\'Ivoire'
    }),
    motDePasse: Joi.string().min(8).max(128).pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/).required().messages({
      'string.pattern.base': 'Le mot de passe doit contenir au moins une minuscule, une majuscule, un chiffre et un caractère spécial'
    }),
    confirmMotDePasse: Joi.any().valid(Joi.ref('motDePasse')).required().messages({
      'any.only': 'Les mots de passe ne correspondent pas'
    }),
    nom: Joi.string().trim().min(2).max(50).required(),
    prenom: Joi.string().trim().min(2).max(50).required(),
    dateNaissance: Joi.date().max('now').min('1930-01-01').required(),
    sexe: Joi.string().valid(...Object.values(SEXE)).required()
  }),
  // Connexion
  connexion: Joi.object({
    email: Joi.string().email().lowercase().required(),
    motDePasse: Joi.string().required()
  }),
  // Mise à jour profil
  miseAJourProfil: Joi.object({
    nom: Joi.string().trim().min(2).max(50),
    prenom: Joi.string().trim().min(2).max(50),
    dateNaissance: Joi.date().max('now').min('1930-01-01'),
    sexe: Joi.string().valid(...Object.values(SEXE)),
    photoProfil: Joi.string().uri(),
    adresse: adresseSchema,
    preferences: Joi.object({
      musique: Joi.boolean().default(false),
      climatisation: Joi.boolean().default(false),
      conversation: Joi.string().valid(...Object.values(TYPE_CONVERSATION)).default('NEUTRE'),
      languePreferee: Joi.string().valid(...Object.values(LANGUE_PREFEREE)).default('FR')
    })
  }),
  // Document d'identité
  documentIdentite: Joi.object({
    type: Joi.string().valid(...Object.values(TYPE_DOCUMENT_IDENTITE)).required(),
    numero: Joi.string().when('type', {
      is: 'CNI',
      then: Joi.string().pattern(REGEX_PATTERNS.NUMERO_CNI).required(),
      otherwise: Joi.string().pattern(REGEX_PATTERNS.NUMERO_PASSEPORT).required()
    }),
    photoDocument: Joi.string().uri().required()
  }),
  // Contact d'urgence
  contactUrgence: Joi.object({
    nom: Joi.string().trim().min(2).max(100).required(),
    telephone: Joi.string().pattern(REGEX_PATTERNS.TELEPHONE_CI).required(),
    relation: Joi.string().valid(...Object.values(RELATION_CONTACT_URGENCE)).required()
  }),
  // Véhicule
  vehicule: Joi.object({
    marque: Joi.string().valid(...Object.values(MARQUES_VEHICULES)).required(),
    modele: Joi.string().trim().min(2).max(50).required(),
    couleur: Joi.string().valid(...Object.values(COULEURS_VEHICULES)).required(),
    immatriculation: Joi.string().pattern(REGEX_PATTERNS.IMMATRICULATION).uppercase().required(),
    nombrePlaces: Joi.number().integer().min(LIMITES.MIN_PLACES_VEHICULE).max(LIMITES.MAX_PLACES_VEHICULE).required(),
    photoVehicule: Joi.string().uri().required(),
    assurance: Joi.object({
      numeroPolice: Joi.string().trim().min(5).max(50).required(),
      dateExpiration: Joi.date().greater('now').required(),
      compagnie: Joi.string().trim().min(2).max(100).required()
    }).required(),
    visiteTechnique: Joi.object({
      dateExpiration: Joi.date().greater('now').required(),
      certificatUrl: Joi.string().uri().required()
    }).required()
  })
};

// ========================================
// VALIDATEURS TRAJET
// ========================================
const trajetSchema = {
  // Création de trajet
  creation: Joi.object({
    pointDepart: pointSchema.required(),
    pointArrivee: pointSchema.required(),
    arretsIntermediaires: Joi.array().items(
      pointSchema.keys({
        ordreArret: Joi.number().integer().min(1).required()
      })
    ).max(5),
    dateDepart: Joi.date().greater('now').required(),
    heureDepart: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).required(),
    prixParPassager: Joi.number().integer().min(LIMITES.MIN_PRIX_TRAJET).max(LIMITES.MAX_PRIX_TRAJET).required(),
    nombrePlacesDisponibles: Joi.number().integer().min(1).max(LIMITES.MAX_PLACES_VEHICULE).required(),
    typeTrajet: Joi.string().valid(...Object.values(TYPE_TRAJET)).default('PONCTUEL'),
    recurrence: Joi.when('typeTrajet', {
      is: 'RECURRENT',
      then: Joi.object({
        jours: Joi.array().items(Joi.string().valid(...Object.values(JOURS_SEMAINE))).min(1).required(),
        dateFinRecurrence: Joi.date().greater(Joi.ref('dateDepart')).required()
      }).required(),
      otherwise: Joi.forbidden()
    }),
    preferences: Joi.object({
      accepteFemmesSeulement: Joi.boolean().default(false),
      accepteHommesSeuleument: Joi.boolean().default(false),
      accepteBagages: Joi.boolean().default(true),
      typeBagages: Joi.string().valid(...Object.values(TYPE_BAGAGES)).default('MOYEN'),
      musique: Joi.boolean().default(false),
      conversation: Joi.string().valid(...Object.values(TYPE_CONVERSATION)).default('NEUTRE'),
      fumeur: Joi.boolean().default(false)
    }),
    validationAutomatique: Joi.boolean().default(false),
    commentaireConducteur: Joi.string().max(LIMITES.MAX_CARACTERES_COMMENTAIRE),
    evenementAssocie: objectIdSchema
  }),
  // Mise à jour trajet
  miseAJour: Joi.object({
    heureDepart: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/),
    prixParPassager: Joi.number().integer().min(LIMITES.MIN_PRIX_TRAJET).max(LIMITES.MAX_PRIX_TRAJET),
    nombrePlacesDisponibles: Joi.number().integer().min(0).max(LIMITES.MAX_PLACES_VEHICULE),
    preferences: Joi.object({
      accepteFemmesSeulement: Joi.boolean(),
      accepteHommesSeuleument: Joi.boolean(),
      accepteBagages: Joi.boolean(),
      typeBagages: Joi.string().valid(...Object.values(TYPE_BAGAGES)),
      musique: Joi.boolean(),
      conversation: Joi.string().valid(...Object.values(TYPE_CONVERSATION)),
      fumeur: Joi.boolean()
    }),
    commentaireConducteur: Joi.string().max(LIMITES.MAX_CARACTERES_COMMENTAIRE)
  }),
  // Recherche de trajets
  recherche: Joi.object({
    pointDepart: coordonneesSchema.required(),
    pointArrivee: coordonneesSchema.required(),
    dateDepart: Joi.date().greater('now'),
    rayonRecherche: Joi.number().min(1).max(50).default(10), // km
    prixMax: Joi.number().integer().min(LIMITES.MIN_PRIX_TRAJET).max(LIMITES.MAX_PRIX_TRAJET),
    nombrePlacesMin: Joi.number().integer().min(1).max(LIMITES.MAX_PLACES_VEHICULE).default(1),
    preferences: Joi.object({
      femmesSeulement: Joi.boolean(),
      hommesSeulement: Joi.boolean(),
      accepteBagages: Joi.boolean(),
      musique: Joi.boolean(),
      fumeur: Joi.boolean()
    })
  })
};

// ========================================
// VALIDATEURS RÉSERVATION
// ========================================
const reservationSchema = {
  // Création de réservation
  creation: Joi.object({
    trajetId: objectIdSchema.required(),
    nombrePlacesReservees: Joi.number().integer().min(1).max(LIMITES.MAX_PLACES_VEHICULE).required(),
    pointPriseEnCharge: pointSchema.required(),
    pointDepose: pointSchema.required(),
    methodePaiement: Joi.string().valid(...Object.values(METHODE_PAIEMENT)).required(),
    bagages: Joi.object({
      quantite: Joi.number().integer().min(0).max(10).default(0),
      description: Joi.string().max(200),
      poids: Joi.number().min(0).max(50) // kg
    })
  }),
  // Mise à jour statut
  miseAJourStatut: Joi.object({
    statutReservation: Joi.string().valid(...Object.values(STATUT_RESERVATION)).required(),
    motifRefus: Joi.when('statutReservation', {
      is: 'REFUSEE',
      then: Joi.string().min(10).max(200).required(),
      otherwise: Joi.forbidden()
    })
  })
};

// ========================================
// VALIDATEURS MESSAGE
// ========================================
const messageSchema = {
  // Envoi de message
  envoi: Joi.object({
    conversationId: objectIdSchema.required(),
    destinataireId: objectIdSchema.required(),
    contenu: Joi.string().trim().min(1).max(1000).required(),
    typeMessage: Joi.string().valid(...Object.values(TYPE_MESSAGE)).default('TEXTE'),
    modeleUtilise: Joi.when('typeMessage', {
      is: 'MODELE_PREDEFINI',
      then: Joi.string().required(),
      otherwise: Joi.forbidden()
    }),
    pieceJointe: Joi.object({
      type: Joi.string().valid(...Object.values(TYPE_PIECE_JOINTE)).required(),
      url: Joi.string().uri().when('type', {
        is: 'IMAGE',
        then: Joi.required(),
        otherwise: Joi.forbidden()
      }),
      coordonnees: coordonneesSchema.when('type', {
        is: 'LOCALISATION',
        then: Joi.required(),
        otherwise: Joi.forbidden()
      })
    })
  }),
  // Signalement de message
  signalement: Joi.object({
    messageId: objectIdSchema.required(),
    motifSignalement: Joi.string().valid('SPAM', 'HARCELEMENT', 'CONTENU_INAPPROPRIE', 'AUTRE').required(),
    description: Joi.string().min(10).max(500).required()
  })
};

// ========================================
// VALIDATEURS ÉVALUATION
// ========================================
const evaluationSchema = {
  creation: Joi.object({
    trajetId: objectIdSchema.required(),
    evalueId: objectIdSchema.required(),
    typeEvaluateur: Joi.string().valid(...Object.values(TYPE_EVALUATEUR)).required(),
    notes: Joi.object({
      ponctualite: Joi.number().integer().min(1).max(5).required(),
      proprete: Joi.number().integer().min(1).max(5).required(),
      qualiteConduite: Joi.number().integer().min(1).max(5).required(),
      respect: Joi.number().integer().min(1).max(5).required(),
      communication: Joi.number().integer().min(1).max(5).required()
    }).required(),
    commentaire: Joi.string().max(LIMITES.MAX_CARACTERES_COMMENTAIRE),
    aspectsPositifs: Joi.array().items(Joi.string().valid(...Object.values(ASPECTS_POSITIFS))).max(5),
    aspectsAmeliorer: Joi.array().items(Joi.string().valid(...Object.values(ASPECTS_A_AMELIORER))).max(3),
    estSignalement: Joi.boolean().default(false),
    motifSignalement: Joi.when('estSignalement', {
      is: true,
      then: Joi.string().min(10).max(200).required(),
      otherwise: Joi.forbidden()
    }),
    gravite: Joi.when('estSignalement', {
      is: true,
      then: Joi.string().valid(...Object.values(GRAVITE_SIGNALEMENT)).required(),
      otherwise: Joi.forbidden()
    })
  }),
  reponse: Joi.object({
    evaluationId: objectIdSchema.required(),
    reponseEvalue: Joi.string().min(5).max(300).required()
  })
};

// ========================================
// VALIDATEURS ÉVÉNEMENT
// ========================================
const evenementSchema = {
  creation: Joi.object({
    nom: Joi.string().trim().min(3).max(200).required(),
    description: Joi.string().max(1000),
    lieu: Joi.object({
      nom: Joi.string().trim().min(2).max(200).required(),
      adresse: Joi.string().trim().min(5).max(300).required(),
      ville: Joi.string().valid(...Object.values(VILLES_COTE_DIVOIRE)).required(),
      coordonnees: coordonneesSchema.required()
    }).required(),
    dateDebut: Joi.date().greater('now').required(),
    dateFin: Joi.date().greater(Joi.ref('dateDebut')).required(),
    typeEvenement: Joi.string().valid(...Object.values(TYPE_EVENEMENT)).required(),
    capaciteEstimee: Joi.number().integer().min(10).max(100000),
    sourceDetection: Joi.string().valid(...Object.values(SOURCE_DETECTION)).default('MANUEL')
  }),
  groupeCovoiturage: Joi.object({
    evenementId: objectIdSchema.required(),
    nom: Joi.string().trim().min(3).max(100).required(),
    description: Joi.string().max(300),
    tarifPrefere: Joi.number().integer().min(LIMITES.MIN_PRIX_TRAJET).max(LIMITES.MAX_PRIX_TRAJET),
    heureDepart: Joi.string().pattern(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/).required()
  })
};

// ========================================
// VALIDATEURS ALERTE URGENCE
// ========================================
const alerteUrgenceSchema = {
  declenchement: Joi.object({
    trajetId: objectIdSchema,
    position: coordonneesSchema.required(),
    typeAlerte: Joi.string().valid(...Object.values(TYPE_ALERTE)).required(),
    description: Joi.string().max(500),
    niveauGravite: Joi.string().valid(...Object.values(NIVEAU_GRAVITE)).required(),
    personnesPresentes: Joi.array().items(Joi.object({
      utilisateurId: objectIdSchema,
      nom: Joi.string().trim().min(2).max(100).required(),
      telephone: Joi.string().pattern(REGEX_PATTERNS.TELEPHONE_CI).required()
    })).min(1).required()
  }),
  miseAJour: Joi.object({
    alerteId: objectIdSchema.required(),
    statutAlerte: Joi.string().valid(...Object.values(STATUT_ALERTE)).required(),
    premiersSecours: Joi.boolean(),
    policeContactee: Joi.boolean(),
    commentaireResolution: Joi.when('statutAlerte', {
      is: 'RESOLUE',
      then: Joi.string().min(5).max(300).required(),
      otherwise: Joi.string().max(300)
    })
  })
};

// ========================================
// VALIDATEURS PAIEMENT
// ========================================
const paiementSchema = {
  initiation: Joi.object({
    reservationId: objectIdSchema.required(),
    montantTotal: Joi.number().integer().min(LIMITES.MIN_PRIX_TRAJET).required(),
    methodePaiement: Joi.string().valid(...Object.values(METHODE_PAIEMENT)).required(),
    referencePaiementMobile: Joi.when('methodePaiement', {
      is: Joi.string().valid('WAVE', 'ORANGE_MONEY', 'MTN_MONEY', 'MOOV_MONEY'),
      then: Joi.string().required(),
      otherwise: Joi.forbidden()
    })
  }),
  confirmation: Joi.object({
    paiementId: objectIdSchema.required(),
    referenceTransaction: Joi.string().required(),
    statutPaiement: Joi.string().valid(...Object.values(STATUT_PAIEMENT_DETAILLE)).required()
  })
};

// ========================================
// VALIDATEURS ADMINISTRATION
// ========================================
const adminSchema = {
  // Création administrateur
  creation: Joi.object({
    email: Joi.string().email().lowercase().required(),
    motDePasse: Joi.string().min(8).max(128).pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/).required(),
    nom: Joi.string().trim().min(2).max(50).required(),
    prenom: Joi.string().trim().min(2).max(50).required(),
    role: Joi.string().valid(...Object.values(ROLE_ADMIN)).default('MODERATEUR'),
    permissions: Joi.array().items(Joi.string().valid(...Object.values(PERMISSIONS))).default(['ALL'])
  }),
  // Connexion admin
  connexion: Joi.object({
    email: Joi.string().email().lowercase().required(),
    motDePasse: Joi.string().required()
  }),
  // Mise à jour utilisateur
  miseAJourUtilisateur: Joi.object({
    utilisateurId: objectIdSchema.required(),
    statutCompte: Joi.string().valid(...Object.values(STATUT_COMPTE)),
    scoreConfiance: Joi.number().min(0).max(100),
    badges: Joi.array().items(Joi.string().valid(...Object.values(BADGES_UTILISATEUR))),
    commentaireAdmin: Joi.string().max(500)
  })
};

// ========================================
// VALIDATEURS SIGNALEMENT
// ========================================
const signalementSchema = {
  creation: Joi.object({
    signaleId: objectIdSchema.required(),
    trajetId: objectIdSchema,
    messageId: objectIdSchema,
    typeSignalement: Joi.string().valid(...Object.values(TYPE_SIGNALEMENT)).required(),
    motif: Joi.string().min(5).max(100).required(),
    description: Joi.string().min(10).max(500).required(),
    preuves: Joi.array().items(Joi.string().uri()).max(5)
  }),
  traitement: Joi.object({
    signalementId: objectIdSchema.required(),
    statutTraitement: Joi.string().valid(...Object.values(STATUT_TRAITEMENT)).required(),
    actionsPrises: Joi.array().items(Joi.string().valid(...Object.values(ACTIONS_MODERATION))),
    commentaireModeratrice: Joi.string().max(500)
  })
};

// ========================================
// VALIDATEURS GÉNÉRAUX
// ========================================
const generalSchema = {
  // Pagination
  pagination: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(LIMITES.PAGINATION_LIMIT_MAX || 100).default(20),
    sort: Joi.string().valid('createdAt', '-createdAt', 'nom', '-nom', 'dateDepart', '-dateDepart'),
    search: Joi.string().trim().min(2).max(100)
  }),
  // Paramètres ID
  paramsId: Joi.object({
    id: objectIdSchema.required()
  }),
  // Upload de fichier
  upload: Joi.object({
    fieldname: Joi.string().valid('photoProfil', 'photoDocument', 'photoVehicule', 'certificat', 'preuve').required(),
    mimetype: Joi.string().valid('image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf').required(),
    size: Joi.number().max(LIMITES.MAX_TAILLE_PHOTO || 5 * 1024 * 1024).required()
  }),
  // Coordonnées géographiques
  coordonnees: Joi.object({
    latitude: Joi.number().min(-90).max(90).required(),
    longitude: Joi.number().min(-180).max(180).required(),
    rayon: Joi.number().min(1).max(100).default(10) // km
  })
};

// ========================================
// MIDDLEWARE DE VALIDATION
// ========================================
/**
 * Middleware de validation Joi
 * @param {object} schema - Schéma Joi à utiliser
 * @param {string} property - Propriété à valider ('body', 'params', 'query')
 * @returns {function} Middleware Express
 */
const validate = (schema, property = 'body') => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[property], {
      abortEarly: false, // Retourne toutes les erreurs
      allowUnknown: false, // Rejette les champs non définis
      stripUnknown: true // Supprime les champs non définis
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value
      }));
      return res.status(400).json({
        success: false,
        message: 'Erreur de validation',
        errors: errors
      });
    }
    // Remplace la propriété validée par la valeur nettoyée
    req[property] = value;
    next();
  };
};

// ========================================
// EXPORTS
// ========================================
module.exports = {
  // Schémas de validation
  utilisateurSchema,
  trajetSchema,
  reservationSchema,
  messageSchema,
  evaluationSchema,
  evenementSchema,
  alerteUrgenceSchema,
  paiementSchema,
  adminSchema,
  signalementSchema,
  generalSchema,
  // Schémas de base
  objectIdSchema,
  coordonneesSchema,
  adresseSchema,
  pointSchema,
  // Middleware de validation
  validate,
  // Validations spécifiques couramment utilisées
  validateObjectId: validate(generalSchema.paramsId, 'params'),
  validatePagination: validate(generalSchema.pagination, 'query'),
  validateCoordonnees: validate(generalSchema.coordonnees, 'body')
};
