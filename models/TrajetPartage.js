const mongoose = require('mongoose');

/**
 * 📦 Modèle TrajetPartage
 * Enregistre chaque partage de trajet à un proche (lien, SMS, Email, WhatsApp)
 */
const TrajetPartageSchema = new mongoose.Schema({

  // ─── Trajet concerné ───────────────────────────────────────────
  trajetId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Trajet',
    required: [true, 'Le trajet est requis']
  },

  // ─── Utilisateur qui partage (conducteur ou passager) ──────────
  partagePar: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Utilisateur',
    required: [true, 'L\'utilisateur qui partage est requis']
  },

  // ✅ Rôle de la personne qui partage
  rolePartageur: {
    type: String,
    enum: ['CONDUCTEUR', 'PASSAGER'],
    required: [true, 'Le rôle du partageur est requis']
  },

  // ─── Infos du proche (saisies manuellement, non enregistrées) ──
  proche: {
    nom: {
      type: String,
      trim: true
    },
    telephone: {
      type: String,
      trim: true
    },
    email: {
      type: String,
      trim: true,
      lowercase: true
    }
  },

  // ─── Token et lien de suivi ─────────────────────────────────────
  // Token unique pour le lien de suivi public (sans authentification)
  token: {
    type: String,
    required: [true, 'Le token est requis'],
    unique: true  // ✅ unique suffit — crée déjà un index automatiquement
  },

  // Lien complet de suivi (ex: https://monapp.com/suivi/<token>)
  lienSuivi: {
    type: String,
    required: [true, 'Le lien de suivi est requis']
  },

  // ─── Canaux de partage utilisés ────────────────────────────────
  canaux: [{
    type: String,
    enum: ['SMS', 'EMAIL', 'WHATSAPP']
  }],

  // ─── Statut d'envoi par canal ───────────────────────────────────
  statutEnvoi: {
    sms: {
      type: String,
      enum: ['ENVOYE', 'ECHEC', 'NON_DEMANDE'],
      default: 'NON_DEMANDE'
    },
    email: {
      type: String,
      enum: ['ENVOYE', 'ECHEC', 'NON_DEMANDE'],
      default: 'NON_DEMANDE'
    },
    whatsapp: {
      type: String,
      enum: ['ENVOYE', 'ECHEC', 'NON_DEMANDE'],
      default: 'NON_DEMANDE'
    }
  },

  // ─── Notifications automatiques envoyées au proche ─────────────
  notificationsEnvoyees: {
    depart: {
      type: Boolean,
      default: false
    },
    arrivee: {
      type: Boolean,
      default: false
    },
    annulation: {
      type: Boolean,
      default: false
    }
  },

  // ─── Expiration du lien ─────────────────────────────────────────
  // Valable 24h après la date de départ du trajet
  // MongoDB supprime automatiquement le document à expiration (TTL)
  expiresAt: {
    type: Date,
    required: [true, 'La date d\'expiration est requise'],
    index: { expireAfterSeconds: 0 }  // ✅ TTL MongoDB automatique
  },

  // ─── État du lien ───────────────────────────────────────────────
  actif: {
    type: Boolean,
    default: true
  },

  // ✅ Suivi des consultations par le proche
  nombreVues: {
    type: Number,
    default: 0,
    min: 0
  },
  derniereVueAt: {
    type: Date,
    default: null
  },
  // ─── NOUVEAU : Support WebSocket temps réel ────────────────────
websocket: {
  roomId: {
    type: String,
    unique: true,
    sparse: true  // Permet de ne pas avoir de roomId pour les anciens partages
  },
  dernierEvenement: {
    type: String,
    enum: ['CONNECTE', 'POSITION_RECUE', 'DECONNECTE'],
    default: undefined 
  },
  derniereConnexionAt: {
    type: Date,
    default: null
  }
},

// ─── NOUVEAU : Métadonnées de suivi temps réel ─────────────────
suiviTempsReel: {
  actif: {
    type: Boolean,
    default: false
  },
  lastUpdateAt: {
    type: Date,
    default: null
  },
  dernierePosition: {
    lat: Number,
    lng: Number,
    vitesse: Number,
    timestamp: Date
  },
  historiquePositions: {
    type: [{
      lat: { type: Number, required: true },
      lng: { type: Number, required: true },
      vitesse: { type: Number, default: 0 },
      timestamp: { type: Date, default: Date.now }
    }],
    default: []
  }
}

}, {
  timestamps: true  // createdAt, updatedAt automatiques
});

// ===============================================================
// INDEX
// ===============================================================

// Recherche des partages actifs d'un trajet (utilisé dans le service)
TrajetPartageSchema.index({ trajetId: 1, actif: 1 });

// Recherche de tous les partages d'un utilisateur pour un trajet
TrajetPartageSchema.index({ trajetId: 1, partagePar: 1 });

// Index pour trouver rapidement les rooms actives
TrajetPartageSchema.index({ 'websocket.roomId': 1 });
TrajetPartageSchema.index({ 'suiviTempsReel.actif': 1, trajetId: 1 });

// Note: pas besoin d'index séparé sur token — unique: true le crée déjà

// ===============================================================
// VALIDATION PRE-SAVE
// ===============================================================

/**
 * Vérifie qu'au moins un contact (téléphone ou email) est fourni
 */
TrajetPartageSchema.pre('validate', function(next) {
  if (!this.proche?.telephone && !this.proche?.email) {
    return next(new Error('Le proche doit avoir au moins un numéro de téléphone ou une adresse email'));
  }
  next();
});

/**
 * Vérifie la cohérence des canaux avec les contacts disponibles
 */
TrajetPartageSchema.pre('validate', function(next) {
  if (this.canaux?.includes('SMS') && !this.proche?.telephone) {
    return next(new Error('Un numéro de téléphone est requis pour le canal SMS'));
  }
  if (this.canaux?.includes('EMAIL') && !this.proche?.email) {
    return next(new Error('Une adresse email est requise pour le canal EMAIL'));
  }
  next();
});

// ===============================================================
// MÉTHODES STATIQUES
// ===============================================================

/**
 * Récupère tous les partages actifs d'un trajet
 * @param {string|ObjectId} trajetId
 * @returns {Promise<TrajetPartage[]>}
 */
TrajetPartageSchema.statics.findActifsByTrajet = function(trajetId) {
  return this.find({ trajetId, actif: true });
};

/**
 * Récupère tous les partages actifs et non expirés d'un trajet
 * (double protection : actif + date)
 * @param {string|ObjectId} trajetId
 * @returns {Promise<TrajetPartage[]>}
 */
TrajetPartageSchema.statics.findValidesByTrajet = function(trajetId) {
  return this.find({
    trajetId,
    actif: true,
    expiresAt: { $gt: new Date() }
  });
};

/**
 * Désactive tous les partages d'un trajet (lors d'une annulation par exemple)
 * @param {string|ObjectId} trajetId
 */
TrajetPartageSchema.statics.desactiverTousParTrajet = async function(trajetId) {
  const result = await this.updateMany(
    { trajetId, actif: true },
    { $set: { actif: false } }
  );
  console.log(`✅ ${result.modifiedCount} partage(s) désactivé(s) pour le trajet ${trajetId}`);
  return result;
};

/**
 * Génère un roomId unique pour un trajet
 * @param {string|ObjectId} trajetId
 * @returns {string}
 */
TrajetPartageSchema.statics.genererRoomId = function(trajetId) {
  return `trajet_${trajetId}_realtime_${Date.now()}`;
};

/**
 * Récupère tous les partages actifs avec suivi temps réel pour un trajet
 */
TrajetPartageSchema.statics.findActifsAvecSuiviTempsReel = function(trajetId) {
  return this.find({
    trajetId,
    actif: true,
    'suiviTempsReel.actif': true,
    expiresAt: { $gt: new Date() }
  });
};

// ===============================================================
// MÉTHODES D'INSTANCE
// ===============================================================

/**
 * Incrémente le compteur de vues (appelé quand le proche consulte le lien)
 */
TrajetPartageSchema.methods.enregistrerVue = async function() {
  this.nombreVues += 1;
  this.derniereVueAt = new Date();
  await this.save();
};

/**
 * Vérifie si le lien est encore valide (actif + non expiré)
 * @returns {boolean}
 */
TrajetPartageSchema.methods.estValide = function() {
  return this.actif && new Date() < this.expiresAt;
};

/**
 * Active le suivi temps réel pour ce partage
 */
TrajetPartageSchema.methods.activerSuiviTempsReel = async function(options = {}) {
  this.suiviTempsReel.actif = true;
  this.websocket.roomId = this.constructor.genererRoomId(this.trajetId);
  this.websocket.dernierEvenement = 'CONNECTE';
  this.websocket.derniereConnexionAt = new Date();
  
  await this.save();
  
  return {
    roomId: this.websocket.roomId,
    actif: true
  };
};

/**
 * Met à jour la dernière position reçue via WebSocket
 */
TrajetPartageSchema.methods.mettreAJourPosition = async function(position) {
  // Garder un historique limité (200 positions max)
  if (this.suiviTempsReel.historiquePositions.length >= 200) {
    this.suiviTempsReel.historiquePositions.shift();
  }
  
  this.suiviTempsReel.historiquePositions.push({
    lat: position.lat,
    lng: position.lng,
    vitesse: position.vitesse || 0,
    timestamp: position.timestamp || new Date()
  });
  
  this.suiviTempsReel.dernierePosition = {
    lat: position.lat,
    lng: position.lng,
    vitesse: position.vitesse || 0,
    timestamp: position.timestamp || new Date()
  };
  
  this.suiviTempsReel.lastUpdateAt = new Date();
  this.websocket.dernierEvenement = 'POSITION_RECUE';
  this.markModified('suiviTempsReel.historiquePositions');
  
  await this.save();
};

/**
 * Désactive le suivi temps réel
 */
TrajetPartageSchema.methods.desactiverSuiviTempsReel = async function() {
  this.suiviTempsReel.actif = false;
  this.websocket.dernierEvenement = 'DECONNECTE';
  await this.save();
};

/**
 * Récupère l'historique des positions des dernières minutes
 */
TrajetPartageSchema.methods.getHistoriquePositions = function(minutes = 5) {
  const seuil = new Date(Date.now() - minutes * 60 * 1000);
  
  return this.suiviTempsReel.historiquePositions.filter(
    pos => new Date(pos.timestamp) > seuil
  );
};

// ===============================================================
// VIRTUALS
// ===============================================================

/**
 * Génère le lien deeplink WhatsApp avec le message pré-rempli
 */
TrajetPartageSchema.virtual('lienWhatsApp').get(function() {
  if (!this.lienSuivi) return null;
  const texte = encodeURIComponent(`🚗 Suis mon trajet en direct : ${this.lienSuivi}`);
  return `https://wa.me/?text=${texte}`;
});

/**
 * Indique si au moins une notification a été envoyée au proche
 */
TrajetPartageSchema.virtual('aRecuNotification').get(function() {
  return this.notificationsEnvoyees.depart ||
         this.notificationsEnvoyees.arrivee ||
         this.notificationsEnvoyees.annulation;
});

TrajetPartageSchema.set('toJSON', { virtuals: true });
TrajetPartageSchema.set('toObject', { virtuals: true });

// ===============================================================
// EXPORT
// ===============================================================

module.exports = mongoose.model('TrajetPartage', TrajetPartageSchema);