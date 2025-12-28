// models/Evenement.js
const mongoose = require('mongoose');

// Schéma pour les notations/avis
const notationSchema = new mongoose.Schema({
  utilisateur: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Utilisateur',
    required: true
  },
  note: {
    type: Number,
    required: true,
    min: 1,
    max: 5
  },
  commentaire: {
    type: String,
    maxlength: 500,
    trim: true
  },
  dateNotation: {
    type: Date,
    default: Date.now
  }
}, { _id: true });

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
  },
  maxMembres: {
    type: Number,
    default: 4,
    min: 2,
    max: 8
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
  // 🆕 AJOUT : Commune pour Abidjan
  commune: {
    type: String,
    enum: [
      'COCODY', 'YOPOUGON', 'ABOBO', 'PLATEAU', 
      'KOUMASSI', 'MARCORY', 'TREICHVILLE', 
      'PORT_BOUET', 'ATTÉCOUBÉ', 'ADJAMÉ'
    ],
    uppercase: true
  },
  // 🆕 AJOUT : Quartier spécifique
  quartier: {
    type: String,
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
    required: [true, 'La date de début est requise']
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
  
  // Source externe pour l'import
  source: {
    type: String,
    required: function() {
      return this.sourceDetection === 'API_EXTERNE';
    }
  },
  
  // 🆕 AJOUT : Identifiant externe pour éviter les doublons
  identifiantExterne: {
    type: String,
    sparse: true,
    index: true,
    trim: true
  },
  
  // 🆕 AJOUT : URL de la source originale
  urlSource: {
    type: String,
    trim: true,
    maxlength: 500
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
  
  // Champs pour l'annulation
  motifAnnulation: {
    type: String,
    maxlength: 500
  },
  
  dateAnnulation: {
    type: Date
  },
  
  motifChangementStatut: {
    type: String,
    maxlength: 500
  },
  
  // 🆕 AJOUT : Système de notation
  notations: {
    notes: [notationSchema],
    moyenneNote: {
      type: Number,
      min: 0,
      max: 5,
      default: 0
    },
    nombreNotes: {
      type: Number,
      default: 0,
      min: 0
    }
  },
  
  // Champs additionnels
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
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// =============== INDEX ===============

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

// 🆕 AJOUT : Index pour les recherches par commune/quartier Abidjan
evenementSchema.index({ "lieu.commune": 1, "dateDebut": 1 });
evenementSchema.index({ "lieu.commune": 1, "lieu.quartier": 1 });

// Index pour les tags
evenementSchema.index({ "tags": 1 });

// Index pour la source
evenementSchema.index({ "sourceDetection": 1, "source": 1 });

// 🆕 AJOUT : Index unique sparse pour identifiantExterne
evenementSchema.index({ "identifiantExterne": 1 }, { unique: true, sparse: true });

// 🆕 AJOUT : Index pour les notations
evenementSchema.index({ "notations.moyenneNote": -1 });

// =============== PROPRIÉTÉS VIRTUELLES ===============

evenementSchema.virtual('dureeHeures').get(function() {
  if (this.dateDebut && this.dateFin) {
    return Math.round((this.dateFin - this.dateDebut) / (1000 * 60 * 60));
  }
  return 0;
});

evenementSchema.virtual('nombreGroupesCovoiturage').get(function() {
  return this.groupesCovoiturage ? this.groupesCovoiturage.length : 0;
});

evenementSchema.virtual('placesCovoiturageDisponibles').get(function() {
  if (!this.groupesCovoiturage) return 0;
  return this.groupesCovoiturage.reduce((total, groupe) => {
    const placesOccupees = groupe.membres ? groupe.membres.length : 0;
    const placesLibres = Math.max(0, (groupe.maxMembres || 4) - placesOccupees);
    return total + placesLibres;
  }, 0);
});

// =============== MIDDLEWARE PRE-SAVE ===============

evenementSchema.pre('save', function(next) {
  // Vérifier que la date de fin est après la date de début
  if (this.dateFin <= this.dateDebut) {
    return next(new Error('La date de fin doit être postérieure à la date de début'));
  }
  
  // Nettoyer les tags
  if (this.tags && this.tags.length > 0) {
    this.tags = [...new Set(this.tags.filter(tag => tag.trim().length > 0))];
  }
  
  // Validation conditionnelle pour l'annulation
  if (this.statutEvenement === 'ANNULE' && !this.dateAnnulation) {
    this.dateAnnulation = new Date();
  }
  
  // 🆕 AJOUT : Recalculer la moyenne des notes
  if (this.notations && this.notations.notes && this.notations.notes.length > 0) {
    const totalNotes = this.notations.notes.reduce((sum, n) => sum + n.note, 0);
    this.notations.moyenneNote = totalNotes / this.notations.notes.length;
    this.notations.nombreNotes = this.notations.notes.length;
  }
  
  next();
});

// =============== MÉTHODES D'INSTANCE ===============

evenementSchema.methods.ajouterGroupeCovoiturage = function(donneesGroupe) {
  this.groupesCovoiturage.push(donneesGroupe);
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

evenementSchema.methods.estTermine = function() {
  return this.dateFin < new Date() || this.statutEvenement === 'TERMINE';
};

evenementSchema.methods.estAnnule = function() {
  return this.statutEvenement === 'ANNULE';
};

evenementSchema.methods.peutEtreModifie = function() {
  return this.statutEvenement === 'PROGRAMME' && this.estAVenir();
};

evenementSchema.methods.peutEtreAnnule = function() {
  return ['PROGRAMME', 'EN_COURS'].includes(this.statutEvenement);
};

evenementSchema.methods.obtenirGroupeCovoiturage = function(groupeId) {
  return this.groupesCovoiturage.id(groupeId);
};

evenementSchema.methods.utilisateurDansGroupe = function(groupeId, userId) {
  const groupe = this.obtenirGroupeCovoiturage(groupeId);
  return groupe ? groupe.membres.includes(userId) : false;
};

// 🆕 AJOUT : Méthodes pour les notations
evenementSchema.methods.ajouterNotation = function(userId, note, commentaire) {
  // Vérifier si l'utilisateur a déjà noté
  const notationExistante = this.notations.notes.find(
    n => n.utilisateur.toString() === userId.toString()
  );
  
  if (notationExistante) {
    // Mettre à jour la note existante
    notationExistante.note = note;
    notationExistante.commentaire = commentaire;
    notationExistante.dateNotation = new Date();
  } else {
    // Ajouter une nouvelle note
    this.notations.notes.push({
      utilisateur: userId,
      note,
      commentaire,
      dateNotation: new Date()
    });
  }
  
  return this.save();
};

evenementSchema.methods.obtenirNotations = function(page = 1, limit = 10) {
  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + limit;
  
  return {
    notes: this.notations.notes
      .sort((a, b) => b.dateNotation - a.dateNotation)
      .slice(startIndex, endIndex),
    total: this.notations.notes.length,
    moyenneNote: this.notations.moyenneNote,
    nombreNotes: this.notations.nombreNotes
  };
};

// =============== MÉTHODES STATIQUES ===============

evenementSchema.statics.rechercherParProximite = function(longitude, latitude, rayonKm = 10) {
  return this.find({
    "lieu.coordonnees": {
      $near: {
        $geometry: { type: "Point", coordinates: [longitude, latitude] },
        $maxDistance: rayonKm * 1000
      }
    },
    statutEvenement: { $in: ['PROGRAMME', 'EN_COURS'] }
  });
};

evenementSchema.statics.obtenirEvenementsAVenir = function(limit = 20, ville = null) {
  let query = this.find({
    dateDebut: { $gt: new Date() },
    statutEvenement: 'PROGRAMME'
  });

  if (ville) {
    query = query.where('lieu.ville').regex(new RegExp(ville, 'i'));
  }

  return query
    .sort({ dateDebut: 1 })
    .limit(limit)
    .populate('trajetsAssocies');
};

// 🆕 AJOUT : Recherche par commune d'Abidjan
evenementSchema.statics.rechercherParCommune = function(commune, quartier = null) {
  let query = {
    'lieu.commune': commune.toUpperCase(),
    statutEvenement: { $in: ['PROGRAMME', 'EN_COURS'] },
    dateDebut: { $gte: new Date() }
  };
  
  if (quartier) {
    query['lieu.quartier'] = new RegExp(quartier, 'i');
  }
  
  return this.find(query).sort({ dateDebut: 1 });
};

evenementSchema.statics.obtenirStatistiques = function(periode = '30d', ville = null) {
  const maintenant = new Date();
  let dateDebut;

  switch (periode) {
    case '7d':
      dateDebut = new Date(maintenant - 7 * 24 * 60 * 60 * 1000);
      break;
    case '30d':
      dateDebut = new Date(maintenant - 30 * 24 * 60 * 60 * 1000);
      break;
    case '90d':
      dateDebut = new Date(maintenant - 90 * 24 * 60 * 60 * 1000);
      break;
    default:
      dateDebut = new Date(maintenant - 30 * 24 * 60 * 60 * 1000);
  }

  let matchStage = {
    createdAt: { $gte: dateDebut }
  };
  
  if (ville) {
    matchStage['lieu.ville'] = new RegExp(ville, 'i');
  }

  return this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        totalEvenements: { $sum: 1 },
        evenementsParType: { $push: "$typeEvenement" },
        evenementsParStatut: { $push: "$statutEvenement" },
        evenementsParSource: { $push: "$sourceDetection" },
        evenementsParVille: { $push: "$lieu.ville" },
        totalGroupesCovoiturage: {
          $sum: { $size: { $ifNull: ["$groupesCovoiturage", []] } }
        },
        moyenneNotations: { $avg: "$notations.moyenneNote" }
      }
    }
  ]);
};

evenementSchema.statics.rechercheAvancee = function(criteres, options = {}) {
  const {
    motsCles,
    typeEvenement,
    dateDebutMin,
    dateDebutMax,
    ville,
    commune,
    quartier,
    tags,
    capaciteMin,
    capaciteMax,
    coordonnees,
    rayon
  } = criteres;

  const {
    page = 1,
    limit = 20,
    sort = { dateDebut: -1 },
    populate = []
  } = options;

  let query = {};

  // Recherche textuelle
  if (motsCles) {
    query.$or = [
      { nom: new RegExp(motsCles, 'i') },
      { description: new RegExp(motsCles, 'i') },
      { tags: new RegExp(motsCles, 'i') }
    ];
  }

  // Filtres basiques
  if (typeEvenement) query.typeEvenement = typeEvenement;
  if (ville) query['lieu.ville'] = new RegExp(ville, 'i');
  if (commune) query['lieu.commune'] = commune.toUpperCase();
  if (quartier) query['lieu.quartier'] = new RegExp(quartier, 'i');
  if (tags && tags.length > 0) query.tags = { $in: tags };

  // Filtres de dates
  if (dateDebutMin || dateDebutMax) {
    query.dateDebut = {};
    if (dateDebutMin) query.dateDebut.$gte = new Date(dateDebutMin);
    if (dateDebutMax) query.dateDebut.$lte = new Date(dateDebutMax);
  }

  // Filtres de capacité
  if (capaciteMin || capaciteMax) {
    query.capaciteEstimee = {};
    if (capaciteMin) query.capaciteEstimee.$gte = capaciteMin;
    if (capaciteMax) query.capaciteEstimee.$lte = capaciteMax;
  }

  // Recherche géospatiale
  if (coordonnees && coordonnees.latitude && coordonnees.longitude) {
    query['lieu.coordonnees'] = {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: [coordonnees.longitude, coordonnees.latitude]
        },
        $maxDistance: (rayon || 10) * 1000
      }
    };
  }

  let mongoQuery = this.find(query);
  
  if (populate.length > 0) {
    populate.forEach(pop => mongoQuery = mongoQuery.populate(pop));
  }
  
  return mongoQuery
    .sort(sort)
    .limit(limit)
    .skip((page - 1) * limit);
};

module.exports = mongoose.model('Evenement', evenementSchema);