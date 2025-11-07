/**
 * Fichier de constantes pour l'application de covoiturage
 * Contient tous les enums, rôles, permissions et statuts utilisés dans l'application
 */

// ========================================
// UTILISATEUR - CONSTANTES
// ========================================

const SEXE = {
  MASCULIN: 'M',
  FEMININ: 'F'
};

const TYPE_DOCUMENT_IDENTITE = {
  CNI: 'CNI',
  PASSEPORT: 'PASSEPORT'
};

const STATUT_VERIFICATION = {
  EN_ATTENTE: 'EN_ATTENTE',
  VERIFIE: 'VERIFIE',
  REJETE: 'REJETE'
};

const PREFERENCE_CONVERSATION = {
  BAVARD: 'BAVARD',
  CALME: 'CALME',
  NEUTRE: 'NEUTRE'
};

const LANGUES = {
  FRANCAIS: 'FR',
  ANGLAIS: 'ANG'
};

const RELATION_CONTACT_URGENCE = {
  FAMILLE: 'FAMILLE',
  AMI: 'AMI',
  COLLEGUE: 'COLLEGUE',
  CONTACT_URGENCE: 'CONTACT_URGENCE',
  COVOITUREUR: 'COVOITUREUR',
  CONDUCTEUR: 'CONDUCTEUR',
  MEDECIN: 'MEDECIN',  
  AUTRE: 'AUTRE'
};

const BADGES_UTILISATEUR = {
  PONCTUEL: 'PONCTUEL',
  PROPRE: 'PROPRE',
  SYMPATHIQUE: 'SYMPATHIQUE',
  CONDUCTEUR_EXPERIMENTE: 'CONDUCTEUR_EXPERIMENTE',
  PASSAGER_IDEAL: 'PASSAGER_IDEAL',
  COMMUNICATIF: 'COMMUNICATIF',
  RESPECTUEUX: 'RESPECTUEUX'
};

const STATUT_COMPTE = {
  ACTIF: 'ACTIF',
  SUSPENDU: 'SUSPENDU',
  BLOQUE: 'BLOQUE',
  INACTIF: 'INACTIF'
};

// ========================================
// TRAJET - CONSTANTES
// ========================================

const TYPE_TRAJET = {
  PONCTUEL: 'PONCTUEL',
  RECURRENT: 'RECURRENT',
  EVENEMENTIEL: 'EVENEMENTIEL'
};

const JOURS_SEMAINE = {
  LUNDI: 'LUNDI',
  MARDI: 'MARDI',
  MERCREDI: 'MERCREDI',
  JEUDI: 'JEUDI',
  VENDREDI: 'VENDREDI',
  SAMEDI: 'SAMEDI',
  DIMANCHE: 'DIMANCHE'
};

const TYPE_BAGAGES = {
  PETIT: 'PETIT',
  MOYEN: 'MOYEN',
  GRAND: 'GRAND'
};

const STATUT_TRAJET = {
  PROGRAMME: 'PROGRAMME',
  EN_COURS: 'EN_COURS',
  TERMINE: 'TERMINE',
  ANNULE: 'ANNULE',
  SUSPENDU: 'SUSPENDU'
};

// ========================================
// RESERVATION - CONSTANTES
// ========================================

const STATUT_RESERVATION = {
  EN_ATTENTE: 'EN_ATTENTE',
  CONFIRMEE: 'CONFIRMEE',
  REFUSEE: 'REFUSEE',
  ANNULEE: 'ANNULEE',
  TERMINEE: 'TERMINEE'
};

const STATUT_PAIEMENT = {
  EN_ATTENTE: 'EN_ATTENTE',
  PAYE: 'PAYE',
  REMBOURSE: 'REMBOURSE',
  ECHEC: 'ECHEC',
  TRAITE: 'TRAITE',
  COMPLETE: 'COMPLETE',
  ANNULE: 'ANNULE'
};

const STATUT_PAIEMENT_DETAILLE = {
  EN_ATTENTE: 'EN_ATTENTE',
  PAYE: 'PAYE',
  REMBOURSE: 'REMBOURSE',
  ECHEC: 'ECHEC',
  TRAITE: 'TRAITE',
  COMPLETE: 'COMPLETE',
  ANNULE: 'ANNULE',
  EN_COURS: 'EN_COURS',
  EXPIRE: 'EXPIRE'
};

const METHODE_PAIEMENT = {
  ESPECES: 'ESPECES',
  WAVE: 'WAVE',
  ORANGE_MONEY: 'ORANGE_MONEY',
  MTN_MONEY: 'MTN_MONEY',
  MOOV_MONEY: 'MOOV_MONEY'
};

const TYPE_NOTIFICATION = {
  RAPPEL_DEPART: 'RAPPEL_DEPART',
  CONDUCTEUR_PROCHE: 'CONDUCTEUR_PROCHE',
  ARRIVEE: 'ARRIVEE',
  RESERVATION_CONFIRMEE: 'RESERVATION_CONFIRMEE',
  RESERVATION_REFUSEE: 'RESERVATION_REFUSEE',
  TRAJET_ANNULE: 'TRAJET_ANNULE'
};

// ========================================
// MESSAGE - CONSTANTES
// ========================================

const TYPE_MESSAGE = {
  TEXTE: 'TEXTE',
  POSITION: 'POSITION',
  MODELE_PREDEFINI: 'MODELE_PREDEFINI',
  IMAGE: 'IMAGE',
  LOCALISATION: 'LOCALISATION'
};

const MESSAGES_PREDEFINIS = {
  // Messages de base
  ARRIVEE_BIENTOT: "J'arrive bientôt au point de rendez-vous",
  RETARD_5MIN: "Je suis en retard de 5 minutes",
  RETARD_10MIN: "Je suis en retard de 10 minutes", 
  PROBLEME_CIRCULATION: "Il y a des embouteillages, je serai en retard",
  ARRIVE: "Je suis arrivé(e) au point de rendez-vous",
  DEMARRE: "On peut partir",
  MERCI_TRAJET: "Merci pour ce trajet !",
  
  // Messages d'urgence
  AIDE_URGENCE: "J'ai besoin d'aide immédiatement",
  ACCIDENT_ROUTE: "Il y a eu un accident sur la route",
  PANNE_VEHICULE: "Mon véhicule est en panne",
  
  // Messages de courtoisie
  BONJOUR_MATIN: "Bonjour ! Comment allez-vous ?",
  BONNE_ROUTE: "Bonne route et bon voyage !",
  AU_REVOIR: "Merci pour le trajet, au revoir !",
  
  // Messages informatifs
  TRAFIC_DENSE: "Le trafic est dense, nous serons en retard",
  ROUTE_BLOQUEE: "La route habituelle est bloquée, changement d'itinéraire",
  PAUSE_ESSENCE: "Arrêt rapide pour faire le plein d'essence"
};

const TYPE_PIECE_JOINTE = {
  IMAGE: 'IMAGE',
  LOCALISATION: 'LOCALISATION'
};

// ========================================
// EVALUATION - CONSTANTES
// ========================================

const TYPE_EVALUATEUR = {
  CONDUCTEUR: 'CONDUCTEUR',
  PASSAGER: 'PASSAGER'
};

const ASPECTS_POSITIFS = {
  PONCTUEL: 'PONCTUEL',
  SYMPATHIQUE: 'SYMPATHIQUE',
  VEHICULE_PROPRE: 'VEHICULE_PROPRE',
  CONDUITE_SECURISEE: 'CONDUITE_SECURISEE',
  RESPECTUEUX: 'RESPECTUEUX',
  BON_COMMUNICANT: 'BON_COMMUNICANT',
  FLEXIBLE: 'FLEXIBLE'
};

const ASPECTS_A_AMELIORER = {
  PONCTUALITE: 'PONCTUALITE',
  PROPRETE: 'PROPRETE',
  CONDUITE: 'CONDUITE',
  COMMUNICATION: 'COMMUNICATION',
  RESPECT: 'RESPECT'
};

const GRAVITE_SIGNALEMENT = {
  LEGER: 'LEGER',
  MOYEN: 'MOYEN',
  GRAVE: 'GRAVE'
};

// ========================================
// EVENEMENT - CONSTANTES
// ========================================

const TYPE_EVENEMENT = {
  SPORT: 'SPORT',
  CONCERT: 'CONCERT',
  FESTIVAL: 'FESTIVAL',
  CONFERENCE: 'CONFERENCE',
  SALON: 'SALON',
  MARIAGE: 'MARIAGE',
  CEREMONIE: 'CEREMONIE'
};

const STATUT_EVENEMENT = {
  PROGRAMME: 'PROGRAMME',
  EN_COURS: 'EN_COURS',
  TERMINE: 'TERMINE',
  ANNULE: 'ANNULE'
};

const SOURCE_DETECTION = {
  MANUEL: 'MANUEL',
  AUTOMATIQUE: 'AUTOMATIQUE',
  API_EXTERNE: 'API_EXTERNE'
};

// ========================================
// ALERTE URGENCE - CONSTANTES
// ========================================

const TYPE_ALERTE = {
  SOS: 'SOS',
  ACCIDENT: 'ACCIDENT',
  AGRESSION: 'AGRESSION',
  PANNE: 'PANNE',
  MALAISE: 'MALAISE',
  AUTRE: 'AUTRE'
};

const NIVEAU_GRAVITE = {
  FAIBLE: 'FAIBLE',
  MOYEN: 'MOYEN',
  CRITIQUE: 'CRITIQUE'
};

const STATUT_ALERTE = {
  ACTIVE: 'ACTIVE',
  EN_TRAITEMENT: 'EN_TRAITEMENT',
  RESOLUE: 'RESOLUE',
  FAUSSE_ALERTE: 'FAUSSE_ALERTE'
};

const STATUT_NOTIFICATION_URGENCE = {
  ENVOYE: 'ENVOYE',
  RECU: 'RECU',
  ECHEC: 'ECHEC'
};

// ========================================
// ADMINISTRATEUR - CONSTANTES
// ========================================

const ROLE_ADMIN = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  MODERATEUR: 'MODERATEUR',
  SUPPORT: 'SUPPORT'
};

const PERMISSIONS = {
  ALL: 'ALL',
  GESTION_UTILISATEURS: 'GESTION_UTILISATEURS',
  MODERATION: 'MODERATION',
  ANALYTICS: 'ANALYTICS',
  GESTION_TRAJETS: 'GESTION_TRAJETS',
  GESTION_PAIEMENTS: 'GESTION_PAIEMENTS',
  SUPPORT_CLIENT: 'SUPPORT_CLIENT'
};

// ========================================
// SIGNALEMENT - CONSTANTES
// ========================================

const TYPE_SIGNALEMENT = {
  COMPORTEMENT: 'COMPORTEMENT',
  CONTENU: 'CONTENU',
  FRAUDE: 'FRAUDE',
  SECURITE: 'SECURITE',
  HARCELEMENT: 'HARCELEMENT',
  SPAM: 'SPAM'
};

const STATUT_TRAITEMENT = {
  EN_ATTENTE: 'EN_ATTENTE',
  EN_COURS: 'EN_COURS',
  TRAITE: 'TRAITE',
  REJETE: 'REJETE'
};

const ACTIONS_MODERATION = {
  AVERTISSEMENT: 'AVERTISSEMENT',
  SUSPENSION: 'SUSPENSION',
  BLOCAGE: 'BLOCAGE',
  SUPPRESSION_CONTENU: 'SUPPRESSION_CONTENU',
  AUCUNE_ACTION: 'AUCUNE_ACTION'
};

// ========================================
// VÉHICULE - CONSTANTES
// ========================================

const MARQUES_VEHICULES = {
  TOYOTA: 'TOYOTA',
  NISSAN: 'NISSAN',
  HYUNDAI: 'HYUNDAI',
  KIA: 'KIA',
  HONDA: 'HONDA',
  PEUGEOT: 'PEUGEOT',
  RENAULT: 'RENAULT',
  VOLKSWAGEN: 'VOLKSWAGEN',
  MERCEDES: 'MERCEDES',
  BMW: 'BMW',
  AUTRE: 'AUTRE'
};

const COULEURS_VEHICULES = {
  BLANC: 'BLANC',
  NOIR: 'NOIR',
  GRIS: 'GRIS',
  ROUGE: 'ROUGE',
  BLEU: 'BLEU',
  VERT: 'VERT',
  JAUNE: 'JAUNE',
  ORANGE: 'ORANGE',
  VIOLET: 'VIOLET',
  MARRON: 'MARRON'
};

// ========================================
// GÉOLOCALISATION - CONSTANTES
// ========================================

const COMMUNES_ABIDJAN = {
  ABOBO: 'ABOBO',
  ADJAME: 'ADJAME',
  ATTECOUBE: 'ATTÉCOUBÉ',
  COCODY: 'COCODY',
  KOUMASSI: 'KOUMASSI',
  MARCORY: 'MARCORY',
  PLATEAU: 'PLATEAU',
  PORT_BOUET: 'PORT_BOUET',
  TREICHVILLE: 'TREICHVILLE',
  YOPOUGON: 'YOPOUGON',
  BINGERVILLE: 'BINGERVILLE',
  SONGON: 'SONGON',
  ANYAMA: 'ANYAMA'
};

const VILLES_COTE_DIVOIRE = {
  ABIDJAN: 'ABIDJAN',
  BOUAKE: 'BOUAKE',
  DALOA: 'DALOA',
  YAMOUSSOUKRO: 'YAMOUSSOUKRO',
  KORHOGO: 'KORHOGO',
  SAN_PEDRO: 'SAN_PEDRO',
  MAN: 'MAN',
  GAGNOA: 'GAGNOA',
  DIVO: 'DIVO',
  ABENGOUROU: 'ABENGOUROU'
};

// ========================================
// WAZE INTÉGRATION - CONSTANTES
// ========================================

const WAZE_CONFIG = {
  BASE_URL: 'https://waze.com/ul',
  DEEP_LINK_IOS: 'waze://',
  DEEP_LINK_ANDROID: 'https://waze.com/ul',
  MAX_WAYPOINTS: 3,
  DEFAULT_VEHICLE_TYPE: 'car'
};

const WAZE_NAVIGATION_OPTIONS = {
  AVOID_TOLLS: 'tolls',
  AVOID_HIGHWAYS: 'highways',
  AVOID_FERRIES: 'ferries'
};

const TRAFFIC_LEVELS = {
  LIGHT: 'light',
  NORMAL: 'normal',
  MODERATE: 'moderate',
  HEAVY: 'heavy',
  UNKNOWN: 'unknown'
};

// ========================================
// SOCKET.IO - CONSTANTES
// ========================================

const SOCKET_EVENTS = {
  // Connexion
  CONNECTION: 'connection',
  DISCONNECT: 'disconnect',
  CONNECT: 'connect',
  PING: 'ping',
  PONG: 'pong',
  
  // Chat
  JOIN_CONVERSATION: 'joinConversation',
  SEND_MESSAGE: 'sendMessage',
  NEW_MESSAGE: 'newMessage',
  TYPING: 'typing',
  USER_TYPING: 'userTyping',
  MARK_AS_READ: 'markAsRead',
  
  // GPS/Tracking
  START_TRIP_TRACKING: 'startTripTracking',
  UPDATE_POSITION: 'updatePosition',
  POSITION_UPDATE: 'positionUpdate',
  TRIP_STARTED: 'tripStarted',
  TRIP_ENDED: 'tripEnded',
  
  // Réservations
  MAKE_RESERVATION: 'makeReservation',
  ACCEPT_RESERVATION: 'acceptReservation',
  REJECT_RESERVATION: 'rejectReservation',
  CANCEL_RESERVATION: 'cancelReservation',
  
  // Alertes
  TRIGGER_EMERGENCY: 'triggerEmergency',
  EMERGENCY_ALERT: 'emergencyAlert',
  UPDATE_EMERGENCY_STATUS: 'updateEmergencyStatus',
  
  // Waze
  REQUEST_WAZE_NAVIGATION: 'requestWazeNavigation',
  WAZE_NAVIGATION_READY: 'wazeNavigationReady',
  GET_TRAFFIC_INFO: 'getTrafficInfo',
  TRAFFIC_INFO_UPDATE: 'trafficInfoUpdate',
  
  // Erreurs
  ERROR: 'error'
};

const SOCKET_ERROR_TYPES = {
  CONVERSATION_ERROR: 'CONVERSATION_ERROR',
  MESSAGE_ERROR: 'MESSAGE_ERROR',
  GPS_ERROR: 'GPS_ERROR',
  TRACKING_ERROR: 'TRACKING_ERROR',
  RESERVATION_ERROR: 'RESERVATION_ERROR',
  ALERT_ERROR: 'ALERT_ERROR',
  WAZE_ERROR: 'WAZE_ERROR',
  AUTH_ERROR: 'AUTH_ERROR'
};

// ========================================
// NOTIFICATIONS PUSH - CONSTANTES
// ========================================

const NOTIFICATION_TYPES = {
  NEW_MESSAGE: 'new_message',
  NEW_RESERVATION: 'new_reservation',
  RESERVATION_CONFIRMED: 'reservation_confirmed',
  RESERVATION_REJECTED: 'reservation_rejected',
  TRIP_STARTED: 'trip_started',
  DRIVER_NEARBY: 'driver_nearby',
  TRIP_REMINDER: 'trip_reminder',
  EMERGENCY_ALERT: 'emergency_alert',
  PAYMENT_RECEIVED: 'payment_received'
};

const NOTIFICATION_PRIORITIES = {
  LOW: 'low',
  NORMAL: 'normal',
  HIGH: 'high',
  MAX: 'max'
};

const NOTIFICATION_SOUNDS = {
  DEFAULT: 'default',
  ALERT: 'alert',
  EMERGENCY: 'emergency',
  SILENT: 'silent'
};

// ========================================
// API RESPONSE - CONSTANTES
// ========================================

const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503
};

const API_RESPONSE_STATUS = {
  SUCCESS: 'success',
  ERROR: 'error',
  FAIL: 'fail'
};

// ========================================
// VALIDATION - CONSTANTES
// ========================================

const REGEX_PATTERNS = {
  TELEPHONE_CI: /^(\+225|225)?[0-9]{8,10}$/,
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  IMMATRICULATION: /^[A-Z0-9]{2,10}$/,
  NUMERO_CNI: /^[0-9]{12}$/,
  NUMERO_PASSEPORT: /^[A-Z0-9]{6,9}$/
};

const LIMITES = {
  MIN_PLACES_VEHICULE: 1,
  MAX_PLACES_VEHICULE: 8,
  MIN_PRIX_TRAJET: 100, // FCFA
  MAX_PRIX_TRAJET: 50000, // FCFA
  MAX_DISTANCE_TRAJET: 1000, // km
  MIN_AGE_CONDUCTEUR: 18,
  MAX_AGE_UTILISATEUR: 80,
  MAX_CARACTERES_COMMENTAIRE: 500,
  MAX_TAILLE_PHOTO: 5 * 1024 * 1024, // 5MB
  MAX_CONTACTS_URGENCE: 3,
  MAX_DISTANCE_RECHERCHE: 50, // km
  MAX_JOURS_RESERVATION_AVANCE: 30,
  MIN_HEURES_ANNULATION: 2
};

// ========================================
// ERREURS - CONSTANTES
// ========================================

const CODES_ERREUR = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  AUTHENTICATION_ERROR: 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR: 'AUTHORIZATION_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED'
};

const MESSAGES_ERREUR = {
  UTILISATEUR_NON_TROUVE: 'Utilisateur non trouvé',
  TRAJET_NON_TROUVE: 'Trajet non trouvé',
  RESERVATION_NON_TROUVE: 'Réservation non trouvée',
  EMAIL_EXISTE_DEJA: 'Un compte avec cet email existe déjà',
  TELEPHONE_EXISTE_DEJA: 'Un compte avec ce numéro de téléphone existe déjà',
  MOT_DE_PASSE_INCORRECT: 'Mot de passe incorrect',
  TOKEN_INVALIDE: 'Token d\'authentification invalide',
  ACCES_NON_AUTORISE: 'Accès non autorisé',
  PLACES_INSUFFISANTES: 'Nombre de places insuffisant',
  TRAJET_DEJA_COMMENCE: 'Ce trajet a déjà commencé',
  RESERVATION_DEJA_EXISTANTE: 'Une réservation existe déjà pour ce trajet'
};

// ========================================
// CONFIGURATION - CONSTANTES
// ========================================

const CONFIG = {
  JWT_EXPIRATION: '24h',
  BCRYPT_ROUNDS: 12,
  RATE_LIMIT_WINDOW: 15 * 60 * 1000, // 15 minutes
  RATE_LIMIT_MAX: 100, // requêtes par fenêtre
  PAGINATION_LIMIT_DEFAULT: 20,
  PAGINATION_LIMIT_MAX: 100,
  DISTANCE_RECHERCHE_DEFAULT: 10, // km
  TEMPS_LIMITE_CONFIRMATION: 30 * 60 * 1000, // 30 minutes
  DELAI_ANNULATION_GRATUITE: 2 * 60 * 60 * 1000, // 2 heures
  WEBSOCKET_PING_TIMEOUT: 60000,
  WEBSOCKET_PING_INTERVAL: 25000
};

// ========================================
// EXPORTS
// ========================================

module.exports = {
  // Utilisateur
  SEXE,
  TYPE_DOCUMENT_IDENTITE,
  STATUT_VERIFICATION,
  PREFERENCE_CONVERSATION,
  LANGUES,
  RELATION_CONTACT_URGENCE,
  BADGES_UTILISATEUR,
  STATUT_COMPTE,
  STATUT_PAIEMENT_DETAILLE,

  // Trajet
  TYPE_TRAJET,
  JOURS_SEMAINE,
  TYPE_BAGAGES,
  STATUT_TRAJET,

  // Réservation
  STATUT_RESERVATION,
  STATUT_PAIEMENT,
  METHODE_PAIEMENT,
  TYPE_NOTIFICATION,

  // Message
  TYPE_MESSAGE,
  MESSAGES_PREDEFINIS,
  TYPE_PIECE_JOINTE,

  // Évaluation
  TYPE_EVALUATEUR,
  ASPECTS_POSITIFS,
  ASPECTS_A_AMELIORER,
  GRAVITE_SIGNALEMENT,

  // Événement
  TYPE_EVENEMENT,
  STATUT_EVENEMENT,
  SOURCE_DETECTION,

  // Alerte urgence
  TYPE_ALERTE,
  NIVEAU_GRAVITE,
  STATUT_ALERTE,
  STATUT_NOTIFICATION_URGENCE,

  // Administration
  ROLE_ADMIN,
  PERMISSIONS,

  // Signalement
  TYPE_SIGNALEMENT,
  STATUT_TRAITEMENT,
  ACTIONS_MODERATION,

  // Véhicule
  MARQUES_VEHICULES,
  COULEURS_VEHICULES,

  // Géolocalisation
  COMMUNES_ABIDJAN,
  VILLES_COTE_DIVOIRE,

  // Waze intégration
  WAZE_CONFIG,
  WAZE_NAVIGATION_OPTIONS,
  TRAFFIC_LEVELS,

  // Socket.IO
  SOCKET_EVENTS,
  SOCKET_ERROR_TYPES,

  // Notifications
  NOTIFICATION_TYPES,
  NOTIFICATION_PRIORITIES,
  NOTIFICATION_SOUNDS,

  // API
  HTTP_STATUS,
  API_RESPONSE_STATUS,

  // Validation
  REGEX_PATTERNS,
  LIMITES,

  // Erreurs
  CODES_ERREUR,
  MESSAGES_ERREUR,

  // Configuration
  CONFIG
};