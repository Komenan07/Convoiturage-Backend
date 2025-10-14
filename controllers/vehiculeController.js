// controllers/vehiculeController.js
// Contrôleur complet pour la gestion des véhicules

const Vehicule = require('../models/Vehicule');
const { logger } = require('../utils/logger');
const AppError = require('../utils/AppError');
const path = require('path');
const fs = require('fs').promises;

// =============== MÉTHODES CRUD STANDARD ===============

/**
 * @desc Créer un nouveau véhicule
 * @route POST /api/vehicules
 * @access Privé (utilisateur authentifié)
 */
const creerVehicule = async (req, res, next) => {
  try {
    logger.info('Tentative de création de véhicule', { userId: req.user.userId });
    
    const vehiculeData = {
      ...req.body,
      proprietaireId: req.user.userId
    };

    // Si c'est le premier véhicule, le définir comme principal
    const vehiculesExistants = await Vehicule.countDocuments({ proprietaireId: req.user.userId });
    if (vehiculesExistants === 0) {
      vehiculeData.estPrincipal = true;
    }

    // Gestion de l'upload de photo si présent
    if (req.file) {
      vehiculeData.photoVehicule = `/uploads/vehicules/${req.file.filename}`;
    }

    const nouveauVehicule = new Vehicule(vehiculeData);
    await nouveauVehicule.save();

    // Populate pour avoir les détails du propriétaire si nécessaire
    await nouveauVehicule.populate('proprietaireId', 'nom prenom email');

    logger.info('Véhicule créé avec succès', { 
      vehiculeId: nouveauVehicule._id, 
      userId: req.user.userId,
      immatriculation: nouveauVehicule.immatriculation 
    });

    res.status(201).json({
      success: true,
      message: 'Véhicule créé avec succès',
      data: {
        vehicule: nouveauVehicule
      }
    });

  } catch (error) {
    logger.error('Erreur création véhicule:', error);

    // Gestion des erreurs de validation Mongoose
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Données invalides',
        erreurs: messages
      });
    }

    // Gestion de l'erreur de duplication (immatriculation unique)
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'Un véhicule avec cette immatriculation existe déjà'
      });
    }

    return next(AppError.serverError('Erreur serveur lors de la création du véhicule', { 
      originalError: error.message 
    }));
  }
};

/**
 * @desc Obtenir tous les véhicules de l'utilisateur connecté
 * @route GET /api/vehicules/mes-vehicules
 * @access Privé (utilisateur authentifié)
 */
const obtenirMesVehicules = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, tri = 'createdAt', ordre = 'desc' } = req.query;
    const skip = (page - 1) * limit;

    logger.info('Récupération des véhicules', { 
      userId: req.user.userId,
      page,
      limit 
    });

    // Critères de recherche
    const criteres = { proprietaireId: req.user.userId };

    // Tri
    const sortOptions = {};
    sortOptions[tri] = ordre === 'desc' ? -1 : 1;
    
    // Toujours prioriser le véhicule principal
    if (tri !== 'estPrincipal') {
      sortOptions.estPrincipal = -1;
    }

    const vehicules = await Vehicule.find(criteres)
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit))
      .populate('proprietaireId', 'nom prenom email');

    const total = await Vehicule.countDocuments(criteres);

    // Ajouter les informations de validité des documents
    const vehiculesAvecValidite = vehicules.map(vehicule => {
      const vehiculeObj = vehicule.toObject();
      vehiculeObj.documentsValidite = vehicule.documentsValides();
      return vehiculeObj;
    });

    res.json({
      success: true,
      data: {
        vehicules: vehiculesAvecValidite,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit),
          hasNext: page * limit < total,
          hasPrev: page > 1
        },
        statistiques: {
          total: vehicules.length,
          principal: vehicules.filter(v => v.estPrincipal).length
        }
      }
    });

  } catch (error) {
    logger.error('Erreur récupération véhicules:', error);
    return next(AppError.serverError('Erreur serveur lors de la récupération des véhicules', { 
      originalError: error.message 
    }));
  }
};

/**
 * @desc Obtenir un véhicule spécifique par ID
 * @route GET /api/vehicules/:vehiculeId
 * @access Privé (utilisateur authentifié)
 */
const obtenirVehicule = async (req, res, next) => {
  try {
    const { vehiculeId } = req.params;
    
    if (!vehiculeId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: 'ID de véhicule invalide'
      });
    }

    logger.info('Récupération véhicule', { vehiculeId, userId: req.user.userId });
    
    const vehicule = await Vehicule.findOne({
      _id: vehiculeId,
      proprietaireId: req.user.userId
    }).populate('proprietaireId', 'nom prenom email');

    if (!vehicule) {
      return res.status(404).json({
        success: false,
        message: 'Véhicule non trouvé'
      });
    }

    // Ajouter les informations de validité des documents
    const vehiculeObj = vehicule.toObject();
    vehiculeObj.documentsValidite = vehicule.documentsValides();

    res.json({
      success: true,
      data: {
        vehicule: vehiculeObj
      }
    });

  } catch (error) {
    logger.error('Erreur récupération véhicule:', error);
    return next(AppError.serverError('Erreur serveur lors de la récupération du véhicule', { 
      originalError: error.message 
    }));
  }
};

/**
 * @desc Modifier un véhicule
 * @route PUT /api/vehicules/:vehiculeId
 * @access Privé (utilisateur authentifié)
 */
const modifierVehicule = async (req, res, next) => {
  try {
    const { vehiculeId } = req.params;
    
    if (!vehiculeId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: 'ID de véhicule invalide'
      });
    }

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

    // Champs interdits de modification
    const champsProteges = ['proprietaireId', '_id', 'createdAt', 'updatedAt'];
    
    // Mise à jour des champs autorisés
    Object.keys(req.body).forEach(key => {
      if (!champsProteges.includes(key)) {
        // Gestion spéciale pour les objets imbriqués
        if (key === 'assurance' || key === 'visiteTechnique') {
          vehicule[key] = { ...vehicule[key], ...req.body[key] };
        } else {
          vehicule[key] = req.body[key];
        }
      }
    });

    // Gestion de l'upload de nouvelle photo
    if (req.file) {
      // Supprimer l'ancienne photo si elle existe
      if (vehicule.photoVehicule && vehicule.photoVehicule.startsWith('/uploads/')) {
        try {
          const oldPhotoPath = path.join(process.cwd(), 'public', vehicule.photoVehicule);
          await fs.unlink(oldPhotoPath);
        } catch (unlinkError) {
          logger.warn('Erreur suppression ancienne photo:', unlinkError);
        }
      }
      vehicule.photoVehicule = `/uploads/vehicules/${req.file.filename}`;
    }

    await vehicule.save();
    await vehicule.populate('proprietaireId', 'nom prenom email');

    logger.info('Véhicule mis à jour avec succès', { vehiculeId, userId: req.user.userId });
    
    res.json({
      success: true,
      message: 'Véhicule mis à jour avec succès',
      data: {
        vehicule
      }
    });

  } catch (error) {
    logger.error('Erreur mise à jour véhicule:', error);

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Données invalides',
        erreurs: messages
      });
    }

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'Un véhicule avec cette immatriculation existe déjà'
      });
    }

    return next(AppError.serverError('Erreur serveur lors de la mise à jour du véhicule', { 
      originalError: error.message 
    }));
  }
};

/**
 * @desc Supprimer un véhicule
 * @route DELETE /api/vehicules/:vehiculeId
 * @access Privé (utilisateur authentifié)
 */
const supprimerVehicule = async (req, res, next) => {
  try {
    const { vehiculeId } = req.params;
    
    if (!vehiculeId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: 'ID de véhicule invalide'
      });
    }

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

    // Vérifier si c'est le véhicule principal et s'il y en a d'autres
    if (vehicule.estPrincipal) {
      const autresVehicules = await Vehicule.find({
        proprietaireId: req.user.userId,
        _id: { $ne: vehiculeId }
      });

      if (autresVehicules.length > 0) {
        // Définir un autre véhicule comme principal
        const nouveauPrincipal = autresVehicules[0];
        nouveauPrincipal.estPrincipal = true;
        await nouveauPrincipal.save();
        
        logger.info('Nouveau véhicule principal défini', { 
          nouveauPrincipalId: nouveauPrincipal._id,
          userId: req.user.userId 
        });
      }
    }

    // Supprimer la photo si elle existe
    if (vehicule.photoVehicule && vehicule.photoVehicule.startsWith('/uploads/')) {
      try {
        const photoPath = path.join(process.cwd(), 'public', vehicule.photoVehicule);
        await fs.unlink(photoPath);
      } catch (unlinkError) {
        logger.warn('Erreur suppression photo véhicule:', unlinkError);
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
    return next(AppError.serverError('Erreur serveur lors de la suppression du véhicule', { 
      originalError: error.message 
    }));
  }
};

// =============== MÉTHODES SPÉCIFIQUES ===============

/**
 * @desc Définir un véhicule comme principal
 * @route PATCH /api/vehicules/:vehiculeId/principal
 * @access Privé (utilisateur authentifié)
 */
const definirVehiculePrincipal = async (req, res, next) => {
  try {
    const { vehiculeId } = req.params;
    
    if (!vehiculeId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: 'ID de véhicule invalide'
      });
    }

    logger.info('Définition véhicule principal', { vehiculeId, userId: req.user.userId });
    
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

    if (vehicule.estPrincipal) {
      return res.status(400).json({
        success: false,
        message: 'Ce véhicule est déjà défini comme principal'
      });
    }

    // Utiliser la méthode du modèle
    await vehicule.definirCommePrincipal();
    
    logger.info('Véhicule défini comme principal', { vehiculeId, userId: req.user.userId });
    
    res.json({
      success: true,
      message: 'Véhicule défini comme principal avec succès',
      data: {
        vehicule
      }
    });

  } catch (error) {
    logger.error('Erreur définition véhicule principal:', error);
    return next(AppError.serverError('Erreur serveur lors de la définition du véhicule principal', { 
      originalError: error.message 
    }));
  }
};

/**
 * @desc Obtenir le véhicule principal de l'utilisateur
 * @route GET /api/vehicules/principal
 * @access Privé (utilisateur authentifié)
 */
const obtenirVehiculePrincipal = async (req, res, next) => {
  try {
    logger.info('Récupération véhicule principal', { userId: req.user.userId });
    
    const vehiculePrincipal = await Vehicule.findOne({
      proprietaireId: req.user.userId,
      estPrincipal: true
    }).populate('proprietaireId', 'nom prenom email');

    if (!vehiculePrincipal) {
      return res.status(404).json({
        success: false,
        message: 'Aucun véhicule principal trouvé'
      });
    }

    // Ajouter les informations de validité des documents
    const vehiculeObj = vehiculePrincipal.toObject();
    vehiculeObj.documentsValidite = vehiculePrincipal.documentsValides();

    res.json({
      success: true,
      data: {
        vehicule: vehiculeObj
      }
    });

  } catch (error) {
    logger.error('Erreur récupération véhicule principal:', error);
    return next(AppError.serverError('Erreur serveur lors de la récupération du véhicule principal', { 
      originalError: error.message 
    }));
  }
};

/**
 * @desc Mettre à jour la photo d'un véhicule
 * @route PUT /api/vehicules/:vehiculeId/photo
 * @access Privé (utilisateur authentifié)
 */
const mettreAJourPhotoVehicule = async (req, res, next) => {
  try {
    const { vehiculeId } = req.params;
    
    if (!vehiculeId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: 'ID de véhicule invalide'
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Photo requise'
      });
    }

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

    // Supprimer l'ancienne photo si elle existe
    if (vehicule.photoVehicule && vehicule.photoVehicule.startsWith('/uploads/')) {
      try {
        const oldPhotoPath = path.join(process.cwd(), 'public', vehicule.photoVehicule);
        await fs.unlink(oldPhotoPath);
      } catch (unlinkError) {
        logger.warn('Erreur suppression ancienne photo:', unlinkError);
      }
    }

    vehicule.photoVehicule = `/uploads/vehicules/${req.file.filename}`;
    await vehicule.save();

    logger.info('Photo véhicule mise à jour', { vehiculeId, userId: req.user.userId });
    
    res.json({
      success: true,
      message: 'Photo du véhicule mise à jour avec succès',
      data: {
        vehicule,
        nouvellePhoto: vehicule.photoVehicule
      }
    });

  } catch (error) {
    logger.error('Erreur mise à jour photo véhicule:', error);
    return next(AppError.serverError('Erreur serveur lors de la mise à jour de la photo', { 
      originalError: error.message 
    }));
  }
};

/**
 * @desc Vérifier la validité des documents (assurance, visite technique)
 * @route GET /api/vehicules/:vehiculeId/validite-documents
 * @access Privé (utilisateur authentifié)
 */
const verifierValiditeDocuments = async (req, res, next) => {
  try {
    const { vehiculeId } = req.params;
    
    if (!vehiculeId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: 'ID de véhicule invalide'
      });
    }

    logger.info('Vérification validité documents', { vehiculeId, userId: req.user.userId });
    
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

    // Utiliser la méthode du modèle
    const validiteDocuments = vehicule.documentsValides();

    res.json({
      success: true,
      data: {
        vehicule: {
          id: vehicule._id,
          immatriculation: vehicule.immatriculation,
          marque: vehicule.marque,
          modele: vehicule.modele
        },
        documentsValidite: validiteDocuments
      }
    });

  } catch (error) {
    logger.error('Erreur vérification validité documents:', error);
    return next(AppError.serverError('Erreur serveur lors de la vérification des documents', { 
      originalError: error.message 
    }));
  }
};

/**
 * @desc Rechercher des véhicules par critères
 * @route GET /api/vehicules/recherche
 * @access Privé (utilisateur authentifié)
 */
const rechercherVehicules = async (req, res, next) => {
  try {
    const { 
      marque, 
      modele, 
      couleur, 
      statut, 
      carburant,
      anneeMin,
      anneeMax,
      page = 1, 
      limit = 10 
    } = req.query;
    
    const skip = (page - 1) * limit;

    logger.info('Recherche véhicules', { 
      userId: req.user.userId, 
      criteres: req.query 
    });
    
    const criteres = { proprietaireId: req.user.userId };

    // Filtres de recherche
    if (marque) criteres.marque = new RegExp(marque, 'i');
    if (modele) criteres.modele = new RegExp(modele, 'i');
    if (couleur) criteres.couleur = new RegExp(couleur, 'i');
    if (statut) criteres.statut = statut;
    if (carburant) criteres.carburant = carburant;
    
    // Filtre par année
    if (anneeMin || anneeMax) {
      criteres.annee = {};
      if (anneeMin) criteres.annee.$gte = parseInt(anneeMin);
      if (anneeMax) criteres.annee.$lte = parseInt(anneeMax);
    }

    const vehicules = await Vehicule.find(criteres)
      .sort({ estPrincipal: -1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('proprietaireId', 'nom prenom');

    const total = await Vehicule.countDocuments(criteres);

    // Ajouter les informations de validité
    const vehiculesAvecValidite = vehicules.map(vehicule => {
      const vehiculeObj = vehicule.toObject();
      vehiculeObj.documentsValidite = vehicule.documentsValides();
      return vehiculeObj;
    });

    res.json({
      success: true,
      data: {
        vehicules: vehiculesAvecValidite,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });

  } catch (error) {
    logger.error('Erreur recherche véhicules:', error);
    return next(AppError.serverError('Erreur serveur lors de la recherche des véhicules', { 
      originalError: error.message 
    }));
  }
};

// =============== MÉTHODES SUPPLÉMENTAIRES ===============

/**
 * @desc Obtenir les documents expirés/expiration proche
 * @route GET /api/vehicules/documents-expires
 * @access Privé (utilisateur authentifié)
 */
const obtenirDocumentsExpires = async (req, res, next) => {
  try {
    const { joursAvance = 30 } = req.query;
    
    logger.info('Récupération documents expirés', { 
      userId: req.user.userId,
      joursAvance 
    });

    // Utiliser la méthode statique du modèle
    const vehiculesExpires = await Vehicule.documentsExpiresOuBientot(parseInt(joursAvance));
    
    // Filtrer par propriétaire
    const vehiculesUtilisateur = vehiculesExpires.filter(
      v => v.proprietaireId.toString() === req.user.userId
    );

    // Ajouter le détail des alertes
    const vehiculesAvecAlertes = vehiculesUtilisateur.map(vehicule => {
      const vehiculeObj = vehicule.toObject();
      const validite = vehicule.documentsValides();
      
      const alertes = [];
      const maintenant = new Date();
      
      if (vehicule.assurance.dateExpiration < maintenant) {
        alertes.push({ type: 'ASSURANCE_EXPIREE', severite: 'CRITIQUE' });
      } else if (!validite.assurance.valide) {
        alertes.push({ type: 'ASSURANCE_EXPIRATION_PROCHE', severite: 'ATTENTION' });
      }

      if (vehicule.visiteTechnique.dateExpiration < maintenant) {
        alertes.push({ type: 'VISITE_TECHNIQUE_EXPIREE', severite: 'CRITIQUE' });
      } else if (!validite.visiteTechnique.valide) {
        alertes.push({ type: 'VISITE_TECHNIQUE_EXPIRATION_PROCHE', severite: 'ATTENTION' });
      }

      vehiculeObj.alertes = alertes;
      vehiculeObj.documentsValidite = validite;
      
      return vehiculeObj;
    });

    res.json({
      success: true,
      data: {
        vehicules: vehiculesAvecAlertes,
        statistiques: {
          total: vehiculesAvecAlertes.length,
          critiques: vehiculesAvecAlertes.filter(v => 
            v.alertes.some(a => a.severite === 'CRITIQUE')
          ).length,
          attention: vehiculesAvecAlertes.filter(v => 
            v.alertes.some(a => a.severite === 'ATTENTION')
          ).length
        }
      }
    });

  } catch (error) {
    logger.error('Erreur récupération documents expirés:', error);
    return next(AppError.serverError('Erreur serveur lors de la récupération des documents expirés', { 
      originalError: error.message 
    }));
  }
};

/**
 * @desc Obtenir les statistiques des véhicules
 * @route GET /api/vehicules/statistiques
 * @access Privé (utilisateur authentifié)
 */
const obtenirStatistiques = async (req, res, next) => {
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
          principal: { $sum: { $cond: ['$estPrincipal', 1, 0] } },
          avgAge: { 
            $avg: { 
              $subtract: [new Date().getFullYear(), '$annee'] 
            } 
          }
        }
      }
    ]);

    // Statistiques par carburant
    const statsCarburant = await Vehicule.aggregate([
      { $match: { proprietaireId: req.user.userId } },
      { $group: { _id: '$carburant', count: { $sum: 1 } } }
    ]);

    const statistiques = stats[0] || {
      total: 0,
      actifs: 0,
      inactifs: 0,
      enReparation: 0,
      horsService: 0,
      principal: 0,
      avgAge: 0
    };

    // Formater les stats carburant
    const carburantStats = {};
    statsCarburant.forEach(stat => {
      carburantStats[stat._id || 'NON_SPECIFIE'] = stat.count;
    });

    res.json({
      success: true,
      data: {
        statistiques: {
          ...statistiques,
          ageMoyen: Math.round(statistiques.avgAge || 0),
          repartitionCarburant: carburantStats
        }
      }
    });

  } catch (error) {
    logger.error('Erreur récupération statistiques:', error);
    return next(AppError.serverError('Erreur serveur lors de la récupération des statistiques', { 
      originalError: error.message 
    }));
  }
};

/**
 * @desc Renouveler l'assurance d'un véhicule
 * @route PUT /api/vehicules/:vehiculeId/assurance
 * @access Privé (utilisateur authentifié)
 */
const renouvelerAssurance = async (req, res, next) => {
  try {
    const { vehiculeId } = req.params;
    const { numeroPolice, dateExpiration, compagnie } = req.body;

    if (!vehiculeId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: 'ID de véhicule invalide'
      });
    }

    // Validation des données requises
    if (!numeroPolice || !dateExpiration || !compagnie) {
      return res.status(400).json({
        success: false,
        message: 'Numéro de police, date d\'expiration et compagnie sont requis'
      });
    }

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

    // Vérifier que la nouvelle date est future
    const nouvelleDate = new Date(dateExpiration);
    if (nouvelleDate <= new Date()) {
      return res.status(400).json({
        success: false,
        message: 'La date d\'expiration doit être future'
      });
    }

    vehicule.assurance = {
      numeroPolice: numeroPolice.trim(),
      dateExpiration: nouvelleDate,
      compagnie: compagnie.trim()
    };

    await vehicule.save();
    
    logger.info('Assurance renouvelée', { vehiculeId, userId: req.user.userId });
    
    res.json({
      success: true,
      message: 'Assurance renouvelée avec succès',
      data: {
        vehicule,
        documentsValidite: vehicule.documentsValides()
      }
    });

  } catch (error) {
    logger.error('Erreur renouvellement assurance:', error);
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Données invalides',
        erreurs: messages
      });
    }

    return next(AppError.serverError('Erreur serveur lors du renouvellement de l\'assurance', { 
      originalError: error.message 
    }));
  }
};

/**
 * @desc Renouveler la visite technique d'un véhicule
 * @route PUT /api/vehicules/:vehiculeId/visite-technique
 * @access Privé (utilisateur authentifié)
 */
const renouvelerVisiteTechnique = async (req, res, next) => {
  try {
    const { vehiculeId } = req.params;
    const { dateExpiration, certificatUrl } = req.body;

    if (!vehiculeId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: 'ID de véhicule invalide'
      });
    }

    // Validation des données requises
    if (!dateExpiration) {
      return res.status(400).json({
        success: false,
        message: 'Date d\'expiration requise'
      });
    }

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

    // Vérifier que la nouvelle date est future
    const nouvelleDate = new Date(dateExpiration);
    if (nouvelleDate <= new Date()) {
      return res.status(400).json({
        success: false,
        message: 'La date d\'expiration doit être future'
      });
    }

    vehicule.visiteTechnique = {
      dateExpiration: nouvelleDate,
      certificatUrl: certificatUrl || vehicule.visiteTechnique.certificatUrl
    };

    await vehicule.save();
    
    logger.info('Visite technique renouvelée', { vehiculeId, userId: req.user.userId });
    
    res.json({
      success: true,
      message: 'Visite technique renouvelée avec succès',
      data: {
        vehicule,
        documentsValidite: vehicule.documentsValides()
      }
    });

  } catch (error) {
    logger.error('Erreur renouvellement visite technique:', error);
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Données invalides',
        erreurs: messages
      });
    }

    return next(AppError.serverError('Erreur serveur lors du renouvellement de la visite technique', { 
      originalError: error.message 
    }));
  }
};

/**
 * @desc Changer le statut d'un véhicule
 * @route PATCH /api/vehicules/:vehiculeId/statut
 * @access Privé (utilisateur authentifié)
 */
const changerStatutVehicule = async (req, res, next) => {
  try {
    const { vehiculeId } = req.params;
    const { statut } = req.body;

    if (!vehiculeId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: 'ID de véhicule invalide'
      });
    }

    const statutsValides = ['ACTIF', 'INACTIF', 'EN_REPARATION', 'HORS_SERVICE'];
    if (!statut || !statutsValides.includes(statut)) {
      return res.status(400).json({
        success: false,
        message: `Statut invalide. Statuts valides: ${statutsValides.join(', ')}`
      });
    }

    logger.info('Changement statut véhicule', { vehiculeId, nouveauStatut: statut, userId: req.user.userId });
    
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

    const ancienStatut = vehicule.statut;
    vehicule.statut = statut;

    // Si le véhicule est mis hors service et qu'il était principal
    if (statut === 'HORS_SERVICE' && vehicule.estPrincipal) {
      const autresVehiculesActifs = await Vehicule.find({
        proprietaireId: req.user.userId,
        _id: { $ne: vehiculeId },
        statut: { $in: ['ACTIF', 'INACTIF'] }
      });

      if (autresVehiculesActifs.length > 0) {
        vehicule.estPrincipal = false;
        // Définir un autre véhicule comme principal
        const nouveauPrincipal = autresVehiculesActifs[0];
        nouveauPrincipal.estPrincipal = true;
        await nouveauPrincipal.save();
        
        logger.info('Nouveau véhicule principal défini suite à mise hors service', { 
          nouveauPrincipalId: nouveauPrincipal._id,
          userId: req.user.userId 
        });
      }
    }

    await vehicule.save();
    
    logger.info('Statut véhicule modifié', { 
      vehiculeId, 
      ancienStatut, 
      nouveauStatut: statut, 
      userId: req.user.userId 
    });
    
    res.json({
      success: true,
      message: `Statut du véhicule modifié de ${ancienStatut} vers ${statut}`,
      data: {
        vehicule,
        ancienStatut,
        nouveauStatut: statut
      }
    });

  } catch (error) {
    logger.error('Erreur changement statut véhicule:', error);
    return next(AppError.serverError('Erreur serveur lors du changement de statut', { 
      originalError: error.message 
    }));
  }
};

/**
 * @desc Archiver un véhicule (méthode alternative à la suppression)
 * @route PATCH /api/vehicules/:vehiculeId/archiver
 * @access Privé (utilisateur authentifié)
 */
const archiverVehicule = async (req, res, next) => {
  try {
    const { vehiculeId } = req.params;

    if (!vehiculeId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: 'ID de véhicule invalide'
      });
    }

    logger.info('Archivage véhicule', { vehiculeId, userId: req.user.userId });
    
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

    // Utiliser la méthode du modèle
    await vehicule.archiver();
    
    logger.info('Véhicule archivé', { vehiculeId, userId: req.user.userId });
    
    res.json({
      success: true,
      message: 'Véhicule archivé avec succès',
      data: {
        vehicule
      }
    });

  } catch (error) {
    logger.error('Erreur archivage véhicule:', error);
    return next(AppError.serverError('Erreur serveur lors de l\'archivage', { 
      originalError: error.message 
    }));
  }
};

/**
 * @desc Obtenir l'historique d'un véhicule (modifications, maintenances, etc.)
 * @route GET /api/vehicules/:vehiculeId/historique
 * @access Privé (utilisateur authentifié)
 */
const obtenirHistoriqueVehicule = async (req, res, next) => {
  try {
    const { vehiculeId } = req.params;

    if (!vehiculeId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: 'ID de véhicule invalide'
      });
    }

    logger.info('Récupération historique véhicule', { vehiculeId, userId: req.user.userId });
    
    const vehicule = await Vehicule.findOne({
      _id: vehiculeId,
      proprietaireId: req.user.userId
    }).populate('proprietaireId', 'nom prenom email');

    if (!vehicule) {
      return res.status(404).json({
        success: false,
        message: 'Véhicule non trouvé'
      });
    }

    // Construire l'historique basé sur les timestamps et les données
    const historique = {
      vehicule: {
        id: vehicule._id,
        immatriculation: vehicule.immatriculation,
        marque: vehicule.marque,
        modele: vehicule.modele
      },
      evenements: [
        {
          type: 'CREATION',
          date: vehicule.createdAt,
          description: 'Véhicule créé'
        },
        {
          type: 'ASSURANCE_ACTUELLE',
          date: vehicule.assurance.dateExpiration,
          description: `Assurance ${vehicule.assurance.compagnie} - Police: ${vehicule.assurance.numeroPolice}`,
          statut: vehicule.documentsValides().assurance.valide ? 'VALIDE' : 'EXPIRE'
        },
        {
          type: 'VISITE_TECHNIQUE_ACTUELLE',
          date: vehicule.visiteTechnique.dateExpiration,
          description: 'Visite technique',
          statut: vehicule.documentsValides().visiteTechnique.valide ? 'VALIDE' : 'EXPIRE'
        }
      ].sort((a, b) => new Date(b.date) - new Date(a.date)),
      statistiques: {
        age: vehicule.age,
        kilometrage: vehicule.kilometrage,
        derniereMiseAJour: vehicule.updatedAt,
        statutActuel: vehicule.statut
      }
    };

    res.json({
      success: true,
      data: historique
    });

  } catch (error) {
    logger.error('Erreur récupération historique véhicule:', error);
    return next(AppError.serverError('Erreur serveur lors de la récupération de l\'historique', { 
      originalError: error.message 
    }));
  }
};

/**
 * @desc Mettre à jour le kilométrage d'un véhicule
 * @route PATCH /api/vehicules/:vehiculeId/kilometrage
 * @access Privé (utilisateur authentifié)
 */
const mettreAJourKilometrage = async (req, res, next) => {
  try {
    const { vehiculeId } = req.params;
    const { kilometrage } = req.body;

    if (!vehiculeId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: 'ID de véhicule invalide'
      });
    }

    if (!kilometrage || kilometrage < 0) {
      return res.status(400).json({
        success: false,
        message: 'Kilométrage valide requis (nombre positif)'
      });
    }

    logger.info('Mise à jour kilométrage véhicule', { vehiculeId, kilometrage, userId: req.user.userId });
    
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

    // Vérifier que le nouveau kilométrage est supérieur à l'ancien
    if (vehicule.kilometrage && parseInt(kilometrage) < vehicule.kilometrage) {
      return res.status(400).json({
        success: false,
        message: 'Le nouveau kilométrage doit être supérieur ou égal à l\'ancien'
      });
    }

    const ancienKilometrage = vehicule.kilometrage;
    vehicule.kilometrage = parseInt(kilometrage);
    await vehicule.save();
    
    logger.info('Kilométrage mis à jour', { 
      vehiculeId, 
      ancienKilometrage, 
      nouveauKilometrage: kilometrage, 
      userId: req.user.userId 
    });
    
    res.json({
      success: true,
      message: 'Kilométrage mis à jour avec succès',
      data: {
        vehicule,
        ancienKilometrage,
        nouveauKilometrage: parseInt(kilometrage)
      }
    });

  } catch (error) {
    logger.error('Erreur mise à jour kilométrage:', error);
    return next(AppError.serverError('Erreur serveur lors de la mise à jour du kilométrage', { 
      originalError: error.message 
    }));
  }
};

/**
 * @desc Dupliquer un véhicule (pour créer un véhicule similaire)
 * @route POST /api/vehicules/:vehiculeId/dupliquer
 * @access Privé (utilisateur authentifié)
 */
const dupliquerVehicule = async (req, res, next) => {
  try {
    const { vehiculeId } = req.params;
    const { nouvelleImmatriculation } = req.body;

    if (!vehiculeId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: 'ID de véhicule invalide'
      });
    }

    if (!nouvelleImmatriculation) {
      return res.status(400).json({
        success: false,
        message: 'Nouvelle immatriculation requise'
      });
    }

    logger.info('Duplication véhicule', { vehiculeId, nouvelleImmatriculation, userId: req.user.userId });
    
    const vehiculeOriginal = await Vehicule.findOne({
      _id: vehiculeId,
      proprietaireId: req.user.userId
    });

    if (!vehiculeOriginal) {
      return res.status(404).json({
        success: false,
        message: 'Véhicule original non trouvé'
      });
    }

    // Créer une copie sans les champs uniques/sensibles
    const vehiculeData = vehiculeOriginal.toObject();
    delete vehiculeData._id;
    delete vehiculeData.createdAt;
    delete vehiculeData.updatedAt;
    delete vehiculeData.__v;
    
    // Modifier les champs spécifiques
    vehiculeData.immatriculation = nouvelleImmatriculation.toUpperCase();
    vehiculeData.estPrincipal = false; // Le nouveau véhicule n'est jamais principal par défaut
    vehiculeData.photoVehicule = null; // Pas de photo par défaut
    
    const nouveauVehicule = new Vehicule(vehiculeData);
    await nouveauVehicule.save();
    
    logger.info('Véhicule dupliqué avec succès', { 
      vehiculeOriginalId: vehiculeId,
      nouveauVehiculeId: nouveauVehicule._id, 
      userId: req.user.userId 
    });
    
    res.status(201).json({
      success: true,
      message: 'Véhicule dupliqué avec succès',
      data: {
        vehiculeOriginal: {
          id: vehiculeOriginal._id,
          immatriculation: vehiculeOriginal.immatriculation
        },
        nouveauVehicule
      }
    });

  } catch (error) {
    logger.error('Erreur duplication véhicule:', error);
    
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'Un véhicule avec cette immatriculation existe déjà'
      });
    }

    return next(AppError.serverError('Erreur serveur lors de la duplication du véhicule', { 
      originalError: error.message 
    }));
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
  renouvelerVisiteTechnique,
  changerStatutVehicule,
  archiverVehicule,
  obtenirHistoriqueVehicule,
  mettreAJourKilometrage,
  dupliquerVehicule
};