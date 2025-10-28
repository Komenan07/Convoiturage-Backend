// services/trajetService.js

const Trajet = require('../models/Trajet');
const { logger } = require('../utils/logger');

/**
 * Service de gestion de l'expiration des trajets
 * 
 * Ce service gère automatiquement:
 * - L'expiration des trajets dont la date est passée
 * - L'expiration des récurrences terminées
 * - Le nettoyage des vieux trajets expirés
 * - Les notifications avant expiration
 */

class TrajetExpirationService {
  constructor() {
    this.isRunning = false;
    this.lastRunTime = null;
    this.stats = {
      totalExpired: 0,
      totalRecurrencesExpired: 0,
      totalCleaned: 0,
      lastRun: null
    };
  }

  /**
   * Vérifier et marquer tous les trajets expirés
   */
  async verifierTrajetsExpires() {
    try {
      logger.info('🔍 Vérification des trajets expirés...');

      // Marquer les trajets ponctuels expirés
      const resultTrajets = await Trajet.marquerTrajetsExpires();
      
      // Marquer les récurrences expirées
      const resultRecurrences = await Trajet.marquerRecurrencesExpirees();

      this.stats.totalExpired += resultTrajets.modifiedCount;
      this.stats.totalRecurrencesExpired += resultRecurrences.modifiedCount;
      this.stats.lastRun = new Date();

      logger.info(`✅ Trajets expirés: ${resultTrajets.modifiedCount}`);
      logger.info(`✅ Récurrences expirées: ${resultRecurrences.modifiedCount}`);

      return {
        success: true,
        trajetsExpires: resultTrajets.modifiedCount,
        recurrencesExpirees: resultRecurrences.modifiedCount
      };
    } catch (error) {
      logger.error('❌ Erreur lors de la vérification des trajets expirés:', error);
      throw error;
    }
  }

  /**
   * Nettoyer les vieux trajets expirés
   * @param {number} joursAGarder - Nombre de jours à garder les trajets expirés
   */
  async nettoyerVieuxTrajets(joursAGarder = 30) {
    try {
      logger.info(`🧹 Nettoyage des trajets expirés depuis plus de ${joursAGarder} jours...`);

      const result = await Trajet.nettoyerVieuxTrajetsExpires(joursAGarder);

      this.stats.totalCleaned += result.deletedCount;

      logger.info(`✅ ${result.deletedCount} vieux trajets supprimés`);

      return {
        success: true,
        trajetsSupprimés: result.deletedCount
      };
    } catch (error) {
      logger.error('❌ Erreur lors du nettoyage des vieux trajets:', error);
      throw error;
    }
  }

  /**
   * Obtenir les statistiques d'expiration
   */
  async obtenirStatistiques() {
    try {
      const stats = await Trajet.getStatistiquesExpiration();
      return {
        ...stats,
        serviceStats: this.stats
      };
    } catch (error) {
      logger.error('❌ Erreur lors de la récupération des statistiques:', error);
      throw error;
    }
  }

  /**
   * Trouver les trajets qui vont expirer bientôt
   * @param {number} heures - Nombre d'heures avant expiration
   */
  async trouverTrajetsAExpirer(heures = 2) {
    try {
      const trajets = await Trajet.findTrajetsAExpirer(heures);
      logger.info(`📋 ${trajets.length} trajets vont expirer dans ${heures}h`);
      return trajets;
    } catch (error) {
      logger.error('❌ Erreur lors de la recherche des trajets à expirer:', error);
      throw error;
    }
  }

  /**
   * Notifier les conducteurs des trajets sur le point d'expirer
   * @param {number} heures - Nombre d'heures avant expiration
   */
  async notifierTrajetsAExpirer(heures = 2) {
    try {
      const trajets = await this.trouverTrajetsAExpirer(heures);

      if (trajets.length === 0) {
        logger.info('✅ Aucun trajet à notifier');
        return { success: true, notificationsSent: 0 };
      }

      // Grouper par conducteur
      const conducteurs = new Map();
      trajets.forEach(trajet => {
        const conducteurId = trajet.conducteurId.toString();
        if (!conducteurs.has(conducteurId)) {
          conducteurs.set(conducteurId, []);
        }
        conducteurs.get(conducteurId).push(trajet);
      });

      // TODO: Implémenter l'envoi de notifications
      // Pour l'instant, juste logger
      logger.info(`📧 ${conducteurs.size} conducteurs à notifier pour ${trajets.length} trajets`);

      return {
        success: true,
        notificationsSent: conducteurs.size,
        trajetsNotifies: trajets.length
      };
    } catch (error) {
      logger.error('❌ Erreur lors de la notification des trajets:', error);
      throw error;
    }
  }

  /**
   * Exécuter toutes les tâches de maintenance
   */
  async executerMaintenance() {
    if (this.isRunning) {
      logger.warn('⚠️ Une maintenance est déjà en cours');
      return { success: false, message: 'Maintenance déjà en cours' };
    }

    try {
      this.isRunning = true;
      this.lastRunTime = new Date();

      logger.info('🚀 Début de la maintenance des trajets');

      // 1. Vérifier et marquer les trajets expirés
      const resultExpiration = await this.verifierTrajetsExpires();

      // 2. Notifier les trajets qui vont expirer dans 2h
      const resultNotification = await this.notifierTrajetsAExpirer(2);

      // 3. Nettoyer les vieux trajets (garder 30 jours)
      const resultNettoyage = await this.nettoyerVieuxTrajets(30);

      // 4. Obtenir les statistiques
      const statistiques = await this.obtenirStatistiques();

      logger.info('✅ Maintenance terminée avec succès');

      return {
        success: true,
        timestamp: new Date(),
        resultats: {
          expiration: resultExpiration,
          notification: resultNotification,
          nettoyage: resultNettoyage,
          statistiques
        }
      };
    } catch (error) {
      logger.error('❌ Erreur lors de la maintenance:', error);
      return {
        success: false,
        error: error.message
      };
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Obtenir l'état du service
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      lastRunTime: this.lastRunTime,
      stats: this.stats
    };
  }

  /**
   * Réinitialiser les statistiques
   */
  resetStats() {
    this.stats = {
      totalExpired: 0,
      totalRecurrencesExpired: 0,
      totalCleaned: 0,
      lastRun: null
    };
    logger.info('✅ Statistiques réinitialisées');
  }
}

// Instance singleton
const trajetExpirationService = new TrajetExpirationService();

module.exports = trajetExpirationService;