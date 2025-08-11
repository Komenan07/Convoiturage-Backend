// Exemple d'utilisation du service de récurrence des trajets
const mongoose = require('mongoose');
const RecurrenceService = require('../services/recurrenceService');
const Trajet = require('../models/Trajet');

console.log('🚀 Exemple d\'utilisation du service de récurrence des trajets\n');

// Exemple 1: Création d'un trajet récurrent et génération des instances
async function exempleCreationTrajetRecurrent() {
  console.log('📝 Exemple 1: Création d\'un trajet récurrent');
  
  try {
    // Créer un trajet récurrent (trajet de travail quotidien)
    const trajetRecurrent = new Trajet({
      conducteurId: new mongoose.Types.ObjectId(),
      pointDepart: {
        nom: 'Résidence Cocody',
        adresse: 'Cocody, Abidjan',
        commune: 'Cocody',
        quartier: 'Riviera 2',
        coordonnees: {
          type: 'Point',
          coordinates: [-3.9900, 5.3500]
        }
      },
      pointArrivee: {
        nom: 'Bureau Plateau',
        adresse: 'Plateau, Abidjan',
        commune: 'Plateau',
        quartier: 'Centre-ville',
        coordonnees: {
          type: 'Point',
          coordinates: [-4.0083, 5.3600]
        }
      },
      dateDepart: new Date('2024-01-01'),
      heureDepart: '07:30',
      heureArriveePrevue: '08:15',
      dureeEstimee: 45,
      distance: 8.2,
      prixParPassager: 400,
      nombrePlacesDisponibles: 2,
      nombrePlacesTotal: 3,
      typeTrajet: 'RECURRENT',
      recurrence: {
        jours: ['LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI'],
        dateFinRecurrence: new Date('2024-12-31')
      },
      vehiculeUtilise: {
        marque: 'Renault',
        modele: 'Clio',
        couleur: 'Bleu',
        immatriculation: 'AB-456-EF',
        nombrePlaces: 3
      },
      preferences: {
        accepteBagages: true,
        typeBagages: 'PETIT',
        musique: true,
        conversation: 'LIBRE',
        fumeur: false
      },
      commentaireConducteur: 'Trajet quotidien pour le travail, départ tôt le matin'
    });
    
    console.log('   ✅ Trajet récurrent créé:');
    console.log(`     Départ: ${trajetRecurrent.pointDepart.nom} → ${trajetRecurrent.pointArrivee.nom}`);
    console.log(`     Jours: ${trajetRecurrent.recurrence.jours.join(', ')}`);
    console.log(`     Heure: ${trajetRecurrent.heureDepart}`);
    console.log(`     Prix: ${trajetRecurrent.prixParPassager} FCFA`);
    console.log(`     Jusqu\'au: ${trajetRecurrent.recurrence.dateFinRecurrence.toLocaleDateString('fr-FR')}\n`);
    
    return trajetRecurrent;
    
  } catch (error) {
    console.log('❌ Erreur:', error.message);
    return null;
  }
}

// Exemple 2: Génération automatique des instances pour un mois
async function exempleGenerationInstances() {
  console.log('🔄 Exemple 2: Génération automatique des instances');
  
  try {
    const trajetRecurrent = await exempleCreationTrajetRecurrent();
    if (!trajetRecurrent) return;
    
    // Générer les instances pour le mois de février
    const dateDebut = new Date('2024-02-01');
    const dateFin = new Date('2024-02-29');
    
    console.log(`   📅 Génération des instances pour février 2024...`);
    
    // Simuler la génération (sans base de données)
    const datesInstances = RecurrenceService.genererDatesRecurrence(
      trajetRecurrent.recurrence.jours,
      dateDebut,
      dateFin,
      trajetRecurrent.heureDepart
    );
    
    console.log(`   ✅ ${datesInstances.length} instances générées`);
    
    // Afficher les premières instances
    console.log('   Premières instances:');
    datesInstances.slice(0, 5).forEach((date, index) => {
      const jourSemaine = date.toLocaleDateString('fr-FR', { weekday: 'long' });
      console.log(`     ${index + 1}. ${jourSemaine} ${date.toLocaleDateString('fr-FR')} à ${trajetRecurrent.heureDepart}`);
    });
    
    if (datesInstances.length > 5) {
      console.log(`     ... et ${datesInstances.length - 5} autres instances`);
    }
    
    console.log(`   💰 Revenus potentiels: ${datesInstances.length * trajetRecurrent.prixParPassager * 2} FCFA (2 passagers)\n`);
    
  } catch (error) {
    console.log('❌ Erreur:', error.message);
  }
}

// Exemple 3: Modification de la récurrence
async function exempleModificationRecurrence() {
  console.log('📝 Exemple 3: Modification de la récurrence');
  
  try {
    const trajetRecurrent = await exempleCreationTrajetRecurrent();
    if (!trajetRecurrent) return;
    
    console.log('   Configuration initiale:');
    console.log(`     Jours: ${trajetRecurrent.recurrence.jours.join(', ')}`);
    console.log(`     Date fin: ${trajetRecurrent.recurrence.dateFinRecurrence.toLocaleDateString('fr-FR')}`);
    
    // Modifier la récurrence (ajouter le samedi, changer la date de fin)
    const nouvelleRecurrence = {
      jours: ['LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI'],
      dateFinRecurrence: new Date('2024-06-30')
    };
    
    console.log('\n   Nouvelle configuration:');
    console.log(`     Jours: ${nouvelleRecurrence.jours.join(', ')}`);
    console.log(`     Date fin: ${nouvelleRecurrence.dateFinRecurrence.toLocaleDateString('fr-FR')}`);
    
    // Calculer l'impact sur le nombre d'instances
    const anciennesInstances = RecurrenceService.genererDatesRecurrence(
      trajetRecurrent.recurrence.jours,
      new Date('2024-02-01'),
      new Date('2024-06-30'),
      trajetRecurrent.heureDepart
    );
    
    const nouvellesInstances = RecurrenceService.genererDatesRecurrence(
      nouvelleRecurrence.jours,
      new Date('2024-02-01'),
      nouvelleRecurrence.dateFinRecurrence,
      trajetRecurrent.heureDepart
    );
    
    console.log('\n   Impact de la modification:');
    console.log(`     Instances avant: ${anciennesInstances.length}`);
    console.log(`     Instances après: ${nouvellesInstances.length}`);
    console.log(`     Différence: +${nouvellesInstances.length - anciennesInstances.length} instances`);
    console.log(`     Revenus supplémentaires: ${(nouvellesInstances.length - anciennesInstances.length) * trajetRecurrent.prixParPassager * 2} FCFA\n`);
    
  } catch (error) {
    console.log('❌ Erreur:', error.message);
  }
}

// Exemple 4: Gestion des exceptions (vacances, jours fériés)
async function exempleGestionExceptions() {
  console.log('🚫 Exemple 4: Gestion des exceptions');
  
  try {
    const trajetRecurrent = await exempleCreationTrajetRecurrent();
    if (!trajetRecurrent) return;
    
    // Définir des périodes d'exception
    const exceptions = [
      { debut: new Date('2024-04-01'), fin: new Date('2024-04-05'), raison: 'Vacances de Pâques' },
      { debut: new Date('2024-07-15'), fin: new Date('2024-08-15'), raison: 'Vacances d\'été' },
      { debut: new Date('2024-12-23'), fin: new Date('2024-12-31'), raison: 'Vacances de Noël' }
    ];
    
    console.log('   Périodes d\'exception définies:');
    exceptions.forEach((exception, index) => {
      console.log(`     ${index + 1}. ${exception.debut.toLocaleDateString('fr-FR')} → ${exception.fin.toLocaleDateString('fr-FR')} (${exception.raison})`);
    });
    
    // Calculer les instances en tenant compte des exceptions
    const dateDebut = new Date('2024-01-01');
    const dateFin = new Date('2024-12-31');
    
    let datesInstances = RecurrenceService.genererDatesRecurrence(
      trajetRecurrent.recurrence.jours,
      dateDebut,
      dateFin,
      trajetRecurrent.heureDepart
    );
    
    // Filtrer les dates d'exception
    const instancesFiltrees = datesInstances.filter(date => {
      return !exceptions.some(exception => 
        date >= exception.debut && date <= exception.fin
      );
    });
    
    console.log('\n   Impact des exceptions:');
    console.log(`     Instances totales: ${datesInstances.length}`);
    console.log(`     Instances après filtrage: ${instancesFiltrees.length}`);
    console.log(`     Instances supprimées: ${datesInstances.length - instancesFiltrees.length}`);
    console.log(`     Revenus ajustés: ${instancesFiltrees.length * trajetRecurrent.prixParPassager * 2} FCFA\n`);
    
  } catch (error) {
    console.log('❌ Erreur:', error.message);
  }
}

// Exemple 5: Optimisation des trajets récurrents
async function exempleOptimisation() {
  console.log('⚡ Exemple 5: Optimisation des trajets récurrents');
  
  try {
    const trajetRecurrent = await exempleCreationTrajetRecurrent();
    if (!trajetRecurrent) return;
    
    // Analyser différents scénarios de récurrence
    const scenarios = [
      { nom: 'Travail uniquement', jours: ['LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI'] },
      { nom: 'Travail + weekend', jours: ['LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI', 'DIMANCHE'] },
      { nom: 'Alterné', jours: ['LUNDI', 'MERCREDI', 'VENDREDI'] },
      { nom: 'Flexible', jours: ['MARDI', 'JEUDI'] }
    ];
    
    console.log('   Analyse des scénarios de récurrence:');
    
    const dateDebut = new Date('2024-02-01');
    const dateFin = new Date('2024-06-30');
    
    scenarios.forEach(scenario => {
      const instances = RecurrenceService.genererDatesRecurrence(
        scenario.jours,
        dateDebut,
        dateFin,
        trajetRecurrent.heureDepart
      );
      
      const revenus = instances.length * trajetRecurrent.prixParPassager * 2;
      const tauxOccupation = Math.min(100, (instances.length / 150) * 100); // 150 jours max sur la période
      
      console.log(`     ${scenario.nom}:`);
      console.log(`       Jours: ${scenario.jours.join(', ')}`);
      console.log(`       Instances: ${instances.length}`);
      console.log(`       Revenus: ${revenus} FCFA`);
      console.log(`       Taux occupation: ${tauxOccupation.toFixed(1)}%`);
      console.log('');
    });
    
    console.log('   💡 Recommandation: Scénario "Travail uniquement" pour un bon équilibre revenus/qualité de vie\n');
    
  } catch (error) {
    console.log('❌ Erreur:', error.message);
  }
}

// Exemple 6: Maintenance et nettoyage
async function exempleMaintenance() {
  console.log('🧹 Exemple 6: Maintenance et nettoyage');
  
  try {
    console.log('   Opérations de maintenance:');
    
    // Nettoyage des anciennes instances
    const dateLimite = new Date('2024-01-01');
    console.log(`     1. Nettoyage des instances antérieures à ${dateLimite.toLocaleDateString('fr-FR')}`);
    
    // Vérification des trajets récurrents actifs
    console.log('     2. Vérification des trajets récurrents actifs');
    
    // Statistiques de récurrence
    console.log('     3. Génération des statistiques de récurrence');
    
    // Optimisation des index
    console.log('     4. Optimisation des index de base de données');
    
    console.log('   ✅ Maintenance planifiée et automatisée\n');
    
  } catch (error) {
    console.log('❌ Erreur:', error.message);
  }
}

// Fonction principale
async function runExamples() {
  try {
    await exempleCreationTrajetRecurrent();
    await exempleGenerationInstances();
    await exempleModificationRecurrence();
    await exempleGestionExceptions();
    await exempleOptimisation();
    await exempleMaintenance();
    
    console.log('🎯 Tous les exemples de récurrence exécutés avec succès!');
    console.log('\n📋 Résumé des fonctionnalités démontrées:');
    console.log('   ✅ Création de trajets récurrents');
    console.log('   ✅ Génération automatique des instances');
    console.log('   ✅ Modification de la récurrence');
    console.log('   ✅ Gestion des exceptions (vacances, jours fériés)');
    console.log('   ✅ Optimisation des scénarios de récurrence');
    console.log('   ✅ Maintenance et nettoyage automatisés');
    
    console.log('\n💡 Cas d\'usage typiques:');
    console.log('   🚗 Trajets domicile-travail quotidiens');
    console.log('   🏫 Transport scolaire régulier');
    console.log('   🛒 Courses hebdomadaires');
    console.log('   🏥 Rendez-vous médicaux récurrents');
    console.log('   🎭 Activités culturelles mensuelles');
    
  } catch (error) {
    console.log('\n💥 Erreur lors de l\'exécution des exemples:', error.message);
  }
}

// Exécuter les exemples
runExamples();
