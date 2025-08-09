// controllers/EvaluationController.js
class EvaluationController {
  constructor(evaluationService) {
    this.evaluationService = evaluationService;
  }

  // POST /evaluations - Créer une évaluation
  async creerEvaluation(req, res) {
    try {
      const { trajetId, evalueId, notes, commentaire, aspectsPositifs, aspectsAmeliorer, estSignalement, motifSignalement, gravite } = req.body;
      const evaluateurId = req.user.id;

      // Validation des données
      if (!trajetId || !notes) {
        return res.status(400).json({
          success: false,
          message: 'Trajet et notes sont obligatoires'
        });
      }

      // Validation des notes (1-5)
      const notesValides = ['ponctualite', 'proprete', 'qualiteConduite', 'respect', 'communication']
        .every(critere => notes[critere] >= 1 && notes[critere] <= 5);

      if (!notesValides) {
        return res.status(400).json({
          success: false,
          message: 'Toutes les notes doivent être entre 1 et 5'
        });
      }

      const evaluation = await this.evaluationService.creerEvaluation({
        trajetId,
        evalueId,
        notes,
        commentaire,
        aspectsPositifs: aspectsPositifs || [],
        aspectsAmeliorer: aspectsAmeliorer || [],
        estSignalement: estSignalement || false,
        motifSignalement,
        gravite
      }, evaluateurId);

      res.status(201).json({
        success: true,
        message: 'Évaluation créée avec succès',
        data: evaluation
      });

    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  // GET /evaluations/user/:userId - Obtenir évaluations d'un utilisateur
  async obtenirEvaluationsUtilisateur(req, res) {
    try {
      const { userId } = req.params;
      const { page, limit, typeEvaluateur, notesMinimum } = req.query;

      const result = await this.evaluationService.obtenirEvaluationsUtilisateur(userId, {
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 10,
        typeEvaluateur,
        notesMinimum: notesMinimum ? parseFloat(notesMinimum) : undefined
      });

      res.json({
        success: true,
        data: result
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // GET /evaluations/user/:userId/moyenne - Obtenir moyenne notes utilisateur
  async obtenirMoyenneUtilisateur(req, res) {
    try {
      const { userId } = req.params;
      const moyenne = await this.evaluationService.obtenirMoyenneNotes(userId);

      res.json({
        success: true,
        data: moyenne
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // GET /evaluations/trajet/:trajetId - Obtenir évaluations d'un trajet
  async obtenirEvaluationsTrajet(req, res) {
    try {
      const { trajetId } = req.params;
      const evaluations = await this.evaluationService.obtenirEvaluationsTrajet(trajetId);

      res.json({
        success: true,
        data: evaluations
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // PUT /evaluations/:id/reponse - Répondre à une évaluation
  async repondreEvaluation(req, res) {
    try {
      const { id } = req.params;
      const { reponse } = req.body;
      const userId = req.user.id;

      if (!reponse || reponse.trim().length === 0) {
        return res.status(400).json({
          success: false,
          message: 'La réponse ne peut pas être vide'
        });
      }

      const evaluation = await this.evaluationService.repondreEvaluation(id, reponse.trim(), userId);

      res.json({
        success: true,
        message: 'Réponse ajoutée avec succès',
        data: evaluation
      });

    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  // POST /evaluations/:id/signaler - Signaler une évaluation abusive
  async signalerEvaluationAbusive(req, res) {
    try {
      const { id } = req.params;
      const { motif } = req.body;
      const userId = req.user.id;

      const result = await this.evaluationService.signalerEvaluationAbusive(id, motif, userId);

      res.json({
        success: true,
        data: result
      });

    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  // DELETE /evaluations/:id - Supprimer évaluation (admin)
  async supprimerEvaluation(req, res) {
    try {
      const { id } = req.params;
      const adminId = req.user.id;

      const result = await this.evaluationService.supprimerEvaluation(id, adminId);

      res.json({
        success: true,
        data: result
      });

    } catch (error) {
      res.status(403).json({
        success: false,
        message: error.message
      });
    }
  }

  // GET /evaluations/user/:userId/suspectes - Détecter évaluations suspectes
  async detecterEvaluationsSuspectes(req, res) {
    try {
      const { userId } = req.params;
      const detection = await this.evaluationService.detecterEvaluationsSuspectes(userId);

      res.json({
        success: true,
        data: detection
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // GET /evaluations/statistiques - Statistiques globales
  async obtenirStatistiquesGlobales(req, res) {
    try {
      const stats = await this.evaluationService.obtenirStatistiquesGlobales();

      res.json({
        success: true,
        data: stats
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }

  // PUT /evaluations/user/:userId/score - Recalculer score de confiance
  async recalculerScoreConfiance(req, res) {
    try {
      const { userId } = req.params;
      const score = await this.evaluationService.mettreAJourScoreConfiance(userId);

      res.json({
        success: true,
        message: 'Score de confiance mis à jour',
        data: { scoreConfiance: score }
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
}

module.exports = EvaluationController;