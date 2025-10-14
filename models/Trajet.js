const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2'); 

// Schéma pour les points géographiques (départ, arrivée, arrêts)
const pointSchema = new mongoose.Schema({
  nom: {
    type: String,
    required: true,
    trim: true
  },
  adresse: {
    type: String,
    required: true,
    trim: true
  },
  commune: {
    type: String,
    required: true,
    trim: true
  },
  quartier: {
    type: String,
    required: true,
    trim: true
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
        validator: function(coordinates) {
          return coordinates.length === 2 && 
                 coordinates[0] >= -180 && coordinates[0] <= 180 && // longitude
                 coordinates[1] >= -90 && coordinates[1] <= 90;    // latitude
        },
        message: 'Les coordonnées doivent être [longitude, latitude] avec longitude entre -180 et 180, latitude entre -90 et 90'
      }
    }
  }
}, { _id: false });

// Schéma pour les arrêts intermédiaires
const arretIntermediaireSchema = new mongoose.Schema({
  nom: {
    type: String,
    required: true,
    trim: true
  },
  adresse: {
    type: String,
    required: true,
    trim: true
  },
  commune: {
    type: String,
    required: true,
    trim: true
  },
  quartier: {
    type: String,
    required: true,
    trim: true
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
        validator: function(coordinates) {
          return coordinates.length === 2 && 
                 coordinates[0] >= -180 && coordinates[0] <= 180 && // longitude
                 coordinates[1] >= -90 && coordinates[1] <= 90;    // latitude
        },
        message: 'Les coordonnées doivent être [longitude, latitude] avec longitude entre -180 et 180, latitude entre -90 et 90'
      }
    }
  },
  ordreArret: {
    type: Number,
    required: true,
    min: 1
  }
}, { _id: false });

// Schéma pour la récurrence
const recurrenceSchema = new mongoose.Schema({
  jours: [{
    type: String,
    enum: ['LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI', 'DIMANCHE'],
    required: true
  }],
  dateFinRecurrence: {
    type: Date,
    validate: {
      validator: function(date) {
        return date > new Date();
      },
      message: 'La date de fin de récurrence doit être dans le futur'
    }
  }
}, { _id: false });

// Schéma pour le véhicule utilisé
const vehiculeUtiliseSchema = new mongoose.Schema({
  marque: {
    type: String,
    required: true,
    trim: true
  },
  modele: {
    type: String,
    required: true,
    trim: true
  },
  couleur: {
    type: String,
    required: true,
    trim: true
  },
  immatriculation: {
    type: String,
    required: true,
    trim: true,
    uppercase: true
  },
  nombrePlaces: {
    type: Number,
    required: true,
    min: 1,
    max: 8
  }
}, { _id: false });

// Schéma pour les préférences
const preferencesSchema = new mongoose.Schema({
  accepteFemmesSeulement: {
    type: Boolean,
    default: false
  },
  accepteHommesSeuleument: {
    type: Boolean,
    default: false
  },
  accepteBagages: {
    type: Boolean,
    default: true
  },
  typeBagages: {
    type: String,
    enum: ['PETIT', 'MOYEN', 'GRAND'],
    default: 'MOYEN'
  },
  musique: {
    type: Boolean,
    default: true
  },
  conversation: {
    type: String,
    enum: ['AUCUNE', 'LIMITEE', 'LIBRE'],
    default: 'LIBRE'
  },
  fumeur: {
    type: Boolean,
    default: false
  }
}, { _id: false });

// Schéma principal du TRAJET
const trajetSchema = new mongoose.Schema({
  titre: {
    type: String,
  },
  description: {
    type: String,
    default: null
  },
  conducteurId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Utilisateur',
    required: true
  },

  // Itinéraire
  pointDepart: {
    type: pointSchema,
    required: true
  },
  pointArrivee: {
    type: pointSchema,
    required: true
  },
  arretsIntermediaires: [arretIntermediaireSchema],

  // Planification
  dateDepart: {
    type: Date,
    required: true,
    validate: {
      validator: function(date) {
        // Pour les trajets récurrents, on peut accepter des dates passées
        if (this.typeTrajet === 'RECURRENT') {
          return true;
        }
        return date >= new Date();
      },
      message: 'La date de départ doit être dans le futur pour les trajets ponctuels'
    }
  },
  heureDepart: {
    type: String,
    required: true,
    validate: {
      validator: function(heure) {
        return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(heure);
      },
      message: 'L\'heure de départ doit être au format HH:MM (24h)'
    }
  },
  heureArriveePrevue: {
    type: String,
    validate: {
      validator: function(heure) {
        if (!heure) return true; // Optionnel
        return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(heure);
      },
      message: 'L\'heure d\'arrivée prévue doit être au format HH:MM (24h)'
    }
  },
  dureeEstimee: {
    type: Number,
    min: 1,
    validate: {
      validator: function(duree) {
        return Number.isInteger(duree);
      },
      message: 'La durée estimée doit être un nombre entier de minutes'
    }
  },

  // Détails du trajet
  distance: {
    type: Number,
    required: true,
    min: 0.1,
    validate: {
      validator: function(distance) {
        return distance > 0;
      },
      message: 'La distance doit être positive'
    }
  },
  prixParPassager: {
    type: Number,
    required: true,
    min: 0,
    validate: {
      validator: function(prix) {
        return Number.isInteger(prix) && prix >= 0;
      },
      message: 'Le prix par passager doit être un nombre entier positif en FCFA'
    }
  },
  nombrePlacesDisponibles: {
    type: Number,
    required: true,
    min: 0,
    validate: {
      validator: function(places) {
        return Number.isInteger(places) && places <= this.nombrePlacesTotal;
      },
      message: 'Le nombre de places disponibles ne peut pas dépasser le nombre total de places'
    }
  },
  nombrePlacesTotal: {
    type: Number,
    required: true,
    min: 1,
    max: 8,
    validate: {
      validator: function(places) {
        return Number.isInteger(places);
      },
      message: 'Le nombre total de places doit être un nombre entier'
    }
  },

  // Type de trajet
  typeTrajet: {
    type: String,
    enum: ['PONCTUEL', 'RECURRENT', 'EVENEMENTIEL'],
    required: true,
    default: 'PONCTUEL'
  },
  recurrence: {
    type: recurrenceSchema,
    required: function() {
      return this.typeTrajet === 'RECURRENT';
    }
  },
  
  // Gestion des récurrences
  trajetRecurrentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Trajet',
    required: function() {
      return this.estInstanceRecurrente === true;
    }
  },
  estInstanceRecurrente: {
    type: Boolean,
    default: false
  },

  // Véhicule utilisé
  vehiculeUtilise: {
    type: vehiculeUtiliseSchema,
    required: true
  },

  // Préférences pour ce trajet
  preferences: {
    type: preferencesSchema,
    default: () => ({})
  },

  // Statut et état
  statutTrajet: {
    type: String,
    enum: ['PROGRAMME', 'EN_COURS', 'TERMINE', 'ANNULE'],
    default: 'PROGRAMME'
  },
  validationAutomatique: {
    type: Boolean,
    default: false
  },

  // Métadonnées
  commentaireConducteur: {
    type: String,
    trim: true,
    maxlength: 500
  },
  evenementAssocie: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Evenement'
  }
}, {
  timestamps: true, // Ajoute automatiquement createdAt et updatedAt
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Index géospatial pour les recherches par proximité
trajetSchema.index({ "pointDepart.coordonnees": "2dsphere" });
trajetSchema.index({ "pointArrivee.coordonnees": "2dsphere" });

// Index composés pour optimiser les requêtes courantes
trajetSchema.index({ conducteurId: 1, dateDepart: 1 });
trajetSchema.index({ dateDepart: 1, statutTrajet: 1 });
trajetSchema.index({ typeTrajet: 1, dateDepart: 1 });

// Index pour les trajets récurrents
trajetSchema.index({ trajetRecurrentId: 1, dateDepart: 1 });
trajetSchema.index({ estInstanceRecurrente: 1, dateDepart: 1 });
trajetSchema.index({ 'recurrence.dateFinRecurrence': 1 });

// Middleware pre-save pour validation croisée
trajetSchema.pre('save', function(next) {
  // Validation des préférences de genre (ne peut pas accepter les deux exclusivement)
  if (this.preferences.accepteFemmesSeulement && this.preferences.accepteHommesSeuleument) {
    return next(new Error('Ne peut pas accepter exclusivement les femmes ET les hommes'));
  }

  // Validation que les places disponibles ne dépassent jamais le total
  if (this.nombrePlacesDisponibles > this.nombrePlacesTotal) {
    return next(new Error('Le nombre de places disponibles ne peut pas dépasser le total'));
  }

  // Validation pour les trajets récurrents
  if (this.typeTrajet === 'RECURRENT') {
    if (!this.recurrence || !this.recurrence.jours || this.recurrence.jours.length === 0) {
      return next(new Error('Les jours de récurrence sont requis pour un trajet récurrent'));
    }
  }

  // Tri automatique des arrêts intermédiaires par ordreArret
  if (this.arretsIntermediaires && this.arretsIntermediaires.length > 0) {
    this.arretsIntermediaires.sort((a, b) => a.ordreArret - b.ordreArret);
  }

  next();
});

// Méthodes d'instance
trajetSchema.methods.peutEtreReserve = function() {
  return this.statutTrajet === 'PROGRAMME' && 
         this.nombrePlacesDisponibles > 0 && 
         new Date() < this.dateDepart;
};

trajetSchema.methods.calculerTarifTotal = function(nombrePassagers = 1) {
  return this.prixParPassager * nombrePassagers;
};

// Méthodes pour les trajets récurrents
trajetSchema.methods.estTrajetRecurrent = function() {
  return this.typeTrajet === 'RECURRENT';
};

trajetSchema.methods.estInstanceRecurrenteMethod = function() {
  return this.estInstanceRecurrente === true;
};

trajetSchema.methods.obtenirTrajetParent = async function() {
  if (this.trajetRecurrentId) {
    return await this.constructor.findById(this.trajetRecurrentId);
  }
  return null;
};

trajetSchema.methods.obtenirInstances = async function(dateDebut = null, dateFin = null) {
  if (this.typeTrajet === 'RECURRENT') {
    return await this.constructor.findInstancesRecurrentes(this._id, dateDebut, dateFin);
  }
  return [];
};

// Méthodes statiques
trajetSchema.statics.findTrajetsDisponibles = function(dateDebut, dateFin) {
  return this.find({
    dateDepart: { $gte: dateDebut, $lte: dateFin },
    statutTrajet: 'PROGRAMME',
    nombrePlacesDisponibles: { $gt: 0 }
  });
};

// Méthodes pour les trajets récurrents
trajetSchema.statics.findTrajetsRecurrents = function(conducteurId = null) {
  const query = { typeTrajet: 'RECURRENT' };
  if (conducteurId) {
    query.conducteurId = conducteurId;
  }
  return this.find(query);
};

trajetSchema.statics.findInstancesRecurrentes = function(trajetRecurrentId, dateDebut = null, dateFin = null) {
  const query = { 
    trajetRecurrentId: trajetRecurrentId,
    estInstanceRecurrente: true
  };
  
  if (dateDebut || dateFin) {
    query.dateDepart = {};
    if (dateDebut) query.dateDepart.$gte = dateDebut;
    if (dateFin) query.dateDepart.$lte = dateFin;
  }
  
  return this.find(query).sort({ dateDepart: 1 });
};

trajetSchema.statics.findTrajetsRecurrentsActifs = function() {
  const maintenant = new Date();
  return this.find({
    typeTrajet: 'RECURRENT',
    'recurrence.dateFinRecurrence': { $gt: maintenant }
  });
};

trajetSchema.statics.findTrajetsProches = function(longitude, latitude, distanceMaxKm = 10) {
  return this.find({
    $or: [
      {
        "pointDepart.coordonnees": {
          $near: {
            $geometry: { type: "Point", coordinates: [longitude, latitude] },
            $maxDistance: distanceMaxKm * 1000 // Conversion en mètres
          }
        }
      },
      {
        "pointArrivee.coordonnees": {
          $near: {
            $geometry: { type: "Point", coordinates: [longitude, latitude] },
            $maxDistance: distanceMaxKm * 1000
          }
        }
      }
    ],
    statutTrajet: 'PROGRAMME',
    nombrePlacesDisponibles: { $gt: 0 }
  });
};

// Virtuals
trajetSchema.virtual('placesReservees').get(function() {
  return this.nombrePlacesTotal - this.nombrePlacesDisponibles;
});

trajetSchema.virtual('tauxOccupation').get(function() {
  return Math.round((this.placesReservees / this.nombrePlacesTotal) * 100);
});
trajetSchema.plugin(mongoosePaginate);
module.exports = mongoose.model('Trajet', trajetSchema);
// Mettre à jour les statistiques du conducteur quand un trajet est terminé
trajetSchema.pre('save', async function(next) {
  try {
    // Si le statut ne change pas, ne rien faire
    if (!this.isModified('statutTrajet')) return next();

    // Détecter transition vers TERMINE
    if (this.statutTrajet === 'TERMINE') {
      const Utilisateur = mongoose.model('Utilisateur');

      // Récupérer l'utilisateur conducteur
      const conducteur = await Utilisateur.findById(this.conducteurId);
      if (!conducteur) return next();

      // Initialiser champs si absents
      if (typeof conducteur.nombreTrajetsEffectues !== 'number') {
        conducteur.nombreTrajetsEffectues = 0;
      }
      if (typeof conducteur.scoreConfiance !== 'number') {
        conducteur.scoreConfiance = 3.0; // base neutre
      }

      // Incrémenter le nombre de trajets effectués
      conducteur.nombreTrajetsEffectues += 1;

      // Ajustement simple du score de confiance (borne [1,5])
      const bonus = 0.02; // petit bonus par trajet terminé
      conducteur.scoreConfiance = Math.min(5, Math.max(1, (conducteur.scoreConfiance + bonus)));

      // Enregistrer une dernière date d'activité
      conducteur.derniereActivite = new Date();

      await conducteur.save();
    }

    next();
  } catch (error) {
    next(error);
  }
});