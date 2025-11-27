/**
 * ============================================================================
 * WAYZ-ECO - FICHIER DE CONSTANTES
 * ============================================================================
 * Contient tous les enums, rôles, permissions et statuts de l'application
 * Version: 1.0
 * Dernière mise à jour: 2024
 * ============================================================================
 */

// ============================================================================
// SECTION 1: UTILISATEUR
// ============================================================================

/**
 * Sexe de l'utilisateur
 */
const SEXE = {
  MASCULIN: 'M',
  FEMININ: 'F'
};

/**
 * Types de documents d'identité acceptés
 */
const TYPE_DOCUMENT_IDENTITE = {
  CNI: 'CNI',
  PASSEPORT: 'PASSEPORT',
  PERMIS: 'PERMIS_CONDUIRE',
  ATTESTATION_IDENTITE: 'ATTESTATION_IDENTITE'
};

/**
 * Statuts de vérification des documents
 */
const STATUT_VERIFICATION = {
  NON_SOUMIS: 'NON_SOUMIS',
  EN_ATTENTE: 'EN_ATTENTE',
  VERIFIE: 'VERIFIE',
  REJETE: 'REJETE'
};

/**
 * Formats de documents valides pour upload
 */
const FORMATS_DOCUMENT_VALIDES = {
  IMAGE_JPEG: 'image/jpeg',
  IMAGE_PNG: 'image/png', 
  IMAGE_JPG: 'image/jpg',
  PDF: 'application/pdf'
};

/**
 * Formats d'images valides pour selfies et photos de profil
 */
const FORMATS_IMAGE_VALIDES = {
  JPEG: 'image/jpeg',
  PNG: 'image/png',
  JPG: 'image/jpg'
};

/**
 * Tailles maximales de fichiers (en octets)
 */
const TAILLE_MAX_FICHIER = {
  DOCUMENT: 10 * 1024 * 1024, // 10MB
  IMAGE: 5 * 1024 * 1024 // 5MB
};

/**
 * Types d'upload pour Cloudinary
 */
const TYPE_UPLOAD = {
  DOCUMENT: 'document',
  SELFIE: 'selfie',
  PROFIL: 'profil'
};

/**
 * Préférences de conversation de l'utilisateur
 */
const PREFERENCE_CONVERSATION = {
  BAVARD: 'BAVARD',
  CALME: 'CALME',
  NEUTRE: 'NEUTRE'
};

/**
 * Langues disponibles
 */
const LANGUES = {
  FRANCAIS: 'FR',
  ANGLAIS: 'ANG'
};

/**
 * Relations pour les contacts d'urgence
 */
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

/**
 * Badges attribuables aux utilisateurs
 */
const BADGES_UTILISATEUR = {
  PONCTUEL: 'PONCTUEL',
  PROPRE: 'PROPRE',
  SYMPATHIQUE: 'SYMPATHIQUE',
  CONDUCTEUR_EXPERIMENTE: 'CONDUCTEUR_EXPERIMENTE',
  PASSAGER_IDEAL: 'PASSAGER_IDEAL',
  COMMUNICATIF: 'COMMUNICATIF',
  RESPECTUEUX: 'RESPECTUEUX'
};

/**
 * Statuts possibles d'un compte utilisateur
 */
const STATUT_COMPTE = {
  ACTIF: 'ACTIF',
  SUSPENDU: 'SUSPENDU',
  BLOQUE: 'BLOQUE',
  INACTIF: 'INACTIF'
};

// ============================================================================
// SECTION 2: CLOUDINARY - GESTION DES MÉDIAS
// ============================================================================

/**
 * Configuration des dossiers Cloudinary
 */
const CLOUDINARY_CONFIG = {
  DOSSIER_DOCUMENTS: 'wayz-eco/documents',
  DOSSIER_SELFIES: 'wayz-eco/selfies',
  DOSSIER_PROFILS: 'wayz-eco/profils',
  DOSSIER_VEHICULES: 'wayz-eco/vehicules',
  QUALITE_IMAGE: 'auto:good',
  FORMAT_IMAGE: 'jpg'
};

/**
 * Types de ressources Cloudinary
 */
const RESOURCE_TYPE_CLOUDINARY = {
  IMAGE: 'image',
  RAW: 'raw',
  AUTO: 'auto',
  VIDEO: 'video'
};

// ============================================================================
// SECTION 3: COMPTE COVOITURAGE & PAIEMENTS
// ============================================================================

/**
 * Statuts de recharge du compte covoiturage
 */
const STATUT_RECHARGE = {
  EN_ATTENTE: 'en_attente',
  REUSSI: 'reussi', 
  ECHEC: 'echec',
  ANNULE: 'annule'
};

/**
 * Types de prélèvement sur le compte
 */
const TYPE_PRELEVEMENT = {
  COMPTE_RECHARGE: 'compte_recharge',
  PAIEMENT_MOBILE: 'paiement_mobile',
  GAIN_COURSE: 'gain_course',
  COMMISSION: 'commission'
};

/**
 * Statuts de prélèvement
 */
const STATUT_PRELEVEMENT = {
  PRELEVE: 'preleve',
  ECHEC: 'echec',
  REMBOURSE: 'rembourse',
  COMPLETE: 'complete'
};

/**
 * Opérateurs de paiement mobile en Côte d'Ivoire
 */
const OPERATEURS_MOBILE = {
  ORANGE: 'ORANGE',
  MTN: 'MTN',
  MOOV: 'MOOV',
  WAVE: 'WAVE'
};

/**
 * Méthodes de paiement disponibles
 */
const METHODE_PAIEMENT = {
  COMPTE_COVOITURAGE: 'COMPTE_COVOITURAGE',
  ESPECES: 'ESPECES',
  WAVE: 'WAVE',
  ORANGE_MONEY: 'ORANGE_MONEY',
  MTN_MONEY: 'MTN_MONEY',
  MOOV_MONEY: 'MOOV_MONEY'
};

/**
 * Statuts de paiement (version simple)
 */
const STATUT_PAIEMENT = {
  EN_ATTENTE: 'EN_ATTENTE',
  PAYE: 'PAYE',
  REMBOURSE: 'REMBOURSE',
  ECHEC: 'ECHEC',
  TRAITE: 'TRAITE',
  COMPLETE: 'COMPLETE',
  ANNULE: 'ANNULE'
};

/**
 * Statuts de paiement détaillés (avec états supplémentaires)
 */
const STATUT_PAIEMENT_DETAILLE = {
  EN_ATTENTE: 'EN_ATTENTE',
  EN_COURS: 'EN_COURS',
  PAYE: 'PAYE',
  REMBOURSE: 'REMBOURSE',
  ECHEC: 'ECHEC',
  TRAITE: 'TRAITE',
  COMPLETE: 'COMPLETE',
  ANNULE: 'ANNULE',
  EXPIRE: 'EXPIRE'
};

// ============================================================================
// SECTION 4: SÉCURITÉ & AUTHENTIFICATION
// ============================================================================

/**
 * Types de devices pour les sessions
 */
const TYPE_DEVICE = {
  MOBILE: 'mobile',
  DESKTOP: 'desktop', 
  TABLET: 'tablet',
  UNKNOWN: 'unknown'
};

/**
 * Raisons de révocation de token
 */
const REVOCATION_REASON = {
  USER_LOGOUT: 'USER_LOGOUT',
  PASSWORD_CHANGED: 'PASSWORD_CHANGED',
  MAX_SESSIONS_EXCEEDED: 'MAX_SESSIONS_EXCEEDED',
  TOKEN_ROTATION: 'TOKEN_ROTATION',
  LOGOUT_ALL_DEVICES: 'LOGOUT_ALL_DEVICES',
  EXPIRED: 'EXPIRED',
  SECURITY_BREACH: 'SECURITY_BREACH'
};

/**
 * Statuts de vérification WhatsApp
 */
const STATUT_VERIFICATION_WHATSAPP = {
  EN_ATTENTE: 'EN_ATTENTE',
  VERIFIE: 'VERIFIE',
  EXPIRE: 'EXPIRE',
  ECHEC: 'ECHEC'
};

/**
 * Délais et limites pour la vérification
 */
const DELAIS_VERIFICATION = {
  CODE_WHATSAPP: 10 * 60 * 1000, // 10 minutes
  CODE_RESET: 10 * 60 * 1000, // 10 minutes
  DELAI_RENVOI_CODE: 2 * 60 * 1000, // 2 minutes
  TENTATIVES_MAX: 5
};

// ============================================================================
// SECTION 5: TRAJETS
// ============================================================================

/**
 * Types de trajets
 */
const TYPE_TRAJET = {
  PONCTUEL: 'PONCTUEL',
  RECURRENT: 'RECURRENT',
  EVENEMENTIEL: 'EVENEMENTIEL'
};

/**
 * Jours de la semaine pour trajets récurrents
 */
const JOURS_SEMAINE = {
  LUNDI: 'LUNDI',
  MARDI: 'MARDI',
  MERCREDI: 'MERCREDI',
  JEUDI: 'JEUDI',
  VENDREDI: 'VENDREDI',
  SAMEDI: 'SAMEDI',
  DIMANCHE: 'DIMANCHE'
};

/**
 * Types de bagages acceptés
 */
const TYPE_BAGAGES = {
  AUCUN: 'AUCUN',
  PETIT: 'PETIT',
  MOYEN: 'MOYEN',
  GRAND: 'GRAND'
};

/**
 * Statuts possibles d'un trajet
 */
const STATUT_TRAJET = {
  PROGRAMME: 'PROGRAMME',
  EN_COURS: 'EN_COURS',
  TERMINE: 'TERMINE',
  ANNULE: 'ANNULE',
  SUSPENDU: 'SUSPENDU'
};

// ============================================================================
// SECTION 6: RÉSERVATIONS
// ============================================================================

/**
 * Statuts de réservation
 */
const STATUT_RESERVATION = {
  EN_ATTENTE: 'EN_ATTENTE',
  CONFIRMEE: 'CONFIRMEE',
  REFUSEE: 'REFUSEE',
  ANNULEE: 'ANNULEE',
  TERMINEE: 'TERMINEE',
  EXPIREE: 'EXPIREE'
};

/**
 * Types de notifications
 */
const TYPE_NOTIFICATION = {
  RAPPEL_DEPART: 'RAPPEL_DEPART',
  CONDUCTEUR_PROCHE: 'CONDUCTEUR_PROCHE',
  ARRIVEE: 'ARRIVEE',
  RESERVATION_CONFIRMEE: 'RESERVATION_CONFIRMEE',
  RESERVATION_REFUSEE: 'RESERVATION_REFUSEE',
  TRAJET_ANNULE: 'TRAJET_ANNULE',
  NOUVEAU_MESSAGE: 'NOUVEAU_MESSAGE',
  PAIEMENT_RECU: 'PAIEMENT_RECU'
};

// ============================================================================
// SECTION 7: MESSAGERIE
// ============================================================================

/**
 * Types de messages
 */
const TYPE_MESSAGE = {
  TEXTE: 'TEXTE',
  POSITION: 'POSITION',
  MODELE_PREDEFINI: 'MODELE_PREDEFINI',
  IMAGE: 'IMAGE',
  LOCALISATION: 'LOCALISATION',
  SYSTEME: 'SYSTEME'
};

/**
 * Messages prédéfinis pour communication rapide
 */
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

/**
 * Types de pièces jointes
 */
const TYPE_PIECE_JOINTE = {
  IMAGE: 'IMAGE',
  LOCALISATION: 'LOCALISATION',
  DOCUMENT: 'DOCUMENT'
};

// ============================================================================
// SECTION 8: ÉVALUATIONS & SIGNALEMENTS
// ============================================================================

/**
 * Type d'évaluateur
 */
const TYPE_EVALUATEUR = {
  CONDUCTEUR: 'CONDUCTEUR',
  PASSAGER: 'PASSAGER'
};

/**
 * Aspects positifs dans les évaluations
 */
const ASPECTS_POSITIFS = {
  PONCTUEL: 'PONCTUEL',
  SYMPATHIQUE: 'SYMPATHIQUE',
  VEHICULE_PROPRE: 'VEHICULE_PROPRE',
  CONDUITE_SECURISEE: 'CONDUITE_SECURISEE',
  RESPECTUEUX: 'RESPECTUEUX',
  BON_COMMUNICANT: 'BON_COMMUNICANT',
  FLEXIBLE: 'FLEXIBLE'
};

/**
 * Aspects à améliorer dans les évaluations
 */
const ASPECTS_A_AMELIORER = {
  PONCTUALITE: 'PONCTUALITE',
  PROPRETE: 'PROPRETE',
  CONDUITE: 'CONDUITE',
  COMMUNICATION: 'COMMUNICATION',
  RESPECT: 'RESPECT',
  SECURITE: 'SECURITE'
};

/**
 * Gravité d'un signalement
 */
const GRAVITE_SIGNALEMENT = {
  LEGER: 'LEGER',
  MOYEN: 'MOYEN',
  GRAVE: 'GRAVE',
  CRITIQUE: 'CRITIQUE'
};

/**
 * Types de signalements
 */
const TYPE_SIGNALEMENT = {
  COMPORTEMENT: 'COMPORTEMENT',
  CONTENU: 'CONTENU',
  FRAUDE: 'FRAUDE',
  SECURITE: 'SECURITE',
  HARCELEMENT: 'HARCELEMENT',
  SPAM: 'SPAM',
  CONDUITE_DANGEREUSE: 'CONDUITE_DANGEREUSE'
};

/**
 * Statuts de traitement des signalements
 */
const STATUT_TRAITEMENT = {
  EN_ATTENTE: 'EN_ATTENTE',
  EN_COURS: 'EN_COURS',
  TRAITE: 'TRAITE',
  REJETE: 'REJETE',
  ARCHIVE: 'ARCHIVE'
};

/**
 * Actions de modération possibles
 */
const ACTIONS_MODERATION = {
  AVERTISSEMENT: 'AVERTISSEMENT',
  SUSPENSION: 'SUSPENSION',
  BLOCAGE: 'BLOCAGE',
  SUPPRESSION_CONTENU: 'SUPPRESSION_CONTENU',
  AUCUNE_ACTION: 'AUCUNE_ACTION'
};

// ============================================================================
// SECTION 9: ÉVÉNEMENTS
// ============================================================================

/**
 * Types d'événements
 */
const TYPE_EVENEMENT = {
  SPORT: 'SPORT',
  CONCERT: 'CONCERT',
  FESTIVAL: 'FESTIVAL',
  CONFERENCE: 'CONFERENCE',
  SALON: 'SALON',
  MARIAGE: 'MARIAGE',
  CEREMONIE: 'CEREMONIE',
  AUTRE: 'AUTRE'
};

/**
 * Statuts d'événements
 */
const STATUT_EVENEMENT = {
  PROGRAMME: 'PROGRAMME',
  EN_COURS: 'EN_COURS',
  TERMINE: 'TERMINE',
  ANNULE: 'ANNULE',
  REPORTE: 'REPORTE'
};

/**
 * Source de détection d'événement
 */
const SOURCE_DETECTION = {
  MANUEL: 'MANUEL',
  AUTOMATIQUE: 'AUTOMATIQUE',
  API_EXTERNE: 'API_EXTERNE',
  UTILISATEUR: 'UTILISATEUR'
};

// ============================================================================
// SECTION 10: ALERTES D'URGENCE
// ============================================================================

/**
 * Types d'alertes d'urgence
 */
const TYPE_ALERTE = {
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
const NIVEAU_GRAVITE = {
  FAIBLE: 'FAIBLE',
  MOYEN: 'MOYEN',
  CRITIQUE: 'CRITIQUE',
  URGENCE: 'URGENCE'
};

/**
 * Statuts des alertes d'urgence
 */
const STATUT_ALERTE = {
  ACTIVE: 'ACTIVE',
  EN_TRAITEMENT: 'EN_TRAITEMENT',
  RESOLUE: 'RESOLUE',
  FAUSSE_ALERTE: 'FAUSSE_ALERTE',
  ANNULEE: 'ANNULEE'
};

/**
 * Statuts de notification d'urgence
 */
const STATUT_NOTIFICATION_URGENCE = {
  ENVOYE: 'ENVOYE',
  RECU: 'RECU',
  ECHEC: 'ECHEC',
  LU: 'LU'
};

// ============================================================================
// SECTION 11: ADMINISTRATION
// ============================================================================

/**
 * Rôles administrateurs
 */
const ROLE_ADMIN = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
  MODERATEUR: 'MODERATEUR',
  SUPPORT: 'SUPPORT'
};

/**
 * Permissions disponibles
 */
const PERMISSIONS = {
  ALL: 'ALL',
  GESTION_UTILISATEURS: 'GESTION_UTILISATEURS',
  VERIFICATION_DOCUMENTS: 'VERIFICATION_DOCUMENTS',
  MODERATION: 'MODERATION',
  ANALYTICS: 'ANALYTICS',
  GESTION_TRAJETS: 'GESTION_TRAJETS',
  GESTION_PAIEMENTS: 'GESTION_PAIEMENTS',
  SUPPORT_CLIENT: 'SUPPORT_CLIENT',
  GESTION_EVENEMENTS: 'GESTION_EVENEMENTS'
};

// ============================================================================
// SECTION 12: VÉHICULES
// ============================================================================

/**
 * Marques de véhicules courantes en Côte d'Ivoire
 */
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
  FORD: 'FORD',
  AUTRE: 'AUTRE'
};

/**
 * Couleurs de véhicules
 */
const COULEURS_VEHICULES = {
  BLANC: 'BLANC',
  NOIR: 'NOIR',
  GRIS: 'GRIS',
  ARGENT: 'ARGENT',
  ROUGE: 'ROUGE',
  BLEU: 'BLEU',
  VERT: 'VERT',
  JAUNE: 'JAUNE',
  ORANGE: 'ORANGE',
  VIOLET: 'VIOLET',
  MARRON: 'MARRON',
  BEIGE: 'BEIGE'
};

/**
 * Types de véhicules
 */
const TYPE_VEHICULE = {
  BERLINE: 'BERLINE',
  SUV: 'SUV',
  BREAK: 'BREAK',
  MONOSPACE: 'MONOSPACE',
  UTILITAIRE: 'UTILITAIRE',
  AUTRE: 'AUTRE'
};

// ============================================================================
// SECTION 13: GÉOLOCALISATION
// ============================================================================

/**
 * Communes d'Abidjan
 */
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

/**
 * Principales villes de Côte d'Ivoire
 */
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
  ABENGOUROU: 'ABENGOUROU',
  GRAND_BASSAM: 'GRAND_BASSAM',
  SASSANDRA: 'SASSANDRA'
};

// ============================================================================
// SECTION 14: INTÉGRATION WAZE
// ============================================================================

/**
 * Configuration Waze
 */
const WAZE_CONFIG = {
  BASE_URL: 'https://waze.com/ul',
  DEEP_LINK_IOS: 'waze://',
  DEEP_LINK_ANDROID: 'https://waze.com/ul',
  MAX_WAYPOINTS: 3,
  DEFAULT_VEHICLE_TYPE: 'car'
};

/**
 * Options de navigation Waze
 */
const WAZE_NAVIGATION_OPTIONS = {
  AVOID_TOLLS: 'tolls',
  AVOID_HIGHWAYS: 'highways',
  AVOID_FERRIES: 'ferries',
  AVOID_DIRT_ROADS: 'dirt_roads'
};

/**
 * Niveaux de trafic
 */
const TRAFFIC_LEVELS = {
  LIGHT: 'light',
  NORMAL: 'normal',
  MODERATE: 'moderate',
  HEAVY: 'heavy',
  STANDSTILL: 'standstill',
  UNKNOWN: 'unknown'
};

// ============================================================================
// SECTION 15: SOCKET.IO - TEMPS RÉEL
// ============================================================================

/**
 * Événements Socket.IO
 */
const SOCKET_EVENTS = {
  // Connexion
  CONNECTION: 'connection',
  DISCONNECT: 'disconnect',
  CONNECT: 'connect',
  RECONNECT: 'reconnect',
  PING: 'ping',
  PONG: 'pong',
  ERROR: 'error',
  
  // Authentification
  AUTHENTICATE: 'authenticate',
  AUTHENTICATED: 'authenticated',
  UNAUTHORIZED: 'unauthorized',
  
  // Chat
  JOIN_CONVERSATION: 'joinConversation',
  LEAVE_CONVERSATION: 'leaveConversation',
  SEND_MESSAGE: 'sendMessage',
  NEW_MESSAGE: 'newMessage',
  TYPING: 'typing',
  USER_TYPING: 'userTyping',
  STOP_TYPING: 'stopTyping',
  MARK_AS_READ: 'markAsRead',
  MESSAGE_READ: 'messageRead',
  
  // GPS/Tracking
  START_TRIP_TRACKING: 'startTripTracking',
  STOP_TRIP_TRACKING: 'stopTripTracking',
  UPDATE_POSITION: 'updatePosition',
  POSITION_UPDATE: 'positionUpdate',
  TRIP_STARTED: 'tripStarted',
  TRIP_ENDED: 'tripEnded',
  DRIVER_LOCATION: 'driverLocation',
  
  // Réservations
  NEW_RESERVATION: 'newReservation',
  RESERVATION_UPDATE: 'reservationUpdate',
  ACCEPT_RESERVATION: 'acceptReservation',
  REJECT_RESERVATION: 'rejectReservation',
  CANCEL_RESERVATION: 'cancelReservation',
  
  // Alertes
  TRIGGER_EMERGENCY: 'triggerEmergency',
  EMERGENCY_ALERT: 'emergencyAlert',
  UPDATE_EMERGENCY_STATUS: 'updateEmergencyStatus',
  EMERGENCY_RESOLVED: 'emergencyResolved',
  
  // Notifications
  NEW_NOTIFICATION: 'newNotification',
  NOTIFICATION_READ: 'notificationRead',
  
  // Waze
  REQUEST_WAZE_NAVIGATION: 'requestWazeNavigation',
  WAZE_NAVIGATION_READY: 'wazeNavigationReady',
  GET_TRAFFIC_INFO: 'getTrafficInfo',
  TRAFFIC_INFO_UPDATE: 'trafficInfoUpdate'
};

/**
 * Types d'erreurs Socket.IO
 */
const SOCKET_ERROR_TYPES = {
  CONVERSATION_ERROR: 'CONVERSATION_ERROR',
  MESSAGE_ERROR: 'MESSAGE_ERROR',
  GPS_ERROR: 'GPS_ERROR',
  TRACKING_ERROR: 'TRACKING_ERROR',
  RESERVATION_ERROR: 'RESERVATION_ERROR',
  ALERT_ERROR: 'ALERT_ERROR',
  WAZE_ERROR: 'WAZE_ERROR',
  AUTH_ERROR: 'AUTH_ERROR',
  CONNECTION_ERROR: 'CONNECTION_ERROR',
  PERMISSION_ERROR: 'PERMISSION_ERROR'
};

// ============================================================================
// SECTION 16: NOTIFICATIONS PUSH
// ============================================================================

/**
 * Types de notifications push
 */
const NOTIFICATION_TYPES = {
  NEW_MESSAGE: 'new_message',
  NEW_RESERVATION: 'new_reservation',
  RESERVATION_CONFIRMED: 'reservation_confirmed',
  RESERVATION_REJECTED: 'reservation_rejected',
  RESERVATION_CANCELLED: 'reservation_cancelled',
  TRIP_STARTED: 'trip_started',
  TRIP_ENDED: 'trip_ended',
  DRIVER_NEARBY: 'driver_nearby',
  TRIP_REMINDER: 'trip_reminder',
  EMERGENCY_ALERT: 'emergency_alert',
  PAYMENT_RECEIVED: 'payment_received',
  PAYMENT_SUCCESS: 'payment_success',
  PAYMENT_FAILED: 'payment_failed',
  DOCUMENT_VERIFIED: 'document_verified',
  DOCUMENT_REJECTED: 'document_rejected'
};

/**
 * Priorités des notifications
 */
const NOTIFICATION_PRIORITIES = {
  LOW: 'low',
  NORMAL: 'normal',
  HIGH: 'high',
  MAX: 'max'
};

/**
 * Sons de notifications
 */
const NOTIFICATION_SOUNDS = {
  DEFAULT: 'default',
  ALERT: 'alert',
  EMERGENCY: 'emergency',
  MESSAGE: 'message',
  SILENT: 'silent'
};

// ============================================================================
// SECTION 17: API - CODES HTTP & RÉPONSES
// ============================================================================

/**
 * Codes de statut HTTP
 */
const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  ACCEPTED: 202,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  CONFLICT: 409,
  GONE: 410,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504
};

/**
 * Statuts de réponse API
 */
const API_RESPONSE_STATUS = {
  SUCCESS: 'success',
  ERROR: 'error',
  FAIL: 'fail'
};

// ============================================================================
// SECTION 18: VALIDATION - REGEX & LIMITES
// ============================================================================

/**
 * Patterns regex pour validation
 */
const REGEX_PATTERNS = {
  // Téléphone ivoirien (format: +225XXXXXXXX ou 225XXXXXXXX ou XXXXXXXX)
  TELEPHONE_CI: /^(\+225|225)?[0-9]{8,10}$/,
  
  // Email standard
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  
  // Immatriculation véhicule
  IMMATRICULATION: /^[A-Z0-9]{2,10}$/,
  
  // Numéro CNI (12 chiffres)
  NUMERO_CNI: /^[0-9]{12}$/,
  
  // Numéro passeport (6-9 caractères alphanumériques)
  NUMERO_PASSEPORT: /^[A-Z0-9]{6,9}$/,
  
  // Numéro permis de conduire (6-12 caractères alphanumériques)
  NUMERO_PERMIS: /^[A-Z0-9]{6,12}$/,
  
  // Code postal (5 chiffres)
  CODE_POSTAL: /^[0-9]{5}$/,
  
  // Mot de passe fort (min 8 caractères, 1 maj, 1 min, 1 chiffre)
  MOT_DE_PASSE_FORT: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/
};

/**
 * Limites et contraintes de l'application
 */
const LIMITES = {
  // Véhicules
  MIN_PLACES_VEHICULE: 1,
  MAX_PLACES_VEHICULE: 8,
  MIN_ANNEE_VEHICULE: 1990,
  MAX_ANNEE_VEHICULE: new Date().getFullYear() + 1,
  
  // Trajets
  MIN_PRIX_TRAJET: 100, // FCFA
  MAX_PRIX_TRAJET: 50000, // FCFA
  MAX_DISTANCE_TRAJET: 1000, // km
  MAX_DUREE_TRAJET: 24, // heures
  
  // Utilisateurs
  MIN_AGE_CONDUCTEUR: 18,
  MIN_AGE_PASSAGER: 16,
  MAX_AGE_UTILISATEUR: 80,
  
  // Textes et médias
  MAX_CARACTERES_COMMENTAIRE: 500,
  MAX_CARACTERES_DESCRIPTION: 1000,
  MAX_CARACTERES_MESSAGE: 1000,
  MAX_TAILLE_PHOTO: 5 * 1024 * 1024, // 5MB
  MAX_TAILLE_DOCUMENT: 10 * 1024 * 1024, // 10MB
  MAX_TAILLE_IMAGE: 5 * 1024 * 1024, // 5MB
  
  // Contacts et relations
  MAX_CONTACTS_URGENCE: 3,
  MAX_VEHICULES_PAR_CONDUCTEUR: 5,
  
  // Recherche et réservation
  MAX_DISTANCE_RECHERCHE: 50, // km
  MIN_DISTANCE_RECHERCHE: 1, // km
  MAX_JOURS_RESERVATION_AVANCE: 30,
  MIN_HEURES_ANNULATION: 2,
  MAX_RESERVATIONS_SIMULTANEES: 5,
  
  // Évaluations
  NOTE_MIN: 1,
  NOTE_MAX: 5,
  
  // Sécurité
  MAX_SESSIONS_ACTIVES: 5,
  MIN_TENTATIVES_CODE: 0,
  MAX_TENTATIVES_CODE: 5,
  DELAI_RENVOI_CODE: 2 * 60 * 1000, // 2 minutes
  MAX_LOGIN_ATTEMPTS: 5,
  LOCKOUT_DURATION: 15 * 60 * 1000, // 15 minutes
  
  // Pagination
  PAGINATION_DEFAULT: 20,
  PAGINATION_MAX: 100
};

// ============================================================================
// SECTION 19: ERREURS
// ============================================================================

/**
 * Codes d'erreur de l'application
 */
const CODES_ERREUR = {
  // Validation
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
  
  // Authentification
  AUTHENTICATION_ERROR: 'AUTHENTICATION_ERROR',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_INVALID: 'TOKEN_INVALID',
  UNAUTHORIZED: 'UNAUTHORIZED',
  
  // Autorisation
  AUTHORIZATION_ERROR: 'AUTHORIZATION_ERROR',
  FORBIDDEN: 'FORBIDDEN',
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',
  
  // Ressources
  NOT_FOUND: 'NOT_FOUND',
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  TRIP_NOT_FOUND: 'TRIP_NOT_FOUND',
  RESERVATION_NOT_FOUND: 'RESERVATION_NOT_FOUND',
  VEHICLE_NOT_FOUND: 'VEHICLE_NOT_FOUND',
  
  // Conflits
  CONFLICT: 'CONFLICT',
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  EMAIL_ALREADY_EXISTS: 'EMAIL_ALREADY_EXISTS',
  PHONE_ALREADY_EXISTS: 'PHONE_ALREADY_EXISTS',
  
  // Documents
  DOCUMENT_PENDING: 'DOCUMENT_PENDING',
  NO_PENDING_DOCUMENT: 'NO_PENDING_DOCUMENT',
  DOCUMENT_ALREADY_VERIFIED: 'DOCUMENT_ALREADY_VERIFIED',
  INVALID_DOCUMENT_FORMAT: 'INVALID_DOCUMENT_FORMAT',
  INVALID_SELFIE_FORMAT: 'INVALID_SELFIE_FORMAT',
  
  // Upload
  UPLOAD_ERROR: 'UPLOAD_ERROR',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  INVALID_FILE_TYPE: 'INVALID_FILE_TYPE',
  
  // Paiement
  PAYMENT_ERROR: 'PAYMENT_ERROR',
  INSUFFICIENT_BALANCE: 'INSUFFICIENT_BALANCE',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  
  // Sécurité
  SESSION_LIMIT_EXCEEDED: 'SESSION_LIMIT_EXCEEDED',
  CODE_VERIFICATION_EXPIRED: 'CODE_VERIFICATION_EXPIRED',
  INVALID_VERIFICATION_CODE: 'INVALID_VERIFICATION_CODE',
  TOO_MANY_ATTEMPTS: 'TOO_MANY_ATTEMPTS',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  ACCOUNT_SUSPENDED: 'ACCOUNT_SUSPENDED',
  
  // Système
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  DATABASE_ERROR: 'DATABASE_ERROR',
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE'
};

/**
 * Messages d'erreur en français
 */
const MESSAGES_ERREUR = {
  // Utilisateurs
  UTILISATEUR_NON_TROUVE: 'Utilisateur non trouvé',
  EMAIL_EXISTE_DEJA: 'Un compte avec cet email existe déjà',
  TELEPHONE_EXISTE_DEJA: 'Un compte avec ce numéro de téléphone existe déjà',
  
  // Authentification
  MOT_DE_PASSE_INCORRECT: 'Mot de passe incorrect',
  IDENTIFIANTS_INVALIDES: 'Email ou mot de passe incorrect',
  TOKEN_INVALIDE: 'Token d\'authentification invalide',
  TOKEN_EXPIRE: 'Votre session a expiré, veuillez vous reconnecter',
  
  // Autorisation
  ACCES_NON_AUTORISE: 'Accès non autorisé',
  PERMISSIONS_INSUFFISANTES: 'Vous n\'avez pas les permissions nécessaires',
  
  // Trajets
  TRAJET_NON_TROUVE: 'Trajet non trouvé',
  PLACES_INSUFFISANTES: 'Nombre de places insuffisant',
  TRAJET_DEJA_COMMENCE: 'Ce trajet a déjà commencé',
  TRAJET_ANNULE: 'Ce trajet a été annulé',
  
  // Réservations
  RESERVATION_NON_TROUVE: 'Réservation non trouvée',
  RESERVATION_DEJA_EXISTANTE: 'Une réservation existe déjà pour ce trajet',
  RESERVATION_EXPIREE: 'Cette réservation a expiré',
  
  // Documents
  DOCUMENT_EN_ATTENTE: 'Un document est déjà en attente de vérification',
  DOCUMENT_NON_TROUVE: 'Aucun document en attente de vérification',
  DOCUMENT_DEJA_VERIFIE: 'Ce document a déjà été vérifié',
  FORMAT_DOCUMENT_INVALIDE: 'Format de document non supporté (JPG, PNG ou PDF uniquement)',
  FORMAT_SELFIE_INVALIDE: 'La photo selfie doit être une image (JPG ou PNG)',
  
  // Upload
  TAILLE_FICHIER_EXCEDEE: 'Fichier trop volumineux',
  ERREUR_UPLOAD: 'Erreur lors du téléchargement du fichier',
  
  // Paiement
  SOLDE_INSUFFISANT: 'Solde insuffisant',
  PAIEMENT_ECHOUE: 'Le paiement a échoué',
  
  // Sécurité
  SESSIONS_MAX_ATTEINT: 'Nombre maximum de sessions actives atteint',
  CODE_EXPIRE: 'Le code de vérification a expiré',
  CODE_INVALIDE: 'Code de vérification invalide',
  TROP_DE_TENTATIVES: 'Trop de tentatives incorrectes',
  COMPTE_VERROUILLE: 'Votre compte a été temporairement verrouillé',
  COMPTE_SUSPENDU: 'Votre compte a été suspendu',
  
  // Système
  ERREUR_SERVEUR: 'Une erreur serveur s\'est produite',
  ERREUR_BASE_DONNEES: 'Erreur de base de données',
  SERVICE_EXTERNE_INDISPONIBLE: 'Service externe temporairement indisponible',
  LIMITE_REQUETES_ATTEINTE: 'Trop de requêtes, veuillez réessayer plus tard'
};

// ============================================================================
// SECTION 20: CONFIGURATION GÉNÉRALE
// ============================================================================

/**
 * Configuration de l'application
 */
const CONFIG = {
  // JWT
  JWT_EXPIRATION: '24h',
  JWT_REFRESH_EXPIRATION: '7d',
  
  // Sécurité
  BCRYPT_ROUNDS: 12,
  
  // Rate limiting
  RATE_LIMIT_WINDOW: 15 * 60 * 1000, // 15 minutes
  RATE_LIMIT_MAX: 100, // requêtes par fenêtre
  
  // Pagination
  PAGINATION_LIMIT_DEFAULT: 20,
  PAGINATION_LIMIT_MAX: 100,
  
  // Recherche
  DISTANCE_RECHERCHE_DEFAULT: 10, // km
  RAYON_RECHERCHE_MAX: 50, // km
  
  // Délais
  TEMPS_LIMITE_CONFIRMATION: 30 * 60 * 1000, // 30 minutes
  DELAI_ANNULATION_GRATUITE: 2 * 60 * 60 * 1000, // 2 heures
  DUREE_SESSION: 24 * 60 * 60 * 1000, // 24 heures
  
  // WebSocket
  WEBSOCKET_PING_TIMEOUT: 60000, // 60 secondes
  WEBSOCKET_PING_INTERVAL: 25000, // 25 secondes
  WEBSOCKET_RECONNECT_ATTEMPTS: 5,
  
  // Commission
  TAUX_COMMISSION: 0.10, // 10%
  
  // Notifications
  MAX_NOTIFICATIONS_BATCH: 100,
  NOTIFICATION_RETRY_ATTEMPTS: 3
};

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Section 1: Utilisateur
  SEXE,
  TYPE_DOCUMENT_IDENTITE,
  STATUT_VERIFICATION,
  FORMATS_DOCUMENT_VALIDES,
  FORMATS_IMAGE_VALIDES,
  TAILLE_MAX_FICHIER,
  TYPE_UPLOAD,
  PREFERENCE_CONVERSATION,
  LANGUES,
  RELATION_CONTACT_URGENCE,
  BADGES_UTILISATEUR,
  STATUT_COMPTE,

  // Section 2: Cloudinary
  CLOUDINARY_CONFIG,
  RESOURCE_TYPE_CLOUDINARY,

  // Section 3: Compte covoiturage & Paiements
  STATUT_RECHARGE,
  TYPE_PRELEVEMENT,
  STATUT_PRELEVEMENT,
  OPERATEURS_MOBILE,
  METHODE_PAIEMENT,
  STATUT_PAIEMENT,
  STATUT_PAIEMENT_DETAILLE,

  // Section 4: Sécurité & Authentification
  TYPE_DEVICE,
  REVOCATION_REASON,
  STATUT_VERIFICATION_WHATSAPP,
  DELAIS_VERIFICATION,

  // Section 5: Trajets
  TYPE_TRAJET,
  JOURS_SEMAINE,
  TYPE_BAGAGES,
  STATUT_TRAJET,

  // Section 6: Réservations
  STATUT_RESERVATION,
  TYPE_NOTIFICATION,

  // Section 7: Messagerie
  TYPE_MESSAGE,
  MESSAGES_PREDEFINIS,
  TYPE_PIECE_JOINTE,

  // Section 8: Évaluations & Signalements
  TYPE_EVALUATEUR,
  ASPECTS_POSITIFS,
  ASPECTS_A_AMELIORER,
  GRAVITE_SIGNALEMENT,
  TYPE_SIGNALEMENT,
  STATUT_TRAITEMENT,
  ACTIONS_MODERATION,

  // Section 9: Événements
  TYPE_EVENEMENT,
  STATUT_EVENEMENT,
  SOURCE_DETECTION,

  // Section 10: Alertes d'urgence
  TYPE_ALERTE,
  NIVEAU_GRAVITE,
  STATUT_ALERTE,
  STATUT_NOTIFICATION_URGENCE,

  // Section 11: Administration
  ROLE_ADMIN,
  PERMISSIONS,

  // Section 12: Véhicules
  MARQUES_VEHICULES,
  COULEURS_VEHICULES,
  TYPE_VEHICULE,

  // Section 13: Géolocalisation
  COMMUNES_ABIDJAN,
  VILLES_COTE_DIVOIRE,

  // Section 14: Intégration Waze
  WAZE_CONFIG,
  WAZE_NAVIGATION_OPTIONS,
  TRAFFIC_LEVELS,

  // Section 15: Socket.IO
  SOCKET_EVENTS,
  SOCKET_ERROR_TYPES,

  // Section 16: Notifications push
  NOTIFICATION_TYPES,
  NOTIFICATION_PRIORITIES,
  NOTIFICATION_SOUNDS,

  // Section 17: API
  HTTP_STATUS,
  API_RESPONSE_STATUS,

  // Section 18: Validation
  REGEX_PATTERNS,
  LIMITES,

  // Section 19: Erreurs
  CODES_ERREUR,
  MESSAGES_ERREUR,

  // Section 20: Configuration
  CONFIG
};