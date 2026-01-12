const cron = require('node-cron');
const Reservation = require('../models/Reservation');
const Trajet = require('../models/Trajet');
const { logger } = require('../utils/logger');

/**
 * ===============================================
 * 📬 JOB CRON - NOTIFICATIONS PROGRAMMÉES
 * ===============================================
 * 
 * Fréquence : Toutes les 5 minutes
 * Fonction : Envoyer les notifications programmées arrivées à échéance
 */
const notificationJob = cron.schedule(
  '*/5 * * * *', // Toutes les 5 minutes
  async () => {
    try {
      logger.info('🕐 Démarrage job notifications programmées');
      const startTime = Date.now();
      
      const stats = await Reservation.executerNotificationsPrevues(100);
      
      const duration = Date.now() - startTime;
      
      logger.info('✅ Job notifications terminé', {
        ...stats,
        durationMs: duration
      });
      
      // Alerter si taux d'échec élevé
      const tauxEchec = stats.notificationsEnvoyees > 0 
        ? (stats.echecs / (stats.notificationsEnvoyees + stats.echecs)) * 100
        : 0;
      
      if (tauxEchec > 50) {
        logger.warn('⚠️ Taux d\'échec élevé pour les notifications', {
          tauxEchec: `${tauxEchec.toFixed(2)}%`,
          echecs: stats.echecs,
          envoyees: stats.notificationsEnvoyees
        });
      }
      
    } catch (error) {
      logger.error('❌ Erreur job notifications:', {
        error: error.message,
        stack: error.stack
      });
    }
  },
  {
    scheduled: false, // Ne pas démarrer automatiquement
    timezone: "Africa/Abidjan" // Timezone de la Côte d'Ivoire
  }
);

/**
 * ===============================================
 * 🗓️ JOB CRON - EXPIRATION DES TRAJETS
 * ===============================================
 * 
 * Fréquence : Toutes les heures
 * Fonction : Marquer les trajets passés comme expirés
 */
const expirationJob = cron.schedule(
  '0 * * * *', // Toutes les heures à :00
  async () => {
    try {
      logger.info('🕐 Démarrage job expiration trajets');
      const startTime = Date.now();
      
      // Marquer les trajets ponctuels expirés
      const result = await Trajet.marquerTrajetsExpires();
      
      // Marquer les récurrences terminées
      const resultRec = await Trajet.marquerRecurrencesExpirees();
      
      const duration = Date.now() - startTime;
      
      logger.info('✅ Job expiration terminé', {
        trajetsExpires: result.modifiedCount,
        recurrencesExpirees: resultRec.modifiedCount,
        durationMs: duration
      });
      
      // Obtenir les statistiques
      const statsExpiration = await Trajet.getStatistiquesExpiration();
      logger.info('📊 Statistiques expiration:', statsExpiration);
      
    } catch (error) {
      logger.error('❌ Erreur job expiration:', {
        error: error.message,
        stack: error.stack
      });
    }
  },
  {
    scheduled: false,
    timezone: "Africa/Abidjan"
  }
);

/**
 * ===============================================
 * 🧹 JOB CRON - NETTOYAGE DES VIEUX TRAJETS
 * ===============================================
 * 
 * Fréquence : Tous les jours à 3h du matin
 * Fonction : Supprimer les trajets expirés de plus de 30 jours
 */
const cleanupJob = cron.schedule(
  '0 3 * * *', // Tous les jours à 3h00
  async () => {
    try {
      logger.info('🕐 Démarrage job nettoyage trajets');
      const startTime = Date.now();
      
      const result = await Trajet.nettoyerVieuxTrajetsExpires(30);
      
      const duration = Date.now() - startTime;
      
      logger.info('✅ Job nettoyage terminé', {
        trajetsSupprimes: result.deletedCount,
        durationMs: duration
      });
      
    } catch (error) {
      logger.error('❌ Erreur job nettoyage:', {
        error: error.message,
        stack: error.stack
      });
    }
  },
  {
    scheduled: false,
    timezone: "Africa/Abidjan"
  }
);

/**
 * ===============================================
 * GESTION DES JOBS
 * ===============================================
 */

module.exports = {
  notificationJob,
  expirationJob,
  cleanupJob,
  
  /**
   * Démarrer tous les jobs
   */
  startAll: () => {
    logger.info('🚀 Démarrage des jobs CRON');
    
    notificationJob.start();
    logger.info('  ✓ Job notifications programmées activé (*/5 * * * *)');
    
    expirationJob.start();
    logger.info('  ✓ Job expiration trajets activé (0 * * * *)');
    
    cleanupJob.start();
    logger.info('  ✓ Job nettoyage trajets activé (0 3 * * *)');
  },
  
  /**
   * Arrêter tous les jobs
   */
  stopAll: () => {
    logger.info('🛑 Arrêt des jobs CRON');
    
    notificationJob.stop();
    expirationJob.stop();
    cleanupJob.stop();
  },
  
  /**
   * Obtenir le statut des jobs
   */
  getStatus: () => {
    return {
      notification: {
        running: notificationJob.getStatus() === 'scheduled',
        schedule: '*/5 * * * *',
        description: 'Notifications programmées'
      },
      expiration: {
        running: expirationJob.getStatus() === 'scheduled',
        schedule: '0 * * * *',
        description: 'Expiration des trajets'
      },
      cleanup: {
        running: cleanupJob.getStatus() === 'scheduled',
        schedule: '0 3 * * *',
        description: 'Nettoyage des vieux trajets'
      }
    };
  },
  
  /**
 * Exécuter un job manuellement (pour tests)
 */
runManually: async (jobName) => {
  logger.info(`🔧 Exécution manuelle du job: ${jobName}`);
  
  switch (jobName) {
    case 'notification': {
      // ✅ Accolades = scope isolé
      const result = await Reservation.executerNotificationsPrevues(100);
      return result;
    }
    
    case 'expiration': {
      // ✅ Accolades = scope isolé
      const r1 = await Trajet.marquerTrajetsExpires();
      const r2 = await Trajet.marquerRecurrencesExpirees();
      return { 
        trajets: r1.modifiedCount, 
        recurrences: r2.modifiedCount 
      };
    }
    
    case 'cleanup': {
      // ✅ Accolades = scope isolé
      const result = await Trajet.nettoyerVieuxTrajetsExpires(30);
      return result;
    }
    
    default:
      throw new Error(`Job inconnu: ${jobName}`);
  }
}
};