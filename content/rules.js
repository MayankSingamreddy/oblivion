// Rule engine and selector builder
class RuleEngine {
  constructor() {
    this.appliedRules = new Set();
    this.hiddenElements = new WeakMap();
  }

  // Generate stable selectors with multiple anchors
  generateStableSelector(element) {
    const selectors = [];
    const anchors = {};

    // Get text content anchor
    const text = element.textContent?.trim();
    if (text && text.length < 100) {
      anchors.text = text;
    }

    // Get role/aria anchors  
    const role = element.getAttribute('role');
    if (role) {
      anchors.role = role;
      selectors.push(`[role="${role}"]`);
    }

    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel) {
      anchors.ariaLabel = ariaLabel;
      selectors.push(`[aria-label="${ariaLabel}"]`);
    }

    // Get structural anchors
    const tagName = element.tagName.toLowerCase();
    const id = element.id;
    const className = element.className;

    // Prefer semantic selectors
    if (id && !id.match(/^[a-z0-9-]+$/i)) {
      // Skip generated/dynamic IDs
    } else if (id) {
      selectors.push(`#${id}`);
    }

    // Use stable class patterns
    if (className && typeof className === 'string') {
      const classes = className.split(' ').filter(cls => 
        cls && !cls.match(/^[a-z0-9-_]{32,}$/i) // Skip hash-like classes
      );
      if (classes.length > 0) {
        selectors.push(`${tagName}.${classes.join('.')}`);
      }
    }

    // Fallback to nth-of-type with parent context
    if (selectors.length === 0) {
      const parent = element.parentElement;
      if (parent && parent !== document.body) {
        const siblings = Array.from(parent.children).filter(el => el.tagName === element.tagName);
        const index = siblings.indexOf(element);
        if (index >= 0) {
          selectors.push(`${parent.tagName.toLowerCase()} > ${tagName}:nth-of-type(${index + 1})`);
        }
      }
    }

    return {
      selector: selectors[0] || tagName,
      anchors,
      alternatives: selectors.slice(1)
    };
  }

  // Apply different action types
  applyRule(rule) {
    const elements = document.querySelectorAll(rule.selector);
    let appliedCount = 0;

    elements.forEach(element => {
      // Skip if already processed or is extension UI
      if (element.hasAttribute('data-erpro') || this.hiddenElements.has(element)) {
        return;
      }

      switch (rule.type) {
        case 'hide':
          this.hideElement(element);
          break;
        case 'dim':
          this.dimElement(element, rule.amount || 0.2);
          break;
        case 'mute':
          this.muteElement(element);
          break;
        case 'style':
          this.styleElement(element, rule.props || {});
          break;
      }

      this.hiddenElements.set(element, rule);
      appliedCount++;
    });

    if (appliedCount > 0) {
      this.appliedRules.add(rule.selector);
    }

    return appliedCount;
  }

  hideElement(element) {
    element.style.setProperty('display', 'none', 'important');
    element.setAttribute('data-erpro-hidden', 'true');
  }

  dimElement(element, amount) {
    element.style.setProperty('opacity', (1 - amount).toString(), 'important');
    element.style.setProperty('filter', `grayscale(${amount})`, 'important');
    element.setAttribute('data-erpro-dimmed', amount.toString());
  }

  muteElement(element) {
    // Remove autoplay
    if (element.autoplay !== undefined) {
      element.autoplay = false;
    }
    
    // Pause videos
    if (element.tagName === 'VIDEO' && element.pause) {
      element.pause();
    }
    
    // Add reduced motion
    element.style.setProperty('animation', 'none', 'important');
    element.style.setProperty('transition', 'none', 'important');
    element.setAttribute('data-erpro-muted', 'true');
  }

  styleElement(element, props) {
    const safeProps = {
      'opacity': true,
      'filter': true,  
      'backdrop-filter': true,
      'max-width': true,
      'max-height': true,
      'transform': true
    };

    Object.entries(props).forEach(([prop, value]) => {
      if (safeProps[prop]) {
        element.style.setProperty(prop, value, 'important');
      }
    });
    
    element.setAttribute('data-erpro-styled', 'true');
  }

  // Undo last rule application
  undoRule(selector) {
    const elements = document.querySelectorAll(`[data-erpro-hidden], [data-erpro-dimmed], [data-erpro-muted], [data-erpro-styled]`);
    
    elements.forEach(element => {
      const rule = this.hiddenElements.get(element);
      if (rule && rule.selector === selector) {
        this.restoreElement(element);
        this.hiddenElements.delete(element);
      }
    });

    this.appliedRules.delete(selector);
  }

  restoreElement(element) {
    // Remove all our modifications
    element.removeAttribute('data-erpro-hidden');
    element.removeAttribute('data-erpro-dimmed');  
    element.removeAttribute('data-erpro-muted');
    element.removeAttribute('data-erpro-styled');
    
    // Reset styles
    element.style.removeProperty('display');
    element.style.removeProperty('opacity');
    element.style.removeProperty('filter');
    element.style.removeProperty('animation');
    element.style.removeProperty('transition');
    element.style.removeProperty('backdrop-filter');
    element.style.removeProperty('max-width');
    element.style.removeProperty('max-height');
    element.style.removeProperty('transform');
  }

  // Reset all applied rules
  resetAll() {
    const elements = document.querySelectorAll(`[data-erpro-hidden], [data-erpro-dimmed], [data-erpro-muted], [data-erpro-styled]`);
    elements.forEach(element => this.restoreElement(element));
    
    this.appliedRules.clear();
    this.hiddenElements = new WeakMap();
  }

  // Get current state
  getAppliedRules() {
    return Array.from(this.appliedRules);
  }

  // Safety check - prevent removing too many elements
  validateRule(rule) {
    const elements = document.querySelectorAll(rule.selector);
    
    if (elements.length > 100) {
      console.warn(`Rule would affect ${elements.length} elements, seems too broad`);
      return false;
    }

    // Don't allow hiding body, html, or main content
    const criticalSelectors = ['body', 'html', '[role="main"]', 'main'];
    if (criticalSelectors.some(sel => rule.selector.includes(sel))) {
      console.warn(`Rule targets critical page structure: ${rule.selector}`);
      return false;
    }

    return true;
  }
}

// Site presets for popular sites
const SITE_PRESETS = {
  'x.com': {
    name: 'X (Twitter)',
    rules: [
      {
        type: 'hide',
        selector: '[aria-label="Timeline: Trending now"]',
        description: 'Trending sidebar',
        anchors: { ariaLabel: 'Timeline: Trending now', role: 'region' }
      },
      {
        type: 'hide', 
        selector: '[aria-label="Who to follow"]',
        description: 'Who to follow',
        anchors: { ariaLabel: 'Who to follow' }
      },
      {
        type: 'hide',
        selector: '[data-testid="sidebarColumn"]',
        description: 'Right sidebar',
        anchors: { testId: 'sidebarColumn' }
      }
    ]
  },
  
  'youtube.com': {
    name: 'YouTube',
    rules: [
      {
        type: 'hide',
        selector: '#secondary',
        description: 'Sidebar recommendations',
        anchors: { id: 'secondary' }
      },
      {
        type: 'hide',
        selector: '[title="Shorts"]',
        description: 'Shorts shelf',
        anchors: { title: 'Shorts' }
      },
      {
        type: 'hide',
        selector: 'ytd-rich-shelf-renderer',
        description: 'Homepage shelves',
        anchors: { tag: 'ytd-rich-shelf-renderer' }
      }
    ]
  },
  
  'reddit.com': {
    name: 'Reddit', 
    rules: [
      {
        type: 'hide',
        selector: '[data-testid="subreddit-sidebar"]',
        description: 'Sidebar',
        anchors: { testId: 'subreddit-sidebar' }
      },
      {
        type: 'hide',
        selector: '[data-testid="popular-communities"]',
        description: 'Popular communities',
        anchors: { testId: 'popular-communities' }
      }
    ]
  }
};

window.ruleEngine = new RuleEngine();
window.sitePresets = SITE_PRESETS;