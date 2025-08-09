// =====================================================
// CONTROLLER: SIGNALEMENT
// =====================================================

const Signalement = require('../models/Signalement');
const Utilisateur = require('../models/Utilisateur');
const Trajet = require('../models/Trajet');
const Message = require('../models/Message');
const { validationResult } = require('express-validator');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

// =====================================================
// CONFIGURATION MULTER POUR LES PREUVES
// =====================================================

const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadPath = path.join(__dirname, '../uploads/signalements');
    try {
      await fs.mkdir(uploadPath, { recursive: true });
      cb(null, uploadPath);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'preuve-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const uploadPreuves = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 5 // Maximum 5 fichiers
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|pdf|mp4|mov/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Type de fichier non autorisé pour les preuves'));
    }
  }
});

// =====================================================
// CREATE - CRÉER UN SIGNALEMENT
// =====================================================

const creerSignalement = async (req, res) => {
  try {
    // Validation des erreurs
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Erreurs de validation',
        code: 'VALIDATION_ERROR',
        data: { errors: errors.array() }
      });
    }

    const {
      signaleId,
      trajetId,
      messageId,
      typeSignalement,
      motif,
      description
    } = req.body;

    const signalantId = req.user._id;

    // Vérifier que l'utilisateur ne se signale pas lui-même
    if (signalantId.toString() === signaleId) {
      return res.status(400).json({
        success: false,
        message: 'Vous ne pouvez pas vous signaler vous-même',
        code: 'SELF_REPORT_NOT_ALLOWED'
      });
    }

    // Vérifier l'existence de l'utilisateur signalé
    const utilisateurSignale = await Utilisateur.findById(signaleId);
    if (!utilisateurSignale) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur signalé introuvable',
        code: 'USER_NOT_FOUND'
      });
    }

    // Vérifier l'existence du trajet si fourni
    if (trajetId) {
      const trajet = await Trajet.findById(trajetId);
      if (!trajet) {
        return res.status(404).json({
          success: false,
          message: 'Trajet introuvable',
          code: 'TRAJET_NOT_FOUND'
        });
      }
    }

    // Vérifier l'existence du message si fourni
    if (messageId) {
      const message = await Message.findById(messageId);
      if (!message) {
        return res.status(404).json({
          success: false,
          message: 'Message introuvable',
          code: 'MESSAGE_NOT_FOUND'
        });
      }
    }

    // Vérifier les doublons
    const signalementExistant = await Signalement.verifierDoublon(
      signalantId, 
      signaleId, 
      trajetId, 
      messageId
    );

    if (signalementExistant) {
      return res.status(409).json({
        success: false,
        message: 'Un signalement similaire a déjà été soumis récemment',
        code: 'DUPLICATE_REPORT',
        data: { signalementId: signalementExistant._id }
      });
    }

    // Traiter les preuves uploadées
    let preuves = [];
    if (req.files && req.files.length > 0) {
      preuves = req.files.map(file => `/uploads/signalements/${file.filename}`);
    }

    // Compter les signalements similaires pour la priorité
    const nombreSignalementsSimilaires = await Signalement.countDocuments({
      signaleId,
      motif,
      statutTraitement: { $ne: 'REJETE' }
    });

    // Créer le signalement
    const signalement = new Signalement({
      signalantId,
      signaleId,
      trajetId: trajetId || null,
      messageId: messageId || null,
      typeSignalement,
      motif,
      description,
      preuves,
      nombreSignalementsSimilaires,
      ipSignalant: req.ip
    });

    await signalement.save();

    // Populer les données pour la réponse
    await signalement.populate([
      { path: 'signaleId', select: 'nom prenom email' },
      { path: 'trajetId', select: 'pointDepart pointArrivee dateDepart' }
    ]);

    res.status(201).json({
      success: true,
      message: 'Signalement créé avec succès',
      data: { signalement }
    });

  } catch (error) {
    console.error('Erreur lors de la création du signalement:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la création du signalement',
      code: 'CREATE_SIGNALEMENT_ERROR'
    });
  }
};

// =====================================================
// READ - OBTENIR LA QUEUE DE MODÉRATION
// =====================================================

const obtenirQueueModeration = async (req, res) => {
  try {
    const {
      page = 1,
      limite = 20,
      priorite,
      type,
      statut = 'EN_ATTENTE,EN_COURS'
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limite);
    
    // Construire le filtre
    const filtre = {
      statutTraitement: { $in: statut.split(',') }
    };

    if (priorite) {
      filtre.priorite = priorite;
    }

    if (type) {
      filtre.typeSignalement = type;
    }

    // Obtenir les signalements
    const signalements = await Signalement.find(filtre)
      .populate('signalantId', 'nom prenom email')
      .populate('signaleId', 'nom prenom email')
      .populate('trajetId', 'pointDepart pointArrivee dateDepart')
      .populate('moderateurId', 'nom prenom')
      .sort({ priorite: -1, dateSignalement: 1 })
      .skip(skip)
      .limit(parseInt(limite));

    const total = await Signalement.countDocuments(filtre);

    res.json({
      success: true,
      data: {
        signalements,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limite)),
          totalItems: total,
          hasNext: skip + parseInt(limite) < total,
          hasPrev: parseInt(page) > 1
        }
      }
    });

  } catch (error) {
    console.error('Erreur lors de la récupération de la queue:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération de la queue de modération',
      code: 'GET_QUEUE_ERROR'
    });
  }
};

// =====================================================
// READ - HISTORIQUE DES SIGNALEMENTS
// =====================================================

const obtenirHistoriqueSignalements = async (req, res) => {
  try {
    const {
      userId,
      page = 1,
      limite = 20,
      dateDebut,
      dateFin,
      statut
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limite);
    
    // Construire le filtre
    const filtre = {};

    if (userId) {
      filtre.$or = [
        { signalantId: userId },
        { signaleId: userId }
      ];
    }

    if (statut) {
      filtre.statutTraitement = statut;
    }

    if (dateDebut || dateFin) {
      filtre.dateSignalement = {};
      if (dateDebut) filtre.dateSignalement.$gte = new Date(dateDebut);
      if (dateFin) filtre.dateSignalement.$lte = new Date(dateFin);
    }

    const signalements = await Signalement.find(filtre)
      .populate('signalantId', 'nom prenom email')
      .populate('signaleId', 'nom prenom email')
      .populate('moderateurId', 'nom prenom')
      .sort({ dateSignalement: -1 })
      .skip(skip)
      .limit(parseInt(limite));

    const total = await Signalement.countDocuments(filtre);

    res.json({
      success: true,
      data: {
        signalements,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limite)),
          totalItems: total
        }
      }
    });

  } catch (error) {
    console.error('Erreur lors de la récupération de l\'historique:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération de l\'historique',
      code: 'GET_HISTORY_ERROR'
    });
  }
};

// =====================================================
// READ - STATISTIQUES DE MODÉRATION
// =====================================================

const obtenirStatistiquesModeration = async (req, res) => {
  try {
    const {
      dateDebut,
      dateFin,
      moderateurId
    } = req.query;

    const debut = dateDebut ? new Date(dateDebut) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const fin = dateFin ? new Date(dateFin) : new Date();

    // Statistiques générales
    const statsGenerales = await Signalement.obtenirStatistiques(debut, fin);

    // Statistiques par modérateur
    const statsModerateursPipeline = [
      {
        $match: {
          dateSignalement: { $gte: debut, $lte: fin },
          moderateurId: { $exists: true, $ne: null }
        }
      },
      {
        $group: {
          _id: '$moderateurId',
          totalTraites: { $sum: 1 },
          tempsTraitementMoyen: {
            $avg: {
              $subtract: ['$dateTraitement', '$dateSignalement']
            }
          }
        }
      },
      {
        $lookup: {
          from: 'administrateurs',
          localField: '_id',
          foreignField: '_id',
          as: 'moderateur'
        }
      }
    ];

    const statsModerateurs = await Signalement.aggregate(statsModerateursPipeline);

    // Temps de traitement moyen par priorité
    const tempsTraitementPipeline = [
      {
        $match: {
          statutTraitement: 'TRAITE',
          dateTraitement: { $exists: true },
          dateSignalement: { $gte: debut, $lte: fin }
        }
      },
      {
        $group: {
          _id: '$priorite',
          tempsTraitementMoyen: {
            $avg: {
              $subtract: ['$dateTraitement', '$dateSignalement']
            }
          },
          count: { $sum: 1 }
        }
      }
    ];

    const tempsTraitement = await Signalement.aggregate(tempsTraitementPipeline);

    res.json({
      success: true,
      data: {
        periode: { debut, fin },
        statistiquesGenerales: statsGenerales,
        statistiquesModerateurs: statsModerateurs,
        tempsTraitement: tempsTraitement
      }
    });

  } catch (error) {
    console.error('Erreur lors du calcul des statistiques:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors du calcul des statistiques',
      code: 'GET_STATS_ERROR'
    });
  }
};

// =====================================================
// UPDATE - TRAITER UN SIGNALEMENT
// =====================================================

const traiterSignalement = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      action, // 'APPROUVER' | 'REJETER'
      actionsDisciplinaires,
      commentaire
    } = req.body;

    const moderateurId = req.user._id;

    const signalement = await Signalement.findById(id);
    if (!signalement) {
      return res.status(404).json({
        success: false,
        message: 'Signalement introuvable',
        code: 'SIGNALEMENT_NOT_FOUND'
      });
    }

    if (signalement.statutTraitement === 'TRAITE') {
      return res.status(409).json({
        success: false,
        message: 'Ce signalement a déjà été traité',
        code: 'ALREADY_PROCESSED'
      });
    }

    if (action === 'APPROUVER') {
      await signalement.marquerTraite(moderateurId, actionsDisciplinaires, commentaire);
      
      // Appliquer les actions disciplinaires à l'utilisateur signalé
      if (actionsDisciplinaires && actionsDisciplinaires.length > 0) {
        await appliquerActionsDisciplinaires(signalement.signaleId, actionsDisciplinaires);
      }

    } else if (action === 'REJETER') {
      await signalement.rejeter(moderateurId, commentaire);
    } else {
      return res.status(400).json({
        success: false,
        message: 'Action non valide. Utilisez APPROUVER ou REJETER',
        code: 'INVALID_ACTION'
      });
    }

    // Recharger avec les données populées
    await signalement.populate([
      { path: 'signalantId', select: 'nom prenom email' },
      { path: 'signaleId', select: 'nom prenom email' },
      { path: 'moderateurId', select: 'nom prenom' }
    ]);

    res.json({
      success: true,
      message: `Signalement ${action.toLowerCase()} avec succès`,
      data: { signalement }
    });

  } catch (error) {
    console.error('Erreur lors du traitement du signalement:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors du traitement du signalement',
      code: 'PROCESS_SIGNALEMENT_ERROR'
    });
  }
};

// =====================================================
// UPDATE - ASSIGNER UN MODÉRATEUR
// =====================================================

const assignerModerateur = async (req, res) => {
  try {
    const { id } = req.params;
    const { moderateurId } = req.body;

    const signalement = await Signalement.findById(id);
    if (!signalement) {
      return res.status(404).json({
        success: false,
        message: 'Signalement introuvable',
        code: 'SIGNALEMENT_NOT_FOUND'
      });
    }

    signalement.moderateurId = moderateurId;
    signalement.statutTraitement = 'EN_COURS';
    await signalement.save();

    await signalement.populate('moderateurId', 'nom prenom');

    res.json({
      success: true,
      message: 'Modérateur assigné avec succès',
      data: { signalement }
    });

  } catch (error) {
    console.error('Erreur lors de l\'assignation:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de l\'assignation du modérateur',
      code: 'ASSIGN_MODERATOR_ERROR'
    });
  }
};

// =====================================================
// DELETE - CLASSER UN SIGNALEMENT
// =====================================================

const classerSignalement = async (req, res) => {
  try {
    const { id } = req.params;
    const { raison } = req.body;

    const signalement = await Signalement.findById(id);
    if (!signalement) {
      return res.status(404).json({
        success: false,
        message: 'Signalement introuvable',
        code: 'SIGNALEMENT_NOT_FOUND'
      });
    }

    signalement.statutTraitement = 'REJETE';
    signalement.moderateurId = req.user._id;
    signalement.commentaireModeratrice = raison || 'Signalement classé sans suite';
    signalement.dateTraitement = new Date();

    await signalement.save();

    res.json({
      success: true,
      message: 'Signalement classé avec succès',
      data: { signalement }
    });

  } catch (error) {
    console.error('Erreur lors du classement:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors du classement du signalement',
      code: 'ARCHIVE_SIGNALEMENT_ERROR'
    });
  }
};

// =====================================================
// READ - OBTENIR UN SIGNALEMENT SPÉCIFIQUE
// =====================================================

const obtenirSignalement = async (req, res) => {
  try {
    const { id } = req.params;

    const signalement = await Signalement.findById(id)
      .populate('signalantId', 'nom prenom email')
      .populate('signaleId', 'nom prenom email')
      .populate('trajetId', 'pointDepart pointArrivee dateDepart')
      .populate('messageId', 'contenu dateEnvoi')
      .populate('moderateurId', 'nom prenom');

    if (!signalement) {
      return res.status(404).json({
        success: false,
        message: 'Signalement introuvable',
        code: 'SIGNALEMENT_NOT_FOUND'
      });
    }

    res.json({
      success: true,
      data: { signalement }
    });

  } catch (error) {
    console.error('Erreur lors de la récupération du signalement:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération du signalement',
      code: 'GET_SIGNALEMENT_ERROR'
    });
  }
};

// =====================================================
// UPLOAD - TÉLÉCHARGER DES PREUVES
// =====================================================

const uploaderPreuves = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Aucun fichier de preuve fourni',
        code: 'NO_FILES_PROVIDED'
      });
    }

    const preuves = req.files.map(file => ({
      filename: file.filename,
      originalName: file.originalname,
      url: `/uploads/signalements/${file.filename}`,
      size: file.size,
      mimetype: file.mimetype
    }));

    res.json({
      success: true,
      message: 'Preuves uploadées avec succès',
      data: { preuves }
    });

  } catch (error) {
    console.error('Erreur lors de l\'upload des preuves:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de l\'upload des preuves',
      code: 'UPLOAD_PREUVES_ERROR'
    });
  }
};

// =====================================================
// FONCTIONS UTILITAIRES
// =====================================================

const appliquerActionsDisciplinaires = async (utilisateurId, actions) => {
  try {
    const utilisateur = await Utilisateur.findById(utilisateurId);
    if (!utilisateur) return;

    const maintenant = new Date();

    for (const action of actions) {
      switch (action) {
        case 'AVERTISSEMENT':
          utilisateur.avertissements = (utilisateur.avertissements || 0) + 1;
          break;

        case 'SUSPENSION_1_JOUR':
          utilisateur.statutCompte = 'SUSPENDU';
          utilisateur.dateSuspensionFin = new Date(maintenant.getTime() + 24 * 60 * 60 * 1000);
          break;

        case 'SUSPENSION_7_JOURS':
          utilisateur.statutCompte = 'SUSPENDU';
          utilisateur.dateSuspensionFin = new Date(maintenant.getTime() + 7 * 24 * 60 * 60 * 1000);
          break;

        case 'SUSPENSION_30_JOURS':
          utilisateur.statutCompte = 'SUSPENDU';
          utilisateur.dateSuspensionFin = new Date(maintenant.getTime() + 30 * 24 * 60 * 60 * 1000);
          break;

        case 'BLOCAGE_DEFINITIF':
          utilisateur.statutCompte = 'BLOQUE';
          utilisateur.dateBloquage = maintenant;
          break;

        case 'VERIFICATION_IDENTITE_REQUISE':
          utilisateur.verificationIdentiteRequise = true;
          break;

        case 'LIMITATION_FONCTIONNALITES':
          utilisateur.fonctionnalitesLimitees = true;
          break;
      }
    }

    // Ajouter l'historique des sanctions
    if (!utilisateur.historiqueSanctions) {
      utilisateur.historiqueSanctions = [];
    }

    utilisateur.historiqueSanctions.push({
      actions,
      date: maintenant,
      raison: 'Suite à signalement validé'
    });

    await utilisateur.save();

  } catch (error) {
    console.error('Erreur lors de l\'application des actions disciplinaires:', error);
  }
};

// =====================================================
// DASHBOARD - MÉTRIQUES EN TEMPS RÉEL
// =====================================================

const obtenirMetriquesTempsReel = async (req, res) => {
  try {
    const maintenant = new Date();
    const il24h = new Date(maintenant.getTime() - 24 * 60 * 60 * 1000);
    const il7j = new Date(maintenant.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Signalements en attente
    const signalementEnAttente = await Signalement.countDocuments({
      statutTraitement: 'EN_ATTENTE'
    });

    // Signalements urgents non traités
    const signalementUrgents = await Signalement.countDocuments({
      statutTraitement: { $in: ['EN_ATTENTE', 'EN_COURS'] },
      priorite: { $in: ['HAUTE', 'CRITIQUE'] }
    });

    // Signalements en retard
    const signalementEnRetard = await Signalement.countDocuments({
      statutTraitement: 'EN_ATTENTE',
      $expr: {
        $gt: [
          { $subtract: [maintenant, '$dateSignalement'] },
          {
            $switch: {
              branches: [
                { case: { $eq: ['$priorite', 'CRITIQUE'] }, then: 2 * 60 * 60 * 1000 },
                { case: { $eq: ['$priorite', 'HAUTE'] }, then: 24 * 60 * 60 * 1000 }
              ],
              default: 72 * 60 * 60 * 1000
            }
          }
        ]
      }
    });

    // Nouveaux signalements (24h)
    const nouveauxSignalements24h = await Signalement.countDocuments({
      dateSignalement: { $gte: il24h }
    });

    // Signalements traités (7 jours)
    const signalementsTraites7j = await Signalement.countDocuments({
      statutTraitement: 'TRAITE',
      dateTraitement: { $gte: il7j }
    });

    // Top des motifs de signalement
    const topMotifs = await Signalement.aggregate([
      {
        $match: {
          dateSignalement: { $gte: il7j }
        }
      },
      {
        $group: {
          _id: '$motif',
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      },
      {
        $limit: 5
      }
    ]);

    res.json({
      success: true,
      data: {
        metriques: {
          enAttente: signalementEnAttente,
          urgents: signalementUrgents,
          enRetard: signalementEnRetard,
          nouveaux24h: nouveauxSignalements24h,
          traites7j: signalementsTraites7j
        },
        topMotifs,
        derniereMiseAJour: maintenant
      }
    });

  } catch (error) {
    console.error('Erreur lors du calcul des métriques:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors du calcul des métriques',
      code: 'GET_METRICS_ERROR'
    });
  }
};

// =====================================================
// RECHERCHE ET FILTRAGE AVANCÉ
// =====================================================

const rechercherSignalements = async (req, res) => {
  try {
    const {
      q, // terme de recherche
      type,
      motif,
      priorite,
      statut,
      dateDebut,
      dateFin,
      moderateurId,
      page = 1,
      limite = 20
    } = req.query;

    const skip = (parseInt(page) - 1) * parseInt(limite);
    
    // Construire la requête de recherche
    const filtre = {};

    if (type) filtre.typeSignalement = type;
    if (motif) filtre.motif = motif;
    if (priorite) filtre.priorite = priorite;
    if (statut) filtre.statutTraitement = statut;
    if (moderateurId) filtre.moderateurId = moderateurId;

    if (dateDebut || dateFin) {
      filtre.dateSignalement = {};
      if (dateDebut) filtre.dateSignalement.$gte = new Date(dateDebut);
      if (dateFin) filtre.dateSignalement.$lte = new Date(dateFin);
    }

    // Recherche textuelle
    if (q) {
      filtre.$or = [
        { description: { $regex: q, $options: 'i' } },
        { commentaireModeratrice: { $regex: q, $options: 'i' } }
      ];
    }

    const signalements = await Signalement.find(filtre)
      .populate('signalantId', 'nom prenom email')
      .populate('signaleId', 'nom prenom email')
      .populate('moderateurId', 'nom prenom')
      .sort({ dateSignalement: -1 })
      .skip(skip)
      .limit(parseInt(limite));

    const total = await Signalement.countDocuments(filtre);

    res.json({
      success: true,
      data: {
        signalements,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / parseInt(limite)),
          totalItems: total
        },
        filtres: { type, motif, priorite, statut, dateDebut, dateFin }
      }
    });

  } catch (error) {
    console.error('Erreur lors de la recherche:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la recherche',
      code: 'SEARCH_ERROR'
    });
  }
};

// =====================================================
// EXPORTS
// =====================================================

module.exports = {
  // Create
  creerSignalement,
  uploaderPreuves,

  // Read
  obtenirSignalement,
  obtenirQueueModeration,
  obtenirHistoriqueSignalements,
  obtenirStatistiquesModeration,
  obtenirMetriquesTempsReel,
  rechercherSignalements,

  // Update
  traiterSignalement,
  assignerModerateur,

  // Delete
  classerSignalement,

  // Middleware multer
  uploadPreuves: uploadPreuves.array('preuves', 5)
};