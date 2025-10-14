const mongoose = require('mongoose');

const vehiculeSchema = new mongoose.Schema({
  marque: {
    type: String,
    required: [true, 'La marque est obligatoire'],
    trim: true,
    maxlength: [50, 'La marque ne peut pas dépasser 50 caractères']
  },
  modele: {
    type: String,
    required: [true, 'Le modèle est obligatoire'],
    trim: true,
    maxlength: [50, 'Le modèle ne peut pas dépasser 50 caractères']
  },
  couleur: {
    type: String,
    required: [true, 'La couleur est obligatoire'],
    trim: true,
    maxlength: [30, 'La couleur ne peut pas dépasser 30 caractères']
  },
  immatriculation: {
    type: String,
    required: [true, 'L\'immatriculation est obligatoire'],
    unique: true,
    trim: true,
    uppercase: true,
    validate: {
      validator: function(v) {
        // Regex pour format français : AB-123-CD ou 1234-AB-12
        return /^[A-Z]{2}-\d{3}-[A-Z]{2}$|^\d{4}-[A-Z]{2}-\d{2}$/.test(v);
      },
      message: 'Format d\'immatriculation invalide'
    }
  },
  nombrePlaces: {
    type: Number,
    required: [true, 'Le nombre de places est obligatoire'],
    min: [1, 'Le nombre de places doit être au moins 1'],
    max: [50, 'Le nombre de places ne peut pas dépasser 50']
  },
  photoVehicule: {
    type: String,
    required: false,
    validate: {
      validator: function(url) {
        if (!url) return true;
        // Accepter les URLs locales et les URLs complètes
        return /^\/uploads\/vehicules\/.+\.(jpg|jpeg|png|webp)$/i.test(url) || 
               /^https?:\/\/.+\.(jpg|jpeg|png|webp)$/i.test(url);
      },
      message: 'URL de photo invalide (formats acceptés: jpg, jpeg, png, webp)'
    }
  },
  assurance: {
    numeroPolice: {
      type: String,
      required: [true, 'Le numéro de police d\'assurance est obligatoire'],
      trim: true,
      maxlength: [50, 'Le numéro de police ne peut pas dépasser 50 caractères']
    },
    dateExpiration: {
      type: Date,
      required: [true, 'La date d\'expiration de l\'assurance est obligatoire'],
      validate: {
        validator: function(date) {
          return date > new Date();
        },
        message: 'La date d\'expiration de l\'assurance doit être future'
      }
    },
    compagnie: {
      type: String,
      required: [true, 'La compagnie d\'assurance est obligatoire'],
      trim: true,
      maxlength: [100, 'Le nom de la compagnie ne peut pas dépasser 100 caractères']
    }
  },
  visiteTechnique: {
    dateExpiration: {
      type: Date,
      required: [true, 'La date d\'expiration de la visite technique est obligatoire'],
      validate: {
        validator: function(date) {
          return date > new Date();
        },
        message: 'La date d\'expiration de la visite technique doit être future'
      }
    },
    certificatUrl: {
      type: String,
      required: false,
      validate: {
        validator: function(url) {
          if (!url) return true;
          return /^\/uploads\/vehicules\/.+\.(pdf|jpg|jpeg|png)$/i.test(url) ||
                 /^https?:\/\/.+\.(pdf|jpg|jpeg|png)$/i.test(url);
        },
        message: 'URL de certificat invalide (formats acceptés: pdf, jpg, jpeg, png)'
      }
    }
  },
  proprietaireId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Utilisateur',
    required: [true, 'Le propriétaire est obligatoire'],
    validate: {
      validator: function(v) {
        return mongoose.Types.ObjectId.isValid(v);
      },
      message: 'ID de propriétaire invalide'
    }
  },
  estPrincipal: {
    type: Boolean,
    default: false
  },
  statut: {
    type: String,
    enum: {
      values: ['ACTIF', 'INACTIF', 'EN_REPARATION', 'HORS_SERVICE'],
      message: 'Statut invalide'
    },
    default: 'ACTIF'
  },
  // Champs additionnels utiles
  carburant: {
    type: String,
    enum: ['ESSENCE', 'DIESEL', 'ELECTRIQUE', 'HYBRIDE', 'GAZ'],
    required: false
  },
  annee: {
    type: Number,
    min: [1900, 'Année trop ancienne'],
    max: [new Date().getFullYear() + 1, 'Année future non autorisée'],
    required: false
  },
  kilometrage: {
    type: Number,
    min: [0, 'Le kilométrage ne peut pas être négatif'],
    required: false
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual pour l'âge du véhicule
vehiculeSchema.virtual('age').get(function() {
  if (!this.annee) return null;
  return new Date().getFullYear() - this.annee;
});

// Index pour améliorer les performances
vehiculeSchema.index({ proprietaireId: 1 });
vehiculeSchema.index({ immatriculation: 1 }, { unique: true });
vehiculeSchema.index({ 'assurance.dateExpiration': 1 });
vehiculeSchema.index({ 'visiteTechnique.dateExpiration': 1 });
vehiculeSchema.index({ estPrincipal: 1, proprietaireId: 1 });
vehiculeSchema.index({ statut: 1 });
vehiculeSchema.index({ createdAt: -1 }); // Pour tri par date de création

// Middleware pre-save pour validation métier
vehiculeSchema.pre('save', function(next) {
  // S'assurer qu'un seul véhicule principal par propriétaire
  if (this.isModified('estPrincipal') && this.estPrincipal) {
    this.constructor.updateMany(
      { 
        proprietaireId: this.proprietaireId, 
        _id: { $ne: this._id },
        estPrincipal: true 
      },
      { estPrincipal: false }
    ).exec();
  }
  next();
});

// Méthode pour définir comme véhicule principal
vehiculeSchema.methods.definirCommePrincipal = async function() {
  try {
    // Désactiver tous les autres véhicules du propriétaire
    await this.constructor.updateMany(
      { proprietaireId: this.proprietaireId, _id: { $ne: this._id } },
      { estPrincipal: false }
    );
    
    // Activer celui-ci
    this.estPrincipal = true;
    return await this.save();
  } catch (error) {
    throw new Error(`Erreur lors de la définition du véhicule principal: ${error.message}`);
  }
};

// Méthode pour vérifier la validité des documents
vehiculeSchema.methods.documentsValides = function() {
  const maintenant = new Date();
  const assuranceValide = this.assurance.dateExpiration > maintenant;
  const visiteValide = this.visiteTechnique.dateExpiration > maintenant;
  
  const calculerJoursRestants = (dateExp) => {
    const diff = dateExp - maintenant;
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };
  
  return {
    assurance: {
      valide: assuranceValide,
      dateExpiration: this.assurance.dateExpiration,
      joursRestants: calculerJoursRestants(this.assurance.dateExpiration)
    },
    visiteTechnique: {
      valide: visiteValide,
      dateExpiration: this.visiteTechnique.dateExpiration,
      joursRestants: calculerJoursRestants(this.visiteTechnique.dateExpiration)
    },
    tousValides: assuranceValide && visiteValide
  };
};

// Méthode statique pour trouver les véhicules avec documents expirés
vehiculeSchema.statics.documentsExpiresOuBientot = function(joursAvance = 30) {
  const dateLimite = new Date();
  dateLimite.setDate(dateLimite.getDate() + joursAvance);
  
  return this.find({
    $or: [
      { 'assurance.dateExpiration': { $lte: dateLimite } },
      { 'visiteTechnique.dateExpiration': { $lte: dateLimite } }
    ]
  });
};

// Méthode pour archiver un véhicule
vehiculeSchema.methods.archiver = function() {
  this.statut = 'HORS_SERVICE';
  this.estPrincipal = false;
  return this.save();
};

module.exports = mongoose.model('Vehicule', vehiculeSchema);