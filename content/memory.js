// Memory system for per-site rule persistence and stability tracking
class MemoryEngine {
  constructor() {
    this.cache = new Map();
    this.stabilityTracking = new Map();
  }

  async getSiteProfile(host, path = '/') {
    const cacheKey = `${host}${path}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const stored = await chrome.storage.sync.get(`profile:${host}`) || {};
    const profile = stored[`profile:${host}`] || { rules: [] };
    
    this.cache.set(cacheKey, profile);
    return profile;
  }

  async saveRule(host, path, rule) {
    const profile = await this.getSiteProfile(host, path);
    
    // Remove duplicates based on selector
    profile.rules = profile.rules.filter(r => r.selector !== rule.selector);
    
    // Add new rule with metadata
    const enrichedRule = {
      ...rule,
      meta: {
        createdAt: Date.now(),
        lastSeen: Date.now(),
        hits: 1,
        stability: 1.0,
        path: path
      }
    };
    
    profile.rules.push(enrichedRule);
    
    // Save to storage
    await chrome.storage.sync.set({
      [`profile:${host}`]: profile
    });
    
    // Update cache
    this.cache.set(`${host}${path}`, profile);
    
    return enrichedRule;
  }

  async updateStability(host, selector, found) {
    const key = `${host}:${selector}`;
    let tracking = this.stabilityTracking.get(key) || { hits: 0, misses: 0 };
    
    if (found) {
      tracking.hits++;
    } else {
      tracking.misses++;
    }
    
    const stability = tracking.hits / (tracking.hits + tracking.misses);
    this.stabilityTracking.set(key, tracking);
    
    // If stability drops below 0.3, mark for review
    if (stability < 0.3 && tracking.hits + tracking.misses > 5) {
      console.warn(`Selector stability low for ${selector} on ${host}: ${stability}`);
      return false;
    }
    
    return true;
  }

  async getRulesForPage(host, path) {
    const profile = await this.getSiteProfile(host, path);
    
    // Get both site-level and path-specific rules
    const siteRules = profile.rules.filter(r => !r.meta.path || r.meta.path === '/');
    const pathRules = profile.rules.filter(r => r.meta.path === path);
    
    return [...siteRules, ...pathRules];
  }

  async removeRule(host, selector) {
    const profile = await this.getSiteProfile(host);
    profile.rules = profile.rules.filter(r => r.selector !== selector);
    
    await chrome.storage.sync.set({
      [`profile:${host}`]: profile
    });
    
    this.cache.delete(`${host}/`);
  }

  async clearSiteMemory(host) {
    await chrome.storage.sync.remove(`profile:${host}`);
    
    // Clear from cache
    for (const key of this.cache.keys()) {
      if (key.startsWith(host)) {
        this.cache.delete(key);
      }
    }
  }

  async exportSiteProfile(host) {
    const profile = await this.getSiteProfile(host);
    return JSON.stringify(profile, null, 2);
  }

  async importSiteProfile(host, jsonData) {
    try {
      const profile = JSON.parse(jsonData);
      await chrome.storage.sync.set({
        [`profile:${host}`]: profile
      });
      
      this.cache.set(`${host}/`, profile);
      return true;
    } catch (error) {
      console.error('Failed to import profile:', error);
      return false;
    }
  }
}

window.memoryEngine = new MemoryEngine();