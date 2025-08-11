// controllers/vehiculeController.js
const Vehicule = require('../models/Vehicule');
const logger = require('../utils/logger');

// =============== MÉTHODES CRUD STANDARD ===============

/**
 * @desc    Créer un nouveau véhicule
 * @route   POST /api/vehicules
 * @access  Privé (utilisateur authentifié)
 */
const creerVehicule = async (req, res) => {
  try {
    logger.info('Tentative de création de véhicule', { userId: req.user.userId });

    const vehiculeData = {
      ...req.body,
      proprietaireId: req.user.userId
    };

    // Si c'est le premier véhicule, le marquer comme principal
    const vehiculesExistants = await Vehicule.countDocuments({ proprietaireId: req.user.userId });
    if (vehiculesExistants === 0) {
      vehiculeData.estPrincipal = true;
    }

    const nouveauVehicule = new Vehicule(vehiculeData);
    await nouveauVehicule.save();

    logger.info('Véhicule créé avec succès', { vehiculeId: nouveauVehicule._id, userId: req.user.userId });

    res.status(201).json({
      success: true,
      message: 'Véhicule créé avec succès',
      vehicule: nouveauVehicule
    });

  } catch (error) {
    logger.error('Erreur création véhicule:', error);
    
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'Un véhicule avec cette immatriculation existe déjà'
      });
    }

    res.status(500).json({
        success: false,
      message: 'Erreur serveur lors de la création du véhicule',
      error: error.message
    });
  }
};

/**
 * @desc    Obtenir tous les véhicules de l'utilisateur connecté
 * @route   GET /api/vehicules/mes-vehicules
 * @access  Privé (utilisateur authentifié)
 */
const obtenirMesVehicules = async (req, res) => {
  try {
    logger.info('Récupération des véhicules', { userId: req.user.userId });

    const vehicules = await Vehicule.find({ proprietaireId: req.user.userId })
      .sort({ estPrincipal: -1, createdAt: -1 });

    res.json({
      success: true,
      count: vehicules.length,
      vehicules
    });

  } catch (error) {
    logger.error('Erreur récupération véhicules:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la récupération des véhicules',
      error: error.message
    });
  }
};

/**
 * @desc    Obtenir un véhicule spécifique par ID
 * @route   GET /api/vehicules/:vehiculeId
 * @access  Privé (utilisateur authentifié)
 */
const obtenirVehicule = async (req, res) => {
  try {
    const { vehiculeId } = req.params;
    logger.info('Récupération véhicule', { vehiculeId, userId: req.user.userId });

    const vehicule = await Vehicule.findOne({
      _id: vehiculeId,
      proprietaireId: req.user.userId
    });

    if (!vehicule) {
      return res.status(404).json({
        success: false,
        message: 'Véhicule non trouvé'
      });
    }

    res.json({
      success: true,
      vehicule
    });

  } catch (error) {
    logger.error('Erreur récupération véhicule:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la récupération du véhicule',
      error: error.message
    });
  }
};

/**
 * @desc    Modifier un véhicule
 * @route   PUT /api/vehicules/:vehiculeId
 * @access  Privé (utilisateur authentifié)
 */
const modifierVehicule = async (req, res) => {
  try {
    const { vehiculeId } = req.params;
    logger.info('Mise à jour véhicule', { vehiculeId, userId: req.user.userId });

    const vehicule = await Vehicule.findOne({
      _id: vehiculeId,
      proprietaireId: req.user.userId
    });

    if (!vehicule) {
      return res.status(404).json({
        success: false,
        message: 'Véhicule non trouvé'
      });
    }

    // Mettre à jour les champs
    Object.keys(req.body).forEach(key => {
      if (key !== 'proprietaireId' && key !== '_id') {
        vehicule[key] = req.body[key];
      }
    });

    await vehicule.save();

    logger.info('Véhicule mis à jour avec succès', { vehiculeId, userId: req.user.userId });

    res.json({
      success: true,
      message: 'Véhicule mis à jour avec succès',
      vehicule
    });

  } catch (error) {
    logger.error('Erreur mise à jour véhicule:', error);
    
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'Un véhicule avec cette immatriculation existe déjà'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la mise à jour du véhicule',
      error: error.message
    });
  }
};

/**
 * @desc    Supprimer un véhicule
 * @route   DELETE /api/vehicules/:vehiculeId
 * @access  Privé (utilisateur authentifié)
 */
const supprimerVehicule = async (req, res) => {
  try {
    const { vehiculeId } = req.params;
    logger.info('Suppression véhicule', { vehiculeId, userId: req.user.userId });

    const vehicule = await Vehicule.findOne({
      _id: vehiculeId,
      proprietaireId: req.user.userId
    });

    if (!vehicule) {
      return res.status(404).json({
        success: false,
        message: 'Véhicule non trouvé'
      });
    }

    // Si c'est le véhicule principal, vérifier qu'il y en a d'autres
    if (vehicule.estPrincipal) {
      const autresVehicules = await Vehicule.countDocuments({
        proprietaireId: req.user.userId,
        _id: { $ne: vehiculeId }
      });

      if (autresVehicules === 0) {
        return res.status(400).json({
          success: false,
          message: 'Impossible de supprimer le seul véhicule principal'
        });
      }
    }

    await Vehicule.findByIdAndDelete(vehiculeId);

    logger.info('Véhicule supprimé avec succès', { vehiculeId, userId: req.user.userId });

    res.json({
      success: true,
      message: 'Véhicule supprimé avec succès'
    });

  } catch (error) {
    logger.error('Erreur suppression véhicule:', error);
    res.status(500).json({
        success: false,
      message: 'Erreur serveur lors de la suppression du véhicule',
      error: error.message
    });
  }
};

// =============== MÉTHODES SPÉCIFIQUES ===============

/**
 * @desc    Définir un véhicule comme principal
 * @route   PATCH /api/vehicules/:vehiculeId/principal
 * @access  Privé (utilisateur authentifié)
 */
const definirVehiculePrincipal = async (req, res) => {
  try {
    const { vehiculeId } = req.params;
    logger.info('Définition véhicule principal', { vehiculeId, userId: req.user.userId });

    // Vérifier que le véhicule existe et appartient à l'utilisateur
    const vehicule = await Vehicule.findOne({
      _id: vehiculeId,
      proprietaireId: req.user.userId
    });

    if (!vehicule) {
      return res.status(404).json({
        success: false,
        message: 'Véhicule non trouvé'
      });
    }

    // Retirer le statut principal de tous les autres véhicules
    await Vehicule.updateMany(
      { proprietaireId: req.user.userId },
      { estPrincipal: false }
    );

    // Définir ce véhicule comme principal
    vehicule.estPrincipal = true;
    await vehicule.save();

    logger.info('Véhicule défini comme principal', { vehiculeId, userId: req.user.userId });

    res.json({
      success: true,
      message: 'Véhicule défini comme principal avec succès',
      vehicule
    });

  } catch (error) {
    logger.error('Erreur définition véhicule principal:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la définition du véhicule principal',
      error: error.message
    });
  }
};

/**
 * @desc    Obtenir le véhicule principal de l'utilisateur
 * @route   GET /api/vehicules/principal
 * @access  Privé (utilisateur authentifié)
 */
const obtenirVehiculePrincipal = async (req, res) => {
  try {
    logger.info('Récupération véhicule principal', { userId: req.user.userId });

    const vehiculePrincipal = await Vehicule.findOne({
      proprietaireId: req.user.userId,
      estPrincipal: true
    });

    if (!vehiculePrincipal) {
      return res.status(404).json({
        success: false,
        message: 'Aucun véhicule principal trouvé'
      });
    }

    res.json({
      success: true,
      vehicule: vehiculePrincipal
    });

  } catch (error) {
    logger.error('Erreur récupération véhicule principal:', error);
    res.status(500).json({
        success: false,
      message: 'Erreur serveur lors de la récupération du véhicule principal',
      error: error.message
    });
  }
};

/**
 * @desc    Mettre à jour la photo d'un véhicule
 * @route   PUT /api/vehicules/:vehiculeId/photo
 * @access  Privé (utilisateur authentifié)
 */
const mettreAJourPhotoVehicule = async (req, res) => {
  try {
    const { vehiculeId } = req.params;
    const { photoUrl } = req.body;
    
    logger.info('Mise à jour photo véhicule', { vehiculeId, userId: req.user.userId });

    const vehicule = await Vehicule.findOne({
      _id: vehiculeId,
      proprietaireId: req.user.userId
    });

    if (!vehicule) {
      return res.status(404).json({
        success: false,
        message: 'Véhicule non trouvé'
      });
    }

    vehicule.photoVehicule = photoUrl;
    await vehicule.save();

    logger.info('Photo véhicule mise à jour', { vehiculeId, userId: req.user.userId });

    res.json({
      success: true,
      message: 'Photo du véhicule mise à jour avec succès',
      vehicule
    });

  } catch (error) {
    logger.error('Erreur mise à jour photo véhicule:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la mise à jour de la photo',
      error: error.message
    });
  }
};

/**
 * @desc    Vérifier la validité des documents (assurance, visite technique)
 * @route   GET /api/vehicules/:vehiculeId/validite-documents
 * @access  Privé (utilisateur authentifié)
 */
const verifierValiditeDocuments = async (req, res) => {
  try {
    const { vehiculeId } = req.params;
    logger.info('Vérification expiration documents', { vehiculeId, userId: req.user.userId });

    const vehicule = await Vehicule.findOne({
      _id: vehiculeId,
      proprietaireId: req.user.userId
    });

    if (!vehicule) {
      return res.status(404).json({
        success: false,
        message: 'Véhicule non trouvé'
      });
    }

    const maintenant = new Date();
    const trenteJours = new Date(maintenant.getTime() + 30 * 24 * 60 * 60 * 1000);

    const alertes = {
      assurance: {
        expireDans: Math.ceil((vehicule.assurance.dateExpiration - maintenant) / (1000 * 60 * 60 * 24)),
        estExpire: vehicule.assurance.dateExpiration < maintenant,
        estProcheExpiration: vehicule.assurance.dateExpiration < trenteJours
      },
      visiteTechnique: {
        expireDans: Math.ceil((vehicule.visiteTechnique.dateExpiration - maintenant) / (1000 * 60 * 60 * 24)),
        estExpire: vehicule.visiteTechnique.dateExpiration < maintenant,
        estProcheExpiration: vehicule.visiteTechnique.dateExpiration < trenteJours
      }
    };

    res.json({
      success: true,
      vehicule: {
        id: vehicule._id,
        immatriculation: vehicule.immatriculation,
        marque: vehicule.marque,
        modele: vehicule.modele
      },
      alertes
    });

  } catch (error) {
    logger.error('Erreur vérification expiration documents:', error);
    res.status(500).json({
        success: false,
      message: 'Erreur serveur lors de la vérification des documents',
      error: error.message
    });
  }
};

/**
 * @desc    Rechercher des véhicules par critères
 * @route   GET /api/vehicules/recherche
 * @access  Privé (utilisateur authentifié)
 */
const rechercherVehicules = async (req, res) => {
  try {
    const { marque, modele, couleur, statut } = req.query;
    logger.info('Recherche véhicules', { userId: req.user.userId, criteres: req.query });

    const criteres = { proprietaireId: req.user.userId };

    if (marque) criteres.marque = new RegExp(marque, 'i');
    if (modele) criteres.modele = new RegExp(modele, 'i');
    if (couleur) criteres.couleur = new RegExp(couleur, 'i');
    if (statut) criteres.statut = statut;

    const vehicules = await Vehicule.find(criteres)
      .sort({ estPrincipal: -1, createdAt: -1 });

    res.json({
      success: true,
      count: vehicules.length,
      vehicules
    });

  } catch (error) {
    logger.error('Erreur recherche véhicules:', error);
    res.status(500).json({
        success: false,
      message: 'Erreur serveur lors de la recherche des véhicules',
      error: error.message
    });
  }
};

// =============== MÉTHODES SUPPLÉMENTAIRES ===============

/**
 * @desc    Obtenir les documents expirés/expiration proche
 * @route   GET /api/vehicules/mes-vehicules/documents-expires
 * @access  Privé (utilisateur authentifié)
 */
const obtenirDocumentsExpires = async (req, res) => {
  try {
    logger.info('Récupération documents expirés', { userId: req.user.userId });

    const maintenant = new Date();
    const trenteJours = new Date(maintenant.getTime() + 30 * 24 * 60 * 60 * 1000);

    const vehicules = await Vehicule.find({
      proprietaireId: req.user.userId,
      $or: [
        { 'assurance.dateExpiration': { $lt: trenteJours } },
        { 'visiteTechnique.dateExpiration': { $lt: trenteJours } }
      ]
    });

    const vehiculesAvecAlertes = vehicules.map(vehicule => {
      const alertes = [];
      if (vehicule.assurance.dateExpiration < maintenant) {
        alertes.push('ASSURANCE_EXPIREE');
      } else if (vehicule.assurance.dateExpiration < trenteJours) {
        alertes.push('ASSURANCE_EXPIRATION_PROCHE');
      }
      
      if (vehicule.visiteTechnique.dateExpiration < maintenant) {
        alertes.push('VISITE_TECHNIQUE_EXPIREE');
      } else if (vehicule.visiteTechnique.dateExpiration < trenteJours) {
        alertes.push('VISITE_TECHNIQUE_EXPIRATION_PROCHE');
      }

      return {
        ...vehicule.toObject(),
        alertes
      };
    });

    res.json({
      success: true,
      count: vehiculesAvecAlertes.length,
      vehicules: vehiculesAvecAlertes
    });

  } catch (error) {
    logger.error('Erreur récupération documents expirés:', error);
    res.status(500).json({
        success: false,
      message: 'Erreur serveur lors de la récupération des documents expirés',
      error: error.message
    });
  }
};

/**
 * @desc    Obtenir les statistiques des véhicules
 * @route   GET /api/vehicules/statistiques
 * @access  Privé (utilisateur authentifié)
 */
const obtenirStatistiques = async (req, res) => {
  try {
    logger.info('Récupération statistiques véhicules', { userId: req.user.userId });

    const stats = await Vehicule.aggregate([
      { $match: { proprietaireId: req.user.userId } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          actifs: { $sum: { $cond: [{ $eq: ['$statut', 'ACTIF'] }, 1, 0] } },
          inactifs: { $sum: { $cond: [{ $eq: ['$statut', 'INACTIF'] }, 1, 0] } },
          enReparation: { $sum: { $cond: [{ $eq: ['$statut', 'EN_REPARATION'] }, 1, 0] } },
          horsService: { $sum: { $cond: [{ $eq: ['$statut', 'HORS_SERVICE'] }, 1, 0] } },
          principal: { $sum: { $cond: ['$estPrincipal', 1, 0] } }
        }
      }
    ]);

    const statistiques = stats[0] || {
      total: 0,
      actifs: 0,
      inactifs: 0,
      enReparation: 0,
      horsService: 0,
      principal: 0
    };

    res.json({
      success: true,
      statistiques
    });

  } catch (error) {
    logger.error('Erreur récupération statistiques:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la récupération des statistiques',
      error: error.message
    });
  }
};

/**
 * @desc    Renouveler l'assurance d'un véhicule
 * @route   PUT /api/vehicules/:vehiculeId/assurance
 * @access  Privé (utilisateur authentifié)
 */
const renouvelerAssurance = async (req, res) => {
  try {
    const { vehiculeId } = req.params;
    const { numeroPolice, dateExpiration, compagnie } = req.body;
    
    logger.info('Renouvellement assurance véhicule', { vehiculeId, userId: req.user.userId });

    const vehicule = await Vehicule.findOne({
      _id: vehiculeId,
      proprietaireId: req.user.userId
    });

    if (!vehicule) {
      return res.status(404).json({
        success: false,
        message: 'Véhicule non trouvé'
      });
    }

    vehicule.assurance = {
      numeroPolice,
      dateExpiration: new Date(dateExpiration),
      compagnie
    };

    await vehicule.save();

    logger.info('Assurance renouvelée', { vehiculeId, userId: req.user.userId });

    res.json({
      success: true,
      message: 'Assurance renouvelée avec succès',
      vehicule
    });

  } catch (error) {
    logger.error('Erreur renouvellement assurance:', error);
    res.status(500).json({
        success: false,
      message: 'Erreur serveur lors du renouvellement de l\'assurance',
      error: error.message
    });
  }
};

/**
 * @desc    Renouveler la visite technique d'un véhicule
 * @route   PUT /api/vehicules/:vehiculeId/visite-technique
 * @access  Privé (utilisateur authentifié)
 */
const renouvelerVisiteTechnique = async (req, res) => {
  try {
    const { vehiculeId } = req.params;
    const { dateExpiration, certificatUrl } = req.body;
    
    logger.info('Renouvellement visite technique véhicule', { vehiculeId, userId: req.user.userId });

    const vehicule = await Vehicule.findOne({
      _id: vehiculeId,
      proprietaireId: req.user.userId
    });

    if (!vehicule) {
      return res.status(404).json({
        success: false,
        message: 'Véhicule non trouvé'
      });
    }

    vehicule.visiteTechnique = {
      dateExpiration: new Date(dateExpiration),
      certificatUrl
    };

    await vehicule.save();

    logger.info('Visite technique renouvelée', { vehiculeId, userId: req.user.userId });

    res.json({
      success: true,
      message: 'Visite technique renouvelée avec succès',
      vehicule
    });

  } catch (error) {
    logger.error('Erreur renouvellement visite technique:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors du renouvellement de la visite technique',
      error: error.message
    });
  }
};

// =============== EXPORTS ===============

module.exports = {
  // Méthodes CRUD standard
  creerVehicule,
  obtenirMesVehicules,
  obtenirVehicule,
  modifierVehicule,
  supprimerVehicule,
  
  // Méthodes spécifiques
  definirVehiculePrincipal,
  obtenirVehiculePrincipal,
  mettreAJourPhotoVehicule,
  verifierValiditeDocuments,
  rechercherVehicules,
  
  // Méthodes supplémentaires
  obtenirDocumentsExpires,
  obtenirStatistiques,
  renouvelerAssurance,
  renouvelerVisiteTechnique
};

      query.typeTrajet = typeTrajet;

    }



    if (accepteFemmesSeulement === 'true') {

      query['preferences.accepteFemmesSeulement'] = true;

    }



    if (accepteHommesSeuleument === 'true') {

      query['preferences.accepteHommesSeuleument'] = true;

    }



    if (accepteBagages === 'false') {

      query['preferences.accepteBagages'] = false;

    }



    if (musique === 'true') {

      query['preferences.musique'] = true;

    }



    if (fumeur === 'true') {

      query['preferences.fumeur'] = true;

    }



    if (commune) {

      query.$or = [

        { 'pointDepart.commune': new RegExp(commune, 'i') },

        { 'pointArrivee.commune': new RegExp(commune, 'i') }

      ];

    }



    const options = {

      page: parseInt(page),

      limit: parseInt(limit),

      sort: { dateDepart: 1 },

      populate: { path: 'conducteurId', select: 'nom prenom photo note' }

    };



    const resultat = await Trajet.paginate(query, options);



    res.json({

      success: true,

      data: resultat.docs,

      pagination: {

        page: resultat.page,

        totalPages: resultat.totalPages,

        totalDocs: resultat.totalDocs,

        count: resultat.docs.length

      },

      filters: req.query

    });

  }



  async modifierDetailsTrajet(req, res) {

    const { id } = req.params;

    const updates = req.body;



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



    if (trajet.statutTrajet === 'EN_COURS' || trajet.statutTrajet === 'TERMINE') {

      return res.status(400).json({

        success: false,

        message: 'Ce trajet ne peut plus être modifié'

      });

    }



    if (updates.pointDepart || updates.pointArrivee) {

      const pointDepart = updates.pointDepart || trajet.pointDepart;

      const pointArrivee = updates.pointArrivee || trajet.pointArrivee;



      const itineraireValide = await this.validerItineraire(

        pointDepart.coordonnees.coordinates,

        pointArrivee.coordonnees.coordinates

      );



      if (itineraireValide.success) {

        updates.distance = itineraireValide.distance;

        updates.dureeEstimee = itineraireValide.duree;

        updates.heureArriveePrevue = itineraireValide.heureArrivee;

      }

    }



    const trajetModifie = await Trajet.findByIdAndUpdate(

      id,

      { $set: updates },

      { new: true, runValidators: true }

    ).populate('conducteurId', 'nom prenom photo');



    res.json({

      success: true,

      message: 'Trajet modifié avec succès',

      data: trajetModifie

    });

  }



  async changerNombrePlaces(req, res) {

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

        message: 'Vous n\'êtes pas autorisé à modifier ce trajet'

      });

    }



    if (nombrePlacesDisponibles > trajet.nombrePlacesTotal) {

      return res.status(400).json({

        success: false,

        message: 'Le nombre de places disponibles ne peut pas dépasser le nombre total de places'

      });

    }



    trajet.nombrePlacesDisponibles = nombrePlacesDisponibles;

    await trajet.save();



    res.json({

      success: true,

      message: 'Nombre de places mis à jour avec succès',

      data: {

        nombrePlacesDisponibles: trajet.nombrePlacesDisponibles,

        nombrePlacesTotal: trajet.nombrePlacesTotal,

        placesReservees: trajet.placesReservees

      }

    });

  }



  async modifierPreferences(req, res) {

    const { id } = req.params;

    const nouvellesPreferences = req.body;



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



    if (nouvellesPreferences.accepteFemmesSeulement && nouvellesPreferences.accepteHommesSeuleument) {

      return res.status(400).json({

        success: false,

        message: 'Ne peut pas accepter exclusivement les femmes ET les hommes'

      });

    }



    trajet.preferences = { ...trajet.preferences.toObject(), ...nouvellesPreferences };

    await trajet.save();



    res.json({

      success: true,

      message: 'Préférences mises à jour avec succès',

      data: trajet.preferences

    });

  }



  async mettreAJourStatut(req, res) {

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



    const statutsValides = ['PROGRAMME', 'EN_COURS', 'TERMINE', 'ANNULE'];

    if (!statutsValides.includes(statutTrajet)) {

      return res.status(400).json({

        success: false,

        message: 'Statut invalide'

      });

    }



    const ancienStatut = trajet.statutTrajet;

    trajet.statutTrajet = statutTrajet;

    await trajet.save();



    await this.gererNotificationsStatut(trajet, ancienStatut, statutTrajet);



    res.json({

      success: true,

      message: `Statut du trajet changé de ${ancienStatut} à ${statutTrajet}`,

      data: {

        statutTrajet: trajet.statutTrajet,

        id: trajet._id

      }

    });

  }



  async annulerTrajet(req, res) {

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



    if (trajet.statutTrajet === 'TERMINE' || trajet.statutTrajet === 'ANNULE') {

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



    res.json({

      success: true,

      message: 'Trajet annulé avec succès',

      data: {

        id: trajet._id,

        statutTrajet: trajet.statutTrajet,

        motifAnnulation

      }

    });

  }



  async supprimerTrajetRecurrent(req, res) {

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



    await Trajet.findByIdAndDelete(id);



    res.json({

      success: true,

      message: 'Trajet récurrent supprimé avec succès'

    });

  }

}



module.exports = new TrajetController();

