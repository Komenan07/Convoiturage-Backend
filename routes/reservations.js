const express = require('express');
const router = express.Router();
const Reservation = require('../models/Reservation');
const Trajet = require('../models/Trajet');
//const Utilisateur = require('../models/Utilisateur');
const { protect } = require('../middlewares/authMiddleware');
const { body, param, query, validationResult } = require('express-validator');
const mongoose = require('mongoose');
const AppError = require('../utils/AppError');
const notificationService = require('../services/notificationService');
const emailService = require('../services/emailService');

// Middleware de validation des erreurs
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Données invalides',
      errors: errors.array()
    });
  }
  next();
};

/**
 * Middleware pour vérifier les accès aux réservations
 */
const verifierAccesReservation = async (req, res, next) => {
  try {
    const { reservationId } = req.params;
    
    if (!reservationId) {
      return res.status(400).json({
        success: false,
        message: 'ID de réservation requis'
      });
    }

    const reservation = await Reservation.findById(reservationId)
      .populate('trajetId', 'conducteurId passagers')
      .populate('passagerId', 'nom prenom');

    if (!reservation) {
      return res.status(404).json({
        success: false,
        message: 'Réservation non trouvée'
      });
    }

    // Vérifier si l'utilisateur est le passager
    const isPassager = reservation.passagerId._id.toString() === req.user.id;
    
    // Vérifier si l'utilisateur est le conducteur
    const isConducteur = reservation.trajetId.conducteurId.toString() === req.user.id;

    if (!isPassager && !isConducteur) {
      return res.status(403).json({
        success: false,
        message: 'Accès non autorisé à cette réservation'
      });
    }

    req.reservation = reservation;
    req.isPassager = isPassager;
    req.isConducteur = isConducteur;
    next();
  } catch (error) {
    return next(AppError.serverError('Erreur serveur lors de la vérification des accès', { originalError: error.message }));
  }
};

/**
 * @route   POST /api/reservations
 * @desc    Créer une nouvelle réservation
 * @access  Private
 */
router.post('/', 
  protect,
  [
    body('trajetId')
      .isMongoId()
      .withMessage('ID de trajet invalide'),
    body('nombrePlacesReservees')
      .isInt({ min: 1, max: 8 })
      .withMessage('Le nombre de places doit être entre 1 et 8'),
    body('pointPriseEnCharge.nom')
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Le nom du point de prise en charge est requis (2-100 caractères)'),
    body('pointPriseEnCharge.adresse')
      .trim()
      .isLength({ min: 5, max: 200 })
      .withMessage('L\'adresse du point de prise en charge est requise (5-200 caractères)'),
    body('pointPriseEnCharge.coordonnees.coordinates')
      .isArray({ min: 2, max: 2 })
      .withMessage('Les coordonnées doivent être un tableau [longitude, latitude]'),
    body('pointDepose.nom')
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Le nom du point de dépose est requis (2-100 caractères)'),
    body('pointDepose.adresse')
      .trim()
      .isLength({ min: 5, max: 200 })
      .withMessage('L\'adresse du point de dépose est requise (5-200 caractères)'),
    body('pointDepose.coordonnees.coordinates')
      .isArray({ min: 2, max: 2 })
      .withMessage('Les coordonnées doivent être un tableau [longitude, latitude]'),
    body('bagages.quantite')
      .optional()
      .isInt({ min: 0, max: 10 })
      .withMessage('La quantité de bagages doit être entre 0 et 10'),
    body('bagages.poids')
      .optional()
      .isFloat({ min: 0, max: 100 })
      .withMessage('Le poids des bagages doit être entre 0 et 100 kg'),
    body('methodePaiement')
      .optional()
      .isIn(['ESPECES', 'WAVE', 'ORANGE_MONEY', 'MTN_MONEY', 'MOOV_MONEY'])
      .withMessage('Méthode de paiement invalide')
  ],
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const { trajetId, nombrePlacesReservees } = req.body;

      // Vérifier que le trajet existe et est disponible
      const trajet = await Trajet.findById(trajetId).populate('conducteurId', 'nom prenom');
      if (!trajet) {
        return res.status(404).json({
          success: false,
          message: 'Trajet non trouvé'
        });
      }

      // Vérifier que l'utilisateur n'est pas le conducteur
      if (trajet.conducteurId._id.toString() === req.user.id) {
        return res.status(400).json({
          success: false,
          message: 'Vous ne pouvez pas réserver votre propre trajet'
        });
      }

      // Vérifier que le trajet n'est pas déjà passé
      if (new Date(trajet.dateDepart) < new Date()) {
        return res.status(400).json({
          success: false,
          message: 'Impossible de réserver un trajet déjà passé'
        });
      }

      // Vérifier la disponibilité des places
      const disponibilite = await Reservation.verifierDisponibilite(trajetId, nombrePlacesReservees);
      if (!disponibilite.disponible) {
        return res.status(400).json({
          success: false,
          message: `Pas assez de places disponibles. Places disponibles: ${disponibilite.placesDisponibles}`,
          placesDisponibles: disponibilite.placesDisponibles
        });
      }

      // Créer la réservation
      const nouvelleReservation = new Reservation({
        trajetId,
        passagerId: req.user.id,
        nombrePlacesReservees,
        pointPriseEnCharge: req.body.pointPriseEnCharge,
        pointDepose: req.body.pointDepose,
        bagages: req.body.bagages || { quantite: 0, poids: 0 },
        methodePaiement: req.body.methodePaiement || 'ESPECES',
        statutReservation: 'EN_ATTENTE',
        dateReservation: new Date()
      });

      await nouvelleReservation.save();

      // Mettre à jour le nombre de places disponibles du trajet
      await Trajet.findByIdAndUpdate(trajetId, {
        $inc: { nombrePlacesDisponibles: -nombrePlacesReservees }
      });

      // Notifier le conducteur
      await Promise.all([
        notificationService.notifierNouvelleReservation(nouvelleReservation),
        emailService.envoyerEmailReservation(nouvelleReservation)
      ]);

      // Populer les données pour la réponse
      await nouvelleReservation.populate([
        { path: 'trajetId', select: 'pointDepart pointArrivee dateDepart conducteurId' },
        { path: 'passagerId', select: 'nom prenom photoProfil' }
      ]);

      res.status(201).json({
        success: true,
        message: 'Réservation créée avec succès',
        data: nouvelleReservation
      });

    } catch (error) {
      console.error('Erreur lors de la création de la réservation:', error);
      return next(AppError.serverError('Erreur serveur lors de la création de la réservation', { originalError: error.message }));
    }
  }
);

/**
 * @route   GET /api/reservations
 * @desc    Obtenir les réservations de l'utilisateur connecté
 * @access  Private
 */
router.get('/',
  protect,
  [
    query('statut')
      .optional()
      .isIn(['EN_ATTENTE', 'CONFIRMEE', 'REFUSEE', 'ANNULEE', 'TERMINEE'])
      .withMessage('Statut invalide'),
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Le numéro de page doit être supérieur à 0'),
    query('limite')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('La limite doit être entre 1 et 100'),
    query('dateDebut')
      .optional()
      .isISO8601()
      .withMessage('Format de date invalide pour dateDebut'),
    query('dateFin')
      .optional()
      .isISO8601()
      .withMessage('Format de date invalide pour dateFin')
  ],
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const { statut, page = 1, limite = 20, dateDebut, dateFin } = req.query;
      const skip = (page - 1) * limite;

      const options = {
        statut,
        limite: parseInt(limite),
        dateDebut: dateDebut ? new Date(dateDebut) : undefined,
        dateFin: dateFin ? new Date(dateFin) : undefined
      };

      // Obtenir les réservations comme passager
      const reservationsPassager = await Reservation.obtenirReservationsUtilisateur(req.user.id, options)
        .skip(skip);

      // Obtenir les réservations comme conducteur
      const reservationsConducteur = await Reservation.find({
        'trajetId.conducteurId': req.user.id,
        ...(statut && { statutReservation: statut }),
        ...(dateDebut && dateFin && {
          dateReservation: { $gte: new Date(dateDebut), $lte: new Date(dateFin) }
        })
      })
        .populate('trajetId', 'pointDepart pointArrivee dateDepart')
        .populate('passagerId', 'nom prenom photoProfil noteGenerale')
        .sort({ dateReservation: -1 })
        .skip(skip)
        .limit(parseInt(limite));

      // Compter le total pour la pagination
      const totalPassager = await Reservation.countDocuments({
        passagerId: req.user.id,
        ...(statut && { statutReservation: statut }),
        ...(dateDebut && dateFin && {
          dateReservation: { $gte: new Date(dateDebut), $lte: new Date(dateFin) }
        })
      });

      const totalConducteur = await Reservation.countDocuments({
        'trajetId.conducteurId': req.user.id,
        ...(statut && { statutReservation: statut }),
        ...(dateDebut && dateFin && {
          dateReservation: { $gte: new Date(dateDebut), $lte: new Date(dateFin) }
        })
      });

      res.json({
        success: true,
        data: {
          reservationsCommePassager: reservationsPassager,
          reservationsCommeConducteur: reservationsConducteur,
          pagination: {
            page: parseInt(page),
            limite: parseInt(limite),
            totalPassager,
            totalConducteur,
            totalPagesPassager: Math.ceil(totalPassager / limite),
            totalPagesConducteur: Math.ceil(totalConducteur / limite)
          }
        }
      });

    } catch (error) {
      console.error('Erreur lors de la récupération des réservations:', error);
      return next(AppError.serverError('Erreur lors de la récupération des réservations', { originalError: error.message }));
    }
  }
);

/**
 * @route   GET /api/reservations/:id
 * @desc    Obtenir les détails d'une réservation
 * @access  Private
 */
router.get('/:id',
  protect,
  [
    param('id')
      .isMongoId()
      .withMessage('ID de réservation invalide')
  ],
  handleValidationErrors,
  verifierAccesReservation,
  async (req, res, next) => {
    try {
      await req.reservation.populate([
        {
          path: 'trajetId',
          populate: {
            path: 'conducteurId',
            select: 'nom prenom photoProfil noteGenerale telephone'
          }
        },
        {
          path: 'passagerId',
          select: 'nom prenom photoProfil noteGenerale telephone'
        }
      ]);

      res.json({
        success: true,
        data: req.reservation
      });

    } catch (error) {
      console.error('Erreur lors de la récupération de la réservation:', error);
      return next(AppError.serverError('Erreur lors de la récupération de la réservation', { originalError: error.message }));
    }
  }
);

/**
 * @route   PUT /api/reservations/:id/confirmer
 * @desc    Confirmer une réservation (conducteur uniquement)
 * @access  Private
 */
router.put('/:id/confirmer',
  protect,
  [
    param('id')
      .isMongoId()
      .withMessage('ID de réservation invalide')
  ],
  handleValidationErrors,
  verifierAccesReservation,
  async (req, res, next) => {
    try {
      // Seul le conducteur peut confirmer
      if (!req.isConducteur) {
        return res.status(403).json({
          success: false,
          message: 'Seul le conducteur peut confirmer une réservation'
        });
      }

      // Vérifier que la réservation est en attente
      if (req.reservation.statutReservation !== 'EN_ATTENTE') {
        return res.status(400).json({
          success: false,
          message: 'Cette réservation ne peut pas être confirmée',
          statutActuel: req.reservation.statutReservation
        });
      }

      // Confirmer la réservation
      req.reservation.statutReservation = 'CONFIRMEE';
      req.reservation.dateConfirmation = new Date();
      await req.reservation.save();

      // Notifier le passager de la confirmation
      // TODO: Implémenter la notification push/SMS/email

      res.json({
        success: true,
        message: 'Réservation confirmée avec succès',
        data: req.reservation
      });

    } catch (error) {
      console.error('Erreur lors de la confirmation:', error);
      return next(AppError.serverError('Erreur lors de la confirmation de la réservation', { originalError: error.message }));
    }
  }
);

/**
 * @route   PUT /api/reservations/:id/refuser
 * @desc    Refuser une réservation (conducteur uniquement)
 * @access  Private
 */
router.put('/:id/refuser',
  protect,
  [
    param('id')
      .isMongoId()
      .withMessage('ID de réservation invalide'),
    body('motifRefus')
      .trim()
      .isLength({ min: 10, max: 500 })
      .withMessage('Un motif de refus détaillé est requis (10-500 caractères)')
  ],
  handleValidationErrors,
  verifierAccesReservation,
  async (req, res, next) => {
    try {
      const { motifRefus } = req.body;

      // Seul le conducteur peut refuser
      if (!req.isConducteur) {
        return res.status(403).json({
          success: false,
          message: 'Seul le conducteur peut refuser une réservation'
        });
      }

      // Vérifier que la réservation est en attente
      if (req.reservation.statutReservation !== 'EN_ATTENTE') {
        return res.status(400).json({
          success: false,
          message: 'Cette réservation ne peut pas être refusée',
          statutActuel: req.reservation.statutReservation
        });
      }

      // Refuser la réservation
      req.reservation.statutReservation = 'REFUSEE';
      req.reservation.motifRefus = motifRefus;
      await req.reservation.save();

      // Remettre les places disponibles dans le trajet
      const trajet = await Trajet.findById(req.reservation.trajetId);
      trajet.nombrePlacesDisponibles += req.reservation.nombrePlacesReservees;
      await trajet.save();

      // Notifier le passager du refus
      // TODO: Implémenter la notification push/SMS/email

      res.json({
        success: true,
        message: 'Réservation refusée',
        data: req.reservation
      });

    } catch (error) {
      console.error('Erreur lors du refus:', error);
      return next(AppError.serverError('Erreur lors du refus de la réservation', { originalError: error.message }));
    }
  }
);

/**
 * @route   PUT /api/reservations/:id/annuler
 * @desc    Annuler une réservation
 * @access  Private
 */
router.put('/:id/annuler',
  protect,
  [
    param('id')
      .isMongoId()
      .withMessage('ID de réservation invalide'),
    body('motifAnnulation')
      .optional()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Le motif d\'annulation ne peut pas dépasser 500 caractères')
  ],
  handleValidationErrors,
  verifierAccesReservation,
  async (req, res, next) => {
    try {
      const { motifAnnulation } = req.body;

      // Vérifier que la réservation peut être annulée
      if (!req.reservation.peutEtreAnnulee()) {
        return res.status(400).json({
          success: false,
          message: 'Cette réservation ne peut pas être annulée',
          statutActuel: req.reservation.statutReservation
        });
      }

      // Calculer le remboursement si applicable
      const trajet = await Trajet.findById(req.reservation.trajetId);
      let montantRemboursement = 0;
      
      if (req.reservation.statutPaiement === 'PAYE') {
        montantRemboursement = req.reservation.calculerRemboursement(trajet.dateDepart);
      }

      // Annuler la réservation
      req.reservation.statutReservation = 'ANNULEE';
      if (motifAnnulation) {
        req.reservation.motifRefus = motifAnnulation; // Réutiliser ce champ
      }
      
      // Gérer le remboursement si nécessaire
      if (montantRemboursement > 0) {
        req.reservation.statutPaiement = 'REMBOURSE';
        // TODO: Traiter le remboursement via l'API de paiement
      }

      await req.reservation.save();

      // Remettre les places disponibles
      trajet.nombrePlacesDisponibles += req.reservation.nombrePlacesReservees;
      await trajet.save();

      res.json({
        success: true,
        message: 'Réservation annulée avec succès',
        data: {
          reservation: req.reservation,
          montantRemboursement
        }
      });

    } catch (error) {
      console.error('Erreur lors de l\'annulation:', error);
      return next(AppError.serverError('Erreur lors de l\'annulation de la réservation', { originalError: error.message }));
    }
  }
);

/**
 * @route   PUT /api/reservations/:id/modifier-points
 * @desc    Modifier les points de prise en charge et/ou dépose
 * @access  Private
 */
router.put('/:id/modifier-points',
  protect,
  [
    param('id')
      .isMongoId()
      .withMessage('ID de réservation invalide'),
    body('pointPriseEnCharge')
      .optional()
      .isObject()
      .withMessage('Point de prise en charge invalide'),
    body('pointDepose')
      .optional()
      .isObject()
      .withMessage('Point de dépose invalide')
  ],
  handleValidationErrors,
  verifierAccesReservation,
  async (req, res, next) => {
    try {
      const { pointPriseEnCharge, pointDepose } = req.body;

      // Seul le passager peut modifier ses points
      if (!req.isPassager) {
        return res.status(403).json({
          success: false,
          message: 'Seul le passager peut modifier les points de prise en charge et dépose'
        });
      }

      // Vérifier que la réservation peut être modifiée
      if (!['EN_ATTENTE', 'CONFIRMEE'].includes(req.reservation.statutReservation)) {
        return res.status(400).json({
          success: false,
          message: 'Cette réservation ne peut pas être modifiée',
          statutActuel: req.reservation.statutReservation
        });
      }

      // Vérifier qu'il reste assez de temps avant le départ (au moins 2h)
      const trajet = await Trajet.findById(req.reservation.trajetId);
      const heuresAvantDepart = (new Date(trajet.dateDepart) - new Date()) / (1000 * 60 * 60);
      
      if (heuresAvantDepart < 2) {
        return res.status(400).json({
          success: false,
          message: 'Impossible de modifier les points moins de 2 heures avant le départ'
        });
      }

      // Mettre à jour les points
      if (pointPriseEnCharge) {
        req.reservation.pointPriseEnCharge = pointPriseEnCharge;
      }
      if (pointDepose) {
        req.reservation.pointDepose = pointDepose;
      }

      await req.reservation.save();

      // Notifier le conducteur des modifications
      // TODO: Implémenter la notification

      res.json({
        success: true,
        message: 'Points modifiés avec succès',
        data: req.reservation
      });

    } catch (error) {
      console.error('Erreur lors de la modification:', error);
      return next(AppError.serverError('Erreur lors de la modification des points', { originalError: error.message }));
    }
  }
);

/**
 * @route   PUT /api/reservations/:id/statut-paiement
 * @desc    Mettre à jour le statut de paiement
 * @access  Private
 */
router.put('/:id/statut-paiement',
  protect,
  [
    param('id')
      .isMongoId()
      .withMessage('ID de réservation invalide'),
    body('statutPaiement')
      .isIn(['PAYE', 'REMBOURSE'])
      .withMessage('Statut de paiement invalide'),
    body('referencePaiement')
      .optional()
      .trim()
      .isLength({ max: 100 })
      .withMessage('Référence de paiement trop longue'),
    body('methodePaiement')
      .optional()
      .isIn(['ESPECES', 'WAVE', 'ORANGE_MONEY', 'MTN_MONEY', 'MOOV_MONEY'])
      .withMessage('Méthode de paiement invalide')
  ],
  handleValidationErrors,
  verifierAccesReservation,
  async (req, res, next) => {
    try {
      const { statutPaiement, referencePaiement, methodePaiement } = req.body;

      // Vérifier les permissions (passager pour payer, système/admin pour rembourser)
      if (statutPaiement === 'PAYE' && !req.isPassager) {
        return res.status(403).json({
          success: false,
          message: 'Seul le passager peut confirmer un paiement'
        });
      }

      // Mettre à jour le statut de paiement
      req.reservation.statutPaiement = statutPaiement;
      if (statutPaiement === 'PAYE') {
        req.reservation.datePaiement = new Date();
        if (referencePaiement) req.reservation.referencePaiement = referencePaiement;
        if (methodePaiement) req.reservation.methodePaiement = methodePaiement;
      }

      await req.reservation.save();

      res.json({
        success: true,
        message: `Statut de paiement mis à jour: ${statutPaiement}`,
        data: req.reservation
      });

    } catch (error) {
      console.error('Erreur lors de la mise à jour du paiement:', error);
      return next(AppError.serverError('Erreur lors de la mise à jour du statut de paiement', { originalError: error.message }));
    }
  }
);

/**
 * @route   PUT /api/reservations/:id/position
 * @desc    Mettre à jour la position en temps réel
 * @access  Private
 */
router.put('/:id/position',
  protect,
  [
    param('id')
      .isMongoId()
      .withMessage('ID de réservation invalide'),
    body('coordinates')
      .isArray({ min: 2, max: 2 })
      .withMessage('Les coordonnées doivent être un tableau [longitude, latitude]'),
    body('coordinates.*')
      .isFloat()
      .withMessage('Les coordonnées doivent être des nombres')
  ],
  handleValidationErrors,
  verifierAccesReservation,
  async (req, res, next) => {
    try {
      const { coordinates } = req.body;

      // Seul le conducteur peut mettre à jour la position
      if (!req.isConducteur) {
        return res.status(403).json({
          success: false,
          message: 'Seul le conducteur peut mettre à jour la position'
        });
      }

      // Vérifier que le trajet est en cours
      if (req.reservation.statutReservation !== 'CONFIRMEE') {
        return res.status(400).json({
          success: false,
          message: 'Impossible de mettre à jour la position pour cette réservation'
        });
      }

      await req.reservation.mettreAJourPosition(coordinates);

      res.json({
        success: true,
        message: 'Position mise à jour',
        data: {
          position: req.reservation.positionEnTempsReel
        }
      });

    } catch (error) {
      console.error('Erreur lors de la mise à jour de position:', error);
      return next(AppError.serverError('Erreur lors de la mise à jour de la position', { originalError: error.message }));
    }
  }
);

/**
 * @route   GET /api/reservations/trajet/:trajetId
 * @desc    Obtenir toutes les réservations d'un trajet (conducteur uniquement)
 * @access  Private
 */
router.get('/trajet/:trajetId',
  protect,
  [
    param('trajetId')
      .isMongoId()
      .withMessage('ID de trajet invalide')
  ],
  handleValidationErrors,
  async (req, res, next) => {
    try {
      const { trajetId } = req.params;

      // Vérifier que l'utilisateur est le conducteur du trajet
      const trajet = await Trajet.findById(trajetId);
      if (!trajet) {
        return res.status(404).json({
          success: false,
          message: 'Trajet non trouvé'
        });
      }

      if (trajet.conducteurId.toString() !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'Accès non autorisé à ce trajet'
        });
      }

      const reservations = await Reservation.obtenirReservationsTrajet(trajetId);

      res.json({
        success: true,
        data: reservations
      });

    } catch (error) {
      console.error('Erreur lors de la récupération des réservations du trajet:', error);
      return next(AppError.serverError('Erreur lors de la récupération des réservations', { originalError: error.message }));
    }
  }
);

/**
 * @route   PUT /api/reservations/:id/terminer
 * @desc    Marquer une réservation comme terminée
 * @access  Private
 */
router.put('/:id/terminer',
  protect,
  [
    param('id')
      .isMongoId()
      .withMessage('ID de réservation invalide')
  ],
  handleValidationErrors,
  verifierAccesReservation,
  async (req, res, next) => {
    try {
      // Seul le conducteur peut marquer comme terminé
      if (!req.isConducteur) {
        return res.status(403).json({
          success: false,
          message: 'Seul le conducteur peut terminer une réservation'
        });
      }

      // Vérifier que la réservation est confirmée
      if (req.reservation.statutReservation !== 'CONFIRMEE') {
        return res.status(400).json({
          success: false,
          message: 'Cette réservation ne peut pas être terminée',
          statutActuel: req.reservation.statutReservation
        });
      }

      // Marquer comme terminée
      req.reservation.statutReservation = 'TERMINEE';
      await req.reservation.save();

      res.json({
        success: true,
        message: 'Réservation marquée comme terminée',
        data: req.reservation
      });

    } catch (error) {
      console.error('Erreur lors de la finalisation:', error);
      return next(AppError.serverError('Erreur lors de la finalisation de la réservation', { originalError: error.message }));
    }
  }
);

/**
 * @route   GET /api/reservations/statistiques
 * @desc    Obtenir les statistiques de réservation de l'utilisateur
 * @access  Private
 */
router.get('/statistiques',
  protect,
  async (req, res, next) => {
    try {
      const userId = new mongoose.Types.ObjectId(req.user.id);

      // Statistiques comme passager
      const statsPassager = await Reservation.aggregate([
        { $match: { passagerId: userId } },
        {
          $group: {
            _id: '$statutReservation',
            count: { $sum: 1 },
            montantTotal: { $sum: '$montantTotal' }
          }
        }
      ]);

      // Statistiques comme conducteur
      const statsConducteur = await Reservation.aggregate([
        {
          $lookup: {
            from: 'trajets',
            localField: 'trajetId',
            foreignField: '_id',
            as: 'trajet'
          }
        },
        { $unwind: '$trajet' },
        { $match: { 'trajet.conducteurId': userId } },
        {
          $group: {
            _id: '$statutReservation',
            count: { $sum: 1 },
            montantTotal: { $sum: '$montantTotal' }
          }
        }
      ]);

      res.json({
        success: true,
        data: {
          statistiquesPassager: statsPassager,
          statistiquesConducteur: statsConducteur
        }
      });

    } catch (error) {
      console.error('Erreur lors du calcul des statistiques:', error);
      return next(AppError.serverError('Erreur lors du calcul des statistiques', { originalError: error.message }));
    }
  }
);

module.exports = router;

