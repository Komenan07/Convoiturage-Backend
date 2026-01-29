// controllers/trajetSearchController.js

const geoSearchService = require('../services/geoSearchService');
const { logger } = require('../utils/logger');

/**
 * Controller pour la recherche de trajets
 */
class TrajetSearchController {
  
  /**
   * Recherche géospatiale de trajets proches
   * POST /api/trajets/search/nearby
   */
  async searchNearbyTrips(req, res) {
    try {
      logger.info('📍 Requête recherche géospatiale', { 
        userId: req.user?.id,
        body: req.body 
      });

      const {
        departLat,
        departLng,
        arriveeLat,
        arriveeLng,
        rayonDepart,
        rayonArrivee,
        dateDepart,
        toleranceDate,
        limit
      } = req.body;

      // Validation des paramètres obligatoires
      if (!departLat || !departLng) {
        return res.status(400).json({
          success: false,
          message: 'Les coordonnées de départ (departLat, departLng) sont obligatoires'
        });
      }

      if (!arriveeLat || !arriveeLng) {
        return res.status(400).json({
          success: false,
          message: 'Les coordonnées d\'arrivée (arriveeLat, arriveeLng) sont obligatoires'
        });
      }

      // Appel au service
      const result = await geoSearchService.searchNearbyTrips({
        departLat: parseFloat(departLat),
        departLng: parseFloat(departLng),
        arriveeLat: parseFloat(arriveeLat),
        arriveeLng: parseFloat(arriveeLng),
        rayonDepart: rayonDepart ? parseFloat(rayonDepart) : undefined,
        rayonArrivee: rayonArrivee ? parseFloat(rayonArrivee) : undefined,
        dateDepart: dateDepart ? new Date(dateDepart) : undefined,
        toleranceDate: toleranceDate ? parseInt(toleranceDate) : undefined,
        limit: limit ? parseInt(limit) : undefined
      });

      logger.info('✅ Recherche géospatiale réussie', { 
        count: result.count,
        methode: result.methode 
      });

      return res.status(200).json(result);

    } catch (error) {
      logger.error('❌ Erreur recherche géospatiale:', error);
      
      return res.status(500).json({
        success: false,
        message: 'Erreur lors de la recherche de trajets',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Recherche par commune et quartier
   * POST /api/trajets/search/commune
   */
  async searchByCommune(req, res) {
    try {
      logger.info('🏘️ Requête recherche par commune', { 
        userId: req.user?.id,
        body: req.body 
      });

      const {
        communeDepart,
        communeArrivee,
        quartierDepart,
        quartierArrivee,
        dateDepart,
        toleranceDate,
        limit
      } = req.body;

      // Validation
      if (!communeDepart || !communeArrivee) {
        return res.status(400).json({
          success: false,
          message: 'Les communes de départ et d\'arrivée sont obligatoires'
        });
      }

      // Appel au service
      const result = await geoSearchService.searchByCommune({
        communeDepart,
        communeArrivee,
        quartierDepart,
        quartierArrivee,
        dateDepart: dateDepart ? new Date(dateDepart) : undefined,
        toleranceDate: toleranceDate ? parseInt(toleranceDate) : undefined,
        limit: limit ? parseInt(limit) : undefined
      });

      logger.info('✅ Recherche par commune réussie', { 
        count: result.count 
      });

      return res.status(200).json(result);

    } catch (error) {
      logger.error('❌ Erreur recherche par commune:', error);
      
      return res.status(500).json({
        success: false,
        message: 'Erreur lors de la recherche de trajets',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Recherche intelligente (GPS + fallback commune)
   * POST /api/trajets/search/smart
   */
  async smartSearch(req, res) {
    try {
      logger.info('🧠 Requête recherche intelligente', { 
        userId: req.user?.id,
        body: req.body 
      });

      const {
        departLat,
        departLng,
        arriveeLat,
        arriveeLng,
        communeDepart,
        communeArrivee,
        quartierDepart,
        quartierArrivee,
        rayonDepart,
        rayonArrivee,
        dateDepart,
        toleranceDate,
        limit
      } = req.body;

      // Validation: au moins coordonnées OU communes
      if ((!departLat || !departLng || !arriveeLat || !arriveeLng) && 
          (!communeDepart || !communeArrivee)) {
        return res.status(400).json({
          success: false,
          message: 'Veuillez fournir soit les coordonnées GPS (departLat, departLng, arriveeLat, arriveeLng), soit les communes (communeDepart, communeArrivee)'
        });
      }

      // Appel au service
      const result = await geoSearchService.smartSearch({
        departLat: departLat ? parseFloat(departLat) : undefined,
        departLng: departLng ? parseFloat(departLng) : undefined,
        arriveeLat: arriveeLat ? parseFloat(arriveeLat) : undefined,
        arriveeLng: arriveeLng ? parseFloat(arriveeLng) : undefined,
        communeDepart,
        communeArrivee,
        quartierDepart,
        quartierArrivee,
        rayonDepart: rayonDepart ? parseFloat(rayonDepart) : undefined,
        rayonArrivee: rayonArrivee ? parseFloat(rayonArrivee) : undefined,
        dateDepart: dateDepart ? new Date(dateDepart) : undefined,
        toleranceDate: toleranceDate ? parseInt(toleranceDate) : undefined,
        limit: limit ? parseInt(limit) : undefined
      });

      logger.info('✅ Recherche intelligente réussie', { 
        count: result.count,
        methode: result.methode,
        fallback: result.fallback || false
      });

      return res.status(200).json(result);

    } catch (error) {
      logger.error('❌ Erreur recherche intelligente:', error);
      
      return res.status(500).json({
        success: false,
        message: 'Erreur lors de la recherche de trajets',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  /**
   * Obtenir la configuration du service de recherche
   * GET /api/trajets/search/config
   */
  async getConfig(req, res) {
    try {
      const config = geoSearchService.getConfig();
      
      return res.status(200).json({
        success: true,
        config
      });

    } catch (error) {
      logger.error('❌ Erreur récupération config:', error);
      
      return res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération de la configuration',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
}

// Créer une instance et exporter avec binding
const trajetSearchController = new TrajetSearchController();

module.exports = {
  searchNearbyTrips: trajetSearchController.searchNearbyTrips.bind(trajetSearchController),
  searchByCommune: trajetSearchController.searchByCommune.bind(trajetSearchController),
  smartSearch: trajetSearchController.smartSearch.bind(trajetSearchController),
  getConfig: trajetSearchController.getConfig.bind(trajetSearchController)
};