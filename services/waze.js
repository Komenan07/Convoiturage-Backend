// services/waze.js - Service d'intégration Waze

// Supprimer axios car non utilisé
// const axios = require('axios');
const { calculateDistance } = require('../utils/helpers');

class WazeService {
  constructor() {
    this.baseURL = 'https://www.waze.com/api';
    this.wazeWebURL = 'https://waze.com/ul';
    this.timeout = 10000; // 10 secondes
  }
  
  /**
   * Générer une URL Waze pour la navigation web
   * @param {Object} destination - { coordinates: [lng, lat], address: string }
   * @param {Object} options - Options additionnelles
   * @returns {string} - URL Waze web
   */
  generateWebNavigationURL(destination, options = {}) {
    try {
      const { coordinates, address } = destination;
      const [lng, lat] = coordinates;

      let url = `${this.wazeWebURL}?`;
      
      if (address && address.trim()) {
        // Utiliser l'adresse si disponible (plus précis)
        url += `q=${encodeURIComponent(address.trim())}&navigate=yes`;
      } else {
        // Utiliser les coordonnées GPS
        url += `ll=${lat},${lng}&navigate=yes`;
      }

      // Options additionnelles
      if (options.avoid) {
        // avoid: 'tolls', 'highways', 'ferries'
        url += `&avoid=${options.avoid}`;
      }

      if (options.vehicleType) {
        // vehicleType: 'car', 'motorcycle', 'taxi'
        url += `&vehicle_type=${options.vehicleType}`;
      }

      return url;

    } catch (error) {
      console.error('Erreur génération URL Waze:', error);
      return null;
    }
  }

  /**
   * Générer un deep link Waze pour les applications mobiles
   * @param {Object} destination - { coordinates: [lng, lat], address: string }
   * @param {Object} options - Options additionnelles
   * @returns {Object} - { ios: string, android: string }
   */
  generateMobileDeepLinks(destination, options = {}) {
    try {
      const { coordinates, address } = destination;
      const [lng, lat] = coordinates;

      let baseParams = '';
      
      if (address && address.trim()) {
        baseParams = `q=${encodeURIComponent(address.trim())}&navigate=yes`;
      } else {
        baseParams = `ll=${lat},${lng}&navigate=yes`;
      }

      return {
        // Deep link pour iOS
        ios: `waze://?${baseParams}`,
        
        // Deep link pour Android
        android: `https://waze.com/ul?${baseParams}`,
        
        // Fallback web
        web: this.generateWebNavigationURL(destination, options)
      };

    } catch (error) {
      console.error('Erreur génération deep links Waze:', error);
      return null;
    }
  }

  /**
   * Créer un itinéraire multi-points avec Waze
   * @param {Array} waypoints - Tableau de points [{coordinates, address, type}]
   * @param {Object} options - Options de route
   * @returns {Object} - Informations de l'itinéraire
   */
  async createMultiPointRoute(waypoints, options = {}) {
    try {
      if (!waypoints || waypoints.length < 2) {
        throw new Error('Au moins 2 points sont requis pour créer un itinéraire');
      }

      const startPoint = waypoints[0];
      const endPoint = waypoints[waypoints.length - 1];
      const intermediatePoints = waypoints.slice(1, -1);

      // Construire l'URL Waze avec plusieurs points
      let wazeURL = this.wazeWebURL + '?';
      
      // Point de départ
      if (startPoint.address) {
        wazeURL += `from=${encodeURIComponent(startPoint.address)}`;
      } else {
        const [lng, lat] = startPoint.coordinates;
        wazeURL += `from=${lat},${lng}`;
      }

      // Point d'arrivée
      if (endPoint.address) {
        wazeURL += `&to=${encodeURIComponent(endPoint.address)}`;
      } else {
        const [lng, lat] = endPoint.coordinates;
        wazeURL += `&to=${lat},${lng}`;
      }

      // Points intermédiaires (Waze supporte jusqu'à 3 points intermédiaires)
      if (intermediatePoints.length > 0) {
        intermediatePoints.slice(0, 3).forEach((point, index) => {
          if (point.address) {
            wazeURL += `&via${index + 1}=${encodeURIComponent(point.address)}`;
          } else {
            const [lng, lat] = point.coordinates;
            wazeURL += `&via${index + 1}=${lat},${lng}`;
          }
        });
      }

      wazeURL += '&navigate=yes';

      // Calculer des statistiques approximatives
      const totalDistance = this.calculateRouteDistance(waypoints);
      const estimatedDuration = this.estimateRouteDuration(totalDistance, options.trafficFactor);

      return {
        success: true,
        wazeURL,
        mobileLinks: this.generateMobileDeepLinks(endPoint, options),
        routeInfo: {
          totalDistance,
          estimatedDuration,
          waypoints: waypoints.length,
          intermediateStops: intermediatePoints.length
        },
        metadata: {
          createdAt: new Date(),
          options
        }
      };

    } catch (error) {
      console.error('Erreur création itinéraire multi-points:', error);
      return {
        success: false,
        error: error.message,
        fallbackURL: this.generateWebNavigationURL(waypoints[waypoints.length - 1])
      };
    }
  }

  /**
   * Obtenir des informations de trafic (simulation - Waze ne fournit pas d'API publique)
   * @param {Array} coordinates - [lng, lat]
   * @param {number} radius - Rayon en mètres
   * @returns {Object} - Informations de trafic simulées
   */
  async getTrafficInfo(coordinates, radius = 5000) {
    try {
      // Simulation d'informations de trafic
      // En réalité, vous pourriez utiliser Google Maps Traffic API ou HERE Traffic API
      
      // Simuler des conditions de trafic basées sur l'heure
      const now = new Date();
      const hour = now.getHours();
      
      let trafficLevel = 'normal';
      let speedFactor = 1.0;
      
      // Heures de pointe à Abidjan
      if ((hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 19)) {
        trafficLevel = 'heavy';
        speedFactor = 0.6;
      } else if ((hour >= 6 && hour <= 7) || (hour >= 16 && hour <= 17) || (hour >= 19 && hour <= 20)) {
        trafficLevel = 'moderate';
        speedFactor = 0.8;
      }

      return {
        success: true,
        location: { coordinates, radius },
        traffic: {
          level: trafficLevel, // 'light', 'normal', 'moderate', 'heavy'
          speedFactor,
          description: this.getTrafficDescription(trafficLevel),
          lastUpdated: new Date()
        },
        incidents: this.generateSimulatedIncidents(),
        recommendations: this.getTrafficRecommendations(trafficLevel)
      };

    } catch (error) {
      console.error('Erreur récupération infos trafic:', error);
      return {
        success: false,
        error: error.message,
        traffic: { level: 'unknown', speedFactor: 1.0 }
      };
    }
  }

  /**
   * Créer un lien de partage Waze pour un trajet
   * @param {Object} tripData - Données du trajet
   * @returns {Object} - Liens de partage
   */
  createTripShareLinks(tripData) {
    try {
      const { pointDepart, pointArrivee, dateDepart, heureDepart, conducteur } = tripData;

      // URL Waze pour le trajet complet
      const tripWazeURL = this.createMultiPointRoute([
        {
          coordinates: pointDepart.coordonnees.coordinates,
          address: pointDepart.adresse,
          type: 'start'
        },
        {
          coordinates: pointArrivee.coordonnees.coordinates,
          address: pointArrivee.adresse,
          type: 'end'
        }
      ]);

      // Message de partage
      const shareMessage = `🚗 Covoiturage avec ${conducteur.nom}
📍 De: ${pointDepart.nom}
📍 Vers: ${pointArrivee.nom}
🕒 ${new Date(dateDepart).toLocaleDateString('fr-FR')} à ${heureDepart}
🗺️ Suivre sur Waze: `;

      return {
        wazeURL: tripWazeURL.wazeURL,
        shareMessage,
        socialLinks: {
          whatsapp: `https://wa.me/?text=${encodeURIComponent(shareMessage + tripWazeURL.wazeURL)}`,
          telegram: `https://t.me/share/url?url=${encodeURIComponent(tripWazeURL.wazeURL)}&text=${encodeURIComponent(shareMessage)}`,
          sms: `sms:?body=${encodeURIComponent(shareMessage + tripWazeURL.wazeURL)}`
        },
        qrCode: this.generateQRCodeURL(tripWazeURL.wazeURL)
      };

    } catch (error) {
      console.error('Erreur création liens partage:', error);
      return null;
    }
  }

  /**
   * Intégration avec l'API Waze Carpool (si disponible)
   * @param {Object} tripData - Données du trajet
   * @returns {Object} - Résultat de l'intégration
   */
  async publishToWazeCarpool(tripData) {
    try {
      // Note: L'API Waze Carpool n'est pas publiquement disponible
      // Ceci est une simulation de ce que pourrait être l'intégration
      
      const carpoolData = {
        driver: {
          name: tripData.conducteur.nom,
          rating: tripData.conducteur.noteGenerale || 4.0
        },
        route: {
          from: {
            address: tripData.pointDepart.adresse,
            coordinates: tripData.pointDepart.coordonnees.coordinates
          },
          to: {
            address: tripData.pointArrivee.adresse,
            coordinates: tripData.pointArrivee.coordonnees.coordinates
          }
        },
        departure: {
          date: tripData.dateDepart,
          time: tripData.heureDepart
        },
        vehicle: {
          seats: tripData.nombrePlacesDisponibles,
          make: tripData.vehiculeUtilise?.marque,
          model: tripData.vehiculeUtilise?.modele
        },
        preferences: tripData.preferences
      };

      // Simulation d'une réponse API
      return {
        success: true,
        carpoolId: `waze_${Date.now()}`,
        publishedAt: new Date(),
        wazeURL: this.generateWebNavigationURL({
          coordinates: tripData.pointArrivee.coordonnees.coordinates,
          address: tripData.pointArrivee.adresse
        }),
        message: 'Trajet publié sur Waze Carpool (simulation)',
        carpoolData // Utiliser carpoolData pour éviter l'erreur unused
      };

    } catch (error) {
      console.error('Erreur publication Waze Carpool:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Vérifier si Waze est disponible sur l'appareil
   * @param {string} userAgent - User agent du navigateur
   * @returns {Object} - Informations de disponibilité
   */
  checkWazeAvailability(userAgent) {
    const isMobile = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
    const isIOS = /iPhone|iPad|iPod/i.test(userAgent);
    const isAndroid = /Android/i.test(userAgent);

    return {
      isMobile,
      isIOS,
      isAndroid,
      supportsDeepLink: isMobile,
      recommendedAction: isMobile ? 'deep_link' : 'web_redirect',
      fallbackURL: 'https://waze.com/download'
    };
  }

  // === MÉTHODES UTILITAIRES PRIVÉES ===

  calculateRouteDistance(waypoints) {
    let totalDistance = 0;
    
    for (let i = 0; i < waypoints.length - 1; i++) {
      const current = waypoints[i].coordinates;
      const next = waypoints[i + 1].coordinates;
      totalDistance += calculateDistance(current, next);
    }
    
    return Math.round(totalDistance * 100) / 100; // Arrondir à 2 décimales
  }

  estimateRouteDuration(distance, trafficFactor = 1.0) {
    // Vitesse moyenne à Abidjan selon le type de route
    const averageSpeed = 35; // km/h en ville
    const baseDuration = (distance / averageSpeed) * 60; // en minutes
    
    return Math.round(baseDuration * trafficFactor);
  }

  getTrafficDescription(level) {
    const descriptions = {
      light: 'Circulation fluide',
      normal: 'Circulation normale',
      moderate: 'Circulation ralentie',
      heavy: 'Embouteillages importants'
    };
    
    return descriptions[level] || 'Conditions inconnues';
  }

  generateSimulatedIncidents() {
    // Simulation d'incidents basée sur des zones connues d'Abidjan
    const incidents = [];
    
    // Ajouter quelques incidents simulés selon l'heure
    const hour = new Date().getHours();
    
    if (hour >= 7 && hour <= 9) {
      incidents.push({
        type: 'traffic_jam',
        description: 'Embouteillage sur le pont HKB',
        severity: 'moderate',
        duration: '15-30 min'
      });
    }
    
    if (hour >= 17 && hour <= 19) {
      incidents.push({
        type: 'heavy_traffic',
        description: 'Circulation dense Boulevard Lagunaire',
        severity: 'high',
        duration: '20-45 min'
      });
    }
    
    return incidents;
  }

  getTrafficRecommendations(level) {
    const recommendations = {
      light: ['Conditions idéales pour voyager'],
      normal: ['Prévoyez le temps normal de trajet'],
      moderate: [
        'Ajoutez 15-20 minutes à votre temps de trajet',
        'Considérez des routes alternatives'
      ],
      heavy: [
        'Ajoutez 30-45 minutes à votre temps de trajet',
        'Reportez si possible',
        'Utilisez les transports en commun'
      ]
    };
    
    return recommendations[level] || [];
  }

  generateQRCodeURL(url) {
    // Utiliser un service de génération de QR code gratuit
    return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(url)}`;
  }
}

// Instance singleton du service Waze
const wazeService = new WazeService();

module.exports = wazeService;