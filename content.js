// Simplified Element Remover Pro content script
class ElementRemover {
  constructor() {
    this.host = location.hostname;
    this.appliedRules = new Set();
    this.hiddenElements = new WeakMap();
    this.isSelectionMode = false;
    this.sitePresets = this.getSitePresets();
    
    this.setupMessageHandler();
    this.applyPersistedRules();
  }

  getSitePresets() {
    return {
      'x.com': {
        name: 'X (Twitter)',
        rules: [
          {
            type: 'hide',
            selector: '[aria-label="Timeline: Trending now"]',
            description: 'Trending sidebar'
          },
          {
            type: 'hide', 
            selector: '[aria-label="Who to follow"]',
            description: 'Who to follow'
          },
          {
            type: 'hide',
            selector: '[data-testid="sidebarColumn"]',
            description: 'Right sidebar'
          }
        ]
      },
      
      'youtube.com': {
        name: 'YouTube',
        rules: [
          {
            type: 'hide',
            selector: '#secondary',
            description: 'Sidebar recommendations'
          },
          {
            type: 'hide',
            selector: '[title="Shorts"]',
            description: 'Shorts shelf'
          },
          {
            type: 'hide',
            selector: 'ytd-rich-shelf-renderer',
            description: 'Homepage shelves'
          }
        ]
      },
      
      'reddit.com': {
        name: 'Reddit', 
        rules: [
          {
            type: 'hide',
            selector: '[data-testid="subreddit-sidebar"]',
            description: 'Sidebar'
          },
          {
            type: 'hide',
            selector: '[data-testid="popular-communities"]',
            description: 'Popular communities'
          }
        ]
      }
    };
  }

  setupMessageHandler() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
      return true; // Keep message channel open for async response
    });
  }

  async handleMessage(message, sender, sendResponse) {
    try {
      switch (message.action) {
        case 'getPageInfo':
          sendResponse(await this.getPageInfo());
          break;
          
        case 'applyCleanPreset':
          sendResponse(await this.applyCleanPreset());
          break;
          
        case 'askAI':
          sendResponse(await this.handleAIRequest(message.prompt));
          break;
          
        case 'startTweak':
          this.toggleSelectionMode();
          sendResponse({ success: true });
          break;
          
        case 'undo':
          this.undo();
          sendResponse({ success: true });
          break;
          
        case 'resetSite':
          sendResponse(await this.resetSite(message.temporary));
          break;
          
        default:
          sendResponse({ error: 'Unknown action' });
      }
    } catch (error) {
      console.error('Message handler error:', error);
      sendResponse({ error: error.message });
    }
  }

  async getPageInfo() {
    const hasPreset = !!this.sitePresets[this.host];
    const appliedCount = this.appliedRules.size;
    
    // Detect common elements for chips
    const chips = this.detectCommonElements();
    
    return {
      host: this.host,
      path: location.pathname,
      hasPreset,
      appliedCount,
      chips,
      isActive: appliedCount > 0
    };
  }

  detectCommonElements() {
    const chips = [];
    
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
        try {
          if (document.querySelector(selector)) {
            found = true;
            break;
          }
        } catch (e) {
          // Invalid selector, skip
        }
      }
      
      if (found) {
        chips.push({
          id: key,
          name: pattern.name,
          active: false
        });
      }
    });

    return chips;
  }

  async applyCleanPreset() {
    const preset = this.sitePresets[this.host];
    if (!preset) {
      return { error: 'No preset available for this site' };
    }

    let appliedCount = 0;
    const results = [];

    for (const rule of preset.rules) {
      try {
        const count = this.applyRule(rule);
        if (count > 0) {
          await this.saveRule(rule);
          appliedCount += count;
          results.push({
            description: rule.description,
            count
          });
        }
      } catch (error) {
        console.warn('Failed to apply rule:', rule, error);
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
      // Try to load AI service
      if (typeof window.aiService === 'undefined') {
        await this.loadAIService();
      }

      if (window.aiService) {
        const suggestions = await window.aiService.generateSelectors(prompt);
        
        const results = [];
        let totalApplied = 0;

        for (const suggestion of suggestions) {
          const rule = {
            type: 'hide',
            selector: suggestion.selector,
            description: suggestion.description
          };

          try {
            const count = this.applyRule(rule);
            if (count > 0) {
              await this.saveRule(rule);
              totalApplied += count;
              results.push({
                description: rule.description,
                count,
                selector: rule.selector
              });
            }
          } catch (error) {
            console.warn('Failed to apply AI rule:', rule, error);
          }
        }

        return {
          success: true,
          appliedCount: totalApplied,
          results
        };
      }
    } catch (error) {
      console.warn('AI request failed, falling back to patterns:', error);
    }

    // Fallback to pattern matching
    return this.handlePatternFallback(prompt);
  }

  async loadAIService() {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = chrome.runtime.getURL('ai/ai-service.js');
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  handlePatternFallback(prompt) {
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

    Object.entries(patterns).forEach(([pattern, config]) => {
      if (new RegExp(pattern, 'i').test(prompt)) {
        for (const selector of config.selectors) {
          const rule = {
            type: 'hide',
            selector,
            description: config.description
          };

          try {
            const count = this.applyRule(rule);
            if (count > 0) {
              this.saveRule(rule);
              totalApplied += count;
              results.push({
                description: config.description,
                count,
                selector
              });
              break; // Only apply first matching selector per pattern
            }
          } catch (error) {
            console.warn('Failed to apply pattern rule:', rule, error);
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

  applyRule(rule) {
    try {
      const elements = document.querySelectorAll(rule.selector);
      let appliedCount = 0;

      elements.forEach(element => {
        if (this.hiddenElements.has(element)) return;

        switch (rule.type) {
          case 'hide':
            element.style.setProperty('display', 'none', 'important');
            element.setAttribute('data-erpro-hidden', 'true');
            break;
          case 'dim':
            element.style.setProperty('opacity', '0.2', 'important');
            element.setAttribute('data-erpro-dimmed', 'true');
            break;
        }

        this.hiddenElements.set(element, rule);
        appliedCount++;
      });

      if (appliedCount > 0) {
        this.appliedRules.add(rule.selector);
      }

      return appliedCount;
    } catch (error) {
      console.error('Failed to apply rule:', rule, error);
      return 0;
    }
  }

  async saveRule(rule) {
    try {
      const key = `rules:${this.host}`;
      const stored = await chrome.storage.sync.get(key);
      const rules = stored[key] || [];
      
      // Remove duplicates
      const filtered = rules.filter(r => r.selector !== rule.selector);
      filtered.push({
        ...rule,
        createdAt: Date.now()
      });
      
      await chrome.storage.sync.set({ [key]: filtered });
    } catch (error) {
      console.warn('Failed to save rule:', error);
    }
  }

  async applyPersistedRules() {
    try {
      const key = `rules:${this.host}`;
      const stored = await chrome.storage.sync.get(key);
      const rules = stored[key] || [];
      
      for (const rule of rules) {
        this.applyRule(rule);
      }
    } catch (error) {
      console.warn('Failed to apply persisted rules:', error);
    }
  }

  toggleSelectionMode() {
    this.isSelectionMode = !this.isSelectionMode;
    
    if (this.isSelectionMode) {
      this.enterSelectionMode();
    } else {
      this.exitSelectionMode();
    }

    // Notify popup
    chrome.runtime.sendMessage({
      action: 'tweakModeActive',
      active: this.isSelectionMode
    }).catch(() => {});
  }

  enterSelectionMode() {
    document.body.style.cursor = 'crosshair';
    document.addEventListener('mouseover', this.handleHover.bind(this));
    document.addEventListener('mouseout', this.handleMouseOut.bind(this));
    document.addEventListener('click', this.handleClick.bind(this));
    
    // Listen for ESC key
    document.addEventListener('keydown', this.handleKeydown.bind(this));
  }

  exitSelectionMode() {
    document.body.style.cursor = '';
    document.removeEventListener('mouseover', this.handleHover.bind(this));
    document.removeEventListener('mouseout', this.handleMouseOut.bind(this));
    document.removeEventListener('click', this.handleClick.bind(this));
    document.removeEventListener('keydown', this.handleKeydown.bind(this));
    
    this.clearHighlights();
  }

  handleKeydown(e) {
    if (e.key === 'Escape' && this.isSelectionMode) {
      this.toggleSelectionMode();
      e.preventDefault();
    }
  }

  handleHover(e) {
    if (!this.isSelectionMode || e.target.hasAttribute('data-erpro')) return;
    
    this.clearHighlights();
    this.highlightElement(e.target);
  }

  handleMouseOut(e) {
    // Keep highlights until mouse enters another element
  }

  handleClick(e) {
    if (!this.isSelectionMode || e.target.hasAttribute('data-erpro')) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const rule = {
      type: 'hide',
      selector: this.generateSelector(e.target),
      description: this.generateDescription(e.target)
    };

    const count = this.applyRule(rule);
    if (count > 0) {
      this.saveRule(rule);
      this.showToast(`Hidden: ${rule.description}`, 'success');
      
      chrome.runtime.sendMessage({
        action: 'elementHidden',
        rule: rule,
        count: count
      }).catch(() => {});
    }
  }

  highlightElement(element) {
    element.style.setProperty('outline', '2px solid #ff6b35', 'important');
    element.style.setProperty('outline-offset', '2px', 'important');
    element.setAttribute('data-erpro-highlighted', 'true');
  }

  clearHighlights() {
    const highlighted = document.querySelectorAll('[data-erpro-highlighted]');
    highlighted.forEach(el => {
      el.style.removeProperty('outline');
      el.style.removeProperty('outline-offset');  
      el.removeAttribute('data-erpro-highlighted');
    });
  }

  generateSelector(element) {
    // Simple selector generation
    if (element.id) {
      return `#${element.id}`;
    }
    
    if (element.className && typeof element.className === 'string') {
      const classes = element.className.split(' ').filter(cls => cls.length > 0);
      if (classes.length > 0) {
        return `${element.tagName.toLowerCase()}.${classes.join('.')}`;
      }
    }
    
    // Fallback to tag + nth-child
    const parent = element.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children);
      const index = siblings.indexOf(element);
      return `${parent.tagName.toLowerCase()} > ${element.tagName.toLowerCase()}:nth-child(${index + 1})`;
    }
    
    return element.tagName.toLowerCase();
  }

  generateDescription(element) {
    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel;
    
    const title = element.getAttribute('title');
    if (title) return title;
    
    const text = element.textContent?.trim();
    if (text && text.length < 50) return text;
    
    return `${element.tagName.toLowerCase()} element`;
  }

  undo() {
    // Simple undo - restore all hidden elements
    const hidden = document.querySelectorAll('[data-erpro-hidden]');
    if (hidden.length === 0) {
      this.showToast('Nothing to undo', 'info');
      return;
    }

    hidden.forEach(element => {
      element.style.removeProperty('display');
      element.removeAttribute('data-erpro-hidden');
    });

    this.appliedRules.clear();
    this.hiddenElements = new WeakMap();
    
    // Clear stored rules
    chrome.storage.sync.remove(`rules:${this.host}`).catch(() => {});
    
    this.showToast('All changes undone', 'success');
  }

  async resetSite(temporary = true) {
    if (temporary) {
      // Just restore elements without clearing storage
      const hidden = document.querySelectorAll('[data-erpro-hidden], [data-erpro-dimmed]');
      hidden.forEach(element => {
        element.style.removeProperty('display');
        element.style.removeProperty('opacity');
        element.removeAttribute('data-erpro-hidden');
        element.removeAttribute('data-erpro-dimmed');
      });
      
      this.appliedRules.clear();
      this.hiddenElements = new WeakMap();
      
      return { success: true, temporary: true };
    } else {
      // Clear storage and restore
      await chrome.storage.sync.remove(`rules:${this.host}`);
      
      const hidden = document.querySelectorAll('[data-erpro-hidden], [data-erpro-dimmed]');
      hidden.forEach(element => {
        element.style.removeProperty('display');
        element.style.removeProperty('opacity');
        element.removeAttribute('data-erpro-hidden');
        element.removeAttribute('data-erpro-dimmed');
      });
      
      this.appliedRules.clear();
      this.hiddenElements = new WeakMap();
      
      return { success: true, temporary: false };
    }
  }

  showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.setAttribute('data-erpro', 'toast');
    toast.className = `erpro-toast erpro-toast-${type}`;
    toast.textContent = message;
    
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 10001;
      padding: 12px 16px;
      border-radius: 6px;
      font-size: 14px;
      color: white;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      animation: slideIn 0.3s ease-out;
      ${type === 'success' ? 'background: #10b981;' : 
        type === 'error' ? 'background: #ef4444;' : 
        'background: #3b82f6;'}
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
      if (toast.parentNode) {
        toast.remove();
      }
    }, 3000);
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.elementRemover = new ElementRemover();
  });
} else {
  window.elementRemover = new ElementRemover();
}