// models/Utilisateur.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const validator = require('validator');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const mongoosePaginate = require('mongoose-paginate-v2');


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

  googleId: {
    type: String,
    unique: true,
    sparse: true,
    index: true
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
  // 🔥 MODIFIER : Requis seulement si pas de googleId
  required: function() {
    return !this.googleId;
  },
  minlength: [4, 'Le mot de passe doit contenir au moins 4 caractères'],
  validate: {
    validator: function(password) {
      if (!password) return true;
      // En tests on accepte mot de passe simple pour fixtures
      if (process.env.NODE_ENV === 'test') return true;
      // Au moins 1 majuscule, 1 minuscule, 1 chiffre
      return /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(password);
    },
    message: 'Le mot de passe doit contenir au moins une majuscule, une minuscule et un chiffre'
  },
  select: false
},
  
  // ===== SYSTÈME DE REFRESH TOKEN =====
  refreshTokens: [{
    token: {
      type: String,
      required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    expiresAt: {
      type: Date,
      required: true
    },
    deviceInfo: {
      userAgent: String,
      ip: String,
      deviceType: {
        type: String,
        enum: ['mobile', 'desktop', 'tablet', 'unknown'],
        default: 'unknown'
      },
      os: String,
      browser: String
    },
    lastUsedAt: {
      type: Date,
      default: Date.now
    },
    isRevoked: {
      type: Boolean,
      default: false
    },
    revokedAt: Date,
    revokedReason: String
  }],

  // Limiter le nombre de sessions actives
  maxActiveSessions: {
    type: Number,
    default: 5,
    min: [1, 'Au moins 1 session active autorisée'],
    max: [10, 'Maximum 10 sessions actives']
  },

  // Sécurité supplémentaire
  derniereChangementMotDePasse: {
    type: Date,
    default: Date.now
  },
  
  exigerChangementMotDePasse: {
    type: Boolean,
    default: false
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
      values: ['conducteur', 'passager'],
      message: 'Rôle invalide'
    },
    default: 'passager'
  },

  // Vérification d'identité
  documentIdentite: {
    type: {
      type: String,
      enum: {
        values: ['CNI', 'PASSEPORT','PERMIS_CONDUIRE'],
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
          else if (this.documentIdentite.type === 'PERMIS_CONDUIRE') {
            return /^[A-Z0-9]{6,12}$/.test(numero);
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
    photoSelfie: {
      type: String,
      default: null
    },
    statutVerification: {
      type: String,
      enum: ['NON_SOUMIS','EN_ATTENTE', 'VERIFIE', 'REJETE'],
      default: 'NON_SOUMIS'
    },
    dateVerification: Date,
    verificateurId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Administrateur'
    },
    raisonRejet: String,
    // (Deprecated) ancien champ utilisé pour Cloudinary - remplacé par documentPath/selfiePath
    cloudinaryPublicIdDocument: String,
    cloudinaryPublicIdSelfie: String,
    // Nouveau: chemin/identifiant de stockage local ou remote (standardisé)
    documentPath: {
      type: String,
      default: null
    },
    selfiePath: {
      type: String,
      default: null
    },
    dateUpload: {
      type: Date,
      default: null
    }
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
      required: false,  
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

  // SYSTÈME DE COMPTE COVOITURAGE (REMPLACEMENT DU PORTEFEUILLE) =====
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
        enum: ['WAVE', 'ORANGE', 'MTN', 'MOOV', 'ORANGE_MONEY', 'MTN_MONEY', 'MOOV_MONEY'],
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
        enum: ['WAVE', 'ORANGE', 'MTN', 'MOOV', 'ORANGE_MONEY', 'MTN_MONEY', 'MOOV_MONEY']
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
      values: ['ACTIF', 'SUSPENDU', 'BLOQUE', 'EN_ATTENTE_VERIFICATION', 'CONDUCTEUR_EN_ATTENTE_VERIFICATION'],
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
  whatsappVerifie: {
    type: Boolean,
    default: false
  },
  
  codeVerificationWhatsApp: {
    type: String,
    select: false
  },
  
  codeVerificationWhatsAppExpire: {
    type: Date,
    select: false
  },
  codeSMS: {
    type: String,
    select: false
  },
  expirationCodeSMS: {
    type: Date,
    select: false
  },
  
  telephoneVerifie: {
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
  codeResetWhatsApp: {
  code: {
    type: String
  },
  expiration: {
    type: Date
  },
  tentativesRestantes: {
    type: Number,
    default: 5
  },
  dernierEnvoi: {
    type: Date
  },
  verifie: {
    type: Boolean,
    default: false
  }
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
  // 🔥 Firebase Cloud Messaging
fcmTokens: [{
  token: {
    type: String,
    required: true,
    index: true
  },
  deviceType: {
    type: String,
    enum: ['android', 'ios', 'web'],
    required: true
  },
  deviceInfo: {
    model: String,
    os: String,
    appVersion: String
  },
  dateAjout: {
    type: Date,
    default: Date.now
  },
  derniereActivite: {
    type: Date,
    default: Date.now
  },
  actif: {
    type: Boolean,
    default: true
  }
}],

// ⚙️ Préférences de notifications
preferencesNotifications: {
  activees: {
    type: Boolean,
    default: true
  },
  reservations: {
    type: Boolean,
    default: true
  },
  paiements: {
    type: Boolean,
    default: true
  },
  trajets: {
    type: Boolean,
    default: true
  },
  promotions: {
    type: Boolean,
    default: true
  },
  messages: {
    type: Boolean,
    default: true
  }
}

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

utilisateurSchema.index({ 'fcmTokens.token': 1 });
utilisateurSchema.index({ 'fcmTokens.actif': 1 });
utilisateurSchema.index({ 'fcmTokens.derniereActivite': -1 });

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
  return this.role === 'conducteur' || this.role === 'conducteur';
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
    case 'CONDUCTEUR_EN_ATTENTE_VERIFICATION':
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

/**
 * Générer Access Token (JWT courte durée)
 */
utilisateurSchema.methods.getSignedJwtToken = function() {
  return jwt.sign(
    { 
      userId: this._id,
      email: this.email,
      role: this.role,
      type: 'access'
    },
    process.env.JWT_SECRET || 'votre-cle-secrete-super-longue-et-complexe',
    {
      expiresIn: process.env.JWT_EXPIRE || '15m' // Courte durée pour l'access token
    }
  );
};

/**
 * Générer Refresh Token (longue durée)
 */
utilisateurSchema.methods.generateRefreshToken = async function(deviceInfo = {}) {
  // Générer un token unique et sécurisé
  const refreshToken = crypto.randomBytes(64).toString('hex');
  
  // Hasher le refresh token avant stockage
  const hashedToken = crypto
    .createHash('sha256')
    .update(refreshToken)
    .digest('hex');

  // Calculer la date d'expiration (30 jours par défaut)
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + (parseInt(process.env.REFRESH_TOKEN_DAYS) || 30));

  // Nettoyer les tokens expirés avant d'ajouter un nouveau
  await this.cleanExpiredTokens();

  // Limiter le nombre de sessions actives
  if (this.refreshTokens.filter(t => !t.isRevoked).length >= this.maxActiveSessions) {
    // Révoquer le plus ancien token actif
    const oldestToken = this.refreshTokens
      .filter(t => !t.isRevoked)
      .sort((a, b) => a.createdAt - b.createdAt)[0];
    
    if (oldestToken) {
      oldestToken.isRevoked = true;
      oldestToken.revokedAt = new Date();
      oldestToken.revokedReason = 'MAX_SESSIONS_EXCEEDED';
    }
  }

  // Ajouter le nouveau refresh token
  this.refreshTokens.push({
    token: hashedToken,
    expiresAt,
    deviceInfo: {
      userAgent: deviceInfo.userAgent || 'Unknown',
      ip: deviceInfo.ip || 'Unknown',
      deviceType: deviceInfo.deviceType || 'unknown',
      os: deviceInfo.os || 'Unknown',
      browser: deviceInfo.browser || 'Unknown'
    },
    lastUsedAt: new Date()
  });

  await this.save();

  // Retourner le token non-hashé (à envoyer au client)
  return refreshToken;
};

/**
 * Vérifier et utiliser un Refresh Token
 */
utilisateurSchema.methods.verifyRefreshToken = async function(refreshToken) {
  // Hasher le token reçu
  const hashedToken = crypto
    .createHash('sha256')
    .update(refreshToken)
    .digest('hex');

  // Trouver le token dans la base
  const tokenData = this.refreshTokens.find(
    t => t.token === hashedToken && !t.isRevoked
  );

  if (!tokenData) {
    return {
      valide: false,
      raison: 'TOKEN_INVALIDE',
      message: 'Refresh token invalide ou révoqué'
    };
  }

  // Vérifier l'expiration
  if (tokenData.expiresAt < new Date()) {
    tokenData.isRevoked = true;
    tokenData.revokedAt = new Date();
    tokenData.revokedReason = 'EXPIRED';
    await this.save();

    return {
      valide: false,
      raison: 'TOKEN_EXPIRE',
      message: 'Refresh token expiré'
    };
  }

  // Mettre à jour la dernière utilisation
  tokenData.lastUsedAt = new Date();
  this.derniereConnexion = new Date();
  await this.save();

  return {
    valide: true,
    tokenData: {
      createdAt: tokenData.createdAt,
      lastUsedAt: tokenData.lastUsedAt,
      deviceInfo: tokenData.deviceInfo
    }
  };
};

/**
 * Révoquer un Refresh Token spécifique
 */
utilisateurSchema.methods.revokeRefreshToken = async function(refreshToken, raison = 'USER_LOGOUT') {
  const hashedToken = crypto
    .createHash('sha256')
    .update(refreshToken)
    .digest('hex');

  const tokenData = this.refreshTokens.find(t => t.token === hashedToken);

  if (!tokenData) {
    return {
      success: false,
      message: 'Token introuvable'
    };
  }

  if (tokenData.isRevoked) {
    return {
      success: false,
      message: 'Token déjà révoqué'
    };
  }

  tokenData.isRevoked = true;
  tokenData.revokedAt = new Date();
  tokenData.revokedReason = raison;

  await this.save();

  return {
    success: true,
    message: 'Token révoqué avec succès'
  };
};

/**
 * Révoquer tous les Refresh Tokens (déconnexion globale)
 */
utilisateurSchema.methods.revokeAllRefreshTokens = async function(raison = 'LOGOUT_ALL_DEVICES') {
  const tokensActifs = this.refreshTokens.filter(t => !t.isRevoked);

  tokensActifs.forEach(token => {
    token.isRevoked = true;
    token.revokedAt = new Date();
    token.revokedReason = raison;
  });

  await this.save();

  return {
    success: true,
    message: `${tokensActifs.length} session(s) révoquée(s)`,
    count: tokensActifs.length
  };
};

/**
 * Nettoyer les tokens expirés
 */
utilisateurSchema.methods.cleanExpiredTokens = async function() {
  const maintenant = new Date();
  const tokensAvant = this.refreshTokens.length;

  this.refreshTokens = this.refreshTokens.filter(token => {
    // Garder les tokens non expirés
    if (token.expiresAt > maintenant) return true;
    
    // Supprimer les tokens expirés depuis plus de 7 jours
    const joursDepuisExpiration = (maintenant - token.expiresAt) / (1000 * 60 * 60 * 24);
    return joursDepuisExpiration <= 7;
  });

  if (tokensAvant !== this.refreshTokens.length) {
    await this.save();
  }
};

/**
 * Obtenir les sessions actives
 */
utilisateurSchema.methods.getActiveSessions = function() {
  const maintenant = new Date();
  
  return this.refreshTokens
    .filter(t => !t.isRevoked && t.expiresAt > maintenant)
    .map(t => ({
      createdAt: t.createdAt,
      lastUsedAt: t.lastUsedAt,
      expiresAt: t.expiresAt,
      deviceInfo: t.deviceInfo,
      isCurrentSession: false // À définir par le contrôleur
    }))
    .sort((a, b) => b.lastUsedAt - a.lastUsedAt);
};

/**
 * Vérifier si un changement de mot de passe invalide les tokens
 */
utilisateurSchema.methods.shouldInvalidateTokens = function() {
  // Si le mot de passe a été changé récemment, invalider les anciens tokens
  const dureeGraceMinutes = 5;
  const tempsEcoule = (Date.now() - this.derniereChangementMotDePasse) / (1000 * 60);
  
  return tempsEcoule < dureeGraceMinutes;
};

/**
 * Rotation du Refresh Token (pour sécurité accrue)
 */
utilisateurSchema.methods.rotateRefreshToken = async function(oldRefreshToken, deviceInfo = {}) {
  // Vérifier l'ancien token
  const verification = await this.verifyRefreshToken(oldRefreshToken);
  
  if (!verification.valide) {
    return {
      success: false,
      raison: verification.raison,
      message: verification.message
    };
  }

  // Révoquer l'ancien token
  await this.revokeRefreshToken(oldRefreshToken, 'TOKEN_ROTATION');

  // Générer un nouveau token
  const newRefreshToken = await this.generateRefreshToken(deviceInfo);

  // Générer un nouveau access token
  const newAccessToken = this.getSignedJwtToken();

  return {
    success: true,
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
    expiresIn: process.env.JWT_EXPIRE || '15m'
  };
};

// ===== MIDDLEWARE PRE-SAVE =====
utilisateurSchema.pre('save', async function(next) {
  // Hash password si modifié
  if (this.isModified('motDePasse')) {
    const salt = await bcrypt.genSalt(12);
    this.motDePasse = await bcrypt.hash(this.motDePasse, salt);
    
    // Mettre à jour la date de changement de mot de passe
    this.derniereChangementMotDePasse = new Date();
    
    // Révoquer tous les tokens existants pour forcer une reconnexion
    if (!this.isNew) {
      this.refreshTokens.forEach(token => {
        if (!token.isRevoked) {
          token.isRevoked = true;
          token.revokedAt = new Date();
          token.revokedReason = 'PASSWORD_CHANGED';
        }
      });
    }
  }

  // Vérification de document
  if (this.isModified('documentIdentite.statutVerification')) {
    if (this.documentIdentite.statutVerification === 'VERIFIE') {
      this.estVerifie = true;
      if (this.statutCompte === 'EN_ATTENTE_VERIFICATION') {
        this.statutCompte = 'ACTIF';
      }
    }
  }

  // Compte covoiturage - gestion recharge
  if (this.isModified('compteCovoiturage.historiqueRecharges')) {
    const rechargeReussie = this.compteCovoiturage.historiqueRecharges.some(r => r.statut === 'reussi');
    if (rechargeReussie && !this.compteCovoiturage.estRecharge) {
      this.compteCovoiturage.estRecharge = true;
    }
  }

  // Réinitialiser les limites de retrait si nécessaire
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

// ===== MÉTHODES STATIQUES =====

/**
 * Nettoyer les tokens expirés de tous les utilisateurs
 */
utilisateurSchema.statics.cleanAllExpiredTokens = async function() {
  const maintenant = new Date();
  const dateLimit = new Date(maintenant.getTime() - 7 * 24 * 60 * 60 * 1000); // 7 jours

  const result = await this.updateMany(
    {},
    {
      $pull: {
        refreshTokens: {
          expiresAt: { $lt: dateLimit }
        }
      }
    }
  );

  return result;
};

/**
 * Obtenir les statistiques des sessions
 */
utilisateurSchema.statics.getSessionStatistics = async function() {
  const stats = await this.aggregate([
    {
      $project: {
        totalTokens: { $size: '$refreshTokens' },
        activeTokens: {
          $size: {
            $filter: {
              input: '$refreshTokens',
              as: 'token',
              cond: {
                $and: [
                  { $eq: ['$$token.isRevoked', false] },
                  { $gt: ['$$token.expiresAt', new Date()] }
                ]
              }
            }
          }
        }
      }
    },
    {
      $group: {
        _id: null,
        totalUsers: { $sum: 1 },
        avgTokensPerUser: { $avg: '$totalTokens' },
        avgActiveTokensPerUser: { $avg: '$activeTokens' },
        totalTokens: { $sum: '$totalTokens' },
        totalActiveTokens: { $sum: '$activeTokens' }
      }
    }
  ]);

  return stats[0] || {};
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

  if (!['WAVE', 'ORANGE', 'MTN', 'MOOV' , 'ORANGE_MONEY', 'MTN_MONEY', 'MOOV_MONEY'].includes(methodePaiement)) {
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
    return { autorise: true, modesAcceptes: ['ESPECES', 'WAVE', 'ORANGE', 'MTN', 'MOOV', 'ORANGE_MONEY', 'MTN_MONEY', 'MOOV_MONEY'] };
  } else {
    // Compte non rechargé: seulement mobile money
    if (modePaiementDemande === 'ESPECES') {
      return {
        autorise: false,
        raison: 'Paiement en espèces non autorisé pour les comptes non rechargés',
        modesAcceptes: ['WAVE', 'ORANGE', 'MTN', 'MOOV', 'ORANGE_MONEY', 'MTN_MONEY', 'MOOV_MONEY']
      };
    }
    return { autorise: true, modesAcceptes: ['WAVE', 'ORANGE', 'MTN', 'MOOV', 'ORANGE_MONEY', 'MTN_MONEY', 'MOOV_MONEY'] };
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
  
  if (!['WAVE', 'ORANGE', 'MTN', 'MOOV', 'ORANGE_MONEY', 'MTN_MONEY', 'MOOV_MONEY'].includes(methodePaiementAuto)) {
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
// Générer un code de vérification WhatsApp
utilisateurSchema.methods.genererCodeWhatsApp = function() {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  this.codeVerificationWhatsApp = code;
  this.codeVerificationWhatsAppExpire = Date.now() + 10 * 60 * 1000;
  return code;
};
// ============================================================
// MÉTHODES POUR RÉINITIALISATION MOT DE PASSE WHATSAPP
// ============================================================

/**
 * Générer un code de réinitialisation WhatsApp (6 chiffres)
 */
utilisateurSchema.methods.genererCodeResetWhatsApp = function() {
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  
  this.codeResetWhatsApp = {
    code: code,
    expiration: Date.now() + 10 * 60 * 1000, // 10 minutes
    tentativesRestantes: 5,
    dernierEnvoi: Date.now(),
    verifie: false
  };
  
  return code;
};

/**
 * Vérifier si l'utilisateur peut renvoyer un code reset
 */
utilisateurSchema.methods.peutRenvoyerCodeReset = function() {
  if (!this.codeResetWhatsApp || !this.codeResetWhatsApp.dernierEnvoi) {
    return { autorise: true };
  }

  const tempsEcoule = Date.now() - this.codeResetWhatsApp.dernierEnvoi;
  const delaiMinimum = 2 * 60 * 1000; // 2 minutes

  if (tempsEcoule < delaiMinimum) {
    const tempsRestant = Math.ceil((delaiMinimum - tempsEcoule) / 1000);
    return {
      autorise: false,
      raison: 'DELAI_NON_ECOULE',
      message: `Veuillez attendre ${tempsRestant} secondes avant de demander un nouveau code`,
      tempsRestant: tempsRestant
    };
  }

  return { autorise: true };
};

/**
 * Vérifier un code de réinitialisation WhatsApp
 */
utilisateurSchema.methods.verifierCodeResetWhatsApp = function(code) {
  if (!this.codeResetWhatsApp || !this.codeResetWhatsApp.code) {
    return {
      valide: false,
      raison: 'AUCUN_CODE',
      message: 'Aucun code de réinitialisation actif'
    };
  }

  // Vérifier l'expiration
  if (this.codeResetWhatsApp.expiration < Date.now()) {
    this.codeResetWhatsApp = undefined;
    return {
      valide: false,
      raison: 'CODE_EXPIRE',
      message: 'Le code de réinitialisation a expiré'
    };
  }

  // Vérifier le code
  if (this.codeResetWhatsApp.code !== code) {
    this.codeResetWhatsApp.tentativesRestantes -= 1;

    if (this.codeResetWhatsApp.tentativesRestantes <= 0) {
      this.codeResetWhatsApp = undefined;
      return {
        valide: false,
        raison: 'TROP_DE_TENTATIVES',
        message: 'Trop de tentatives incorrectes'
      };
    }

    return {
      valide: false,
      raison: 'CODE_INCORRECT',
      message: 'Code incorrect',
      tentativesRestantes: this.codeResetWhatsApp.tentativesRestantes
    };
  }

  // Code valide
  return {
    valide: true,
    message: 'Code vérifié avec succès'
  };
};
// Vérifier le code WhatsApp
utilisateurSchema.methods.verifierCodeWhatsApp = function(code) {
  if (!this.codeVerificationWhatsApp) {
    return { valide: false, raison: 'Aucun code de vérification généré' };
  }
  if (Date.now() > this.codeVerificationWhatsAppExpire) {
    return { valide: false, raison: 'Code expiré' };
  }
  if (this.codeVerificationWhatsApp !== code) {
    return { valide: false, raison: 'Code incorrect' };
  }
  this.whatsappVerifie = true;
  this.codeVerificationWhatsApp = undefined;
  this.codeVerificationWhatsAppExpire = undefined;
  return { valide: true };
};

/**
 * 🔥 Méthode pour enregistrer un token FCM
 */
utilisateurSchema.methods.enregistrerFCMToken = async function(token, deviceInfo = {}) {
  try {
    console.log('🔥 Enregistrement FCM Token:', {
      userId: this._id,
      token: token.substring(0, 20) + '...',
      deviceType: deviceInfo.deviceType
    });
    
    // Vérifier si le token existe déjà
    const tokenExistant = this.fcmTokens.find(t => t.token === token);
    
    if (tokenExistant) {
      // Mettre à jour l'activité
      tokenExistant.derniereActivite = new Date();
      tokenExistant.actif = true;
      console.log('✅ Token existant réactivé');
    } else {
      // Ajouter le nouveau token
      this.fcmTokens.push({
        token: token,
        deviceType: deviceInfo.deviceType || 'android',
        deviceInfo: {
          model: deviceInfo.model || 'Unknown',
          os: deviceInfo.os || 'Unknown',
          appVersion: deviceInfo.appVersion || '1.0.0'
        },
        dateAjout: new Date(),
        derniereActivite: new Date(),
        actif: true
      });
      console.log('✅ Nouveau token ajouté');
    }
    
    await this.save();
    
    return { 
      success: true, 
      message: 'Token FCM enregistré avec succès',
      tokensCount: this.fcmTokens.length
    };
    
  } catch (error) {
    console.error('❌ Erreur enregistrement FCM:', error);
    return { 
      success: false, 
      message: error.message 
    };
  }
};

/**
 * 🔥 Méthode pour désactiver un token FCM
 */
utilisateurSchema.methods.desactiverFCMToken = async function(token) {
  try {
    console.log('🗑️ Désactivation token FCM:', {
      userId: this._id,
      token: token.substring(0, 20) + '...'
    });
    
    const tokenObj = this.fcmTokens.find(t => t.token === token);
    
    if (tokenObj) {
      tokenObj.actif = false;
      await this.save();
      console.log('✅ Token désactivé');
      return { success: true, message: 'Token désactivé' };
    } else {
      console.log('⚠️  Token non trouvé');
      return { success: false, message: 'Token non trouvé' };
    }
    
  } catch (error) {
    console.error('❌ Erreur désactivation token:', error);
    return { 
      success: false, 
      message: error.message 
    };
  }
};

/**
 * 🔥 Méthode pour supprimer un token invalide
 */
utilisateurSchema.methods.supprimerFCMToken = async function(token) {
  try {
    console.log('🗑️ Suppression token FCM invalide:', {
      userId: this._id,
      token: token.substring(0, 20) + '...'
    });
    
    this.fcmTokens = this.fcmTokens.filter(t => t.token !== token);
    await this.save();
    
    console.log('✅ Token supprimé');
    return { success: true };
    
  } catch (error) {
    console.error('❌ Erreur suppression token:', error);
    return { success: false, message: error.message };
  }
};

/**
 * 🔥 Récupérer tous les tokens actifs
 */
utilisateurSchema.methods.getTokensActifs = function() {
  return this.fcmTokens
    .filter(t => t.actif)
    .map(t => t.token);
};

/**
 * 🔥 Vérifier si les notifications sont activées
 */
utilisateurSchema.methods.notificationsActivees = function(type) {
  if (!this.preferencesNotifications || !this.preferencesNotifications.activees) {
    return false;
  }
  
  if (type) {
    return this.preferencesNotifications[type] !== false;
  }
  
  return true;
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

utilisateurSchema.plugin(mongoosePaginate);

// Export du modèle
module.exports = mongoose.model('Utilisateur', utilisateurSchema, 'utilisateurs');