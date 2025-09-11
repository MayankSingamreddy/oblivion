class ElementRemover {
  constructor() {
    this.history = [];
    this.isManualSelectionMode = false;
    this.hoveredElement = null;
    this.previewOverlays = [];
    this.isPreviewMode = false;
    this.previewTargets = [];
    this.selectedElements = new Set(); // Track which elements are selected for removal
    this.isPageReset = false; // Track if page is in reset state
    this.savedHistory = []; // Store history when page is reset
    
    this.setupMessageListener();
    this.setupKeyboardListener();
    console.log('Element Remover Pro: Content script initialized');
  }

  setupMessageListener() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      switch (request.action) {
        case 'parseAndPreview':
          this.handleParseAndPreview(request.prompt);
          break;
        case 'applyChanges':
          this.handleApplyChanges(request.targets);
          break;
        case 'clearPreview':
          this.clearPreview();
          break;
        case 'getPreviewState':
          sendResponse({ 
            isPreviewMode: this.isPreviewMode, 
            selectedCount: this.selectedElements.size,
            totalCount: this.previewTargets.reduce((sum, target) => sum + target.elements.length, 0)
          });
          break;
        case 'getManualState':
          sendResponse({ 
            isManualSelectionMode: this.isManualSelectionMode,
            removedCount: this.history.length
          });
          break;
        case 'getResetState':
          sendResponse({ 
            isPageReset: this.isPageReset,
            hasHistory: this.history.length > 0 || this.savedHistory.length > 0
          });
          break;
        case 'toggleSelection':
          this.handleToggleSelection();
          sendResponse({ active: this.isManualSelectionMode });
          break;
        case 'disableSelection':
          this.disableManualSelection();
          break;
        case 'undo':
          this.handleUndo();
          break;
        case 'reset':
          this.handleReset();
          break;
      }
      return true;
    });
  }

  setupKeyboardListener() {
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.isManualSelectionMode) {
        this.disableManualSelection();
        chrome.runtime.sendMessage({
          action: 'selectionToggled',
          active: false
        });
      }
    });
  }

  // Natural Language Processing and Preview
  async handleParseAndPreview(prompt) {
    try {
      let targets = [];
      
      // First try AI-powered detection
      if (window.aiService) {
        try {
          console.log('Element Remover Pro: Trying AI-powered detection...');
          targets = await window.aiService.generateSelectors(prompt);
          console.log('Element Remover Pro: AI detection successful', targets);
        } catch (error) {
          console.log('Element Remover Pro: AI detection failed, falling back to patterns:', error.message);
          
          // Check if fallback is enabled
          const settings = await chrome.storage.local.get({ enableFallback: true });
          if (!settings.enableFallback) {
            throw error; // Don't fall back if disabled
          }
        }
      }
      
      // Fallback to pattern-based detection if AI failed or no targets found
      if (targets.length === 0) {
        console.log('Element Remover Pro: Using pattern-based detection');
        targets = this.parseNaturalLanguage(prompt);
      }
      
      this.previewTargets = targets;
      
      // Initially select all elements
      this.selectedElements.clear();
      targets.forEach(target => {
        target.elements.forEach(el => this.selectedElements.add(el));
      });
      
      this.showPreview(targets);
      
      chrome.runtime.sendMessage({
        action: 'previewResults',
        targets: targets.map(t => ({
          selector: t.selector,
          count: t.elements.length,
          description: t.description
        }))
      });
    } catch (error) {
      console.error('Error in parseAndPreview:', error);
      chrome.runtime.sendMessage({
        action: 'error',
        message: error.message
      });
    }
  }

  parseNaturalLanguage(prompt) {
    const lowerPrompt = prompt.toLowerCase().trim();
    const targets = [];
    
    // Define common element patterns with better selectors
    const patterns = {
      'ads|advertisement|sponsored': {
        selectors: [
          '[id*="ad" i]', '[class*="ad" i]',
          '[id*="advertisement" i]', '[class*="advertisement" i]',
          '[id*="sponsor" i]', '[class*="sponsor" i]',
          '[data-testid*="ad" i]',
          'div[style*="display"][style*="block"] img[src*="ad"]'
        ],
        description: 'Advertisements and sponsored content'
      },
      'sidebar|side bar|side panel': {
        selectors: [
          'aside', '[role="complementary"]',
          '[id*="sidebar" i]', '[class*="sidebar" i]',
          '[id*="side" i]', '[class*="side" i]'
        ],
        description: 'Sidebars and side panels'
      },
      'nav|navigation|menu': {
        selectors: [
          'nav', '[role="navigation"]',
          '[id*="nav" i]', '[class*="nav" i]',
          '[id*="menu" i]', '[class*="menu" i]'
        ],
        description: 'Navigation and menus'
      },
      'header|top bar': {
        selectors: [
          'header', '[role="banner"]',
          '[id*="header" i]', '[class*="header" i]',
          '[id*="top" i]', '[class*="top" i]'
        ],
        description: 'Headers and top bars'
      },
      'footer|bottom': {
        selectors: [
          'footer', '[role="contentinfo"]',
          '[id*="footer" i]', '[class*="footer" i]',
          '[id*="bottom" i]', '[class*="bottom" i]'
        ],
        description: 'Footers and bottom content'
      },
      'popup|modal|dialog|overlay': {
        selectors: [
          '[role="dialog"]', '[role="alertdialog"]',
          '[id*="popup" i]', '[class*="popup" i]',
          '[id*="modal" i]', '[class*="modal" i]',
          '[id*="overlay" i]', '[class*="overlay" i]',
          '.modal-backdrop', '.overlay'
        ],
        description: 'Popups, modals, and overlays'
      },
      'comment|comments': {
        selectors: [
          '[id*="comment" i]', '[class*="comment" i]',
          '[data-testid*="comment" i]'
        ],
        description: 'Comments section'
      },
      'social|share|sharing': {
        selectors: [
          '[id*="social" i]', '[class*="social" i]',
          '[id*="share" i]', '[class*="share" i]',
          '[data-testid*="share" i]'
        ],
        description: 'Social sharing buttons'
      }
    };

    // Find matching patterns
    for (const [pattern, config] of Object.entries(patterns)) {
      const regex = new RegExp(pattern, 'i');
      if (regex.test(lowerPrompt)) {
        const elements = this.findElementsBySelectors(config.selectors);
        if (elements.length > 0) {
          targets.push({
            selector: config.selectors.join(', '),
            elements: elements,
            description: config.description
          });
        }
      }
    }

    // If no patterns match, try a more generic approach
    if (targets.length === 0) {
      // Extract potential keywords
      const words = lowerPrompt.split(/\s+/).filter(word => word.length > 2);
      for (const word of words) {
        const elements = this.findElementsByKeyword(word);
        if (elements.length > 0 && elements.length < 50) { // Avoid too broad selections
          targets.push({
            selector: `[id*="${word}" i], [class*="${word}" i]`,
            elements: elements,
            description: `Elements containing "${word}"`
          });
        }
      }
    }

    return targets;
  }

  findElementsBySelectors(selectors) {
    const elements = new Set();
    selectors.forEach(selector => {
      try {
        const found = document.querySelectorAll(selector);
        found.forEach(el => {
          if (this.isElementVisible(el)) {
            elements.add(el);
          }
        });
      } catch (e) {
        // Skip invalid selectors
      }
    });
    return Array.from(elements);
  }

  findElementsByKeyword(keyword) {
    const elements = [];
    const selectors = [
      `[id*="${keyword}" i]`,
      `[class*="${keyword}" i]`,
      `[data-testid*="${keyword}" i]`
    ];
    
    selectors.forEach(selector => {
      try {
        const found = document.querySelectorAll(selector);
        found.forEach(el => {
          if (this.isElementVisible(el) && !elements.includes(el)) {
            elements.push(el);
          }
        });
      } catch (e) {
        // Skip invalid selectors
      }
    });
    
    return elements;
  }

  isElementVisible(element) {
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    
    return (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.opacity !== '0' &&
      rect.width > 0 &&
      rect.height > 0
    );
  }

  showPreview(targets) {
    this.clearPreview();
    this.isPreviewMode = true;
    
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];
    
    targets.forEach((target, index) => {
      const color = colors[index % colors.length];
      target.elements.forEach(element => {
        const overlay = this.createPreviewOverlay(element, color, target.description);
        this.previewOverlays.push(overlay);
        document.body.appendChild(overlay);
      });
    });
  }

  toggleElementSelection(element) {
    if (this.selectedElements.has(element)) {
      this.selectedElements.delete(element);
    } else {
      this.selectedElements.add(element);
    }
    
    // Update the visual state of the overlay
    const overlay = this.previewOverlays.find(o => o.dataset.targetElement === this.getElementId(element));
    if (overlay) {
      this.updateOverlayVisualState(overlay, element);
    }
    
    // Notify popup of state change
    chrome.runtime.sendMessage({
      action: 'selectionChanged',
      selectedCount: this.selectedElements.size,
      totalCount: this.previewTargets.reduce((sum, target) => sum + target.elements.length, 0)
    });
  }

  getElementId(element) {
    // Create a unique identifier for the element
    if (!element._elementRemoverId) {
      element._elementRemoverId = 'er-' + Math.random().toString(36).substr(2, 9);
    }
    return element._elementRemoverId;
  }

  createPreviewOverlay(element, color, description) {
    const rect = element.getBoundingClientRect();
    const overlay = document.createElement('div');
    const elementId = this.getElementId(element);
    
    overlay.style.cssText = `
      position: fixed;
      top: ${rect.top + window.scrollY}px;
      left: ${rect.left + window.scrollX}px;
      width: ${rect.width}px;
      height: ${rect.height}px;
      background: ${color}33;
      border: 2px solid ${color};
      pointer-events: all;
      z-index: 999999;
      box-sizing: border-box;
      cursor: pointer;
      transition: all 0.2s ease;
    `;
    
    overlay.setAttribute('data-element-remover-preview', 'true');
    overlay.setAttribute('data-target-element', elementId);
    overlay.setAttribute('data-description', description);
    
    // Add click handler to toggle selection
    overlay.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.toggleElementSelection(element);
    });
    
    // Add hover effect
    overlay.addEventListener('mouseenter', () => {
      overlay.style.boxShadow = `0 0 20px ${color}66`;
    });
    
    overlay.addEventListener('mouseleave', () => {
      overlay.style.boxShadow = 'none';
    });
    
    // Create tooltip
    this.addTooltipToOverlay(overlay, element, description);
    
    // Set initial visual state
    this.updateOverlayVisualState(overlay, element);
    
    return overlay;
  }

  addTooltipToOverlay(overlay, element, description) {
    const tooltip = document.createElement('div');
    const isSelected = this.selectedElements.has(element);
    
    tooltip.style.cssText = `
      position: absolute;
      top: -35px;
      left: 0;
      background: #1f2937;
      color: white;
      padding: 6px 10px;
      border-radius: 6px;
      font-size: 12px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      white-space: nowrap;
      z-index: 1000000;
      pointer-events: none;
      opacity: 0;
      transform: translateY(-5px);
      transition: all 0.2s ease;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    `;
    
    tooltip.textContent = isSelected ? `Click to unselect: ${description}` : `Click to select: ${description}`;
    overlay.appendChild(tooltip);
    
    // Show tooltip on hover
    overlay.addEventListener('mouseenter', () => {
      tooltip.style.opacity = '1';
      tooltip.style.transform = 'translateY(0)';
    });
    
    overlay.addEventListener('mouseleave', () => {
      tooltip.style.opacity = '0';
      tooltip.style.transform = 'translateY(-5px)';
    });
  }

  updateOverlayVisualState(overlay, element) {
    const isSelected = this.selectedElements.has(element);
    const tooltip = overlay.querySelector('div');
    
    if (isSelected) {
      overlay.style.opacity = '1';
      overlay.style.filter = 'none';
      if (tooltip) {
        const description = overlay.getAttribute('data-description');
        tooltip.textContent = `Click to unselect: ${description}`;
      }
    } else {
      overlay.style.opacity = '0.4';
      overlay.style.filter = 'grayscale(70%)';
      if (tooltip) {
        const description = overlay.getAttribute('data-description');
        tooltip.textContent = `Click to select: ${description}`;
      }
    }
  }

  clearPreview() {
    this.previewOverlays.forEach(overlay => overlay.remove());
    this.previewOverlays = [];
    this.previewTargets = [];
    this.selectedElements.clear();
    this.isPreviewMode = false;
  }

  // Apply Changes
  handleApplyChanges(targets) {
    // Only apply changes to selected elements
    const elementsToRemove = Array.from(this.selectedElements);
    this.clearPreview();
    
    if (elementsToRemove.length === 0) {
      chrome.runtime.sendMessage({
        action: 'error',
        message: 'No elements found to remove'
      });
      return;
    }

    // Safety check
    if (elementsToRemove.length > 100) {
      chrome.runtime.sendMessage({
        action: 'error',
        message: 'Too many elements selected. Please be more specific.'
      });
      return;
    }

    // Store for undo
    const historyItem = {
      timestamp: Date.now(),
      elements: elementsToRemove.map(el => ({
        element: el,
        originalDisplay: el.style.display,
        originalVisibility: el.style.visibility,
        parent: el.parentNode,
        nextSibling: el.nextSibling
      }))
    };

    // Hide elements (non-destructive)
    elementsToRemove.forEach(el => {
      el.style.display = 'none';
    });

    this.history.push(historyItem);
    
    // If we were in reset state, we're no longer in original state
    if (this.isPageReset) {
      this.isPageReset = false;
      chrome.runtime.sendMessage({
        action: 'resetStateChanged',
        isPageReset: false
      });
    }
    
    chrome.runtime.sendMessage({
      action: 'changesApplied',
      count: elementsToRemove.length
    });
  }

  // Manual Selection Mode
  handleToggleSelection() {
    if (this.isManualSelectionMode) {
      this.disableManualSelection();
    } else {
      this.enableManualSelection();
    }
    
    chrome.runtime.sendMessage({
      action: 'selectionToggled',
      active: this.isManualSelectionMode
    });
  }

  enableManualSelection() {
    this.isManualSelectionMode = true;
    document.body.style.cursor = 'crosshair';
    document.addEventListener('mouseover', this.handleMouseOver.bind(this));
    document.addEventListener('mouseout', this.handleMouseOut.bind(this));
    document.addEventListener('click', this.handleClick.bind(this), true);
  }

  disableManualSelection() {
    this.isManualSelectionMode = false;
    document.body.style.cursor = 'default';
    document.removeEventListener('mouseover', this.handleMouseOver.bind(this));
    document.removeEventListener('mouseout', this.handleMouseOut.bind(this));
    document.removeEventListener('click', this.handleClick.bind(this), true);
    
    if (this.hoveredElement) {
      this.hoveredElement.classList.remove('element-remover-highlight');
      this.hoveredElement = null;
    }
  }

  handleMouseOver(event) {
    if (!this.isManualSelectionMode) return;
    
    if (this.hoveredElement) {
      this.hoveredElement.classList.remove('element-remover-highlight');
    }
    
    this.hoveredElement = event.target;
    this.hoveredElement.classList.add('element-remover-highlight');
  }

  handleMouseOut(event) {
    if (!this.isManualSelectionMode) return;
    
    if (event.target === this.hoveredElement) {
      event.target.classList.remove('element-remover-highlight');
    }
  }

  handleClick(event) {
    if (!this.isManualSelectionMode) return;
    
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    
    const elementToRemove = event.target;
    
    // Don't remove if it's already hidden or if it's one of our preview overlays
    if (elementToRemove.hasAttribute('data-element-remover-preview') || 
        elementToRemove.style.display === 'none') {
      return;
    }
    
    // Store for undo
    const historyItem = {
      timestamp: Date.now(),
      elements: [{
        element: elementToRemove,
        originalDisplay: elementToRemove.style.display,
        originalVisibility: elementToRemove.style.visibility,
        parent: elementToRemove.parentNode,
        nextSibling: elementToRemove.nextSibling
      }]
    };

    // Hide the element
    elementToRemove.style.display = 'none';
    this.history.push(historyItem);
    
    // If we were in reset state, we're no longer in original state
    if (this.isPageReset) {
      this.isPageReset = false;
      chrome.runtime.sendMessage({
        action: 'resetStateChanged',
        isPageReset: false
      });
    }
    
    // Remove highlight from this element if it exists
    if (this.hoveredElement === elementToRemove) {
      this.hoveredElement = null;
    }
    
    // Stay in manual selection mode - don't disable it
    chrome.runtime.sendMessage({
      action: 'elementRemoved',
      elementInfo: {
        tagName: elementToRemove.tagName.toLowerCase(),
        className: elementToRemove.className,
        id: elementToRemove.id
      }
    });
  }

  // Undo/Reset functionality
  handleUndo() {
    if (this.history.length === 0) {
      chrome.runtime.sendMessage({
        action: 'error',
        message: 'Nothing to undo'
      });
      return;
    }
    
    const lastChange = this.history.pop();
    lastChange.elements.forEach(item => {
      if (item.element && item.element.parentNode) {
        item.element.style.display = item.originalDisplay;
        item.element.style.visibility = item.originalVisibility;
      }
    });
    
    chrome.runtime.sendMessage({
      action: 'undoCompleted'
    });
  }

  handleReset() {
    if (!this.isPageReset) {
      // First reset - restore all elements and save history
      this.history.forEach(change => {
        change.elements.forEach(item => {
          if (item.element && item.element.parentNode) {
            item.element.style.display = item.originalDisplay;
            item.element.style.visibility = item.originalVisibility;
          }
        });
      });
      
      // Save the history before clearing it
      this.savedHistory = [...this.history];
      this.history = [];
      this.isPageReset = true;
      
      chrome.runtime.sendMessage({
        action: 'resetCompleted',
        resetState: 'original'
      });
    } else {
      // Second reset - re-apply all previous changes
      this.savedHistory.forEach(change => {
        change.elements.forEach(item => {
          if (item.element && item.element.parentNode) {
            item.element.style.display = 'none';
          }
        });
      });
      
      // Restore the history
      this.history = [...this.savedHistory];
      this.isPageReset = false;
      
      chrome.runtime.sendMessage({
        action: 'resetCompleted',
        resetState: 'modified'
      });
    }
    
    this.clearPreview();
    
    if (this.isManualSelectionMode) {
      this.disableManualSelection();
    }
  }
}

// Initialize when DOM is ready
function initializeElementRemover() {
  if (window.elementRemover) {
    return; // Already initialized
  }
  
  try {
    window.elementRemover = new ElementRemover();
  } catch (error) {
    console.error('Element Remover Pro: Error initializing:', error);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeElementRemover);
} else {
  initializeElementRemover();
}