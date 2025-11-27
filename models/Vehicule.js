const mongoose = require('mongoose');

const vehiculeSchema = new mongoose.Schema({
  // =============== INFORMATIONS DE BASE ===============
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
        // Format officiel CI depuis 2023 : AB-123-CD (2 lettres, 3 chiffres, 2 lettres)
        // Ancien format accepté : 1234 AB 01
        return /^[A-Z]{2}-\d{3}-[A-Z]{2}$|^\d{4}\s?[A-Z]{2}\s?\d{2}$/.test(v);
      },
      message: 'Format d\'immatriculation invalide (nouveau format: AB-123-CD, ancien: 1234 AB 01)'
    }
  },
  nombrePlaces: {
    type: Number,
    required: [true, 'Le nombre de places est obligatoire'],
    min: [2, 'Le nombre de places doit être au moins 2'],
    max: [9, 'Maximum 9 places (au-delà = transport en commun)']
  },
  
  // =============== GESTION DES PLACES COVOITURAGE ===============
  placesDisponibles: {
    type: Number,
    default: function() { 
      return this.nombrePlaces ? this.nombrePlaces - 1 : 3; 
    },
    min: [0, 'Les places disponibles ne peuvent pas être négatives'],
    validate: {
      validator: function(v) {
        return v <= this.nombrePlaces;
      },
      message: 'Places disponibles ne peut dépasser le nombre total de places'
    }
  },
  
  // =============== PHOTOS ===============
  // Système de photos multiples (OBLIGATOIRE pour validation)
  photos: {
    avant: {
      type: String,
      required: false,
      validate: {
        validator: function(url) {
          if (!url) return true;
          return /^\/uploads\/vehicules\/.+\.(jpg|jpeg|png|webp)$/i.test(url) || 
                 /^https?:\/\/.+\.(jpg|jpeg|png|webp)$/i.test(url);
        },
        message: 'URL de photo invalide (formats: jpg, jpeg, png, webp)'
      }
    },
    arriere: {
      type: String,
      required: false
    },
    lateral_gauche: {
      type: String,
      required: false
    },
    lateral_droit: {
      type: String,
      required: false
    },
    interieur: {
      type: String,
      required: false
    },
    tableau_bord: {
      type: String,
      required: false
    }
  },
  
  // =============== DOCUMENTS LÉGAUX CÔTE D'IVOIRE ===============
  
  // 1. CARTE GRISE (Certificat d'immatriculation)
  carteGrise: {
    numero: {
      type: String,
      required: false,
      trim: true,
      uppercase: true,
      maxlength: [50, 'Le numéro de carte grise ne peut pas dépasser 50 caractères']
    },
    dateEmission: {
      type: Date,
      required: false
    },
    dateExpiration: {
      type: Date,
      required: false,
      validate: {
        validator: function(date) {
          if (!date) return true;
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const expirationDate = new Date(date);
          expirationDate.setHours(0, 0, 0, 0);
          return expirationDate >= today;
        },
        message: 'La carte grise doit être valide'
      }
    },
    centreEmission: {
      type: String,
      required: false,
      trim: true
    },
    numeroChassis: {
      type: String,
      required: false,
      trim: true,
      uppercase: true,
      maxlength: [17, 'Numéro de châssis VIN invalide (17 caractères)']
    },
    puissanceFiscale: {
      type: Number,
      required: false,
      min: [1, 'La puissance fiscale doit être positive']
    },
    documentUrl: {
      type: String,
      required: false,
      validate: {
        validator: function(url) {
          if (!url) return true;
          return /^\/uploads\/vehicules\/.+\.(pdf|jpg|jpeg|png)$/i.test(url) ||
                 /^https?:\/\/.+\.(pdf|jpg|jpeg|png)$/i.test(url);
        },
        message: 'URL de carte grise invalide'
      }
    }
  },
  
  // 2. VIGNETTE (Taxe annuelle obligatoire)
  vignette: {
    annee: {
      type: Number,
      required: false,
      min: [2020, 'Année de vignette trop ancienne'],
      max: [new Date().getFullYear() + 1, 'Année future non autorisée']
    },
    numero: {
      type: String,
      required: false,
      trim: true,
      uppercase: true
    },
    montant: {
      type: Number,
      required: false,
      min: [0, 'Le montant ne peut pas être négatif']
    },
    dateAchat: {
      type: Date,
      required: false
    },
    dateExpiration: {
      type: Date,
      required: false,
      validate: {
        validator: function(date) {
          if (!date) return true;
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const expirationDate = new Date(date);
          expirationDate.setHours(0, 0, 0, 0);
          return expirationDate >= today;
        },
        message: 'La vignette doit être valide'
      }
    },
    photoVignette: {
      type: String,
      required: false
    }
  },
  
  // 3. ASSURANCE (Obligatoire - Type transport de personnes)
  assurance: {
    numeroPolice: {
      type: String,
      required: false,
      trim: true,
      maxlength: [50, 'Le numéro de police ne peut pas dépasser 50 caractères']
    },
    dateDebut: {
      type: Date,
      required: false
    },
    dateExpiration: {
      type: Date,
      required: false,
      validate: {
        validator: function(date) {
        if (!date) return true;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const expirationDate = new Date(date);
        expirationDate.setHours(0, 0, 0, 0);
        return expirationDate >= today;
      },
        message: 'L\'assurance doit être valide'
      }
    },
    compagnie: {
      type: String,
      required: false,
      trim: true,
      maxlength: [100, 'Le nom de la compagnie ne peut pas dépasser 100 caractères']
    },
    type: {
      type: String,
      enum: [
        'TOUS_RISQUES', 
        'TIERS_COMPLET', 
        'RESPONSABILITE_CIVILE',
        'TRANSPORT_PUBLIC_PERSONNES' // Spécifique covoiturage/taxi
      ],
      required: false
    },
    montantCouverture: {
      type: Number,
      required: false,
      min: [0, 'Le montant de couverture ne peut pas être négatif']
    },
    attestationUrl: {
      type: String,
      required: false
    }
  },
  
  // 4. VISITE TECHNIQUE (Contrôle technique obligatoire)
  visiteTechnique: {
    dateVisite: {
      type: Date,
      required: false
    },
    dateExpiration: {
      type: Date,
      required: false,
      validate: {
        validator: function(date) {
          if (!date) return true;
          // Comparer uniquement les dates (sans l'heure)
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const expirationDate = new Date(date);
          expirationDate.setHours(0, 0, 0, 0);
          return expirationDate >= today;
        },
        message: 'La visite technique doit être valide'
      }
    },
    resultat: {
      type: String,
      enum: ['FAVORABLE', 'DEFAVORABLE', 'FAVORABLE_AVEC_RESERVE'],
      required: false
    },
    centreControle: {
      type: String,
      required: false,
      trim: true
    },
    numeroAttestation: {
      type: String,
      required: false,
      trim: true,
      uppercase: true
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
        message: 'URL de certificat invalide'
      }
    },
    defautsReleves: [{
      type: { type: String, enum: ['MINEUR', 'MAJEUR', 'CRITIQUE'] },
      description: String,
      corrige: { type: Boolean, default: false }
    }]
  },
  
  // 5. CARTE DE TRANSPORT (NOUVEAU - OBLIGATOIRE pour transport commercial)
  carteTransport: {
    numero: {
      type: String,
      required: false,
      trim: true,
      uppercase: true,
      maxlength: [50, 'Le numéro de carte de transport ne peut pas dépasser 50 caractères']
    },
    dateDelivrance: {
      type: Date,
      required: false
    },
    dateExpiration: {
      type: Date,
      required: false,
      validate: {
        validator: function(date) {
          if (!date) return true;
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const expirationDate = new Date(date);
          expirationDate.setHours(0, 0, 0, 0);
          return expirationDate >= today;
        },
        message: 'La carte de transport doit être valide'
      }
    },
    categorieAutorisee: {
      type: String,
      enum: ['TRANSPORT_PERSONNES', 'TRANSPORT_MARCHANDISES', 'MIXTE'],
      required: false
    },
    typeVehicule: {
      type: String,
      enum: ['TAXI', 'GBAKA', 'WORO_WORO', 'CAR_RAPIDE', 'PARTICULIER'],
      required: false
    },
    autoritDelivrance: {
      type: String,
      required: false,
      trim: true
    },
    documentUrl: {
      type: String,
      required: false
    }
  },
  
  certificatConformite: {
    numero: {
      type: String,
      required: false,
      trim: true,
      uppercase: true
    },
    dateDelivrance: {
      type: Date,
      required: false
    },
    origineVehicule: {
      type: String,
      enum: ['NEUF_LOCAL', 'NEUF_IMPORTE', 'OCCASION_IMPORTE', 'OCCASION_LOCAL'],
      required: false
    },
    paysOrigine: {
      type: String,
      required: false
    },
    documentUrl: {
      type: String,
      required: false
    }
  },
  
  informationsCGI: {
    numeroReference: {
      type: String,
      required: false,
      trim: true,
      uppercase: true
    },
    centreEmission: {
      type: String,
      required: false,
      trim: true
    },
    dateEmission: {
      type: Date,
      required: false
    },
    agentTraitant: {
      type: String,
      required: false
    }
  },
  
  // =============== PROPRIÉTAIRE ===============
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
  
  // =============== STATUT ===============
  statut: {
    type: String,
    enum: {
      values: [
        'EN_ATTENTE_DOCUMENTS',      // Véhicule créé, documents incomplets
        'EN_ATTENTE_VERIFICATION',   // Documents soumis, en attente admin
        'ACTIF',                     // Validé mais pas en covoiturage
        'DISPONIBLE',                // Prêt pour covoiturage
        'EN_COURSE',                 // En trajet actif
        'INACTIF',                   // Temporairement désactivé
        'EN_MAINTENANCE',            // Maintenance programmée
        'EN_REPARATION',             // En réparation
        'HORS_SERVICE',              // Archivé/désactivé définitivement
        'REJETE',                    // Documents rejetés par admin
        'SUSPENDU',                  // Suspension administrative
        'BLOQUE'                     // Bloqué pour non-conformité
      ],
      message: 'Statut invalide'
    },
    default: 'EN_ATTENTE_DOCUMENTS'
  },
  
  // =============== DISPONIBILITÉ COVOITURAGE ===============
  disponibilitePourCourse: {
    type: Boolean,
    default: false
  },
  
  documentsComplets: {
    type: Boolean,
    default: false
  },
  
  raisonRejet: {
    type: String,
    required: false
  },
  
  // =============== CARACTÉRISTIQUES TECHNIQUES ===============
  carburant: {
    type: String,
    enum: ['ESSENCE', 'DIESEL', 'ELECTRIQUE', 'HYBRIDE', 'GAZ', 'GPL'],
    required: false
  },
  annee: {
    type: Number,
    required: [true, 'L\'année est obligatoire'],
    min: [2010, 'Véhicule trop ancien pour le transport commercial (min 2010)'],
    max: [new Date().getFullYear() + 1, 'Année future non autorisée']
  },
  kilometrage: {
    type: Number,
    min: [0, 'Le kilométrage ne peut pas être négatif'],
    required: false,
    default: 0
  },
  typeCarrosserie: {
    type: String,
    enum: ['BERLINE', 'BREAK', 'SUV', '4X4', 'MONOSPACE', 'PICK_UP', 'UTILITAIRE'],
    required: false
  },
  transmission: {
    type: String,
    enum: ['MANUELLE', 'AUTOMATIQUE', 'SEMI_AUTOMATIQUE'],
    required: false
  },
  
  // =============== ÉQUIPEMENTS DE SÉCURITÉ ===============
  equipements: {
    // Sécurité obligatoire
    ceintures: { 
      type: String, 
      enum: ['TOUTES_PLACES', 'AVANT_UNIQUEMENT', 'NON','AVANT_ARRIERE'],
      default: 'AVANT_UNIQUEMENT',
      required: true
    },
    airbags: { 
      type: Boolean, 
      default: false 
    },
    nombreAirbags: {
      type: Number,
      min: 0,
      max: 8,
      default: 0
    },
    abs: { 
      type: Boolean, 
      default: false 
    },
    esp: { // Contrôle électronique de stabilité
      type: Boolean, 
      default: false 
    },
    
    // Équipements obligatoires CI
    trousseSecours: { 
      type: Boolean, 
      default: false,
      required: true
    },
    extincteur: { 
      type: Boolean, 
      default: false,
      required: true
    },
    triangleSignalisation: { 
      type: Boolean, 
      default: false,
      required: true
    },
    giletSecurite: { 
      type: Boolean, 
      default: false,
      required: true
    },
    roueDeSecours: {
      type: Boolean,
      default: false,
      required: true
    },
    cricCle: {
      type: Boolean,
      default: false,
      required: true
    },
    
    // Confort
    climatisation: { 
      type: Boolean, 
      default: false 
    },
    vitresElectriques: {
      type: Boolean,
      default: false
    },
    verrouillagesCentralises: {
      type: Boolean,
      default: false
    },
    regulateurVitesse: {
      type: Boolean,
      default: false
    }
  },
  
  // =============== COMMODITÉS ===============
  commodites: {
    wifi: { type: Boolean, default: false },
    chargeurTelephone: { type: Boolean, default: false },
    priseUSB: { type: Boolean, default: false },
    musique: { type: Boolean, default: false },
    bluetooth: { type: Boolean, default: false },
    espaceBagages: { 
      type: String, 
      enum: ['PETIT', 'MOYEN', 'GRAND'],
      default: 'MOYEN'
    },
    siegesConfortables: { type: Boolean, default: false },
    eauPotable: { type: Boolean, default: false }
  },
  
  // =============== RESTRICTIONS ET PRÉFÉRENCES ===============
  preferences: {
    animauxAutorises: { type: Boolean, default: false },
    fumeurAutorise: { type: Boolean, default: false },
    enfantsAutorises: { type: Boolean, default: true },
    bagagesVolumineuxAutorises: { type: Boolean, default: true },
    discussionsAutorisees: { type: Boolean, default: true },
    musiqueAutorisee: { type: Boolean, default: true }
  },
  
  // =============== STATISTIQUES D'UTILISATION ===============
  statistiques: {
    nombreTrajets: { type: Number, default: 0 },
    nombrePassagers: { type: Number, default: 0 },
    kilometresParcourus: { type: Number, default: 0 },
    noteMoyenne: { type: Number, min: 0, max: 5, default: 0 },
    nombreAvis: { type: Number, default: 0 },
    nombreAnnulations: { type: Number, default: 0 },
    tauxAnnulation: { type: Number, min: 0, max: 100, default: 0 },
    tauxAcceptation: { type: Number, min: 0, max: 100, default: 100 },
    tempsMoyenReponse: { type: Number, default: 0 }, // en minutes
    dernierTrajet: { type: Date, default: null },
    premiereUtilisation: { type: Date, default: null }
  },
  
  // =============== MAINTENANCE ===============
  maintenance: {
    prochainEntretien: { 
      type: Date, 
      required: false 
    },
    prochainEntretienKm: {
      type: Number,
      required: false
    },
    dernierEntretien: { 
      type: Date, 
      required: false 
    },
    frequenceEntretien: {
      type: Number, // en kilomètres
      default: 10000
    },
    historique: [{
      date: { type: Date, required: true },
      type: { 
        type: String, 
        enum: [
          'VIDANGE', 
          'PNEUS', 
          'FREINS', 
          'REVISION_COMPLETE', 
          'REPARATION',
          'CARROSSERIE',
          'ELECTRICITE',
          'CLIMATISATION',
          'AUTRE'
        ],
        required: true
      },
      description: { type: String, required: false },
      cout: { type: Number, min: 0, required: false },
      garage: { type: String, required: false },
      kilometrageAuMoment: { type: Number, required: false },
      pieceChangees: [{ type: String }],
      facture: { type: String, required: false }
    }]
  },
  
  // =============== VALIDATION ADMINISTRATIVE ===============
  validation: {
    statutValidation: {
      type: String,
      enum: ['NON_VALIDE', 'EN_COURS', 'VALIDE', 'REJETE', 'EXPIRE'],
      default: 'NON_VALIDE'
    },
    validePar: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Utilisateur',
      required: false
    },
    dateValidation: { 
      type: Date, 
      required: false 
    },
    dateExpirationValidation: {
      type: Date,
      required: false
    },
    commentairesAdmin: { 
      type: String, 
      required: false 
    },
    documentsVerifies: [{
      nomDocument: String,
      verifie: Boolean,
      dateVerification: Date,
      commentaire: String
    }],
    historique: [{
      action: { 
        type: String, 
        enum: ['SOUMISSION', 'VALIDATION', 'REJET', 'MODIFICATION', 'RENOUVELLEMENT'] 
      },
      effectuePar: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Utilisateur'
      },
      date: Date,
      commentaire: String
    }]
  },
  
  // =============== TRAJET ACTIF ===============
  trajetActif: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Trajet',
    required: false
  },
  
  // =============== GÉOLOCALISATION (NOUVEAU) ===============
  dernierePosition: {
    latitude: {
      type: Number,
      min: -90,
      max: 90,
      required: false
    },
    longitude: {
      type: Number,
      min: -180,
      max: 180,
      required: false
    },
    adresse: {
      type: String,
      required: false
    },
    ville: {
      type: String,
      required: false
    },
    dateHeure: {
      type: Date,
      required: false
    }
  },
  
  // =============== SÉCURITÉ ET TRAÇABILITÉ ===============
  audit: {
    derniereModification: {
      date: { type: Date, default: Date.now },
      modifiePar: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Utilisateur'
      },
      champsModifies: [String],
      raisonModification: String
    },
    tentativesAcces: [{
      date: Date,
      utilisateur: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Utilisateur'
      },
      action: String,
      ipAddress: String,
      success: Boolean
    }]
  },
  
  // =============== NOTES INTERNES ===============
  notesInternes: {
    type: String,
    required: false,
    maxlength: [1000, 'Les notes internes ne peuvent pas dépasser 1000 caractères']
  },
  
  // =============== SIGNALEMENTS ===============
  signalements: [{
    signalePar: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Utilisateur'
    },
    date: { type: Date, default: Date.now },
    motif: {
      type: String,
      enum: [
        'DOCUMENTS_INVALIDES',
        'ETAT_VEHICULE',
        'SECURITE',
        'HYGIENE',
        'COMPORTEMENT_CONDUCTEUR',
        'AUTRE'
      ]
    },
    description: String,
    statut: {
      type: String,
      enum: ['EN_ATTENTE', 'EN_TRAITEMENT', 'RESOLU', 'REJETE'],
      default: 'EN_ATTENTE'
    },
    traite: { type: Boolean, default: false },
    traitePar: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Utilisateur'
    },
    dateTraitement: Date,
    actionPrise: String
  }]
  
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// =============== VIRTUALS ===============

// Virtual pour l'âge du véhicule
vehiculeSchema.virtual('age').get(function() {
  if (!this.annee) return null;
  return new Date().getFullYear() - this.annee;
});

// Virtual pour score de sécurité
vehiculeSchema.virtual('scoreSecurity').get(function() {
  let score = 0;
  const eq = this.equipements || {};
  
  // Ceintures de sécurité
  if (eq.ceintures === 'TOUTES_PLACES') score += 20;
  else if (eq.ceintures === 'AVANT_UNIQUEMENT') score += 10;
  
  // Airbags
  if (eq.nombreAirbags >= 6) score += 15;
  else if (eq.nombreAirbags >= 2) score += 10;
  else if (eq.airbags) score += 5;
  
  // Systèmes de sécurité active
  if (eq.abs) score += 10;
  if (eq.esp) score += 10;
  
  // Équipements obligatoires
  if (eq.trousseSecours) score += 5;
  if (eq.extincteur) score += 5;
  if (eq.triangleSignalisation) score += 5;
  if (eq.giletSecurite) score += 5;
  if (eq.roueDeSecours) score += 5;
  if (eq.cricCle) score += 5;
  
  // Bonus pour véhicule récent et bien entretenu
  if (this.age && this.age <= 3) score += 10;
  else if (this.age && this.age <= 7) score += 5;
  
  // Bonus pour documents à jour
  const docs = this.documentsValides();
  if (docs.tousValides) score += 10;
  
  return Math.min(score, 100);
});

// Virtual pour score de confort
vehiculeSchema.virtual('scoreConfort').get(function() {
  let score = 0;
  const eq = this.equipements || {};
  const com = this.commodites || {};
  
  if (eq.climatisation) score += 20;
  if (eq.vitresElectriques) score += 10;
  if (eq.verrouillagesCentralises) score += 5;
  if (eq.regulateurVitesse) score += 5;
  if (com.wifi) score += 10;
  if (com.chargeurTelephone || com.priseUSB) score += 10;
  if (com.musique || com.bluetooth) score += 10;
  if (com.siegesConfortables) score += 15;
  if (com.espaceBagages === 'GRAND') score += 15;
  else if (com.espaceBagages === 'MOYEN') score += 10;
  
  return Math.min(score, 100);
});

// Virtual pour taux de fiabilité
vehiculeSchema.virtual('tauxFiabilite').get(function() {
  const stats = this.statistiques || {};
  
  if (stats.nombreTrajets === 0) return 100;
  
  const tauxCompletion = 100 - (stats.tauxAnnulation || 0);
  const noteNormalisee = ((stats.noteMoyenne || 0) / 5) * 100;
  const facteurExperience = Math.min((stats.nombreTrajets / 50) * 100, 100);
  
  return ((tauxCompletion * 0.4) + (noteNormalisee * 0.4) + (facteurExperience * 0.2)).toFixed(2);
});

// =============== INDEX ===============
vehiculeSchema.index({ proprietaireId: 1 });
vehiculeSchema.index({ immatriculation: 1 }, { unique: true, sparse: true });
vehiculeSchema.index({ 'assurance.dateExpiration': 1 });
vehiculeSchema.index({ 'visiteTechnique.dateExpiration': 1 });
vehiculeSchema.index({ 'vignette.dateExpiration': 1 });
vehiculeSchema.index({ 'carteTransport.dateExpiration': 1 });
vehiculeSchema.index({ estPrincipal: 1, proprietaireId: 1 });
vehiculeSchema.index({ statut: 1 });
vehiculeSchema.index({ createdAt: -1 });
vehiculeSchema.index({ documentsComplets: 1 });
vehiculeSchema.index({ disponibilitePourCourse: 1, statut: 1 });
vehiculeSchema.index({ 'statistiques.noteMoyenne': -1 });
vehiculeSchema.index({ 'validation.statutValidation': 1 });
vehiculeSchema.index({ annee: 1 });
vehiculeSchema.index({ marque: 1, modele: 1 });
vehiculeSchema.index({ 'dernierePosition.ville': 1 });

// Index composés pour les recherches complexes
vehiculeSchema.index({ 
  disponibilitePourCourse: 1, 
  statut: 1, 
  'validation.statutValidation': 1,
  placesDisponibles: 1 
});

// =============== MIDDLEWARE PRE-SAVE ===============
vehiculeSchema.pre('save', function(next) {
  // Vérifier complétude des documents OBLIGATOIRES
  const carteGriseComplete = !!(
    this.carteGrise?.numero && 
    this.carteGrise?.dateEmission &&
    this.carteGrise?.numeroChassis
  );
  
  const assuranceComplete = !!(
    this.assurance?.numeroPolice && 
    this.assurance?.compagnie && 
    this.assurance?.dateExpiration &&
    this.assurance?.type
  );
  
  const visiteTechniqueComplete = !!(
    this.visiteTechnique?.dateExpiration &&
    this.visiteTechnique?.numeroAttestation
  );
  
  const vignetteComplete = !!(
    this.vignette?.annee && 
    this.vignette?.numero && 
    this.vignette?.dateExpiration
  );
  
  const carteTransportComplete = !!(
    this.carteTransport?.numero &&
    this.carteTransport?.dateExpiration &&
    this.carteTransport?.categorieAutorisee
  );
  
  // Photos : minimum 3 photos obligatoires (avant, arrière, intérieur)
  const photosCompletes = !!(
    this.photos?.avant && 
    this.photos?.arriere && 
    this.photos?.interieur
  );
  
  // Équipements obligatoires de sécurité
  const equipementsObligatoires = !!(
    this.equipements?.ceintures &&
    this.equipements?.trousseSecours &&
    this.equipements?.extincteur &&
    this.equipements?.triangleSignalisation &&
    this.equipements?.giletSecurite &&
    this.equipements?.roueDeSecours &&
    this.equipements?.cricCle
  );
  
  // Pour le transport commercial, TOUS les documents sont obligatoires
  this.documentsComplets = carteGriseComplete && 
                          assuranceComplete && 
                          visiteTechniqueComplete && 
                          vignetteComplete &&
                          carteTransportComplete &&
                          photosCompletes &&
                          equipementsObligatoires;
  
  // Progression automatique du statut
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
  
  // Désactiver disponibilité si statut incompatible
  if (!['ACTIF', 'DISPONIBLE'].includes(this.statut)) {
    this.disponibilitePourCourse = false;
  }
  
  // Calculer le taux d'annulation
  if (this.statistiques && this.statistiques.nombreTrajets > 0) {
    this.statistiques.tauxAnnulation = 
      (this.statistiques.nombreAnnulations / this.statistiques.nombreTrajets) * 100;
  }
  
  // Audit trail
  if (this.isModified() && !this.isNew) {
    const modifiedPaths = this.modifiedPaths();
    if (!this.audit) {
      this.audit = { derniereModification: {}, tentativesAcces: [] };
    }
    this.audit.derniereModification = {
      date: new Date(),
      champsModifies: modifiedPaths
    };
  }
  
  next();
});

// =============== MÉTHODES D'INSTANCE ===============

// Définir comme véhicule principal
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

// Vérifier validité des documents (AMÉLIORÉ)
vehiculeSchema.methods.documentsValides = function() {
  const maintenant = new Date();
  
  const calculerJoursRestants = (dateExp) => {
    if (!dateExp) return null;
    const diff = dateExp - maintenant;
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };
  
  const carteGriseValide = !!(
    this.carteGrise?.numero && 
    this.carteGrise?.dateEmission &&
    this.carteGrise?.numeroChassis
  );
  
  const assuranceValide = this.assurance?.dateExpiration && 
                          this.assurance.dateExpiration > maintenant &&
                          this.assurance.numeroPolice &&
                          this.assurance.compagnie;
  
  const visiteValide = this.visiteTechnique?.dateExpiration && 
                       this.visiteTechnique.dateExpiration > maintenant &&
                       this.visiteTechnique.numeroAttestation;
  
  const vignetteValide = this.vignette?.dateExpiration &&
                        this.vignette.dateExpiration > maintenant &&
                        this.vignette.numero;
  
  const carteTransportValide = this.carteTransport?.dateExpiration &&
                              this.carteTransport.dateExpiration > maintenant &&
                              this.carteTransport.numero;
  
  return {
    carteGrise: {
      presente: carteGriseValide,
      valide: carteGriseValide,
      numero: this.carteGrise?.numero || null,
      numeroChassis: this.carteGrise?.numeroChassis || null
    },
    assurance: {
      presente: !!(this.assurance?.numeroPolice && this.assurance?.compagnie),
      valide: assuranceValide,
      dateExpiration: this.assurance?.dateExpiration || null,
      joursRestants: calculerJoursRestants(this.assurance?.dateExpiration),
      numeroPolice: this.assurance?.numeroPolice || null,
      compagnie: this.assurance?.compagnie || null,
      type: this.assurance?.type || null
    },
    visiteTechnique: {
      presente: !!this.visiteTechnique?.dateExpiration,
      valide: visiteValide,
      dateExpiration: this.visiteTechnique?.dateExpiration || null,
      joursRestants: calculerJoursRestants(this.visiteTechnique?.dateExpiration),
      resultat: this.visiteTechnique?.resultat || null
    },
    vignette: {
      presente: !!(this.vignette?.annee && this.vignette?.numero),
      valide: vignetteValide,
      dateExpiration: this.vignette?.dateExpiration || null,
      joursRestants: calculerJoursRestants(this.vignette?.dateExpiration),
      annee: this.vignette?.annee || null
    },
    carteTransport: {
      presente: !!this.carteTransport?.numero,
      valide: carteTransportValide,
      dateExpiration: this.carteTransport?.dateExpiration || null,
      joursRestants: calculerJoursRestants(this.carteTransport?.dateExpiration),
      categorie: this.carteTransport?.categorieAutorisee || null
    },
    photos: {
      completes: !!(this.photos?.avant && this.photos?.arriere && this.photos?.interieur),
      nombre: [this.photos?.avant, this.photos?.arriere, this.photos?.lateral_gauche, 
               this.photos?.lateral_droit, this.photos?.interieur, this.photos?.tableau_bord]
               .filter(Boolean).length
    },
    equipements: {
      obligatoiresPresents: !!(
        this.equipements?.trousseSecours &&
        this.equipements?.extincteur &&
        this.equipements?.triangleSignalisation &&
        this.equipements?.giletSecurite &&
        this.equipements?.roueDeSecours &&
        this.equipements?.cricCle
      )
    },
    documentsComplets: this.documentsComplets,
    tousValides: carteGriseValide && assuranceValide && visiteValide && vignetteValide && carteTransportValide,
    peutEtreActif: carteGriseValide && assuranceValide && visiteValide && vignetteValide && carteTransportValide,
    alertes: this.genererAlertes()
  };
};

// NOUVEAU : Générer alertes pour documents proches de l'expiration
vehiculeSchema.methods.genererAlertes = function() {
  const alertes = [];
  const maintenant = new Date();
  const limite30j = new Date();
  limite30j.setDate(limite30j.getDate() + 30);
  
  const verifierExpiration = (date, nomDocument, niveau) => {
    if (!date) return;
    
    if (date < maintenant) {
      alertes.push({
        type: 'EXPIRE',
        document: nomDocument,
        severite: 'CRITIQUE',
        message: `${nomDocument} expiré`,
        dateExpiration: date
      });
    } else if (date < limite30j) {
      alertes.push({
        type: 'EXPIRE_BIENTOT',
        document: nomDocument,
        severite: niveau || 'MOYEN',
        message: `${nomDocument} expire dans ${Math.ceil((date - maintenant) / (1000 * 60 * 60 * 24))} jours`,
        dateExpiration: date
      });
    }
  };
  
  verifierExpiration(this.assurance?.dateExpiration, 'Assurance', 'CRITIQUE');
  verifierExpiration(this.visiteTechnique?.dateExpiration, 'Visite technique', 'CRITIQUE');
  verifierExpiration(this.vignette?.dateExpiration, 'Vignette', 'ELEVE');
  verifierExpiration(this.carteTransport?.dateExpiration, 'Carte de transport', 'CRITIQUE');
  verifierExpiration(this.carteGrise?.dateExpiration, 'Carte grise', 'MOYEN');
  
  return alertes;
};

// Vérifier documents manquants (AMÉLIORÉ)
vehiculeSchema.methods.documentsManquants = function() {
  const manquants = [];
  
  // Carte grise
  if (!this.carteGrise?.numero) manquants.push('carteGrise.numero');
  if (!this.carteGrise?.dateEmission) manquants.push('carteGrise.dateEmission');
  if (!this.carteGrise?.numeroChassis) manquants.push('carteGrise.numeroChassis');
  
  // Assurance
  if (!this.assurance?.numeroPolice) manquants.push('assurance.numeroPolice');
  if (!this.assurance?.compagnie) manquants.push('assurance.compagnie');
  if (!this.assurance?.dateExpiration) manquants.push('assurance.dateExpiration');
  if (!this.assurance?.type) manquants.push('assurance.type');
  
  // Visite technique
  if (!this.visiteTechnique?.dateExpiration) manquants.push('visiteTechnique.dateExpiration');
  if (!this.visiteTechnique?.numeroAttestation) manquants.push('visiteTechnique.numeroAttestation');
  
  // Vignette
  if (!this.vignette?.annee) manquants.push('vignette.annee');
  if (!this.vignette?.numero) manquants.push('vignette.numero');
  if (!this.vignette?.dateExpiration) manquants.push('vignette.dateExpiration');
  
  // Carte de transport
  if (!this.carteTransport?.numero) manquants.push('carteTransport.numero');
  if (!this.carteTransport?.dateExpiration) manquants.push('carteTransport.dateExpiration');
  if (!this.carteTransport?.categorieAutorisee) manquants.push('carteTransport.categorieAutorisee');
  
  // Photos
  if (!this.photos?.avant) manquants.push('photos.avant');
  if (!this.photos?.arriere) manquants.push('photos.arriere');
  if (!this.photos?.interieur) manquants.push('photos.interieur');
  
  // Équipements obligatoires
  if (!this.equipements?.trousseSecours) manquants.push('equipements.trousseSecours');
  if (!this.equipements?.extincteur) manquants.push('equipements.extincteur');
  if (!this.equipements?.triangleSignalisation) manquants.push('equipements.triangleSignalisation');
  if (!this.equipements?.giletSecurite) manquants.push('equipements.giletSecurite');
  if (!this.equipements?.roueDeSecours) manquants.push('equipements.roueDeSecours');
  if (!this.equipements?.cricCle) manquants.push('equipements.cricCle');
  
  return {
    manquants,
    complet: manquants.length === 0,
    nombreManquants: manquants.length,
    pourcentageCompletion: ((1 - (manquants.length / 26)) * 100).toFixed(2) // 26 champs obligatoires
  };
};

// Compléter documents (AMÉLIORÉ)
vehiculeSchema.methods.completerDocuments = async function(documents) {
  if (documents.carteGrise) {
    this.carteGrise = {
      ...this.carteGrise,
      ...documents.carteGrise
    };
  }
  
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
  
  if (documents.vignette) {
    this.vignette = {
      ...this.vignette,
      ...documents.vignette
    };
  }
  
  if (documents.carteTransport) {
    this.carteTransport = {
      ...this.carteTransport,
      ...documents.carteTransport
    };
  }
  
  if (documents.photos) {
    this.photos = {
      ...this.photos,
      ...documents.photos
    };
  }
  
  if (documents.equipements) {
    this.equipements = {
      ...this.equipements,
      ...documents.equipements
    };
  }
  
  return await this.save();
};

// =============== MÉTHODES COVOITURAGE ===============

// Vérifier disponibilité pour trajet (AMÉLIORÉ)
vehiculeSchema.methods.estDisponiblePourTrajet = function(nombrePlacesRequises = 1) {
  const raisons = [];
  
  if (!this.disponibilitePourCourse) {
    raisons.push('Véhicule marqué comme indisponible');
  }
  
  if (this.statut !== 'DISPONIBLE') {
    raisons.push(`Statut incompatible: ${this.statut}`);
  }
  
  if (this.placesDisponibles < nombrePlacesRequises) {
    raisons.push(`Places insuffisantes (${this.placesDisponibles} disponibles, ${nombrePlacesRequises} requises)`);
  }
  
  const docsValides = this.documentsValides();
  if (!docsValides.tousValides) {
    raisons.push('Documents invalides ou expirés');
  }
  
  if (this.validation?.statutValidation !== 'VALIDE') {
    raisons.push('Véhicule non validé par l\'administration');
  }
  
  // Vérifier équipements obligatoires
  if (!docsValides.equipements.obligatoiresPresents) {
    raisons.push('Équipements de sécurité obligatoires manquants');
  }
  
  // Vérifier âge du véhicule
  if (this.age && this.age > 15) {
    raisons.push('Véhicule trop ancien (> 15 ans)');
  }
  
  return {
    disponible: raisons.length === 0,
    raisons,
    score: this.calculerScoreEligibilite()
  };
};

// NOUVEAU : Calculer score d'éligibilité
vehiculeSchema.methods.calculerScoreEligibilite = function() {
  let score = 0;
  
  // Documents valides (40 points)
  const docs = this.documentsValides();
  if (docs.tousValides) score += 40;
  
  // Score de sécurité (30 points)
  score += (this.scoreSecurity || 0) * 0.3;
  
  // Statistiques (20 points)
  if (this.statistiques) {
    const noteNormalisee = (this.statistiques.noteMoyenne / 5) * 15;
    const fiabilite = (100 - this.statistiques.tauxAnnulation) * 0.05;
    score += noteNormalisee + fiabilite;
  }
  
  // Âge du véhicule (10 points)
  if (this.age <= 3) score += 10;
  else if (this.age <= 7) score += 7;
  else if (this.age <= 10) score += 4;
  
  return Math.min(score, 100).toFixed(2);
};

// Réserver places
vehiculeSchema.methods.reserverPlaces = async function(nombrePlaces, trajetId) {
  if (this.placesDisponibles < nombrePlaces) {
    throw new Error(`Places insuffisantes: ${this.placesDisponibles} disponibles, ${nombrePlaces} requises`);
  }
  
  this.placesDisponibles -= nombrePlaces;
  this.statut = 'EN_COURSE';
  this.trajetActif = trajetId;
  
  return await this.save();
};

// Libérer places
vehiculeSchema.methods.libererPlaces = async function(nombrePlaces) {
  this.placesDisponibles += nombrePlaces;
  
  // Ne pas dépasser le nombre maximum
  const maxPlaces = this.nombrePlaces - 1; // -1 pour le conducteur
  if (this.placesDisponibles > maxPlaces) {
    this.placesDisponibles = maxPlaces;
  }
  
  // Si toutes les places sont libres, repasser en DISPONIBLE
  if (this.placesDisponibles === maxPlaces) {
    this.statut = 'DISPONIBLE';
    this.trajetActif = null;
  }
  
  return await this.save();
};

// Activer pour covoiturage
vehiculeSchema.methods.activerPourCovoiturage = async function() {
  const validation = this.documentsValides();
  
  if (!validation.tousValides) {
    throw new Error('Impossible d\'activer: documents invalides ou expirés');
  }
  
  if (this.validation?.statutValidation !== 'VALIDE') {
    throw new Error('Véhicule non validé par l\'administration');
  }
  
  if (!validation.equipements.obligatoiresPresents) {
    throw new Error('Équipements de sécurité obligatoires manquants');
  }
  
  this.statut = 'DISPONIBLE';
  this.disponibilitePourCourse = true;
  this.placesDisponibles = this.nombrePlaces - 1;
  
  return await this.save();
};

// Désactiver pour covoiturage
vehiculeSchema.methods.desactiverPourCovoiturage = async function(raison) {
  this.disponibilitePourCourse = false;
  
  if (this.statut === 'DISPONIBLE') {
    this.statut = 'INACTIF';
  }
  
  if (raison && this.notesInternes) {
    this.notesInternes += `\n[${new Date().toISOString()}] Désactivation: ${raison}`;
  }
  
  return await this.save();
};

// Enregistrer un trajet complété
vehiculeSchema.methods.enregistrerTrajet = async function(nombrePassagers, kilometresParcourus = 0) {
  if (!this.statistiques) {
    this.statistiques = {
      nombreTrajets: 0,
      nombrePassagers: 0,
      kilometresParcourus: 0,
      noteMoyenne: 0,
      nombreAvis: 0,
      nombreAnnulations: 0,
      tauxAnnulation: 0,
      tauxAcceptation: 100,
      tempsMoyenReponse: 0,
      dernierTrajet: null,
      premiereUtilisation: null
    };
  }
  
  this.statistiques.nombreTrajets += 1;
  this.statistiques.nombrePassagers += nombrePassagers;
  this.statistiques.kilometresParcourus += kilometresParcourus;
  this.statistiques.dernierTrajet = new Date();
  
  if (!this.statistiques.premiereUtilisation) {
    this.statistiques.premiereUtilisation = new Date();
  }
  
  // Mettre à jour le kilométrage du véhicule
  this.kilometrage += kilometresParcourus;
  
  return await this.save();
};

// Enregistrer une annulation
vehiculeSchema.methods.enregistrerAnnulation = async function() {
  if (!this.statistiques) {
    this.statistiques = {
      nombreTrajets: 0,
      nombrePassagers: 0,
      kilometresParcourus: 0,
      noteMoyenne: 0,
      nombreAvis: 0,
      nombreAnnulations: 0,
      tauxAnnulation: 0,
      tauxAcceptation: 100,
      tempsMoyenReponse: 0,
      dernierTrajet: null,
      premiereUtilisation: null
    };
  }
  
  this.statistiques.nombreAnnulations += 1;
  
  return await this.save();
};

// Mettre à jour la note
vehiculeSchema.methods.mettreAJourNote = async function(nouvelleNote) {
  if (nouvelleNote < 0 || nouvelleNote > 5) {
    throw new Error('La note doit être entre 0 et 5');
  }
  
  if (!this.statistiques) {
    this.statistiques = {
      nombreTrajets: 0,
      nombrePassagers: 0,
      kilometresParcourus: 0,
      noteMoyenne: 0,
      nombreAvis: 0,
      nombreAnnulations: 0,
      tauxAnnulation: 0,
      tauxAcceptation: 100,
      tempsMoyenReponse: 0,
      dernierTrajet: null,
      premiereUtilisation: null
    };
  }
  
  const totalNotes = this.statistiques.noteMoyenne * this.statistiques.nombreAvis;
  this.statistiques.nombreAvis += 1;
  this.statistiques.noteMoyenne = (totalNotes + nouvelleNote) / this.statistiques.nombreAvis;
  
  return await this.save();
};

// Mettre à jour la position
vehiculeSchema.methods.mettreAJourPosition = async function(latitude, longitude, adresse = null, ville = null) {
  this.dernierePosition = {
    latitude,
    longitude,
    adresse,
    ville,
    dateHeure: new Date()
  };
  
  return await this.save();
};

// Ajouter entrée maintenance
vehiculeSchema.methods.ajouterMaintenance = async function(maintenanceData) {
  if (!this.maintenance) {
    this.maintenance = {
      prochainEntretien: null,
      prochainEntretienKm: null,
      dernierEntretien: null,
      frequenceEntretien: 10000,
      historique: []
    };
  }
  
  const maintenance = {
    date: maintenanceData.date || new Date(),
    type: maintenanceData.type,
    description: maintenanceData.description,
    cout: maintenanceData.cout,
    garage: maintenanceData.garage,
    kilometrageAuMoment: this.kilometrage,
    pieceChangees: maintenanceData.pieceChangees || [],
    facture: maintenanceData.facture
  };
  
  this.maintenance.historique.push(maintenance);
  this.maintenance.dernierEntretien = maintenance.date;
  
  // Calculer prochain entretien
  if (maintenanceData.type === 'REVISION_COMPLETE' || maintenanceData.type === 'VIDANGE') {
    this.maintenance.prochainEntretienKm = this.kilometrage + this.maintenance.frequenceEntretien;
    
    const joursProchainEntretien = Math.ceil(this.maintenance.frequenceEntretien / 50); // Estimation 50km/jour
    this.maintenance.prochainEntretien = new Date();
    this.maintenance.prochainEntretien.setDate(this.maintenance.prochainEntretien.getDate() + joursProchainEntretien);
  }
  
  return await this.save();
};

// Ajouter un signalement
vehiculeSchema.methods.ajouterSignalement = async function(signalementData) {
  if (!this.signalements) {
    this.signalements = [];
  }
  
  const signalement = {
    signalePar: signalementData.signalePar,
    date: new Date(),
    motif: signalementData.motif,
    description: signalementData.description,
    statut: 'EN_ATTENTE',
    traite: false
  };
  
  this.signalements.push(signalement);
  
  // Si signalement critique, suspendre automatiquement
  if (['DOCUMENTS_INVALIDES', 'SECURITE'].includes(signalementData.motif)) {
    this.statut = 'SUSPENDU';
    this.disponibilitePourCourse = false;
  }
  
  return await this.save();
};

// Archiver véhicule
vehiculeSchema.methods.archiver = async function(raison = null) {
  this.statut = 'HORS_SERVICE';
  this.estPrincipal = false;
  this.disponibilitePourCourse = false;
  
  if (raison) {
    this.notesInternes = (this.notesInternes || '') + `\n[${new Date().toISOString()}] Archivé: ${raison}`;
  }
  
  return await this.save();
};

// Activer véhicule (après validation admin)
vehiculeSchema.methods.activer = async function() {
  const validation = this.documentsValides();
  
  if (!validation.tousValides) {
    const manquants = this.documentsManquants();
    throw new Error(`Impossible d'activer: documents invalides. Manquants: ${manquants.manquants.join(', ')}`);
  }
  
  if (this.validation?.statutValidation !== 'VALIDE') {
    throw new Error('Véhicule non validé par l\'administration');
  }
  
  this.statut = 'ACTIF';
  this.raisonRejet = null;
  
  return await this.save();
};

// Rejeter véhicule
vehiculeSchema.methods.rejeter = async function(raison, rejetePar = null) {
  this.statut = 'REJETE';
  this.raisonRejet = raison;
  this.disponibilitePourCourse = false;
  
  if (this.validation) {
    this.validation.statutValidation = 'REJETE';
    this.validation.commentairesAdmin = raison;
    this.validation.dateValidation = new Date();
    this.validation.validePar = rejetePar;
  }
  
  // Ajouter à l'historique de validation
  if (!this.validation.historique) {
    this.validation.historique = [];
  }
  
  this.validation.historique.push({
    action: 'REJET',
    effectuePar: rejetePar,
    date: new Date(),
    commentaire: raison
  });
  
  return await this.save();
};

// Valider véhicule (admin)
vehiculeSchema.methods.valider = async function(validePar, commentaire = null) {
  const validation = this.documentsValides();
  
  if (!validation.tousValides) {
    throw new Error('Impossible de valider: documents incomplets ou invalides');
  }
  
  this.validation = {
    ...this.validation,
    statutValidation: 'VALIDE',
    validePar: validePar,
    dateValidation: new Date(),
    dateExpirationValidation: this.calculerDateExpirationValidation(),
    commentairesAdmin: commentaire
  };
  
  // Ajouter à l'historique
  if (!this.validation.historique) {
    this.validation.historique = [];
  }
  
  this.validation.historique.push({
    action: 'VALIDATION',
    effectuePar: validePar,
    date: new Date(),
    commentaire: commentaire
  });
  
  this.statut = 'ACTIF';
  this.raisonRejet = null;
  
  return await this.save();
};

// NOUVEAU : Calculer date d'expiration de la validation (basée sur le document qui expire le plus tôt)
vehiculeSchema.methods.calculerDateExpirationValidation = function() {
  const dates = [
    this.assurance?.dateExpiration,
    this.visiteTechnique?.dateExpiration,
    this.vignette?.dateExpiration,
    this.carteTransport?.dateExpiration
  ].filter(Boolean);
  
  if (dates.length === 0) return null;
  
  return new Date(Math.min(...dates.map(d => d.getTime())));
};

// =============== MÉTHODES STATIQUES ===============

// Trouver documents expirés ou bientôt expirés
vehiculeSchema.statics.documentsExpiresOuBientot = function(joursAvance = 30) {
  const dateLimite = new Date();
  dateLimite.setDate(dateLimite.getDate() + joursAvance);
  
  return this.find({
    documentsComplets: true,
    $or: [
      { 'assurance.dateExpiration': { $lte: dateLimite } },
      { 'visiteTechnique.dateExpiration': { $lte: dateLimite } },
      { 'vignette.dateExpiration': { $lte: dateLimite } },
      { 'carteTransport.dateExpiration': { $lte: dateLimite } },
      { 'carteGrise.dateExpiration': { $lte: dateLimite } }
    ]
  }).populate('proprietaireId', 'nom prenom email telephone');
};

// Trouver documents incomplets
vehiculeSchema.statics.documentsIncomplets = function() {
  return this.find({
    documentsComplets: false,
    statut: 'EN_ATTENTE_DOCUMENTS'
  }).populate('proprietaireId', 'nom prenom email telephone');
};

// Trouver véhicules disponibles pour covoiturage (AMÉLIORÉ)
vehiculeSchema.statics.trouverDisponibles = function(criteres = {}) {
  const query = {
    disponibilitePourCourse: true,
    statut: 'DISPONIBLE',
    'validation.statutValidation': 'VALIDE'
  };
  
  // Nombre de places minimum requis
  if (criteres.nombrePlacesMin) {
    query.placesDisponibles = { $gte: criteres.nombrePlacesMin };
  }
  
  // Note minimale
  if (criteres.noteMinimale) {
    query['statistiques.noteMoyenne'] = { $gte: criteres.noteMinimale };
  }
  
  // Ville/localisation
  if (criteres.ville) {
    query['dernierePosition.ville'] = new RegExp(criteres.ville, 'i');
  }
  
  // Année minimum
  if (criteres.anneeMinimum) {
    query.annee = { $gte: criteres.anneeMinimum };
  }
  
  // Type de carburant
  if (criteres.carburant) {
    query.carburant = criteres.carburant;
  }
  
  // Équipements obligatoires
  if (criteres.equipements) {
    Object.keys(criteres.equipements).forEach(eq => {
      if (criteres.equipements[eq]) {
        query[`equipements.${eq}`] = true;
      }
    });
  }
  
  // Commodités
  if (criteres.commodites) {
    Object.keys(criteres.commodites).forEach(com => {
      if (criteres.commodites[com]) {
        query[`commodites.${com}`] = true;
      }
    });
  }
  
  // Préférences
  if (criteres.preferences) {
    Object.keys(criteres.preferences).forEach(pref => {
      if (criteres.preferences[pref] !== undefined) {
        query[`preferences.${pref}`] = criteres.preferences[pref];
      }
    });
  }
  
  return this.find(query)
    .populate('proprietaireId', 'nom prenom telephone photo noteMoyenne nombreTrajets estCertifie')
    .sort({ 
      'statistiques.noteMoyenne': -1, 
      'statistiques.nombreTrajets': -1,
      'statistiques.tauxAnnulation': 1
    });
};

// Véhicules en attente de validation admin
vehiculeSchema.statics.enAttenteValidation = function() {
  return this.find({
    documentsComplets: true,
    'validation.statutValidation': { $in: ['NON_VALIDE', 'EN_COURS'] },
    statut: 'EN_ATTENTE_VERIFICATION'
  })
  .populate('proprietaireId', 'nom prenom email telephone')
  .sort({ createdAt: 1 }); // Les plus anciens en premier
};

// Véhicules par propriétaire
vehiculeSchema.statics.parProprietaire = function(proprietaireId) {
  return this.find({ proprietaireId })
    .sort({ estPrincipal: -1, createdAt: -1 });
};

// Véhicules nécessitant une maintenance
vehiculeSchema.statics.maintenanceRequise = function() {
  const maintenant = new Date();
  
  return this.find({
    statut: { $in: ['ACTIF', 'DISPONIBLE'] },
    $or: [
      { 'maintenance.prochainEntretien': { $lte: maintenant } },
      { 
        $expr: { 
          $gte: ['$kilometrage', '$maintenance.prochainEntretienKm'] 
        } 
      }
    ]
  }).populate('proprietaireId', 'nom prenom email telephone');
};

// Statistiques globales
vehiculeSchema.statics.statistiquesGlobales = async function() {
  const stats = await this.aggregate([
    {
      $group: {
        _id: null,
        totalVehicules: { $sum: 1 },
        vehiculesActifs: {
          $sum: { $cond: [{ $eq: ['$statut', 'ACTIF'] }, 1, 0] }
        },
        vehiculesDisponibles: {
          $sum: { $cond: [{ $eq: ['$statut', 'DISPONIBLE'] }, 1, 0] }
        },
        vehiculesEnCourse: {
          $sum: { $cond: [{ $eq: ['$statut', 'EN_COURSE'] }, 1, 0] }
        },
        vehiculesValides: {
          $sum: { $cond: [{ $eq: ['$validation.statutValidation', 'VALIDE'] }, 1, 0] }
        },
        vehiculesEnAttente: {
          $sum: { $cond: [{ $eq: ['$statut', 'EN_ATTENTE_VERIFICATION'] }, 1, 0] }
        },
        noteMoyenneGlobale: { $avg: '$statistiques.noteMoyenne' },
        totalTrajets: { $sum: '$statistiques.nombreTrajets' },
        totalPassagers: { $sum: '$statistiques.nombrePassagers' },
        kilometrageTotal: { $sum: '$statistiques.kilometresParcourus' },
        ageMoyen: { $avg: { $subtract: [new Date().getFullYear(), '$annee'] } }
      }
    }
  ]);
  
  return stats[0] || {};
};

// Top véhicules par note
vehiculeSchema.statics.topParNote = function(limite = 10) {
  return this.find({
    'statistiques.nombreAvis': { $gte: 5 }, // Au moins 5 avis
    'validation.statutValidation': 'VALIDE',
    statut: { $in: ['ACTIF', 'DISPONIBLE'] }
  })
  .sort({ 'statistiques.noteMoyenne': -1, 'statistiques.nombreTrajets': -1 })
  .limit(limite)
  .populate('proprietaireId', 'nom prenom photo');
};

// Véhicules les plus actifs
vehiculeSchema.statics.plusActifs = function(limite = 10) {
  return this.find({
    'validation.statutValidation': 'VALIDE',
    statut: { $in: ['ACTIF', 'DISPONIBLE', 'EN_COURSE'] }
  })
  .sort({ 'statistiques.nombreTrajets': -1, 'statistiques.noteMoyenne': -1 })
  .limit(limite)
  .populate('proprietaireId', 'nom prenom photo');
};

// Véhicules avec signalements non traités
vehiculeSchema.statics.avecSignalementsNonTraites = function() {
  return this.find({
    'signalements': {
      $elemMatch: {
        traite: false,
        statut: { $in: ['EN_ATTENTE', 'EN_TRAITEMENT'] }
      }
    }
  })
  .populate('proprietaireId', 'nom prenom email telephone')
  .populate('signalements.signalePar', 'nom prenom');
};

// Recherche avancée
vehiculeSchema.statics.rechercheAvancee = function(filtres = {}) {
  const query = {};
  
  // Statuts autorisés pour la recherche
  query.statut = { $in: ['ACTIF', 'DISPONIBLE'] };
  query['validation.statutValidation'] = 'VALIDE';
  
  // Marque et modèle
  if (filtres.marque) {
    query.marque = new RegExp(filtres.marque, 'i');
  }
  if (filtres.modele) {
    query.modele = new RegExp(filtres.modele, 'i');
  }
  
  // Couleur
  if (filtres.couleur) {
    query.couleur = new RegExp(filtres.couleur, 'i');
  }
  
  // Année
  if (filtres.anneeMin || filtres.anneeMax) {
    query.annee = {};
    if (filtres.anneeMin) query.annee.$gte = filtres.anneeMin;
    if (filtres.anneeMax) query.annee.$lte = filtres.anneeMax;
  }
  
  // Nombre de places
  if (filtres.nombrePlacesMin) {
    query.placesDisponibles = { $gte: filtres.nombrePlacesMin };
  }
  
  // Note minimale
  if (filtres.noteMin) {
    query['statistiques.noteMoyenne'] = { $gte: filtres.noteMin };
  }
  
  // Type de carburant
  if (filtres.carburant) {
    query.carburant = filtres.carburant;
  }
  
  // Type de carrosserie
  if (filtres.typeCarrosserie) {
    query.typeCarrosserie = filtres.typeCarrosserie;
  }
  
  // Transmission
  if (filtres.transmission) {
    query.transmission = filtres.transmission;
  }
  
  // Climatisation
  if (filtres.climatisation) {
    query['equipements.climatisation'] = true;
  }
  
  // Ville
  if (filtres.ville) {
    query['dernierePosition.ville'] = new RegExp(filtres.ville, 'i');
  }
  
  // Score de sécurité minimum (virtuel - géré après la requête)
  const scoreSecuriteMin = filtres.scoreSecuriteMin;
  
  return this.find(query)
    .populate('proprietaireId', 'nom prenom telephone photo noteMoyenne estCertifie')
    .then(vehicules => {
      if (scoreSecuriteMin) {
        return vehicules.filter(v => v.scoreSecurity >= scoreSecuriteMin);
      }
      return vehicules;
    });
};

// Exporter statistiques pour analytics
vehiculeSchema.statics.exporterStatistiques = async function(dateDebut, dateFin) {
  return await this.aggregate([
    {
      $match: {
        createdAt: {
          $gte: dateDebut,
          $lte: dateFin
        }
      }
    },
    {
      $group: {
        _id: {
          annee: { $year: '$createdAt' },
          mois: { $month: '$createdAt' }
        },
        nombreInscriptions: { $sum: 1 },
        nombreValidations: {
          $sum: { $cond: [{ $eq: ['$validation.statutValidation', 'VALIDE'] }, 1, 0] }
        },
        nombreRejets: {
          $sum: { $cond: [{ $eq: ['$validation.statutValidation', 'REJETE'] }, 1, 0] }
        },
        marques: { $addToSet: '$marque' },
        noteMoyenne: { $avg: '$statistiques.noteMoyenne' }
      }
    },
    {
      $sort: { '_id.annee': 1, '_id.mois': 1 }
    }
  ]);
};

// =============== HOOKS POST-SAVE ===============
vehiculeSchema.post('save', function(doc) {
  // Log pour audit
  console.log(`Véhicule ${doc.immatriculation} - Action: ${doc.isNew ? 'CREATION' : 'MODIFICATION'} - Statut: ${doc.statut}`);
});

// =============== MÉTHODES UTILITAIRES ===============

// Formater pour API response
vehiculeSchema.methods.toPublicJSON = function() {
  return {
    id: this._id,
    marque: this.marque,
    modele: this.modele,
    couleur: this.couleur,
    annee: this.annee,
    age: this.age,
    nombrePlaces: this.nombrePlaces,
    placesDisponibles: this.placesDisponibles,
    immatriculation: this.immatriculation.substring(0, 6) + '***', // Masquer partiellement
    photos: this.photos,
    carburant: this.carburant,
    typeCarrosserie: this.typeCarrosserie,
    transmission: this.transmission,
    equipements: this.equipements,
    commodites: this.commodites,
    preferences: this.preferences,
    statistiques: {
      nombreTrajets: this.statistiques?.nombreTrajets || 0,
      noteMoyenne: this.statistiques?.noteMoyenne || 0,
      nombreAvis: this.statistiques?.nombreAvis || 0
    },
    scoreSecurity: this.scoreSecurity,
    scoreConfort: this.scoreConfort,
    tauxFiabilite: this.tauxFiabilite,
    statut: this.statut,
    proprietaire: this.proprietaireId ? {
      id: this.proprietaireId._id,
      nom: this.proprietaireId.nom,
      prenom: this.proprietaireId.prenom,
      photo: this.proprietaireId.photo,
      noteMoyenne: this.proprietaireId.noteMoyenne,
      estCertifie: this.proprietaireId.estCertifie
    } : null
  };
};

// Formater pour admin
vehiculeSchema.methods.toAdminJSON = function() {
  return {
    ...this.toObject(),
    documentsValidation: this.documentsValides(),
    documentsManquantsInfo: this.documentsManquants(),
    alertes: this.genererAlertes(),
    scoreEligibilite: this.calculerScoreEligibilite()
  };
};

// =============== VALIDATION FINALE ===============
vehiculeSchema.path('annee').validate(function(value) {
  const age = new Date().getFullYear() - value;
  if (age > 15 && this.disponibilitePourCourse) {
    return false;
  }
  return true;
}, 'Véhicule trop ancien pour le covoiturage (> 15 ans)');

// =============== EXPORT ===============
module.exports = mongoose.model('Vehicule', vehiculeSchema);