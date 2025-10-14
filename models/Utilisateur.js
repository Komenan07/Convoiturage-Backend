// models/Utilisateur.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const validator = require('validator');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const utilisateurSchema = new mongoose.Schema({
  // Informations de base
  email: {
    type: String,
    required: [true, 'L\'email est requis'],
    unique: true,
    lowercase: true,
    validate: [validator.isEmail, 'Email invalide'],
    trim: true
  },
  
  telephone: {
    type: String,
    required: [true, 'Le numéro de téléphone est requis'],
    unique: true,
    validate: {
      validator: function(v) {
        // Validation pour numéros ivoiriens (+225 ou 07/05/01)
        return /^(\+225)?[0-9]{8,10}$/.test(v);
      },
      message: 'Numéro de téléphone invalide'
    },
    trim: true
  },
  
  motDePasse: {
    type: String,
    required: [true, 'Le mot de passe est requis'],
    minlength: [8, 'Le mot de passe doit contenir au moins 8 caractères'],
    validate: {
      validator: function(password) {
        // Au moins 1 majuscule, 1 minuscule, 1 chiffre
        return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password);
      },
      message: 'Le mot de passe doit contenir au moins une majuscule, une minuscule et un chiffre'
    },
    select: false // Exclut par défaut le mot de passe des requêtes
  },
  
  nom: {
    type: String,
    required: [true, 'Le nom est requis'],
    trim: true,
    minlength: [2, 'Le nom doit contenir au moins 2 caractères'],
    maxlength: [50, 'Le nom ne peut dépasser 50 caractères']
  },
  
  prenom: {
    type: String,
    required: [true, 'Le prénom est requis'],
    trim: true,
    minlength: [2, 'Le prénom doit contenir au moins 2 caractères'],
    maxlength: [50, 'Le prénom ne peut dépasser 50 caractères']
  },
  
  dateNaissance: {
    type: Date,
    required: false,
    validate: {
      validator: function(date) {
        if (!date) return true;
        const age = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24 * 365);
        return age >= 18 && age <= 80;
      },
      message: 'L\'âge doit être compris entre 18 et 80 ans'
    }
  },
  
  sexe: {
    type: String,
    required: false,
    enum: {
      values: ['M', 'F'],
      message: 'Le sexe doit être M (Masculin) ou F (Féminin)'
    }
  },
  
  photoProfil: {
    type: String,
    default: null
  },

  // Rôle dans l'application de covoiturage
  role: {
    type: String,
    enum: {
      values: ['conducteur', 'passager', 'les_deux', 'admin'],
      message: 'Rôle invalide'
    },
    default: 'passager'
  },

  // Vérification d'identité
  documentIdentite: {
    type: {
      type: String,
      enum: {
        values: ['CNI', 'PASSEPORT'],
        message: 'Type de document invalide'
      }
    },
    numero: {
      type: String,
      validate: {
        validator: function(numero) {
          if (!numero || !this.documentIdentite?.type) return true;
          
          if (this.documentIdentite.type === 'CNI') {
            return /^[A-Z]{2}[0-9]{8}$/.test(numero);
          } else if (this.documentIdentite.type === 'PASSEPORT') {
            return /^[A-Z0-9]{6,9}$/.test(numero);
          }
          return true;
        },
        message: 'Numéro de document invalide'
      }
    },
    photoDocument: {
      type: String,
      default: null
    },
    statutVerification: {
      type: String,
      enum: ['EN_ATTENTE', 'VERIFIE', 'REJETE'],
      default: 'EN_ATTENTE'
    },
    dateVerification: Date,
    verificateurId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Administrateur'
    },
    raisonRejet: String
  },

  // Localisation
  adresse: {
    commune: {
      type: String,
      required: false,
      trim: true
    },
    quartier: {
      type: String,
      required: false,
      trim: true
    },
    ville: {
      type: String,
      required: false,  // ← Rendre optionnel
      trim: true,
      default: 'Abidjan'
    },
    coordonnees: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point'
      },
      coordinates: {
        type: [Number],
        required: false,
        default: [-4.0305, 5.3598],
        validate: {
          validator: function(coords) {
            if (!coords || coords.length === 0) return true;
            return coords.length === 2 && 
                   coords[0] >= -180 && coords[0] <= 180 &&
                   coords[1] >= -90 && coords[1] <= 90;
          },
          message: 'Coordonnées invalides'
        }
      }
    }
  },

  // Préférences utilisateur
  preferences: {
    musique: {
      type: Boolean,
      default: true
    },
    climatisation: {
      type: Boolean,
      default: true
    },
    conversation: {
      type: String,
      enum: {
        values: ['BAVARD', 'CALME', 'NEUTRE'],
        message: 'Préférence de conversation invalide'
      },
      default: 'NEUTRE'
    },
    languePreferee: {
      type: String,
      enum: {
        values: ['FR', 'ANG'],
        message: 'Langue préférée invalide'
      },
      default: 'FR'
    }
  },

  // Contacts d'urgence
  contactsUrgence: [{
    nom: {
      type: String,
      required: [true, 'Le nom du contact d\'urgence est requis'],
      trim: true,
      maxlength: [50, 'Le nom ne peut dépasser 50 caractères']
    },
    telephone: {
      type: String,
      required: [true, 'Le téléphone du contact d\'urgence est requis'],
      validate: {
        validator: function(v) {
          return /^(\+225)?[0-9]{8,10}$/.test(v);
        },
        message: 'Numéro de téléphone du contact invalide'
      }
    },
    relation: {
      type: String,
      required: [true, 'La relation avec le contact est requise'],
      enum: {
        values: ['FAMILLE', 'AMI', 'COLLEGUE'],
        message: 'Relation invalide'
      }
    }
  }],

  // Réputation et statistiques
  scoreConfiance: {
    type: Number,
    min: [0, 'Le score de confiance ne peut être inférieur à 0'],
    max: [100, 'Le score de confiance ne peut dépasser 100'],
    default: 50
  },
  
  nombreTrajetsEffectues: {
    type: Number,
    min: [0, 'Le nombre de trajets ne peut être négatif'],
    default: 0
  },
  
  nombreTrajetsAnnules: {
    type: Number,
    min: [0, 'Le nombre d\'annulations ne peut être négatif'],
    default: 0
  },
  
  noteGenerale: {
    type: Number,
    min: [0, 'La note ne peut être inférieure à 0'],
    max: [5, 'La note ne peut dépasser 5'],
    default: 0
  },
  
  badges: [{
    type: String,
    enum: [
      'PONCTUEL', 
      'PROPRE', 
      'SYMPATHIQUE', 
      'CONDUCTEUR_SECURISE',
      'COMMUNICATIF',
      'RESPECTUEUX',
      'ECO_CONDUITE',
      'NOUVEAU',
      'VETERAN',
      'TOP_RATED'
    ]
  }],

  // ===== NOUVEAU : SYSTÈME DE COMPTE COVOITURAGE (REMPLACEMENT DU PORTEFEUILLE) =====
  compteCovoiturage: {
    // Solde du compte rechargé (pour conducteurs)
    solde: { 
      type: Number, 
      default: 0,
      min: [0, 'Le solde ne peut être négatif']
    },
    
    // Indique si le conducteur a rechargé son compte
    estRecharge: { 
      type: Boolean, 
      default: false 
    },
    
    // Seuil minimum pour accepter des courses
    seuilMinimum: { 
      type: Number, 
      default: 0 
    },
    
    // Historique des recharges
    historiqueRecharges: [{
      montant: {
        type: Number,
        required: true,
        min: [0, 'Le montant doit être positif']
      },
      date: {
        type: Date,
        default: Date.now
      },
      methodePaiement: {
        type: String,
        enum: ['wave', 'orange_money', 'mtn_money', 'moov_money'],
        required: true
      },
      referenceTransaction: {
        type: String,
        required: true
      },
      statut: {
        type: String,
        enum: ['reussi', 'echec', 'en_attente'],
        default: 'en_attente'
      },
      fraisTransaction: {
        type: Number,
        default: 0
      }
    }],
    
    // Statistiques financières
    totalCommissionsPayees: { 
      type: Number, 
      default: 0 
    },
    totalGagnes: { 
      type: Number, 
      default: 0 
    },
    dernierPaiementRecu: Date,
    dernierPrelevementCommission: Date,
    
    // Paramètres de compte
    modeAutoRecharge: {
      active: { 
        type: Boolean, 
        default: false 
      },
      seuilAutoRecharge: {
        type: Number,
        min: [0, 'Le seuil doit être positif']
      },
      montantAutoRecharge: {
        type: Number,
        min: [1000, 'Le montant minimum est 1000 FCFA']
      },
      methodePaiementAuto: {
        type: String,
        enum: ['wave', 'orange_money', 'mtn_money', 'moov_money']
      }
    },
    
    // Historique des commissions prélevées
    historiqueCommissions: [{
      montant: Number,
      date: Date,
      trajetId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Trajet'
      },
      reservationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Reservation'
      },
      typePrelevement: {
        type: String,
        enum: ['compte_recharge', 'paiement_mobile']
      },
      statut: {
        type: String,
        enum: ['preleve', 'echec', 'rembourse'],
        default: 'preleve'
      }
    }],
    
    // Paramètres de retrait des gains
    parametresRetrait: {
      numeroMobile: {
        type: String,
        validate: {
          validator: function(v) {
            return !v || /^(\+225)?[0-9]{8,10}$/.test(v);
          },
          message: 'Numéro de téléphone invalide'
        }
      },
      operateur: { 
        type: String, 
        enum: {
          values: ['ORANGE', 'MTN', 'MOOV'],
          message: 'Opérateur non supporté'
        }
      },
      nomTitulaire: {
        type: String,
        trim: true,
        maxlength: [100, 'Le nom du titulaire ne peut dépasser 100 caractères']
      }
    },
    
    // Limites et sécurité
    limites: {
      retraitJournalier: {
        type: Number,
        default: 1000000 // 1 million FCFA
      },
      retraitMensuel: {
        type: Number,
        default: 5000000 // 5 millions FCFA
      },
      dernierRetraitLe: Date,
      montantRetireAujourdhui: {
        type: Number,
        default: 0
      },
      montantRetireCeMois: {
        type: Number,
        default: 0
      }
    }
  },

  // Véhicule (pour conducteurs)
  vehicule: {
    marque: {
      type: String,
      trim: true
    },
    modele: {
      type: String,
      trim: true
    },
    couleur: {
      type: String,
      trim: true
    },
    immatriculation: {
      type: String,
      trim: true,
      uppercase: true
    },
    nombrePlaces: {
      type: Number,
      min: [1, 'Le nombre de places doit être au moins 1'],
      max: [8, 'Le nombre de places ne peut dépasser 8']
    },
    photoVehicule: {
      type: String,
      default: null
    },
    assurance: {
      numeroPolice: String,
      dateExpiration: Date,
      compagnie: String
    },
    visiteTechnique: {
      dateExpiration: Date,
      certificatUrl: String
    }
  },

  // Statut du compte
  statutCompte: {
    type: String,
    enum: {
      values: ['ACTIF', 'SUSPENDU', 'BLOQUE', 'EN_ATTENTE_VERIFICATION'],
      message: 'Statut de compte invalide'
    },
    default: 'EN_ATTENTE_VERIFICATION'
  },
  
  dateInscription: {
    type: Date,
    default: Date.now
  },
  
  derniereConnexion: {
    type: Date,
    default: Date.now
  },
  
  estVerifie: {
    type: Boolean,
    default: false
  },

  // Confirmation d'email
  tokenConfirmationEmail: {
    type: String,
    select: false
  },
  expirationTokenConfirmation: {
    type: Date,
    select: false
  },
  emailConfirmeLe: {
    type: Date,
    default: null
  },

  // Reset password
  tokenResetMotDePasse: {
    type: String,
    select: false
  },
  expirationTokenReset: {
    type: Date,
    select: false
  },
  
  tentativesConnexionEchouees: {
    type: Number,
    default: 0
  },
  compteBloqueLe: Date,
  derniereTentativeConnexion: Date,
  
  // Historique des modifications importantes
  historiqueStatuts: [{
    ancienStatut: String,
    nouveauStatut: String,
    raison: String,
    dateModification: {
      type: Date,
      default: Date.now
    },
    administrateurId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Administrateur'
    }
  }]

}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// INDEX
utilisateurSchema.index({ 'adresse.coordonnees': '2dsphere' }, { sparse: true });
utilisateurSchema.index({ email: 1, statutCompte: 1 });
utilisateurSchema.index({ telephone: 1, statutCompte: 1 });
utilisateurSchema.index({ nom: 1, prenom: 1 });
utilisateurSchema.index({ role: 1 });

// INDEX COMPTE COVOITURAGE
utilisateurSchema.index({ 'compteCovoiturage.estRecharge': 1 });
utilisateurSchema.index({ 'compteCovoiturage.solde': -1 });
utilisateurSchema.index({ 'compteCovoiturage.historiqueRecharges.date': -1 });

// VIRTUALS
utilisateurSchema.virtual('nomComplet').get(function() {
  return `${this.prenom} ${this.nom}`;
});

utilisateurSchema.virtual('age').get(function() {
  if (!this.dateNaissance) return null;
  return Math.floor((Date.now() - this.dateNaissance.getTime()) / (1000 * 60 * 60 * 24 * 365));
});

utilisateurSchema.virtual('tauxAnnulation').get(function() {
  if (this.nombreTrajetsEffectues === 0) return 0;
  return Math.round((this.nombreTrajetsAnnules / (this.nombreTrajetsEffectues + this.nombreTrajetsAnnules)) * 100);
});

utilisateurSchema.virtual('estDocumentVerifie').get(function() {
  return this.documentIdentite && this.documentIdentite.statutVerification === 'VERIFIE';
});

// NOUVEAUX VIRTUALS COMPTE COVOITURAGE
utilisateurSchema.virtual('peutAccepterCourses').get(function() {
  return this.role === 'conducteur' || this.role === 'les_deux';
});

utilisateurSchema.virtual('compteRechargeActif').get(function() {
  return this.compteCovoiturage.estRecharge && this.compteCovoiturage.solde >= this.compteCovoiturage.seuilMinimum;
});

utilisateurSchema.virtual('soldeDisponible').get(function() {
  return this.compteCovoiturage.solde;
});

utilisateurSchema.virtual('peutRetirerGains').get(function() {
  return this.compteCovoiturage.totalGagnes > 0 && 
         this.compteCovoiturage.parametresRetrait.numeroMobile &&
         this.compteCovoiturage.parametresRetrait.operateur;
});

// MIDDLEWARE PRE-SAVE
utilisateurSchema.pre('save', function(next) {
  // Mettre à jour le statut de vérification
  if (this.isModified('documentIdentite.statutVerification')) {
    if (this.documentIdentite.statutVerification === 'VERIFIE') {
      this.estVerifie = true;
      if (this.statutCompte === 'EN_ATTENTE_VERIFICATION') {
        this.statutCompte = 'ACTIF';
      }
    }
  }

  // Middleware pour compte covoiturage
  if (this.isModified('compteCovoiturage.historiqueRecharges')) {
    // Vérifier s'il y a une recharge réussie
    const rechargeReussie = this.compteCovoiturage.historiqueRecharges.some(r => r.statut === 'reussi');
    if (rechargeReussie && !this.compteCovoiturage.estRecharge) {
      this.compteCovoiturage.estRecharge = true;
    }
  }

  // Réinitialiser les limites quotidiennes et mensuelles
  const maintenant = new Date();
  const dernierRetrait = this.compteCovoiturage.limites.dernierRetraitLe;
  
  if (dernierRetrait) {
    // Réinitialiser quotidien
    if (maintenant.toDateString() !== dernierRetrait.toDateString()) {
      this.compteCovoiturage.limites.montantRetireAujourdhui = 0;
    }
    
    // Réinitialiser mensuel
    if (maintenant.getMonth() !== dernierRetrait.getMonth() || 
        maintenant.getFullYear() !== dernierRetrait.getFullYear()) {
      this.compteCovoiturage.limites.montantRetireCeMois = 0;
    }
  }

  next();
});

// MÉTHODES D'INSTANCE EXISTANTES
utilisateurSchema.methods.peutSeConnecter = function() {
  const maintenant = new Date();
  
  switch (this.statutCompte) {
    case 'BLOQUE':
      return { autorise: false, raison: 'Compte bloqué définitivement' };
    
    case 'SUSPENDU':
      return { autorise: false, raison: 'Compte suspendu' };
    
    case 'EN_ATTENTE_VERIFICATION':
      return { autorise: false, raison: 'Email non confirmé', action: 'CONFIRMER_EMAIL' };
    
    case 'ACTIF':
      if (this.compteBloqueLe && this.tentativesConnexionEchouees >= 5) {
        const tempsEcoule = maintenant - this.compteBloqueLe;
        const dureeBloquage = 15 * 60 * 1000;
        
        if (tempsEcoule < dureeBloquage) {
          return {
            autorise: false,
            raison: 'Compte temporairement bloqué',
            deblocageA: new Date(this.compteBloqueLe.getTime() + dureeBloquage)
          };
        } else {
          this.tentativesConnexionEchouees = 0;
          this.compteBloqueLe = null;
        }
      }
      return { autorise: true };
    
    default:
      return { autorise: false, raison: 'Statut de compte invalide' };
  }
};

utilisateurSchema.methods.verifierMotDePasse = async function(motDePasseCandidat) {
  if (!this.motDePasse) {
    throw new Error('Mot de passe non défini pour cet utilisateur');
  }
  return await bcrypt.compare(motDePasseCandidat, this.motDePasse);
};

utilisateurSchema.methods.getSignedJwtToken = function() {
  return jwt.sign(
    { 
      userId: this._id,
      email: this.email,
      role: this.role
    },
    process.env.JWT_SECRET || 'votre-cle-secrete-super-longue-et-complexe',
    {
      expiresIn: process.env.JWT_EXPIRE || '7d'
    }
  );
};

utilisateurSchema.methods.getEmailConfirmationToken = function() {
  const confirmationToken = crypto.randomBytes(32).toString('hex');
  
  this.tokenConfirmationEmail = crypto
    .createHash('sha256')
    .update(confirmationToken)
    .digest('hex');
    
  this.expirationTokenConfirmation = Date.now() + 24 * 60 * 60 * 1000;
  
  return confirmationToken;
};

// ===== NOUVELLES MÉTHODES COMPTE COVOITURAGE =====

// Recharger le compte conducteur
utilisateurSchema.methods.rechargerCompte = function(montant, methodePaiement, referenceTransaction, fraisTransaction = 0) {
  if (montant <= 0) {
    throw new Error('Le montant doit être positif');
  }

  if (!['wave', 'orange_money', 'mtn_money', 'moov_money'].includes(methodePaiement)) {
    throw new Error('Méthode de paiement non supportée');
  }

  // Ajouter la recharge à l'historique
  this.compteCovoiturage.historiqueRecharges.push({
    montant,
    methodePaiement,
    referenceTransaction,
    fraisTransaction,
    statut: 'en_attente'
  });

  return this.save();
};

// Confirmer une recharge
utilisateurSchema.methods.confirmerRecharge = function(referenceTransaction, statut = 'reussi') {
  const recharge = this.compteCovoiturage.historiqueRecharges.find(
    r => r.referenceTransaction === referenceTransaction && r.statut === 'en_attente'
  );

  if (!recharge) {
    throw new Error('Recharge introuvable ou déjà traitée');
  }

  recharge.statut = statut;

  if (statut === 'reussi') {
    // Créditer le solde (montant net après frais)
    const montantNet = recharge.montant - recharge.fraisTransaction;
    this.compteCovoiturage.solde += montantNet;
    this.compteCovoiturage.estRecharge = true;
  }

  return this.save();
};

// Prélever commission du compte rechargé
utilisateurSchema.methods.preleverCommission = function(montant, trajetId, reservationId) {
  if (montant <= 0) {
    throw new Error('Le montant de commission doit être positif');
  }

  if (!this.compteCovoiturage.estRecharge) {
    throw new Error('Le compte n\'est pas rechargé');
  }

  if (this.compteCovoiturage.solde < montant) {
    throw new Error('Solde insuffisant pour prélever la commission');
  }

  // Débiter le solde
  this.compteCovoiturage.solde -= montant;
  this.compteCovoiturage.totalCommissionsPayees += montant;
  this.compteCovoiturage.dernierPrelevementCommission = new Date();

  // Ajouter à l'historique des commissions
  this.compteCovoiturage.historiqueCommissions.push({
    montant,
    date: new Date(),
    trajetId,
    reservationId,
    typePrelevement: 'compte_recharge',
    statut: 'preleve'
  });

  return this.save();
};

// Créditer les gains du conducteur
utilisateurSchema.methods.crediterGains = function(montant, trajetId, reservationId) {
  if (montant <= 0) {
    throw new Error('Le montant des gains doit être positif');
  }

  this.compteCovoiturage.totalGagnes += montant;
  this.compteCovoiturage.dernierPaiementRecu = new Date();

  // Ajouter un historique des gains pour traçabilité
  this.compteCovoiturage.historiqueCommissions.push({
    montant,
    date: new Date(),
    trajetId,
    reservationId,
    typePrelevement: 'gain_course',
    statut: 'complete'
  });

  return this.save();
};

// Vérifier si le conducteur peut accepter des courses
utilisateurSchema.methods.peutAccepterCourse = function(modePaiementDemande) {
  // Vérifier le rôle
  if (this.role !== 'conducteur' && this.role !== 'les_deux') {
    return {
      autorise: false,
      raison: 'Utilisateur non autorisé comme conducteur'
    };
  }

  // Vérifier le statut du compte
  if (this.statutCompte !== 'ACTIF') {
    return {
      autorise: false,
      raison: 'Compte non actif'
    };
  }

  // Règles selon le type de compte
  if (this.compteCovoiturage.estRecharge) {
    // Compte rechargé: tous modes acceptés
    return { autorise: true, modesAcceptes: ['especes', 'wave', 'orange_money', 'mtn_money', 'moov_money'] };
  } else {
    // Compte non rechargé: seulement mobile money
    if (modePaiementDemande === 'especes') {
      return {
        autorise: false,
        raison: 'Paiement en espèces non autorisé pour les comptes non rechargés',
        modesAcceptes: ['wave', 'orange_money', 'mtn_money', 'moov_money']
      };
    }
    return { autorise: true, modesAcceptes: ['wave', 'orange_money', 'mtn_money', 'moov_money'] };
  }
};

// Configurer les paramètres de retrait
utilisateurSchema.methods.configurerRetraitGains = function(numeroMobile, operateur, nomTitulaire) {
  // Validation du numéro selon l'opérateur
  const regexOperateurs = {
    'ORANGE': /^(\+225)?07[0-9]{8}$/,
    'MTN': /^(\+225)?05[0-9]{8}$/,
    'MOOV': /^(\+225)?01[0-9]{8}$/
  };
  
  if (!regexOperateurs[operateur] || !regexOperateurs[operateur].test(numeroMobile)) {
    throw new Error(`Numéro de téléphone invalide pour l'opérateur ${operateur}`);
  }
  
  this.compteCovoiturage.parametresRetrait = {
    numeroMobile,
    operateur,
    nomTitulaire
  };
  
  return this.save();
};

// Obtenir le résumé du compte covoiturage
utilisateurSchema.methods.obtenirResumeCompte = function() {
  const maintenant = new Date();
  const debutMois = new Date(maintenant.getFullYear(), maintenant.getMonth(), 1);
  
  const rechargesCeMois = this.compteCovoiturage.historiqueRecharges.filter(r => 
    r.date >= debutMois && r.statut === 'reussi'
  );
  
  const commissionsCeMois = this.compteCovoiturage.historiqueCommissions.filter(c => 
    c.date >= debutMois && c.statut === 'preleve'
  );

  return {
    solde: this.compteCovoiturage.solde,
    estRecharge: this.compteCovoiturage.estRecharge,
    totalGagnes: this.compteCovoiturage.totalGagnes,
    totalCommissionsPayees: this.compteCovoiturage.totalCommissionsPayees,
    nombreRecharges: this.compteCovoiturage.historiqueRecharges.filter(r => r.statut === 'reussi').length,
    nombreCommissions: this.compteCovoiturage.historiqueCommissions.length,
    statistiquesMois: {
      rechargesEffectuees: rechargesCeMois.length,
      montantRecharge: rechargesCeMois.reduce((sum, r) => sum + r.montant, 0),
      commissionsPayees: commissionsCeMois.reduce((sum, c) => sum + c.montant, 0),
      nombreCoursesCommission: commissionsCeMois.length
    },
    parametresRetrait: this.compteCovoiturage.parametresRetrait,
    peutRetirerGains: this.peutRetirerGains,
    peutAccepterCourses: this.peutAccepterCourses,
    compteRechargeActif: this.compteRechargeActif
  };
};

// Obtenir l'historique des recharges
utilisateurSchema.methods.obtenirHistoriqueRecharges = function(options = {}) {
  const { statut = null, limit = 20, dateDebut = null, dateFin = null } = options;
  
  let historique = [...this.compteCovoiturage.historiqueRecharges];
  
  // Filtrer par statut
  if (statut) {
    historique = historique.filter(r => r.statut === statut);
  }
  
  // Filtrer par date
  if (dateDebut) {
    historique = historique.filter(r => r.date >= new Date(dateDebut));
  }
  
  if (dateFin) {
    historique = historique.filter(r => r.date <= new Date(dateFin));
  }
  
  // Trier par date décroissante et limiter
  return historique
    .sort((a, b) => b.date - a.date)
    .slice(0, limit);
};

// Obtenir l'historique des commissions
utilisateurSchema.methods.obtenirHistoriqueCommissions = function(options = {}) {
  const { statut = null, limit = 20, dateDebut = null, dateFin = null } = options;
  
  let historique = [...this.compteCovoiturage.historiqueCommissions];
  
  // Filtrer par statut
  if (statut) {
    historique = historique.filter(c => c.statut === statut);
  }
  
  // Filtrer par date
  if (dateDebut) {
    historique = historique.filter(c => c.date >= new Date(dateDebut));
  }
  
  if (dateFin) {
    historique = historique.filter(c => c.date <= new Date(dateFin));
  }
  
  // Trier par date décroissante et limiter
  return historique
    .sort((a, b) => b.date - a.date)
    .slice(0, limit);
};

// Configurer la recharge automatique
utilisateurSchema.methods.configurerAutoRecharge = function(seuilAutoRecharge, montantAutoRecharge, methodePaiementAuto) {
  // Validations
  if (seuilAutoRecharge < 0) {
    throw new Error('Le seuil de recharge automatique ne peut être négatif');
  }
  
  if (montantAutoRecharge < 1000) {
    throw new Error('Le montant minimum de recharge automatique est 1000 FCFA');
  }
  
  if (!['wave', 'orange_money', 'mtn_money', 'moov_money'].includes(methodePaiementAuto)) {
    throw new Error('Méthode de paiement automatique non supportée');
  }
  
  this.compteCovoiturage.modeAutoRecharge = {
    active: true,
    seuilAutoRecharge,
    montantAutoRecharge,
    methodePaiementAuto
  };
  
  return this.save();
};

// Désactiver la recharge automatique
utilisateurSchema.methods.desactiverAutoRecharge = function() {
  this.compteCovoiturage.modeAutoRecharge.active = false;
  return this.save();
};

// Vérifier si une recharge automatique est nécessaire
utilisateurSchema.methods.verifierAutoRecharge = function() {
  const autoRecharge = this.compteCovoiturage.modeAutoRecharge;
  
  if (!autoRecharge.active) {
    return { necessite: false };
  }
  
  if (this.compteCovoiturage.solde <= autoRecharge.seuilAutoRecharge) {
    return {
      necessite: true,
      montant: autoRecharge.montantAutoRecharge,
      methodePaiement: autoRecharge.methodePaiementAuto,
      soldeActuel: this.compteCovoiturage.solde,
      seuil: autoRecharge.seuilAutoRecharge
    };
  }
  
  return { necessite: false };
};

// ===== MÉTHODES STATIQUES =====

// Rechercher par proximité
utilisateurSchema.statics.rechercherParProximite = function(longitude, latitude, rayonKm = 10) {
  return this.find({
    'adresse.coordonnees': {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: [longitude, latitude]
        },
        $maxDistance: rayonKm * 1000
      }
    },
    statutCompte: 'ACTIF'
  });
};

// Statistiques globales
utilisateurSchema.statics.statistiquesGlobales = async function() {
  const stats = await this.aggregate([
    {
      $group: {
        _id: null,
        totalUtilisateurs: { $sum: 1 },
        utilisateursActifs: {
          $sum: { $cond: [{ $eq: ['$statutCompte', 'ACTIF'] }, 1, 0] }
        },
        utilisateursVerifies: {
          $sum: { $cond: ['$estVerifie', 1, 0] }
        },
        conducteurs: {
          $sum: { $cond: [{ $in: ['$role', ['conducteur', 'les_deux']] }, 1, 0] }
        },
        passagers: {
          $sum: { $cond: [{ $in: ['$role', ['passager', 'les_deux']] }, 1, 0] }
        },
        scoreConfianceMoyen: { $avg: '$scoreConfiance' }
      }
    }
  ]);
  
  return stats[0] || {};
};

// Statistiques des comptes covoiturage
utilisateurSchema.statics.statistiquesComptesCovoiturage = async function() {
  return this.aggregate([
    {
      $match: {
        role: { $in: ['conducteur', 'les_deux'] }
      }
    },
    {
      $group: {
        _id: null,
        totalConducteurs: { $sum: 1 },
        comptesRecharges: {
          $sum: { $cond: ['$compteCovoiturage.estRecharge', 1, 0] }
        },
        soldeTotalComptes: { $sum: '$compteCovoiturage.solde' },
        soldeMoyen: { $avg: '$compteCovoiturage.solde' },
        totalGagnesGlobal: { $sum: '$compteCovoiturage.totalGagnes' },
        totalCommissionsGlobal: { $sum: '$compteCovoiturage.totalCommissionsPayees' },
        nombreTotalRecharges: { $sum: { $size: '$compteCovoiturage.historiqueRecharges' } }
      }
    }
  ]);
};

// Obtenir les conducteurs avec solde élevé
utilisateurSchema.statics.obtenirConducteursSoldeEleve = function(seuilSolde = 100000) {
  return this.find({
    role: { $in: ['conducteur', 'les_deux'] },
    'compteCovoiturage.solde': { $gte: seuilSolde },
    statutCompte: 'ACTIF'
  })
  .select('nom prenom email compteCovoiturage.solde compteCovoiturage.totalGagnes')
  .sort({ 'compteCovoiturage.solde': -1 });
};

// Obtenir les conducteurs avec commissions élevées
utilisateurSchema.statics.obtenirConducteursCommissionsElevees = function(seuilCommissions = 50000) {
  return this.find({
    role: { $in: ['conducteur', 'les_deux'] },
    'compteCovoiturage.totalCommissionsPayees': { $gte: seuilCommissions },
    statutCompte: 'ACTIF'
  })
  .select('nom prenom email compteCovoiturage.totalCommissionsPayees compteCovoiturage.totalGagnes')
  .sort({ 'compteCovoiturage.totalCommissionsPayees': -1 });
};

// Obtenir les conducteurs inactifs (sans recharge depuis X jours)
utilisateurSchema.statics.obtenirConducteursInactifs = function(joursInactivite = 30) {
  const dateLimit = new Date();
  dateLimit.setDate(dateLimit.getDate() - joursInactivite);
  
  return this.find({
    role: { $in: ['conducteur', 'les_deux'] },
    $or: [
      { 'compteCovoiturage.historiqueRecharges': { $size: 0 } },
      {
        'compteCovoiturage.historiqueRecharges': {
          $not: {
            $elemMatch: {
              date: { $gte: dateLimit },
              statut: 'reussi'
            }
          }
        }
      }
    ],
    statutCompte: 'ACTIF'
  })
  .select('nom prenom email derniereConnexion compteCovoiturage.estRecharge');
};

// Hash password avant sauvegarde
utilisateurSchema.pre('save', async function(next) {
  // Hash password si modifié
  if (this.isModified('motDePasse')) {
    const salt = await bcrypt.genSalt(12);
    this.motDePasse = await bcrypt.hash(this.motDePasse, salt);
  }

  // Autres middleware existants...
  if (this.isModified('documentIdentite.statutVerification')) {
    if (this.documentIdentite.statutVerification === 'VERIFIE') {
      this.estVerifie = true;
      if (this.statutCompte === 'EN_ATTENTE_VERIFICATION') {
        this.statutCompte = 'ACTIF';
      }
    }
  }

  if (this.isModified('compteCovoiturage.historiqueRecharges')) {
    const rechargeReussie = this.compteCovoiturage.historiqueRecharges.some(r => r.statut === 'reussi');
    if (rechargeReussie && !this.compteCovoiturage.estRecharge) {
      this.compteCovoiturage.estRecharge = true;
    }
  }

  const maintenant = new Date();
  const dernierRetrait = this.compteCovoiturage.limites.dernierRetraitLe;
  
  if (dernierRetrait) {
    if (maintenant.toDateString() !== dernierRetrait.toDateString()) {
      this.compteCovoiturage.limites.montantRetireAujourdhui = 0;
    }
    
    if (maintenant.getMonth() !== dernierRetrait.getMonth() || 
        maintenant.getFullYear() !== dernierRetrait.getFullYear()) {
      this.compteCovoiturage.limites.montantRetireCeMois = 0;
    }
  }

  next();
});

// Export du modèle
module.exports = mongoose.model('Utilisateur', utilisateurSchema, 'utilisateurs');