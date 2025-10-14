const redis = require('redis');

let redisClient = null;

const connectRedis = async () => {
  if (!process.env.REDIS_URL) {
    console.log('📝 Redis non configuré - utilisation de la mémoire locale');
    return null;
  }

  try {
    redisClient = redis.createClient({
      url: process.env.REDIS_URL,
      retry_strategy: (options) => {
        if (options.error && options.error.code === 'ECONNREFUSED') {
          return new Error('Redis server refuse les connexions');
        }
        if (options.total_retry_time > 1000 * 60 * 60) {
          return new Error('Timeout Redis après 1 heure');
        }
        if (options.attempt > 10) {
          return undefined;
        }
        // Retry avec backoff exponentiel
        return Math.min(options.attempt * 100, 3000);
      }
    });

    redisClient.on('error', (err) => {
      console.error('❌ Erreur Redis:', err);
    });

    redisClient.on('connect', () => {
      console.log('🔴 Redis en cours de connexion...');
    });

    redisClient.on('ready', () => {
      console.log('🔴 Redis connecté et prêt');
    });

    await redisClient.connect();
    
    return redisClient;
  } catch (error) {
    console.error('❌ Erreur connexion Redis:', error.message);
    return null;
  }
};

// Fonctions utilitaires Redis pour le cache et les sessions
const redisUtils = {
  // Gestion des sessions utilisateur
  setUserSession: async (userId, sessionData, ttl = 3600) => {
    if (!redisClient) return false;
    try {
      await redisClient.setEx(
        `user_session:${userId}`, 
        ttl, 
        JSON.stringify(sessionData)
      );
      return true;
    } catch (error) {
      console.error('Erreur Redis setUserSession:', error.message);
      return false;
    }
  },

  getUserSession: async (userId) => {
    if (!redisClient) return null;
    try {
      const data = await redisClient.get(`user_session:${userId}`);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Erreur Redis getUserSession:', error.message);
      return null;
    }
  },

  deleteUserSession: async (userId) => {
    if (!redisClient) return false;
    try {
      await redisClient.del(`user_session:${userId}`);
      return true;
    } catch (error) {
      console.error('Erreur Redis deleteUserSession:', error.message);
      return false;
    }
  },

  // Gestion des positions en temps réel
  setUserPosition: async (userId, position, ttl = 300) => {
    if (!redisClient) return false;
    try {
      await redisClient.setEx(
        `user_position:${userId}`, 
        ttl, 
        JSON.stringify({
          ...position,
          timestamp: new Date()
        })
      );
      return true;
    } catch (error) {
      console.error('Erreur Redis setUserPosition:', error.message);
      return false;
    }
  },

  getUserPosition: async (userId) => {
    if (!redisClient) return null;
    try {
      const data = await redisClient.get(`user_position:${userId}`);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Erreur Redis getUserPosition:', error.message);
      return null;
    }
  },

  // Cache pour les recherches fréquentes
  setCache: async (key, data, ttl = 300) => {
    if (!redisClient) return false;
    try {
      await redisClient.setEx(key, ttl, JSON.stringify(data));
      return true;
    } catch (error) {
      console.error('Erreur Redis setCache:', error.message);
      return false;
    }
  },

  getCache: async (key) => {
    if (!redisClient) return null;
    try {
      const data = await redisClient.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      console.error('Erreur Redis getCache:', error.message);
      return null;
    }
  },

  // Gestion des listes (pour les notifications, etc.)
  pushToList: async (listKey, item, maxLength = 100) => {
    if (!redisClient) return false;
    try {
      await redisClient.lPush(listKey, JSON.stringify(item));
      await redisClient.lTrim(listKey, 0, maxLength - 1);
      return true;
    } catch (error) {
      console.error('Erreur Redis pushToList:', error.message);
      return false;
    }
  },

  getList: async (listKey, start = 0, end = -1) => {
    if (!redisClient) return [];
    try {
      const items = await redisClient.lRange(listKey, start, end);
      return items.map(item => JSON.parse(item));
    } catch (error) {
      console.error('Erreur Redis getList:', error.message);
      return [];
    }
  }
};

module.exports = { 
  connectRedis, 
  redisClient: () => redisClient, 
  redisUtils 
};