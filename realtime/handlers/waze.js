// realtime/handlers/waze.js - Handler Socket.IO pour l'intégration Waze en temps réel

const wazeService = require('../../services/waze');
const Trajet = require('../../models/Trajet');
const Reservation = require('../../models/Reservation');
const { calculateDistance } = require('../../utils/helpers');

module.exports = (socket, io) => {

  // Demander la navigation Waze pour un trajet
  socket.on('requestWazeNavigation', async (data) => {
    try {
      const { trajetId, currentPosition, navigationType = 'pickup' } = data;

      // Récupérer le trajet
      const trajet = await Trajet.findById(trajetId)
        .populate('conducteurId', 'nom prenom');

      if (!trajet) {
        socket.emit('error', {
          type: 'WAZE_ERROR',
          message: 'Trajet non trouvé'
        });
        return;
      }

      // Vérifier les permissions
      const reservation = await Reservation.findOne({
        trajetId,
        passagerId: socket.userId,
        statutReservation: 'CONFIRMEE'
      });

      const isConducteur = trajet.conducteurId._id.toString() === socket.userId;
      
      if (!reservation && !isConducteur) {
        socket.emit('error', {
          type: 'WAZE_ERROR',
          message: 'Accès non autorisé à ce trajet'
        });
        return;
      }

      let destination, waypoints = [];

      if (isConducteur) {
        // Pour le conducteur : créer un itinéraire complet avec tous les points
        waypoints.push({
          coordinates: trajet.pointDepart.coordonnees.coordinates,
          address: trajet.pointDepart.adresse,
          type: 'start',
          name: trajet.pointDepart.nom
        });

        // Ajouter tous les points de prise en charge
        const reservations = await Reservation.find({
          trajetId,
          statutReservation: 'CONFIRMEE'
        }).populate('passagerId', 'nom prenom');

        // Trier les réservations par distance depuis le point de départ
        const sortedReservations = reservations.sort((a, b) => {
          const distA = calculateDistance(
            trajet.pointDepart.coordonnees.coordinates,
            a.pointPriseEnCharge.coordonnees.coordinates
          );
          const distB = calculateDistance(
            trajet.pointDepart.coordonnees.coordinates,
            b.pointPriseEnCharge.coordonnees.coordinates
          );
          return distA - distB;
        });

        for (const res of sortedReservations) {
          waypoints.push({
            coordinates: res.pointPriseEnCharge.coordonnees.coordinates,
            address: res.pointPriseEnCharge.adresse,
            type: 'pickup',
            name: `Récupérer ${res.passagerId.nom}`,
            passagerId: res.passagerId._id,
            reservationId: res._id
          });
        }

        waypoints.push({
          coordinates: trajet.pointArrivee.coordonnees.coordinates,
          address: trajet.pointArrivee.adresse,
          type: 'end',
          name: trajet.pointArrivee.nom
        });

      } else {
        // Pour le passager
        if (navigationType === 'pickup') {
          // Navigation vers le point de prise en charge
          destination = {
            coordinates: reservation.pointPriseEnCharge.coordonnees.coordinates,
            address: reservation.pointPriseEnCharge.adresse
          };

          if (currentPosition) {
            waypoints = [
              {
                coordinates: currentPosition,
                address: 'Votre position actuelle',
                type: 'start',
                name: 'Position actuelle'
              },
              {
                coordinates: destination.coordinates,
                address: destination.address,
                type: 'pickup',
                name: 'Point de prise en charge'
              }
            ];
          }
        } else if (navigationType === 'destination') {
          // Navigation vers la destination finale
          destination = {
            coordinates: reservation.pointDepose.coordonnees.coordinates,
            address: reservation.pointDepose.adresse
          };
        }
      }

      // Créer l'itinéraire Waze
      let routeResult;
      
      if (waypoints.length > 0) {
        routeResult = await wazeService.createMultiPointRoute(waypoints, {
          vehicleType: 'car',
          trafficFactor: 1.2
        });
      } else if (destination) {
        const webURL = wazeService.generateWebNavigationURL(destination);
        const mobileLinks = wazeService.generateMobileDeepLinks(destination);
        
        routeResult = {
          success: true,
          wazeURL: webURL,
          mobileLinks,
          destination
        };
      }

      if (!routeResult || !routeResult.success) {
        socket.emit('error', {
          type: 'WAZE_ERROR',
          message: 'Impossible de créer l\'itinéraire Waze'
        });
        return;
      }

      // Obtenir les informations de trafic
      const targetCoords = isConducteur ? 
        trajet.pointArrivee.coordonnees.coordinates : 
        reservation.pointPriseEnCharge.coordonnees.coordinates;

      const trafficInfo = await wazeService.getTrafficInfo(targetCoords);

      socket.emit('wazeNavigationReady', {
        trajetId,
        userRole: isConducteur ? 'conducteur' : 'passager',
        navigationType,
        route: routeResult,
        traffic: trafficInfo,
        trip: {
          from: trajet.pointDepart.nom,
          to: trajet.pointArrivee.nom,
          date: trajet.dateDepart,
          time: trajet.heureDepart
        }
      });

      console.log(`🗺️ Navigation Waze générée pour ${socket.user.nom} - Trajet ${trajetId}`);

    } catch (error) {
      console.error('Erreur requestWazeNavigation:', error);
      socket.emit('error', {
        type: 'WAZE_ERROR',
        message: 'Erreur lors de la génération de la navigation Waze'
      });
    }
  });

  // Partager un trajet via Waze
  socket.on('shareWazeTrip', async (data) => {
    try {
      const { trajetId, platform = 'whatsapp' } = data;

      // Récupérer le trajet
      const trajet = await Trajet.findById(trajetId)
        .populate('conducteurId', 'nom prenom telephone');

      if (!trajet) {
        socket.emit('error', {
          type: 'WAZE_ERROR',
          message: 'Trajet non trouvé'
        });
        return;
      }

      // Vérifier que c'est le conducteur
      if (trajet.conducteurId._id.toString() !== socket.userId) {
        socket.emit('error', {
          type: 'WAZE_ERROR',
          message: 'Seul le conducteur peut partager ce trajet'
        });
        return;
      }

      // Créer les liens de partage
      const shareLinks = wazeService.createTripShareLinks({
        pointDepart: trajet.pointDepart,
        pointArrivee: trajet.pointArrivee,
        dateDepart: trajet.dateDepart,
        heureDepart: trajet.heureDepart,
        conducteur: trajet.conducteurId,
        prixParPassager: trajet.prixParPassager,
        nombrePlacesDisponibles: trajet.nombrePlacesDisponibles
      });

      if (!shareLinks) {
        socket.emit('error', {
          type: 'WAZE_ERROR',
          message: 'Erreur lors de la création des liens de partage'
        });
        return;
      }

      socket.emit('wazeTripShared', {
        trajetId,
        platform,
        shareLinks,
        message: 'Liens de partage générés avec succès'
      });

    } catch (error) {
      console.error('Erreur shareWazeTrip:', error);
      socket.emit('error', {
        type: 'WAZE_ERROR',
        message: 'Erreur lors du partage du trajet'
      });
    }
  });

  // Obtenir les informations de trafic en temps réel
  socket.on('getTrafficInfo', async (data) => {
    try {
      const { coordinates, radius = 5000 } = data;

      if (!coordinates || !Array.isArray(coordinates) || coordinates.length !== 2) {
        socket.emit('error', {
          type: 'WAZE_ERROR',
          message: 'Coordonnées invalides'
        });
        return;
      }

      const trafficInfo = await wazeService.getTrafficInfo(coordinates, radius);

      socket.emit('trafficInfoUpdate', {
        coordinates,
        radius,
        traffic: trafficInfo,
        timestamp: new Date()
      });

    } catch (error) {
      console.error('Erreur getTrafficInfo:', error);
      socket.emit('error', {
        type: 'WAZE_ERROR',
        message: 'Erreur lors de la récupération des informations de trafic'
      });
    }
  });

  // Notifier l'arrivée proche via Waze
  socket.on('notifyArrivalViaWaze', async (data) => {
    try {
      const { trajetId, targetUserId, estimatedArrival } = data;

      // Vérifier que c'est un conducteur qui notifie
      const trajet = await Trajet.findById(trajetId);
      
      if (!trajet || trajet.conducteurId.toString() !== socket.userId) {
        socket.emit('error', {
          type: 'WAZE_ERROR',
          message: 'Non autorisé à envoyer cette notification'
        });
        return;
      }

      // Récupérer la réservation du passager concerné
      const reservation = await Reservation.findOne({
        trajetId,
        passagerId: targetUserId,
        statutReservation: 'CONFIRMEE'
      }).populate('passagerId', 'nom prenom');

      if (!reservation) {
        socket.emit('error', {
          type: 'WAZE_ERROR',
          message: 'Réservation non trouvée'
        });
        return;
      }

      // Générer le lien Waze vers le point de prise en charge
      const pickupNavigation = wazeService.generateWebNavigationURL({
        coordinates: reservation.pointPriseEnCharge.coordonnees.coordinates,
        address: reservation.pointPriseEnCharge.adresse
      });

      const mobileLinks = wazeService.generateMobileDeepLinks({
        coordinates: reservation.pointPriseEnCharge.coordonnees.coordinates,
        address: reservation.pointPriseEnCharge.adresse
      });

      // Notifier le passager
      io.to(`user_${targetUserId}`).emit('driverArrivingWithWaze', {
        trajetId,
        conducteur: {
          nom: socket.user.nom,
          prenom: socket.user.prenom
        },
        estimatedArrival,
        pickupLocation: reservation.pointPriseEnCharge,
        wazeNavigation: {
          webURL: pickupNavigation,
          mobileLinks
        },
        message: `${socket.user.nom} arrive dans ${estimatedArrival} minutes`
      });

      socket.emit('arrivalNotificationSent', {
        targetUserId,
        passagerNom: reservation.passagerId.nom,
        estimatedArrival
      });

    } catch (error) {
      console.error('Erreur notifyArrivalViaWaze:', error);
      socket.emit('error', {
        type: 'WAZE_ERROR',
        message: 'Erreur lors de l\'envoi de la notification d\'arrivée'
      });
    }
  });

  // Demander des itinéraires alternatifs
  socket.on('requestAlternativeRoutes', async (data) => {
    try {
      const { origin, destination } = data;

      if (!origin?.coordinates || !destination?.coordinates) {
        socket.emit('error', {
          type: 'WAZE_ERROR',
          message: 'Coordonnées d\'origine et de destination requises'
        });
        return;
      }

      // Créer plusieurs options d'itinéraire
      const routeOptions = [];

      // Itinéraire standard
      const standardRoute = await wazeService.createMultiPointRoute([
        { coordinates: origin.coordinates, address: origin.address, type: 'start' },
        { coordinates: destination.coordinates, address: destination.address, type: 'end' }
      ], { vehicleType: 'car' });

      if (standardRoute.success) {
        routeOptions.push({
          type: 'standard',
          name: 'Itinéraire standard',
          route: standardRoute,
          description: 'Itinéraire le plus direct'
        });
      }

      // Itinéraire évitant les péages (simulation)
      const noTollsRoute = await wazeService.createMultiPointRoute([
        { coordinates: origin.coordinates, address: origin.address, type: 'start' },
        { coordinates: destination.coordinates, address: destination.address, type: 'end' }
      ], { avoid: 'tolls', vehicleType: 'car' });

      if (noTollsRoute.success) {
        routeOptions.push({
          type: 'no_tolls',
          name: 'Sans péages',
          route: noTollsRoute,
          description: 'Évite les routes à péage'
        });
      }

      // Itinéraire évitant les autoroutes (simulation)
      const noHighwaysRoute = await wazeService.createMultiPointRoute([
        { coordinates: origin.coordinates, address: origin.address, type: 'start' },
        { coordinates: destination.coordinates, address: destination.address, type: 'end' }
      ], { avoid: 'highways', vehicleType: 'car' });

      if (noHighwaysRoute.success) {
        routeOptions.push({
          type: 'no_highways',
          name: 'Sans autoroutes',
          route: noHighwaysRoute,
          description: 'Utilise les routes secondaires'
        });
      }

      socket.emit('alternativeRoutesReady', {
        origin,
        destination,
        options: routeOptions,
        trafficInfo: await wazeService.getTrafficInfo(destination.coordinates),
        timestamp: new Date()
      });

    } catch (error) {
      console.error('Erreur requestAlternativeRoutes:', error);
      socket.emit('error', {
        type: 'WAZE_ERROR',
        message: 'Erreur lors de la génération des itinéraires alternatifs'
      });
    }
  });

  // S'abonner aux mises à jour de trafic pour une zone
  socket.on('subscribeToTrafficUpdates', async (data) => {
    try {
      const { coordinates, radius = 10000, updateInterval = 300000 } = data; // 5 minutes par défaut

      if (!coordinates || !Array.isArray(coordinates) || coordinates.length !== 2) {
        socket.emit('error', {
          type: 'WAZE_ERROR',
          message: 'Coordonnées invalides pour l\'abonnement trafic'
        });
        return;
      }

      // Joindre une room spécifique pour cette zone
      const trafficRoomId = `traffic_${coordinates[0].toFixed(3)}_${coordinates[1].toFixed(3)}`;
      socket.join(trafficRoomId);

      // Envoyer la première mise à jour
      const initialTrafficInfo = await wazeService.getTrafficInfo(coordinates, radius);
      
      socket.emit('trafficSubscriptionActive', {
        roomId: trafficRoomId,
        coordinates,
        radius,
        updateInterval,
        currentTraffic: initialTrafficInfo
      });

      // Programmer les mises à jour périodiques (simulées)
      if (!socket.trafficUpdateInterval) {
        socket.trafficUpdateInterval = setInterval(async () => {
          try {
            const updatedTraffic = await wazeService.getTrafficInfo(coordinates, radius);
            io.to(trafficRoomId).emit('trafficUpdate', {
              coordinates,
              traffic: updatedTraffic,
              timestamp: new Date()
            });
          } catch (error) {
            console.error('Erreur mise à jour trafic périodique:', error);
          }
        }, updateInterval);
      }

    } catch (error) {
      console.error('Erreur subscribeToTrafficUpdates:', error);
      socket.emit('error', {
        type: 'WAZE_ERROR',
        message: 'Erreur lors de l\'abonnement aux mises à jour de trafic'
      });
    }
  });

  // Se désabonner des mises à jour de trafic
  socket.on('unsubscribeFromTrafficUpdates', () => {
    try {
      // Nettoyer l'intervalle de mise à jour
      if (socket.trafficUpdateInterval) {
        clearInterval(socket.trafficUpdateInterval);
        socket.trafficUpdateInterval = null;
      }

      socket.emit('trafficUnsubscribed', {
        message: 'Désabonnement des mises à jour de trafic effectué'
      });

    } catch (error) {
      console.error('Erreur unsubscribeFromTrafficUpdates:', error);
    }
  });

  // Nettoyer les intervalles lors de la déconnexion
  socket.on('disconnect', () => {
    if (socket.trafficUpdateInterval) {
      clearInterval(socket.trafficUpdateInterval);
      socket.trafficUpdateInterval = null;
    }
  });

  console.log(`🗺️ Waze handler initialisé pour ${socket.user.nom}`);
};