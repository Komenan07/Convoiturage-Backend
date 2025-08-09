// models/Evaluation.js
const mongoose = require('mongoose');

const evaluationSchema = new mongoose.Schema({
  trajetId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Trajet',
    required: true,
    index: true
  },
  
  evaluateurId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Utilisateur',
    required: true,
    index: true
  },
  
  evalueId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Utilisateur',
    required: true,
    index: true
  },
  
  typeEvaluateur: {
    type: String,
    enum: ['CONDUCTEUR', 'PASSAGER'],
    required: true
  },
  
  // Notes détaillées (spécificité CI)
  notes: {
    ponctualite: {
      type: Number,
      min: 1,
      max: 5,
      required: true
    },
    proprete: {
      type: Number,
      min: 1,
      max: 5,
      required: true
    },
    qualiteConduite: {
      type: Number,
      min: 1,
      max: 5,
      required: true
    },
    respect: {
      type: Number,
      min: 1,
      max: 5,
      required: true
    },
    communication: {
      type: Number,
      min: 1,
      max: 5,
      required: true
    },
    noteGlobale: {
      type: Number,
      min: 1,
      max: 5
    }
  },
  
  // Commentaires
  commentaire: {
    type: String,
    maxlength: 500,
    trim: true
  },
  
  aspectsPositifs: [{
    type: String,
    enum: [
      'PONCTUEL', 
      'SYMPATHIQUE', 
      'VEHICULE_PROPRE', 
      'BONNE_CONDUITE',
      'RESPECTUEUX',
      'COMMUNICATIF',
      'SERVIABLE',
      'COURTOIS'
    ]
  }],
  
  aspectsAmeliorer: [{
    type: String,
    enum: [
      'PONCTUALITE', 
      'PROPRETE', 
      'CONDUITE', 
      'COMMUNICATION',
      'RESPECT',
      'PATIENCE',
      'ORGANISATION'
    ]
  }],
  
  // Signalement
  estSignalement: {
    type: Boolean,
    default: false
  },
  
  motifSignalement: {
    type: String,
    enum: [
      'COMPORTEMENT_INAPPROPRIE',
      'CONDUITE_DANGEREUSE',
      'RETARD_EXCESSIF',
      'VEHICULE_INSALUBRE',
      'MANQUE_RESPECT',
      'AUTRE'
    ]
  },
  
  gravite: {
    type: String,
    enum: ['LEGER', 'MOYEN', 'GRAVE'],
    required: function() {
      return this.estSignalement;
    }
  },
  
  // Réponse
  reponseEvalue: {
    type: String,
    maxlength: 300,
    trim: true
  },
  
  dateReponse: Date,
  
  dateEvaluation: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index composé pour éviter les doublons
evaluationSchema.index({ trajetId: 1, evaluateurId: 1 }, { unique: true });

// Index pour les requêtes fréquentes
evaluationSchema.index({ evalueId: 1, dateEvaluation: -1 });
evaluationSchema.index({ estSignalement: 1, gravite: 1 });

// Middleware pour calculer la note globale automatiquement
evaluationSchema.pre('save', function(next) {
  if (this.notes) {
    const { ponctualite, proprete, qualiteConduite, respect, communication } = this.notes;
    this.notes.noteGlobale = Math.round(
      (ponctualite + proprete + qualiteConduite + respect + communication) / 5 * 10
    ) / 10;
  }
  next();
});

// Méthodes d'instance
evaluationSchema.methods.peutRepondre = function(userId) {
  return this.evalueId.toString() === userId.toString() && !this.reponseEvalue;
};

evaluationSchema.methods.estRecente = function(jours = 30) {
  const maintenant = new Date();
  const limite = new Date(maintenant.setDate(maintenant.getDate() - jours));
  return this.dateEvaluation >= limite;
};

// Méthodes statiques
evaluationSchema.statics.calculerMoyenneUtilisateur = async function(userId) {
  const pipeline = [
    { $match: { evalueId: mongoose.Types.ObjectId(userId) } },
    {
      $group: {
        _id: null,
        moyennePonctualite: { $avg: '$notes.ponctualite' },
        moyenneProprete: { $avg: '$notes.proprete' },
        moyenneQualiteConduite: { $avg: '$notes.qualiteConduite' },
        moyenneRespect: { $avg: '$notes.respect' },
        moyenneCommunication: { $avg: '$notes.communication' },
        moyenneGlobale: { $avg: '$notes.noteGlobale' },
        nombreEvaluations: { $sum: 1 }
      }
    }
  ];
  
  const result = await this.aggregate(pipeline);
  return result[0] || null;
};

evaluationSchema.statics.detecterEvaluationsSuspectes = async function(userId) {
  // Détecte des patterns suspects (notes très basses répétées, etc.)
  const evaluations = await this.find({ evalueId: userId })
    .sort({ dateEvaluation: -1 })
    .limit(10);
  
  if (evaluations.length < 3) return { suspect: false };
  
  const notesRecentes = evaluations.slice(0, 5);
  const moyenneRecente = notesRecentes.reduce((sum, eval) => 
    sum + eval.notes.noteGlobale, 0) / notesRecentes.length;
  
  const signalements = evaluations.filter(eval => eval.estSignalement).length;
  
  return {
    suspect: moyenneRecente < 2.5 || signalements >= 2,
    moyenneRecente,
    nombreSignalements: signalements,
    recommandations: moyenneRecente < 2.5 ? 
      ['Formation conduite', 'Amélioration service client'] : []
  };
};

module.exports = mongoose.model('Evaluation', evaluationSchema);