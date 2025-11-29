/**
 * Schéma réutilisable pour référencer un véhicule
 * 
 * Ce schéma est utilisé pour créer une référence vers le modèle Vehicule principal
 * tout en stockant un snapshot des informations essentielles pour performance et historique.
 * 
 * Stratégie de dénormalisation contrôlée:
 * - vehiculeId: Référence au document Vehicule complet
 * - Snapshot: Informations basiques copiées au moment de l'utilisation
 * 
 * Avantages:
 * - Évite les JOIN coûteux lors des requêtes fréquentes
 * - Conserve l'historique (même si le véhicule change après)
 * - Permet l'affichage rapide sans populate
 * 
 * Utilisé dans:
 * - Trajet.vehiculeUtilise
 * - (Potentiellement d'autres modèles nécessitant une référence véhicule)
 * 
 * NOTE: Le modèle Utilisateur.vehicule sera remplacé par une simple référence
 * au modèle Vehicule pour éviter toute duplication.
 */

const mongoose = require('mongoose');

const vehiculeReferenceSchema = new mongoose.Schema({
  // =============== RÉFÉRENCE PRINCIPALE ===============
  
  /**
   * Référence au document Vehicule complet
   * Permet d'accéder à toutes les informations détaillées si nécessaire
   */
  vehiculeId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vehicule',
    required: [true, 'La référence au véhicule est obligatoire'],
    index: true,
    validate: {
      validator: function(v) {
        return mongoose.Types.ObjectId.isValid(v);
      },
      message: 'ID de véhicule invalide'
    }
  },
  
  // =============== SNAPSHOT (Dénormalisation) ===============
  // Ces champs sont copiés du modèle Vehicule au moment de l'utilisation
  // Ils permettent l'affichage rapide sans populate et conservent l'historique
  
  marque: {
    type: String,
    required: [true, 'La marque est requise'],
    trim: true,
    maxlength: [50, 'La marque ne peut dépasser 50 caractères']
  },
  
  modele: {
    type: String,
    required: [true, 'Le modèle est requis'],
    trim: true,
    maxlength: [50, 'Le modèle ne peut dépasser 50 caractères']
  },
  
  couleur: {
    type: String,
    required: [true, 'La couleur est requise'],
    trim: true,
    maxlength: [30, 'La couleur ne peut dépasser 30 caractères']
  },
  
  immatriculation: {
    type: String,
    required: [true, 'L\'immatriculation est requise'],
    trim: true,
    uppercase: true,
    validate: {
      validator: function(v) {
        // Format officiel CI depuis 2023: AB-123-CD (2 lettres, 3 chiffres, 2 lettres)
        // Ancien format accepté: 1234 AB 01
        return /^[A-Z]{2}-\d{3}-[A-Z]{2}$|^\d{4}\s?[A-Z]{2}\s?\d{2}$/.test(v);
      },
      message: 'Format d\'immatriculation invalide. Formats acceptés: AB-123-CD ou 1234 AB 01'
    }
  },
  
  nombrePlaces: {
    type: Number,
    required: [true, 'Le nombre de places est requis'],
    min: [2, 'Le nombre de places doit être au moins 2 (conducteur + 1 passager)'],
    max: [9, 'Maximum 9 places (au-delà = transport en commun)']
  },
  
  // =============== INFORMATIONS COMPLÉMENTAIRES ===============
  // Informations utiles copiées du Vehicule pour affichage rapide
  
  annee: {
    type: Number,
    min: [2000, 'Année trop ancienne'],
    max: [new Date().getFullYear() + 1, 'Année future non autorisée']
  },
  
  carburant: {
    type: String,
    enum: {
      values: ['ESSENCE', 'DIESEL', 'ELECTRIQUE', 'HYBRIDE', 'GAZ', 'GPL'],
      message: 'Type de carburant invalide'
    }
  },
  
  // Photo principale du véhicule (pour affichage dans liste trajets)
  photoVehicule: {
    type: String,
    validate: {
      validator: function(url) {
        if (!url) return true;
        return /^\/uploads\/vehicules\/.+\.(jpg|jpeg|png|webp)$/i.test(url) || 
               /^https?:\/\/.+\.(jpg|jpeg|png|webp)$/i.test(url);
      },
      message: 'URL de photo invalide'
    }
  },
  
  // =============== MÉTADONNÉES ===============
  
  /**
   * Date à laquelle le snapshot a été créé
   * Permet de savoir quand les infos ont été copiées
   */
  snapshotDate: {
    type: Date,
    default: Date.now,
    index: true
  }
}, { 
  _id: false,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// =============== PROPRIÉTÉS VIRTUELLES ===============

/**
 * Nom complet du véhicule (marque + modèle)
 */
vehiculeReferenceSchema.virtual('nomComplet').get(function() {
  return `${this.marque} ${this.modele}`;
});

/**
 * Description courte du véhicule
 */
vehiculeReferenceSchema.virtual('description').get(function() {
  return `${this.marque} ${this.modele} ${this.couleur} - ${this.immatriculation}`;
});

/**
 * Nombre de places disponibles (total - 1 pour le conducteur)
 */
vehiculeReferenceSchema.virtual('placesDisponibles').get(function() {
  return Math.max(0, this.nombrePlaces - 1);
});

/**
 * Âge approximatif du véhicule
 */
vehiculeReferenceSchema.virtual('age').get(function() {
  if (!this.annee) return null;
  return new Date().getFullYear() - this.annee;
});

/**
 * Vérifie si le véhicule est récent (moins de 5 ans)
 */
vehiculeReferenceSchema.virtual('estRecent').get(function() {
  if (!this.annee) return false;
  return this.age <= 5;
});

// =============== MÉTHODES D'INSTANCE ===============

/**
 * Vérifie si le snapshot est à jour (moins de 30 jours)
 * @returns {Boolean}
 */
vehiculeReferenceSchema.methods.snapshotEstAJour = function() {
  if (!this.snapshotDate) return false;
  
  const maintenant = new Date();
  const diffJours = Math.floor((maintenant - this.snapshotDate) / (1000 * 60 * 60 * 24));
  
  return diffJours <= 30;
};

/**
 * Formate les informations du véhicule pour affichage
 * @returns {String}
 */
vehiculeReferenceSchema.methods.formater = function() {
  let info = `${this.marque} ${this.modele} (${this.couleur})`;
  
  if (this.annee) {
    info += ` - ${this.annee}`;
  }
  
  info += ` - ${this.nombrePlaces} places`;
  
  return info;
};

/**
 * Retourne un objet avec les informations essentielles
 * @returns {Object}
 */
vehiculeReferenceSchema.methods.versJSON = function() {
  return {
    vehiculeId: this.vehiculeId,
    marque: this.marque,
    modele: this.modele,
    couleur: this.couleur,
    immatriculation: this.immatriculation,
    nombrePlaces: this.nombrePlaces,
    annee: this.annee,
    carburant: this.carburant,
    photoVehicule: this.photoVehicule
  };
};

// =============== MÉTHODES STATIQUES ===============

/**
 * Crée une référence véhicule à partir d'un document Vehicule complet
 * @param {Object} vehicule - Document Vehicule Mongoose
 * @returns {Object} Objet vehiculeReference
 */
vehiculeReferenceSchema.statics.depuisVehicule = function(vehicule) {
  if (!vehicule || !vehicule._id) {
    throw new Error('Document véhicule invalide');
  }
  
  return {
    vehiculeId: vehicule._id,
    marque: vehicule.marque,
    modele: vehicule.modele,
    couleur: vehicule.couleur,
    immatriculation: vehicule.immatriculation,
    nombrePlaces: vehicule.nombrePlaces,
    annee: vehicule.annee,
    carburant: vehicule.carburant,
    photoVehicule: vehicule.photos?.avant || null,
    snapshotDate: new Date()
  };
};

/**
 * Valide qu'un véhicule existe et est actif
 * @param {ObjectId} vehiculeId 
 * @returns {Promise<Boolean>}
 */
vehiculeReferenceSchema.statics.vehiculeEstActif = async function(vehiculeId) {
  const Vehicule = mongoose.model('Vehicule');
  
  const vehicule = await Vehicule.findOne({
    _id: vehiculeId,
    statut: { $in: ['ACTIF', 'DISPONIBLE'] },
    'validation.statutValidation': 'VALIDE'
  });
  
  return !!vehicule;
};

// =============== HOOKS ===============

/**
 * Pre-validate: Vérifier que le véhicule existe et est valide
 */
vehiculeReferenceSchema.pre('validate', async function(next) {
  // Vérifier que vehiculeId est fourni
  if (!this.vehiculeId) {
    return next(new Error('La référence au véhicule est obligatoire'));
  }
  
  // Dans un contexte de création de trajet, on peut vouloir vérifier
  // que le véhicule existe réellement
  // NOTE: Cette validation peut être désactivée pour les tests
  if (process.env.NODE_ENV !== 'test' && this.isNew) {
    try {
      const Vehicule = mongoose.model('Vehicule');
      const vehiculeExiste = await Vehicule.findById(this.vehiculeId);
      
      if (!vehiculeExiste) {
        return next(new Error(`Véhicule avec ID ${this.vehiculeId} introuvable`));
      }
      
      // Vérifier que le véhicule est actif
      if (!['ACTIF', 'DISPONIBLE'].includes(vehiculeExiste.statut)) {
        return next(new Error(`Le véhicule n'est pas disponible (statut: ${vehiculeExiste.statut})`));
      }
    } catch (error) {
      return next(error);
    }
  }
  
  next();
});

/**
 * Pre-save: Mettre à jour snapshotDate
 */
vehiculeReferenceSchema.pre('save', function(next) {
  if (this.isModified()) {
    this.snapshotDate = new Date();
  }
  next();
});

// =============== INDEX ===============

// Index sur vehiculeId pour recherches rapides
// Index déjà défini dans le schéma (vehiculeId: { index: true })

// Index sur immatriculation pour recherche par plaque
// vehiculeReferenceSchema.index({ immatriculation: 1 });
// NOTE: Cet index sera créé au niveau du modèle parent si nécessaire

// =============== DOCUMENTATION ===============

/**
 * GUIDE D'UTILISATION
 * 
 * 1. CRÉATION D'UNE RÉFÉRENCE VÉHICULE
 * 
 * const Vehicule = require('./models/Vehicule');
 * const vehiculeReference = require('./models/schemas/vehiculeReferenceSchema');
 * 
 * // Récupérer le véhicule complet
 * const vehicule = await Vehicule.findById(vehiculeId);
 * 
 * // Créer la référence avec snapshot
 * const reference = vehiculeReference.statics.depuisVehicule(vehicule);
 * 
 * // Utiliser dans un trajet
 * const trajet = new Trajet({
 *   vehiculeUtilise: reference,
 *   // ... autres champs
 * });
 * 
 * 
 * 2. ACCÈS AU VÉHICULE COMPLET
 * 
 * // Populate pour accéder au document Vehicule complet
 * const trajet = await Trajet.findById(trajetId)
 *   .populate('vehiculeUtilise.vehiculeId');
 * 
 * // Accéder aux détails complets
 * console.log(trajet.vehiculeUtilise.vehiculeId.photos);
 * console.log(trajet.vehiculeUtilise.vehiculeId.equipements);
 * 
 * 
 * 3. AFFICHAGE RAPIDE SANS POPULATE
 * 
 * // Les informations snapshot sont directement disponibles
 * const trajet = await Trajet.findById(trajetId);
 * console.log(trajet.vehiculeUtilise.marque);
 * console.log(trajet.vehiculeUtilise.modele);
 * console.log(trajet.vehiculeUtilise.nomComplet); // Virtual
 * 
 * 
 * 4. MISE À JOUR DU SNAPSHOT
 * 
 * // Rafraîchir les informations si le véhicule a changé
 * const vehiculeActuel = await Vehicule.findById(trajet.vehiculeUtilise.vehiculeId);
 * trajet.vehiculeUtilise = vehiculeReference.statics.depuisVehicule(vehiculeActuel);
 * await trajet.save();
 */

module.exports = vehiculeReferenceSchema;
