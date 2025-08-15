// services/locationService.js
const { EventEmitter } = require('events');

/**
 * Service pour gérer les positions en temps réel
 */
class LocationService extends EventEmitter {
  constructor() {
    super();
    this.trajetLocations = new Map(); // trajetId -> position
    this.lastUpdated = new Map(); // trajetId -> timestamp
    
    // Configurer l'intervalle de nettoyage (toutes les 10 minutes)
    this.cleanupInterval = setInterval(() => this.cleanup(), 10 * 60 * 1000);
    console.log('✅ Service de localisation initialisé');
  }

  /**
   * Met à jour la position d'un trajet
   * @param {string} trajetId - ID du trajet
   * @param {Object} position - Position géographique
   * @returns {boolean} - Indique si la mise à jour a réussi
   */
  updateTrajetLocation(trajetId, position) {
    if (!trajetId || !position) return false;
    
    // Stocker la position
    this.trajetLocations.set(trajetId, position);
    this.lastUpdated.set(trajetId, new Date());
    
    // Émettre un événement de mise à jour de position
    this.emit('location:updated', {
      trajetId,
      position,
      timestamp: new Date()
    });
    
    return true;
  }

  /**
   * Récupère la dernière position connue d'un trajet
   * @param {string} trajetId - ID du trajet
   * @returns {Object|null} - Position géographique ou null si inconnue
   */
  getTrajetLocation(trajetId) {
    if (!trajetId || !this.trajetLocations.has(trajetId)) return null;
    
    return {
      position: this.trajetLocations.get(trajetId),
      lastUpdated: this.lastUpdated.get(trajetId)
    };
  }

  /**
   * Supprime la position d'un trajet (par exemple quand il est terminé)
   * @param {string} trajetId - ID du trajet
   * @returns {boolean} - Indique si la suppression a réussi
   */
  removeTrajetLocation(trajetId) {
    if (!trajetId) return false;
    
    const hasLocation = this.trajetLocations.has(trajetId);
    
    this.trajetLocations.delete(trajetId);
    this.lastUpdated.delete(trajetId);
    
    return hasLocation;
  }

  /**
   * Trouve les trajets proches d'une position donnée
   * @param {Object} position - Position géographique
   * @param {number} maxDistance - Distance maximale en kilomètres
   * @returns {Array} - Liste des trajets proches avec leur distance
   */
  findNearbyTrajets(position, maxDistance = 5) {
    if (!position || !position.coordinates) return [];
    
    const [longitude, latitude] = position.coordinates;
    const results = [];
    
    // Pour chaque trajet avec une position connue
    this.trajetLocations.forEach((trajetPosition, trajetId) => {
      if (trajetPosition && trajetPosition.coordinates) {
        const [trajetLng, trajetLat] = trajetPosition.coordinates;
        
        // Calculer la distance approximative (formule de Haversine simplifiée)
        const distance = this.calculateDistance(
          latitude, longitude,
          trajetLat, trajetLng
        );
        
        // Si la distance est inférieure à la distance maximale, ajouter le trajet aux résultats
        if (distance <= maxDistance) {
          results.push({
            trajetId,
            position: trajetPosition,
            distance, // distance en kilomètres
            lastUpdated: this.lastUpdated.get(trajetId)
          });
        }
      }
    });
    
    // Trier par distance
    return results.sort((a, b) => a.distance - b.distance);
  }

  /**
   * Calcule la distance approximative entre deux points géographiques
   * @param {number} lat1 - Latitude du premier point
   * @param {number} lng1 - Longitude du premier point
   * @param {number} lat2 - Latitude du deuxième point
   * @param {number} lng2 - Longitude du deuxième point
   * @returns {number} - Distance en kilomètres
   */
  calculateDistance(lat1, lng1, lat2, lng2) {
    // Convertir les degrés en radians
    const toRadians = (degrees) => degrees * Math.PI / 180;
    
    const R = 6371; // Rayon de la Terre en kilomètres
    const dLat = toRadians(lat2 - lat1);
    const dLng = toRadians(lng2 - lng1);
    
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * 
      Math.sin(dLng/2) * Math.sin(dLng/2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c;
    
    return distance;
  }

  /**
   * Nettoie les positions obsolètes (plus de 2 heures d'inactivité)
   */
  cleanup() {
    const now = new Date();
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    
    // Parcourir tous les trajets et supprimer ceux qui n'ont pas été mis à jour depuis 2 heures
    this.lastUpdated.forEach((timestamp, trajetId) => {
      if (timestamp < twoHoursAgo) {
        this.removeTrajetLocation(trajetId);
      }
    });
  }
  
  /**
   * Arrête le service et libère les ressources
   */
  stop() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    
    this.trajetLocations.clear();
    this.lastUpdated.clear();
  }
}

// Exporter une instance unique du service
module.exports = new LocationService();