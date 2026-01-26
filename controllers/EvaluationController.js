const AppError = require('../utils/AppError');
const Evaluation = require('../models/Evaluation'); 

const logger = console; 

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
      'recalculerScoreConfiance',
      'creerEvaluationEnAttente',
      'completerEvaluation',
      'obtenirEvaluationsEnAttente',
      'obtenirStatsPourBadges',
      'masquerEvaluation',
      'demasquerEvaluation',
      'obtenirMeilleuresEvaluations',
      'verifierDelaiEvaluation',
      'validerLangueCommentaire', 
      'obtenirPrisesEnChargeTrajet',
      'signalerPriseEnCharge',
      'getEvaluationPourRepondre'
    ];
    
    methods.forEach(method => {
      this[method] = this[method].bind(this);
    });
  }

  /**
   * ⭐ Créer une évaluation en attente après un trajet
   * Remplace creerEvaluation pour le workflow initial
   */
  async creerEvaluationEnAttente(req, res, next) {
  try {
    const { trajetId, evalueId, typeEvaluateur } = req.body;
    const evaluateurId = req.user.id;

    // Validation des données obligatoires
    if (!trajetId || !evalueId || !typeEvaluateur) {
      return res.status(400).json({ 
        success: false, 
        message: 'Trajet, utilisateur évalué et type d\'évaluateur sont obligatoires' 
      });
    }

    // Validation du type d'évaluateur
    if (!['CONDUCTEUR', 'PASSAGER'].includes(typeEvaluateur)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Type d\'évaluateur invalide. Doit être CONDUCTEUR ou PASSAGER' 
      });
    }

    const evaluation = await this.evaluationService.creerEvaluationEnAttente(
      trajetId,
      evaluateurId,
      evalueId,
      typeEvaluateur
    );

    res.status(201).json({ 
      success: true, 
      message: 'Évaluation créée en attente. Veuillez la compléter dans les 7 jours.', 
      data: evaluation 
    });
  } catch (error) {
    // Gérer les erreurs métier spécifiques
    if (error.message.includes('déjà créé une évaluation')) {
      return res.status(409).json({
        success: false,
        message: error.message,
        code: 'EVALUATION_ALREADY_EXISTS'
      });
    }

    if (error.message.includes('Trajet introuvable') || error.message.includes('Utilisateur introuvable')) {
      return res.status(404).json({
        success: false,
        message: error.message,
        code: 'RESOURCE_NOT_FOUND'
      });
    }

    if (error.message.includes('n\'avez pas participé') || error.message.includes('ne pouvez pas')) {
      return res.status(403).json({
        success: false,
        message: error.message,
        code: 'FORBIDDEN'
      });
    }

    // Erreur serveur non gérée
    logger.error('Erreur création évaluation en attente:', error);
    return next(AppError.serverError('Erreur serveur lors de la création de l\'évaluation', { originalError: error.message }));
  }
}

  /**
 * Compléter une évaluation en attente
 * C'est la méthode principale pour évaluer après un trajet
 */
  async completerEvaluation(req, res, next) {
  try {
    const { id } = req.params;
    const {
      notes, 
      commentaire,
      aspectsPositifs = [], 
      aspectsAmeliorer = [],
      estSignalement = false, 
      motifSignalement, 
      gravite
    } = req.body;

    const userId = req.user.id;

    // Validation des notes obligatoires
    if (!notes) {
      return res.status(400).json({ 
        success: false, 
        message: 'Les notes sont obligatoires' 
      });
    }

    // Validation des critères de notes
    const criteres = ['ponctualite', 'proprete', 'qualiteConduite', 'respect', 'communication'];
    const notesValides = criteres.every(critere => {
      const note = notes[critere];
      return note !== undefined && Number.isInteger(note) && note >= 1 && note <= 5;
    });

    if (!notesValides) {
      return res.status(400).json({ 
        success: false, 
        message: 'Toutes les notes doivent être des entiers entre 1 et 5 (ponctualite, proprete, qualiteConduite, respect, communication)' 
      });
    }

    // Validation de la langue française
    if (commentaire && commentaire.trim().length > 0) {
      const detection = Evaluation.detecterLangue(commentaire);

      if (!detection.estFrancais) {
        return res.status(400).json({ 
          success: false, 
          message: 'Le commentaire doit être rédigé en français conformément à la réglementation ivoirienne',
          details: {
            langueDetectee: detection.langue,
            confiance: detection.confiance,
            suggestion: 'Veuillez reformuler votre commentaire en français'
          }
        });
      }

      logger.info(`✅ Commentaire validé en français (confiance: ${detection.confiance}%)`);
    }

    // ✅ Appel du service sans typeUtilisateur
    const evaluation = await this.evaluationService.completerEvaluation(
      id,
      userId,
      null,  // Le service déterminera automatiquement
      {
        notes,
        commentaire,
        aspectsPositifs,
        aspectsAmeliorer,
        estSignalement,
        motifSignalement,
        gravite
      }
    );

    res.json({ 
      success: true, 
      message: 'Évaluation complétée avec succès', 
      data: evaluation 
    });
  } catch (error) {
    logger.error('Erreur complétion évaluation:', error);
    
    if (error.message.includes('non trouvée')) {
      return next(AppError.notFound('Évaluation non trouvée'));
    }
    if (error.message.includes('pas autorisé') || error.message.includes('expiré')) {
      return next(AppError.forbidden(error.message));
    }
    
    return next(AppError.serverError('Erreur serveur lors de la complétion de l\'évaluation', { originalError: error.message }));
  }
  }

  /**
 * 🆕 Signaler qu'un passager a été pris en charge
 * Fonctionnalité anti-fraude pour éviter les doubles prises en charge
 */
  async signalerPriseEnCharge(req, res, next) {
    try {
      const { trajetId, passagerId, localisation } = req.body;
      const conducteurId = req.user._id; // ✅ CORRECTION : Utiliser _id

      // Validation des données obligatoires
      if (!trajetId || !passagerId) {
        return res.status(400).json({ 
          success: false, 
          message: 'Trajet et passager sont obligatoires' 
        });
      }

      if (!localisation || !localisation.latitude || !localisation.longitude) {
        return res.status(400).json({ 
          success: false, 
          message: 'La localisation (latitude, longitude) est obligatoire' 
        });
      }

      // Valider le format des coordonnées
      const lat = parseFloat(localisation.latitude);
      const lng = parseFloat(localisation.longitude);

      if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        return res.status(400).json({ 
          success: false, 
          message: 'Coordonnées GPS invalides' 
        });
      }

      // ✅ Appeler le service (AJOUTER LA MÉTHODE DANS evaluationService)
      const result = await this.evaluationService.signalerPriseEnCharge(
        trajetId,
        conducteurId,
        passagerId,
        { latitude: lat, longitude: lng }
      );

      // Déterminer le message de réponse
      let message = 'Prise en charge confirmée avec succès';

      if (result.alerteFraude) {
        message = `⚠️ ALERTE: ${result.nombreConducteursProches} autre(s) conducteur(s) ont signalé une prise en charge à proximité`;
      }

      res.status(200).json({ 
        success: true, 
        message,
        data: result,
        alerte: result.alerteFraude ? {
          type: 'FRAUDE_POTENTIELLE',
          gravite: result.nombreConducteursProches > 1 ? 'ELEVEE' : 'MOYENNE',
          detail: `${result.nombreConducteursProches} conducteur(s) dans un rayon de 500m`
        } : null
      });
    } catch (error) {
      logger.error('Erreur signalement prise en charge:', error);
      
      if (error.message.includes('non trouvée') || error.message.includes('introuvable')) {
        return next(AppError.notFound(error.message));
      }
      if (error.message.includes('déjà confirmée')) {
        return next(AppError.conflict(error.message));
      }
      
      return next(AppError.serverError('Erreur serveur lors du signalement de prise en charge', { originalError: error.message }));
    }
  }

  /**
   * 🆕 Valider la langue d'un commentaire
   * Endpoint pour vérifier si un commentaire est en français avant soumission
   */
  async validerLangueCommentaire(req, res, next) {
    try {
      const { commentaire } = req.body;

      if (!commentaire || commentaire.trim().length === 0) {
        return res.status(400).json({ 
          success: false, 
          message: 'Le commentaire est obligatoire' 
        });
      }

      const Evaluation = require('../models/Evaluation');
      const detection = Evaluation.detecterLangue(commentaire);

      res.json({ 
        success: true, 
        data: {
          estFrancais: detection.estFrancais,
          langue: detection.langue,
          confiance: detection.confiance,
          message: detection.estFrancais ? 
            '✅ Commentaire en français validé' : 
            `⚠️ Le commentaire doit être rédigé en français. Langue détectée: ${detection.langue}`,
          accepte: detection.estFrancais
        }
      });
    } catch (error) {
      logger.error('Erreur validation langue:', error);
      return next(AppError.serverError('Erreur serveur lors de la validation de la langue', { originalError: error.message }));
    }
  }

  /**
   * 🆕 Obtenir l'historique des prises en charge d'un trajet
   * Pour détecter les fraudes et conflits
   */
  async obtenirPrisesEnChargeTrajet(req, res, next) {
    try {
      const { trajetId } = req.params;

      const prisesEnCharge = await this.evaluationService.obtenirPrisesEnChargeTrajet(trajetId);

      res.json({ 
        success: true, 
        count: prisesEnCharge.length,
        data: prisesEnCharge,
        alerte: prisesEnCharge.some(p => p.alerteDoublon) ? {
          type: 'DOUBLONS_DETECTES',
          message: 'Des doublons de prise en charge ont été détectés'
        } : null
      });
    } catch (error) {
      logger.error('Erreur récupération prises en charge:', error);
      return next(AppError.serverError('Erreur serveur lors de la récupération des prises en charge', { originalError: error.message }));
    }
  }

  async creerEvaluation(req, res, next) {
  try {
    const {
      trajetId, 
      evalueId, 
      typeEvaluateur, // ✅ AJOUT DU CHAMP MANQUANT
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
    if (!trajetId || !evalueId || !notes || !typeEvaluateur) { // ✅ VALIDATION AJOUTÉE
      return res.status(400).json({ 
        success: false, 
        message: 'Trajet, utilisateur évalué, type d\'évaluateur et notes sont obligatoires' 
      });
    }

    // ✅ VALIDATION DU TYPE D'ÉVALUATEUR
    if (!['CONDUCTEUR', 'PASSAGER'].includes(typeEvaluateur)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Type d\'évaluateur invalide. Doit être CONDUCTEUR ou PASSAGER' 
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
        message: 'Toutes les notes doivent être des entiers entre 1 et 5 (ponctualite, proprete, qualiteConduite, respect, communication)' 
      });
    }

    // ✅ PASSAGE DU typeEvaluateur AU SERVICE
    const evaluation = await this.evaluationService.creerEvaluation(
      {
        trajetId,
        evalueId,
        typeEvaluateur, 
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
    logger.error('❌ Erreur création évaluation:', error);
    return next(AppError.serverError('Erreur serveur lors de la création de l\'évaluation', { originalError: error.message }));
  }
}

  /**
   *  Obtenir les évaluations en attente d'un utilisateur
   */
  async obtenirEvaluationsEnAttente(req, res, next) {
    try {
      const userId = req.user.id; // L'utilisateur connecté

      const evaluations = await this.evaluationService.obtenirEvaluationsEnAttente(userId);

      res.json({ 
        success: true, 
        count: evaluations.length,
        message: evaluations.length > 0 
          ? `Vous avez ${evaluations.length} évaluation(s) en attente` 
          : 'Aucune évaluation en attente',
        data: evaluations 
      });
    } catch (error) {
      logger.error('Erreur récupération évaluations en attente:', error);
      return next(AppError.serverError('Erreur serveur lors de la récupération des évaluations en attente', { originalError: error.message }));
    }
  }

  /**
   *  Vérifier le délai restant pour une évaluation
   */
  async verifierDelaiEvaluation(req, res, next) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      const delai = await this.evaluationService.verifierDelaiEvaluation(id, userId);

      res.json({ 
        success: true, 
        data: delai,
        message: delai.expire 
          ? 'Le délai d\'évaluation est expiré' 
          : `Il vous reste ${delai.joursRestants} jour(s) pour compléter cette évaluation`
      });
    } catch (error) {
      logger.error('Erreur vérification délai:', error);
      return next(AppError.serverError('Erreur serveur lors de la vérification du délai', { originalError: error.message }));
    }
  }

  async obtenirEvaluationsUtilisateur(req, res, next) {
    try {
      const { userId } = req.params;
      const { page = 1, limit = 10, typeEvaluateur, notesMinimum } = req.query;

      const result = await this.evaluationService.obtenirEvaluationsUtilisateur(
        userId,
        {
          page: parseInt(page),
          limit: parseInt(limit),
          typeEvaluateur,
          notesMinimum: notesMinimum ? parseFloat(notesMinimum) : undefined,
        
        }
      );

      res.json({ success: true, data: result });
    } catch (error) {
      logger.error('Erreur récupération évaluations:', error);
      return next(AppError.serverError('Erreur serveur lors de la récupération des évaluations', { originalError: error.message }));
    }
  }

  async obtenirMoyenneUtilisateur(req, res, next) {
    try {
      const { userId } = req.params;
      const moyenne = await this.evaluationService.obtenirMoyenneNotes(userId);
      res.json({ success: true, data: moyenne });
    } catch (error) {
      logger.error('Erreur récupération moyenne utilisateur:', error);
      return next(AppError.serverError('Erreur serveur lors de la récupération de la moyenne', { originalError: error.message }));
    }
  }

  async obtenirEvaluationsTrajet(req, res, next) {
    try {
      const { trajetId } = req.params;
      const evaluations = await this.evaluationService.obtenirEvaluationsTrajet(trajetId);
      res.json({ success: true, data: evaluations });
    } catch (error) {
      logger.error('Erreur récupération évaluation:', error);
      return next(AppError.serverError('Erreur serveur lors de la récupération de l\'évaluation', { originalError: error.message }));
    }
  }

  async repondreEvaluation(req, res, next) {
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
      logger.error('Erreur réponse évaluation:', error);
      return next(AppError.serverError('Erreur serveur lors de l\'ajout de la réponse', { originalError: error.message }));
    }
  }

  // EvaluationController.js - Méthode temporaire de debug
  async getEvaluationPourRepondre(req, res) {
    try {
      const userId = req.user.id;

      const evaluations = await Evaluation.find({
        evalueId: userId,
        statutEvaluation: 'COMPLETEE',
        reponseEvalue: { $exists: false }
      })
      .populate('evaluateurId', 'nom prenom')
      .populate('trajetId', 'pointDepart pointArrivee')
      .sort({ dateEvaluation: -1 })
      .limit(10);

      res.json({
        success: true,
        message: `${evaluations.length} évaluation(s) sans réponse trouvée(s)`,
        data: evaluations.map(e => ({
          id: e._id,
          evaluateur: e.evaluateurId,
          trajet: e.trajetId,
          note: e.notes.noteGlobale,
          commentaire: e.commentaire,
          date: e.dateEvaluation
        }))
      });

    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }

  async signalerEvaluationAbusive(req, res, next) {
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
      logger.error('Erreur signalement évaluation:', error);
      return next(AppError.serverError('Erreur serveur lors du signalement', { originalError: error.message }));
    }
  }

  /**
   * Masquer une évaluation (modération admin)
   */
  async masquerEvaluation(req, res, next) {
    try {
      const { id } = req.params;
      const { raison } = req.body;
      const adminId = req.user.id;

      // Vérifier que c'est un admin
      if (!req.user.isAdmin && req.user.role !== 'ADMIN') {
        return next(AppError.forbidden('Seuls les administrateurs peuvent masquer des évaluations'));
      }

      if (!raison?.trim()) {
        return res.status(400).json({ 
          success: false, 
          message: 'La raison du masquage est obligatoire' 
        });
      }

      const evaluation = await this.evaluationService.masquerEvaluation(
        id, 
        raison.trim(), 
        adminId
      );

      res.json({ 
        success: true, 
        message: 'Évaluation masquée avec succès', 
        data: evaluation 
      });
    } catch (error) {
      logger.error('Erreur masquage évaluation:', error);
      return next(AppError.serverError('Erreur serveur lors du masquage de l\'évaluation', { originalError: error.message }));
    }
  }

  /**
   *  Démasquer une évaluation (modération admin)
   */
  async demasquerEvaluation(req, res, next) {
    try {
      const { id } = req.params;
      const adminId = req.user.id;

      // Vérifier que c'est un admin
      if (!req.user.isAdmin && req.user.role !== 'ADMIN') {
        return next(AppError.forbidden('Seuls les administrateurs peuvent démasquer des évaluations'));
      }

      const evaluation = await this.evaluationService.demasquerEvaluation(id, adminId);

      res.json({ 
        success: true, 
        message: 'Évaluation démasquée avec succès', 
        data: evaluation 
      });
    } catch (error) {
      logger.error('Erreur démasquage évaluation:', error);
      return next(AppError.serverError('Erreur serveur lors du démasquage de l\'évaluation', { originalError: error.message }));
    }
  }


  async supprimerEvaluation(req, res, next) {
    try {
      const { id } = req.params;
      const adminId = req.user.id;

      const result = await this.evaluationService.supprimerEvaluation(id, adminId);
      res.json({ success: true, data: result });
    } catch (error) {
      logger.error('Erreur suppression évaluation:', error);
      return next(AppError.serverError('Erreur serveur lors de la suppression de l\'évaluation', { originalError: error.message }));
    }
  }

  async detecterEvaluationsSuspectes(req, res, next) {
    try {
      const { userId } = req.params;
      const detection = await this.evaluationService.detecterEvaluationsSuspectes(userId);
      res.json({ success: true, data: detection });
    } catch (error) {
      logger.error('Erreur détection évaluations suspectes:', error);
      return next(AppError.serverError('Erreur serveur lors de la détection', { originalError: error.message }));
    }
  }

  async obtenirStatistiquesGlobales(req, res, next) {
    try {
      const stats = await this.evaluationService.obtenirStatistiquesGlobales();
      res.json({ success: true, data: stats });
    } catch (error) {
      logger.error('Erreur récupération statistiques globales:', error);
      return next(AppError.serverError('Erreur serveur lors de la récupération des statistiques', { originalError: error.message }));
    }
  }

  /**
   * Obtenir les statistiques pour les badges
   */
  async obtenirStatsPourBadges(req, res, next) {
    try {
      const { userId } = req.params;
      
      const stats = await this.evaluationService.obtenirStatsPourBadges(userId);

      if (!stats) {
        return res.json({ 
          success: true, 
          message: 'Pas assez d\'évaluations pour calculer les badges',
          data: null 
        });
      }

      res.json({ 
        success: true, 
        data: stats,
        message: stats.badgesSuggeres?.length > 0 
          ? `${stats.badgesSuggeres.length} badge(s) suggéré(s)` 
          : 'Continuez vos efforts pour débloquer des badges'
      });
    } catch (error) {
      logger.error('Erreur récupération stats badges:', error);
      return next(AppError.serverError('Erreur serveur lors de la récupération des statistiques pour badges', { originalError: error.message }));
    }
  }

  /**
   *  Obtenir les meilleures évaluations
   */
  async obtenirMeilleuresEvaluations(req, res, next) {
    try {
      const { limit = 10 } = req.query;

      const evaluations = await this.evaluationService.obtenirMeilleuresEvaluations(
        parseInt(limit)
      );

      res.json({ 
        success: true, 
        count: evaluations.length,
        data: evaluations 
      });
    } catch (error) {
      logger.error('Erreur récupération meilleures évaluations:', error);
      return next(AppError.serverError('Erreur serveur lors de la récupération des meilleures évaluations', { originalError: error.message }));
    }
  }

  async recalculerScoreConfiance(req, res, next) {
    try {
      const { userId } = req.params;
      const score = await this.evaluationService.mettreAJourScoreConfiance(userId);
      res.json({ 
        success: true, 
        message: 'Score de confiance mis à jour', 
        data: { scoreConfiance: score } 
      });
    } catch (error) {
      logger.error('Erreur recalcul score confiance:', error);
      return next(AppError.serverError('Erreur serveur lors du recalcul du score', { originalError: error.message }));
    }
  }
}

const evaluationService = require('../services/EvaluationService');
module.exports = new evaluationController(evaluationService);