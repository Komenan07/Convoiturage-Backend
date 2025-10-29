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

// ===============================================
// CONSTANTES DE CONFIGURATION
// ===============================================

const CONFIG = {
  // Durée de conservation des trajets expirés (en jours)
  JOURS_CONSERVATION_DEFAUT: 30,
  
  // Délai de notification avant expiration (en heures)
  HEURES_NOTIFICATION_DEFAUT: 2,
  
  // Timeout de la maintenance pour éviter les blocages (en minutes)
  TIMEOUT_MAINTENANCE_MS: 15 * 60 * 1000, // 15 minutes
  
  // Nombre maximum de tentatives en cas d'échec
  MAX_RETRY_ATTEMPTS: 3,
  
  // Délai entre les tentatives (en ms)
  RETRY_DELAY_MS: 2000
};

// ===============================================
// CLASSE PRINCIPALE
// ===============================================

class TrajetExpirationService {
  constructor() {
    this.isRunning = false;
    this.lastRunTime = null;
    this.maintenanceStartTime = null;
    this.stats = {
      totalExpired: 0,
      totalRecurrencesExpired: 0,
      totalCleaned: 0,
      totalNotifications: 0,
      lastRun: null,
      successfulRuns: 0,
      failedRuns: 0
    };
  }

  // ===============================================
  // MÉTHODES UTILITAIRES
  // ===============================================

  /**
   * Valider un paramètre numérique
   * @private
   */
  _validateNumber(value, min, max, paramName) {
    if (typeof value !== 'number' || isNaN(value)) {
      throw new Error(`${paramName} doit être un nombre valide`);
    }
    if (value < min || value > max) {
      throw new Error(`${paramName} doit être entre ${min} et ${max}`);
    }
    return true;
  }

  /**
   * Vérifier si la maintenance est bloquée (timeout)
   * @private
   */
  _checkMaintenanceTimeout() {
    if (this.isRunning && this.maintenanceStartTime) {
      const elapsed = Date.now() - this.maintenanceStartTime;
      if (elapsed > CONFIG.TIMEOUT_MAINTENANCE_MS) {
        logger.error('⚠️ Maintenance bloquée détectée - Réinitialisation forcée');
        this.isRunning = false;
        this.maintenanceStartTime = null;
        return true;
      }
    }
    return false;
  }

  /**
   * Exécuter une opération avec retry
   * @private
   */
  async _executeWithRetry(operation, operationName, maxRetries = CONFIG.MAX_RETRY_ATTEMPTS) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        logger.warn(`⚠️ ${operationName} - Tentative ${attempt}/${maxRetries} échouée:`, error.message);
        
        if (attempt < maxRetries) {
          // Attendre avant de réessayer
          await new Promise(resolve => setTimeout(resolve, CONFIG.RETRY_DELAY_MS * attempt));
        }
      }
    }
    
    // Si toutes les tentatives ont échoué
    throw new Error(`${operationName} a échoué après ${maxRetries} tentatives: ${lastError.message}`);
  }

  // ===============================================
  // MÉTHODES PRINCIPALES
  // ===============================================

  /**
   * Vérifier et marquer tous les trajets expirés
   * @returns {Promise<Object>} Résultat de l'opération
   */
  async verifierTrajetsExpires() {
    try {
      logger.info('🔍 Vérification des trajets expirés...');

      // Marquer les trajets ponctuels expirés avec retry
      const resultTrajets = await this._executeWithRetry(
        () => Trajet.marquerTrajetsExpires(),
        'Marquage des trajets expirés'
      );
      
      // Marquer les récurrences expirées avec retry
      const resultRecurrences = await this._executeWithRetry(
        () => Trajet.marquerRecurrencesExpirees(),
        'Marquage des récurrences expirées'
      );

      // Mettre à jour les statistiques
      this.stats.totalExpired += resultTrajets.modifiedCount || 0;
      this.stats.totalRecurrencesExpired += resultRecurrences.modifiedCount || 0;
      this.stats.lastRun = new Date();

      logger.info(`✅ Trajets expirés: ${resultTrajets.modifiedCount || 0}`);
      logger.info(`✅ Récurrences expirées: ${resultRecurrences.modifiedCount || 0}`);

      return {
        success: true,
        trajetsExpires: resultTrajets.modifiedCount || 0,
        recurrencesExpirees: resultRecurrences.modifiedCount || 0,
        timestamp: new Date()
      };
    } catch (error) {
      logger.error('❌ Erreur lors de la vérification des trajets expirés:', error);
      throw error;
    }
  }

  /**
   * Nettoyer les vieux trajets expirés
   * @param {number} joursAGarder - Nombre de jours à garder les trajets expirés (défaut: 30)
   * @returns {Promise<Object>} Résultat de l'opération
   */
  async nettoyerVieuxTrajets(joursAGarder = CONFIG.JOURS_CONSERVATION_DEFAUT) {
    try {
      // Validation des paramètres
      this._validateNumber(joursAGarder, 1, 365, 'joursAGarder');

      logger.info(`🧹 Nettoyage des trajets expirés depuis plus de ${joursAGarder} jours...`);

      // Exécuter le nettoyage avec retry
      const result = await this._executeWithRetry(
        () => Trajet.nettoyerVieuxTrajetsExpires(joursAGarder),
        'Nettoyage des vieux trajets'
      );

      this.stats.totalCleaned += result.deletedCount || 0;

      logger.info(`✅ ${result.deletedCount || 0} vieux trajets supprimés`);

      return {
        success: true,
        trajetsSupprimés: result.deletedCount || 0,
        joursAGarder,
        timestamp: new Date()
      };
    } catch (error) {
      logger.error('❌ Erreur lors du nettoyage des vieux trajets:', error);
      throw error;
    }
  }

  /**
   * Obtenir les statistiques d'expiration
   * @returns {Promise<Object>} Statistiques complètes
   */
  async obtenirStatistiques() {
    try {
      const dbStats = await Trajet.getStatistiquesExpiration();
      
      return {
        database: dbStats,
        service: {
          ...this.stats,
          isRunning: this.isRunning,
          lastRunTime: this.lastRunTime,
          uptime: this.lastRunTime ? Date.now() - this.lastRunTime : 0
        },
        timestamp: new Date()
      };
    } catch (error) {
      logger.error('❌ Erreur lors de la récupération des statistiques:', error);
      throw error;
    }
  }

  /**
   * Trouver les trajets qui vont expirer bientôt
   * @param {number} heures - Nombre d'heures avant expiration (défaut: 2)
   * @returns {Promise<Array>} Liste des trajets
   */
  async trouverTrajetsAExpirer(heures = CONFIG.HEURES_NOTIFICATION_DEFAUT) {
    try {
      // Validation des paramètres
      this._validateNumber(heures, 0.5, 72, 'heures');

      const trajets = await Trajet.findTrajetsAExpirer(heures);
      
      logger.info(`📋 ${trajets.length} trajet(s) vont expirer dans ${heures}h`);
      
      return trajets;
    } catch (error) {
      logger.error('❌ Erreur lors de la recherche des trajets à expirer:', error);
      throw error;
    }
  }

  /**
   * Notifier les conducteurs des trajets sur le point d'expirer
   * @param {number} heures - Nombre d'heures avant expiration (défaut: 2)
   * @returns {Promise<Object>} Résultat des notifications
   */
  async notifierTrajetsAExpirer(heures = CONFIG.HEURES_NOTIFICATION_DEFAUT) {
    try {
      const trajets = await this.trouverTrajetsAExpirer(heures);

      if (trajets.length === 0) {
        logger.info('✅ Aucun trajet à notifier');
        return { 
          success: true, 
          notificationsSent: 0,
          trajetsNotifies: 0,
          timestamp: new Date()
        };
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
      // Options possibles:
      // - Email via nodemailer
      // - SMS via Twilio
      // - Push notifications
      // - Webhooks
      
      // Pour l'instant, juste logger
      logger.info(`📧 ${conducteurs.size} conducteur(s) à notifier pour ${trajets.length} trajet(s)`);
      
      // Exemple d'implémentation future:
      /*
      const notificationPromises = [];
      for (const [conducteurId, trajetsConducteur] of conducteurs) {
        notificationPromises.push(
          this._envoyerNotification(conducteurId, trajetsConducteur)
        );
      }
      await Promise.allSettled(notificationPromises);
      */

      this.stats.totalNotifications += conducteurs.size;

      return {
        success: true,
        notificationsSent: conducteurs.size,
        trajetsNotifies: trajets.length,
        heuresAvantExpiration: heures,
        timestamp: new Date()
      };
    } catch (error) {
      logger.error('❌ Erreur lors de la notification des trajets:', error);
      throw error;
    }
  }

  /**
   * Exécuter toutes les tâches de maintenance
   * @param {Object} options - Options de maintenance
   * @returns {Promise<Object>} Résultat de la maintenance
   */
  async executerMaintenance(options = {}) {
    // Vérifier si une maintenance est déjà en cours
    this._checkMaintenanceTimeout();

    if (this.isRunning) {
      logger.warn('⚠️ Une maintenance est déjà en cours');
      return { 
        success: false, 
        message: 'Maintenance déjà en cours',
        startedAt: this.maintenanceStartTime
      };
    }

    try {
      this.isRunning = true;
      this.lastRunTime = new Date();
      this.maintenanceStartTime = Date.now();

      // Options par défaut
      const {
        verifierExpiration = true,
        notifier = true,
        nettoyer = true,
        joursConservation = CONFIG.JOURS_CONSERVATION_DEFAUT,
        heuresNotification = CONFIG.HEURES_NOTIFICATION_DEFAUT
      } = options;

      logger.info('🚀 Début de la maintenance des trajets');
      logger.info(`⚙️ Options: expiration=${verifierExpiration}, notification=${notifier}, nettoyage=${nettoyer}`);

      const resultats = {};

      // 1. Vérifier et marquer les trajets expirés
      if (verifierExpiration) {
        resultats.expiration = await this.verifierTrajetsExpires();
      }

      // 2. Notifier les trajets qui vont expirer
      if (notifier) {
        resultats.notification = await this.notifierTrajetsAExpirer(heuresNotification);
      }

      // 3. Nettoyer les vieux trajets
      if (nettoyer) {
        resultats.nettoyage = await this.nettoyerVieuxTrajets(joursConservation);
      }

      // 4. Obtenir les statistiques
      resultats.statistiques = await this.obtenirStatistiques();

      // Mettre à jour les statistiques de succès
      this.stats.successfulRuns++;

      const executionTime = Date.now() - this.maintenanceStartTime;
      logger.info(`✅ Maintenance terminée avec succès en ${executionTime}ms`);

      return {
        success: true,
        executionTime,
        timestamp: new Date(),
        resultats
      };
    } catch (error) {
      this.stats.failedRuns++;
      logger.error('❌ Erreur lors de la maintenance:', error);
      
      return {
        success: false,
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
        timestamp: new Date()
      };
    } finally {
      this.isRunning = false;
      this.maintenanceStartTime = null;
    }
  }

  /**
   * Planifier une maintenance automatique
   * @param {number} intervalMs - Intervalle en millisecondes
   * @returns {NodeJS.Timeout} ID de l'intervalle
   */
  planifierMaintenance(intervalMs = 60 * 60 * 1000) { // Défaut: 1 heure
    logger.info(`⏰ Maintenance planifiée toutes les ${intervalMs / 1000 / 60} minutes`);
    
    // Exécuter immédiatement
    this.executerMaintenance();
    
    // Puis exécuter périodiquement
    return setInterval(() => {
      this.executerMaintenance();
    }, intervalMs);
  }

  /**
   * Obtenir l'état du service
   * @returns {Object} État actuel du service
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      lastRunTime: this.lastRunTime,
      maintenanceStartTime: this.maintenanceStartTime,
      uptime: this.maintenanceStartTime ? Date.now() - this.maintenanceStartTime : 0,
      stats: { ...this.stats },
      config: { ...CONFIG },
      timestamp: new Date()
    };
  }

  /**
   * Réinitialiser les statistiques
   */
  resetStats() {
    const oldStats = { ...this.stats };
    
    this.stats = {
      totalExpired: 0,
      totalRecurrencesExpired: 0,
      totalCleaned: 0,
      totalNotifications: 0,
      lastRun: null,
      successfulRuns: 0,
      failedRuns: 0
    };
    
    logger.info('✅ Statistiques réinitialisées', { old: oldStats, new: this.stats });
    
    return oldStats;
  }

  /**
   * Vérifier la santé du service
   * @returns {Object} État de santé
   */
  healthCheck() {
    const isHealthy = !this._checkMaintenanceTimeout() && (
      !this.lastRunTime || 
      (Date.now() - this.lastRunTime < 24 * 60 * 60 * 1000) // Dernière exécution < 24h
    );

    return {
      healthy: isHealthy,
      status: isHealthy ? 'OK' : 'WARNING',
      isRunning: this.isRunning,
      lastRunTime: this.lastRunTime,
      timeSinceLastRun: this.lastRunTime ? Date.now() - this.lastRunTime : null,
      stats: this.stats,
      timestamp: new Date()
    };
  }
}

// ===============================================
// EXPORT SINGLETON
// ===============================================

const trajetExpirationService = new TrajetExpirationService();

module.exports = trajetExpirationService;