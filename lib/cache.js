/**
 * TTL (Time-To-Live) in-memory cache implementation
 */
class TTLCache {
  constructor() {
    this.cache = new Map();
  }

  /**
   * Get a value from cache if it exists and hasn't expired
   * @param {string} key - Cache key
   * @returns {any|null} - Cached value or null if not found/expired
   */
  get(key) {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.value;
  }

  /**
   * Set a value in cache with TTL
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   * @param {number} ttlMs - Time to live in milliseconds
   */
  set(key, value, ttlMs) {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
    });
  }

  /**
   * Clear all cache entries
   */
  clear() {
    this.cache.clear();
  }

  /**
   * Delete a specific cache entry
   * @param {string} key - Cache key to delete
   */
  delete(key) {
    this.cache.delete(key);
  }
}

// Export singleton instance
export const cache = new TTLCache();

// Cache TTL constants (in milliseconds)
export const CACHE_TTL = {
  FIELD_IDS: 15 * 60 * 1000,      // 15 minutes
  BOARDS: 10 * 60 * 1000,          // 10 minutes
  SPRINTS: 10 * 60 * 1000,         // 10 minutes
};
