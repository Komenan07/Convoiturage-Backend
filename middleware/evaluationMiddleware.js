// middleware/evaluationMiddleware.js
const Evaluation = require('../models/Evaluation');
const Trajet = require('../models/Trajet');

// Middleware pour vérifier si l'utilisateur peut évaluer
const peutEvaluer = async (req, res, next) => {
  try {
    const { trajetId } = req.body;
    const userId = req.user.id;

    // Vérifier si le trajet existe
    const trajet = await Trajet.findById(trajetId)
      .populate('conducteurId passagers.utilisateurId');
    
    if (!trajet) {
      return res.status(404).json({
        success: false,
        message: 'Trajet introuvable'
      });
    }

    // Vérifier si l'utilisateur faisait partie du trajet
    const estConducteur = trajet.conducteurId._id.toString() === userId;
    const estPassager = trajet.passagers.some(p => 
      p.utilisateurId._id.toString() === userId
    );

    if (!estConducteur && !estPassager) {
      return res.status(403).json({
        success: false,
        message: 'Vous ne pouvez évaluer que les trajets auxquels vous avez participé'
      });
    }

    // Vérifier si le trajet est terminé
    if (trajet.statut !== 'TERMINE') {
      return res.status(400).json({
        success: false,
        message: 'Le trajet doit être terminé pour être évalué'
      });
    }

    // Ajouter les informations du trajet dans la requête
    req.trajet = trajet;
    req.estConducteur = estConducteur;
    
    next();
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la vérification des permissions'
    });
  }
};

// Middleware pour vérifier si l'évaluation n'existe pas déjà
const evaluationNonExistante = async (req, res, next) => {
  try {
    const { trajetId, evalueId } = req.body;
    const evaluateurId = req.user.id;

    // Déterminer l'ID de l'évalué selon le type d'évaluateur
    let finalEvalueId;
    if (req.estConducteur) {
      finalEvalueId = evalueId; // Le conducteur évalue un passager
    } else {
      finalEvalueId = req.trajet.conducteurId._id; // Le passager évalue le conducteur
    }

    // Vérifier si une évaluation existe déjà
    const evaluationExistante = await Evaluation.findOne({
      trajetId,
      evaluateurId,
      evalueId: finalEvalueId
    });

    if (evaluationExistante) {
      return res.status(409).json({
        success: false,
        message: 'Vous avez déjà évalué cette personne pour ce trajet'
      });
    }

    req.evalueId = finalEvalueId;
    next();
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la vérification de l\'évaluation existante'
    });
  }
};

// Middleware pour vérifier les permissions sur une évaluation
const peutAccederEvaluation = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const evaluation = await Evaluation.findById(id);
    
    if (!evaluation) {
      return res.status(404).json({
        success: false,
        message: 'Évaluation introuvable'
      });
    }

    // L'utilisateur peut accéder à l'évaluation s'il est l'évaluateur ou l'évalué
    const peutAcceder = evaluation.evaluateurId.toString() === userId || 
                       evaluation.evalueId.toString() === userId;

    if (!peutAcceder) {
      return res.status(403).json({
        success: false,
        message: 'Accès non autorisé à cette évaluation'
      });
    }

    req.evaluation = evaluation;
    next();
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la vérification des permissions'
    });
  }
};

// Middleware pour limiter les évaluations par utilisateur
const limiterEvaluationsQuotidiennes = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const aujourdhui = new Date();
    aujourdhui.setHours(0, 0, 0, 0);
    
    const demain = new Date(aujourdhui);
    demain.setDate(demain.getDate() + 1);

    // Compter les évaluations créées aujourd'hui
    const evaluationsAujourdhui = await Evaluation.countDocuments({
      evaluateurId: userId,
      dateEvaluation: {
        $gte: aujourdhui,
        $lt: demain
      }
    });

    // Limite de 10 évaluations par jour
    if (evaluationsAujourdhui >= 10) {
      return res.status(429).json({
        success: false,
        message: 'Limite quotidienne d\'évaluations atteinte (10 maximum)'
      });
    }

    next();
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la vérification des limites'
    });
  }
};

// Middleware pour vérifier la cohérence des signalements
const verifierCoherenceSignalement = (req, res, next) => {
  const { estSignalement, motifSignalement, gravite, notes } = req.body;

  if (estSignalement) {
    // Si c'est un signalement, vérifier que motif et gravité sont présents
    if (!motifSignalement || !gravite) {
      return res.status(400).json({
        success: false,
        message: 'Motif et gravité requis pour un signalement'
      });
    }

    // Si c'est un signalement grave, les notes doivent être cohérentes (< 3)
    if (gravite === 'GRAVE') {
      const notesArray = Object.values(notes);
      const moyenneNotes = notesArray.reduce((sum, note) => sum + note, 0) / notesArray.length;
      
      if (moyenneNotes > 3) {
        return res.status(400).json({
          success: false,
          message: 'Notes incohérentes avec la gravité du signalement'
        });
      }
    }
  }

  next();
};

// Middleware pour journaliser les actions importantes
const journaliserAction = (action) => {
  return (req, res, next) => {
    const originalSend = res.send;
    
    res.send = function(data) {
      // Log de l'action si succès
      if (res.statusCode < 400) {
        console.log(`[EVALUATION] ${action} - User: ${req.user?.id} - Time: ${new Date().toISOString()}`);
        
        // Log spécifique selon l'action
        switch (action) {
          case 'CREATE':
            console.log(`[EVALUATION] Nouvelle évaluation - Trajet: ${req.body?.trajetId}`);
            break;
          case 'SIGNALEMENT':
            console.log(`[EVALUATION] Signalement créé - Gravité: ${req.body?.gravite}`);
            break;
          case 'SUPPRESSION':
            console.log(`[EVALUATION] Évaluation supprimée - ID: ${req.params?.id}`);
            break;
        }
      }
      
      originalSend.call(this, data);
    };
    
    next();
  };
};

module.exports = {
  peutEvaluer,
  evaluationNonExistante,
  peutAccederEvaluation,
  limiterEvaluationsQuotidiennes,
  verifierCoherenceSignalement,
  journaliserAction
};