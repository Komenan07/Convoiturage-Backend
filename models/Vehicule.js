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
        // Format français : AB-123-CD ou 1234-AB-12
        // Format ivoirien : AB-1234-CI ou similaire
        return /^[A-Z]{2}-\d{3,4}-[A-Z]{2}$|^\d{4}-[A-Z]{2}-\d{2}$/.test(v);
      },
      message: 'Format d\'immatriculation invalide (ex: AB-1234-CI ou AB-123-CD)'
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
        return /^\/uploads\/vehicules\/.+\.(jpg|jpeg|png|webp)$/i.test(url) || 
               /^https?:\/\/.+\.(jpg|jpeg|png|webp)$/i.test(url);
      },
      message: 'URL de photo invalide (formats acceptés: jpg, jpeg, png, webp)'
    }
  },
  
  // MODIFIÉ : Documents optionnels à l'inscription, obligatoires pour activation
  assurance: {
    numeroPolice: {
      type: String,
      required: false, // CHANGÉ : optionnel à l'inscription
      trim: true,
      maxlength: [50, 'Le numéro de police ne peut pas dépasser 50 caractères']
    },
    dateExpiration: {
      type: Date,
      required: false, // CHANGÉ : optionnel à l'inscription
      validate: {
        validator: function(date) {
          if (!date) return true; // Permet null/undefined
          return date > new Date();
        },
        message: 'La date d\'expiration de l\'assurance doit être future'
      }
    },
    compagnie: {
      type: String,
      required: false, // CHANGÉ : optionnel à l'inscription
      trim: true,
      maxlength: [100, 'Le nom de la compagnie ne peut pas dépasser 100 caractères']
    }
  },
  
  visiteTechnique: {
    dateExpiration: {
      type: Date,
      required: false, // CHANGÉ : optionnel à l'inscription
      validate: {
        validator: function(date) {
          if (!date) return true; // Permet null/undefined
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
  
  // NOUVEAU : Statut étendu pour gérer la validation progressive
  statut: {
    type: String,
    enum: {
      values: [
        'EN_ATTENTE_DOCUMENTS',  // Nouveau : véhicule créé mais documents manquants
        'EN_ATTENTE_VERIFICATION', // Documents fournis, en attente validation admin
        'ACTIF',                   // Véhicule validé et actif
        'INACTIF',                 // Temporairement inactif
        'EN_REPARATION',          // En réparation
        'HORS_SERVICE',           // Archivé/désactivé
        'REJETE'                  // Documents rejetés
      ],
      message: 'Statut invalide'
    },
    default: 'EN_ATTENTE_DOCUMENTS'
  },
  
  // NOUVEAU : Champ pour suivre la complétude des documents
  documentsComplets: {
    type: Boolean,
    default: false
  },
  
  // NOUVEAU : Raison du rejet (si applicable)
  raisonRejet: {
    type: String,
    required: false
  },
  
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

// Index
vehiculeSchema.index({ proprietaireId: 1 });
vehiculeSchema.index({ immatriculation: 1 }, { unique: true });
vehiculeSchema.index({ 'assurance.dateExpiration': 1 });
vehiculeSchema.index({ 'visiteTechnique.dateExpiration': 1 });
vehiculeSchema.index({ estPrincipal: 1, proprietaireId: 1 });
vehiculeSchema.index({ statut: 1 });
vehiculeSchema.index({ createdAt: -1 });
vehiculeSchema.index({ documentsComplets: 1 });

// NOUVEAU : Middleware pre-save pour validation métier et mise à jour de documentsComplets
vehiculeSchema.pre('save', function(next) {
  // Vérifier si tous les documents sont présents
  const assuranceComplete = !!(
    this.assurance?.numeroPolice && 
    this.assurance?.compagnie && 
    this.assurance?.dateExpiration
  );
  
  const visiteTechniqueComplete = !!this.visiteTechnique?.dateExpiration;
  
  this.documentsComplets = assuranceComplete && visiteTechniqueComplete;
  
  // Si documents complets et statut était EN_ATTENTE_DOCUMENTS, passer à EN_ATTENTE_VERIFICATION
  if (this.documentsComplets && this.statut === 'EN_ATTENTE_DOCUMENTS') {
    this.statut = 'EN_ATTENTE_VERIFICATION';
  }
  
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
    await this.constructor.updateMany(
      { proprietaireId: this.proprietaireId, _id: { $ne: this._id } },
      { estPrincipal: false }
    );
    
    this.estPrincipal = true;
    return await this.save();
  } catch (error) {
    throw new Error(`Erreur lors de la définition du véhicule principal: ${error.message}`);
  }
};

// AMÉLIORÉ : Méthode pour vérifier la validité des documents
vehiculeSchema.methods.documentsValides = function() {
  const maintenant = new Date();
  
  const calculerJoursRestants = (dateExp) => {
    if (!dateExp) return null;
    const diff = dateExp - maintenant;
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };
  
  const assuranceValide = this.assurance?.dateExpiration && 
                          this.assurance.dateExpiration > maintenant;
  const visiteValide = this.visiteTechnique?.dateExpiration && 
                       this.visiteTechnique.dateExpiration > maintenant;
  
  return {
    assurance: {
      presente: !!(this.assurance?.numeroPolice && this.assurance?.compagnie),
      valide: assuranceValide,
      dateExpiration: this.assurance?.dateExpiration || null,
      joursRestants: calculerJoursRestants(this.assurance?.dateExpiration),
      numeroPolice: this.assurance?.numeroPolice || null,
      compagnie: this.assurance?.compagnie || null
    },
    visiteTechnique: {
      presente: !!this.visiteTechnique?.dateExpiration,
      valide: visiteValide,
      dateExpiration: this.visiteTechnique?.dateExpiration || null,
      joursRestants: calculerJoursRestants(this.visiteTechnique?.dateExpiration)
    },
    documentsComplets: this.documentsComplets,
    tousValides: assuranceValide && visiteValide,
    peutEtreActif: assuranceValide && visiteValide
  };
};

// NOUVEAU : Méthode pour vérifier quels documents manquent
vehiculeSchema.methods.documentsManquants = function() {
  const manquants = [];
  
  if (!this.assurance?.numeroPolice) manquants.push('assurance.numeroPolice');
  if (!this.assurance?.compagnie) manquants.push('assurance.compagnie');
  if (!this.assurance?.dateExpiration) manquants.push('assurance.dateExpiration');
  if (!this.visiteTechnique?.dateExpiration) manquants.push('visiteTechnique.dateExpiration');
  
  return {
    manquants,
    complet: manquants.length === 0
  };
};

// NOUVEAU : Méthode pour compléter les documents
vehiculeSchema.methods.completerDocuments = async function(documents) {
  if (documents.assurance) {
    this.assurance = {
      ...this.assurance,
      ...documents.assurance
    };
  }
  
  if (documents.visiteTechnique) {
    this.visiteTechnique = {
      ...this.visiteTechnique,
      ...documents.visiteTechnique
    };
  }
  
  return await this.save();
};

// Méthode statique pour trouver les véhicules avec documents expirés
vehiculeSchema.statics.documentsExpiresOuBientot = function(joursAvance = 30) {
  const dateLimite = new Date();
  dateLimite.setDate(dateLimite.getDate() + joursAvance);
  
  return this.find({
    documentsComplets: true,
    $or: [
      { 'assurance.dateExpiration': { $lte: dateLimite } },
      { 'visiteTechnique.dateExpiration': { $lte: dateLimite } }
    ]
  });
};

// NOUVEAU : Méthode statique pour trouver les véhicules avec documents incomplets
vehiculeSchema.statics.documentsIncomplets = function() {
  return this.find({
    documentsComplets: false,
    statut: 'EN_ATTENTE_DOCUMENTS'
  });
};

// Méthode pour archiver un véhicule
vehiculeSchema.methods.archiver = function() {
  this.statut = 'HORS_SERVICE';
  this.estPrincipal = false;
  return this.save();
};

// NOUVEAU : Méthode pour activer un véhicule (après validation admin)
vehiculeSchema.methods.activer = async function() {
  const validation = this.documentsValides();
  
  if (!validation.tousValides) {
    throw new Error('Impossible d\'activer le véhicule : documents invalides ou expirés');
  }
  
  this.statut = 'ACTIF';
  return await this.save();
};

// NOUVEAU : Méthode pour rejeter un véhicule
vehiculeSchema.methods.rejeter = async function(raison) {
  this.statut = 'REJETE';
  this.raisonRejet = raison;
  return await this.save();
};

module.exports = mongoose.model('Vehicule', vehiculeSchema);