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
    required: false, // Rendre optionnel pour l'inscription
    validate: {
      validator: function(date) {
        if (!date) return true; // Permettre l'absence de date
        const age = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24 * 365);
        return age >= 18 && age <= 80;
      },
      message: 'L\'âge doit être compris entre 18 et 80 ans'
    }
  },
  
  sexe: {
    type: String,
    required: false, // Rendre optionnel pour l'inscription
    enum: {
      values: ['M', 'F'],
      message: 'Le sexe doit être M (Masculin) ou F (Féminin)'
    }
  },
  
  photoProfil: {
    type: String,
    default:null
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
          if (!numero || !this.documentIdentite.type) return true;
          
          if (this.documentIdentite.type === 'CNI') {
            // Format CNI ivoirienne
            return /^[A-Z]{2}[0-9]{8}$/.test(numero);
          } else if (this.documentIdentite.type === 'PASSEPORT') {
            // Format passeport
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
    raisonRejet: String // Ajouté pour expliquer le rejet
  },

  // Localisation
  adresse: {
    commune: {
      type: String,
      required: false, // Rendre optionnel pour l'inscription
      trim: true
    },
    quartier: {
      type: String,
      required: false, // Rendre optionnel pour l'inscription
      trim: true
    },
    ville: {
      type: String,
      required: [true, 'La ville est requise'],
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
        type: [Number], // [longitude, latitude]
        required: false, // Rendre optionnel
        default: undefined, // Pas de valeur par défaut
        validate: {
          validator: function(coords) {
            if (!coords || coords.length === 0) return true; // Permettre l'absence de coordonnées
            return coords.length === 2 && 
                   coords[0] >= -180 && coords[0] <= 180 && // longitude
                   coords[1] >= -90 && coords[1] <= 90;     // latitude
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

  // Confirmation d'email (NOUVEAUX CHAMPS)
  tokenConfirmationEmail: {
    type: String,
    select: false // N'inclus pas ce champ par défaut dans les requêtes
  },
  expirationTokenConfirmation: {
    type: Date,
    select: false
  },
  emailConfirmeLe: {
    type: Date,
    default: null
  },

  // Champs pour reset password
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
  }],

  // Champ role ajouté
  role: {
    type: String,
    enum: ['utilisateur', 'admin'],
    default: 'utilisateur'
  },

  // ===== NOUVEAU : PORTEFEUILLE CINETPAY =====
  portefeuille: {
    solde: { 
      type: Number, 
      default: 0,
      min: [0, 'Le solde ne peut être négatif']
    },
    soldeBloquer: { 
      type: Number, 
      default: 0,
      min: [0, 'Le solde bloqué ne peut être négatif']
    }, // Argent en attente de retrait
    
    // Paramètres de retrait
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
    
    // Historique des transactions
    historique: [{
      type: { 
        type: String, 
        enum: ['CREDIT', 'DEBIT', 'RETRAIT', 'REMBOURSEMENT'],
        required: true
      },
      montant: { 
        type: Number, 
        required: true,
        min: [0, 'Le montant doit être positif']
      },
      description: {
        type: String,
        trim: true,
        maxlength: [200, 'La description ne peut dépasser 200 caractères']
      },
      reference: {
        type: String,
        trim: true
      },
      statut: { 
        type: String, 
        enum: ['PENDING', 'COMPLETE', 'FAILED'],
        default: 'COMPLETE'
      },
      date: { 
        type: Date, 
        default: Date.now 
      },
      metadata: {
        type: Object,
        default: {}
      },
      // Informations CinetPay pour les retraits
      cinetpay: {
        transactionId: String,
        operatorTransactionId: String,
        status: String
      }
    }],
    
    // Statistiques portefeuille
    statistiques: {
      totalCredite: {
        type: Number,
        default: 0
      },
      totalRetire: {
        type: Number,
        default: 0
      },
      nombreTransactions: {
        type: Number,
        default: 0
      },
      dernierMouvementLe: Date
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
  }

}, {
  timestamps: true, // Ajoute createdAt et updatedAt automatiquement
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Index géospatial pour les coordonnées (seulement si présentes)
utilisateurSchema.index({ 'adresse.coordonnees': '2dsphere' }, { sparse: true });

// Index composé pour les recherches fréquentes
utilisateurSchema.index({ email: 1, statutCompte: 1 });
utilisateurSchema.index({ telephone: 1, statutCompte: 1 });
utilisateurSchema.index({ nom: 1, prenom: 1 });

// NOUVEAUX INDEX PORTEFEUILLE
utilisateurSchema.index({ 'portefeuille.solde': -1 });
utilisateurSchema.index({ 'portefeuille.historique.date': -1 });
utilisateurSchema.index({ 'portefeuille.historique.type': 1, 'portefeuille.historique.statut': 1 });

// Virtuals (propriétés calculées)
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

// NOUVEAUX VIRTUALS PORTEFEUILLE
utilisateurSchema.virtual('soldeDisponible').get(function() {
  return this.portefeuille.solde - this.portefeuille.soldeBloquer;
});

utilisateurSchema.virtual('peutRetirer').get(function() {
  return this.soldeDisponible > 0 && 
         this.portefeuille.parametresRetrait.numeroMobile &&
         this.portefeuille.parametresRetrait.operateur;
});

utilisateurSchema.virtual('portefeuilleActif').get(function() {
  return this.portefeuille.statistiques.nombreTransactions > 0;
});

// Middleware pour mettre à jour le statut de vérification
utilisateurSchema.pre('save', function(next) {
  if (this.isModified('documentIdentite.statutVerification')) {
    if (this.documentIdentite.statutVerification === 'VERIFIE') {
      this.estVerifie = true;
      if (this.statutCompte === 'EN_ATTENTE_VERIFICATION') {
        this.statutCompte = 'ACTIF';
      }
    }
  }

  // NOUVEAU : Middleware pour portefeuille
  if (this.isModified('portefeuille.historique')) {
    this.portefeuille.statistiques.dernierMouvementLe = new Date();
    this.portefeuille.statistiques.nombreTransactions = this.portefeuille.historique.length;
    
    // Calculer totaux
    this.portefeuille.statistiques.totalCredite = this.portefeuille.historique
      .filter(t => t.type === 'CREDIT' && t.statut === 'COMPLETE')
      .reduce((sum, t) => sum + t.montant, 0);
      
    this.portefeuille.statistiques.totalRetire = this.portefeuille.historique
      .filter(t => ['RETRAIT', 'DEBIT'].includes(t.type) && t.statut === 'COMPLETE')
      .reduce((sum, t) => sum + t.montant, 0);
  }

  // Réinitialiser les limites quotidiennes et mensuelles
  const maintenant = new Date();
  const dernierRetrait = this.portefeuille.limites.dernierRetraitLe;
  
  if (dernierRetrait) {
    // Réinitialiser quotidien
    if (maintenant.toDateString() !== dernierRetrait.toDateString()) {
      this.portefeuille.limites.montantRetireAujourdhui = 0;
    }
    
    // Réinitialiser mensuel
    if (maintenant.getMonth() !== dernierRetrait.getMonth() || 
        maintenant.getFullYear() !== dernierRetrait.getFullYear()) {
      this.portefeuille.limites.montantRetireCeMois = 0;
    }
  }

  next();
});

// Méthode pour vérifier si un utilisateur peut se connecter (MISE À JOUR)
utilisateurSchema.methods.peutSeConnecter = function() {
  const maintenant = new Date();
  
  // Vérifier le statut du compte
  switch (this.statutCompte) {
    case 'BLOQUE':
      return {
        autorise: false,
        raison: 'Compte bloqué définitivement'
      };
    
    case 'SUSPENDU':
      return {
        autorise: false,
        raison: 'Compte suspendu'
      };
    
    case 'EN_ATTENTE_VERIFICATION':
      return {
        autorise: false,
        raison: 'Email non confirmé',
        action: 'CONFIRMER_EMAIL'
      };
    
    case 'ACTIF':
      // Vérifier si le compte est temporairement bloqué
      if (this.compteBloqueLe && this.tentativesConnexionEchouees >= 5) {
        const tempsEcoule = maintenant - this.compteBloqueLe;
        const dureeBloquage = 15 * 60 * 1000; // 15 minutes
        
        if (tempsEcoule < dureeBloquage) {
          const tempsRestant = dureeBloquage - tempsEcoule;
          return {
            autorise: false,
            raison: 'Compte temporairement bloqué',
            deblocageA: new Date(this.compteBloqueLe.getTime() + dureeBloquage),
            tempsRestantMs: tempsRestant
          };
        } else {
          // Le temps de blocage est écoulé, réinitialiser
          this.tentativesConnexionEchouees = 0;
          this.compteBloqueLe = null;
          this.derniereTentativeConnexion = null;
        }
      }
      
      return { autorise: true };
    
    default:
      return {
        autorise: false,
        raison: 'Statut de compte invalide'
      };
  }
};

// Méthode pour vérifier le mot de passe
utilisateurSchema.methods.verifierMotDePasse = async function(motDePasseCandidat) {
  if (!this.motDePasse) {
    throw new Error('Mot de passe non défini pour cet utilisateur');
  }
  return await bcrypt.compare(motDePasseCandidat, this.motDePasse);
};

// Méthode pour incrémenter les tentatives échouées
utilisateurSchema.methods.incrementerTentativesEchouees = async function() {
  const maintenant = new Date();
  this.tentativesConnexionEchouees += 1;
  this.derniereTentativeConnexion = maintenant;
  
  // Bloquer temporairement après 5 tentatives
  if (this.tentativesConnexionEchouees >= 5) {
    this.compteBloqueLe = maintenant;
  }
  
  await this.save();
};

// Méthode pour mettre à jour la dernière connexion
utilisateurSchema.methods.mettreAJourDerniereConnexion = async function() {
  this.derniereConnexion = new Date();
  this.tentativesConnexionEchouees = 0;
  return this.save({ validateBeforeSave: false });
};

utilisateurSchema.methods.ajouterBadge = function(badge) {
  if (!this.badges.includes(badge)) {
    this.badges.push(badge);
    return this.save({ validateBeforeSave: false });
  }
  return Promise.resolve(this);
};

utilisateurSchema.methods.supprimerBadge = function(badge) {
  this.badges = this.badges.filter(b => b !== badge);
  return this.save({ validateBeforeSave: false });
};

utilisateurSchema.methods.changerStatut = function(nouveauStatut, raison, administrateurId) {
  const ancienStatut = this.statutCompte;
  
  this.historiqueStatuts.push({
    ancienStatut,
    nouveauStatut,
    raison,
    administrateurId
  });
  
  this.statutCompte = nouveauStatut;
  return this.save();
};

// Méthode pour générer un token JWT
utilisateurSchema.methods.getSignedJwtToken = function() {
  return jwt.sign(
    { 
      userId: this._id,
      email: this.email 
    },
    process.env.JWT_SECRET || 'votre-cle-secrete-super-longue-et-complexe',
    {
      expiresIn: process.env.JWT_EXPIRE || '7d'
    }
  );
};

// Méthode pour générer un token de réinitialisation du mot de passe
utilisateurSchema.methods.getResetPasswordToken = function() {
  // Générer le token
  const resetToken = crypto.randomBytes(20).toString('hex');
  
  // Hash du token et sauvegarde dans la DB
  this.tokenResetMotDePasse = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');
    
  // Définir l'expiration (10 minutes)
  this.expirationTokenReset = Date.now() + 10 * 60 * 1000;
  
  return resetToken;
};

// Méthode pour générer un token de confirmation d'email (NOUVELLE)
utilisateurSchema.methods.getEmailConfirmationToken = function() {
  // Générer le token
  const confirmationToken = crypto.randomBytes(32).toString('hex');
  
  // Hash du token et sauvegarde dans la DB
  this.tokenConfirmationEmail = crypto
    .createHash('sha256')
    .update(confirmationToken)
    .digest('hex');
    
  // Définir l'expiration (24 heures)
  this.expirationTokenConfirmation = Date.now() + 24 * 60 * 60 * 1000;
  
  return confirmationToken;
};

// Méthode pour confirmer l'email (NOUVELLE)
utilisateurSchema.methods.confirmerEmail = function() {
  this.emailConfirmeLe = new Date();
  this.tokenConfirmationEmail = undefined;
  this.expirationTokenConfirmation = undefined;
  
  // Si le statut est EN_ATTENTE_VERIFICATION, passer à ACTIF
  if (this.statutCompte === 'EN_ATTENTE_VERIFICATION') {
    this.statutCompte = 'ACTIF';
  }
  
  return this.save();
};

// ===== NOUVELLES MÉTHODES PORTEFEUILLE =====

// Méthode pour créditer le portefeuille
utilisateurSchema.methods.crediterPortefeuille = function(montant, description, reference = null) {
  if (montant <= 0) {
    throw new Error('Le montant doit être positif');
  }

  this.portefeuille.solde += montant;
  this.portefeuille.historique.push({
    type: 'CREDIT',
    montant,
    description,
    reference,
    statut: 'COMPLETE',
    date: new Date()
  });
  
  return this.save();
};

// Méthode pour débiter le portefeuille
utilisateurSchema.methods.debiterPortefeuille = function(montant, description) {
  if (montant <= 0) {
    throw new Error('Le montant doit être positif');
  }

  if (this.soldeDisponible < montant) {
    throw new Error('Solde insuffisant');
  }
  
  this.portefeuille.solde -= montant;
  this.portefeuille.historique.push({
    type: 'DEBIT',
    montant,
    description,
    statut: 'COMPLETE',
    date: new Date()
  });
  
  return this.save();
};

// Méthode pour bloquer un montant (avant retrait)
utilisateurSchema.methods.bloquerMontant = function(montant, description) {
  if (montant <= 0) {
    throw new Error('Le montant doit être positif');
  }

  if (this.soldeDisponible < montant) {
    throw new Error('Solde insuffisant pour bloquer ce montant');
  }
  
  this.portefeuille.soldeBloquer += montant;
  this.portefeuille.historique.push({
    type: 'DEBIT',
    montant,
    description: description || 'Blocage pour retrait',
    statut: 'PENDING',
    date: new Date()
  });
  
  return this.save();
};

// Méthode pour débloquer un montant (si retrait échoue)
utilisateurSchema.methods.debloquerMontant = function(montant, _description) {
  if (montant <= 0) {
    throw new Error('Le montant doit être positif');
  }

  if (this.portefeuille.soldeBloquer < montant) {
    throw new Error('Montant bloqué insuffisant');
  }
  
  this.portefeuille.soldeBloquer -= montant;
  
  // Mettre à jour la transaction en attente
  const transactionPending = this.portefeuille.historique
    .find(t => t.type === 'DEBIT' && t.statut === 'PENDING' && t.montant === montant);
  
  if (transactionPending) {
    transactionPending.statut = 'FAILED';
    transactionPending.description += ' - Échec';
  }
  
  return this.save();
};

// Méthode pour finaliser un retrait
utilisateurSchema.methods.finaliserRetrait = function(montant, cinetpayData = {}) {
  if (montant <= 0) {
    throw new Error('Le montant doit être positif');
  }

  if (this.portefeuille.soldeBloquer < montant) {
    throw new Error('Montant bloqué insuffisant');
  }
  
  // Débloquer et ajouter aux statistiques
  this.portefeuille.soldeBloquer -= montant;
  this.portefeuille.limites.montantRetireAujourdhui += montant;
  this.portefeuille.limites.montantRetireCeMois += montant;
  this.portefeuille.limites.dernierRetraitLe = new Date();
  
  // Mettre à jour la transaction
  const transactionPending = this.portefeuille.historique
    .find(t => t.type === 'DEBIT' && t.statut === 'PENDING' && t.montant === montant);
  
  if (transactionPending) {
    transactionPending.statut = 'COMPLETE';
    transactionPending.cinetpay = cinetpayData;
    transactionPending.description = 'Retrait effectué avec succès';
  }
  
  // Ajouter une transaction de retrait spécifique
  this.portefeuille.historique.push({
    type: 'RETRAIT',
    montant,
    description: `Retrait vers ${this.portefeuille.parametresRetrait.operateur} - ${this.portefeuille.parametresRetrait.numeroMobile}`,
    statut: 'COMPLETE',
    date: new Date(),
    cinetpay: cinetpayData
  });
  
  return this.save();
};

// Méthode pour vérifier les limites de retrait
utilisateurSchema.methods.verifierLimitesRetrait = function(montant) {
  const limites = this.portefeuille.limites;
  
  // Vérifier limite quotidienne
  if (limites.montantRetireAujourdhui + montant > limites.retraitJournalier) {
    return {
      autorise: false,
      raison: 'Limite quotidienne dépassée',
      limiteJournaliere: limites.retraitJournalier,
      dejaRetireAujourdhui: limites.montantRetireAujourdhui,
      montantMaxAutorise: limites.retraitJournalier - limites.montantRetireAujourdhui
    };
  }
  
  // Vérifier limite mensuelle
  if (limites.montantRetireCeMois + montant > limites.retraitMensuel) {
    return {
      autorise: false,
      raison: 'Limite mensuelle dépassée',
      limiteMensuelle: limites.retraitMensuel,
      dejaRetireCeMois: limites.montantRetireCeMois,
      montantMaxAutorise: limites.retraitMensuel - limites.montantRetireCeMois
    };
  }
  
  return { autorise: true };
};

// Méthode pour configurer les paramètres de retrait
utilisateurSchema.methods.configurerParametresRetrait = function(numeroMobile, operateur, nomTitulaire) {
  // Validation du numéro selon l'opérateur
  const regexOperateurs = {
    'ORANGE': /^(\+225)?07[0-9]{8}$/,
    'MTN': /^(\+225)?05[0-9]{8}$/,
    'MOOV': /^(\+225)?01[0-9]{8}$/
  };
  
  if (!regexOperateurs[operateur] || !regexOperateurs[operateur].test(numeroMobile)) {
    throw new Error(`Numéro de téléphone invalide pour l'opérateur ${operateur}`);
  }
  
  this.portefeuille.parametresRetrait = {
    numeroMobile,
    operateur,
    nomTitulaire
  };
  
  return this.save();
};

// Méthode pour obtenir l'historique du portefeuille
utilisateurSchema.methods.obtenirHistoriquePortefeuille = function(options = {}) {
  const {
    type = null,
    statut = null,
    limit = 50,
    dateDebut = null,
    dateFin = null
  } = options;
  
  let historique = [...this.portefeuille.historique];
  
  // Filtrer par type
  if (type) {
    historique = historique.filter(t => t.type === type);
  }
  
  // Filtrer par statut
  if (statut) {
    historique = historique.filter(t => t.statut === statut);
  }
  
  // Filtrer par date
  if (dateDebut) {
    historique = historique.filter(t => t.date >= new Date(dateDebut));
  }
  
  if (dateFin) {
    historique = historique.filter(t => t.date <= new Date(dateFin));
  }
  
  // Trier par date décroissante et limiter
  return historique
    .sort((a, b) => b.date - a.date)
    .slice(0, limit);
};

// Méthode pour obtenir le résumé du portefeuille
utilisateurSchema.methods.obtenirResumePortefeuille = function() {
  const maintenant = new Date();
  const debutMois = new Date(maintenant.getFullYear(), maintenant.getMonth(), 1);
  const debutJour = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate());
  
  const transactionsMois = this.portefeuille.historique.filter(t => 
    t.date >= debutMois && t.statut === 'COMPLETE'
  );
  
  const transactionsJour = this.portefeuille.historique.filter(t => 
    t.date >= debutJour && t.statut === 'COMPLETE'
  );
  
  return {
    solde: this.portefeuille.solde,
    soldeBloquer: this.portefeuille.soldeBloquer,
    soldeDisponible: this.soldeDisponible,
    statistiques: {
      ...this.portefeuille.statistiques,
      creditCeMois: transactionsMois
        .filter(t => t.type === 'CREDIT')
        .reduce((sum, t) => sum + t.montant, 0),
      retraitCeMois: transactionsMois
        .filter(t => ['RETRAIT', 'DEBIT'].includes(t.type))
        .reduce((sum, t) => sum + t.montant, 0),
      transactionsAujourdhui: transactionsJour.length
    },
    limites: this.portefeuille.limites,
    parametresRetrait: this.portefeuille.parametresRetrait,
    peutRetirer: this.peutRetirer
  };
};

// Méthodes statiques
utilisateurSchema.statics.rechercherParProximite = function(longitude, latitude, rayonKm = 10) {
  return this.find({
    'adresse.coordonnees': {
      $near: {
        $geometry: {
          type: 'Point',
          coordinates: [longitude, latitude]
        },
        $maxDistance: rayonKm * 1000 // Conversion en mètres
      }
    },
    statutCompte: 'ACTIF'
  });
};

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
        moyenneAge: { $avg: { $divide: [{ $subtract: [new Date(), '$dateNaissance'] }, 365.25 * 24 * 60 * 60 * 1000] } },
        scoreConfianceMoyen: { $avg: '$scoreConfiance' }
      }
    }
  ]);
  
  return stats[0] || {};
};

// NOUVELLES MÉTHODES STATIQUES PORTEFEUILLE

// Obtenir les statistiques globales des portefeuilles
utilisateurSchema.statics.statistiquesPortefeuillesGlobales = async function() {
  return this.aggregate([
    {
      $group: {
        _id: null,
        totalSolde: { $sum: '$portefeuille.solde' },
        totalSoldeBloquer: { $sum: '$portefeuille.soldeBloquer' },
        nombrePortefeuillesActifs: {
          $sum: { $cond: [{ $gt: ['$portefeuille.solde', 0] }, 1, 0] }
        },
        soldeMoyen: { $avg: '$portefeuille.solde' },
        totalTransactions: { $sum: '$portefeuille.statistiques.nombreTransactions' },
        totalCredite: { $sum: '$portefeuille.statistiques.totalCredite' },
        totalRetire: { $sum: '$portefeuille.statistiques.totalRetire' }
      }
    }
  ]);
};

// Obtenir les utilisateurs avec solde élevé
utilisateurSchema.statics.obtenirUtilisateursSoldeEleve = function(seuilSolde = 100000) {
  return this.find({
    'portefeuille.solde': { $gte: seuilSolde },
    statutCompte: 'ACTIF'
  })
  .select('nom prenom email portefeuille.solde portefeuille.statistiques')
  .sort({ 'portefeuille.solde': -1 });
};

// Obtenir les utilisateurs avec transactions suspectes
utilisateurSchema.statics.obtenirTransactionsSuspectes = function() {
  const maintenant = new Date();
  const hier = new Date(maintenant.getTime() - 24 * 60 * 60 * 1000);
  
  return this.find({
    'portefeuille.historique': {
      $elemMatch: {
        date: { $gte: hier },
        montant: { $gte: 500000 }, // 500k FCFA
        type: { $in: ['RETRAIT', 'DEBIT'] }
      }
    }
  })
  .select('nom prenom email portefeuille.historique portefeuille.solde');
};

// Export du modèle
module.exports = mongoose.model('Utilisateur', utilisateurSchema, 'utilisateurs');