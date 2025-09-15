// models/Vehicule.js
const mongoose = require('mongoose');

const vehiculeSchema = new mongoose.Schema({
  // Informations de base du véhicule
  marque: {
    type: String,
    required: [true, 'La marque du véhicule est requise'],
    trim: true,
    maxlength: [50, 'La marque ne peut dépasser 50 caractères'],
    minlength: [2, 'La marque doit contenir au moins 2 caractères']
  },
  
  modele: {
    type: String,
    required: [true, 'Le modèle du véhicule est requis'],
    trim: true,
    maxlength: [50, 'Le modèle ne peut dépasser 50 caractères'],
    minlength: [2, 'Le modèle doit contenir au moins 2 caractères']
  },
  
  couleur: {
    type: String,
    required: [true, 'La couleur du véhicule est requise'],
    trim: true,
    maxlength: [30, 'La couleur ne peut dépasser 30 caractères'],
    enum: {
      values: [
        'BLANC', 'NOIR', 'GRIS', 'ARGENT', 'ROUGE', 'BLEU', 'VERT', 
        'JAUNE', 'ORANGE', 'VIOLET', 'MARRON', 'BEIGE', 'ROSE'
      ],
      message: 'Couleur non supportée'
    }
  },
  
  immatriculation: {
    type: String,
    required: [true, 'L\'immatriculation est requise'],
    unique: true,
    trim: true,
    uppercase: true,
    validate: {
      validator: function(immat) {
        // Format ivoirien: 2 lettres + 4 chiffres + 2 lettres (ex: AB 1234 CD)
        return /^[A-Z]{2}\s?[0-9]{4}\s?[A-Z]{2}$/.test(immat);
      },
      message: 'Format d\'immatriculation invalide (format attendu: AB 1234 CD)'
    }
  },
  
  nombrePlaces: {
    type: Number,
    required: [true, 'Le nombre de places est requis'],
    min: [2, 'Le véhicule doit avoir au moins 2 places'],
    max: [9, 'Le véhicule ne peut avoir plus de 9 places'],
    validate: {
      validator: Number.isInteger,
      message: 'Le nombre de places doit être un nombre entier'
    }
  },
  
  // Photos du véhicule
  photos: {
    principale: {
      type: String,
      required: [true, 'Une photo principale du véhicule est requise'],
      validate: {
        validator: function(url) {
          return /^(https?:\/\/|\/uploads\/).+\.(jpg|jpeg|png|webp)$/i.test(url);
        },
        message: 'URL de photo principale invalide'
      }
    },
    laterale: {
      type: String,
      validate: {
        validator: function(url) {
          return !url || /^(https?:\/\/|\/uploads\/).+\.(jpg|jpeg|png|webp)$/i.test(url);
        },
        message: 'URL de photo latérale invalide'
      }
    },
    interieur: {
      type: String,
      validate: {
        validator: function(url) {
          return !url || /^(https?:\/\/|\/uploads\/).+\.(jpg|jpeg|png|webp)$/i.test(url);
        },
        message: 'URL de photo intérieur invalide'
      }
    },
    autres: [{
      type: String,
      validate: {
        validator: function(url) {
          return /^(https?:\/\/|\/uploads\/).+\.(jpg|jpeg|png|webp)$/i.test(url);
        },
        message: 'URL de photo invalide'
      }
    }]
  },
  
  // Assurance
  assurance: {
    numeroPolice: {
      type: String,
      required: [true, 'Le numéro de police d\'assurance est requis'],
      trim: true,
      maxlength: [50, 'Le numéro de police ne peut dépasser 50 caractères']
    },
    dateExpiration: {
      type: Date,
      required: [true, 'La date d\'expiration de l\'assurance est requise'],
      validate: {
        validator: function(date) {
          return date > new Date();
        },
        message: 'La date d\'expiration de l\'assurance doit être dans le futur'
      }
    },
    compagnie: {
      type: String,
      required: [true, 'La compagnie d\'assurance est requise'],
      trim: true,
      maxlength: [100, 'Le nom de la compagnie ne peut dépasser 100 caractères'],
      enum: {
        values: [
          'NSIA', 'SUNU', 'SAHAM', 'ATLANTIQUE', 'ALLIANZ', 'AXA', 
          'COLINA', 'LOYALE', 'SANLAM', 'AUTRE'
        ],
        message: 'Compagnie d\'assurance non reconnue'
      }
    },
    montantCouverture: {
      type: Number,
      required: [true, 'Le montant de couverture est requis'],
      min: [1000000, 'Le montant de couverture minimum est 1,000,000 FCFA']
    },
    typeAssurance: {
      type: String,
      enum: {
        values: ['TOUS_RISQUES', 'TIERS_COMPLET', 'RESPONSABILITE_CIVILE'],
        message: 'Type d\'assurance invalide'
      },
      required: [true, 'Le type d\'assurance est requis']
    }
  },
  
  // Visite technique
  visiteTechnique: {
    dateExpiration: {
      type: Date,
      required: [true, 'La date d\'expiration de la visite technique est requise'],
      validate: {
        validator: function(date) {
          return date > new Date();
        },
        message: 'La date d\'expiration de la visite technique doit être dans le futur'
      }
    },
    certificatUrl: {
      type: String,
      validate: {
        validator: function(url) {
          return !url || /^(https?:\/\/|\/uploads\/).+\.(pdf|jpg|jpeg|png)$/i.test(url);
        },
        message: 'URL de certificat invalide'
      }
    },
    centreControle: {
      type: String,
      required: [true, 'Le centre de contrôle technique est requis'],
      trim: true,
      maxlength: [100, 'Le nom du centre ne peut dépasser 100 caractères']
    },
    numeroProcessVerbal: {
      type: String,
      trim: true,
      maxlength: [50, 'Le numéro de procès-verbal ne peut dépasser 50 caractères']
    }
  },
  
  // Propriétaire du véhicule
  proprietaireId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Utilisateur',
    required: [true, 'Le propriétaire du véhicule est requis'],
    index: true
  },
  
  // Statut du véhicule
  estatut: {
    type: String,
    enum: {
      values: ['ACTIF', 'INACTIF', 'EN_REPARATION', 'HORS_SERVICE', 'EN_VERIFICATION'],
      message: 'Statut de véhicule invalide'
    },
    default: 'EN_VERIFICATION'
  },
  
  // Vérification administrative
  verification: {
    statutVerification: {
      type: String,
      enum: ['EN_ATTENTE', 'VERIFIE', 'REJETE', 'INCOMPLET'],
      default: 'EN_ATTENTE'
    },
    dateVerification: Date,
    verificateurId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Administrateur'
    },
    commentaireVerification: String,
    documentsManquants: [String],
    raisonRejet: String
  },
  
  // Caractéristiques techniques
  caracteristiques: {
    annee: {
      type: Number,
      required: [true, 'L\'année du véhicule est requise'],
      min: [1990, 'L\'année ne peut être antérieure à 1990'],
      max: [new Date().getFullYear() + 1, 'L\'année ne peut être dans le futur'],
      validate: {
        validator: Number.isInteger,
        message: 'L\'année doit être un nombre entier'
      }
    },
    typeCarburant: {
      type: String,
      enum: {
        values: ['ESSENCE', 'DIESEL', 'HYBRIDE', 'ELECTRIQUE', 'GPL'],
        message: 'Type de carburant invalide'
      },
      required: [true, 'Le type de carburant est requis']
    },
    transmission: {
      type: String,
      enum: {
        values: ['MANUELLE', 'AUTOMATIQUE'],
        message: 'Type de transmission invalide'
      },
      required: [true, 'Le type de transmission est requis']
    },
    climatisation: {
      type: Boolean,
      default: false
    },
    kilometrage: {
      type: Number,
      min: [0, 'Le kilométrage ne peut être négatif'],
      max: [1000000, 'Kilométrage trop élevé']
    }
  },
  
  // Équipements et services
  equipements: {
    wifi: {
      type: Boolean,
      default: false
    },
    chargeurPortable: {
      type: Boolean,
      default: false
    },
    musique: {
      type: Boolean,
      default: true
    },
    siegesReglables: {
      type: Boolean,
      default: false
    },
    espaceBagages: {
      type: String,
      enum: ['PETIT', 'MOYEN', 'GRAND'],
      default: 'MOYEN'
    }
  },
  
  // Statistiques d'utilisation
  statistiques: {
    nombreTrajetsEffectues: {
      type: Number,
      default: 0,
      min: [0, 'Le nombre de trajets ne peut être négatif']
    },
    kilometrageTotalCovoiturage: {
      type: Number,
      default: 0,
      min: [0, 'Le kilométrage ne peut être négatif']
    },
    noteGenerale: {
      type: Number,
      min: [0, 'La note ne peut être inférieure à 0'],
      max: [5, 'La note ne peut dépasser 5'],
      default: 0
    },
    nombreEvaluations: {
      type: Number,
      default: 0,
      min: [0, 'Le nombre d\'évaluations ne peut être négatif']
    },
    dernierTrajetLe: Date
  },
  
  // Historique de maintenance
  historiqueMaintenance: [{
    type: {
      type: String,
      enum: ['REVISION', 'REPARATION', 'CONTROLE', 'CHANGEMENT_PIECE'],
      required: true
    },
    description: {
      type: String,
      required: true,
      maxlength: [500, 'La description ne peut dépasser 500 caractères']
    },
    cout: {
      type: Number,
      min: [0, 'Le coût ne peut être négatif']
    },
    garage: {
      type: String,
      maxlength: [100, 'Le nom du garage ne peut dépasser 100 caractères']
    },
    date: {
      type: Date,
      required: true
    },
    kilometrage: Number,
    facture: String // URL vers la facture
  }],
  
  // Disponibilité
  disponibilite: {
    estDisponible: {
      type: Boolean,
      default: true
    },
    raisonIndisponibilite: String,
    dateRetourDisponibilite: Date
  }

}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// INDEX POUR PERFORMANCES
vehiculeSchema.index({ proprietaireId: 1 });
vehiculeSchema.index({ immatriculation: 1 });
vehiculeSchema.index({ 'assurance.dateExpiration': 1 });
vehiculeSchema.index({ 'visiteTechnique.dateExpiration': 1 });
vehiculeSchema.index({ estatut: 1 });
vehiculeSchema.index({ 'verification.statutVerification': 1 });
vehiculeSchema.index({ 'disponibilite.estDisponible': 1 });
vehiculeSchema.index({ 'statistiques.noteGenerale': -1 });

// INDEX COMPOSÉ POUR RECHERCHES COMPLEXES
vehiculeSchema.index({ 
  proprietaireId: 1, 
  estatut: 1, 
  'disponibilite.estDisponible': 1 
});

// VIRTUALS
vehiculeSchema.virtual('age').get(function() {
  return new Date().getFullYear() - this.caracteristiques.annee;
});

vehiculeSchema.virtual('estRecentementVerifie').get(function() {
  if (!this.verification.dateVerification) return false;
  const maintenant = new Date();
  const diffJours = (maintenant - this.verification.dateVerification) / (1000 * 60 * 60 * 24);
  return diffJours <= 30; // Vérifié dans les 30 derniers jours
});

vehiculeSchema.virtual('documentsValides').get(function() {
  const maintenant = new Date();
  const assuranceValide = this.assurance.dateExpiration > maintenant;
  const visiteValide = this.visiteTechnique.dateExpiration > maintenant;
  
  return {
    assurance: {
      valide: assuranceValide,
      joursRestants: Math.ceil((this.assurance.dateExpiration - maintenant) / (1000 * 60 * 60 * 24))
    },
    visiteTechnique: {
      valide: visiteValide,
      joursRestants: Math.ceil((this.visiteTechnique.dateExpiration - maintenant) / (1000 * 60 * 60 * 24))
    },
    tousValides: assuranceValide && visiteValide
  };
});

vehiculeSchema.virtual('estOperationnel').get(function() {
  return this.estatut === 'ACTIF' && 
         this.verification.statutVerification === 'VERIFIE' &&
         this.documentsValides.tousValides &&
         this.disponibilite.estDisponible;
});

vehiculeSchema.virtual('scoreFiabilite').get(function() {
  let score = 50; // Score de base
  
  // Bonus pour les documents valides
  if (this.documentsValides.tousValides) score += 20;
  
  // Bonus pour la note générale
  score += (this.statistiques.noteGenerale * 6);
  
  // Bonus pour l'expérience (nombre de trajets)
  if (this.statistiques.nombreTrajetsEffectues > 10) score += 10;
  if (this.statistiques.nombreTrajetsEffectues > 50) score += 10;
  
  // Malus pour l'âge du véhicule
  const age = this.age;
  if (age > 10) score -= 10;
  if (age > 15) score -= 10;
  
  return Math.max(0, Math.min(100, score));
});

// MIDDLEWARE PRE-SAVE
vehiculeSchema.pre('save', function(next) {
  // Formater l'immatriculation
  if (this.isModified('immatriculation')) {
    this.immatriculation = this.immatriculation.replace(/\s/g, '').toUpperCase();
    // Ajouter les espaces au bon format: AB1234CD -> AB 1234 CD
    this.immatriculation = this.immatriculation.replace(/^([A-Z]{2})([0-9]{4})([A-Z]{2})$/, '$1 $2 $3');
  }
  
  // Mettre à jour le statut si les documents sont valides et vérifiés
  if (this.verification.statutVerification === 'VERIFIE' && 
      this.documentsValides.tousValides && 
      this.estatut === 'EN_VERIFICATION') {
    this.estatut = 'ACTIF';
  }
  
  next();
});

// MÉTHODES D'INSTANCE

// Vérifier la validité des documents avec détails
vehiculeSchema.methods.verifierDocuments = function() {
  const maintenant = new Date();
  const alerteJours = 30; // Alerte 30 jours avant expiration
  
  const assuranceExpire = this.assurance.dateExpiration;
  const visiteExpire = this.visiteTechnique.dateExpiration;
  
  const joursAssurance = Math.ceil((assuranceExpire - maintenant) / (1000 * 60 * 60 * 24));
  const joursVisite = Math.ceil((visiteExpire - maintenant) / (1000 * 60 * 60 * 24));
  
  return {
    assurance: {
      valide: joursAssurance > 0,
      expire: joursAssurance <= 0,
      alerteExpiration: joursAssurance <= alerteJours && joursAssurance > 0,
      joursRestants: joursAssurance,
      dateExpiration: assuranceExpire
    },
    visiteTechnique: {
      valide: joursVisite > 0,
      expire: joursVisite <= 0,
      alerteExpiration: joursVisite <= alerteJours && joursVisite > 0,
      joursRestants: joursVisite,
      dateExpiration: visiteExpire
    },
    resume: {
      tousValides: joursAssurance > 0 && joursVisite > 0,
      documentsExpires: joursAssurance <= 0 || joursVisite <= 0,
      alerteGlobale: (joursAssurance <= alerteJours && joursAssurance > 0) || 
                     (joursVisite <= alerteJours && joursVisite > 0)
    }
  };
};

// Ajouter une entrée de maintenance
vehiculeSchema.methods.ajouterMaintenance = function(type, description, cout, garage, kilometrage) {
  this.historiqueMaintenance.push({
    type,
    description,
    cout,
    garage,
    date: new Date(),
    kilometrage
  });
  
  return this.save();
};

// Mettre à jour les statistiques après un trajet
vehiculeSchema.methods.mettreAJourStatistiques = function(distanceKm, noteTrajet) {
  this.statistiques.nombreTrajetsEffectues += 1;
  this.statistiques.kilometrageTotalCovoiturage += distanceKm;
  this.statistiques.dernierTrajetLe = new Date();
  
  // Mettre à jour la note générale (moyenne pondérée)
  if (noteTrajet && noteTrajet >= 0 && noteTrajet <= 5) {
    const ancienneNote = this.statistiques.noteGenerale;
    const nombreEvals = this.statistiques.nombreEvaluations;
    
    if (nombreEvals === 0) {
      this.statistiques.noteGenerale = noteTrajet;
    } else {
      this.statistiques.noteGenerale = ((ancienneNote * nombreEvals) + noteTrajet) / (nombreEvals + 1);
    }
    
    this.statistiques.nombreEvaluations += 1;
  }
  
  return this.save();
};

// Changer le statut de disponibilité
vehiculeSchema.methods.changerDisponibilite = function(estDisponible, raison = null, dateRetour = null) {
  this.disponibilite.estDisponible = estDisponible;
  this.disponibilite.raisonIndisponibilite = estDisponible ? null : raison;
  this.disponibilite.dateRetourDisponibilite = estDisponible ? null : dateRetour;
  
  return this.save();
};

// Soumettre pour vérification
vehiculeSchema.methods.soumettreVerification = function() {
  this.verification.statutVerification = 'EN_ATTENTE';
  this.verification.dateVerification = null;
  this.verification.commentaireVerification = null;
  this.verification.documentsManquants = [];
  this.verification.raisonRejet = null;
  this.estatut = 'EN_VERIFICATION';
  
  return this.save();
};

// Approuver la vérification (méthode admin)
vehiculeSchema.methods.approuverVerification = function(verificateurId, commentaire = null) {
  this.verification.statutVerification = 'VERIFIE';
  this.verification.dateVerification = new Date();
  this.verification.verificateurId = verificateurId;
  this.verification.commentaireVerification = commentaire;
  this.verification.documentsManquants = [];
  this.verification.raisonRejet = null;
  
  // Activer le véhicule si les documents sont valides
  if (this.documentsValides.tousValides) {
    this.estatut = 'ACTIF';
  }
  
  return this.save();
};

// Rejeter la vérification (méthode admin)
vehiculeSchema.methods.rejeterVerification = function(verificateurId, raisonRejet, documentsManquants = []) {
  this.verification.statutVerification = 'REJETE';
  this.verification.dateVerification = new Date();
  this.verification.verificateurId = verificateurId;
  this.verification.raisonRejet = raisonRejet;
  this.verification.documentsManquants = documentsManquants;
  this.estatut = 'INACTIF';
  
  return this.save();
};

// MÉTHODES STATIQUES

// Trouver les véhicules avec documents expirant bientôt
vehiculeSchema.statics.documentsExpirantBientot = function(jours = 30) {
  const dateLimit = new Date();
  dateLimit.setDate(dateLimit.getDate() + jours);
  
  return this.find({
    $or: [
      { 'assurance.dateExpiration': { $lte: dateLimit } },
      { 'visiteTechnique.dateExpiration': { $lte: dateLimit } }
    ],
    estatut: { $in: ['ACTIF', 'EN_VERIFICATION'] }
  })
  .populate('proprietaireId', 'nom prenom email telephone');
};

// Trouver les véhicules disponibles pour un propriétaire
vehiculeSchema.statics.vehiculesDisponibles = function(proprietaireId) {
  return this.find({
    proprietaireId,
    estatut: 'ACTIF',
    'verification.statutVerification': 'VERIFIE',
    'disponibilite.estDisponible': true
  });
};

// Statistiques globales des véhicules
vehiculeSchema.statics.statistiquesGlobales = async function() {
  return this.aggregate([
    {
      $group: {
        _id: null,
        totalVehicules: { $sum: 1 },
        vehiculesActifs: {
          $sum: { $cond: [{ $eq: ['$estatut', 'ACTIF'] }, 1, 0] }
        },
        vehiculesVerifies: {
          $sum: { $cond: [{ $eq: ['$verification.statutVerification', 'VERIFIE'] }, 1, 0] }
        },
        vehiculesDisponibles: {
          $sum: { $cond: ['$disponibilite.estDisponible', 1, 0] }
        },
        ageMoyen: { $avg: { $subtract: [new Date().getFullYear(), '$caracteristiques.annee'] } },
        noteGeneraleMoyenne: { $avg: '$statistiques.noteGenerale' },
        totalTrajetsEffectues: { $sum: '$statistiques.nombreTrajetsEffectues' }
      }
    }
  ]);
};

// Véhicules les mieux notés
vehiculeSchema.statics.vehiculesMieuxNotes = function(limit = 10) {
  return this.find({
    estatut: 'ACTIF',
    'statistiques.nombreEvaluations': { $gte: 5 },
    'statistiques.noteGenerale': { $gte: 4 }
  })
  .sort({ 'statistiques.noteGenerale': -1, 'statistiques.nombreEvaluations': -1 })
  .limit(limit)
  .populate('proprietaireId', 'nom prenom');
};

module.exports = mongoose.model('Vehicule', vehiculeSchema);