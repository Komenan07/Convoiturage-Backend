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
      // Obligatoire si l'évaluateur est un passager
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
  }
}, 
{
  timestamps: true
});

// Index composé pour éviter les doublons
evaluationSchema.index({ trajetId: 1, evaluateurId: 1 }, { unique: true });

// Index pour les requêtes fréquentes
evaluationSchema.index({ evalueId: 1, dateEvaluation: -1 });
evaluationSchema.index({ estSignalement: 1, gravite: 1 });
evaluationSchema.index({ 'notes.noteGlobale': -1 });

evaluationSchema.index({ statutEvaluation: 1, evaluationObligatoire: 1 });
evaluationSchema.index({ visibilite: 1, 'notes.noteGlobale': -1 });
evaluationSchema.index({ createdAt: 1, statutEvaluation: 1 }); 

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

      // Marquer comme complétée si toutes les notes sont présentes
      if (this.statutEvaluation === 'EN_ATTENTE') {
        this.statutEvaluation = 'COMPLETEE';
      }
      
      console.log(`📊 Note globale calculée: ${this.notes.noteGlobale} (${ponctualite}+${proprete}+${qualiteConduite}+${respect}+${communication})/5`);
    } else {
      console.warn('⚠️ Impossible de calculer la note globale: notes manquantes');
    }
  }
  next();
});

// Middleware post-save pour notifications
evaluationSchema.post('save', async function(doc) {
  try {
    // Si c'est une nouvelle évaluation complétée
    if (doc.statutEvaluation === 'COMPLETEE' && doc.isNew) {
      console.log(`📧 Notification à envoyer à l'utilisateur ${doc.evalueId} pour nouvelle évaluation`);
      
      // TODO: Intégrer avec le service de notifications
      // const NotificationService = require('../services/notificationService');
      // await NotificationService.envoyerNouvelleEvaluation(doc.evalueId, doc);
    }
    
    // Si c'est un signalement grave
    if (doc.estSignalement && doc.gravite === 'GRAVE') {
      console.log(`🚨 ALERTE ADMIN: Signalement grave détecté pour l'évaluation ${doc._id}`);
      
      // TODO: Alerte admin
      // await NotificationService.alerteAdmin(doc);
    }
  } catch (error) {
    console.error('Erreur lors de l\'envoi de notification:', error);
  }
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

//  Vérifier si l'utilisateur peut évaluer
evaluationSchema.methods.peutEvaluer = function(userId, typeUtilisateur) {
  // Vérifier si l'utilisateur est bien l'évaluateur
  if (this.evaluateurId.toString() !== userId.toString()) {
    return { 
      eligible: false, 
      raison: 'Vous n\'êtes pas autorisé à faire cette évaluation' 
    };
  }
  
  // Vérifier si le type correspond
  if (this.typeEvaluateur !== typeUtilisateur) {
    return { 
      eligible: false, 
      raison: 'Type d\'évaluateur incorrect' 
    };
  }
  
  // Vérifier si l'évaluation n'est pas déjà faite
  if (this.statutEvaluation === 'COMPLETEE') {
    return { 
      eligible: false, 
      raison: 'Évaluation déjà complétée' 
    };
  }
  
  return { eligible: true };
};

// Calculer le délai d'évaluation restant
evaluationSchema.methods.calculerDelaiRestant = function(delaiMaxJours = 7) {
  const maintenant = new Date();
  const dateFinTrajet = this.createdAt; // ou dateFinTrajet si disponible
  const dateExpiration = new Date(dateFinTrajet);
  dateExpiration.setDate(dateExpiration.getDate() + delaiMaxJours);
  
  const joursRestants = Math.ceil((dateExpiration - maintenant) / (1000 * 60 * 60 * 24));
  
  return {
    joursRestants: Math.max(0, joursRestants),
    expire: joursRestants <= 0,
    dateExpiration
  };
};

// Calculer le délai d'évaluation restant
evaluationSchema.methods.calculerDelaiRestant = function(delaiMaxJours = 7) {
  const maintenant = new Date();
  const dateFinTrajet = this.createdAt; // ou dateFinTrajet si disponible
  const dateExpiration = new Date(dateFinTrajet);
  dateExpiration.setDate(dateExpiration.getDate() + delaiMaxJours);
  
  const joursRestants = Math.ceil((dateExpiration - maintenant) / (1000 * 60 * 60 * 24));
  
  return {
    joursRestants: Math.max(0, joursRestants),
    expire: joursRestants <= 0,
    dateExpiration
  };
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

// Obtenir les évaluations en attente
evaluationSchema.statics.getEvaluationsEnAttente = async function(userId) {
  const evaluations = await this.find({
    evaluateurId: userId,
    statutEvaluation: 'EN_ATTENTE',
    evaluationObligatoire: true
  })
  .populate('trajetId', 'depart arrivee dateDepart')
  .populate('evalueId', 'nom prenom photoProfil')
  .sort({ createdAt: -1 });
  
  // Calculer le délai restant pour chaque évaluation
  return evaluations.map(evaluation => ({
    ...evaluation.toObject(),
    delaiRestant: evaluation.calculerDelaiRestant()
  }));
};

//  Marquer les évaluations expirées
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

// Obtenir statistiques pour badges
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
  
  // Calculer les badges potentiels
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

module.exports = mongoose.model('Evaluation', evaluationSchema);