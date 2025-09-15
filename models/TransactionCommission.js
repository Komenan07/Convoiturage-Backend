// models/TransactionCommission.js
const mongoose = require('mongoose');
const crypto = require('crypto');

// Schéma pour les détails du prélèvement
const DetailsPrelevementSchema = new mongoose.Schema({
  soldeAvantPrelevement: {
    type: Number,
    min: [0, 'Le solde avant prélèvement ne peut être négatif']
  },
  soldeApresPrelevement: {
    type: Number,
    min: [0, 'Le solde après prélèvement ne peut être négatif']
  },
  fraisSupplementaires: {
    type: Number,
    default: 0,
    min: [0, 'Les frais supplémentaires ne peuvent être négatifs']
  },
  tentativesPrelevement: {
    type: Number,
    default: 0,
    min: [0, 'Le nombre de tentatives ne peut être négatif'],
    max: [5, 'Maximum 5 tentatives autorisées']
  },
  derniereErreur: {
    type: String,
    maxlength: [500, 'L\'erreur ne peut dépasser 500 caractères']
  },
  codeErreur: String,
  operateurId: String // ID de l'opérateur mobile money si applicable
}, { _id: false });

// Schéma principal de la transaction commission
const transactionCommissionSchema = new mongoose.Schema({
  // ===== RÉFÉRENCES =====
  reservationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Reservation',
    required: [true, 'La réservation est requise'],
    index: true
  },
  paiementId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Paiement',
    required: [true, 'Le paiement est requis'],
    index: true
  },
  conducteurId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Utilisateur',
    required: [true, 'Le conducteur est requis'],
    index: true
  },

  // ===== CALCULS DE COMMISSION =====
  montantCourse: {
    type: Number,
    required: [true, 'Le montant de la course est requis'],
    min: [0, 'Le montant de la course doit être positif']
  },
  tauxCommission: {
    type: Number,
    required: [true, 'Le taux de commission est requis'],
    default: 0.10, // 10%
    min: [0, 'Le taux de commission ne peut être négatif'],
    max: [1, 'Le taux de commission ne peut dépasser 100%']
  },
  montantCommission: {
    type: Number,
    required: [true, 'Le montant de commission est requis'],
    min: [0, 'Le montant de commission doit être positif'],
    validate: {
      validator: function(montant) {
        // Vérifier que la commission correspond au calcul
        const commissionCalculee = Math.round(this.montantCourse * this.tauxCommission);
        return Math.abs(montant - commissionCalculee) <= 0.01; // Tolérance de 1 centime
      },
      message: 'Le montant de commission ne correspond pas au calcul (montant × taux)'
    }
  },
  montantNetConducteur: {
    type: Number,
    required: [true, 'Le montant net conducteur est requis'],
    min: [0, 'Le montant net conducteur doit être positif'],
    validate: {
      validator: function(montant) {
        // Vérifier que montant net = montant course - commission
        const montantCalcule = this.montantCourse - this.montantCommission;
        return Math.abs(montant - montantCalcule) <= 0.01; // Tolérance de 1 centime
      },
      message: 'Le montant net conducteur ne correspond pas au calcul'
    }
  },

  // ===== MODE DE PRÉLÈVEMENT =====
  modePrelevement: {
    type: String,
    enum: {
      values: ['compte_recharge', 'paiement_mobile'],
      message: 'Mode de prélèvement invalide'
    },
    required: [true, 'Le mode de prélèvement est requis']
  },
  methodePaiementOriginal: {
    type: String,
    enum: {
      values: ['ESPECES', 'WAVE', 'ORANGE_MONEY', 'MTN_MONEY', 'MOOV_MONEY', 'COMPTE_RECHARGE'],
      message: 'Méthode de paiement invalide'
    },
    required: [true, 'La méthode de paiement originale est requise']
  },

  // ===== TRAITEMENT =====
  statutCommission: {
    type: String,
    enum: {
      values: ['calculee', 'prelevee', 'en_attente', 'echec', 'remboursee'],
      message: 'Statut de commission invalide'
    },
    default: 'calculee',
    index: true
  },
  dateCalcul: {
    type: Date,
    default: Date.now,
    required: [true, 'La date de calcul est requise']
  },
  datePrelevement: {
    type: Date,
    validate: {
      validator: function(date) {
        return !date || date >= this.dateCalcul;
      },
      message: 'La date de prélèvement doit être postérieure à la date de calcul'
    }
  },
  dateVersementConducteur: {
    type: Date,
    validate: {
      validator: function(date) {
        return !date || (this.datePrelevement && date >= this.datePrelevement) || date >= this.dateCalcul;
      },
      message: 'La date de versement doit être postérieure au prélèvement'
    }
  },

  // ===== RÉFÉRENCES UNIQUES =====
  referenceCommission: {
    type: String,
    unique: true,
    default: function() {
      return `COM_${Date.now()}_${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    },
    index: true
  },
  referenceVersement: {
    type: String,
    sparse: true,
    index: true
  },

  // ===== DÉTAILS DU PRÉLÈVEMENT =====
  detailsPrelevement: {
    type: DetailsPrelevementSchema,
    default: () => ({})
  },

  // ===== RÉCONCILIATION COMPTABLE =====
  reconcilie: {
    type: Boolean,
    default: false,
    index: true
  },
  dateReconciliation: {
    type: Date,
    validate: {
      validator: function(date) {
        return !date || this.reconcilie;
      },
      message: 'La date de réconciliation ne peut être définie que si la transaction est réconciliée'
    }
  },
  numeroLot: {
    type: String,
    index: true,
    maxlength: [50, 'Le numéro de lot ne peut dépasser 50 caractères']
  },

  // ===== MÉTADONNÉES =====
  metadata: {
    operateurMobileMoney: String,
    fraisMobileMoney: {
      type: Number,
      default: 0,
      min: [0, 'Les frais mobile money ne peuvent être négatifs']
    },
    taux_change: Number, // Si conversion de devise
    devise_originale: {
      type: String,
      default: 'XOF'
    }
  },

  // ===== LOGS ET SUIVI =====
  logs: [{
    date: {
      type: Date,
      default: Date.now
    },
    action: {
      type: String,
      required: true,
      enum: ['CALCUL', 'PRELEVEMENT', 'VERSEMENT', 'ECHEC', 'REMBOURSEMENT', 'RECONCILIATION']
    },
    details: mongoose.Schema.Types.Mixed,
    utilisateurId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Utilisateur'
    }
  }],

  erreurs: [{
    date: {
      type: Date,
      default: Date.now
    },
    code: String,
    message: String,
    contexte: Object
  }]

}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// ===== INDEX COMPOSÉS =====
transactionCommissionSchema.index({ conducteurId: 1, dateCalcul: -1 });
transactionCommissionSchema.index({ statutCommission: 1, dateCalcul: -1 });
transactionCommissionSchema.index({ modePrelevement: 1, statutCommission: 1 });
transactionCommissionSchema.index({ reconcilie: 1, numeroLot: 1 });
transactionCommissionSchema.index({ reservationId: 1, paiementId: 1 }, { unique: true });

// ===== PROPRIÉTÉS VIRTUELLES =====
transactionCommissionSchema.virtual('estPrelevee').get(function() {
  return this.statutCommission === 'prelevee';
});

transactionCommissionSchema.virtual('estEnEchec').get(function() {
  return this.statutCommission === 'echec';
});

transactionCommissionSchema.virtual('estReconciliee').get(function() {
  return this.reconcilie;
});

transactionCommissionSchema.virtual('pourcentageCommission').get(function() {
  return this.tauxCommission * 100;
});

transactionCommissionSchema.virtual('dureeTraitement').get(function() {
  if (!this.datePrelevement) return null;
  return this.datePrelevement - this.dateCalcul;
});

transactionCommissionSchema.virtual('beneficeNet').get(function() {
  return this.montantCommission - (this.detailsPrelevement.fraisSupplementaires || 0);
});

// ===== MIDDLEWARE PRE-SAVE =====
transactionCommissionSchema.pre('save', function(next) {
  try {
    // 1. Générer référence de versement si nécessaire
    if (this.statutCommission === 'prelevee' && !this.referenceVersement) {
      this.referenceVersement = `VER_${Date.now()}_${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    }

    // 2. Mettre à jour les dates selon le statut
    const maintenant = new Date();
    if (this.isModified('statutCommission')) {
      switch (this.statutCommission) {
        case 'prelevee':
          if (!this.datePrelevement) {
            this.datePrelevement = maintenant;
          }
          break;
        case 'echec':
          this.detailsPrelevement.tentativesPrelevement = (this.detailsPrelevement.tentativesPrelevement || 0) + 1;
          break;
      }
    }

    // 3. Validation de cohérence des montants
    const tolerance = 0.01;
    const commissionCalculee = Math.round(this.montantCourse * this.tauxCommission * 100) / 100;
    if (Math.abs(this.montantCommission - commissionCalculee) > tolerance) {
      return next(new Error('Incohérence dans le calcul de la commission'));
    }

    next();
  } catch (error) {
    next(error);
  }
});

// ===== MIDDLEWARE POST-SAVE =====
transactionCommissionSchema.post('save', async function(doc) {
  try {
    // Mettre à jour les statistiques du conducteur si commission prélevée
    if (doc.isModified('statutCommission') && doc.statutCommission === 'prelevee') {
      const Utilisateur = mongoose.model('Utilisateur');
      await Utilisateur.findByIdAndUpdate(
        doc.conducteurId,
        {
          $inc: { 'compteCovoiturage.totalCommissionsPayees': doc.montantCommission }
        }
      );
    }
  } catch (error) {
    console.error('Erreur post-save transaction commission:', error);
  }
});

// ===== MÉTHODES D'INSTANCE =====

// Marquer comme prélevée
transactionCommissionSchema.methods.marquerCommePrelevee = function(detailsPrelevement = {}) {
  this.statutCommission = 'prelevee';
  this.datePrelevement = new Date();
  
  if (detailsPrelevement.soldeAvant !== undefined) {
    this.detailsPrelevement.soldeAvantPrelevement = detailsPrelevement.soldeAvant;
    this.detailsPrelevement.soldeApresPrelevement = detailsPrelevement.soldeApres;
  }
  
  this.ajouterLog('PRELEVEMENT', {
    montant: this.montantCommission,
    mode: this.modePrelevement,
    details: detailsPrelevement
  });
  
  return this.save();
};

// Marquer comme échouée
transactionCommissionSchema.methods.marquerCommeEchec = function(erreur, codeErreur = null) {
  this.statutCommission = 'echec';
  this.detailsPrelevement.derniereErreur = erreur;
  if (codeErreur) {
    this.detailsPrelevement.codeErreur = codeErreur;
  }
  
  this.ajouterErreur(codeErreur || 'PRELEVEMENT_ECHEC', erreur);
  this.ajouterLog('ECHEC', { erreur, tentative: this.detailsPrelevement.tentativesPrelevement });
  
  return this.save();
};

// Marquer comme remboursée
transactionCommissionSchema.methods.rembourser = function(raisonRemboursement) {
  this.statutCommission = 'remboursee';
  
  this.ajouterLog('REMBOURSEMENT', {
    montant: this.montantCommission,
    raison: raisonRemboursement
  });
  
  return this.save();
};

// Réconcilier la transaction
transactionCommissionSchema.methods.reconcilier = function(numeroLot, utilisateurId) {
  this.reconcilie = true;
  this.dateReconciliation = new Date();
  this.numeroLot = numeroLot;
  
  this.ajouterLog('RECONCILIATION', {
    numeroLot,
    reconciliePar: utilisateurId
  }, utilisateurId);
  
  return this.save();
};

// Calculer les frais totaux
transactionCommissionSchema.methods.calculerFraisTotaux = function() {
  return (this.detailsPrelevement.fraisSupplementaires || 0) + 
         (this.metadata.fraisMobileMoney || 0);
};

// Vérifier si peut être remboursée
transactionCommissionSchema.methods.peutEtreRemboursee = function() {
  return ['prelevee'].includes(this.statutCommission) && 
         !this.reconcilie;
};

// Ajouter un log
transactionCommissionSchema.methods.ajouterLog = function(action, details = {}, utilisateurId = null) {
  this.logs.push({
    date: new Date(),
    action,
    details,
    utilisateurId
  });
  
  // Limiter à 20 logs max
  if (this.logs.length > 20) {
    this.logs = this.logs.slice(-20);
  }
};

// Ajouter une erreur
transactionCommissionSchema.methods.ajouterErreur = function(code, message, contexte = {}) {
  this.erreurs.push({
    date: new Date(),
    code,
    message,
    contexte
  });
  
  // Limiter à 10 erreurs max
  if (this.erreurs.length > 10) {
    this.erreurs = this.erreurs.slice(-10);
  }
};

// Obtenir le résumé de la transaction
transactionCommissionSchema.methods.obtenirResume = function() {
  return {
    id: this._id,
    referenceCommission: this.referenceCommission,
    conducteurId: this.conducteurId,
    montantCourse: this.montantCourse,
    montantCommission: this.montantCommission,
    montantNetConducteur: this.montantNetConducteur,
    tauxCommission: this.tauxCommission,
    modePrelevement: this.modePrelevement,
    statutCommission: this.statutCommission,
    dateCalcul: this.dateCalcul,
    datePrelevement: this.datePrelevement,
    reconcilie: this.reconcilie,
    beneficeNet: this.beneficeNet
  };
};

// ===== MÉTHODES STATIQUES =====

// Calculer et créer une transaction commission
transactionCommissionSchema.statics.calculerCommission = async function(reservationId, paiementId, conducteurId, montantCourse, tauxCommission = 0.10) {
  const montantCommission = Math.round(montantCourse * tauxCommission);
  const montantNetConducteur = montantCourse - montantCommission;
  
  // Déterminer le mode de prélèvement
  const Reservation = mongoose.model('Reservation');
  const reservation = await Reservation.findById(reservationId);
  
  let modePrelevement = 'paiement_mobile';
  if (reservation.methodePaiement === 'COMPTE_RECHARGE') {
    modePrelevement = 'compte_recharge';
  }
  
  const transaction = new this({
    reservationId,
    paiementId,
    conducteurId,
    montantCourse,
    tauxCommission,
    montantCommission,
    montantNetConducteur,
    modePrelevement,
    methodePaiementOriginal: reservation.methodePaiement
  });
  
  transaction.ajouterLog('CALCUL', {
    montantCourse,
    tauxCommission,
    montantCommission,
    modePrelevement
  });
  
  return transaction.save();
};

// Obtenir les commissions en attente de prélèvement
transactionCommissionSchema.statics.obtenirCommissionsEnAttente = function() {
  return this.find({
    statutCommission: 'en_attente',
    modePrelevement: 'compte_recharge'
  })
  .populate('conducteurId', 'nom prenom email compteCovoiturage')
  .populate('reservationId')
  .sort({ dateCalcul: 1 });
};

// Statistiques des commissions
transactionCommissionSchema.statics.statistiquesCommissions = async function(dateDebut, dateFin) {
  return this.aggregate([
    {
      $match: {
        dateCalcul: { $gte: dateDebut, $lte: dateFin },
        statutCommission: 'prelevee'
      }
    },
    {
      $group: {
        _id: null,
        totalCommissions: { $sum: '$montantCommission' },
        nombreTransactions: { $sum: 1 },
        commissionMoyenne: { $avg: '$montantCommission' },
        totalFrais: { $sum: '$detailsPrelevement.fraisSupplementaires' },
        repartitionModes: {
          $push: '$modePrelevement'
        }
      }
    }
  ]);
};

// Commissions par conducteur
transactionCommissionSchema.statics.commissionsParConducteur = async function(dateDebut, dateFin, limit = 50) {
  return this.aggregate([
    {
      $match: {
        dateCalcul: { $gte: dateDebut, $lte: dateFin },
        statutCommission: 'prelevee'
      }
    },
    {
      $group: {
        _id: '$conducteurId',
        totalCommissions: { $sum: '$montantCommission' },
        nombreTransactions: { $sum: 1 },
        moyenneCommission: { $avg: '$montantCommission' },
        dernierPrelevement: { $max: '$datePrelevement' }
      }
    },
    {
      $lookup: {
        from: 'utilisateurs',
        localField: '_id',
        foreignField: '_id',
        as: 'conducteur'
      }
    },
    {
      $unwind: '$conducteur'
    },
    {
      $project: {
        nom: '$conducteur.nom',
        prenom: '$conducteur.prenom',
        email: '$conducteur.email',
        totalCommissions: 1,
        nombreTransactions: 1,
        moyenneCommission: { $round: ['$moyenneCommission', 2] },
        dernierPrelevement: 1
      }
    },
    {
      $sort: { totalCommissions: -1 }
    },
    {
      $limit: limit
    }
  ]);
};

// Commissions en échec
transactionCommissionSchema.statics.commissionsEnEchec = function() {
  return this.find({
    statutCommission: 'echec',
    'detailsPrelevement.tentativesPrelevement': { $lt: 5 }
  })
  .populate('conducteurId', 'nom prenom email telephone')
  .populate('reservationId')
  .sort({ dateCalcul: -1 });
};

// Générer lot de réconciliation
transactionCommissionSchema.statics.genererLotReconciliation = async function(dateDebut, dateFin, utilisateurId) {
  const numeroLot = `LOT_${Date.now()}_${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
     
  const result = await this.updateMany(
    {
      statutCommission: 'prelevee',
      reconcilie: false,
      datePrelevement: { $gte: dateDebut, $lte: dateFin }
    },
    {
      $set: {
        reconcilie: true,
        dateReconciliation: new Date(),
        numeroLot,
        utilisateurReconciliation: utilisateurId // Ajouter qui a fait la réconciliation
      }
    }
  );
     
  return {
    numeroLot,
    nombreTransactions: result.modifiedCount,
    utilisateurId // Retourner l'ID de l'utilisateur dans la réponse
  };
};

// Obtenir transactions non réconciliées
transactionCommissionSchema.statics.obtenirNonReconciliees = function() {
  return this.find({
    statutCommission: 'prelevee',
    reconcilie: false
  })
  .populate('conducteurId', 'nom prenom')
  .sort({ datePrelevement: -1 });
};

module.exports = mongoose.model('TransactionCommission', transactionCommissionSchema);