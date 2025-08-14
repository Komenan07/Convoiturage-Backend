const AppError = require('../utils/AppError');

class EvenementController {
  constructor(evenementService) {
    this.evenementService = evenementService;

    // Bind des méthodes pour conserver le contexte
    this.creerEvenement = this.creerEvenement.bind(this);
    this.obtenirEvenements = this.obtenirEvenements.bind(this);
    this.obtenirEvenement = this.obtenirEvenement.bind(this);
    this.mettreAJourEvenement = this.mettreAJourEvenement.bind(this);
    this.supprimerEvenement = this.supprimerEvenement.bind(this);
    this.changerStatut = this.changerStatut.bind(this);
    this.obtenirEvenementsAVenir = this.obtenirEvenementsAVenir.bind(this);
    this.rechercherParProximite = this.rechercherParProximite.bind(this);
    this.rechercheAvancee = this.rechercheAvancee.bind(this);
    this.exporterEvenements = this.exporterEvenements.bind(this);
    this.obtenirStatistiques = this.obtenirStatistiques.bind(this);
    this.obtenirGroupesCovoiturage = this.obtenirGroupesCovoiturage.bind(this);
    this.ajouterGroupeCovoiturage = this.ajouterGroupeCovoiturage.bind(this);
    this.supprimerGroupeCovoiturage = this.supprimerGroupeCovoiturage.bind(this);
    this.rejoindrGroupe = this.rejoindrGroupe.bind(this);
    this.quitterGroupe = this.quitterGroupe.bind(this);
  }

  // =============== ROUTES PUBLIQUES ===============

  /**
   * Obtenir tous les événements avec filtres et pagination
   */
  async obtenirEvenements(req, res) {
    try {
      const {
        page = 1,
        limit = 10,
        typeEvenement,
        ville,
        statut = 'PROGRAMME',
        dateDebut,
        dateFin,
        motsCles,
        tags,
        organisateur
      } = req.query;

      const filtres = {};
      
      if (typeEvenement) filtres.typeEvenement = typeEvenement;
      if (ville) filtres['lieu.ville'] = new RegExp(ville, 'i');
      if (statut) filtres.statutEvenement = statut;
      if (organisateur) filtres.organisateur = organisateur;
      if (tags) filtres.tags = { $in: tags.split(',') };
      
      // Filtres de dates
      if (dateDebut || dateFin) {
        filtres.dateDebut = {};
        if (dateDebut) filtres.dateDebut.$gte = new Date(dateDebut);
        if (dateFin) filtres.dateDebut.$lte = new Date(dateFin);
      }

      // Recherche textuelle
      if (motsCles) {
        filtres.$or = [
          { nom: new RegExp(motsCles, 'i') },
          { description: new RegExp(motsCles, 'i') },
          { tags: new RegExp(motsCles, 'i') }
        ];
      }

      const options = {
        page: parseInt(page),
        limit: parseInt(limit),
        sort: { dateCreation: -1 },
        populate: [
          { path: 'organisateur', select: 'prenom nom avatar' },
          { path: 'groupesCovoiturage.conducteur', select: 'prenom nom' }
        ]
      };

      const result = await this.evenementService.obtenirEvenements(filtres, options);
      
      res.json({
        success: true,
        data: result.evenements,
        pagination: {
          page: result.page,
          pages: result.pages,
          total: result.total,
          limit: result.limit
        }
      });
    } catch (error) {
      return next(AppError.serverError('Erreur serveur lors de la récupération des événements', { originalError: error.message }));
    }
  }

  /**
   * Obtenir un événement spécifique par ID
   */
  async obtenirEvenement(req, res) {
    try {
      const { id } = req.params;
      
      const evenement = await this.evenementService.obtenirEvenementParId(id);
      
      if (!evenement) {
        return res.status(404).json({
          success: false,
          message: 'Événement non trouvé'
        });
      }

      res.json({
        success: true,
        data: evenement
      });
    } catch (error) {
      return next(AppError.serverError('Erreur serveur lors de la récupération de l\'événement', { originalError: error.message }));
    }
  }

  /**
   * Obtenir les événements à venir
   */
  async obtenirEvenementsAVenir(req, res) {
    try {
      const { limit = 10, ville } = req.query;
      
      const filtres = {
        dateDebut: { $gte: new Date() },
        statutEvenement: 'PROGRAMME'
      };

      if (ville) {
        filtres['lieu.ville'] = new RegExp(ville, 'i');
      }

      const evenements = await this.evenementService.obtenirEvenements(filtres, {
        limit: parseInt(limit),
        sort: { dateDebut: 1 },
        populate: [
          { path: 'organisateur', select: 'prenom nom avatar' }
        ]
      });

      res.json({
        success: true,
        data: evenements.evenements
      });
    } catch (error) {
      return next(AppError.serverError('Erreur serveur lors de la récupération des événements à venir', { originalError: error.message }));
    }
  }

  /**
   * Rechercher des événements par proximité géographique
   */
  async rechercherParProximite(req, res) {
    try {
      const { latitude, longitude, rayon = 10, limit = 20 } = req.query;

      if (!latitude || !longitude) {
        return res.status(400).json({
          success: false,
          message: 'Latitude et longitude sont requises'
        });
      }

      const evenements = await this.evenementService.rechercherParProximite(
        parseFloat(latitude),
        parseFloat(longitude),
        parseFloat(rayon),
        parseInt(limit)
      );

      res.json({
        success: true,
        data: evenements,
        criteres: {
          latitude: parseFloat(latitude),
          longitude: parseFloat(longitude),
          rayon: parseFloat(rayon)
        }
      });
    } catch (error) {
      return next(AppError.serverError('Erreur serveur lors de la recherche par proximité', { originalError: error.message }));
    }
  }

  /**
   * Recherche avancée d'événements
   */
  async rechercheAvancee(req, res) {
    try {
      const {
        motsCles,
        typeEvenement,
        dateDebutMin,
        dateDebutMax,
        ville,
        tags,
        capaciteMin,
        capaciteMax,
        coordonnees,
        rayon,
        page = 1,
        limit = 10
      } = req.body;

      const criteres = await this.evenementService.construireCriteresRecherche({
        motsCles,
        typeEvenement,
        dateDebutMin,
        dateDebutMax,
        ville,
        tags,
        capaciteMin,
        capaciteMax,
        coordonnees,
        rayon
      });

      const options = {
        page: parseInt(page),
        limit: parseInt(limit),
        sort: { pertinence: -1, dateDebut: 1 },
        populate: [
          { path: 'organisateur', select: 'prenom nom avatar' }
        ]
      };

      const result = await this.evenementService.rechercheAvancee(criteres, options);

      res.json({
        success: true,
        data: result.evenements,
        pagination: {
          page: result.page,
          pages: result.pages,
          total: result.total
        },
        criteres_utilises: criteres
      });
    } catch (error) {
      return next(AppError.serverError('Erreur serveur lors de la recherche avancée', { originalError: error.message }));
    }
  }

  /**
   * Exporter des événements
   */
  async exporterEvenements(req, res) {
    try {
      const { format = 'json', ...filtres } = req.query;

      const evenements = await this.evenementService.exporterEvenements(filtres);

      if (format === 'csv') {
        const csv = await this.evenementService.convertirEnCSV(evenements);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename="evenements.csv"');
        return res.send(csv);
      }

      res.json({
        success: true,
        data: evenements,
        format,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      return next(AppError.serverError('Erreur serveur lors de l\'export des événements', { originalError: error.message }));
    }
  }

  /**
   * Obtenir les statistiques des événements
   */
  async obtenirStatistiques(req, res) {
    try {
      const { periode = '30d', ville } = req.query;

      const stats = await this.evenementService.obtenirStatistiques(periode, ville);

      res.json({
        success: true,
        data: stats,
        periode,
        ville: ville || 'toutes'
      });
    } catch (error) {
      return next(AppError.serverError('Erreur serveur lors de la récupération des statistiques', { originalError: error.message }));
    }
  }

  // =============== ROUTES PROTÉGÉES ===============

  /**
   * Créer un nouvel événement
   */
  async creerEvenement(req, res) {
    try {
      const donneesEvenement = {
        ...req.body,
        organisateur: req.user.id
      };

      // Gestion de l'image uploadée
      if (req.file) {
        donneesEvenement.imageEvenement = req.file.path || req.file.filename;
      }

      // Validation des données requises
      const champsRequis = ['nom', 'description', 'typeEvenement', 'dateDebut', 'lieu'];
      for (const champ of champsRequis) {
        if (!donneesEvenement[champ]) {
          return res.status(400).json({
            success: false,
            message: `Le champ ${champ} est requis`
          });
        }
      }

      const evenement = await this.evenementService.creerEvenement(donneesEvenement);

      res.status(201).json({
        success: true,
        message: 'Événement créé avec succès',
        data: evenement
      });
    } catch (error) {
      return next(AppError.serverError('Erreur serveur lors de la création de l\'événement', { originalError: error.message }));
    }
  }

  /**
   * Mettre à jour un événement
   */
  async mettreAJourEvenement(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      // Vérifier si l'utilisateur est autorisé
      const evenementExistant = await this.evenementService.obtenirEvenementParId(id);
      if (!evenementExistant) {
        return res.status(404).json({
          success: false,
          message: 'Événement non trouvé'
        });
      }

      if (evenementExistant.organisateur.toString() !== userId && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'Vous n\'êtes pas autorisé à modifier cet événement'
        });
      }

      const donneesMAJ = { ...req.body };

      // Gestion de la nouvelle image
      if (req.file) {
        donneesMAJ.imageEvenement = req.file.path || req.file.filename;
      }

      const evenementMAJ = await this.evenementService.mettreAJourEvenement(id, donneesMAJ);

      res.json({
        success: true,
        message: 'Événement mis à jour avec succès',
        data: evenementMAJ
      });
    } catch (error) {
      return next(AppError.serverError('Erreur serveur lors de la mise à jour de l\'événement', { originalError: error.message }));
    }
  }

  /**
   * Changer le statut d'un événement
   */
  async changerStatut(req, res) {
    try {
      const { id } = req.params;
      const { statut, motif } = req.body;
      const userId = req.user.id;

      const statutsAutorises = ['PROGRAMME', 'ANNULE', 'REPORTE', 'TERMINE'];
      if (!statutsAutorises.includes(statut)) {
        return res.status(400).json({
          success: false,
          message: 'Statut invalide',
          statuts_autorises: statutsAutorises
        });
      }

      const evenement = await this.evenementService.changerStatut(id, statut, userId, motif);

      res.json({
        success: true,
        message: `Statut de l'événement changé en ${statut}`,
        data: evenement
      });
    } catch (error) {
      return next(AppError.serverError('Erreur serveur lors du changement de statut', { originalError: error.message }));
    }
  }

  /**
   * Supprimer un événement
   */
  async supprimerEvenement(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const resultat = await this.evenementService.supprimerEvenement(id, userId);

      res.json({
        success: true,
        message: 'Événement supprimé avec succès',
        data: resultat
      });
    } catch (error) {
      return next(AppError.serverError('Erreur serveur lors de la suppression de l\'événement', { originalError: error.message }));
    }
  }

  // =============== GROUPES DE COVOITURAGE ===============

  /**
   * Obtenir les groupes de covoiturage d'un événement
   */
  async obtenirGroupesCovoiturage(req, res) {
    try {
      const { id } = req.params;

      const groupes = await this.evenementService.obtenirGroupesCovoiturage(id);

      res.json({
        success: true,
        data: groupes
      });
    } catch (error) {
      return next(AppError.serverError('Erreur serveur lors de la récupération des groupes de covoiturage', { originalError: error.message }));
    }
  }

  /**
   * Ajouter un groupe de covoiturage à un événement
   */
  async ajouterGroupeCovoiturage(req, res) {
    try {
      const { id } = req.params;
      const donneesGroupe = {
        ...req.body,
        conducteur: req.user.id
      };

      const groupe = await this.evenementService.ajouterGroupeCovoiturage(id, donneesGroupe);

      res.status(201).json({
        success: true,
        message: 'Groupe de covoiturage ajouté avec succès',
        data: groupe
      });
    } catch (error) {
      return next(AppError.serverError('Erreur serveur lors de l\'ajout du groupe de covoiturage', { originalError: error.message }));
    }
  }

  /**
   * Supprimer un groupe de covoiturage
   */
  async supprimerGroupeCovoiturage(req, res) {
    try {
      const { id, groupeId } = req.params;
      const userId = req.user.id;

      const resultat = await this.evenementService.supprimerGroupeCovoiturage(id, groupeId, userId);

      res.json({
        success: true,
        message: 'Groupe de covoiturage supprimé avec succès',
        data: resultat
      });
    } catch (error) {
      return next(AppError.serverError('Erreur serveur lors de la suppression du groupe de covoiturage', { originalError: error.message }));
    }
  }

  /**
   * Rejoindre un groupe de covoiturage
   */
  async rejoindrGroupe(req, res) {
    try {
      const { id, groupeId } = req.params;
      const userId = req.user.id;

      const groupe = await this.evenementService.rejoindrGroupe(id, groupeId, userId);

      res.json({
        success: true,
        message: 'Vous avez rejoint le groupe de covoiturage',
        data: groupe
      });
    } catch (error) {
      return next(AppError.serverError('Erreur serveur lors de l\'adhésion au groupe', { originalError: error.message }));
    }
  }

  /**
   * Quitter un groupe de covoiturage
   */
  async quitterGroupe(req, res) {
    try {
      const { id, groupeId } = req.params;
      const userId = req.user.id;

      const groupe = await this.evenementService.quitterGroupe(id, groupeId, userId);

      res.json({
        success: true,
        message: 'Vous avez quitté le groupe de covoiturage',
        data: groupe
      });
    } catch (error) {
      return next(AppError.serverError('Erreur serveur lors de la sortie du groupe', { originalError: error.message }));
    }
  }
}

module.exports = EvenementController;