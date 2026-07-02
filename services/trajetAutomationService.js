// services/trajetAutomationService.js - VERSION SIMPLIFIÉE

const cron = require('node-cron');
const Trajet = require('../models/Trajet');
const Utilisateur = require('../models/Utilisateur'); 
const firebaseService = require('./firebaseService'); 
const Reservation = require('../models/Reservation');

/**
 * 🚀 SERVICE SIMPLIFIÉ DE GESTION AUTOMATIQUE DES TRAJETS
 * 
 * Logique:
 * 1. PROGRAMME + heure départ atteinte (±30min) → EN_COURS (auto)
 * 2. PROGRAMME + heure départ dépassée (>30min) → EXPIRE (auto)
 * 3. EN_COURS → TERMINE (manuel conducteur)
 * 4. PROGRAMME + retard départ 3,5,10,15,20,25 min → Notifications
 * 5. RECURRENT + date fin dépassée → EXPIRE (auto)
 * 
 * Note: EN_RETARD supprimé (trajets longue distance 10h+)
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
    const margeAvant = new Date(maintenant.getTime() - 30 * 60 * 1000); // -30 min
    const margeApres = new Date(maintenant.getTime() + 30 * 60 * 1000);  // +30 min
    
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
        dateDepartComplete.setUTCHours(heures, minutes, 0, 0);
        
        // Activer si dans la fenêtre [-30min, +30min]
        if (dateDepartComplete >= margeAvant && dateDepartComplete <= margeApres) {
          trajet.statutTrajet = 'EN_COURS';
          
          // ✅ IMPORTANT: Sauvegarder AVANT les notifications
          await trajet.save();

          results.push({
            id: trajet._id,
            conducteur: `${trajet.conducteurId.nom} ${trajet.conducteurId.prenom}`,
            depart: trajet.pointDepart.nom,
            arrivee: trajet.pointArrivee.nom,
            heureDepart: trajet.heureDepart
          });

          console.log(`✅ Trajet activé: ${trajet._id}`);
          
          // ✅ VERIFIER si notification déjà envoyée
          if (!trajet.notificationActivationEnvoyee) {
            // 1️⃣ Notification conducteur
            await this._envoyerNotificationActivation(trajet);

            // 2️⃣ Notification passagers confirmés
            await this._notifierPassagersConfirmation(trajet);
            
            // ✅ Marquer les notifications comme envoyées
            trajet.notificationActivationEnvoyee = true;
            trajet.dateNotificationActivation = new Date();
            await trajet.save();
          }
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
      
      const trajetsAExpirer = await Trajet.find({
        statutTrajet: 'PROGRAMME',
        dateDepart: { $exists: true },
        heureDepart: { $exists: true }
      });

      const idsAExpirer = [];
      
      for (const trajet of trajetsAExpirer) {
        try {
          // calculer la "date de référence" : arrivée prévue (si fournie) sinon départ
          let referenceDate = null;

          if (trajet.heureArriveePrevue) {
            const [hArr, mArr] = trajet.heureArriveePrevue.split(':').map(Number);
            referenceDate = new Date(trajet.dateDepart);
            referenceDate.setUTCHours(hArr, mArr, 0, 0);

            if (trajet.heureDepart) {
              const [hDep, mDep] = trajet.heureDepart.split(':').map(Number);
              if (hArr < hDep || (hArr === hDep && mArr < mDep)) {
                // arrivée le lendemain
                referenceDate.setDate(referenceDate.getDate() + 1);
              }
            }
          } else if (trajet.heureDepart) {
            const [heures, minutes] = trajet.heureDepart.split(':').map(Number);
            referenceDate = new Date(trajet.dateDepart);
            referenceDate.setUTCHours(heures, minutes, 0, 0);
          }

          if (!referenceDate) continue;

          // on ajoute un petit délai (30 min) avant d'expirer
          const expirationThreshold = new Date(referenceDate.getTime() + 30 * 60 * 1000);

          if (maintenant > expirationThreshold) {
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
              raisonExpiration: 'DEPART_MANQUE'
            }
          }
        );
        expired = result.modifiedCount;
        
        if (expired > 0) {
          console.log(`⏰ ${expired} trajet(s) PROGRAMME expiré(s)`);
          
          for (const trajetId of idsAExpirer) {
          const trajetExpire = await Trajet.findById(trajetId)
            .populate('conducteurId', 'nom prenom')
            .populate('passagers');

          if (trajetExpire) {
            // ✅ VERIFIER si notification déjà envoyée
            if (!trajetExpire.notificationExpirationEnvoyee) {
              // 1️⃣ Notification conducteur
              await this._envoyerNotificationExpiration(trajetExpire);

              // 2️⃣ Notification passagers confirmés
              await this._notifierPassagersExpiration(trajetExpire);
              
              // ✅ Marquer les notifications comme envoyées
              trajetExpire.notificationExpirationEnvoyee = true;
              trajetExpire.dateNotificationExpiration = new Date();
              await trajetExpire.save();
            }
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
          dateArriveePrevue.setUTCHours(heures, minutes, 0, 0);
          
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
            
            // ✅ VERIFIER si notification déjà envoyée
            if (!trajet.notificationTerminaisonEnvoyee) {
              await this._envoyerNotificationTerminaison(trajet);
              
              // ✅ Marquer les notifications comme envoyées
              trajet.notificationTerminaisonEnvoyee = true;
              trajet.dateNotificationTerminaison = new Date();
              await trajet.save();
            }
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
   * 🔁 4. EXPIRER les récurrences terminées
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
   * 🔔 5. Notifier les conducteurs en retard de DÉPART
   * (Pas de changement de statut, juste des notifications)
   * ✅ CORRIGÉ: Ajoute des flags pour éviter les notifications doublons
   */
  async notifierRetardsDepart() {
  try {
    const maintenant = new Date();
    
    const trajetsEnRetardDepart = await Trajet.find({
      statutTrajet: 'PROGRAMME',
      dateDepart: { $exists: true },
      heureDepart: { $exists: true }
    }).populate('conducteurId', 'fcmTokens nom prenom');

    let notificationsEnvoyees = 0;
    const seuilsNotification = [3, 5, 10, 15, 20, 25];
    
    for (const trajet of trajetsEnRetardDepart) {
      try {
        const [hDepart, mDepart] = trajet.heureDepart.split(':').map(Number);
        const dateDepartComplete = new Date(trajet.dateDepart);
        dateDepartComplete.setUTCHours(hDepart, mDepart, 0, 0);
        
        const retardMinutes = Math.floor((maintenant - dateDepartComplete) / (1000 * 60));
        
        // ✅ Chercher si ce seuil doit être notifié
        if (seuilsNotification.includes(retardMinutes)) {
          
          if (!trajet.conducteurId?.fcmTokens?.length) {
            continue;
          }
          
          // ✅ NE NOTIFIER QUE SI PAS DÉJÀ NOTIFIÉ À CE SEUIL
          if (!trajet.notificationsRetardSeuils?.[`seuil_${retardMinutes}min`]) {
            
            await firebaseService.sendToMultipleTokens(
              trajet.conducteurId.fcmTokens,
              {
                title: '⏰ Retard de départ',
                body: `Vous avez ${retardMinutes} min de retard. Démarrez le trajet vers ${trajet.pointArrivee.nom}`,
                data: {
                  type: 'DEPARTURE_DELAY',
                  trajetId: trajet._id.toString(),
                  retardMinutes: retardMinutes.toString(),
                  screen: 'TripDetails'
                }
              },
              { channelId: 'trajets', priority: 'high' }
            );
            
            // ✅ MARQUER LE SEUIL COMME NOTIFIÉ
            trajet.notificationsRetardSeuils[`seuil_${retardMinutes}min`] = true;
            await trajet.save();
            
            notificationsEnvoyees++;
            console.log(`🔔 Notification retard départ ${retardMinutes} min: ${trajet._id}`);
          }
        }
        
      } catch (error) {
        console.error(`⚠️ Erreur notification ${trajet._id}:`, error.message);
      }
    }
    
    if (notificationsEnvoyees > 0) {
      console.log(`✅ ${notificationsEnvoyees} notification(s) retard départ envoyée(s)`);
    }
    
    return notificationsEnvoyees;
    
  } catch (error) {
    console.error('❌ Erreur notifierRetardsDepart:', error);
    return 0;
  }
  }

  /**
   * 🔄 Exécuter toutes les vérifications (ordre important!)
   */
  async executerVerificationComplete() {
    console.log('\n🔄 ========== VERIFICATION AUTOMATIQUE SIMPLIFIÉE ==========');
    console.log(`⏰ ${new Date().toLocaleString('fr-FR')}\n`);

    const debut = Date.now();
    const resultats = {};
    
    // 1. Activation (PROGRAMME → EN_COURS)
    resultats.activation = await this.activerTrajetsEnAttente();
    
    // 2. Expiration PROGRAMME trop anciens
    resultats.expirationProgramme = await this.expirerTrajetsNonActives();
    
    // 3. Terminaison normale (EN_COURS → TERMINE)
    resultats.terminaison = await this.terminerTrajetsEnCours();
    
    // 4. Expiration récurrences
    resultats.recurrences = await this.expirerRecurrences();
    
    // 5. Notifications retards de départ
    resultats.notificationsRetard = await this.notifierRetardsDepart();

    // 3.5 Notification oubli arrivée
    resultats.rappelArrivee = await this.notifierOubliArrivee();

    // 3.6 Expiration EN_COURS sans confirmation
    resultats.expirationEnCours = await this.expirerEnCoursSansConfirmation();

    const duree = Date.now() - debut;

    const total = 
      resultats.activation.activated + 
      resultats.expirationProgramme.expired + 
      resultats.terminaison.terminated + 
      resultats.recurrences.recurrencesExpired;

    console.log('\n📊 Résumé:');
    console.log(`   ✅ Activés: ${resultats.activation.activated}`);
    console.log(`   ⏰ PROGRAMME expirés: ${resultats.expirationProgramme.expired}`);
    console.log(`   🏁 Terminés: ${resultats.terminaison.terminated}`);
    console.log(`   🔁 Récurrences expirées: ${resultats.recurrences.recurrencesExpired}`);
    console.log(`   🔔 Notifications retard: ${resultats.notificationsRetard || 0}`);
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

    console.log('\n🚀 ========== SERVICE AUTOMATIQUE SIMPLIFIÉ ==========');
    console.log('📋 Gestion automatique des transitions de statuts');
    console.log('🔧 Fenêtre d\'activation: ±24 heures (48h total)');
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

  _calculerDateArrivee(trajet) {
  const [hArr, mArr] = trajet.heureArriveePrevue.split(':').map(Number);
  const [hDep, mDep] = trajet.heureDepart.split(':').map(Number);
  const dateArrivee = new Date(trajet.dateDepart);
  dateArrivee.setUTCHours(hArr, mArr, 0, 0);
  if (hArr < hDep || (hArr === hDep && mArr < mDep)) {
    dateArrivee.setDate(dateArrivee.getDate() + 1);
  }
  return dateArrivee;
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
  async _notifierPassagersConfirmation(trajet) {
  try {
    // ✅ Utiliser le modèle Reservation séparé (comme dans votre controller)
    
    const reservations = await Reservation.find({
      trajetId: trajet._id,
      statutReservation: 'CONFIRMEE'
    }).populate('passagerId', 'fcmTokens nom prenom');

    if (!reservations || reservations.length === 0) {
      console.log(`ℹ️ Aucun passager confirmé pour ${trajet._id}`);
      return;
    }

    for (const reservation of reservations) {
      const passager = reservation.passagerId;
      
      if (passager?.fcmTokens?.length) {
        await firebaseService.sendToMultipleTokens(
          passager.fcmTokens,
          {
            title: '🚗 Votre trajet commence !',
            body: `Le trajet ${trajet.pointDepart.nom} → ${trajet.pointArrivee.nom} a démarré.`,
            data: {
              type: 'TRAJET_DEMARRE',
              trajetId: trajet._id.toString(),
              reservationId: reservation._id.toString(),
              depart: trajet.pointDepart.nom,
              arrivee: trajet.pointArrivee.nom,
              screen: 'TripDetails'
            }
          },
          { channelId: 'trajets', priority: 'high' }
        );

        console.log(`🔔 Notification envoyée: ${passager.nom} ${passager.prenom}`);
      }
    }
  } catch (error) {
    console.error('❌ Erreur notification passagers:', error.message);
  }
  }

  async _notifierPassagersExpiration(trajet) {
    try {
      const Reservation = require('../models/Reservation');
      
      const reservations = await Reservation.find({
        trajetId: trajet._id,
        statutReservation: 'CONFIRMEE'
      }).populate('passagerId', 'fcmTokens nom prenom');

      if (!reservations || reservations.length === 0) return;

      for (const reservation of reservations) {
        const passager = reservation.passagerId;
        
        if (passager?.fcmTokens?.length) {
          await firebaseService.sendToMultipleTokens(
            passager.fcmTokens,
            {
              title: '⏰ Trajet annulé',
              body: `Le trajet ${trajet.pointDepart.nom} → ${trajet.pointArrivee.nom} a été annulé.`,
              data: {
                type: 'TRAJET_EXPIRE',
                trajetId: trajet._id.toString(),
                reservationId: reservation._id.toString(),
                screen: 'TripHistory'
              }
            },
            { channelId: 'trajets' }
          );
          
          console.log(`🔔 Notification expiration: ${passager.nom} ${passager.prenom}`);
        }
      }
    } catch (error) {
      console.error('❌ Erreur notification passagers expiré:', error.message);
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
            raisonExpiration: trajet.raisonExpiration || 'DEPART_MANQUE',
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
 * 🔔 Notifier conducteur s'il a oublié de confirmer l'arrivée
 * EN_COURS + arrivée dépassée de 5 min → Notification
 */
async notifierOubliArrivee() {
  try {
    const maintenant = new Date();

    const trajetsConcernés = await Trajet.find({
      statutTrajet: 'EN_COURS',
      heureArriveePrevue: { $exists: true }
    }).populate('conducteurId', 'fcmTokens nom prenom');

    let notifications = 0;

    for (const trajet of trajetsConcernés) {
      try {
        const [hArr, mArr] = trajet.heureArriveePrevue.split(':').map(Number);
        const dateArrivee = new Date(trajet.dateDepart);
        dateArrivee.setUTCHours(hArr, mArr, 0, 0);

        // gérer arrivée le lendemain
        const [hDep, mDep] = trajet.heureDepart.split(':').map(Number);
        if (hArr < hDep || (hArr === hDep && mArr < mDep)) {
          dateArrivee.setDate(dateArrivee.getDate() + 1);
        }

        const apres5min = new Date(dateArrivee.getTime() + 5 * 60 * 1000);

        if (maintenant >= apres5min && !trajet.notificationArriveeEnvoyee) {
          if (trajet.conducteurId?.fcmTokens?.length) {
            await firebaseService.sendToMultipleTokens(
              trajet.conducteurId.fcmTokens,
              {
                title: '🏁 Êtes-vous arrivé ?',
                body: 'Merci de confirmer si vous êtes arrivé à destination.',
                data: {
                  type: 'CONFIRM_ARRIVAL',
                  trajetId: trajet._id.toString(),
                  screen: 'TripDetails'
                }
              }
            );

            trajet.notificationArriveeEnvoyee = true;
            await trajet.save();

            notifications++;
            console.log(`🔔 Rappel arrivée envoyé: ${trajet._id}`);
          }
        }
      } catch (err) {
        console.error(`⚠️ Erreur rappel arrivée ${trajet._id}`, err.message);
      }
    }

    return notifications;
  } catch (error) {
    console.error('❌ notifierOubliArrivee:', error);
    return 0;
  }
}

/**
 * ⏰ Expiration exceptionnelle des trajets EN_COURS sans réponse
 * EN_COURS + arrivée dépassée de 30 min + pas de réponse → EXPIRE
 */
async expirerEnCoursSansConfirmation() {
  try {
    const maintenant = new Date();

    const trajets = await Trajet.find({
      statutTrajet: 'EN_COURS',
      heureArriveePrevue: { $exists: true },
      notificationArriveeEnvoyee: true
    });

    let expired = 0;

    for (const trajet of trajets) {
      try {
        const dateArrivee = this._calculerDateArrivee(trajet);
        
        const apres30min = new Date(dateArrivee.getTime() + 30 * 60 * 1000);

        if (maintenant >= apres30min) {
          trajet.statutTrajet = 'EXPIRE';
          trajet.dateExpiration = maintenant;
          trajet.raisonExpiration = 'AUCUNE_CONFIRMATION_ARRIVEE';

          await trajet.save();
          expired++;

          await this._envoyerNotificationExpiration(trajet);

          console.log(`⏰ Trajet EN_COURS expiré (silence): ${trajet._id}`);
        }
      } catch (err) {
        console.error(`⚠️ Expiration EN_COURS ${trajet._id}`, err.message);
      }
    }

    return expired;
  } catch (error) {
    console.error('❌ expirerEnCoursSansConfirmation:', error);
    return 0;
  }
}

}

const trajetAutomationService = new TrajetAutomationService();
module.exports = trajetAutomationService;