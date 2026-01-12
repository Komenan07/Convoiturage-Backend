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
    enum: ['RAPPEL_DEPART',
      'CONDUCTEUR_PROCHE', 'ARRIVEE',
      'RIDE_REMINDER',
      'DRIVER_APPROACHING',
      'ARRIVAL_SOON'],
    required: true
  },
  heureEnvoi: {
    type: Date,
    required: true
  },
  envoye: {
    type: Boolean,
    default: false
  },
   tentativesEnvoi: {
    type: Number,
    default: 0,
    min: 0,
    max: 3
  },
  derniereErreur: {
    type: String,
    maxlength: 500
  },
  dateEnvoi: {
    type: Date
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
ReservationSchema.index(
  { trajetId: 1, passagerId: 1 }, 
  { 
    unique: true,
    partialFilterExpression: { 
      statutReservation: { $in: ['EN_ATTENTE', 'CONFIRMEE'] } 
    },
    name: 'unique_active_reservation_per_trip'
  }
);

// Index composés pour optimiser les requêtes
ReservationSchema.index({ trajetId: 1, passagerId: 1, statutReservation: 1 });
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
// ===============================================
// MIDDLEWARE POST-SAVE - NOTIFICATIONS AUTOMATIQUES
// ===============================================

ReservationSchema.post('save', async function(doc) {
  // Éviter les boucles infinies
  if (doc._skipNotifications) {
    return;
  }
  
  // Utiliser setImmediate pour ne pas bloquer la sauvegarde
  setImmediate(async () => {
    try {
      const firebaseService = require('../services/firebaseService');
      const Utilisateur = mongoose.model('Utilisateur');
      const Trajet = mongoose.model('Trajet');
      // ===== NOUVELLE RÉSERVATION =====
      if (doc.isNew && doc.statutReservation === 'EN_ATTENTE') {
        console.log('🆕 Nouvelle réservation détectée:', doc._id);
        
        // Notifier le conducteur
        await doc.notifierConducteur();
        
        // Programmer les notifications futures
        await doc.programmerNotifications();
      }
      
      // ===== RÉSERVATION CONFIRMÉE =====
      if (doc.isModified('statutReservation') && doc.statutReservation === 'CONFIRMEE') {
        console.log('✅ Réservation confirmée:', doc._id);
        
        const trajet = await Trajet.findById(doc.trajetId);
        
        if (trajet) {
          await firebaseService.notifyReservationConfirmed(
            doc.passagerId,
            {
              reservationId: doc._id.toString(),
              trajetId: doc.trajetId.toString(),
              destination: doc.pointDepose.nom,
              dateDepart: trajet.dateDepart,
              heureDepart: trajet.heureDepart
            },
            Utilisateur
          );
        }
      }
      
      // ===== RÉSERVATION REFUSÉE =====
      if (doc.isModified('statutReservation') && doc.statutReservation === 'REFUSEE') {
        console.log('❌ Réservation refusée:', doc._id);
        
        await firebaseService.sendToUser(
          doc.passagerId,
          {
            title: '❌ Réservation refusée',
            message: doc.motifRefus || 'Le conducteur a refusé votre réservation',
            data: {
              type: 'RESERVATION_REFUSED',
              reservationId: doc._id.toString(),
              trajetId: doc.trajetId.toString(),
              motif: doc.motifRefus || 'Non spécifié'
            },
            channelId: 'reservations',
            type: 'reservations'
          },
          Utilisateur
        );
      }
      
      // ===== RÉSERVATION ANNULÉE =====
      if (doc.isModified('statutReservation') && doc.statutReservation === 'ANNULEE') {
        console.log('⚠️  Réservation annulée:', doc._id);
        
        const trajet = await Trajet.findById(doc.trajetId);
        
        if (trajet) {
          await firebaseService.notifyRideCancelled(
            doc.passagerId,
            {
              rideId: doc.trajetId.toString(),
              destination: doc.pointDepose.nom,
              reason: doc.motifRefus || 'Annulation'
            },
            Utilisateur
          );
        }
      }
      
      // ===== PAIEMENT CONFIRMÉ =====
      if (doc.isModified('statutPaiement') && doc.statutPaiement === 'PAYE') {
        console.log('💳 Paiement confirmé:', doc._id);
        
        await firebaseService.notifyPaymentSuccess(
          doc.passagerId,
          {
            transactionId: doc.referencePaiement || `PAY-${doc._id}`,
            montant: doc.montantTotal,
            methode: doc.methodePaiement
          },
          Utilisateur
        );
      }
      
      // ===== REMBOURSEMENT =====
      if (doc.isModified('statutPaiement') && doc.statutPaiement === 'REMBOURSE') {
        console.log('💰 Remboursement effectué:', doc._id);
        
        await firebaseService.sendToUser(
          doc.passagerId,
          {
            title: '💰 Remboursement effectué',
            message: `Vous avez été remboursé de ${doc.montantTotal} FCFA`,
            data: {
              type: 'PAYMENT_REFUND',
              transactionId: `REFUND-${doc._id}`,
              montant: doc.montantTotal.toString(),
              reservationId: doc._id.toString()
            },
            channelId: 'paiements',
            type: 'paiements'
          },
          Utilisateur
        );
      }
      
    } catch (error) {
      const { logger } = require('../utils/logger');
      logger.error('❌ Erreur notifications post-save:', {
        reservationId: doc._id,
        error: error.message,
        stack: error.stack
      });
    }
  });
});

// Tâche utilitaire: envoyer les notifications prévues arrivées à échéance
/**
 * ===============================================
 * EXÉCUTER LES NOTIFICATIONS PROGRAMMÉES
 * ===============================================
 * 
 * À appeler via un CRON job toutes les 5 minutes
 * 
 * @param {Number} limite - Nombre max de réservations à traiter
 * @returns {Promise<Object>} Statistiques d'exécution
 */
ReservationSchema.statics.executerNotificationsPrevues = async function(limite = 100) {
  const firebaseService = require('../services/firebaseService');
  const Utilisateur = mongoose.model('Utilisateur');

  
  const maintenant = new Date();
  const stats = {
    totalTraitees: 0,
    notificationsEnvoyees: 0,
    echecs: 0,
    erreurs: []
  };
  
  try {
    console.log('📬 Début exécution notifications programmées...');
    
    // Récupérer les réservations avec notifications en attente
    const reservations = await this.find({
      'notificationsPrevues.envoye': false,
      'notificationsPrevues.heureEnvoi': { $lte: maintenant },
      statutReservation: { $in: ['EN_ATTENTE', 'CONFIRMEE'] }
    })
    .populate('passagerId', 'nom prenom fcmTokens preferencesNotifications')
    .populate({
      path: 'trajetId',
      select: 'conducteurId pointDepart pointArrivee dateDepart heureDepart',
      populate: {
        path: 'conducteurId',
        select: 'nom prenom'
      }
    })
    .limit(limite);
    
    console.log(`📋 ${reservations.length} réservation(s) à traiter`);
    
    for (const reservation of reservations) {
      stats.totalTraitees++;
      let modifie = false;
      
      for (const notif of reservation.notificationsPrevues) {
        // Ignorer si déjà envoyée ou pas encore à échéance
        if (notif.envoye || notif.heureEnvoi > maintenant) {
          continue;
        }
        
        // Limiter les tentatives
        const tentatives = notif.tentativesEnvoi || 0;
        if (tentatives >= 3) {
          notif.envoye = true;
          notif.derniereErreur = 'Nombre maximum de tentatives atteint';
          modifie = true;
          stats.echecs++;
          continue;
        }
        
        try {
          const trajet = reservation.trajetId;
          const passager = reservation.passagerId;
          
          if (!trajet || !passager) {
            throw new Error('Données manquantes');
          }
          
          // Construire la notification selon le type
          let notification = null;
          
          switch (notif.type) {
            case 'RAPPEL_DEPART':
            case 'RIDE_REMINDER':
              notification = {
                title: '🕐 Rappel : Votre trajet démarre bientôt !',
                message: `Départ dans 2 heures de ${trajet.pointDepart.nom} vers ${trajet.pointArrivee.nom}`,
                data: {
                  type: 'RIDE_REMINDER',
                  reservationId: reservation._id.toString(),
                  trajetId: trajet._id.toString(),
                  heureDepart: trajet.heureDepart,
                  pointDepart: trajet.pointDepart.nom,
                  screen: 'ReservationDetails'
                },
                channelId: 'trajets',
                type: 'trajets'
              };
              break;
              
            case 'CONDUCTEUR_PROCHE':
            case 'DRIVER_APPROACHING':
              notification = {
                title: '🚗 Votre conducteur arrive !',
                message: `${trajet.conducteurId.prenom} sera à ${reservation.pointPriseEnCharge.nom} dans 30 minutes`,
                data: {
                  type: 'DRIVER_APPROACHING',
                  reservationId: reservation._id.toString(),
                  trajetId: trajet._id.toString(),
                  conducteurNom: `${trajet.conducteurId.prenom} ${trajet.conducteurId.nom}`,
                  lieu: reservation.pointPriseEnCharge.nom,
                  screen: 'TripTracking'
                },
                channelId: 'trajets',
                type: 'trajets'
              };
              break;
              
            case 'ARRIVEE':
            case 'ARRIVAL_SOON':
              notification = {
                title: '🏁 Arrivée imminente',
                message: `Vous arriverez bientôt à ${reservation.pointDepose.nom}`,
                data: {
                  type: 'ARRIVAL_SOON',
                  reservationId: reservation._id.toString(),
                  trajetId: trajet._id.toString(),
                  destination: reservation.pointDepose.nom,
                  screen: 'ReservationDetails'
                },
                channelId: 'trajets',
                type: 'trajets'
              };
              break;
              
            default:
              console.warn(`⚠️  Type de notification inconnu: ${notif.type}`);
              notif.envoye = true;
              notif.derniereErreur = 'Type inconnu';
              modifie = true;
              continue;
          }
          
          // Envoyer la notification via Firebase
          const result = await firebaseService.sendToUser(
            passager._id,
            notification,
            Utilisateur
          );
          
          // Traiter le résultat
          if (result.success) {
            notif.envoye = true;
            notif.tentativesEnvoi = tentatives + 1;
            notif.dateEnvoi = new Date();
            stats.notificationsEnvoyees++;
            
            console.log(`✅ Notification ${notif.type} envoyée:`, {
              reservationId: reservation._id,
              passagerId: passager._id
            });
          } else {
            notif.tentativesEnvoi = tentatives + 1;
            notif.derniereErreur = result.reason || result.error || 'Échec envoi';
            stats.echecs++;
            
            console.warn(`⚠️  Échec notification ${notif.type}:`, result.reason);
          }
          
          modifie = true;
          
        } catch (error) {
          console.error(`❌ Erreur envoi notification ${notif.type}:`, error);
          
          notif.tentativesEnvoi = (notif.tentativesEnvoi || 0) + 1;
          notif.derniereErreur = error.message;
          stats.echecs++;
          stats.erreurs.push({
            reservationId: reservation._id,
            type: notif.type,
            erreur: error.message
          });
          
          modifie = true;
        }
      }
      
      // Sauvegarder si modifié
      if (modifie) {
        reservation._skipNotifications = true;
        await reservation.save();
      }
    }
    
    console.log('✅ Notifications programmées exécutées:', stats);
    return stats;
    
  } catch (error) {
    console.error('❌ Erreur globale executerNotificationsPrevues:', error);
    throw error;
  }
};

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
/**
 * Effectuer le remboursement d'une réservation annulée
 * @param {Date} trajetDateDepart - Date de départ du trajet
 * @returns {Promise<Object>} Résultat du remboursement
 */
ReservationSchema.methods.effectuerRemboursement = async function(trajetDateDepart) {
  try {
    // Vérifier l'éligibilité
    if (!this.peutEtreAnnulee()) {
      return {
        success: false,
        message: 'Cette réservation ne peut pas être remboursée',
        montantRembourse: 0
      };
    }
    
    if (this.statutPaiement !== 'PAYE') {
      return {
        success: false,
        message: 'Aucun paiement à rembourser',
        montantRembourse: 0
      };
    }
    
    // Calculer le montant du remboursement
    const montantRemboursement = this.calculerRemboursement(trajetDateDepart);
    
    if (montantRemboursement === 0) {
      return {
        success: false,
        message: 'Aucun remboursement applicable selon la politique d\'annulation',
        montantRembourse: 0,
        politique: 'Annulation trop tardive'
      };
    }
    
    // Mettre à jour le statut
    this.statutPaiement = 'REMBOURSE';
    this.statutReservation = 'ANNULEE';
    
    // TODO: Intégrer avec CinetPay pour le remboursement réel
    // const cinetpayResult = await cinetpayService.refund({
    //   transactionId: this.referencePaiement,
    //   amount: montantRemboursement
    // });
    
    this._skipNotifications = true; // Éviter double notification
    await this.save();
    
    // Notifier le passager
    const firebaseService = require('../services/firebaseService');
    const Utilisateur = mongoose.model('Utilisateur');
    
    await firebaseService.sendToUser(
      this.passagerId,
      {
        title: '💰 Remboursement effectué',
        message: `Vous avez été remboursé de ${montantRemboursement} FCFA`,
        data: {
          type: 'PAYMENT_REFUND',
          transactionId: `REFUND-${this._id}`,
          montant: montantRemboursement.toString(),
          montantOriginal: this.montantTotal.toString(),
          pourcentage: Math.round((montantRemboursement / this.montantTotal) * 100).toString(),
          reservationId: this._id.toString()
        },
        channelId: 'paiements',
        type: 'paiements'
      },
      Utilisateur
    );
    
    console.log('✅ Remboursement effectué:', {
      reservationId: this._id,
      montantRembourse: montantRemboursement,
      pourcentage: Math.round((montantRemboursement / this.montantTotal) * 100)
    });
    
    return {
      success: true,
      montantRembourse: montantRemboursement,
      montantOriginal: this.montantTotal,
      pourcentage: Math.round((montantRemboursement / this.montantTotal) * 100),
      message: 'Remboursement effectué avec succès'
    };
    
  } catch (error) {
    console.error('❌ Erreur remboursement:', error);
    throw error;
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
/**
 * Notifier le conducteur d'une nouvelle réservation
 * Intégration Firebase Cloud Messaging
 */
ReservationSchema.methods.notifierConducteur = async function() {
  try {
    // Récupérer le trajet avec le conducteur
    const trajet = await mongoose.model('Trajet')
      .findById(this.trajetId)
      .populate('conducteurId', 'nom prenom fcmTokens preferencesNotifications');
    
    // Récupérer le passager
    const passager = await mongoose.model('Utilisateur')
      .findById(this.passagerId)
      .select('nom prenom');
    
    // Vérifications
    if (!trajet) {
      console.warn('⚠️  Trajet introuvable:', this.trajetId);
      return { success: false, reason: 'Trajet introuvable' };
    }
    
    if (!trajet.conducteurId) {
      console.warn('⚠️  Conducteur introuvable pour trajet:', this.trajetId);
      return { success: false, reason: 'Conducteur introuvable' };
    }
    
    if (!passager) {
      console.warn('⚠️  Passager introuvable:', this.passagerId);
      return { success: false, reason: 'Passager introuvable' };
    }
    
    // Envoyer via Firebase
    const firebaseService = require('../services/firebaseService');
    const Utilisateur = mongoose.model('Utilisateur');
    
    const result = await firebaseService.notifyNewRide(
      trajet.conducteurId._id,
      {
        rideId: this.trajetId.toString(),
        reservationId: this._id.toString(),
        depart: trajet.pointDepart.nom,
        arrivee: trajet.pointArrivee.nom,
        passagerNom: `${passager.prenom} ${passager.nom}`,
        nombrePlaces: this.nombrePlacesReservees,
        montant: this.montantTotal
      },
      Utilisateur
    );
    
    if (result.success) {
      console.log('✅ Notification conducteur envoyée:', {
        conducteurId: trajet.conducteurId._id,
        reservationId: this._id
      });
    } else {
      console.warn('⚠️  Échec notification conducteur:', result.reason);
    }
    
    return result;
    
  } catch (error) {
    console.error('❌ Erreur notification conducteur:', error);
    return { success: false, error: error.message };
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
    .populate({
      path: 'trajetId',
      select: 'pointDepart pointArrivee dateDepart distance conducteurId',
      populate: {
        path: 'conducteurId',
        select: 'nom prenom photoProfil noteGenerale'
      }
    })
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

// Export du modèle
module.exports = mongoose.model('Reservation', ReservationSchema);