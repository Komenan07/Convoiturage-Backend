const mongoose = require('mongoose');
const crypto = require('crypto');

const rechargeAccountSchema = new mongoose.Schema({
  utilisateurId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Utilisateur',
    required: [true, 'L\'utilisateur est requis'],
    index: true
  },

  // Détails de la recharge
  montantRecharge: {
    type: Number,
    required: [true, 'Le montant de recharge est requis'],
    min: [100, 'Le montant minimum de recharge est de 100 FCFA'],
    validate: {
      validator: function(v) {
        return v > 0;
      },
      message: 'Le montant de recharge doit être positif'
    }
  },
  fraisRecharge: {
    type: Number,
    required: [true, 'Les frais de recharge sont requis'],
    min: [0, 'Les frais de recharge ne peuvent pas être négatifs'],
    default: 0
  },
  montantNet: {
    type: Number,
    required: [true, 'Le montant net est requis'],
    validate: {
      validator: function(v) {
        return v > 0 && v <= this.montantRecharge;
      },
      message: 'Le montant net doit être positif et inférieur ou égal au montant de recharge'
    }
  },

  // Méthode de paiement
  methodePaiement: {
    type: String,
    required: [true, 'La méthode de paiement est requise'],
    enum: {
      values: ['wave', 'orange_money', 'mtn_money', 'moov_money'],
      message: 'Méthode de paiement non valide'
    },
    index: true
  },
  referenceTransaction: {
    type: String,
    required: [true, 'La référence de transaction est requise'],
    unique: true,
    trim: true
  },
  referenceMobileMoney: {
    type: String,
    trim: true,
    sparse: true // Index partiel pour les valeurs non-nulles uniquement
  },

  // Statut
  statutRecharge: {
    type: String,
    required: [true, 'Le statut de recharge est requis'],
    enum: {
      values: ['en_attente', 'reussie', 'echec', 'remboursee'],
      message: 'Statut de recharge non valide'
    },
    default: 'en_attente',
    index: true
  },

  // Traitement
  dateInitiation: {
    type: Date,
    required: [true, 'La date d\'initiation est requise'],
    default: Date.now,
    index: true
  },
  dateTraitement: {
    type: Date,
    validate: {
      validator: function(v) {
        return !v || v >= this.dateInitiation;
      },
      message: 'La date de traitement ne peut pas être antérieure à la date d\'initiation'
    }
  },
  dateCredit: {
    type: Date,
    validate: {
      validator: function(v) {
        return !v || (this.dateTraitement && v >= this.dateTraitement);
      },
      message: 'La date de crédit ne peut pas être antérieure à la date de traitement'
    }
  },

  // Soldes
  soldeAvant: {
    type: Number,
    required: [true, 'Le solde avant recharge est requis'],
    min: [0, 'Le solde avant ne peut pas être négatif']
  },
  soldeApres: {
    type: Number,
    validate: {
      validator: function(v) {
        if (this.statutRecharge === 'reussie') {
          return v === this.soldeAvant + this.montantNet;
        }
        return v === this.soldeAvant;
      },
      message: 'Le solde après recharge est incohérent'
    }
  },

  // Détails de l'erreur (si échec)
  codeErreur: {
    type: String,
    trim: true,
    required: function() {
      return this.statutRecharge === 'echec';
    }
  },
  messageErreur: {
    type: String,
    trim: true,
    required: function() {
      return this.statutRecharge === 'echec';
    }
  },
  nombreTentatives: {
    type: Number,
    default: 1,
    min: [1, 'Le nombre de tentatives doit être au moins 1'],
    max: [5, 'Le nombre maximum de tentatives est 5']
  },

  // Type de recharge
  typeRecharge: {
    type: String,
    required: [true, 'Le type de recharge est requis'],
    enum: {
      values: ['manuelle', 'automatique'],
      message: 'Type de recharge non valide'
    },
    default: 'manuelle'
  },
  rechargeAutomatiqueId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RechargeAutomatique',
    required: function() {
      return this.typeRecharge === 'automatique';
    }
  },

  // Reçu
  numeroRecu: {
    type: String,
    unique: true,
    sparse: true,
    trim: true
  },
  urlRecu: {
    type: String,
    trim: true,
    validate: {
      validator: function(v) {
        if (!v) return true;
        return /^https?:\/\/.+/.test(v);
      },
      message: 'L\'URL du reçu doit être une URL valide'
    }
  }

}, {
  timestamps: true,
  versionKey: false
});

// Index composés pour optimiser les requêtes
rechargeAccountSchema.index({ utilisateurId: 1, dateInitiation: -1 });
rechargeAccountSchema.index({ statutRecharge: 1, dateInitiation: -1 });
rechargeAccountSchema.index({ methodePaiement: 1, statutRecharge: 1 });
rechargeAccountSchema.index({ referenceTransaction: 1 }, { unique: true });

// Middleware pre-save pour générer les références automatiquement
rechargeAccountSchema.pre('save', async function(next) {
  // Générer référence de transaction si pas fournie
  if (this.isNew && !this.referenceTransaction) {
    this.referenceTransaction = `RCH_${Date.now()}_${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  }

  // Générer numéro de reçu pour les recharges réussies
  if (this.isModified('statutRecharge') && this.statutRecharge === 'reussie' && !this.numeroRecu) {
    this.numeroRecu = `RCU_${Date.now()}_${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  }

  // Calculer montant net si pas fourni
  if (!this.montantNet && this.montantRecharge && typeof this.fraisRecharge === 'number') {
    this.montantNet = this.montantRecharge - this.fraisRecharge;
  }

  // Mettre à jour les dates automatiquement
  if (this.isModified('statutRecharge')) {
    const now = new Date();
    
    if (['reussie', 'echec', 'remboursee'].includes(this.statutRecharge) && !this.dateTraitement) {
      this.dateTraitement = now;
    }
    
    if (this.statutRecharge === 'reussie' && !this.dateCredit) {
      this.dateCredit = now;
    }
  }

  next();
});

// Méthodes d'instance
rechargeAccountSchema.methods.marquerReussie = function(soldeApres) {
  this.statutRecharge = 'reussie';
  this.soldeApres = soldeApres;
  this.dateTraitement = new Date();
  this.dateCredit = new Date();
  return this.save();
};

rechargeAccountSchema.methods.marquerEchec = function(codeErreur, messageErreur) {
  this.statutRecharge = 'echec';
  this.codeErreur = codeErreur;
  this.messageErreur = messageErreur;
  this.dateTraitement = new Date();
  this.soldeApres = this.soldeAvant;
  this.nombreTentatives += 1;
  return this.save();
};

rechargeAccountSchema.methods.marquerRembourse = function() {
  this.statutRecharge = 'remboursee';
  this.dateTraitement = new Date();
  this.soldeApres = this.soldeAvant;
  return this.save();
};

// Méthodes statiques
rechargeAccountSchema.statics.obtenirHistoriqueRecharges = function(utilisateurId, options = {}) {
  const { limit = 20, skip = 0, statutRecharge } = options;
  
  const query = { utilisateurId };
  if (statutRecharge) {
    query.statutRecharge = statutRecharge;
  }
  
  return this.find(query)
    .sort({ dateInitiation: -1 })
    .limit(limit)
    .skip(skip)
    .populate('utilisateurId', 'nom prenom telephone')
    .populate('rechargeAutomatiqueId');
};

rechargeAccountSchema.statics.obtenirStatistiquesRecharges = async function(utilisateurId, dateDebut, dateFin) {
  const match = {
    utilisateurId: new mongoose.Types.ObjectId(utilisateurId),
    dateInitiation: {
      $gte: dateDebut,
      $lte: dateFin
    }
  };

  const stats = await this.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$statutRecharge',
        nombre: { $sum: 1 },
        montantTotal: { $sum: '$montantRecharge' },
        montantNetTotal: { $sum: '$montantNet' },
        fraisTotaux: { $sum: '$fraisRecharge' }
      }
    }
  ]);

  return stats;
};

rechargeAccountSchema.statics.obtenirRechargesEnAttente = function() {
  return this.find({
    statutRecharge: 'en_attente',
    nombreTentatives: { $lt: 5 }
  }).sort({ dateInitiation: 1 });
};

// Virtual pour le montant formaté
rechargeAccountSchema.virtual('montantRechargeFormate').get(function() {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'XOF',
    minimumFractionDigits: 0
  }).format(this.montantRecharge);
});

// Virtual pour la durée de traitement
rechargeAccountSchema.virtual('dureeTraitement').get(function() {
  if (this.dateTraitement && this.dateInitiation) {
    return Math.round((this.dateTraitement - this.dateInitiation) / 1000); // en secondes
  }
  return null;
});

// Transformation JSON
rechargeAccountSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('RechargeAccount', rechargeAccountSchema);