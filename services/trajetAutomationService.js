const cron = require('node-cron');
const Trajet = require('../models/Trajet');

/**
 * 🚀 SERVICE AUTOMATIQUE DE GESTION DES TRAJETS
 * 
 * Ce service gère automatiquement :
 * 1. L'activation des trajets (PROGRAMME → EN_COURS) à l'heure de départ
 * 2. La terminaison des trajets (EN_COURS → TERMINE) à l'heure d'arrivée
 * 3. L'expiration des trajets (PROGRAMME → EXPIRE) après l'heure de départ
 */

class TrajetAutomationService {
  
  constructor() {
    this.jobs = [];
    this.isRunning = false;
  }

  /**
   * 🔄 Activer les trajets dont l'heure de départ est atteinte
   */
  async activerTrajetsEnAttente() {
    try {
      const maintenant = new Date();
      
      // Trouver les trajets PROGRAMME dont l'heure de départ est passée
      // mais qui ne sont pas encore expirés (marge de 15 minutes)
      const margeActivation = new Date(maintenant.getTime() - 15 * 60 * 1000); // -15 min
      
      const trajetsAActiver = await Trajet.find({
        statutTrajet: 'PROGRAMME',
        dateDepart: {
          $gte: margeActivation,  // Pas trop vieux (max 15 min)
          $lte: maintenant        // Départ passé
        }
      }).populate('conducteurId', 'nom prenom');

      if (trajetsAActiver.length === 0) {
        return { activated: 0, details: [] };
      }

      const results = [];
      
      for (const trajet of trajetsAActiver) {
        // Créer la date/heure exacte du départ
        const [heures, minutes] = trajet.heureDepart.split(':').map(Number);
        const dateDepartComplete = new Date(trajet.dateDepart);
        dateDepartComplete.setHours(heures, minutes, 0, 0);
        
        // Vérifier si l'heure de départ est vraiment atteinte
        if (dateDepartComplete <= maintenant) {
          trajet.statutTrajet = 'EN_COURS';
          await trajet.save();
          
          results.push({
            id: trajet._id,
            conducteur: `${trajet.conducteurId.nom} ${trajet.conducteurId.prenom}`,
            depart: trajet.pointDepart.nom,
            arrivee: trajet.pointArrivee.nom,
            heureDepart: trajet.heureDepart
          });
          
          console.log(`✅ Trajet activé: ${trajet._id} - ${trajet.pointDepart.nom} → ${trajet.pointArrivee.nom}`);
          
          // TODO: Envoyer notification au conducteur et aux passagers
          await this._envoyerNotificationActivation(trajet);
        }
      }

      if (results.length > 0) {
        console.log(`🚀 ${results.length} trajet(s) activé(s) automatiquement`);
      }

      return { activated: results.length, details: results };

    } catch (error) {
      console.error('❌ Erreur lors de l\'activation automatique des trajets:', error);
      return { activated: 0, error: error.message };
    }
  }

  /**
   * 🏁 Terminer les trajets dont l'heure d'arrivée est atteinte
   */
  async terminerTrajetsEnCours() {
    try {
      const maintenant = new Date();
      
      const trajetsATerminer = await Trajet.find({
        statutTrajet: 'EN_COURS'
      }).populate('conducteurId', 'nom prenom');

      if (trajetsATerminer.length === 0) {
        return { terminated: 0, details: [] };
      }

      const results = [];
      
      for (const trajet of trajetsATerminer) {
        // Créer la date/heure d'arrivée prévue
        if (!trajet.heureArriveePrevue) {
          console.log(`⚠️ Trajet ${trajet._id} sans heure d'arrivée prévue`);
          continue;
        }

        const [heures, minutes] = trajet.heureArriveePrevue.split(':').map(Number);
        const dateArriveePrevue = new Date(trajet.dateDepart);
        dateArriveePrevue.setHours(heures, minutes, 0, 0);
        
        // Ajouter la durée du trajet si l'arrivée est le lendemain
        if (trajet.dureeEstimee) {
          const [heuresDepart, minutesDepart] = trajet.heureDepart.split(':').map(Number);
          const dateDepartComplete = new Date(trajet.dateDepart);
          dateDepartComplete.setHours(heuresDepart, minutesDepart, 0, 0);
          
          // Si l'heure d'arrivée est "avant" l'heure de départ, c'est le lendemain
          if (heures < heuresDepart || (heures === heuresDepart && minutes < minutesDepart)) {
            dateArriveePrevue.setDate(dateArriveePrevue.getDate() + 1);
          }
        }
        
        // Ajouter une marge de 30 minutes après l'arrivée prévue
        const margeTerminaison = new Date(dateArriveePrevue.getTime() + 30 * 60 * 1000);
        
        if (maintenant >= margeTerminaison) {
          trajet.statutTrajet = 'TERMINE';
          await trajet.save();
          
          results.push({
            id: trajet._id,
            conducteur: `${trajet.conducteurId.nom} ${trajet.conducteurId.prenom}`,
            depart: trajet.pointDepart.nom,
            arrivee: trajet.pointArrivee.nom,
            heureArrivee: trajet.heureArriveePrevue
          });
          
          console.log(`🏁 Trajet terminé: ${trajet._id} - Arrivée prévue: ${trajet.heureArriveePrevue}`);
          
          // TODO: Envoyer notification de fin de trajet
          await this._envoyerNotificationTerminaison(trajet);
        }
      }

      if (results.length > 0) {
        console.log(`🏁 ${results.length} trajet(s) terminé(s) automatiquement`);
      }

      return { terminated: results.length, details: results };

    } catch (error) {
      console.error('❌ Erreur lors de la terminaison automatique des trajets:', error);
      return { terminated: 0, error: error.message };
    }
  }

  /**
   * ⏰ Expirer les trajets PROGRAMME qui sont trop anciens
   */
  async expirerTrajetsNonActives() {
    try {
      const maintenant = new Date();
      
      // Trajets PROGRAMME dont le départ était il y a plus de 24 heures
      const limiteExpiration = new Date(maintenant.getTime() - 24 * 60 * 60 * 1000);
      
      const trajetsAExpirer = await Trajet.find({
        statutTrajet: 'PROGRAMME'
      }).populate('conducteurId', 'nom prenom');

      if (trajetsAExpirer.length === 0) {
        return { expired: 0, details: [] };
      }

      const results = [];
      
      for (const trajet of trajetsAExpirer) {
        const [heures, minutes] = trajet.heureDepart.split(':').map(Number);
        const dateDepartComplete = new Date(trajet.dateDepart);
        dateDepartComplete.setHours(heures, minutes, 0, 0);
        
        // Si le départ était il y a plus de 24 heures, expirer le trajet
        if (dateDepartComplete < limiteExpiration) {
          trajet.statutTrajet = 'EXPIRE';
          trajet.dateExpiration = maintenant;
          trajet.raisonExpiration = 'Trajet non activé - heure de départ dépassée';
          await trajet.save();
          
          results.push({
            id: trajet._id,
            conducteur: `${trajet.conducteurId.nom} ${trajet.conducteurId.prenom}`,
            depart: trajet.pointDepart.nom,
            heureDepart: trajet.heureDepart,
            retard: Math.round((maintenant - dateDepartComplete) / (60 * 1000))
          });
          
          console.log(`⏰ Trajet expiré: ${trajet._id} - Retard: ${results[results.length - 1].retard} min`);
          
          // TODO: Envoyer notification d'expiration
          await this._envoyerNotificationExpiration(trajet);
        }
      }

      if (results.length > 0) {
        console.log(`⏰ ${results.length} trajet(s) expiré(s) automatiquement`);
      }

      return { expired: results.length, details: results };

    } catch (error) {
      console.error('❌ Erreur lors de l\'expiration automatique des trajets:', error);
      return { expired: 0, error: error.message };
    }
  }

  /**
   * 🔄 Exécuter toutes les vérifications
   */
  async executerVerificationComplete() {
    console.log('\n🔄 ========== VERIFICATION AUTOMATIQUE DES TRAJETS ==========');
    console.log(`⏰ ${new Date().toLocaleString('fr-FR')}\n`);

    const debut = Date.now();

    const [activation, terminaison, expiration] = await Promise.all([
      this.activerTrajetsEnAttente(),
      this.terminerTrajetsEnCours(),
      this.expirerTrajetsNonActives()
    ]);

    const duree = Date.now() - debut;

    const total = activation.activated + terminaison.terminated + expiration.expired;

    console.log('\n📊 Résumé de la vérification:');
    console.log(`   ✅ Trajets activés: ${activation.activated}`);
    console.log(`   🏁 Trajets terminés: ${terminaison.terminated}`);
    console.log(`   ⏰ Trajets expirés: ${expiration.expired}`);
    console.log(`   ⏱️  Durée: ${duree}ms`);
    
    if (total > 0) {
      console.log(`\n🎉 ${total} trajet(s) mis à jour avec succès`);
    } else {
      console.log('\n✅ Aucun trajet à mettre à jour');
    }
    
    console.log('========================================================\n');

    return {
      timestamp: new Date().toISOString(),
      activation,
      terminaison,
      expiration,
      total,
      duree: `${duree}ms`
    };
  }

  /**
   * 🚀 Démarrer le service automatique
   */
  start() {
    if (this.isRunning) {
      console.log('⚠️ Le service de gestion automatique des trajets est déjà démarré');
      return;
    }

    console.log('\n🚀 ========== DEMARRAGE DU SERVICE AUTOMATIQUE ==========');
    console.log('📋 Fonctionnalités actives:');
    console.log('   1. Activation automatique des trajets');
    console.log('   2. Terminaison automatique des trajets');
    console.log('   3. Expiration des trajets non activés');
    console.log('⏰ Fréquence: Toutes les minutes');
    console.log('========================================================\n');

    // Exécuter immédiatement une première fois
    this.executerVerificationComplete();

    // Puis exécuter toutes les minutes
    const job = cron.schedule('* * * * *', async () => {
      await this.executerVerificationComplete();
    });

    this.jobs.push(job);
    this.isRunning = true;

    console.log('✅ Service automatique démarré avec succès\n');
  }

  /**
   * 🛑 Arrêter le service automatique
   */
  stop() {
    if (!this.isRunning) {
      console.log('⚠️ Le service n\'est pas démarré');
      return;
    }

    console.log('🛑 Arrêt du service de gestion automatique des trajets...');
    
    this.jobs.forEach(job => job.stop());
    this.jobs = [];
    this.isRunning = false;

    console.log('✅ Service arrêté\n');
  }

  /**
   * 📊 Obtenir le statut du service
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      jobsCount: this.jobs.length,
      startedAt: this.isRunning ? new Date().toISOString() : null
    };
  }

  // ==================== NOTIFICATIONS ====================

  /**
   * 📧 Envoyer notification d'activation
   */
  async _envoyerNotificationActivation(trajet) {
    // TODO: Implémenter l'envoi de notifications
    // - Email au conducteur
    // - Push notification
    // - WhatsApp via Green API
    console.log(`📧 Notification d'activation à envoyer pour trajet ${trajet._id}`);
  }

  /**
   * 📧 Envoyer notification de terminaison
   */
  async _envoyerNotificationTerminaison(trajet) {
    // TODO: Implémenter l'envoi de notifications
    console.log(`📧 Notification de terminaison à envoyer pour trajet ${trajet._id}`);
  }

  /**
   * 📧 Envoyer notification d'expiration
   */
  async _envoyerNotificationExpiration(trajet) {
    // TODO: Implémenter l'envoi de notifications
    console.log(`📧 Notification d'expiration à envoyer pour trajet ${trajet._id}`);
  }
}

// Créer et exporter l'instance singleton
const trajetAutomationService = new TrajetAutomationService();

module.exports = trajetAutomationService;