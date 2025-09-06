// =====================================================
// MODEL - PAIEMENT SCHEMA COMPLET AVEC TOUTES LES FONCTIONNALITÉS
// =====================================================

const mongoose = require('mongoose');
const crypto = require('crypto');

// Schéma principal de l'entité Paiement avec toutes les fonctionnalités
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

  // ===== COMMISSION ET FRAIS (10% + frais spécifiques) =====
  detailsCommission: {
    tauxCommission: {
      type: Number,
      default: 0.10, // 10% par défaut
      min: 0,
      max: 1
    },
    montantCommissionCalculee: Number,
    compteApplication: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'CompteApplication'
    },
    datePrelevementCommission: Date,
    statutPrelevement: {
      type: String,
      enum: ['EN_ATTENTE', 'PRELEVE', 'ECHEC'],
      default: 'EN_ATTENTE'
    }
  },

  // ===== MÉTHODE DE PAIEMENT ÉTENDUE =====
  methodePaiement: {
    type: String,
    enum: {
      values: ['ESPECES', 'WAVE', 'ORANGE_MONEY', 'MTN_MONEY', 'MOOV_MONEY', 'VISA', 'MASTERCARD', 'PORTEFEUILLE_INTERNE'],
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

  // ===== INTÉGRATION CINETPAY =====
  cinetpay: {
    // Identifiants CinetPay
    transactionId: { 
      type: String, 
      sparse: true,
      index: true
    },
    paymentToken: { 
      type: String, 
      sparse: true
    },
    siteId: String,
    
    // URLs et callbacks
    paymentUrl: String,
    returnUrl: String,
    notifyUrl: String,
    
    // Informations client
    customerPhone: {
      type: String,
      validate: {
        validator: function(v) {
          return !v || /^(\+225)?[0-9]{8,10}$/.test(v);
        },
        message: 'Numéro de téléphone invalide'
      }
    },
    customerEmail: String,
    customerName: String,
    
    // Détails de la transaction
    operatorTransactionId: String,
    paymentMethod: {
      type: String,
      enum: ['ORANGE_MONEY', 'MTN_MONEY', 'MOOV_MONEY', 'WAVE', 'CARD']
    },
    currency: { 
      type: String, 
      default: 'XOF',
      enum: ['XOF', 'USD', 'EUR']
    },
    
    // Dates CinetPay
    paymentDate: Date,
    expirationDate: Date,
    
    // Statut CinetPay
    status: {
      type: String,
      enum: ['PENDING', 'COMPLETED', 'FAILED', 'CANCELLED', 'EXPIRED'],
      default: 'PENDING'
    },
    
    // Réponses et logs CinetPay
    webhookResponse: {
      type: Object,
      default: {}
    },
    initiationResponse: {
      type: Object,
      default: {}
    },
    
    // Tentatives et retry
    tentatives: {
      type: Number,
      default: 0,
      max: 5
    },
    derniereTentative: Date
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
      values: ['EN_ATTENTE', 'TRAITE', 'COMPLETE', 'ECHEC', 'REMBOURSE', 'EXPIRE', 'LITIGE'],
      message: 'Statut de paiement invalide'
    },
    default: 'EN_ATTENTE',
    index: true
  },

  // ===== GESTION PORTEFEUILLE INTERNE =====
  portefeuille: {
    crediteDansPortefeuille: {
      type: Boolean,
      default: false
    },
    dateCreditPortefeuille: Date,
    montantCreditePortefeuille: Number,
    
    // Solde minimum requis
    soldeMinimumRequis: {
      type: Number,
      default: 5000 // 5000 FCFA
    },
    
    // Pour les retraits
    estRetrait: {
      type: Boolean,
      default: false
    },
    compteDestinataire: {
      numeroMobile: String,
      operateur: {
        type: String,
        enum: ['ORANGE', 'MTN', 'MOOV', 'WAVE']
      },
      nomTitulaire: String,
      typeBanque: {
        type: String,
        enum: ['MOBILE_MONEY', 'BANQUE_TRADITIONNELLE']
      }
    },
    statutRetrait: {
      type: String,
      enum: ['EN_ATTENTE', 'TRAITEMENT', 'COMPLETE', 'ECHEC'],
      default: 'EN_ATTENTE'
    },
    fraisRetrait: {
      type: Number,
      default: 0
    },
    delaiRetrait: {
      type: String,
      enum: ['IMMEDIAT', '24H', '48H', '72H'],
      default: '24H'
    }
  },

  // ===== RECHARGE DE COMPTE =====
  recharge: {
    estRecharge: {
      type: Boolean,
      default: false
    },
    methodeRecharge: {
      type: String,
      enum: ['MOBILE_MONEY', 'CARTE_BANCAIRE', 'DEPOT_PARTENAIRE', 'VIREMENT_BANCAIRE']
    },
    partenaireAgree: {
      nom: String,
      code: String,
      localisation: String
    },
    dateRecharge: Date,
    statutRecharge: {
      type: String,
      enum: ['EN_ATTENTE', 'CONFIRME', 'ECHEC'],
      default: 'EN_ATTENTE'
    }
  },

  // ===== REMBOURSEMENTS ET ANNULATIONS =====
  remboursement: {
    estRemboursable: {
      type: Boolean,
      default: true
    },
    typeRemboursement: {
      type: String,
      enum: ['INTEGRAL', 'PARTIEL_50', 'PARTIEL_25', 'NON_REMBOURSABLE'],
      default: 'INTEGRAL'
    },
    regleAnnulation: {
      delaiAnnulationGratuite: {
        type: Number,
        default: 60 // minutes
      },
      fraisAnnulationTardive: {
        type: Number,
        default: 0.10 // 10%
      }
    },
    motifRemboursement: String,
    dateRemboursement: Date,
    montantRembourse: Number,
    fraisRemboursement: Number,
    referenceRemboursement: String
  },

  // ===== SÉCURITÉ ET AUTHENTIFICATION =====
  securite: {
    otpRequis: {
      type: Boolean,
      default: function() {
        return this.montantTotal > 10000; // OTP si > 10,000 FCFA
      }
    },
    otpEnvoye: {
      type: Boolean,
      default: false
    },
    otpVerifie: {
      type: Boolean,
      default: false
    },
    codeOTP: String,
    dateExpirationOTP: Date,
    tentativesOTP: {
      type: Number,
      default: 0,
      max: 3
    },
    codePIN: String,
    authentificationRenforcee: {
      type: Boolean,
      default: false
    },
    empreinteTransaction: String // Hash unique pour éviter les doublons
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
  factureNumerique: {
    numeroFacture: String,
    urlFacture: String,
    formatFacture: {
      type: String,
      enum: ['PDF', 'HTML', 'JSON'],
      default: 'PDF'
    },
    estFactureGeneree: {
      type: Boolean,
      default: false
    }
  },

  // ===== GESTION DES LITIGES =====
  litige: {
    estEnLitige: {
      type: Boolean,
      default: false
    },
    numeroLitige: String,
    motifLitige: {
      type: String,
      enum: ['MONTANT_INCORRECT', 'SERVICE_NON_RENDU', 'PROBLEME_TECHNIQUE', 'COMMISSION_CONTESTEE', 'AUTRE']
    },
    descriptionLitige: String,
    dateOuvertureLitige: Date,
    statutLitige: {
      type: String,
      enum: ['OUVERT', 'EN_COURS', 'RESOLU', 'FERME'],
      default: 'OUVERT'
    },
    resolutionLitige: {
      dateResolution: Date,
      typeResolution: {
        type: String,
        enum: ['REMBOURSEMENT', 'COMPENSATION', 'REJET', 'MEDIATION']
      },
      montantCompensation: Number,
      commentaireResolution: String
    },
    documentsLitige: [{
      nom: String,
      url: String,
      type: String,
      dateAjout: Date
    }]
  },

  // ===== MÉTADONNÉES =====
  callbackData: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: new Map()
  },

  // ===== LOGS ET ERREURS =====
  logsTransaction: [{
    date: { type: Date, default: Date.now },
    action: String,
    details: mongoose.Schema.Types.Mixed,
    source: {
      type: String,
      enum: ['SYSTEM', 'CINETPAY', 'USER', 'ADMIN', 'MOBILE_MONEY', 'BANK'],
      default: 'SYSTEM'
    },
    niveau: {
      type: String,
      enum: ['INFO', 'WARNING', 'ERROR', 'DEBUG', 'SECURITY'],
      default: 'INFO'
    }
  }],

  erreurs: [{
    date: { type: Date, default: Date.now },
    code: String,
    message: String,
    stack: String,
    contexte: Object
  }],

  // ===== NOTIFICATIONS AUTOMATIQUES =====
  notifications: {
    emailEnvoye: {
      type: Boolean,
      default: false
    },
    smsEnvoye: {
      type: Boolean,
      default: false
    },
    pushEnvoye: {
      type: Boolean,
      default: false
    },
    dateNotification: Date,
    tentativesNotification: {
      type: Number,
      default: 0
    },
    typesNotifications: [{
      type: {
        type: String,
        enum: ['CONFIRMATION_PAIEMENT', 'SOLDE_INSUFFISANT', 'RECHARGE_REQUISE', 'REMBOURSEMENT', 'LITIGE', 'COMMISSION_PRELEVEE']
      },
      destinataire: {
        type: String,
        enum: ['PAYEUR', 'BENEFICIAIRE', 'ADMIN', 'TOUS']
      },
      canal: {
        type: String,
        enum: ['EMAIL', 'SMS', 'PUSH', 'IN_APP']
      },
      envoye: Boolean,
      dateEnvoi: Date
    }]
  },

  // ===== TABLEAU DE BORD ADMIN =====
  tracking: {
    vueParAdmin: {
      type: Boolean,
      default: false
    },
    dateVueAdmin: Date,
    prioriteAdmin: {
      type: String,
      enum: ['BASSE', 'NORMALE', 'HAUTE', 'CRITIQUE'],
      default: 'NORMALE'
    },
    noteAdmin: String,
    categorieTransaction: {
      type: String,
      enum: ['NORMALE', 'SUSPECTE', 'FRAUDULEUSE', 'A_SURVEILLER'],
      default: 'NORMALE'
    }
  }

}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// ===== INDEX COMPOSÉS ÉTENDUS =====
paiementSchema.index({ reservationId: 1, payeurId: 1 });
paiementSchema.index({ statutPaiement: 1, dateInitiation: -1 });
paiementSchema.index({ methodePaiement: 1, statutPaiement: 1 });
paiementSchema.index({ dateCompletion: -1 }, { sparse: true });
paiementSchema.index({ 'cinetpay.transactionId': 1 }, { sparse: true });
paiementSchema.index({ 'cinetpay.status': 1, 'cinetpay.paymentDate': -1 });
paiementSchema.index({ 'portefeuille.crediteDansPortefeuille': 1 });
paiementSchema.index({ 'litige.estEnLitige': 1, 'litige.statutLitige': 1 });
paiementSchema.index({ 'tracking.categorieTransaction': 1 });
paiementSchema.index({ 'detailsCommission.statutPrelevement': 1 });
paiementSchema.index({ 'recharge.statutRecharge': 1 });

// ===== PROPRIÉTÉS VIRTUELLES ÉTENDUES =====
paiementSchema.virtual('estComplete').get(function() {
  return this.statutPaiement === 'COMPLETE';
});

paiementSchema.virtual('estPaiementMobile').get(function() {
  return ['WAVE', 'ORANGE_MONEY', 'MTN_MONEY', 'MOOV_MONEY'].includes(this.methodePaiement);
});

paiementSchema.virtual('estPaiementCarte').get(function() {
  return ['VISA', 'MASTERCARD'].includes(this.methodePaiement);
});

paiementSchema.virtual('estCinetPay').get(function() {
  return !!this.cinetpay.transactionId;
});

paiementSchema.virtual('estExpire').get(function() {
  return this.cinetpay.expirationDate && new Date() > this.cinetpay.expirationDate;
});

paiementSchema.virtual('soldeInsuffisant').get(function() {
  return this.portefeuille.montantCreditePortefeuille < this.portefeuille.soldeMinimumRequis;
});

paiementSchema.virtual('necessiteOTP').get(function() {
  return this.securite.otpRequis && !this.securite.otpVerifie;
});

paiementSchema.virtual('enLitige').get(function() {
  return this.litige.estEnLitige && ['OUVERT', 'EN_COURS'].includes(this.litige.statutLitige);
});

paiementSchema.virtual('statutDetailne').get(function() {
  return {
    general: this.statutPaiement,
    cinetpay: this.cinetpay.status,
    portefeuille: this.portefeuille.crediteDansPortefeuille ? 'CREDITE' : 'NON_CREDITE',
    litige: this.litige.estEnLitige ? this.litige.statutLitige : 'AUCUN',
    commission: this.detailsCommission.statutPrelevement
  };
});

// ===== MIDDLEWARE PRE-SAVE ÉTENDU =====
paiementSchema.pre('save', function(next) {
  // 1. Validation cohérence des montants
  const totalCalcule = this.montantConducteur + this.commissionPlateforme + this.fraisTransaction;
  const tolerance = 0.01;
  
  if (Math.abs(this.montantTotal - totalCalcule) > tolerance) {
    const error = new Error('Incohérence dans la répartition des montants');
    error.name = 'ValidationError';
    return next(error);
  }

  // 2. Générer numéro de reçu si paiement complété
  if (this.statutPaiement === 'COMPLETE' && !this.numeroRecu) {
    this.numeroRecu = `REC_${Date.now()}_${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  }

  // 3. Gestion de l'expiration CinetPay
  if (this.estCinetPay && !this.cinetpay.expirationDate) {
    this.cinetpay.expirationDate = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
  }

  // 4. Calcul automatique commission (10%)
  if (this.isModified('montantTotal') && !this.isModified('commissionPlateforme')) {
    this.calculerCommission(this.detailsCommission.tauxCommission || 0.10);
  }

  // 5. Générer empreinte de transaction unique
  if (!this.securite.empreinteTransaction) {
    this.securite.empreinteTransaction = crypto
      .createHash('sha256')
      .update(`${this.payeurId}-${this.beneficiaireId}-${this.montantTotal}-${this.dateInitiation}`)
      .digest('hex');
  }

  // 6. Vérifier OTP requis
  if (this.montantTotal > 10000 && !this.securite.otpRequis) {
    this.securite.otpRequis = true;
  }

  // 7. Mise à jour automatique des dates selon le statut
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
        if (!this.dateTraitement) {
          this.dateTraitement = maintenant;
        }
        if (this.cinetpay.status === 'PENDING') {
          this.cinetpay.status = 'COMPLETED';
          this.cinetpay.paymentDate = maintenant;
        }
        // Marquer commission comme prélevée
        this.detailsCommission.statutPrelevement = 'PRELEVE';
        this.detailsCommission.datePrelevementCommission = maintenant;
        break;
      case 'ECHEC':
        if (this.cinetpay.status === 'PENDING') {
          this.cinetpay.status = 'FAILED';
        }
        break;
      case 'EXPIRE':
        this.cinetpay.status = 'EXPIRED';
        break;
      case 'LITIGE':
        this.litige.estEnLitige = true;
        if (!this.litige.dateOuvertureLitige) {
          this.litige.dateOuvertureLitige = maintenant;
          this.litige.numeroLitige = `LIT_${Date.now()}_${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
        }
        break;
    }
  }

  next();
});

// ===== MÉTHODES D'INSTANCE ÉTENDUES =====

// Calculer la commission de la plateforme (10% par défaut)
paiementSchema.methods.calculerCommission = function(tauxCommission = 0.10, tauxFraisCinetPay = 0.025) {
  this.detailsCommission.tauxCommission = tauxCommission;
  this.commissionPlateforme = Math.round(this.montantTotal * tauxCommission * 100) / 100;
  this.detailsCommission.montantCommissionCalculee = this.commissionPlateforme;
  
  if (this.estPaiementMobile) {
    this.fraisTransaction = Math.round(this.montantTotal * tauxFraisCinetPay * 100) / 100;
  }
  
  this.montantConducteur = this.montantTotal - this.commissionPlateforme - this.fraisTransaction;
  return this.commissionPlateforme;
};

// Vérifier le solde minimum
paiementSchema.methods.verifierSoldeMinimum = function() {
  return this.portefeuille.montantCreditePortefeuille >= this.portefeuille.soldeMinimumRequis;
};

// Générer et envoyer OTP
paiementSchema.methods.genererOTP = function() {
  if (this.securite.otpRequis) {
    this.securite.codeOTP = Math.floor(100000 + Math.random() * 900000).toString();
    this.securite.dateExpirationOTP = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    this.securite.otpEnvoye = true;
    
    this.ajouterLog('OTP_GENERE', {
      dateExpiration: this.securite.dateExpirationOTP
    }, 'SYSTEM', 'SECURITY');
    
    return this.securite.codeOTP;
  }
  return null;
};

// Vérifier OTP
paiementSchema.methods.verifierOTP = function(codeOTP) {
  if (!this.securite.otpRequis) return true;
  
  if (this.securite.tentativesOTP >= 3) {
    this.ajouterLog('OTP_TENTATIVES_DEPASSEES', {}, 'SYSTEM', 'SECURITY');
    return false;
  }
  
  if (new Date() > this.securite.dateExpirationOTP) {
    this.ajouterLog('OTP_EXPIRE', {}, 'SYSTEM', 'SECURITY');
    return false;
  }
  
  if (this.securite.codeOTP === codeOTP) {
    this.securite.otpVerifie = true;
    this.ajouterLog('OTP_VERIFIE', {}, 'SYSTEM', 'SECURITY');
    return true;
  } else {
    this.securite.tentativesOTP += 1;
    this.ajouterLog('OTP_INVALIDE', { tentative: this.securite.tentativesOTP }, 'SYSTEM', 'SECURITY');
    return false;
  }
};

// Ouvrir un litige
paiementSchema.methods.ouvrirLitige = function(motif, description) {
  this.litige.estEnLitige = true;
  this.litige.motifLitige = motif;
  this.litige.descriptionLitige = description;
  this.litige.dateOuvertureLitige = new Date();
  this.litige.numeroLitige = `LIT_${Date.now()}_${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
  this.statutPaiement = 'LITIGE';
  
  this.ajouterLog('LITIGE_OUVERT', {
    numero: this.litige.numeroLitige,
    motif,
    description
  }, 'USER');
  
  return this.litige.numeroLitige;
};

// Programmer une notification
paiementSchema.methods.programmerNotification = function(type, destinataire, canal = 'PUSH') {
  this.notifications.typesNotifications.push({
    type,
    destinataire,
    canal,
    envoye: false
  });
  
  this.ajouterLog('NOTIFICATION_PROGRAMMEE', {
    type,
    destinataire,
    canal
  }, 'SYSTEM');
};

// Toutes les autres méthodes existantes restent identiques...
// (initialiserCinetPay, traiterWebhookCinetPay, crediterPortefeuille, etc.)

// ===== MÉTHODES STATIQUES ÉTENDUES =====

// Obtenir les conducteurs avec solde insuffisant
paiementSchema.statics.obtenirConducteursSoldeInsuffisant = async function() {
  return this.aggregate([
    {
      $match: {
        'portefeuille.crediteDansPortefeuille': true
      }
    },
    {
      $group: {
        _id: '$beneficiaireId',
        soldeActuel: { $sum: '$portefeuille.montantCreditePortefeuille' },
        soldeMinimumRequis: { $first: '$portefeuille.soldeMinimumRequis' }
      }
    },
    {
      $match: {
        $expr: { $lt: ['$soldeActuel', '$soldeMinimumRequis'] }
      }
    },
    {
      $lookup: {
        from: 'utilisateurs',
        localField: '_id',
        foreignField: '_id',
        as: 'conducteur'
      }
    }
  ]);
};

// Obtenir les transactions nécessitant OTP
paiementSchema.statics.obtenirTransactionsOTPRequis = async function() {
  return this.find({
    'securite.otpRequis': true,
    'securite.otpVerifie': false,
    statutPaiement: 'EN_ATTENTE'
  });
};

// Obtenir les litiges ouverts
paiementSchema.statics.obtenirLitigesOuverts = async function() {
  return this.find({
    'litige.estEnLitige': true,
    'litige.statutLitige': { $in: ['OUVERT', 'EN_COURS'] }
  }).populate('payeurId beneficiaireId reservationId');
};

// Obtenir le rapport financier pour admin
paiementSchema.statics.obtenirRapportFinancierAdmin = async function(dateDebut, dateFin) {
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
          date: { $dateToString: { format: '%Y-%m-%d', date: '$dateCompletion' } },
          methode: '$methodePaiement'
        },
        nombreTransactions: { $sum: 1 },
        chiffreAffaires: { $sum: '$montantTotal' },
        commissionsPerçues: { $sum: '$commissionPlateforme' },
        montantVerseConducteurs: { $sum: '$montantConducteur' },
        fraisTransactionTotal: { $sum: '$fraisTransaction' }
      }
    },
    {
      $sort: { '_id.date': -1, '_id.methode': 1 }
    }
  ]);
};

// ===== MÉTHODES D'INSTANCE EXISTANTES COMPLÉTÉES =====

// Initialiser une transaction CinetPay
paiementSchema.methods.initialiserCinetPay = function(donneesCinetPay) {
  this.cinetpay = {
    ...this.cinetpay,
    ...donneesCinetPay,
    status: 'PENDING',
    tentatives: (this.cinetpay.tentatives || 0) + 1,
    derniereTentative: new Date()
  };
  
  this.ajouterLog('INIT_CINETPAY', {
    transactionId: donneesCinetPay.transactionId,
    montant: this.montantTotal,
    telephone: donneesCinetPay.customerPhone
  }, 'CINETPAY');
  
  return this;
};

// Traiter un webhook CinetPay
paiementSchema.methods.traiterWebhookCinetPay = function(donneesWebhook) {
  this.cinetpay.webhookResponse = donneesWebhook;
  this.cinetpay.operatorTransactionId = donneesWebhook.operator_transaction_id;
  this.cinetpay.paymentMethod = donneesWebhook.payment_method;
  
  if (donneesWebhook.operator_transaction_id) {
    this.referencePaiementMobile = donneesWebhook.operator_transaction_id;
  }
  
  switch (donneesWebhook.status) {
    case 'COMPLETED':
      this.cinetpay.status = 'COMPLETED';
      this.statutPaiement = 'COMPLETE';
      this.cinetpay.paymentDate = new Date();
      break;
    case 'FAILED':
      this.cinetpay.status = 'FAILED';
      this.statutPaiement = 'ECHEC';
      break;
    case 'CANCELLED':
      this.cinetpay.status = 'CANCELLED';
      this.statutPaiement = 'ECHEC';
      break;
  }
  
  this.ajouterLog('WEBHOOK_RECU', donneesWebhook, 'CINETPAY');
  return this;
};

// Créditer dans le portefeuille
paiementSchema.methods.crediterPortefeuille = function() {
  if (this.statutPaiement === 'COMPLETE' && !this.portefeuille.crediteDansPortefeuille) {
    this.portefeuille.crediteDansPortefeuille = true;
    this.portefeuille.dateCreditPortefeuille = new Date();
    this.portefeuille.montantCreditePortefeuille = this.montantConducteur;
    
    this.ajouterLog('CREDIT_PORTEFEUILLE', {
      montant: this.montantConducteur,
      beneficiaire: this.beneficiaireId
    }, 'SYSTEM');
    
    // Vérifier si le solde est encore insuffisant après crédit
    if (!this.verifierSoldeMinimum()) {
      this.programmerNotification('SOLDE_INSUFFISANT', 'BENEFICIAIRE', 'SMS');
    }
    
    return true;
  }
  return false;
};

// Initier un retrait avec frais
paiementSchema.methods.initierRetrait = function(compteDestinataire, delai = '24H') {
  // Calculer les frais de retrait
  const fraisRetrait = this.calculerFraisRetrait(this.montantConducteur);
  
  this.portefeuille.estRetrait = true;
  this.portefeuille.compteDestinataire = compteDestinataire;
  this.portefeuille.statutRetrait = 'EN_ATTENTE';
  this.portefeuille.fraisRetrait = fraisRetrait;
  this.portefeuille.delaiRetrait = delai;
  
  this.ajouterLog('INIT_RETRAIT', {
    compte: compteDestinataire,
    montant: this.montantConducteur,
    frais: fraisRetrait,
    delai
  }, 'USER');
  
  return this;
};

// Calculer les frais de retrait (2% min 100 FCFA)
paiementSchema.methods.calculerFraisRetrait = function(montant) {
  const fraisPercentage = montant * 0.02; // 2%
  return Math.max(fraisPercentage, 100); // Minimum 100 FCFA
};

// Initier une recharge
paiementSchema.methods.initierRecharge = function(methodeRecharge, partenaire = null) {
  this.recharge.estRecharge = true;
  this.recharge.methodeRecharge = methodeRecharge;
  this.recharge.dateRecharge = new Date();
  
  if (partenaire) {
    this.recharge.partenaireAgree = partenaire;
  }
  
  this.ajouterLog('INIT_RECHARGE', {
    methode: methodeRecharge,
    montant: this.montantTotal,
    partenaire: partenaire?.nom
  }, 'USER');
  
  return this;
};

// Vérifier si le paiement peut être remboursé selon les règles
paiementSchema.methods.peutEtreRembourse = function() {
  if (!this.remboursement.estRemboursable) return false;
  
  const statutsRemboursables = ['COMPLETE', 'TRAITE'];
  const methodesRemboursables = ['WAVE', 'ORANGE_MONEY', 'MTN_MONEY', 'MOOV_MONEY', 'VISA', 'MASTERCARD'];
  
  // Vérifier le délai d'annulation gratuite
  const maintenant = new Date();
  const delaiEcoule = (maintenant - this.dateInitiation) / (1000 * 60); // en minutes
  
  if (delaiEcoule > this.remboursement.regleAnnulation.delaiAnnulationGratuite) {
    // Annulation tardive avec frais
    return statutsRemboursables.includes(this.statutPaiement) && 
           methodesRemboursables.includes(this.methodePaiement) &&
           !this.portefeuille.crediteDansPortefeuille;
  }
  
  // Annulation dans les délais
  return statutsRemboursables.includes(this.statutPaiement) && 
         methodesRemboursables.includes(this.methodePaiement);
};

// Calculer le montant de remboursement selon les règles
paiementSchema.methods.calculerMontantRemboursement = function() {
  if (!this.peutEtreRembourse()) return 0;
  
  let montantBase = this.montantTotal;
  
  // Appliquer les règles de remboursement
  switch (this.remboursement.typeRemboursement) {
    case 'INTEGRAL':
      break; // Pas de réduction
    case 'PARTIEL_50':
      montantBase *= 0.5;
      break;
    case 'PARTIEL_25':
      montantBase *= 0.25;
      break;
    case 'NON_REMBOURSABLE':
      return 0;
    default:
      break;
  }
  
  // Vérifier si c'est une annulation tardive
  const maintenant = new Date();
  const delaiEcoule = (maintenant - this.dateInitiation) / (1000 * 60);
  
  if (delaiEcoule > this.remboursement.regleAnnulation.delaiAnnulationGratuite) {
    // Appliquer les frais d'annulation tardive
    const fraisAnnulation = montantBase * this.remboursement.regleAnnulation.fraisAnnulationTardive;
    montantBase -= fraisAnnulation;
  }
  
  return Math.max(montantBase, 0);
};

// Vérifier si une transition de statut est valide
paiementSchema.methods.peutChangerStatut = function(nouveauStatut) {
  const transitionsValides = {
    'EN_ATTENTE': ['TRAITE', 'ECHEC', 'EXPIRE', 'LITIGE'],
    'TRAITE': ['COMPLETE', 'ECHEC', 'LITIGE'],
    'COMPLETE': ['REMBOURSE', 'LITIGE'],
    'ECHEC': ['EN_ATTENTE'],
    'REMBOURSE': [],
    'EXPIRE': ['EN_ATTENTE'],
    'LITIGE': ['COMPLETE', 'ECHEC', 'REMBOURSE']
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
  
  // Limiter à 100 logs max
  if (this.logsTransaction.length > 100) {
    this.logsTransaction = this.logsTransaction.slice(-100);
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
  
  if (this.erreurs.length > 20) {
    this.erreurs = this.erreurs.slice(-20);
  }
};

// Obtenir le résumé complet du paiement
paiementSchema.methods.obtenirResume = function() {
  return {
    id: this._id,
    referenceTransaction: this.referenceTransaction,
    montantTotal: this.montantTotal,
    montantConducteur: this.montantConducteur,
    commissionPlateforme: this.commissionPlateforme,
    methodePaiement: this.methodePaiement,
    statutPaiement: this.statutPaiement,
    dateInitiation: this.dateInitiation,
    dateCompletion: this.dateCompletion,
    cinetpay: {
      transactionId: this.cinetpay.transactionId,
      status: this.cinetpay.status,
      paymentMethod: this.cinetpay.paymentMethod,
      paymentDate: this.cinetpay.paymentDate
    },
    portefeuille: {
      crediteDansPortefeuille: this.portefeuille.crediteDansPortefeuille,
      dateCreditPortefeuille: this.portefeuille.dateCreditPortefeuille,
      soldeInsuffisant: this.soldeInsuffisant
    },
    securite: {
      otpRequis: this.securite.otpRequis,
      otpVerifie: this.securite.otpVerifie
    },
    litige: {
      estEnLitige: this.litige.estEnLitige,
      statutLitige: this.litige.statutLitige,
      numeroLitige: this.litige.numeroLitige
    },
    remboursement: {
      peutEtreRembourse: this.peutEtreRembourse(),
      montantRemboursable: this.calculerMontantRemboursement()
    }
  };
};

// Vérifier l'expiration et marquer comme expiré
paiementSchema.methods.verifierExpiration = function() {
  if (this.estExpire && this.statutPaiement === 'EN_ATTENTE') {
    this.statutPaiement = 'EXPIRE';
    this.cinetpay.status = 'EXPIRED';
    this.ajouterLog('EXPIRATION_AUTOMATIQUE', {
      dateExpiration: this.cinetpay.expirationDate
    }, 'SYSTEM', 'WARNING');
    
    // Programmer notification d'expiration
    this.programmerNotification('EXPIRATION_PAIEMENT', 'PAYEUR', 'SMS');
    
    return true;
  }
  return false;
};

// ===== MÉTHODES STATIQUES COMPLÈTES =====

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

// Obtenir les paiements CinetPay en attente
paiementSchema.statics.obtenirPaiementsCinetPayEnAttente = async function(limiteTempo = 30) {
  const dateLimite = new Date(Date.now() - (limiteTempo * 60 * 1000));
  
  return this.find({
    'cinetpay.transactionId': { $exists: true },
    'cinetpay.status': 'PENDING',
    statutPaiement: 'EN_ATTENTE',
    dateInitiation: { $lte: dateLimite }
  });
};

// Obtenir les paiements expirés
paiementSchema.statics.obtenirPaiementsExpires = async function() {
  const maintenant = new Date();
  
  return this.find({
    'cinetpay.expirationDate': { $lt: maintenant },
    statutPaiement: 'EN_ATTENTE',
    'cinetpay.status': 'PENDING'
  });
};

// Obtenir les paiements à créditer dans le portefeuille
paiementSchema.statics.obtenirPaiementsACrediter = async function() {
  return this.find({
    statutPaiement: 'COMPLETE',
    'portefeuille.crediteDansPortefeuille': false,
    dateCompletion: { $exists: true }
  }).populate('reservationId beneficiaireId');
};

// Obtenir les notifications en attente d'envoi
paiementSchema.statics.obtenirNotificationsEnAttente = async function() {
  return this.find({
    'notifications.typesNotifications': {
      $elemMatch: { envoye: false }
    }
  }).populate('payeurId beneficiaireId');
};

// Export du modèle
const Paiement = mongoose.model('Paiement', paiementSchema);

module.exports = Paiement;