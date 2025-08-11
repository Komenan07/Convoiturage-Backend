// Importation du modèle avec gestion d'erreur
let Evaluation;
try {
  Evaluation = require('../models/Evaluation');
} catch (error) {
  console.warn('⚠️ Modèle Evaluation non trouvé, utilisation d\'un mock');

  // Mock du modèle Evaluation si non trouvé
  Evaluation = {
    findOne: async (_query) => null,
    find: (_query) => ({
      sort: () => ({
        skip: () => ({
          limit: () => Promise.resolve([])
        })
      })
    }),
    countDocuments: async () => 0,
    findById: async () => null,
    findByIdAndDelete: async () => null,
    aggregate: async () => [{ totalEvaluations: 0, moyenneGlobale: 0, signalements: 0 }],
    // Méthode statique mockée
    calculerMoyenneUtilisateur: async (_userId) => {
      return {
        moyenneGlobale: 0,
        totalEvaluations: 0,
        repartitionNotes: {}
      };
    },
    // Méthode statique mockée
    detecterEvaluationsSuspectes: async (_userId) => {
      return [];
    },
  };

  // Constructor mock
  const EvaluationConstructor = function(data) {
    Object.assign(this, data);
    this.save = async () => this;
    this.peutRepondre = (_userId) => true; // Utilisation de _userId pour indiquer qu'elle est intentionnellement non utilisée
  };

  // Remplacer le modèle par le constructor
  Evaluation = EvaluationConstructor;
  Object.assign(Evaluation, Evaluation);
}

class EvaluationService {
  /**
   * Créer une nouvelle évaluation
   * @param {Object} data - Données de l'évaluation
   * @param {string} evaluateurId - ID de l'utilisateur qui évalue
   * @returns {Promise<Object>} - Évaluation créée
   */
  async creerEvaluation(data, evaluateurId) {
    try {
      // Vérifier si une évaluation existe déjà
      const existe = await Evaluation.findOne({
        trajetId: data.trajetId,
        evaluateurId: evaluateurId,
        evalueId: data.evalueId
      });
      if (existe) {
        throw new Error('Vous avez déjà évalué cet utilisateur pour ce trajet');
      }
      // Valider les données requises
      if (!data.trajetId || !data.evalueId || !data.note) {
        throw new Error('Données manquantes : trajetId, evalueId et note sont requis');
      }
      // Vérifier que l'utilisateur ne s'évalue pas lui-même
      if (evaluateurId === data.evalueId) {
        throw new Error('Vous ne pouvez pas vous évaluer vous-même');
      }
      // Créer l'évaluation
      const evaluationData = {
        ...data,
        evaluateurId,
        evalueId: data.evalueId,
        trajetId: data.trajetId,
        typeEvaluateur: data.typeEvaluateur || 'PASSAGER',
        notes: {
          noteGlobale: data.note,
          ponctualite: data.criteresEvaluation?.ponctualite || data.note,
          proprete: data.criteresEvaluation?.proprete || data.note,
          communication: data.criteresEvaluation?.communication || data.note,
          conduite: data.criteresEvaluation?.conduite || data.note,
          comportement: data.criteresEvaluation?.comportement || data.note
        },
        commentaire: data.commentaire || '',
        dateEvaluation: new Date(),
        estSignalement: false,
        gravite: 'FAIBLE'
      };
      const evaluation = new Evaluation(evaluationData);
      await evaluation.save();
      return evaluation;
    } catch (error) {
      console.error('Erreur création évaluation:', error);
      throw error;
    }
  }

  /**
   * Obtenir les évaluations d'un utilisateur
   * @param {string} userId - ID de l'utilisateur évalué
   * @param {Object} options - Options de pagination et filtres
   * @returns {Promise<Object>} - Liste des évaluations avec pagination
   */
  async obtenirEvaluationsUtilisateur(userId, options = {}) {
    try {
      const {
        page = 1,
        limite = 10,
        typeEvaluateur,
        noteMinimum,
        dateDebut,
        dateFin
      } = options;
      // Construction de la requête
      const query = { evalueId: userId };
      if (typeEvaluateur) {
        query.typeEvaluateur = typeEvaluateur;
      }
      if (noteMinimum) {
        query['notes.noteGlobale'] = { $gte: noteMinimum };
      }
      // Filtres de date
      if (dateDebut || dateFin) {
        query.dateEvaluation = {};
        if (dateDebut) query.dateEvaluation.$gte = new Date(dateDebut);
        if (dateFin) query.dateEvaluation.$lte = new Date(dateFin);
      }
      // Exécution des requêtes en parallèle
      const [evaluations, total] = await Promise.all([
        Evaluation.find(query)
          .populate('evaluateurId', 'nom prenom photo')
          .populate('trajetId', 'depart destination dateDepart')
          .sort({ dateEvaluation: -1 })
          .skip((page - 1) * limite)
          .limit(limite),
        Evaluation.countDocuments(query)
      ]);
      // Calculer les statistiques
      const statistiques = await this.obtenirMoyenneNotes(userId);
      return {
        evaluations,
        pagination: {
          page: parseInt(page),
          limite: parseInt(limite),
          total,
          pages: Math.ceil(total / limite)
        },
        statistiques
      };
    } catch (error) {
      console.error('Erreur obtention évaluations utilisateur:', error);
      throw error;
    }
  }

  /**
   * Obtenir la moyenne des notes d'un utilisateur
   * @param {string} userId - ID de l'utilisateur
   * @returns {Promise<Object>} - Statistiques des notes
   */
  async obtenirMoyenneNotes(userId) {
    try {
      // Utiliser la méthode statique si disponible
      if (typeof Evaluation.calculerMoyenneUtilisateur === 'function') {
        return await Evaluation.calculerMoyenneUtilisateur(userId);
      }
      // Calcul manuel si méthode statique non disponible
      const pipeline = [
        { $match: { evalueId: userId } },
        {
          $group: {
            _id: null,
            moyenneGlobale: { $avg: '$notes.noteGlobale' },
            moyennePonctualite: { $avg: '$notes.ponctualite' },
            moyenneProprete: { $avg: '$notes.proprete' },
            moyenneCommunication: { $avg: '$notes.communication' },
            moyenneConduite: { $avg: '$notes.conduite' },
            moyenneComportement: { $avg: '$notes.comportement' },
            totalEvaluations: { $sum: 1 },
            note5: { $sum: { $cond: [{ $eq: ['$notes.noteGlobale', 5] }, 1, 0] } },
            note4: { $sum: { $cond: [{ $eq: ['$notes.noteGlobale', 4] }, 1, 0] } },
            note3: { $sum: { $cond: [{ $eq: ['$notes.noteGlobale', 3] }, 1, 0] } },
            note2: { $sum: { $cond: [{ $eq: ['$notes.noteGlobale', 2] }, 1, 0] } },
            note1: { $sum: { $cond: [{ $eq: ['$notes.noteGlobale', 1] }, 1, 0] } }
          }
        }
      ];
      const result = await Evaluation.aggregate(pipeline);
      if (!result || result.length === 0) {
        return {
          moyenneGlobale: 0,
          totalEvaluations: 0,
          repartitionNotes: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
        };
      }
      const stats = result[0];
      return {
        moyenneGlobale: Math.round(stats.moyenneGlobale * 10) / 10,
        moyennes: {
          ponctualite: Math.round(stats.moyennePonctualite * 10) / 10,
          proprete: Math.round(stats.moyenneProprete * 10) / 10,
          communication: Math.round(stats.moyenneCommunication * 10) / 10,
          conduite: Math.round(stats.moyenneConduite * 10) / 10,
          comportement: Math.round(stats.moyenneComportement * 10) / 10
        },
        totalEvaluations: stats.totalEvaluations,
        repartitionNotes: {
          5: stats.note5,
          4: stats.note4,
          3: stats.note3,
          2: stats.note2,
          1: stats.note1
        }
      };
    } catch (error) {
      console.error('Erreur calcul moyenne notes:', error);
      return {
        moyenneGlobale: 0,
        totalEvaluations: 0,
        repartitionNotes: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
      };
    }
  }

  /**
   * Obtenir les évaluations d'un trajet
   * @param {string} trajetId - ID du trajet
   * @returns {Promise<Array>} - Liste des évaluations
   */
  async obtenirEvaluationsTrajet(trajetId) {
    try {
      const evaluations = await Evaluation.find({ trajetId })
        .populate('evaluateurId', 'nom prenom photo')
        .populate('evalueId', 'nom prenom photo')
        .sort({ dateEvaluation: -1 });
      const statistiques = {
        totalEvaluations: evaluations.length,
        moyenneGlobale: evaluations.length > 0
          ? evaluations.reduce((sum, evaluation) => sum + evaluation.notes.noteGlobale, 0) / evaluations.length
          : 0
      };
      return {
        evaluations,
        statistiques
      };
    } catch (error) {
      console.error('Erreur obtention évaluations trajet:', error);
      throw error;
    }
  }

  /**
   * Répondre à une évaluation
   * @param {string} id - ID de l'évaluation
   * @param {string} reponse - Réponse de l'utilisateur évalué
   * @param {string} userId - ID de l'utilisateur qui répond
   * @returns {Promise<Object>} - Évaluation mise à jour
   */
  async repondreEvaluation(id, reponse, userId) {
    try {
      const evaluation = await Evaluation.findById(id);
      if (!evaluation) {
        throw new Error('Évaluation introuvable');
      }
      // Vérifier que c'est l'utilisateur évalué qui répond
      if (evaluation.evalueId.toString() !== userId) {
        throw new Error('Non autorisé à répondre à cette évaluation');
      }
      // Vérifier qu'il n'y a pas déjà une réponse
      if (evaluation.reponseEvalue) {
        throw new Error('Une réponse a déjà été donnée à cette évaluation');
      }
      // Ajouter la réponse
      evaluation.reponseEvalue = reponse.trim();
      evaluation.dateReponse = new Date();
      await evaluation.save();
      return evaluation;
    } catch (error) {
      console.error('Erreur réponse évaluation:', error);
      throw error;
    }
  }

  /**
   * Signaler une évaluation comme abusive
   * @param {string} id - ID de l'évaluation
   * @param {string} motif - Motif du signalement
   * @param {string} userId - ID de l'utilisateur qui signale
   * @returns {Promise<Object>} - Résultat du signalement
   */
  async signalerEvaluationAbusive(id, motif, userId) {
    try {
      const evaluation = await Evaluation.findById(id);
      if (!evaluation) {
        throw new Error('Évaluation introuvable');
      }
      // Vérifier que l'utilisateur peut signaler
      if (evaluation.evalueId.toString() !== userId && evaluation.evaluateurId.toString() !== userId) {
        throw new Error('Non autorisé à signaler cette évaluation');
      }
      // Marquer comme signalée
      evaluation.estSignalement = true;
      evaluation.motifSignalement = motif || 'CONTENU_INAPPROPRIE';
      evaluation.dateSignalement = new Date();
      evaluation.signalePar = userId;
      // Définir la gravité selon le motif
      const graviteMap = {
        'CONTENU_OFFENSANT': 'ELEVE',
        'HARCELEMENT': 'CRITIQUE',
        'DISCRIMINATION': 'CRITIQUE',
        'FAUSSE_INFORMATION': 'MOYEN',
        'AUTRE': 'FAIBLE'
      };
      evaluation.gravite = graviteMap[motif] || 'MOYEN';
      await evaluation.save();
      return {
        message: 'Signalement enregistré avec succès',
        evaluation
      };
    } catch (error) {
      console.error('Erreur signalement évaluation:', error);
      throw error;
    }
  }

  /**
   * Supprimer une évaluation (admin uniquement)
   * @param {string} id - ID de l'évaluation
   * @param {string} adminId - ID de l'administrateur
   * @returns {Promise<Object>} - Résultat de la suppression
   */
  async supprimerEvaluation(id, adminId) {
    try {
      const evaluation = await Evaluation.findByIdAndDelete(id);
      if (!evaluation) {
        throw new Error('Évaluation introuvable ou déjà supprimée');
      }
      // Log de l'action admin
      console.log(`Évaluation ${id} supprimée par l'admin ${adminId}`);
      return {
        message: 'Évaluation supprimée avec succès',
        evaluation
      };
    } catch (error) {
      console.error('Erreur suppression évaluation:', error);
      throw error;
    }
  }

  /**
   * Détecter les évaluations suspectes d'un utilisateur
   * @param {string} userId - ID de l'utilisateur
   * @returns {Promise<Array>} - Liste des évaluations suspectes
   */
  async detecterEvaluationsSuspectes(userId) {
    try {
      // Utiliser la méthode statique si disponible
      if (typeof Evaluation.detecterEvaluationsSuspectes === 'function') {
        return await Evaluation.detecterEvaluationsSuspectes(userId);
      }
      // Détection manuelle
      const evaluations = await Evaluation.find({
        $or: [
          { evaluateurId: userId },
          { evalueId: userId }
        ]
      });
      const suspectes = evaluations.filter(evaluation => {
        // Critères de suspicion
        return (
          evaluation.estSignalement ||
          evaluation.notes.noteGlobale <= 2 ||
          (evaluation.commentaire && evaluation.commentaire.length < 10) ||
          evaluation.gravite === 'CRITIQUE'
        );
      });
      return suspectes;
    } catch (error) {
      console.error('Erreur détection évaluations suspectes:', error);
      return [];
    }
  }

  /**
   * Mettre à jour le score de confiance d'un utilisateur
   * @param {string} userId - ID de l'utilisateur
   * @returns {Promise<number>} - Nouveau score de confiance
   */
  async mettreAJourScoreConfiance(userId) {
    try {
      const stats = await this.obtenirMoyenneNotes(userId);
      if (stats.totalEvaluations === 0) {
        return 0; // Score neutre pour les nouveaux utilisateurs
      }
      // Calcul du score (0-100)
      let score = Math.round(stats.moyenneGlobale * 20); // 5 étoiles = 100 points
      // Bonus pour le nombre d'évaluations
      const bonusEvaluations = Math.min(stats.totalEvaluations * 2, 20);
      score += bonusEvaluations;
      // Malus pour les évaluations suspectes
      const suspectes = await this.detecterEvaluationsSuspectes(userId);
      const malusSuspectes = suspectes.length * 5;
      score -= malusSuspectes;
      // Normaliser entre 0 et 100
      score = Math.max(0, Math.min(100, score));
      return score;
    } catch (error) {
      console.error('Erreur calcul score confiance:', error);
      return 50; // Score par défaut
    }
  }

  /**
   * Obtenir les statistiques globales des évaluations
   * @returns {Promise<Object>} - Statistiques globales
   */
  async obtenirStatistiquesGlobales() {
    try {
      const pipeline = [
        {
          $group: {
            _id: null,
            totalEvaluations: { $sum: 1 },
            moyenneGlobale: { $avg: '$notes.noteGlobale' },
            signalements: { $sum: { $cond: ['$estSignalement', 1, 0] } },
            evaluationsConducteur: {
              $sum: { $cond: [{ $eq: ['$typeEvaluateur', 'CONDUCTEUR'] }, 1, 0] }
            },
            evaluationsPassager: {
              $sum: { $cond: [{ $eq: ['$typeEvaluateur', 'PASSAGER'] }, 1, 0] }
            }
          }
        }
      ];
      const result = await Evaluation.aggregate(pipeline);
      const stats = result[0] || {
        totalEvaluations: 0,
        moyenneGlobale: 0,
        signalements: 0,
        evaluationsConducteur: 0,
        evaluationsPassager: 0
      };
      return {
        totalEvaluations: stats.totalEvaluations,
        moyenneGlobale: Math.round(stats.moyenneGlobale * 10) / 10,
        signalements: stats.signalements,
        tauxSignalement: stats.totalEvaluations > 0
          ? Math.round((stats.signalements / stats.totalEvaluations) * 100)
          : 0,
        repartitionTypes: {
          conducteur: stats.evaluationsConducteur,
          passager: stats.evaluationsPassager
        }
      };
    } catch (error) {
      console.error('Erreur statistiques globales:', error);
      return {
        totalEvaluations: 0,
        moyenneGlobale: 0,
        signalements: 0,
        tauxSignalement: 0,
        repartitionTypes: { conducteur: 0, passager: 0 }
      };
    }
  }

  /**
   * Modérer une évaluation
   * @param {string} id - ID de l'évaluation
   * @param {string} action - Action de modération
   * @param {string} moderateurId - ID du modérateur
   * @returns {Promise<Object>} - Résultat de la modération
   */
  async modererEvaluation(id, action, moderateurId) {
    try {
      const evaluation = await Evaluation.findById(id);
      if (!evaluation) {
        throw new Error('Évaluation introuvable');
      }
      switch (action) {
        case 'APPROUVER':
          evaluation.estSignalement = false;
          evaluation.statut = 'APPROUVE';
          break;
        case 'MASQUER':
          evaluation.estMasque = true;
          evaluation.statut = 'MASQUE';
          break;
        case 'SUPPRIMER':
          return await this.supprimerEvaluation(id, moderateurId);
        default:
          throw new Error('Action de modération invalide');
      }
      evaluation.moderePar = moderateurId;
      evaluation.dateModeration = new Date();
      await evaluation.save();
      return evaluation;
    } catch (error) {
      console.error('Erreur modération évaluation:', error);
      throw error;
    }
  }
}

module.exports = EvaluationService;
