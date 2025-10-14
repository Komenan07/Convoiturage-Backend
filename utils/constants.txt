// utils/constants.js - Constantes de l'application

/**
 * Types d'alertes d'urgence supportées
 */
const TYPES_ALERTE = {
  SOS: 'SOS',
  ACCIDENT: 'ACCIDENT',
  AGRESSION: 'AGRESSION', 
  PANNE: 'PANNE',
  MALAISE: 'MALAISE',
  AUTRE: 'AUTRE'
};

/**
 * Niveaux de gravité des alertes
 */
const NIVEAUX_GRAVITE = {
  FAIBLE: 'FAIBLE',
  MOYEN: 'MOYEN',
  CRITIQUE: 'CRITIQUE'
};

/**
 * Statuts possibles pour une alerte d'urgence
 */
const STATUTS_ALERTE = {
  ACTIVE: 'ACTIVE',
  EN_TRAITEMENT: 'EN_TRAITEMENT',
  RESOLUE: 'RESOLUE',
  FAUSSE_ALERTE: 'FAUSSE_ALERTE'
};

/**
 * Types de relations pour les contacts d'urgence
 */
const TYPES_RELATION = {
  FAMILLE: 'FAMILLE',
  AMI: 'AMI',
  COLLEGUE: 'COLLEGUE',
  CONTACT_URGENCE: 'CONTACT_URGENCE',
  AUTRE: 'AUTRE'
};

/**
 * Statuts de notification des contacts
 */
const STATUTS_NOTIFICATION = {
  ENVOYE: 'ENVOYE',
  RECU: 'RECU',
  ECHEC: 'ECHEC'
};

/**
 * Priorités des alertes (calculées automatiquement)
 */
const PRIORITES_ALERTE = {
  MINIMALE: 1,
  FAIBLE: 2,
  NORMALE: 3,
  ELEVEE: 4,
  CRITIQUE: 5
};

/**
 * Configuration des alertes d'urgence
 */
const CONFIG_ALERTES = {
  // Limites
  MAX_PERSONNES_PRESENTES: 8,
  MAX_CONTACTS_ALERTES: 20,
  MIN_DESCRIPTION_LENGTH: 10,
  MAX_DESCRIPTION_LENGTH: 1000,
  
  // Délais
  DELAI_ALERTE_ANCIENNE: 2 * 60 * 60 * 1000, // 2 heures
  DELAI_AUTO_ESCALADE: 30 * 60 * 1000, // 30 minutes
  DELAI_NOTIFICATION_RETRY: 5 * 60 * 1000, // 5 minutes
  
  // Rayons de recherche
  RAYON_RECHERCHE_DEFAULT: 50, // km
  RAYON_RECHERCHE_MAX: 1000, // km
  
  // Rate limiting spécialisé
  LIMITE_DECLENCHEMENT: 5, // max 5 alertes par utilisateur par 15min
  LIMITE_ESCALADE: 3 // max 3 escalades par alerte
};

/**
 * Messages spécifiques aux alertes d'urgence
 */
const MESSAGES_ALERTE = {
  ALERTE_DECLENCHEE: 'Alerte d\'urgence déclenchée avec succès',
  ALERTE_RESOLUE: 'Alerte d\'urgence résolue',
  ALERTE_ESCALADEE: 'Alerte escaladée avec succès',
  CONTACT_AJOUTE: 'Contact d\'urgence ajouté et notifié',
  STATUT_MIS_A_JOUR: 'Statut de l\'alerte mis à jour',
  FAUSSE_ALERTE: 'Alerte marquée comme fausse alerte',
  
  // Erreurs spécifiques
  ALERTE_DEJA_ACTIVE: 'Une alerte est déjà active pour ce trajet',
  ALERTE_NON_MODIFIABLE: 'Cette alerte ne peut plus être modifiée',
  COORDONNEES_REQUISES: 'Les coordonnées GPS sont requises pour déclencher une alerte',
  LIMITE_CONTACTS_ATTEINTE: 'Limite de contacts d\'urgence atteinte',
  
  // Notifications
  SMS_URGENCE: 'ALERTE URGENCE: {nom} a déclenché une alerte {type}. Position: {position}. Contactez immédiatement les secours si nécessaire.',
  EMAIL_URGENCE: 'Alerte d\'urgence déclenchée par {nom}',
  RESOLUTION_NOTIFIEE: 'L\'alerte d\'urgence #{numero} a été résolue'
};

/**
 * Configuration des services d'urgence
 */
const SERVICES_URGENCE = {
  SAMU: '15',
  POMPIERS: '18',
  POLICE: '17',
  URGENCE_EUROPEENNE: '112',
  
  // Numéros spécialisés
  SOS_MEDECINS: '3624',
  POISON: '01 40 05 48 48',
  VIOLENCES_FEMMES: '3919'
};

/**
 * Mapping priorité par type et gravité
 */
const MAPPING_PRIORITE = {
  'SOS': { 'CRITIQUE': 5, 'MOYEN': 4, 'FAIBLE': 3 },
  'ACCIDENT': { 'CRITIQUE': 5, 'MOYEN': 4, 'FAIBLE': 3 },
  'AGRESSION': { 'CRITIQUE': 5, 'MOYEN': 4, 'FAIBLE': 3 },
  'MALAISE': { 'CRITIQUE': 4, 'MOYEN': 3, 'FAIBLE': 2 },
  'PANNE': { 'CRITIQUE': 2, 'MOYEN': 2, 'FAIBLE': 1 },
  'AUTRE': { 'CRITIQUE': 3, 'MOYEN': 2, 'FAIBLE': 1 }
};

/**
 * Configuration des notifications d'urgence
 */
const CONFIG_NOTIFICATIONS_URGENCE = {
  // Canaux
  CANAUX: {
    SMS: 'sms',
    EMAIL: 'email',
    PUSH: 'push',
    APPEL: 'appel'
  },
  
  // Délais de retry
  RETRY_DELAYS: [30000, 60000, 300000], // 30s, 1min, 5min
  
  // Templates SMS
  TEMPLATES_SMS: {
    ALERTE_SOS: 'URGENCE! {nom} a déclenché une alerte SOS. Lieu: {lieu}. Contactez les secours: 15/18/112',
    ALERTE_ACCIDENT: 'ACCIDENT! {nom} signale un accident. Lieu: {lieu}. Secours: 15/18/112',
    ALERTE_AGRESSION: 'AGRESSION! {nom} signale une agression. Lieu: {lieu}. Police: 17/112',
    ALERTE_PANNE: 'PANNE: {nom} en panne. Lieu: {lieu}. Assistance possible.',
    ALERTE_MALAISE: 'MALAISE: {nom} signale un malaise. Lieu: {lieu}. SAMU: 15',
    RESOLUTION: 'RESOLU: L\'alerte de {nom} est résolue. Merci de votre aide.'
  }
};

/**
 * Types d'événements supportés
 */
const TYPES_EVENEMENT = {
  SPORT: 'SPORT',
  CONCERT: 'CONCERT', 
  FESTIVAL: 'FESTIVAL',
  CONFERENCE: 'CONFERENCE'
};

/**
 * Statuts possibles pour un événement
 */
const STATUTS_EVENEMENT = {
  PROGRAMME: 'PROGRAMME',
  EN_COURS: 'EN_COURS',
  TERMINE: 'TERMINE',
  ANNULE: 'ANNULE'
};

/**
 * Sources de détection des événements
 */
const SOURCES_DETECTION = {
  MANUEL: 'MANUEL',
  AUTOMATIQUE: 'AUTOMATIQUE',
  API_EXTERNE: 'API_EXTERNE'
};

/**
 * Types d'organisateurs
 */
const TYPES_ORGANISATEUR = {
  OFFICIEL: 'OFFICIEL',
  COMMUNAUTAIRE: 'COMMUNAUTAIRE'
};

/**
 * Rôles utilisateurs
 */
const ROLES_UTILISATEUR = {
  UTILISATEUR: 'utilisateur',
  MODERATEUR: 'moderateur',
  ADMIN: 'admin',
  SUPER_ADMIN: 'super_admin',
  SERVICE_URGENCE: 'service_urgence'
};

/**
 * Messages d'erreur fréquents
 */
const MESSAGES_ERREUR = {
  EVENEMENT_NON_TROUVE: 'Événement non trouvé',
  GROUPE_NON_TROUVE: 'Groupe de covoiturage non trouvé',
  ALERTE_NON_TROUVEE: 'Alerte d\'urgence non trouvée',
  UTILISATEUR_NON_AUTHENTIFIE: 'Utilisateur non authentifié',
  PERMISSIONS_INSUFFISANTES: 'Permissions insuffisantes',
  DONNEES_INVALIDES: 'Données invalides',
  LIMITE_TAUX_DEPASSEE: 'Limite de taux dépassée',
  ERREUR_BASE_DONNEES: 'Erreur de base de données',
  ERREUR_INTERNE: 'Erreur interne du serveur',
  COORDONNEES_INVALIDES: 'Coordonnées GPS invalides',
  NOTIFICATION_ECHEC: 'Échec de l\'envoi de notification'
};

/**
 * Messages de succès
 */
const MESSAGES_SUCCES = {
  EVENEMENT_CREE: 'Événement créé avec succès',
  EVENEMENT_MIS_A_JOUR: 'Événement mis à jour avec succès',
  EVENEMENT_SUPPRIME: 'Événement supprimé avec succès',
  GROUPE_AJOUTE: 'Groupe de covoiturage ajouté avec succès',
  GROUPE_SUPPRIME: 'Groupe de covoiturage supprimé avec succès',
  GROUPE_REJOINT: 'Vous avez rejoint le groupe avec succès',
  GROUPE_QUITTE: 'Vous avez quitté le groupe avec succès',
  ALERTE_DECLENCHEE: 'Alerte d\'urgence déclenchée avec succès',
  ALERTE_RESOLUE: 'Alerte d\'urgence résolue avec succès'
};

/**
 * Limites de l'application
 */
const LIMITES = {
  // Pagination
  PAGINATION_LIMITE_MAX: 100,
  PAGINATION_LIMITE_DEFAULT: 20,
  
  // Événements
  EVENEMENT_NOM_MAX: 200,
  EVENEMENT_DESCRIPTION_MAX: 2000,
  EVENEMENT_TAGS_MAX: 10,
  EVENEMENT_TAG_LONGUEUR_MAX: 50,
  
  // Lieu
  LIEU_NOM_MAX: 200,
  LIEU_ADRESSE_MAX: 300,
  LIEU_VILLE_MAX: 100,
  
  // Groupes covoiturage
  GROUPE_NOM_MIN: 3,
  GROUPE_NOM_MAX: 100,
  GROUPE_DESCRIPTION_MAX: 500,
  GROUPE_MEMBRES_MAX: 8,
  
  // Alertes d'urgence
  ALERTE_DESCRIPTION_MIN: 10,
  ALERTE_DESCRIPTION_MAX: 1000,
  ALERTE_PERSONNES_MAX: 8,
  ALERTE_CONTACTS_MAX: 20,
  
  // Recherche
  RECHERCHE_TERME_MIN: 2,
  RECHERCHE_TERME_MAX: 100,
  RECHERCHE_TAGS_MAX: 5,
  PROXIMITE_RAYON_MAX: 1000, // km
  
  // Upload
  FICHIER_TAILLE_MAX: 5 * 1024 * 1024, // 5MB
  
  // Capacité événement
  CAPACITE_MIN: 1,
  CAPACITE_MAX: 1000000
};

/**
 * Formats supportés
 */
const FORMATS = {
  EXPORT: ['json', 'csv'],
  IMAGES: ['image/jpeg', 'image/png', 'image/webp'],
  DATE: 'YYYY-MM-DD',
  DATETIME: 'YYYY-MM-DDTHH:mm:ss.sssZ',
  HEURE: 'HH:mm'
};

/**
 * Coordonnées géographiques - limites
 */
const GEO_LIMITES = {
  LONGITUDE_MIN: -180,
  LONGITUDE_MAX: 180,
  LATITUDE_MIN: -90,
  LATITUDE_MAX: 90,
  RAYON_TERRE_KM: 6371
};

/**
 * Configuration par défaut des rate limits
 */
const RATE_LIMITS_CONFIG = {
  GENERAL: { requests: 100, duration: 15 * 60 * 1000 }, // 100/15min
  CREATION: { requests: 10, duration: 60 * 60 * 1000 }, // 10/h
  CREATION_URGENCE: { requests: 5, duration: 15 * 60 * 1000 }, // 5/15min pour alertes urgence
  MODIFICATION: { requests: 50, duration: 60 * 60 * 1000 }, // 50/h
  SUPPRESSION: { requests: 5, duration: 60 * 60 * 1000 }, // 5/h
  LECTURE: { requests: 1000, duration: 60 * 60 * 1000 }, // 1000/h
  RECHERCHE: { requests: 100, duration: 60 * 60 * 1000 }, // 100/h
  EXPORT: { requests: 10, duration: 60 * 60 * 1000 }, // 10/h
  AUTH: { requests: 5, duration: 15 * 60 * 1000 }, // 5/15min
  ACTION: { requests: 20, duration: 60 * 60 * 1000 }, // 20/h
  ADMIN: { requests: 200, duration: 60 * 60 * 1000 } // 200/h
};

/**
 * Codes de statut HTTP fréquents
 */
const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  NOT_IMPLEMENTED: 501,
  SERVICE_UNAVAILABLE: 503
};

/**
 * Regex patterns fréquemment utilisés
 */
const REGEX_PATTERNS = {
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  TELEPHONE_FR: /^(?:(?:\+33|0)[1-9](?:[0-9]{8}))$/,
  HEURE_FORMAT: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/,
  MONGODB_ID: /^[0-9a-fA-F]{24}$/,
  SLUG: /^[a-z0-9-]+$/,
  COORDONNEES_GPS: /^-?([1-8]?\d(\.\d+)?|90(\.0+)?),\s*-?(180(\.0+)?|((1[0-7]\d)|([1-9]?\d))(\.\d+)?)$/
};

/**
 * Délais par défaut (en millisecondes)
 */
const TIMEOUTS = {
  REQUEST: 30000, // 30 secondes
  DATABASE_CONNECT: 10000, // 10 secondes
  DATABASE_OPERATION: 5000, // 5 secondes
  CACHE: 300000, // 5 minutes
  SESSION: 86400000, // 24 heures
  JWT_ACCESS: 3600000, // 1 heure
  JWT_REFRESH: 604800000, // 7 jours
  ALERTE_RESOLUTION_AUTO: 7200000 // 2 heures pour auto-résolution si pas de réponse
};

/**
 * Messages de logs
 */
const LOG_MESSAGES = {
  SERVER_START: 'Serveur démarré avec succès',
  SERVER_STOP: 'Serveur arrêté',
  DB_CONNECTED: 'Base de données connectée',
  DB_DISCONNECTED: 'Base de données déconnectée',
  DB_ERROR: 'Erreur de base de données',
  RATE_LIMIT_EXCEEDED: 'Limite de taux dépassée',
  VALIDATION_ERROR: 'Erreur de validation',
  AUTH_SUCCESS: 'Authentification réussie',
  AUTH_FAILED: 'Échec de l\'authentification',
  ALERTE_DECLENCHEE: 'Alerte d\'urgence déclenchée',
  ALERTE_RESOLUE: 'Alerte d\'urgence résolue'
};

/**
 * Configuration de l'environnement
 */
const ENVIRONMENT = {
  DEVELOPMENT: 'development',
  PRODUCTION: 'production',
  TEST: 'test',
  STAGING: 'staging'
};

/**
 * Types MIME autorisés
 */
const MIME_TYPES = {
  JSON: 'application/json',
  CSV: 'text/csv',
  PDF: 'application/pdf',
  JPEG: 'image/jpeg',
  PNG: 'image/png',
  WEBP: 'image/webp',
  TEXT: 'text/plain'
};

/**
 * Unités de mesure
 */
const UNITES = {
  DISTANCE: {
    METRES: 'm',
    KILOMETRES: 'km',
    MILES: 'mi'
  },
  TEMPS: {
    SECONDES: 's',
    MINUTES: 'min',
    HEURES: 'h',
    JOURS: 'j'
  },
  POIDS: {
    GRAMMES: 'g',
    KILOGRAMMES: 'kg'
  }
};

/**
 * Configuration de sécurité
 */
const SECURITY = {
  PASSWORD_MIN_LENGTH: 8,
  PASSWORD_MAX_LENGTH: 128,
  SALT_ROUNDS: 12,
  MAX_LOGIN_ATTEMPTS: 5,
  ACCOUNT_LOCK_TIME: 2 * 60 * 60 * 1000, // 2 heures
  PASSWORD_RESET_EXPIRES: 10 * 60 * 1000, // 10 minutes
  ALERTE_MAX_PAR_UTILISATEUR: 5 // Max 5 alertes par utilisateur par 15min
};

/**
 * Configuration des notifications
 */
const NOTIFICATIONS = {
  TYPES: {
    INFO: 'info',
    SUCCESS: 'success',
    WARNING: 'warning',
    ERROR: 'error',
    URGENCE: 'urgence'
  },
  CANAUX: {
    EMAIL: 'email',
    SMS: 'sms',
    PUSH: 'push',
    IN_APP: 'in_app',
    APPEL: 'appel' // Pour les urgences critiques
  }
};

/**
 * Configuration de cache
 */
const CACHE = {
  KEYS: {
    USER_SESSION: 'user_session:',
    RATE_LIMIT: 'rate_limit:',
    SEARCH_RESULTS: 'search:',
    STATS: 'stats:',
    GEO_LOCATION: 'geo:',
    ALERTES_ACTIVES: 'alertes_actives:',
    DASHBOARD_URGENCE: 'dashboard_urgence:'
  },
  TTL: {
    SHORT: 300, // 5 minutes
    MEDIUM: 1800, // 30 minutes
    LONG: 3600, // 1 heure
    VERY_LONG: 86400, // 24 heures
    ALERTES: 60 // 1 minute pour les alertes
  }
};

/**
 * URLs et endpoints externes
 */
const EXTERNAL_APIS = {
  GEOCODING: 'https://api.mapbox.com/geocoding/v5',
  WEATHER: 'https://api.openweathermap.com/data/2.5',
  EVENTS: 'https://api.eventbrite.com/v3',
  SMS_SERVICE: 'https://api.twilio.com/2010-04-01',
  EMERGENCY_SERVICES: 'https://api.emergency-services.gouv.fr/v1'
};

/**
 * Configuration des emails
 */
const EMAIL = {
  TEMPLATES: {
    WELCOME: 'welcome',
    RESET_PASSWORD: 'reset_password',
    EVENT_CREATED: 'event_created',
    EVENT_REMINDER: 'event_reminder',
    GROUP_JOINED: 'group_joined',
    ALERTE_URGENCE: 'alerte_urgence',
    ALERTE_RESOLUE: 'alerte_resolue'
  },
  SENDER: {
    NOREPLY: 'noreply@covoiturage.com',
    SUPPORT: 'support@covoiturage.com',
    ADMIN: 'admin@covoiturage.com',
    URGENCE: 'urgence@covoiturage.com'
  }
};

/**
 * Métadonnées de l'application
 */
const APP_METADATA = {
  NAME: 'Covoiturage Événements & Alertes Urgence',
  VERSION: '1.0.0',
  DESCRIPTION: 'Plateforme de covoiturage pour événements avec système d\'alertes d\'urgence',
  AUTHOR: 'Équipe Développement',
  LICENSE: 'MIT',
  REPOSITORY: 'https://github.com/votre-org/covoiturage-app'
};

module.exports = {
  // Alertes d'urgence
  TYPES_ALERTE,
  NIVEAUX_GRAVITE,
  STATUTS_ALERTE,
  TYPES_RELATION,
  STATUTS_NOTIFICATION,
  PRIORITES_ALERTE,
  CONFIG_ALERTES,
  MESSAGES_ALERTE,
  SERVICES_URGENCE,
  MAPPING_PRIORITE,
  CONFIG_NOTIFICATIONS_URGENCE,
  
  // Événements
  TYPES_EVENEMENT,
  STATUTS_EVENEMENT,
  SOURCES_DETECTION,
  TYPES_ORGANISATEUR,
  
  // Utilisateurs et sécurité
  ROLES_UTILISATEUR,
  SECURITY,
  
  // Messages
  MESSAGES_ERREUR,
  MESSAGES_SUCCES,
  LOG_MESSAGES,
  
  // Configuration technique
  LIMITES,
  FORMATS,
  GEO_LIMITES,
  RATE_LIMITS_CONFIG,
  HTTP_STATUS,
  REGEX_PATTERNS,
  TIMEOUTS,
  ENVIRONMENT,
  MIME_TYPES,
  UNITES,
  NOTIFICATIONS,
  CACHE,
  EXTERNAL_APIS,
  EMAIL,
  APP_METADATA
};