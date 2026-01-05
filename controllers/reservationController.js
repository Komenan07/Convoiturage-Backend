const mongoose = require('mongoose');
const { validationResult } = require('express-validator');
const Reservation = require('../models/Reservation');
const Trajet = require('../models/Trajet');
//const Utilisateur = require('../models/Utilisateur');
const AppError = require('../utils/AppError');
const notificationService = require('../services/notificationService');

// Fonctions utilitaires
const validerDonnees = (req) => {
  const erreurs = validationResult(req);
  if (!erreurs.isEmpty()) {
    return {
      success: false,
      message: 'Données invalides',
      erreurs: erreurs.array(),
      code: 'VALIDATION_ERROR'
    };
  }
  return null;
};

const calculerMontantTotal = (trajet, nombrePlaces) => {
  return trajet.prixParPassager * nombrePlaces;
};

class ReservationController {
  /**
   * Créer une réservation
   */
  static async creerReservation(req, res, next) {
    try {
      // Vérification de l'authentification
      if (!req.user || (!req.user._id && !req.user.id && !req.user.userId)) {
        return res.status(401).json({
          success: false,
          message: 'Utilisateur non authentifié',
          code: 'UNAUTHORIZED'
        });
      }

      const erreurValidation = validerDonnees(req);
      if (erreurValidation) {
        return res.status(400).json(erreurValidation);
      }

      const currentUserId = req.user._id || req.user.id || req.user.userId;
      const {
        trajetId,
        nombrePlacesReservees,
        pointPriseEnCharge,
        pointDepose,
        bagages
      } = req.body;

      console.log('=== CREATION RESERVATION ===');
      console.log('Utilisateur:', currentUserId);
      console.log('Trajet:', trajetId);

      // Vérifier que l'utilisateur n'essaie pas de réserver son propre trajet
      const trajet = await Trajet.findById(trajetId).populate('conducteurId');
      if (!trajet) {
        return res.status(404).json({
          success: false,
          message: 'Trajet introuvable',
          code: 'TRAJET_NOT_FOUND'
        });
      }

      if (trajet.conducteurId._id.toString() === currentUserId.toString()) {
        return res.status(400).json({
          success: false,
          message: 'Vous ne pouvez pas réserver votre propre trajet',
          code: 'SELF_BOOKING_NOT_ALLOWED'
        });
      }

      // Vérifier si l'utilisateur a déjà une réservation pour ce trajet
      const reservationExistante = await Reservation.findOne({
        trajetId,
        passagerId: currentUserId,
        statutReservation: { $in: ['EN_ATTENTE', 'CONFIRMEE'] }
      });

      if (reservationExistante) {
        return res.status(409).json({
          success: false,
          message: 'Vous avez déjà une réservation pour ce trajet',
          code: 'RESERVATION_EXISTS'
        });
      }

      // Vérifier la disponibilité des places
      const disponibilite = await Reservation.verifierDisponibilite(trajetId, nombrePlacesReservees);
      if (!disponibilite.disponible) {
        return res.status(400).json({
          success: false,
          message: `Pas assez de places disponibles. Places restantes: ${disponibilite.placesDisponibles}`,
          code: 'INSUFFICIENT_SEATS'
        });
      }

      // Calculer le montant total
      const montantTotal = calculerMontantTotal(trajet, nombrePlacesReservees);

      // Créer la réservation
      const nouvelleReservation = new Reservation({
        trajetId,
        passagerId: currentUserId,
        nombrePlacesReservees,
        pointPriseEnCharge: {
          nom: pointPriseEnCharge.nom,
          adresse: pointPriseEnCharge.adresse,
          coordonnees: {
            type: 'Point',
            coordinates: pointPriseEnCharge.coordonnees || [0, 0]
          }
        },
        pointDepose: {
          nom: pointDepose.nom,
          adresse: pointDepose.adresse,
          coordonnees: {
            type: 'Point',
            coordinates: pointDepose.coordonnees || [0, 0]
          }
        },
        montantTotal,
        bagages: bagages || {},
        statutReservation: 'EN_ATTENTE',
        statutPaiement: 'EN_ATTENTE',
        methodePaiement: req.body.methodePaiement || 'ESPCES'
      });

      await nouvelleReservation.save();
      console.log('Réservation créée:', nouvelleReservation._id);

      // Population pour la réponse
      await nouvelleReservation.populate([
        {
          path: 'trajetId',
          select: 'pointDepart pointArrivee dateDepart heureDepart prix conducteurId',
          populate: {
            path: 'conducteurId',
            select: 'nom prenom photoProfil noteGenerale'
          }
        },
        { path: 'passagerId', select: 'nom prenom email photoProfil' }
      ]);

      res.status(201).json({
        success: true,
        message: 'Réservation créée avec succès',
        data: {
          reservation: nouvelleReservation
        }
      });

    } catch (error) {
      console.error('Erreur création réservation:', error);
      return next(AppError.serverError('Erreur serveur lors de la création de la réservation', { originalError: error.message }));
    }
  }

  /**
   * Obtenir les réservations avec filtres
   */
  static async obtenirReservations(req, res, next) {
    try {
      const erreurValidation = validerDonnees(req);
      if (erreurValidation) {
        return res.status(400).json(erreurValidation);
      }

      const page = parseInt(req.query.page) || 1;
      const limite = parseInt(req.query.limite) || 20;
      const skip = (page - 1) * limite;
      const currentUserId = req.user._id || req.user.id || req.user.userId;

      let filtres = {};

      // Filtrage par utilisateur (passager uniquement sauf pour admin)
      if (req.query.userId) {
        if (req.user.role === 'ADMIN' || req.query.userId === currentUserId.toString()) {
          filtres.passagerId = req.query.userId;
        } else {
          return res.status(403).json({
            success: false,
            message: 'Non autorisé à voir ces réservations',
            code: 'UNAUTHORIZED'
          });
        }
      }

      // Filtres additionnels
      if (req.query.statut) {
        const statuts = req.query.statut.split(',');
        filtres.statutReservation = { $in: statuts };
      }

      if (req.query.trajetId) {
        filtres.trajetId = req.query.trajetId;
      }

      if (req.query.dateDebut && req.query.dateFin) {
        filtres.dateReservation = {
          $gte: new Date(req.query.dateDebut),
          $lte: new Date(req.query.dateFin)
        };
      }

      const [reservations, total] = await Promise.all([
        Reservation.find(filtres)
          .populate({
            path: 'trajetId',
            select: 'pointDepart pointArrivee dateDepart heureDepart prix conducteurId',
            populate: {
              path: 'conducteurId',
              select: 'nom prenom photoProfil noteGenerale'
            }
          })
          .populate('passagerId', 'nom prenom email photoProfil noteGenerale')
          .sort({ dateReservation: -1 })
          .skip(skip)
          .limit(limite),
        Reservation.countDocuments(filtres)
      ]);

      res.json({
        success: true,
        data: {
          reservations,
          pagination: {
            page,
            limite,
            total,
            pages: Math.ceil(total / limite)
          }
        }
      });

    } catch (error) {
      console.error('Erreur récupération réservations:', error);
      return next(AppError.serverError('Erreur serveur lors de la récupération des réservations', { originalError: error.message }));
    }
  }

  /**
   * Obtenir une réservation par ID
   */
  static async obtenirReservationParId(req, res, next) {
    try {
      const { id } = req.params;
      const currentUserId = req.user._id || req.user.id || req.user.userId;

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: 'ID de réservation invalide',
          code: 'INVALID_ID'
        });
      }

      const reservation = await Reservation.findById(id)
        .populate({
          path: 'trajetId',
          populate: {
            path: 'conducteurId',
            select: 'nom prenom photoProfil noteGenerale telephone'
          }
        })
        .populate('passagerId', 'nom prenom email photoProfil telephone');

      if (!reservation) {
        return res.status(404).json({
          success: false,
          message: 'Réservation introuvable',
          code: 'RESERVATION_NOT_FOUND'
        });
      }

      // Vérifier les droits d'accès
      const estProprietaire = reservation.passagerId._id.toString() === currentUserId.toString();
      const estConducteur = reservation.trajetId.conducteurId._id.toString() === currentUserId.toString();
      const estAdmin = req.user.role === 'ADMIN';

      if (!estProprietaire && !estConducteur && !estAdmin) {
        return res.status(403).json({
          success: false,
          message: 'Non autorisé à accéder à cette réservation',
          code: 'ACCESS_DENIED'
        });
      }

      res.json({
        success: true,
        data: {
          reservation
        }
      });

    } catch (error) {
      console.error('Erreur récupération réservation:', error);
      return next(AppError.serverError('Erreur serveur lors de la récupération de la réservation', { originalError: error.message }));
    }
  }

  /**
   * Confirmer une réservation (par le conducteur)
   */
  static async confirmerReservation(req, res, next) {
    try {
      const { id } = req.params;
      const currentUserId = req.user._id || req.user.id || req.user.userId;

      const reservation = await Reservation.findById(id)
        .populate('trajetId')
        .populate('passagerId', 'nom prenom email');

      if (!reservation) {
        return res.status(404).json({
          success: false,
          message: 'Réservation introuvable',
          code: 'RESERVATION_NOT_FOUND'
        });
      }

      // Vérifier que c'est le conducteur qui confirme
      if (reservation.trajetId.conducteurId.toString() !== currentUserId.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Seul le conducteur peut confirmer cette réservation',
          code: 'UNAUTHORIZED'
        });
      }

      if (reservation.statutReservation !== 'EN_ATTENTE') {
        return res.status(400).json({
          success: false,
          message: 'Cette réservation ne peut plus être confirmée',
          code: 'INVALID_STATUS'
        });
      }

      reservation.statutReservation = 'CONFIRMEE';
      reservation.dateConfirmation = new Date();
      await reservation.save();

      // Programmer les notifications automatiques
      await reservation.programmerNotifications();

      // Notifier le passager
      try {
        await notificationService.notifierConfirmationReservation(reservation);
      } catch (notifError) {
        console.error('Erreur notification:', notifError);
      }

      res.json({
        success: true,
        message: 'Réservation confirmée avec succès',
        data: {
          reservation
        }
      });

    } catch (error) {
      console.error('Erreur confirmation réservation:', error);
      return next(AppError.serverError('Erreur serveur lors de la confirmation', { originalError: error.message }));
    }
  }

  /**
   * Refuser une réservation (par le conducteur)
   */
  static async refuserReservation(req, res, next) {
    try {
      const { id } = req.params;
      const { motifRefus } = req.body;
      const currentUserId = req.user._id || req.user.id || req.user.userId;

      const reservation = await Reservation.findById(id)
        .populate('trajetId')
        .populate('passagerId', 'nom prenom email');

      if (!reservation) {
        return res.status(404).json({
          success: false,
          message: 'Réservation introuvable',
          code: 'RESERVATION_NOT_FOUND'
        });
      }

      // Vérifier que c'est le conducteur qui refuse
      if (reservation.trajetId.conducteurId.toString() !== currentUserId.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Seul le conducteur peut refuser cette réservation',
          code: 'UNAUTHORIZED'
        });
      }

      if (reservation.statutReservation !== 'EN_ATTENTE') {
        return res.status(400).json({
          success: false,
          message: 'Cette réservation ne peut plus être refusée',
          code: 'INVALID_STATUS'
        });
      }

      reservation.statutReservation = 'REFUSEE';
      reservation.motifRefus = motifRefus || 'Aucun motif spécifié';
      await reservation.save();

      // Notifier le passager
      try {
        await notificationService.notifierRefusReservation(reservation);
      } catch (notifError) {
        console.error('Erreur notification:', notifError);
      }

      res.json({
        success: true,
        message: 'Réservation refusée',
        data: {
          reservation
        }
      });

    } catch (error) {
      console.error('Erreur refus réservation:', error);
      return next(AppError.serverError('Erreur serveur lors du refus', { originalError: error.message }));
    }
  }

  /**
   * Annuler une réservation (par le passager)
   */
  static async annulerReservation(req, res, next) {
    try {
      const { id } = req.params;
      const { raisonAnnulation } = req.body;
      const currentUserId = req.user._id || req.user.id || req.user.userId;

      const reservation = await Reservation.findById(id)
        .populate('trajetId')
        .populate('passagerId', 'nom prenom email');

      if (!reservation) {
        return res.status(404).json({
          success: false,
          message: 'Réservation introuvable',
          code: 'RESERVATION_NOT_FOUND'
        });
      }

      // Vérifier que c'est le passager qui annule
      if (reservation.passagerId._id.toString() !== currentUserId.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Seul le passager peut annuler cette réservation',
          code: 'UNAUTHORIZED'
        });
      }

      if (!reservation.peutEtreAnnulee()) {
        return res.status(400).json({
          success: false,
          message: 'Cette réservation ne peut plus être annulée',
          code: 'CANNOT_CANCEL'
        });
      }

      // Calculer le remboursement
      const montantRemboursement = reservation.calculerRemboursement(reservation.trajetId.dateDepart);

      reservation.statutReservation = 'ANNULEE';
      reservation.raisonAnnulation = raisonAnnulation;
      reservation.montantRemboursement = montantRemboursement;
      await reservation.save();

      // Si remboursement nécessaire
      if (montantRemboursement > 0 && reservation.statutPaiement === 'PAYE') {
        reservation.statutPaiement = 'REMBOURSE';
        await reservation.save();
      }

      res.json({
        success: true,
        message: 'Réservation annulée avec succès',
        data: {
          reservation,
          montantRemboursement
        }
      });

    } catch (error) {
      console.error('Erreur annulation réservation:', error);
      return next(AppError.serverError('Erreur serveur lors de l\'annulation', { originalError: error.message }));
    }
  }

  /**
   * Mettre à jour le statut de paiement
   */
  static async mettreAJourStatutPaiement(req, res, next) {
    try {
      const { id } = req.params;
      const { statutPaiement, methodePaiement, referencePaiement } = req.body;

      const reservation = await Reservation.findById(id);

      if (!reservation) {
        return res.status(404).json({
          success: false,
          message: 'Réservation introuvable',
          code: 'RESERVATION_NOT_FOUND'
        });
      }

      reservation.statutPaiement = statutPaiement;
      if (methodePaiement) reservation.methodePaiement = methodePaiement;
      if (referencePaiement) reservation.referencePaiement = referencePaiement;

      if (statutPaiement === 'PAYE') {
        reservation.datePaiement = new Date();
      }

      await reservation.save();

      res.json({
        success: true,
        message: 'Statut de paiement mis à jour',
        data: {
          reservation
        }
      });

    } catch (error) {
      console.error('Erreur mise à jour paiement:', error);
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
      const currentUserId = req.user._id || req.user.id || req.user.userId;

      if (!latitude || !longitude) {
        return res.status(400).json({
          success: false,
          message: 'Coordonnées GPS requises (latitude et longitude)',
          code: 'MISSING_COORDINATES'
        });
      }

      const reservation = await Reservation.findById(id).populate('trajetId');

      if (!reservation) {
        return res.status(404).json({
          success: false,
          message: 'Réservation introuvable',
          code: 'RESERVATION_NOT_FOUND'
        });
      }

      // Vérifier que c'est le conducteur qui met à jour la position
      if (reservation.trajetId.conducteurId.toString() !== currentUserId.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Seul le conducteur peut mettre à jour la position',
          code: 'UNAUTHORIZED'
        });
      }

      await reservation.mettreAJourPosition([parseFloat(longitude), parseFloat(latitude)]);

      res.json({
        success: true,
        message: 'Position mise à jour avec succès'
      });

    } catch (error) {
      console.error('Erreur mise à jour position:', error);
      return next(AppError.serverError('Erreur serveur lors de la mise à jour de la position', { originalError: error.message }));
    }
  }

  /**
   * Marquer une réservation comme terminée
   */
  static async terminerReservation(req, res, next) {
    try {
      const { id } = req.params;
      const { notePassager, commentaire } = req.body;
      const currentUserId = req.user._id || req.user.id || req.user.userId;

      const reservation = await Reservation.findById(id)
        .populate('trajetId')
        .populate('passagerId', 'nom prenom');

      if (!reservation) {
        return res.status(404).json({
          success: false,
          message: 'Réservation introuvable',
          code: 'RESERVATION_NOT_FOUND'
        });
      }

      // Vérifier que c'est le conducteur qui termine
      if (reservation.trajetId.conducteurId.toString() !== currentUserId.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Seul le conducteur peut terminer cette réservation',
          code: 'UNAUTHORIZED'
        });
      }

      if (reservation.statutReservation !== 'CONFIRMEE') {
        return res.status(400).json({
          success: false,
          message: 'Cette réservation ne peut pas être terminée',
          code: 'INVALID_STATUS'
        });
      }

      reservation.statutReservation = 'TERMINEE';
      reservation.dateTerminaison = new Date();
      if (notePassager) reservation.notePassager = notePassager;
      if (commentaire) reservation.commentaireTrajet = commentaire;

      await reservation.save();

      res.json({
        success: true,
        message: 'Réservation terminée avec succès',
        data: {
          reservation
        }
      });

    } catch (error) {
      console.error('Erreur fin réservation:', error);
      return next(AppError.serverError('Erreur serveur lors de la finalisation', { originalError: error.message }));
    }
  }

  /**
   * Obtenir les statistiques de réservation
   */
  static async obtenirStatistiques(req, res, next) {
    try {
      const { userId, periode = '30d' } = req.query;
      const currentUserId = req.user._id || req.user.id || req.user.userId;

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
        case '1y':
          dateDebut = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
          break;
        default:
          dateDebut = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      }

      const filtres = { 
        dateReservation: { $gte: dateDebut }
      };

      if (userId) {
        if (req.user.role !== 'ADMIN' && userId !== currentUserId.toString()) {
          return res.status(403).json({
            success: false,
            message: 'Non autorisé à voir ces statistiques',
            code: 'UNAUTHORIZED'
          });
        }
        filtres.passagerId = userId;
      }

      const statistiques = await Reservation.aggregate([
        { $match: filtres },
        {
          $group: {
            _id: null,
            totalReservations: { $sum: 1 },
            reservationsEnAttente: {
              $sum: { $cond: [{ $eq: ['$statutReservation', 'EN_ATTENTE'] }, 1, 0] }
            },
            reservationsConfirmees: {
              $sum: { $cond: [{ $eq: ['$statutReservation', 'CONFIRMEE'] }, 1, 0] }
            },
            reservationsTerminees: {
              $sum: { $cond: [{ $eq: ['$statutReservation', 'TERMINEE'] }, 1, 0] }
            },
            reservationsAnnulees: {
              $sum: { $cond: [{ $eq: ['$statutReservation', 'ANNULEE'] }, 1, 0] }
            },
            reservationsRefusees: {
              $sum: { $cond: [{ $eq: ['$statutReservation', 'REFUSEE'] }, 1, 0] }
            },
            montantTotalReservations: { $sum: '$montantTotal' },
            montantMoyenReservation: { $avg: '$montantTotal' },
            totalPlacesReservees: { $sum: '$nombrePlacesReservees' }
          }
        }
      ]);

      const evolutionTemporelle = await Reservation.aggregate([
        { $match: filtres },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$dateReservation' }
            },
            count: { $sum: 1 },
            montant: { $sum: '$montantTotal' }
          }
        },
        { $sort: { '_id': 1 } }
      ]);

      res.json({
        success: true,
        data: {
          statistiques: statistiques[0] || {
            totalReservations: 0,
            reservationsEnAttente: 0,
            reservationsConfirmees: 0,
            reservationsTerminees: 0,
            reservationsAnnulees: 0,
            reservationsRefusees: 0,
            montantTotalReservations: 0,
            montantMoyenReservation: 0,
            totalPlacesReservees: 0
          },
          evolutionTemporelle,
          periode
        }
      });

    } catch (error) {
      console.error('Erreur statistiques:', error);
      return next(AppError.serverError('Erreur serveur lors de la récupération des statistiques', { originalError: error.message }));
    }
  }

  /**
   * Obtenir les réservations d'un trajet (pour le conducteur)
   */
  static async obtenirReservationsTrajet(req, res, next) {
    try {
      const { trajetId } = req.params;
      const currentUserId = req.user._id || req.user.id || req.user.userId;

      // Vérifier que le trajet existe et appartient au conducteur
      const trajet = await Trajet.findById(trajetId);
      if (!trajet) {
        return res.status(404).json({
          success: false,
          message: 'Trajet introuvable',
          code: 'TRAJET_NOT_FOUND'
        });
      }

      if (trajet.conducteurId.toString() !== currentUserId.toString() && req.user.role !== 'ADMIN') {
        return res.status(403).json({
          success: false,
          message: 'Non autorisé à voir ces réservations',
          code: 'UNAUTHORIZED'
        });
      }

      const reservations = await Reservation.obtenirReservationsTrajet(trajetId);

      // Calculer les places utilisées
      const placesReservees = reservations.reduce((total, reservation) => {
        if (['EN_ATTENTE', 'CONFIRMEE'].includes(reservation.statutReservation)) {
          return total + reservation.nombrePlacesReservees;
        }
        return total;
      }, 0);

      res.json({
        success: true,
        data: {
          reservations,
          resumé: {
            totalReservations: reservations.length,
            placesReservees,
            placesDisponibles: trajet.nombrePlacesTotal - placesReservees
          }
        }
      });

    } catch (error) {
      console.error('Erreur réservations trajet:', error);
      return next(AppError.serverError('Erreur serveur lors de la récupération des réservations du trajet', { originalError: error.message }));
    }
  }

  /**
   * Obtenir mes réservations (utilisateur connecté)
   */
  static async obtenirMesReservations(req, res, next) {
    try {
      const currentUserId = req.user._id || req.user.id || req.user.userId;
      const { statut, limite = 50 } = req.query;

      const options = { limite: parseInt(limite) };
      if (statut) options.statut = statut;

      const reservations = await Reservation.obtenirReservationsUtilisateur(currentUserId, options);

      res.json({
        success: true,
        data: {
          reservations
        }
      });

    } catch (error) {
      console.error('Erreur mes réservations:', error);
      return next(AppError.serverError('Erreur serveur lors de la récupération de vos réservations', { originalError: error.message }));
    }
  }

  /**
   * Vérifier la disponibilité d'un trajet
   */
  static async verifierDisponibilite(req, res, next) {
    try {
      const { trajetId } = req.params;
      const { nombrePlaces = 1 } = req.query;

      const disponibilite = await Reservation.verifierDisponibilite(trajetId, parseInt(nombrePlaces));

      res.json({
        success: true,
        data: disponibilite
      });

    } catch (error) {
      console.error('Erreur vérification disponibilité:', error);
      return next(AppError.serverError('Erreur serveur lors de la vérification de disponibilité', { originalError: error.message }));
    }
  }

  /**
   * Exécuter les notifications programmées (tâche automatisée)
   */
  static async executerNotificationsPrevues(req, res, next) {
    try {
      const { limite = 100 } = req.query;

      const resultats = await Reservation.executerNotificationsPrevues(parseInt(limite));

      res.json({
        success: true,
        message: 'Notifications programmées exécutées',
        data: {
          executed: resultats
        }
      });

    } catch (error) {
      console.error('Erreur exécution notifications:', error);
      return next(AppError.serverError('Erreur serveur lors de l\'exécution des notifications', { originalError: error.message }));
    }
  }

  /**
   * Calculer la distance d'une réservation
   */
  static async calculerDistanceReservation(req, res, next) {
    try {
      const { id } = req.params;

      const reservation = await Reservation.findById(id);

      if (!reservation) {
        return res.status(404).json({
          success: false,
          message: 'Réservation introuvable',
          code: 'RESERVATION_NOT_FOUND'
        });
      }

      const distance = reservation.calculerDistance();

      res.json({
        success: true,
        data: {
          distance: Math.round(distance * 100) / 100, // Arrondir à 2 décimales
          unite: 'km'
        }
      });

    } catch (error) {
      console.error('Erreur calcul distance:', error);
      return next(AppError.serverError('Erreur serveur lors du calcul de distance', { originalError: error.message }));
    }
  }

  /**
   * Calculer le remboursement potentiel
   */
  static async calculerRemboursement(req, res, next) {
    try {
      const { id } = req.params;
      const currentUserId = req.user._id || req.user.id || req.user.userId;

      const reservation = await Reservation.findById(id).populate('trajetId');

      if (!reservation) {
        return res.status(404).json({
          success: false,
          message: 'Réservation introuvable',
          code: 'RESERVATION_NOT_FOUND'
        });
      }

      // Vérifier que c'est le passager qui demande l'info
      if (reservation.passagerId.toString() !== currentUserId.toString() && req.user.role !== 'ADMIN') {
        return res.status(403).json({
          success: false,
          message: 'Non autorisé à accéder à ces informations',
          code: 'UNAUTHORIZED'
        });
      }

      const montantRemboursement = reservation.calculerRemboursement(reservation.trajetId.dateDepart);
      const peutEtreAnnulee = reservation.peutEtreAnnulee();
      
      // Calculer les frais d'annulation
      const fraisAnnulation = reservation.montantTotal - montantRemboursement;
      const pourcentageRemboursement = reservation.montantTotal > 0 
        ? (montantRemboursement / reservation.montantTotal * 100) 
        : 0;

      res.json({
        success: true,
        data: {
          peutEtreAnnulee,
          montantOriginal: reservation.montantTotal,
          montantRemboursement,
          fraisAnnulation,
          pourcentageRemboursement: Math.round(pourcentageRemboursement),
          devise: 'FCFA'
        }
      });

    } catch (error) {
      console.error('Erreur calcul remboursement:', error);
      return next(AppError.serverError('Erreur serveur lors du calcul de remboursement', { originalError: error.message }));
    }
  }

  /**
   * Obtenir l'historique des positions (pour le suivi en temps réel)
   */
  static async obtenirHistoriquePositions(req, res, next) {
    try {
      const { id } = req.params;
      const currentUserId = req.user._id || req.user.id || req.user.userId;

      const reservation = await Reservation.findById(id)
        .populate('trajetId')
        .populate('passagerId', 'nom prenom');

      if (!reservation) {
        return res.status(404).json({
          success: false,
          message: 'Réservation introuvable',
          code: 'RESERVATION_NOT_FOUND'
        });
      }

      // Vérifier les droits d'accès
      const estPassager = reservation.passagerId._id.toString() === currentUserId.toString();
      const estConducteur = reservation.trajetId.conducteurId.toString() === currentUserId.toString();
      const estAdmin = req.user.role === 'ADMIN';

      if (!estPassager && !estConducteur && !estAdmin) {
        return res.status(403).json({
          success: false,
          message: 'Non autorisé à accéder à ces informations',
          code: 'ACCESS_DENIED'
        });
      }

      res.json({
        success: true,
        data: {
          positionActuelle: reservation.positionEnTempsReel || null,
          statutReservation: reservation.statutReservation,
          trajetInfo: {
            dateDepart: reservation.trajetId.dateDepart,
            pointDepart: reservation.trajetId.pointDepart,
            pointArrivee: reservation.trajetId.pointArrivee
          }
        }
      });

    } catch (error) {
      console.error('Erreur historique positions:', error);
      return next(AppError.serverError('Erreur serveur lors de la récupération des positions', { originalError: error.message }));
    }
  }

  /**
   * Fonction utilitaire : Nettoyage des anciennes réservations
   */
  static async nettoyerAnciennesReservations(req, res, next) {
    try {
      // Supprimer les réservations annulées/refusées de plus de 90 jours
      const il90Jours = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

      const reservationsSupprimees = await Reservation.deleteMany({
        statutReservation: { $in: ['ANNULEE', 'REFUSEE'] },
        dateReservation: { $lt: il90Jours }
      });

      res.json({
        success: true,
        message: 'Nettoyage effectué avec succès',
        data: {
          reservationsSupprimees: reservationsSupprimees.deletedCount
        }
      });

    } catch (error) {
      console.error('Erreur nettoyage réservations:', error);
      return next(AppError.serverError('Erreur serveur lors du nettoyage', { originalError: error.message }));
    }
  }

  /**
   * Obtenir le rapport détaillé d'une réservation (pour admin/conducteur)
   */
  static async obtenirRapportReservation(req, res, next) {
    try {
      const { id } = req.params;
      const currentUserId = req.user._id || req.user.id || req.user.userId;

      const reservation = await Reservation.findById(id)
        .populate({
          path: 'trajetId',
          populate: {
            path: 'conducteurId',
            select: 'nom prenom email telephone noteGenerale nombreTrajetsEffectues'
          }
        })
        .populate('passagerId', 'nom prenom email telephone noteGenerale nombreReservations');

      if (!reservation) {
        return res.status(404).json({
          success: false,
          message: 'Réservation introuvable',
          code: 'RESERVATION_NOT_FOUND'
        });
      }

      // Vérifier les droits d'accès (admin ou conducteur seulement)
      const estConducteur = reservation.trajetId.conducteurId._id.toString() === currentUserId.toString();
      const estAdmin = req.user.role === 'ADMIN';

      if (!estConducteur && !estAdmin) {
        return res.status(403).json({
          success: false,
          message: 'Non autorisé à accéder à ce rapport',
          code: 'ACCESS_DENIED'
        });
      }

      // Calculer des métriques supplémentaires
      const distance = reservation.calculerDistance();
      const dureeReservation = reservation.dateConfirmation 
        ? (reservation.dateConfirmation - reservation.dateReservation) / (1000 * 60) // en minutes
        : null;

      const rapport = {
        reservation: reservation.toObject(),
        metriques: {
          distance,
          dureeReservation,
          rentabilite: reservation.montantTotal / Math.max(distance, 1), // FCFA par km
          tauxOccupation: (reservation.nombrePlacesReservees / reservation.trajetId.nombrePlacesTotal * 100).toFixed(2)
        },
        historique: {
          dateCreation: reservation.dateReservation,
          dateConfirmation: reservation.dateConfirmation,
          dateTerminaison: reservation.dateTerminaison || null
        }
      };

      res.json({
        success: true,
        data: rapport
      });

    } catch (error) {
      console.error('Erreur rapport réservation:', error);
      return next(AppError.serverError('Erreur serveur lors de la génération du rapport', { originalError: error.message }));
    }
  }

  /**
   * Route de diagnostic pour les réservations (temporaire)
   */
  static async debugReservations(req, res) {
    try {
      const currentUserId = req.user._id || req.user.id || req.user.userId;

      // Statistiques générales
      const stats = await Reservation.aggregate([
        {
          $group: {
            _id: '$statutReservation',
            count: { $sum: 1 }
          }
        }
      ]);

      // Quelques réservations d'exemple
      const exemples = await Reservation.find({})
        .populate('trajetId', 'pointDepart pointArrivee dateDepart')
        .populate('passagerId', 'nom prenom email')
        .limit(5)
        .sort({ dateReservation: -1 });

      res.json({
        success: true,
        data: {
          utilisateurActuel: {
            id: currentUserId,
            role: req.user.role
          },
          statistiquesGlobales: stats,
          exemplesReservations: exemples,
          totalReservations: await Reservation.countDocuments(),
          collections: {
            reservations: 'reservations',
            utilisateurs: 'utilisateurs',
            trajets: 'trajets'
          }
        }
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
        stack: error.stack
      });
    }
  }
}

module.exports = ReservationController;