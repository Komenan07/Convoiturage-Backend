// =====================================================
// MODEL: SIGNALEMENT
// =====================================================

const mongoose = require('mongoose');

const signalementSchema = new mongoose.Schema({
  // =====================================================
  // RÉFÉRENCES
  // =====================================================
  signalantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Utilisateur',
    required: [true, 'L\'ID du signalant est requis'],
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
      values: ['COMPORTEMENT', 'CONTENU', 'FRAUDE', 'SECURITE'],
      message: 'Type de signalement non valide'
    },
    required: [true, 'Le type de signalement est requis'],
    index: true
  },

  motif: {
    type: String,
    enum: {
      values: [
        // COMPORTEMENT
        'COMPORTEMENT_INAPPROPRIE',
        'HARCELEMENT',
        'DISCRIMINATION',
        'VIOLENCE_VERBALE',
        'NON_RESPECT_REGLES',
        
        // CONTENU
        'CONTENU_OFFENSANT',
        'SPAM',
        'CONTENU_INAPPROPRIE',
        'FAUSSES_INFORMATIONS',
        
        // FRAUDE
        'FAUX_PROFIL',
        'PRIX_ABUSIFS',
        'ANNULATION_ABUSIVE',
        'FAUSSE_EVALUATION',
        
        // SÉCURITÉ
        'CONDUITE_DANGEREUSE',
        'VEHICULE_NON_CONFORME',
        'USURPATION_IDENTITE',
        'MENACES'
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
    type: String,
    validate: {
      validator: function(url) {
        // Validation basique d'URL
        return /^https?:\/\/.+\.(jpg|jpeg|png|gif|pdf|mp4|mov)$/i.test(url);
      },
      message: 'URL de preuve non valide'
    }
  }],

  // =====================================================
  // TRAITEMENT DU SIGNALEMENT
  // =====================================================
  statutTraitement: {
    type: String,
    enum: {
      values: ['EN_ATTENTE', 'EN_COURS', 'TRAITE', 'REJETE'],
      message: 'Statut de traitement non valide'
    },
    default: 'EN_ATTENTE',
    index: true
  },

  moderateurId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Administrateur',
    default: null,
    index: true
  },

  actionsPrises: [{
    type: String,
    enum: {
      values: [
        'AVERTISSEMENT',
        'SUSPENSION_1_JOUR',
        'SUSPENSION_7_JOURS',
        'SUSPENSION_30_JOURS',
        'BLOCAGE_DEFINITIF',
        'SUPPRESSION_CONTENU',
        'LIMITATION_FONCTIONNALITES',
        'VERIFICATION_IDENTITE_REQUISE'
      ],
      message: 'Action disciplinaire non valide'
    }
  }],

  commentaireModeratrice: {
    type: String,
    maxlength: [500, 'Le commentaire ne peut dépasser 500 caractères'],
    trim: true,
    default: ''
  },

  // =====================================================
  // DATES
  // =====================================================
  dateSignalement: {
    type: Date,
    default: Date.now,
    index: true
  },

  dateTraitement: {
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

  nombreSignalementsSimilaires: {
    type: Number,
    default: 0,
    min: 0
  },

  ipSignalant: {
    type: String,
    default: null
  }
}, {
  timestamps: true,
  collection: 'signalements'
});

// =====================================================
// INDEX COMPOSITES
// =====================================================

// Index pour les requêtes de modération
signalementSchema.index({ 
  statutTraitement: 1, 
  dateSignalement: -1 
});

// Index pour les statistiques
signalementSchema.index({ 
  typeSignalement: 1, 
  statutTraitement: 1,
  dateSignalement: -1 
});

// Index pour éviter les doublons
signalementSchema.index({ 
  signalantId: 1, 
  signaleId: 1, 
  trajetId: 1, 
  messageId: 1 
});

// Index pour les recherches par utilisateur signalé
signalementSchema.index({ 
  signaleId: 1, 
  statutTraitement: 1 
});

// =====================================================
// MIDDLEWARE PRE-SAVE
// =====================================================

signalementSchema.pre('save', function(next) {
  // Empêcher l'auto-signalement
  if (this.signalantId && this.signaleId && 
      this.signalantId.toString() === this.signaleId.toString()) {
    return next(new Error('Un utilisateur ne peut pas se signaler lui-même'));
  }

  // Définir la priorité automatiquement
  if (this.isNew) {
    this.priorite = this.calculerPriorite();
  }

  // Mettre à jour la date de traitement
  if (this.isModified('statutTraitement') && 
      this.statutTraitement !== 'EN_ATTENTE') {
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
    'VIOLENCE_VERBALE', 
    'CONDUITE_DANGEREUSE',
    'USURPATION_IDENTITE'
  ];
  
  const motifsHauts = [
    'HARCELEMENT',
    'DISCRIMINATION', 
    'VEHICULE_NON_CONFORME',
    'FAUX_PROFIL'
  ];

  if (motifsCritiques.includes(this.motif)) {
    return 'CRITIQUE';
  } else if (motifsHauts.includes(this.motif)) {
    return 'HAUTE';
  } else if (this.nombreSignalementsSimilaires > 2) {
    return 'HAUTE';
  } else {
    return 'NORMALE';
  }
};

signalementSchema.methods.marquerTraite = function(moderateurId, actions, commentaire) {
  this.statutTraitement = 'TRAITE';
  this.moderateurId = moderateurId;
  this.actionsPrises = actions || [];
  this.commentaireModeratrice = commentaire || '';
  this.dateTraitement = new Date();
  return this.save();
};

signalementSchema.methods.rejeter = function(moderateurId, raison) {
  this.statutTraitement = 'REJETE';
  this.moderateurId = moderateurId;
  this.commentaireModeratrice = raison || 'Signalement non fondé';
  this.dateTraitement = new Date();
  return this.save();
};

// =====================================================
// MÉTHODES STATIQUES
// =====================================================

signalementSchema.statics.obtenirStatistiques = async function(dateDebut, dateFin) {
  const pipeline = [
    {
      $match: {
        dateSignalement: {
          $gte: dateDebut || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          $lte: dateFin || new Date()
        }
      }
    },
    {
      $group: {
        _id: '$statutTraitement',
        count: { $sum: 1 },
        parType: {
          $push: {
            type: '$typeSignalement',
            motif: '$motif'
          }
        }
      }
    }
  ];

  return this.aggregate(pipeline);
};

signalementSchema.statics.obtenirQueueModeration = async function(limite = 50) {
  return this.find({
    statutTraitement: { $in: ['EN_ATTENTE', 'EN_COURS'] }
  })
  .populate('signalantId', 'nom prenom email')
  .populate('signaleId', 'nom prenom email')
  .populate('trajetId', 'pointDepart pointArrivee dateDepart')
  .populate('moderateurId', 'nom prenom')
  .sort({ priorite: -1, dateSignalement: 1 })
  .limit(limite);
};

signalementSchema.statics.verifierDoublon = async function(signalantId, signaleId, trajetId, messageId) {
  const query = { signalantId, signaleId };
  
  if (trajetId) query.trajetId = trajetId;
  if (messageId) query.messageId = messageId;

  // Vérifier s'il existe déjà un signalement similaire dans les 24h
  query.dateSignalement = {
    $gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
  };

  return this.findOne(query);
};

// =====================================================
// MÉTHODES VIRTUELLES
// =====================================================

signalementSchema.virtual('tempsTraitement').get(function() {
  if (this.dateTraitement && this.dateSignalement) {
    return this.dateTraitement - this.dateSignalement;
  }
  return null;
});

signalementSchema.virtual('estUrgent').get(function() {
  return ['CRITIQUE', 'HAUTE'].includes(this.priorite);
});

signalementSchema.virtual('estEnRetard').get(function() {
  if (this.statutTraitement === 'EN_ATTENTE') {
    const delaiMax = this.priorite === 'CRITIQUE' ? 2 : 
                     this.priorite === 'HAUTE' ? 24 : 72; // heures
    const tempsEcoule = (Date.now() - this.dateSignalement) / (1000 * 60 * 60);
    return tempsEcoule > delaiMax;
  }
  return false;
});

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