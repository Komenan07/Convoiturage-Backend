// models/AlerteUrgence.js
const mongoose = require('mongoose');

// Schéma pour les personnes présentes
const personnePresenteSchema = new mongoose.Schema({
  utilisateurId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Utilisateur',
    required: true
  },
  nom: {
    type: String,
    required: [true, 'Le nom de la personne est requis'],
    trim: true,
    maxlength: [100, 'Le nom ne peut pas dépasser 100 caractères']
  },
  telephone: {
    type: String,
    required: [true, 'Le numéro de téléphone est requis'],
    validate: {
      validator: function(tel) {
        return /^(?:(?:\+33|0)[1-9](?:[0-9]{8}))$/.test(tel.replace(/[\s.-]/g, ''));
      },
      message: 'Format de téléphone invalide'
    }
  }
}, { _id: true });

// Schéma pour les contacts alertés
const contactAlerteSchema = new mongoose.Schema({
  nom: {
    type: String,
    required: [true, 'Le nom du contact est requis'],
    trim: true,
    maxlength: [100, 'Le nom ne peut pas dépasser 100 caractères']
  },
  telephone: {
    type: String,
    required: [true, 'Le numéro de téléphone du contact est requis'],
    validate: {
      validator: function(tel) {
        return /^(?:(?:\+33|0)[1-9](?:[0-9]{8}))$/.test(tel.replace(/[\s.-]/g, ''));
      },
      message: 'Format de téléphone invalide'
    }
  },
  relation: {
    type: String,
    required: [true, 'La relation avec le contact est requise'],
    enum: {
      values: ['FAMILLE', 'AMI', 'COLLEGUE', 'CONTACT_URGENCE', 'AUTRE'],
      message: 'Type de relation invalide'
    }
  },
  dateNotification: {
    type: Date,
    default: Date.now
  },
  statutNotification: {
    type: String,
    enum: ['ENVOYE', 'RECU', 'ECHEC'],
    default: 'ENVOYE'
  }
}, { _id: true });

// Schéma pour la position géographique
const positionSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['Point'],
    required: true,
    default: 'Point'
  },
  coordinates: {
    type: [Number],
    required: [true, 'Les coordonnées GPS sont requises'],
    validate: {
      validator: function(coords) {
        return coords.length === 2 && 
               coords[0] >= -180 && coords[0] <= 180 && // longitude
               coords[1] >= -90 && coords[1] <= 90;     // latitude
      },
      message: 'Coordonnées GPS invalides [longitude, latitude]'
    }
  }
}, { _id: false });

// Schéma principal de l'alerte d'urgence
const alerteUrgenceSchema = new mongoose.Schema({
  // Identification
  declencheurId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Utilisateur',
    required: [true, 'L\'ID du déclencheur est requis'],
    index: true
  },
  
  trajetId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Trajet',
    required: [true, 'L\'ID du trajet est requis'],
    index: true
  },
  
  // Localisation de l'urgence
  position: {
    type: positionSchema,
    required: [true, 'La position GPS est requise']
  },
  
  // Détails de l'urgence
  typeAlerte: {
    type: String,
    required: [true, 'Le type d\'alerte est requis'],
    enum: {
      values: ['SOS', 'ACCIDENT', 'AGRESSION', 'PANNE', 'MALAISE', 'AUTRE'],
      message: 'Type d\'alerte invalide'
    },
    index: true
  },
  
  description: {
    type: String,
    required: [true, 'Une description de l\'urgence est requise'],
    trim: true,
    minlength: [10, 'La description doit contenir au moins 10 caractères'],
    maxlength: [1000, 'La description ne peut pas dépasser 1000 caractères']
  },
  
  niveauGravite: {
    type: String,
    required: [true, 'Le niveau de gravité est requis'],
    enum: {
      values: ['FAIBLE', 'MOYEN', 'CRITIQUE'],
      message: 'Niveau de gravité invalide'
    },
    index: true
  },
  
  // Personnes présentes dans le véhicule
  personnesPresentes: {
    type: [personnePresenteSchema],
    validate: {
      validator: function(personnes) {
        return personnes && personnes.length > 0 && personnes.length <= 8;
      },
      message: 'Il doit y avoir entre 1 et 8 personnes présentes'
    }
  },
  
  // Contacts notifiés
  contactsAlertes: {
    type: [contactAlerteSchema],
    validate: {
      validator: function(contacts) {
        return contacts.length <= 20;
      },
      message: 'Maximum 20 contacts peuvent être alertés'
    }
  },
  
  // Suivi et résolution
  statutAlerte: {
    type: String,
    enum: ['ACTIVE', 'EN_TRAITEMENT', 'RESOLUE', 'FAUSSE_ALERTE'],
    default: 'ACTIVE',
    index: true
  },
  
  premiersSecours: {
    type: Boolean,
    default: false
  },
  
  policeContactee: {
    type: Boolean,
    default: false
  },
  
  dateResolution: {
    type: Date,
    validate: {
      validator: function(date) {
        return !date || date >= this.createdAt;
      },
      message: 'La date de résolution doit être postérieure à la création'
    }
  },
  
  commentaireResolution: {
    type: String,
    trim: true,
    maxlength: [1000, 'Le commentaire ne peut pas dépasser 1000 caractères']
  },
  
  // Métadonnées de suivi
  numeroUrgence: {
    type: String,
    unique: true,
    index: true
  },
  
  priorite: {
    type: Number,
    min: 1,
    max: 5,
    default: function() {
      // Calculer la priorité basée sur le type et la gravité
      const prioriteMap = {
        'SOS': { 'CRITIQUE': 5, 'MOYEN': 4, 'FAIBLE': 3 },
        'ACCIDENT': { 'CRITIQUE': 5, 'MOYEN': 4, 'FAIBLE': 3 },
        'AGRESSION': { 'CRITIQUE': 5, 'MOYEN': 4, 'FAIBLE': 3 },
        'MALAISE': { 'CRITIQUE': 4, 'MOYEN': 3, 'FAIBLE': 2 },
        'PANNE': { 'CRITIQUE': 2, 'MOYEN': 2, 'FAIBLE': 1 },
        'AUTRE': { 'CRITIQUE': 3, 'MOYEN': 2, 'FAIBLE': 1 }
      };
      return prioriteMap[this.typeAlerte]?.[this.niveauGravite] || 1;
    }
  },
  
  // Informations de géolocalisation enrichies
  adresseApproximative: {
    type: String,
    maxlength: 500
  },
  
  ville: {
    type: String,
    maxlength: 100,
    index: true
  },
  
  // Horodatage automatique
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  
  updatedAt: {
    type: Date,
    default: Date.now
  }
  
}, {
  timestamps: false, // Géré manuellement pour plus de contrôle
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Index géospatial pour la recherche de proximité
alerteUrgenceSchema.index({ "position": "2dsphere" });

// Index composé pour les recherches fréquentes
alerteUrgenceSchema.index({ 
  "statutAlerte": 1, 
  "niveauGravite": -1, 
  "createdAt": -1 
});

// Index pour les alertes actives par région
alerteUrgenceSchema.index({
  "ville": 1,
  "statutAlerte": 1,
  "createdAt": -1
});

// Index TTL pour supprimer automatiquement les alertes résolues après 1 an
alerteUrgenceSchema.index(
  { "dateResolution": 1 },
  { 
    expireAfterSeconds: 365 * 24 * 60 * 60, // 1 an
    partialFilterExpression: { "statutAlerte": "RESOLUE" }
  }
);

// === PROPRIÉTÉS VIRTUELLES ===

// Durée depuis le déclenchement
alerteUrgenceSchema.virtual('dureeDepuisDeclenchement').get(function() {
  return Math.round((new Date() - this.createdAt) / (1000 * 60)); // en minutes
});

// Nombre de personnes impliquées
alerteUrgenceSchema.virtual('nombrePersonnes').get(function() {
  return this.personnesPresentes ? this.personnesPresentes.length : 0;
});

// Statut critique
alerteUrgenceSchema.virtual('estCritique').get(function() {
  return this.niveauGravite === 'CRITIQUE' || this.priorite >= 4;
});

// Temps de réponse (si résolu)
alerteUrgenceSchema.virtual('tempsReponse').get(function() {
  if (this.dateResolution) {
    return Math.round((this.dateResolution - this.createdAt) / (1000 * 60)); // en minutes
  }
  return null;
});

// === MIDDLEWARE PRE-SAVE ===

alerteUrgenceSchema.pre('save', async function(next) {
  // Générer un numéro d'urgence unique
  if (this.isNew && !this.numeroUrgence) {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    
    this.numeroUrgence = `URG${year}${month}${day}${random}`;
  }
  
  // Mettre à jour le timestamp
  this.updatedAt = new Date();
  
  // Valider la résolution
  if (this.statutAlerte === 'RESOLUE' && !this.dateResolution) {
    this.dateResolution = new Date();
  }
  
  // Si l'alerte passe en résolu, vérifier les champs obligatoires
  if (this.statutAlerte === 'RESOLUE' && !this.commentaireResolution) {
    return next(new Error('Un commentaire de résolution est requis'));
  }
  
  next();
});

// === MÉTHODES D'INSTANCE ===

// Ajouter un contact à alerter
alerteUrgenceSchema.methods.ajouterContactAlerte = function(contact) {
  if (this.contactsAlertes.length >= 20) {
    throw new Error('Limite de contacts atteinte (20 maximum)');
  }
  
  this.contactsAlertes.push(contact);
  return this.save();
};

// Mettre à jour le statut d'un contact
alerteUrgenceSchema.methods.mettreAJourStatutContact = function(contactId, statut) {
  const contact = this.contactsAlertes.id(contactId);
  if (!contact) {
    throw new Error('Contact non trouvé');
  }
  
  contact.statutNotification = statut;
  contact.dateNotification = new Date();
  
  return this.save();
};

// Résoudre l'alerte
alerteUrgenceSchema.methods.resoudre = function(commentaire, typeResolution = 'RESOLUE') {
  this.statutAlerte = typeResolution;
  this.dateResolution = new Date();
  this.commentaireResolution = commentaire;
  
  return this.save();
};

// Escalader l'alerte
alerteUrgenceSchema.methods.escalader = function() {
  if (this.niveauGravite === 'FAIBLE') {
    this.niveauGravite = 'MOYEN';
  } else if (this.niveauGravite === 'MOYEN') {
    this.niveauGravite = 'CRITIQUE';
  }
  
  // Recalculer la priorité
  const prioriteMap = {
    'SOS': { 'CRITIQUE': 5, 'MOYEN': 4, 'FAIBLE': 3 },
    'ACCIDENT': { 'CRITIQUE': 5, 'MOYEN': 4, 'FAIBLE': 3 },
    'AGRESSION': { 'CRITIQUE': 5, 'MOYEN': 4, 'FAIBLE': 3 },
    'MALAISE': { 'CRITIQUE': 4, 'MOYEN': 3, 'FAIBLE': 2 },
    'PANNE': { 'CRITIQUE': 2, 'MOYEN': 2, 'FAIBLE': 1 },
    'AUTRE': { 'CRITIQUE': 3, 'MOYEN': 2, 'FAIBLE': 1 }
  };
  
  this.priorite = prioriteMap[this.typeAlerte]?.[this.niveauGravite] || this.priorite;
  
  return this.save();
};

// Vérifier si l'alerte est ancienne (plus de 2 heures sans résolution)
alerteUrgenceSchema.methods.estAncienne = function() {
  const deuxHeures = 2 * 60 * 60 * 1000;
  return (new Date() - this.createdAt) > deuxHeures && this.statutAlerte === 'ACTIVE';
};

// === MÉTHODES STATIQUES ===

// Obtenir les alertes actives
alerteUrgenceSchema.statics.obtenirAlertesActives = function() {
  return this.find({
    statutAlerte: { $in: ['ACTIVE', 'EN_TRAITEMENT'] }
  })
  .sort({ priorite: -1, createdAt: 1 })
  .populate('declencheurId', 'nom telephone')
  .populate('trajetId', 'depart destination');
};

// Rechercher par proximité géographique
alerteUrgenceSchema.statics.rechercherParProximite = function(longitude, latitude, rayonKm = 50) {
  return this.find({
    "position": {
      $near: {
        $geometry: { type: "Point", coordinates: [longitude, latitude] },
        $maxDistance: rayonKm * 1000
      }
    },
    statutAlerte: { $in: ['ACTIVE', 'EN_TRAITEMENT'] }
  })
  .sort({ priorite: -1, createdAt: 1 });
};

// Obtenir les statistiques d'urgence
alerteUrgenceSchema.statics.obtenirStatistiques = function(filtreDateDebut, filtreDateFin) {
  const matchStage = {};
  
  if (filtreDateDebut || filtreDateFin) {
    matchStage.createdAt = {};
    if (filtreDateDebut) matchStage.createdAt.$gte = new Date(filtreDateDebut);
    if (filtreDateFin) matchStage.createdAt.$lte = new Date(filtreDateFin);
  }
  
  return this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        totalAlertes: { $sum: 1 },
        alertesActives: {
          $sum: { $cond: [{ $in: ["$statutAlerte", ["ACTIVE", "EN_TRAITEMENT"]] }, 1, 0] }
        },
        alertesCritiques: {
          $sum: { $cond: [{ $eq: ["$niveauGravite", "CRITIQUE"] }, 1, 0] }
        },
        tempsReponsemoyenne: { $avg: "$tempsReponse" },
        repartitionTypes: {
          $push: "$typeAlerte"
        }
      }
    }
  ]);
};

module.exports = mongoose.model('AlerteUrgence', alerteUrgenceSchema);