// services/presenceService.js
const { EventEmitter } = require('events');

/**
 * Service pour gérer la présence en ligne des utilisateurs
 * Gère les connexions multiples et les états de présence de façon sécurisée
 */
class PresenceService extends EventEmitter {
  constructor() {
    super();
    this.userSockets = new Map(); // userId -> Set de socketIds
    this.socketUsers = new Map(); // socketId -> userId (pour la recherche inverse)
    this.onlineTimestamps = new Map(); // userId -> timestamp de première connexion
    this.offlineTimestamps = new Map(); // userId -> timestamp de dernière déconnexion
    
    // Configuration des limites
    this.maxSocketsPerUser = 10; // Limite de sockets par utilisateur
    this.cleanupInterval = 300000; // 5 minutes de nettoyage automatique
    
    // Démarrer le nettoyage automatique
    this.startCleanupTimer();
    
    console.log('✅ Service de présence initialisé');
  }

  /**
   * Valide les paramètres d'entrée
   * @param {string} userId - ID de l'utilisateur
   * @param {string} socketId - ID du socket
   * @returns {boolean} - True si les paramètres sont valides
   */
  _validateParams(userId, socketId) {
    if (!userId || typeof userId !== 'string' || userId.trim() === '') {
      console.warn('PresenceService: userId invalide:', userId);
      return false;
    }
    
    if (!socketId || typeof socketId !== 'string' || socketId.trim() === '') {
      console.warn('PresenceService: socketId invalide:', socketId);
      return false;
    }
    
    return true;
  }

  /**
   * Nettoie les sockets orphelins et les données obsolètes
   */
  _cleanup() {
    try {
      // Nettoyer les entrées vides dans userSockets
      for (const [userId, sockets] of this.userSockets.entries()) {
        if (sockets.size === 0) {
          this.userSockets.delete(userId);
          this.onlineTimestamps.delete(userId);
        }
      }
      
      // Nettoyer les timestamps d'utilisateurs qui ne sont plus en ligne
      for (const userId of this.onlineTimestamps.keys()) {
        if (!this.isOnline(userId)) {
          this.onlineTimestamps.delete(userId);
        }
      }
      
      // Garder seulement les 1000 derniers timestamps hors ligne pour éviter la fuite mémoire
      if (this.offlineTimestamps.size > 1000) {
        const entries = Array.from(this.offlineTimestamps.entries());
        entries.sort((a, b) => b[1] - a[1]); // Trier par timestamp décroissant
        
        this.offlineTimestamps.clear();
        entries.slice(0, 1000).forEach(([userId, timestamp]) => {
          this.offlineTimestamps.set(userId, timestamp);
        });
      }
      
    } catch (error) {
      console.error('Erreur lors du nettoyage du service de présence:', error);
    }
  }

  /**
   * Démarre le timer de nettoyage automatique
   */
  startCleanupTimer() {
    this.cleanupTimer = setInterval(() => {
      this._cleanup();
    }, this.cleanupInterval);
  }

  /**
   * Arrête le timer de nettoyage automatique
   */
  stopCleanupTimer() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Marque un utilisateur comme en ligne avec un socket spécifique
   * @param {string} userId - ID de l'utilisateur
   * @param {string} socketId - ID du socket
   * @returns {Promise<boolean>} - True si l'opération a réussi
   */
  async setOnline(userId, socketId) {
    if (!this._validateParams(userId, socketId)) {
      return false;
    }

    try {
      // Vérifier si l'utilisateur était déjà en ligne
      const wasOffline = !this.isOnline(userId);
      
      // Initialiser l'ensemble des sockets pour l'utilisateur s'il n'existe pas
      if (!this.userSockets.has(userId)) {
        this.userSockets.set(userId, new Set());
      }
      
      const userSocketsSet = this.userSockets.get(userId);
      
      // Vérifier la limite de sockets par utilisateur
      if (userSocketsSet.size >= this.maxSocketsPerUser) {
        console.warn(`Limite de sockets atteinte pour l'utilisateur ${userId}`);
        return false;
      }
      
      // Ajouter le socket à l'ensemble des sockets de l'utilisateur
      userSocketsSet.add(socketId);
      
      // Mapper le socket vers l'utilisateur pour la recherche inverse
      this.socketUsers.set(socketId, userId);
      
      // Enregistrer le timestamp de première connexion
      if (wasOffline) {
        this.onlineTimestamps.set(userId, new Date());
        this.offlineTimestamps.delete(userId); // Supprimer le timestamp hors ligne
        
        // Émettre un événement si l'utilisateur vient de se connecter
        this.emit('user:online', {
          userId,
          timestamp: new Date(),
          socketsCount: userSocketsSet.size
        });
      }
      
      // Émettre un événement pour chaque nouvelle connexion socket
      this.emit('socket:connected', {
        userId,
        socketId,
        timestamp: new Date(),
        totalSockets: userSocketsSet.size
      });
      
      return true;
    } catch (error) {
      console.error('Erreur lors de la mise en ligne:', error);
      return false;
    }
  }

  /**
   * Marque un utilisateur comme hors ligne pour un socket spécifique
   * @param {string} userId - ID de l'utilisateur
   * @param {string} socketId - ID du socket
   * @returns {Promise<boolean>} - True si l'opération a réussi
   */
  async setOffline(userId, socketId) {
    if (!this._validateParams(userId, socketId)) {
      return false;
    }

    try {
      // Vérifier si l'utilisateur a des sockets enregistrés
      if (!this.userSockets.has(userId)) {
        // Nettoyer la référence inverse si elle existe
        this.socketUsers.delete(socketId);
        return false;
      }
      
      const userSocketsSet = this.userSockets.get(userId);
      
      // Vérifier que ce socket appartient bien à cet utilisateur
      if (!userSocketsSet.has(socketId)) {
        console.warn(`Socket ${socketId} n'appartient pas à l'utilisateur ${userId}`);
        return false;
      }
      
      // Supprimer le socket spécifique
      userSocketsSet.delete(socketId);
      this.socketUsers.delete(socketId);
      
      // Émettre un événement pour la déconnexion du socket
      this.emit('socket:disconnected', {
        userId,
        socketId,
        timestamp: new Date(),
        remainingSockets: userSocketsSet.size
      });
      
      // Si l'utilisateur n'a plus de sockets actifs, le marquer comme hors ligne
      if (userSocketsSet.size === 0) {
        this.userSockets.delete(userId);
        this.onlineTimestamps.delete(userId);
        this.offlineTimestamps.set(userId, new Date());
        
        // Émettre un événement indiquant que l'utilisateur est hors ligne
        this.emit('user:offline', {
          userId,
          timestamp: new Date(),
          lastSocketId: socketId
        });
      }
      
      return true;
    } catch (error) {
      console.error('Erreur lors de la mise hors ligne:', error);
      return false;
    }
  }

  /**
   * Déconnecte tous les sockets d'un utilisateur
   * @param {string} userId - ID de l'utilisateur
   * @returns {boolean} - True si l'opération a réussi
   */
  disconnectAllUserSockets(userId) {
    if (!userId || typeof userId !== 'string') {
      return false;
    }

    try {
      if (!this.userSockets.has(userId)) {
        return true; // Déjà déconnecté
      }

      const userSocketsSet = this.userSockets.get(userId);
      const socketIds = Array.from(userSocketsSet);
      
      // Supprimer toutes les références
      userSocketsSet.clear();
      socketIds.forEach(socketId => {
        this.socketUsers.delete(socketId);
      });
      
      this.userSockets.delete(userId);
      this.onlineTimestamps.delete(userId);
      this.offlineTimestamps.set(userId, new Date());
      
      // Émettre un événement
      this.emit('user:forced_offline', {
        userId,
        disconnectedSockets: socketIds,
        timestamp: new Date()
      });
      
      return true;
    } catch (error) {
      console.error('Erreur lors de la déconnexion forcée:', error);
      return false;
    }
  }

  /**
   * Récupère l'utilisateur associé à un socket
   * @param {string} socketId - ID du socket
   * @returns {string|null} - ID de l'utilisateur ou null
   */
  getUserBySocket(socketId) {
    if (!socketId || typeof socketId !== 'string') {
      return null;
    }
    return this.socketUsers.get(socketId) || null;
  }

  /**
   * Vérifie si un utilisateur est en ligne
   * @param {string} userId - ID de l'utilisateur
   * @returns {boolean} - Indique si l'utilisateur est en ligne
   */
  isOnline(userId) {
    if (!userId || typeof userId !== 'string') {
      return false;
    }
    return this.userSockets.has(userId) && this.userSockets.get(userId).size > 0;
  }

  /**
   * Récupère tous les sockets actifs d'un utilisateur
   * @param {string} userId - ID de l'utilisateur
   * @returns {Set|null} - Ensemble des IDs de socket de l'utilisateur
   */
  getUserSockets(userId) {
    if (!userId || typeof userId !== 'string') {
      return null;
    }
    
    if (!this.userSockets.has(userId)) {
      return null;
    }
    
    // Retourner une copie pour éviter les modifications externes
    return new Set(this.userSockets.get(userId));
  }

  /**
   * Récupère le nombre de sockets actifs pour un utilisateur
   * @param {string} userId - ID de l'utilisateur
   * @returns {number} - Nombre de sockets actifs
   */
  getUserSocketCount(userId) {
    if (!userId || typeof userId !== 'string') {
      return 0;
    }
    
    const sockets = this.getUserSockets(userId);
    return sockets ? sockets.size : 0;
  }

  /**
   * Récupère tous les utilisateurs en ligne
   * @returns {Array} - Liste des IDs des utilisateurs en ligne
   */
  getOnlineUsers() {
    return Array.from(this.userSockets.keys()).filter(userId => 
      this.userSockets.get(userId).size > 0
    );
  }

  /**
   * Récupère le nombre total d'utilisateurs en ligne
   * @returns {number} - Nombre d'utilisateurs en ligne
   */
  getOnlineUsersCount() {
    return this.getOnlineUsers().length;
  }

  /**
   * Récupère le nombre total de sockets connectés
   * @returns {number} - Nombre total de sockets
   */
  getTotalSocketsCount() {
    let total = 0;
    for (const sockets of this.userSockets.values()) {
      total += sockets.size;
    }
    return total;
  }

  /**
   * Vérifie si plusieurs utilisateurs sont en ligne
   * @param {Array} userIds - Liste des IDs d'utilisateurs à vérifier
   * @returns {Object} - Statut en ligne par ID d'utilisateur
   */
  checkMultipleUsersOnline(userIds) {
    if (!Array.isArray(userIds)) {
      console.warn('checkMultipleUsersOnline: userIds doit être un tableau');
      return {};
    }
    
    const result = {};
    userIds.forEach(userId => {
      if (userId && typeof userId === 'string') {
        result[userId] = {
          online: this.isOnline(userId),
          socketsCount: this.getUserSocketCount(userId),
          onlineSince: this.onlineTimestamps.get(userId) || null
        };
      }
    });
    
    return result;
  }

  /**
   * Récupère les statistiques du service
   * @returns {Object} - Statistiques détaillées
   */
  getStats() {
    return {
      totalOnlineUsers: this.getOnlineUsersCount(),
      totalSockets: this.getTotalSocketsCount(),
      averageSocketsPerUser: this.getOnlineUsersCount() > 0 
        ? (this.getTotalSocketsCount() / this.getOnlineUsersCount()).toFixed(2) 
        : 0,
      maxSocketsPerUser: this.maxSocketsPerUser,
      memoryUsage: {
        userSockets: this.userSockets.size,
        socketUsers: this.socketUsers.size,
        onlineTimestamps: this.onlineTimestamps.size,
        offlineTimestamps: this.offlineTimestamps.size
      },
      lastCleanup: new Date()
    };
  }

  /**
   * Nettoie toutes les données du service
   */
  clear() {
    try {
      this.userSockets.clear();
      this.socketUsers.clear();
      this.onlineTimestamps.clear();
      this.offlineTimestamps.clear();
      
      this.emit('service:cleared', { timestamp: new Date() });
      console.log('Service de présence nettoyé');
    } catch (error) {
      console.error('Erreur lors du nettoyage du service:', error);
    }
  }

  /**
   * Ferme le service et nettoie les ressources
   */
  shutdown() {
    try {
      this.stopCleanupTimer();
      this.clear();
      this.removeAllListeners();
      console.log('Service de présence fermé');
    } catch (error) {
      console.error('Erreur lors de la fermeture du service:', error);
    }
  }
}

// Exporter une instance unique du service
const presenceService = new PresenceService();

// Gestion gracieuse de la fermeture de l'application
process.on('SIGINT', () => {
  console.log('Arrêt du service de présence...');
  presenceService.shutdown();
});

process.on('SIGTERM', () => {
  console.log('Arrêt du service de présence...');
  presenceService.shutdown();
});

module.exports = presenceService;