// Presets and rule packs system
import { Rule, SitePreset, ThemeTokens } from '../types/types';
import { StorageManager } from './storage';

interface PresetCollection {
  [key: string]: SitePreset;
}

interface PresetMetadata {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  website: string;
  ruleCount: number;
  hasThemes: boolean;
  lastUpdated: number;
  tags: string[];
}

export class PresetManager {
  private storage: StorageManager;
  private builtinPresets: PresetCollection = {};
  private customPresets: PresetCollection = {};

  constructor(storage: StorageManager) {
    this.storage = storage;
    this.initializeBuiltinPresets();
    this.loadCustomPresets();
  }

  // Initialize built-in site presets
  private initializeBuiltinPresets(): void {
    // Twitter/X preset
    this.builtinPresets['x.com'] = {
      name: 'X (Twitter) Clean',
      version: '1.2.0',
      description: 'Clean Twitter experience - removes trending, suggestions, and ads',
      rules: [
        {
          id: 'twitter-trending',
          host: 'x.com',
          action: 'hide',
          selector: '[aria-label*="Timeline: Trending" i], [data-testid="trend"]',
          strategy: { preserveLayout: false, collapseSpace: true },
          notes: 'Trending sidebar',
          createdAt: Date.now(),
          version: 1,
          confidence: 0.9
        },
        {
          id: 'twitter-who-to-follow',
          host: 'x.com', 
          action: 'hide',
          selector: '[aria-label*="Who to follow" i], [data-testid="UserCell"]:has([data-testid="followButton"])',
          strategy: { preserveLayout: false, collapseSpace: true },
          notes: 'Who to follow suggestions',
          createdAt: Date.now(),
          version: 1,
          confidence: 0.85
        },
        {
          id: 'twitter-promoted',
          host: 'x.com',
          action: 'replace',
          selector: '[data-testid="tweet"]:has([data-testid="promotedIndicator"])',
          strategy: { preserveLayout: false, collapseSpace: true },
          notes: 'Promoted tweets',
          createdAt: Date.now(),
          version: 1,
          confidence: 0.95
        },
        {
          id: 'twitter-right-sidebar',
          host: 'x.com',
          action: 'blank',
          selector: '[data-testid="sidebarColumn"]',
          strategy: { preserveLayout: true, collapseSpace: false },
          notes: 'Right sidebar (preserve layout)',
          createdAt: Date.now(),
          version: 1,
          confidence: 0.8
        }
      ],
      themes: {
        '--obv-bg': '#000000',
        '--obv-text-color': '#ffffff',
        '--obv-accent': '#1d9bf0',
        '--obv-font': '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      }
    };

    // YouTube preset
    this.builtinPresets['youtube.com'] = {
      name: 'YouTube Focus',
      version: '1.1.0',
      description: 'Distraction-free YouTube - removes recommendations and clutter',
      rules: [
        {
          id: 'youtube-secondary',
          host: 'youtube.com',
          action: 'hide',
          selector: '#secondary',
          strategy: { preserveLayout: false, collapseSpace: true },
          notes: 'Sidebar recommendations',
          createdAt: Date.now(),
          version: 1,
          confidence: 0.95
        },
        {
          id: 'youtube-shorts-shelf',
          host: 'youtube.com',
          action: 'hide',
          selector: '[title*="Shorts" i], ytd-rich-shelf-renderer:has([title*="Shorts" i])',
          strategy: { preserveLayout: false, collapseSpace: true },
          notes: 'YouTube Shorts shelf',
          createdAt: Date.now(),
          version: 1,
          confidence: 0.9
        },
        {
          id: 'youtube-end-screen',
          host: 'youtube.com',
          action: 'hide',
          selector: '.ytp-endscreen-content, .ytp-ce-element',
          strategy: { preserveLayout: false, collapseSpace: true },
          notes: 'End screen overlays',
          createdAt: Date.now(),
          version: 1,
          confidence: 0.8
        },
        {
          id: 'youtube-comments',
          host: 'youtube.com',
          action: 'blank',
          selector: '#comments',
          strategy: { preserveLayout: true, collapseSpace: false },
          notes: 'Comments section (hidden but space preserved)',
          createdAt: Date.now(),
          version: 1,
          confidence: 0.85
        }
      ]
    };

    // Reddit preset
    this.builtinPresets['reddit.com'] = {
      name: 'Reddit Minimal',
      version: '1.0.0',
      description: 'Clean Reddit browsing - removes sidebar and promoted content',
      rules: [
        {
          id: 'reddit-sidebar',
          host: 'reddit.com',
          action: 'hide',
          selector: '[data-testid="subreddit-sidebar"], .side',
          strategy: { preserveLayout: false, collapseSpace: true },
          notes: 'Subreddit sidebar',
          createdAt: Date.now(),
          version: 1,
          confidence: 0.9
        },
        {
          id: 'reddit-promoted',
          host: 'reddit.com',
          action: 'replace',
          selector: '[data-promoted="true"], .promotedlink',
          strategy: { preserveLayout: false, collapseSpace: true },
          notes: 'Promoted posts',
          createdAt: Date.now(),
          version: 1,
          confidence: 0.95
        },
        {
          id: 'reddit-popular-communities',
          host: 'reddit.com',
          action: 'hide',
          selector: '[data-testid="popular-communities"]',
          strategy: { preserveLayout: false, collapseSpace: true },
          notes: 'Popular communities widget',
          createdAt: Date.now(),
          version: 1,
          confidence: 0.8
        }
      ]
    };

    // LinkedIn preset
    this.builtinPresets['linkedin.com'] = {
      name: 'LinkedIn Professional',
      version: '1.0.0', 
      description: 'Focus on professional content - removes news and promotions',
      rules: [
        {
          id: 'linkedin-news',
          host: 'linkedin.com',
          action: 'hide',
          selector: '.news-module, [data-module-id="news"]',
          strategy: { preserveLayout: false, collapseSpace: true },
          notes: 'LinkedIn News module',
          createdAt: Date.now(),
          version: 1,
          confidence: 0.85
        },
        {
          id: 'linkedin-ads',
          host: 'linkedin.com',
          action: 'replace',
          selector: '.ad-banner-container, [data-module-id="ads"]',
          strategy: { preserveLayout: false, collapseSpace: true },
          notes: 'Advertisement banners',
          createdAt: Date.now(),
          version: 1,
          confidence: 0.9
        },
        {
          id: 'linkedin-people-you-may-know',
          host: 'linkedin.com',
          action: 'blank',
          selector: '.people-you-may-know',
          strategy: { preserveLayout: true, collapseSpace: false },
          notes: 'People you may know suggestions',
          createdAt: Date.now(),
          version: 1,
          confidence: 0.8
        }
      ]
    };

    console.log(`📦 Loaded ${Object.keys(this.builtinPresets).length} built-in presets`);
  }

  // Load custom presets from storage
  private async loadCustomPresets(): Promise<void> {
    try {
      const customData = await chrome.storage.sync.get('customPresets');
      this.customPresets = customData.customPresets || {};
      
      console.log(`📦 Loaded ${Object.keys(this.customPresets).length} custom presets`);
    } catch (error) {
      console.warn('Failed to load custom presets:', error);
    }
  }

  // Get preset for a specific host
  getPresetForHost(host: string): SitePreset | null {
    // Check custom presets first (user override)
    if (this.customPresets[host]) {
      return this.customPresets[host];
    }

    // Check built-in presets
    if (this.builtinPresets[host]) {
      return this.builtinPresets[host];
    }

    // Check for domain matches (e.g. subdomain.example.com -> example.com)
    const baseDomain = this.extractBaseDomain(host);
    if (baseDomain !== host) {
      return this.getPresetForHost(baseDomain);
    }

    return null;
  }

  // Get all available presets with metadata
  getAllPresets(): { builtin: PresetMetadata[]; custom: PresetMetadata[] } {
    const builtin = Object.entries(this.builtinPresets).map(([host, preset]) => 
      this.createPresetMetadata(host, preset, 'built-in')
    );

    const custom = Object.entries(this.customPresets).map(([host, preset]) =>
      this.createPresetMetadata(host, preset, 'custom')
    );

    return { builtin, custom };
  }

  private createPresetMetadata(host: string, preset: SitePreset, type: string): PresetMetadata {
    return {
      id: host,
      name: preset.name,
      version: preset.version,
      description: preset.description || '',
      author: type === 'built-in' ? 'Oblivion Team' : 'User',
      website: host,
      ruleCount: preset.rules.length,
      hasThemes: !!preset.themes,
      lastUpdated: Date.now(),
      tags: this.generateTags(preset)
    };
  }

  private generateTags(preset: SitePreset): string[] {
    const tags = new Set<string>();
    
    for (const rule of preset.rules) {
      if (rule.selector.includes('ad')) tags.add('ads');
      if (rule.selector.includes('sidebar')) tags.add('sidebar');
      if (rule.selector.includes('recommend')) tags.add('recommendations');
      if (rule.selector.includes('trend')) tags.add('trending');
      if (rule.selector.includes('comment')) tags.add('comments');
      if (rule.action === 'hide') tags.add('hiding');
      if (rule.action === 'blank') tags.add('blanking');
      if (rule.action === 'replace') tags.add('replacement');
    }

    if (preset.themes) tags.add('themes');
    
    return Array.from(tags);
  }

  // Apply preset to current page
  async applyPreset(host: string): Promise<{ success: boolean; applied: number; errors: string[] }> {
    const preset = this.getPresetForHost(host);
    if (!preset) {
      return { success: false, applied: 0, errors: ['No preset found for this host'] };
    }

    const errors: string[] = [];
    let applied = 0;

    try {
      // Apply rules
      for (const rule of preset.rules) {
        try {
          await this.storage.saveRule(host, rule);
          applied++;
        } catch (error) {
          errors.push(`Failed to apply rule ${rule.id}: ${(error as Error).message}`);
        }
      }

      // Apply themes if present
      if (preset.themes) {
        try {
          await this.storage.saveHostThemes(host, preset.themes);
        } catch (error) {
          errors.push(`Failed to apply themes: ${(error as Error).message}`);
        }
      }

      return { success: applied > 0, applied, errors };
    } catch (error) {
      return { success: false, applied: 0, errors: [(error as Error).message] };
    }
  }

  // Create custom preset from current page configuration
  async createCustomPreset(
    host: string, 
    name: string, 
    description: string = ''
  ): Promise<{ success: boolean; preset?: SitePreset; error?: string }> {
    try {
      const rules = await this.storage.loadHostRules(host);
      const themes = await this.storage.loadHostThemes(host);

      if (rules.length === 0) {
        return { success: false, error: 'No rules configured for this host' };
      }

      const preset: SitePreset = {
        name,
        version: '1.0.0',
        description,
        rules,
        themes: themes || undefined
      };

      // Save as custom preset
      this.customPresets[host] = preset;
      await chrome.storage.sync.set({ customPresets: this.customPresets });

      return { success: true, preset };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  // Delete custom preset
  async deleteCustomPreset(host: string): Promise<boolean> {
    try {
      if (this.customPresets[host]) {
        delete this.customPresets[host];
        await chrome.storage.sync.set({ customPresets: this.customPresets });
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to delete custom preset:', error);
      return false;
    }
  }

  // Export preset as JSON
  exportPreset(host: string): string | null {
    const preset = this.getPresetForHost(host);
    if (!preset) return null;

    const exportData = {
      version: '2.0.0',
      type: 'oblivion-preset',
      timestamp: Date.now(),
      host,
      preset
    };

    return JSON.stringify(exportData, null, 2);
  }

  // Import preset from JSON
  async importPreset(jsonData: string): Promise<{ success: boolean; host?: string; error?: string }> {
    try {
      const importData = JSON.parse(jsonData);

      // Validate import structure
      if (importData.type !== 'oblivion-preset' || !importData.preset || !importData.host) {
        throw new Error('Invalid preset format');
      }

      const { host, preset } = importData;

      // Validate preset structure
      if (!preset.name || !preset.rules || !Array.isArray(preset.rules)) {
        throw new Error('Invalid preset structure');
      }

      // Validate rules
      for (const rule of preset.rules) {
        if (!rule.id || !rule.selector || !rule.action) {
          throw new Error('Invalid rule structure in preset');
        }
      }

      // Save as custom preset
      this.customPresets[host] = preset;
      await chrome.storage.sync.set({ customPresets: this.customPresets });

      return { success: true, host };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  // Export all presets
  async exportAllPresets(): Promise<string> {
    const allPresets = await this.storage.exportData();
    const parsedData = JSON.parse(allPresets);

    // Add preset metadata
    const exportData = {
      ...parsedData,
      type: 'oblivion-full-export',
      builtinPresets: this.builtinPresets,
      customPresets: this.customPresets
    };

    return JSON.stringify(exportData, null, 2);
  }

  // Import all presets
  async importAllPresets(jsonData: string): Promise<{ success: boolean; imported: number; errors: string[] }> {
    try {
      const importData = JSON.parse(jsonData);
      const result = { success: false, imported: 0, errors: [] as string[] };

      // Import custom presets if present
      if (importData.customPresets) {
        for (const [host, preset] of Object.entries(importData.customPresets)) {
          try {
            this.customPresets[host] = preset as SitePreset;
            result.imported++;
          } catch (error) {
            result.errors.push(`Failed to import preset for ${host}: ${(error as Error).message}`);
          }
        }
      }

      // Import host data if present
      if (importData.hosts) {
        const storageResult = await this.storage.importData(jsonData);
        result.imported += storageResult.imported;
        result.errors.push(...storageResult.errors);
      }

      // Save custom presets
      if (result.imported > 0) {
        await chrome.storage.sync.set({ customPresets: this.customPresets });
        result.success = true;
      }

      return result;
    } catch (error) {
      return { success: false, imported: 0, errors: [(error as Error).message] };
    }
  }

  // Search presets by query
  searchPresets(query: string): PresetMetadata[] {
    const allPresets = this.getAllPresets();
    const combined = [...allPresets.builtin, ...allPresets.custom];
    
    const lowercaseQuery = query.toLowerCase();
    
    return combined.filter(preset => 
      preset.name.toLowerCase().includes(lowercaseQuery) ||
      preset.description.toLowerCase().includes(lowercaseQuery) ||
      preset.website.toLowerCase().includes(lowercaseQuery) ||
      preset.tags.some(tag => tag.toLowerCase().includes(lowercaseQuery))
    );
  }

  // Get preset recommendations based on current page
  getRecommendationsForHost(host: string): PresetMetadata[] {
    const baseDomain = this.extractBaseDomain(host);
    
    // If we have an exact match, return similar presets
    if (this.builtinPresets[host] || this.builtinPresets[baseDomain]) {
      return this.findSimilarPresets(host);
    }

    // Otherwise, suggest popular presets
    return this.getPopularPresets();
  }

  private findSimilarPresets(host: string): PresetMetadata[] {
    const currentPreset = this.getPresetForHost(host);
    if (!currentPreset) return [];

    const currentTags = this.generateTags(currentPreset);
    const allPresets = this.getAllPresets();
    const combined = [...allPresets.builtin, ...allPresets.custom];

    return combined
      .filter(preset => preset.id !== host)
      .map(preset => ({
        ...preset,
        similarity: this.calculateSimilarity(currentTags, preset.tags)
      }))
      .filter(preset => preset.similarity > 0.3)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 5);
  }

  private calculateSimilarity(tags1: string[], tags2: string[]): number {
    const set1 = new Set(tags1);
    const set2 = new Set(tags2);
    const intersection = new Set([...set1].filter(tag => set2.has(tag)));
    const union = new Set([...set1, ...set2]);
    
    return union.size > 0 ? intersection.size / union.size : 0;
  }

  private getPopularPresets(): PresetMetadata[] {
    // Return most comprehensive built-in presets
    const popular = ['x.com', 'youtube.com', 'reddit.com', 'linkedin.com'];
    return popular
      .map(host => this.builtinPresets[host])
      .filter(preset => preset)
      .map(preset => this.createPresetMetadata(
        Object.keys(this.builtinPresets).find(key => 
          this.builtinPresets[key] === preset
        )!,
        preset, 
        'built-in'
      ));
  }

  private extractBaseDomain(host: string): string {
    // Remove www. prefix
    const withoutWww = host.replace(/^www\./, '');
    
    // Extract main domain from subdomains
    const parts = withoutWww.split('.');
    if (parts.length >= 2) {
      return parts.slice(-2).join('.');
    }
    
    return withoutWww;
  }

  // Update built-in presets (for extension updates)
  async updateBuiltinPresets(): Promise<{ updated: number; added: number }> {
    let updated = 0;
    let added = 0;

    // This would typically fetch latest presets from a server
    // For now, we just reinitialize built-ins
    const oldPresets = { ...this.builtinPresets };
    this.initializeBuiltinPresets();

    for (const [host, newPreset] of Object.entries(this.builtinPresets)) {
      if (oldPresets[host]) {
        if (oldPresets[host].version !== newPreset.version) {
          updated++;
        }
      } else {
        added++;
      }
    }

    if (updated > 0 || added > 0) {
      console.log(`📦 Updated presets: ${updated} updated, ${added} added`);
    }

    return { updated, added };
  }

  // Get preset statistics
  getStatistics(): {
    totalPresets: number;
    builtinCount: number;
    customCount: number;
    totalRules: number;
    hostsWithPresets: string[];
  } {
    const builtinCount = Object.keys(this.builtinPresets).length;
    const customCount = Object.keys(this.customPresets).length;
    
    let totalRules = 0;
    const hostsWithPresets: string[] = [];

    for (const [host, preset] of Object.entries({...this.builtinPresets, ...this.customPresets})) {
      totalRules += preset.rules.length;
      hostsWithPresets.push(host);
    }

    return {
      totalPresets: builtinCount + customCount,
      builtinCount,
      customCount,
      totalRules,
      hostsWithPresets: [...new Set(hostsWithPresets)]
    };
  }
}
