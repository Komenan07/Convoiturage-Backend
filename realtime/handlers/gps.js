const Reservation = require('../../models/Reservation');
const Trajet = require('../../models/Trajet');
//const Utilisateur = require('../../models/Utilisateur');
const { redisUtils } = require('../../config/redis');

module.exports = (socket, io) => {

  // Démarrer le suivi GPS d'un trajet
  socket.on('startTripTracking', async (data) => {
    try {
      const { trajetId } = data;

      // Vérifier que l'utilisateur est le conducteur de ce trajet
      const trajet = await Trajet.findOne({
        _id: trajetId,
        conducteurId: socket.userId,
        statutTrajet: { $in: ['PROGRAMME', 'EN_COURS'] }
      });

      if (!trajet) {
        socket.emit('error', { 
          type: 'TRACKING_ERROR',
          message: 'Trajet non trouvé ou non autorisé' 
        });
        return;
      }

      // Rejoindre la room du trajet pour les mises à jour GPS
      socket.join(`trip_${trajetId}`);
      
      // Mettre à jour le statut du trajet
      await Trajet.findByIdAndUpdate(trajetId, { 
        statutTrajet: 'EN_COURS',
        heureDepart: new Date().toTimeString().slice(0, 5) // Format HH:MM
      });

      // Récupérer toutes les réservations confirmées pour ce trajet
      const reservations = await Reservation.find({
        trajetId,
        statutReservation: 'CONFIRMEE'
      }).populate('passagerId', 'nom prenom telephone');

      // Notifier tous les passagers que le trajet a commencé
      for (const reservation of reservations) {
        io.to(`user_${reservation.passagerId._id}`).emit('tripStarted', {
          trajetId,
          conducteur: {
            nom: socket.user.nom,
            prenom: socket.user.prenom,
            telephone: socket.user.telephone
          },
          message: 'Votre trajet a commencé! Le conducteur est en route.',
          reservationId: reservation._id
        });

        // Faire rejoindre automatiquement les passagers à la room du trajet
        const passagerSockets = await io.in(`user_${reservation.passagerId._id}`).fetchSockets();
        passagerSockets.forEach(passengerSocket => {
          passengerSocket.join(`trip_${trajetId}`);
        });
      }

      socket.emit('trackingStarted', { 
        trajetId,
        message: 'Suivi GPS activé',
        passagers: reservations.map(r => ({
          nom: r.passagerId.nom,
          pointPriseEnCharge: r.pointPriseEnCharge
        }))
      });

      console.log(`📍 Suivi GPS démarré pour le trajet ${trajetId} par ${socket.user.nom}`);

    } catch (error) {
      console.error('Erreur startTripTracking:', error);
      socket.emit('error', { 
        type: 'TRACKING_ERROR',
        message: 'Erreur lors du démarrage du suivi GPS' 
      });
    }
  });

  // Mise à jour de position en temps réel
  socket.on('updatePosition', async (positionData) => {
    try {
      const { 
        trajetId, 
        coordinates, 
        vitesse = 0, 
        direction = 0, 
        precision = 0 
      } = positionData;

      // Validation des coordonnées
      if (!coordinates || !Array.isArray(coordinates) || coordinates.length !== 2) {
        socket.emit('error', { 
          type: 'GPS_ERROR',
          message: 'Coordonnées GPS invalides' 
        });
        return;
      }

      // Vérifier que l'utilisateur est autorisé à mettre à jour cette position
      const trajet = await Trajet.findOne({
        _id: trajetId,
        conducteurId: socket.userId,
        statutTrajet: 'EN_COURS'
      });

      if (!trajet) {
        socket.emit('error', { 
          type: 'GPS_ERROR',
          message: 'Non autorisé à mettre à jour cette position' 
        });
        return;
      }

      const positionUpdate = {
        coordinates,
        vitesse,
        direction,
        precision,
        timestamp: new Date()
      };

      // Stocker la position en Redis pour un accès rapide
      await redisUtils.setUserPosition(socket.userId, positionUpdate, 600); // 10 minutes TTL

      // Mettre à jour dans MongoDB pour toutes les réservations de ce trajet
      await Reservation.updateMany(
        { trajetId, statutReservation: 'CONFIRMEE' },
        {
          'positionEnTempsReel.coordonnees.coordinates': coordinates,
          'positionEnTempsReel.lastUpdate': new Date()
        }
      );

      // Calculer la distance et l'ETA pour chaque passager
      const reservations = await Reservation.find({
        trajetId,
        statutReservation: 'CONFIRMEE'
      }).populate('passagerId', 'nom prenom');

      const passagerUpdates = [];

      for (const reservation of reservations) {
        // Calculer la distance jusqu'au point de prise en charge
        const distanceToPriseEnCharge = calculateDistance(
          coordinates,
          reservation.pointPriseEnCharge.coordonnees.coordinates
        );

        // Calculer la distance jusqu'au point de dépose
        const distanceToDepose = calculateDistance(
          coordinates,
          reservation.pointDepose.coordonnees.coordinates
        );

        // Calculer l'ETA
        const eta = await calculateETA(coordinates, reservation.pointDepose.coordonnees.coordinates, vitesse);

        passagerUpdates.push({
          passagerId: reservation.passagerId._id,
          distanceToPriseEnCharge,
          distanceToDepose,
          eta
        });

        // Envoyer une mise à jour personnalisée à chaque passager
        io.to(`user_${reservation.passagerId._id}`).emit('personalizedLocationUpdate', {
          trajetId,
          conducteurPosition: positionUpdate,
          distanceToPriseEnCharge,
          distanceToDepose,
          eta,
          estimatedArrival: eta.eta
        });
      }

      // Diffuser la position générale à tous les participants du trajet
      socket.to(`trip_${trajetId}`).emit('positionUpdate', {
        trajetId,
        conducteurId: socket.userId,
        position: positionUpdate,
        passagerUpdates
      });

      // Vérifier si le conducteur est proche d'un point de prise en charge
      await checkProximityToPickupPoints(trajetId, coordinates, io);

    } catch (error) {
      console.error('Erreur updatePosition:', error);
      socket.emit('error', { 
        type: 'GPS_ERROR',
        message: 'Erreur lors de la mise à jour de position' 
      });
    }
  });

  // Demander la position actuelle du conducteur
  socket.on('requestDriverPosition', async (data) => {
    try {
      const { trajetId } = data;

      const trajet = await Trajet.findById(trajetId)
        .populate('conducteurId', 'nom prenom telephone');
      
      if (!trajet) {
        socket.emit('error', { 
          type: 'GPS_ERROR',
          message: 'Trajet non trouvé' 
        });
        return;
      }

      // Vérifier que l'utilisateur a le droit de voir cette position
      const reservation = await Reservation.findOne({
        trajetId,
        passagerId: socket.userId,
        statutReservation: 'CONFIRMEE'
      });

      if (!reservation && trajet.conducteurId._id.toString() !== socket.userId) {
        socket.emit('error', { 
          type: 'GPS_ERROR',
          message: 'Non autorisé à voir cette position' 
        });
        return;
      }

      // Récupérer la dernière position depuis Redis
      const position = await redisUtils.getUserPosition(trajet.conducteurId._id);
      
      if (position) {
        socket.emit('driverPosition', {
          trajetId,
          conducteur: {
            nom: trajet.conducteurId.nom,
            prenom: trajet.conducteurId.prenom
          },
          position,
          lastUpdate: position.timestamp
        });
      } else {
        socket.emit('error', { 
          type: 'GPS_ERROR',
          message: 'Position du conducteur non disponible' 
        });
      }

    } catch (error) {
      console.error('Erreur requestDriverPosition:', error);
      socket.emit('error', { 
        type: 'GPS_ERROR',
        message: 'Erreur lors de la récupération de la position' 
      });
    }
  });

  // Arrêter le suivi GPS
  socket.on('stopTripTracking', async (data) => {
    try {
      const { trajetId } = data;

      // Vérifier les permissions
      const trajet = await Trajet.findOne({
        _id: trajetId,
        conducteurId: socket.userId
      });

      if (!trajet) {
        socket.emit('error', { 
          type: 'TRACKING_ERROR',
          message: 'Non autorisé à arrêter ce suivi' 
        });
        return;
      }

      // Mettre à jour le statut du trajet
      await Trajet.findByIdAndUpdate(trajetId, { 
        statutTrajet: 'TERMINE',
        heureArriveePrevue: new Date().toTimeString().slice(0, 5)
      });

      // Marquer toutes les réservations comme terminées
      await Reservation.updateMany(
        { trajetId, statutReservation: 'CONFIRMEE' },
        { statutReservation: 'TERMINEE' }
      );

      // Notifier tous les participants
      socket.to(`trip_${trajetId}`).emit('tripEnded', {
        trajetId,
        message: 'Le trajet est terminé',
        endTime: new Date()
      });

      // Quitter la room du trajet
      socket.leave(`trip_${trajetId}`);

      // Nettoyer la position en cache
      await redisUtils.deleteUserPosition(socket.userId);

      socket.emit('trackingStopped', { 
        trajetId,
        message: 'Suivi GPS arrêté' 
      });

      console.log(`📍 Suivi GPS arrêté pour le trajet ${trajetId}`);

    } catch (error) {
      console.error('Erreur stopTripTracking:', error);
      socket.emit('error', { 
        type: 'TRACKING_ERROR',
        message: 'Erreur lors de l\'arrêt du suivi' 
      });
    }
  });

  // Rejoindre le suivi d'un trajet (pour les passagers)
  socket.on('joinTripTracking', async (data) => {
    try {
      const { trajetId } = data;

      // Vérifier que l'utilisateur a une réservation pour ce trajet
      const reservation = await Reservation.findOne({
        trajetId,
        passagerId: socket.userId,
        statutReservation: 'CONFIRMEE'
      });

      if (!reservation) {
        socket.emit('error', { 
          type: 'TRACKING_ERROR',
          message: 'Aucune réservation trouvée pour ce trajet' 
        });
        return;
      }

      // Rejoindre la room du trajet
      socket.join(`trip_${trajetId}`);

      // Récupérer la position actuelle du conducteur
      const trajet = await Trajet.findById(trajetId)
        .populate('conducteurId', 'nom prenom');

      const position = await redisUtils.getUserPosition(trajet.conducteurId._id);

      socket.emit('tripTrackingJoined', {
        trajetId,
        conducteur: trajet.conducteurId,
        currentPosition: position,
        reservation
      });

    } catch (error) {
      console.error('Erreur joinTripTracking:', error);
      socket.emit('error', { 
        type: 'TRACKING_ERROR',
        message: 'Erreur lors de la connexion au suivi' 
      });
    }
  });

  console.log(`📍 GPS handler initialisé pour ${socket.user.nom}`);
};

// Fonctions utilitaires

// Calculer la distance entre deux points GPS
function calculateDistance(pos1, pos2) {
  const R = 6371; // Rayon de la Terre en km
  const dLat = toRadians(pos2[1] - pos1[1]);
  const dLng = toRadians(pos2[0] - pos1[0]);
  
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(toRadians(pos1[1])) * Math.cos(toRadians(pos2[1])) *
            Math.sin(dLng/2) * Math.sin(dLng/2);
            
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c; // Distance en km
}

function toRadians(degrees) {
  return degrees * (Math.PI / 180);
}

// Calculer l'ETA (temps d'arrivée estimé)
async function calculateETA(currentPos, destinationPos, currentSpeed = 40) {
  const distance = calculateDistance(currentPos, destinationPos);
  
  // Vitesse moyenne si pas de vitesse actuelle ou vitesse trop faible
  const vitesseMoyenne = currentSpeed > 5 ? currentSpeed : 40; // km/h
  
  const tempsEstimeMinutes = (distance / vitesseMoyenne) * 60;
  
  return {
    distance: Math.round(distance * 100) / 100,
    duration: Math.round(tempsEstimeMinutes),
    eta: new Date(Date.now() + tempsEstimeMinutes * 60 * 1000)
  };
}

// Vérifier la proximité aux points de prise en charge
async function checkProximityToPickupPoints(trajetId, currentPosition, io) {
  try {
    const reservations = await Reservation.find({
      trajetId,
      statutReservation: 'CONFIRMEE'
    }).populate('passagerId', 'nom prenom');

    for (const reservation of reservations) {
      const distance = calculateDistance(
        currentPosition,
        reservation.pointPriseEnCharge.coordonnees.coordinates
      );

      // Si le conducteur est à moins de 500m du point de prise en charge
      if (distance <= 0.5) { // 500 mètres
        io.to(`user_${reservation.passagerId._id}`).emit('conducteurProche', {
          trajetId,
          reservationId: reservation._id,
          distance: Math.round(distance * 1000), // en mètres
          pointPriseEnCharge: reservation.pointPriseEnCharge,
          message: 'Le conducteur arrive! Préparez-vous.'
        });
      }
    }
  } catch (error) {
    console.error('Erreur checkProximityToPickupPoints:', error);
  }
}