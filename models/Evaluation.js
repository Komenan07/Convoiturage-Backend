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
  
  // ============================================
  // ✅ NOTES CORRIGÉES - Validation conditionnelle
  // ============================================
  notes: {
    ponctualite: {
      type: Number,
      min: [1, 'La note de ponctualité doit être au moins 1'],
      max: [5, 'La note de ponctualité ne peut dépasser 5'],
      required: function() {
        return this.statutEvaluation === 'COMPLETEE';
      },
      validate: {
        validator: function(value) {
          if (this.statutEvaluation === 'EN_ATTENTE') {
            return value === undefined || (Number.isInteger(value) && value >= 1 && value <= 5);
          }
          return Number.isInteger(value) && value >= 1 && value <= 5;
        },
        message: 'La note de ponctualité doit être un entier entre 1 et 5'
      }
    },
    
    proprete: {
      type: Number,
      min: [1, 'La note de propreté doit être au moins 1'],
      max: [5, 'La note de propreté ne peut dépasser 5'],
      required: function() {
        return this.statutEvaluation === 'COMPLETEE';
      },
      validate: {
        validator: function(value) {
          if (this.statutEvaluation === 'EN_ATTENTE') {
            return value === undefined || (Number.isInteger(value) && value >= 1 && value <= 5);
          }
          return Number.isInteger(value) && value >= 1 && value <= 5;
        },
        message: 'La note de propreté doit être un entier entre 1 et 5'
      }
    },
    
    qualiteConduite: {
      type: Number,
      min: [1, 'La note de qualité de conduite doit être au moins 1'],
      max: [5, 'La note de qualité de conduite ne peut dépasser 5'],
      required: function() {
        return this.statutEvaluation === 'COMPLETEE';
      },
      validate: {
        validator: function(value) {
          if (this.statutEvaluation === 'EN_ATTENTE') {
            return value === undefined || (Number.isInteger(value) && value >= 1 && value <= 5);
          }
          return Number.isInteger(value) && value >= 1 && value <= 5;
        },
        message: 'La note de qualité de conduite doit être un entier entre 1 et 5'
      }
    },
    
    respect: {
      type: Number,
      min: [1, 'La note de respect doit être au moins 1'],
      max: [5, 'La note de respect ne peut dépasser 5'],
      required: function() {
        return this.statutEvaluation === 'COMPLETEE';
      },
      validate: {
        validator: function(value) {
          if (this.statutEvaluation === 'EN_ATTENTE') {
            return value === undefined || (Number.isInteger(value) && value >= 1 && value <= 5);
          }
          return Number.isInteger(value) && value >= 1 && value <= 5;
        },
        message: 'La note de respect doit être un entier entre 1 et 5'
      }
    },
    
    communication: {
      type: Number,
      min: [1, 'La note de communication doit être au moins 1'],
      max: [5, 'La note de communication ne peut dépasser 5'],
      required: function() {
        return this.statutEvaluation === 'COMPLETEE';
      },
      validate: {
        validator: function(value) {
          if (this.statutEvaluation === 'EN_ATTENTE') {
            return value === undefined || (Number.isInteger(value) && value >= 1 && value <= 5);
          }
          return Number.isInteger(value) && value >= 1 && value <= 5;
        },
        message: 'La note de communication doit être un entier entre 1 et 5'
      }
    },
    
    noteGlobale: {
      type: Number,
      default: 0,
      validate: {
        validator: function(value) {
          // ✅ EN_ATTENTE : noteGlobale peut être 0 ou absente
          if (this.statutEvaluation === 'EN_ATTENTE') {
            return true; // Toutes les valeurs sont acceptées
          }
          
          // ✅ COMPLETEE : noteGlobale doit être entre 1 et 5
          if (this.statutEvaluation === 'COMPLETEE') {
            return value >= 1 && value <= 5;
          }
          
          // ✅ EXPIREE : pas de validation stricte
          return true;
        },
        message: props => {
          if (props.value === 0) {
            return 'La note globale doit être calculée pour une évaluation complétée';
          }
          return `La note globale (${props.value}) doit être entre 1 et 5`;
        }
      }
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
      'COURTOIS',
      'AMBIANCE_AGREABLE',      
      'MUSIQUE_ADAPTEE',        
      'CLIMATISATION_OK',      
      'BAGAGES_BIEN_GERES',     
      'FLEXIBLE_HORAIRES'      
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
      'ORGANISATION',
      'GESTION_BAGAGES',        
      'ENTRETIEN_VEHICULE' 
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
  
  evaluationObligatoire: {
    type: Boolean,
    default: function() {
      return this.typeEvaluateur === 'PASSAGER';
    }
  },
  
  statutEvaluation: {
    type: String,
    enum: ['EN_ATTENTE', 'COMPLETEE', 'EXPIREE'],
    default: 'EN_ATTENTE',
    index: true
  },
  
  visibilite: {
    type: String,
    enum: ['PUBLIQUE', 'MASQUEE', 'EN_REVISION'],
    default: 'PUBLIQUE',
    index: true
  },
  
  raisonMasquage: {
    type: String,
    maxlength: 200
  },
  
  dateRevision: Date,

  dateEvaluation: {
    type: Date,
    default: Date.now
  },
  
  // ✅ Date de complétion
  dateCompletion: Date,

  // Gestion de la prise en charge
  priseEnCharge: {
    confirmee: {
      type: Boolean,
      default: false
    },
    datePriseEnCharge: Date,
    localisationPriseEnCharge: {
      type: {
        type: String,
        enum: ['Point'],
        //default: 'Point'
      },
      coordinates: {
        type: [Number]
      }
    },
    conducteurConfirmateur: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Utilisateur'
    },
    alerteDoublon: {
      type: Boolean,
      default: false
    },
    nombreConducteursProches: {
      type: Number,
      default: 0
    }
  },

  // Validation de la langue française
  langueValidee: {
    type: Boolean,
    default: false
  },
  
  langueDetectee: {
    type: String,
    enum: ['FR', 'EN', 'AUTRE', 'NON_DETECTE'],
    default: 'NON_DETECTE'
  }

}, 
{
  timestamps: true
});

// ============================================
// INDEX
// ============================================

// Index composé pour éviter les doublons
evaluationSchema.index({ trajetId: 1, evaluateurId: 1 }, { unique: true });

// Index pour les requêtes fréquentes
evaluationSchema.index({ evalueId: 1, dateEvaluation: -1 });
evaluationSchema.index({ estSignalement: 1, gravite: 1 });
evaluationSchema.index({ 'notes.noteGlobale': -1 });
evaluationSchema.index({ statutEvaluation: 1, evaluationObligatoire: 1 });
evaluationSchema.index({ visibilite: 1, 'notes.noteGlobale': -1 });
evaluationSchema.index({ createdAt: 1, statutEvaluation: 1 }); 
evaluationSchema.index({ 'priseEnCharge.localisationPriseEnCharge': '2dsphere' }, { sparse: true });
evaluationSchema.index({ 'priseEnCharge.confirmee': 1, trajetId: 1 });

// ============================================
// ✅ PRE-SAVE HOOK AMÉLIORÉ
// ============================================

evaluationSchema.pre('save', function(next) {
  // Calculer la note globale si les notes sont modifiées
  if (this.isModified('notes.ponctualite') || 
      this.isModified('notes.proprete') || 
      this.isModified('notes.qualiteConduite') || 
      this.isModified('notes.respect') || 
      this.isModified('notes.communication')) {
    
    const { ponctualite, proprete, qualiteConduite, respect, communication } = this.notes;
    
    // Vérifier que TOUTES les notes sont présentes et valides
    if (ponctualite >= 1 && proprete >= 1 && qualiteConduite >= 1 && respect >= 1 && communication >= 1) {
      const somme = ponctualite + proprete + qualiteConduite + respect + communication;
      const moyenne = somme / 5;
      
      // Arrondir à 1 décimale
      this.notes.noteGlobale = Math.round(moyenne * 10) / 10;

      // Marquer comme COMPLETEE si c'était EN_ATTENTE
      if (this.statutEvaluation === 'EN_ATTENTE') {
        this.statutEvaluation = 'COMPLETEE';
        this.dateCompletion = new Date();
        console.log(`✅ Évaluation automatiquement marquée COMPLETEE (note: ${this.notes.noteGlobale})`);
      }
      
      console.log(`📊 Note globale calculée: ${this.notes.noteGlobale} (${ponctualite}+${proprete}+${qualiteConduite}+${respect}+${communication})/5`);
    } else {
      // Si toutes les notes ne sont pas présentes
      if (this.statutEvaluation === 'EN_ATTENTE') {
        this.notes.noteGlobale = 0;
        console.log('ℹ️ Évaluation EN_ATTENTE : noteGlobale = 0');
      } else {
        console.warn('⚠️ Notes manquantes pour évaluation COMPLETEE');
      }
    }
  }
  
  next();
});

// Validation de la langue française
evaluationSchema.pre('save', function(next) {
  if (this.isModified('commentaire') && this.commentaire) {
    const validation = this.validerLangueFrancaise();
    
    if (!validation.valide) {
      console.warn(`⚠️ Commentaire potentiellement non français: ${validation.raison}`);
    } else {
      console.log(`✅ Commentaire en français validé`);
    }
  }
  next();
});

// Notifications post-save
evaluationSchema.post('save', async function(doc) {
  try {
    if (doc.statutEvaluation === 'COMPLETEE' && doc.isNew) {
      console.log(`📧 Notification à envoyer à ${doc.evalueId} pour nouvelle évaluation`);
    }
    
    if (doc.estSignalement && doc.gravite === 'GRAVE') {
      console.log(`🚨 ALERTE ADMIN: Signalement grave pour évaluation ${doc._id}`);
    }
  } catch (error) {
    console.error('Erreur notification:', error);
  }
});

// Middleware findOneAndUpdate
evaluationSchema.pre('findOneAndUpdate', function(next) {
  const update = this.getUpdate();
  
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

// ============================================
// MÉTHODES D'INSTANCE
// ============================================

evaluationSchema.methods.peutRepondre = function(userId) {
  return this.evalueId.toString() === userId.toString() && !this.reponseEvalue;
};

evaluationSchema.methods.estRecente = function(jours = 30) {
  const maintenant = new Date();
  const limite = new Date(maintenant.setDate(maintenant.getDate() - jours));
  return this.dateEvaluation >= limite;
};

evaluationSchema.methods.peutEvaluer = function(userId, typeUtilisateur) {
  if (this.evaluateurId.toString() !== userId.toString()) {
    return { 
      eligible: false, 
      raison: 'Vous n\'êtes pas autorisé à faire cette évaluation' 
    };
  }
  
  if (this.typeEvaluateur !== typeUtilisateur) {
    return { 
      eligible: false, 
      raison: 'Type d\'évaluateur incorrect' 
    };
  }
  
  if (this.statutEvaluation === 'COMPLETEE') {
    return { 
      eligible: false, 
      raison: 'Évaluation déjà complétée' 
    };
  }
  
  return { eligible: true };
};

// ✅ Calculer le délai restant (version unique, pas de doublon)
evaluationSchema.methods.calculerDelaiRestant = function(delaiMaxJours = 7) {
  const maintenant = new Date();
  const dateCreation = this.dateEvaluation || this.createdAt;
  const dateExpiration = new Date(dateCreation);
  dateExpiration.setDate(dateExpiration.getDate() + delaiMaxJours);
  
  const millisecondesRestantes = dateExpiration - maintenant;
  const joursRestants = Math.ceil(millisecondesRestantes / (1000 * 60 * 60 * 24));
  
  return {
    joursRestants: Math.max(0, joursRestants),
    heuresRestantes: Math.max(0, Math.ceil(millisecondesRestantes / (1000 * 60 * 60))),
    expire: joursRestants <= 0,
    dateExpiration
  };
};

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

evaluationSchema.methods.getLibelleNote = function(note) {
  if (!note || note === 0) return 'NON_NOTE';
  if (note >= 4.5) return 'EXCELLENT';
  if (note >= 4.0) return 'TRÈS BIEN';
  if (note >= 3.5) return 'BIEN';
  if (note >= 3.0) return 'ASSEZ BIEN';
  if (note >= 2.5) return 'MOYEN';
  if (note >= 2.0) return 'PASSABLE';
  if (note >= 1.5) return 'INSUFFISANT';
  return 'TRÈS INSUFFISANT';
};

evaluationSchema.methods.estPositive = function() {
  return this.notes.noteGlobale >= 4.0;
};

evaluationSchema.methods.estCritique = function() {
  return this.notes.noteGlobale <= 2.0;
};

evaluationSchema.methods.validerLangueFrancaise = function() {
  if (!this.commentaire) {
    return { valide: true, raison: 'Pas de commentaire' };
  }

  const detection = this.constructor.detecterLangue(this.commentaire);
  
  this.langueDetectee = detection.langue;
  this.langueValidee = detection.estFrancais;

  return {
    valide: detection.estFrancais,
    raison: detection.estFrancais ? 
      'Commentaire en français validé' : 
      `Langue détectée: ${detection.langue} (confiance: ${detection.confiance}%)`,
    detection
  };
};

// ============================================
// MÉTHODES STATIQUES
// ============================================

evaluationSchema.statics.calculerMoyenneUtilisateur = async function(userId) {
  const pipeline = [
    { $match: { evalueId: new mongoose.Types.ObjectId(userId), statutEvaluation: 'COMPLETEE' } },
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

evaluationSchema.statics.getStatistiquesUtilisateur = async function(userId) {
  const pipeline = [
    { $match: { evalueId: new mongoose.Types.ObjectId(userId), statutEvaluation: 'COMPLETEE' } },
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
  
  const moyennes = {
    ponctualite: repartition.reduce((sum, r) => sum + r.ponctualite, 0) / repartition.length,
    proprete: repartition.reduce((sum, r) => sum + r.proprete, 0) / repartition.length,
    qualiteConduite: repartition.reduce((sum, r) => sum + r.qualiteConduite, 0) / repartition.length,
    respect: repartition.reduce((sum, r) => sum + r.respect, 0) / repartition.length,
    communication: repartition.reduce((sum, r) => sum + r.communication, 0) / repartition.length
  };
  
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

evaluationSchema.statics.analyserTendance = function(evaluations) {
  if (evaluations.length < 3) return 'INSUFFISANT_DE_DONNEES';
  
  const triees = evaluations.sort((a, b) => new Date(b.dateEvaluation) - new Date(a.dateEvaluation));
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
  const evaluations = await this.find({ evalueId: userId, statutEvaluation: 'COMPLETEE' })
    .sort({ dateEvaluation: -1 })
    .limit(10);
  
  if (evaluations.length < 3) return { suspect: false };
  
  const notesRecentes = evaluations.slice(0, 5);
  const moyenneRecente = notesRecentes.reduce((sum, evaluation) => 
    sum + evaluation.notes.noteGlobale, 0) / notesRecentes.length;
  
  const signalements = evaluations.filter(evaluation => evaluation.estSignalement).length;
  
  return {
    suspect: moyenneRecente < 2.5 || signalements >= 2,
    moyenneRecente: Math.round(moyenneRecente * 10) / 10,
    nombreSignalements: signalements,
    recommandations: moyenneRecente < 2.5 ? 
      ['Formation conduite', 'Amélioration service client'] : []
  };
};

evaluationSchema.statics.getMeilleuresEvaluations = async function(limit = 10) {
  return await this.find({ 
    'notes.noteGlobale': { $gte: 4.5 },
    statutEvaluation: 'COMPLETEE',
    visibilite: 'PUBLIQUE'
  })
  .sort({ 'notes.noteGlobale': -1, dateEvaluation: -1 })
  .limit(limit)
  .populate('evalueId', 'nom prenom photoProfil')
  .populate('evaluateurId', 'nom prenom');
};

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
    statutEvaluation: 'COMPLETEE',
    dateEvaluation: { $gte: dateLimite }
  }).sort({ dateEvaluation: -1 });
};

evaluationSchema.statics.getEvaluationsEnAttente = async function(userId) {
  const evaluations = await this.find({
    evaluateurId: userId,
    statutEvaluation: 'EN_ATTENTE',
    evaluationObligatoire: true
  })
  .populate('trajetId', 'pointDepart pointArrivee dateDepart')
  .populate('evalueId', 'nom prenom photoProfil')
  .sort({ createdAt: -1 });
  
  return evaluations.map(evaluation => {
    const delaiRestant = evaluation.calculerDelaiRestant();
    return {
      ...evaluation.toObject(),
      delaiRestant
    };
  });
};

evaluationSchema.statics.marquerEvaluationsExpirees = async function(delaiMaxJours = 7) {
  const dateLimite = new Date();
  dateLimite.setDate(dateLimite.getDate() - delaiMaxJours);
  
  const result = await this.updateMany(
    {
      statutEvaluation: 'EN_ATTENTE',
      createdAt: { $lte: dateLimite }
    },
    {
      $set: { 
        statutEvaluation: 'EXPIREE'
      }
    }
  );
  
  console.log(`✅ ${result.modifiedCount} évaluations marquées comme expirées`);
  return result;
};

evaluationSchema.statics.getStatsForBadges = async function(userId) {
  const stats = await this.aggregate([
    { 
      $match: { 
        evalueId: new mongoose.Types.ObjectId(userId),
        statutEvaluation: 'COMPLETEE'
      } 
    },
    {
      $group: {
        _id: null,
        totalEvaluations: { $sum: 1 },
        evaluationsExcellentes: {
          $sum: { $cond: [{ $gte: ['$notes.noteGlobale', 4.5] }, 1, 0] }
        },
        evaluationsTresBien: {
          $sum: { $cond: [{ $gte: ['$notes.noteGlobale', 4.0] }, 1, 0] }
        },
        moyenneGlobale: { $avg: '$notes.noteGlobale' },
        nombreSignalements: {
          $sum: { $cond: ['$estSignalement', 1, 0] }
        }
      }
    }
  ]);
  
  if (!stats[0]) return null;
  
  const result = stats[0];
  const badges = [];
  
  if (result.totalEvaluations >= 10) badges.push('CONDUCTEUR_BRONZE');
  if (result.totalEvaluations >= 50) badges.push('CONDUCTEUR_ARGENT');
  if (result.totalEvaluations >= 100) badges.push('CONDUCTEUR_OR');
  
  if (result.moyenneGlobale >= 4.5) badges.push('EXCELLENCE');
  if (result.evaluationsExcellentes >= 20) badges.push('CHAMPION');
  
  if (result.nombreSignalements === 0 && result.totalEvaluations >= 10) {
    badges.push('ZERO_INCIDENT');
  }
  
  return {
    ...result,
    badgesSuggeres: badges
  };
};

evaluationSchema.statics.detecterConducteursProches = async function(trajetId, localisation, rayonMetres = 500) {
  const point = {
    type: 'Point',
    coordinates: Array.isArray(localisation) ? localisation : [localisation.longitude, localisation.latitude]
  };

  const il30MinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

  const conducteursProches = await this.find({
    trajetId: new mongoose.Types.ObjectId(trajetId),
    'priseEnCharge.confirmee': true,
    'priseEnCharge.datePriseEnCharge': { $gte: il30MinutesAgo },
    'priseEnCharge.localisationPriseEnCharge': {
      $near: {
        $geometry: point,
        $maxDistance: rayonMetres
      }
    }
  }).select('priseEnCharge evaluateurId evalueId');

  return {
    nombreConducteurs: conducteursProches.length,
    conducteurs: conducteursProches,
    alerteFraude: conducteursProches.length > 0
  };
};

evaluationSchema.statics.detecterLangue = function(texte) {
  if (!texte || texte.trim().length < 10) {
    return { langue: 'NON_DETECTE', confiance: 0, estFrancais: false };
  }

  const motsFrancais = [
    'merci', 'bien', 'très', 'bon', 'super', 'excellent', 'sympathique',
    'ponctuel', 'propre', 'conduite', 'respect', 'agréable', 'confortable',
    'voyage', 'trajet', 'chauffeur', 'conducteur', 'véhicule', 'voiture',
    'est', 'était', 'a', 'le', 'la', 'les', 'un', 'une', 'des', 'du',
    'pour', 'avec', 'sans', 'dans', 'sur', 'sous', 'mais', 'ou', 'et'
  ];

  const accents = /[àâäéèêëïîôùûüÿæœç]/i;
  const texteNormalise = texte.toLowerCase();
  let scoresFrancais = 0;

  motsFrancais.forEach(mot => {
    if (texteNormalise.includes(mot)) {
      scoresFrancais++;
    }
  });

  if (accents.test(texte)) {
    scoresFrancais += 3;
  }

  const motsAnglais = ['thank', 'good', 'very', 'nice', 'great', 'amazing', 'driver', 'car', 'trip'];
  let scoresAnglais = 0;

  motsAnglais.forEach(mot => {
    if (texteNormalise.includes(mot)) {
      scoresAnglais++;
    }
  });

  const totalMots = texte.split(/\s+/).length;
  const confiance = Math.min((scoresFrancais / totalMots) * 100, 100);

  let langue = 'AUTRE';
  if (scoresFrancais > scoresAnglais && confiance > 15) {
    langue = 'FR';
  } else if (scoresAnglais > scoresFrancais) {
    langue = 'EN';
  }

  return {
    langue,
    confiance: Math.round(confiance),
    estFrancais: langue === 'FR' && confiance > 15,
    details: {
      motsFrancaisDetectes: scoresFrancais,
      motsAnglaisDetectes: scoresAnglais,
      totalMots
    }
  };
};

module.exports = mongoose.model('Evaluation', evaluationSchema);