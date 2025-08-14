const mongoose = require('mongoose');
const Reservation = require('../models/Reservation');
const Trajet = require('../models/Trajet');
//const PaiementService = require('../services/paiementService');
const AppError = require('../utils/AppError');

class ReservationController {
  /**
   * Créer une réservation
   */
  static async creerReservation(req, res, next) {
    try {
      const {
        trajetId,
        passagerId,
        nombrePlaces,
        pointPriseEnCharge,
        pointDepose,
        commentaire
      } = req.body;

      // Vérifier si le trajet existe et a des places disponibles
      const trajet = await Trajet.findById(trajetId);
      if (!trajet) {
        return res.status(404).json({ error: 'Trajet non trouvé' });
      }
      if (trajet.nombrePlacesDisponibles < nombrePlaces) {
        return res.status(400).json({ error: 'Pas assez de places disponibles' });
      }

      // Calculer le montant total
      const montantTotal = trajet.prixParPassager * nombrePlaces;

      // Créer la réservation
      const reservation = new Reservation({
        trajetId,
        passagerId: passagerId || req.user?.id,
        nombrePlaces,
        pointPriseEnCharge: {
          nom: pointPriseEnCharge.nom,
          coordonnees: {
            type: 'Point',
            coordinates: pointPriseEnCharge.coordinates || [0, 0]
          }
        },
        pointDepose: {
          nom: pointDepose.nom,
          coordonnees: {
            type: 'Point',
            coordinates: pointDepose.coordinates || [0, 0]
          }
        },
        montantTotal,
        commentaire,
        statutReservation: 'EN_ATTENTE',
        statutPaiement: 'EN_ATTENTE',
        dateReservation: new Date(),
        notificationsPrevues: [
          {
            type: 'RAPPEL_DEPART',
            heureEnvoi: new Date(trajet.dateDepart.getTime() - 2 * 60 * 60 * 1000), // 2h avant
            envoye: false
          },
          {
            type: 'CONDUCTEUR_PROCHE',
            heureEnvoi: new Date(trajet.dateDepart.getTime() - 30 * 60 * 1000), // 30min avant
            envoye: false
          }
        ]
      });

      await reservation.save();

      // Mettre à jour le nombre de places disponibles
      trajet.nombrePlacesDisponibles -= nombrePlaces;
      await trajet.save();

      res.status(201).json({
        success: true,
        message: 'Réservation créée avec succès',
        data: reservation
      });
    } catch (error) {
      console.error('Erreur lors de la création de la réservation:', error);
      return next(AppError.serverError('Erreur serveur lors de la création de la réservation', { originalError: error.message }));
    }
  }

  /**
   * Lister les réservations
   */
  static async obtenirReservations(req, res, next) {
    try {
      const { page = 1, limit = 10, statut, userId } = req.query;
      const skip = (page - 1) * limit;
      const filtres = {};
      if (statut) filtres.statutReservation = statut;
      if (userId) filtres.passagerId = userId;

      const reservations = await Reservation.find(filtres)
        .populate('trajetId', 'pointDepart pointArrivee dateDepart heureDepart prixParPassager')
        .populate('passagerId', 'nom prenom email telephone')
        .skip(skip)
        .limit(parseInt(limit))
        .sort({ dateReservation: -1 });

      const total = await Reservation.countDocuments(filtres);

      res.json({
        success: true,
        data: reservations,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      console.error('Erreur lors de la récupération des réservations:', error);
      return next(AppError.serverError('Erreur serveur lors de la récupération des réservations', { originalError: error.message }));
    }
  }

  /**
   * Obtenir une réservation par ID
   */
  static async obtenirReservationParId(req, res, next) {
    try {
      const { id } = req.params;
      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ error: 'ID de réservation invalide' });
      }

      const reservation = await Reservation.findById(id)
        .populate('trajetId')
        .populate('passagerId', 'nom prenom email telephone');

      if (!reservation) {
        return res.status(404).json({ error: 'Réservation non trouvée' });
      }

      res.json({
        success: true,
        data: reservation
      });
    } catch (error) {
      console.error('Erreur lors de la récupération de la réservation:', error);
      return next(AppError.serverError('Erreur serveur lors de la récupération de la réservation', { originalError: error.message }));
    }
  }

  /**
   * Confirmer une réservation
   */
  static async confirmerReservation(req, res, next) {
    try {
      const { id } = req.params;
      const reservation = await Reservation.findById(id);

      if (!reservation) {
        return res.status(404).json({ error: 'Réservation non trouvée' });
      }

      if (reservation.statutReservation !== 'EN_ATTENTE') {
        return res.status(400).json({ error: 'Cette réservation ne peut pas être confirmée' });
      }

      reservation.statutReservation = 'CONFIRMEE';
      await reservation.save();

      res.json({
        success: true,
        message: 'Réservation confirmée avec succès',
        data: reservation
      });
    } catch (error) {
      console.error('Erreur lors de la confirmation de la réservation:', error);
      return next(AppError.serverError('Erreur serveur lors de la confirmation de la réservation', { originalError: error.message }));
    }
  }

  /**
   * Annuler une réservation
   */
  static async annulerReservation(req, res, next) {
    try {
      const { id } = req.params;
      const { motifAnnulation } = req.body;
      const reservation = await Reservation.findById(id).populate('trajetId');

      if (!reservation) {
        return res.status(404).json({ error: 'Réservation non trouvée' });
      }

      if (['TERMINEE', 'ANNULEE'].includes(reservation.statutReservation)) {
        return res.status(400).json({ error: 'Cette réservation ne peut pas être annulée' });
      }

      // Calculer le remboursement selon la politique
      const maintenant = new Date();
      const dateDepart = reservation.trajetId.dateDepart;
      const heuresRestantes = (dateDepart - maintenant) / (1000 * 60 * 60);

      let montantRemboursement = 0;
      let fraisAnnulation = 0;

      if (heuresRestantes > 24) {
        montantRemboursement = reservation.montantTotal; // Remboursement intégral
      } else if (heuresRestantes > 2) {
        fraisAnnulation = reservation.montantTotal * 0.1; // 10% de frais
        montantRemboursement = reservation.montantTotal - fraisAnnulation;
      } else {
        fraisAnnulation = reservation.montantTotal * 0.5; // 50% de frais
        montantRemboursement = reservation.montantTotal - fraisAnnulation;
      }

      reservation.statutReservation = 'ANNULEE';
      reservation.motifAnnulation = motifAnnulation;
      reservation.dateAnnulation = maintenant;
      reservation.montantRemboursement = montantRemboursement;
      reservation.fraisAnnulation = fraisAnnulation;
      await reservation.save();

      // Restaurer les places dans le trajet
      const trajet = reservation.trajetId;
      trajet.nombrePlacesDisponibles += reservation.nombrePlaces;
      await trajet.save();

      res.json({
        success: true,
        message: 'Réservation annulée avec succès',
        data: {
          reservation,
          montantRemboursement,
          fraisAnnulation
        }
      });
    } catch (error) {
      console.error('Erreur lors de l\'annulation de la réservation:', error);
      return next(AppError.serverError('Erreur serveur lors de l\'annulation de la réservation', { originalError: error.message }));
    }
  }

  /**
   * Mettre à jour le statut de paiement
   */
  static async mettreAJourStatutPaiement(req, res, next) {
    try {
      const { id } = req.params;
      const { statutPaiement, referencePaiement, methodePaiement } = req.body;
      const reservation = await Reservation.findById(id);

      if (!reservation) {
        return res.status(404).json({ error: 'Réservation non trouvée' });
      }

      reservation.statutPaiement = statutPaiement;
      if (referencePaiement) reservation.referencePaiement = referencePaiement;
      if (methodePaiement) reservation.methodePaiement = methodePaiement;
      await reservation.save();

      res.json({
        success: true,
        message: 'Statut de paiement mis à jour avec succès',
        data: reservation
      });
    } catch (error) {
      console.error('Erreur lors de la mise à jour du statut de paiement:', error);
      return next(AppError.serverError('Erreur serveur lors de la mise à jour du paiement', { originalError: error.message }));
    }
  }

  /**
   * Mettre à jour la position en temps réel
   */
  static async mettreAJourPosition(req, res, next) {
    try {
      const { id } = req.params;
      const { latitude, longitude } = req.body;

      if (!latitude || !longitude) {
        return res.status(400).json({ error: 'Coordonnées GPS requises' });
      }

      const reservation = await Reservation.findById(id);

      if (!reservation) {
        return res.status(404).json({ error: 'Réservation non trouvée' });
      }

      reservation.positionEnTempsReel = {
        coordonnees: {
          type: 'Point',
          coordinates: [parseFloat(longitude), parseFloat(latitude)]
        },
        lastUpdate: new Date()
      };

      await reservation.save();

      res.json({
        success: true,
        message: 'Position mise à jour avec succès'
      });
    } catch (error) {
      console.error('Erreur lors de la mise à jour de la position:', error);
      return next(AppError.serverError('Erreur serveur lors de la mise à jour de la position', { originalError: error.message }));
    }
  }

  /**
   * Obtenir les statistiques des réservations
   */
  static async obtenirStatistiques(req, res, next) {
    try {
      const { userId, periode } = req.query;
      let dateDebut;

      switch (periode) {
        case '7d':
          dateDebut = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          dateDebut = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
          break;
        case '90d':
          dateDebut = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
          break;
        default:
          dateDebut = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      }

      const filtres = { dateReservation: { $gte: dateDebut } };
      if (userId) filtres.passagerId = userId;

      const statistiques = await Reservation.aggregate([
        { $match: filtres },
        {
          $group: {
            _id: null,
            totalReservations: { $sum: 1 },
            reservationsConfirmees: {
              $sum: { $cond: [{ $eq: ['$statutReservation', 'CONFIRMEE'] }, 1, 0] }
            },
            reservationsTerminees: {
              $sum: { $cond: [{ $eq: ['$statutReservation', 'TERMINEE'] }, 1, 0] }
            },
            reservationsAnnulees: {
              $sum: { $cond: [{ $eq: ['$statutReservation', 'ANNULEE'] }, 1, 0] }
            },
            montantTotal: { $sum: '$montantTotal' },
            montantMoyen: { $avg: '$montantTotal' }
          }
        }
      ]);

      res.json({
        success: true,
        data: statistiques[0] || {
          totalReservations: 0,
          reservationsConfirmees: 0,
          reservationsTerminees: 0,
          reservationsAnnulees: 0,
          montantTotal: 0,
          montantMoyen: 0
        },
        periode
      });
    } catch (error) {
      console.error('Erreur lors de la récupération des statistiques:', error);
      return next(AppError.serverError('Erreur serveur lors de la récupération des statistiques', { originalError: error.message }));
    }
  }
}

module.exports = ReservationController;
