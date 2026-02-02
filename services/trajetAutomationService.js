// services/trajetAutomationService.js - VERSION UNIFIÉE COMPLÈTE

const cron = require('node-cron');
const Trajet = require('../models/Trajet');

/**
 * 🚀 SERVICE UNIFIÉ DE GESTION AUTOMATIQUE DES TRAJETS
 * 
 * Logique complète:
 * 1. PROGRAMME + heure départ atteinte (±15min) → EN_COURS
 * 2. PROGRAMME + heure départ dépassée (>15min) → EXPIRE
 * 3. EN_COURS + arrivée prévue + 30min → TERMINE
 * 4. EN_COURS + arrivée dépassée (sans terminaison) → EN_RETARD
 * 5. EN_RETARD + 2h → EXPIRE
 * 6. RECURRENT + date fin dépassée → EXPIRE
 */

class TrajetAutomationService {
  
  constructor() {
    this.jobs = [];
    this.isRunning = false;
  }

  /**
   * 🔄 1. ACTIVER les trajets dont l'heure de départ est atteinte
   * PROGRAMME → EN_COURS (dans une fenêtre de ±15 minutes)
   */
  async activerTrajetsEnAttente() {
    try {
      const maintenant = new Date();
      const margeAvant = new Date(maintenant.getTime() - 15 * 60 * 1000); // -15 min
      const margeApres = new Date(maintenant.getTime() + 15 * 60 * 1000); // +15 min
      
      const trajetsAActiver = await Trajet.find({
        statutTrajet: 'PROGRAMME',
        dateDepart: { $exists: true },
        heureDepart: { $exists: true }
      }).populate('conducteurId', 'nom prenom');

      const results = [];
      
      for (const trajet of trajetsAActiver) {
        try {
          const [heures, minutes] = trajet.heureDepart.split(':').map(Number);
          const dateDepartComplete = new Date(trajet.dateDepart);
          dateDepartComplete.setHours(heures, minutes, 0, 0);
          
          // Activer si dans la fenêtre [-15min, +15min]
          if (dateDepartComplete >= margeAvant && dateDepartComplete <= margeApres) {
            trajet.statutTrajet = 'EN_COURS';
            await trajet.save();
            
            results.push({
              id: trajet._id,
              conducteur: `${trajet.conducteurId.nom} ${trajet.conducteurId.prenom}`,
              depart: trajet.pointDepart.nom,
              arrivee: trajet.pointArrivee.nom,
              heureDepart: trajet.heureDepart
            });
            
            console.log(`✅ Trajet activé: ${trajet._id}`);
            await this._envoyerNotificationActivation(trajet);
          }
        } catch (error) {
          console.error(`⚠️ Erreur activation trajet ${trajet._id}:`, error.message);
        }
      }

      if (results.length > 0) {
        console.log(`🚀 ${results.length} trajet(s) activé(s)`);
      }

      return { activated: results.length, details: results };
    } catch (error) {
      console.error('❌ Erreur activation:', error);
      return { activated: 0, error: error.message };
    }
  }

  /**
   * ⏰ 2. EXPIRER les trajets PROGRAMME dont le départ est trop ancien
   * PROGRAMME + départ > 15min → EXPIRE
   */
  async expirerTrajetsNonActives() {
    try {
      const maintenant = new Date();
      const limiteActivation = new Date(maintenant.getTime() - 15 * 60 * 1000); // -15 min
      
      const trajetsAExpirer = await Trajet.find({
        statutTrajet: 'PROGRAMME',
        dateDepart: { $exists: true },
        heureDepart: { $exists: true }
      });

      const idsAExpirer = [];
      
      for (const trajet of trajetsAExpirer) {
        try {
          const [heures, minutes] = trajet.heureDepart.split(':').map(Number);
          const dateDepartComplete = new Date(trajet.dateDepart);
          dateDepartComplete.setHours(heures, minutes, 0, 0);
          
          // Expirer si départ > 15 minutes
          if (dateDepartComplete < limiteActivation) {
            idsAExpirer.push(trajet._id);
          }
        } catch (error) {
          console.error(`⚠️ Erreur traitement ${trajet._id}:`, error.message);
        }
      }

      let expired = 0;
      if (idsAExpirer.length > 0) {
        const result = await Trajet.updateMany(
          { _id: { $in: idsAExpirer } },
          {
            $set: { 
              statutTrajet: 'EXPIRE',
              dateExpiration: maintenant,
              raisonExpiration: 'DATE_PASSEE'
            }
          }
        );
        expired = result.modifiedCount;
        
        if (expired > 0) {
          console.log(`⏰ ${expired} trajet(s) PROGRAMME expiré(s)`);
        }
      }

      return { expired, details: [] };
    } catch (error) {
      console.error('❌ Erreur expiration PROGRAMME:', error);
      return { expired: 0, error: error.message };
    }
  }

  /**
   * 🏁 3. TERMINER les trajets EN_COURS dont l'arrivée est atteinte
   * EN_COURS + arrivée + 30min → TERMINE
   */
  async terminerTrajetsEnCours() {
    try {
      const maintenant = new Date();
      
      const trajetsEnCours = await Trajet.find({
        statutTrajet: 'EN_COURS',
        heureArriveePrevue: { $exists: true }
      }).populate('conducteurId', 'nom prenom');

      const results = [];
      
      for (const trajet of trajetsEnCours) {
        try {
          const [heures, minutes] = trajet.heureArriveePrevue.split(':').map(Number);
          const dateArriveePrevue = new Date(trajet.dateDepart);
          dateArriveePrevue.setHours(heures, minutes, 0, 0);
          
          // Gérer le cas où l'arrivée est le lendemain
          const [hDepart, mDepart] = trajet.heureDepart.split(':').map(Number);
          if (heures < hDepart || (heures === hDepart && minutes < mDepart)) {
            dateArriveePrevue.setDate(dateArriveePrevue.getDate() + 1);
          }
          
          // Terminer 30 minutes après l'arrivée prévue
          const margeTerminaison = new Date(dateArriveePrevue.getTime() + 30 * 60 * 1000);
          
          if (maintenant >= margeTerminaison) {
            trajet.statutTrajet = 'TERMINE';
            await trajet.save();
            
            results.push({
              id: trajet._id,
              conducteur: `${trajet.conducteurId.nom} ${trajet.conducteurId.prenom}`,
              arrivee: trajet.pointArrivee.nom
            });
            
            console.log(`🏁 Trajet terminé: ${trajet._id}`);
            await this._envoyerNotificationTerminaison(trajet);
          }
        } catch (error) {
          console.error(`⚠️ Erreur terminaison ${trajet._id}:`, error.message);
        }
      }

      if (results.length > 0) {
        console.log(`🏁 ${results.length} trajet(s) terminé(s)`);
      }

      return { terminated: results.length, details: results };
    } catch (error) {
      console.error('❌ Erreur terminaison:', error);
      return { terminated: 0, error: error.message };
    }
  }

  /**
   * ⚠️ 4. MARQUER EN RETARD les trajets EN_COURS dont l'arrivée est dépassée
   * EN_COURS + arrivée dépassée (sans terminaison) → EN_RETARD
   */
  async marquerTrajetsEnRetard() {
    try {
      const maintenant = new Date();
      
      const trajetsEnCours = await Trajet.find({
        statutTrajet: 'EN_COURS',
        heureArriveePrevue: { $exists: true }
      });

      const idsEnRetard = [];
      
      for (const trajet of trajetsEnCours) {
        try {
          const [heures, minutes] = trajet.heureArriveePrevue.split(':').map(Number);
          const dateArriveePrevue = new Date(trajet.dateDepart);
          dateArriveePrevue.setHours(heures, minutes, 0, 0);
          
          // Gérer le lendemain
          const [hDepart, mDepart] = trajet.heureDepart.split(':').map(Number);
          if (heures < hDepart || (heures === hDepart && minutes < mDepart)) {
            dateArriveePrevue.setDate(dateArriveePrevue.getDate() + 1);
          }
          
          // Marquer EN_RETARD si arrivée dépassée (sans marge)
          if (maintenant > dateArriveePrevue) {
            idsEnRetard.push(trajet._id);
          }
        } catch (error) {
          console.error(`⚠️ Erreur traitement ${trajet._id}:`, error.message);
        }
      }

      let enRetard = 0;
      if (idsEnRetard.length > 0) {
        const result = await Trajet.updateMany(
          { _id: { $in: idsEnRetard } },
          {
            $set: { 
              statutTrajet: 'EN_RETARD',
              dateDebutRetard: maintenant
            }
          }
        );
        enRetard = result.modifiedCount;
        
        if (enRetard > 0) {
          console.log(`⚠️ ${enRetard} trajet(s) marqué(s) EN_RETARD`);
        }
      }

      return { enRetard };
    } catch (error) {
      console.error('❌ Erreur marquage retard:', error);
      return { enRetard: 0, error: error.message };
    }
  }

  /**
   * ❌ 5. EXPIRER les trajets EN_RETARD depuis trop longtemps
   * EN_RETARD + 2h → EXPIRE
   */
  async expirerTrajetsEnRetard() {
    try {
      const maintenant = new Date();
      const limiteRetard = new Date(maintenant.getTime() - 2 * 60 * 60 * 1000); // -2h
      
      const result = await Trajet.updateMany(
        {
          statutTrajet: 'EN_RETARD',
          dateDebutRetard: { $lt: limiteRetard, $exists: true }
        },
        {
          $set: { 
            statutTrajet: 'EXPIRE',
            dateExpiration: maintenant,
            raisonExpiration: 'RETARD_EXCESSIF'
          }
        }
      );

      if (result.modifiedCount > 0) {
        console.log(`❌ ${result.modifiedCount} trajet(s) EN_RETARD expiré(s)`);
      }

      return { expiredFromDelay: result.modifiedCount };
    } catch (error) {
      console.error('❌ Erreur expiration retards:', error);
      return { expiredFromDelay: 0, error: error.message };
    }
  }

  /**
   * 🔁 6. EXPIRER les récurrences terminées
   */
  async expirerRecurrences() {
    try {
      const maintenant = new Date();
      
      const result = await Trajet.updateMany(
        {
          typeTrajet: 'RECURRENT',
          'recurrence.dateFinRecurrence': { $lt: maintenant },
          statutTrajet: 'PROGRAMME'
        },
        {
          $set: { 
            statutTrajet: 'EXPIRE',
            dateExpiration: maintenant,
            raisonExpiration: 'RECURRENCE_TERMINEE'
          }
        }
      );

      if (result.modifiedCount > 0) {
        console.log(`🔁 ${result.modifiedCount} récurrence(s) expirée(s)`);
      }

      return { recurrencesExpired: result.modifiedCount };
    } catch (error) {
      console.error('❌ Erreur expiration récurrences:', error);
      return { recurrencesExpired: 0, error: error.message };
    }
  }

  /**
   * 🔄 Exécuter toutes les vérifications (ordre important!)
   */
  async executerVerificationComplete() {
    console.log('\n🔄 ========== VERIFICATION AUTOMATIQUE UNIFIÉE ==========');
    console.log(`⏰ ${new Date().toLocaleString('fr-FR')}\n`);

    const debut = Date.now();

    // ⚠️ ORDRE IMPORTANT pour éviter les conflits
    const resultats = {};
    
    // 1. Activation (PROGRAMME → EN_COURS)
    resultats.activation = await this.activerTrajetsEnAttente();
    
    // 2. Expiration PROGRAMME trop anciens
    resultats.expirationProgramme = await this.expirerTrajetsNonActives();
    
    // 3. Terminaison normale (EN_COURS → TERMINE)
    resultats.terminaison = await this.terminerTrajetsEnCours();
    
    // 4. Marquage retards (EN_COURS → EN_RETARD)
    resultats.retards = await this.marquerTrajetsEnRetard();
    
    // 5. Expiration retards excessifs (EN_RETARD → EXPIRE)
    resultats.expirationRetards = await this.expirerTrajetsEnRetard();
    
    // 6. Expiration récurrences
    resultats.recurrences = await this.expirerRecurrences();

    const duree = Date.now() - debut;

    const total = 
      resultats.activation.activated + 
      resultats.expirationProgramme.expired + 
      resultats.terminaison.terminated + 
      resultats.retards.enRetard +
      resultats.expirationRetards.expiredFromDelay +
      resultats.recurrences.recurrencesExpired;

    console.log('\n📊 Résumé:');
    console.log(`   ✅ Activés: ${resultats.activation.activated}`);
    console.log(`   ⏰ PROGRAMME expirés: ${resultats.expirationProgramme.expired}`);
    console.log(`   🏁 Terminés: ${resultats.terminaison.terminated}`);
    console.log(`   ⚠️ En retard: ${resultats.retards.enRetard}`);
    console.log(`   ❌ Retards expirés: ${resultats.expirationRetards.expiredFromDelay}`);
    console.log(`   🔁 Récurrences expirées: ${resultats.recurrences.recurrencesExpired}`);
    console.log(`   ⏱️  Durée: ${duree}ms`);
    
    if (total > 0) {
      console.log(`\n🎉 ${total} trajet(s) mis à jour`);
    } else {
      console.log('\n✅ Aucun trajet à mettre à jour');
    }
    
    console.log('========================================================\n');

    return { ...resultats, total, duree: `${duree}ms` };
  }

  /**
   * 🚀 Démarrer le service (toutes les minutes)
   */
  start() {
    if (this.isRunning) {
      console.log('⚠️ Service déjà démarré');
      return;
    }

    console.log('\n🚀 ========== SERVICE AUTOMATIQUE UNIFIÉ ==========');
    console.log('📋 Gestion complète des transitions de statuts');
    console.log('⏰ Fréquence: Toutes les minutes');
    console.log('===================================================\n');

    // Exécution immédiate
    this.executerVerificationComplete();

    // Puis toutes les minutes
    const job = cron.schedule('* * * * *', async () => {
      await this.executerVerificationComplete();
    });

    this.jobs.push(job);
    this.isRunning = true;

    console.log('✅ Service démarré\n');
  }

  stop() {
    if (!this.isRunning) {
      console.log('⚠️ Service non démarré');
      return;
    }

    console.log('🛑 Arrêt du service...');
    this.jobs.forEach(job => job.stop());
    this.jobs = [];
    this.isRunning = false;
    console.log('✅ Service arrêté\n');
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      jobsCount: this.jobs.length
    };
  }

  // Notifications (TODO)
  async _envoyerNotificationActivation(trajet) {
    console.log(`📧 Notification activation: ${trajet._id}`);
  }

  async _envoyerNotificationTerminaison(trajet) {
    console.log(`📧 Notification terminaison: ${trajet._id}`);
  }

  async _envoyerNotificationExpiration(trajet) {
    console.log(`📧 Notification expiration: ${trajet._id}`);
  }
}

const trajetAutomationService = new TrajetAutomationService();
module.exports = trajetAutomationService;