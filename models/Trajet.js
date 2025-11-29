const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');
const { localisationCompletSchema, vehiculeReferenceSchema } = require('./schemas');

// ⭐ REFACTORING: Utilisation des schémas réutilisables
// Les schémas pointSchema et vehiculeUtiliseSchema ont été remplacés par:
// - localisationCompletSchema (pour points de départ/arrivée)
// - vehiculeReferenceSchema (pour véhicule utilisé)

// Schéma pour les arrêts intermédiaires (étendu à partir de localisationCompletSchema)
const arretIntermediaireSchema = new mongoose.Schema({
  ...localisationCompletSchema.obj, // Hérite de tous les champs de localisationCompletSchema
  ordreArret: {
    type: Number,
    required: true,
    min: 1
  }
}, { _id: false });

// Schéma pour la récurrence (conservé tel quel)
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

// ⭐ REFACTORING: vehiculeUtiliseSchema supprimé
// Remplacé par vehiculeReferenceSchema qui gère:
// - La référence au véhicule (vehiculeId)
// - Le snapshot des données du véhicule pour performance et historique
// - La validation de l'immatriculation Côte d'Ivoire (AB-123-CD ou 1234 AB 01)
// - Les méthodes utilitaires (formater, versJSON, snapshotEstAJour, etc.)

// Schéma pour les préférences (conservé tel quel)
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
  },
  animauxAcceptes: {
    type: Boolean,
    default: false
  },
  climatisationActive: {
    type: Boolean,
    default: true
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

  // ⭐ REFACTORING: Utilisation de localisationCompletSchema
  // Itinéraire
  pointDepart: {
    type: localisationCompletSchema,
    required: true
  },
  pointArrivee: {
    type: localisationCompletSchema,
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

  // ⭐ REFACTORING: Utilisation de vehiculeReferenceSchema
  // Véhicule utilisé avec référence + snapshot pour performance
  vehiculeUtilise: {
    type: vehiculeReferenceSchema,
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
    enum: ['PROGRAMME', 'EN_COURS', 'TERMINE', 'ANNULE', 'EXPIRE'],  // ⭐ AJOUT: EXPIRE
    default: 'PROGRAMME'
  },
  validationAutomatique: {
    type: Boolean,
    default: false
  },

  // ⭐ NOUVEAU: Gestion de l'expiration
  dateExpiration: {
    type: Date,
    index: true
  },
  raisonExpiration: {
    type: String,
    enum: ['DATE_PASSEE', 'RECURRENCE_TERMINEE', 'INACTIVITE', 'AUTRE']
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
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// =============== INDEX ===============

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

// ⭐ NOUVEAUX INDEX pour l'expiration
trajetSchema.index({ statutTrajet: 1, dateDepart: 1 });
trajetSchema.index({ dateExpiration: 1 });
trajetSchema.index({ 'recurrence.dateFinRecurrence': 1, typeTrajet: 1 });
trajetSchema.index({ 
  statutTrajet: 1, 
  dateDepart: 1, 
  nombrePlacesDisponibles: 1 
});

// =============== MIDDLEWARES ===============

// Middleware pre-save pour validation croisée
trajetSchema.pre('save', function(next) {
  // Validation des préférences de genre
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

  // Tri automatique des arrêts intermédiaires
  if (this.arretsIntermediaires && this.arretsIntermediaires.length > 0) {
    this.arretsIntermediaires.sort((a, b) => a.ordreArret - b.ordreArret);
  }

  // ⭐ NOUVEAU: Vérifier l'expiration automatique
  if (!this.isNew && this.estExpire() && this.statutTrajet === 'PROGRAMME') {
    this.statutTrajet = 'EXPIRE';
    this.dateExpiration = new Date();
    this.raisonExpiration = 'DATE_PASSEE';
  }

  next();
});

// ⭐ NOUVEAU: Middleware pre-find pour filtrer les trajets expirés
trajetSchema.pre(/^find/, function(next) {
  // Option pour inclure les trajets expirés
  if (!this.getOptions().includeExpired) {
    // Par défaut, exclure les trajets expirés
    this.where({ statutTrajet: { $ne: 'EXPIRE' } });
  }
  next();
});

// Middleware pour mettre à jour les statistiques du conducteur
trajetSchema.pre('save', async function(next) {
  try {
    if (!this.isModified('statutTrajet')) return next();

    if (this.statutTrajet === 'TERMINE') {
      const Utilisateur = mongoose.model('Utilisateur');
      const conducteur = await Utilisateur.findById(this.conducteurId);
      if (!conducteur) return next();

      if (typeof conducteur.nombreTrajetsEffectues !== 'number') {
        conducteur.nombreTrajetsEffectues = 0;
      }
      if (typeof conducteur.scoreConfiance !== 'number') {
        conducteur.scoreConfiance = 3.0;
      }

      conducteur.nombreTrajetsEffectues += 1;
      const bonus = 0.02;
      conducteur.scoreConfiance = Math.min(5, Math.max(1, (conducteur.scoreConfiance + bonus)));
      conducteur.derniereActivite = new Date();

      await conducteur.save();
    }

    next();
  } catch (error) {
    next(error);
  }
});

// =============== MÉTHODES D'INSTANCE ===============

trajetSchema.methods.peutEtreReserve = function() {
  return this.statutTrajet === 'PROGRAMME' && 
         this.nombrePlacesDisponibles > 0 && 
         new Date() < this.dateDepart;
};

trajetSchema.methods.calculerTarifTotal = function(nombrePassagers = 1) {
  return this.prixParPassager * nombrePassagers;
};

// ⭐ NOUVEAU: Vérifier si un trajet est expiré
trajetSchema.methods.estExpire = function() {
  const maintenant = new Date();
  return maintenant > this.dateDepart && this.statutTrajet === 'PROGRAMME';
};

// ⭐ NOUVEAU: Marquer ce trajet comme expiré
trajetSchema.methods.marquerCommeExpire = async function() {
  if (this.estExpire()) {
    this.statutTrajet = 'EXPIRE';
    this.dateExpiration = new Date();
    this.raisonExpiration = 'DATE_PASSEE';
    await this.save();
    return true;
  }
  return false;
};

// ⭐ NOUVEAU: Vérifier si la récurrence est expirée
trajetSchema.methods.recurrenceEstExpiree = function() {
  if (this.typeTrajet === 'RECURRENT' && this.recurrence?.dateFinRecurrence) {
    return new Date() > this.recurrence.dateFinRecurrence;
  }
  return false;
};

// Méthodes pour les trajets récurrents (existantes)
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

// =============== MÉTHODES STATIQUES ===============

// Méthodes existantes
trajetSchema.statics.findTrajetsDisponibles = function(dateDebut, dateFin) {
  return this.find({
    dateDepart: { $gte: dateDebut, $lte: dateFin },
    statutTrajet: 'PROGRAMME',
    nombrePlacesDisponibles: { $gt: 0 }
  });
};

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
            $maxDistance: distanceMaxKm * 1000
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

// ⭐ NOUVELLES MÉTHODES pour la gestion de l'expiration

// Trouver tous les trajets expirés
trajetSchema.statics.findTrajetsExpires = function() {
  const maintenant = new Date();
  return this.find({
    statutTrajet: 'PROGRAMME',
    dateDepart: { $lt: maintenant }
  });
};

// Trouver les trajets qui vont expirer dans X heures
trajetSchema.statics.findTrajetsAExpirer = function(heures = 2) {
  const maintenant = new Date();
  const dateExpiration = new Date(maintenant.getTime() + (heures * 60 * 60 * 1000));
  
  return this.find({
    statutTrajet: 'PROGRAMME',
    dateDepart: { 
      $gte: maintenant,
      $lte: dateExpiration 
    }
  });
};

// Trouver les trajets récurrents expirés
trajetSchema.statics.findTrajetsRecurrentsExpires = function() {
  const maintenant = new Date();
  return this.find({
    typeTrajet: 'RECURRENT',
    'recurrence.dateFinRecurrence': { $lt: maintenant },
    statutTrajet: { $nin: ['TERMINE', 'EXPIRE'] }
  });
};

// Marquer les trajets comme expirés
trajetSchema.statics.marquerTrajetsExpires = async function() {
  const maintenant = new Date();
  
  const result = await this.updateMany(
    {
      statutTrajet: 'PROGRAMME',
      dateDepart: { $lt: maintenant }
    },
    {
      $set: { 
        statutTrajet: 'EXPIRE',
        dateExpiration: maintenant,
        raisonExpiration: 'DATE_PASSEE'
      }
    }
  );
  
  console.log(`✅ ${result.modifiedCount} trajets marqués comme expirés`);
  return result;
};

// Marquer les récurrences expirées
trajetSchema.statics.marquerRecurrencesExpirees = async function() {
  const maintenant = new Date();
  
  const result = await this.updateMany(
    {
      typeTrajet: 'RECURRENT',
      'recurrence.dateFinRecurrence': { $lt: maintenant },
      statutTrajet: 'PROGRAMME'
    },
    {
      $set: { 
        statutTrajet: 'EXPIRE',
        dateExpiration: maintenant,
        raisonExpiration: 'RECURRENCE_TERMINEE'
      }
    }
  );
  
  console.log(`✅ ${result.modifiedCount} récurrences marquées comme expirées`);
  return result;
};

// Nettoyer les vieux trajets expirés (après X jours)
trajetSchema.statics.nettoyerVieuxTrajetsExpires = async function(joursAGarder = 30) {
  const dateLimit = new Date();
  dateLimit.setDate(dateLimit.getDate() - joursAGarder);
  
  const result = await this.deleteMany({
    statutTrajet: 'EXPIRE',
    dateExpiration: { $lt: dateLimit }
  });
  
  console.log(`✅ ${result.deletedCount} vieux trajets expirés supprimés`);
  return result;
};

// Obtenir des statistiques sur l'expiration
trajetSchema.statics.getStatistiquesExpiration = async function() {
  const maintenant = new Date();
  
  const stats = await this.aggregate([
    {
      $facet: {
        expiresDansUnJour: [
          {
            $match: {
              statutTrajet: 'PROGRAMME',
              dateDepart: {
                $gte: maintenant,
                $lte: new Date(maintenant.getTime() + 24 * 60 * 60 * 1000)
              }
            }
          },
          { $count: 'count' }
        ],
        dejaExpires: [
          {
            $match: {
              statutTrajet: 'PROGRAMME',
              dateDepart: { $lt: maintenant }
            }
          },
          { $count: 'count' }
        ],
        recurrencesExpirees: [
          {
            $match: {
              typeTrajet: 'RECURRENT',
              'recurrence.dateFinRecurrence': { $lt: maintenant },
              statutTrajet: { $ne: 'EXPIRE' }
            }
          },
          { $count: 'count' }
        ],
        trajetsExpires: [
          {
            $match: {
              statutTrajet: 'EXPIRE'
            }
          },
          { $count: 'count' }
        ]
      }
    }
  ]);
  
  return {
    expiresDansUnJour: stats[0].expiresDansUnJour[0]?.count || 0,
    dejaExpires: stats[0].dejaExpires[0]?.count || 0,
    recurrencesExpirees: stats[0].recurrencesExpirees[0]?.count || 0,
    trajetsExpires: stats[0].trajetsExpires[0]?.count || 0,
    timestamp: new Date()
  };
};

// =============== VIRTUALS ===============

trajetSchema.virtual('placesReservees').get(function() {
  return this.nombrePlacesTotal - this.nombrePlacesDisponibles;
});

trajetSchema.virtual('tauxOccupation').get(function() {
  return Math.round((this.placesReservees / this.nombrePlacesTotal) * 100);
});

// ⭐ NOUVEAU: Virtual pour vérifier si expiré
trajetSchema.virtual('isExpired').get(function() {
  return this.statutTrajet === 'EXPIRE' || this.estExpire();
});

// =============== PLUGINS ===============

trajetSchema.plugin(mongoosePaginate);

module.exports = mongoose.model('Trajet', trajetSchema);