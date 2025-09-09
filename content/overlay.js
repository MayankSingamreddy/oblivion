// On-page micro-toolbar and selection overlay
class OverlayManager {
  constructor(ruleEngine, memoryEngine) {
    this.ruleEngine = ruleEngine;
    this.memoryEngine = memoryEngine;
    this.isSelectionMode = false;
    this.toolbar = null;
    this.selectedElement = null;
    this.undoStack = [];
    
    this.setupEventListeners();
  }

  setupEventListeners() {
    // Listen for ESC key to exit selection mode
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isSelectionMode) {
        this.exitSelectionMode();
        e.preventDefault();
        e.stopPropagation();
      }
    });

    // Listen for messages from popup
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      switch (message.action) {
        case 'startTweakMode':
          this.enterSelectionMode();
          sendResponse({ success: true });
          break;
        case 'exitTweakMode':
          this.exitSelectionMode();
          sendResponse({ success: true });
          break;
        case 'undo':
          this.undo();
          sendResponse({ success: true });
          break;
      }
    });
  }

  enterSelectionMode() {
    if (this.isSelectionMode) return;
    
    this.isSelectionMode = true;
    document.body.style.cursor = 'crosshair';
    
    // Create micro-toolbar
    this.createToolbar();
    
    // Add hover effects
    document.addEventListener('mouseover', this.handleHover);
    document.addEventListener('mouseout', this.handleMouseOut);
    document.addEventListener('click', this.handleClick);
    
    // Notify popup of state change
    chrome.runtime.sendMessage({
      action: 'tweakModeActive',
      active: true
    });
  }

  exitSelectionMode() {
    if (!this.isSelectionMode) return;
    
    this.isSelectionMode = false;
    document.body.style.cursor = '';
    
    // Remove event listeners
    document.removeEventListener('mouseover', this.handleHover);
    document.removeEventListener('mouseout', this.handleMouseOut);  
    document.removeEventListener('click', this.handleClick);
    
    // Remove highlights and toolbar
    this.clearHighlights();
    this.removeToolbar();
    
    // Notify popup
    chrome.runtime.sendMessage({
      action: 'tweakModeActive',
      active: false
    });
  }

  createToolbar() {
    if (this.toolbar) return;
    
    this.toolbar = document.createElement('div');
    this.toolbar.setAttribute('data-erpro', 'toolbar');
    this.toolbar.innerHTML = `
      <div class="erpro-toolbar">
        <button class="erpro-btn" data-action="select">+ Select</button>
        <button class="erpro-btn" data-action="undo">Undo</button>
        <button class="erpro-btn" data-action="done">Done</button>
      </div>
    `;
    
    // Add event listeners to toolbar buttons
    this.toolbar.addEventListener('click', (e) => {
      const action = e.target.getAttribute('data-action');
      switch (action) {
        case 'undo':
          this.undo();
          break;
        case 'done':
          this.exitSelectionMode();
          break;
      }
    });
    
    document.body.appendChild(this.toolbar);
    
    // Make toolbar draggable
    this.makeToolbarDraggable();
  }

  makeToolbarDraggable() {
    let isDragging = false;
    let startX, startY, startLeft, startTop;
    
    const toolbar = this.toolbar.querySelector('.erpro-toolbar');
    
    toolbar.addEventListener('mousedown', (e) => {
      if (e.target.tagName === 'BUTTON') return;
      
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      
      const rect = toolbar.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;
      
      toolbar.style.cursor = 'grabbing';
    });
    
    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;
      
      toolbar.style.left = (startLeft + deltaX) + 'px';
      toolbar.style.top = (startTop + deltaY) + 'px';
      toolbar.style.position = 'fixed';
    });
    
    document.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        toolbar.style.cursor = 'grab';
      }
    });
  }

  removeToolbar() {
    if (this.toolbar) {
      this.toolbar.remove();
      this.toolbar = null;
    }
  }

  handleHover = (e) => {
    if (!this.isSelectionMode) return;
    if (e.target.hasAttribute('data-erpro')) return; // Skip our UI
    
    this.clearHighlights();
    this.highlightElement(e.target);
    this.selectedElement = e.target;
  }

  handleMouseOut = (e) => {
    if (!this.isSelectionMode) return;
    // Keep highlights until mouse enters another element
  }

  handleClick = async (e) => {
    if (!this.isSelectionMode) return;
    if (e.target.hasAttribute('data-erpro')) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const element = this.selectedElement || e.target;
    await this.hideElementAndSave(element);
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

  async hideElementAndSave(element) {
    const selectorInfo = this.ruleEngine.generateStableSelector(element);
    
    const rule = {
      type: 'hide',
      selector: selectorInfo.selector,
      description: this.generateDescription(element),
      anchors: selectorInfo.anchors
    };

    // Validate rule
    if (!this.ruleEngine.validateRule(rule)) {
      this.showToast('Cannot hide this element - it would affect too many elements', 'error');
      return;
    }

    // Apply the rule
    const appliedCount = this.ruleEngine.applyRule(rule);
    
    if (appliedCount > 0) {
      // Save to memory
      const host = location.hostname;
      const path = this.getPathPattern(location.pathname);
      
      await this.memoryEngine.saveRule(host, path, rule);
      
      // Add to undo stack
      this.undoStack.push(rule);
      
      // Show ghost toast
      this.showGhostToast(element, rule.description);
      
      // Notify popup of change
      chrome.runtime.sendMessage({
        action: 'elementHidden',
        rule: rule,
        count: appliedCount
      });
    }
  }

  generateDescription(element) {
    // Try to generate a human-readable description
    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel;
    
    const title = element.getAttribute('title');
    if (title) return title;
    
    const text = element.textContent?.trim();
    if (text && text.length < 50) return text;
    
    const role = element.getAttribute('role');
    if (role) return `${role} element`;
    
    return `${element.tagName.toLowerCase()} element`;
  }

  getPathPattern(path) {
    // Simplify path to pattern (e.g., /user/123 -> /user/*)
    return path.replace(/\/\d+/g, '/*').replace(/\/[a-f0-9-]{32,}/g, '/*');
  }

  showGhostToast(element, description) {
    const toast = document.createElement('div');
    toast.setAttribute('data-erpro', 'toast');
    toast.innerHTML = `
      <div class="erpro-ghost-toast">
        Hidden: ${description}
        <button class="erpro-unhide-btn">Unhide</button>
      </div>
    `;
    
    // Position near the hidden element
    const rect = element.getBoundingClientRect();
    toast.style.position = 'fixed';
    toast.style.left = rect.left + 'px';
    toast.style.top = Math.max(10, rect.top - 40) + 'px';
    toast.style.zIndex = '10000';
    
    document.body.appendChild(toast);
    
    // Add unhide functionality
    toast.querySelector('.erpro-unhide-btn').addEventListener('click', () => {
      this.unhideLastElement();
      toast.remove();
    });
    
    // Auto-remove after 3 seconds
    setTimeout(() => {
      if (toast.parentNode) {
        toast.remove();
      }
    }, 3000);
  }

  showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.setAttribute('data-erpro', 'toast');
    toast.innerHTML = `
      <div class="erpro-toast erpro-toast-${type}">
        ${message}
      </div>
    `;
    
    toast.style.position = 'fixed';
    toast.style.top = '20px';
    toast.style.right = '20px';
    toast.style.zIndex = '10000';
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
      if (toast.parentNode) {
        toast.remove();
      }
    }, 3000);
  }

  undo() {
    if (this.undoStack.length === 0) {
      this.showToast('Nothing to undo', 'info');
      return;
    }
    
    const lastRule = this.undoStack.pop();
    this.ruleEngine.undoRule(lastRule.selector);
    
    // Remove from memory
    const host = location.hostname;
    this.memoryEngine.removeRule(host, lastRule.selector);
    
    this.showToast('Undone', 'success');
    
    // Notify popup
    chrome.runtime.sendMessage({
      action: 'ruleUndone',
      rule: lastRule
    });
  }

  unhideLastElement() {
    if (this.undoStack.length === 0) return;
    
    const lastRule = this.undoStack.pop();
    this.ruleEngine.undoRule(lastRule.selector);
    
    // Remove from memory
    const host = location.hostname;
    this.memoryEngine.removeRule(host, lastRule.selector);
  }
}

window.OverlayManager = OverlayManager;