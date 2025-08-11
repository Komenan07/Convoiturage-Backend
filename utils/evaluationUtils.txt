// // utils/evaluationUtils.js
// const evaluationConfig = require('../config/evaluation');

// /**
//  * Utilitaires pour le système d'évaluation
//  */
// class EvaluationUtils {
  
//   /**
//    * Calcule la note globale à partir des notes individuelles
//    * @param {Object} notes - Les notes individuelles
//    * @returns {number} Note globale arrondie à 1 décimale
//    */
//   static calculerNoteGlobale(notes) {
//     const { ponctualite, proprete, qualiteConduite, respect, communication } = notes;
//     const moyenne = (ponctualite + proprete + qualiteConduite + respect + communication) / 5;
//     return Math.round(moyenne * 10) / 10;
//   }

//   /**
//    * Détermine le niveau de satisfaction basé sur la note globale
//    * @param {number} noteGlobale - La note globale
//    * @returns {Object} Objet contenant le niveau et sa description
//    */
//   static determinerNiveauSatisfaction(noteGlobale) {
//     if (noteGlobale >= 4.5) {
//       return {
//         niveau: 'EXCELLENT',
//         libelle: 'Excellent',
//         couleur: '#4CAF50',
//         emoji: '⭐⭐⭐⭐⭐'
//       };
//     } else if (noteGlobale >= 4.0) {
//       return {
//         niveau: 'TRES_BIEN',
//         libelle: 'Très bien',
//         couleur: '#8BC34A',
//         emoji: '⭐⭐⭐⭐'
//       };
//     } else if (noteGlobale >= 3.0) {
//       return {
//         niveau: 'BIEN',
//         libelle: 'Bien',
//         couleur: '#FFC107',
//         emoji: '⭐⭐⭐'
//       };
//     } else if (noteGlobale >= 2.0) {
//       return {
//         niveau: 'MOYEN',
//         libelle: 'Peut mieux faire',
//         couleur: '#FF9800',
//         emoji: '⭐⭐'
//       };
//     } else {
//       return {
//         niveau: 'INSUFFISANT',
//         libelle: 'À améliorer',
//         couleur: '#F44336',
//         emoji: '⭐'
//       };
//     }
//   }

//   /**
//    * Génère un message personnalisé basé sur la note
//    * @param {number} noteGlobale - La note globale
//    * @param {string} contexte - Le contexte ('remerciement', 'encouragement', 'amelioration')
//    * @returns {string} Message personnalisé
//    */
//   static genererMessagePersonnalise(noteGlobale, contexte = 'remerciement') {
//     const { messages } = evaluationConfig;
    
//     if (noteGlobale >= 4.0) {
//       const messagesPositifs = [...messages.remerciements, ...messages.encouragements];
//       return messagesPositifs[Math.floor(Math.random() * messagesPositifs.length)];
//     } else if (noteGlobale >= 3.0) {
//       return messages.remerciements[Math.floor(Math.random() * messages.remerciements.length)];
//     } else {
//       return messages.ameliorations[Math.floor(Math.random() * messages.ameliorations.length)];
//     }
//   }

//   /**
//    * Calcule le score de confiance d'un utilisateur
//    * @param {Object} statistiques - Statistiques de l'utilisateur
//    * @param {Array} evaluations - Liste des évaluations récentes
//    * @param {Date} dateCreation - Date de création du compte
//    * @returns {Object} Objet contenant le score et les détails
//    */
//   static calculerScoreConfiance(statistiques, evaluations = [], dateCreation = new Date()) {
//     const { scoreConfiance: config } = evaluationConfig;
    
//     if (!statistiques || !statistiques.moyenneGlobale) {
//       return {
//         score: config.initial,
//         niveau: 'NOUVEAU',
//         detailsCalcul: {
//           raison: 'Utilisateur nouveau, aucune évaluation'
//         }
//       };
//     }

//     let score = 0;
//     const detailsCalcul = {};

//     // Facteur 1: Moyenne des notes (70%)
//     const facteurNote = (statistiques.moyenneGlobale / 5) * config.facteurs.moyenneNotes * 100;
//     score += facteurNote;
//     detailsCalcul.facteurNote = Math.round(facteurNote);

//     // Facteur 2: Nombre d'évaluations (20%)
//     const facteurNombre = Math.min(statistiques.nombreEvaluations / 20, 1) * config.facteurs.nombreEvaluations * 100;
//     score += facteurNombre;
//     detailsCalcul.facteurNombre = Math.round(facteurNombre);

//     // Facteur 3: Ancienneté (10%)
//     const ancienneteJours = Math.floor((new Date() - new Date(dateCreation)) / (1000 * 60 * 60 * 24));
//     const facteurAnciennete = Math.min(ancienneteJours / 365, 1) * config.facteurs.anciennete * 100;
//     score += facteurAnciennete;
//     detailsCalcul.facteurAnciennete = Math.round(facteurAnciennete);

//     // Application des pénalités
//     let penalites = 0;
//     evaluations.forEach(eval => {
//       if (eval.estSignalement) {
//         switch (eval.gravite) {
//           case 'LEGER':
//             penalites += Math.abs(config.penalites.signalementLeger);
//             break;
//           case 'MOYEN':
//             penalites += Math.abs(config.penalites.signalementMoyen);
//             break;
//           case 'GRAVE':
//             penalites += Math.abs(config.penalites.signalementGrave);
//             break;
//         }
//       }
//       if (eval.notes.noteGlobale < 2) {
//         penalites += Math.abs(config.penalites.evaluationTresBasse);
//       }
//     });

//     score -= penalites;
//     detailsCalcul.penalites = penalites;

//     // Application des bonus
//     let bonus = 0;
//     if (statistiques.moyenneGlobale >= 4.5) {
//       bonus += config.bonus.evaluationExcellente;
//     }
//     if (statistiques.nombreEvaluations > 50) {
//       bonus += config.bonus.nombreEvaluationsElevé;
//     }
//     if (ancienneteJours > 365) {
//       bonus += config.bonus.ancienneteElevee;
//     }

//     score += bonus;
//     detailsCalcul.bonus = bonus;

//     // Borner le score entre min et max
//     score = Math.max(config.min, Math.min(config.max, Math.round(score)));

//     // Déterminer le niveau
//     let niveau;
//     if (score >= config.seuils.utilisateurExemplaire) {
//       niveau = 'EXEMPLAIRE';
//     } else if (score >= 70) {
//       niveau = 'EXCELLENT';
//     } else if (score >= 50) {
//       niveau = 'BON';
//     } else if (score >= config.seuils.alerteAdmin) {
//       niveau = 'MOYEN';
//     } else {
//       niveau = 'FAIBLE';
//     }

//     return {
//       score,
//       niveau,
//       detailsCalcul,
//       actionsRecommandees: this.genererActionsRecommandees(score, statistiques)
//     };
//   }

//   /**
//    * Génère des actions recommandées basées sur le score
//    * @param {number} score - Score de confiance
//    * @param {Object} statistiques - Statistiques de l'utilisateur
//    * @returns {Array} Liste des actions recommandées
//    */
//   static genererActionsRecommandees(score, statistiques) {
//     const actions = [];
//     const { seuils } = evaluationConfig.scoreConfiance;

//     if (score < seuils.alerteAdmin) {
//       actions.push({
//         type: 'ALERTE_ADMIN',
//         priorite: 'HAUTE',
//         message: 'Score critique - Intervention admin requise'
//       });
//     }

//     if (score < seuils.suspensionAutomatique) {
//       actions.push({
//         type: 'SUSPENSION_TEMPORAIRE',
//         priorite: 'CRITIQUE',
//         message: 'Suspension automatique pour protection des utilisateurs'
//       });
//     }

//     if (statistiques && statistiques.moyenneGlobale < 3) {
//       actions.push({
//         type: 'FORMATION_RECOMMANDEE',
//         priorite: 'MOYENNE',
//         message: 'Formation sur les bonnes pratiques recommandée'
//       });
//     }

//     if (score >= seuils.utilisateurExemplaire) {
//       actions.push({
//         type: 'BADGE_EXCELLENCE',
//         priorite: 'INFO',
//         message: 'Attribution du badge utilisateur exemplaire'
//       });
//     }

//     return actions;
//   }

//   /**
//    * Valide la cohérence d'une évaluation
//    * @param {Object} evaluation - Données de l'évaluation
//    * @returns {Object} Résultat de la validation
//    */
//   static validerCoherenceEvaluation(evaluation) {
//     const erreurs = [];
//     const avertissements = [];

//     // Vérifier la cohérence notes/signalement
//     if (evaluation.estSignalement) {
//       const moyenneNotes = this.calculerNoteGlobale(evaluation.notes);
      
//       if (evaluation.gravite === 'GRAVE' && moyenneNotes > 3) {
//         erreurs.push('Notes incohérentes avec la gravité du signalement');
//       }
      
//       if (evaluation.gravite === 'LEGER' && moyenneNotes < 2) {
//         avertissements.push('Gravité semble sous-évaluée par rapport aux notes');
//       }
//     }

//     // Vérifier la cohérence aspects/notes
//     if (evaluation.aspectsPositifs && evaluation.aspectsPositifs.length > 0) {
//       const moyenneNotes = this.calculerNoteGlobale(evaluation.notes);
//       if (moyenneNotes < 3) {
//         avertissements.push('Aspects positifs incohérents avec les notes basses');
//       }
//     }

//     // Vérifier la longueur du commentaire par rapport aux notes
//     if (evaluation.commentaire) {
//       const moyenneNotes = this.calculerNoteGlobale(evaluation.notes);
//       if (moyenneNotes <= 2 && evaluation.commentaire.length < 50) {
//         avertissements.push('Commentaire trop court pour des notes aussi basses');
//       }
//     }

//     return {
//       valide: erreurs.length === 0,
//       erreurs,
//       avertissements
//     };
//   }

//   /**
//    * Génère des statistiques d'évaluation pour un période
//    * @param {Array} evaluations - Liste des évaluations
//    * @param {Date} dateDebut - Date de début de la période
//    * @param {Date} dateFin - Date de fin de la période
//    * @returns {Object} Statistiques détaillées
//    */
//   static genererStatistiquesPeriode(evaluations, dateDebut, dateFin) {
//     const evaluationsPeriode = evaluations.filter(eval => {
//       const dateEval = new Date(eval.dateEvaluation);
//       return dateEval >= dateDebut && dateEval <= dateFin;
//     });

//     if (evaluationsPeriode.length === 0) {
//       return {
//         periode: { debut: dateDebut, fin: dateFin },
//         aucuneEvaluation: true
//       };
//     }

//     // Statistiques générales
//     const moyenneGlobale = evaluationsPeriode.reduce((sum, eval) => 
//       sum + eval.notes.noteGlobale, 0) / evaluationsPeriode.length;

//     // Répartition par niveau de satisfaction
//     const repartitionNiveaux = {};
//     evaluationsPeriode.forEach(eval => {
//       const niveau = this.determinerNiveauSatisfaction(eval.notes.noteGlobale).niveau;
//       repartitionNiveaux[niveau] = (repartitionNiveaux[niveau] || 0) + 1;
//     });

//     // Aspects les plus mentionnés
//     const aspectsPositifs = {};
//     const aspectsAmeliorer = {};
    
//     evaluationsPeriode.forEach(eval => {
//       if (eval.aspectsPositifs) {
//         eval.aspectsPositifs.forEach(aspect => {
//           aspectsPositifs[aspect] = (aspectsPositifs[aspect] || 0) + 1;
//         });
//       }
//       if (eval.aspectsAmeliorer) {
//         eval.aspectsAmeliorer.forEach(aspect => {
//           aspectsAmeliorer[aspect] = (aspectsAmeliorer[aspect] || 0) + 1;
//         });
//       }
//     });

//     return {
//       periode: { debut: dateDebut, fin: dateFin },
//       totalEvaluations: evaluationsPeriode.length,
//       moyenneGlobale: Math.round(moyenneGlobale * 10) / 10,
//       repartitionNiveaux,
//       aspectsPositifs,
//       aspectsAmeliorer,
//       nombreSignalements: evaluationsPeriode.filter(e => e.estSignalement).length,
//       tauxReponse: Math.round(
//         (evaluationsPeriode.filter(e => e.reponseEvalue).length / evaluationsPeriode.length) * 100
//       )
//     };
//   }

//   /**
//    * Formate une évaluation pour l'affichage
//    * @param {Object} evaluation - Évaluation à formater
//    * @returns {Object} Évaluation formatée
//    */
//   static formaterEvaluationPourAffichage(evaluation) {
//     const satisfaction = this.determinerNiveauSatisfaction(evaluation.notes.noteGlobale);
    
//     return {
//       ...evaluation.toObject ? evaluation.toObject() : evaluation,
//       satisfaction,
//       messagePersonnalise: this.genererMessagePersonnalise(evaluation.notes.noteGlobale),
//       dateFormatee: new Date(evaluation.dateEvaluation).toLocaleDateString('fr-FR', {
//         year: 'numeric',
//         month: 'long',
//         day: 'numeric'
//       }),
//       peutRepondre: evaluation.peutRepondre ? evaluation.peutRepondre.bind(evaluation) : undefined
//     };
//   }
// }

// module.exports = EvaluationUtils;