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

const FraisSupplementaireSchema = new Schema({
  type: { 
    type: String, 
    enum: ['PEAGE', 'PARKING', 'ESSENCE_SUPPLEMENTAIRE', 'AUTRE'],
    required: true
  },
  montant: { 
    type: Number, 
    required: true, 
    min: 0 
  },
  description: { 
    type: String, 
    maxlength: 200 
  },
  repartition: {
    type: String,
    enum: ['EQUITABLE', 'CONDUCTEUR_UNIQUEMENT'],
    default: 'EQUITABLE'
  },
  montantParPassager: { 
    type: Number, 
    default: 0 
  },
  dateAjout: { 
    type: Date, 
    default: Date.now 
  }
}, { _id: false });

// 🆕 NOUVEAU - Schéma pour les critères d'évaluation
const CriteresEvaluationSchema = new Schema({
  ponctualite: { type: Number, min: 1, max: 5 },
  proprete: { type: Number, min: 1, max: 5 },
  qualiteConduite: { type: Number, min: 1, max: 5 },
  respect: { type: Number, min: 1, max: 5 },
  communication: { type: Number, min: 1, max: 5 }
}, { _id: false });

// 🆕 NOUVEAU - Schéma pour les signalements
const SignalementEvaluationSchema = new Schema({
  type: { 
    type: String,
    enum: ['CONDUITE_DANGEREUSE', 'HARCELEMENT', 'VEHICULE_NON_CONFORME', 'RETARD_EXCESSIF', 'AUTRE'],
    required: true
  },
  description: { type: String, maxlength: 500 },
  grave: { type: Boolean, default: false }
}, { _id: false });

// 🆕 NOUVEAU - Schéma pour les détails d'évaluation
const EvaluationDetailsSchema = new Schema({
  effectuee: { type: Boolean, default: false },
  obligatoire: { type: Boolean, default: true },
  note: { type: Number, min: 1, max: 5 },
  criteres: CriteresEvaluationSchema,
  commentaire: { type: String, maxlength: 500 },
  dateEvaluation: Date,
  signalements: [SignalementEvaluationSchema]
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
  // 🆕  Répartition financière automatique (500F)
  repartitionFinanciere: {
    fraisServiceParPassager: { type: Number, default: 500 },
    repartition: {
      proprietairePlateforme: { type: Number, default: 0 },
      fondsEntretien: { type: Number, default: 0 },
      conducteur: { type: Number, default: 0 }
    },
    calculEffectue: { type: Boolean, default: false },
    dateCalcul: Date
  },

  // 🆕 NOUVEAU - Frais supplémentaires
  fraisSupplementaires: {
    type: [FraisSupplementaireSchema],
    default: []
  },
  
  // 🆕 NOUVEAU - Frais totaux pour le passager
  fraisTotauxPassager: { 
    type: Number, 
    default: 0 
  },

  statutPaiement: {
    type: String,
    enum: ['EN_ATTENTE', 'PAYE', 'REMBOURSE'],
    default: 'EN_ATTENTE',
    index: true
  },
  methodePaiement: {
    type: String,
    enum: ['ESPECES', 'MOBILE_MONEY'],
    required: function() {
      return this.statutPaiement === 'PAYE';
    }
  },
  canalPaiement: {
  type: String,
  trim: true,
  maxlength: 50
  },
  referencePaiement: {
    type: String,
    trim: true,
    maxlength: 100
  },
  datePaiement: {
    type: Date
  },

  // 🆕 NOUVEAU - Système d'évaluation complet
  evaluation: {
    passagerVersConducteur: {
      type: EvaluationDetailsSchema,
      default: () => ({ effectuee: false, obligatoire: true })
    },
    conducteurVersPassager: {
      type: EvaluationDetailsSchema,
      default: () => ({ effectuee: false, obligatoire: false })
    },
    evalutionPassagerBloquante: { type: Boolean, default: true }
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

  // 🆕 NOUVEAU - Suivi de l'itinéraire
  suivi: {
    itinerairePrevu: {
      type: { type: String, default: 'LineString' },
      coordinates: [[Number]]
    },
    dernierPointSurItineraire: { type: Boolean, default: true },
    alerteSortieItineraireEnvoyee: { type: Boolean, default: false },
    distanceMaxAutorisee: { type: Number, default: 1000 }
  },
  
  // 🆕 NOUVEAU - Confirmation de prise en charge
  priseEnCharge: {
    confirmee: { type: Boolean, default: false },
    confirmeePar: { type: Schema.Types.ObjectId, ref: 'Utilisateur' },
    dateConfirmation: Date,
    coordonneesConfirmation: CoordinatesSchema,
    conduiteursProches: [{
      conducteurId: { type: Schema.Types.ObjectId, ref: 'Utilisateur' },
      distance: Number,
      dateDetection: Date
    }],
    alerteConflit: { type: Boolean, default: false }
  },
  
  // 🆕 Processus de validation
  processusValidation: {
    type: {
      type: String,
      enum: ['AUTOMATIQUE', 'MANUELLE'],
      default: 'AUTOMATIQUE'  
    },
    delaiValidation: {
      type: Number,
      default: 3600000  // 1 heure en millisecondes
      
    },
    dateExpiration: {
      type: Date,
      default: function() {
        return new Date(Date.now() + (this.delaiValidation || 3600000));
      }
    },
    rappelsEnvoyes: { 
      type: Number, 
      default: 0 
    }
  },
  
  // 🆕 NOUVEAU - Contacts partagés
  contactsPartages: {
    conducteur: {
      telephone: String,
      whatsapp: String,
      partageEffectue: { type: Boolean, default: false },
      datePartage: Date
    },
    passager: {
      telephone: String,
      whatsapp: String,
      partageEffectue: { type: Boolean, default: false },
      datePartage: Date
    },
    partageAutorise: { type: Boolean, default: true }
  },
  
  // 🆕 NOUVEAU - Références aux modèles séparés
  messagerieId: {
    type: Schema.Types.ObjectId,
    ref: 'Messagerie'
  },
  
  alertesUrgence: [{
    type: Schema.Types.ObjectId,
    ref: 'AlerteUrgence'
  }],
  
  paiementId: {
    type: Schema.Types.ObjectId,
    ref: 'Paiement'
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
      statutReservation: { $in: ['EN_ATTENTE', 'CONFIRMEE', 'TERMINEE', 'ANNULEE'] } 
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

  // 🆕  Calcul automatique de la répartition financière
  if (this.isModified('montantTotal') || this.isModified('nombrePlacesReservees') || this.isNew) {
    this.calculerRepartitionFinanciere();
  }
  
  // 🆕  Calcul frais supplémentaires
  if (this.isModified('fraisSupplementaires')) {
    const fraisSupp = this.calculerFraisSupplementairesParPassager();
    this.fraisTotauxPassager = this.montantTotal + fraisSupp;
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

       // 🆕 NOUVEAU - Créer messagerie et partager contacts après confirmation
      if (doc.isModified('statutReservation') && doc.statutReservation === 'CONFIRMEE') {
        // Créer la messagerie si pas existante
        if (!doc.messagerieId) {
          const Messagerie = mongoose.model('Messagerie');
          const trajet = await Trajet.findById(doc.trajetId);
          
          if (trajet) {
            const messagerie = new Messagerie({
              reservationId: doc._id,
              passagerId: doc.passagerId,
              conducteurId: trajet.conducteurId,
              active: true
            });
            
            await messagerie.save();
            
            doc.messagerieId = messagerie._id;
            doc._skipNotifications = true;
            await doc.save();
          }
        }
        
        // Partager les contacts
        await doc.partagerContacts();
      }

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
        const trajetRefus = await Trajet.findById(doc.trajetId).select('conducteurId'); 
        await firebaseService.sendToUser(
          doc.passagerId,
          {
            title: '❌ Réservation refusée',
            message: doc.motifRefus || 'Le conducteur a refusé votre réservation',
            data: {
              type: 'RESERVATION_REFUSED',
              reservationId: doc._id.toString(),
              trajetId: doc.trajetId.toString(),
              conducteurId: trajetRefus?.conducteurId?.toString() || '',
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
            methode: doc.methodePaiement,
            canal: doc.canalPaiement 
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
        conducteurId: trajet.conducteurId._id.toString(),
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

/**
 * 🆕 NOUVEAU - Calculer automatiquement la répartition financière
 */
ReservationSchema.methods.calculerRepartitionFinanciere = function() {
  const fraisTotal = this.nombrePlacesReservees * 500;
  
  this.repartitionFinanciere.repartition.proprietairePlateforme = this.nombrePlacesReservees * 400;
  this.repartitionFinanciere.repartition.fondsEntretien = this.nombrePlacesReservees * 100;
  this.repartitionFinanciere.repartition.conducteur = this.montantTotal - fraisTotal;
  
  this.repartitionFinanciere.calculEffectue = true;
  this.repartitionFinanciere.dateCalcul = new Date();
  
  console.log('💰 Répartition calculée:', {
    proprietaire: this.repartitionFinanciere.repartition.proprietairePlateforme,
    entretien: this.repartitionFinanciere.repartition.fondsEntretien,
    conducteur: this.repartitionFinanciere.repartition.conducteur
  });
  
  return this.repartitionFinanciere;
};

/**
 * 🆕 NOUVEAU - Calculer frais supplémentaires par passager
 */
ReservationSchema.methods.calculerFraisSupplementairesParPassager = function() {
  if (!this.fraisSupplementaires || this.fraisSupplementaires.length === 0) {
    return 0;
  }
  
  return this.fraisSupplementaires.reduce((total, frais) => {
    if (frais.repartition === 'EQUITABLE') {
      const nombrePersonnes = this.nombrePlacesReservees + 1;
      const partParPersonne = frais.montant / nombrePersonnes;
      frais.montantParPassager = partParPersonne;
      return total + partParPersonne;
    }
    frais.montantParPassager = 0;
    return total;
  }, 0);
};

/**
 * 🆕 NOUVEAU - Vérifier si l'évaluation passager est manquante
 */
ReservationSchema.methods.evaluationPassagerManquante = function() {
  return this.statutReservation === 'TERMINEE' && 
         this.evaluation.passagerVersConducteur.obligatoire &&
         !this.evaluation.passagerVersConducteur.effectuee;
};

/**
 * 🆕 NOUVEAU - Vérifier si le véhicule est sur l'itinéraire prévu
 */
ReservationSchema.methods.verifierPositionItineraire = async function(positionActuelle) {
  if (!this.suivi.itinerairePrevu || !this.suivi.itinerairePrevu.coordinates) {
    return true;
  }
  
  const distanceMin = this.calculerDistanceMinimaleItineraire(positionActuelle);
  
  if (distanceMin > this.suivi.distanceMaxAutorisee) {
    this.suivi.dernierPointSurItineraire = false;
    
    if (!this.suivi.alerteSortieItineraireEnvoyee) {
      await this.creerAlerteUrgence('SORTIE_ITINERAIRE', positionActuelle);
      this.suivi.alerteSortieItineraireEnvoyee = true;
      await this.save();
    }
    
    return false;
  } else {
    this.suivi.dernierPointSurItineraire = true;
    return true;
  }
};

/**
 * 🆕 NOUVEAU - Calculer distance minimale à l'itinéraire
 */
ReservationSchema.methods.calculerDistanceMinimaleItineraire = function(point) {
  if (!this.suivi.itinerairePrevu || !this.suivi.itinerairePrevu.coordinates) {
    return 0;
  }
  
  const [lonPoint, latPoint] = point;
  let distanceMin = Infinity;
  
  for (const coordItineraire of this.suivi.itinerairePrevu.coordinates) {
    const [lon, lat] = coordItineraire;
    const distance = this.calculerDistanceHaversine(latPoint, lonPoint, lat, lon);
    
    if (distance < distanceMin) {
      distanceMin = distance;
    }
  }
  
  return distanceMin * 1000;
};

/**
 * 🆕 NOUVEAU - Formule Haversine
 */
ReservationSchema.methods.calculerDistanceHaversine = function(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

/**
 * 🆕 NOUVEAU - Créer une alerte urgence
 */
ReservationSchema.methods.creerAlerteUrgence = async function(type, coordonnees) {
  const AlerteUrgence = mongoose.model('AlerteUrgence');
  const trajet = await mongoose.model('Trajet').findById(this.trajetId);
  
  const alerte = new AlerteUrgence({
    reservationId: this._id,
    type: type,
    coordonnees: {
      type: 'Point',
      coordinates: coordonnees
    },
    passagerId: this.passagerId,
    conducteurId: trajet.conducteurId,
    statut: 'ACTIVE'
  });
  
  await alerte.save();
  this.alertesUrgence.push(alerte._id);
  
  console.log('🚨 Alerte urgence créée:', { type, reservationId: this._id });
  
  return alerte;
};

/**
 * 🆕 NOUVEAU - Partager les contacts après confirmation
 */
ReservationSchema.methods.partagerContacts = async function() {
  if (!this.contactsPartages.partageAutorise) {
    return;
  }
  
  try {
    const Utilisateur = mongoose.model('Utilisateur');
    const Trajet = mongoose.model('Trajet');
    
    const [passager, trajet] = await Promise.all([
      Utilisateur.findById(this.passagerId).select('telephone whatsapp'),
      Trajet.findById(this.trajetId).populate('conducteurId', 'telephone whatsapp')
    ]);
    
    if (passager && trajet && trajet.conducteurId) {
      this.contactsPartages.conducteur.telephone = trajet.conducteurId.telephone;
      this.contactsPartages.conducteur.whatsapp = trajet.conducteurId.whatsapp;
      this.contactsPartages.conducteur.partageEffectue = true;
      this.contactsPartages.conducteur.datePartage = new Date();
      
      this.contactsPartages.passager.telephone = passager.telephone;
      this.contactsPartages.passager.whatsapp = passager.whatsapp;
      this.contactsPartages.passager.partageEffectue = true;
      this.contactsPartages.passager.datePartage = new Date();
      
      this._skipNotifications = true;
      await this.save();
      
      console.log('📱 Contacts partagés:', this._id);
    }
  } catch (error) {
    console.error('❌ Erreur partage contacts:', error);
  }
};

// Méthodes statiques

/**
 * Obtenir les réservations d'un utilisateur avec filtres avancés
 * @param {String} userId - ID de l'utilisateur
 * @param {Object} options - Options de filtrage
 * @param {String} options.statut - Statut de réservation
 * @param {Date} options.dateDebut - Date début
 * @param {Date} options.dateFin - Date fin
 * @param {Number} options.limite - Limite de résultats
 * @param {String} options.type - Type: 'active', 'expired', 'all' (défaut: 'active')
 * @returns {Promise<Array>} Liste des réservations
 */
ReservationSchema.statics.obtenirReservationsUtilisateur = async function(userId, options = {}) {
  const query = { passagerId: userId };
  
  // Filtre par statut spécifique
  if (options.statut) {
    query.statutReservation = options.statut;
  }
  
  // Filtre par période de réservation
  if (options.dateDebut && options.dateFin) {
    query.dateReservation = {
      $gte: options.dateDebut,
      $lte: options.dateFin
    };
  }

  // ✅ CHANGEMENT 1 : Récupérer avec .lean() pour pouvoir filtrer après
  const reservationsAvecTrajet = await this.find(query)
    .populate({
      path: 'trajetId',
      select: 'pointDepart pointArrivee dateDepart heureDepart distance conducteurId statutTrajet',
      populate: {
        path: 'conducteurId',
        select: 'nom prenom photoProfil telephone noteGenerale'
      }
    })
    .populate('passagerId', 'nom prenom photoProfil noteGenerale')
    .sort({ dateReservation: -1 })
    .limit(options.limite || 50)
    .lean(); // Transforme en objets JavaScript simples

  // ✅ CHANGEMENT 2 : Filtrer les réservations sans trajet
  const reservations = reservationsAvecTrajet.filter(reservation => {
    // Si le trajet n'existe plus (supprimé)
    if (!reservation.trajetId) {
      console.warn(`⚠️ Réservation ${reservation._id} sans trajet valide - IGNORÉE`);
      return false; // ❌ NE PAS inclure
    }
    return true; 
  });

  // Filtrer selon le type demandé
  const type = options.type || 'active';
  const maintenant = new Date();
  maintenant.setHours(maintenant.getHours() - 1)
  
  if (type === 'active') {
    // ✅ CHANGEMENT 3 : Ajouter filtre sur statutTrajet
    return reservations.filter(reservation => {
      const dateTrajet = new Date(reservation.trajetId.dateDepart);
      const statutActif = ['EN_ATTENTE', 'CONFIRMEE'].includes(reservation.statutReservation);
      const trajetNonExpire = reservation.trajetId.statutTrajet !== 'EXPIRE'; 

      dateTrajet.setHours(reservation.trajetId.heureDepart.split(':')[0], reservation.trajetId.heureDepart.split(':')[1], 0, 0); 
      
      return (dateTrajet >= maintenant || reservation.trajetId.statutTrajet === 'EN_COURS') && statutActif && trajetNonExpire;
    });
    
  } else if (type === 'expired') {
    return reservations.filter(reservation => {
      const dateTrajet = new Date(reservation.trajetId.dateDepart);
      const statutFinal = ['TERMINEE', 'ANNULEE', 'REFUSEE'].includes(reservation.statutReservation);
      const trajetExpire = reservation.trajetId.statutTrajet === 'EXPIRE'; // ✅ AJOUTÉ

      dateTrajet.setHours(reservation.trajetId.heureDepart.split(':')[0], reservation.trajetId.heureDepart.split(':')[1], 0, 0); 
      
      return dateTrajet < maintenant || statutFinal || trajetExpire;
    });
    
  } else {
    // Type 'all': retourner toutes (sauf trajetId null)
    return reservations;
  }
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