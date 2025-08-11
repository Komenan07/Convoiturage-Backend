const Reservation = require('../models/Reservation');
const Trajet = require('../models/Trajet');
const rateLimit = require('express-rate-limit');

/**
 * Middleware de limitation de taux pour les réservations
 */
const reservationRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Maximum 5 réservations par 15 minutes
  message: {
    success: false,
    message: 'Trop de tentatives de réservation. Veuillez attendre 15 minutes.',
    retryAfter: 900
  },
  keyGenerator: (req) => {
    return `reservation_${req.user.id}`;
  },
  skip: (req) => {
    // Ignorer la limitation pour certaines actions (consultation, modification)
    return req.method === 'GET' || req.path.includes('/statut');
  }
});

/**
 * Middleware pour vérifier les permissions de réservation
 */
const checkReservationPermissions = async (req, res, next) => {
  try {
    const userId = req.user.id;
    
    // Vérifier que l'utilisateur est vérifié
    const Utilisateur = require('../models/Utilisateur');
    const utilisateur = await Utilisateur.findById(userId);
    
    if (!utilisateur) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    if (!utilisateur.estVerifie) {
      return res.status(403).json({
        success: false,
        message: 'Votre compte doit être vérifié pour faire des réservations',
        codeErreur: 'COMPTE_NON_VERIFIE'
      });
    }

    if (utilisateur.statutCompte !== 'ACTIF') {
      return res.status(403).json({
        success: false,
        message: 'Votre compte est suspendu ou bloqué',
        codeErreur: 'COMPTE_SUSPENDU'
      });
    }

    // Vérifier le score de confiance minimum
    if (utilisateur.scoreConfiance < 30) {
      return res.status(403).json({
        success: false,
        message: 'Votre score de confiance est trop bas pour effectuer des réservations',
        codeErreur: 'SCORE_CONFIANCE_INSUFFISANT',
        scoreActuel: utilisateur.scoreConfiance
      });
    }

    req.utilisateur = utilisateur;
    next();
  } catch (error) {
    console.error('Erreur lors de la vérification des permissions:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la vérification des permissions'
    });
  }
};

/**
 * Middleware pour vérifier les réservations en double
 */
const checkDuplicateReservation = async (req, res, next) => {
  try {
    const { trajetId } = req.body;
    const userId = req.user.id;

    // Vérifier s'il existe déjà une réservation active
    const reservationExistante = await Reservation.findOne({
      trajetId,
      passagerId: userId,
      statutReservation: { $nin: ['ANNULEE', 'REFUSEE', 'TERMINEE'] }
    });

    if (reservationExistante) {
      return res.status(409).json({
        success: false,
        message: 'Vous avez déjà une réservation active pour ce trajet',
        codeErreur: 'RESERVATION_EXISTANTE',
        reservationId: reservationExistante._id
      });
    }

    next();
  } catch (error) {
    console.error('Erreur lors de la vérification de doublon:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la vérification de doublon'
    });
  }
};

/**
 * Middleware pour vérifier la disponibilité du trajet
 */
const checkTrajetAvailability = async (req, res, next) => {
  try {
    const { trajetId, nombrePlacesReservees } = req.body;

    const trajet = await Trajet.findById(trajetId).populate('conducteurId', 'statutCompte');
    
    if (!trajet) {
      return res.status(404).json({
        success: false,
        message: 'Trajet non trouvé'
      });
    }

    // Vérifier que le trajet est programmé
    if (trajet.statutTrajet !== 'PROGRAMME') {
      return res.status(400).json({
        success: false,
        message: 'Ce trajet n\'est pas disponible pour réservation',
        codeErreur: 'TRAJET_NON_DISPONIBLE',
        statutTrajet: trajet.statutTrajet
      });
    }

    // Vérifier que le trajet n'est pas passé
    if (new Date(trajet.dateDepart) <= new Date()) {
      return res.status(400).json({
        success: false,
        message: 'Impossible de réserver un trajet passé',
        codeErreur: 'TRAJET_PASSE'
      });
    }

    // Vérifier que le conducteur est actif
    if (trajet.conducteurId.statutCompte !== 'ACTIF') {
      return res.status(400).json({
        success: false,
        message: 'Le conducteur de ce trajet n\'est plus disponible',
        codeErreur: 'CONDUCTEUR_INACTIF'
      });
    }

    // Vérifier la disponibilité des places
    const disponibilite = await Reservation.verifierDisponibilite(trajetId, nombrePlacesReservees);
    if (!disponibilite.disponible) {
      return res.status(409).json({
        success: false,
        message: 'Pas assez de places disponibles',
        codeErreur: 'PLACES_INSUFFISANTES',
        placesDisponibles: disponibilite.placesDisponibles,
        placesRequises: nombrePlacesReservees
      });
    }

    req.trajet = trajet;
    req.disponibilite = disponibilite;
    next();
  } catch (error) {
    console.error('Erreur lors de la vérification de disponibilité:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la vérification de disponibilité'
    });
  }
};

/**
 * Middleware pour valider les coordonnées géographiques
 */
const validateCoordinates = (req, res, next) => {
  try {
    const { pointPriseEnCharge, pointDepose } = req.body;

    const validerPoint = (point, nomPoint) => {
      if (!point || !point.coordonnees || !point.coordonnees.coordinates) {
        throw new Error(`Coordonnées manquantes pour ${nomPoint}`);
      }

      const [longitude, latitude] = point.coordonnees.coordinates;
      
      if (typeof longitude !== 'number' || typeof latitude !== 'number') {
        throw new Error(`Coordonnées invalides pour ${nomPoint}: doivent être des nombres`);
      }

      if (longitude < -180 || longitude > 180) {
        throw new Error(`Longitude invalide pour ${nomPoint}: doit être entre -180 et 180`);
      }

      if (latitude < -90 || latitude > 90) {
        throw new Error(`Latitude invalide pour ${nomPoint}: doit être entre -90 et 90`);
      }

      // Vérification spécifique pour la Côte d'Ivoire (approximative)
      if (longitude < -8.6 || longitude > -2.5 || latitude < 4.3 || latitude > 10.7) {
        console.warn(`Coordonnées hors de la Côte d'Ivoire pour ${nomPoint}: [${longitude}, ${latitude}]`);
      }
    };

    if (pointPriseEnCharge) {
      validerPoint(pointPriseEnCharge, 'point de prise en charge');
    }

    if (pointDepose) {
      validerPoint(pointDepose, 'point de dépose');
    }

    next();
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
      codeErreur: 'COORDONNEES_INVALIDES'
    });
  }
};

/**
 * Middleware pour calculer et valider la distance du trajet
 */
const validateTripDistance = async (req, res, next) => {
  try {
    const { pointPriseEnCharge, pointDepose } = req.body;
    
    if (pointPriseEnCharge && pointDepose) {
      const [lon1, lat1] = pointPriseEnCharge.coordonnees.coordinates;
      const [lon2, lat2] = pointDepose.coordonnees.coordinates;

      // Calculer la distance
      const R = 6371; // Rayon de la Terre en km
      const dLat = (lat2 - lat1) * Math.PI / 180;
      const dLon = (lon2 - lon1) * Math.PI / 180;
      const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                Math.sin(dLon/2) * Math.sin(dLon/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      const distance = R * c;

      // Validation de la distance
      if (distance < 0.5) {
        return res.status(400).json({
          success: false,
          message: 'La distance entre les points est trop courte (minimum 500m)',
          codeErreur: 'DISTANCE_TROP_COURTE',
          distance: Math.round(distance * 1000) // en mètres
        });
      }

      if (distance > 500) {
        return res.status(400).json({
          success: false,
          message: 'La distance entre les points est trop importante (maximum 500km)',
          codeErreur: 'DISTANCE_TROP_LONGUE',
          distance: Math.round(distance)
        });
      }

      req.distanceTrajet = distance;
    }

    next();
  } catch (error) {
    console.error('Erreur lors du calcul de distance:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la validation de la distance'
    });
  }
};

/**
 * Middleware pour les notifications en temps réel
 */
const setupRealtimeNotifications = (io) => {
  return (req, res, next) => {
    req.io = io;
    next();
  };
};

/**
 * Middleware pour logger les actions importantes
 */
const logReservationActions = (req, res, next) => {
  const originalSend = res.send;
  
  res.send = function(data) {
    // Logger uniquement les succès pour les actions importantes
    if (res.statusCode >= 200 && res.statusCode < 300) {
      const action = req.method + ' ' + req.route.path;
      const userId = req.user?.id;
      const reservationId = req.params?.id || (typeof data === 'string' ? JSON.parse(data)?.data?._id : data?.data?._id);

      console.log(`[RESERVATION] ${action} - Utilisateur: ${userId} - Réservation: ${reservationId} - Status: ${res.statusCode}`);
      
      // Optionnel: Sauvegarder dans une collection d'audit
      // AuditLog.create({ action, userId, ressourceId: reservationId, timestamp: new Date() });
    }

    originalSend.call(this, data);
  };

  next();
};

/**
 * Middleware pour gérer le cache des réservations fréquentes
 */
const cacheReservationData = (duration = 300) => { // 5 minutes par défaut
  const cache = new Map();

  return (req, res, next) => {
    // Uniquement pour les requêtes GET
    if (req.method !== 'GET') {
      return next();
    }

    const key = `${req.user.id}_${req.originalUrl}`;
    const cachedData = cache.get(key);

    if (cachedData && (Date.now() - cachedData.timestamp) < (duration * 1000)) {
      return res.json(cachedData.data);
    }

    // Override res.json pour mettre en cache
    const originalJson = res.json;
    res.json = function(data) {
      if (res.statusCode === 200) {
        cache.set(key, {
          data,
          timestamp: Date.now()
        });

        // Nettoyer le cache périodiquement
        if (cache.size > 1000) {
          const oldestKey = cache.keys().next().value;
          cache.delete(oldestKey);
        }
      }

      originalJson.call(this, data);
    };

    next();
  };
};

module.exports = {
  reservationRateLimit,
  checkReservationPermissions,
  checkDuplicateReservation,
  checkTrajetAvailability,
  validateCoordinates,
  validateTripDistance,
  setupRealtimeNotifications,
  logReservationActions,
  cacheReservationData
};