// services/EvaluationService.js
class EvaluationService {
  constructor(Evaluation, Trajet, Utilisateur) {
    this.Evaluation = Evaluation;
    this.Trajet = Trajet;
    this.Utilisateur = Utilisateur;
  }

  // CREATE - Créer évaluation après trajet
  async creerEvaluation(data, evaluateurId) {
    try {
      // Vérifier que le trajet existe et est terminé
      const trajet = await this.Trajet.findById(data.trajetId)
        .populate('conducteurId passagers.utilisateurId');
      
      if (!trajet) {
        throw new Error('Trajet introuvable');
      }
      
      if (trajet.statut !== 'TERMINE') {
        throw new Error('Le trajet doit être terminé pour être évalué');
      }
      
      // Vérifier que l'évaluateur faisait partie du trajet
      const estConducteur = trajet.conducteurId._id.toString() === evaluateurId;
      const estPassager = trajet.passagers.some(p => 
        p.utilisateurId._id.toString() === evaluateurId
      );
      
      if (!estConducteur && !estPassager) {
        throw new Error('Vous ne pouvez évaluer que les trajets auxquels vous avez participé');
      }
      
      // Déterminer le type d'évaluateur et l'évalué
      let typeEvaluateur, evalueId;
      
      if (estConducteur) {
        typeEvaluateur = 'CONDUCTEUR';
        // Le conducteur évalue un passager spécifique
        evalueId = data.evalueId;
      } else {
        typeEvaluateur = 'PASSAGER';
        // Le passager évalue le conducteur
        evalueId = trajet.conducteurId._id;
      }
      
      // Vérifier qu'une évaluation n'existe pas déjà
      const evaluationExistante = await this.Evaluation.findOne({
        trajetId: data.trajetId,
        evaluateurId,
        evalueId
      });
      
      if (evaluationExistante) {
        throw new Error('Vous avez déjà évalué cette personne pour ce trajet');
      }
      
      // Créer l'évaluation
      const evaluation = new this.Evaluation({
        ...data,
        evaluateurId,
        evalueId,
        typeEvaluateur
      });
      
      await evaluation.save();
      
      // Mettre à jour le score de confiance de l'évalué
      await this.mettreAJourScoreConfiance(evalueId);
      
      return evaluation;
      
    } catch (error) {
      throw new Error(`Erreur lors de la création de l'évaluation: ${error.message}`);
    }
  }

  // READ - Obtenir évaluations utilisateur
  async obtenirEvaluationsUtilisateur(userId, options = {}) {
    const {
      page = 1,
      limit = 10,
      typeEvaluateur,
      notesMinimum
    } = options;
    
    const query = { evalueId: userId };
    
    if (typeEvaluateur) {
      query.typeEvaluateur = typeEvaluateur;
    }
    
    if (notesMinimum) {
      query['notes.noteGlobale'] = { $gte: notesMinimum };
    }
    
    const evaluations = await this.Evaluation.find(query)
      .populate('evaluateurId', 'nom prenom photo')
      .populate('trajetId', 'depart destination dateDepart')
      .sort({ dateEvaluation: -1 })
      .skip((page - 1) * limit)
      .limit(limit);
    
    const total = await this.Evaluation.countDocuments(query);
    const moyennes = await this.Evaluation.calculerMoyenneUtilisateur(userId);
    
    return {
      evaluations,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      },
      statistiques: moyennes
    };
  }

  // READ - Obtenir moyenne notes
  async obtenirMoyenneNotes(userId) {
    return await this.Evaluation.calculerMoyenneUtilisateur(userId);
  }

  // READ - Obtenir évaluations d'un trajet
  async obtenirEvaluationsTrajet(trajetId) {
    const evaluations = await this.Evaluation.find({ trajetId })
      .populate('evaluateurId evalueId', 'nom prenom photo')
      .sort({ dateEvaluation: -1 });
    
    return evaluations;
  }

  // UPDATE - Répondre à évaluation
  async repondreEvaluation(evaluationId, reponse, userId) {
    try {
      const evaluation = await this.Evaluation.findById(evaluationId);
      
      if (!evaluation) {
        throw new Error('Évaluation introuvable');
      }
      
      if (!evaluation.peutRepondre(userId)) {
        throw new Error('Vous ne pouvez pas répondre à cette évaluation');
      }
      
      evaluation.reponseEvalue = reponse;
      evaluation.dateReponse = new Date();
      
      await evaluation.save();
      return evaluation;
      
    } catch (error) {
      throw new Error(`Erreur lors de la réponse: ${error.message}`);
    }
  }

  // UPDATE - Signaler évaluation abusive
  async signalerEvaluationAbusive(evaluationId, motif, userId) {
    try {
      const evaluation = await this.Evaluation.findById(evaluationId);
      
      if (!evaluation) {
        throw new Error('Évaluation introuvable');
      }
      
      if (evaluation.evalueId.toString() !== userId) {
        throw new Error('Vous ne pouvez signaler que les évaluations vous concernant');
      }
      
      // Créer un signalement d'évaluation abusive
      // (logique à implémenter selon vos besoins)
      
      return { success: true, message: 'Signalement enregistré' };
      
    } catch (error) {
      throw new Error(`Erreur lors du signalement: ${error.message}`);
    }
  }

  // DELETE - Supprimer évaluation (admin uniquement)
  async supprimerEvaluation(evaluationId, adminId) {
    try {
      const admin = await this.Utilisateur.findById(adminId);
      
      if (!admin || admin.role !== 'ADMIN') {
        throw new Error('Accès non autorisé');
      }
      
      const evaluation = await this.Evaluation.findByIdAndDelete(evaluationId);
      
      if (!evaluation) {
        throw new Error('Évaluation introuvable');
      }
      
      // Recalculer le score de confiance de l'évalué
      await this.mettreAJourScoreConfiance(evaluation.evalueId);
      
      return { success: true, message: 'Évaluation supprimée' };
      
    } catch (error) {
      throw new Error(`Erreur lors de la suppression: ${error.message}`);
    }
  }

  // Action spécialisée - Détection évaluations suspectes
  async detecterEvaluationsSuspectes(userId) {
    return await this.Evaluation.detecterEvaluationsSuspectes(userId);
  }

  // Action spécialisée - Impact sur score de confiance
  async mettreAJourScoreConfiance(userId) {
    const moyennes = await this.obtenirMoyenneNotes(userId);
    
    if (!moyennes) return;
    
    // Calcul du score de confiance basé sur les évaluations
    let scoreConfiance = 0;
    
    if (moyennes.nombreEvaluations >= 5) {
      // Score basé sur la moyenne globale et le nombre d'évaluations
      const facteurNombre = Math.min(moyennes.nombreEvaluations / 20, 1);
      const facteurNote = moyennes.moyenneGlobale / 5;
      
      scoreConfiance = Math.round((facteurNote * 0.7 + facteurNombre * 0.3) * 100);
    } else {
      // Score réduit pour peu d'évaluations
      scoreConfiance = Math.round((moyennes.moyenneGlobale / 5) * 60);
    }
    
    // Pénalités pour signalements
    const detectionSuspecte = await this.detecterEvaluationsSuspectes(userId);
    if (detectionSuspecte.suspect) {
      scoreConfiance = Math.max(scoreConfiance - 20, 0);
    }
    
    // Mettre à jour l'utilisateur
    await this.Utilisateur.findByIdAndUpdate(userId, {
      scoreConfiance,
      derniereMiseAJourScore: new Date()
    });
    
    return scoreConfiance;
  }

  // Statistiques globales
  async obtenirStatistiquesGlobales() {
    const stats = await this.Evaluation.aggregate([
      {
        $group: {
          _id: null,
          totalEvaluations: { $sum: 1 },
          moyenneGenerale: { $avg: '$notes.noteGlobale' },
          nombreSignalements: {
            $sum: { $cond: ['$estSignalement', 1, 0] }
          }
        }
      }
    ]);
    
    const repartitionNotes = await this.Evaluation.aggregate([
      {
        $bucket: {
          groupBy: '$notes.noteGlobale',
          boundaries: [1, 2, 3, 4, 5, 6],
          default: 'Autres',
          output: { count: { $sum: 1 } }
        }
      }
    ]);
    
    return {
      ...stats[0],
      repartitionNotes
    };
  }
}

module.exports = EvaluationService;