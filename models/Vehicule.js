// Schéma de table Véhicules (MongoDB/Mongoose)
const mongoose = require('mongoose');

const vehiculeSchema = new mongoose.Schema({
  marque: {
    type: String,
    required: true,
    trim: true
  },
  modele: {
    type: String,
    required: true,
    trim: true
  },
  couleur: {
    type: String,
    required: true,
    trim: true
  },
  immatriculation: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    uppercase: true
  },
  nombrePlaces: {
    type: Number,
    required: true,
    min: 1,
    max: 50
  },
  photoVehicule: {
    type: String,
    required: false, // URL ou chemin vers l'image
    validate: {
      validator: function(url) {
        return !url || /^\/uploads\/vehicules\/.+/.test(url);
      },
      message: 'URL de photo de véhicule invalide'
    }
  },
  assurance: {
    numeroPolice: {
      type: String,
      required: true,
      trim: true
    },
    dateExpiration: {
      type: Date,
      required: true
    },
    compagnie: {
      type: String,
      required: true,
      trim: true
    }
  },
  visiteTechnique: {
    dateExpiration: {
      type: Date,
      required: true
    },
    certificatUrl: {
      type: String,
      required: false, // URL vers le certificat
      validate: {
        validator: function(url) {
          return !url || /^\/uploads\/vehicules\/.+/.test(url);
        },
        message: 'URL de certificat invalide'
      }
    }
  },
  proprietaireId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Utilisateur',
    required: true
  },
  estPrincipal: {
    type: Boolean,
    default: false
  },
  statut: {
    type: String,
    enum: ['ACTIF', 'INACTIF', 'EN_REPARATION', 'HORS_SERVICE'],
    default: 'ACTIF'
  }
}, {
  timestamps: true
});

// Index pour améliorer les performances
vehiculeSchema.index({ proprietaireId: 1 });
vehiculeSchema.index({ immatriculation: 1 });
vehiculeSchema.index({ 'assurance.dateExpiration': 1 });
vehiculeSchema.index({ 'visiteTechnique.dateExpiration': 1 });
vehiculeSchema.index({ estPrincipal: 1, proprietaireId: 1 });

// Middleware pour mettre à jour updatedAt
vehiculeSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Méthode pour définir comme véhicule principal
vehiculeSchema.methods.definirCommePrincipal = async function() {
  // Désactiver tous les autres véhicules du propriétaire
  await this.constructor.updateMany(
    { proprietaireId: this.proprietaireId, _id: { $ne: this._id } },
    { estPrincipal: false }
  );
  
  // Activer celui-ci
  this.estPrincipal = true;
  return this.save();
};

// Méthode pour vérifier la validité des documents
vehiculeSchema.methods.documentsValides = function() {
  const maintenant = new Date();
  const assuranceValide = this.assurance.dateExpiration > maintenant;
  const visiteValide = this.visiteTechnique.dateExpiration > maintenant;
  
  return {
    assurance: {
      valide: assuranceValide,
      dateExpiration: this.assurance.dateExpiration,
      joursRestants: Math.ceil((this.assurance.dateExpiration - maintenant) / (1000 * 60 * 60 * 24))
    },
    visiteTechnique: {
      valide: visiteValide,
      dateExpiration: this.visiteTechnique.dateExpiration,
      joursRestants: Math.ceil((this.visiteTechnique.dateExpiration - maintenant) / (1000 * 60 * 60 * 24))
    },
    tousValides: assuranceValide && visiteValide
  };
};

module.exports = mongoose.model('Vehicule', vehiculeSchema);