// controllers/evenementController.js
const evenementService = require('../services/evenementService');
const { AppError, asyncHandler, sendResponse } = require('../utils/helpers');

class EvenementController {

  /**
   * Créer un nouvel événement
   * POST /api/evenements
   */
  creerEvenement = asyncHandler(async (req, res) => {
    const evenement = await evenementService.creerEvenement(req.body);
    
    sendResponse(res, 201, {
      success: true,
      message: 'Événement créé avec succès',
      data: evenement
    });
  });

  /**
   * Obtenir tous les événements avec filtres
   * GET /api/evenements
   */
  obtenirEvenements = asyncHandler(async (req, res) => {
    // Extraction des paramètres de requête
    const {
      page = 1,
      limite = 20,
      typeEvenement,
      statutEvenement,
      ville,
      dateDebut,
      dateFin,
      tags,
      recherche,
      tri = 'dateDebut'
    } = req.query;

    // Construction des filtres
    const filtres = {};
    if (typeEvenement) filtres.typeEvenement = typeEvenement;
    if (statutEvenement) filtres.statutEvenement = statutEvenement;
    if (ville) filtres.ville = ville;
    if (dateDebut) filtres.dateDebut = dateDebut;
    if (dateFin) filtres.dateFin = dateFin;
    if (recherche) filtres.recherche = recherche;
    if (tags) {
      filtres.tags = Array.isArray(tags) ? tags : tags.split(',');
    }

    // Options de requête
    const options = {
      page: parseInt(page),
      limite: parseInt(limite),
      tri: this._construireTri(tri)
    };

    const resultat = await evenementService.rechercherEvenements(filtres, options);
    
    sendResponse(res, 200, {
      success: true,
      message: 'Événements récupérés avec succès',
      data: resultat.evenements,
      pagination: resultat.pagination
    });
  });

  /**
   * Obtenir un événement par ID
   * GET /api/evenements/:id
   */
  obtenirEvenement = asyncHandler(async (req, res) => {
    const evenement = await evenementService.obtenirEvenement(req.params.id);
    
    sendResponse(res, 200, {
      success: true,
      message: 'Événement récupéré avec succès',
      data: evenement
    });
  });

  /**
   * Mettre à jour un événement
   * PUT /api/evenements/:id
   */
  mettreAJourEvenement = asyncHandler(async (req, res) => {
    const evenement = await evenementService.mettreAJourEvenement(
      req.params.id, 
      req.body
    );
    
    sendResponse(res, 200, {
      success: true,
      message: 'Événement mis à jour avec succès',
      data: evenement
    });
  });

  /**
   * Supprimer un événement
   * DELETE /api/evenements/:id
   */
  supprimerEvenement = asyncHandler(async (req, res) => {
    const resultat = await evenementService.supprimerEvenement(req.params.id);
    
    sendResponse(res, 200, {
      success: true,
      message: resultat.message,
      data: { evenementId: resultat.evenementId }
    });
  });

  /**
   * Rechercher des événements par proximité géographique
   * GET /api/evenements/proximite
   */
  rechercherParProximite = asyncHandler(async (req, res) => {
    const { longitude, latitude, rayon = 10 } = req.query;
    
    // Validation des paramètres requis
    if (!longitude || !latitude) {
      throw new AppError('Longitude et latitude sont requises', 400);
    }

    // Filtres supplémentaires optionnels
    const filtresSupplementaires = {};
    if (req.query.typeEvenement) {
      filtresSupplementaires.typeEvenement = req.query.typeEvenement;
    }
    if (req.query.statutEvenement) {
      filtresSupplementaires.statutEvenement = req.query.statutEvenement;
    } else {
      // Par défaut, ne montrer que les événements programmés et en cours
      filtresSupplementaires.statutEvenement = { $in: ['PROGRAMME', 'EN_COURS'] };
    }

    const evenements = await evenementService.rechercherParProximite(
      parseFloat(longitude),
      parseFloat(latitude),
      parseFloat(rayon),
      filtresSupplementaires
    );
    
    sendResponse(res, 200, {
      success: true,
      message: `${evenements.length} événement(s) trouvé(s) dans un rayon de ${rayon} km`,
      data: evenements,
      meta: {
        centreRecherche: { longitude: parseFloat(longitude), latitude: parseFloat(latitude) },
        rayonKm: parseFloat(rayon)
      }
    });
  });

  /**
   * Obtenir les événements à venir
   * GET /api/evenements/a-venir
   */
  obtenirEvenementsAVenir = asyncHandler(async (req, res) => {
    const limite = parseInt(req.query.limite) || 20;
    
    const evenements = await evenementService.obtenirEvenementsAVenir(limite);
    
    sendResponse(res, 200, {
      success: true,
      message: 'Événements à venir récupérés avec succès',
      data: evenements
    });
  });

  /**
   * Ajouter un groupe de covoiturage à un événement
   * POST /api/evenements/:id/groupes-covoiturage
   */
  ajouterGroupeCovoiturage = asyncHandler(async (req, res) => {
    const evenement = await evenementService.ajouterGroupeCovoiturage(
      req.params.id,
      req.body
    );
    
    sendResponse(res, 201, {
      success: true,
      message: 'Groupe de covoiturage ajouté avec succès',
      data: evenement
    });
  });

  /**
   * Supprimer un groupe de covoiturage
   * DELETE /api/evenements/:id/groupes-covoiturage/:groupeId
   */
  supprimerGroupeCovoiturage = asyncHandler(async (req, res) => {
    const evenement = await evenementService.supprimerGroupeCovoiturage(
      req.params.id,
      req.params.groupeId
    );
    
    sendResponse(res, 200, {
      success: true,
      message: 'Groupe de covoiturage supprimé avec succès',
      data: evenement
    });
  });

  /**
   * Obtenir les groupes de covoiturage d'un événement
   * GET /api/evenements/:id/groupes-covoiturage
   */
  obtenirGroupesCovoiturage = asyncHandler(async (req, res) => {
    const evenement = await evenementService.obtenirEvenement(req.params.id);
    
    sendResponse(res, 200, {
      success: true,
      message: 'Groupes de covoiturage récupérés avec succès',
      data: evenement.groupesCovoiturage
    });
  });

  /**
   * Rejoindre un groupe de covoiturage
   * POST /api/evenements/:id/groupes-covoiturage/:groupeId/rejoindre
   */
  rejoindrGroupe = asyncHandler(async (req, res) => {
    const { id: evenementId, groupeId } = req.params;
    const utilisateurId = req.user.id; // Supposé venir du middleware d'auth
    
    const evenement = await evenementService.obtenirEvenement(evenementId);
    
    // Trouver le groupe
    const groupe = evenement.groupesCovoiturage.id(groupeId);
    if (!groupe) {
      throw new AppError('Groupe de covoiturage non trouvé', 404);
    }
    
    // Vérifier si l'utilisateur n'est pas déjà membre
    if (groupe.membres.includes(utilisateurId)) {
      throw new AppError('Vous êtes déjà membre de ce groupe', 400);
    }
    
    // Ajouter l'utilisateur au groupe
    groupe.membres.push(utilisateurId);
    await evenement.save();
    
    sendResponse(res, 200, {
      success: true,
      message: 'Vous avez rejoint le groupe avec succès',
      data: groupe
    });
  });

  /**
   * Quitter un groupe de covoiturage
   * DELETE /api/evenements/:id/groupes-covoiturage/:groupeId/quitter
   */
  quitterGroupe = asyncHandler(async (req, res) => {
    const { id: evenementId, groupeId } = req.params;
    const utilisateurId = req.user.id;
    
    const evenement = await evenementService.obtenirEvenement(evenementId);
    
    const groupe = evenement.groupesCovoiturage.id(groupeId);
    if (!groupe) {
      throw new AppError('Groupe de covoiturage non trouvé', 404);
    }
    
    // Retirer l'utilisateur du groupe
    groupe.membres = groupe.membres.filter(
      membreId => !membreId.equals(utilisateurId)
    );
    
    await evenement.save();
    
    sendResponse(res, 200, {
      success: true,
      message: 'Vous avez quitté le groupe avec succès',
      data: groupe
    });
  });

  /**
   * Obtenir les statistiques des événements
   * GET /api/evenements/statistiques
   */
  obtenirStatistiques = asyncHandler(async (req, res) => {
    const statistiques = await evenementService.obtenirStatistiques();
    
    sendResponse(res, 200, {
      success: true,
      message: 'Statistiques récupérées avec succès',
      data: statistiques
    });
  });

  /**
   * Changer le statut d'un événement
   * PATCH /api/evenements/:id/statut
   */
  changerStatut = asyncHandler(async (req, res) => {
    const { statut } = req.body;
    
    if (!statut || !['PROGRAMME', 'EN_COURS', 'TERMINE', 'ANNULE'].includes(statut)) {
      throw new AppError('Statut invalide', 400);
    }
    
    const evenement = await evenementService.mettreAJourEvenement(
      req.params.id,
      { statutEvenement: statut }
    );
    
    sendResponse(res, 200, {
      success: true,
      message: `Statut de l'événement changé vers "${statut}"`,
      data: evenement
    });
  });

  /**
   * Recherche avancée d'événements
   * POST /api/evenements/recherche-avancee
   */
  rechercheAvancee = asyncHandler(async (req, res) => {
    const {
      filtres = {},
      options = {},
      proximite = null
    } = req.body;
    
    let evenements;
    
    // Si recherche par proximité
    if (proximite && proximite.longitude && proximite.latitude) {
      evenements = await evenementService.rechercherParProximite(
        proximite.longitude,
        proximite.latitude,
        proximite.rayon || 10,
        filtres
      );
      
      sendResponse(res, 200, {
        success: true,
        message: 'Recherche par proximité effectuée avec succès',
        data: evenements
      });
    } else {
      // Recherche standard
      const resultat = await evenementService.rechercherEvenements(filtres, options);
      
      sendResponse(res, 200, {
        success: true,
        message: 'Recherche effectuée avec succès',
        data: resultat.evenements,
        pagination: resultat.pagination
      });
    }
  });

  /**
   * Exporter des événements
   * GET /api/evenements/export
   */
  exporterEvenements = asyncHandler(async (req, res) => {
    const { format = 'json', ...filtres } = req.query;
    
    // Obtenir tous les événements correspondants (sans pagination)
    const options = { limite: 10000, peupler: false };
    const resultat = await evenementService.rechercherEvenements(filtres, options);
    
    if (format === 'csv') {
      // Conversion en CSV (nécessiterait une bibliothèque comme csv-writer)
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=evenements.csv');
      // TODO: Implémenter la conversion CSV
      throw new AppError('Export CSV non encore implémenté', 501);
    } else {
      // Export JSON par défaut
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename=evenements.json');
      
      sendResponse(res, 200, {
        success: true,
        message: 'Export réalisé avec succès',
        data: resultat.evenements,
        exportedAt: new Date().toISOString(),
        count: resultat.evenements.length
      });
    }
  });

  // === MÉTHODES UTILITAIRES PRIVÉES ===

  /**
   * Construire l'objet de tri à partir du paramètre de requête
   * @private
   */
  _construireTri(tri) {
    const triMapping = {
      'dateDebut': { dateDebut: 1 },
      'dateDebut_desc': { dateDebut: -1 },
      'nom': { nom: 1 },
      'nom_desc': { nom: -1 },
      'createdAt': { createdAt: 1 },
      'createdAt_desc': { createdAt: -1 },
      'capacite': { capaciteEstimee: 1 },
      'capacite_desc': { capaciteEstimee: -1 }
    };
    
    return triMapping[tri] || { dateDebut: 1 };
  }

  /**
   * Valider les paramètres de pagination
   * @private
   */
  _validerPagination(page, limite) {
    const pageNum = parseInt(page) || 1;
    const limiteNum = parseInt(limite) || 20;
    
    if (pageNum < 1) {
      throw new AppError('Le numéro de page doit être supérieur à 0', 400);
    }
    
    if (limiteNum < 1 || limiteNum > 100) {
      throw new AppError('La limite doit être entre 1 et 100', 400);
    }
    
    return { page: pageNum, limite: limiteNum };
  }
}

module.exports = new EvenementController();