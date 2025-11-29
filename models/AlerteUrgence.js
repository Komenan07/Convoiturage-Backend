// models/AlerteUrgence.js - ADAPTÉ POUR CÔTE D'IVOIRE
const mongoose = require('mongoose');
const { coordonneesSchema } = require('./schemas');

// ⭐ REFACTORING: Utilisation de coordonneesSchema
// Le schéma positionSchema a été remplacé par coordonneesSchema
// Voir AUDIT.md pour détails du refactoring

// === SCHÉMAS EMBARQUÉS ===

// Personne présente dans le véhicule
const personnePresenteSchema = new mongoose.Schema({
  utilisateurId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Utilisateur'
  },
  nom: {
    type: String,
    required: [true, 'Le nom est requis'],
    trim: true,
    maxlength: [100, 'Le nom ne peut dépasser 100 caractères']
  },
  telephone: {
    type: String,
    required: [true, 'Le téléphone est requis'],
    validate: {
      validator: function(tel) {
        // Format Côte d'Ivoire: +225XXXXXXXXXX ou 0XXXXXXXXXX (10 chiffres)
        return /^(?:(?:\+225|0)[0-9]{10})$/.test(tel.replace(/[\s.-]/g, ''));
      },
      message: 'Format téléphone ivoirien invalide (+225XXXXXXXXXX ou 0XXXXXXXXXX)'
    }
  },
  estConducteur: {
    type: Boolean,
    default: false
  }
}, { _id: true });

// Contact alerté
const contactAlerteSchema = new mongoose.Schema({
  nom: {
    type: String,
    required: [true, 'Le nom du contact est requis'],
    trim: true,
    maxlength: [100, 'Le nom ne peut dépasser 100 caractères']
  },
  telephone: {
    type: String,
    required: [true, 'Le téléphone du contact est requis'],
    validate: {
      validator: function(tel) {
        return /^(?:(?:\+225|0)[0-9]{10})$/.test(tel.replace(/[\s.-]/g, ''));
      },
      message: 'Format téléphone invalide'
    }
  },
  relation: {
    type: String,
    required: [true, 'La relation est requise'],
    enum: {
      values: ['FAMILLE', 'AMI', 'COLLEGUE', 'CONTACT_URGENCE', 
               'COVOITUREUR', 'CONDUCTEUR','MEDECIN', 'AUTRE'],
      message: 'Type de relation invalide'
    }
  },
  dateNotification: {
    type: Date,
    default: Date.now
  },
  statutNotification: {
    type: String,
    enum: ['ENVOYE', 'RECU', 'ECHEC', 'EN_ATTENTE'],
    default: 'ENVOYE'
  },
  canal: {
    type: String,
    enum: ['SMS', 'APPEL', 'WHATSAPP', 'APP'],
    default: 'SMS'
  }
}, { _id: true });

// ⭐ REFACTORING: positionSchema supprimé
// Remplacé par coordonneesSchema qui offre:
// - Validation GeoJSON MongoDB standard
// - Validation Côte d'Ivoire (avertissement si hors territoire)
// - Virtuals: longitude, latitude, estEnCoteDIvoire
// - Méthodes: distanceVers(), formater(), versGoogleMaps()

// === SCHÉMA PRINCIPAL ===

const alerteUrgenceSchema = new mongoose.Schema({
  // Identification
  declencheurId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Utilisateur',
    required: [true, 'L\'ID du déclencheur est requis'],
    index: true
  },
  
  trajetId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Trajet',
    required: [true, 'L\'ID du trajet est requis'],
    index: true
  },
  
  numeroUrgence: {
    type: String,
    unique: true,
    index: true
  },
  
  // ⭐ REFACTORING: Utilisation de coordonneesSchema
  // Localisation
  position: {
    type: coordonneesSchema,
    required: [true, 'La position GPS est requise']
  },
  
  adresseApproximative: {
    type: String,
    maxlength: 500
  },
  
  ville: {
    type: String,
    maxlength: 100,
    index: true,
    enum: {
      values: [
        'Abidjan', 'Yamoussoukro', 'Bouaké', 'Daloa', 'San-Pédro',
        'Korhogo', 'Man', 'Gagnoa', 'Abengourou', 'Divo',
        'Soubré', 'Agboville', 'Grand-Bassam', 'Dimbokro', 'Issia',
        'Bondoukou', 'Oumé', 'Bingerville', 'Adzopé', 'Dabou',
        'Tiassalé', 'Sassandra', 'Ferkessédougou', 'Toumodi',
        'Séguéla', 'Katiola', 'Odienné', 'Toulepleu', 'Lakota',
        'm\'bahiakro', 'Sakassou', 'Vavoua', 'Zouan-Hounien',
        'Autre'
      ],
      message: 'Ville non reconnue en Côte d\'Ivoire'
    }
  },
  
  commune: {
    type: String,
    maxlength: 100
  },
  
  // Type et gravité - ADAPTÉ COVOITURAGE
  typeAlerte: {
    type: String,
    required: [true, 'Le type d\'alerte est requis'],
    enum: {
      values: [
        // Urgences classiques
        'SOS', 'ACCIDENT', 'AGRESSION', 'PANNE', 'MALAISE',
        // Spécifique covoiturage
        'PASSAGER_SUSPECT', 'CONDUCTEUR_DANGEREUX', 'HARCELEMENT',
        'VOL', 'CHANGEMENT_ITINERAIRE', 'POINT_RENCONTRE_INSECURE',
        'DEMANDE_ARGENT_SUPPLEMENTAIRE', 'VEHICULE_NON_CONFORME',
        'RETARD_IMPORTANT', 'AUTRE'
      ],
      message: 'Type d\'alerte invalide'
    },
    index: true
  },
  
  description: {
    type: String,
    required: [true, 'Description requise'],
    trim: true,
    minlength: [10, 'Description min 10 caractères'],
    maxlength: [1000, 'Description max 1000 caractères']
  },
  
  niveauGravite: {
    type: String,
    required: [true, 'Niveau de gravité requis'],
    enum: {
      values: ['FAIBLE', 'MOYEN', 'CRITIQUE'],
      message: 'Niveau de gravité invalide'
    },
    index: true
  },
  
  priorite: {
    type: Number,
    min: 1,
    max: 5,
    default: function() {
      const prioriteMap = {
        'SOS': { 'CRITIQUE': 5, 'MOYEN': 4, 'FAIBLE': 3 },
        'ACCIDENT': { 'CRITIQUE': 5, 'MOYEN': 4, 'FAIBLE': 3 },
        'AGRESSION': { 'CRITIQUE': 5, 'MOYEN': 4, 'FAIBLE': 3 },
        'VOL': { 'CRITIQUE': 5, 'MOYEN': 4, 'FAIBLE': 3 },
        'MALAISE': { 'CRITIQUE': 4, 'MOYEN': 3, 'FAIBLE': 2 },
        'PASSAGER_SUSPECT': { 'CRITIQUE': 4, 'MOYEN': 3, 'FAIBLE': 2 },
        'CONDUCTEUR_DANGEREUX': { 'CRITIQUE': 4, 'MOYEN': 3, 'FAIBLE': 2 },
        'HARCELEMENT': { 'CRITIQUE': 4, 'MOYEN': 3, 'FAIBLE': 2 },
        'CHANGEMENT_ITINERAIRE': { 'CRITIQUE': 3, 'MOYEN': 2, 'FAIBLE': 1 },
        'PANNE': { 'CRITIQUE': 2, 'MOYEN': 2, 'FAIBLE': 1 },
        'AUTRE': { 'CRITIQUE': 3, 'MOYEN': 2, 'FAIBLE': 1 }
      };
      return prioriteMap[this.typeAlerte]?.[this.niveauGravite] || 1;
    }
  },
  
  // Personnes impliquées
  personnesPresentes: {
    type: [personnePresenteSchema],
    validate: {
      validator: function(personnes) {
        return personnes && personnes.length > 0 && personnes.length <= 8;
      },
      message: 'Entre 1 et 8 personnes présentes'
    }
  },
  
  // Contacts notifiés
  contactsAlertes: {
    type: [contactAlerteSchema],
    validate: {
      validator: function(contacts) {
        return contacts.length <= 20;
      },
      message: 'Maximum 20 contacts'
    }
  },
  
  // Statut et suivi
  statutAlerte: {
    type: String,
    enum: ['ACTIVE', 'EN_TRAITEMENT', 'RESOLUE', 'FAUSSE_ALERTE'],
    default: 'ACTIVE',
    index: true
  },
  
  // Services contactés
  servicesUrgenceCI: {
    policeContactee: { type: Boolean, default: false },
    numeroPolice: { type: String, default: '110' },
    pompiersContactes: { type: Boolean, default: false },
    numeroPompiers: { type: String, default: '180' },
    ambulanceContactee: { type: Boolean, default: false },
    numeroAmbulance: { type: String, default: '185' }
  },
  
  // Résolution
  dateResolution: {
    type: Date,
    validate: {
      validator: function(date) {
        return !date || date >= this.createdAt;
      },
      message: 'Date résolution doit être après création'
    }
  },
  
  commentaireResolution: {
    type: String,
    trim: true,
    maxlength: [1000, 'Commentaire max 1000 caractères']
  },
  
  resolePar: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Utilisateur'
  },
  
  // Métadonnées covoiturage
  infoTrajet: {
    depart: String,
    destination: String,
    immatriculationVehicule: String,
    marqueVehicule: String
  },
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: false,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// === INDEX ===

// Géospatial pour recherche de proximité
alerteUrgenceSchema.index({ "position": "2dsphere" });

// Index composés pour recherches fréquentes
alerteUrgenceSchema.index({ 
  "statutAlerte": 1, 
  "niveauGravite": -1, 
  "createdAt": -1 
});

alerteUrgenceSchema.index({
  "ville": 1,
  "statutAlerte": 1,
  "createdAt": -1
});

alerteUrgenceSchema.index({
  "typeAlerte": 1,
  "statutAlerte": 1
});

// TTL: supprimer alertes résolues après 1 an
alerteUrgenceSchema.index(
  { "dateResolution": 1 },
  { 
    expireAfterSeconds: 365 * 24 * 60 * 60,
    partialFilterExpression: { "statutAlerte": "RESOLUE" }
  }
);

// === PROPRIÉTÉS VIRTUELLES ===

alerteUrgenceSchema.virtual('dureeDepuisDeclenchement').get(function() {
  return Math.round((new Date() - this.createdAt) / (1000 * 60)); // minutes
});

alerteUrgenceSchema.virtual('nombrePersonnes').get(function() {
  return this.personnesPresentes?.length || 0;
});

alerteUrgenceSchema.virtual('estCritique').get(function() {
  return this.niveauGravite === 'CRITIQUE' || this.priorite >= 4;
});

alerteUrgenceSchema.virtual('tempsReponse').get(function() {
  if (this.dateResolution) {
    return Math.round((this.dateResolution - this.createdAt) / (1000 * 60));
  }
  return null;
});

alerteUrgenceSchema.virtual('estCovoiturage').get(function() {
  const typesCovoiturage = [
    'PASSAGER_SUSPECT', 'CONDUCTEUR_DANGEREUX', 'HARCELEMENT',
    'CHANGEMENT_ITINERAIRE', 'POINT_RENCONTRE_INSECURE',
    'DEMANDE_ARGENT_SUPPLEMENTAIRE', 'VEHICULE_NON_CONFORME'
  ];
  return typesCovoiturage.includes(this.typeAlerte);
});

// === MIDDLEWARE PRE-SAVE ===

alerteUrgenceSchema.pre('save', async function(next) {
  // Générer numéro d'urgence unique
  if (this.isNew && !this.numeroUrgence) {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    
    this.numeroUrgence = `URG${year}${month}${day}${random}`;
  }
  
  // Mettre à jour timestamp
  this.updatedAt = new Date();
  
  // Validation résolution
  if (this.statutAlerte === 'RESOLUE' && !this.dateResolution) {
    this.dateResolution = new Date();
  }
  
  if ((this.statutAlerte === 'RESOLUE' || this.statutAlerte === 'FAUSSE_ALERTE') && 
      !this.commentaireResolution) {
    return next(new Error('Commentaire de résolution requis'));
  }
  
  next();
});

// === MÉTHODES D'INSTANCE ===

alerteUrgenceSchema.methods.ajouterContactAlerte = function(contact) {
  if (this.contactsAlertes.length >= 20) {
    throw new Error('Limite de 20 contacts atteinte');
  }
  
  this.contactsAlertes.push(contact);
  return this.save();
};

alerteUrgenceSchema.methods.mettreAJourStatutContact = function(contactId, statut) {
  const contact = this.contactsAlertes.id(contactId);
  if (!contact) {
    throw new Error('Contact non trouvé');
  }
  
  contact.statutNotification = statut;
  contact.dateNotification = new Date();
  
  return this.save();
};

alerteUrgenceSchema.methods.resoudre = function(commentaire, typeResolution = 'RESOLUE') {
  this.statutAlerte = typeResolution;
  this.dateResolution = new Date();
  this.commentaireResolution = commentaire;
  
  return this.save();
};

alerteUrgenceSchema.methods.escalader = function() {
  if (this.niveauGravite === 'FAIBLE') {
    this.niveauGravite = 'MOYEN';
  } else if (this.niveauGravite === 'MOYEN') {
    this.niveauGravite = 'CRITIQUE';
  }
  
  // Recalculer priorité
  const prioriteMap = {
    'SOS': { 'CRITIQUE': 5, 'MOYEN': 4, 'FAIBLE': 3 },
    'ACCIDENT': { 'CRITIQUE': 5, 'MOYEN': 4, 'FAIBLE': 3 },
    'AGRESSION': { 'CRITIQUE': 5, 'MOYEN': 4, 'FAIBLE': 3 },
    'VOL': { 'CRITIQUE': 5, 'MOYEN': 4, 'FAIBLE': 3 },
    'MALAISE': { 'CRITIQUE': 4, 'MOYEN': 3, 'FAIBLE': 2 },
    'PASSAGER_SUSPECT': { 'CRITIQUE': 4, 'MOYEN': 3, 'FAIBLE': 2 },
    'CONDUCTEUR_DANGEREUX': { 'CRITIQUE': 4, 'MOYEN': 3, 'FAIBLE': 2 },
    'HARCELEMENT': { 'CRITIQUE': 4, 'MOYEN': 3, 'FAIBLE': 2 },
    'PANNE': { 'CRITIQUE': 2, 'MOYEN': 2, 'FAIBLE': 1 },
    'AUTRE': { 'CRITIQUE': 3, 'MOYEN': 2, 'FAIBLE': 1 }
  };
  
  this.priorite = prioriteMap[this.typeAlerte]?.[this.niveauGravite] || this.priorite;
  
  return this.save();
};

alerteUrgenceSchema.methods.estAncienne = function() {
  const deuxHeures = 2 * 60 * 60 * 1000;
  return (new Date() - this.createdAt) > deuxHeures && this.statutAlerte === 'ACTIVE';
};

alerteUrgenceSchema.methods.notifierServicesUrgence = async function() {
  // TODO: Intégration avec services d'urgence ivoiriens
  // Police: 110/111, Pompiers: 180, SAMU: 185
  
  if (this.estCritique) {
    console.log(`🚨 ALERTE CRITIQUE - Notification services d'urgence CI requise`);
    console.log(`Type: ${this.typeAlerte}, Position: ${this.position.coordinates}`);
    console.log(`Contacts: Police 110, Pompiers 180, SAMU 185`);
  }
  
  return this;
};

// === MÉTHODES STATIQUES ===

alerteUrgenceSchema.statics.obtenirAlertesActives = function() {
  return this.find({
    statutAlerte: { $in: ['ACTIVE', 'EN_TRAITEMENT'] }
  })
  .sort({ priorite: -1, createdAt: 1 })
  .populate('declencheurId', 'nom telephone')
  .populate('trajetId', 'depart destination');
};

alerteUrgenceSchema.statics.rechercherParProximite = function(longitude, latitude, rayonKm = 50) {
  return this.find({
    "position": {
      $near: {
        $geometry: { type: "Point", coordinates: [longitude, latitude] },
        $maxDistance: rayonKm * 1000
      }
    },
    statutAlerte: { $in: ['ACTIVE', 'EN_TRAITEMENT'] }
  })
  .sort({ priorite: -1, createdAt: 1 });
};

alerteUrgenceSchema.statics.obtenirStatistiques = function(filtreDateDebut, filtreDateFin) {
  const matchStage = {};
  
  if (filtreDateDebut || filtreDateFin) {
    matchStage.createdAt = {};
    if (filtreDateDebut) matchStage.createdAt.$gte = new Date(filtreDateDebut);
    if (filtreDateFin) matchStage.createdAt.$lte = new Date(filtreDateFin);
  }
  
  return this.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        totalAlertes: { $sum: 1 },
        alertesActives: {
          $sum: { $cond: [{ $in: ["$statutAlerte", ["ACTIVE", "EN_TRAITEMENT"]] }, 1, 0] }
        },
        alertesCritiques: {
          $sum: { $cond: [{ $eq: ["$niveauGravite", "CRITIQUE"] }, 1, 0] }
        },
        tempsReponseMoyen: { $avg: "$tempsReponse" },
        repartitionTypes: { $push: "$typeAlerte" },
        villesPlusAffectees: { $push: "$ville" }
      }
    }
  ]);
};

alerteUrgenceSchema.statics.obtenirAlertesCovoiturage = function() {
  return this.find({
    typeAlerte: { 
      $in: [
        'PASSAGER_SUSPECT', 'CONDUCTEUR_DANGEREUX', 'HARCELEMENT',
        'CHANGEMENT_ITINERAIRE', 'POINT_RENCONTRE_INSECURE',
        'DEMANDE_ARGENT_SUPPLEMENTAIRE', 'VEHICULE_NON_CONFORME'
      ]
    },
    statutAlerte: { $in: ['ACTIVE', 'EN_TRAITEMENT'] }
  })
  .sort({ createdAt: -1 })
  .populate('trajetId')
  .populate('declencheurId', 'nom telephone');
};

module.exports = mongoose.model('AlerteUrgence', alerteUrgenceSchema);