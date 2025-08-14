// controllers/alerteUrgenceController.js
const AlerteUrgence = require('../models/AlerteUrgence');
const logger = require('../utils/logger');
const AppError = require('../utils/AppError');

// =============== MÉTHODES CRUD STANDARD ===============

/**
 * @desc    Créer une nouvelle alerte d'urgence
 * @route   POST /api/alertes-urgence
 * @access  Privé (utilisateur authentifié)
 */
const creerAlerteUrgence = async (req, res, next) => {
  try {
    logger.info('Création alerte urgence', { userId: req.user.userId });

    const alerteData = {
    ...req.body,
      declencheurId: req.user.userId,
      dateDeclaration: new Date(),
      statut: 'ACTIVE'
    };

    const nouvelleAlerte = new AlerteUrgence(alerteData);
    await nouvelleAlerte.save();

    logger.info('Alerte urgence créée', { alerteId: nouvelleAlerte._id, userId: req.user.userId });

    res.status(201).json({
      success: true,
      message: 'Alerte d\'urgence créée avec succès',
      alerte: nouvelleAlerte
    });

  } catch (error) {
    logger.error('Erreur création alerte urgence:', error);
    return next(AppError.serverError('Erreur serveur lors de la création de l\'alerte urgence', { originalError: error.message }));
  }
};

/**
 * @desc    Obtenir toutes les alertes d'urgence de l'utilisateur
 * @route   GET /api/alertes-urgence
 * @access  Privé (utilisateur authentifié)
 */
const obtenirAlertesUrgence = async (req, res, next) => {
  try {
    logger.info('Récupération alertes urgence', { userId: req.user.userId });

    const alertes = await AlerteUrgence.find({ declencheurId: req.user.userId })
      .sort({ dateDeclaration: -1 });

    res.json({
    success: true,
      count: alertes.length,
      alertes
    });

  } catch (error) {
    logger.error('Erreur récupération alertes urgence:', error);
    return next(AppError.serverError('Erreur serveur lors de la récupération des alertes urgence', { originalError: error.message }));
  }
};

/**
 * @desc    Obtenir une alerte d'urgence spécifique par ID
 * @route   GET /api/alertes-urgence/:alerteId
 * @access  Privé (utilisateur authentifié)
 */
const obtenirAlerteUrgence = async (req, res, next) => {
  try {
    const { alerteId } = req.params;
    logger.info('Récupération alerte urgence', { alerteId, userId: req.user.userId });

    const alerte = await AlerteUrgence.findOne({
      _id: alerteId,
      declencheurId: req.user.userId
    });

    if (!alerte) {
      return res.status(404).json({
        success: false,
        message: 'Alerte d\'urgence non trouvée'
      });
    }

    res.json({
      success: true,
      alerte
    });

  } catch (error) {
    logger.error('Erreur récupération alerte urgence:', error);
    return next(AppError.serverError('Erreur serveur lors de la récupération de l\'alerte urgence', { originalError: error.message }));
  }
};

/**
 * @desc    Mettre à jour une alerte d'urgence
 * @route   PUT /api/alertes-urgence/:alerteId
 * @access  Privé (utilisateur authentifié)
 */
const mettreAJourAlerteUrgence = async (req, res, next) => {
  try {
    const { alerteId } = req.params;
    logger.info('Mise à jour alerte urgence', { alerteId, userId: req.user.userId });

    const alerte = await AlerteUrgence.findOne({
      _id: alerteId,
      declencheurId: req.user.userId
    });

    if (!alerte) {
      return res.status(404).json({
        success: false,
        message: 'Alerte d\'urgence non trouvée'
      });
    }

    // Mettre à jour les champs autorisés
    const champsAutorises = ['description', 'position', 'contactsAlertes', 'personnesPresentes'];
    champsAutorises.forEach(champ => {
      if (req.body[champ] !== undefined) {
        alerte[champ] = req.body[champ];
      }
    });

    alerte.dateModification = new Date();
    await alerte.save();

    logger.info('Alerte urgence mise à jour', { alerteId, userId: req.user.userId });

    res.json({
    success: true,
      message: 'Alerte d\'urgence mise à jour avec succès',
      alerte
    });

  } catch (error) {
    logger.error('Erreur mise à jour alerte urgence:', error);
    return next(AppError.serverError('Erreur serveur lors de la mise à jour de l\'alerte urgence', { originalError: error.message }));
  }
};

/**
 * @desc    Supprimer une alerte d'urgence
 * @route   DELETE /api/alertes-urgence/:alerteId
 * @access  Privé (utilisateur authentifié)
 */
const supprimerAlerteUrgence = async (req, res, next) => {
  try {
    const { alerteId } = req.params;
    logger.info('Suppression alerte urgence', { alerteId, userId: req.user.userId });

    const alerte = await AlerteUrgence.findOne({
      _id: alerteId,
      declencheurId: req.user.userId
    });

    if (!alerte) {
      return res.status(404).json({
        success: false,
        message: 'Alerte d\'urgence non trouvée'
      });
    }

    await AlerteUrgence.findByIdAndDelete(alerteId);

    logger.info('Alerte urgence supprimée', { alerteId, userId: req.user.userId });

    res.json({
    success: true,
      message: 'Alerte d\'urgence supprimée avec succès'
    });

  } catch (error) {
    logger.error('Erreur suppression alerte urgence:', error);
    return next(AppError.serverError('Erreur serveur lors de la suppression de l\'alerte urgence', { originalError: error.message }));
  }
};

// =============== MÉTHODES SPÉCIFIQUES ===============

/**
 * @desc    Mettre à jour le statut d'une alerte d'urgence
 * @route   PUT /api/alertes-urgence/:alerteId/statut
 * @access  Privé (utilisateur authentifié)
 */
const mettreAJourStatutAlerte = async (req, res, next) => {
  try {
    const { alerteId } = req.params;
    const { nouveauStatut, raison } = req.body;
    
    logger.info('Mise à jour statut alerte urgence', { 
      alerteId, 
      userId: req.user.userId, 
      nouveauStatut 
    });

    const alerte = await AlerteUrgence.findOne({
      _id: alerteId,
      declencheurId: req.user.userId
    });

    if (!alerte) {
      return res.status(404).json({
        success: false,
        message: 'Alerte d\'urgence non trouvée'
      });
    }

    // Vérifier que le statut est valide
    const statutsValides = ['ACTIVE', 'RESOLUE', 'ANNULEE', 'EN_COURS'];
    if (!statutsValides.includes(nouveauStatut)) {
      return res.status(400).json({
        success: false,
        message: 'Statut invalide',
        statutsValides
      });
    }

    alerte.statut = nouveauStatut;
    alerte.dateModification = new Date();
    
    if (nouveauStatut === 'RESOLUE') {
      alerte.dateResolution = new Date();
    }

    // Ajouter à l'historique des statuts
    alerte.historiqueStatuts.push({
      ancienStatut: alerte.statut,
      nouveauStatut,
      raison: raison || 'Modification par l\'utilisateur',
      dateModification: new Date(),
      utilisateurId: req.user.userId
    });

    await alerte.save();

    logger.info('Statut alerte urgence mis à jour', { 
      alerteId, 
      userId: req.user.userId, 
      nouveauStatut 
    });

    res.json({
    success: true,
      message: 'Statut de l\'alerte d\'urgence mis à jour avec succès',
      alerte
    });

  } catch (error) {
    logger.error('Erreur mise à jour statut alerte urgence:', error);
    return next(AppError.serverError('Erreur serveur lors de la mise à jour du statut', { originalError: error.message }));
  }
};

/**
 * @desc    Ajouter un contact à une alerte d'urgence
 * @route   POST /api/alertes-urgence/:alerteId/contacts
 * @access  Privé (utilisateur authentifié)
 */
const ajouterContactAlerte = async (req, res, next) => {
  try {
    const { alerteId } = req.params;
    const { nom, telephone, relation } = req.body;
    
    logger.info('Ajout contact alerte urgence', { alerteId, userId: req.user.userId });

    const alerte = await AlerteUrgence.findOne({
      _id: alerteId,
      declencheurId: req.user.userId
    });

    if (!alerte) {
      return res.status(404).json({
        success: false,
        message: 'Alerte d\'urgence non trouvée'
      });
    }

    const nouveauContact = {
      nom,
      telephone,
      relation,
      dateNotification: new Date(),
      statutNotification: 'ENVOYE'
    };

    alerte.contactsAlertes.push(nouveauContact);
    await alerte.save();

    logger.info('Contact ajouté à l\'alerte urgence', { alerteId, userId: req.user.userId });

    res.json({
      success: true,
      message: 'Contact ajouté avec succès',
      contact: nouveauContact
    });

  } catch (error) {
    logger.error('Erreur ajout contact alerte urgence:', error);
    return next(AppError.serverError('Erreur serveur lors de l\'ajout du contact', { originalError: error.message }));
  }
};

/**
 * @desc    Ajouter une personne présente à une alerte d'urgence
 * @route   POST /api/alertes-urgence/:alerteId/personnes
 * @access  Privé (utilisateur authentifié)
 */
const ajouterPersonnePresente = async (req, res, next) => {
  try {
    const { alerteId } = req.params;
    const { nom, telephone } = req.body;
    
    logger.info('Ajout personne présente alerte urgence', { alerteId, userId: req.user.userId });

    const alerte = await AlerteUrgence.findOne({
      _id: alerteId,
      declencheurId: req.user.userId
    });

    if (!alerte) {
      return res.status(404).json({
        success: false,
        message: 'Alerte d\'urgence non trouvée'
      });
    }

    const nouvellePersonne = {
      nom,
      telephone
    };

    alerte.personnesPresentes.push(nouvellePersonne);
    await alerte.save();

    logger.info('Personne présente ajoutée à l\'alerte urgence', { alerteId, userId: req.user.userId });

    res.json({
      success: true,
      message: 'Personne présente ajoutée avec succès',
      personne: nouvellePersonne
    });

  } catch (error) {
    logger.error('Erreur ajout personne présente alerte urgence:', error);
    return next(AppError.serverError('Erreur serveur lors de l\'ajout de la personne présente', { originalError: error.message }));
  }
};

/**
 * @desc    Rechercher des alertes d'urgence par proximité géographique
 * @route   GET /api/alertes-urgence/proximite
 * @access  Privé (utilisateur authentifié)
 */
const rechercherParProximite = async (req, res, next) => {
  try {
    const { longitude, latitude, rayon = 10 } = req.query; // rayon en km par défaut
    logger.info('Recherche alertes urgence par proximité', { userId: req.user.userId });

    if (!longitude || !latitude) {
      return res.status(400).json({
        success: false,
        message: 'Coordonnées GPS requises (longitude, latitude)'
      });
    }

    const alertes = await AlerteUrgence.find({
      statut: 'ACTIVE',
      'position.coordinates': {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [parseFloat(longitude), parseFloat(latitude)]
          },
          $maxDistance: rayon * 1000 // Convertir en mètres
        }
      }
    }).limit(20);

    res.json({
      success: true,
      count: alertes.length,
      rayonKm: rayon,
      centre: { longitude, latitude },
      alertes
    });

  } catch (error) {
    logger.error('Erreur recherche par proximité:', error);
    return next(AppError.serverError('Erreur serveur lors de la recherche par proximité', { originalError: error.message }));
  }
};

/**
 * @desc    Obtenir les statistiques des alertes d'urgence
 * @route   GET /api/alertes-urgence/statistiques
 * @access  Privé (utilisateur authentifié)
 */
const obtenirStatistiques = async (req, res, next) => {
  try {
    logger.info('Récupération statistiques alertes urgence', { userId: req.user.userId });

    const stats = await AlerteUrgence.aggregate([
      { $match: { declencheurId: req.user.userId } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          actives: { $sum: { $cond: [{ $eq: ['$statut', 'ACTIVE'] }, 1, 0] } },
          resolues: { $sum: { $cond: [{ $eq: ['$statut', 'RESOLUE'] }, 1, 0] } },
          annulees: { $sum: { $cond: [{ $eq: ['$statut', 'ANNULEE'] }, 1, 0] } },
          enCours: { $sum: { $cond: [{ $eq: ['$statut', 'EN_COURS'] }, 1, 0] } }
        }
      }
    ]);

    const statistiques = stats[0] || {
      total: 0,
      actives: 0,
      resolues: 0,
      annulees: 0,
      enCours: 0
    };

    res.json({
      success: true,
      statistiques
    });

  } catch (error) {
    logger.error('Erreur récupération statistiques:', error);
    return next(AppError.serverError('Erreur serveur lors de la récupération des statistiques', { originalError: error.message }));
  }
};

/**
 * @desc    Obtenir les alertes d'urgence à venir (planifiées)
 * @route   GET /api/alertes-urgence/avenir
 * @access  Privé (utilisateur authentifié)
 */
const obtenirAlertesAVenir = async (req, res, next) => {
  try {
    logger.info('Récupération alertes urgence à venir', { userId: req.user.userId });

    const maintenant = new Date();
    const alertesAVenir = await AlerteUrgence.find({
      declencheurId: req.user.userId,
      dateDeclaration: { $gt: maintenant },
      statut: { $in: ['PLANIFIEE', 'ACTIVE'] }
    }).sort({ dateDeclaration: 1 });

    res.json({
      success: true,
      count: alertesAVenir.length,
      alertes: alertesAVenir
    });

  } catch (error) {
    logger.error('Erreur récupération alertes à venir:', error);
    return next(AppError.serverError('Erreur serveur lors de la récupération des alertes à venir', { originalError: error.message }));
  }
};

/**
 * @desc    Exporter les alertes d'urgence
 * @route   GET /api/alertes-urgence/export
 * @access  Privé (utilisateur authentifié)
 */
const exporterAlertes = async (req, res, next) => {
  try {
    const { format = 'json' } = req.query;
    logger.info('Export alertes urgence', { userId: req.user.userId, format });

    const alertes = await AlerteUrgence.find({ declencheurId: req.user.userId })
      .sort({ dateDeclaration: -1 });

    if (format === 'csv') {
      // Logique d'export CSV (simplifiée)
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="alertes-urgence.csv"');
      
      const csvHeader = 'ID,Date,Statut,Description,Position\n';
      const csvData = alertes.map(alerte => 
        `${alerte._id},${alerte.dateDeclaration},${alerte.statut},${alerte.description},"${alerte.position?.coordinates?.join(',')}"`
      ).join('\n');
      
      res.send(csvHeader + csvData);
    } else {
      // Export JSON par défaut
      res.json({
        success: true,
        count: alertes.length,
        format: 'json',
        alertes
      });
    }

  } catch (error) {
    logger.error('Erreur export alertes urgence:', error);
    return next(AppError.serverError('Erreur serveur lors de l\'export des alertes', { originalError: error.message }));
  }
};

// =============== EXPORTS ===============

module.exports = {
  // Méthodes CRUD standard
  creerAlerteUrgence,
  obtenirAlertesUrgence,
  obtenirAlerteUrgence,
  mettreAJourAlerteUrgence,
  supprimerAlerteUrgence,
  
  // Méthodes spécifiques
  mettreAJourStatutAlerte,
  ajouterContactAlerte,
  ajouterPersonnePresente,
  rechercherParProximite,
  obtenirStatistiques,
  obtenirAlertesAVenir,
  exporterAlertes
};