// services/geoSearchService.js

const Trajet = require('../models/Trajet');
const geocodingService = require('./geocodingService');
const { logger } = require('../utils/logger');

/**
 * Service de recherche géospatiale — Logique Yango complète
 *
 * Un conducteur est retourné si le passager peut le rejoindre à:
 *   1. Son point de DÉPART (il est proche du passager)
 *   2. Un de ses ARRÊTS INTERMÉDIAIRES (il passe près du passager)
 *
 * Le résultat indique toujours à quel arrêt le passager peut monter.
 */
class GeoSearchService {

  // ============================================================
  // CONFIGURATION
  // ============================================================

  constructor() {
    this.config = {
      RAYON_DEFAUT_KM:              5,
      RAYON_MONTEE_DEFAUT_KM:       1,   // rayon pour détecter un arrêt proche du passager
      TOLERANCE_DATE_DEFAUT_HEURES: 2,
      LIMITE_RESULTATS_DEFAUT:      20,
      RAYON_MAX_KM:                 50,
      RAYON_MIN_KM:                 0.5,
      TOLERANCE_DIRECTION_DEGRES:   60   // ±60° = même direction acceptée
    };
  }

  // ============================================================
  // VALIDATION
  // ============================================================

  isValidCoordinate(lat, lng) {
    return (
      typeof lat === 'number' && typeof lng === 'number' &&
      lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
    );
  }

  _validateRadius(rayon) {
    if (typeof rayon !== 'number' || rayon < this.config.RAYON_MIN_KM || rayon > this.config.RAYON_MAX_KM) {
      throw new Error(`Le rayon doit être entre ${this.config.RAYON_MIN_KM} et ${this.config.RAYON_MAX_KM} km`);
    }
  }

  _validateSearchParams({ departLat, departLng, arriveeLat, arriveeLng }) {
    if (!this.isValidCoordinate(departLat, departLng))
      throw new Error('Coordonnées de départ invalides');
    if (!this.isValidCoordinate(arriveeLat, arriveeLng))
      throw new Error("Coordonnées d'arrivée invalides");
  }

  // ============================================================
  // UTILITAIRES DIRECTION ET DISTANCE
  // ============================================================

  /**
   * Angle de direction entre deux points GPS (0°=Nord, 90°=Est, 180°=Sud, 270°=Ouest)
   */
  calculateBearing(lat1, lng1, lat2, lng2) {
    const dLng = this._toRad(lng2 - lng1);
    const y = Math.sin(dLng) * Math.cos(this._toRad(lat2));
    const x = Math.cos(this._toRad(lat1)) * Math.sin(this._toRad(lat2)) -
              Math.sin(this._toRad(lat1)) * Math.cos(this._toRad(lat2)) * Math.cos(dLng);
    return (this._toDeg(Math.atan2(y, x)) + 360) % 360;
  }

  isSimilarDirection(b1, b2, tolerance = this.config.TOLERANCE_DIRECTION_DEGRES) {
    const diff = Math.abs(b1 - b2);
    return diff <= tolerance || diff >= (360 - tolerance);
  }

  /**
   * Distance Haversine entre deux points GPS (résultat en km)
   */
  haversineKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = this._toRad(lat2 - lat1);
    const dLng = this._toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(this._toRad(lat1)) * Math.cos(this._toRad(lat2)) *
              Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  _toRad(d) { return d * Math.PI / 180; }
  _toDeg(r) { return r * 180 / Math.PI; }

  // ============================================================
  // COEUR YANGO: TROUVER L'ARRÊT DE MONTÉE
  // ============================================================

  /**
   * Pour un trajet conducteur donné, trouve le premier point
   * du trajet qui est accessible au passager (dans son rayon).
   *
   * Vérifie dans cet ordre:
   *   1. Point de DÉPART du conducteur
   *   2. ARRÊTS INTERMÉDIAIRES (du premier au dernier, par ordreArret)
   *
   * Retourne le premier point trouvé dans le rayon → le passager monte
   * au bon endroit et dans le bon sens du trajet.
   *
   * @param {Object} trajet        - Document Trajet Mongoose
   * @param {number} passagerLat
   * @param {number} passagerLng
   * @param {number} rayonMonteeKm - Rayon autour du passager
   * @returns {Object|null}        - Infos arrêt de montée ou null
   */
  _trouverArretMontee(trajet, passagerLat, passagerLng, rayonMonteeKm) {

    // 1. Point de départ du conducteur
    const dCoords = trajet.pointDepart?.coordonnees?.coordinates;
    if (dCoords) {
      const [dLng, dLat] = dCoords; // MongoDB: [longitude, latitude]
      const dist = this.haversineKm(passagerLat, passagerLng, dLat, dLng);
      if (dist <= rayonMonteeKm) {
        return {
          type:        'DEPART',
          nom:         trajet.pointDepart.nom,
          adresse:     trajet.pointDepart.adresse,
          commune:     trajet.pointDepart.commune,
          quartier:    trajet.pointDepart.quartier,
          distanceKm:  parseFloat(dist.toFixed(2)),
          ordre:       0,
          coordonnees: { lat: dLat, lng: dLng }
        };
      }
    }

    // 2. Arrêts intermédiaires (triés par ordreArret)
    const arrets = (trajet.arretsIntermediaires || [])
      .slice()
      .sort((a, b) => a.ordreArret - b.ordreArret);

    for (const arret of arrets) {
      const aCoords = arret.coordonnees?.coordinates;
      if (!aCoords) continue;

      const [aLng, aLat] = aCoords;
      const dist = this.haversineKm(passagerLat, passagerLng, aLat, aLng);

      if (dist <= rayonMonteeKm) {
        return {
          type:        'ARRET_INTERMEDIAIRE',
          nom:         arret.nom,
          adresse:     arret.adresse,
          commune:     arret.commune,
          quartier:    arret.quartier,
          distanceKm:  parseFloat(dist.toFixed(2)),
          ordre:       arret.ordreArret,
          coordonnees: { lat: aLat, lng: aLng }
        };
      }
    }

    return null; // Pas de point de montée dans le rayon
  }

  // ============================================================
  // RECHERCHE GÉOSPATIALE PRINCIPALE
  // ============================================================

  /**
   * Recherche Yango complète:
   * 1. MongoDB $geoNear: conducteurs dont le départ est dans un grand rayon
   * 2. Filtre: statut, places, prix, préférences, date
   * 3. Lookup: infos conducteur (noteMin)
   * Post-aggregation JS:
   * 4. Vérifier destination proche
   * 5. Vérifier direction (même sens)
   * 6. Trouver arrêt de montée (départ OU arrêt intermédiaire)
   * 7. Trier par distance arrêt de montée (le plus proche en premier)
   */
  async searchNearbyTrips(params) {
    try {
      logger.info('Recherche géospatiale Yango...');

      const {
        departLat, departLng,
        arriveeLat, arriveeLng,
        communeArrivee,
        quartierArrivee, 
        rayonDepart    = this.config.RAYON_DEFAUT_KM,
        rayonArrivee   = this.config.RAYON_DEFAUT_KM,
        rayonMontee    = this.config.RAYON_MONTEE_DEFAUT_KM,
        dateDepart,
        toleranceDate  = this.config.TOLERANCE_DATE_DEFAUT_HEURES,
        nombrePassagers,
        prixMax, noteMin,
        musique, climatisation, bagages, nonFumeur,
        limit = this.config.LIMITE_RESULTATS_DEFAUT
      } = params;

      this._validateSearchParams(params);
      this._validateRadius(rayonDepart);
      this._validateRadius(rayonArrivee);

      let communeArriveeFinale  = communeArrivee;
      let quartierArriveeFinale = quartierArrivee;

      if (!communeArriveeFinale) {
        const zone = geocodingService.reverseGeocode(arriveeLat, arriveeLng);
        if (zone) {
          communeArriveeFinale  = zone.commune;
          quartierArriveeFinale = zone.quartier;
          logger.info(`Reverse geocoding arrivée: ${zone.label} (${zone.distanceKm} km)`);
        }
      }
      // Direction souhaitée par le passager (Saint Jean → Plateau = ~185°)
      const directionPassager = this.calculateBearing(
        departLat, departLng, arriveeLat, arriveeLng
      );
      logger.info(`Direction passager: ${directionPassager.toFixed(1)}°`);

      // --------------------------------------------------------
      // PIPELINE MONGODB
      // --------------------------------------------------------
      const pipeline = [];

      // ÉTAPE 1: $geoNear avec grand rayon
      // On utilise un rayon large pour attraper les conducteurs
      // dont un arrêt intermédiaire est proche du passager
      // Le filtre précis se fait ensuite en JS via _trouverArretMontee()
      const rayonRecherche = this.config.RAYON_MAX_KM * 1000;
      pipeline.push({
        $geoNear: {
          near: { type: 'Point', coordinates: [departLng, departLat] },
          distanceField: 'distanceDepartMetres',
          maxDistance: rayonRecherche,
          spherical: true,
          key: 'pointDepart.coordonnees'
        }
      });

      // ÉTAPE 2: Filtres de base
      const matchBase = { statutTrajet: { $in: ['PROGRAMME', 'EN_COURS'] } };
      if (nombrePassagers)       matchBase.nombrePlacesDisponibles            = { $gte: nombrePassagers };
      if (prixMax)               matchBase.prixParPassager                    = { $lte: prixMax };
      if (musique === true)      matchBase['preferences.musique']             = true;
      if (climatisation === true) matchBase['preferences.climatisationActive'] = true;
      if (bagages === true)      matchBase['preferences.accepteBagages']      = true;
      if (nonFumeur === true)    matchBase['preferences.fumeur']              = false;
      pipeline.push({ $match: matchBase });

      // ÉTAPE 3: Filtre date
      if (dateDepart) {
        const debut = new Date(dateDepart);
        debut.setHours(debut.getHours() - toleranceDate);
        const fin = new Date(dateDepart);
        fin.setHours(fin.getHours() + toleranceDate);
        pipeline.push({ $match: { dateDepart: { $gte: debut, $lte: fin } } });
      } else {
        pipeline.push({ $match: { dateDepart: { $gte: new Date() } } });
      }

      // ÉTAPE 4: Infos conducteur
      pipeline.push({
        $lookup: {
          from: 'utilisateurs',
          localField: 'conducteurId',
          foreignField: '_id',
          as: 'conducteurInfo'
        }
      });
      pipeline.push({ $unwind: '$conducteurInfo' });

      // ÉTAPE 5: Filtre note minimale
      if (noteMin) {
        pipeline.push({ $match: { 'conducteurInfo.noteGlobale': { $gte: noteMin } } });
      }

      // Limiter avant le traitement JS pour la performance
      pipeline.push({ $limit: limit * 5 });

      // diagnostic test to verify 2dsphere index
      const testPipeline = [
        {
          $geoNear: {
            near: { type: 'Point', coordinates: [departLng, departLat] },
            distanceField: 'distanceDepartMetres',
            maxDistance: 100000,
            spherical: true,
            key: 'pointDepart.coordonnees'
          }
        },
        { $limit: 5 }
      ];

      const testCandidats = await Trajet.aggregate(testPipeline);
      logger.info(`TEST $geoNear: ${testCandidats.length} résultat(s)`);
      testCandidats.forEach(t => logger.info(`  → ${t._id} | départ: ${t.pointDepart?.commune}`));

      const candidats = await Trajet.aggregate(pipeline);
      logger.info(`${candidats.length} candidat(s) à analyser...`);

      // store diagnostics for response if caller asked
      let diagnostic = null;
      if (params.debugGeo) {
        diagnostic = {
          testCount: testCandidats.length,
          testSamples: testCandidats.map(t => ({ _id: t._id, communeDepart: t.pointDepart?.commune }))
        };
      }

      // --------------------------------------------------------
      // TRAITEMENT JS — logique Yango complète
      // --------------------------------------------------------
      const resultats = [];

      for (const trajet of candidats) {
        logger.info(`\n--- Analyse trajet: ${trajet._id} (${trajet.pointDepart?.commune} → ${trajet.pointArrivee?.commune}) ---`);

        // A) Destination du conducteur proche de celle du passager ?
        const arrCoords = trajet.pointArrivee?.coordonnees?.coordinates;
        if (!arrCoords) { logger.info('EXCLU: pas de coordonnées arrivée'); continue; }
        const [arrLng, arrLat] = arrCoords;
        const distArrivee = this.haversineKm(arriveeLat, arriveeLng, arrLat, arrLng);
        logger.info(`Distance arrivée: ${distArrivee.toFixed(2)} km (max autorisé: ${rayonArrivee} km)`);
        if (distArrivee > rayonArrivee) { logger.info('EXCLU: arrivée trop loin'); continue; }

        // Filtre commune arrivée
        if (communeArriveeFinale) {
          const communeConducteur = trajet.pointArrivee?.commune?.toLowerCase().trim();
          const communePassager   = communeArriveeFinale.toLowerCase().trim();
          logger.info(`Commune arrivée: conducteur="${communeConducteur}" vs passager="${communePassager}"`);
          if (communeConducteur !== communePassager) {
            logger.info('EXCLU: commune arrivée différente');
            continue;
          }

          if (quartierArriveeFinale && trajet.pointArrivee?.quartier) {
            const quartierConducteur = trajet.pointArrivee.quartier.toLowerCase().trim();
            let quartierPassager   = quartierArriveeFinale.toLowerCase().trim();
            logger.info(`Quartier arrivée: conducteur="${quartierConducteur}" vs passager="${quartierPassager}"`);
            // anciennement nous excluions si les noms ne correspondaient pas exactement
            // mais cela élimine des trajets valables (ex. Riviera vs Attoban dans Cocody).
            // le filtre de distance suffit pour garantir proximité, on se contente donc
            // de logguer l'écart et on ne bloque plus le trajet.
            
            // pour conserver un peu d'information, on pourrait plus tard conserver cette
            // comparaison dans le diagnostic, mais on ne met plus `continue` ici.
          }
        } else {
          logger.info('Filtre commune arrivée: IGNORÉ (communeArriveeFinale non résolue)');
        }
        // B) Même direction que le passager ?
        const depCoords = trajet.pointDepart?.coordonnees?.coordinates;
        if (depCoords) {
          const [depLng, depLat] = depCoords;
          const dirConducteur = this.calculateBearing(depLat, depLng, arrLat, arrLng);
          const dirSimilaire  = this.isSimilarDirection(directionPassager, dirConducteur);
          logger.info(`Direction: conducteur=${dirConducteur.toFixed(0)}° passager=${directionPassager.toFixed(0)}° similaire=${dirSimilaire}`);
          if (!dirSimilaire) {
            logger.info('EXCLU: direction différente');
            continue;
          }
        }

        // C) Le passager peut-il monter quelque part sur ce trajet ?
        logger.info(`Recherche arrêt montée: passager à (${departLat}, ${departLng}), rayon=${rayonMontee} km`);
        logger.info(`Arrêts disponibles: départ + ${trajet.arretsIntermediaires?.length || 0} intermédiaire(s)`);
        const arretMontee = this._trouverArretMontee(trajet, departLat, departLng, rayonMontee);
        if (!arretMontee) {
          logger.info('EXCLU: aucun arrêt de montée dans le rayon');

          // Log détaillé pour debug
          const dCoords = trajet.pointDepart?.coordonnees?.coordinates;
          if (dCoords) {
            const [dLng, dLat] = dCoords;
            const distDepart = this.haversineKm(departLat, departLng, dLat, dLng);
            logger.info(`  → Départ conducteur: (${dLat}, ${dLng}) — distance: ${distDepart.toFixed(2)} km`);
          }
          for (const arret of (trajet.arretsIntermediaires || [])) {
            const aCoords = arret.coordonnees?.coordinates;
            if (aCoords) {
              const [aLng, aLat] = aCoords;
              const distArret = this.haversineKm(departLat, departLng, aLat, aLng);
              logger.info(`  → Arrêt "${arret.nom}": (${aLat}, ${aLng}) — distance: ${distArret.toFixed(2)} km`);
            }
          }
          continue;
        }
        logger.info(`Arrêt montée trouvé: type=${arretMontee.type} nom="${arretMontee.nom}" distance=${arretMontee.distanceKm} km`);

        // D) Résultat formaté
        logger.info(`✅ TRAJET ACCEPTÉ: ${trajet._id}`);
        resultats.push({
          _id:                     trajet._id,
          titre:                   trajet.titre,
          pointDepart:             trajet.pointDepart,
          pointArrivee:            trajet.pointArrivee,
          arretsIntermediaires:    trajet.arretsIntermediaires,
          dateDepart:              trajet.dateDepart,
          heureDepart:             trajet.heureDepart,
          heureArriveePrevue:      trajet.heureArriveePrevue,
          prixParPassager:         trajet.prixParPassager,
          nombrePlacesDisponibles: trajet.nombrePlacesDisponibles,
          nombrePlacesTotal:       trajet.nombrePlacesTotal,
          statutTrajet:            trajet.statutTrajet,
          distance:                trajet.distance,
          dureeEstimee:            trajet.dureeEstimee,
          vehiculeUtilise:         trajet.vehiculeUtilise,
          preferences:             trajet.preferences,
          typeTrajet:              trajet.typeTrajet,

          arretMontee,
          distanceMonteeKm:  arretMontee.distanceKm,
          distanceArriveeKm: parseFloat(distArrivee.toFixed(2)),

          conducteur: {
            _id:               trajet.conducteurInfo._id,
            nom:               trajet.conducteurInfo.nom,
            prenom:            trajet.conducteurInfo.prenom,
            photo:             trajet.conducteurInfo.photo,
            noteGlobale:       trajet.conducteurInfo.noteGlobale,
            nombreEvaluations: trajet.conducteurInfo.nombreEvaluations,
            telephoneVerifie:  trajet.conducteurInfo.telephoneVerifie,
            scoreConfiance:    trajet.conducteurInfo.scoreConfiance
          }
        });
      }

      // E) Trier par distance arrêt de montée (le plus proche en premier)
      resultats.sort((a, b) => a.distanceMonteeKm - b.distanceMonteeKm);

      const resultatsFinaux = resultats.slice(0, limit);

      logger.info(`${resultatsFinaux.length} trajet(s) Yango trouvé(s)`);

      const response = {
        success: true,
        count:   resultatsFinaux.length,
        trajets: resultatsFinaux,
        methode: 'geospatial_WayZEco',
        parametres: {
          rayonDepart:       `${rayonDepart} km`,
          rayonArrivee:      `${rayonArrivee} km`,
          rayonMontee:       `${rayonMontee} km`,
          position:          { lat: departLat,  lng: departLng  },
          destination:       { lat: arriveeLat, lng: arriveeLng },
          directionPassager: `${directionPassager.toFixed(1)}°`,
          date:              dateDepart ? new Date(dateDepart) : null,
          toleranceDate:     `${toleranceDate}h`
        }
      };

      if (diagnostic) {
        response.diagnostic = diagnostic;
      }

      return response;

    } catch (error) {
      logger.error('Erreur recherche géospatiale:', error);
      throw error;
    }
  }

  // ============================================================
  // RECHERCHE PAR COMMUNE (fallback sans GPS)
  // ============================================================

  async searchByCommune(params) {
    try {
      logger.info('Recherche par commune...');

      const {
        communeDepart, communeArrivee,
        quartierDepart, quartierArrivee,
        dateDepart,
        toleranceDate  = this.config.TOLERANCE_DATE_DEFAUT_HEURES,
        nombrePassagers, prixMax, noteMin,
        musique, climatisation, bagages, nonFumeur,
        limit = this.config.LIMITE_RESULTATS_DEFAUT
      } = params;

      if (!communeDepart || !communeArrivee)
        throw new Error("Les communes de départ et d'arrivée sont obligatoires");

      const query = {
        'pointDepart.commune':  { $regex: new RegExp(`^${communeDepart}$`,  'i') },
        'pointArrivee.commune': { $regex: new RegExp(`^${communeArrivee}$`, 'i') },
        statutTrajet: { $in: ['PROGRAMME', 'EN_COURS'] }
      };

      // Quartier: accepter exact OU sans quartier renseigné
      if (quartierDepart) {
        query.$and = query.$and || [];
        query.$and.push({ $or: [
          { 'pointDepart.quartier': { $regex: new RegExp(`^${quartierDepart}$`, 'i') } },
          { 'pointDepart.quartier': { $exists: false } },
          { 'pointDepart.quartier': null },
          { 'pointDepart.quartier': '' }
        ]});
      }
      if (quartierArrivee) {
        query.$and = query.$and || [];
        query.$and.push({ $or: [
          { 'pointArrivee.quartier': { $regex: new RegExp(`^${quartierArrivee}$`, 'i') } },
          { 'pointArrivee.quartier': { $exists: false } },
          { 'pointArrivee.quartier': null },
          { 'pointArrivee.quartier': '' }
        ]});
      }

      if (nombrePassagers)       query.nombrePlacesDisponibles            = { $gte: nombrePassagers };
      if (prixMax)               query.prixParPassager                    = { $lte: prixMax };
      if (musique === true)      query['preferences.musique']             = true;
      if (climatisation === true) query['preferences.climatisationActive'] = true;
      if (bagages === true)      query['preferences.accepteBagages']      = true;
      if (nonFumeur === true)    query['preferences.fumeur']              = false;

      if (dateDepart) {
        const debut = new Date(dateDepart);
        debut.setHours(debut.getHours() - toleranceDate);
        const fin = new Date(dateDepart);
        fin.setHours(fin.getHours() + toleranceDate);
        query.dateDepart = { $gte: debut, $lte: fin };
      } else {
        query.dateDepart = { $gte: new Date() };
      }

      const trajets = await Trajet.find(query)
        .populate('conducteurId', 'nom prenom photo noteGlobale nombreEvaluations telephoneVerifie scoreConfiance')
        .sort({ dateDepart: 1, prixParPassager: 1 })
        .limit(limit);

      const trajetsFiltres = noteMin
        ? trajets.filter(t => t.conducteurId?.noteGlobale >= noteMin)
        : trajets;

      logger.info(`${trajetsFiltres.length} trajet(s) par commune`);

      return {
        success: true,
        count:   trajetsFiltres.length,
        trajets: trajetsFiltres,
        methode: 'commune',
        parametres: { communeDepart, communeArrivee, quartierDepart, quartierArrivee }
      };

    } catch (error) {
      logger.error('Erreur recherche par commune:', error);
      throw error;
    }
  }

  // ============================================================
  // RECHERCHE INTELLIGENTE — point d'entrée principal
  // ============================================================

  /**
   * Stratégie:
   *   GPS fourni      → searchNearbyTrips (Yango pur)
   *   Texte seulement → geocoding → GPS → searchNearbyTrips
   *   0 résultat      → fallback searchByCommune
   *   Erreur geo      → fallback searchByCommune
   */
  async smartSearch(params) {
    try {
      logger.info('Recherche intelligente Yango...');

      const {
        departLat, departLng, arriveeLat, arriveeLng,
        communeDepart, communeArrivee,
        quartierDepart, quartierArrivee,
        rayonDepart, rayonArrivee, rayonMontee,
        dateDepart, toleranceDate,
        nombrePassagers, prixMax, noteMin,
        musique, climatisation, bagages, nonFumeur,
        limit
      } = params;

      // ---- Résolution GPS ----
      let gpsDepart = null, gpsArrivee = null, geocodingInfo = null;

      if (departLat && departLng && arriveeLat && arriveeLng) {
        gpsDepart  = { lat: parseFloat(departLat),  lng: parseFloat(departLng)  };
        gpsArrivee = { lat: parseFloat(arriveeLat), lng: parseFloat(arriveeLng) };
        logger.info('GPS direct utilisé');

      } else if (communeDepart && communeArrivee) {
        const coordsDepart  = geocodingService.fuzzyResolve(communeDepart,  quartierDepart);
        const coordsArrivee = geocodingService.fuzzyResolve(communeArrivee, quartierArrivee);

        if (!coordsDepart)  throw new Error(`Commune de départ inconnue: "${communeDepart}"`);
        if (!coordsArrivee) throw new Error(`Commune d'arrivée inconnue: "${communeArrivee}"`);

        gpsDepart  = { lat: coordsDepart.lat,  lng: coordsDepart.lng  };
        gpsArrivee = { lat: coordsArrivee.lat, lng: coordsArrivee.lng };
        geocodingInfo = {
          depart:  { label: coordsDepart.label,  precision: coordsDepart.precision  },
          arrivee: { label: coordsArrivee.label, precision: coordsArrivee.precision }
        };
        logger.info(`GPS résolu: ${gpsDepart.lat},${gpsDepart.lng} → ${gpsArrivee.lat},${gpsArrivee.lng}`);

      } else {
        throw new Error("Veuillez fournir les coordonnées GPS ou les communes de départ et d'arrivée");
      }

      const searchParams = {
        departLat:  gpsDepart.lat,  departLng:  gpsDepart.lng,
        arriveeLat: gpsArrivee.lat, arriveeLng: gpsArrivee.lng,
        communeArrivee, 
        quartierArrivee, 
        rayonDepart:  rayonDepart  ? parseFloat(rayonDepart)  : this.config.RAYON_DEFAUT_KM,
        rayonArrivee: rayonArrivee ? parseFloat(rayonArrivee) : this.config.RAYON_DEFAUT_KM,
        rayonMontee:  rayonMontee  ? parseFloat(rayonMontee)  : this.config.RAYON_MONTEE_DEFAUT_KM,
        dateDepart,
        toleranceDate: toleranceDate ? parseInt(toleranceDate) : this.config.TOLERANCE_DATE_DEFAUT_HEURES,
        nombrePassagers, prixMax, noteMin,
        musique, climatisation, bagages, nonFumeur,
        limit: limit ? parseInt(limit) : this.config.LIMITE_RESULTATS_DEFAUT
      };

      let result;

      try {
        result = await this.searchNearbyTrips(searchParams);
        if (geocodingInfo) result.geocoding = geocodingInfo;

        // Fallback commune si 0 résultat
        if (result.count === 0 && communeDepart && communeArrivee) {
          logger.info('0 résultat géospatial → fallback commune...');
          result = await this.searchByCommune({
            communeDepart, communeArrivee, quartierDepart, quartierArrivee,
            dateDepart,
            toleranceDate: toleranceDate ? parseInt(toleranceDate) : this.config.TOLERANCE_DATE_DEFAUT_HEURES,
            nombrePassagers, prixMax, noteMin,
            musique, climatisation, bagages, nonFumeur,
            limit: limit ? parseInt(limit) : this.config.LIMITE_RESULTATS_DEFAUT
          });
          result.methode       = 'commune_fallback';
          result.fallback      = true;
          result.fallbackRaison = 'Aucun résultat dans le rayon géospatial';
          if (geocodingInfo) result.geocoding = geocodingInfo;
        }

      } catch (geoError) {
        logger.warn('Erreur géospatiale → fallback commune:', geoError.message);
        if (communeDepart && communeArrivee) {
          result = await this.searchByCommune({
            communeDepart, communeArrivee, quartierDepart, quartierArrivee,
            dateDepart,
            toleranceDate: toleranceDate ? parseInt(toleranceDate) : this.config.TOLERANCE_DATE_DEFAUT_HEURES,
            nombrePassagers, prixMax, noteMin,
            musique, climatisation, bagages, nonFumeur,
            limit: limit ? parseInt(limit) : this.config.LIMITE_RESULTATS_DEFAUT
          });
          result.methode        = 'commune_fallback';
          result.fallback       = true;
          result.fallbackRaison = geoError.message;
        } else {
          throw new Error('Recherche géospatiale échouée et pas de communes fournies pour le fallback');
        }
      }

      logger.info(`Yango terminé: ${result.count} résultat(s) — méthode: ${result.methode}`);
      return result;

    } catch (error) {
      logger.error('Erreur recherche intelligente:', error);
      throw error;
    }
  }

  // ============================================================
  // CONFIG
  // ============================================================

  getConfig() { return { ...this.config, timestamp: new Date() }; }
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    return this.config;
  }
}

const geoSearchService = new GeoSearchService();
module.exports = geoSearchService;