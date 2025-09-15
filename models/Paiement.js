// models/Paiement.js
const mongoose = require('mongoose');
const crypto = require('crypto');

// Schéma principal de l'entité Paiement avec système de commission 10%
const paiementSchema = new mongoose.Schema({
  // ===== RÉFÉRENCES =====
  reservationId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Reservation', 
    required: [true, 'La réservation est requise'],
    index: true
  },
  payeurId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Utilisateur', 
    required: [true, 'Le payeur est requis'],
    index: true
  },
  beneficiaireId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Utilisateur', 
    required: [true, 'Le bénéficiaire est requis']
  },

  // ===== MONTANTS DÉTAILLÉS =====
  montantTotal: { 
    type: Number, 
    required: [true, 'Le montant total est requis'], 
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
    required: [true, 'Le montant conducteur est requis'], 
    min: [0, 'Le montant conducteur doit être positif']
  },
  commissionPlateforme: { 
    type: Number, 
    required: [true, 'La commission est requise'], 
    min: [0, 'La commission doit être positive']
  },
  fraisTransaction: { 
    type: Number, 
    default: 0, 
    min: [0, 'Les frais de transaction doivent être positifs']
  },

  // ===== NOUVEAU : SYSTÈME DE COMMISSION 10% =====
  commission: {
    taux: {
      type: Number,
      default: 0.10, // 10% par défaut
      min: [0, 'Le taux ne peut être négatif'],
      max: [1, 'Le taux ne peut dépasser 100%']
    },
    montant: {
      type: Number,
      required: [true, 'Le montant de commission est requis'],
      min: [0, 'Le montant de commission doit être positif']
    },
    modePrelevement: {
      type: String,
      enum: {
        values: ['compte_recharge', 'paiement_mobile'],
        message: 'Mode de prélèvement invalide'
      },
      required: [true, 'Le mode de prélèvement est requis']
    },
    statutPrelevement: {
      type: String,
      enum: {
        values: ['preleve', 'en_attente', 'echec'],
        message: 'Statut de prélèvement invalide'
      },
      default: 'en_attente'
    },
    datePrelevement: Date,
    referencePrelevement: {
      type: String,
      default: function() {
        return `COM_${Date.now()}_${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
      }
    }
  },

  // ===== MÉTHODE DE PAIEMENT ÉTENDUE =====
  methodePaiement: {
    type: String,
    enum: {
      values: ['ESPECES', 'WAVE', 'ORANGE_MONEY', 'MTN_MONEY', 'MOOV_MONEY', 'COMPTE_RECHARGE'],
      message: 'Méthode de paiement non supportée'
    },
    required: [true, 'La méthode de paiement est requise']
  },

  // ===== NOUVEAU : RÈGLES DE PAIEMENT APPLIQUÉES =====
  reglesPaiement: {
    conducteurCompteRecharge: {
      type: Boolean,
      required: [true, 'Le statut du compte conducteur est requis']
    },
    modesAutorises: [{
      type: String,
      enum: ['especes', 'wave', 'orange_money', 'mtn_money', 'moov_money', 'compte_recharge']
    }],
    raisonValidation: {
      type: String,
      maxlength: [500, 'La raison de validation ne peut dépasser 500 caractères']
    },
    verificationsPassees: {
      type: Boolean,
      default: false
    },
    dateValidation: {
      type: Date,
      default: Date.now
    }
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

  // ===== RÉPARTITION DES FRAIS (OPTIONNEL) =====
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

  // ===== REÇU ET FACTURE =====
  numeroRecu: { 
    type: String, 
    sparse: true,
    unique: true
  },
  urlRecu: { 
    type: String 
  },

  // ===== NOUVEAU : TRAÇABILITÉ POUR AUDIT =====
  historiqueStatuts: [{
    ancienStatut: {
      type: String,
      required: true
    },
    nouveauStatut: {
      type: String,
      required: true
    },
    dateChangement: {
      type: Date,
      default: Date.now
    },
    raisonChangement: {
      type: String,
      maxlength: [500, 'La raison ne peut dépasser 500 caractères']
    },
    utilisateurId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Utilisateur'
    }
  }],

  // ===== INTÉGRATION MOBILE MONEY =====
  mobileMoney: {
    operateur: {
      type: String,
      enum: ['WAVE', 'ORANGE', 'MTN', 'MOOV']
    },
    numeroTelephone: {
      type: String,
      validate: {
        validator: function(v) {
          return !v || /^(\+225)?[0-9]{8,10}$/.test(v);
        },
        message: 'Numéro de téléphone invalide'
      }
    },
    transactionId: String,
    codeTransaction: String,
    dateTransaction: Date,
    fraisOperateur: {
      type: Number,
      default: 0,
      min: [0, 'Les frais opérateur doivent être positifs']
    },
    statutMobileMoney: {
      type: String,
      enum: ['PENDING', 'SUCCESS', 'FAILED', 'TIMEOUT'],
      default: 'PENDING'
    }
  },

  // ===== SÉCURITÉ ET VÉRIFICATION =====
  securite: {
    empreinteTransaction: {
      type: String,
      unique: true
    },
    ipAddress: String,
    userAgent: String,
    deviceId: String,
    tentativesEchec: {
      type: Number,
      default: 0,
      max: [5, 'Nombre maximum de tentatives dépassé']
    },
    bloqueJusquA: Date
  },

  // ===== LOGS ET ERREURS =====
  logsTransaction: [{
    date: { 
      type: Date, 
      default: Date.now 
    },
    action: {
      type: String,
      required: true
    },
    details: mongoose.Schema.Types.Mixed,
    source: {
      type: String,
      enum: ['SYSTEM', 'USER', 'ADMIN', 'MOBILE_MONEY', 'API'],
      default: 'SYSTEM'
    },
    niveau: {
      type: String,
      enum: ['INFO', 'WARNING', 'ERROR', 'DEBUG'],
      default: 'INFO'
    }
  }],

  erreurs: [{
    date: { 
      type: Date, 
      default: Date.now 
    },
    code: String,
    message: String,
    stack: String,
    contexte: Object
  }]

}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// ===== INDEX COMPOSÉS =====
paiementSchema.index({ reservationId: 1, payeurId: 1 });
paiementSchema.index({ statutPaiement: 1, dateInitiation: -1 });
paiementSchema.index({ methodePaiement: 1, statutPaiement: 1 });
paiementSchema.index({ dateCompletion: -1 }, { sparse: true });
paiementSchema.index({ 'commission.statutPrelevement': 1 });
paiementSchema.index({ 'mobileMoney.transactionId': 1 }, { sparse: true });
paiementSchema.index({ 'securite.empreinteTransaction': 1 });

// ===== PROPRIÉTÉS VIRTUELLES =====
paiementSchema.virtual('estComplete').get(function() {
  return this.statutPaiement === 'COMPLETE';
});

paiementSchema.virtual('estPaiementMobile').get(function() {
  return ['WAVE', 'ORANGE_MONEY', 'MTN_MONEY', 'MOOV_MONEY'].includes(this.methodePaiement);
});

paiementSchema.virtual('commissionPrelevee').get(function() {
  return this.commission.statutPrelevement === 'preleve';
});

paiementSchema.virtual('montantNetConducteur').get(function() {
  return this.montantTotal - this.commission.montant - this.fraisTransaction;
});

paiementSchema.virtual('tauxCommissionReel').get(function() {
  return this.montantTotal > 0 ? (this.commission.montant / this.montantTotal) : 0;
});

// ===== MIDDLEWARE PRE-SAVE =====
paiementSchema.pre('save', function(next) {
  try {
    // 1. Validation cohérence des montants
    const montantCalcule = this.montantConducteur + this.commission.montant + this.fraisTransaction;
    const tolerance = 0.01;
    
    if (Math.abs(this.montantTotal - montantCalcule) > tolerance) {
      return next(new Error('Incohérence dans la répartition des montants'));
    }

    // 2. Générer numéro de reçu si paiement complété
    if (this.statutPaiement === 'COMPLETE' && !this.numeroRecu) {
      this.numeroRecu = `REC_${Date.now()}_${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    }

    // 3. Générer empreinte de transaction unique
    if (!this.securite.empreinteTransaction) {
      this.securite.empreinteTransaction = crypto
        .createHash('sha256')
        .update(`${this.payeurId}-${this.beneficiaireId}-${this.montantTotal}-${this.dateInitiation}`)
        .digest('hex');
    }

    // 4. Mise à jour automatique des dates selon le statut
    if (this.isModified('statutPaiement')) {
      const maintenant = new Date();
      
      // Ajouter à l'historique des statuts
      if (!this.isNew) {
        this.historiqueStatuts.push({
          ancienStatut: this.constructor.schema.paths.statutPaiement.default,
          nouveauStatut: this.statutPaiement,
          dateChangement: maintenant,
          raisonChangement: 'Changement automatique de statut'
        });
      }
      
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
          if (!this.dateTraitement) {
            this.dateTraitement = maintenant;
          }
          // Marquer commission comme prélevée
          if (this.commission.statutPrelevement === 'en_attente') {
            this.commission.statutPrelevement = 'preleve';
            this.commission.datePrelevement = maintenant;
          }
          break;
        case 'ECHEC':
          if (this.commission.statutPrelevement === 'en_attente') {
            this.commission.statutPrelevement = 'echec';
          }
          break;
      }
    }

    next();
  } catch (error) {
    next(error);
  }
});

// ===== MIDDLEWARE POST-SAVE =====
paiementSchema.post('save', async function(doc) {
  try {
    // Traiter les actions post-paiement
    if (doc.isModified('statutPaiement') && doc.statutPaiement === 'COMPLETE') {
      await doc.traiterCommissionApresPayement();
    }
  } catch (error) {
    console.error('Erreur post-save paiement:', error);
  }
});

// ===== MÉTHODES D'INSTANCE =====

// Calculer la commission de la plateforme (10% par défaut)
paiementSchema.methods.calculerCommission = function(tauxCommission = 0.10) {
  this.commission.taux = tauxCommission;
  this.commission.montant = Math.round(this.montantTotal * tauxCommission);
  this.commissionPlateforme = this.commission.montant;
  this.montantConducteur = this.montantTotal - this.commission.montant - this.fraisTransaction;
  
  this.ajouterLog('COMMISSION_CALCULEE', {
    taux: tauxCommission,
    montant: this.commission.montant,
    montantConducteur: this.montantConducteur
  });
  
  return this.commission.montant;
};

// Valider les règles de paiement selon le système de commission
paiementSchema.methods.validerReglesPaiement = async function() {
  try {
    const Reservation = mongoose.model('Reservation');
    
    const reservation = await Reservation.findById(this.reservationId).populate('trajetId');
    if (!reservation) {
      throw new Error('Réservation introuvable');
    }

    const trajet = reservation.trajetId;
    const modeAccepte = trajet.accepteModePaiement(this.methodePaiement);
    
    this.reglesPaiement = {
      conducteurCompteRecharge: trajet.conducteurId.compteCovoiturage?.estRecharge || false,
      modesAutorises: Object.keys(trajet.modesPaiementAcceptes).filter(
        mode => trajet.modesPaiementAcceptes[mode]
      ),
      raisonValidation: modeAccepte.accepte ? 'Mode de paiement autorisé' : modeAccepte.raison,
      verificationsPassees: modeAccepte.accepte,
      dateValidation: new Date()
    };

    this.ajouterLog('VALIDATION_REGLES', {
      methodePaiement: this.methodePaiement,
      resultat: modeAccepte.accepte,
      raison: modeAccepte.raison
    });

    return modeAccepte.accepte;
  } catch (error) {
    this.ajouterErreur('VALIDATION_REGLES_ERREUR', error.message);
    return false;
  }
};

// Traiter la commission après paiement
paiementSchema.methods.traiterCommissionApresPayement = async function() {
  try {
    if (this.commission.statutPrelevement === 'preleve') return;

    const Utilisateur = mongoose.model('Utilisateur');
    const conducteur = await Utilisateur.findById(this.beneficiaireId);

    if (this.commission.modePrelevement === 'compte_recharge') {
      // Prélever commission du compte rechargé
      await conducteur.preleverCommission(
        this.commission.montant,
        this.reservationId,
        this._id
      );
      
      this.ajouterLog('COMMISSION_PRELEVEE_COMPTE', {
        montant: this.commission.montant,
        conducteurId: this.beneficiaireId
      });
      
    } else if (this.commission.modePrelevement === 'paiement_mobile') {
      // Commission déjà prélevée lors du paiement mobile money
      this.ajouterLog('COMMISSION_PRELEVEE_MOBILE', {
        montant: this.commission.montant,
        operateur: this.mobileMoney.operateur
      });
    }

    // Créditer les gains au conducteur
    await conducteur.crediterGains(
      this.montantConducteur,
      this.reservationId,
      this._id
    );

    this.commission.statutPrelevement = 'preleve';
    this.commission.datePrelevement = new Date();
    
    await this.save();

  } catch (error) {
    this.commission.statutPrelevement = 'echec';
    this.ajouterErreur('TRAITEMENT_COMMISSION_ERREUR', error.message);
    console.error('Erreur traitement commission:', error);
  }
};

// Initier un paiement mobile money
paiementSchema.methods.initierPaiementMobile = function(numeroTelephone, operateur) {
  this.mobileMoney = {
    operateur: operateur.toUpperCase(),
    numeroTelephone,
    statutMobileMoney: 'PENDING',
    dateTransaction: new Date()
  };

  // Déterminer le mode de prélèvement
  this.commission.modePrelevement = 'paiement_mobile';

  this.ajouterLog('PAIEMENT_MOBILE_INITIE', {
    operateur,
    numero: numeroTelephone.replace(/(.{3})(.*)(.{3})/, '$1***$3'),
    montant: this.montantTotal
  });

  return this;
};

// Traiter le callback mobile money
paiementSchema.methods.traiterCallbackMobile = function(donneesCallback) {
  this.mobileMoney.transactionId = donneesCallback.transactionId;
  this.mobileMoney.codeTransaction = donneesCallback.codeTransaction;
  this.referencePaiementMobile = donneesCallback.transactionId;
  
  switch (donneesCallback.statut) {
    case 'SUCCESS':
      this.mobileMoney.statutMobileMoney = 'SUCCESS';
      this.statutPaiement = 'COMPLETE';
      break;
    case 'FAILED':
      this.mobileMoney.statutMobileMoney = 'FAILED';
      this.statutPaiement = 'ECHEC';
      break;
    case 'TIMEOUT':
      this.mobileMoney.statutMobileMoney = 'TIMEOUT';
      this.statutPaiement = 'ECHEC';
      break;
  }
  
  this.ajouterLog('CALLBACK_MOBILE_RECU', donneesCallback);
  return this;
};

// Vérifier si une transition de statut est valide
paiementSchema.methods.peutChangerStatut = function(nouveauStatut) {
  const transitionsValides = {
    'EN_ATTENTE': ['TRAITE', 'ECHEC', 'REMBOURSE'],
    'TRAITE': ['COMPLETE', 'ECHEC', 'REMBOURSE'],
    'COMPLETE': ['REMBOURSE'],
    'ECHEC': ['EN_ATTENTE'],
    'REMBOURSE': []
  };
  
  return transitionsValides[this.statutPaiement]?.includes(nouveauStatut) || false;
};

// Ajouter un log de transaction
paiementSchema.methods.ajouterLog = function(action, details, source = 'SYSTEM', niveau = 'INFO') {
  this.logsTransaction.push({
    date: new Date(),
    action,
    details,
    source,
    niveau
  });
  
  // Limiter à 50 logs max
  if (this.logsTransaction.length > 50) {
    this.logsTransaction = this.logsTransaction.slice(-50);
  }
};

// Ajouter une erreur
paiementSchema.methods.ajouterErreur = function(code, message, stack = null, contexte = {}) {
  this.erreurs.push({
    date: new Date(),
    code,
    message,
    stack,
    contexte
  });
  
  this.ajouterLog('ERREUR', { code, message }, 'SYSTEM', 'ERROR');
  
  if (this.erreurs.length > 10) {
    this.erreurs = this.erreurs.slice(-10);
  }
};

// Obtenir le résumé du paiement
paiementSchema.methods.obtenirResume = function() {
  return {
    id: this._id,
    referenceTransaction: this.referenceTransaction,
    montantTotal: this.montantTotal,
    montantConducteur: this.montantConducteur,
    commission: {
      montant: this.commission.montant,
      taux: this.commission.taux,
      statutPrelevement: this.commission.statutPrelevement,
      modePrelevement: this.commission.modePrelevement
    },
    methodePaiement: this.methodePaiement,
    statutPaiement: this.statutPaiement,
    reglesPaiement: this.reglesPaiement,
    dateInitiation: this.dateInitiation,
    dateCompletion: this.dateCompletion,
    mobileMoney: this.estPaiementMobile ? {
      operateur: this.mobileMoney.operateur,
      statut: this.mobileMoney.statutMobileMoney,
      transactionId: this.mobileMoney.transactionId
    } : null
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
        totalCommissions: { $sum: '$commission.montant' },
        nombreTransactions: { $sum: 1 },
        montantTotalTraite: { $sum: '$montantTotal' },
        montantMoyenTransaction: { $avg: '$montantTotal' },
        commissionsParMode: {
          $push: {
            mode: '$commission.modePrelevement',
            montant: '$commission.montant'
          }
        }
      }
    }
  ]);
};

// Obtenir les paiements avec commission en échec
paiementSchema.statics.obtenirCommissionsEnEchec = function() {
  return this.find({
    'commission.statutPrelevement': 'echec',
    statutPaiement: 'COMPLETE'
  })
  .populate('beneficiaireId', 'nom prenom email')
  .populate('reservationId');
};

// Statistiques par mode de paiement
paiementSchema.statics.statistiquesParModePaiement = async function() {
  return this.aggregate([
    {
      $match: {
        statutPaiement: 'COMPLETE'
      }
    },
    {
      $group: {
        _id: '$methodePaiement',
        nombre: { $sum: 1 },
        montantTotal: { $sum: '$montantTotal' },
        commissionsTotal: { $sum: '$commission.montant' },
        montantMoyen: { $avg: '$montantTotal' }
      }
    },
    {
      $sort: { nombre: -1 }
    }
  ]);
};

// Obtenir les paiements en attente de traitement
paiementSchema.statics.obtenirPaiementsEnAttente = function() {
  return this.find({
    statutPaiement: 'EN_ATTENTE',
    dateInitiation: { 
      $lt: new Date(Date.now() - 15 * 60 * 1000) // Plus de 15 minutes
    }
  })
  .populate('payeurId beneficiaireId', 'nom prenom email telephone');
};

// Analyse des revenus pour tableau de bord admin
paiementSchema.statics.analyseRevenus = async function(periode = 30) {
  const dateDebut = new Date();
  dateDebut.setDate(dateDebut.getDate() - periode);

  return this.aggregate([
    {
      $match: {
        statutPaiement: 'COMPLETE',
        dateCompletion: { $gte: dateDebut }
      }
    },
    {
      $group: {
        _id: {
          $dateToString: { format: '%Y-%m-%d', date: '$dateCompletion' }
        },
        chiffreAffaires: { $sum: '$montantTotal' },
        commissionsPerçues: { $sum: '$commission.montant' },
        nombreTransactions: { $sum: 1 },
        montantMoyenTransaction: { $avg: '$montantTotal' }
      }
    },
    {
      $sort: { '_id': 1 }
    }
  ]);
};

module.exports = mongoose.model('Paiement', paiementSchema);