// =====================================================
// MODEL: SIGNALEMENT - CORRIGÉ POUR CORRESPONDRE AU CONTRÔLEUR
// =====================================================

const mongoose = require('mongoose');

const signalementSchema = new mongoose.Schema({
  // =====================================================
  // RÉFÉRENCES (noms corrigés)
  // =====================================================
  rapportePar: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Utilisateur',
    required: [true, 'L\'ID du rapporteur est requis'],
    index: true
  },

  signaleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Utilisateur',
    required: [true, 'L\'ID de l\'utilisateur signalé est requis'],
    index: true
  },

  trajetId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Trajet',
    default: null,
    index: true
  },

  messageId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message',
    default: null,
    index: true
  },

  // =====================================================
  // DÉTAILS DU SIGNALEMENT
  // =====================================================
  typeSignalement: {
    type: String,
    enum: {
      values: ['COMPORTEMENT', 'SECURITE', 'FRAUDE', 'SPAM', 'CONTENU_INAPPROPRIE', 'AUTRE'],
      message: 'Type de signalement non valide'
    },
    required: [true, 'Le type de signalement est requis'],
    index: true
  },

  motif: {
    type: String,
    enum: {
      values: [
        'HARCELEMENT', 'MENACES', 'CONDUITE_DANGEREUSE', 'VEHICULE_NON_CONFORME',
        'USURPATION_IDENTITE', 'VIOLENCE_VERBALE', 'DISCRIMINATION',
        'COMPORTEMENT_INAPPROPRIE', 'FAUX_PROFIL', 'CONTENU_OFFENSANT'
      ],
      message: 'Motif de signalement non valide'
    },
    required: [true, 'Le motif du signalement est requis'],
    index: true
  },

  description: {
    type: String,
    required: [true, 'La description du signalement est requise'],
    minlength: [10, 'La description doit contenir au moins 10 caractères'],
    maxlength: [1000, 'La description ne peut dépasser 1000 caractères'],
    trim: true
  },

  preuves: [{
    url: {
      type: String,
      required: true
    },
    publicId: {
      type: String,
      required: true
    },
    nomOriginal: {
      type: String,
      required: true
    },
    type: {
      type: String,
      required: true
    },
    taille: {
      type: Number,
      required: true
    }
  }],

  // =====================================================
  // TRAITEMENT DU SIGNALEMENT
  // =====================================================
  statut: {
    type: String,
    enum: {
      values: ['EN_ATTENTE', 'EN_COURS', 'TRAITE', 'REJETE', 'CLASSE_SANS_SUITE'],
      message: 'Statut de traitement non valide'
    },
    default: 'EN_ATTENTE',
    index: true
  },

  moderateurAssigne: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Utilisateur',
    default: null,
    index: true
  },

  traitePar: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Utilisateur',
    default: null
  },

  actionsDisciplinaires: [{
    type: String,
    enum: {
      values: [
        'AVERTISSEMENT',
        'SUSPENSION_1_JOUR',
        'SUSPENSION_7_JOURS',
        'SUSPENSION_30_JOURS',
        'BLOCAGE_DEFINITIF',
        'LIMITATION_FONCTIONNALITES',
        'VERIFICATION_IDENTITE_REQUISE'
      ],
      message: 'Action disciplinaire non valide'
    }
  }],

  commentaireModeration: {
    type: String,
    maxlength: [500, 'Le commentaire ne peut dépasser 500 caractères'],
    trim: true,
    default: ''
  },

  // =====================================================
  // DATES
  // =====================================================
  dateCreation: {
    type: Date,
    default: Date.now,
    index: true
  },

  dateTraitement: {
    type: Date,
    default: null
  },

  dateAssignation: {
    type: Date,
    default: null
  },

  dateModification: {
    type: Date,
    default: null
  },

  // =====================================================
  // MÉTADONNÉES
  // =====================================================
  priorite: {
    type: String,
    enum: ['BASSE', 'NORMALE', 'HAUTE', 'CRITIQUE'],
    default: 'NORMALE',
    index: true
  },

  escalade: {
    type: Boolean,
    default: false
  },

  dateEscalade: {
    type: Date,
    default: null
  },

  historique: [{
    action: {
      type: String,
      required: true
    },
    moderateur: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Utilisateur',
      required: true
    },
    date: {
      type: Date,
      default: Date.now
    },
    commentaire: {
      type: String,
      default: ''
    }
  }]
}, {
  timestamps: true,
  collection: 'signalements'
});

// =====================================================
// INDEX COMPOSITES
// =====================================================

signalementSchema.index({ 
  statut: 1, 
  dateCreation: -1 
});

signalementSchema.index({ 
  typeSignalement: 1, 
  statut: 1,
  dateCreation: -1 
});

signalementSchema.index({ 
  rapportePar: 1, 
  signaleId: 1, 
  trajetId: 1, 
  messageId: 1 
});

signalementSchema.index({ 
  signaleId: 1, 
  statut: 1 
});

// =====================================================
// MIDDLEWARE PRE-SAVE
// =====================================================

signalementSchema.pre('save', function(next) {
  if (this.rapportePar && this.signaleId && 
      this.rapportePar.toString() === this.signaleId.toString()) {
    return next(new Error('Un utilisateur ne peut pas se signaler lui-même'));
  }

  if (this.isModified('statut') && 
      this.statut !== 'EN_ATTENTE') {
    this.dateTraitement = new Date();
  }

  next();
});

// =====================================================
// MÉTHODES D'INSTANCE
// =====================================================

signalementSchema.methods.calculerPriorite = function() {
  const motifsCritiques = [
    'MENACES', 
    'CONDUITE_DANGEREUSE',
    'VEHICULE_NON_CONFORME',
    'USURPATION_IDENTITE',
    'VIOLENCE_VERBALE'
  ];
  
  const motifsHauts = [
    'HARCELEMENT',
    'DISCRIMINATION',
    'COMPORTEMENT_INAPPROPRIE',
    'FAUX_PROFIL',
    'CONTENU_OFFENSANT'
  ];

  if (motifsCritiques.includes(this.motif)) {
    return 'CRITIQUE';
  } else if (motifsHauts.includes(this.motif)) {
    return 'HAUTE';
  } else if (this.typeSignalement === 'SECURITE') {
    return 'HAUTE';
  } else if (this.typeSignalement === 'FRAUDE') {
    return 'NORMALE';
  } else {
    return 'BASSE';
  }
};

// =====================================================
// CONFIGURATION JSON
// =====================================================

signalementSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('Signalement', signalementSchema);