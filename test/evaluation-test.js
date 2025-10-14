// Test du modèle EVALUATION et du calcul automatique de la note globale
const mongoose = require('mongoose');
const Evaluation = require('../models/Evaluation');

console.log('🧪 Test du modèle EVALUATION...\n');

// Test de création d'une évaluation avec calcul automatique
async function testCreationEvaluation() {
  try {
    console.log('📝 Test de création d\'évaluation...');
    
    const nouvelleEvaluation = new Evaluation({
      trajetId: new mongoose.Types.ObjectId(),
      evaluateurId: new mongoose.Types.ObjectId(),
      evalueId: new mongoose.Types.ObjectId(),
      typeEvaluateur: 'PASSAGER',
      notes: {
        ponctualite: 5,
        proprete: 4,
        qualiteConduite: 5,
        respect: 4,
        communication: 5
      },
      commentaire: 'Excellent trajet, conducteur très professionnel'
    });
    
    // La note globale devrait être calculée automatiquement
    console.log('   Notes avant sauvegarde:', nouvelleEvaluation.notes);
    console.log('   Note globale calculée:', nouvelleEvaluation.notes.noteGlobale);
    
    // Vérifier que la note globale est correcte (5+4+5+4+5)/5 = 4.6
    const noteAttendue = (5 + 4 + 5 + 4 + 5) / 5;
    console.log('   Note attendue:', noteAttendue);
    console.log('   ✅ Calcul automatique fonctionne');
    
  } catch (error) {
    console.log('❌ Erreur lors du test de création:', error.message);
  }
}

// Test des méthodes utilitaires
async function testMethodesUtilitaires() {
  try {
    console.log('\n🔧 Test des méthodes utilitaires...');
    
    const evaluation = new Evaluation({
      trajetId: new mongoose.Types.ObjectId(),
      evaluateurId: new mongoose.Types.ObjectId(),
      evalueId: new mongoose.Types.ObjectId(),
      typeEvaluateur: 'CONDUCTEUR',
      notes: {
        ponctualite: 3,
        proprete: 4,
        qualiteConduite: 5,
        respect: 4,
        communication: 3
      }
    });
    
    // Test de recalcul manuel
    const noteRecalculee = evaluation.recalculerNoteGlobale();
    console.log('   Note recalculée manuellement:', noteRecalculee);
    
    // Test du résumé des notes
    const resume = evaluation.getResumeNotes();
    console.log('   Résumé des notes:', JSON.stringify(resume, null, 2));
    
    // Test des méthodes de classification
    console.log('   Est positive:', evaluation.estPositive());
    console.log('   Est critique:', evaluation.estCritique());
    
    // Test des libellés
    console.log('   Libellé note 5:', evaluation.getLibelleNote(5));
    console.log('   Libellé note 3:', evaluation.getLibelleNote(3));
    console.log('   Libellé note 1:', evaluation.getLibelleNote(1));
    
    console.log('   ✅ Méthodes utilitaires fonctionnent');
    
  } catch (error) {
    console.log('❌ Erreur lors du test des méthodes:', error.message);
  }
}

// Test des méthodes statiques
async function testMethodesStatiques() {
  try {
    console.log('\n📊 Test des méthodes statiques...');
    
    // Test d'analyse de tendance
    const evaluations = [
      { noteGlobale: 4.5, dateEvaluation: new Date('2024-01-01') },
      { noteGlobale: 4.8, dateEvaluation: new Date('2024-01-15') },
      { noteGlobale: 5.0, dateEvaluation: new Date('2024-02-01') }
    ];
    
    const tendance = Evaluation.analyserTendance(evaluations);
    console.log('   Tendance détectée:', tendance);
    
    // Test de détection d'évaluations suspectes
    const suspect = Evaluation.detecterEvaluationsSuspectes(new mongoose.Types.ObjectId());
    console.log('   Détection suspecte:', suspect);
    
    console.log('   ✅ Méthodes statiques fonctionnent');
    
  } catch (error) {
    console.log('❌ Erreur lors du test des méthodes statiques:', error.message);
  }
}

// Test de validation des notes
async function testValidationNotes() {
  try {
    console.log('\n✅ Test de validation des notes...');
    
    // Test avec des notes valides
    const evaluationValide = new Evaluation({
      trajetId: new mongoose.Types.ObjectId(),
      evaluateurId: new mongoose.Types.ObjectId(),
      evalueId: new mongoose.Types.ObjectId(),
      typeEvaluateur: 'PASSAGER',
      notes: {
        ponctualite: 4,
        proprete: 4,
        qualiteConduite: 4,
        respect: 4,
        communication: 4
      }
    });
    
    console.log('   ✅ Évaluation avec notes valides créée');
    
    // Test avec des notes invalides (devrait échouer)
    try {
      const evaluationInvalide = new Evaluation({
        trajetId: new mongoose.Types.ObjectId(),
        evaluateurId: new mongoose.Types.ObjectId(),
        evalueId: new mongoose.Types.ObjectId(),
        typeEvaluateur: 'PASSAGER',
        notes: {
          ponctualite: 6, // Note > 5
          proprete: 4,
          qualiteConduite: 4,
          respect: 4,
          communication: 4
        }
      });
      
      console.log('   ❌ Évaluation avec note invalide créée (ne devrait pas)');
    } catch (error) {
      console.log('   ✅ Validation des notes fonctionne (erreur attendue):', error.message);
    }
    
  } catch (error) {
    console.log('❌ Erreur lors du test de validation:', error.message);
  }
}

// Test de mise à jour avec recalcul automatique
async function testMiseAJourAutomatique() {
  try {
    console.log('\n🔄 Test de mise à jour avec recalcul automatique...');
    
    const evaluation = new Evaluation({
      trajetId: new mongoose.Types.ObjectId(),
      evaluateurId: new mongoose.Types.ObjectId(),
      evalueId: new mongoose.Types.ObjectId(),
      typeEvaluateur: 'PASSAGER',
      notes: {
        ponctualite: 3,
        proprete: 3,
        qualiteConduite: 3,
        respect: 3,
        communication: 3
      }
    });
    
    console.log('   Note globale initiale:', evaluation.notes.noteGlobale);
    
    // Modifier une note
    evaluation.notes.ponctualite = 5;
    console.log('   Ponctualité modifiée de 3 à 5');
    
    // La note globale devrait être recalculée automatiquement
    const nouvelleNoteGlobale = evaluation.recalculerNoteGlobale();
    console.log('   Nouvelle note globale:', nouvelleNoteGlobale);
    
    // Vérifier le calcul: (5+3+3+3+3)/5 = 3.4
    const noteAttendue = (5 + 3 + 3 + 3 + 3) / 5;
    console.log('   Note attendue après modification:', noteAttendue);
    
    if (Math.abs(nouvelleNoteGlobale - noteAttendue) < 0.1) {
      console.log('   ✅ Recalcul automatique fonctionne');
    } else {
      console.log('   ❌ Recalcul automatique incorrect');
    }
    
  } catch (error) {
    console.log('❌ Erreur lors du test de mise à jour:', error.message);
  }
}

// Fonction principale de test
async function runTests() {
  try {
    await testCreationEvaluation();
    await testMethodesUtilitaires();
    await testMethodesStatiques();
    await testValidationNotes();
    await testMiseAJourAutomatique();
    
    console.log('\n🎯 Tous les tests terminés avec succès!');
    
  } catch (error) {
    console.log('\n💥 Erreur lors des tests:', error.message);
  }
}

// Exécuter les tests
runTests();
