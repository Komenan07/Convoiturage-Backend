const mongoose = require('mongoose');
const crypto = require('crypto');

const accountMouvementSchema = new mongoose.Schema({
  utilisateurId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Utilisateur',
    required: [true, 'L\'utilisateur est requis'],
    index: true
  },

  // Détails du mouvement
  typeMouvement: {
    type: String,
    required: [true, 'Le type de mouvement est requis'],
    enum: {
      values: ['credit', 'debit'],
      message: 'Le type de mouvement doit être "credit" ou "debit"'
    },
    index: true
  },
  categorie: {
    type: String,
    required: [true, 'La catégorie est requise'],
    enum: {
      values: ['recharge', 'commission', 'gain_course', 'remboursement', 'frais'],
      message: 'Catégorie non valide'
    },
    index: true
  },
  montant: {
    type: Number,
    required: [true, 'Le montant est requis'],
    validate: {
      validator: function(v) {
        return v > 0;
      },
      message: 'Le montant doit être positif'
    }
  },
  description: {
    type: String,
    required: [true, 'La description est requise'],
    trim: true,
    maxlength: [500, 'La description ne peut pas dépasser 500 caractères']
  },

  // Références
  referenceOrigine: {
    type: mongoose.Schema.Types.ObjectId,
    required: [true, 'La référence d\'origine est requise'],
    index: true
  },
  typeOrigine: {
    type: String,
    required: [true, 'Le type d\'origine est requis'],
    enum: {
      values: ['recharge', 'commission', 'paiement'],
      message: 'Type d\'origine non valide'
    }
  },

  // Soldes
  soldeAvant: {
    type: Number,
    required: [true, 'Le solde avant est requis'],
    min: [0, 'Le solde avant ne peut pas être négatif']
  },
  soldeApres: {
    type: Number,
    required: [true, 'Le solde après est requis'],
    min: [0, 'Le solde après ne peut pas être négatif'],
    validate: {
      validator: function(v) {
        // Vérifier la cohérence du solde selon le type de mouvement
        if (this.typeMouvement === 'credit') {
          return v === this.soldeAvant + this.montant;
        } else if (this.typeMouvement === 'debit') {
          return v === this.soldeAvant - this.montant;
        }
        return false;
      },
      message: 'Le solde après mouvement est incohérent avec le type de mouvement'
    }
  },

  // Métadonnées
  dateEffet: {
    type: Date,
    required: [true, 'La date d\'effet est requise'],
    default: Date.now,
    index: true
  },
  estAnnule: {
    type: Boolean,
    default: false,
    index: true
  },
  dateAnnulation: {
    type: Date,
    validate: {
      validator: function(v) {
        return !v || this.estAnnule;
      },
      message: 'La date d\'annulation ne peut être définie que si le mouvement est annulé'
    }
  },
  motifAnnulation: {
    type: String,
    trim: true,
    maxlength: [200, 'Le motif d\'annulation ne peut pas dépasser 200 caractères'],
    required: function() {
      return this.estAnnule;
    }
  },

  // Réconciliation
  estReconcilie: {
    type: Boolean,
    default: false,
    index: true
  },
  dateReconciliation: {
    type: Date,
    validate: {
      validator: function(v) {
        return !v || this.estReconcilie;
      },
      message: 'La date de réconciliation ne peut être définie que si le mouvement est réconcilié'
    }
  },
  numeroLot: {
    type: String,
    trim: true,
    sparse: true, // Index partiel pour les valeurs non-nulles uniquement
    validate: {
      validator: function(v) {
        return !v || this.estReconcilie;
      },
      message: 'Le numéro de lot ne peut être défini que si le mouvement est réconcilié'
    }
  }

}, {
  timestamps: true,
  versionKey: false
});

// Index composés pour optimiser les requêtes
accountMouvementSchema.index({ utilisateurId: 1, dateEffet: -1 });
accountMouvementSchema.index({ typeMouvement: 1, categorie: 1 });
accountMouvementSchema.index({ estAnnule: 1, dateEffet: -1 });
accountMouvementSchema.index({ estReconcilie: 1, dateReconciliation: -1 });
accountMouvementSchema.index({ referenceOrigine: 1, typeOrigine: 1 });
accountMouvementSchema.index({ numeroLot: 1 }, { sparse: true });

// Middleware pre-save pour validations supplémentaires
accountMouvementSchema.pre('save', function(next) {
  // Empêcher la modification si déjà annulé
  if (this.estAnnule && this.isModified() && !this.isModified('motifAnnulation') && !this.isModified('dateAnnulation')) {
    return next(new Error('Un mouvement annulé ne peut pas être modifié'));
  }

  // Empêcher la modification si déjà réconcilié
  if (this.estReconcilie && this.isModified() && !this.isModified('estReconcilie') && !this.isModified('dateReconciliation') && !this.isModified('numeroLot')) {
    return next(new Error('Un mouvement réconcilié ne peut pas être modifié'));
  }

  // Définir automatiquement la date d'annulation
  if (this.isModified('estAnnule') && this.estAnnule && !this.dateAnnulation) {
    this.dateAnnulation = new Date();
  }

  // Définir automatiquement la date de réconciliation
  if (this.isModified('estReconcilie') && this.estReconcilie && !this.dateReconciliation) {
    this.dateReconciliation = new Date();
  }

  next();
});

// Méthodes d'instance
accountMouvementSchema.methods.annuler = function(motif) {
  if (this.estAnnule) {
    throw new Error('Ce mouvement est déjà annulé');
  }
  if (this.estReconcilie) {
    throw new Error('Un mouvement réconcilié ne peut pas être annulé');
  }

  this.estAnnule = true;
  this.motifAnnulation = motif;
  this.dateAnnulation = new Date();
  return this.save();
};

accountMouvementSchema.methods.reconcilier = function(numeroLot) {
  if (this.estAnnule) {
    throw new Error('Un mouvement annulé ne peut pas être réconcilié');
  }
  if (this.estReconcilie) {
    throw new Error('Ce mouvement est déjà réconcilié');
  }

  this.estReconcilie = true;
  this.numeroLot = numeroLot;
  this.dateReconciliation = new Date();
  return this.save();
};

// Méthodes statiques
accountMouvementSchema.statics.creerMouvement = async function(donnees) {
  const {
    utilisateurId,
    typeMouvement,
    categorie,
    montant,
    description,
    referenceOrigine,
    typeOrigine,
    soldeAvant
  } = donnees;

  // Calculer le solde après
  let soldeApres;
  if (typeMouvement === 'credit') {
    soldeApres = soldeAvant + montant;
  } else {
    soldeApres = soldeAvant - montant;
    if (soldeApres < 0) {
      throw new Error('Solde insuffisant pour effectuer ce débit');
    }
  }

  return this.create({
    utilisateurId,
    typeMouvement,
    categorie,
    montant,
    description,
    referenceOrigine,
    typeOrigine,
    soldeAvant,
    soldeApres
  });
};

accountMouvementSchema.statics.obtenirHistoriqueMouvements = function(utilisateurId, options = {}) {
  const {
    limit = 20,
    skip = 0,
    typeMouvement,
    categorie,
    dateDebut,
    dateFin,
    estAnnule = false
  } = options;

  const query = {
    utilisateurId,
    estAnnule
  };

  if (typeMouvement) query.typeMouvement = typeMouvement;
  if (categorie) query.categorie = categorie;

  if (dateDebut || dateFin) {
    query.dateEffet = {};
    if (dateDebut) query.dateEffet.$gte = dateDebut;
    if (dateFin) query.dateEffet.$lte = dateFin;
  }

  return this.find(query)
    .sort({ dateEffet: -1 })
    .limit(limit)
    .skip(skip)
    .populate('utilisateurId', 'nom prenom telephone');
};

accountMouvementSchema.statics.calculerSoldeCompte = async function(utilisateurId, dateReference = new Date()) {
  const pipeline = [
    {
      $match: {
        utilisateurId: new mongoose.Types.ObjectId(utilisateurId),
        dateEffet: { $lte: dateReference },
        estAnnule: false
      }
    },
    {
      $group: {
        _id: '$typeMouvement',
        total: { $sum: '$montant' }
      }
    }
  ];

  const result = await this.aggregate(pipeline);
  
  let credits = 0;
  let debits = 0;

  result.forEach(item => {
    if (item._id === 'credit') {
      credits = item.total;
    } else if (item._id === 'debit') {
      debits = item.total;
    }
  });

  return credits - debits;
};

accountMouvementSchema.statics.obtenirStatistiquesMouvements = async function(utilisateurId, dateDebut, dateFin) {
  const match = {
    utilisateurId: new mongoose.Types.ObjectId(utilisateurId),
    estAnnule: false,
    dateEffet: {
      $gte: dateDebut,
      $lte: dateFin
    }
  };

  const stats = await this.aggregate([
    { $match: match },
    {
      $group: {
        _id: {
          typeMouvement: '$typeMouvement',
          categorie: '$categorie'
        },
        nombre: { $sum: 1 },
        montantTotal: { $sum: '$montant' }
      }
    },
    {
      $group: {
        _id: '$_id.typeMouvement',
        categories: {
          $push: {
            categorie: '$_id.categorie',
            nombre: '$nombre',
            montantTotal: '$montantTotal'
          }
        },
        nombreTotal: { $sum: '$nombre' },
        montantTotal: { $sum: '$montantTotal' }
      }
    }
  ]);

  return stats;
};

accountMouvementSchema.statics.genererLotReconciliation = async function(dateDebut, dateFin, _utilisateurId) {
  const numeroLot = `LOT_MVT_${Date.now()}_${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  
  const result = await this.updateMany(
    {
      estReconcilie: false,
      estAnnule: false,
      dateEffet: { $gte: dateDebut, $lte: dateFin }
    },
    {
      $set: {
        estReconcilie: true,
        dateReconciliation: new Date(),
        numeroLot
      }
    }
  );

  return {
    numeroLot,
    nombreMouvements: result.modifiedCount
  };
};

accountMouvementSchema.statics.obtenirMouvementsNonReconcilies = function(dateDebut, dateFin) {
  const query = {
    estReconcilie: false,
    estAnnule: false
  };

  if (dateDebut || dateFin) {
    query.dateEffet = {};
    if (dateDebut) query.dateEffet.$gte = dateDebut;
    if (dateFin) query.dateEffet.$lte = dateFin;
  }

  return this.find(query)
    .sort({ dateEffet: 1 })
    .populate('utilisateurId', 'nom prenom telephone');
};

// Virtual pour le montant formaté
accountMouvementSchema.virtual('montantFormate').get(function() {
  const signe = this.typeMouvement === 'debit' ? '-' : '+';
  const montantFormat = new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'XOF',
    minimumFractionDigits: 0
  }).format(this.montant);
  
  return `${signe}${montantFormat}`;
});

// Virtual pour le statut du mouvement
accountMouvementSchema.virtual('statutMouvement').get(function() {
  if (this.estAnnule) return 'annule';
  if (this.estReconcilie) return 'reconcilie';
  return 'actif';
});

// Virtual pour la description complète
accountMouvementSchema.virtual('descriptionComplete').get(function() {
  let base = this.description;
  if (this.estAnnule) {
    base += ` (ANNULÉ: ${this.motifAnnulation})`;
  }
  return base;
});

// Transformation JSON
accountMouvementSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('AccountMouvement', accountMouvementSchema);