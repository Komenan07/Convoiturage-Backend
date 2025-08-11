class evaluationController {
  constructor(evaluationService) {
    this.evaluationService = evaluationService;

    // Auto-bind des méthodes
    const methods = [
      'creerEvaluation',
      'obtenirEvaluationsUtilisateur',
      'obtenirMoyenneUtilisateur',
      'obtenirEvaluationsTrajet',
      'repondreEvaluation',
      'signalerEvaluationAbusive',
      'supprimerEvaluation',
      'detecterEvaluationsSuspectes',
      'obtenirStatistiquesGlobales',
      'recalculerScoreConfiance'
    ];
    
    methods.forEach(method => {
      this[method] = this[method].bind(this);
    });
  }

  async creerEvaluation(req, res) {
    try {
      const {
        trajetId, 
        evalueId, 
        notes, 
        commentaire,
        aspectsPositifs = [], 
        aspectsAmeliorer = [],
        estSignalement = false, 
        motifSignalement, 
        gravite
      } = req.body;

      const evaluateurId = req.user.id;

      // Validation des données obligatoires
      if (!trajetId || !evalueId || !notes) {
        return res.status(400).json({ 
          success: false, 
          message: 'Trajet, utilisateur évalué et notes sont obligatoires' 
        });
      }

      // Validation des notes
      const criteres = ['ponctualite', 'proprete', 'qualiteConduite', 'respect', 'communication'];
      const notesValides = criteres.every(critere => {
        const note = notes[critere];
        return note !== undefined && Number.isInteger(note) && note >= 1 && note <= 5;
      });

      if (!notesValides) {
        return res.status(400).json({ 
          success: false, 
          message: 'Toutes les notes doivent être des entiers entre 1 et 5' 
        });
      }

      const evaluation = await this.evaluationService.creerEvaluation(
        {
          trajetId,
          evalueId,
          notes,
          commentaire,
          aspectsPositifs,
          aspectsAmeliorer,
          estSignalement,
          motifSignalement,
          gravite
        },
        evaluateurId
      );

      res.status(201).json({ 
        success: true, 
        message: 'Évaluation créée avec succès', 
        data: evaluation 
      });
    } catch (error) {
      const statusCode = error.statusCode || 400;
      res.status(statusCode).json({ 
        success: false, 
        message: error.message 
      });
    }
  }

  async obtenirEvaluationsUtilisateur(req, res) {
    try {
      const { userId } = req.params;
      const { page = 1, limit = 10, typeEvaluateur, notesMinimum } = req.query;

      const result = await this.evaluationService.obtenirEvaluationsUtilisateur(
        userId,
        {
          page: parseInt(page),
          limit: parseInt(limit),
          typeEvaluateur,
          notesMinimum: notesMinimum ? parseFloat(notesMinimum) : undefined
        }
      );

      res.json({ success: true, data: result });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json({ 
        success: false, 
        message: error.message 
      });
    }
  }

  async obtenirMoyenneUtilisateur(req, res) {
    try {
      const { userId } = req.params;
      const moyenne = await this.evaluationService.obtenirMoyenneNotes(userId);
      res.json({ success: true, data: moyenne });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json({ 
        success: false, 
        message: error.message 
      });
    }
  }

  async obtenirEvaluationsTrajet(req, res) {
    try {
      const { trajetId } = req.params;
      const evaluations = await this.evaluationService.obtenirEvaluationsTrajet(trajetId);
      res.json({ success: true, data: evaluations });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json({ 
        success: false, 
        message: error.message 
      });
    }
  }

  async repondreEvaluation(req, res) {
    try {
      const { id } = req.params;
      const { reponse } = req.body;
      const userId = req.user.id;

      if (!reponse?.trim()) {
        return res.status(400).json({ 
          success: false, 
          message: 'La réponse ne peut pas être vide' 
        });
      }

      const evaluation = await this.evaluationService.repondreEvaluation(
        id, 
        reponse.trim(), 
        userId
      );
      
      res.json({ 
        success: true, 
        message: 'Réponse ajoutée avec succès', 
        data: evaluation 
      });
    } catch (error) {
      const statusCode = error.statusCode || 400;
      res.status(statusCode).json({ 
        success: false, 
        message: error.message 
      });
    }
  }

  async signalerEvaluationAbusive(req, res) {
    try {
      const { id } = req.params;
      const { motif } = req.body;
      const userId = req.user.id;

      if (!motif?.trim()) {
        return res.status(400).json({ 
          success: false, 
          message: 'Le motif de signalement est obligatoire' 
        });
      }

      const result = await this.evaluationService.signalerEvaluationAbusive(
        id, 
        motif.trim(), 
        userId
      );
      
      res.json({ success: true, data: result });
    } catch (error) {
      const statusCode = error.statusCode || 400;
      res.status(statusCode).json({ 
        success: false, 
        message: error.message 
      });
    }
  }

  async supprimerEvaluation(req, res) {
    try {
      const { id } = req.params;
      const adminId = req.user.id;

      const result = await this.evaluationService.supprimerEvaluation(id, adminId);
      res.json({ success: true, data: result });
    } catch (error) {
      const statusCode = error.statusCode || 403;
      res.status(statusCode).json({ 
        success: false, 
        message: error.message 
      });
    }
  }

  async detecterEvaluationsSuspectes(req, res) {
    try {
      const { userId } = req.params;
      const detection = await this.evaluationService.detecterEvaluationsSuspectes(userId);
      res.json({ success: true, data: detection });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json({ 
        success: false, 
        message: error.message 
      });
    }
  }

  async obtenirStatistiquesGlobales(req, res) {
    try {
      const stats = await this.evaluationService.obtenirStatistiquesGlobales();
      res.json({ success: true, data: stats });
    } catch (error) {
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json({ 
        success: false, 
        message: error.message 
      });
    }
  }

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
      const statusCode = error.statusCode || 500;
      res.status(statusCode).json({ 
        success: false, 
        message: error.message 
      });
    }
  }
}

module.exports = evaluationController;