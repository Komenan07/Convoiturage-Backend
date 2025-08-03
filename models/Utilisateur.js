const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, 'Email est requis'],
    unique: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Email invalide']
  },
  telephone: {
    type: String,
    required: [true, 'Téléphone est requis'],
    unique: true,
    match: [/^(\+225|0)[0-9]{8,10}$/, 'Format téléphone ivoirien invalide']
  },
  motDePasse: {
    type: String,
    required: [true, 'Mot de passe requis'],
    minlength: [6, 'Mot de passe minimum 6 caractères'],
    select: false // Masqué par défaut dans les requêtes
  },
  nom: {
    type: String,
    required: [true, 'Nom requis'],
    trim: true,
    maxlength: [50, 'Nom maximum 50 caractères']
  },
  prenom: {
    type: String,
    required: [true, 'Prénom requis'],
    trim: true,
    maxlength: [50, 'Prénom maximum 50 caractères']
  },
  dateNaissance: {
    type: Date,
    required: [true, 'Date de naissance requise'],
    validate: {
      validator: function(date) {
        const age = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24 * 365);
        return age >= 18 && age <= 80;
      },
      message: 'Age doit être entre 18 et 80 ans'
    }
  },
  sexe: {
    type: String,
    required: [true, 'Sexe requis'],
    enum: {
      values: ['M', 'F'],
      message: 'Sexe doit être M ou F'
    }
  },
  photoProfil: {
    type: String,
    default: null
  },
  
  // Vérification d'identité
  documentIdentite: {
    type: {
      type: String,
      enum: ['CNI', 'PASSEPORT'],
      default: null
    },
    numero: {
      type: String,
      default: null
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
      ref: 'Admin'
    }
  },
  
  // Localisation
  adresse: {
    commune: {
      type: String,
      required: [true, 'Commune requise']
    },
    quartier: {
      type: String,
      required: [true, 'Quartier requis']
    },
    ville: {
      type: String,
      required: [true, 'Ville requise'],
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
        required: [true, 'Coordonnées GPS requises'],
        validate: {
          validator: function(coords) {
            return coords.length === 2 && 
                   coords[0] >= -180 && coords[0] <= 180 &&
                   coords[1] >= -90 && coords[1] <= 90;
          },
          message: 'Coordonnées GPS invalides'
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
      enum: ['BAVARD', 'CALME', 'NEUTRE'],
      default: 'NEUTRE'
    },
    languePreferee: {
      type: String,
      enum: ['FR', 'ANG'],
      default: 'FR'
    }
  },
  
  // Contacts d'urgence
  contactsUrgence: [{
    nom: {
      type: String,
      required: [true, 'Nom contact urgence requis']
    },
    telephone: {
      type: String,
      required: [true, 'Téléphone contact urgence requis'],
      match: [/^(\+225|0)[0-9]{8,10}$/, 'Format téléphone invalide']
    },
    relation: {
      type: String,
      enum: ['FAMILLE', 'AMI', 'COLLEGUE'],
      required: [true, 'Relation requise']
    }
  }],
  
  // Réputation et statistiques
  scoreConfiance: {
    type: Number,
    min: 0,
    max: 100,
    default: 50
  },
  nombreTrajetsEffectues: {
    type: Number,
    default: 0,
    min: 0
  },
  nombreTrajetsAnnules: {
    type: Number,
    default: 0,
    min: 0
  },
  noteGenerale: {
    type: Number,
    min: 0,
    max: 5,
    default: 0
  },
  badges: [{
    type: String,
    enum: ['PONCTUEL', 'PROPRE', 'SYMPATHIQUE', 'ECO_CONDUITE', 'BAVARD', 'CALME']
  }],
  
  // Statut du compte
  statutCompte: {
    type: String,
    enum: ['ACTIF', 'SUSPENDU', 'BLOQUE'],
    default: 'ACTIF'
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
  
  // Véhicules
  vehicules: [{
    marque: {
      type: String,
      required: [true, 'Marque véhicule requise']
    },
    modele: {
      type: String,
      required: [true, 'Modèle véhicule requis']
    },
    couleur: {
      type: String,
      required: [true, 'Couleur véhicule requise']
    },
    immatriculation: {
      type: String,
      required: [true, 'Immatriculation requise'],
      unique: true,
      uppercase: true
    },
    nombrePlaces: {
      type: Number,
      required: [true, 'Nombre de places requis'],
      min: 2,
      max: 8
    },
    photoVehicule: String,
    assurance: {
      numeroPolice: {
        type: String,
        required: [true, 'Numéro police assurance requis']
      },
      dateExpiration: {
        type: Date,
        required: [true, 'Date expiration assurance requise'],
        validate: {
          validator: function(date) {
            return date > Date.now();
          },
          message: 'Assurance expirée'
        }
      },
      compagnie: {
        type: String,
        required: [true, 'Compagnie assurance requise']
      }
    },
    visiteTechnique: {
      dateExpiration: {
        type: Date,
        required: [true, 'Date expiration visite technique requise'],
        validate: {
          validator: function(date) {
            return date > Date.now();
          },
          message: 'Visite technique expirée'
        }
      },
      certificatUrl: String
    }
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Index pour optimisation
userSchema.index({ "adresse.coordonnees": "2dsphere" });
userSchema.index({ scoreConfiance: -1 });
userSchema.index({ statutCompte: 1 });

// Virtuals
userSchema.virtual('age').get(function() {
  return Math.floor((Date.now() - this.dateNaissance.getTime()) / (1000 * 60 * 60 * 24 * 365));
});

userSchema.virtual('nomComplet').get(function() {
  return `${this.prenom} ${this.nom}`;
});

// Middleware pré-sauvegarde pour hash password
userSchema.pre('save', async function(next) {
  if (!this.isModified('motDePasse')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.motDePasse = await bcrypt.hash(this.motDePasse, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Middleware pour calculer score confiance
userSchema.pre('save', function(next) {
  if (this.isModified('nombreTrajetsEffectues') || this.isModified('nombreTrajetsAnnules')) {
    this.calculateTrustScore();
  }
  next();
});

// Méthodes du modèle
userSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.motDePasse);
  } catch (error) {
    throw new Error('Erreur comparaison mot de passe');
  }
};

userSchema.methods.calculateTrustScore = function() {
  let score = 50; // Score de base
  
  // Bonus trajets effectués
  score += Math.min(this.nombreTrajetsEffectues * 2, 30);
  
  // Malus trajets annulés
  if (this.nombreTrajetsEffectues > 0) {
    const ratioAnnulation = this.nombreTrajetsAnnules / this.nombreTrajetsEffectues;
    score -= ratioAnnulation * 40;
  }
  
  // Bonus vérification identité
  if (this.estVerifie) score += 10;
  
  // Bonus note générale
  if (this.noteGenerale > 0) {
    score += (this.noteGenerale - 2.5) * 8;
  }
  
  this.scoreConfiance = Math.max(0, Math.min(100, Math.round(score)));
};

userSchema.methods.toSafeObject = function() {
  const userObject = this.toObject();
  delete userObject.motDePasse;
  return userObject;
};

// Méthode statique pour recherche géographique
userSchema.statics.findNearby = function(longitude, latitude, maxDistance = 10000) {
  return this.find({
    "adresse.coordonnees": {
      $near: {
        $geometry: {
          type: "Point",
          coordinates: [longitude, latitude]
        },
        $maxDistance: maxDistance
      }
    },
    statutCompte: 'ACTIF'
  });
};

module.exports = mongoose.model('Utilisateur', userSchema);
