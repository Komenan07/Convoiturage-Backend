// controllers/evenementController.js
const EvenementService = require('../services/evenementService');
const AppError = require('../utils/AppError');

class EvenementController {
  constructor() {
    // ============ BIND DES MÉTHODES EXISTANTES ============
    this.creerEvenementManuel = this.creerEvenementManuel.bind(this);
    this.importerEvenementsAPI = this.importerEvenementsAPI.bind(this);
    this.obtenirEvenementsAVenir = this.obtenirEvenementsAVenir.bind(this);
    this.rechercherParLocalisation = this.rechercherParLocalisation.bind(this);
    this.obtenirTrajetsAssocies = this.obtenirTrajetsAssocies.bind(this);
    this.modifierDetailsEvenement = this.modifierDetailsEvenement.bind(this);
    this.mettreAJourStatut = this.mettreAJourStatut.bind(this);
    this.creerGroupeCovoiturage = this.creerGroupeCovoiturage.bind(this);
    this.obtenirGroupesCovoiturage = this.obtenirGroupesCovoiturage.bind(this);
    this.modifierGroupeCovoiturage = this.modifierGroupeCovoiturage.bind(this);
    this.supprimerGroupeCovoiturage = this.supprimerGroupeCovoiturage.bind(this);
    this.rejoindreGroupeCovoiturage = this.rejoindreGroupeCovoiturage.bind(this);
    this.quitterGroupeCovoiturage = this.quitterGroupeCovoiturage.bind(this);
    this.annulerEvenement = this.annulerEvenement.bind(this);
    this.obtenirEvenement = this.obtenirEvenement.bind(this);
    this.obtenirTousEvenements = this.obtenirTousEvenements.bind(this);
    
    // ============ BIND DES NOUVELLES MÉTHODES ============
    this.lancerDetectionAutomatique = this.lancerDetectionAutomatique.bind(this);
    this.obtenirStatistiques = this.obtenirStatistiques.bind(this);
    this.obtenirRecommandations = this.obtenirRecommandations.bind(this);
    this.ajouterAuxFavoris = this.ajouterAuxFavoris.bind(this);
    this.retirerDesFavoris = this.retirerDesFavoris.bind(this);
    this.obtenirFavoris = this.obtenirFavoris.bind(this);
    this.obtenirEvenementsParQuartier = this.obtenirEvenementsParQuartier.bind(this);
    this.obtenirEvenementsPopulaires = this.obtenirEvenementsPopulaires.bind(this);
    this.verifierConflitsHoraire = this.verifierConflitsHoraire.bind(this);
    this.genererLienPartage = this.genererLienPartage.bind(this);
    this.envoyerRappelEvenement = this.envoyerRappelEvenement.bind(this);
    this.exporterEvenements = this.exporterEvenements.bind(this);
    this.nettoyerEvenementsPasses = this.nettoyerEvenementsPasses.bind(this);
    this.mettreAJourStatutsAuto = this.mettreAJourStatutsAuto.bind(this);
    this.validerCoherence = this.validerCoherence.bind(this);
    this.creerTrajetDepuisGroupe = this.creerTrajetDepuisGroupe.bind(this);
    this.proposerTrajetsAutomatiques = this.proposerTrajetsAutomatiques.bind(this);
  }

  // =============== CREATE OPERATIONS ===============

  /**
   * @swagger
   * /api/evenements/creer-manuel:
   *   post:
   *     summary: Créer un événement manuellement
   *     tags: [Événements - CREATE]
   */
  async creerEvenementManuel(req, res, next) {
    try {
      const donneesEvenement = {
        ...req.body,
        sourceDetection: 'MANUEL'
      };

      const champsRequis = ['nom', 'description', 'typeEvenement', 'dateDebut', 'dateFin', 'lieu'];
      for (const champ of champsRequis) {
        if (!donneesEvenement[champ]) {
          return res.status(400).json({
            success: false,
            message: `Le champ ${champ} est requis`
          });
        }
      }

      const evenement = await EvenementService.creerEvenement(donneesEvenement);

      res.status(201).json({
        success: true,
        message: 'Événement créé avec succès',
        data: evenement
      });
    } catch (error) {
      console.error('Erreur creerEvenementManuel:', error);
      if (error.name === 'ValidationError') {
        return res.status(400).json({
          success: false,
          message: 'Données invalides',
          errors: error.errors
        });
      }
      return next(AppError.serverError('Erreur lors de la création de l\'événement'));
    }
  }

  /**
   * @swagger
   * /api/evenements/import-api:
   *   post:
   *     summary: Importer des événements depuis une API externe
   *     tags: [Événements - CREATE]
   */
  async importerEvenementsAPI(req, res, next) {
    try {
      const { source, evenements } = req.body;

      if (!evenements || !Array.isArray(evenements)) {
        return res.status(400).json({
          success: false,
          message: 'La liste des événements est requise'
        });
      }

      const evenementsFormates = evenements.map(e => ({
        ...e,
        sourceDetection: 'API_EXTERNE',
        source: source
      }));

      const resultats = await EvenementService.creerEvenementsBatch(evenementsFormates);

      res.status(201).json({
        success: true,
        message: `${resultats.nouveaux} événements importés avec succès`,
        data: resultats
      });
    } catch (error) {
      console.error('Erreur importerEvenementsAPI:', error);
      return next(AppError.serverError('Erreur lors de l\'importation des événements'));
    }
  }

  /**
   * @swagger
   * /api/evenements/{id}/groupes-covoiturage:
   *   post:
   *     summary: Créer un groupe de covoiturage pour un événement
   *     tags: [Événements - CREATE]
   */
  async creerGroupeCovoiturage(req, res, next) {
    try {
      const { id } = req.params;
      const donneesGroupe = req.body;

      const groupe = await EvenementService.ajouterGroupeCovoiturage(id, donneesGroupe);

      res.status(201).json({
        success: true,
        message: 'Groupe de covoiturage créé avec succès',
        data: groupe
      });
    } catch (error) {
      console.error('Erreur creerGroupeCovoiturage:', error);
      if (error.message === 'Événement non trouvé') {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }
      return next(AppError.serverError('Erreur lors de la création du groupe de covoiturage'));
    }
  }

  // =============== READ OPERATIONS ===============

  /**
   * @swagger
   * /api/evenements/a-venir:
   *   get:
   *     summary: Obtenir les événements à venir
   *     tags: [Événements - READ]
   */
  async obtenirEvenementsAVenir(req, res, next) {
    try {
      const { limit = 20, ville } = req.query;
      
      const evenements = await EvenementService.obtenirEvenementsAVenir(
        parseInt(limit),
        ville
      );

      res.json({
        success: true,
        data: evenements,
        count: evenements.length
      });
    } catch (error) {
      console.error('Erreur obtenirEvenementsAVenir:', error);
      return next(AppError.serverError('Erreur lors de la récupération des événements à venir'));
    }
  }

  /**
   * @swagger
   * /api/evenements/recherche-localisation:
   *   get:
   *     summary: Rechercher des événements par localisation
   *     tags: [Événements - READ]
   */
  async rechercherParLocalisation(req, res, next) {
    try {
      const { longitude, latitude, rayon = 10 } = req.query;

      if (!longitude || !latitude) {
        return res.status(400).json({
          success: false,
          message: 'Longitude et latitude sont requises'
        });
      }

      const evenements = await EvenementService.rechercherParProximite(
        parseFloat(latitude),
        parseFloat(longitude),
        parseFloat(rayon)
      );

      res.json({
        success: true,
        data: evenements,
        criteres: {
          longitude: parseFloat(longitude),
          latitude: parseFloat(latitude),
          rayon: parseFloat(rayon)
        },
        count: evenements.length
      });
    } catch (error) {
      console.error('Erreur rechercherParLocalisation:', error);
      return next(AppError.serverError('Erreur lors de la recherche par localisation'));
    }
  }

  /**
   * @swagger
   * /api/evenements/{id}/trajets:
   *   get:
   *     summary: Obtenir les trajets associés à un événement
   *     tags: [Événements - READ]
   */
  async obtenirTrajetsAssocies(req, res, next) {
    try {
      const { id } = req.params;

      const evenement = await EvenementService.obtenirEvenementParId(id);

      if (!evenement) {
        return res.status(404).json({
          success: false,
          message: 'Événement non trouvé'
        });
      }

      res.json({
        success: true,
        data: {
          evenement: evenement.nom,
          trajets: evenement.trajetsAssocies
        },
        count: evenement.trajetsAssocies?.length || 0
      });
    } catch (error) {
      console.error('Erreur obtenirTrajetsAssocies:', error);
      return next(AppError.serverError('Erreur lors de la récupération des trajets'));
    }
  }

  /**
   * @swagger
   * /api/evenements/{id}:
   *   get:
   *     summary: Obtenir un événement par ID
   *     tags: [Événements - READ]
   */
  async obtenirEvenement(req, res, next) {
    try {
      const { id } = req.params;

      const evenement = await EvenementService.obtenirEvenementParId(id);

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
      console.error('Erreur obtenirEvenement:', error);
      return next(AppError.serverError('Erreur lors de la récupération de l\'événement'));
    }
  }

  /**
   * @swagger
   * /api/evenements:
   *   get:
   *     summary: Obtenir tous les événements avec filtres et pagination
   *     tags: [Événements - READ]
   */
  async obtenirTousEvenements(req, res, next) {
    try {
      const criteres = await EvenementService.construireCriteresRecherche(req.query);
      
      const options = {
        page: parseInt(req.query.page) || 1,
        limit: parseInt(req.query.limit) || 10,
        sort: { dateDebut: -1 },
        populate: ['trajetsAssocies']
      };

      const resultats = await EvenementService.obtenirEvenements(criteres, options);

      res.json({
        success: true,
        data: resultats.evenements,
        pagination: {
          page: resultats.page,
          limit: resultats.limit,
          total: resultats.total,
          pages: resultats.pages
        }
      });
    } catch (error) {
      console.error('Erreur obtenirTousEvenements:', error);
      return next(AppError.serverError('Erreur lors de la récupération des événements'));
    }
  }

  /**
   * @swagger
   * /api/evenements/{id}/groupes-covoiturage:
   *   get:
   *     summary: Obtenir les groupes de covoiturage d'un événement
   *     tags: [Événements - READ]
   */
  async obtenirGroupesCovoiturage(req, res, next) {
    try {
      const { id } = req.params;

      const groupes = await EvenementService.obtenirGroupesCovoiturage(id);
      
      const evenement = await EvenementService.obtenirEvenementParId(id);

      res.json({
        success: true,
        data: {
          evenement: evenement?.nom,
          groupes: groupes
        },
        count: groupes.length
      });
    } catch (error) {
      console.error('Erreur obtenirGroupesCovoiturage:', error);
      if (error.message === 'Événement non trouvé') {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }
      return next(AppError.serverError('Erreur lors de la récupération des groupes'));
    }
  }

  // =============== UPDATE OPERATIONS ===============

  /**
   * @swagger
   * /api/evenements/{id}:
   *   put:
   *     summary: Modifier les détails d'un événement
   *     tags: [Événements - UPDATE]
   */
  async modifierDetailsEvenement(req, res, next) {
    try {
      const { id } = req.params;
      const donneesMAJ = req.body;

      const evenement = await EvenementService.mettreAJourEvenement(id, donneesMAJ);

      if (!evenement) {
        return res.status(404).json({
          success: false,
          message: 'Événement non trouvé'
        });
      }

      res.json({
        success: true,
        message: 'Événement modifié avec succès',
        data: evenement
      });
    } catch (error) {
      console.error('Erreur modifierDetailsEvenement:', error);
      return next(AppError.serverError('Erreur lors de la modification de l\'événement'));
    }
  }

  /**
   * @swagger
   * /api/evenements/{id}/statut:
   *   patch:
   *     summary: Mettre à jour le statut d'un événement
   *     tags: [Événements - UPDATE]
   */
  async mettreAJourStatut(req, res, next) {
    try {
      const { id } = req.params;
      const { statut, motif } = req.body;

      const statutsValides = ['PROGRAMME', 'EN_COURS', 'TERMINE', 'ANNULE'];
      if (!statutsValides.includes(statut)) {
        return res.status(400).json({
          success: false,
          message: 'Statut invalide',
          statuts_valides: statutsValides
        });
      }

      const evenement = await EvenementService.changerStatut(
        id,
        statut,
        req.user?.id,
        motif
      );

      res.json({
        success: true,
        message: `Statut de l'événement changé en ${statut}`,
        data: evenement
      });
    } catch (error) {
      console.error('Erreur mettreAJourStatut:', error);
      if (error.message === 'Événement non trouvé') {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }
      return next(AppError.serverError('Erreur lors de la mise à jour du statut'));
    }
  }

  /**
   * @swagger
   * /api/evenements/{id}/groupes-covoiturage/{groupeId}:
   *   put:
   *     summary: Modifier un groupe de covoiturage
   *     tags: [Événements - UPDATE]
   */
  async modifierGroupeCovoiturage(req, res, next) {
    try {
      const { id, groupeId } = req.params;
      const donneesMAJ = req.body;

      const groupe = await EvenementService.modifierGroupeCovoiturage(
        id,
        groupeId,
        donneesMAJ
      );

      res.json({
        success: true,
        message: 'Groupe de covoiturage modifié avec succès',
        data: groupe
      });
    } catch (error) {
      console.error('Erreur modifierGroupeCovoiturage:', error);
      if (error.message.includes('non trouvé')) {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }
      return next(AppError.serverError('Erreur lors de la modification du groupe'));
    }
  }

  /**
   * @swagger
   * /api/evenements/{id}/groupes-covoiturage/{groupeId}/rejoindre:
   *   post:
   *     summary: Rejoindre un groupe de covoiturage
   *     tags: [Événements - UPDATE]
   */
  async rejoindreGroupeCovoiturage(req, res, next) {
    try {
      const { id, groupeId } = req.params;
      const userId = req.user.id;

      // Vérifier les conflits d'horaire
      const conflits = await EvenementService.verifierConflitsHoraire(userId, id);
      
      if (conflits.aDesConflits) {
        return res.status(409).json({
          success: false,
          message: 'Vous avez un conflit d\'horaire avec un autre événement',
          conflits: conflits.conflits
        });
      }

      const groupe = await EvenementService.rejoindreGroupe(id, groupeId, userId);

      res.json({
        success: true,
        message: 'Vous avez rejoint le groupe de covoiturage avec succès',
        data: groupe
      });
    } catch (error) {
      console.error('Erreur rejoindreGroupeCovoiturage:', error);
      
      if (error.message.includes('non trouvé')) {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }
      
      if (error.message.includes('déjà membre') || error.message.includes('complet')) {
        return res.status(400).json({
          success: false,
          message: error.message
        });
      }
      
      return next(AppError.serverError('Erreur lors de l\'adhésion au groupe'));
    }
  }

  /**
   * @swagger
   * /api/evenements/{id}/groupes-covoiturage/{groupeId}/quitter:
   *   delete:
   *     summary: Quitter un groupe de covoiturage
   *     tags: [Événements - UPDATE]
   */
  async quitterGroupeCovoiturage(req, res, next) {
    try {
      const { id, groupeId } = req.params;
      const userId = req.user.id;

      const groupe = await EvenementService.quitterGroupe(id, groupeId, userId);

      res.json({
        success: true,
        message: 'Vous avez quitté le groupe de covoiturage avec succès',
        data: groupe
      });
    } catch (error) {
      console.error('Erreur quitterGroupeCovoiturage:', error);
      
      if (error.message.includes('non trouvé')) {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }
      
      if (error.message.includes('pas membre')) {
        return res.status(400).json({
          success: false,
          message: error.message
        });
      }
      
      return next(AppError.serverError('Erreur lors de la sortie du groupe'));
    }
  }

  // =============== DELETE OPERATIONS ===============

  /**
   * @swagger
   * /api/evenements/{id}/annuler:
   *   patch:
   *     summary: Annuler un événement
   *     tags: [Événements - DELETE]
   */
  async annulerEvenement(req, res, next) {
    try {
      const { id } = req.params;
      const { motifAnnulation } = req.body;

      const evenement = await EvenementService.changerStatut(
        id,
        'ANNULE',
        req.user?.id,
        motifAnnulation
      );

      res.json({
        success: true,
        message: 'Événement annulé avec succès',
        data: {
          id: evenement._id,
          nom: evenement.nom,
          statut: evenement.statutEvenement,
          motifAnnulation: evenement.motifAnnulation,
          dateAnnulation: evenement.dateAnnulation
        }
      });
    } catch (error) {
      console.error('Erreur annulerEvenement:', error);
      if (error.message === 'Événement non trouvé') {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }
      return next(AppError.serverError('Erreur lors de l\'annulation de l\'événement'));
    }
  }

  /**
   * @swagger
   * /api/evenements/{id}/groupes-covoiturage/{groupeId}:
   *   delete:
   *     summary: Supprimer un groupe de covoiturage
   *     tags: [Événements - DELETE]
   */
  async supprimerGroupeCovoiturage(req, res, next) {
    try {
      const { id, groupeId } = req.params;

      const resultat = await EvenementService.supprimerGroupeCovoiturage(
        id,
        groupeId,
        req.user?.id
      );

      res.json({
        success: true,
        message: 'Groupe de covoiturage supprimé avec succès',
        data: resultat
      });
    } catch (error) {
      console.error('Erreur supprimerGroupeCovoiturage:', error);
      
      if (error.message.includes('non trouvé')) {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }
      
      if (error.message.includes('Non autorisé')) {
        return res.status(403).json({
          success: false,
          message: error.message
        });
      }
      
      return next(AppError.serverError('Erreur lors de la suppression du groupe'));
    }
  }

  // =============== NOUVELLES FONCTIONNALITÉS ===============

  /**
   * @swagger
   * /api/evenements/admin/detecter-automatique:
   *   post:
   *     summary: Lancer la détection automatique d'événements (ADMIN)
   *     tags: [Événements - ADMIN]
   */
  async lancerDetectionAutomatique(req, res, next) {
    try {
      const evenementAutoDetectionService = require('../services/evenementAutoDetectionService');
      
      const resultats = await evenementAutoDetectionService.detecterEtImporterEvenements();
      
      res.json({
        success: true,
        message: 'Détection automatique terminée',
        data: resultats
      });
    } catch (error) {
      console.error('Erreur lancerDetectionAutomatique:', error);
      return next(AppError.serverError('Erreur lors de la détection automatique'));
    }
  }

  /**
   * @swagger
   * /api/evenements/statistiques:
   *   get:
   *     summary: Obtenir les statistiques des événements
   *     tags: [Événements - STATS]
   */
  async obtenirStatistiques(req, res, next) {
    try {
      const { periode = '30d', ville } = req.query;
      
      const stats = await EvenementService.obtenirStatistiques(periode, ville);
      
      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Erreur obtenirStatistiques:', error);
      return next(AppError.serverError('Erreur lors de la récupération des statistiques'));
    }
  }

  /**
   * @swagger
   * /api/evenements/recommandations:
   *   get:
   *     summary: Obtenir des recommandations personnalisées
   *     tags: [Événements - READ]
   */
  async obtenirRecommandations(req, res, next) {
    try {
      const userId = req.user.id;
      const { limit = 10 } = req.query;
      
      const recommandations = await EvenementService.recommanderEvenements(
        userId,
        parseInt(limit)
      );
      
      res.json({
        success: true,
        data: recommandations
      });
    } catch (error) {
      console.error('Erreur obtenirRecommandations:', error);
      return next(AppError.serverError('Erreur lors de la récupération des recommandations'));
    }
  }

  /**
   * @swagger
   * /api/evenements/{id}/favoris:
   *   post:
   *     summary: Ajouter un événement aux favoris
   *     tags: [Événements - FAVORIS]
   */
  async ajouterAuxFavoris(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      
      const resultat = await EvenementService.ajouterAuxFavoris(id, userId);
      
      res.json({
        success: true,
        message: 'Événement ajouté aux favoris',
        data: resultat
      });
    } catch (error) {
      console.error('Erreur ajouterAuxFavoris:', error);
      return next(AppError.serverError('Erreur lors de l\'ajout aux favoris'));
    }
  }

  /**
   * @swagger
   * /api/evenements/{id}/favoris:
   *   delete:
   *     summary: Retirer un événement des favoris
   *     tags: [Événements - FAVORIS]
   */
  async retirerDesFavoris(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      
      const resultat = await EvenementService.retirerDesFavoris(id, userId);
      
      res.json({
        success: true,
        message: 'Événement retiré des favoris',
        data: resultat
      });
    } catch (error) {
      console.error('Erreur retirerDesFavoris:', error);
      return next(AppError.serverError('Erreur lors du retrait des favoris'));
    }
  }

  /**
   * @swagger
   * /api/evenements/favoris:
   *   get:
   *     summary: Obtenir les événements favoris
   *     tags: [Événements - FAVORIS]
   */
  async obtenirFavoris(req, res, next) {
    try {
      const userId = req.user.id;
      
      const favoris = await EvenementService.obtenirFavoris(userId);
      
      res.json({
        success: true,
        data: favoris,
        count: favoris.length
      });
    } catch (error) {
      console.error('Erreur obtenirFavoris:', error);
      return next(AppError.serverError('Erreur lors de la récupération des favoris'));
    }
  }

  /**
   * @swagger
   * /api/evenements/quartier/{commune}:
   *   get:
   *     summary: Obtenir les événements par quartier d'Abidjan
   *     tags: [Événements - READ]
   */
  async obtenirEvenementsParQuartier(req, res, next) {
    try {
      const { commune } = req.params;
      const { quartier } = req.query;
      
      const evenements = await EvenementService.obtenirEvenementsParQuartier(
        commune.toUpperCase(),
        quartier
      );
      
      res.json({
        success: true,
        data: evenements,
        count: evenements.length,
        commune: commune.toUpperCase(),
        quartier: quartier || 'Tous'
      });
    } catch (error) {
      console.error('Erreur obtenirEvenementsParQuartier:', error);
      return next(AppError.serverError('Erreur lors de la récupération des événements par quartier'));
    }
  }

  /**
   * @swagger
   * /api/evenements/populaires:
   *   get:
   *     summary: Obtenir les événements populaires
   *     tags: [Événements - READ]
   */
  async obtenirEvenementsPopulaires(req, res, next) {
    try {
      const { limit = 10, ville } = req.query;
      
      const evenements = await EvenementService.obtenirEvenementsPopulaires(
        parseInt(limit),
        ville
      );
      
      res.json({
        success: true,
        data: evenements,
        count: evenements.length
      });
    } catch (error) {
      console.error('Erreur obtenirEvenementsPopulaires:', error);
      return next(AppError.serverError('Erreur lors de la récupération des événements populaires'));
    }
  }

  /**
   * @swagger
   * /api/evenements/{id}/conflits-horaire:
   *   get:
   *     summary: Vérifier les conflits d'horaire pour un utilisateur
   *     tags: [Événements - READ]
   */
  async verifierConflitsHoraire(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.id;
      
      const conflits = await EvenementService.verifierConflitsHoraire(userId, id);
      
      res.json({
        success: true,
        data: conflits
      });
    } catch (error) {
      console.error('Erreur verifierConflitsHoraire:', error);
      return next(AppError.serverError('Erreur lors de la vérification des conflits'));
    }
  }

  /**
   * @swagger
   * /api/evenements/{id}/partage:
   *   get:
   *     summary: Générer les liens de partage
   *     tags: [Événements - SOCIAL]
   */
  async genererLienPartage(req, res, next) {
    try {
      const { id } = req.params;
      
      const liens = await EvenementService.genererLienPartage(id);
      
      res.json({
        success: true,
        data: liens
      });
    } catch (error) {
      console.error('Erreur genererLienPartage:', error);
      return next(AppError.serverError('Erreur lors de la génération des liens de partage'));
    }
  }

  /**
   * @swagger
   * /api/evenements/{id}/rappel:
   *   post:
   *     summary: Envoyer un rappel pour un événement
   *     tags: [Événements - NOTIFICATIONS]
   */
  async envoyerRappelEvenement(req, res, next) {
    try {
      const { id } = req.params;
      
      const resultat = await EvenementService.envoyerRappelsEvenement(id);
      
      res.json({
        success: true,
        message: 'Rappels envoyés avec succès',
        data: resultat
      });
    } catch (error) {
      console.error('Erreur envoyerRappelEvenement:', error);
      return next(AppError.serverError('Erreur lors de l\'envoi des rappels'));
    }
  }

  /**
   * @swagger
   * /api/evenements/export:
   *   get:
   *     summary: Exporter les événements (CSV ou JSON)
   *     tags: [Événements - EXPORT]
   */
  async exporterEvenements(req, res, next) {
    try {
      const { format = 'csv' } = req.query;
      const criteres = await EvenementService.construireCriteresRecherche(req.query);
      
      const evenements = await EvenementService.exporterEvenements(criteres);
      
      if (format === 'csv') {
        const csv = await EvenementService.convertirEnCSV(evenements);
        
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=evenements.csv');
        res.send(csv);
      } else if (format === 'json') {
        const json = await EvenementService.convertirEnJSON(evenements);
        
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', 'attachment; filename=evenements.json');
        res.send(json);
      } else {
        return res.status(400).json({
          success: false,
          message: 'Format non supporté. Utilisez csv ou json'
        });
      }
    } catch (error) {
      console.error('Erreur exporterEvenements:', error);
      return next(AppError.serverError('Erreur lors de l\'export des événements'));
    }
  }

  /**
   * @swagger
   * /api/evenements/admin/nettoyer-passes:
   *   delete:
   *     summary: Nettoyer les événements passés (ADMIN)
   *     tags: [Événements - ADMIN]
   */
  async nettoyerEvenementsPasses(req, res, next) {
    try {
      const { joursAvantSuppression = 30 } = req.query;
      
      const resultat = await EvenementService.nettoyerEvenementsPasses(
        parseInt(joursAvantSuppression)
      );
      
      res.json({
        success: true,
        message: 'Nettoyage effectué',
        data: resultat
      });
    } catch (error) {
      console.error('Erreur nettoyerEvenementsPasses:', error);
      return next(AppError.serverError('Erreur lors du nettoyage'));
    }
  }

  /**
   * @swagger
   * /api/evenements/admin/maj-statuts-auto:
   *   patch:
   *     summary: Mettre à jour automatiquement les statuts (ADMIN)
   *     tags: [Événements - ADMIN]
   */
  async mettreAJourStatutsAuto(req, res, next) {
    try {
      const resultat = await EvenementService.mettreAJourStatutsAutomatiques();
      
      res.json({
        success: true,
        message: 'Statuts mis à jour automatiquement',
        data: resultat
      });
    } catch (error) {
      console.error('Erreur mettreAJourStatutsAuto:', error);
      return next(AppError.serverError('Erreur lors de la mise à jour des statuts'));
    }
  }

  /**
   * @swagger
   * /api/evenements/{id}/valider:
   *   get:
   *     summary: Valider la cohérence d'un événement
   *     tags: [Événements - ADMIN]
   */
  async validerCoherence(req, res, next) {
    try {
      const { id } = req.params;
      
      const validation = await EvenementService.validerCoherence(id);
      
      res.json({
        success: true,
        data: validation
      });
    } catch (error) {
      console.error('Erreur validerCoherence:', error);
      return next(AppError.serverError('Erreur lors de la validation'));
    }
  }

  /**
   * @swagger
   * /api/evenements/{id}/groupes-covoiturage/{groupeId}/creer-trajet:
   *   post:
   *     summary: Créer automatiquement un trajet depuis un groupe
   *     tags: [Événements - TRAJETS]
   */
  async creerTrajetDepuisGroupe(req, res, next) {
    try {
      const { id, groupeId } = req.params;
      const donneesTrajet = req.body;
      
      const trajet = await EvenementService.creerTrajetDepuisGroupe(
        id,
        groupeId,
        donneesTrajet
      );
      
      res.status(201).json({
        success: true,
        message: 'Trajet créé automatiquement depuis le groupe',
        data: trajet
      });
    } catch (error) {
      console.error('Erreur creerTrajetDepuisGroupe:', error);
      return next(AppError.serverError('Erreur lors de la création du trajet'));
    }
  }

  /**
   * @swagger
   * /api/evenements/{id}/trajets-proposes:
   *   get:
   *     summary: Proposer des trajets automatiques pour un événement
   *     tags: [Événements - TRAJETS]
   */
  async proposerTrajetsAutomatiques(req, res, next) {
    try {
      const { id } = req.params;
      const { latitude, longitude } = req.query;
      
      const origineUtilisateur = latitude && longitude ? {
        latitude: parseFloat(latitude),
        longitude: parseFloat(longitude)
      } : null;
      
      const trajets = await EvenementService.proposerTrajetsAutomatiques(
        id,
        origineUtilisateur
      );
      
      res.json({
        success: true,
        data: trajets,
        count: trajets.length
      });
    } catch (error) {
      console.error('Erreur proposerTrajetsAutomatiques:', error);
      return next(AppError.serverError('Erreur lors de la proposition de trajets'));
    }
  }
}

module.exports = EvenementController;