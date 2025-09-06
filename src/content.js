// Content script - main coordinator
// Dependencies are loaded by manifest.json in correct order

class CleanView {
  constructor() {
    this.historyStack = [];
    this.isPreviewMode = false;
    this.previewOverlays = [];
    this.mutationObserver = null;
    this.setupMessageListener();
    this.setupMutationObserver();
  }

  setupMessageListener() {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      switch (request.action) {
        case 'ping':
          sendResponse({ ready: true });
          return true;
        case 'parseAndPreview':
          this.handleParseAndPreview(request.prompt, request.useLLM);
          break;
        case 'applyChanges':
          this.handleApplyChanges(request.selectors, request.destructive);
          break;
        case 'undo':
          this.handleUndo();
          break;
        case 'reset':
          this.handleReset();
          break;
        case 'autoApplyRules':
          this.handleAutoApplyRules(request.rules);
          break;
      }
      return true;
    });
  }

  setupMutationObserver() {
    // Watch for SPA route changes
    this.mutationObserver = new MutationObserver((mutations) => {
      let shouldReapply = false;
      
      mutations.forEach((mutation) => {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          // Check if significant content was added
          const hasSignificantChanges = Array.from(mutation.addedNodes).some(node => 
            node.nodeType === Node.ELEMENT_NODE && 
            (node.children.length > 5 || node.textContent.length > 100)
          );
          
          if (hasSignificantChanges) {
            shouldReapply = true;
          }
        }
      });
      
      if (shouldReapply) {
        // Debounce reapplication
        clearTimeout(this.reapplyTimeout);
        this.reapplyTimeout = setTimeout(() => {
          this.reapplyActiveRules();
        }, 500);
      }
    });
    
    this.mutationObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  async handleParseAndPreview(prompt, useLLM = false) {
    try {
      // Parse natural language
      const parsed = window.nlpParser.parseCommand(prompt);
      
      // Find target elements (now async)
      const targets = await window.selectorEngine.findTargets(parsed, useLLM);
      
      // Show preview
      this.showPreview(targets);
      
      // Send results back to popup
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

  showPreview(targets) {
    this.clearPreview();
    this.isPreviewMode = true;
    
    targets.forEach((target, index) => {
      target.elements.forEach(element => {
        const overlay = this.createPreviewOverlay(element, index);
        this.previewOverlays.push(overlay);
        document.body.appendChild(overlay);
      });
    });
  }

  createPreviewOverlay(element, colorIndex) {
    const rect = element.getBoundingClientRect();
    const overlay = document.createElement('div');
    
    const colors = ['#ff4444', '#44ff44', '#4444ff', '#ffff44', '#ff44ff'];
    const color = colors[colorIndex % colors.length];
    
    overlay.style.cssText = `
      position: fixed;
      top: ${rect.top + window.scrollY}px;
      left: ${rect.left + window.scrollX}px;
      width: ${rect.width}px;
      height: ${rect.height}px;
      background: ${color}33;
      border: 2px solid ${color};
      pointer-events: none;
      z-index: 999999;
      box-sizing: border-box;
    `;
    
    overlay.setAttribute('data-cleanview-preview', 'true');
    return overlay;
  }

  clearPreview() {
    this.previewOverlays.forEach(overlay => overlay.remove());
    this.previewOverlays = [];
    this.isPreviewMode = false;
  }

  handleApplyChanges(selectors, destructive = false) {
    console.log('CleanView: handleApplyChanges called with:', { selectors, destructive });
    this.clearPreview();
    
    const elements = [];
    selectors.forEach(selectorInfo => {
      console.log('CleanView: Processing selector:', selectorInfo.selector);
      
      // Check if selector is too broad (matches too many elements)
      const testNodes = document.querySelectorAll(selectorInfo.selector);
      console.log('CleanView: Found', testNodes.length, 'elements for selector:', selectorInfo.selector);
      
      // If selector matches too many elements, it's probably too broad
      if (testNodes.length > 50) {
        console.warn('CleanView: Selector matches too many elements, skipping:', selectorInfo.selector);
        return;
      }
      
      elements.push(...testNodes);
    });
    
    console.log('CleanView: Total elements to modify:', elements.length);
    
    if (elements.length === 0) {
      console.log('CleanView: No elements found to modify');
      chrome.runtime.sendMessage({
        action: 'error',
        message: 'No elements found to modify'
      });
      return;
    }
    
    // Additional safety check - don't hide too many elements
    if (elements.length > 100) {
      console.warn('CleanView: Too many elements to hide, aborting for safety');
      chrome.runtime.sendMessage({
        action: 'error',
        message: 'Too many elements would be hidden. Please be more specific.'
      });
      return;
    }
    
    // Apply changes
    console.log('CleanView: Applying changes to', elements.length, 'elements');
    const changeRecord = window.injector.applyChanges(elements, destructive);
    this.historyStack.push(changeRecord);
    
    console.log('CleanView: Changes applied successfully');
    chrome.runtime.sendMessage({
      action: 'changesApplied',
      count: elements.length
    });
  }

  handleUndo() {
    if (this.historyStack.length === 0) return;
    
    const lastChange = this.historyStack.pop();
    window.injector.undoChanges(lastChange);
    
    chrome.runtime.sendMessage({
      action: 'undoCompleted'
    });
  }

  handleReset() {
    // Clear all changes
    this.historyStack.forEach(change => {
      window.injector.undoChanges(change);
    });
    this.historyStack = [];
    this.clearPreview();
    
    chrome.runtime.sendMessage({
      action: 'resetCompleted'
    });
  }

  async handleAutoApplyRules(rules) {
    for (const rule of rules) {
      try {
        const elements = [];
        rule.compiledSelectors.forEach(selector => {
          const nodes = document.querySelectorAll(selector);
          elements.push(...nodes);
        });
        
        if (elements.length > 0) {
          const changeRecord = window.injector.applyChanges(elements, rule.destructive);
          this.historyStack.push(changeRecord);
        }
      } catch (error) {
        console.error('Error auto-applying rule:', error);
      }
    }
  }

  reapplyActiveRules() {
    // Get current hostname and reapply rules
    const hostname = window.location.hostname;
    chrome.storage.local.get([hostname]).then(result => {
      const rules = result[hostname];
      if (rules && rules.length > 0) {
        this.handleAutoApplyRules(rules);
      }
    });
  }
}

// Initialize when DOM is ready
function initializeCleanView() {
  try {
    console.log('CleanView: Initializing content script...');
    
    // Check if dependencies are loaded
    if (typeof window.nlpParser === 'undefined') {
      console.error('CleanView: nlpParser not found');
      return;
    }
    if (typeof window.selectorEngine === 'undefined') {
      console.error('CleanView: selectorEngine not found');
      return;
    }
    if (typeof window.injector === 'undefined') {
      console.error('CleanView: injector not found');
      return;
    }
    
    window.cleanView = new CleanView();
    console.log('CleanView: Content script initialized successfully');
  } catch (error) {
    console.error('CleanView: Error initializing content script:', error);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeCleanView);
} else {
  initializeCleanView();
}
