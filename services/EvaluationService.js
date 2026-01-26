// services/evaluationService.js
const Evaluation = require('../models/Evaluation');
const Trajet = require('../models/Trajet');
const Reservation = require('../models/Reservation');
const Utilisateur = require('../models/Utilisateur');
const { logger } = require('../utils/logger');

class EvaluationService {
  
  // ========================================
  // 🆕 WORKFLOW ÉVALUATION EN ATTENTE
  // ========================================

  /**
   * Créer une évaluation en attente
   */
  async creerEvaluationEnAttente(trajetId, evaluateurId, evalueId, typeEvaluateur) {
    try {
      // Vérifier qu'une évaluation n'existe pas déjà
      const existante = await Evaluation.findOne({
        trajetId,
        evaluateurId
      });

      if (existante) {
        throw new Error('Vous avez déjà créé une évaluation pour ce trajet');
      }

      // Créer l'évaluation en attente
      const evaluation = new Evaluation({
        trajetId,
        evaluateurId,
        evalueId,
        typeEvaluateur,
        statutEvaluation: 'EN_ATTENTE',
        evaluationObligatoire: typeEvaluateur === 'PASSAGER'
      });

      await evaluation.save();

      logger.info('✅ Évaluation en attente créée', { trajetId, evaluateurId, evalueId });

      return evaluation;
    } catch (error) {
      logger.error('❌ Erreur création évaluation en attente:', error);
      throw error;
    }
  }

  /**
   * Compléter une évaluation en attente
   */
  /**
 * Compléter une évaluation en attente
 */
  async completerEvaluation(evaluationId, userId, typeUtilisateur, donnees) {
  try {
    const evaluation = await Evaluation.findById(evaluationId);

    if (!evaluation) {
      throw new Error('Évaluation non trouvée');
    }

    // ✅ VÉRIFICATION : Est-ce le bon évaluateur ?
    if (evaluation.evaluateurId.toString() !== userId.toString()) {
      throw new Error('Vous n\'êtes pas autorisé à compléter cette évaluation');
    }

    // ✅ Si déjà complétée, retourner l'évaluation existante (comportement idempotent)
    if (evaluation.statutEvaluation === 'COMPLETEE') {
      logger.info('ℹ️ Évaluation déjà complétée, retour de l\'existante', { 
        evaluationId, 
        userId 
      });
      return evaluation; // ✅ Retourne au lieu de throw
    }

    // ✅ Vérifier si expirée
    if (evaluation.statutEvaluation === 'EXPIREE') {
      throw new Error('Cette évaluation a expiré');
    }

    // ✅ Vérifier le délai (7 jours)
    const delai = evaluation.calculerDelaiRestant();
    if (delai.expire) {
      evaluation.statutEvaluation = 'EXPIREE';
      await evaluation.save();
      throw new Error('Le délai pour compléter cette évaluation est expiré');
    }

    // ✅ Mettre à jour l'évaluation
    evaluation.notes = {
      ponctualite: donnees.notes.ponctualite,
      proprete: donnees.notes.proprete,
      qualiteConduite: donnees.notes.qualiteConduite,
      respect: donnees.notes.respect,
      communication: donnees.notes.communication,
      // noteGlobale sera calculée par le pre-save hook
    };
    
    evaluation.commentaire = donnees.commentaire;
    evaluation.aspectsPositifs = donnees.aspectsPositifs || [];
    evaluation.aspectsAmeliorer = donnees.aspectsAmeliorer || [];
    evaluation.estSignalement = donnees.estSignalement || false;
    evaluation.motifSignalement = donnees.motifSignalement;
    evaluation.gravite = donnees.gravite;
    evaluation.statutEvaluation = 'COMPLETEE';
    evaluation.dateCompletion = new Date();

    await evaluation.save();

    // ✅ Mettre à jour le score de confiance de l'utilisateur évalué
    await this.mettreAJourScoreConfiance(evaluation.evalueId);

    logger.info('✅ Évaluation complétée', { 
      evaluationId, 
      userId,
      noteGlobale: evaluation.notes.noteGlobale 
    });

    return evaluation;
  } catch (error) {
    logger.error('❌ Erreur complétion évaluation:', error);
    throw error;
  }
  }

  /**
   * Obtenir les évaluations en attente d'un utilisateur
   */
  async obtenirEvaluationsEnAttente(userId) {
    try {
      return await Evaluation.getEvaluationsEnAttente(userId);
    } catch (error) {
      logger.error('❌ Erreur récupération évaluations en attente:', error);
      throw error;
    }
  }

  /**
   * Vérifier le délai d'une évaluation
   */
  async verifierDelaiEvaluation(evaluationId, userId) {
    try {
      const evaluation = await Evaluation.findOne({
        _id: evaluationId,
        evaluateurId: userId
      });

      if (!evaluation) {
        throw new Error('Évaluation non trouvée');
      }

      return evaluation.calculerDelaiRestant();
    } catch (error) {
      logger.error('❌ Erreur vérification délai:', error);
      throw error;
    }
  }

  // ========================================
  // 🆕 PRISE EN CHARGE (ANTI-FRAUDE)
  // ========================================

  /**
   * Signaler une prise en charge
   */
  async signalerPriseEnCharge(trajetId, conducteurId, passagerId, localisation) {
    try {
      // 1. Vérifier que le trajet existe
      const trajet = await Trajet.findById(trajetId);
      if (!trajet) {
        throw new Error('Trajet introuvable');
      }

      // 2. Vérifier que c'est bien le conducteur du trajet
      if (trajet.conducteurId.toString() !== conducteurId.toString()) {
        throw new Error('Vous n\'êtes pas le conducteur de ce trajet');
      }

      // 3. Vérifier que le passager a une réservation confirmée
      const reservation = await Reservation.findOne({
        trajetId,
        passagerId,
        statutReservation: 'CONFIRMEE' 
      });

      if (!reservation) {
        throw new Error('Aucune réservation confirmée trouvée pour ce passager');
      }

      // 4. Vérifier si déjà confirmée
      const evaluationExistante = await Evaluation.findOne({
        trajetId,
        evalueId: passagerId,
        'priseEnCharge.confirmee': true
      });

      if (evaluationExistante) {
        throw new Error('Prise en charge déjà confirmée pour ce passager');
      }

      // 5. Détecter conducteurs proches (anti-fraude)
      const detection = await Evaluation.detecterConducteursProches(
        trajetId,
        [localisation.longitude, localisation.latitude],
        500
      );

      // 6. Créer ou mettre à jour l'évaluation avec prise en charge
      const evaluation = await Evaluation.findOneAndUpdate(
        {
          trajetId,
          evaluateurId: conducteurId,
          evalueId: passagerId
        },
        {
          $set: {
            'priseEnCharge.confirmee': true,
            'priseEnCharge.datePriseEnCharge': new Date(),
            'priseEnCharge.localisationPriseEnCharge': {
              type: 'Point',
              coordinates: [localisation.longitude, localisation.latitude]
            },
            'priseEnCharge.conducteurConfirmateur': conducteurId,
            'priseEnCharge.alerteDoublon': detection.alerteFraude,
            'priseEnCharge.nombreConducteursProches': detection.nombreConducteurs
          }
        },
        { 
          new: true, 
          upsert: true
        }
      );

      logger.info('✅ Prise en charge confirmée', {
        trajetId,
        conducteurId,
        passagerId,
        alerteFraude: detection.alerteFraude
      });

      return {
        evaluation,
        alerteFraude: detection.alerteFraude,
        nombreConducteursProches: detection.nombreConducteurs,
        localisation
      };

    } catch (error) {
      logger.error('❌ Erreur signalement prise en charge:', error);
      throw error;
    }
  }

  /**
   * Obtenir les prises en charge d'un trajet
   */
  async obtenirPrisesEnChargeTrajet(trajetId) {
    try {
      const prisesEnCharge = await Evaluation.find({
        trajetId,
        'priseEnCharge.confirmee': true
      })
      .populate('evaluateurId', 'nom prenom')
      .populate('evalueId', 'nom prenom')
      .select('priseEnCharge evaluateurId evalueId')
      .sort({ 'priseEnCharge.datePriseEnCharge': -1 });

      return prisesEnCharge;
    } catch (error) {
      logger.error('❌ Erreur récupération prises en charge:', error);
      throw error;
    }
  }

  // ========================================
  // 📊 STATISTIQUES & BADGES
  // ========================================

  /**
   * Obtenir stats pour badges
   */
  async obtenirStatsPourBadges(userId) {
    try {
      return await Evaluation.getStatsForBadges(userId);
    } catch (error) {
      logger.error('❌ Erreur stats badges:', error);
      throw error;
    }
  }

  /**
   * Obtenir meilleures évaluations
   */
  async obtenirMeilleuresEvaluations(limit = 10) {
    try {
      return await Evaluation.getMeilleuresEvaluations(limit);
    } catch (error) {
      logger.error('❌ Erreur meilleures évaluations:', error);
      throw error;
    }
  }

  /**
   * Obtenir statistiques globales
   */
  async obtenirStatistiquesGlobales() {
    try {
      const stats = await Evaluation.aggregate([
        {
          $group: {
            _id: null,
            totalEvaluations: { $sum: 1 },
            moyenneGlobale: { $avg: '$notes.noteGlobale' },
            totalSignalements: {
              $sum: { $cond: ['$estSignalement', 1, 0] }
            }
          }
        }
      ]);

      return stats[0] || { totalEvaluations: 0, moyenneGlobale: 0, totalSignalements: 0 };
    } catch (error) {
      logger.error('❌ Erreur statistiques globales:', error);
      throw error;
    }
  }

  // ========================================
  // 👨‍💼 MODÉRATION ADMIN
  // ========================================

  /**
   * Masquer une évaluation (admin)
   */
  async masquerEvaluation(evaluationId, raison, adminId) {
    try {
      const evaluation = await Evaluation.findById(evaluationId);

      if (!evaluation) {
        throw new Error('Évaluation non trouvée');
      }

      evaluation.visibilite = 'MASQUEE';
      evaluation.raisonMasquage = raison;
      evaluation.dateRevision = new Date();

      await evaluation.save();

      logger.info('✅ Évaluation masquée par admin', { evaluationId, adminId });

      return evaluation;
    } catch (error) {
      logger.error('❌ Erreur masquage évaluation:', error);
      throw error;
    }
  }

  /**
   * Démasquer une évaluation (admin)
   */
  async demasquerEvaluation(evaluationId, adminId) {
    try {
      const evaluation = await Evaluation.findById(evaluationId);

      if (!evaluation) {
        throw new Error('Évaluation non trouvée');
      }

      evaluation.visibilite = 'PUBLIQUE';
      evaluation.raisonMasquage = null;

      await evaluation.save();

      logger.info('✅ Évaluation démasquée par admin', { evaluationId, adminId });

      return evaluation;
    } catch (error) {
      logger.error('❌ Erreur démasquage évaluation:', error);
      throw error;
    }
  }

  // ========================================
  // 📝 MÉTHODES EXISTANTES (conservées)
  // ========================================

  /**
 * Créer une évaluation (ancienne méthode - déprécié, utiliser workflow en attente)
 */
  async creerEvaluation(data, evaluateurId) {
    try {
      const existe = await Evaluation.findOne({
        trajetId: data.trajetId,
        evaluateurId: evaluateurId,
        evalueId: data.evalueId
      });
      
      if (existe) {
        throw new Error('Vous avez déjà évalué cet utilisateur pour ce trajet');
      }

      if (!data.trajetId || !data.evalueId || !data.notes) {
        throw new Error('Données manquantes : trajetId, evalueId et notes sont requis');
      }

      if (evaluateurId === data.evalueId) {
        throw new Error('Vous ne pouvez pas vous évaluer vous-même');
      }

      // ✅ CALCULER LA NOTE GLOBALE AVANT LA CRÉATION
      const { ponctualite, proprete, qualiteConduite, respect, communication } = data.notes;
      
      if (!ponctualite || !proprete || !qualiteConduite || !respect || !communication) {
        throw new Error('Toutes les notes sont obligatoires');
      }

      const noteGlobale = (ponctualite + proprete + qualiteConduite + respect + communication) / 5;

      // ✅ CRÉER L'ÉVALUATION AVEC LA NOTE GLOBALE CALCULÉE
      const evaluation = new Evaluation({
        trajetId: data.trajetId,
        evaluateurId,
        evalueId: data.evalueId,
        typeEvaluateur: data.typeEvaluateur, // ✅ IMPORTANT
        notes: {
          ponctualite,
          proprete,
          qualiteConduite,
          respect,
          communication,
          noteGlobale: Math.round(noteGlobale * 10) / 10 // ✅ CALCULÉE ICI
        },
        commentaire: data.commentaire,
        aspectsPositifs: data.aspectsPositifs || [],
        aspectsAmeliorer: data.aspectsAmeliorer || [],
        estSignalement: data.estSignalement || false,
        motifSignalement: data.motifSignalement,
        gravite: data.gravite,
        statutEvaluation: 'COMPLETEE',
        dateEvaluation: new Date(),
        dateCompletion: new Date()
      });

      await evaluation.save();
      
      logger.info('✅ Évaluation créée avec succès', { 
        evaluationId: evaluation._id,
        noteGlobale: evaluation.notes.noteGlobale 
      });

      // Mettre à jour le score de confiance
      await this.mettreAJourScoreConfiance(evaluation.evalueId);

      return evaluation;
    } catch (error) {
      logger.error('❌ Erreur création évaluation:', error);
      throw error;
    }
  }

  /**
   * Obtenir les évaluations d'un utilisateur
   */
  async obtenirEvaluationsUtilisateur(userId, options = {}) {
    try {
      const { page = 1, limit = 10, typeEvaluateur, notesMinimum } = options;
      
      const query = { 
        evalueId: userId, 
        statutEvaluation: 'COMPLETEE',
        visibilite: 'PUBLIQUE'
      };
      
      if (typeEvaluateur) query.typeEvaluateur = typeEvaluateur;
      if (notesMinimum) query['notes.noteGlobale'] = { $gte: notesMinimum };

      const evaluations = await Evaluation.find(query)
        .populate('evaluateurId', 'nom prenom photoProfil')
        .populate('trajetId', 'depart arrivee dateDepart')
        .sort({ dateEvaluation: -1 })
        .skip((page - 1) * limit)
        .limit(limit);

      const total = await Evaluation.countDocuments(query);

      return {
        evaluations,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };
    } catch (error) {
      logger.error('❌ Erreur récupération évaluations utilisateur:', error);
      throw error;
    }
  }

  /**
   * Obtenir la moyenne des notes d'un utilisateur
   */
  async obtenirMoyenneNotes(userId) {
    try {
      return await Evaluation.calculerMoyenneUtilisateur(userId);
    } catch (error) {
      logger.error('❌ Erreur calcul moyenne:', error);
      throw error;
    }
  }

  /**
   * Obtenir les évaluations d'un trajet
   */
  async obtenirEvaluationsTrajet(trajetId) {
    try {
      return await Evaluation.find({ 
        trajetId,
        statutEvaluation: 'COMPLETEE',
        visibilite: 'PUBLIQUE'
      })
      .populate('evaluateurId', 'nom prenom photoProfil')
      .populate('evalueId', 'nom prenom photoProfil')
      .sort({ dateEvaluation: -1 });
    } catch (error) {
      logger.error('❌ Erreur récupération évaluations trajet:', error);
      throw error;
    }
  }

  /**
 * Répondre à une évaluation
 */
  async repondreEvaluation(evaluationId, reponse, userId) {
    try {
      // ✅ Recherche par ID
      const evaluation = await Evaluation.findById(evaluationId);

      if (!evaluation) {
        // 🔍 Log pour debug
        logger.error('❌ Évaluation introuvable', { evaluationId });
        throw new Error('Évaluation non trouvée');
      }

      // ✅ Log pour comprendre ce qui se passe
      logger.info('🔍 Tentative de réponse', {
        evaluationId,
        userId,
        evalueId: evaluation.evalueId.toString(),
        evaluateurId: evaluation.evaluateurId.toString(),
        match: evaluation.evalueId.toString() === userId.toString()
      });

      // ✅ Vérifier que l'utilisateur est bien la personne évaluée 
      if (evaluation.evalueId.toString() !== userId.toString()) {
        if (evaluation.evaluateurId.toString() === userId.toString()) {
          throw new Error('Vous ne pouvez pas répondre à une évaluation que vous avez donnée. Seule la personne évaluée peut répondre.');
        }
        throw new Error('Vous n\'êtes pas autorisé à répondre à cette évaluation');
      }

      // ✅ Vérifier qu'il n'y a pas déjà une réponse
      if (evaluation.reponseEvalue) {
        throw new Error('Vous avez déjà répondu à cette évaluation');
      }

      // ✅ Vérifier que l'évaluation est complétée
      if (evaluation.statutEvaluation !== 'COMPLETEE') {
        throw new Error('Impossible de répondre à une évaluation non complétée');
      }

      // ✅ Ajouter la réponse
      evaluation.reponseEvalue = reponse;
      evaluation.dateReponse = new Date();

      await evaluation.save();

      logger.info('✅ Réponse ajoutée avec succès', { evaluationId, userId });

      return evaluation;
    } catch (error) {
      logger.error('❌ Erreur réponse évaluation:', error.message);
      throw error;
    }
  }

  /**
   * Signaler une évaluation abusive
   */
  async signalerEvaluationAbusive(evaluationId, motif, userId) {
    try {
      const evaluation = await Evaluation.findById(evaluationId);

      if (!evaluation) {
        throw new Error('Évaluation non trouvée');
      }

      evaluation.visibilite = 'EN_REVISION';
      evaluation.raisonMasquage = `Signalement par utilisateur: ${motif}`;
      evaluation.dateRevision = new Date();

      await evaluation.save();

      logger.info('✅ Évaluation signalée', { evaluationId, motif, userId });

      return { message: 'Signalement enregistré, l\'évaluation sera examinée' };
    } catch (error) {
      logger.error('❌ Erreur signalement évaluation:', error);
      throw error;
    }
  }

  /**
   * Supprimer une évaluation (admin)
   */
  async supprimerEvaluation(evaluationId, adminId) {
    try {
      const evaluation = await Evaluation.findByIdAndDelete(evaluationId);

      if (!evaluation) {
        throw new Error('Évaluation non trouvée');
      }

      logger.info('✅ Évaluation supprimée par admin', { evaluationId, adminId });

      return { message: 'Évaluation supprimée avec succès' };
    } catch (error) {
      logger.error('❌ Erreur suppression évaluation:', error);
      throw error;
    }
  }

  /**
   * Détecter évaluations suspectes
   */
  async detecterEvaluationsSuspectes(userId) {
    try {
      return await Evaluation.detecterEvaluationsSuspectes(userId);
    } catch (error) {
      logger.error('❌ Erreur détection évaluations suspectes:', error);
      throw error;
    }
  }

  /**
   * Mettre à jour le score de confiance
   */
  async mettreAJourScoreConfiance(userId) {
    try {
      const stats = await Evaluation.getStatistiquesUtilisateur(userId);
      
      if (!stats) return 0;

      let score = stats.moyenneGlobale * 20;

      if (stats.totalEvaluations >= 10) score += 5;
      if (stats.totalEvaluations >= 50) score += 10;

      if (stats.nombreSignalements > 0) {
        score -= stats.nombreSignalements * 5;
      }

      score = Math.max(0, Math.min(100, score));

      await Utilisateur.findByIdAndUpdate(userId, {
        $set: { scoreConfiance: Math.round(score) }
      });

      return Math.round(score);
    } catch (error) {
      logger.error('❌ Erreur mise à jour score confiance:', error);
      throw error;
    }
  }
}

module.exports = new EvaluationService();