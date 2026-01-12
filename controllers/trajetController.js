const Trajet = require('../models/Trajet');
const { validationResult } = require('express-validator');
const AppError = require('../utils/AppError');
const distanceService = require('../services/distanceService'); // ⭐ NOUVEAU

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
  
  // ==================== CREATE ====================
  
  /**
   * ⭐ NOUVEAU: Prévisualiser distance AVANT création
   */
  /**
 * ⭐ Prévisualiser distance AVANT création
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
    await trajet.populate('conducteurId', 'nom prenom photo');
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

      // Validation que la date n'est pas déjà passée
      const dateDepart = new Date(trajetData.dateDepart);
      if (dateDepart < new Date()) {
        return res.status(400).json({
          success: false,
          message: 'La date de départ doit être dans le futur'
        });
      }

      // ⭐ MODIFIÉ: On met des valeurs par défaut SEULEMENT si non fournies
      // Le hook pre-save va calculer automatiquement les vraies valeurs
      if (!trajetData.distance) {
        trajetData.distance = 0.1; // Valeur temporaire minimale
      }

      console.log('🚗 Création trajet ponctuel pour:', req.user.nom, req.user.prenom);
      console.log('📊 Distance et durée seront calculées automatiquement...');

      // Créer et sauvegarder (le hook va calculer automatiquement)
      const nouveauTrajet = new Trajet(trajetData);
      await nouveauTrajet.save();

      await nouveauTrajet.populate('conducteurId', 'nom prenom photo');

      // Normaliser isExpired avant retour
      const nouveauTrajetObj = this._attachIsExpired([nouveauTrajet])[0];

      res.status(201).json({
        success: true,
        message: 'Trajet ponctuel créé avec succès',
        data: nouveauTrajetObj,
        // ⭐ NOUVEAU: Inclure les infos calculées
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

      await nouveauTrajet.populate('conducteurId', 'nom prenom photo');

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

      const query = {
        conducteurId,
        statutTrajet: { $in: ['PROGRAMME', 'EN_COURS'] },
        dateDepart: { $gte: new Date() }
      };

      const options = {
        page: parseInt(page),
        limit: parseInt(limit),
        sort: { dateDepart: 1 },
        populate: { path: 'conducteurId', select: 'nom prenom photo note' }
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
        dateDepart: { $gte: new Date() }
      };

      if (dateDepart) {
        query.dateDepart = { $gte: new Date(dateDepart) };
        if (dateFin) {
          query.dateDepart.$lte = new Date(dateFin);
        }
      }

      if (prixMin || prixMax) {
        query.prixParPassager = {};
        if (prixMin) query.prixParPassager.$gte = parseInt(prixMin);
        if (prixMax) query.prixParPassager.$lte = parseInt(prixMax);
      }

      if (typeTrajet) {
        query.typeTrajet = typeTrajet;
      }

      const options = {
        page: parseInt(page),
        limit: parseInt(limit),
        sort: { dateDepart: 1 },
        populate: { path: 'conducteurId', select: 'nom prenom photo note' }
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
        query.conducteurId = req.user.id;
      } else if (type === 'reserves') {
        return res.status(501).json({
          success: false,
          message: 'Fonction non implémentée - nécessite le modèle Reservation'
        });
      } else {
        query.conducteurId = req.user.id;
      }

      if (statut) {
        query.statutTrajet = statut;
      }

      const options = {
        page: parseInt(page),
        limit: parseInt(limit),
        sort: { dateDepart: -1 },
        populate: { path: 'conducteurId', select: 'nom prenom photo' }
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

      let baseQuery = {
        statutTrajet: 'PROGRAMME',
        nombrePlacesDisponibles: { $gte: parseInt(nombrePlacesMin) },
        dateDepart: { $gte: new Date() }
      };

      if (dateDepart) {
        const dateDebutFilter = new Date(dateDepart);
        if (dateFin) {
          baseQuery.dateDepart = {
            $gte: dateDebutFilter,
            $lte: new Date(dateFin)
          };
        } else {
          baseQuery.dateDepart = { $gte: dateDebutFilter };
        }
      }

      if (prixMax) {
        baseQuery.prixParPassager = { $lte: parseInt(prixMax) };
      }

      const pageNum = parseInt(page);
      const limitNum = parseInt(limit);
      const skip = (pageNum - 1) * limitNum;

      let result;

      if (longitude && latitude) {
        try {
          const long = parseFloat(longitude);
          const lat = parseFloat(latitude);
          const maxDistance = parseInt(rayonKm) * 1000;

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
                query: baseQuery,
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
                        photo: '$conducteurInfo.photoProfil',
                        note: '$conducteurInfo.noteGenerale'
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

          // Attacher isExpired pour les résultats d'aggregation (POJO)
          result.docs = this._attachIsExpired(result.docs);

          console.log(`✅ Recherche géospatiale réussie: ${total} trajet(s) trouvé(s)`);

        } catch (geoError) {
          console.error('❌ Erreur recherche géospatiale:', geoError.message);
          console.log('⚠️ Fallback vers recherche standard');
          
          const options = {
            page: pageNum,
            limit: limitNum,
            sort: { dateDepart: 1 },
            populate: { path: 'conducteurId', select: 'nom prenom photoProfil noteGenerale' }
          };
          
          result = await Trajet.paginate(baseQuery, options);
          // Attacher isExpired pour le fallback paginate
          result.docs = this._attachIsExpired(result.docs);
        }
      } else {
        const options = {
          page: pageNum,
          limit: limitNum,
          sort: { dateDepart: 1 },
          populate: { path: 'conducteurId', select: 'nom prenom photoProfil noteGenerale' }
        };
        
        result = await Trajet.paginate(baseQuery, options);
        // Attacher isExpired pour le paginate standard
        result.docs = this._attachIsExpired(result.docs);
      }

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
      console.error('❌ Erreur dans rechercherTrajetsDisponibles:', error.message);
      return next(AppError.serverError('Erreur serveur lors de la recherche de trajets', { 
        originalError: error.message 
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

      // Retourner l'objet avec isExpired normalisé
      await trajet.populate('conducteurId', '-password -email');
      const trajetObj = this._attachIsExpired([trajet])[0];
      res.json({
        success: true,
        data: trajetObj
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

      const query = {
        conducteurId,
        statutTrajet: { $in: ['PROGRAMME', 'EN_COURS'] },
        dateDepart: { $gte: new Date() } 
      };

      const options = {
        page: parseInt(page),
        limit: parseInt(limit),
        sort: { dateDepart: 1 },
        populate: { path: 'conducteurId', select: 'nom prenom photo note' }
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
        const nouvelleDate = new Date(req.body.dateDepart);
        if (nouvelleDate < new Date()) {
          return res.status(400).json({
            success: false,
            message: 'La nouvelle date de départ doit être dans le futur'
          });
        }
      }

      // ⭐ Le hook va recalculer automatiquement distance/durée/arrivée
      await trajet.save();

      await trajet.populate('conducteurId', 'nom prenom photo');

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
      await trajet.populate('conducteurId', 'nom prenom photo');
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
      await trajet.populate('conducteurId', 'nom prenom photo');
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

  async obtenirTrajetsExpires(req, res, next) {
    try {
      const { page = 1, limit = 20 } = req.query;

      const query = {
        statutTrajet: 'EXPIRE'
      };

      const options = {
        page: parseInt(page),
        limit: parseInt(limit),
        sort: { dateExpiration: -1 },
        populate: { path: 'conducteurId', select: 'nom prenom' }
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
      // Si la valeur est déjà un booléen, ne pas la recalculer
      if (typeof obj.isExpired === 'boolean') return obj;
      const dateDepart = obj.dateDepart ? new Date(obj.dateDepart) : null;
      const now = new Date();
      obj.isExpired = (obj.statutTrajet === 'EXPIRE') || (dateDepart && now > dateDepart && obj.statutTrajet === 'PROGRAMME');
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