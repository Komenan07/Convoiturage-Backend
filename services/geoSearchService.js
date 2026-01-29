// services/geoSearchService.js

const Trajet = require('../models/Trajet');
const { logger } = require('../utils/logger');

/**
 * Service de recherche géospatiale de trajets
 * 
 * Ce service permet de:
 * - Rechercher des trajets par proximité géographique
 * - Filtrer par commune et quartier
 * - Recherche intelligente avec fallback automatique
 * - Calcul de scores de pertinence
 */

class GeoSearchService {
  
  // ===============================================
  // CONFIGURATION
  // ===============================================
  
  constructor() {
    this.config = {
      RAYON_DEFAUT_KM: 5,
      TOLERANCE_DATE_DEFAUT_HEURES: 2,
      LIMITE_RESULTATS_DEFAUT: 20,
      RAYON_MAX_KM: 50,
      RAYON_MIN_KM: 0.5
    };
  }

  // ===============================================
  // MÉTHODES DE VALIDATION
  // ===============================================

  /**
   * Valider les coordonnées GPS
   * @private
   */
  isValidCoordinate(lat, lng) {
    return (
      typeof lat === 'number' &&
      typeof lng === 'number' &&
      lat >= -90 && lat <= 90 &&
      lng >= -180 && lng <= 180
    );
  }

  /**
   * Valider le rayon de recherche
   * @private
   */
  _validateRadius(rayon) {
    if (typeof rayon !== 'number' || rayon < this.config.RAYON_MIN_KM || rayon > this.config.RAYON_MAX_KM) {
      throw new Error(`Le rayon doit être entre ${this.config.RAYON_MIN_KM} et ${this.config.RAYON_MAX_KM} km`);
    }
    return true;
  }

  /**
   * Valider les paramètres de recherche
   * @private
   */
  _validateSearchParams(params) {
    const { departLat, departLng, arriveeLat, arriveeLng } = params;

    if (!this.isValidCoordinate(departLat, departLng)) {
      throw new Error('Coordonnées de départ invalides');
    }

    if (!this.isValidCoordinate(arriveeLat, arriveeLng)) {
      throw new Error('Coordonnées d\'arrivée invalides');
    }

    return true;
  }

  // ===============================================
  // MÉTHODES UTILITAIRES
  // ===============================================

  /**
   * Calculer l'angle de direction entre deux points (bearing)
   * Utile pour vérifier si deux trajets vont dans la même direction
   */
  calculateBearing(lat1, lng1, lat2, lng2) {
    const dLng = this._toRadians(lng2 - lng1);
    const y = Math.sin(dLng) * Math.cos(this._toRadians(lat2));
    const x = Math.cos(this._toRadians(lat1)) * Math.sin(this._toRadians(lat2)) -
              Math.sin(this._toRadians(lat1)) * Math.cos(this._toRadians(lat2)) * Math.cos(dLng);
    const bearing = Math.atan2(y, x);
    return (this._toDegrees(bearing) + 360) % 360;
  }

  _toRadians(degrees) {
    return degrees * Math.PI / 180;
  }

  _toDegrees(radians) {
    return radians * 180 / Math.PI;
  }

  /**
   * Vérifier si deux directions sont similaires (même sens)
   * @param {number} bearing1 - Direction 1 en degrés
   * @param {number} bearing2 - Direction 2 en degrés
   * @param {number} tolerance - Tolérance angulaire (défaut: 45°)
   * @returns {boolean}
   */
  isSimilarDirection(bearing1, bearing2, tolerance = 45) {
    const diff = Math.abs(bearing1 - bearing2);
    return diff <= tolerance || diff >= (360 - tolerance);
  }

  // ===============================================
  // RECHERCHE GÉOSPATIALE
  // ===============================================

  /**
   * Recherche les trajets proches avec direction similaire
   * @param {Object} params - Paramètres de recherche
   * @returns {Promise<Object>}
   */
  async searchNearbyTrips(params) {
    try {
      logger.info('🔍 Recherche géospatiale de trajets...');

      const {
        departLat,
        departLng,
        arriveeLat,
        arriveeLng,
        rayonDepart = this.config.RAYON_DEFAUT_KM,
        rayonArrivee = this.config.RAYON_DEFAUT_KM,
        dateDepart,
        toleranceDate = this.config.TOLERANCE_DATE_DEFAUT_HEURES,
        limit = this.config.LIMITE_RESULTATS_DEFAUT
      } = params;

      // Validation
      this._validateSearchParams(params);
      this._validateRadius(rayonDepart);
      this._validateRadius(rayonArrivee);

      const pipeline = [];

      // 1. Recherche par proximité du point de départ
      pipeline.push({
        $geoNear: {
          near: {
            type: 'Point',
            coordinates: [departLng, departLat]
          },
          distanceField: 'distanceDepart',
          maxDistance: rayonDepart * 1000, // km → mètres
          spherical: true,
          key: 'pointDepart.coordonnees'
        }
      });

      // 2. Filtrer par statut
      pipeline.push({
        $match: {
          statutTrajet: { $in: ['PROGRAMME', 'EN_COURS'] }
        }
      });

      // 3. Filtrer par date
      if (dateDepart) {
        const dateDebut = new Date(dateDepart);
        dateDebut.setHours(dateDebut.getHours() - toleranceDate);
        
        const dateFin = new Date(dateDepart);
        dateFin.setHours(dateFin.getHours() + toleranceDate);

        pipeline.push({
          $match: {
            dateDepart: { $gte: dateDebut, $lte: dateFin }
          }
        });
      } else {
        pipeline.push({
          $match: {
            dateDepart: { $gte: new Date() }
          }
        });
      }

      // 4. Calculer distance vers la destination (Haversine en MongoDB)
      pipeline.push({
        $addFields: {
          distanceArrivee: {
            $let: {
              vars: {
                destLng: arriveeLng,
                destLat: arriveeLat,
                tripLng: { $arrayElemAt: ['$pointArrivee.coordonnees.coordinates', 0] },
                tripLat: { $arrayElemAt: ['$pointArrivee.coordonnees.coordinates', 1] }
              },
              in: {
                $multiply: [
                  6371, // Rayon de la Terre en km
                  {
                    $acos: {
                      $add: [
                        {
                          $multiply: [
                            { $sin: { $degreesToRadians: '$$destLat' } },
                            { $sin: { $degreesToRadians: '$$tripLat' } }
                          ]
                        },
                        {
                          $multiply: [
                            { $cos: { $degreesToRadians: '$$destLat' } },
                            { $cos: { $degreesToRadians: '$$tripLat' } },
                            {
                              $cos: {
                                $degreesToRadians: { 
                                  $subtract: ['$$destLng', '$$tripLng'] 
                                }
                              }
                            }
                          ]
                        }
                      ]
                    }
                  }
                ]
              }
            }
          }
        }
      });

      // 5. Filtrer par proximité destination
      pipeline.push({
        $match: {
          distanceArrivee: { $lte: rayonArrivee }
        }
      });

      // 6. Score de pertinence
      pipeline.push({
        $addFields: {
          scoreRelevance: {
            $add: [
              // Distance départ (40% du score)
              { $multiply: [{ $divide: ['$distanceDepart', 1000] }, -0.4] },
              // Distance arrivée (40% du score)
              { $multiply: ['$distanceArrivee', -0.4] },
              // Places disponibles (20% du score)
              { $multiply: ['$nombrePlacesDisponibles', 0.2] }
            ]
          }
        }
      });

      // 7. Trier par pertinence
      pipeline.push({
        $sort: { scoreRelevance: -1, dateDepart: 1 }
      });

      // 8. Limiter les résultats
      pipeline.push({ $limit: limit });

      // 9. Populer les informations du conducteur
      pipeline.push({
        $lookup: {
          from: 'utilisateurs',
          localField: 'conducteurId',
          foreignField: '_id',
          as: 'conducteurInfo'
        }
      });

      pipeline.push({
        $unwind: '$conducteurInfo'
      });

      // 10. Formater les résultats
      pipeline.push({
        $project: {
          _id: 1,
          titre: 1,
          pointDepart: 1,
          pointArrivee: 1,
          arretsIntermediaires: 1,
          dateDepart: 1,
          heureDepart: 1,
          heureArriveePrevue: 1,
          prixParPassager: 1,
          nombrePlacesDisponibles: 1,
          nombrePlacesTotal: 1,
          statutTrajet: 1,
          distance: 1,
          dureeEstimee: 1,
          vehiculeUtilise: 1,
          preferences: 1,
          typeTrajet: 1,
          distanceDepart: { $divide: ['$distanceDepart', 1000] }, // m → km
          distanceArrivee: 1,
          scoreRelevance: 1,
          conducteur: {
            _id: '$conducteurInfo._id',
            nom: '$conducteurInfo.nom',
            prenom: '$conducteurInfo.prenom',
            photo: '$conducteurInfo.photo',
            noteGlobale: '$conducteurInfo.noteGlobale',
            nombreEvaluations: '$conducteurInfo.nombreEvaluations',
            telephoneVerifie: '$conducteurInfo.telephoneVerifie',
            scoreConfiance: '$conducteurInfo.scoreConfiance'
          }
        }
      });

      const resultats = await Trajet.aggregate(pipeline);

      logger.info(`✅ ${resultats.length} trajet(s) trouvé(s) par recherche géospatiale`);

      return {
        success: true,
        count: resultats.length,
        trajets: resultats,
        methode: 'geospatial',
        parametres: {
          rayonDepart: `${rayonDepart} km`,
          rayonArrivee: `${rayonArrivee} km`,
          position: { lat: departLat, lng: departLng },
          destination: { lat: arriveeLat, lng: arriveeLng },
          date: dateDepart ? new Date(dateDepart) : null,
          toleranceDate: `${toleranceDate}h`
        }
      };

    } catch (error) {
      logger.error('❌ Erreur recherche géospatiale:', error);
      throw error;
    }
  }

  // ===============================================
  // RECHERCHE PAR COMMUNE
  // ===============================================

  /**
   * Recherche simplifiée par commune et quartier
   * @param {Object} params - Paramètres de recherche
   * @returns {Promise<Object>}
   */
  async searchByCommune(params) {
    try {
      logger.info('🔍 Recherche par commune...');

      const {
        communeDepart,
        communeArrivee,
        quartierDepart,
        quartierArrivee,
        dateDepart,
        toleranceDate = this.config.TOLERANCE_DATE_DEFAUT_HEURES,
        limit = this.config.LIMITE_RESULTATS_DEFAUT
      } = params;

      if (!communeDepart || !communeArrivee) {
        throw new Error('Les communes de départ et d\'arrivée sont obligatoires');
      }

      const query = {
        'pointDepart.commune': communeDepart,
        'pointArrivee.commune': communeArrivee,
        statutTrajet: { $in: ['PROGRAMME', 'EN_COURS'] }
      };

      // Filtrage par quartier si fourni
      if (quartierDepart) {
        query['pointDepart.quartier'] = quartierDepart;
      }
      if (quartierArrivee) {
        query['pointArrivee.quartier'] = quartierArrivee;
      }

      // Filtrage par date
      if (dateDepart) {
        const dateDebut = new Date(dateDepart);
        dateDebut.setHours(dateDebut.getHours() - toleranceDate);
        
        const dateFin = new Date(dateDepart);
        dateFin.setHours(dateFin.getHours() + toleranceDate);

        query.dateDepart = {
          $gte: dateDebut,
          $lte: dateFin
        };
      } else {
        query.dateDepart = { $gte: new Date() };
      }

      const trajets = await Trajet.find(query)
        .populate('conducteurId', 'nom prenom photo noteGlobale nombreEvaluations telephoneVerifie scoreConfiance')
        .sort({ dateDepart: 1, prixParPassager: 1 })
        .limit(limit);

      logger.info(`✅ ${trajets.length} trajet(s) trouvé(s) par commune`);

      return {
        success: true,
        count: trajets.length,
        trajets,
        methode: 'commune',
        parametres: {
          communeDepart,
          communeArrivee,
          quartierDepart,
          quartierArrivee,
          date: dateDepart ? new Date(dateDepart) : null
        }
      };

    } catch (error) {
      logger.error('❌ Erreur recherche par commune:', error);
      throw error;
    }
  }

  // ===============================================
  // RECHERCHE INTELLIGENTE (SMART)
  // ===============================================

  /**
   * Recherche intelligente avec fallback automatique
   * Tente d'abord la recherche géospatiale, puis bascule sur commune si nécessaire
   * @param {Object} params - Paramètres de recherche
   * @returns {Promise<Object>}
   */
  async smartSearch(params) {
    try {
      logger.info('🧠 Recherche intelligente de trajets...');

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
      } = params;

      let result;

      // Stratégie 1: Recherche géospatiale si on a les coordonnées
      if (departLat && departLng && arriveeLat && arriveeLng) {
        try {
          result = await this.searchNearbyTrips({
            departLat: parseFloat(departLat),
            departLng: parseFloat(departLng),
            arriveeLat: parseFloat(arriveeLat),
            arriveeLng: parseFloat(arriveeLng),
            rayonDepart: rayonDepart ? parseFloat(rayonDepart) : this.config.RAYON_DEFAUT_KM,
            rayonArrivee: rayonArrivee ? parseFloat(rayonArrivee) : this.config.RAYON_DEFAUT_KM,
            dateDepart,
            toleranceDate: toleranceDate ? parseInt(toleranceDate) : this.config.TOLERANCE_DATE_DEFAUT_HEURES,
            limit: limit ? parseInt(limit) : this.config.LIMITE_RESULTATS_DEFAUT
          });

          // Fallback vers commune si aucun résultat
          if (result.count === 0 && communeDepart && communeArrivee) {
            logger.info('ℹ️ Aucun résultat géospatial, fallback vers recherche par commune...');
            
            result = await this.searchByCommune({
              communeDepart,
              communeArrivee,
              quartierDepart,
              quartierArrivee,
              dateDepart,
              toleranceDate: toleranceDate ? parseInt(toleranceDate) : this.config.TOLERANCE_DATE_DEFAUT_HEURES,
              limit: limit ? parseInt(limit) : this.config.LIMITE_RESULTATS_DEFAUT
            });
            
            result.methode = 'commune_fallback';
            result.fallback = true;
          }

        } catch (geoError) {
          logger.warn('⚠️ Erreur recherche géospatiale, fallback vers commune:', geoError.message);
          
          if (communeDepart && communeArrivee) {
            result = await this.searchByCommune({
              communeDepart,
              communeArrivee,
              quartierDepart,
              quartierArrivee,
              dateDepart,
              toleranceDate: toleranceDate ? parseInt(toleranceDate) : this.config.TOLERANCE_DATE_DEFAUT_HEURES,
              limit: limit ? parseInt(limit) : this.config.LIMITE_RESULTATS_DEFAUT
            });
            
            result.methode = 'commune_fallback';
            result.fallback = true;
            result.fallbackReason = geoError.message;
          } else {
            throw new Error('Recherche géospatiale échouée et pas de communes fournies pour le fallback');
          }
        }
      }
      // Stratégie 2: Recherche par commune directement
      else if (communeDepart && communeArrivee) {
        result = await this.searchByCommune({
          communeDepart,
          communeArrivee,
          quartierDepart,
          quartierArrivee,
          dateDepart,
          toleranceDate: toleranceDate ? parseInt(toleranceDate) : this.config.TOLERANCE_DATE_DEFAUT_HEURES,
          limit: limit ? parseInt(limit) : this.config.LIMITE_RESULTATS_DEFAUT
        });
      }
      // Erreur: paramètres insuffisants
      else {
        throw new Error('Veuillez fournir soit les coordonnées GPS, soit les communes de départ et d\'arrivée');
      }

      logger.info(`✅ Recherche intelligente terminée: ${result.count} résultat(s) (méthode: ${result.methode})`);

      return result;

    } catch (error) {
      logger.error('❌ Erreur recherche intelligente:', error);
      throw error;
    }
  }

  // ===============================================
  // MÉTHODES AUXILIAIRES
  // ===============================================

  /**
   * Obtenir les statistiques de recherche
   * @returns {Object}
   */
  getConfig() {
    return {
      ...this.config,
      timestamp: new Date()
    };
  }

  /**
   * Mettre à jour la configuration
   * @param {Object} newConfig
   */
  updateConfig(newConfig) {
    this.config = {
      ...this.config,
      ...newConfig
    };
    logger.info('✅ Configuration mise à jour:', this.config);
    return this.config;
  }
}

// ===============================================
// EXPORT SINGLETON
// ===============================================

const geoSearchService = new GeoSearchService();

module.exports = geoSearchService;