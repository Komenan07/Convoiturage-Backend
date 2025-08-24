// routes/waze.js - Routes API pour l'intégration Waze

const express = require('express');
const router = express.Router();
const wazeService = require('../services/waze');
const Trajet = require('../models/Trajet');
const Reservation = require('../models/Reservation');
const { authenticate, optionalAuth } = require('../middlewares/auth');
const { isValidCoordinates } = require('../utils/helpers');

// @route   POST /api/waze/navigation
// @desc    Générer une URL de navigation Waze
// @access  Public
router.post('/navigation', optionalAuth, async (req, res) => {
  try {
    const { destination, options = {}, userAgent } = req.body;

    // Validation des données
    if (!destination || !destination.coordinates) {
      return res.status(400).json({
        success: false,
        message: 'Destination avec coordonnées requise'
      });
    }

    if (!isValidCoordinates(destination.coordinates)) {
      return res.status(400).json({
        success: false,
        message: 'Coordonnées GPS invalides'
      });
    }

    // Vérifier la disponibilité de Waze
    const wazeAvailability = wazeService.checkWazeAvailability(
      userAgent || req.get('User-Agent')
    );

    // Générer les URLs de navigation
    const webURL = wazeService.generateWebNavigationURL(destination, options);
    const mobileLinks = wazeService.generateMobileDeepLinks(destination, options);

    res.json({
      success: true,
      navigation: {
        webURL,
        mobileLinks,
        availability: wazeAvailability,
        destination,
        options
      }
    });

  } catch (error) {
    console.error('Erreur génération navigation Waze:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la génération de la navigation',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   POST /api/waze/route
// @desc    Créer un itinéraire multi-points
// @access  Private
router.post('/route', authenticate, async (req, res) => {
  try {
    const { waypoints, options = {} } = req.body;

    // Validation des waypoints
    if (!waypoints || !Array.isArray(waypoints) || waypoints.length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Au moins 2 points de passage sont requis'
      });
    }

    // Valider chaque waypoint
    for (const waypoint of waypoints) {
      if (!waypoint.coordinates || !isValidCoordinates(waypoint.coordinates)) {
        return res.status(400).json({
          success: false,
          message: 'Tous les waypoints doivent avoir des coordonnées valides'
        });
      }
    }

    // Créer l'itinéraire
    const routeResult = await wazeService.createMultiPointRoute(waypoints, options);

    if (!routeResult.success) {
      return res.status(400).json(routeResult);
    }

    res.json(routeResult);

  } catch (error) {
    console.error('Erreur création itinéraire:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la création de l\'itinéraire',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   GET /api/waze/traffic/:lng/:lat
// @desc    Obtenir les informations de trafic pour une zone
// @access  Public
router.get('/traffic/:lng/:lat', async (req, res) => {
  try {
    const { lng, lat } = req.params;
    const { radius = 5000 } = req.query;

    // Validation des coordonnées
    const coordinates = [parseFloat(lng), parseFloat(lat)];
    
    if (!isValidCoordinates(coordinates)) {
      return res.status(400).json({
        success: false,
        message: 'Coordonnées GPS invalides'
      });
    }

    // Obtenir les infos de trafic
    const trafficInfo = await wazeService.getTrafficInfo(coordinates, parseInt(radius));

    res.json(trafficInfo);

  } catch (error) {
    console.error('Erreur récupération trafic:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des informations de trafic',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   POST /api/waze/trip/:trajetId/navigation
// @desc    Générer la navigation Waze pour un trajet spécifique
// @access  Private
router.post('/trip/:trajetId/navigation', authenticate, async (req, res) => {
  try {
    const { trajetId } = req.params;
    const { pickupPoint } = req.body;

    // Récupérer le trajet
    const trajet = await Trajet.findById(trajetId)
      .populate('conducteurId', 'nom prenom telephone');

    if (!trajet) {
      return res.status(404).json({
        success: false,
        message: 'Trajet non trouvé'
      });
    }

    // Vérifier si l'utilisateur a une réservation pour ce trajet
    const reservation = await Reservation.findOne({
      trajetId,
      passagerId: req.user._id,
      statutReservation: 'CONFIRMEE'
    });

    if (!reservation && trajet.conducteurId._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Vous n\'avez pas accès à ce trajet'
      });
    }

    // Construire les waypoints selon le rôle de l'utilisateur
    let waypoints = [];

    if (trajet.conducteurId._id.toString() === req.user._id.toString()) {
      // Pour le conducteur : inclure tous les points de prise en charge
      waypoints.push({
        coordinates: trajet.pointDepart.coordonnees.coordinates,
        address: trajet.pointDepart.adresse,
        type: 'start',
        name: trajet.pointDepart.nom
      });

      // Ajouter les points de prise en charge des passagers
      const reservations = await Reservation.find({
        trajetId,
        statutReservation: 'CONFIRMEE'
      }).populate('passagerId', 'nom prenom');

      for (const res of reservations) {
        waypoints.push({
          coordinates: res.pointPriseEnCharge.coordonnees.coordinates,
          address: res.pointPriseEnCharge.adresse,
          type: 'pickup',
          name: `Prise en charge - ${res.passagerId.nom}`,
          passager: res.passagerId.nom
        });
      }

      waypoints.push({
        coordinates: trajet.pointArrivee.coordonnees.coordinates,
        address: trajet.pointArrivee.adresse,
        type: 'end',
        name: trajet.pointArrivee.nom
      });

    } else {
      // Pour le passager : navigation vers le point de prise en charge
      if (pickupPoint) {
        waypoints = [
          {
            coordinates: pickupPoint.coordinates,
            address: pickupPoint.address || 'Position actuelle',
            type: 'start',
            name: 'Votre position'
          },
          {
            coordinates: reservation.pointPriseEnCharge.coordonnees.coordinates,
            address: reservation.pointPriseEnCharge.adresse,
            type: 'pickup',
            name: 'Point de prise en charge'
          }
        ];
      } else {
        // Navigation directe vers le point de prise en charge
        waypoints = [{
          coordinates: reservation.pointPriseEnCharge.coordonnees.coordinates,
          address: reservation.pointPriseEnCharge.adresse,
          type: 'destination',
          name: 'Point de prise en charge'
        }];
      }
    }

    // Créer l'itinéraire
    const routeResult = await wazeService.createMultiPointRoute(waypoints, {
      vehicleType: 'car',
      trafficFactor: 1.2 // Facteur de trafic pour Abidjan
    });

    // Ajouter des informations contextuelles
    const response = {
      ...routeResult,
      trip: {
        id: trajet._id,
        conducteur: trajet.conducteurId.nom,
        dateDepart: trajet.dateDepart,
        heureDepart: trajet.heureDepart
      },
      userRole: trajet.conducteurId._id.toString() === req.user._id.toString() ? 'conducteur' : 'passager',
      waypoints
    };

    res.json(response);

  } catch (error) {
    console.error('Erreur navigation trajet:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la génération de la navigation',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   POST /api/waze/trip/:trajetId/share
// @desc    Créer des liens de partage Waze pour un trajet
// @access  Private
router.post('/trip/:trajetId/share', authenticate, async (req, res) => {
  try {
    const { trajetId } = req.params;

    // Récupérer le trajet avec les détails
    const trajet = await Trajet.findById(trajetId)
      .populate('conducteurId', 'nom prenom telephone photoProfil');

    if (!trajet) {
      return res.status(404).json({
        success: false,
        message: 'Trajet non trouvé'
      });
    }

    // Vérifier que c'est le conducteur qui partage
    if (trajet.conducteurId._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Seul le conducteur peut partager ce trajet'
      });
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
      return res.status(500).json({
        success: false,
        message: 'Erreur lors de la création des liens de partage'
      });
    }

    res.json({
      success: true,
      shareLinks,
      trip: {
        id: trajet._id,
        from: trajet.pointDepart.nom,
        to: trajet.pointArrivee.nom,
        date: trajet.dateDepart,
        time: trajet.heureDepart,
        price: trajet.prixParPassager,
        availableSeats: trajet.nombrePlacesDisponibles
      }
    });

  } catch (error) {
    console.error('Erreur création liens partage:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la création des liens de partage',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   POST /api/waze/carpool/publish
// @desc    Publier un trajet sur Waze Carpool (simulation)
// @access  Private
router.post('/carpool/publish', authenticate, async (req, res) => {
  try {
    const { trajetId } = req.body;

    if (!trajetId) {
      return res.status(400).json({
        success: false,
        message: 'ID du trajet requis'
      });
    }

    // Récupérer le trajet complet
    const trajet = await Trajet.findById(trajetId)
      .populate('conducteurId', 'nom prenom noteGenerale');

    if (!trajet) {
      return res.status(404).json({
        success: false,
        message: 'Trajet non trouvé'
      });
    }

    // Vérifier que c'est le conducteur
    if (trajet.conducteurId._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Seul le conducteur peut publier ce trajet'
      });
    }

    // Publier sur Waze Carpool
    const publicationResult = await wazeService.publishToWazeCarpool({
      conducteur: trajet.conducteurId,
      pointDepart: trajet.pointDepart,
      pointArrivee: trajet.pointArrivee,
      dateDepart: trajet.dateDepart,
      heureDepart: trajet.heureDepart,
      nombrePlacesDisponibles: trajet.nombrePlacesDisponibles,
      vehiculeUtilise: trajet.vehiculeUtilise,
      preferences: trajet.preferences,
      prixParPassager: trajet.prixParPassager
    });

    res.json({
      success: true,
      publication: publicationResult,
      trip: {
        id: trajet._id,
        status: trajet.statutTrajet
      }
    });

  } catch (error) {
    console.error('Erreur publication Waze Carpool:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la publication sur Waze Carpool',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   GET /api/waze/carpool/:trajetId/status
// @desc    Vérifier le statut d'un trajet sur Waze Carpool
// @access  Private
router.get('/carpool/:trajetId/status', authenticate, async (req, res) => {
  try {
    const { trajetId } = req.params;

    // Récupérer le trajet
    const trajet = await Trajet.findById(trajetId)
      .populate('conducteurId', 'nom prenom');

    if (!trajet) {
      return res.status(404).json({
        success: false,
        message: 'Trajet non trouvé'
      });
    }

    // Vérifier l'accès
    if (trajet.conducteurId._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Accès non autorisé'
      });
    }

    // Vérifier le statut sur Waze Carpool
    const carpoolStatus = await wazeService.checkCarpoolStatus(trajetId);

    res.json({
      success: true,
      status: carpoolStatus,
      trip: {
        id: trajet._id,
        published: carpoolStatus.isPublished,
        lastUpdate: carpoolStatus.lastUpdate
      }
    });

  } catch (error) {
    console.error('Erreur vérification statut Carpool:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la vérification du statut',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   DELETE /api/waze/carpool/:trajetId
// @desc    Supprimer un trajet de Waze Carpool
// @access  Private
router.delete('/carpool/:trajetId', authenticate, async (req, res) => {
  try {
    const { trajetId } = req.params;

    // Récupérer le trajet
    const trajet = await Trajet.findById(trajetId);

    if (!trajet) {
      return res.status(404).json({
        success: false,
        message: 'Trajet non trouvé'
      });
    }

    // Vérifier que c'est le conducteur
    if (trajet.conducteurId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Seul le conducteur peut supprimer ce trajet'
      });
    }

    // Supprimer de Waze Carpool
    const deletionResult = await wazeService.removeFromWazeCarpool(trajetId);

    res.json({
      success: true,
      deletion: deletionResult,
      trip: {
        id: trajet._id,
        removed: deletionResult.success
      }
    });

  } catch (error) {
    console.error('Erreur suppression Carpool:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la suppression du trajet',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   POST /api/waze/live-location
// @desc    Partager la position en temps réel avec Waze
// @access  Private
router.post('/live-location', authenticate, async (req, res) => {
  try {
    const { trajetId, coordinates, speed, heading } = req.body;

    // Validation des données
    if (!trajetId || !coordinates || !isValidCoordinates(coordinates)) {
      return res.status(400).json({
        success: false,
        message: 'Données de localisation invalides'
      });
    }

    // Récupérer le trajet
    const trajet = await Trajet.findById(trajetId);

    if (!trajet) {
      return res.status(404).json({
        success: false,
        message: 'Trajet non trouvé'
      });
    }

    // Vérifier que c'est le conducteur
    if (trajet.conducteurId.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Seul le conducteur peut partager sa position'
      });
    }

    // Partager la position avec Waze
    const locationResult = await wazeService.shareLiveLocation({
      trajetId,
      conducteurId: req.user._id,
      coordinates,
      speed,
      heading,
      timestamp: new Date()
    });

    res.json({
      success: true,
      location: locationResult,
      trip: {
        id: trajet._id,
        status: trajet.statutTrajet
      }
    });

  } catch (error) {
    console.error('Erreur partage position:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors du partage de position',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   GET /api/waze/live-location/:trajetId
// @desc    Obtenir la position en temps réel du conducteur
// @access  Private
router.get('/live-location/:trajetId', authenticate, async (req, res) => {
  try {
    const { trajetId } = req.params;

    // Vérifier que l'utilisateur a accès à ce trajet
    const reservation = await Reservation.findOne({
      trajetId,
      passagerId: req.user._id,
      statutReservation: 'CONFIRMEE'
    });

    const trajet = await Trajet.findById(trajetId);

    if (!trajet) {
      return res.status(404).json({
        success: false,
        message: 'Trajet non trouvé'
      });
    }

    // Vérifier l'accès (conducteur ou passager avec réservation)
    const isConducteur = trajet.conducteurId.toString() === req.user._id.toString();
    if (!isConducteur && !reservation) {
      return res.status(403).json({
        success: false,
        message: 'Accès non autorisé'
      });
    }

    // Récupérer la position du conducteur
    const liveLocation = await wazeService.getLiveLocation(trajetId);

    res.json({
      success: true,
      liveLocation,
      trip: {
        id: trajet._id,
        userRole: isConducteur ? 'conducteur' : 'passager'
      }
    });

  } catch (error) {
    console.error('Erreur récupération position:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération de la position',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   POST /api/waze/alerts
// @desc    Signaler un incident via Waze
// @access  Private
router.post('/alerts', authenticate, async (req, res) => {
  try {
    const { 
      coordinates, 
      alertType, 
      description, 
      severity = 'medium',
      trajetId 
    } = req.body;

    // Validation des données
    if (!coordinates || !isValidCoordinates(coordinates) || !alertType) {
      return res.status(400).json({
        success: false,
        message: 'Coordonnées et type d\'alerte requis'
      });
    }

    // Types d'alertes valides
    const validAlertTypes = [
      'traffic_jam', 'accident', 'hazard', 'police', 
      'road_closure', 'construction', 'weather'
    ];

    if (!validAlertTypes.includes(alertType)) {
      return res.status(400).json({
        success: false,
        message: 'Type d\'alerte invalide'
      });
    }

    // Créer l'alerte Waze
    const alertResult = await wazeService.createAlert({
      reporterId: req.user._id,
      coordinates,
      alertType,
      description,
      severity,
      trajetId,
      timestamp: new Date()
    });

    res.json({
      success: true,
      alert: alertResult,
      reporter: {
        id: req.user._id,
        coordinates
      }
    });

  } catch (error) {
    console.error('Erreur création alerte:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la création de l\'alerte',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   GET /api/waze/alerts/nearby
// @desc    Récupérer les alertes à proximité
// @access  Public
router.get('/alerts/nearby', optionalAuth, async (req, res) => {
  try {
    const { lng, lat, radius = 10000 } = req.query;

    // Validation des coordonnées
    const coordinates = [parseFloat(lng), parseFloat(lat)];
    
    if (!isValidCoordinates(coordinates)) {
      return res.status(400).json({
        success: false,
        message: 'Coordonnées GPS invalides'
      });
    }

    // Récupérer les alertes à proximité
    const nearbyAlerts = await wazeService.getNearbyAlerts(
      coordinates, 
      parseInt(radius)
    );

    res.json({
      success: true,
      alerts: nearbyAlerts,
      query: {
        center: coordinates,
        radius: parseInt(radius),
        count: nearbyAlerts.length
      }
    });

  } catch (error) {
    console.error('Erreur récupération alertes:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des alertes',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   GET /api/waze/eta/:trajetId
// @desc    Calculer l'ETA avec les données Waze
// @access  Private
router.get('/eta/:trajetId', authenticate, async (req, res) => {
  try {
    const { trajetId } = req.params;
    const { currentLocation } = req.query;

    // Récupérer le trajet
    const trajet = await Trajet.findById(trajetId);

    if (!trajet) {
      return res.status(404).json({
        success: false,
        message: 'Trajet non trouvé'
      });
    }

    // Vérifier l'accès au trajet
    const hasAccess = await wazeService.checkTripAccess(trajetId, req.user._id);
    
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Accès non autorisé'
      });
    }

    let coordinates;
    if (currentLocation) {
      coordinates = JSON.parse(currentLocation);
      if (!isValidCoordinates(coordinates)) {
        return res.status(400).json({
          success: false,
          message: 'Position actuelle invalide'
        });
      }
    }

    // Calculer l'ETA
    const etaResult = await wazeService.calculateETA({
      trajetId,
      currentLocation: coordinates,
      destination: trajet.pointArrivee.coordonnees.coordinates,
      waypoints: trajet.waypoints || []
    });

    res.json({
      success: true,
      eta: etaResult,
      trip: {
        id: trajet._id,
        destination: trajet.pointArrivee.nom,
        scheduledTime: trajet.heureDepart
      }
    });

  } catch (error) {
    console.error('Erreur calcul ETA:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors du calcul de l\'ETA',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   POST /api/waze/feedback
// @desc    Envoyer un feedback sur l'intégration Waze
// @access  Private
router.post('/feedback', authenticate, async (req, res) => {
  try {
    const { 
      trajetId, 
      feedbackType, 
      rating, 
      comment, 
      features 
    } = req.body;

    // Validation
    if (!feedbackType || !rating) {
      return res.status(400).json({
        success: false,
        message: 'Type de feedback et note requis'
      });
    }

    // Enregistrer le feedback
    const feedbackResult = await wazeService.submitFeedback({
      userId: req.user._id,
      trajetId,
      feedbackType,
      rating,
      comment,
      features,
      timestamp: new Date()
    });

    res.json({
      success: true,
      feedback: feedbackResult,
      message: 'Merci pour votre feedback!'
    });

  } catch (error) {
    console.error('Erreur enregistrement feedback:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de l\'enregistrement du feedback',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   GET /api/waze/config
// @desc    Récupérer la configuration Waze de l'app
// @access  Public
router.get('/config', async (req, res) => {
  try {
    const config = wazeService.getWazeConfig();

    res.json({
      success: true,
      config: {
        ...config,
        apiVersion: '1.0',
        supportedFeatures: [
          'navigation',
          'traffic_info',
          'live_location',
          'alerts',
          'carpool_integration',
          'eta_calculation'
        ],
        regions: ['CI', 'West Africa'],
        lastUpdate: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Erreur récupération config:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération de la configuration',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Middleware de gestion des erreurs pour les routes Waze
router.use((error, req, res, _next) => {
  console.error('Erreur dans les routes Waze:', error);
  
  res.status(500).json({
    success: false,
    message: 'Erreur interne du serveur Waze',
    error: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
});

module.exports = router;