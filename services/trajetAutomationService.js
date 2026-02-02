// services/trajetAutomationService.js - VERSION UNIFIÉE COMPLÈTE

const cron = require('node-cron');
const Trajet = require('../models/Trajet');
const Utilisateur = require('../models/Utilisateur'); 
const firebaseService = require('./firebaseService'); 

/**
 * 🚀 SERVICE UNIFIÉ DE GESTION AUTOMATIQUE DES TRAJETS
 * 
 * Logique complète:
 * 1. PROGRAMME + heure départ atteinte (±30min) → EN_COURS
 * 2. PROGRAMME + heure départ dépassée (>30min) → EXPIRE
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
   * PROGRAMME → EN_COURS (dans une fenêtre de ±30 minutes)
   */
  async activerTrajetsEnAttente() {
    try {
      const maintenant = new Date();
      // ✅ APRÈS (±30 min = 1h total)
      const margeAvant = new Date(maintenant.getTime() - 30 * 60 * 1000); // -30 min
      const margeApres = new Date(maintenant.getTime() + 30 * 60 * 1000); // +30 min
      
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
          
          // Activer si dans la fenêtre [-30min, +30min]
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
   * PROGRAMME + départ > 30min → EXPIRE
   */
  async expirerTrajetsNonActives() {
    try {
      const maintenant = new Date();
      const limiteActivation = new Date(maintenant.getTime() - 30 * 60 * 1000); // -30 min
      
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
          
          // Expirer si départ > 30 minutes
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
          
          // ✅ AJOUTER : Envoyer notifications d'expiration
          for (const trajetId of idsAExpirer) {
            const trajetExpire = await Trajet.findById(trajetId).populate('conducteurId', 'nom prenom');
            if (trajetExpire) {
              await this._envoyerNotificationExpiration(trajetExpire);
            }
          }
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
          
          // ✅ AJOUTER : Envoyer notifications de retard
          for (const trajetId of idsEnRetard) {
            const trajetRetard = await Trajet.findById(trajetId).populate('conducteurId', 'nom prenom');
            if (trajetRetard) {
              await this._envoyerNotificationRetard(trajetRetard);
            }
          }
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
      
      // ✅ RÉCUPÉRER LES TRAJETS AVANT L'UPDATE
      const trajetsAExpirer = await Trajet.find({
        statutTrajet: 'EN_RETARD',
        dateDebutRetard: { $lt: limiteRetard, $exists: true }
      }).populate('conducteurId', 'nom prenom');
      
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
        
        // ✅ AJOUTER : Envoyer notifications
        for (const trajet of trajetsAExpirer) {
          trajet.raisonExpiration = 'RETARD_EXCESSIF';
          await this._envoyerNotificationExpiration(trajet);
        }
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
    console.log('🔧 Fenêtre d\'activation: ±30 minutes (1h total)'); 
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

  /**
   * 🚗 Notification : Trajet activé
   */
  async _envoyerNotificationActivation(trajet) {
    if (!firebaseService.isEnabled()) {
      console.log(`📧 [SIMULATION] Notification activation: ${trajet._id}`);
      return;
    }

    try {
      await firebaseService.sendToUser(
        trajet.conducteurId._id || trajet.conducteurId,
        {
          title: '🚗 Votre trajet a démarré !',
          message: `${trajet.pointDepart.nom} → ${trajet.pointArrivee.nom}`,
          data: {
            type: 'TRAJET_ACTIVE',
            trajetId: trajet._id.toString(),
            depart: trajet.pointDepart.nom,
            arrivee: trajet.pointArrivee.nom,
            heureDepart: trajet.heureDepart,
            screen: 'TrajetDetails'
          },
          channelId: 'trajets',
          type: 'trajets'
        },
        Utilisateur
      );
      
      console.log(`✅ Notification activation envoyée: ${trajet._id}`);
    } catch (error) {
      console.error(`❌ Erreur notification activation ${trajet._id}:`, error.message);
    }
  }


  /**
   * 🏁 Notification : Trajet terminé
   */
  async _envoyerNotificationTerminaison(trajet) {
    if (!firebaseService.isEnabled()) {
      console.log(`📧 [SIMULATION] Notification terminaison: ${trajet._id}`);
      return;
    }

    try {
      await firebaseService.sendToUser(
        trajet.conducteurId._id || trajet.conducteurId,
        {
          title: '🏁 Trajet terminé avec succès !',
          message: `Félicitations ! ${trajet.pointDepart.nom} → ${trajet.pointArrivee.nom}`,
          data: {
            type: 'TRAJET_TERMINE',
            trajetId: trajet._id.toString(),
            depart: trajet.pointDepart.nom,
            arrivee: trajet.pointArrivee.nom,
            heureArrivee: trajet.heureArriveePrevue,
            screen: 'TrajetHistory'
          },
          channelId: 'trajets',
          type: 'trajets'
        },
        Utilisateur
      );
      
      console.log(`✅ Notification terminaison envoyée: ${trajet._id}`);
    } catch (error) {
      console.error(`❌ Erreur notification terminaison ${trajet._id}:`, error.message);
    }
  }

  /**
   * ⏰ Notification : Trajet expiré
   */
  async _envoyerNotificationExpiration(trajet) {
    if (!firebaseService.isEnabled()) {
      console.log(`📧 [SIMULATION] Notification expiration: ${trajet._id}`);
      return;
    }

    try {
      await firebaseService.sendToUser(
        trajet.conducteurId._id || trajet.conducteurId,
        {
          title: '⏰ Trajet expiré',
          message: `Le trajet ${trajet.pointDepart.nom} → ${trajet.pointArrivee.nom} a expiré`,
          data: {
            type: 'TRAJET_EXPIRE',
            trajetId: trajet._id.toString(),
            depart: trajet.pointDepart.nom,
            arrivee: trajet.pointArrivee.nom,
            raisonExpiration: trajet.raisonExpiration || 'DATE_PASSEE',
            screen: 'TrajetHistory'
          },
          channelId: 'trajets',
          type: 'trajets'
        },
        Utilisateur
      );
      
      console.log(`✅ Notification expiration envoyée: ${trajet._id}`);
    } catch (error) {
      console.error(`❌ Erreur notification expiration ${trajet._id}:`, error.message);
    }
  }
   /**
   * ⚠️ Notification : Trajet en retard (NOUVEAU)
   */
  async _envoyerNotificationRetard(trajet) {
    if (!firebaseService.isEnabled()) {
      console.log(`📧 [SIMULATION] Notification retard: ${trajet._id}`);
      return;
    }

    try {
      await firebaseService.sendToUser(
        trajet.conducteurId._id || trajet.conducteurId,
        {
          title: '⚠️ Trajet en retard',
          message: `Votre trajet vers ${trajet.pointArrivee.nom} est marqué en retard`,
          data: {
            type: 'TRAJET_RETARD',
            trajetId: trajet._id.toString(),
            depart: trajet.pointDepart.nom,
            arrivee: trajet.pointArrivee.nom,
            heureArriveePrevue: trajet.heureArriveePrevue,
            screen: 'TrajetDetails'
          },
          channelId: 'trajets',
          type: 'trajets'
        },
        Utilisateur
      );
      
      console.log(`✅ Notification retard envoyée: ${trajet._id}`);
    } catch (error) {
      console.error(`❌ Erreur notification retard ${trajet._id}:`, error.message);
    }
  }
}

const trajetAutomationService = new TrajetAutomationService();
module.exports = trajetAutomationService;