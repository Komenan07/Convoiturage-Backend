const Evenement = require('../models/Evenement');
const AppError = require('../utils/AppError');

class EvenementController {
  constructor() {
    // Bind des méthodes pour conserver le contexte
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
  }

  // =============== CREATE OPERATIONS ===============

  /**
   * @swagger
   * /api/evenements/creer-manuel:
   *   post:
   *     summary: Créer un événement manuellement
   *     tags: [Événements - CREATE]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - nom
   *               - description
   *               - typeEvenement
   *               - dateDebut
   *               - dateFin
   *               - lieu
   *             properties:
   *               nom:
   *                 type: string
   *                 maxLength: 200
   *                 example: "Championnat de Football Local"
   *               description:
   *                 type: string
   *                 maxLength: 2000
   *                 example: "Tournoi de football organisé dans le quartier"
   *               typeEvenement:
   *                 type: string
   *                 enum: [SPORT, CONCERT, FESTIVAL, CONFERENCE]
   *                 example: "SPORT"
   *               dateDebut:
   *                 type: string
   *                 format: date-time
   *                 example: "2025-09-15T14:00:00.000Z"
   *               dateFin:
   *                 type: string
   *                 format: date-time
   *                 example: "2025-09-15T18:00:00.000Z"
   *               lieu:
   *                 type: object
   *                 required: [nom, adresse, ville, coordonnees]
   *                 properties:
   *                   nom:
   *                     type: string
   *                     example: "Stade Municipal"
   *                   adresse:
   *                     type: string
   *                     example: "Rue des Sports, Cocody"
   *                   ville:
   *                     type: string
   *                     example: "Abidjan"
   *                   coordonnees:
   *                     type: object
   *                     properties:
   *                       type:
   *                         type: string
   *                         enum: [Point]
   *                         example: "Point"
   *                       coordinates:
   *                         type: array
   *                         items:
   *                           type: number
   *                         example: [-3.9615917, 5.3599517]
   *               capaciteEstimee:
   *                 type: number
   *                 minimum: 1
   *                 maximum: 1000000
   *                 example: 200
   *               tags:
   *                 type: array
   *                 items:
   *                   type: string
   *                 example: ["football", "sport", "tournoi"]
   *     responses:
   *       201:
   *         description: Événement créé avec succès
   *       400:
   *         description: Données invalides
   *       401:
   *         description: Non authentifié
   */
  async creerEvenementManuel(req, res, next) {
    try {
      const donneesEvenement = {
        ...req.body,
        sourceDetection: 'MANUEL'
      };

      // Validation des données requises
      const champsRequis = ['nom', 'description', 'typeEvenement', 'dateDebut', 'dateFin', 'lieu'];
      for (const champ of champsRequis) {
        if (!donneesEvenement[champ]) {
          return res.status(400).json({
            success: false,
            message: `Le champ ${champ} est requis`
          });
        }
      }

      const nouvelEvenement = new Evenement(donneesEvenement);
      const evenement = await nouvelEvenement.save();

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
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               source:
   *                 type: string
   *                 example: "eventbrite"
   *               evenements:
   *                 type: array
   *                 items:
   *                   type: object
   *     responses:
   *       201:
   *         description: Événements importés avec succès
   *       400:
   *         description: Erreur d'importation
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

      const evenementsImportes = [];
      const erreurs = [];

      for (const eventData of evenements) {
        try {
          const evenement = new Evenement({
            ...eventData,
            sourceDetection: 'API_EXTERNE',
            source: source
          });
          
          const evenementSauvegarde = await evenement.save();
          evenementsImportes.push(evenementSauvegarde);
        } catch (error) {
          erreurs.push({
            evenement: eventData.nom || 'Nom inconnu',
            erreur: error.message
          });
        }
      }

      res.status(201).json({
        success: true,
        message: `${evenementsImportes.length} événements importés avec succès`,
        data: {
          evenements_importes: evenementsImportes,
          erreurs: erreurs,
          total_importe: evenementsImportes.length,
          total_erreurs: erreurs.length
        }
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
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: ID de l'événement
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - nom
   *               - heureDepart
   *             properties:
   *               nom:
   *                 type: string
   *                 maxLength: 100
   *                 example: "Covoiturage Yopougon → Cocody"
   *               description:
   *                 type: string
   *                 maxLength: 500
   *                 example: "Départ de Yopougon vers le stade"
   *               tarifPrefere:
   *                 type: number
   *                 minimum: 0
   *                 example: 2000
   *               heureDepart:
   *                 type: string
   *                 pattern: '^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$'
   *                 example: "13:30"
   *     responses:
   *       201:
   *         description: Groupe de covoiturage créé avec succès
   *       404:
   *         description: Événement non trouvé
   */
  async creerGroupeCovoiturage(req, res, next) {
    try {
      const { id } = req.params;
      const donneesGroupe = req.body;

      const evenement = await Evenement.findById(id);
      if (!evenement) {
        return res.status(404).json({
          success: false,
          message: 'Événement non trouvé'
        });
      }

      const groupe = await evenement.ajouterGroupeCovoiturage(donneesGroupe);

      res.status(201).json({
        success: true,
        message: 'Groupe de covoiturage créé avec succès',
        data: groupe.groupesCovoiturage[groupe.groupesCovoiturage.length - 1]
      });
    } catch (error) {
      console.error('Erreur creerGroupeCovoiturage:', error);
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
   *     parameters:
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           default: 20
   *         description: Nombre maximum d'événements à retourner
   *       - in: query
   *         name: ville
   *         schema:
   *           type: string
   *         description: Filtrer par ville
   *     responses:
   *       200:
   *         description: Liste des événements à venir
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 success:
   *                   type: boolean
   *                 data:
   *                   type: array
   *                   items:
   *                     $ref: '#/components/schemas/Evenement'
   */
  async obtenirEvenementsAVenir(req, res, next) {
    try {
      const { limit = 20, ville } = req.query;
      
      let query = Evenement.find({
        dateDebut: { $gte: new Date() },
        statutEvenement: { $in: ['PROGRAMME' , 'EN_COURS'] }
      })
      .sort({ dateDebut: 1 })
      .limit(parseInt(limit))
      .populate('trajetsAssocies');

      if (ville) {
        query = query.where('lieu.ville').regex(new RegExp(ville, 'i'));
      }

      const evenements = await query.exec();

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
   *     parameters:
   *       - in: query
   *         name: longitude
   *         required: true
   *         schema:
   *           type: number
   *         description: Longitude du point de recherche
   *       - in: query
   *         name: latitude
   *         required: true
   *         schema:
   *           type: number
   *         description: Latitude du point de recherche
   *       - in: query
   *         name: rayon
   *         schema:
   *           type: number
   *           default: 10
   *         description: Rayon de recherche en kilomètres
   *     responses:
   *       200:
   *         description: Événements trouvés par localisation
   *       400:
   *         description: Paramètres de localisation invalides
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

      const evenements = await Evenement.rechercherParProximite(
        parseFloat(longitude),
        parseFloat(latitude),
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
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: ID de l'événement
   *     responses:
   *       200:
   *         description: Trajets associés à l'événement
   *       404:
   *         description: Événement non trouvé
   */
  async obtenirTrajetsAssocies(req, res, next) {
    try {
      const { id } = req.params;

      const evenement = await Evenement.findById(id)
        .populate('trajetsAssocies')
        .select('trajetsAssocies nom');

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
        count: evenement.trajetsAssocies.length
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
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: ID de l'événement
   *     responses:
   *       200:
   *         description: Détails de l'événement
   *       404:
   *         description: Événement non trouvé
   */
  async obtenirEvenement(req, res, next) {
    try {
      const { id } = req.params;

      const evenement = await Evenement.findById(id)
        .populate('trajetsAssocies')
        .populate('groupesCovoiturage.membres', 'prenom nom');

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
   *     summary: Obtenir tous les événements avec filtres
   *     tags: [Événements - READ]
   *     parameters:
   *       - in: query
   *         name: page
   *         schema:
   *           type: integer
   *           default: 1
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           default: 10
   *       - in: query
   *         name: typeEvenement
   *         schema:
   *           type: string
   *           enum: [SPORT, CONCERT, FESTIVAL, CONFERENCE]
   *       - in: query
   *         name: ville
   *         schema:
   *           type: string
   *       - in: query
   *         name: statut
   *         schema:
   *           type: string
   *           enum: [PROGRAMME, EN_COURS, TERMINE, ANNULE]
   *     responses:
   *       200:
   *         description: Liste paginée des événements
   */
  async obtenirTousEvenements(req, res, next) {
    try {
      const {
        page = 1,
        limit = 10,
        typeEvenement,
        ville,
        statut,
        dateDebut,
        dateFin,
        motsCles
      } = req.query;

      let query = {};

      if (typeEvenement) query.typeEvenement = typeEvenement;
      if (ville) query['lieu.ville'] = new RegExp(ville, 'i');
      if (statut) query.statutEvenement = statut;

      if (dateDebut || dateFin) {
        query.dateDebut = {};
        if (dateDebut) query.dateDebut.$gte = new Date(dateDebut);
        if (dateFin) query.dateDebut.$lte = new Date(dateFin);
      }

      if (motsCles) {
        query.$or = [
          { nom: new RegExp(motsCles, 'i') },
          { description: new RegExp(motsCles, 'i') },
          { tags: new RegExp(motsCles, 'i') }
        ];
      }

      const skip = (parseInt(page) - 1) * parseInt(limit);
      const total = await Evenement.countDocuments(query);

      const evenements = await Evenement.find(query)
        .sort({ dateDebut: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .populate('trajetsAssocies', 'origine destination');

      res.json({
        success: true,
        data: evenements,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
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
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: ID de l'événement
   *     responses:
   *       200:
   *         description: Liste des groupes de covoiturage
   *       404:
   *         description: Événement non trouvé
   */
  async obtenirGroupesCovoiturage(req, res, next) {
    try {
      const { id } = req.params;

      const evenement = await Evenement.findById(id)
        .populate('groupesCovoiturage.membres', 'prenom nom')
        .select('groupesCovoiturage nom');

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
          groupes: evenement.groupesCovoiturage
        },
        count: evenement.groupesCovoiturage.length
      });
    } catch (error) {
      console.error('Erreur obtenirGroupesCovoiturage:', error);
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
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: ID de l'événement
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               nom:
   *                 type: string
   *               description:
   *                 type: string
   *               capaciteEstimee:
   *                 type: number
   *               tags:
   *                 type: array
   *                 items:
   *                   type: string
   *     responses:
   *       200:
   *         description: Événement modifié avec succès
   *       404:
   *         description: Événement non trouvé
   */
  async modifierDetailsEvenement(req, res, next) {
    try {
      const { id } = req.params;
      const donneesMAJ = req.body;

      const evenement = await Evenement.findByIdAndUpdate(
        id,
        donneesMAJ,
        { new: true, runValidators: true }
      );

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
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: ID de l'événement
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - statut
   *             properties:
   *               statut:
   *                 type: string
   *                 enum: [PROGRAMME, EN_COURS, TERMINE, ANNULE]
   *               motif:
   *                 type: string
   *                 description: Raison du changement de statut
   *     responses:
   *       200:
   *         description: Statut mis à jour avec succès
   *       400:
   *         description: Statut invalide
   *       404:
   *         description: Événement non trouvé
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

      const evenement = await Evenement.findByIdAndUpdate(
        id,
        { 
          statutEvenement: statut,
          ...(motif && { motifChangementStatut: motif })
        },
        { new: true }
      );

      if (!evenement) {
        return res.status(404).json({
          success: false,
          message: 'Événement non trouvé'
        });
      }

      res.json({
        success: true,
        message: `Statut de l'événement changé en ${statut}`,
        data: evenement
      });
    } catch (error) {
      console.error('Erreur mettreAJourStatut:', error);
      return next(AppError.serverError('Erreur lors de la mise à jour du statut'));
    }
  }

  /**
   * @swagger
   * /api/evenements/{id}/groupes-covoiturage/{groupeId}:
   *   put:
   *     summary: Modifier un groupe de covoiturage
   *     tags: [Événements - UPDATE]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: ID de l'événement
   *       - in: path
   *         name: groupeId
   *         required: true
   *         schema:
   *           type: string
   *         description: ID du groupe de covoiturage
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               nom:
   *                 type: string
   *               description:
   *                 type: string
   *               tarifPrefere:
   *                 type: number
   *               heureDepart:
   *                 type: string
   *     responses:
   *       200:
   *         description: Groupe modifié avec succès
   *       404:
   *         description: Événement ou groupe non trouvé
   */
  async modifierGroupeCovoiturage(req, res, next) {
    try {
      const { id, groupeId } = req.params;
      const donneesMAJ = req.body;

      const evenement = await Evenement.findOneAndUpdate(
        { _id: id, "groupesCovoiturage._id": groupeId },
        { 
          $set: {
            "groupesCovoiturage.$.nom": donneesMAJ.nom,
            "groupesCovoiturage.$.description": donneesMAJ.description,
            "groupesCovoiturage.$.tarifPrefere": donneesMAJ.tarifPrefere,
            "groupesCovoiturage.$.heureDepart": donneesMAJ.heureDepart
          }
        },
        { new: true }
      );

      if (!evenement) {
        return res.status(404).json({
          success: false,
          message: 'Événement ou groupe non trouvé'
        });
      }

      const groupeModifie = evenement.groupesCovoiturage.id(groupeId);

      res.json({
        success: true,
        message: 'Groupe de covoiturage modifié avec succès',
        data: groupeModifie
      });
    } catch (error) {
      console.error('Erreur modifierGroupeCovoiturage:', error);
      return next(AppError.serverError('Erreur lors de la modification du groupe'));
    }
  }

  /**
   * @swagger
   * /api/evenements/{id}/groupes-covoiturage/{groupeId}/rejoindre:
   *   post:
   *     summary: Rejoindre un groupe de covoiturage
   *     tags: [Événements - UPDATE]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: ID de l'événement
   *       - in: path
   *         name: groupeId
   *         required: true
   *         schema:
   *           type: string
   *         description: ID du groupe de covoiturage
   *     responses:
   *       200:
   *         description: Utilisateur ajouté au groupe avec succès
   *       404:
   *         description: Événement ou groupe non trouvé
   *       400:
   *         description: L'utilisateur est déjà dans le groupe
   */
  async rejoindreGroupeCovoiturage(req, res, next) {
    try {
      const { id, groupeId } = req.params;
      const userId = req.user.id;

      const evenement = await Evenement.findById(id);
      if (!evenement) {
        return res.status(404).json({
          success: false,
          message: 'Événement non trouvé'
        });
      }

      const groupe = evenement.groupesCovoiturage.id(groupeId);
      if (!groupe) {
        return res.status(404).json({
          success: false,
          message: 'Groupe de covoiturage non trouvé'
        });
      }

      // Vérifier si l'utilisateur est déjà membre
      if (groupe.membres.includes(userId)) {
        return res.status(400).json({
          success: false,
          message: 'Vous êtes déjà membre de ce groupe'
        });
      }

      groupe.membres.push(userId);
      await evenement.save();

      res.json({
        success: true,
        message: 'Vous avez rejoint le groupe de covoiturage avec succès',
        data: groupe
      });
    } catch (error) {
      console.error('Erreur rejoindreGroupeCovoiturage:', error);
      return next(AppError.serverError('Erreur lors de l\'adhésion au groupe'));
    }
  }

  /**
   * @swagger
   * /api/evenements/{id}/groupes-covoiturage/{groupeId}/quitter:
   *   delete:
   *     summary: Quitter un groupe de covoiturage
   *     tags: [Événements - UPDATE]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: ID de l'événement
   *       - in: path
   *         name: groupeId
   *         required: true
   *         schema:
   *           type: string
   *         description: ID du groupe de covoiturage
   *     responses:
   *       200:
   *         description: Utilisateur retiré du groupe avec succès
   *       404:
   *         description: Événement ou groupe non trouvé
   *       400:
   *         description: L'utilisateur n'est pas membre du groupe
   */
  async quitterGroupeCovoiturage(req, res, next) {
    try {
      const { id, groupeId } = req.params;
      const userId = req.user.id;

      const evenement = await Evenement.findById(id);
      if (!evenement) {
        return res.status(404).json({
          success: false,
          message: 'Événement non trouvé'
        });
      }

      const groupe = evenement.groupesCovoiturage.id(groupeId);
      if (!groupe) {
        return res.status(404).json({
          success: false,
          message: 'Groupe de covoiturage non trouvé'
        });
      }

      // Vérifier si l'utilisateur est membre
      if (!groupe.membres.includes(userId)) {
        return res.status(400).json({
          success: false,
          message: 'Vous n\'êtes pas membre de ce groupe'
        });
      }

      groupe.membres.pull(userId);
      await evenement.save();

      res.json({
        success: true,
        message: 'Vous avez quitté le groupe de covoiturage avec succès',
        data: groupe
      });
    } catch (error) {
      console.error('Erreur quitterGroupeCovoiturage:', error);
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
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: ID de l'événement à annuler
   *     requestBody:
   *       required: false
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               motifAnnulation:
   *                 type: string
   *                 description: Raison de l'annulation
   *                 example: "Conditions météorologiques défavorables"
   *     responses:
   *       200:
   *         description: Événement annulé avec succès
   *       404:
   *         description: Événement non trouvé
   *       400:
   *         description: L'événement ne peut pas être annulé
   */
  async annulerEvenement(req, res, next) {
    try {
      const { id } = req.params;
      const { motifAnnulation } = req.body;

      const evenement = await Evenement.findById(id);
      if (!evenement) {
        return res.status(404).json({
          success: false,
          message: 'Événement non trouvé'
        });
      }

      // Vérifier si l'événement peut être annulé
      if (evenement.statutEvenement === 'TERMINE') {
        return res.status(400).json({
          success: false,
          message: 'Un événement terminé ne peut pas être annulé'
        });
      }

      if (evenement.statutEvenement === 'ANNULE') {
        return res.status(400).json({
          success: false,
          message: 'Cet événement est déjà annulé'
        });
      }

      evenement.statutEvenement = 'ANNULE';
      if (motifAnnulation) {
        evenement.motifAnnulation = motifAnnulation;
      }
      evenement.dateAnnulation = new Date();

      await evenement.save();

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
      return next(AppError.serverError('Erreur lors de l\'annulation de l\'événement'));
    }
  }

  /**
   * @swagger
   * /api/evenements/{id}/groupes-covoiturage/{groupeId}:
   *   delete:
   *     summary: Supprimer un groupe de covoiturage
   *     tags: [Événements - DELETE]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: ID de l'événement
   *       - in: path
   *         name: groupeId
   *         required: true
   *         schema:
   *           type: string
   *         description: ID du groupe de covoiturage à supprimer
   *     responses:
   *       200:
   *         description: Groupe de covoiturage supprimé avec succès
   *       404:
   *         description: Événement ou groupe non trouvé
   *       403:
   *         description: Non autorisé à supprimer ce groupe
   */
  async supprimerGroupeCovoiturage(req, res, next) {
    try {
      const { id, groupeId } = req.params;

      const evenement = await Evenement.findById(id);
      if (!evenement) {
        return res.status(404).json({
          success: false,
          message: 'Événement non trouvé'
        });
      }

      const groupe = evenement.groupesCovoiturage.id(groupeId);
      if (!groupe) {
        return res.status(404).json({
          success: false,
          message: 'Groupe de covoiturage non trouvé'
        });
      }

      // Utiliser la méthode du modèle pour supprimer le groupe
      await evenement.supprimerGroupeCovoiturage(groupeId);

      res.json({
        success: true,
        message: 'Groupe de covoiturage supprimé avec succès',
        data: {
          evenementId: id,
          groupeId: groupeId
        }
      });
    } catch (error) {
      console.error('Erreur supprimerGroupeCovoiturage:', error);
      return next(AppError.serverError('Erreur lors de la suppression du groupe'));
    }
  }
}

module.exports = EvenementController;