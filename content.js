// Simplified Element Remover Pro content script
class ElementRemover {
  constructor() {
    this.host = location.hostname;
    this.appliedRules = new Set();
    this.hiddenElements = new WeakMap();
    this.isSelectionMode = false;
    this.sitePresets = this.getSitePresets();
    
    // Bind event handlers once to avoid issues with removeEventListener
    this.boundHandlers = {
      hover: this.handleHover.bind(this),
      mouseOut: this.handleMouseOut.bind(this),
      click: this.handleClick.bind(this),
      keydown: this.handleKeydown.bind(this)
    };
    
    this.setupMessageHandler();
    this.applyPersistedRules();
  }

  getSitePresets() {
    return {
      // 'x.com': {
      //   name: 'X (Twitter)',
      //   rules: [
      //     {
      //       type: 'hide',
      //       selector: '[aria-label="Timeline: Trending now"]',
      //       description: 'Trending sidebar'
      //     },
      //     {
      //       type: 'hide', 
      //       selector: '[aria-label="Who to follow"]',
      //       description: 'Who to follow'
      //     },
      //     {
      //       type: 'hide',
      //       selector: '[data-testid="sidebarColumn"]',
      //       description: 'Right sidebar'
      //     }
      //   ]
      // },
      
      // 'youtube.com': {
      //   name: 'YouTube',
      //   rules: [
      //     {
      //       type: 'hide',
      //       selector: '#secondary',
      //       description: 'Sidebar recommendations'
      //     },
      //     {
      //       type: 'hide',
      //       selector: '[title="Shorts"]',
      //       description: 'Shorts shelf'
      //     },
      //     {
      //       type: 'hide',
      //       selector: 'ytd-rich-shelf-renderer',
      //       description: 'Homepage shelves'
      //     }
      //   ]
      // },
      
      // 'reddit.com': {
      //   name: 'Reddit', 
      //   rules: [
      //     {
      //       type: 'hide',
      //       selector: '[data-testid="subreddit-sidebar"]',
      //       description: 'Sidebar'
      //     },
      //     {
      //       type: 'hide',
      //       selector: '[data-testid="popular-communities"]',
      //       description: 'Popular communities'
      //     }
      //   ]
      // }
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
          
        case 'saveCurrentConfig':
          sendResponse(await this.saveCurrentConfig());
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
    
    // Check if site has saved config
    const savedRules = await chrome.storage.sync.get(`rules:${this.host}`);
    const hasSavedConfig = savedRules[`rules:${this.host}`] && savedRules[`rules:${this.host}`].length > 0;
    
    // Detect common elements for chips
    const chips = this.detectCommonElements();
    
    return {
      host: this.host,
      path: location.pathname,
      hasPreset,
      hasSavedConfig,
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
    document.addEventListener('mouseover', this.boundHandlers.hover);
    document.addEventListener('mouseout', this.boundHandlers.mouseOut);
    
    // Use capture phase to intercept clicks BEFORE they reach the target
    document.addEventListener('click', this.boundHandlers.click, true);
    
    // Listen for ESC key
    document.addEventListener('keydown', this.boundHandlers.keydown);
  }

  exitSelectionMode() {
    document.body.style.cursor = '';
    document.removeEventListener('mouseover', this.boundHandlers.hover);
    document.removeEventListener('mouseout', this.boundHandlers.mouseOut);
    // Remove with capture flag to match how it was added
    document.removeEventListener('click', this.boundHandlers.click, true);
    document.removeEventListener('keydown', this.boundHandlers.keydown);
    
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
    
    const isInteractive = this.isInteractiveElement(e.target);
    this.highlightElement(e.target, isInteractive);
  }

  handleMouseOut(e) {
    // Keep highlights until mouse enters another element
  }

  handleClick(e) {
    if (!this.isSelectionMode || e.target.hasAttribute('data-erpro')) return;
    
    // IMMEDIATELY stop all event propagation - this runs in capture phase
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    
    // Check if it's an interactive element
    const isInteractive = this.isInteractiveElement(e.target);
    
    // For buttons and interactive elements, we're extra cautious
    if (isInteractive) {
      // Completely block the event
      if (e.target.click) {
        // Temporarily disable the element's click method
        const originalClick = e.target.click;
        e.target.click = () => {};
        setTimeout(() => {
          if (e.target.click === originalClick) return; // Already restored
          e.target.click = originalClick;
        }, 100);
      }
      
      // Disable the element temporarily
      const wasDisabled = e.target.disabled;
      if ('disabled' in e.target) {
        e.target.disabled = true;
        setTimeout(() => {
          if (!wasDisabled) {
            e.target.disabled = false;
          }
        }, 100);
      }
    }
    
    const rule = {
      type: 'hide',
      selector: this.generateSelector(e.target),
      description: this.generateDescription(e.target)
    };

    const count = this.applyRule(rule);
    if (count > 0) {
      this.saveRule(rule);
      this.showToast(`Hidden: ${rule.description}${isInteractive ? ' (click blocked)' : ''}`, 'success');
      
      chrome.runtime.sendMessage({
        action: 'elementHidden',
        rule: rule,
        count: count
      }).catch(() => {});
    }
  }

  isInteractiveElement(element) {
    // Check if element or any parent is interactive
    const interactiveElements = [
      'button', 'a', 'input', 'select', 'textarea', 
      'label', 'option', 'summary', 'details'
    ];
    
    const interactiveRoles = [
      'button', 'link', 'menuitem', 'tab', 'checkbox', 
      'radio', 'textbox', 'combobox', 'listbox'
    ];
    
    let current = element;
    while (current && current !== document.body) {
      // Check tag name
      if (interactiveElements.includes(current.tagName.toLowerCase())) {
        return true;
      }
      
      // Check role
      const role = current.getAttribute('role');
      if (role && interactiveRoles.includes(role.toLowerCase())) {
        return true;
      }
      
      // Check for click handlers
      if (current.onclick || current.hasAttribute('onclick')) {
        return true;
      }
      
      // Check for tabindex (focusable)
      if (current.hasAttribute('tabindex') && current.getAttribute('tabindex') !== '-1') {
        return true;
      }
      
      // Check common clickable classes/attributes
      const classList = current.classList;
      const clickableClasses = ['btn', 'button', 'link', 'clickable', 'interactive'];
      if (clickableClasses.some(cls => 
        Array.from(classList).some(className => 
          className.toLowerCase().includes(cls)))) {
        return true;
      }
      
      current = current.parentElement;
    }
    
    return false;
  }

  highlightElement(element, isInteractive = false) {
    if (isInteractive) {
      // Different styling for interactive elements
      element.style.setProperty('outline', '2px dashed #fbbf24', 'important');
      element.style.setProperty('outline-offset', '2px', 'important');
      element.style.setProperty('background-color', 'rgba(251, 191, 36, 0.1)', 'important');
      
      // Add a tooltip-like indicator
      const indicator = document.createElement('div');
      indicator.setAttribute('data-erpro', 'interactive-indicator');
      indicator.textContent = 'Interactive element - click safely blocked';
      indicator.style.cssText = `
        position: absolute;
        background: #fbbf24;
        color: #92400e;
        padding: 4px 8px;
        font-size: 11px;
        font-weight: 600;
        border-radius: 4px;
        z-index: 10000;
        pointer-events: none;
        white-space: nowrap;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      `;
      
      const rect = element.getBoundingClientRect();
      indicator.style.left = (rect.left + window.scrollX) + 'px';
      indicator.style.top = (rect.top + window.scrollY - 30) + 'px';
      
      document.body.appendChild(indicator);
      element.setAttribute('data-erpro-interactive-indicator', 'true');
    } else {
      // Normal highlighting for non-interactive elements
      element.style.setProperty('outline', '2px solid #ff6b35', 'important');
      element.style.setProperty('outline-offset', '2px', 'important');
    }
    
    element.setAttribute('data-erpro-highlighted', 'true');
  }

  clearHighlights() {
    const highlighted = document.querySelectorAll('[data-erpro-highlighted]');
    highlighted.forEach(el => {
      el.style.removeProperty('outline');
      el.style.removeProperty('outline-offset');
      el.style.removeProperty('background-color');
      el.removeAttribute('data-erpro-highlighted');
      el.removeAttribute('data-erpro-interactive-indicator');
    });
    
    // Remove interactive indicators
    const indicators = document.querySelectorAll('[data-erpro="interactive-indicator"]');
    indicators.forEach(indicator => indicator.remove());
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

  async saveCurrentConfig() {
    try {
      // Get all currently applied rules
      const rulesToSave = Array.from(this.appliedRules.values());
      
      if (rulesToSave.length === 0) {
        return { error: 'No rules to save - hide some elements first' };
      }
      
      // Save rules to chrome storage
      await chrome.storage.sync.set({
        [`rules:${this.host}`]: rulesToSave
      });
      
      return { 
        success: true, 
        savedCount: rulesToSave.length,
        host: this.host
      };
      
    } catch (error) {
      console.error('Save config failed:', error);
      return { error: error.message };
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