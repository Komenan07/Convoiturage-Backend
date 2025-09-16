// trajetTrackingHandler.js
const mongoose = require('mongoose');
const geolib = require('geolib');

// Schéma pour les points de tracking
const trackingPointSchema = new mongoose.Schema({
  trajetId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Trajet',
    required: true,
    index: true
  },
  
  conducteurId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Utilisateur',
    required: true
  },
  
  // Position GPS
  position: {
    type: {
      type: String,
      enum: ['Point'],
      required: true,
      default: 'Point'
    },
    coordinates: {
      type: [Number],
      required: true,
      validate: {
        validator: function(coords) {
          return coords.length === 2 && 
                 coords[0] >= -180 && coords[0] <= 180 &&
                 coords[1] >= -90 && coords[1] <= 90;
        },
        message: 'Coordonnées GPS invalides'
      }
    }
  },
  
  // Données de tracking
  vitesse: {
    type: Number,
    min: [0, 'La vitesse ne peut être négative'],
    max: [300, 'Vitesse irréaliste']
  },
  
  direction: {
    type: Number,
    min: [0, 'La direction minimum est 0'],
    max: [360, 'La direction maximum est 360']
  },
  
  altitude: Number,
  
  precision: {
    type: Number,
    min: [0, 'La précision ne peut être négative']
  },
  
  // Informations véhicule
  kilometrage: Number,
  
  niveauEssence: {
    type: Number,
    min: [0, 'Niveau essence minimum 0%'],
    max: [100, 'Niveau essence maximum 100%']
  },
  
  // Statut du trajet à ce moment
  statutTrajet: {
    type: String,
    enum: ['en_attente_passagers', 'en_route_vers_prise', 'passagers_embarques', 'en_route_destination', 'arrive'],
    required: true
  },
  
  // Événements spéciaux
  evenement: {
    type: String,
    enum: [
      'depart', 'arrivee_point_prise', 'passager_embarque', 'passager_debarque', 
      'pause', 'reprise', 'deviation', 'embouteillage', 'arrivee_destination',
      'urgence', 'panne', 'accident', 'arret_imprevue'
    ]
  },
  
  // Données contextuelles
  passagersPresents: [{
    passagerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Utilisateur'
    },
    pointPrise: {
      type: {
        type: String,
        enum: ['Point']
      },
      coordinates: [Number]
    },
    heureEmbarquement: Date,
    pointDepose: {
      type: {
        type: String,
        enum: ['Point']
      },
      coordinates: [Number]
    }
  }],
  
  // Conditions de conduite
  conditions: {
    meteo: {
      type: String,
      enum: ['ensoleille', 'nuageux', 'pluvieux', 'orageux', 'brumeux']
    },
    trafic: {
      type: String,
      enum: ['fluide', 'modere', 'dense', 'embouteillage']
    },
    visibilite: {
      type: String,
      enum: ['excellente', 'bonne', 'moyenne', 'faible']
    }
  },
  
  // Métadonnées techniques
  qualiteSignal: {
    type: Number,
    min: [0, 'Qualité signal minimum 0'],
    max: [100, 'Qualité signal maximum 100']
  },
  
  sourcePosition: {
    type: String,
    enum: ['gps', 'network', 'passive'],
    default: 'gps'
  },
  
  batterieTelephone: Number,
  
  // Données calculées
  distanceParcourue: Number, // Distance depuis le dernier point
  tempsEcoule: Number, // Temps depuis le dernier point (secondes)
  vitesseMoyenne: Number,
  
  // Validation automatique
  estValide: {
    type: Boolean,
    default: true
  },
  
  raisonInvalidite: String

}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Index géospatial pour les requêtes de proximité
trackingPointSchema.index({ position: '2dsphere' });
trackingPointSchema.index({ trajetId: 1, createdAt: 1 });
trackingPointSchema.index({ conducteurId: 1, createdAt: -1 });

// Schéma pour les sessions de tracking
const trackingSessionSchema = new mongoose.Schema({
  trajetId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Trajet',
    required: true,
    unique: true
  },
  
  conducteurId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Utilisateur',
    required: true
  },
  
  // Timestamps de session
  heureDebut: {
    type: Date,
    required: true,
    default: Date.now
  },
  
  heureFin: Date,
  
  // Statut de la session
  statut: {
    type: String,
    enum: ['active', 'pausee', 'terminee', 'interrompue'],
    default: 'active'
  },
  
  // Statistiques calculées
  statistiques: {
    distanceTotale: { type: Number, default: 0 },
    dureeTrajet: { type: Number, default: 0 }, // en secondes
    vitesseMoyenne: { type: Number, default: 0 },
    vitesseMaximale: { type: Number, default: 0 },
    nombreArrets: { type: Number, default: 0 },
    tempsArrets: { type: Number, default: 0 }, // en secondes
    consommationEstimee: Number,
    emissionsCO2: Number
  },
  
  // Points remarquables
  pointsImportants: {
    depart: {
      position: {
        type: { type: String, enum: ['Point'] },
        coordinates: [Number]
      },
      heure: Date
    },
    arrivee: {
      position: {
        type: { type: String, enum: ['Point'] },
        coordinates: [Number]
      },
      heure: Date
    },
    pointsPrise: [{
      position: {
        type: { type: String, enum: ['Point'] },
        coordinates: [Number]
      },
      heure: Date,
      passagerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Utilisateur'
      }
    }],
    pointsDepose: [{
      position: {
        type: { type: String, enum: ['Point'] },
        coordinates: [Number]
      },
      heure: Date,
      passagerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Utilisateur'
      }
    }]
  },
  
  // Incidents et événements
  incidents: [{
    type: {
      type: String,
      enum: ['retard', 'panne', 'accident', 'deviation', 'urgence', 'autre']
    },
    description: String,
    position: {
      type: { type: String, enum: ['Point'] },
      coordinates: [Number]
    },
    heure: Date,
    gravite: {
      type: String,
      enum: ['faible', 'moyenne', 'elevee', 'critique'],
      default: 'faible'
    },
    resolu: { type: Boolean, default: false }
  }],
  
  // Configuration de tracking
  parametres: {
    intervalleTracking: { type: Number, default: 10 }, // secondes
    seuilVitesse: { type: Number, default: 2 }, // km/h minimum pour enregistrer
    seuilDistance: { type: Number, default: 10 }, // mètres minimum
    trackingActif: { type: Boolean, default: true }
  }

}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Index pour les sessions
trackingSessionSchema.index({ trajetId: 1 });
trackingSessionSchema.index({ conducteurId: 1, statut: 1 });

// Modèles
const TrackingPoint = mongoose.model('TrackingPoint', trackingPointSchema, 'tracking_points');
const TrackingSession = mongoose.model('TrackingSession', trackingSessionSchema, 'tracking_sessions');

class TrajetTrackingHandler {
  constructor(io, socketHandler, notificationHandler) {
    this.io = io;
    this.socketHandler = socketHandler;
    this.notificationHandler = notificationHandler;
    
    this.sessionsActives = new Map(); // trajetId -> session data
    this.dernieresPositions = new Map(); // conducteurId -> dernière position
    this.alertesActivees = new Map(); // trajetId -> alertes configurées
    
    this.demarrerTachesAutomatiques();
    console.log('📍 Trajet Tracking Handler initialisé');
  }

  // =========================
  // GESTION DES SESSIONS
  // =========================
  
  async demarrerSession(trajetId, conducteurId, parametres = {}) {
    try {
      // Vérifier si une session existe déjà
      let session = await TrackingSession.findOne({ trajetId });
      
      if (session && session.statut === 'active') {
        return { success: false, message: 'Session déjà active' };
      }

      // Créer nouvelle session
      session = new TrackingSession({
        trajetId,
        conducteurId,
        parametres: {
          ...parametres,
          intervalleTracking: parametres.intervalleTracking || 10,
          seuilVitesse: parametres.seuilVitesse || 2,
          seuilDistance: parametres.seuilDistance || 10
        }
      });

      await session.save();

      // Ajouter à la map des sessions actives
      this.sessionsActives.set(trajetId, {
        sessionId: session._id,
        conducteurId,
        dernierPoint: null,
        intervalId: null,
        parametres: session.parametres
      });

      // Notifier le conducteur
      const conducteurSocketId = this.socketHandler.connectedUsers.get(conducteurId);
      if (conducteurSocketId) {
        this.io.to(conducteurSocketId).emit('tracking_demarre', {
          sessionId: session._id,
          trajetId,
          parametres: session.parametres
        });
      }

      console.log(`📍 Session tracking démarrée: ${trajetId}`);
      return { success: true, sessionId: session._id };

    } catch (error) {
      console.error('❌ Erreur démarrage session tracking:', error);
      throw error;
    }
  }

  async terminerSession(trajetId, conducteurId) {
    try {
      const sessionData = this.sessionsActives.get(trajetId);
      if (!sessionData) {
        return { success: false, message: 'Session non trouvée' };
      }

      // Calculer les statistiques finales
      const statistiques = await this.calculerStatistiquesSession(trajetId);

      // Mettre à jour la session en base
      await TrackingSession.findByIdAndUpdate(sessionData.sessionId, {
        $set: {
          statut: 'terminee',
          heureFin: new Date(),
          statistiques
        }
      });

      // Nettoyer les données en mémoire
      this.sessionsActives.delete(trajetId);
      if (sessionData.intervalId) {
        clearInterval(sessionData.intervalId);
      }

      // Notifier le conducteur
      const conducteurSocketId = this.socketHandler.connectedUsers.get(conducteurId);
      if (conducteurSocketId) {
        this.io.to(conducteurSocketId).emit('tracking_termine', {
          trajetId,
          statistiques
        });
      }

      console.log(`📍 Session tracking terminée: ${trajetId}`);
      return { success: true, statistiques };

    } catch (error) {
      console.error('❌ Erreur fin session tracking:', error);
      throw error;
    }
  }

  // =========================
  // TRACKING DES POSITIONS
  // =========================
  
  async enregistrerPosition(trajetId, positionData) {
    try {
      const sessionData = this.sessionsActives.get(trajetId);
      if (!sessionData) {
        return { success: false, message: 'Session tracking non active' };
      }

      const {
        latitude,
        longitude,
        vitesse = 0,
        direction = 0,
        altitude = null,
        precision = null,
        evenement = null,
        conditions = {},
        qualiteSignal = 100,
        batterieTelephone = null
      } = positionData;

      // Validation des coordonnées
      if (!this.coordonneesValides(latitude, longitude)) {
        return { success: false, message: 'Coordonnées invalides' };
      }

      // Obtenir la dernière position pour calculer la distance
      const dernierePosition = sessionData.dernierPoint;
      let distanceParcourue = 0;
      let tempsEcoule = 0;

      if (dernierePosition) {
        distanceParcourue = geolib.getDistance(
          { latitude: dernierePosition.coordinates[1], longitude: dernierePosition.coordinates[0] },
          { latitude, longitude }
        );
        tempsEcoule = (Date.now() - dernierePosition.timestamp) / 1000;

        // Appliquer les seuils configurés
        if (distanceParcourue < sessionData.parametres.seuilDistance &&
            vitesse < sessionData.parametres.seuilVitesse) {
          return { success: false, message: 'Mouvement insuffisant' };
        }
      }

      // Détecter le statut du trajet
      const statutTrajet = await this.detecterStatutTrajet(trajetId, latitude, longitude);

      // Créer le point de tracking
      const trackingPoint = new TrackingPoint({
        trajetId,
        conducteurId: sessionData.conducteurId,
        position: {
          type: 'Point',
          coordinates: [longitude, latitude]
        },
        vitesse,
        direction,
        altitude,
        precision,
        evenement,
        statutTrajet,
        conditions,
        qualiteSignal,
        batterieTelephone,
        distanceParcourue,
        tempsEcoule,
        vitesseMoyenne: tempsEcoule > 0 ? (distanceParcourue / tempsEcoule) * 3.6 : 0,
        passagersPresents: await this.obtenirPassagersPresents(trajetId)
      });

      // Valider la position
      const validation = this.validerPosition(trackingPoint, dernierePosition);
      trackingPoint.estValide = validation.valide;
      trackingPoint.raisonInvalidite = validation.raison;

      await trackingPoint.save();

      // Mettre à jour la session en mémoire
      sessionData.dernierPoint = {
        coordinates: [longitude, latitude],
        timestamp: Date.now(),
        vitesse
      };

      // Diffuser la position aux participants du trajet
      await this.diffuserPositionTrajet(trajetId, trackingPoint);

      // Vérifier les alertes
      await this.verifierAlertes(trajetId, trackingPoint);

      return { 
        success: true, 
        pointId: trackingPoint._id,
        distance: distanceParcourue,
        statutTrajet
      };

    } catch (error) {
      console.error('❌ Erreur enregistrement position:', error);
      throw error;
    }
  }

  async detecterStatutTrajet(trajetId, latitude, longitude) {
    try {
      // Récupérer les informations du trajet
      const Trajet = mongoose.model('Trajet');
      const trajet = await Trajet.findById(trajetId)
        .populate('reservations')
        .lean();

      if (!trajet) return 'en_route_destination';

      const positionActuelle = { latitude, longitude };

      // Vérifier si proche d'un point de prise en charge
      for (const reservation of trajet.reservations || []) {
        if (reservation.statut === 'acceptee' && reservation.pointPrise) {
          const pointPrise = {
            latitude: reservation.pointPrise.coordinates[1],
            longitude: reservation.pointPrise.coordinates[0]
          };

          const distance = geolib.getDistance(positionActuelle, pointPrise);
          if (distance < 100) { // 100 mètres de tolérance
            return 'arrivee_point_prise';
          }
        }
      }

      // Vérifier si proche de la destination
      if (trajet.coordonneesArrivee) {
        const destination = {
          latitude: trajet.coordonneesArrivee.coordinates[1],
          longitude: trajet.coordonneesArrivee.coordinates[0]
        };

        const distance = geolib.getDistance(positionActuelle, destination);
        if (distance < 200) { // 200 mètres de tolérance
          return 'arrive';
        }
      }

      return 'en_route_destination';

    } catch (error) {
      console.error('❌ Erreur détection statut:', error);
      return 'en_route_destination';
    }
  }

  async obtenirPassagersPresents(trajetId) {
    try {
      // Cette méthode devrait être liée à votre logique de réservation
      const Reservation = mongoose.model('Reservation');
      const reservations = await Reservation.find({
        trajetId,
        statut: 'en_cours'
      }).select('passagerId pointPrise pointDepose');

      return reservations.map(res => ({
        passagerId: res.passagerId,
        pointPrise: res.pointPrise,
        heureEmbarquement: res.heureEmbarquement,
        pointDepose: res.pointDepose
      }));

    } catch (error) {
      console.error('❌ Erreur passagers présents:', error);
      return [];
    }
  }

  // =========================
  // VALIDATION ET VÉRIFICATION
  // =========================
  
  coordonneesValides(latitude, longitude) {
    return latitude >= -90 && latitude <= 90 &&
           longitude >= -180 && longitude <= 180 &&
           !isNaN(latitude) && !isNaN(longitude);
  }

  validerPosition(nouvellePosition, dernierePosition) {
    if (!dernierePosition) {
      return { valide: true };
    }

    const distance = nouvellePosition.distanceParcourue;
    const temps = nouvellePosition.tempsEcoule;

    // Vérifier vitesse réaliste (max 200 km/h)
    if (temps > 0) {
      const vitesseCalculee = (distance / temps) * 3.6; // km/h
      if (vitesseCalculee > 200) {
        return { 
          valide: false, 
          raison: `Vitesse irréaliste: ${vitesseCalculee.toFixed(1)} km/h` 
        };
      }
    }

    // Vérifier saut de position (max 1km en 10 secondes)
    if (distance > 1000 && temps < 10) {
      return { 
        valide: false, 
        raison: 'Saut de position détecté' 
      };
    }

    // Vérifier précision GPS
    if (nouvellePosition.precision && nouvellePosition.precision > 50) {
      return { 
        valide: false, 
        raison: 'Précision GPS insuffisante' 
      };
    }

    return { valide: true };
  }

  // =========================
  // DIFFUSION TEMPS RÉEL
  // =========================
  
  async diffuserPositionTrajet(trajetId, trackingPoint) {
    try {
      const positionData = {
        trajetId,
        position: {
          latitude: trackingPoint.position.coordinates[1],
          longitude: trackingPoint.position.coordinates[0]
        },
        vitesse: trackingPoint.vitesse,
        direction: trackingPoint.direction,
        statutTrajet: trackingPoint.statutTrajet,
        evenement: trackingPoint.evenement,
        timestamp: trackingPoint.createdAt,
        eta: await this.calculerETA(trajetId, trackingPoint)
      };

      // Diffuser aux participants du trajet
      this.io.to(`trajet_${trajetId}`).emit('position_mise_a_jour', positionData);

      // Diffuser aux passagers proches si c'est un point de prise
      if (trackingPoint.statutTrajet === 'arrivee_point_prise') {
        await this.notifierPassagersProches(trajetId, trackingPoint);
      }

    } catch (error) {
      console.error('❌ Erreur diffusion position:', error);
    }
  }

  async notifierPassagersProches(trajetId, trackingPoint) {
    try {
      const Reservation = mongoose.model('Reservation');
      const reservations = await Reservation.find({
        trajetId,
        statut: 'acceptee'
      }).populate('passagerId');

      for (const reservation of reservations) {
        if (reservation.pointPrise) {
          const distance = geolib.getDistance(
            {
              latitude: trackingPoint.position.coordinates[1],
              longitude: trackingPoint.position.coordinates[0]
            },
            {
              latitude: reservation.pointPrise.coordinates[1],
              longitude: reservation.pointPrise.coordinates[0]
            }
          );

          // Si le conducteur est à moins de 500m
          if (distance < 500) {
            const passagerSocketId = this.socketHandler.connectedUsers.get(
              reservation.passagerId._id.toString()
            );

            if (passagerSocketId) {
              this.io.to(passagerSocketId).emit('conducteur_approche', {
                trajetId,
                distance,
                eta: Math.ceil(distance / 50), // Estimation simple
                position: trackingPoint.position
              });
            }

            // Envoyer notification
            await this.notificationHandler.envoyerNotification(
              reservation.passagerId._id,
              'conducteur_arrive',
              {
                trajetId,
                distance,
                conducteurNom: reservation.trajet?.conducteur?.nom
              }
            );
          }
        }
      }

    } catch (error) {
      console.error('❌ Erreur notification passagers proches:', error);
    }
  }

  // =========================
  // SYSTÈME D'ALERTES
  // =========================
  
  async configurerAlertes(trajetId, alertes) {
    this.alertesActivees.set(trajetId, {
      vitesseMax: alertes.vitesseMax || 120,
      retardMax: alertes.retardMax || 15, // minutes
      deviationMax: alertes.deviationMax || 1000, // mètres
      arretLongMax: alertes.arretLongMax || 10, // minutes
      batterieFaible: alertes.batterieFaible || 20, // pourcentage
      qualiteSignalMin: alertes.qualiteSignalMin || 30
    });
  }

  async verifierAlertes(trajetId, trackingPoint) {
    try {
      const alertes = this.alertesActivees.get(trajetId);
      if (!alertes) return;

      const alertesDeclechees = [];

      // Vérification vitesse excessive
      if (trackingPoint.vitesse > alertes.vitesseMax) {
        alertesDeclechees.push({
          type: 'vitesse_excessive',
          message: `Vitesse de ${trackingPoint.vitesse} km/h détectée`,
          gravite: 'moyenne'
        });
      }

      // Vérification batterie faible
      if (trackingPoint.batterieTelephone && 
          trackingPoint.batterieTelephone < alertes.batterieFaible) {
        alertesDeclechees.push({
          type: 'batterie_faible',
          message: `Batterie à ${trackingPoint.batterieTelephone}%`,
          gravite: 'faible'
        });
      }

      // Vérification qualité signal
      if (trackingPoint.qualiteSignal < alertes.qualiteSignalMin) {
        alertesDeclechees.push({
          type: 'signal_faible',
          message: `Qualité signal: ${trackingPoint.qualiteSignal}%`,
          gravite: 'faible'
        });
      }

      // Envoyer les alertes
      for (const alerte of alertesDeclechees) {
        await this.declencherAlerte(trajetId, alerte, trackingPoint);
      }

    } catch (error) {
      console.error('❌ Erreur vérification alertes:', error);
    }
  }

  async declencherAlerte(trajetId, alerte, trackingPoint) {
    try {
      // Enregistrer l'incident
      await TrackingSession.findOneAndUpdate(
        { trajetId },
        {
          $push: {
            incidents: {
              type: alerte.type,
              description: alerte.message,
              position: trackingPoint.position,
              heure: new Date(),
              gravite: alerte.gravite
            }
          }
        }
      );

      // Notifier selon la gravité
      if (alerte.gravite === 'elevee' || alerte.gravite === 'critique') {
        // Notifier tous les participants
        this.io.to(`trajet_${trajetId}`).emit('alerte_trajet', {
          type: alerte.type,
          message: alerte.message,
          position: trackingPoint.position,
          gravite: alerte.gravite
        });

        // Envoyer notifications push
        const passagers = await this.obtenirPassagersPresents(trajetId);
        for (const passager of passagers) {
          await this.notificationHandler.envoyerNotification(
            passager.passagerId,
            'alerte_securite',
            {
              trajetId,
              type: alerte.type,
              message: alerte.message
            },
            { priorite: 'haute' }
          );
        }
      }

      console.log(`🚨 Alerte déclenchée: ${alerte.type} - ${trajetId}`);

    } catch (error) {
      console.error('❌ Erreur déclenchement alerte:', error);
    }
  }

  // =========================
  // CALCULS ET STATISTIQUES
  // =========================
  
  async calculerETA(trajetId, positionActuelle) {
    try {
      const Trajet = mongoose.model('Trajet');
      const trajet = await Trajet.findById(trajetId).lean();

      if (!trajet || !trajet.coordonneesArrivee) {
        return null;
      }

      const destination = {
        latitude: trajet.coordonneesArrivee.coordinates[1],
        longitude: trajet.coordonneesArrivee.coordinates[0]
      };

      const positionCourante = {
        latitude: positionActuelle.position.coordinates[1],
        longitude: positionActuelle.position.coordinates[0]
      };

      const distance = geolib.getDistance(positionCourante, destination);
      const vitesseMoyenne = positionActuelle.vitesse || 30; // 30 km/h par défaut

      const etaMinutes = Math.ceil((distance / 1000) / (vitesseMoyenne / 60));
      const etaTimestamp = new Date(Date.now() + etaMinutes * 60 * 1000);

      return {
        distance,
        dureeEstimee: etaMinutes,
        heureArriveeEstimee: etaTimestamp
      };

    } catch (error) {
      console.error('❌ Erreur calcul ETA:', error);
      return null;
    }
  }

  async calculerStatistiquesSession(trajetId) {
    try {
      const points = await TrackingPoint.find({
        trajetId,
        estValide: true
      }).sort({ createdAt: 1 }).lean();

      if (points.length === 0) {
        return {};
      }

      let distanceTotale = 0;
      let vitesseMax = 0;
      let vitesseTotale = 0;
      let nombreArrets = 0;
      let tempsArrets = 0;

      for (let i = 0; i < points.length; i++) {
        const point = points[i];
        
        distanceTotale += point.distanceParcourue || 0;
        
        if (point.vitesse > vitesseMax) {
          vitesseMax = point.vitesse;
        }
        
        vitesseTotale += point.vitesse || 0;
        
        // Détecter les arrêts (vitesse < 2 km/h pendant plus de 2 minutes)
        if (point.vitesse < 2) {
          let dureeArret = 0;
          let j = i;
          
          while (j < points.length && points[j].vitesse < 2) {
            dureeArret += points[j].tempsEcoule || 0;
            j++;
          }
          
          if (dureeArret > 120) { // Plus de 2 minutes
            nombreArrets++;
            tempsArrets += dureeArret;
          }
          
          i = j - 1;
        }
      }

      const premierPoint = points[0];
      const dernierPoint = points[points.length - 1];
      const dureeTrajet = (new Date(dernierPoint.createdAt) - new Date(premierPoint.createdAt)) / 1000;
      
      // Calculer vitesse moyenne de deux façons pour validation
      const vitesseMoyenneDistance = dureeTrajet > 0 ? (distanceTotale / 1000) / (dureeTrajet / 3600) : 0;
      const vitesseMoyennePoints = points.length > 0 ? vitesseTotale / points.length : 0;
      
      // Utiliser la moyenne des vitesses si plus cohérente, sinon celle basée sur la distance
      const vitesseMoyenne = Math.abs(vitesseMoyennePoints - vitesseMoyenneDistance) < 10 ? 
        vitesseMoyennePoints : vitesseMoyenneDistance;

      // Estimation consommation (basée sur distance et conditions)
      const consommationEstimee = this.estimerConsommation(distanceTotale, vitesseMoyenne);
      const emissionsCO2 = consommationEstimee * 2.31; // kg CO2 par litre

      return {
        distanceTotale: Math.round(distanceTotale),
        dureeTrajet: Math.round(dureeTrajet),
        vitesseMoyenne: Math.round(vitesseMoyenne * 100) / 100,
        vitesseMaximale: vitesseMax,
        nombreArrets,
        tempsArrets: Math.round(tempsArrets),
        consommationEstimee: Math.round(consommationEstimee * 100) / 100,
        emissionsCO2: Math.round(emissionsCO2 * 100) / 100
      };

    } catch (error) {
      console.error('❌ Erreur calcul statistiques:', error);
      return {};
    }
  }

  estimerConsommation(distance, vitesseMoyenne) {
    // Formule simplifiée : consommation de base + facteur vitesse
    const consommationBase = 7; // L/100km
    const facteurVitesse = vitesseMoyenne > 90 ? (vitesseMoyenne - 90) * 0.1 : 0;
    const consommationAux100 = consommationBase + facteurVitesse;
    
    return (distance / 1000) * (consommationAux100 / 100);
  }

  // =========================
  // RÉCUPÉRATION DES DONNÉES
  // =========================
  
  async obtenirTrackingTrajet(trajetId, options = {}) {
    try {
      const {
        dateDebut = null,
        dateFin = null,
        inclureInvalides = false,
        simplifier = false,
        intervalleSimplification = 60 // secondes
      } = options;

      let filtre = { trajetId };
      
      if (!inclureInvalides) {
        filtre.estValide = true;
      }

      if (dateDebut || dateFin) {
        filtre.createdAt = {};
        if (dateDebut) filtre.createdAt.$gte = new Date(dateDebut);
        if (dateFin) filtre.createdAt.$lte = new Date(dateFin);
      }

      let points = await TrackingPoint.find(filtre)
        .sort({ createdAt: 1 })
        .lean();

      if (simplifier && points.length > 100) {
        points = this.simplifierTrajectoire(points, intervalleSimplification);
      }

      // Récupérer la session
      const session = await TrackingSession.findOne({ trajetId }).lean();

      return {
        trajetId,
        session,
        points,
        nombrePoints: points.length,
        premierPoint: points[0] || null,
        dernierPoint: points[points.length - 1] || null
      };

    } catch (error) {
      console.error('❌ Erreur obtenir tracking:', error);
      throw error;
    }
  }

  simplifierTrajectoire(points, intervalle) {
    if (points.length <= 2) return points;

    const pointsSimplifies = [points[0]]; // Garder le premier point
    let dernierPointGarde = points[0];

    for (let i = 1; i < points.length - 1; i++) {
      const point = points[i];
      const tempsEcoule = (new Date(point.createdAt) - new Date(dernierPointGarde.createdAt)) / 1000;

      // Garder le point si assez de temps écoulé ou événement important
      if (tempsEcoule >= intervalle || point.evenement) {
        pointsSimplifies.push(point);
        dernierPointGarde = point;
      }
    }

    pointsSimplifies.push(points[points.length - 1]); // Garder le dernier point
    return pointsSimplifies;
  }

  async obtenirPositionActuelle(conducteurId) {
    try {
      const dernierePosition = await TrackingPoint.findOne({
        conducteurId,
        estValide: true
      })
        .sort({ createdAt: -1 })
        .lean();

      if (!dernierePosition) {
        return null;
      }

      // Vérifier que la position n'est pas trop ancienne (plus de 5 minutes)
      const maintenant = new Date();
      const anciennete = (maintenant - dernierePosition.createdAt) / 1000 / 60;

      if (anciennete > 5) {
        return {
          ...dernierePosition,
          obsolete: true,
          ancienneteMinutes: Math.round(anciennete)
        };
      }

      return dernierePosition;

    } catch (error) {
      console.error('❌ Erreur position actuelle:', error);
      return null;
    }
  }

  async obtenirConducteursProches(latitude, longitude, rayonKm = 5) {
    try {
      const maintenant = new Date();
      const limiteTempo = new Date(maintenant.getTime() - 5 * 60 * 1000); // 5 minutes

      const conducteursProches = await TrackingPoint.aggregate([
        {
          $match: {
            position: {
              $near: {
                $geometry: { type: 'Point', coordinates: [longitude, latitude] },
                $maxDistance: rayonKm * 1000
              }
            },
            createdAt: { $gte: limiteTempo },
            estValide: true
          }
        },
        {
          $group: {
            _id: '$conducteurId',
            dernierPoint: { $last: '$ROOT' }
          }
        },
        {
          $lookup: {
            from: 'utilisateurs',
            localField: '_id',
            foreignField: '_id',
            as: 'conducteur'
          }
        },
        {
          $unwind: '$conducteur'
        },
        {
          $lookup: {
            from: 'trajets',
            localField: 'dernierPoint.trajetId',
            foreignField: '_id',
            as: 'trajet'
          }
        },
        {
          $unwind: { path: '$trajet', preserveNullAndEmptyArrays: true }
        }
      ]);

      return conducteursProches.map(item => ({
        conducteur: {
          id: item.conducteur._id,
          nom: item.conducteur.nom,
          prenom: item.conducteur.prenom,
          photoProfil: item.conducteur.photoProfil
        },
        position: {
          latitude: item.dernierPoint.position.coordinates[1],
          longitude: item.dernierPoint.position.coordinates[0]
        },
        vitesse: item.dernierPoint.vitesse,
        direction: item.dernierPoint.direction,
        derniereMAJ: item.dernierPoint.createdAt,
        trajet: item.trajet ? {
          id: item.trajet._id,
          depart: item.trajet.depart,
          arrivee: item.trajet.arrivee,
          statut: item.trajet.statut
        } : null,
        distance: geolib.getDistance(
          { latitude, longitude },
          {
            latitude: item.dernierPoint.position.coordinates[1],
            longitude: item.dernierPoint.position.coordinates[0]
          }
        )
      }));

    } catch (error) {
      console.error('❌ Erreur conducteurs proches:', error);
      return [];
    }
  }

  // =========================
  // ÉVÉNEMENTS SOCKET
  // =========================
  
  setupSocketEvents() {
    this.io.on('connection', (socket) => {
      // Démarrer session tracking
      socket.on('demarrer_tracking', async (data) => {
        try {
          const { trajetId, parametres } = data;
          const conducteurId = socket.user?.userId;

          if (!conducteurId) {
            socket.emit('tracking_error', { message: 'Utilisateur non authentifié' });
            return;
          }

          const result = await this.demarrerSession(trajetId, conducteurId, parametres);
          socket.emit('tracking_demarre_confirme', result);

        } catch (error) {
          socket.emit('tracking_error', { message: error.message });
        }
      });

      // Envoyer position
      socket.on('envoyer_position', async (data) => {
        try {
          const result = await this.enregistrerPosition(data.trajetId, data.position);
          socket.emit('position_enregistree', result);

        } catch (error) {
          socket.emit('tracking_error', { message: error.message });
        }
      });

      // Terminer tracking
      socket.on('terminer_tracking', async (data) => {
        try {
          const { trajetId } = data;
          const conducteurId = socket.user?.userId;

          const result = await this.terminerSession(trajetId, conducteurId);
          socket.emit('tracking_termine_confirme', result);

        } catch (error) {
          socket.emit('tracking_error', { message: error.message });
        }
      });

      // Signaler incident
      socket.on('signaler_incident', async (data) => {
        try {
          const { trajetId, type, description, position } = data;
          await this.signalerIncident(trajetId, type, description, position);
          socket.emit('incident_signale', { success: true });

        } catch (error) {
          socket.emit('tracking_error', { message: error.message });
        }
      });

      // Obtenir tracking trajet
      socket.on('obtenir_tracking', async (data) => {
        try {
          const { trajetId, options } = data;
          const tracking = await this.obtenirTrackingTrajet(trajetId, options);
          socket.emit('tracking_obtenu', tracking);

        } catch (error) {
          socket.emit('tracking_error', { message: error.message });
        }
      });

      // Rechercher conducteurs proches
      socket.on('rechercher_conducteurs_proches', async (data) => {
        try {
          const { latitude, longitude, rayon } = data;
          const conducteurs = await this.obtenirConducteursProches(latitude, longitude, rayon);
          socket.emit('conducteurs_proches_obtenus', { conducteurs });

        } catch (error) {
          socket.emit('tracking_error', { message: error.message });
        }
      });
    });
  }

  // =========================
  // GESTION DES INCIDENTS
  // =========================
  
  async signalerIncident(trajetId, type, description, position) {
    try {
      const incident = {
        type,
        description,
        position: {
          type: 'Point',
          coordinates: position ? [position.longitude, position.latitude] : null
        },
        heure: new Date(),
        gravite: this.evaluerGraviteIncident(type)
      };

      await TrackingSession.findOneAndUpdate(
        { trajetId },
        { $push: { incidents: incident } }
      );

      // Notifier selon la gravité
      if (incident.gravite === 'elevee' || incident.gravite === 'critique') {
        await this.declencherAlerte(trajetId, {
          type: 'incident_signale',
          message: `Incident ${type}: ${description}`,
          gravite: incident.gravite
        }, { position: incident.position });
      }

      console.log(`🚨 Incident signalé: ${type} - ${trajetId}`);
      return { success: true };

    } catch (error) {
      console.error('❌ Erreur signalement incident:', error);
      throw error;
    }
  }

  evaluerGraviteIncident(type) {
    const gravites = {
      'accident': 'critique',
      'panne': 'elevee',
      'urgence': 'critique',
      'retard': 'moyenne',
      'deviation': 'faible',
      'autre': 'faible'
    };

    return gravites[type] || 'faible';
  }

  // =========================
  // SURVEILLANCE ET ANALYTICS
  // =========================
  
  async obtenirAnalyticsTrajet(trajetId) {
    try {
      const tracking = await this.obtenirTrackingTrajet(trajetId);
      const points = tracking.points;

      if (points.length === 0) {
        return { error: 'Aucun point de tracking disponible' };
      }

      // Analyse de conduite
      const vitesses = points.map(p => p.vitesse).filter(v => v > 0);
      const accelerations = [];
      
      for (let i = 1; i < points.length; i++) {
        if (points[i].tempsEcoule > 0) {
          const acceleration = (points[i].vitesse - points[i-1].vitesse) / points[i].tempsEcoule;
          accelerations.push(acceleration);
        }
      }

      // Zones de conduite
      const zonesVitesse = {
        urbaine: points.filter(p => p.vitesse <= 50).length,
        routiere: points.filter(p => p.vitesse > 50 && p.vitesse <= 90).length,
        autoroute: points.filter(p => p.vitesse > 90).length
      };

      // Éco-conduite score
      const scoreEcoConducte = this.calculerScoreEcoConducte(points, accelerations);

      return {
        trajetId,
        statistiquesGenerales: tracking.session?.statistiques || {},
        analyseVitesse: {
          moyenne: vitesses.reduce((a, b) => a + b, 0) / vitesses.length || 0,
          maximum: Math.max(...vitesses) || 0,
          minimum: Math.min(...vitesses) || 0,
          percentiles: this.calculerPercentiles(vitesses)
        },
        zonesVitesse,
        scoreEcoConducte,
        incidents: tracking.session?.incidents || [],
        qualiteTracking: this.evaluerQualiteTracking(points)
      };

    } catch (error) {
      console.error('❌ Erreur analytics trajet:', error);
      throw error;
    }
  }

  calculerScoreEcoConducte(points, accelerations) {
    let score = 100;

    // Pénalités pour vitesses excessives
    const vitessesExcessives = points.filter(p => p.vitesse > 110).length;
    score -= (vitessesExcessives / points.length) * 30;

    // Pénalités pour accélérations/freinages brusques
    const accelerationsBrusques = accelerations.filter(a => Math.abs(a) > 2).length;
    score -= (accelerationsBrusques / accelerations.length) * 20;

    // Pénalités pour conduite irrégulière
    const variabiliteVitesse = this.calculerVariabiliteVitesse(points);
    score -= variabiliteVitesse * 10;

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  calculerVariabiliteVitesse(points) {
    const vitesses = points.map(p => p.vitesse).filter(v => v > 0);
    if (vitesses.length === 0) return 0;

    const moyenne = vitesses.reduce((a, b) => a + b) / vitesses.length;
    const variance = vitesses.reduce((acc, v) => acc + Math.pow(v - moyenne, 2), 0) / vitesses.length;
    return Math.sqrt(variance) / moyenne; // Coefficient de variation
  }

  calculerPercentiles(valeurs) {
    if (valeurs.length === 0) return {};
    
    const sorted = [...valeurs].sort((a, b) => a - b);
    return {
      p25: sorted[Math.floor(sorted.length * 0.25)],
      p50: sorted[Math.floor(sorted.length * 0.50)],
      p75: sorted[Math.floor(sorted.length * 0.75)],
      p95: sorted[Math.floor(sorted.length * 0.95)]
    };
  }

  evaluerQualiteTracking(points) {
    const pointsValides = points.filter(p => p.estValide).length;
    const pourcentageValides = (pointsValides / points.length) * 100;
    
    const precisionMoyenne = points
      .filter(p => p.precision)
      .reduce((acc, p) => acc + p.precision, 0) / points.length;

    const qualiteSignalMoyenne = points
      .filter(p => p.qualiteSignal)
      .reduce((acc, p) => acc + p.qualiteSignal, 0) / points.length;

    return {
      pourcentageValides: Math.round(pourcentageValides),
      precisionMoyenne: Math.round(precisionMoyenne),
      qualiteSignalMoyenne: Math.round(qualiteSignalMoyenne),
      evaluation: pourcentageValides > 90 ? 'excellente' :
                  pourcentageValides > 75 ? 'bonne' :
                  pourcentageValides > 50 ? 'moyenne' : 'faible'
    };
  }

  // =========================
  // MAINTENANCE ET NETTOYAGE
  // =========================
  
  demarrerTachesAutomatiques() {
    // Nettoyer les sessions abandonnées toutes les heures
    setInterval(() => {
      this.nettoyerSessionsAbandonnees().catch(console.error);
    }, 60 * 60 * 1000);

    // Nettoyer les anciens points de tracking quotidiennement
    setInterval(() => {
      this.nettoyerAnciennesPositions().catch(console.error);
    }, 24 * 60 * 60 * 1000);

    // Vérifier les sessions actives toutes les 5 minutes
    setInterval(() => {
      this.verifierSessionsActives().catch(console.error);
    }, 5 * 60 * 1000);

    console.log('🔧 Tâches automatiques tracking démarrées');
  }

  async nettoyerSessionsAbandonnees() {
    try {
      const limiteTempo = new Date(Date.now() - 4 * 60 * 60 * 1000); // 4 heures

      const sessionsAbandonnees = await TrackingSession.find({
        statut: 'active',
        updatedAt: { $lt: limiteTempo }
      });

      for (const session of sessionsAbandonnees) {
        const statistiques = await this.calculerStatistiquesSession(session.trajetId);
        
        await TrackingSession.findByIdAndUpdate(session._id, {
          statut: 'interrompue',
          heureFin: new Date(),
          statistiques
        });

        // Nettoyer la mémoire
        this.sessionsActives.delete(session.trajetId.toString());
      }

      if (sessionsAbandonnees.length > 0) {
        console.log(`🧹 ${sessionsAbandonnees.length} sessions abandonnées nettoyées`);
      }

    } catch (error) {
      console.error('❌ Erreur nettoyage sessions:', error);
    }
  }

  async nettoyerAnciennesPositions() {
    try {
      const dateLimit = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 jours

      const result = await TrackingPoint.deleteMany({
        createdAt: { $lt: dateLimit },
        evenement: { $exists: false } // Garder les points avec événements
      });

      console.log(`🧹 ${result.deletedCount} anciens points de tracking supprimés`);

    } catch (error) {
      console.error('❌ Erreur nettoyage positions:', error);
    }
  }

  async verifierSessionsActives() {
    try {
      // Vérifier que toutes les sessions en mémoire correspondent à la base
      for (const [trajetId, sessionData] of this.sessionsActives) {
        const session = await TrackingSession.findById(sessionData.sessionId);
        
        if (!session || session.statut !== 'active') {
          console.log(`🔄 Nettoyage session inactive: ${trajetId}`);
          this.sessionsActives.delete(trajetId);
          
          if (sessionData.intervalId) {
            clearInterval(sessionData.intervalId);
          }
        }
      }

    } catch (error) {
      console.error('❌ Erreur vérification sessions:', error);
    }
  }

  // =========================
  // MÉTHODES PUBLIQUES
  // =========================
  
  obtenirStatutSession(trajetId) {
    const sessionData = this.sessionsActives.get(trajetId);
    return sessionData ? {
      active: true,
      sessionId: sessionData.sessionId,
      dernierPoint: sessionData.dernierPoint,
      parametres: sessionData.parametres
    } : { active: false };
  }

  async obtenirResumeConducteur(conducteurId, options = {}) {
    try {
      const {
        dateDebut = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
        dateFin = new Date()
      } = options;

      const sessions = await TrackingSession.find({
        conducteurId,
        createdAt: { $gte: dateDebut, $lte: dateFin }
      }).lean();

      const statistiquesGlobales = {
        nombreTrajets: sessions.length,
        distanceTotale: sessions.reduce((acc, s) => acc + (s.statistiques?.distanceTotale || 0), 0),
        tempsTotalConduite: sessions.reduce((acc, s) => acc + (s.statistiques?.dureeTrajet || 0), 0),
        vitesseMoyenneGlobale: 0,
        scoreEcoConduiteGlobal: 0,
        nombreIncidents: sessions.reduce((acc, s) => acc + (s.incidents?.length || 0), 0)
      };

      if (statistiquesGlobales.tempsTotalConduite > 0) {
        statistiquesGlobales.vitesseMoyenneGlobale = 
          (statistiquesGlobales.distanceTotale / 1000) / (statistiquesGlobales.tempsTotalConduite / 3600);
      }

      return {
        conducteurId,
        periode: { dateDebut, dateFin },
        statistiques: statistiquesGlobales,
        sessions: sessions.map(s => ({
          trajetId: s.trajetId,
          date: s.heureDebut,
          duree: s.statistiques?.dureeTrajet || 0,
          distance: s.statistiques?.distanceTotale || 0,
          vitesseMoyenne: s.statistiques?.vitesseMoyenne || 0
        }))
      };

    } catch (error) {
      console.error('❌ Erreur résumé conducteur:', error);
      throw error;
    }
  }
}

// Export
module.exports = {
  TrajetTrackingHandler,
  TrackingPoint,
  TrackingSession
};