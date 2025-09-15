// models/Trajet.js
const mongoose = require('mongoose');
const mongoosePaginate = require('mongoose-paginate-v2');

// Schéma pour les points géographiques (départ, arrivée, arrêts)
const pointSchema = new mongoose.Schema({
  nom: {
    type: String,
    required: [true, 'Le nom du point est requis'],
    trim: true,
    maxlength: [100, 'Le nom ne peut dépasser 100 caractères']
  },
  adresse: {
    type: String,
    required: [true, 'L\'adresse est requise'],
    trim: true,
    maxlength: [200, 'L\'adresse ne peut dépasser 200 caractères']
  },
  commune: {
    type: String,
    required: [true, 'La commune est requise'],
    trim: true,
    maxlength: [50, 'La commune ne peut dépasser 50 caractères']
  },
  quartier: {
    type: String,
    required: [true, 'Le quartier est requis'],
    trim: true,
    maxlength: [50, 'Le quartier ne peut dépasser 50 caractères']
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
        message: 'Les coordonnées doivent être [longitude, latitude] valides'
      }
    }
  }
}, { _id: false });

// Schéma pour les arrêts intermédiaires
const arretIntermediaireSchema = new mongoose.Schema({
  nom: {
    type: String,
    required: [true, 'Le nom de l\'arrêt est requis'],
    trim: true,
    maxlength: [100, 'Le nom ne peut dépasser 100 caractères']
  },
  adresse: {
    type: String,
    required: [true, 'L\'adresse de l\'arrêt est requise'],
    trim: true,
    maxlength: [200, 'L\'adresse ne peut dépasser 200 caractères']
  },
  commune: {
    type: String,
    required: [true, 'La commune de l\'arrêt est requise'],
    trim: true
  },
  quartier: {
    type: String,
    required: [true, 'Le quartier de l\'arrêt est requis'],
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
                 coordinates[0] >= -180 && coordinates[0] <= 180 &&
                 coordinates[1] >= -90 && coordinates[1] <= 90;
        },
        message: 'Coordonnées d\'arrêt invalides'
      }
    }
  },
  ordreArret: {
    type: Number,
    required: [true, 'L\'ordre d\'arrêt est requis'],
    min: [1, 'L\'ordre d\'arrêt doit être au moins 1']
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
  },
  animauxAcceptes: {
    type: Boolean,
    default: false
  }
}, { _id: false });

// Schéma principal du TRAJET
const trajetSchema = new mongoose.Schema({
  conducteurId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Utilisateur',
    required: [true, 'Le conducteur est requis'],
    index: true
  },

  // Véhicule utilisé (référence au modèle Vehicule)
  vehiculeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vehicule',
    required: [true, 'Le véhicule est requis']
  },

  // Itinéraire
  pointDepart: {
    type: pointSchema,
    required: [true, 'Le point de départ est requis']
  },
  pointArrivee: {
    type: pointSchema,
    required: [true, 'Le point d\'arrivée est requis']
  },
  arretsIntermediaires: [arretIntermediaireSchema],

  // Planification
  dateDepart: {
    type: Date,
    required: [true, 'La date de départ est requise'],
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
    required: [true, 'L\'heure de départ est requise'],
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
        if (!heure) return true;
        return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(heure);
      },
      message: 'L\'heure d\'arrivée prévue doit être au format HH:MM (24h)'
    }
  },
  dureeEstimee: {
    type: Number,
    min: [1, 'La durée estimée doit être au moins 1 minute'],
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
    required: [true, 'La distance est requise'],
    min: [0.1, 'La distance doit être au moins 0.1 km'],
    validate: {
      validator: function(distance) {
        return distance > 0;
      },
      message: 'La distance doit être positive'
    }
  },
  prixParPassager: {
    type: Number,
    required: [true, 'Le prix par passager est requis'],
    min: [0, 'Le prix ne peut être négatif'],
    validate: {
      validator: function(prix) {
        return Number.isInteger(prix) && prix >= 0;
      },
      message: 'Le prix par passager doit être un nombre entier positif en FCFA'
    }
  },
  nombrePlacesDisponibles: {
    type: Number,
    required: [true, 'Le nombre de places disponibles est requis'],
    min: [0, 'Le nombre de places disponibles ne peut être négatif'],
    validate: {
      validator: function(places) {
        return Number.isInteger(places) && places <= this.nombrePlacesTotal;
      },
      message: 'Le nombre de places disponibles ne peut pas dépasser le nombre total'
    }
  },
  nombrePlacesTotal: {
    type: Number,
    required: [true, 'Le nombre total de places est requis'],
    min: [1, 'Le trajet doit avoir au moins 1 place'],
    max: [8, 'Le trajet ne peut avoir plus de 8 places'],
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
    enum: {
      values: ['PONCTUEL', 'RECURRENT', 'EVENEMENTIEL'],
      message: 'Type de trajet invalide'
    },
    required: [true, 'Le type de trajet est requis'],
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

  // ===== NOUVEAU : MODES DE PAIEMENT ACCEPTÉS (SYSTÈME COMMISSION) =====
  modesPaiementAcceptes: {
    especes: {
      type: Boolean,
      default: false // sera mis à jour selon le statut du compte conducteur
    },
    wave: {
      type: Boolean,
      default: true
    },
    orangeMoney: {
      type: Boolean,
      default: true
    },
    mtnMoney: {
      type: Boolean,
      default: true
    },
    moovMoney: {
      type: Boolean,
      default: true
    },
    compteRecharge: {
      type: Boolean,
      default: false // sera mis à jour selon le solde du conducteur
    }
  },

  // Configuration de la commission pour ce trajet
  configurationCommission: {
    tauxCommission: {
      type: Number,
      default: 0.10, // 10%
      min: [0, 'Le taux de commission ne peut être négatif'],
      max: [0.50, 'Le taux de commission ne peut dépasser 50%']
    },
    montantCommissionParPassager: {
      type: Number,
      default: 0 // calculé automatiquement
    },
    modePrelevementPrefere: {
      type: String,
      enum: ['compte_recharge', 'paiement_mobile', 'automatique'],
      default: 'automatique'
    }
  },

  // Préférences pour ce trajet
  preferences: {
    type: preferencesSchema,
    default: () => ({})
  },

  // Statut et état
  statutTrajet: {
    type: String,
    enum: {
      values: ['PROGRAMME', 'EN_COURS', 'TERMINE', 'ANNULE', 'SUSPENDU'],
      message: 'Statut de trajet invalide'
    },
    default: 'PROGRAMME'
  },
  validationAutomatique: {
    type: Boolean,
    default: false
  },

  // Validation administrative
  validation: {
    estValide: {
      type: Boolean,
      default: false
    },
    raisonInvalidite: String,
    validePar: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Administrateur'
    },
    dateValidation: Date
  },

  // Métadonnées
  commentaireConducteur: {
    type: String,
    trim: true,
    maxlength: [1000, 'Le commentaire ne peut dépasser 1000 caractères']
  },
  evenementAssocie: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Evenement'
  },

  // Informations de suivi
  suivi: {
    nombreVues: {
      type: Number,
      default: 0
    },
    nombreReservationsTentees: {
      type: Number,
      default: 0
    },
    nombreReservationsReussies: {
      type: Number,
      default: 0
    },
    noteGenerale: {
      type: Number,
      min: 0,
      max: 5,
      default: 0
    },
    nombreEvaluations: {
      type: Number,
      default: 0
    }
  },

  // Historique des modifications importantes
  historique: [{
    action: {
      type: String,
      enum: ['CREATION', 'MODIFICATION', 'ANNULATION', 'REPROGRAMMATION'],
      required: true
    },
    description: String,
    dateAction: {
      type: Date,
      default: Date.now
    },
    utilisateurId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Utilisateur'
    }
  }]

}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// INDEX GÉOSPATIAUX
trajetSchema.index({ "pointDepart.coordonnees": "2dsphere" });
trajetSchema.index({ "pointArrivee.coordonnees": "2dsphere" });

// INDEX COMPOSÉS POUR OPTIMISATION
trajetSchema.index({ conducteurId: 1, dateDepart: 1 });
trajetSchema.index({ dateDepart: 1, statutTrajet: 1 });
trajetSchema.index({ typeTrajet: 1, dateDepart: 1 });
trajetSchema.index({ vehiculeId: 1, dateDepart: 1 });

// INDEX POUR RECHERCHE ET FILTRAGE
trajetSchema.index({ prixParPassager: 1, dateDepart: 1 });
trajetSchema.index({ nombrePlacesDisponibles: 1, statutTrajet: 1 });
trajetSchema.index({ 'modesPaiementAcceptes.especes': 1 });
trajetSchema.index({ 'validation.estValide': 1, statutTrajet: 1 });

// INDEX POUR TRAJETS RÉCURRENTS
trajetSchema.index({ trajetRecurrentId: 1, dateDepart: 1 });
trajetSchema.index({ estInstanceRecurrente: 1, dateDepart: 1 });
trajetSchema.index({ 'recurrence.dateFinRecurrence': 1 });

// VIRTUALS
trajetSchema.virtual('placesReservees').get(function() {
  return this.nombrePlacesTotal - this.nombrePlacesDisponibles;
});

trajetSchema.virtual('tauxOccupation').get(function() {
  if (this.nombrePlacesTotal === 0) return 0;
  return Math.round((this.placesReservees / this.nombrePlacesTotal) * 100);
});

trajetSchema.virtual('revenuEstime').get(function() {
  return this.placesReservees * this.prixParPassager;
});

trajetSchema.virtual('commissionEstimee').get(function() {
  return Math.round(this.revenuEstime * this.configurationCommission.tauxCommission);
});

trajetSchema.virtual('gainConducteurEstime').get(function() {
  return this.revenuEstime - this.commissionEstimee;
});

trajetSchema.virtual('estComplet').get(function() {
  return this.nombrePlacesDisponibles === 0;
});

trajetSchema.virtual('estDansLeFutur').get(function() {
  return this.dateDepart > new Date();
});

trajetSchema.virtual('peutEtreModifie').get(function() {
  return this.statutTrajet === 'PROGRAMME' && this.estDansLeFutur;
});

// MIDDLEWARE PRE-SAVE
trajetSchema.pre('save', async function(next) {
  try {
    // Validation des préférences de genre
    if (this.preferences.accepteFemmesSeulement && this.preferences.accepteHommesSeuleument) {
      return next(new Error('Ne peut pas accepter exclusivement les femmes ET les hommes'));
    }

    // Validation des places
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

    // ===== NOUVEAU : MISE À JOUR DES MODES DE PAIEMENT =====
    if (this.isNew || this.isModified('conducteurId')) {
      await this.mettreAJourModesPaiement();
    }

    // Calculer la commission par passager
    this.configurationCommission.montantCommissionParPassager = Math.round(
      this.prixParPassager * this.configurationCommission.tauxCommission
    );

    // Ajouter à l'historique si modification importante
    if (this.isModified('statutTrajet') || this.isModified('dateDepart') || this.isModified('prixParPassager')) {
      this.historique.push({
        action: this.isNew ? 'CREATION' : 'MODIFICATION',
        description: this.isNew ? 'Création du trajet' : 'Modification du trajet',
        utilisateurId: this.conducteurId
      });
    }

    next();
  } catch (error) {
    next(error);
  }
});

// Middleware pour mettre à jour les statistiques du conducteur
trajetSchema.pre('save', async function(next) {
  try {
    if (!this.isModified('statutTrajet')) return next();

    // Quand un trajet est terminé
    if (this.statutTrajet === 'TERMINE') {
      const Utilisateur = mongoose.model('Utilisateur');
      const conducteur = await Utilisateur.findById(this.conducteurId);
      
      if (conducteur) {
        conducteur.nombreTrajetsEffectues = (conducteur.nombreTrajetsEffectues || 0) + 1;
        
        // Bonus de confiance pour trajet terminé
        const bonus = 0.02;
        conducteur.scoreConfiance = Math.min(100, Math.max(0, 
          (conducteur.scoreConfiance || 50) + bonus
        ));
        
        await conducteur.save();
      }
    }

    next();
  } catch (error) {
    next(error);
  }
});

// ===== NOUVELLES MÉTHODES D'INSTANCE =====

// Mettre à jour les modes de paiement selon le compte conducteur
trajetSchema.methods.mettreAJourModesPaiement = async function() {
  try {
    const Utilisateur = mongoose.model('Utilisateur');
    const conducteur = await Utilisateur.findById(this.conducteurId);
    
    if (!conducteur) {
      throw new Error('Conducteur introuvable');
    }

    // Règles selon le système de commission
    if (conducteur.compteCovoiturage && conducteur.compteCovoiturage.estRecharge) {
      // Compte rechargé : tous modes acceptés
      this.modesPaiementAcceptes = {
        especes: true,
        wave: true,
        orangeMoney: true,
        mtnMoney: true,
        moovMoney: true,
        compteRecharge: conducteur.compteCovoiturage.solde > 0
      };
    } else {
      // Compte non rechargé : seulement mobile money
      this.modesPaiementAcceptes = {
        especes: false, // REFUSÉ
        wave: true,
        orangeMoney: true,
        mtnMoney: true,
        moovMoney: true,
        compteRecharge: false
      };
    }

    return this;
  } catch (error) {
    console.error('Erreur mise à jour modes paiement:', error);
    // En cas d'erreur, modes par défaut sécurisés
    this.modesPaiementAcceptes = {
      especes: false,
      wave: true,
      orangeMoney: true,
      mtnMoney: true,
      moovMoney: true,
      compteRecharge: false
    };
    return this;
  }
};

// Vérifier si un mode de paiement est accepté
trajetSchema.methods.accepteModePaiement = function(modePaiement) {
  const modeMapping = {
    'especes': 'especes',
    'wave': 'wave',
    'orange_money': 'orangeMoney',
    'mtn_money': 'mtnMoney',
    'moov_money': 'moovMoney',
    'compte_recharge': 'compteRecharge'
  };

  const modeField = modeMapping[modePaiement];
  if (!modeField) {
    return {
      accepte: false,
      raison: 'Mode de paiement non supporté'
    };
  }

  const accepte = this.modesPaiementAcceptes[modeField];
  return {
    accepte,
    raison: accepte ? null : `Mode de paiement ${modePaiement} non autorisé pour ce trajet`
  };
};

// Calculer la commission pour ce trajet
trajetSchema.methods.calculerCommission = function(nombrePassagers = 1) {
  const montantTotal = this.prixParPassager * nombrePassagers;
  const commission = Math.round(montantTotal * this.configurationCommission.tauxCommission);
  const montantConducteur = montantTotal - commission;

  return {
    montantTotal,
    commission,
    montantConducteur,
    tauxCommission: this.configurationCommission.tauxCommission
  };
};

// Méthodes existantes améliorées
trajetSchema.methods.peutEtreReserve = function() {
  return this.statutTrajet === 'PROGRAMME' && 
         this.nombrePlacesDisponibles > 0 && 
         this.estDansLeFutur &&
         this.validation.estValide;
};

trajetSchema.methods.calculerTarifTotal = function(nombrePassagers = 1) {
  return this.prixParPassager * nombrePassagers;
};

trajetSchema.methods.reserver = function(nombrePlaces = 1) {
  if (this.nombrePlacesDisponibles < nombrePlaces) {
    throw new Error('Pas assez de places disponibles');
  }
  
  this.nombrePlacesDisponibles -= nombrePlaces;
  this.suivi.nombreReservationsReussies += 1;
  
  return this.save();
};

trajetSchema.methods.libererPlaces = function(nombrePlaces = 1) {
  const nouvellesPlaces = this.nombrePlacesDisponibles + nombrePlaces;
  this.nombrePlacesDisponibles = Math.min(nouvellesPlaces, this.nombrePlacesTotal);
  
  return this.save();
};

trajetSchema.methods.annuler = function(raison = null) {
  this.statutTrajet = 'ANNULE';
  this.historique.push({
    action: 'ANNULATION',
    description: raison || 'Trajet annulé',
    utilisateurId: this.conducteurId
  });
  
  return this.save();
};

trajetSchema.methods.incrementerVues = function() {
  this.suivi.nombreVues += 1;
  return this.save({ validateBeforeSave: false });
};

trajetSchema.methods.ajouterEvaluation = function(note) {
  if (note < 0 || note > 5) {
    throw new Error('La note doit être entre 0 et 5');
  }

  const ancienneNote = this.suivi.noteGenerale;
  const nombreEvals = this.suivi.nombreEvaluations;
  
  if (nombreEvals === 0) {
    this.suivi.noteGenerale = note;
  } else {
    this.suivi.noteGenerale = ((ancienneNote * nombreEvals) + note) / (nombreEvals + 1);
  }
  
  this.suivi.nombreEvaluations += 1;
  return this.save();
};

// ===== MÉTHODES STATIQUES AMÉLIORÉES =====

// Trouver trajets disponibles avec filtres avancés
trajetSchema.statics.findTrajetsDisponibles = function(options = {}) {
  const {
    dateDebut,
    dateFin,
    prixMax,
    placesMin = 1,
    modePaiement,
    commune,
    vehiculeType
  } = options;

  const query = {
    statutTrajet: 'PROGRAMME',
    nombrePlacesDisponibles: { $gte: placesMin },
    'validation.estValide': true
  };

  if (dateDebut || dateFin) {
    query.dateDepart = {};
    if (dateDebut) query.dateDepart.$gte = dateDebut;
    if (dateFin) query.dateDepart.$lte = dateFin;
  }

  if (prixMax) {
    query.prixParPassager = { $lte: prixMax };
  }

  if (modePaiement) {
    const modeMapping = {
      'especes': 'modesPaiementAcceptes.especes',
      'wave': 'modesPaiementAcceptes.wave',
      'orange_money': 'modesPaiementAcceptes.orangeMoney',
      'mtn_money': 'modesPaiementAcceptes.mtnMoney',
      'moov_money': 'modesPaiementAcceptes.moovMoney'
    };
    
    if (modeMapping[modePaiement]) {
      query[modeMapping[modePaiement]] = true;
    }
  }

  if (commune) {
    query.$or = [
      { 'pointDepart.commune': commune },
      { 'pointArrivee.commune': commune }
    ];
  }
// Construction de la query avec populate conditionnel
  let queryBuilder = this.find(query)
    .populate('conducteurId', 'nom prenom scoreConfiance noteGenerale');
    // Filtrage par type de véhicule
  if (vehiculeType) {
    queryBuilder = queryBuilder.populate({
      path: 'vehiculeId',
      match: { 'caracteristiques.typeCarburant': vehiculeType },
      select: 'marque modele couleur nombrePlaces caracteristiques'
    });
  } else {
    queryBuilder = queryBuilder.populate('vehiculeId', 'marque modele couleur nombrePlaces');
  }
  return queryBuilder.sort({ dateDepart: 1 });
};

// Recherche par proximité géographique avec filtres
trajetSchema.statics.findTrajetsProches = function(longitude, latitude, options = {}) {
  const { 
    distanceMaxKm = 10, 
    type = 'both', // 'depart', 'arrivee', 'both'
    ...autresOptions 
  } = options;

  let geoQuery;
  if (type === 'depart') {
    geoQuery = {
      "pointDepart.coordonnees": {
        $near: {
          $geometry: { type: "Point", coordinates: [longitude, latitude] },
          $maxDistance: distanceMaxKm * 1000
        }
      }
    };
  } else if (type === 'arrivee') {
    geoQuery = {
      "pointArrivee.coordonnees": {
        $near: {
          $geometry: { type: "Point", coordinates: [longitude, latitude] },
          $maxDistance: distanceMaxKm * 1000
        }
      }
    };
  } else {
    geoQuery = {
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
      ]
    };
  }

  return this.findTrajetsDisponibles({ ...autresOptions, ...geoQuery });
};

// Statistiques globales des trajets
trajetSchema.statics.statistiquesGlobales = async function() {
  return this.aggregate([
    {
      $group: {
        _id: null,
        totalTrajets: { $sum: 1 },
        trajetsActifs: {
          $sum: { $cond: [{ $eq: ['$statutTrajet', 'PROGRAMME'] }, 1, 0] }
        },
        trajetsTermines: {
          $sum: { $cond: [{ $eq: ['$statutTrajet', 'TERMINE'] }, 1, 0] }
        },
        trajetsAnnules: {
          $sum: { $cond: [{ $eq: ['$statutTrajet', 'ANNULE'] }, 1, 0] }
        },
        prixMoyen: { $avg: '$prixParPassager' },
        distanceMoyenne: { $avg: '$distance' },
        tauxOccupationMoyen: {
          $avg: {
            $multiply: [
              { $divide: [
                { $subtract: ['$nombrePlacesTotal', '$nombrePlacesDisponibles'] },
                '$nombrePlacesTotal'
              ]},
              100
            ]
          }
        },
        revenuTotalEstime: {
          $sum: {
            $multiply: [
              '$prixParPassager',
              { $subtract: ['$nombrePlacesTotal', '$nombrePlacesDisponibles'] }
            ]
          }
        },
        commissionTotaleEstimee: {
          $sum: {
            $multiply: [
              '$prixParPassager',
              { $subtract: ['$nombrePlacesTotal', '$nombrePlacesDisponibles'] },
              '$configurationCommission.tauxCommission'
            ]
          }
        }
      }
    }
  ]);
};

// Trajets populaires (les plus réservés)
trajetSchema.statics.trajetsPopulaires = function(limit = 10) {
  return this.find({
    statutTrajet: { $in: ['PROGRAMME', 'TERMINE'] },
    'suivi.nombreReservationsReussies': { $gte: 1 }
  })
  .sort({ 
    'suivi.nombreReservationsReussies': -1,
    'suivi.noteGenerale': -1 
  })
  .limit(limit)
  .populate('conducteurId', 'nom prenom scoreConfiance')
  .populate('vehiculeId', 'marque modele');
};

// Trajets acceptant un mode de paiement spécifique
trajetSchema.statics.trajetsAvecModePaiement = function(modePaiement) {
  const modeMapping = {
    'especes': 'modesPaiementAcceptes.especes',
    'wave': 'modesPaiementAcceptes.wave',
    'orange_money': 'modesPaiementAcceptes.orangeMoney',
    'mtn_money': 'modesPaiementAcceptes.mtnMoney',
    'moov_money': 'modesPaiementAcceptes.moovMoney',
    'compte_recharge': 'modesPaiementAcceptes.compteRecharge'
  };

  const champ = modeMapping[modePaiement];
  if (!champ) {
    return this.find({}); // Retourne une query vide
  }

  return this.find({
    [champ]: true,
    statutTrajet: 'PROGRAMME',
    nombrePlacesDisponibles: { $gt: 0 }
  });
};

// Méthodes pour trajets récurrents (existantes améliorées)
trajetSchema.statics.findTrajetsRecurrents = function(conducteurId = null) {
  const query = { typeTrajet: 'RECURRENT' };
  if (conducteurId) {
    query.conducteurId = conducteurId;
  }
  return this.find(query)
    .populate('conducteurId', 'nom prenom')
    .populate('vehiculeId', 'marque modele');
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

// ===== NOUVELLES MÉTHODES STATIQUES POUR LE SYSTÈME COMMISSION =====

// Trajets avec comptes rechargés (acceptent espèces)
trajetSchema.statics.trajetsAcceptantEspeces = function() {
  return this.find({
    'modesPaiementAcceptes.especes': true,
    statutTrajet: 'PROGRAMME',
    nombrePlacesDisponibles: { $gt: 0 }
  })
  .populate('conducteurId', 'nom prenom compteCovoiturage.estRecharge')
  .populate('vehiculeId', 'marque modele');
};

// Trajets avec commissions élevées
trajetSchema.statics.trajetsCommissionElevee = function(seuilCommission = 5000) {
  return this.find({
    'configurationCommission.montantCommissionParPassager': { $gte: seuilCommission },
    statutTrajet: 'PROGRAMME'
  })
  .populate('conducteurId', 'nom prenom')
  .sort({ 'configurationCommission.montantCommissionParPassager': -1 });
};

// Analyse des revenus par commune
trajetSchema.statics.analyseRevenusParCommune = async function() {
  return this.aggregate([
    {
      $match: {
        statutTrajet: { $in: ['TERMINE', 'PROGRAMME'] }
      }
    },
    {
      $group: {
        _id: {
          communeDepart: '$pointDepart.commune',
          communeArrivee: '$pointArrivee.commune'
        },
        nombreTrajets: { $sum: 1 },
        revenuTotal: {
          $sum: {
            $multiply: [
              '$prixParPassager',
              { $subtract: ['$nombrePlacesTotal', '$nombrePlacesDisponibles'] }
            ]
          }
        },
        commissionTotale: {
          $sum: {
            $multiply: [
              '$prixParPassager',
              { $subtract: ['$nombrePlacesTotal', '$nombrePlacesDisponibles'] },
              '$configurationCommission.tauxCommission'
            ]
          }
        },
        prixMoyen: { $avg: '$prixParPassager' },
        distanceMoyenne: { $avg: '$distance' }
      }
    },
    {
      $sort: { revenuTotal: -1 }
    }
  ]);
};

// Conducteurs les plus actifs avec leurs statistiques
trajetSchema.statics.conducteursLesPlusActifs = async function(limit = 10) {
  return this.aggregate([
    {
      $match: {
        statutTrajet: { $in: ['PROGRAMME', 'TERMINE'] }
      }
    },
    {
      $group: {
        _id: '$conducteurId',
        nombreTrajets: { $sum: 1 },
        nombreTrajetsTermines: {
          $sum: { $cond: [{ $eq: ['$statutTrajet', 'TERMINE'] }, 1, 0] }
        },
        revenuGenere: {
          $sum: {
            $multiply: [
              '$prixParPassager',
              { $subtract: ['$nombrePlacesTotal', '$nombrePlacesDisponibles'] }
            ]
          }
        },
        commissionPayee: {
          $sum: {
            $multiply: [
              '$prixParPassager',
              { $subtract: ['$nombrePlacesTotal', '$nombrePlacesDisponibles'] },
              '$configurationCommission.tauxCommission'
            ]
          }
        },
        noteMoyenne: { $avg: '$suivi.noteGenerale' },
        tauxOccupationMoyen: {
          $avg: {
            $multiply: [
              { $divide: [
                { $subtract: ['$nombrePlacesTotal', '$nombrePlacesDisponibles'] },
                '$nombrePlacesTotal'
              ]},
              100
            ]
          }
        }
      }
    },
    {
      $lookup: {
        from: 'utilisateurs',
        localField: '_id',
        foreignField: '_id',
        as: 'conducteur'
      }
    },
    {
      $unwind: '$conducteur'
    },
    {
      $project: {
        nom: '$conducteur.nom',
        prenom: '$conducteur.prenom',
        email: '$conducteur.email',
        nombreTrajets: 1,
        nombreTrajetsTermines: 1,
        revenuGenere: 1,
        commissionPayee: 1,
        noteMoyenne: { $round: ['$noteMoyenne', 2] },
        tauxOccupationMoyen: { $round: ['$tauxOccupationMoyen', 2] },
        tauxCompletion: {
          $round: [
            { $multiply: [
              { $divide: ['$nombreTrajetsTermines', '$nombreTrajets'] },
              100
            ]},
            2
          ]
        }
      }
    },
    {
      $sort: { nombreTrajets: -1 }
    },
    {
      $limit: limit
    }
  ]);
};

// Analyse des modes de paiement préférés
trajetSchema.statics.analysePreferencesModePaiement = async function() {
  return this.aggregate([
    {
      $match: {
        statutTrajet: 'PROGRAMME',
        nombrePlacesDisponibles: { $gt: 0 }
      }
    },
    {
      $group: {
        _id: null,
        totalTrajets: { $sum: 1 },
        acceptentEspeces: {
          $sum: { $cond: ['$modesPaiementAcceptes.especes', 1, 0] }
        },
        acceptentWave: {
          $sum: { $cond: ['$modesPaiementAcceptes.wave', 1, 0] }
        },
        acceptentOrangeMoney: {
          $sum: { $cond: ['$modesPaiementAcceptes.orangeMoney', 1, 0] }
        },
        acceptentMtnMoney: {
          $sum: { $cond: ['$modesPaiementAcceptes.mtnMoney', 1, 0] }
        },
        acceptentMoovMoney: {
          $sum: { $cond: ['$modesPaiementAcceptes.moovMoney', 1, 0] }
        },
        acceptentCompteRecharge: {
          $sum: { $cond: ['$modesPaiementAcceptes.compteRecharge', 1, 0] }
        }
      }
    },
    {
      $project: {
        totalTrajets: 1,
        pourcentages: {
          especes: {
            $round: [
              { $multiply: [{ $divide: ['$acceptentEspeces', '$totalTrajets'] }, 100] },
              2
            ]
          },
          wave: {
            $round: [
              { $multiply: [{ $divide: ['$acceptentWave', '$totalTrajets'] }, 100] },
              2
            ]
          },
          orangeMoney: {
            $round: [
              { $multiply: [{ $divide: ['$acceptentOrangeMoney', '$totalTrajets'] }, 100] },
              2
            ]
          },
          mtnMoney: {
            $round: [
              { $multiply: [{ $divide: ['$acceptentMtnMoney', '$totalTrajets'] }, 100] },
              2
            ]
          },
          moovMoney: {
            $round: [
              { $multiply: [{ $divide: ['$acceptentMoovMoney', '$totalTrajets'] }, 100] },
              2
            ]
          },
          compteRecharge: {
            $round: [
              { $multiply: [{ $divide: ['$acceptentCompteRecharge', '$totalTrajets'] }, 100] },
              2
            ]
          }
        }
      }
    }
  ]);
};

// Pagination plugin
trajetSchema.plugin(mongoosePaginate);

module.exports = mongoose.model('Trajet', trajetSchema);