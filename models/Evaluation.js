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
      required: true,
      validate: {
        validator: Number.isInteger,
        message: 'La note de ponctualité doit être un entier'
      }
    },
    proprete: {
      type: Number,
      min: 1,
      max: 5,
      required: true,
      validate: {
        validator: Number.isInteger,
        message: 'La note de propreté doit être un entier'
      }
    },
    qualiteConduite: {
      type: Number,
      min: 1,
      max: 5,
      required: true,
      validate: {
        validator: Number.isInteger,
        message: 'La note de qualité de conduite doit être un entier'
      }
    },
    respect: {
      type: Number,
      min: 1,
      max: 5,
      required: true,
      validate: {
        validator: Number.isInteger,
        message: 'La note de respect doit être un entier'
      }
    },
    communication: {
      type: Number,
      min: 1,
      max: 5,
      required: true,
      validate: {
        validator: Number.isInteger,
        message: 'La note de communication doit être un entier'
      }
    },
    noteGlobale: {
      type: Number,
      min: 1,
      max: 5,
      default: 0
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
evaluationSchema.index({ 'notes.noteGlobale': -1 });

// Middleware pour calculer la note globale automatiquement
evaluationSchema.pre('save', function(next) {
  // Vérifier si les notes ont été modifiées
  if (this.isModified('notes.ponctualite') || 
      this.isModified('notes.proprete') || 
      this.isModified('notes.qualiteConduite') || 
      this.isModified('notes.respect') || 
      this.isModified('notes.communication')) {
    
    // Calculer la moyenne des 5 notes
    const { ponctualite, proprete, qualiteConduite, respect, communication } = this.notes;
    
    // Vérifier que toutes les notes sont présentes
    if (ponctualite && proprete && qualiteConduite && respect && communication) {
      const somme = ponctualite + proprete + qualiteConduite + respect + communication;
      const moyenne = somme / 5;
      
      // Arrondir à 1 décimale
      this.notes.noteGlobale = Math.round(moyenne * 10) / 10;
      
      console.log(`📊 Note globale calculée: ${this.notes.noteGlobale} (${ponctualite}+${proprete}+${qualiteConduite}+${respect}+${communication})/5`);
    } else {
      console.warn('⚠️ Impossible de calculer la note globale: notes manquantes');
    }
  }
  next();
});

// Middleware pour mettre à jour la note globale lors des modifications
evaluationSchema.pre('findOneAndUpdate', function(next) {
  const update = this.getUpdate();
  
  // Si les notes sont modifiées, recalculer la note globale
  if (update.$set && update.$set.notes) {
    const notes = update.$set.notes;
    const { ponctualite, proprete, qualiteConduite, respect, communication } = notes;
    
    if (ponctualite && proprete && qualiteConduite && respect && communication) {
      const somme = ponctualite + proprete + qualiteConduite + respect + communication;
      const moyenne = somme / 5;
      update.$set['notes.noteGlobale'] = Math.round(moyenne * 10) / 10;
    }
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

// Méthode pour recalculer manuellement la note globale
evaluationSchema.methods.recalculerNoteGlobale = function() {
  const { ponctualite, proprete, qualiteConduite, respect, communication } = this.notes;
  
  if (ponctualite && proprete && qualiteConduite && respect && communication) {
    const somme = ponctualite + proprete + qualiteConduite + respect + communication;
    const moyenne = somme / 5;
    this.notes.noteGlobale = Math.round(moyenne * 10) / 10;
    return this.notes.noteGlobale;
  }
  
  return null;
};

// Méthode pour obtenir un résumé des notes
evaluationSchema.methods.getResumeNotes = function() {
  const { ponctualite, proprete, qualiteConduite, respect, communication, noteGlobale } = this.notes;
  
  return {
    ponctualite: { note: ponctualite, libelle: this.getLibelleNote(ponctualite) },
    proprete: { note: proprete, libelle: this.getLibelleNote(proprete) },
    qualiteConduite: { note: qualiteConduite, libelle: this.getLibelleNote(qualiteConduite) },
    respect: { note: respect, libelle: this.getLibelleNote(respect) },
    communication: { note: communication, libelle: this.getLibelleNote(communication) },
    noteGlobale: { note: noteGlobale, libelle: this.getLibelleNote(noteGlobale) }
  };
};

// Méthode pour obtenir le libellé d'une note
evaluationSchema.methods.getLibelleNote = function(note) {
  if (note >= 4.5) return 'EXCELLENT';
  if (note >= 4.0) return 'TRÈS BIEN';
  if (note >= 3.5) return 'BIEN';
  if (note >= 3.0) return 'ASSEZ BIEN';
  if (note >= 2.5) return 'MOYEN';
  if (note >= 2.0) return 'PASSABLE';
  if (note >= 1.5) return 'INSUFFISANT';
  return 'TRÈS INSUFFISANT';
};

// Méthode pour vérifier si l'évaluation est positive
evaluationSchema.methods.estPositive = function() {
  return this.notes.noteGlobale >= 4.0;
};

// Méthode pour vérifier si l'évaluation est critique
evaluationSchema.methods.estCritique = function() {
  return this.notes.noteGlobale <= 2.0;
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

// Méthode pour obtenir les statistiques détaillées d'un utilisateur
evaluationSchema.statics.getStatistiquesUtilisateur = async function(userId) {
  const pipeline = [
    { $match: { evalueId: mongoose.Types.ObjectId(userId) } },
    {
      $group: {
        _id: null,
        totalEvaluations: { $sum: 1 },
        moyenneGlobale: { $avg: '$notes.noteGlobale' },
        repartitionNotes: {
          $push: {
            ponctualite: '$notes.ponctualite',
            proprete: '$notes.proprete',
            qualiteConduite: '$notes.qualiteConduite',
            respect: '$notes.respect',
            communication: '$notes.communication',
            noteGlobale: '$notes.noteGlobale'
          }
        },
        nombreSignalements: {
          $sum: { $cond: ['$estSignalement', 1, 0] }
        },
        derniereEvaluation: { $max: '$dateEvaluation' }
      }
    }
  ];
  
  const result = await this.aggregate(pipeline);
  if (!result[0]) return null;
  
  const stats = result[0];
  const repartition = stats.repartitionNotes;
  
  // Calculer les moyennes par critère
  const moyennes = {
    ponctualite: repartition.reduce((sum, r) => sum + r.ponctualite, 0) / repartition.length,
    proprete: repartition.reduce((sum, r) => sum + r.proprete, 0) / repartition.length,
    qualiteConduite: repartition.reduce((sum, r) => sum + r.qualiteConduite, 0) / repartition.length,
    respect: repartition.reduce((sum, r) => sum + r.respect, 0) / repartition.length,
    communication: repartition.reduce((sum, r) => sum + r.communication, 0) / repartition.length
  };
  
  // Arrondir toutes les moyennes
  Object.keys(moyennes).forEach(key => {
    moyennes[key] = Math.round(moyennes[key] * 10) / 10;
  });
  
  return {
    totalEvaluations: stats.totalEvaluations,
    moyenneGlobale: Math.round(stats.moyenneGlobale * 10) / 10,
    moyennesParCritere: moyennes,
    nombreSignalements: stats.nombreSignalements,
    derniereEvaluation: stats.derniereEvaluation,
    tendance: stats.totalEvaluations >= 3 ? this.analyserTendance(repartition) : 'INSUFFISANT_DE_DONNEES'
  };
};

// Méthode pour analyser la tendance des évaluations
evaluationSchema.statics.analyserTendance = function(evaluations) {
  if (evaluations.length < 3) return 'INSUFFISANT_DE_DONNEES';
  
  // Trier par date (plus récent en premier)
  const triees = evaluations.sort((a, b) => new Date(b.dateEvaluation) - new Date(a.dateEvaluation));
  
  // Prendre les 3 plus récentes
  const recentes = triees.slice(0, 3);
  const anciennes = triees.slice(-3);
  
  const moyenneRecente = recentes.reduce((sum, e) => sum + e.noteGlobale, 0) / recentes.length;
  const moyenneAncienne = anciennes.reduce((sum, e) => sum + e.noteGlobale, 0) / anciennes.length;
  
  const difference = moyenneRecente - moyenneAncienne;
  
  if (difference > 0.5) return 'AMELIORATION';
  if (difference < -0.5) return 'DEGRADATION';
  return 'STABLE';
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
    moyenneRecente: Math.round(moyenneRecente * 10) / 10,
    nombreSignalements: signalements,
    recommandations: moyenneRecente < 2.5 ? 
      ['Formation conduite', 'Amélioration service client'] : []
  };
};

// Méthode pour obtenir les meilleures évaluations
evaluationSchema.statics.getMeilleuresEvaluations = async function(limit = 10) {
  return await this.find({ 'notes.noteGlobale': { $gte: 4.5 } })
    .sort({ 'notes.noteGlobale': -1, dateEvaluation: -1 })
    .limit(limit)
    .populate('evalueId', 'nom prenom photoProfil')
    .populate('evaluateurId', 'nom prenom');
};

// Méthode pour obtenir les évaluations par période
evaluationSchema.statics.getEvaluationsParPeriode = async function(userId, periode = '30j') {
  const maintenant = new Date();
  let dateLimite;
  
  switch (periode) {
    case '7j':
      dateLimite = new Date(maintenant.setDate(maintenant.getDate() - 7));
      break;
    case '30j':
      dateLimite = new Date(maintenant.setDate(maintenant.getDate() - 30));
      break;
    case '90j':
      dateLimite = new Date(maintenant.setDate(maintenant.getDate() - 90));
      break;
    case '1an':
      dateLimite = new Date(maintenant.setFullYear(maintenant.getFullYear() - 1));
      break;
    default:
      dateLimite = new Date(maintenant.setDate(maintenant.getDate() - 30));
  }
  
  return await this.find({
    evalueId: userId,
    dateEvaluation: { $gte: dateLimite }
  }).sort({ dateEvaluation: -1 });
};

module.exports = mongoose.model('Evaluation', evaluationSchema);