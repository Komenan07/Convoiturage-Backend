const Trajet = require('../models/Trajet');
const { validationResult } = require('express-validator');
const AppError = require('../utils/AppError');
const distanceService = require('../services/distanceService'); 

class TrajetController {
  
  // ✅ CONSTRUCTEUR
  constructor() {
    // Bind toutes les méthodes
    Object.getOwnPropertyNames(TrajetController.prototype)
      .filter(method => method !== 'constructor')
      .forEach(method => {
        this[method] = this[method].bind(this);
      });
  }
  
  // ==================== HELPER: DATE DU JOUR ====================
  
  /**
   * 🆕 Retourne le début de la journée (00h00) pour filtrer les trajets d'aujourd'hui
   */
  _getStartOfToday() {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0); 
    return today;
  }

  /**
   * 🆕 Retourne la fin de la journée (23h59) 
   */
  _getEndOfToday() {
    const today = new Date();
    today.setUTCHours(23, 59, 59, 999);
    return today;
  }

  /**
 * 🆕 Normalise une date en début de journée UTC
 */
  _normalizeToStartOfDay(dateString) {
    const date = new Date(dateString);
    date.setUTCHours(0, 0, 0, 0);
    return date;
  }

  /**
   * 🆕 Normalise une date en fin de journée UTC
   */
  _normalizeToEndOfDay(dateString) {
    const date = new Date(dateString);
    date.setUTCHours(23, 59, 59, 999);
    return date;
  }


  /**
   * 🆕 Vérifie si un trajet est actif (programmé ou en cours, avec date >= aujourd'hui)
   */
  _buildActiveTripsQuery(additionalFilters = {}, includeExpired = false) {
    return {
      statutTrajet: {
        $in: includeExpired
          ? ['PROGRAMME', 'EN_COURS', 'EXPIRE']
          : ['PROGRAMME', 'EN_COURS']
      },
      dateDepart: { $gte: this._getStartOfToday() },
      ...additionalFilters
    };
  }


  // ==================== CREATE ====================
  
  /**
   * Prévisualiser distance AVANT création
   */
async previewDistance(req, res) {
  try {
    const { pointDepart, pointArrivee, heureDepart, dateDepart } = req.body;

    // ✅ Validation améliorée
    if (!pointDepart?.coordonnees?.coordinates || 
        !Array.isArray(pointDepart.coordonnees.coordinates) ||
        pointDepart.coordonnees.coordinates.length !== 2) {
      return res.status(400).json({
        success: false,
        message: 'Coordonnées de départ invalides. Format attendu: {coordonnees: {coordinates: [longitude, latitude]}}'
      });
    }

    if (!pointArrivee?.coordonnees?.coordinates ||
        !Array.isArray(pointArrivee.coordonnees.coordinates) ||
        pointArrivee.coordonnees.coordinates.length !== 2) {
      return res.status(400).json({
        success: false,
        message: 'Coordonnées d\'arrivée invalides. Format attendu: {coordonnees: {coordinates: [longitude, latitude]}}'
      });
    }

    console.log('🔍 Prévisualisation distance:', {
      from: pointDepart.nom || pointDepart.adresse,
      to: pointArrivee.nom || pointArrivee.adresse,
      coords: {
        depart: pointDepart.coordonnees.coordinates,
        arrivee: pointArrivee.coordonnees.coordinates
      }
    });

    // ✅ CORRECTION 1: Extraire les coordonnées correctement
    const originCoords = pointDepart.coordonnees.coordinates;
    const destCoords = pointArrivee.coordonnees.coordinates;

    // Calculer les distances (voiture + piéton)
    const distanceInfo = await distanceService.calculateMultiMode(
      originCoords,
      destCoords,
      null,
      req.user?.id  // userId pour rate limiting
    );

    // ✅ CORRECTION 2: Calculer heure d'arrivée avec la bonne méthode
    let heureArriveePrevue = null;
    let arrivalInfo = null;
    
    if (heureDepart) {
      const dateRef = dateDepart ? new Date(dateDepart) : new Date();
      
      // ✅ Utiliser calculateArrivalTime (pas calculateArrivalTimeFromDeparture)
      arrivalInfo = distanceService.calculateArrivalTime(
        heureDepart,
        distanceInfo.driving.durationMinutes,  // ✅ driving, pas vehicle
        dateRef
      );
      
      heureArriveePrevue = arrivalInfo?.heure;
    }

    // ✅ CORRECTION 3: Utiliser 'driving' au lieu de 'vehicle'
    res.json({
      success: true,
      message: 'Distance calculée avec succès',
      data: {
        pointDepart: {
          nom: pointDepart.nom,
          adresse: pointDepart.adresse,
          commune: pointDepart.commune,
          quartier: pointDepart.quartier,
          coordonnees: originCoords
        },
        pointArrivee: {
          nom: pointArrivee.nom,
          adresse: pointArrivee.adresse,
          commune: pointArrivee.commune,
          quartier: pointArrivee.quartier,
          coordonnees: destCoords
        },
        // Valeurs simples pour compatibilité
        distance: parseFloat(distanceInfo.driving.distanceKm),
        dureeEstimee: distanceInfo.driving.durationMinutes,
        heureArriveePrevue,
        // Détails complets
        vehicle: {
          distance: distanceInfo.driving.distanceText,
          duration: distanceInfo.driving.durationText,
          estimatedArrival: arrivalInfo?.heure || null
        },
        walking: {
          distance: distanceInfo.walking.distanceText,
          duration: distanceInfo.walking.durationText
        },
        // Métadonnées
        provider: distanceInfo.driving.provider || 'unknown',
        calculatedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('❌ Erreur prévisualisation:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors du calcul de distance',
      error: error.message
    });
  }
}

/**
 * ⭐ NOUVEAU: Recalculer manuellement la distance d'un trajet existant
 */
async recalculerDistance(req, res, next) {
  try {
    const { id } = req.params;

    const trajet = await Trajet.findById(id);
    if (!trajet) {
      return res.status(404).json({
        success: false,
        message: 'Trajet non trouvé'
      });
    }

    // Vérifier autorisation
    if (trajet.conducteurId.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Vous n\'êtes pas autorisé à modifier ce trajet'
      });
    }

    console.log('🔄 Recalcul manuel demandé pour le trajet:', id);

    // Utiliser la méthode du modèle
    const infoDistance = await trajet.recalculerDistance();

    // Retourner le trajet normalisé avec isExpired
    await trajet.populate('conducteurId', 'nom prenom photoProfil');
    const trajetObj = this._attachIsExpired([trajet])[0];

    res.json({
      success: true,
      message: 'Distance recalculée avec succès',
      data: {
        trajet: trajetObj,
        infoDistance
      }
    });

  } catch (error) {
    console.error('❌ Erreur recalcul distance:', error);
    return next(AppError.serverError('Erreur lors du recalcul de la distance', { 
      originalError: error.message 
    }));
  }
}
  
 
  /**
   * ⭐ Démarrer un trajet (PROGRAMME → EN_COURS)
   */
  async demarrerTrajet(req, res, next) {
    try {
      const { id } = req.params;
      const { heureDepart } = req.body;

      const trajet = await Trajet.findById(id);
      if (!trajet) {
        return next(AppError.notFound('Trajet non trouvé'));
      }

      // Vérifier autorisation
      if (trajet.conducteurId.toString() !== req.user.id.toString()) {
        return next(AppError.badRequest('Seul le conducteur peut démarrer ce trajet'));
      }

      // Vérifier le statut
      if (trajet.statutTrajet !== 'PROGRAMME') {
        return next(AppError.badRequest('Ce trajet ne peut pas être démarré', {
          details: `Statut actuel: ${trajet.statutTrajet}`
        }));
      }

      // Vérifier qu'il y a au moins une réservation confirmée
      const Reservation = require('../models/Reservation');
      const reservationsConfirmees = await Reservation.countDocuments({
        trajetId: id,
        statutReservation: 'CONFIRMEE'
      });

      if (reservationsConfirmees === 0) {
        return next(AppError.badRequest('Aucune réservation confirmée pour ce trajet'));
      }

      console.log('🚀 Démarrage trajet:', id);

      // Mettre à jour le statut et l'heure de départ réelle
      trajet.statutTrajet = 'EN_COURS';
      // ✅ Formater l'heure au format HH:MM si non fournie
      if (heureDepart) {
        trajet.heureDepart = heureDepart;
      } else {
        const now = new Date();
        trajet.heureDepart = now.toTimeString().slice(0, 5); // "HH:MM"
      }
      await trajet.save();

      // Notifier tous les passagers confirmés via FCM
      const reservations = await Reservation.find({
        trajetId: id,
        statutReservation: 'CONFIRMEE'
      }).populate('passagerId', 'fcmTokens');

      const firebaseService = require('../services/firebaseService');
      
      for (const reservation of reservations) {
        if (reservation.passagerId?.fcmTokens?.length > 0) {
          await firebaseService.sendToMultipleTokens(
            reservation.passagerId.fcmTokens.map(t => t.token).filter(Boolean),
            {
              title: 'Trajet démarré ! 🚗',
              message: `Le conducteur a démarré le trajet vers ${trajet.pointArrivee.adresse}`,
              channelId: 'trajets',
              data: {
                type: 'RIDE_STARTED',
                trajetId: id,
                reservationId: reservation._id.toString(),
                screen: 'ActiveTripPassenger'
              }
            }
          );
        }
      }

      await trajet.populate('conducteurId', 'nom prenom photoProfil');
      const trajetObj = this._attachIsExpired([trajet])[0];

      res.json({
        success: true,
        message: 'Trajet démarré avec succès',
        data: trajetObj
      });

    } catch (error) {
      console.error('❌ Erreur démarrage trajet:', error);
      return next(AppError.serverError('Erreur lors du démarrage du trajet', { 
        originalError: error.message 
      }));
    }
  }

  /**
   * ⭐ Terminer un trajet (EN_COURS → TERMINE)
   */
  async terminerTrajet(req, res, next) {
    try {
      const { id } = req.params;
      const { heureArrivee, distanceReelle, dureeReelle } = req.body;

      const trajet = await Trajet.findById(id);
      if (!trajet) {
        return next(AppError.notFound('Trajet non trouvé'));
      }

      // Vérifier autorisation
      if (trajet.conducteurId.toString() !== req.user.id) {
        return next(AppError.forbidden('Seul le conducteur peut terminer ce trajet'));
      }

      // Vérifier le statut
      if (trajet.statutTrajet !== 'EN_COURS') {
        return next(AppError.badRequest('Ce trajet n\'est pas en cours', {
          details: `Statut actuel: ${trajet.statutTrajet}`
        }));
      }

      console.log('🏁 Terminaison trajet:', id);

      // Mettre à jour le statut et les informations finales
      trajet.statutTrajet = 'TERMINE';
      trajet.heureArriveePrevue = heureArrivee || new Date();
      
      if (distanceReelle) trajet.distance = distanceReelle;
      if (dureeReelle) trajet.dureeEstimee = dureeReelle;

      await trajet.save();

      // Marquer toutes les réservations comme TERMINEE
      const Reservation = require('../models/Reservation');
      await Reservation.updateMany(
        { 
          trajetId: id, 
          statutReservation: { $in: ['CONFIRMEE', 'EN_COURS'] }
        },
        { 
          $set: { 
            statutReservation: 'TERMINEE',
            dateTerminaison: new Date()
          } 
        }
      );

      // Récupérer les réservations pour notifications
      const reservations = await Reservation.find({
        trajetId: id,
        statutReservation: 'TERMINEE'
      }).populate('passagerId', 'fcmTokens');

      const firebaseService = require('../services/firebaseService');
      const EvaluationService = require('../services/evaluationService');
      const evaluationService = new EvaluationService();

      // Notifier les passagers et créer évaluations en attente
      for (const reservation of reservations) {
        // Notification FCM
        if (reservation.passagerId?.fcmTokens?.length > 0) {
          await firebaseService.sendToMultipleTokens(
            reservation.passagerId.fcmTokens.map(t => t.token).filter(Boolean),
            {
              title: 'Trajet terminé ! 🎉',
              message: 'N\'oubliez pas d\'évaluer votre conducteur',
              channelId: 'trajets',
              data: {
                type: 'RIDE_COMPLETED',
                trajetId: id,
                reservationId: reservation._id.toString(),
                screen: 'TripEvaluation',
                requireEvaluation: 'true'
              }
            }
          );
        }

        // Créer évaluation en attente (passager évalue conducteur)
        try {
          await evaluationService.creerEvaluationEnAttente(
            id,
            reservation.passagerId._id.toString(),
            trajet.conducteurId.toString(),
            'PASSAGER'
          );
        } catch (evalError) {
          console.error('Erreur création évaluation passager:', evalError);
        }

        // Créer évaluation en attente (conducteur évalue passager)
        try {
          await evaluationService.creerEvaluationEnAttente(
            id,
            trajet.conducteurId.toString(),
            reservation.passagerId._id.toString(),
            'CONDUCTEUR'
          );
        } catch (evalError) {
          console.error('Erreur création évaluation conducteur:', evalError);
        }
      }

      await trajet.populate('conducteurId', 'nom prenom photoProfil');
      const trajetObj = this._attachIsExpired([trajet])[0];

      res.json({
        success: true,
        message: 'Trajet terminé avec succès',
        data: {
          trajet: trajetObj,
          statistiques: {
            passagersTransportes: reservations.length,
            distanceReelle: trajet.distance,
            dureeReelle: trajet.dureeEstimee,
            evaluationsEnAttente: reservations.length * 2 // conducteur + passagers
          }
        }
      });

    } catch (error) {
      console.error('❌ Erreur terminaison trajet:', error);
      return next(AppError.serverError('Erreur lors de la terminaison du trajet', { 
        originalError: error.message 
      }));
    }
  }

   /**
   * Créer un trajet ponctuel
   * ⭐ Suppression des calculs manuels (le hook s'en charge)
   */
  async creerTrajetPonctuel(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ 
        success: false, 
        message: 'Erreurs de validation', 
        errors: errors.array() 
      });
    }

    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        message: 'Utilisateur non authentifié'
      });
    }

    const trajetData = {
      ...req.body,
      conducteurId: req.user.id,
      typeTrajet: 'PONCTUEL'
    };

    // Validation avec date + heure complète
    const dateDepart = new Date(trajetData.dateDepart);
    // Si heureDepart n'est pas fournie, utiliser 00:00 par défaut
    const heureDepart = trajetData.heureDepart || '00:00'; // Format: "14:30" - default 00:00 if not provided
    
    // ✅ CORRECTION 1: Utiliser setUTCHours au lieu de setHours
    const [heures, minutes] = heureDepart.split(':').map(Number);
    const dateDepartComplete = new Date(dateDepart);
    dateDepartComplete.setUTCHours(heures, minutes, 0, 0); // ✅ UTC explicite
    
    // Comparer avec maintenant
    const maintenant = new Date();
    
    if (dateDepartComplete < maintenant) {
      return res.status(400).json({
        success: false,
        message: 'La date de départ doit être dans le futur',
        details: {
          dateDepartDemandee: dateDepartComplete.toISOString(),
          dateActuelle: maintenant.toISOString()
        }
      });
    }

    // ⭐ BONUS: Avertissement si le départ est dans moins de 30 minutes
    const diffMinutes = (dateDepartComplete - maintenant) / (1000 * 60);
    if (diffMinutes < 30) {
      console.log(`⚠️ Trajet créé avec un délai court: ${Math.round(diffMinutes)} minutes`);
    }

    // ✅ CORRECTION 2: LIGNE CRITIQUE - Assigner la date/heure complète
    trajetData.dateDepart = dateDepartComplete;

    // ⭐ MODIFIÉ: On met des valeurs par défaut SEULEMENT si non fournies
    // Le hook pre-save va calculer automatiquement les vraies valeurs
    if (!trajetData.distance) {
      trajetData.distance = 0.1; // Valeur temporaire minimale
    }

    console.log('🚗 Création trajet ponctuel pour:', req.user.nom, req.user.prenom);
    console.log('📅 Départ prévu (UTC):', dateDepartComplete.toISOString());
    console.log('🕐 Heure affichage:', heureDepart);
    console.log('📊 Distance et durée seront calculées automatiquement...');

    // Créer et sauvegarder (le hook va calculer automatiquement)
    const nouveauTrajet = new Trajet(trajetData);
    await nouveauTrajet.save();

    await nouveauTrajet.populate('conducteurId', 'nom prenom photoProfil');

    // ✅ Convertir en JSON (le virtual isExpired sera automatiquement inclus)
    const nouveauTrajetObj = (typeof nouveauTrajet.toJSON === 'function') ?
      nouveauTrajet.toJSON() : (typeof nouveauTrajet.toObject === 'function' ? nouveauTrajet.toObject() : nouveauTrajet);

    res.status(201).json({
      success: true,
      message: 'Trajet ponctuel créé avec succès',
      data: nouveauTrajetObj,
      // Inclure les infos calculées
      calculs: {
        distance: `${nouveauTrajet.distance} km`,
        duree: `${nouveauTrajet.dureeEstimee} min`,
        arrivee: nouveauTrajet.heureArriveePrevue,
        calculePar: 'OSRM'
      }
    });

  } catch (error) {
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Erreur de validation des données',
        errors: Object.values(error.errors).map(err => ({
          field: err.path,
          message: err.message,
          value: err.value
        }))
      });
    }
    
    console.error('❌ Erreur création trajet:', error);
    return next(AppError.serverError('Erreur serveur lors de la création du trajet', { 
      originalError: error.message 
    }));
  }
  }
 
  /**
   * Créer un trajet récurrent
   * ⭐ MODIFIÉ: Suppression des calculs manuels
   */
  async creerTrajetRecurrent(req, res, next) {
    try {
        const nombreRecurrents = await Trajet.countDocuments({
        conducteurId: req.user.id,
        typeTrajet: 'RECURRENT',
        statutTrajet: { $in: ['PROGRAMME', 'EN_COURS'] }
      });
      
      if (nombreRecurrents >= 3) {
        return res.status(400).json({
          success: false,
          message: 'Limite de 3 trajets récurrents atteinte',
          details: `Vous avez déjà ${nombreRecurrents} trajet(s) récurrent(s) actif(s)`
        });
      }
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ 
          success: false, 
          message: 'Erreurs de validation', 
          errors: errors.array() 
        });
      }

      const trajetData = {
        ...req.body,
        conducteurId: req.user.id,
        typeTrajet: 'RECURRENT'
      };

      // Validation de la récurrence
      if (!trajetData.recurrence || !trajetData.recurrence.jours || trajetData.recurrence.jours.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'La récurrence est requise pour un trajet récurrent'
        });
      }

      // Validation que la date de fin n'est pas déjà passée
      if (trajetData.recurrence.dateFinRecurrence) {
        const dateFin = new Date(trajetData.recurrence.dateFinRecurrence);
        if (dateFin < new Date()) {
          return res.status(400).json({
            success: false,
            message: 'La date de fin de récurrence ne peut pas être dans le passé'
          });
        }
      }

      // ⭐ MODIFIÉ: Valeur par défaut minimale
      if (!trajetData.distance) {
        trajetData.distance = 0.1;
      }

      console.log('🔄 Création trajet récurrent pour:', req.user.nom, req.user.prenom);

      const nouveauTrajet = new Trajet(trajetData);
      await nouveauTrajet.save();

      await nouveauTrajet.populate('conducteurId', 'nom prenom photoProfil');

      // Normaliser isExpired avant retour
      const nouveauTrajetObj = this._attachIsExpired([nouveauTrajet])[0];

      res.status(201).json({
        success: true,
        message: 'Trajet récurrent créé avec succès',
        data: nouveauTrajetObj,
        calculs: {
          distance: `${nouveauTrajet.distance} km`,
          duree: `${nouveauTrajet.dureeEstimee} min`,
          arrivee: nouveauTrajet.heureArriveePrevue
        }
      });

    } catch (error) {
      console.error('Erreur création trajet récurrent:', error);
      return next(AppError.serverError('Erreur serveur lors de la création du trajet récurrent', { 
        originalError: error.message 
      }));
    }
  }

  // ==================== READ ====================
  // ... (toutes tes méthodes READ restent identiques)

  async obtenirDetailsTrajet(req, res, next) {
    return this.obtenirTrajetParId(req, res, next);
  }

  async obtenirTrajetsConducteur(req, res, next) {
    try {
      const { conducteurId } = req.params;
      const { page = 1, limit = 20 } = req.query;

      // Query qui inclut TOUS les statuts et bypass le middleware pre-find
      const query = this._buildActiveTripsQuery({ conducteurId }, true);
      
      const options = {
        page: parseInt(page),
        limit: parseInt(limit),
        sort: { dateDepart: -1 }, // Plus récents en premier
        populate: { path: 'conducteurId', select: 'nom prenom photoProfil noteGenerale' },
        lean: true // ⭐ Bypass le middleware pre-find
      };

      const trajets = await Trajet.paginate(query, options);

      // Normaliser la virtual `isExpired` (utile pour aggregate/lean/paginate)
      trajets.docs = this._attachIsExpired(trajets.docs);

      res.json({
        success: true,
        count: trajets.docs.length,
        pagination: {
          total: trajets.totalDocs,
          page: trajets.page,
          pages: trajets.totalPages,
          limit: trajets.limit
        },
        data: trajets.docs
      });

    } catch (error) {
      console.error('❌ Erreur obtenirTrajetsConducteur:', error);
      return next(AppError.serverError('Erreur serveur lors de la récupération des trajets', { 
        originalError: error.message 
      }));
    }
  }

  async filtrerTrajets(req, res, next) {
  try {
    const {
      dateDepart,
      dateFin,
      prixMin,
      prixMax,
      typeTrajet,
      page = 1,
      limit = 20
    } = req.query;

    let query = {
      statutTrajet: 'PROGRAMME',
      dateDepart: { $gte: this._getStartOfToday() } 
    };

    // ✅ CORRECTION: Utiliser les méthodes de normalisation UTC
    if (dateDepart && dateFin) {
      query.dateDepart = {
        $gte: this._normalizeToStartOfDay(dateDepart),
        $lte: this._normalizeToEndOfDay(dateFin)
      };
      console.log('📅 Filtre dates:', {
        debut: this._normalizeToStartOfDay(dateDepart).toISOString(),
        fin: this._normalizeToEndOfDay(dateFin).toISOString()
      });
    } else if (dateDepart) {
      query.dateDepart = {
        $gte: this._normalizeToStartOfDay(dateDepart)
      };
      console.log('📅 Filtre à partir de:', this._normalizeToStartOfDay(dateDepart).toISOString());
    } else {
      // Pas de date spécifiée = à partir d'aujourd'hui
      query.dateDepart = { $gte: this._getStartOfToday() };
      console.log('📅 Filtre à partir d\'aujourd\'hui:', this._getStartOfToday().toISOString());
    }

    if (prixMin || prixMax) {
      query.prixParPassager = {};
      if (prixMin) query.prixParPassager.$gte = parseInt(prixMin);
      if (prixMax) query.prixParPassager.$lte = parseInt(prixMax);
      console.log('💰 Filtre prix:', query.prixParPassager);
    }

    if (typeTrajet) {
      query.typeTrajet = typeTrajet;
      console.log('🔄 Filtre type:', typeTrajet);
    }

    console.log('🔍 Query de filtrage:', JSON.stringify(query, null, 2));

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { dateDepart: 1 },
      populate: { path: 'conducteurId', select: 'nom prenom photoProfil noteGenerale' }
    };

    const result = await Trajet.paginate(query, options);

    // Normaliser la virtual `isExpired`
    result.docs = this._attachIsExpired(result.docs);

    console.log(`✅ Filtrage: ${result.totalDocs} trajet(s) trouvé(s)`);

    res.json({
      success: true,
      count: result.docs.length,
      pagination: {
        total: result.totalDocs,
        page: result.page,
        pages: result.totalPages,
        limit: result.limit
      },
      data: result.docs
    });

  } catch (error) {
    console.error('❌ Erreur filtrerTrajets:', error);
    return next(AppError.serverError('Erreur lors du filtrage des trajets', { 
      originalError: error.message 
    }));
  }
}

  async obtenirHistoriqueTrajets(req, res, next) {
    try {
      const { type = 'tous', statut, page = 1, limit = 20 } = req.query;

      let query = {};

      if (type === 'conduits') {
        // ✅ Les conducteurs VOIENT leurs trajets terminés (historique)
        query.conducteurId = req.user.id;
      } else if (type === 'reserves') {
        // ✅ LES PASSAGERS NE VOIENT PAS LES TRAJETS TERMINÉS
        const Reservation = require('../models/Reservation');
        const reservationsPassager = await Reservation.find({
          passagerId: req.user.id,
          statutReservation: { $in: ['EN_ATTENTE', 'CONFIRMEE'] }  // ✅ Exclure TERMINEE
        }).select('trajetId').lean();
        
        const trajetIds = reservationsPassager.map(r => r.trajetId);
        query._id = { $in: trajetIds };
        query.statutTrajet = { $ne: 'TERMINE' };  // ✅ Masquer les trajets terminés
      } else {
        // Par défaut = trajets du conducteur
        query.conducteurId = req.user.id;
      }

      if (statut) {
        query.statutTrajet = statut;
      }

      const options = {
        page: parseInt(page),
        limit: parseInt(limit),
        sort: { dateDepart: -1 },
        populate: { path: 'conducteurId', select: 'nom prenom photoProfil' }
      };

      const result = await Trajet.paginate(query, options);

      // Normaliser la virtual `isExpired`
      result.docs = this._attachIsExpired(result.docs);

      res.json({
        success: true,
        count: result.docs.length,
        pagination: {
          total: result.totalDocs,
          page: result.page,
          pages: result.totalPages,
          limit: result.limit
        },
        data: result.docs
      });

    } catch (error) {
      return next(AppError.serverError('Erreur lors de la récupération de l\'historique', { 
        originalError: error.message 
      }));
    }
  }

  async modifierDetailsTrajet(req, res, next) {
    return this.modifierTrajet(req, res, next);
  }

  async changerNombrePlaces(req, res, next) {
    try {
      const { id } = req.params;
      const { nombrePlacesDisponibles } = req.body;

      const trajet = await Trajet.findById(id);
      if (!trajet) {
        return res.status(404).json({
          success: false,
          message: 'Trajet non trouvé'
        });
      }

      if (trajet.conducteurId.toString() !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'Non autorisé'
        });
      }

      if (trajet.statutTrajet !== 'PROGRAMME') {
        return res.status(400).json({
          success: false,
          message: 'Seuls les trajets programmés peuvent être modifiés'
        });
      }

      trajet.nombrePlacesDisponibles = nombrePlacesDisponibles;
      await trajet.save();

      res.json({
        success: true,
        message: 'Nombre de places mis à jour',
        data: { nombrePlacesDisponibles: trajet.nombrePlacesDisponibles }
      });

    } catch (error) {
      return next(AppError.serverError('Erreur lors de la modification des places', { 
        originalError: error.message 
      }));
    }
  }

  async modifierPreferences(req, res, next) {
    try {
      const { id } = req.params;

      const trajet = await Trajet.findById(id);
      if (!trajet) {
        return res.status(404).json({
          success: false,
          message: 'Trajet non trouvé'
        });
      }

      if (trajet.conducteurId.toString() !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'Non autorisé'
        });
      }

      const preferencesModifiables = [
        'accepteFemmesSeulement',
        'accepteHommesSeuleument',
        'accepteBagages',
        'typeBagages',
        'musique',
        'conversation',
        'fumeur',
        'animauxAcceptes',        
        'climatisationActive'      
      ];

      preferencesModifiables.forEach(pref => {
        if (req.body[pref] !== undefined) {
          trajet.preferences[pref] = req.body[pref];
        }
      });

      await trajet.save();

      res.json({
        success: true,
        message: 'Préférences mises à jour',
        data: { preferences: trajet.preferences }
      });

    } catch (error) {
      return next(AppError.serverError('Erreur lors de la modification des préférences', { 
        originalError: error.message 
      }));
    }
  }

// ==================== RECHERCHE CORRIGÉE ====================

async rechercherTrajetsDisponibles(req, res, next) {
  try {
    const {
      longitude,
      latitude,
      rayonKm = 10,
      dateDepart,
      dateFin,
      prixMax,
      nombrePlacesMin = 1,
      page = 1,
      limit = 20
    } = req.query;

    // ✅ CORRECTION 1: Query de base plus claire
    let baseQuery = {
      statutTrajet: 'PROGRAMME',
      nombrePlacesDisponibles: { $gte: parseInt(nombrePlacesMin) }
      // ✅ Les trajets TERMINÉ sont exclus automatiquement (statutTrajet = 'PROGRAMME' uniquement)
    };

    // ✅ CORRECTION 2: Normalisation UTC cohérente des dates
    if (dateDepart && dateFin) {
      // Recherche sur une plage de dates
      baseQuery.dateDepart = {
        $gte: this._normalizeToStartOfDay(dateDepart),
        $lte: this._normalizeToEndOfDay(dateFin)
      };
      console.log('📅 Filtre dates:', {
        debut: this._normalizeToStartOfDay(dateDepart).toISOString(),
        fin: this._normalizeToEndOfDay(dateFin).toISOString()
      });
    } else if (dateDepart) {
      // Recherche à partir d'une date spécifique
      baseQuery.dateDepart = {
        $gte: this._normalizeToStartOfDay(dateDepart)
      };
      console.log('📅 Filtre à partir de:', this._normalizeToStartOfDay(dateDepart).toISOString());
    } else {
      // Recherche à partir d'aujourd'hui
      baseQuery.dateDepart = {
        $gte: this._getStartOfToday()
      };
      console.log('📅 Filtre à partir d\'aujourd\'hui:', this._getStartOfToday().toISOString());
    }

    // ✅ CORRECTION 3: Validation du prix
    if (prixMax) {
      const prix = parseInt(prixMax);
      if (!isNaN(prix) && prix > 0) {
        baseQuery.prixParPassager = { $lte: prix };
        console.log('💰 Filtre prix max:', prix);
      }
    }

    // ✅ CORRECTION 4: Log de la query complète pour debug
    console.log('🔍 Query de recherche:', JSON.stringify(baseQuery, null, 2));

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    let result;

    // ==================== RECHERCHE GÉOSPATIALE ====================
    if (longitude && latitude) {
      try {
        const long = parseFloat(longitude);
        const lat = parseFloat(latitude);
        
        // ✅ Validation des coordonnées
        if (isNaN(long) || isNaN(lat) || long < -180 || long > 180 || lat < -90 || lat > 90) {
          throw new Error('Coordonnées invalides');
        }
        
        const maxDistance = parseInt(rayonKm) * 1000;

        console.log('🗺️ Recherche géospatiale:', {
          centre: [long, lat],
          rayon: `${rayonKm} km`,
          maxDistance: `${maxDistance} m`
        });

        const pipeline = [
          {
            $geoNear: {
              near: {
                type: "Point",
                coordinates: [long, lat]
              },
              distanceField: "distanceFromSearch",
              maxDistance: maxDistance,
              spherical: true,
              query: baseQuery,  // ✅ La query normalisée est passée ici
              key: "pointDepart.coordonnees"
            }
          },
          {
            $sort: { dateDepart: 1, distanceFromSearch: 1 }
          },
          {
            $facet: {
              metadata: [
                { $count: "total" }
              ],
              data: [
                { $skip: skip },
                { $limit: limitNum },
                {
                  $lookup: {
                    from: 'utilisateurs',
                    localField: 'conducteurId',
                    foreignField: '_id',
                    as: 'conducteurInfo'
                  }
                },
                {
                  $unwind: {
                    path: '$conducteurInfo',
                    preserveNullAndEmptyArrays: true
                  }
                },
                {
                  $addFields: {
                    'conducteurId': {
                      _id: '$conducteurInfo._id',
                      nom: '$conducteurInfo.nom',
                      prenom: '$conducteurInfo.prenom',
                      photoProfil: '$conducteurInfo.photoProfil',
                      noteGenerale: '$conducteurInfo.noteGenerale'
                    },
                    distanceKm: { 
                      $round: [{ $divide: ['$distanceFromSearch', 1000] }, 2] 
                    }
                  }
                },
                {
                  $project: {
                    conducteurInfo: 0,
                    distanceFromSearch: 0
                  }
                }
              ]
            }
          }
        ];

        const aggregationResult = await Trajet.aggregate(pipeline);

        const total = aggregationResult[0]?.metadata[0]?.total || 0;
        const trajets = aggregationResult[0]?.data || [];

        result = {
          docs: trajets,
          totalDocs: total,
          limit: limitNum,
          page: pageNum,
          totalPages: Math.ceil(total / limitNum),
          hasNextPage: pageNum < Math.ceil(total / limitNum),
          hasPrevPage: pageNum > 1
        };

        result.docs = this._attachIsExpired(result.docs);

        console.log(`✅ Recherche géospatiale: ${total} trajet(s) trouvé(s)`);

      } catch (geoError) {
        console.error('❌ Erreur recherche géospatiale:', geoError.message);
        console.log('⚠️ Fallback vers recherche standard');
        
        // Fallback vers recherche normale
        const options = {
          page: pageNum,
          limit: limitNum,
          sort: { dateDepart: 1 },
          populate: { path: 'conducteurId', select: 'nom prenom photoProfil noteGenerale' },
          lean: true
        };
        
        result = await Trajet.paginate(baseQuery, options);
        result.docs = this._attachIsExpired(result.docs);
      }
    } else {
      // ==================== RECHERCHE STANDARD ====================
      console.log('📋 Recherche standard (sans géolocalisation)');
      
      const options = {
        page: pageNum,
        limit: limitNum,
        sort: { dateDepart: 1 },
        populate: { path: 'conducteurId', select: 'nom prenom photoProfil noteGenerale' },
        lean: true
      };
      
      result = await Trajet.paginate(baseQuery, options);
      result.docs = this._attachIsExpired(result.docs);
      
      console.log(`✅ Recherche standard: ${result.totalDocs} trajet(s) trouvé(s)`);
    }

    // ==================== VÉRIFICATION RÉSERVATIONS ====================
    let currentUserId = req.user?._id || req.user?.id || req.user?.userId;
    
    if (!currentUserId && req.headers.authorization) {
      try {
        const token = req.headers.authorization.replace('Bearer ', '');
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        currentUserId = decoded._id || decoded.id || decoded.userId;
        console.log('✅ UserId récupéré depuis le token:', currentUserId);
      } catch (error) {
        console.log('⚠️ Token invalide ou absent');
      }
    }
    
    if (currentUserId && result.docs.length > 0) {
      console.log(`🔍 Vérification des réservations pour ${currentUserId}`);
      const Reservation = require('../models/Reservation');
      const trajetIds = result.docs.map(t => t._id || t.id);
      
      const reservationsExistantes = await Reservation.find({
        passagerId: currentUserId,
        trajetId: { $in: trajetIds },
        statutReservation: { $in: ['EN_ATTENTE', 'CONFIRMEE'] }
      }).select('trajetId statutReservation').lean();
      
      const reservationMap = new Map(
        reservationsExistantes.map(r => [r.trajetId.toString(), r.statutReservation])
      );
      
      result.docs = result.docs.map(trajet => {
        const trajetObj = trajet.toJSON ? trajet.toJSON() : trajet;
        const trajetId = (trajetObj._id || trajetObj.id).toString();
        const reservationStatut = reservationMap.get(trajetId);
        
        return {
          ...trajetObj,
          isReservedByUser: !!reservationStatut,
          userReservationStatus: reservationStatut || null
        };
      });

      // ✅ NOUVEAU : Masquer les trajets TERMINÉ
      result.docs = result.docs.filter(trajet => trajet.statutTrajet !== 'TERMINE');

      console.log(`✅ ${reservationsExistantes.length} réservation(s) trouvée(s)`);
    }

    // ✅ CORRECTION 5: Log final des résultats
    console.log(`📊 Résultats finaux: ${result.docs.length}/${result.totalDocs} trajets`);

    res.json({
      success: true,
      count: result.docs.length,
      pagination: {
        total: result.totalDocs,
        page: result.page,
        pages: result.totalPages,
        limit: result.limit
      },
      filters: {  // ✅ Retourner les filtres appliqués pour debug
        dateDepart: dateDepart || 'aujourd\'hui',
        dateFin: dateFin || null,
        prixMax: prixMax || null,
        nombrePlacesMin,
        rayon: longitude && latitude ? `${rayonKm} km` : null
      },
      data: result.docs
    });

  } catch (error) {
    console.error('❌ Erreur dans rechercherTrajetsDisponibles:', error);
    return next(AppError.serverError('Erreur serveur lors de la recherche de trajets', { 
      originalError: error.message,
      stack: error.stack
    }));
  }
}

  async obtenirTrajetParId(req, res, next) {
    try {
      const { id } = req.params;

      const trajet = await Trajet.findById(id)
        .populate('conducteurId', '-password -email');

      if (!trajet) {
        return res.status(404).json({
          success: false,
          message: 'Trajet non trouvé'
        });
      }

      if (trajet.estExpire() && trajet.statutTrajet === 'PROGRAMME') {
        await trajet.marquerCommeExpire();
      }

      // ✅ Vérifier si l'utilisateur a déjà réservé ce trajet
    const currentUserId = req.user?._id || req.user?.id || req.user?.userId;
    let isReservedByUser = false;
    let userReservationStatus = null;

    if (currentUserId) {
      const Reservation = require('../models/Reservation');
      const reservationExistante = await Reservation.findOne({
        passagerId: currentUserId,
        trajetId: id,
        statutReservation: { $in: ['EN_ATTENTE', 'CONFIRMEE'] }
      }).select('statutReservation').lean();
      
      if (reservationExistante) {
        isReservedByUser = true;
        userReservationStatus = reservationExistante.statutReservation;
      }
    }

    await trajet.populate('conducteurId', '-password -email');
    const trajetObj = this._attachIsExpired([trajet])[0];

    res.json({
      success: true,
      data: {
        ...trajetObj,
        isReservedByUser,       
        userReservationStatus    
      }
    });

    } catch (error) {
      return next(AppError.serverError('Erreur serveur lors de la récupération du trajet', { 
        originalError: error.message 
      }));
    }
  }

  async obtenirMesTrajets(req, res, next) {
    try {
      const { statut, page = 1, limit = 20 } = req.query;

      let query = {
        conducteurId: req.user.id
      };

      if (statut) {
        query.statutTrajet = statut;
      }

      const options = {
        page: parseInt(page),
        limit: parseInt(limit),
        sort: { dateDepart: -1 }
      };

      const trajets = await Trajet.paginate(query, options);

      for (let trajet of trajets.docs) {
        if (trajet.statutTrajet === 'PROGRAMME' && trajet.estExpire()) {
          await trajet.marquerCommeExpire();
        }
      }

      // Normaliser la virtual `isExpired` après éventuelle mise à jour
      trajets.docs = this._attachIsExpired(trajets.docs);

      res.json({
        success: true,
        count: trajets.docs.length,
        pagination: {
          total: trajets.totalDocs,
          page: trajets.page,
          pages: trajets.totalPages,
          limit: trajets.limit
        },
        data: trajets.docs
      });

    } catch (error) {
      return next(AppError.serverError('Erreur serveur lors de la récupération des trajets', { 
        originalError: error.message 
      }));
    }
  }

  async obtenirTrajetsParConducteur(req, res, next) {
    try {
      const { conducteurId } = req.params;
      const { page = 1, limit = 20 } = req.query;

      const query = this._buildActiveTripsQuery({ conducteurId } , true);

      const options = {
        page: parseInt(page),
        limit: parseInt(limit),
        sort: { dateDepart: 1 },
        populate: { path: 'conducteurId', select: 'nom prenom photoProfil noteGenerale' }
      };

      const trajets = await Trajet.paginate(query, options);

      // Normaliser la virtual `isExpired`
      trajets.docs = this._attachIsExpired(trajets.docs);

      res.json({
        success: true,
        count: trajets.docs.length,
        pagination: {
          total: trajets.totalDocs,
          page: trajets.page,
          pages: trajets.totalPages,
          limit: trajets.limit
        },
        data: trajets.docs
      });

    } catch (error) {
      return next(AppError.serverError('Erreur serveur lors de la récupération des trajets', { 
        originalError: error.message 
      }));
    }
  }

  async obtenirTrajetsRecurrents(req, res, next) {
    try {
      const { conducteurId } = req.query;
      const { page = 1, limit = 20 } = req.query;

      const query = conducteurId 
        ? { typeTrajet: 'RECURRENT', conducteurId }
        : { typeTrajet: 'RECURRENT' };

      const options = {
        page: parseInt(page),
        limit: parseInt(limit),
        sort: { createdAt: -1 }
      };

      const trajets = await Trajet.paginate(query, options);

      // Normaliser la virtual `isExpired`
      trajets.docs = this._attachIsExpired(trajets.docs);

      res.json({
        success: true,
        count: trajets.docs.length,
        pagination: {
          total: trajets.totalDocs,
          page: trajets.page,
          pages: trajets.totalPages,
          limit: trajets.limit
        },
        data: trajets.docs
      });

    } catch (error) {
      return next(AppError.serverError('Erreur serveur lors de la récupération des trajets récurrents', { 
        originalError: error.message 
      }));
    }
  }

  // ==================== UPDATE ====================
  // ... (tes méthodes UPDATE restent identiques)

  async modifierTrajet(req, res, next) {
    try {
      const { id } = req.params;
      const errors = validationResult(req);
      
      if (!errors.isEmpty()) {
        return res.status(400).json({ 
          success: false, 
          message: 'Erreurs de validation', 
          errors: errors.array() 
        });
      }

      const trajet = await Trajet.findById(id);
      if (!trajet) {
        return res.status(404).json({
          success: false,
          message: 'Trajet non trouvé'
        });
      }

      if (trajet.conducteurId.toString() !== req.user.id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Vous n\'êtes pas autorisé à modifier ce trajet'
        });
      }

      if (trajet.statutTrajet === 'EXPIRE') {
        return res.status(400).json({
          success: false,
          message: 'Impossible de modifier un trajet expiré'
        });
      }

      if (trajet.estExpire()) {
        await trajet.marquerCommeExpire();
        return res.status(400).json({
          success: false,
          message: 'Ce trajet a expiré et ne peut plus être modifié'
        });
      }

      if (trajet.statutTrajet !== 'PROGRAMME') {
        return res.status(400).json({
          success: false,
          message: 'Seuls les trajets programmés peuvent être modifiés'
        });
      }

      const champsModifiables = [
        'pointDepart',
        'pointArrivee',
        'arretsIntermediaires',
        'dateDepart',
        'heureDepart',
        // ⭐ SUPPRIMÉ: heureArriveePrevue, dureeEstimee, distance
        // (calculés automatiquement par le hook)
        'prixParPassager',
        'nombrePlacesDisponibles',
        'vehiculeUtilise',
        'preferences',
        'commentaireConducteur'
      ];

      champsModifiables.forEach(champ => {
        if (req.body[champ] !== undefined) {
          trajet[champ] = req.body[champ];
        }
      });

      if (req.body.dateDepart) {
        const nouvelleDateDepart = new Date(req.body.dateDepart);
          const heureDepart = req.body.heureDepart || trajet.heureDepart;
          
          // Créer la date/heure complète
          const [heures, minutes] = heureDepart.split(':').map(Number);
          nouvelleDateDepart.setHours(heures, minutes, 0, 0);
        if (nouvelleDateDepart < new Date()) {
          return res.status(400).json({
            success: false,
            message: 'La nouvelle date de départ doit être dans le futur'
          });
        }
      }

      if(trajet.statutTrajet == 'EXPIRE'){
        trajet.statutTrajet = 'PROGRAMME';
      }

      // ⭐ Le hook va recalculer automatiquement distance/durée/arrivée
      await trajet.save();

      await trajet.populate('conducteurId', 'nom prenom photoProfil');

      // Normaliser isExpired avant retour
      const trajetObj = this._attachIsExpired([trajet])[0];

      res.json({
        success: true,
        message: 'Trajet modifié avec succès',
        data: trajetObj
      });

    } catch (error) {
      if (error.name === 'ValidationError') {
        return res.status(400).json({
          success: false,
          message: 'Erreur de validation',
          errors: Object.values(error.errors).map(err => err.message)
        });
      }
      return next(AppError.serverError('Erreur serveur lors de la modification du trajet', { 
        originalError: error.message 
      }));
    }
  }

  async mettreAJourStatut(req, res, next) {
    try {
      const { id } = req.params;
      const { statutTrajet } = req.body;

      const trajet = await Trajet.findById(id);
      if (!trajet) {
        return res.status(404).json({
          success: false,
          message: 'Trajet non trouvé'
        });
      }

      if (trajet.conducteurId.toString() !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'Vous n\'êtes pas autorisé à modifier ce trajet'
        });
      }

      const statutsValides = ['PROGRAMME', 'EN_COURS', 'TERMINE', 'ANNULE', 'EXPIRE'];
      if (!statutsValides.includes(statutTrajet)) {
        return res.status(400).json({
          success: false,
          message: 'Statut invalide'
        });
      }

      if (trajet.estExpire() && trajet.statutTrajet === 'PROGRAMME') {
        await trajet.marquerCommeExpire();
        return res.status(400).json({
          success: false,
          message: 'Ce trajet a expiré automatiquement'
        });
      }

      const ancienStatut = trajet.statutTrajet;
      trajet.statutTrajet = statutTrajet;
      await trajet.save();

      await this.gererNotificationsStatut(trajet, ancienStatut, statutTrajet);

      // Retourner le trajet avec isExpired normalisé
      await trajet.populate('conducteurId', 'nom prenom photoProfil');
      const trajetObj = this._attachIsExpired([trajet])[0];

      res.json({
        success: true,
        message: `Statut du trajet changé de ${ancienStatut} à ${statutTrajet}`,
        data: trajetObj
      });

    } catch (error) {
      return next(AppError.serverError('Erreur serveur lors de la mise à jour du statut', { 
        originalError: error.message 
      }));
    }
  }

  // ==================== DELETE ====================
  // ... (tes méthodes DELETE restent identiques)

  async annulerTrajet(req, res, next) {
    try {
      const { id } = req.params;
      const { motifAnnulation } = req.body;

      const trajet = await Trajet.findById(id);
      if (!trajet) {
        return res.status(404).json({
          success: false,
          message: 'Trajet non trouvé'
        });
      }

      if (trajet.conducteurId.toString() !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'Vous n\'êtes pas autorisé à annuler ce trajet'
        });
      }

      if (trajet.statutTrajet === 'TERMINE' || 
          trajet.statutTrajet === 'ANNULE' || 
          trajet.statutTrajet === 'EXPIRE') {
        return res.status(400).json({
          success: false,
          message: 'Ce trajet ne peut pas être annulé'
        });
      }

      trajet.statutTrajet = 'ANNULE';
      if (motifAnnulation) {
        trajet.commentaireConducteur = motifAnnulation;
      }
      await trajet.save();

      await this.envoyerNotificationsAnnulation(trajet, motifAnnulation);

      // Retourner le trajet normalisé
      await trajet.populate('conducteurId', 'nom prenom photoProfil');
      const trajetObj = this._attachIsExpired([trajet])[0];

      res.json({
        success: true,
        message: 'Trajet annulé avec succès',
        data: trajetObj
      });

    } catch (error) {
      return next(AppError.serverError('Erreur serveur lors de l\'annulation du trajet', { 
        originalError: error.message 
      }));
    }
  }

  async supprimerTrajetRecurrent(req, res, next) {
    try {
      const { id } = req.params;

      const trajet = await Trajet.findById(id);
      if (!trajet) {
        return res.status(404).json({
          success: false,
          message: 'Trajet non trouvé'
        });
      }

      if (trajet.conducteurId.toString() !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'Vous n\'êtes pas autorisé à supprimer ce trajet'
        });
      }

      if (trajet.typeTrajet !== 'RECURRENT') {
        return res.status(400).json({
          success: false,
          message: 'Cette action est réservée aux trajets récurrents'
        });
      }

      if (trajet.statutTrajet === 'EN_COURS') {
        return res.status(400).json({
          success: false,
          message: 'Impossible de supprimer un trajet en cours'
        });
      }

      try {
        const Reservation = require('../models/Reservation');
        const reservationsActives = await Reservation.countDocuments({ 
          trajetId: id, 
          statut: { $in: ['CONFIRMEE', 'EN_ATTENTE'] } 
        });

        if (reservationsActives > 0) {
          return res.status(400).json({
            success: false,
            message: `Impossible de supprimer un trajet avec ${reservationsActives} réservation(s) active(s)`
          });
        }
      } catch (err) {
        console.log('Modèle Reservation non disponible');
      }

      trajet.statutTrajet = 'ANNULE';
      trajet.commentaireConducteur = 'Trajet récurrent supprimé par le conducteur';
      await trajet.save();

      res.json({
        success: true,
        message: 'Trajet récurrent annulé avec succès'
      });

    } catch (error) {
      return next(AppError.serverError('Erreur serveur lors de la suppression du trajet', { 
        originalError: error.message 
      }));
    }
  }

  // ==================== MÉTHODES EXPIRATION ====================
  // ... (tes méthodes EXPIRATION restent identiques)

  async verifierExpiration(req, res, next) {
    try {
      const { id } = req.params;

      const trajet = await Trajet.findById(id);
      if (!trajet) {
        return res.status(404).json({
          success: false,
          message: 'Trajet non trouvé'
        });
      }

      const etaitExpire = trajet.estExpire();
      if (etaitExpire) {
        await trajet.marquerCommeExpire();
      }

      res.json({
        success: true,
        data: {
          id: trajet._id,
          estExpire: etaitExpire,
          statutActuel: trajet.statutTrajet,
          dateExpiration: trajet.dateExpiration,
          raisonExpiration: trajet.raisonExpiration
        }
      });

    } catch (error) {
      return next(AppError.serverError('Erreur lors de la vérification d\'expiration', { 
        originalError: error.message 
      }));
    }
  }

/**
 * ⭐  Met à jour automatiquement avant de récupérer
 */
async obtenirTrajetsExpires(req, res, next) {
  try {
    const { page = 1, limit = 20 } = req.query;

    // Marquer d'abord les trajets expirés
    console.log('🔄 Mise à jour des trajets expirés...');
    const resultTrajets = await Trajet.marquerTrajetsExpires();
    const resultRecurrences = await Trajet.marquerRecurrencesExpirees();
    
    const totalMisAJour = resultTrajets.modifiedCount + resultRecurrences.modifiedCount;
    if (totalMisAJour > 0) {
      console.log(`✅ ${totalMisAJour} trajet(s) marqué(s) comme expiré(s)`);
    }

    const query = {
      statutTrajet: 'EXPIRE'
    };

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { dateExpiration: -1 },
      populate: { path: 'conducteurId', select: 'nom prenom' },
      includeExpired: true  // ⭐ AJOUT CRITIQUE
    };

    const trajets = await Trajet.paginate(query, options);

    // Normaliser la virtual `isExpired`
    trajets.docs = this._attachIsExpired(trajets.docs);

    res.json({
      success: true,
      count: trajets.docs.length,
      pagination: {
        total: trajets.totalDocs,
        page: trajets.page,
        pages: trajets.totalPages,
        limit: trajets.limit
      },
      data: trajets.docs,
      meta: {
        trajetsExpires: totalMisAJour > 0 ? `${totalMisAJour} trajet(s) viennent d'être marqués comme expirés` : null
      }
    });

  } catch (error) {
    return next(AppError.serverError('Erreur lors de la récupération des trajets expirés', { 
      originalError: error.message 
    }));
  }
}

  // ==================== MÉTHODES UTILITAIRES ====================

// Normalise la virtual `isExpired` pour les objets renvoyés par
// aggregate/lean/paginate (qui peuvent être des POJO sans virtuals)
_attachIsExpired(docs) {
  if (!docs) return docs;
  return docs.map(d => {
    const obj = (d && typeof d.toObject === 'function') ? d.toObject() : d;
    
    const dateDepart = obj.dateDepart ? new Date(obj.dateDepart) : null;
    const heureDepart = obj.heureDepart;
    const now = new Date();
    
    if (dateDepart && heureDepart) {
      const [heures, minutes] = heureDepart.split(':').map(Number);
      const dateDepartComplete = new Date(dateDepart);
      dateDepartComplete.setUTCHours(heures, minutes, 0, 0);  // ✅ CORRECTION : setUTCHours
      
      obj.isExpired = (obj.statutTrajet === 'EXPIRE') || 
                      (dateDepartComplete < now && obj.statutTrajet === 'PROGRAMME');
    } else if (dateDepart && !heureDepart) {
      obj.isExpired = (obj.statutTrajet === 'EXPIRE') || (dateDepart < now && obj.statutTrajet === 'PROGRAMME');
    } else {
      obj.isExpired = obj.statutTrajet === 'EXPIRE';
    }
    
    return obj;
  });
}

async gererNotificationsStatut(trajet, ancienStatut, nouveauStatut) {
  console.log(`Notification: Trajet ${trajet._id} changé de ${ancienStatut} à ${nouveauStatut}`);
}

async envoyerNotificationsAnnulation(trajet, motif) {
  console.log(`Notification d'annulation pour le trajet ${trajet._id}: ${motif}`);
}
}

module.exports = new TrajetController();