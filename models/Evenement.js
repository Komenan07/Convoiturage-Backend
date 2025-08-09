// models/Evenement.js
const mongoose = require('mongoose');

// Schéma pour les groupes de covoiturage
const groupeCovoiturageSchema = new mongoose.Schema({
  nom: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  description: {
    type: String,
    maxlength: 500
  },
  membres: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Utilisateur'
  }],
  tarifPrefere: {
    type: Number,
    min: 0,
    default: 0
  },
  heureDepart: {
    type: String,
    required: true,
    match: /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/ // Format HH:MM
  }
}, { _id: true });

// Schéma pour la localisation
const lieuSchema = new mongoose.Schema({
  nom: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  adresse: {
    type: String,
    required: true,
    trim: true,
    maxlength: 300
  },
  ville: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  coordonnees: {
    type: {
      type: String,
      enum: ['Point'],
      required: true
    },
    coordinates: {
      type: [Number],
      required: true,
      validate: {
        validator: function(coords) {
          return coords.length === 2 && 
                 coords[0] >= -180 && coords[0] <= 180 && // longitude
                 coords[1] >= -90 && coords[1] <= 90;     // latitude
        },
        message: 'Coordonnées invalides [longitude, latitude]'
      }
    }
  }
}, { _id: false });

// Schéma principal de l'événement
const evenementSchema = new mongoose.Schema({
  nom: {
    type: String,
    required: [true, 'Le nom de l\'événement est requis'],
    trim: true,
    maxlength: [200, 'Le nom ne peut pas dépasser 200 caractères']
  },
  
  description: {
    type: String,
    required: [true, 'La description est requise'],
    trim: true,
    maxlength: [2000, 'La description ne peut pas dépasser 2000 caractères']
  },
  
  // Localisation
  lieu: {
    type: lieuSchema,
    required: [true, 'Le lieu est requis']
  },
  
  // Planification
  dateDebut: {
    type: Date,
    required: [true, 'La date de début est requise'],
    validate: {
      validator: function(date) {
        return date > new Date();
      },
      message: 'La date de début doit être dans le futur'
    }
  },
  
  dateFin: {
    type: Date,
    required: [true, 'La date de fin est requise'],
    validate: {
      validator: function(dateFin) {
        return dateFin >= this.dateDebut;
      },
      message: 'La date de fin doit être postérieure à la date de début'
    }
  },
  
  // Métadonnées
  typeEvenement: {
    type: String,
    required: [true, 'Le type d\'événement est requis'],
    enum: {
      values: ['SPORT', 'CONCERT', 'FESTIVAL', 'CONFERENCE'],
      message: 'Type d\'événement invalide'
    }
  },
  
  capaciteEstimee: {
    type: Number,
    min: [1, 'La capacité doit être au moins de 1 personne'],
    max: [1000000, 'Capacité trop élevée']
  },
  
  sourceDetection: {
    type: String,
    enum: ['MANUEL', 'AUTOMATIQUE', 'API_EXTERNE'],
    default: 'MANUEL'
  },
  
  // Covoiturage associé
  trajetsAssocies: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Trajet'
  }],
  
  groupesCovoiturage: [groupeCovoiturageSchema],
  
  // Statut
  statutEvenement: {
    type: String,
    enum: ['PROGRAMME', 'EN_COURS', 'TERMINE', 'ANNULE'],
    default: 'PROGRAMME'
  },
  
  // Champs additionnels utiles
  estPublic: {
    type: Boolean,
    default: true
  },
  
  tags: [{
    type: String,
    trim: true,
    lowercase: true
  }],
  
  organisateur: {
    nom: String,
    contact: String,
    type: {
      type: String,
      enum: ['OFFICIEL', 'COMMUNAUTAIRE'],
      default: 'COMMUNAUTAIRE'
    }
  }
  
}, {
  timestamps: true, // Ajoute createdAt et updatedAt automatiquement
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Index géospatial pour les requêtes de proximité
evenementSchema.index({ "lieu.coordonnees": "2dsphere" });

// Index composé pour les recherches fréquentes
evenementSchema.index({ 
  "dateDebut": 1, 
  "statutEvenement": 1,
  "typeEvenement": 1 
});

// Index pour les recherches par ville
evenementSchema.index({ "lieu.ville": 1, "dateDebut": 1 });

// Index pour les tags
evenementSchema.index({ "tags": 1 });

// Propriété virtuelle pour calculer la durée
evenementSchema.virtual('dureeHeures').get(function() {
  if (this.dateDebut && this.dateFin) {
    return Math.round((this.dateFin - this.dateDebut) / (1000 * 60 * 60));
  }
  return 0;
});

// Propriété virtuelle pour le nombre de groupes de covoiturage
evenementSchema.virtual('nombreGroupesCovoiturage').get(function() {
  return this.groupesCovoiturage ? this.groupesCovoiturage.length : 0;
});

// Middleware pre-save pour la validation croisée
evenementSchema.pre('save', function(next) {
  // Vérifier que la date de fin est après la date de début
  if (this.dateFin <= this.dateDebut) {
    return next(new Error('La date de fin doit être postérieure à la date de début'));
  }
  
  // Nettoyer les tags
  if (this.tags && this.tags.length > 0) {
    this.tags = [...new Set(this.tags.filter(tag => tag.trim().length > 0))];
  }
  
  next();
});

// Méthodes d'instance
evenementSchema.methods.ajouterGroupeCovoiturage = function(groupe) {
  this.groupesCovoiturage.push(groupe);
  return this.save();
};

evenementSchema.methods.supprimerGroupeCovoiturage = function(groupeId) {
  this.groupesCovoiturage = this.groupesCovoiturage.filter(
    groupe => !groupe._id.equals(groupeId)
  );
  return this.save();
};

evenementSchema.methods.estAVenir = function() {
  return this.dateDebut > new Date();
};

evenementSchema.methods.estEnCours = function() {
  const maintenant = new Date();
  return this.dateDebut <= maintenant && this.dateFin >= maintenant;
};

// Méthodes statiques
evenementSchema.statics.rechercherParProximite = function(longitude, latitude, rayonKm = 10) {
  return this.find({
    "lieu.coordonnees": {
      $near: {
        $geometry: { type: "Point", coordinates: [longitude, latitude] },
        $maxDistance: rayonKm * 1000 // Convertir km en mètres
      }
    },
    statutEvenement: { $in: ['PROGRAMME', 'EN_COURS'] }
  });
};

evenementSchema.statics.obtenirEvenementsAVenir = function(limit = 20) {
  return this.find({
    dateDebut: { $gt: new Date() },
    statutEvenement: 'PROGRAMME'
  })
  .sort({ dateDebut: 1 })
  .limit(limit)
  .populate('trajetsAssocies');
};

module.exports = mongoose.model('Evenement', evenementSchema);