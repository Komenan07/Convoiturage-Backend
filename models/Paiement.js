// =====================================================
// 1. MODEL - PAIEMENT SCHEMA
// =====================================================

const mongoose = require('mongoose');
const crypto = require('crypto');

// Schéma principal de l'entité Paiement
const paiementSchema = new mongoose.Schema({
  // ===== RÉFÉRENCES =====
  reservationId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Reservation', 
    required: true,
    index: true
  },
  payeurId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Utilisateur', 
    required: true,
    index: true
  },
  beneficiaireId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Utilisateur', 
    required: true 
  },

  // ===== MONTANTS =====
  montantTotal: { 
    type: Number, 
    required: true, 
    min: [0, 'Le montant total doit être positif'],
    validate: {
      validator: function(v) {
        return v > 0;
      },
      message: 'Le montant total doit être supérieur à 0'
    }
  },
  montantConducteur: { 
    type: Number, 
    required: true, 
    min: [0, 'Le montant conducteur doit être positif']
  },
  commissionPlateforme: { 
    type: Number, 
    required: true, 
    min: [0, 'La commission doit être positive']
  },
  fraisTransaction: { 
    type: Number, 
    default: 0, 
    min: [0, 'Les frais de transaction doivent être positifs']
  },

  // ===== MÉTHODE DE PAIEMENT =====
  methodePaiement: {
    type: String,
    enum: {
      values: ['ESPECES', 'WAVE', 'ORANGE_MONEY', 'MTN_MONEY', 'MOOV_MONEY'],
      message: 'Méthode de paiement non supportée'
    },
    required: [true, 'La méthode de paiement est requise']
  },

  // ===== DÉTAILS TRANSACTION =====
  referenceTransaction: { 
    type: String, 
    unique: true,
    default: function() {
      return `PAY_${Date.now()}_${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    },
    index: true
  },
  referencePaiementMobile: { 
    type: String, 
    sparse: true,
    index: true
  },

  // ===== RÉPARTITION DES FRAIS =====
  repartitionFrais: {
    peages: { 
      type: Number, 
      default: 0, 
      min: [0, 'Les frais de péage doivent être positifs']
    },
    carburant: { 
      type: Number, 
      default: 0, 
      min: [0, 'Les frais de carburant doivent être positifs']
    },
    usureVehicule: { 
      type: Number, 
      default: 0, 
      min: [0, 'Les frais d\'usure véhicule doivent être positifs']
    }
  },

  // ===== STATUT =====
  statutPaiement: {
    type: String,
    enum: {
      values: ['EN_ATTENTE', 'TRAITE', 'COMPLETE', 'ECHEC', 'REMBOURSE'],
      message: 'Statut de paiement invalide'
    },
    default: 'EN_ATTENTE',
    index: true
  },

  // ===== DATES =====
  dateInitiation: { 
    type: Date, 
    default: Date.now,
    index: true
  },
  dateTraitement: { 
    type: Date,
    validate: {
      validator: function(v) {
        return !v || v >= this.dateInitiation;
      },
      message: 'La date de traitement doit être postérieure à la date d\'initiation'
    }
  },
  dateCompletion: { 
    type: Date,
    validate: {
      validator: function(v) {
        return !v || (this.dateTraitement && v >= this.dateTraitement) || v >= this.dateInitiation;
      },
      message: 'La date de complétion doit être postérieure aux autres dates'
    }
  },

  // ===== REÇU =====
  numeroRecu: { 
    type: String, 
    sparse: true,
    unique: true
  },
  urlRecu: { 
    type: String 
  },

  // ===== MÉTADONNÉES =====
  callbackData: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: new Map()
  },

  // Informations de débogage pour les paiements mobile money
  logsTransaction: [{
    date: { type: Date, default: Date.now },
    action: String,
    details: mongoose.Schema.Types.Mixed
  }]

}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// ===== INDEX COMPOSÉS POUR OPTIMISATION =====
paiementSchema.index({ reservationId: 1, payeurId: 1 });
paiementSchema.index({ statutPaiement: 1, dateInitiation: -1 });
paiementSchema.index({ methodePaiement: 1, statutPaiement: 1 });
paiementSchema.index({ dateCompletion: -1 }, { sparse: true });

// ===== PROPRIÉTÉS VIRTUELLES =====
paiementSchema.virtual('estComplete').get(function() {
  return this.statutPaiement === 'COMPLETE';
});

paiementSchema.virtual('estRembourse').get(function() {
  return this.statutPaiement === 'REMBOURSE';
});

paiementSchema.virtual('dureeTraitement').get(function() {
  if (this.dateCompletion && this.dateInitiation) {
    return this.dateCompletion.getTime() - this.dateInitiation.getTime();
  }
  return null;
});

paiementSchema.virtual('estPaiementMobile').get(function() {
  return ['WAVE', 'ORANGE_MONEY', 'MTN_MONEY', 'MOOV_MONEY'].includes(this.methodePaiement);
});

// ===== MIDDLEWARE PRE-SAVE =====
paiementSchema.pre('save', function(next) {
  // 1. Validation cohérence des montants
  const totalCalcule = this.montantConducteur + this.commissionPlateforme + this.fraisTransaction;
  const tolerance = 0.01; // Tolérance pour les erreurs d'arrondi
  
  if (Math.abs(this.montantTotal - totalCalcule) > tolerance) {
    const error = new Error('Incohérence dans la répartition des montants');
    error.name = 'ValidationError';
    return next(error);
  }

  // 2. Générer numéro de reçu si paiement complété
  if (this.statutPaiement === 'COMPLETE' && !this.numeroRecu) {
    this.numeroRecu = `REC_${Date.now()}_${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  }

  // 3. Mise à jour automatique des dates selon le statut
  if (this.isModified('statutPaiement')) {
    const maintenant = new Date();
    
    switch (this.statutPaiement) {
      case 'TRAITE':
        if (!this.dateTraitement) {
          this.dateTraitement = maintenant;
        }
        break;
      case 'COMPLETE':
        if (!this.dateCompletion) {
          this.dateCompletion = maintenant;
        }
        // S'assurer que dateTraitement existe aussi
        if (!this.dateTraitement) {
          this.dateTraitement = maintenant;
        }
        break;
    }
  }

  // 4. Log des modifications importantes
  if (this.isModified('statutPaiement')) {
    this.logsTransaction.push({
      action: 'CHANGEMENT_STATUT',
      details: {
        ancienStatut: this.constructor.findOne({_id: this._id}).then(doc => doc?.statutPaiement),
        nouveauStatut: this.statutPaiement,
        timestamp: new Date()
      }
    });
  }

  next();
});

// ===== MIDDLEWARE POST-SAVE =====
paiementSchema.post('save', function(doc, next) {
  // Générer l'URL du reçu si nécessaire
  if (doc.numeroRecu && !doc.urlRecu) {
    doc.urlRecu = `/api/paiements/${doc._id}/recu/${doc.numeroRecu}`;
    // Note: On évite de sauvegarder à nouveau pour éviter une boucle
  }
  next();
});

// ===== MÉTHODES D'INSTANCE =====

// Calculer la commission de la plateforme
paiementSchema.methods.calculerCommission = function(tauxCommission = 0.05) {
  this.commissionPlateforme = Math.round(this.montantTotal * tauxCommission * 100) / 100;
  this.montantConducteur = this.montantTotal - this.commissionPlateforme - this.fraisTransaction;
  return this.commissionPlateforme;
};

// Vérifier si le paiement peut être remboursé
paiementSchema.methods.peutEtreRembourse = function() {
  return ['COMPLETE', 'TRAITE'].includes(this.statutPaiement) && 
         this.methodePaiement !== 'ESPECES';
};

// Générer l'URL du reçu
paiementSchema.methods.genererUrlRecu = function() {
  if (this.numeroRecu) {
    this.urlRecu = `/api/paiements/${this._id}/recu/${this.numeroRecu}`;
  }
  return this.urlRecu;
};

// Vérifier si une transition de statut est valide
paiementSchema.methods.peutChangerStatut = function(nouveauStatut) {
  const transitionsValides = {
    'EN_ATTENTE': ['TRAITE', 'ECHEC'],
    'TRAITE': ['COMPLETE', 'ECHEC'],
    'COMPLETE': ['REMBOURSE'],
    'ECHEC': ['EN_ATTENTE'],
    'REMBOURSE': []
  };
  
  return transitionsValides[this.statutPaiement]?.includes(nouveauStatut) || false;
};

// Ajouter un log de transaction
paiementSchema.methods.ajouterLog = function(action, details) {
  this.logsTransaction.push({
    date: new Date(),
    action,
    details
  });
};

// Obtenir le résumé du paiement
paiementSchema.methods.obtenirResume = function() {
  return {
    id: this._id,
    referenceTransaction: this.referenceTransaction,
    montantTotal: this.montantTotal,
    methodePaiement: this.methodePaiement,
    statutPaiement: this.statutPaiement,
    dateInitiation: this.dateInitiation,
    dateCompletion: this.dateCompletion
  };
};

// ===== MÉTHODES STATIQUES =====

// Obtenir les statistiques des commissions
paiementSchema.statics.obtenirStatistiquesCommissions = async function(dateDebut, dateFin) {
  return this.aggregate([
    {
      $match: {
        statutPaiement: 'COMPLETE',
        dateCompletion: { $gte: dateDebut, $lte: dateFin }
      }
    },
    {
      $group: {
        _id: null,
        totalCommissions: { $sum: '$commissionPlateforme' },
        nombreTransactions: { $sum: 1 },
        montantTotalTraite: { $sum: '$montantTotal' },
        montantMoyenTransaction: { $avg: '$montantTotal' }
      }
    }
  ]);
};

// Obtenir les paiements en attente de traitement
paiementSchema.statics.obtenirPaiementsEnAttente = async function(limiteTempo = 30) {
  const dateLimite = new Date(Date.now() - (limiteTempo * 60 * 1000));
  
  return this.find({
    statutPaiement: 'EN_ATTENTE',
    dateInitiation: { $lte: dateLimite },
    methodePaiement: { $in: ['WAVE', 'ORANGE_MONEY', 'MTN_MONEY', 'MOOV_MONEY'] }
  });
};

// Rechercher les paiements avec filtres avancés
paiementSchema.statics.rechercherAvancee = async function(filtres, options = {}) {
  const {
    utilisateurId,
    statutPaiement,
    methodePaiement,
    dateDebut,
    dateFin,
    montantMin,
    montantMax,
    page = 1,
    limite = 10,
    tri = { dateInitiation: -1 }
  } = { ...filtres, ...options };

  const requete = {};

  // Filtres utilisateur (payeur ou bénéficiaire)
  if (utilisateurId) {
    requete.$or = [
      { payeurId: utilisateurId },
      { beneficiaireId: utilisateurId }
    ];
  }

  // Filtres statut et méthode
  if (statutPaiement) requete.statutPaiement = statutPaiement;
  if (methodePaiement) requete.methodePaiement = methodePaiement;

  // Filtres de date
  if (dateDebut || dateFin) {
    requete.dateInitiation = {};
    if (dateDebut) requete.dateInitiation.$gte = new Date(dateDebut);
    if (dateFin) requete.dateInitiation.$lte = new Date(dateFin);
  }

  // Filtres de montant
  if (montantMin || montantMax) {
    requete.montantTotal = {};
    if (montantMin) requete.montantTotal.$gte = montantMin;
    if (montantMax) requete.montantTotal.$lte = montantMax;
  }

  const resultats = await this.find(requete)
    .populate('payeurId', 'nom prenom telephone email')
    .populate('beneficiaireId', 'nom prenom telephone email')
    .populate('reservationId', 'itineraire dateDepart statut')
    .sort(tri)
    .limit(limite * 1)
    .skip((page - 1) * limite);

  const total = await this.countDocuments(requete);

  return {
    paiements: resultats,
    pagination: {
      page: parseInt(page),
      limite: parseInt(limite),
      total,
      pages: Math.ceil(total / limite)
    }
  };
};

// Obtenir le rapport financier détaillé
paiementSchema.statics.obtenirRapportFinancier = async function(periode) {
  const { dateDebut, dateFin } = periode;
  
  return this.aggregate([
    {
      $match: {
        dateCompletion: { $gte: dateDebut, $lte: dateFin },
        statutPaiement: 'COMPLETE'
      }
    },
    {
      $group: {
        _id: {
          methodePaiement: '$methodePaiement',
          annee: { $year: '$dateCompletion' },
          mois: { $month: '$dateCompletion' },
          jour: { $dayOfMonth: '$dateCompletion' }
        },
        nombreTransactions: { $sum: 1 },
        chiffreAffaires: { $sum: '$montantTotal' },
        commissionsPerçues: { $sum: '$commissionPlateforme' },
        montantVerseConducteurs: { $sum: '$montantConducteur' },
        fraisTransactionTotal: { $sum: '$fraisTransaction' }
      }
    },
    {
      $sort: { '_id.annee': -1, '_id.mois': -1, '_id.jour': -1 }
    }
  ]);
};

// Export du modèle
const Paiement = mongoose.model('Paiement', paiementSchema);

module.exports = Paiement;