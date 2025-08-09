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
    required: true,
    trim: true,
    maxlength: 100
  },
  adresse: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
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
    min: 0,
    max: 10
  },
  description: {
    type: String,
    trim: true,
    maxlength: 200
  },
  poids: {
    type: Number,
    default: 0,
    min: 0,
    max: 100 // en kg
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

// Schéma principal de la réservation
const ReservationSchema = new Schema({
  trajetId: {
    type: Schema.Types.ObjectId,
    ref: 'Trajet',
    required: true,
    index: true
  },
  passagerId: {
    type: Schema.Types.ObjectId,
    ref: 'Utilisateur',
    required: true,
    index: true
  },

  // Détails de la réservation
  nombrePlacesReservees: {
    type: Number,
    required: true,
    min: 1,
    max: 8,
    validate: {
      validator: Number.isInteger,
      message: 'Le nombre de places doit être un entier'
    }
  },
  pointPriseEnCharge: {
    type: PointSchema,
    required: true
  },
  pointDepose: {
    type: PointSchema,
    required: true
  },

  // Statut de la réservation
  statutReservation: {
    type: String,
    enum: ['EN_ATTENTE', 'CONFIRMEE', 'REFUSEE', 'ANNULEE', 'TERMINEE'],
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
    maxlength: 500
  },

  // Paiement
  montantTotal: {
    type: Number,
    required: true,
    min: 0,
    validate: {
      validator: function(montant) {
        return Number.isFinite(montant) && montant >= 0;
      },
      message: 'Le montant doit être un nombre positif'
    }
  },
  statutPaiement: {
    type: String,
    enum: ['EN_ATTENTE', 'PAYE', 'REMBOURSE'],
    default: 'EN_ATTENTE',
    index: true
  },
  methodePaiement: {
    type: String,
    enum: ['ESPECES', 'WAVE', 'ORANGE_MONEY', 'MTN_MONEY', 'MOOV_MONEY'],
    required: function() {
      return this.statutPaiement === 'PAYE';
    }
  },
  referencePaiement: {
    type: String,
    trim: true,
    maxlength: 100
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

// Index composés pour optimiser les requêtes
ReservationSchema.index({ trajetId: 1, passagerId: 1 }, { unique: true });
ReservationSchema.index({ statutReservation: 1, dateReservation: -1 });
ReservationSchema.index({ passagerId: 1, statutReservation: 1 });
ReservationSchema.index({ 'pointPriseEnCharge.coordonnees': '2dsphere' });
ReservationSchema.index({ 'pointDepose.coordonnees': '2dsphere' });

// Middleware pré-sauvegarde
ReservationSchema.pre('save', function(next) {
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

  next();
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

// Méthodes d'instance

// Calculer la distance entre prise en charge et dépose
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

// Vérifier si la réservation peut être annulée
ReservationSchema.methods.peutEtreAnnulee = function() {
  return ['EN_ATTENTE', 'CONFIRMEE'].includes(this.statutReservation);
};

// Calculer le montant du remboursement selon la politique
ReservationSchema.methods.calculerRemboursement = function(trajetDateDepart) {
  if (!this.peutEtreAnnulee() || this.statutPaiement !== 'PAYE') {
    return 0;
  }

  const maintenant = new Date();
  const heuresAvantDepart = (trajetDateDepart - maintenant) / (1000 * 60 * 60);
  
  // Politique de remboursement
  if (heuresAvantDepart >= 24) {
    return this.montantTotal * 0.9; // 90% de remboursement
  } else if (heuresAvantDepart >= 12) {
    return this.montantTotal * 0.7; // 70% de remboursement
  } else if (heuresAvantDepart >= 2) {
    return this.montantTotal * 0.5; // 50% de remboursement
  } else {
    return 0; // Pas de remboursement
  }
};

// Programmer les notifications automatiques
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

// Notifier le conducteur d'une nouvelle réservation
ReservationSchema.methods.notifierConducteur = async function() {
  try {
    const trajet = await mongoose.model('Trajet').findById(this.trajetId).populate('conducteurId');
    const passager = await mongoose.model('Utilisateur').findById(this.passagerId);
    
    if (trajet && trajet.conducteurId && passager) {
      // Logique de notification (email, SMS, push notification)
      console.log(`Notification envoyée au conducteur ${trajet.conducteurId.nom} pour la réservation de ${passager.nom}`);
    }
  } catch (error) {
    console.error('Erreur lors de la notification du conducteur:', error);
  }
};

// Mettre à jour la position en temps réel
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

// Méthodes statiques

// Obtenir les réservations d'un utilisateur avec filtres
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

// Obtenir les réservations d'un trajet
ReservationSchema.statics.obtenirReservationsTrajet = function(trajetId) {
  return this.find({ trajetId })
    .populate('passagerId', 'nom prenom photoProfil noteGenerale')
    .sort({ dateReservation: 1 });
};

// Vérifier la disponibilité des places
ReservationSchema.statics.verifierDisponibilite = async function(trajetId, nombrePlaces) {
  const reservationsConfirmees = await this.aggregate([
    {
      $match: {
        trajetId: mongoose.Types.ObjectId(trajetId),
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

// Export du modèle
module.exports = mongoose.model('Reservation', ReservationSchema);