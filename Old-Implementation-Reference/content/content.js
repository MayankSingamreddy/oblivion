// Main content script - orchestrates all functionality
class ElementRemoverPro {
  constructor() {
    this.host = location.hostname;
    this.path = location.pathname;
    this.isInitialized = false;
    this.overlayManager = null;
    this.spaManager = null;
    
    this.init();
  }

  async init() {
    if (this.isInitialized) return;
    
    // Load required modules
    await this.loadModules();
    
    // Initialize core systems
    this.overlayManager = new OverlayManager(window.ruleEngine, window.memoryEngine);
    this.spaManager = new SPAManager((newPath) => {
      this.path = newPath;
      this.applyPersistedRules();
    });
    
    // Apply persisted rules immediately
    await this.applyPersistedRules();
    
    // Setup continuous monitoring
    this.setupMutationObserver();
    
    // Setup message handling
    this.setupMessageHandlers();
    
    this.isInitialized = true;
    
    // Notify that we're ready
    chrome.runtime.sendMessage({
      action: 'contentScriptReady',
      host: this.host,
      path: this.path
    }).catch(() => {
      // Extension context might not be available yet
    });
  }

  async loadModules() {
    // Load modules in order if not already loaded
    const modules = [
      'memory.js',
      'rules.js', 
      'spa.js',
      'overlay.js'
    ];

    for (const module of modules) {
      if (!document.querySelector(`script[src*="${module}"]`)) {
        await this.injectScript(chrome.runtime.getURL(`content/${module}`));
      }
    }
  }

  injectScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.onload = resolve;
      script.onerror = reject;
      (document.head || document.documentElement).appendChild(script);
    });
  }

  async applyPersistedRules() {
    if (!window.memoryEngine || !window.ruleEngine) return;
    
    try {
      const rules = await window.memoryEngine.getRulesForPage(this.host, this.path);
      
      for (const rule of rules) {
        // Validate rule still works
        const elements = document.querySelectorAll(rule.selector);
        const isStable = await window.memoryEngine.updateStability(
          this.host, 
          rule.selector, 
          elements.length > 0
        );
        
        if (isStable && window.ruleEngine.validateRule(rule)) {
          window.ruleEngine.applyRule(rule);
        }
      }
    } catch (error) {
      console.warn('Failed to apply persisted rules:', error);
    }
  }

  setupMutationObserver() {
    // Watch for new content and re-apply rules
    const observer = new MutationObserver((mutations) => {
      let shouldReapply = false;
      
      mutations.forEach(mutation => {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              shouldReapply = true;
            }
          });
        }
      });

      if (shouldReapply) {
        // Debounce rapid changes
        clearTimeout(this.mutationTimeout);
        this.mutationTimeout = setTimeout(() => {
          this.applyPersistedRules();
        }, 100);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    this.mutationObserver = observer;
  }

  setupMessageHandlers() {
    chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
      try {
        let response;
        
        switch (message.action) {
          case 'getPageInfo':
            response = await this.getPageInfo();
            break;
            
          case 'applyCleanPreset':
            response = await this.applyCleanPreset();
            break;
            
          case 'askAI':
            response = await this.handleAIRequest(message.prompt);
            break;
            
          case 'startTweak':
            this.overlayManager?.enterSelectionMode();
            response = { success: true };
            break;
            
          case 'resetSite':
            response = await this.resetSite(message.temporary);
            break;
            
          case 'undo':
            this.overlayManager?.undo();
            response = { success: true };
            break;
            
          case 'toggleAlwaysApply':
            response = await this.toggleAlwaysApply(message.enabled);
            break;
            
          default:
            response = { error: 'Unknown action' };
        }
        
        sendResponse(response);
      } catch (error) {
        sendResponse({ error: error.message });
      }
      
      return true; // Keep message channel open for async response
    });
  }

  async getPageInfo() {
    const hasPreset = !!window.sitePresets[this.host];
    const rules = await window.memoryEngine.getRulesForPage(this.host, this.path);
    const appliedRules = window.ruleEngine.getAppliedRules();
    
    // Detect common elements for chips
    const chips = this.detectCommonElements();
    
    return {
      host: this.host,
      path: this.path,
      hasPreset,
      ruleCount: rules.length,
      appliedCount: appliedRules.length,
      chips,
      isActive: appliedRules.length > 0
    };
  }

  detectCommonElements() {
    const chips = [];
    
    // Common patterns to detect
    const patterns = {
      'trending': {
        selectors: ['[aria-label*="trending" i]', '[aria-label*="trend" i]', '*[title*="trending" i]'],
        name: 'Trending'
      },
      'sidebar': {
        selectors: ['aside', '[role="complementary"]', '*[class*="sidebar" i]'],
        name: 'Sidebar'  
      },
      'recommendations': {
        selectors: ['*[aria-label*="recommend" i]', '*[class*="recommend" i]', '*[data-testid*="recommend" i]'],
        name: 'Recommendations'
      },
      'ads': {
        selectors: ['*[id*="ad" i]', '*[class*="ad" i]', '*[aria-label*="sponsor" i]'],
        name: 'Ads'
      }
    };

    Object.entries(patterns).forEach(([key, pattern]) => {
      let found = false;
      for (const selector of pattern.selectors) {
        if (document.querySelector(selector)) {
          found = true;
          break;
        }
      }
      
      if (found) {
        chips.push({
          id: key,
          name: pattern.name,
          active: false // TODO: Check if already hidden
        });
      }
    });

    return chips;
  }

  async applyCleanPreset() {
    const preset = window.sitePresets[this.host];
    if (!preset) {
      return { error: 'No preset available for this site' };
    }

    let appliedCount = 0;
    const results = [];

    for (const rule of preset.rules) {
      if (window.ruleEngine.validateRule(rule)) {
        const count = window.ruleEngine.applyRule(rule);
        if (count > 0) {
          await window.memoryEngine.saveRule(this.host, this.path, rule);
          appliedCount += count;
          results.push({
            description: rule.description,
            count
          });
        }
      }
    }

    return {
      success: true,
      appliedCount,
      results,
      presetName: preset.name
    };
  }

  async handleAIRequest(prompt) {
    try {
      // Load AI service if needed
      if (!window.aiService) {
        await this.injectScript(chrome.runtime.getURL('ai/ai-service.js'));
      }

      // Get AI suggestions
      const suggestions = await window.aiService.generateSelectors(prompt);
      
      const results = [];
      let totalApplied = 0;

      for (const suggestion of suggestions) {
        const rule = {
          type: 'hide',
          selector: suggestion.selector,
          description: suggestion.description,
          anchors: suggestion.anchors || {}
        };

        if (window.ruleEngine.validateRule(rule)) {
          const count = window.ruleEngine.applyRule(rule);
          if (count > 0) {
            await window.memoryEngine.saveRule(this.host, this.path, rule);
            totalApplied += count;
            results.push({
              description: rule.description,
              count,
              selector: rule.selector
            });
          }
        }
      }

      return {
        success: true,
        appliedCount: totalApplied,
        results
      };
    } catch (error) {
      // Fall back to pattern matching
      return this.handlePatternFallback(prompt);
    }
  }

  async handlePatternFallback(prompt) {
    const patterns = {
      'ads|advertisement|sponsored': {
        selectors: ['*[id*="ad" i]', '*[class*="ad" i]', '*[aria-label*="sponsor" i]'],
        description: 'Advertisements'
      },
      'sidebar|aside': {
        selectors: ['aside', '[role="complementary"]'],
        description: 'Sidebars'
      },
      'trending|trend': {
        selectors: ['*[aria-label*="trending" i]', '*[title*="trending" i]'],
        description: 'Trending content'
      },
      'recommend|suggestion': {
        selectors: ['*[aria-label*="recommend" i]', '*[class*="recommend" i]'],
        description: 'Recommendations'
      }
    };

    const results = [];
    let totalApplied = 0;

    Object.entries(patterns).forEach(async ([pattern, config]) => {
      if (new RegExp(pattern, 'i').test(prompt)) {
        for (const selector of config.selectors) {
          const rule = {
            type: 'hide',
            selector,
            description: config.description,
            anchors: {}
          };

          if (window.ruleEngine.validateRule(rule)) {
            const count = window.ruleEngine.applyRule(rule);
            if (count > 0) {
              await window.memoryEngine.saveRule(this.host, this.path, rule);
              totalApplied += count;
              results.push({
                description: config.description,
                count,
                selector
              });
            }
          }
        }
      }
    });

    return {
      success: true,
      appliedCount: totalApplied,
      results,
      fallback: true
    };
  }

  async resetSite(temporary = true) {
    if (temporary) {
      // Temporarily disable rules without deleting memory
      window.ruleEngine.resetAll();
      return { success: true, temporary: true };
    } else {
      // Permanently clear site memory
      await window.memoryEngine.clearSiteMemory(this.host);
      window.ruleEngine.resetAll();
      return { success: true, temporary: false };
    }
  }

  async toggleAlwaysApply(enabled) {
    // This would be used for global settings
    const settings = await chrome.storage.sync.get('globalSettings') || {};
    settings.globalSettings = settings.globalSettings || {};
    settings.globalSettings.alwaysApply = enabled;
    
    await chrome.storage.sync.set(settings);
    
    return { success: true, enabled };
  }

  destroy() {
    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
    }
    if (this.spaManager) {
      this.spaManager.destroy();
    }
    clearTimeout(this.mutationTimeout);
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.elementRemoverPro = new ElementRemoverPro();
  });
} else {
  window.elementRemoverPro = new ElementRemoverPro();
}