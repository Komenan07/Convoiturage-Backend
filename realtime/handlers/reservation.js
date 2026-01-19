const Reservation = require('../../models/Reservation');
const Trajet = require('../../models/Trajet');
const Conversation = require('../../models/Conversation');
//const Utilisateur = require('../../models/Utilisateur');

module.exports = (socket, io) => {

  // Faire une demande de réservation en temps réel
  socket.on('makeReservation', async (reservationData) => {
    try {
      const { 
        trajetId, 
        nombrePlacesReservees, 
        pointPriseEnCharge, 
        pointDepose,
        bagages 
      } = reservationData;

      // Validation des données
      if (!trajetId || !nombrePlacesReservees || !pointPriseEnCharge || !pointDepose) {
        socket.emit('error', { 
          type: 'RESERVATION_ERROR',
          message: 'Données de réservation incomplètes' 
        });
        return;
      }

      // Vérifier la disponibilité du trajet
      const trajet = await Trajet.findById(trajetId)
        .populate('conducteurId', 'nom prenom telephone photoProfil');
      
      if (!trajet) {
        socket.emit('error', { 
          type: 'RESERVATION_ERROR',
          message: 'Trajet non trouvé' 
        });
        return;
      }

      if (trajet.statutTrajet !== 'PROGRAMME') {
        socket.emit('error', { 
          type: 'RESERVATION_ERROR',
          message: 'Ce trajet n\'est plus disponible pour les réservations' 
        });
        return;
      }

      if (trajet.nombrePlacesDisponibles < nombrePlacesReservees) {
        socket.emit('error', { 
          type: 'RESERVATION_ERROR',
          message: `Seulement ${trajet.nombrePlacesDisponibles} place(s) disponible(s)` 
        });
        return;
      }

      // Vérifier que l'utilisateur n'a pas déjà une réservation pour ce trajet
      const reservationExistante = await Reservation.findOne({
        trajetId,
        passagerId: socket.userId,
        statutReservation: { $in: ['EN_ATTENTE', 'CONFIRMEE'] }
      });

      if (reservationExistante) {
        socket.emit('error', { 
          type: 'RESERVATION_ERROR',
          message: 'Vous avez déjà une réservation pour ce trajet' 
        });
        return;
      }

      // Vérifier que l'utilisateur n'est pas le conducteur
      if (trajet.conducteurId._id.toString() === socket.userId) {
        socket.emit('error', { 
          type: 'RESERVATION_ERROR',
          message: 'Vous ne pouvez pas réserver votre propre trajet' 
        });
        return;
      }

      // Créer la réservation
      const reservation = new Reservation({
        trajetId,
        passagerId: socket.userId,
        nombrePlacesReservees,
        pointPriseEnCharge,
        pointDepose,
        bagages: bagages || { quantite: 0, description: '', poids: 0 },
        statutReservation: trajet.validationAutomatique ? 'CONFIRMEE' : 'EN_ATTENTE',
        dateReservation: new Date(),
        montantTotal: trajet.prixParPassager * nombrePlacesReservees
      });

      await reservation.save();

      if (trajet.validationAutomatique) {
        // Validation automatique - mettre à jour les places disponibles
        await Trajet.findByIdAndUpdate(trajetId, {
          $inc: { nombrePlacesDisponibles: -nombrePlacesReservees }
        });

        reservation.dateConfirmation = new Date();
        await reservation.save();

        // Créer automatiquement une conversation
        let conversation = await Conversation.findOne({
          trajetId,
          participants: { $all: [trajet.conducteurId._id, socket.userId] }
        });

        if (!conversation) {
          conversation = new Conversation({
            trajetId,
            participants: [trajet.conducteurId._id, socket.userId]
          });
          await conversation.save();
        }

        // Notifier le conducteur de la nouvelle réservation confirmée
        io.to(`user_${trajet.conducteurId._id}`).emit('reservationConfirmed', {
          reservation: await reservation.populate([
            { path: 'passagerId', select: 'nom prenom telephone photoProfil scoreConfiance' },
            { path: 'trajetId', select: 'pointDepart pointArrivee dateDepart heureDepart' }
          ]),
          conversationId: conversation._id,
          message: `${socket.user.nom} a réservé ${nombrePlacesReservees} place(s) dans votre trajet`,
          automatic: true
        });

        socket.emit('reservationConfirmed', {
          reservation,
          conversationId: conversation._id,
          message: 'Réservation confirmée automatiquement!',
          conducteur: trajet.conducteurId
        });

        console.log(`✅ Réservation automatiquement confirmée: ${reservation._id}`);

      } else {
        // Validation manuelle - notifier le conducteur
        io.to(`user_${trajet.conducteurId._id}`).emit('newReservationRequest', {
          reservation: await reservation.populate([
            { path: 'passagerId', select: 'nom prenom telephone photoProfil scoreConfiance nombreTrajetsEffectues noteGenerale' },
            { path: 'trajetId', select: 'pointDepart pointArrivee dateDepart heureDepart prixParPassager' }
          ]),
          message: `${socket.user.nom} demande à réserver ${nombrePlacesReservees} place(s) dans votre trajet`
        });

        socket.emit('reservationCreated', {
          reservation,
          message: 'Demande de réservation envoyée. Vous recevrez une notification dès que le conducteur répond.',
          conducteur: trajet.conducteurId
        });

        console.log(`📋 Nouvelle demande de réservation: ${reservation._id}`);
      }

    } catch (error) {
      console.error('Erreur makeReservation:', error);
      socket.emit('error', { 
        type: 'RESERVATION_ERROR',
        message: 'Erreur lors de la création de la réservation' 
      });
    }
  });

  // Accepter une demande de réservation
  socket.on('acceptReservation', async (data) => {
    try {
      const { reservationId } = data;

      const reservation = await Reservation.findById(reservationId)
        .populate('passagerId', 'nom prenom telephone photoProfil')
        .populate('trajetId');

      if (!reservation) {
        socket.emit('error', { 
          type: 'RESERVATION_ERROR',
          message: 'Réservation non trouvée' 
        });
        return;
      }

      // Vérifier que c'est bien le conducteur qui accepte
      if (reservation.trajetId.conducteurId.toString() !== socket.userId) {
        socket.emit('error', { 
          type: 'RESERVATION_ERROR',
          message: 'Non autorisé à accepter cette réservation' 
        });
        return;
      }

      if (reservation.statutReservation !== 'EN_ATTENTE') {
        socket.emit('error', { 
          type: 'RESERVATION_ERROR',
          message: 'Cette réservation a déjà été traitée' 
        });
        return;
      }

      // Vérifier encore la disponibilité des places
      const trajet = await Trajet.findById(reservation.trajetId._id);
      if (trajet.nombrePlacesDisponibles < reservation.nombrePlacesReservees) {
        socket.emit('error', { 
          type: 'RESERVATION_ERROR',
          message: 'Plus assez de places disponibles' 
        });
        return;
      }

      // Confirmer la réservation
      reservation.statutReservation = 'CONFIRMEE';
      reservation.dateConfirmation = new Date();
      await reservation.save();

      // Mettre à jour les places disponibles
      await Trajet.findByIdAndUpdate(reservation.trajetId._id, {
        $inc: { nombrePlacesDisponibles: -reservation.nombrePlacesReservees }
      });

      // Créer ou récupérer la conversation
      let conversation = await Conversation.findOne({
        trajetId: reservation.trajetId._id,
        participants: { $all: [socket.userId, reservation.passagerId._id] }
      });

      if (!conversation) {
        conversation = new Conversation({
          trajetId: reservation.trajetId._id,
          participants: [socket.userId, reservation.passagerId._id]
        });
        await conversation.save();
      }

      // Notifier le passager
      io.to(`user_${reservation.passagerId._id}`).emit('reservationAccepted', {
        reservation,
        conversationId: conversation._id,
        message: `${socket.user.nom} a accepté votre réservation!`,
        conducteur: {
          nom: socket.user.nom,
          prenom: socket.user.prenom,
          telephone: socket.user.telephone
        }
      });

      socket.emit('reservationAcceptConfirmed', {
        reservationId,
        conversationId: conversation._id,
        passager: reservation.passagerId
      });

      console.log(`✅ Réservation acceptée: ${reservationId} par ${socket.user.nom}`);

    } catch (error) {
      console.error('Erreur acceptReservation:', error);
      socket.emit('error', { 
        type: 'RESERVATION_ERROR',
        message: 'Erreur lors de l\'acceptation de la réservation' 
      });
    }
  });

  // Refuser une demande de réservation
  socket.on('rejectReservation', async (data) => {
    try {
      const { reservationId, motifRefus } = data;

      const reservation = await Reservation.findById(reservationId)
        .populate('passagerId', 'nom prenom')
        .populate('trajetId');

      if (!reservation) {
        socket.emit('error', { 
          type: 'RESERVATION_ERROR',
          message: 'Réservation non trouvée' 
        });
        return;
      }

      // Vérifier que c'est bien le conducteur qui refuse
      if (reservation.trajetId.conducteurId.toString() !== socket.userId) {
        socket.emit('error', { 
          type: 'RESERVATION_ERROR',
          message: 'Non autorisé à refuser cette réservation' 
        });
        return;
      }

      if (reservation.statutReservation !== 'EN_ATTENTE') {
        socket.emit('error', { 
          type: 'RESERVATION_ERROR',
          message: 'Cette réservation a déjà été traitée' 
        });
        return;
      }

      // Refuser la réservation
      reservation.statutReservation = 'REFUSEE';
      reservation.motifRefus = motifRefus || 'Aucun motif spécifié';
      await reservation.save();

      // Notifier le passager
      io.to(`user_${reservation.passagerId._id}`).emit('reservationRejected', {
        reservation,
        motifRefus: reservation.motifRefus,
        message: `${socket.user.nom} a refusé votre demande de réservation`,
        conducteur: {
          nom: socket.user.nom,
          prenom: socket.user.prenom
        }
      });

      socket.emit('reservationRejectConfirmed', {
        reservationId,
        passager: reservation.passagerId
      });

      console.log(`❌ Réservation refusée: ${reservationId} par ${socket.user.nom}`);

    } catch (error) {
      console.error('Erreur rejectReservation:', error);
      socket.emit('error', { 
        type: 'RESERVATION_ERROR',
        message: 'Erreur lors du refus de la réservation' 
      });
    }
  });

  // Annuler une réservation (par le passager)
  socket.on('cancelReservation', async (data) => {
    try {
      const { reservationId, motifAnnulation } = data;

      const reservation = await Reservation.findById(reservationId)
        .populate('trajetId');

      if (!reservation) {
        socket.emit('error', { 
          type: 'RESERVATION_ERROR',
          message: 'Réservation non trouvée' 
        });
        return;
      }

      // Vérifier que c'est bien le passager qui annule
      if (reservation.passagerId.toString() !== socket.userId) {
        socket.emit('error', { 
          type: 'RESERVATION_ERROR',
          message: 'Non autorisé à annuler cette réservation' 
        });
        return;
      }

      if (!['EN_ATTENTE', 'CONFIRMEE'].includes(reservation.statutReservation)) {
        socket.emit('error', { 
          type: 'RESERVATION_ERROR',
          message: 'Cette réservation ne peut plus être annulée' 
        });
        return;
      }

      // Vérifier les conditions d'annulation (par exemple, délai minimum)
      const maintenant = new Date();
      const dateDepart = new Date(reservation.trajetId.dateDepart);
      const heuresAvantDepart = (dateDepart - maintenant) / (1000 * 60 * 60);

      if (heuresAvantDepart < 2) { // Moins de 2h avant le départ
        socket.emit('error', { 
          type: 'RESERVATION_ERROR',
          message: 'Annulation impossible : moins de 2h avant le départ' 
        });
        return;
      }

      // Annuler la réservation
      const ancienStatut = reservation.statutReservation;
      reservation.statutReservation = 'ANNULEE';
      reservation.motifRefus = motifAnnulation || 'Annulée par le passager';
      await reservation.save();

      // Si la réservation était confirmée, libérer les places
      if (ancienStatut === 'CONFIRMEE') {
        await Trajet.findByIdAndUpdate(reservation.trajetId._id, {
          $inc: { nombrePlacesDisponibles: reservation.nombrePlacesReservees }
        });
      }

      // Notifier le conducteur
      io.to(`user_${reservation.trajetId.conducteurId}`).emit('reservationCanceled', {
        reservation,
        motifAnnulation: reservation.motifRefus,
        message: `${socket.user.nom} a annulé sa réservation`,
        placesLiberees: reservation.nombrePlacesReservees,
        passager: {
          nom: socket.user.nom,
          prenom: socket.user.prenom
        }
      });

      socket.emit('reservationCancelConfirmed', {
        reservationId,
        message: 'Réservation annulée avec succès',
        placesLiberees: ancienStatut === 'CONFIRMEE' ? reservation.nombrePlacesReservees : 0
      });

      console.log(`🚫 Réservation annulée: ${reservationId} par ${socket.user.nom}`);

    } catch (error) {
      console.error('Erreur cancelReservation:', error);
      socket.emit('error', { 
        type: 'RESERVATION_ERROR',
        message: 'Erreur lors de l\'annulation de la réservation' 
      });
    }
  });

  // Modifier une réservation existante
  socket.on('modifyReservation', async (data) => {
    try {
      const { 
        reservationId, 
        nouveauNombrePlaces, 
        nouveauPointPriseEnCharge, 
        nouveauPointDepose,
        nouveauxBagages 
      } = data;

      const reservation = await Reservation.findById(reservationId)
        .populate('trajetId');

      if (!reservation) {
        socket.emit('error', { 
          type: 'RESERVATION_ERROR',
          message: 'Réservation non trouvée' 
        });
        return;
      }

      // Vérifier que c'est bien le passager propriétaire
      if (reservation.passagerId.toString() !== socket.userId) {
        socket.emit('error', { 
          type: 'RESERVATION_ERROR',
          message: 'Non autorisé à modifier cette réservation' 
        });
        return;
      }

      if (reservation.statutReservation !== 'CONFIRMEE') {
        socket.emit('error', { 
          type: 'RESERVATION_ERROR',
          message: 'Seules les réservations confirmées peuvent être modifiées' 
        });
        return;
      }

      // Calculer la différence de places si modification du nombre
      let differencePlaces = 0;
      if (nouveauNombrePlaces && nouveauNombrePlaces !== reservation.nombrePlacesReservees) {
        differencePlaces = nouveauNombrePlaces - reservation.nombrePlacesReservees;
        
        // Vérifier la disponibilité si on augmente le nombre de places
        if (differencePlaces > 0) {
          const trajet = await Trajet.findById(reservation.trajetId._id);
          if (trajet.nombrePlacesDisponibles < differencePlaces) {
            socket.emit('error', { 
              type: 'RESERVATION_ERROR',
              message: `Seulement ${trajet.nombrePlacesDisponibles} place(s) supplémentaire(s) disponible(s)` 
            });
            return;
          }
        }
      }

      // Sauvegarder les anciennes données pour notification
      const ancienneReservation = {
        nombrePlacesReservees: reservation.nombrePlacesReservees,
        pointPriseEnCharge: reservation.pointPriseEnCharge,
        pointDepose: reservation.pointDepose,
        bagages: reservation.bagages
      };

      // Appliquer les modifications
      const modifications = {};
      let hasChanges = false;

      if (nouveauNombrePlaces && nouveauNombrePlaces !== reservation.nombrePlacesReservees) {
        modifications.nombrePlacesReservees = nouveauNombrePlaces;
        modifications.montantTotal = reservation.trajetId.prixParPassager * nouveauNombrePlaces;
        hasChanges = true;
      }

      if (nouveauPointPriseEnCharge) {
        modifications.pointPriseEnCharge = nouveauPointPriseEnCharge;
        hasChanges = true;
      }

      if (nouveauPointDepose) {
        modifications.pointDepose = nouveauPointDepose;
        hasChanges = true;
      }

      if (nouveauxBagages) {
        modifications.bagages = nouveauxBagages;
        hasChanges = true;
      }

      if (!hasChanges) {
        socket.emit('error', { 
          type: 'RESERVATION_ERROR',
          message: 'Aucune modification détectée' 
        });
        return;
      }

      // Mettre à jour la réservation
      await Reservation.findByIdAndUpdate(reservationId, modifications);

      // Mettre à jour les places disponibles si nécessaire
      if (differencePlaces !== 0) {
        await Trajet.findByIdAndUpdate(reservation.trajetId._id, {
          $inc: { nombrePlacesDisponibles: -differencePlaces }
        });
      }

      // Notifier le conducteur des modifications
      io.to(`user_${reservation.trajetId.conducteurId}`).emit('reservationModified', {
        reservationId,
        passager: {
          nom: socket.user.nom,
          prenom: socket.user.prenom
        },
        modifications,
        ancienneReservation,
        differencePlaces,
        message: `${socket.user.nom} a modifié sa réservation`
      });

      socket.emit('reservationModifyConfirmed', {
        reservationId,
        modifications,
        message: 'Réservation modifiée avec succès'
      });

      console.log(`✏️ Réservation modifiée: ${reservationId} par ${socket.user.nom}`);

    } catch (error) {
      console.error('Erreur modifyReservation:', error);
      socket.emit('error', { 
        type: 'RESERVATION_ERROR',
        message: 'Erreur lors de la modification de la réservation' 
      });
    }
  });

  // Obtenir les réservations en attente (pour les conducteurs)
  socket.on('getPendingReservations', async () => {
    try {
      // Récupérer tous les trajets du conducteur avec des réservations en attente
      const trajetsAvecReservations = await Trajet.find({
        conducteurId: socket.userId,
        statutTrajet: 'PROGRAMME'
      }).populate({
        path: 'reservations',
        match: { statutReservation: 'EN_ATTENTE' },
        populate: {
          path: 'passagerId',
          select: 'nom prenom telephone photoProfil scoreConfiance nombreTrajetsEffectues noteGenerale'
        }
      });

      const reservationsEnAttente = [];
      trajetsAvecReservations.forEach(trajet => {
        if (trajet.reservations && trajet.reservations.length > 0) {
          reservationsEnAttente.push(...trajet.reservations);
        }
      });

      socket.emit('pendingReservations', reservationsEnAttente);

    } catch (error) {
      console.error('Erreur getPendingReservations:', error);
      socket.emit('error', { 
        type: 'RESERVATION_ERROR',
        message: 'Erreur lors de la récupération des réservations en attente' 
      });
    }
  });

  // Obtenir l'historique des réservations de l'utilisateur
  socket.on('getMyReservations', async (data) => {
    try {
      const { type = 'all', page = 1, limit = 20 } = data; // type: 'passager', 'conducteur', 'all'
      const skip = (page - 1) * limit;

      let query = {};
      
      if (type === 'passager') {
        query = { passagerId: socket.userId };
      } else if (type === 'conducteur') {
        // Pour les réservations en tant que conducteur, on passe par les trajets
        const trajets = await Trajet.find({ conducteurId: socket.userId }).select('_id');
        const trajetIds = trajets.map(t => t._id);
        query = { trajetId: { $in: trajetIds } };
      } else {
        // Toutes les réservations (passager + conducteur)
        const trajets = await Trajet.find({ conducteurId: socket.userId }).select('_id');
        const trajetIds = trajets.map(t => t._id);
        query = {
          $or: [
            { passagerId: socket.userId },
            { trajetId: { $in: trajetIds } }
          ]
        };
      }

      const reservations = await Reservation.find(query)
        .populate('passagerId', 'nom prenom photoProfil')
        .populate({
          path: 'trajetId',
          populate: {
            path: 'conducteurId',
            select: 'nom prenom photoProfil'
          }
        })
        .sort({ dateReservation: -1 })
        .skip(skip)
        .limit(limit);

      const total = await Reservation.countDocuments(query);

      socket.emit('myReservations', {
        reservations,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        },
        type
      });

    } catch (error) {
      console.error('Erreur getMyReservations:', error);
      socket.emit('error', { 
        type: 'RESERVATION_ERROR',
        message: 'Erreur lors de la récupération de l\'historique' 
      });
    }
  });

  // Marquer une réservation comme "passager à bord"
  socket.on('markPassengerOnBoard', async (data) => {
    try {
      const { reservationId } = data;

      const reservation = await Reservation.findById(reservationId)
        .populate('passagerId', 'nom prenom fcmTokens')
        .populate('trajetId');

      if (!reservation) {
        socket.emit('error', { 
          type: 'RESERVATION_ERROR',
          message: 'Réservation non trouvée' 
        });
        return;
      }

      // Vérifier que c'est bien le conducteur
      if (reservation.trajetId.conducteurId.toString() !== socket.userId) {
        socket.emit('error', { 
          type: 'RESERVATION_ERROR',
          message: 'Seul le conducteur peut confirmer la prise en charge' 
        });
        return;
      }

      if (reservation.statutReservation !== 'CONFIRMEE') {
        socket.emit('error', { 
          type: 'RESERVATION_ERROR',
          message: 'Cette réservation n\'est pas confirmée' 
        });
        return;
      }

      // Mettre à jour le statut (vous pouvez ajouter un champ spécifique)
      // Pour l'instant on utilise les notes ou on peut ajouter un champ passengerOnBoard
      await Reservation.findByIdAndUpdate(reservationId, {
        passengerPickedUp: true,
        pickupTime: new Date()
      });

      // Notifier le passager via Socket.IO
      io.to(`user_${reservation.passagerId._id}`).emit('pickedUpConfirmed', {
        reservationId,
        message: 'Le conducteur a confirmé votre prise en charge',
        pickupTime: new Date()
      });

      // Notifier via FCM
      const firebaseService = require('../../services/firebaseService');
      if (reservation.passagerId?.fcmTokens?.length > 0) {
        await firebaseService.sendToMultipleTokens(
          reservation.passagerId.fcmTokens,
          {
            title: 'Prise en charge confirmée 🚗',
            body: 'Le conducteur a confirmé votre montée à bord',
            data: {
              type: 'PASSENGER_PICKUP',
              reservationId: reservationId.toString(),
              trajetId: reservation.trajetId._id.toString(),
              screen: 'ActiveTripPassenger'
            }
          },
          { channelId: 'reservations' }
        );
      }

      socket.emit('pickupConfirmed', {
        reservationId,
        passager: reservation.passagerId.nom
      });

      console.log(`🚗 Passager pris en charge: ${reservation.passagerId.nom} pour réservation ${reservationId}`);

    } catch (error) {
      console.error('Erreur markPassengerOnBoard:', error);
      socket.emit('error', { 
        type: 'RESERVATION_ERROR',
        message: 'Erreur lors de la confirmation de prise en charge' 
      });
    }
  });

  // 🆕 Confirmer prise en charge (alias plus explicite)
  socket.on('confirmPickup', async (data) => {
    // Réutiliser la logique de markPassengerOnBoard
    socket.emit('markPassengerOnBoard', data);
  });

  console.log(`📋 Reservation handler initialisé pour ${socket.user.nom}`);
};