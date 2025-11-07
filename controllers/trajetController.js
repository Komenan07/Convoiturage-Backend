const Trajet = require('../models/Trajet');
const { validationResult } = require('express-validator');
const AppError = require('../utils/AppError');

class TrajetController {
  
  // ==================== CREATE ====================
  
  /**
   * Créer un trajet ponctuel
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

      // ⭐ NOUVEAU: Validation que la date n'est pas déjà passée
      const dateDepart = new Date(trajetData.dateDepart);
      if (dateDepart < new Date()) {
        return res.status(400).json({
          success: false,
          message: 'La date de départ doit être dans le futur'
        });
      }

      // Calculs par défaut si non fournis
      if (!trajetData.distance) {
        trajetData.distance = 15;
      }
      if (!trajetData.dureeEstimee) {
        trajetData.dureeEstimee = Math.round(trajetData.distance * 2);
      }
      if (!trajetData.heureArriveePrevue) {
        const [heures, minutes] = trajetData.heureDepart.split(':').map(Number);
        const totalMinutes = heures * 60 + minutes + trajetData.dureeEstimee;
        const nouvellesHeures = Math.floor(totalMinutes / 60) % 24;
        const nouvellesMinutes = totalMinutes % 60;
        trajetData.heureArriveePrevue = `${nouvellesHeures.toString().padStart(2, '0')}:${nouvellesMinutes.toString().padStart(2, '0')}`;
      }

      const nouveauTrajet = new Trajet(trajetData);
      await nouveauTrajet.save();

      await nouveauTrajet.populate('conducteurId', 'nom prenom photo');

      res.status(201).json({
        success: true,
        message: 'Trajet ponctuel créé avec succès',
        data: nouveauTrajet
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
      
      return next(AppError.serverError('Erreur serveur lors de la création du trajet', { 
        originalError: error.message 
      }));
    }
  }

  /**
   * Créer un trajet récurrent
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

      // ⭐ NOUVEAU: Validation que la date de fin n'est pas déjà passée
      if (trajetData.recurrence.dateFinRecurrence) {
        const dateFin = new Date(trajetData.recurrence.dateFinRecurrence);
        if (dateFin < new Date()) {
          return res.status(400).json({
            success: false,
            message: 'La date de fin de récurrence ne peut pas être dans le passé'
          });
        }
      }

      // Calculs par défaut
      if (!trajetData.distance) {
        trajetData.distance = 15;
      }
      if (!trajetData.dureeEstimee) {
        trajetData.dureeEstimee = Math.round(trajetData.distance * 2);
      }
      if (!trajetData.heureArriveePrevue) {
        const [heures, minutes] = trajetData.heureDepart.split(':').map(Number);
        const totalMinutes = heures * 60 + minutes + trajetData.dureeEstimee;
        const nouvellesHeures = Math.floor(totalMinutes / 60) % 24;
        const nouvellesMinutes = totalMinutes % 60;
        trajetData.heureArriveePrevue = `${nouvellesHeures.toString().padStart(2, '0')}:${nouvellesMinutes.toString().padStart(2, '0')}`;
      }

      const nouveauTrajet = new Trajet(trajetData);
      await nouveauTrajet.save();

      await nouveauTrajet.populate('conducteurId', 'nom prenom photo');

      res.status(201).json({
        success: true,
        message: 'Trajet récurrent créé avec succès',
        data: nouveauTrajet
      });

    } catch (error) {
      console.error('Erreur création trajet récurrent:', error);
      return next(AppError.serverError('Erreur serveur lors de la création du trajet récurrent', { 
        originalError: error.message 
      }));
    }
  }

  // ==================== READ ====================

  /**
 * Obtenir les détails d'un trajet (alias pour obtenirTrajetParId)
 */
async obtenirDetailsTrajet(req, res, next) {
  return this.obtenirTrajetParId(req, res, next);
}

/**
 * Obtenir les trajets d'un conducteur spécifique
 */
async obtenirTrajetsConducteur(req, res, next) {
  // return this.obtenirTrajetsParConducteur(req, res, next);
  try {
      const { conducteurId } = req.params;
      const { page = 1, limit = 20 } = req.query;

      const query = {
        conducteurId,
        statutTrajet: { $in: ['PROGRAMME', 'EN_COURS'] },
        dateDepart: { $gte: new Date() } // ⭐ NOUVEAU: Seulement les trajets futurs
      };

      const options = {
        page: parseInt(page),
        limit: parseInt(limit),
        sort: { dateDepart: 1 },
        populate: { path: 'conducteurId', select: 'nom prenom photo note' }
      };

      const trajets = await Trajet.paginate(query, options);

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

/**
 * Filtrer les trajets avec des critères avancés
 */
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

    // Filtre par date
    if (dateDepart) {
      query.dateDepart = { $gte: new Date(dateDepart) };
      if (dateFin) {
        query.dateDepart.$lte = new Date(dateFin);
      }
    }

    // Filtre par prix
    if (prixMin || prixMax) {
      query.prixParPassager = {};
      if (prixMin) query.prixParPassager.$gte = parseInt(prixMin);
      if (prixMax) query.prixParPassager.$lte = parseInt(prixMax);
    }

    // Filtre par type
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

/**
 * Obtenir l'historique des trajets de l'utilisateur connecté
 */
async obtenirHistoriqueTrajets(req, res, next) {
  try {
    const { type = 'tous', statut, page = 1, limit = 20 } = req.query;

    let query = {};

    if (type === 'conduits') {
      query.conducteurId = req.user.id;
    } else if (type === 'reserves') {
      // TODO: Implémenter quand le modèle Reservation sera prêt
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

/**
 * Modifier les détails d'un trajet (alias pour modifierTrajet)
 */
async modifierDetailsTrajet(req, res, next) {
  return this.modifierTrajet(req, res, next);
}

/**
 * Changer le nombre de places disponibles
 */
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

/**
 * Modifier les préférences d'un trajet
 */
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
/**
 * Rechercher trajets disponibles (géospatial)
 */
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

    // Construction de la requête de base
    let baseQuery = {
      statutTrajet: 'PROGRAMME',
      nombrePlacesDisponibles: { $gte: parseInt(nombrePlacesMin) },
      dateDepart: { $gte: new Date() }
    };

    // Filtre par date
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

    // Filtre par prix
    if (prixMax) {
      baseQuery.prixParPassager = { $lte: parseInt(prixMax) };
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    let result;

    // Recherche géospatiale si coordonnées fournies
    if (longitude && latitude) {
      try {
        const long = parseFloat(longitude);
        const lat = parseFloat(latitude);
        const maxDistance = parseInt(rayonKm) * 1000;

        // Pipeline d'agrégation pour recherche géospatiale
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
              key: "pointDepart.coordonnees" // ⭐ SOLUTION: Spécifier l'index à utiliser
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

        console.log(`✅ Recherche géospatiale réussie: ${total} trajet(s) trouvé(s)`);

      } catch (geoError) {
        console.error('❌ Erreur recherche géospatiale:', geoError.message);
        
        // Fallback: recherche sans géolocalisation
        console.log('⚠️ Fallback vers recherche standard sans géolocalisation');
        
        const options = {
          page: pageNum,
          limit: limitNum,
          sort: { dateDepart: 1 },
          populate: { path: 'conducteurId', select: 'nom prenom photoProfil noteGenerale' }
        };
        
        result = await Trajet.paginate(baseQuery, options);
      }
    } else {
      // Recherche simple sans géolocalisation
      const options = {
        page: pageNum,
        limit: limitNum,
        sort: { dateDepart: 1 },
        populate: { path: 'conducteurId', select: 'nom prenom photoProfil noteGenerale' }
      };
      
      result = await Trajet.paginate(baseQuery, options);
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

  /**
   * Obtenir un trajet par ID
   */
  async obtenirTrajetParId(req, res, next) {
    try {
      const { id } = req.params;

      const trajet = await Trajet.findById(id)
        .populate('conducteurId', 'nom prenom photo note telephone');

      if (!trajet) {
        return res.status(404).json({
          success: false,
          message: 'Trajet non trouvé'
        });
      }

      // ⭐ NOUVEAU: Vérifier et marquer comme expiré si nécessaire
      if (trajet.estExpire() && trajet.statutTrajet === 'PROGRAMME') {
        await trajet.marquerCommeExpire();
      }

      res.json({
        success: true,
        data: trajet
      });

    } catch (error) {
      return next(AppError.serverError('Erreur serveur lors de la récupération du trajet', { 
        originalError: error.message 
      }));
    }
  }

  /**
   * Obtenir mes trajets (conducteur)
   */
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

      // ⭐ NOUVEAU: Vérifier l'expiration de chaque trajet PROGRAMME
      for (let trajet of trajets.docs) {
        if (trajet.statutTrajet === 'PROGRAMME' && trajet.estExpire()) {
          await trajet.marquerCommeExpire();
        }
      }

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

  /**
   * Obtenir les trajets d'un conducteur
   */
  async obtenirTrajetsParConducteur(req, res, next) {
    try {
      const { conducteurId } = req.params;
      const { page = 1, limit = 20 } = req.query;

      const query = {
        conducteurId,
        statutTrajet: { $in: ['PROGRAMME', 'EN_COURS'] },
        dateDepart: { $gte: new Date() } // ⭐ NOUVEAU: Seulement les trajets futurs
      };

      const options = {
        page: parseInt(page),
        limit: parseInt(limit),
        sort: { dateDepart: 1 },
        populate: { path: 'conducteurId', select: 'nom prenom photo note' }
      };

      const trajets = await Trajet.paginate(query, options);

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

  /**
   * Obtenir les trajets récurrents d'un conducteur
   */
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

  /**
   * Modifier un trajet
   */
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

      if (trajet.conducteurId.toString() !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'Vous n\'êtes pas autorisé à modifier ce trajet'
        });
      }

      // ⭐ NOUVEAU: Bloquer la modification des trajets expirés
      if (trajet.statutTrajet === 'EXPIRE') {
        return res.status(400).json({
          success: false,
          message: 'Impossible de modifier un trajet expiré'
        });
      }

      // ⭐ NOUVEAU: Vérifier automatiquement l'expiration
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

      // Champs modifiables
      const champsModifiables = [
        'pointDepart',
        'pointArrivee',
        'arretsIntermediaires',
        'dateDepart',
        'heureDepart',
        'heureArriveePrevue',
        'dureeEstimee',
        'distance',
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

      // ⭐ NOUVEAU: Validation de la nouvelle date
      if (req.body.dateDepart) {
        const nouvelleDate = new Date(req.body.dateDepart);
        if (nouvelleDate < new Date()) {
          return res.status(400).json({
            success: false,
            message: 'La nouvelle date de départ doit être dans le futur'
          });
        }
      }

      await trajet.save();

      await trajet.populate('conducteurId', 'nom prenom photo');

      res.json({
        success: true,
        message: 'Trajet modifié avec succès',
        data: trajet
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

  /**
   * Mettre à jour le statut du trajet
   */
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

      // ⭐ NOUVEAU: Liste complète avec EXPIRE
      const statutsValides = ['PROGRAMME', 'EN_COURS', 'TERMINE', 'ANNULE', 'EXPIRE'];
      if (!statutsValides.includes(statutTrajet)) {
        return res.status(400).json({
          success: false,
          message: 'Statut invalide'
        });
      }

      // ⭐ NOUVEAU: Vérifier l'expiration automatique
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

      // Notifications selon le changement de statut
      await this.gererNotificationsStatut(trajet, ancienStatut, statutTrajet);

      res.json({
        success: true,
        message: `Statut du trajet changé de ${ancienStatut} à ${statutTrajet}`,
        data: {
          statutTrajet: trajet.statutTrajet,
          id: trajet._id
        }
      });

    } catch (error) {
      return next(AppError.serverError('Erreur serveur lors de la mise à jour du statut', { 
        originalError: error.message 
      }));
    }
  }

  // ==================== DELETE ====================

  /**
   * Annuler un trajet (avec notifications)
   */
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

      // ⭐ NOUVEAU: Inclure EXPIRE dans les statuts non annulables
      if (trajet.statutTrajet === 'TERMINE' || 
          trajet.statutTrajet === 'ANNULE' || 
          trajet.statutTrajet === 'EXPIRE') {
        return res.status(400).json({
          success: false,
          message: 'Ce trajet ne peut pas être annulé'
        });
      }

      // Changer le statut à ANNULE
      trajet.statutTrajet = 'ANNULE';
      if (motifAnnulation) {
        trajet.commentaireConducteur = motifAnnulation;
      }
      await trajet.save();

      // Envoyer des notifications aux passagers
      await this.envoyerNotificationsAnnulation(trajet, motifAnnulation);

      res.json({
        success: true,
        message: 'Trajet annulé avec succès',
        data: {
          id: trajet._id,
          statutTrajet: trajet.statutTrajet,
          motifAnnulation
        }
      });

    } catch (error) {
      return next(AppError.serverError('Erreur serveur lors de l\'annulation du trajet', { 
        originalError: error.message 
      }));
    }
  }

  /**
   * Supprimer (ou plutôt annuler) un trajet récurrent
   */
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

      // ⭐ NOUVEAU: Vérifier les réservations actives (si modèle Reservation existe)
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
        // Si le modèle Reservation n'existe pas encore, on continue
        console.log('Modèle Reservation non disponible');
      }

      // ⭐ NOUVEAU: Annuler au lieu de supprimer définitivement
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

  /**
   * ⭐ NOUVEAU: Vérifier et marquer un trajet comme expiré
   */
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
   * ⭐ NOUVEAU: Obtenir tous les trajets expirés
   */
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

  /**
   * Valider un itinéraire avec Google Maps API (simulation)
   */
  async validerItineraire(coordonneesDepart, coordonneesArrivee) {
    try {
      const [longDepart, latDepart] = coordonneesDepart;
      const [longArrivee, latArrivee] = coordonneesArrivee;
      
      const distance = this.calculerDistance(latDepart, longDepart, latArrivee, longArrivee);
      const duree = Math.round(distance * 60 / 60);
      
      return {
        success: true,
        distance: Math.round(distance * 100) / 100,
        duree: duree,
        heureArrivee: this.calculerHeureArrivee('08:00', duree)
      };

    } catch (error) {
      return {
        success: false,
        message: 'Erreur de validation d\'itinéraire',
        error: error.message
      };
    }
  }

  /**
   * Calculer la distance entre deux points (formule haversine)
   */
  calculerDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) * 
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  toRad(deg) {
    return deg * (Math.PI/180);
  }

  /**
   * Calculer l'heure d'arrivée
   */
  calculerHeureArrivee(heureDepart, dureeMinutes) {
    const [heures, minutes] = heureDepart.split(':').map(Number);
    const totalMinutes = heures * 60 + minutes + dureeMinutes;
    const nouvellesHeures = Math.floor(totalMinutes / 60) % 24;
    const nouvellesMinutes = totalMinutes % 60;
    return `${nouvellesHeures.toString().padStart(2, '0')}:${nouvellesMinutes.toString().padStart(2, '0')}`;
  }

  /**
   * Gérer les notifications selon le changement de statut
   */
  async gererNotificationsStatut(trajet, ancienStatut, nouveauStatut) {
    // TODO: Implémenter la logique de notification réelle
    console.log(`Notification: Trajet ${trajet._id} changé de ${ancienStatut} à ${nouveauStatut}`);
    
    // Exemple d'implémentation future:
    // if (nouveauStatut === 'EN_COURS') {
    //   await NotificationService.envoyerNotification(passagers, 'Le trajet a démarré');
    // }
  }

  /**
   * Envoyer des notifications d'annulation
   */
  async envoyerNotificationsAnnulation(trajet, motif) {
    // TODO: Implémenter l'envoi de notifications aux passagers
    console.log(`Notification d'annulation pour le trajet ${trajet._id}: ${motif}`);
    
    // Exemple d'implémentation future:
    // const reservations = await Reservation.find({ trajetId: trajet._id });
    // for (let reservation of reservations) {
    //   await NotificationService.envoyerEmail(reservation.passagerId, {
    //     sujet: 'Trajet annulé',
    //     message: `Le trajet a été annulé. Raison: ${motif}`
    //   });
    // }
  }
}

module.exports = new TrajetController();