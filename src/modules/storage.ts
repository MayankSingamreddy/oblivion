// Advanced storage system with compression and per-host keying
import { Rule, Settings, SitePreset, ThemeTokens } from '../types/types';

interface StorageMetadata {
  version: string;
  lastAccessed: number;
  ruleCount: number;
  compressed: boolean;
}

interface CompressedHostData {
  meta: StorageMetadata;
  rules: string; // JSON-compressed rules
  themes?: string; // JSON-compressed theme data
}

interface HostData {
  meta: StorageMetadata;
  rules: Rule[];
  themes?: ThemeTokens;
}

export class StorageManager {
  private readonly MAX_SYNC_SIZE = 100000; // Chrome sync storage limit (~100KB)
  private readonly MAX_RULES_PER_HOST = 100;
  private readonly COMPRESSION_THRESHOLD = 1000; // Compress if JSON > 1KB
  private readonly VERSION = '2.0.0';
  
  private memoryCache = new Map<string, HostData>();
  private compressionDict: { [key: string]: string } = {
    // Common selectors and patterns for dictionary compression
    'display:none!important': '§1',
    'visibility:hidden!important': '§2', 
    'opacity:0!important': '§3',
    'data-testid': '§4',
    'aria-label': '§5',
    '.selector': '§6',
    'nth-child': '§7',
    'complementary': '§8',
    'advertisement': '§9',
    'recommendation': '§a'
  };

  constructor() {
    this.initializeStorage();
  }

  private async initializeStorage(): Promise<void> {
    try {
      // Check if migration is needed
      await this.migrateIfNeeded();
      
      // Clean up old data
      await this.performMaintenance();
    } catch (error) {
      console.warn('Storage initialization failed:', error);
    }
  }

  // Save rules for a specific host
  async saveHostRules(host: string, rules: Rule[]): Promise<boolean> {
    try {
      // Limit rules per host
      const limitedRules = rules.slice(-this.MAX_RULES_PER_HOST);
      
      const hostData: HostData = {
        meta: {
          version: this.VERSION,
          lastAccessed: Date.now(),
          ruleCount: limitedRules.length,
          compressed: false
        },
        rules: limitedRules
      };

      // Update memory cache
      this.memoryCache.set(host, hostData);

      // Determine storage strategy based on data size
      const dataSize = JSON.stringify(hostData).length;
      
      if (dataSize > this.COMPRESSION_THRESHOLD) {
        return await this.saveCompressedHostData(host, hostData);
      } else {
        return await this.saveUncompressedHostData(host, hostData);
      }
    } catch (error) {
      console.error('Failed to save host rules:', error);
      return false;
    }
  }

  // Load rules for a specific host
  async loadHostRules(host: string): Promise<Rule[]> {
    try {
      // Check memory cache first
      const cached = this.memoryCache.get(host);
      if (cached && this.isCacheValid(cached)) {
        return cached.rules;
      }

      // Load from storage
      const key = `rules:${host}`;
      const stored = await chrome.storage.sync.get(key);
      const hostData = stored[key];

      if (!hostData) {
        return [];
      }

      // Handle compressed data
      const decompressed = hostData.meta?.compressed 
        ? await this.decompressHostData(hostData as CompressedHostData)
        : hostData as HostData;

      // Update cache and last accessed time
      decompressed.meta.lastAccessed = Date.now();
      this.memoryCache.set(host, decompressed);
      
      // Update last accessed in storage (debounced)
      this.debounceUpdateAccess(host);

      return decompressed.rules || [];
    } catch (error) {
      console.error('Failed to load host rules:', error);
      return [];
    }
  }

  // Save a single rule (append to existing)
  async saveRule(host: string, rule: Rule): Promise<boolean> {
    try {
      const existingRules = await this.loadHostRules(host);
      
      // Remove any existing rule with same ID
      const filteredRules = existingRules.filter(r => r.id !== rule.id);
      
      // Add new rule
      filteredRules.push(rule);
      
      return await this.saveHostRules(host, filteredRules);
    } catch (error) {
      console.error('Failed to save rule:', error);
      return false;
    }
  }

  // Remove a specific rule
  async removeRule(host: string, ruleId: string): Promise<boolean> {
    try {
      const existingRules = await this.loadHostRules(host);
      const filteredRules = existingRules.filter(r => r.id !== ruleId);
      
      return await this.saveHostRules(host, filteredRules);
    } catch (error) {
      console.error('Failed to remove rule:', error);
      return false;
    }
  }

  // Clear all rules for a host
  async clearHostRules(host: string): Promise<boolean> {
    try {
      const key = `rules:${host}`;
      await chrome.storage.sync.remove(key);
      this.memoryCache.delete(host);
      return true;
    } catch (error) {
      console.error('Failed to clear host rules:', error);
      return false;
    }
  }

  // Save settings
  async saveSettings(settings: Settings): Promise<boolean> {
    try {
      await chrome.storage.sync.set({ settings });
      return true;
    } catch (error) {
      console.error('Failed to save settings:', error);
      return false;
    }
  }

  // Load settings
  async loadSettings(): Promise<Settings> {
    try {
      const result = await chrome.storage.sync.get('settings');
      return result.settings || this.getDefaultSettings();
    } catch (error) {
      console.error('Failed to load settings:', error);
      return this.getDefaultSettings();
    }
  }

  // Save theme tokens for a host
  async saveHostThemes(host: string, themes: ThemeTokens): Promise<boolean> {
    try {
      const existingData = await this.loadHostData(host);
      existingData.themes = themes;
      
      return await this.saveHostData(host, existingData);
    } catch (error) {
      console.error('Failed to save host themes:', error);
      return false;
    }
  }

  // Load theme tokens for a host
  async loadHostThemes(host: string): Promise<ThemeTokens | null> {
    try {
      const hostData = await this.loadHostData(host);
      return hostData.themes || null;
    } catch (error) {
      console.error('Failed to load host themes:', error);
      return null;
    }
  }

  // Export all data for backup/sharing
  async exportData(): Promise<string> {
    try {
      const allData = await chrome.storage.sync.get();
      
      // Filter and structure export data
      const exportData = {
        version: this.VERSION,
        timestamp: Date.now(),
        settings: allData.settings || {},
        hosts: {} as { [key: string]: any }
      };

      // Process each host's data
      for (const [key, value] of Object.entries(allData)) {
        if (key.startsWith('rules:')) {
          const host = key.substring(6); // Remove 'rules:' prefix
          
          // Decompress if needed
          let hostData = value as HostData | CompressedHostData;
          if (hostData.meta?.compressed) {
            hostData = await this.decompressHostData(hostData as CompressedHostData);
          }
          
          exportData.hosts[host] = hostData;
        }
      }

      return JSON.stringify(exportData, null, 2);
    } catch (error) {
      console.error('Failed to export data:', error);
      throw error;
    }
  }

  // Import data from backup
  async importData(jsonData: string): Promise<{ success: boolean; imported: number; errors: string[] }> {
    const result = { success: false, imported: 0, errors: [] as string[] };
    
    try {
      const importData = JSON.parse(jsonData);
      
      // Validate import structure
      if (!importData.version || !importData.hosts) {
        throw new Error('Invalid import format');
      }

      // Import settings if present
      if (importData.settings) {
        await this.saveSettings(importData.settings);
      }

      // Import host data
      for (const [host, hostData] of Object.entries(importData.hosts)) {
        try {
          const data = hostData as HostData;
          if (data.rules && Array.isArray(data.rules)) {
            await this.saveHostRules(host, data.rules);
            
            if (data.themes) {
              await this.saveHostThemes(host, data.themes);
            }
            
            result.imported++;
          }
        } catch (error) {
          result.errors.push(`Failed to import ${host}: ${(error as Error).message}`);
        }
      }

      result.success = result.imported > 0;
      return result;
    } catch (error) {
      result.errors.push(`Import failed: ${(error as Error).message}`);
      return result;
    }
  }

  // Get storage usage statistics
  async getStorageStats(): Promise<{
    used: number;
    quota: number;
    hostCount: number;
    ruleCount: number;
    oldestAccess: number;
  }> {
    try {
      const allData = await chrome.storage.sync.get();
      const dataSize = JSON.stringify(allData).length;
      
      let hostCount = 0;
      let ruleCount = 0;
      let oldestAccess = Date.now();

      for (const [key, value] of Object.entries(allData)) {
        if (key.startsWith('rules:')) {
          hostCount++;
          const hostData = value as HostData | CompressedHostData;
          
          if (hostData.meta) {
            ruleCount += hostData.meta.ruleCount || 0;
            if (hostData.meta.lastAccessed < oldestAccess) {
              oldestAccess = hostData.meta.lastAccessed;
            }
          }
        }
      }

      return {
        used: dataSize,
        quota: this.MAX_SYNC_SIZE,
        hostCount,
        ruleCount,
        oldestAccess
      };
    } catch (error) {
      console.error('Failed to get storage stats:', error);
      return {
        used: 0,
        quota: this.MAX_SYNC_SIZE,
        hostCount: 0,
        ruleCount: 0,
        oldestAccess: Date.now()
      };
    }
  }

  // Cleanup old or unused data
  async performMaintenance(): Promise<{ cleaned: number; size: number }> {
    try {
      const stats = await this.getStorageStats();
      
      // Only clean up if approaching storage limit
      if (stats.used < this.MAX_SYNC_SIZE * 0.8) {
        return { cleaned: 0, size: stats.used };
      }

      const allData = await chrome.storage.sync.get();
      const hostsByAge: Array<[string, number]> = [];

      // Collect hosts by last access time
      for (const [key, value] of Object.entries(allData)) {
        if (key.startsWith('rules:')) {
          const host = key.substring(6);
          const hostData = value as HostData | CompressedHostData;
          const lastAccess = hostData.meta?.lastAccessed || 0;
          hostsByAge.push([host, lastAccess]);
        }
      }

      // Sort by oldest first
      hostsByAge.sort(([, a], [, b]) => a - b);

      // Remove oldest 25% of hosts
      const toRemove = hostsByAge.slice(0, Math.ceil(hostsByAge.length * 0.25));
      const keysToRemove = toRemove.map(([host]) => `rules:${host}`);

      if (keysToRemove.length > 0) {
        await chrome.storage.sync.remove(keysToRemove);
        
        // Clear from memory cache
        toRemove.forEach(([host]) => this.memoryCache.delete(host));
      }

      const newStats = await this.getStorageStats();
      return { cleaned: keysToRemove.length, size: newStats.used };
    } catch (error) {
      console.error('Maintenance failed:', error);
      return { cleaned: 0, size: 0 };
    }
  }

  private async saveCompressedHostData(host: string, hostData: HostData): Promise<boolean> {
    try {
      const compressed: CompressedHostData = {
        meta: { ...hostData.meta, compressed: true },
        rules: this.compressString(JSON.stringify(hostData.rules)),
        themes: hostData.themes ? this.compressString(JSON.stringify(hostData.themes)) : undefined
      };

      const key = `rules:${host}`;
      await chrome.storage.sync.set({ [key]: compressed });
      return true;
    } catch (error) {
      console.error('Failed to save compressed data:', error);
      return false;
    }
  }

  private async saveUncompressedHostData(host: string, hostData: HostData): Promise<boolean> {
    try {
      const key = `rules:${host}`;
      await chrome.storage.sync.set({ [key]: hostData });
      return true;
    } catch (error) {
      console.error('Failed to save uncompressed data:', error);
      return false;
    }
  }

  private async saveHostData(host: string, hostData: HostData): Promise<boolean> {
    const dataSize = JSON.stringify(hostData).length;
    
    if (dataSize > this.COMPRESSION_THRESHOLD) {
      return await this.saveCompressedHostData(host, hostData);
    } else {
      return await this.saveUncompressedHostData(host, hostData);
    }
  }

  private async loadHostData(host: string): Promise<HostData> {
    const key = `rules:${host}`;
    const stored = await chrome.storage.sync.get(key);
    const hostData = stored[key];

    if (!hostData) {
      return {
        meta: {
          version: this.VERSION,
          lastAccessed: Date.now(),
          ruleCount: 0,
          compressed: false
        },
        rules: []
      };
    }

    return hostData.meta?.compressed 
      ? await this.decompressHostData(hostData as CompressedHostData)
      : hostData as HostData;
  }

  private async decompressHostData(compressed: CompressedHostData): Promise<HostData> {
    return {
      meta: { ...compressed.meta, compressed: false },
      rules: JSON.parse(this.decompressString(compressed.rules)),
      themes: compressed.themes ? JSON.parse(this.decompressString(compressed.themes)) : undefined
    };
  }

  private compressString(input: string): string {
    // Simple dictionary-based compression
    let compressed = input;
    
    for (const [original, replacement] of Object.entries(this.compressionDict)) {
      compressed = compressed.replace(new RegExp(original, 'g'), replacement);
    }
    
    return compressed;
  }

  private decompressString(compressed: string): string {
    let decompressed = compressed;
    
    for (const [original, replacement] of Object.entries(this.compressionDict)) {
      decompressed = decompressed.replace(new RegExp(replacement, 'g'), original);
    }
    
    return decompressed;
  }

  private isCacheValid(cachedData: HostData): boolean {
    const maxAge = 5 * 60 * 1000; // 5 minutes
    return Date.now() - cachedData.meta.lastAccessed < maxAge;
  }

  private debounceUpdateAccess = this.debounce((host: string) => {
    this.updateLastAccess(host);
  }, 30000); // Update at most every 30 seconds

  private async updateLastAccess(host: string): Promise<void> {
    try {
      const key = `rules:${host}`;
      const stored = await chrome.storage.sync.get(key);
      
      if (stored[key]) {
        stored[key].meta.lastAccessed = Date.now();
        await chrome.storage.sync.set({ [key]: stored[key] });
      }
    } catch (error) {
      console.warn('Failed to update last access:', error);
    }
  }

  private debounce<T extends (...args: any[]) => any>(
    func: T,
    delay: number
  ): (...args: Parameters<T>) => void {
    let timeoutId: number;
    return (...args: Parameters<T>) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => func.apply(this, args), delay);
    };
  }

  private async migrateIfNeeded(): Promise<void> {
    // Check for legacy data format and migrate if needed
    try {
      const legacyData = await chrome.storage.sync.get();
      let needsMigration = false;

      for (const key of Object.keys(legacyData)) {
        if (key.startsWith('rules:') && !legacyData[key].meta) {
          needsMigration = true;
          break;
        }
      }

      if (needsMigration) {
        console.log('Migrating legacy storage format...');
        await this.migrateLegacyData();
      }
    } catch (error) {
      console.warn('Migration check failed:', error);
    }
  }

  private async migrateLegacyData(): Promise<void> {
    const allData = await chrome.storage.sync.get();
    const updates: { [key: string]: HostData } = {};

    for (const [key, value] of Object.entries(allData)) {
      if (key.startsWith('rules:') && Array.isArray(value)) {
        const host = key.substring(6);
        updates[key] = {
          meta: {
            version: this.VERSION,
            lastAccessed: Date.now(),
            ruleCount: value.length,
            compressed: false
          },
          rules: value as Rule[]
        };
      }
    }

    if (Object.keys(updates).length > 0) {
      await chrome.storage.sync.set(updates);
      console.log(`Migrated ${Object.keys(updates).length} host configurations`);
    }
  }

  private getDefaultSettings(): Settings {
    return {
      aiEnabled: true,
      aiModel: 'gpt-4o-mini',
      fallbackEnabled: true,
      syncEnabled: true,
      localModelEnabled: false,
      globalPreferences: {
        blockCookieNags: false,
        reduceMotion: false,
        dimAutoplay: false,
        autoApplyRules: true
      }
    };
  }

  // Batch operations for efficiency
  async saveMultipleRules(rules: Array<{ host: string; rule: Rule }>): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    // Group rules by host for efficient batch operations
    const rulesByHost = new Map<string, Rule[]>();
    
    for (const { host, rule } of rules) {
      if (!rulesByHost.has(host)) {
        rulesByHost.set(host, []);
      }
      rulesByHost.get(host)!.push(rule);
    }

    // Process each host
    for (const [host, hostRules] of rulesByHost) {
      try {
        const existingRules = await this.loadHostRules(host);
        const allRules = [...existingRules, ...hostRules];
        
        if (await this.saveHostRules(host, allRules)) {
          success += hostRules.length;
        } else {
          failed += hostRules.length;
        }
      } catch (error) {
        failed += hostRules.length;
        console.error(`Failed to save rules for ${host}:`, error);
      }
    }

    return { success, failed };
  }

  // Get all hosts with saved rules
  async getAllHosts(): Promise<string[]> {
    try {
      const allData = await chrome.storage.sync.get();
      return Object.keys(allData)
        .filter(key => key.startsWith('rules:'))
        .map(key => key.substring(6));
    } catch (error) {
      console.error('Failed to get all hosts:', error);
      return [];
    }
  }

  // Search rules across all hosts
  async searchRules(query: string): Promise<Array<{ host: string; rule: Rule }>> {
    const results: Array<{ host: string; rule: Rule }> = [];
    const hosts = await this.getAllHosts();

    for (const host of hosts) {
      const rules = await this.loadHostRules(host);
      
      for (const rule of rules) {
        if (rule.selector.toLowerCase().includes(query.toLowerCase()) ||
            rule.notes?.toLowerCase().includes(query.toLowerCase())) {
          results.push({ host, rule });
        }
      }
    }

    return results;
  }
}
