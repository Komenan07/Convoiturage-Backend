// models/Paiement.js
const mongoose = require('mongoose');
const crypto = require('crypto');

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
    min: [0, 'Le montant total doit être positif']
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

  // ===== 🆕 SYSTÈME DE COMMISSION AMÉLIORÉ =====
  commission: {
    taux: {
      type: Number,
      default: 0.10, // 10% par défaut
      min: [0, 'Le taux ne peut être négatif'],
      max: [1, 'Le taux ne peut dépasser 100%']
    },
    tauxOriginal: {
      type: Number,
      default: 0.10 // Taux avant réductions éventuelles
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
        values: ['preleve', 'en_attente', 'echec', 'insuffisant'], // 🆕 Ajout 'insuffisant'
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
    },
    // 🆕 COMMISSION DYNAMIQUE
    typeTarification: {
      type: String,
      enum: ['standard', 'distance_courte', 'distance_longue', 'personnalisee'],
      default: 'standard'
    },
    reductionAppliquee: {
      type: Number,
      default: 0,
      min: 0,
      max: 1 // Pourcentage de réduction (ex: 0.1 = 10% de réduction)
    },
    raisonReduction: String // Ex: "Conducteur 5 étoiles", "Prime fidélité"
  },

  // ===== 🆕 BONUS ET FIDÉLISATION =====
  bonus: {
    bonusRecharge: {
      type: Number,
      default: 0,
      min: 0
    },
    primePerformance: {
      type: Number,
      default: 0,
      min: 0
    },
    primeHebdomadaire: {
      type: Number,
      default: 0,
      min: 0
    },
    detailsBonus: {
      type: String,
      maxlength: 500
    }
  },

  // ===== MÉTHODE DE PAIEMENT =====
  methodePaiement: {
    type: String,
    enum: {
      // 🔧 CORRECTION: Uniformisation à 'ESPECES' (pluriel)
      values: ['ESPECES', 'WAVE', 'ORANGE_MONEY', 'MTN_MONEY', 'MOOV_MONEY', 'COMPTE_RECHARGE'],
      message: 'Méthode de paiement non supportée'
    },
    required: [true, 'La méthode de paiement est requise']
  },

  // ===== 🆕 RÈGLES DE PAIEMENT AMÉLIORÉES =====
  reglesPaiement: {
    conducteurCompteRecharge: {
      type: Boolean,
      required: [true, 'Le statut du compte conducteur est requis']
    },
    soldeConducteurAvant: {
      type: Number,
      default: 0,
      min: 0
    },
    soldeConducteurApres: {
      type: Number,
      min: 0
    },
    soldeMinimumRequis: {
      type: Number,
      default: 1000 // 🆕 1000 FCFA minimum
    },
    soldeSuffisant: {
      type: Boolean,
      default: false
    },
    modesAutorises: [{
      type: String,
      enum: ['especes', 'wave', 'orange_money', 'mtn_money', 'moov_money', 'compte_recharge']
    }],
    raisonValidation: {
      type: String,
      maxlength: 500
    },
    verificationsPassees: {
      type: Boolean,
      default: false
    },
    dateValidation: {
      type: Date,
      default: Date.now
    },
    // 🆕 BLOCAGE SI SOLDE INSUFFISANT
    blocageActif: {
      type: Boolean,
      default: false
    },
    raisonBlocage: String
  },

  // ===== 🆕 GESTION PORTEFEUILLE CONDUCTEUR =====
  portefeuilleConducteur: {
    soldeBloque: {
      type: Number,
      default: 0,
      min: 0,
      comment: 'Montant bloqué en attente de validation du trajet'
    },
    dateDeblocage: Date,
    raisonBlocage: String,
    transactionBlocageId: String
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
    peages: { type: Number, default: 0, min: 0 },
    carburant: { type: Number, default: 0, min: 0 },
    usureVehicule: { type: Number, default: 0, min: 0 }
  },

  // ===== STATUT =====
  statutPaiement: {
    type: String,
    enum: {
      values: ['EN_ATTENTE', 'TRAITE', 'COMPLETE', 'ECHEC', 'REMBOURSE', 'BLOQUE'], // 🆕 Ajout 'BLOQUE'
      message: 'Statut de paiement invalide'
    },
    default: 'EN_ATTENTE',
    index: true
  },

  // ===== DATES =====
  dateInitiation: { type: Date, default: Date.now, index: true },
  dateTraitement: { type: Date },
  dateCompletion: { type: Date },

  // ===== REÇU ET FACTURE =====
  numeroRecu: { type: String, sparse: true, unique: true },
  urlRecu: { type: String },

  // ===== TRAÇABILITÉ =====
  historiqueStatuts: [{
    ancienStatut: String,
    nouveauStatut: String,
    dateChangement: { type: Date, default: Date.now },
    raisonChangement: String,
    utilisateurId: { type: mongoose.Schema.Types.ObjectId, ref: 'Utilisateur' }
  }],

  // ===== MOBILE MONEY =====
  mobileMoney: {
    operateur: {
      type: String,
      enum: ['WAVE', 'ORANGE', 'MTN', 'MOOV']
    },
    numeroTelephone: String,
    transactionId: String,
    codeTransaction: String,
    dateTransaction: Date,
    fraisOperateur: { type: Number, default: 0, min: 0 },
    statutMobileMoney: {
      type: String,
      enum: ['PENDING', 'SUCCESS', 'FAILED', 'TIMEOUT'],
      default: 'PENDING'
    }
  },

  // ===== SÉCURITÉ =====
  securite: {
    empreinteTransaction: { type: String, unique: true },
    ipAddress: String,
    userAgent: String,
    deviceId: String,
    tentativesEchec: { type: Number, default: 0, max: 5 },
    bloqueJusquA: Date
  },

  // ===== LOGS ET ERREURS =====
  logsTransaction: [{
    date: { type: Date, default: Date.now },
    action: { type: String, required: true },
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
    date: { type: Date, default: Date.now },
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

// ===== INDEX =====
paiementSchema.index({ reservationId: 1, payeurId: 1 });
paiementSchema.index({ statutPaiement: 1, dateInitiation: -1 });
paiementSchema.index({ methodePaiement: 1, statutPaiement: 1 });
paiementSchema.index({ 'commission.statutPrelevement': 1 });
paiementSchema.index({ 'reglesPaiement.soldeSuffisant': 1 }); // 🆕

// ===== PROPRIÉTÉS VIRTUELLES =====
paiementSchema.virtual('estComplete').get(function() {
  return this.statutPaiement === 'COMPLETE';
});

paiementSchema.virtual('estPaiementMobile').get(function() {
  return ['WAVE', 'ORANGE_MONEY', 'MTN_MONEY', 'MOOV_MONEY'].includes(this.methodePaiement);
});

paiementSchema.virtual('montantNetConducteur').get(function() {
  return this.montantTotal - this.commission.montant - this.fraisTransaction + 
         (this.bonus.bonusRecharge || 0) + (this.bonus.primePerformance || 0);
});

paiementSchema.virtual('tauxCommissionReel').get(function() {
  return this.montantTotal > 0 ? (this.commission.montant / this.montantTotal) : 0;
});

// ===== 🆕 MÉTHODES AMÉLIORÉES =====

// 🆕 Calculer commission dynamique selon distance et note
paiementSchema.methods.calculerCommissionDynamique = async function(distanceKm, noteConducteur) {
  let tauxBase = 0.10; // 10%
  
  // Tarification selon distance
  if (distanceKm < 10) {
    this.commission.typeTarification = 'distance_courte';
    tauxBase = 0.12; // 12% pour courtes distances
  } else if (distanceKm > 50) {
    this.commission.typeTarification = 'distance_longue';
    tauxBase = 0.08; // 8% pour longues distances
  }
  
  // Réduction selon note du conducteur
  let reductionNote = 0;
  if (noteConducteur >= 4.8) {
    reductionNote = 0.02; // -2% pour excellents conducteurs
    this.commission.raisonReduction = 'Conducteur 5 étoiles';
  } else if (noteConducteur >= 4.5) {
    reductionNote = 0.01; // -1% pour bons conducteurs
    this.commission.raisonReduction = 'Conducteur 4.5+ étoiles';
  }
  
  // Appliquer la réduction
  this.commission.tauxOriginal = tauxBase;
  this.commission.reductionAppliquee = reductionNote;
  this.commission.taux = tauxBase - reductionNote;
  this.commission.montant = Math.round(this.montantTotal * this.commission.taux);
  
  this.commissionPlateforme = this.commission.montant;
  this.montantConducteur = this.montantTotal - this.commission.montant - this.fraisTransaction;
  
  this.ajouterLog('COMMISSION_DYNAMIQUE_CALCULEE', {
    distance: distanceKm,
    noteConducteur,
    tauxBase,
    reductionAppliquee: reductionNote,
    tauxFinal: this.commission.taux,
    montantCommission: this.commission.montant
  });
  
  return this.commission.montant;
};

// 🆕 Valider règles avec vérification du solde
paiementSchema.methods.validerReglesPaiement = async function() {
  try {
    const Reservation = mongoose.model('Reservation');
    
    const reservation = await Reservation.findById(this.reservationId)
      .populate({
        path: 'trajetId',
        populate: {
          path: 'conducteurId',
          select: 'compteCovoiturage noteMoyenne'
        }
      });
    
    if (!reservation) {
      throw new Error('Réservation introuvable');
    }

    const trajet = reservation.trajetId;
    const conducteur = trajet.conducteurId;
    const soldeConducteur = conducteur.compteCovoiturage?.solde || 0;
    const soldeMinimum = 1000; // 1000 FCFA minimum
    
    // Enregistrer le solde avant
    this.reglesPaiement.soldeConducteurAvant = soldeConducteur;
    this.reglesPaiement.soldeMinimumRequis = soldeMinimum;
    
    // 🔴 VÉRIFICATION CRITIQUE : PAIEMENT ESPÈCES
    if (this.methodePaiement === 'ESPECES') {
      
      // Vérifier si compte rechargé
      if (!conducteur.compteCovoiturage?.estRecharge) {
        this.reglesPaiement.verificationsPassees = false;
        this.reglesPaiement.blocageActif = true;
        this.reglesPaiement.raisonBlocage = 'Compte conducteur non rechargé';
        this.reglesPaiement.raisonValidation = 'Le conducteur doit recharger son compte pour accepter les paiements en espèces';
        
        this.statutPaiement = 'BLOQUE';
        
        this.ajouterLog('PAIEMENT_BLOQUE', {
          raison: 'Compte non rechargé',
          methodePaiement: 'ESPECES'
        }, 'SYSTEM', 'WARNING');
        
        return false;
      }
      
      // Vérifier si solde suffisant pour commission
      if (soldeConducteur < soldeMinimum) {
        this.reglesPaiement.soldeSuffisant = false;
        this.reglesPaiement.verificationsPassees = false;
        this.reglesPaiement.blocageActif = true;
        this.reglesPaiement.raisonBlocage = `Solde insuffisant (${soldeConducteur} FCFA < ${soldeMinimum} FCFA)`;
        this.reglesPaiement.raisonValidation = `Le solde du conducteur est insuffisant. Minimum requis : ${soldeMinimum} FCFA`;
        
        this.statutPaiement = 'BLOQUE';
        
        this.ajouterLog('PAIEMENT_BLOQUE', {
          raison: 'Solde insuffisant',
          soldeConducteur,
          soldeMinimum,
          methodePaiement: 'ESPECES'
        }, 'SYSTEM', 'WARNING');
        
        return false;
      }
      
      // Vérifier si solde suffisant pour prélever la commission
      if (soldeConducteur < this.commission.montant) {
        this.reglesPaiement.soldeSuffisant = false;
        this.reglesPaiement.verificationsPassees = false;
        this.reglesPaiement.blocageActif = true;
        this.reglesPaiement.raisonBlocage = `Solde insuffisant pour commission (${soldeConducteur} FCFA < ${this.commission.montant} FCFA)`;
        
        this.commission.statutPrelevement = 'insuffisant';
        this.commission.modePrelevement = 'compte_recharge';
        this.statutPaiement = 'BLOQUE';
        
        this.ajouterLog('COMMISSION_IMPOSSIBLE', {
          raison: 'Solde insuffisant pour prélever commission',
          soldeConducteur,
          commissionRequise: this.commission.montant
        }, 'SYSTEM', 'ERROR');
        
        return false;
      }
      
      // ✅ Tout est OK pour paiement espèces
      this.reglesPaiement.soldeSuffisant = true;
      this.reglesPaiement.verificationsPassees = true;
      this.reglesPaiement.blocageActif = false;
      this.commission.modePrelevement = 'compte_recharge';
      this.reglesPaiement.raisonValidation = 'Paiement en espèces autorisé - Solde suffisant';
      
      this.ajouterLog('VALIDATION_ESPECES_OK', {
        soldeConducteur,
        commissionAPrelever: this.commission.montant,
        soldeApresCommission: soldeConducteur - this.commission.montant
      });
      
    } 
    // 🟢 PAIEMENT NUMÉRIQUE : TOUJOURS AUTORISÉ
    else if (this.estPaiementMobile) {
      this.reglesPaiement.verificationsPassees = true;
      this.reglesPaiement.soldeSuffisant = true; // N'a pas d'importance ici
      this.reglesPaiement.blocageActif = false;
      this.commission.modePrelevement = 'paiement_mobile';
      this.reglesPaiement.raisonValidation = 'Paiement numérique - Commission prélevée automatiquement';
      
      this.ajouterLog('VALIDATION_MOBILE_OK', {
        methodePaiement: this.methodePaiement,
        commissionAPrelever: this.commission.montant
      });
    }
    
    // Modes autorisés
    this.reglesPaiement.modesAutorises = this.obtenirModesAutorisesSelonSolde(soldeConducteur, soldeMinimum);
    this.reglesPaiement.dateValidation = new Date();
    
    return this.reglesPaiement.verificationsPassees;
    
  } catch (error) {
    this.ajouterErreur('VALIDATION_REGLES_ERREUR', error.message);
    return false;
  }
};

// 🆕 Obtenir modes de paiement autorisés selon solde
paiementSchema.methods.obtenirModesAutorisesSelonSolde = function(soldeConducteur, soldeMinimum) {
  const modesNumeriques = ['wave', 'orange_money', 'mtn_money', 'moov_money'];
  
  // Toujours autoriser les modes numériques
  let modes = [...modesNumeriques];
  
  // Autoriser espèces uniquement si solde suffisant
  if (soldeConducteur >= soldeMinimum && soldeConducteur >= this.commission.montant) {
    modes.unshift('especes');
  }
  
  return modes;
};

// 🆕 Traiter commission avec gestion solde
paiementSchema.methods.traiterCommissionApresPayement = async function() {
  try {
    if (this.commission.statutPrelevement === 'preleve') return;

    const Utilisateur = mongoose.model('Utilisateur');
    const conducteur = await Utilisateur.findById(this.beneficiaireId);

    if (this.commission.modePrelevement === 'compte_recharge') {
      // Vérifier à nouveau le solde (sécurité)
      if (conducteur.compteCovoiturage.solde < this.commission.montant) {
        this.commission.statutPrelevement = 'insuffisant';
        this.ajouterErreur('SOLDE_INSUFFISANT', 
          `Solde insuffisant pour prélever commission : ${conducteur.compteCovoiturage.solde} FCFA < ${this.commission.montant} FCFA`
        );
        await this.save();
        return;
      }
      
      // Enregistrer solde avant
      this.reglesPaiement.soldeConducteurAvant = conducteur.compteCovoiturage.solde;
      
      // Prélever commission du compte rechargé
      await conducteur.preleverCommission(
        this.commission.montant,
        this.reservationId,
        this._id
      );
      
      // Enregistrer solde après
      await conducteur.reload(); // Recharger pour avoir le nouveau solde
      this.reglesPaiement.soldeConducteurApres = conducteur.compteCovoiturage.solde;
      
      this.ajouterLog('COMMISSION_PRELEVEE_COMPTE', {
        montant: this.commission.montant,
        conducteurId: this.beneficiaireId,
        soldeAvant: this.reglesPaiement.soldeConducteurAvant,
        soldeApres: this.reglesPaiement.soldeConducteurApres
      });
      
    } else if (this.commission.modePrelevement === 'paiement_mobile') {
      // Commission déjà prélevée lors du paiement mobile money
      this.ajouterLog('COMMISSION_PRELEVEE_MOBILE', {
        montant: this.commission.montant,
        operateur: this.mobileMoney.operateur
      });
    }

    // Créditer les gains au conducteur (montant après commission)
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

// 🆕 Appliquer bonus de recharge
paiementSchema.methods.appliquerBonusRecharge = function(montantRecharge) {
  if (montantRecharge >= 10000) {
    const bonusPourcentage = 0.02; // 2%
    this.bonus.bonusRecharge = Math.round(montantRecharge * bonusPourcentage);
    this.bonus.detailsBonus = `Bonus de recharge de ${bonusPourcentage * 100}% pour rechargement ≥ 10 000 FCFA`;
    
    this.ajouterLog('BONUS_RECHARGE_APPLIQUE', {
      montantRecharge,
      bonusPourcentage,
      montantBonus: this.bonus.bonusRecharge
    });
  }
  return this.bonus.bonusRecharge;
};

// 🆕 Appliquer prime performance
paiementSchema.methods.appliquerPrimePerformance = function(noteMoyenne, nombreTrajetsMois) {
  if (noteMoyenne >= 4.5 && nombreTrajetsMois >= 20) {
    this.bonus.primePerformance = 5000; // 5000 FCFA
    this.bonus.detailsBonus = (this.bonus.detailsBonus || '') + 
      ` | Prime performance : Note ${noteMoyenne}/5, ${nombreTrajetsMois} trajets ce mois`;
    
    this.ajouterLog('PRIME_PERFORMANCE_APPLIQUEE', {
      noteMoyenne,
      nombreTrajetsMois,
      montantPrime: this.bonus.primePerformance
    });
  }
  return this.bonus.primePerformance;
};

// 🆕 Bloquer montant dans portefeuille
paiementSchema.methods.bloquerMontantPortefeuille = async function(montant, raison) {
  this.portefeuilleConducteur.soldeBloque = montant;
  this.portefeuilleConducteur.raisonBlocage = raison;
  this.portefeuilleConducteur.transactionBlocageId = this.referenceTransaction;
  
  this.ajouterLog('MONTANT_BLOQUE', {
    montant,
    raison,
    dateDeblocage: this.portefeuilleConducteur.dateDeblocage
  });
  
  return this.save();
};

// 🆕 Débloquer montant dans portefeuille
paiementSchema.methods.debloquerMontantPortefeuille = async function() {
  const montantDebloque = this.portefeuilleConducteur.soldeBloque;
  this.portefeuilleConducteur.soldeBloque = 0;
  this.portefeuilleConducteur.raisonBlocage = null;
  this.portefeuilleConducteur.transactionBlocageId = null;
  
  this.ajouterLog('MONTANT_DEBLOQUE', {
    montant: montantDebloque
  });
  
  return this.save();
};

// Autres méthodes existantes...
paiementSchema.methods.initierPaiementMobile = function(numeroTelephone, operateur) {
  this.mobileMoney = {
    operateur: operateur.toUpperCase(),
    numeroTelephone,
    statutMobileMoney: 'PENDING',
    dateTransaction: new Date()
  };
  this.commission.modePrelevement = 'paiement_mobile';
  this.ajouterLog('PAIEMENT_MOBILE_INITIE', {
    operateur,
    numero: numeroTelephone.replace(/(.{3})(.*)(.{3})/, '$1***$3'),
    montant: this.montantTotal
  });
  return this;
};

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

paiementSchema.methods.peutChangerStatut = function(nouveauStatut) {
  const transitionsValides = {
    'EN_ATTENTE': ['TRAITE', 'ECHEC', 'REMBOURSE', 'BLOQUE'],
    'TRAITE': ['COMPLETE', 'ECHEC', 'REMBOURSE'],
    'COMPLETE': ['REMBOURSE'],
    'ECHEC': ['EN_ATTENTE'],
    'REMBOURSE': [],
    'BLOQUE': ['EN_ATTENTE', 'ECHEC']
  };
  
  return transitionsValides[this.statutPaiement]?.includes(nouveauStatut) || false;
};

paiementSchema.methods.ajouterLog = function(action, details, source = 'SYSTEM', niveau = 'INFO') {
  this.logsTransaction.push({
    date: new Date(),
    action,
    details,
    source,
    niveau
  });
  
  if (this.logsTransaction.length > 50) {
    this.logsTransaction = this.logsTransaction.slice(-50);
  }
};

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

paiementSchema.methods.obtenirResume = function() {
  return {
    id: this._id,
    referenceTransaction: this.referenceTransaction,
    montantTotal: this.montantTotal,
    montantConducteur: this.montantConducteur,
    commission: {
      montant: this.commission.montant,
      taux: this.commission.taux,
      tauxOriginal: this.commission.tauxOriginal,
      reductionAppliquee: this.commission.reductionAppliquee,
      statutPrelevement: this.commission.statutPrelevement,
      modePrelevement: this.commission.modePrelevement
    },
    bonus: this.bonus,
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
        totalBonus: { $sum: { $add: ['$bonus.bonusRecharge', '$bonus.primePerformance'] } }
      }
    }
  ]);
};

paiementSchema.statics.obtenirCommissionsEnEchec = function() {
  return this.find({
    'commission.statutPrelevement': { $in: ['echec', 'insuffisant'] },
    statutPaiement: 'COMPLETE'
  })
  .populate('beneficiaireId', 'nom prenom email compteCovoiturage')
  .populate('reservationId');
};

// 🆕 Obtenir paiements bloqués
paiementSchema.statics.obtenirPaiementsBloqués = function() {
  return this.find({
    statutPaiement: 'BLOQUE',
    'reglesPaiement.blocageActif': true
  })
  .populate('beneficiaireId', 'nom prenom email compteCovoiturage')
  .populate('reservationId');
};

paiementSchema.statics.statistiquesParModePaiement = async function() {
  return this.aggregate([
    {
      $match: { statutPaiement: 'COMPLETE' }
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
    { $sort: { nombre: -1 } }
  ]);
};

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
        bonusVerses: { $sum: { $add: ['$bonus.bonusRecharge', '$bonus.primePerformance'] } },
        nombreTransactions: { $sum: 1 },
        montantMoyenTransaction: { $avg: '$montantTotal' }
      }
    },
    { $sort: { '_id': 1 } }
  ]);
};

module.exports = mongoose.model('Paiement', paiementSchema);