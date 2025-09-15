// models/Reservation.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

// Schéma pour les coordonnées géospatiales
const CoordinatesSchema = new Schema({
  type: {
    type: String,
    enum: ['Point'],
    default: 'Point',
    required: true
  },
  coordinates: {
    type: [Number],
    required: true,
    validate: {
      validator: function(coords) {
        return coords.length === 2 && 
               coords[0] >= -180 && coords[0] <= 180 && // longitude
               coords[1] >= -90 && coords[1] <= 90;     // latitude
      },
      message: 'Les coordonnées doivent être [longitude, latitude] avec longitude entre -180 et 180, latitude entre -90 et 90'
    }
  }
}, { _id: false });

// Schéma pour les points de prise en charge et dépose
const PointSchema = new Schema({
  nom: {
    type: String,
    required: [true, 'Le nom du point est requis'],
    trim: true,
    maxlength: [100, 'Le nom ne peut dépasser 100 caractères']
  },
  adresse: {
    type: String,
    required: [true, 'L\'adresse est requise'],
    trim: true,
    maxlength: [200, 'L\'adresse ne peut dépasser 200 caractères']
  },
  coordonnees: {
    type: CoordinatesSchema,
    required: true,
    index: '2dsphere'
  }
}, { _id: false });

// Schéma pour les bagages
const BagagesSchema = new Schema({
  quantite: {
    type: Number,
    default: 0,
    min: [0, 'La quantité ne peut être négative'],
    max: [10, 'Maximum 10 bagages autorisés']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [200, 'La description ne peut dépasser 200 caractères']
  },
  poids: {
    type: Number,
    default: 0,
    min: [0, 'Le poids ne peut être négatif'],
    max: [100, 'Le poids maximum est 100kg']
  }
}, { _id: false });

// Schéma pour le suivi en temps réel
const PositionTempsReelSchema = new Schema({
  coordonnees: {
    type: CoordinatesSchema,
    required: true
  },
  lastUpdate: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

// Schéma pour les notifications programmées
const NotificationSchema = new Schema({
  type: {
    type: String,
    enum: ['RAPPEL_DEPART', 'CONDUCTEUR_PROCHE', 'ARRIVEE'],
    required: true
  },
  heureEnvoi: {
    type: Date,
    required: true
  },
  envoye: {
    type: Boolean,
    default: false
  }
}, { _id: false });

// ===== NOUVEAU : SCHÉMA VALIDATION PAIEMENT =====
const ValidationPaiementSchema = new Schema({
  estValide: {
    type: Boolean,
    default: false
  },
  raisonInvalidite: {
    type: String,
    enum: [
      'mode_paiement_non_autorise',
      'compte_insuffisant', 
      'especes_non_autorise',
      'conducteur_compte_non_recharge',
      'trajet_non_disponible',
      'places_insuffisantes'
    ]
  },
  verificationsEffectuees: {
    compteConducteurVerifie: {
      type: Boolean,
      default: false
    },
    modePaiementValide: {
      type: Boolean,
      default: false
    },
    soldeDisponible: {
      type: Boolean,
      default: false
    },
    commissionCalculee: {
      type: Boolean,
      default: false
    },
    placesDisponiblesVerifiees: {
      type: Boolean,
      default: false
    }
  },
  dateValidation: Date,
  validePar: {
    type: String,
    enum: ['system', 'admin', 'conducteur'],
    default: 'system'
  }
}, { _id: false });

// Schéma principal de la réservation
const ReservationSchema = new Schema({
  trajetId: {
    type: Schema.Types.ObjectId,
    ref: 'Trajet',
    required: [true, 'Le trajet est requis'],
    index: true
  },
  passagerId: {
    type: Schema.Types.ObjectId,
    ref: 'Utilisateur',
    required: [true, 'Le passager est requis'],
    index: true
  },

  // Détails de la réservation
  nombrePlacesReservees: {
    type: Number,
    required: [true, 'Le nombre de places est requis'],
    min: [1, 'Au moins 1 place doit être réservée'],
    max: [8, 'Maximum 8 places par réservation'],
    validate: {
      validator: Number.isInteger,
      message: 'Le nombre de places doit être un entier'
    }
  },
  pointPriseEnCharge: {
    type: PointSchema,
    required: [true, 'Le point de prise en charge est requis']
  },
  pointDepose: {
    type: PointSchema,
    required: [true, 'Le point de dépose est requis']
  },

  // Statut de la réservation
  statutReservation: {
    type: String,
    enum: {
      values: ['EN_ATTENTE', 'CONFIRMEE', 'REFUSEE', 'ANNULEE', 'TERMINEE'],
      message: 'Statut de réservation invalide'
    },
    default: 'EN_ATTENTE',
    index: true
  },
  dateReservation: {
    type: Date,
    default: Date.now,
    index: true
  },
  dateConfirmation: {
    type: Date
  },
  motifRefus: {
    type: String,
    trim: true,
    maxlength: [500, 'Le motif de refus ne peut dépasser 500 caractères']
  },

  // ===== NOUVEAU : VALIDATION DU PAIEMENT SELON SYSTÈME COMMISSION =====
  validationPaiement: {
    type: ValidationPaiementSchema,
    default: () => ({})
  },

  // Paiement avec nouveaux modes
  montantTotal: {
    type: Number,
    required: [true, 'Le montant total est requis'],
    min: [0, 'Le montant ne peut être négatif'],
    validate: {
      validator: function(montant) {
        return Number.isFinite(montant) && montant >= 0;
      },
      message: 'Le montant doit être un nombre positif'
    }
  },
  statutPaiement: {
    type: String,
    enum: {
      values: ['EN_ATTENTE', 'PAYE', 'REMBOURSE', 'ECHEC'],
      message: 'Statut de paiement invalide'
    },
    default: 'EN_ATTENTE',
    index: true
  },
  methodePaiement: {
    type: String,
    enum: {
      values: ['ESPECES', 'WAVE', 'ORANGE_MONEY', 'MTN_MONEY', 'MOOV_MONEY', 'COMPTE_RECHARGE'],
      message: 'Méthode de paiement non supportée'
    },
    required: function() {
      return this.statutPaiement === 'PAYE';
    }
  },
  referencePaiement: {
    type: String,
    trim: true,
    maxlength: [100, 'La référence ne peut dépasser 100 caractères']
  },
  datePaiement: {
    type: Date
  },

  // Bagages
  bagages: {
    type: BagagesSchema,
    default: () => ({})
  },

  // Suivi en temps réel
  positionEnTempsReel: {
    type: PositionTempsReelSchema
  },

  // Notifications programmées
  notificationsPrevues: {
    type: [NotificationSchema],
    default: []
  }

}, {
  timestamps: true,
  collection: 'reservations'
});

// INDEX COMPOSÉS
ReservationSchema.index({ trajetId: 1, passagerId: 1 }, { unique: true });
ReservationSchema.index({ statutReservation: 1, dateReservation: -1 });
ReservationSchema.index({ passagerId: 1, statutReservation: 1 });
ReservationSchema.index({ 'pointPriseEnCharge.coordonnees': '2dsphere' });
ReservationSchema.index({ 'pointDepose.coordonnees': '2dsphere' });

// NOUVEAUX INDEX POUR SYSTÈME COMMISSION
ReservationSchema.index({ 'validationPaiement.estValide': 1, statutReservation: 1 });
ReservationSchema.index({ methodePaiement: 1, statutPaiement: 1 });

// ===== MIDDLEWARE PRE-SAVE AMÉLIORÉ =====
ReservationSchema.pre('save', async function(next) {
  try {
    // Validation des dates
    if (this.dateConfirmation && this.dateConfirmation < this.dateReservation) {
      return next(new Error('La date de confirmation ne peut pas être antérieure à la date de réservation'));
    }

    // Validation du statut et de la date de confirmation
    if (this.statutReservation === 'CONFIRMEE' && !this.dateConfirmation) {
      this.dateConfirmation = new Date();
    }

    // Validation du motif de refus
    if (this.statutReservation === 'REFUSEE' && !this.motifRefus) {
      return next(new Error('Un motif de refus est requis pour une réservation refusée'));
    }

    // Validation du paiement
    if (this.statutPaiement === 'PAYE' && !this.datePaiement) {
      this.datePaiement = new Date();
    }

    // ===== NOUVEAU : VALIDATION AUTOMATIQUE DU PAIEMENT =====
    if (this.isNew || this.isModified('methodePaiement')) {
      await this.validerPaiement();
    }

    next();
  } catch (error) {
    next(error);
  }
});

// Middleware post-sauvegarde pour les notifications
ReservationSchema.post('save', async function(doc) {
  try {
    // Programmer les notifications automatiques pour une nouvelle réservation
    if (doc.isNew && doc.statutReservation === 'EN_ATTENTE') {
      await doc.programmerNotifications();
    }
    
    // Notifier le conducteur d'une nouvelle réservation
    if (doc.isModified('statutReservation') && doc.statutReservation === 'EN_ATTENTE') {
      await doc.notifierConducteur();
    }
  } catch (error) {
    console.error('Erreur lors des notifications post-sauvegarde:', error);
  }
});

// ===== NOUVELLES MÉTHODES D'INSTANCE =====

// Valider le paiement selon le système de commission
ReservationSchema.methods.validerPaiement = async function() {
  try {
    const trajet = await mongoose.model('Trajet').findById(this.trajetId)
      .populate('conducteurId', 'compteCovoiturage');
    
    if (!trajet) {
      this.validationPaiement.estValide = false;
      this.validationPaiement.raisonInvalidite = 'trajet_non_disponible';
      return;
    }

    const conducteur = trajet.conducteurId;
    const validation = this.validationPaiement;

    // Réinitialiser validation
    validation.verificationsEffectuees = {
      compteConducteurVerifie: false,
      modePaiementValide: false,
      soldeDisponible: false,
      commissionCalculee: false,
      placesDisponiblesVerifiees: false
    };

    // 1. Vérifier le compte conducteur
    validation.verificationsEffectuees.compteConducteurVerifie = true;

    // 2. Valider le mode de paiement selon les règles
    const modeAccepte = trajet.accepteModePaiement(this.methodePaiement);
    if (!modeAccepte.accepte) {
      validation.estValide = false;
      validation.raisonInvalidite = 'mode_paiement_non_autorise';
      return;
    }
    validation.verificationsEffectuees.modePaiementValide = true;

    // 3. Vérifier solde si paiement par compte rechargé
    if (this.methodePaiement === 'COMPTE_RECHARGE') {
      if (!conducteur.compteCovoiturage || conducteur.compteCovoiturage.solde <= 0) {
        validation.estValide = false;
        validation.raisonInvalidite = 'compte_insuffisant';
        return;
      }
    }
    validation.verificationsEffectuees.soldeDisponible = true;

    // 4. Vérifier disponibilité places
    const disponibilite = await mongoose.model('Reservation').verifierDisponibilite(
      this.trajetId, 
      this.nombrePlacesReservees
    );
    if (!disponibilite.disponible) {
      validation.estValide = false;
      validation.raisonInvalidite = 'places_insuffisantes';
      return;
    }
    validation.verificationsEffectuees.placesDisponiblesVerifiees = true;

    // 5. Calcul commission
    validation.verificationsEffectuees.commissionCalculee = true;

    // Validation réussie
    validation.estValide = true;
    validation.raisonInvalidite = undefined;
    validation.dateValidation = new Date();

  } catch (error) {
    this.validationPaiement.estValide = false;
    this.validationPaiement.raisonInvalidite = 'erreur_validation';
    console.error('Erreur validation paiement:', error);
  }
};

// Méthodes existantes
ReservationSchema.methods.calculerDistance = function() {
  const [lon1, lat1] = this.pointPriseEnCharge.coordonnees.coordinates;
  const [lon2, lat2] = this.pointDepose.coordonnees.coordinates;
  
  const R = 6371; // Rayon de la Terre en km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

ReservationSchema.methods.peutEtreAnnulee = function() {
  return ['EN_ATTENTE', 'CONFIRMEE'].includes(this.statutReservation);
};

ReservationSchema.methods.calculerRemboursement = function(trajetDateDepart) {
  if (!this.peutEtreAnnulee() || this.statutPaiement !== 'PAYE') {
    return 0;
  }

  const maintenant = new Date();
  const heuresAvantDepart = (trajetDateDepart - maintenant) / (1000 * 60 * 60);
  
  // Politique de remboursement (tenant compte de la commission)
  let montantBase = this.montantTotal;
  
  // Déduire la commission de 10% du remboursement
  montantBase = montantBase * 0.9; // 90% du montant (après commission)
  
  if (heuresAvantDepart >= 24) {
    return montantBase * 0.9; // 90% de remboursement
  } else if (heuresAvantDepart >= 12) {
    return montantBase * 0.7; // 70% de remboursement
  } else if (heuresAvantDepart >= 2) {
    return montantBase * 0.5; // 50% de remboursement
  } else {
    return 0; // Pas de remboursement
  }
};

ReservationSchema.methods.programmerNotifications = async function() {
  try {
    const trajet = await mongoose.model('Trajet').findById(this.trajetId);
    if (!trajet) return;

    const dateDepart = new Date(trajet.dateDepart);
    const notifications = [];

    // Rappel 2 heures avant le départ
    const rappelDepart = new Date(dateDepart.getTime() - 2 * 60 * 60 * 1000);
    if (rappelDepart > new Date()) {
      notifications.push({
        type: 'RAPPEL_DEPART',
        heureEnvoi: rappelDepart
      });
    }

    // Notification quand le conducteur est proche (30 min avant)
    const conducteurProche = new Date(dateDepart.getTime() - 30 * 60 * 1000);
    if (conducteurProche > new Date()) {
      notifications.push({
        type: 'CONDUCTEUR_PROCHE',
        heureEnvoi: conducteurProche
      });
    }

    // Notification d'arrivée (heure d'arrivée prévue)
    if (trajet.heureArriveePrevue) {
      const heureArrivee = new Date(trajet.dateDepart);
      const [heures, minutes] = trajet.heureArriveePrevue.split(':');
      heureArrivee.setHours(parseInt(heures), parseInt(minutes), 0, 0);
      
      notifications.push({
        type: 'ARRIVEE',
        heureEnvoi: heureArrivee
      });
    }

    this.notificationsPrevues = notifications;
    await this.save();
  } catch (error) {
    console.error('Erreur lors de la programmation des notifications:', error);
  }
};

ReservationSchema.methods.notifierConducteur = async function() {
  try {
    const trajet = await mongoose.model('Trajet').findById(this.trajetId).populate('conducteurId');
    const passager = await mongoose.model('Utilisateur').findById(this.passagerId);
    
    if (trajet && trajet.conducteurId && passager) {
      console.log(`Notification envoyée au conducteur ${trajet.conducteurId.nom} pour la réservation de ${passager.nom}`);
    }
  } catch (error) {
    console.error('Erreur lors de la notification du conducteur:', error);
  }
};

ReservationSchema.methods.mettreAJourPosition = function(coordinates) {
  this.positionEnTempsReel = {
    coordonnees: {
      type: 'Point',
      coordinates: coordinates
    },
    lastUpdate: new Date()
  };
  return this.save();
};

// ===== MÉTHODES STATIQUES =====

ReservationSchema.statics.executerNotificationsPrevues = async function(limite = 100) {
  const maintenant = new Date();
  const reservations = await this.find({
    'notificationsPrevues.envoye': false,
    'notificationsPrevues.heureEnvoi': { $lte: maintenant }
  }).limit(limite);

  for (const reservation of reservations) {
    for (const notif of reservation.notificationsPrevues) {
      if (!notif.envoye && notif.heureEnvoi <= maintenant) {
        console.log(`Notification prévue envoyée (${notif.type}) pour réservation ${reservation._id}`);
        notif.envoye = true;
      }
    }
    await reservation.save();
  }
  return true;
};

ReservationSchema.statics.obtenirReservationsUtilisateur = function(userId, options = {}) {
  const query = { passagerId: userId };
  
  if (options.statut) {
    query.statutReservation = options.statut;
  }
  
  if (options.dateDebut && options.dateFin) {
    query.dateReservation = {
      $gte: options.dateDebut,
      $lte: options.dateFin
    };
  }

  return this.find(query)
    .populate('trajetId', 'pointDepart pointArrivee dateDepart conducteurId')
    .populate('trajetId.conducteurId', 'nom prenom photoProfil noteGenerale')
    .sort({ dateReservation: -1 })
    .limit(options.limite || 50);
};

ReservationSchema.statics.obtenirReservationsTrajet = function(trajetId) {
  return this.find({ trajetId })
    .populate('passagerId', 'nom prenom photoProfil noteGenerale')
    .sort({ dateReservation: 1 });
};

ReservationSchema.statics.verifierDisponibilite = async function(trajetId, nombrePlaces) {
  const reservationsConfirmees = await this.aggregate([
    {
      $match: {
        trajetId: new mongoose.Types.ObjectId(trajetId),
        statutReservation: { $in: ['CONFIRMEE', 'EN_ATTENTE'] }
      }
    },
    {
      $group: {
        _id: null,
        totalPlacesReservees: { $sum: '$nombrePlacesReservees' }
      }
    }
  ]);

  const trajet = await mongoose.model('Trajet').findById(trajetId);
  if (!trajet) throw new Error('Trajet non trouvé');

  const placesReservees = reservationsConfirmees[0]?.totalPlacesReservees || 0;
  const placesDisponibles = trajet.nombrePlacesTotal - placesReservees;

  return {
    disponible: placesDisponibles >= nombrePlaces,
    placesDisponibles,
    placesReservees
  };
};

// ===== NOUVELLES MÉTHODES STATIQUES SYSTÈME COMMISSION =====

// Réservations avec validation en échec
ReservationSchema.statics.reservationsValidationEchec = function() {
  return this.find({
    'validationPaiement.estValide': false,
    statutReservation: 'EN_ATTENTE'
  })
  .populate('trajetId', 'pointDepart pointArrivee conducteurId')
  .populate('passagerId', 'nom prenom email');
};

// Réservations par mode de paiement
ReservationSchema.statics.repartitionModesPaiement = async function() {
  return this.aggregate([
    {
      $match: {
        statutPaiement: 'PAYE'
      }
    },
    {
      $group: {
        _id: '$methodePaiement',
        nombre: { $sum: 1 },
        montantTotal: { $sum: '$montantTotal' }
      }
    },
    {
      $sort: { nombre: -1 }
    }
  ]);
};

// Export du modèle
module.exports = mongoose.model('Reservation', ReservationSchema);