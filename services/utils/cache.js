// services/utils/cache.js
/**
 * Système de cache en mémoire avec TTL (Time To Live)
 * Pour éviter de réimporter les mêmes événements
 */
class Cache {
  constructor(options = {}) {
    this.ttlMinutes = options.ttlMinutes || 60;
    this.ttlMs = this.ttlMinutes * 60 * 1000;
    this.store = new Map();
    
    // Nettoyage automatique toutes les 5 minutes
    this.cleanupInterval = setInterval(() => {
      this._cleanup();
    }, 5 * 60 * 1000);
    
    console.log(`📦 Cache initialisé (TTL: ${this.ttlMinutes} minutes)`);
  }

  /**
   * Vérifie si une clé existe dans le cache et n'est pas expirée
   */
  has(key) {
    const entry = this.store.get(key);
    if (!entry) return false;
    
    const isExpired = Date.now() - entry.timestamp > this.ttlMs;
    if (isExpired) {
      this.store.delete(key);
      return false;
    }
    
    return true;
  }

  /**
   * Récupère une valeur du cache
   */
  get(key) {
    if (!this.has(key)) return null;
    return this.store.get(key).value;
  }

  /**
   * Ajoute une valeur au cache
   */
  set(key, value) {
    this.store.set(key, {
      value,
      timestamp: Date.now()
    });
  }

  /**
   * Supprime une clé du cache
   */
  delete(key) {
    this.store.delete(key);
  }

  /**
   * Vide tout le cache
   */
  clear() {
    this.store.clear();
    console.log('🗑️  Cache vidé');
  }

  /**
   * Retourne la taille du cache
   */
  size() {
    return this.store.size;
  }

  /**
   * Nettoyage des entrées expirées
   */
  _cleanup() {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, entry] of this.store.entries()) {
      if (now - entry.timestamp > this.ttlMs) {
        this.store.delete(key);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
      console.log(`🧹 Cache nettoyé: ${cleaned} entrées expirées supprimées`);
    }
  }

  /**
   * Obtenir des statistiques du cache
   */
  getStats() {
    return {
      size: this.store.size,
      ttlMinutes: this.ttlMinutes,
      ttlMs: this.ttlMs
    };
  }

  /**
   * Arrête le nettoyage automatique (pour les tests)
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

module.exports = Cache;