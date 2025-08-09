// Schéma de table Véhicules (MongoDB/Mongoose)
const vehiculeSchema = {
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
    required: false // URL ou chemin vers l'image
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
      required: false // URL vers le certificat
    }
  },
  proprietaireId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
};

// Index pour améliorer les performances
vehiculeSchema.index({ proprietaireId: 1 });
vehiculeSchema.index({ immatriculation: 1 });
vehiculeSchema.index({ 'assurance.dateExpiration': 1 });
vehiculeSchema.index({ 'visiteTechnique.dateExpiration': 1 });

// Middleware pour mettre à jour updatedAt
vehiculeSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('Vehicule', vehiculeSchema);