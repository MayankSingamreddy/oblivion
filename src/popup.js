// Popup UI controller
class PopupController {
  constructor() {
    this.currentTab = null;
    this.isPreviewMode = false;
    this.currentTargets = []; // Store the current preview targets
    this.cooldownInterval = null;
    this.initializeElements();
    this.setupEventListeners();
    this.getCurrentTab();
    this.startCooldownTimer();
  }
  
    initializeElements() {
      this.promptInput = document.getElementById('promptInput');
      this.previewBtn = document.getElementById('previewBtn');
      this.applyBtn = document.getElementById('applyBtn');
      this.undoBtn = document.getElementById('undoBtn');
      this.resetBtn = document.getElementById('resetBtn');
      this.saveRuleBtn = document.getElementById('saveRuleBtn');
      this.destructiveToggle = document.getElementById('destructiveToggle');
      this.resultsSection = document.getElementById('resultsSection');
      this.targetsList = document.getElementById('targetsList');
      this.statusMessage = document.getElementById('statusMessage');
    }
  
    setupEventListeners() {
      this.previewBtn.addEventListener('click', () => this.handlePreview());
      this.applyBtn.addEventListener('click', () => this.handleApply());
      this.undoBtn.addEventListener('click', () => this.handleUndo());
      this.resetBtn.addEventListener('click', () => this.handleReset());
      this.saveRuleBtn.addEventListener('click', () => this.handleSaveRule());
      
      this.promptInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          if (e.ctrlKey || e.metaKey) {
            this.handleApply();
          } else {
            this.handlePreview();
          }
        }
      });
  
      // Listen for messages from content script
      chrome.runtime.onMessage.addListener((message) => {
        switch (message.action) {
          case 'previewResults':
            this.showPreviewResults(message.targets);
            break;
          case 'changesApplied':
            this.showStatus(`Applied changes to ${message.count} elements`, 'success');
            break;
          case 'undoCompleted':
            this.showStatus('Undo completed', 'info');
            break;
          case 'resetCompleted':
            this.showStatus('Page reset', 'info');
            break;
          case 'error':
            this.showStatus(message.message, 'error');
            break;
        }
      });
    }
  
    async getCurrentTab() {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        this.currentTab = tab;
        
        // Validate tab URL
        if (!this.isValidWebPage(tab.url)) {
          this.showStatus('This extension only works on web pages (not chrome:// or extension pages)', 'error');
          this.disableControls();
          return;
        }
      } catch (error) {
        console.error('Error getting current tab:', error);
        this.showStatus('Error accessing current tab', 'error');
        this.disableControls();
      }
    }

    isValidWebPage(url) {
      if (!url) return false;
      
      // Allow http and https pages
      if (url.startsWith('http://') || url.startsWith('https://')) {
        return true;
      }
      
      // Block chrome://, extension://, and other special pages
      if (url.startsWith('chrome://') || 
          url.startsWith('chrome-extension://') || 
          url.startsWith('moz-extension://') ||
          url.startsWith('edge://') ||
          url.startsWith('about:')) {
        return false;
      }
      
      return false;
    }

    disableControls() {
      this.previewBtn.disabled = true;
      this.applyBtn.disabled = true;
      this.undoBtn.disabled = true;
      this.resetBtn.disabled = true;
      this.saveRuleBtn.disabled = true;
    }

    enableControls() {
      this.previewBtn.disabled = false;
      this.applyBtn.disabled = false;
      this.undoBtn.disabled = false;
      this.resetBtn.disabled = false;
      this.saveRuleBtn.disabled = false;
    }
  
    async handlePreview() {
      const prompt = this.promptInput.value.trim();
      if (!prompt) {
        this.showStatus('Please enter a command', 'error');
        return;
      }

      if (!this.currentTab || !this.isValidWebPage(this.currentTab.url)) {
        this.showStatus('This extension only works on web pages (not chrome:// or extension pages)', 'error');
        return;
      }

      // Check if we're in cooldown period
      const lastRequest = localStorage.getItem('cleanview_last_request');
      const now = Date.now();
      if (lastRequest && (now - parseInt(lastRequest)) < 20000) {
        const remaining = Math.ceil((20000 - (now - parseInt(lastRequest))) / 1000);
        this.showStatus(`⏳ Please wait ${remaining}s before next AI request`, 'error');
        return;
      }
      
      localStorage.setItem('cleanview_last_request', now.toString());
      this.showStatus('🤖 AI analyzing page...', 'info');
      
      try {
        // First, check if content script is ready
        const isReady = await this.checkContentScriptReady();
        if (!isReady) {
          // Try to inject content script as fallback
          const injected = await this.tryInjectContentScript();
          if (!injected) {
            this.showStatus('Content script not ready. Please refresh the page and try again.', 'error');
            return;
          }
        }

        await this.sendMessageWithRetry({
          action: 'parseAndPreview',
          prompt: prompt,
          useLLM: true // Always use LLM
        });
      } catch (error) {
        console.error('Error in handlePreview:', error);
        if (error.message && error.message.includes('Could not establish connection')) {
          this.showStatus('Content script not loaded. Please refresh the page and try again.', 'error');
        } else {
          this.showStatus('Error: Make sure you\'re on a valid webpage', 'error');
        }
      }
    }

    async checkContentScriptReady() {
      const maxRetries = 5;
      const retryDelay = 1000; // milliseconds
      
      for (let i = 0; i < maxRetries; i++) {
        try {
          // Send a ping message to check if content script is ready
          const response = await chrome.tabs.sendMessage(this.currentTab.id, {
            action: 'ping'
          });
          if (response && response.ready === true) {
            console.log('CleanView: Content script is ready');
            return true;
          }
        } catch (error) {
          console.log(`CleanView: Content script check attempt ${i + 1} failed:`, error.message);
          if (i === maxRetries - 1) {
            console.error('CleanView: Content script not ready after all retries');
            return false;
          }
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      }
      return false;
    }

    async sendMessageWithRetry(message, maxRetries = 3) {
      const retryDelay = 500; // milliseconds
      
      for (let i = 0; i < maxRetries; i++) {
        try {
          return await chrome.tabs.sendMessage(this.currentTab.id, message);
        } catch (error) {
          if (i === maxRetries - 1) {
            throw error;
          }
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      }
    }

    async tryInjectContentScript() {
      try {
        console.log('CleanView: Attempting to inject content script...');
        
        // Inject the content scripts manually
        await chrome.scripting.executeScript({
          target: { tabId: this.currentTab.id },
          files: [
            'src/nlp.js',
            'src/selectorEngine.js',
            'src/injector.js',
            'src/content.js'
          ]
        });
        
        // Wait a bit for the script to initialize
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Check if it's ready now
        const isReady = await this.checkContentScriptReady();
        if (isReady) {
          console.log('CleanView: Content script injected successfully');
          return true;
        }
        
        return false;
      } catch (error) {
        console.error('CleanView: Error injecting content script:', error);
        return false;
      }
    }
  
  async handleApply() {
    if (!this.isPreviewMode) {
      await this.handlePreview();
      return;
    }

    if (!this.currentTab || !this.isValidWebPage(this.currentTab.url)) {
      this.showStatus('This extension only works on web pages', 'error');
      return;
    }

    if (!this.currentTargets || this.currentTargets.length === 0) {
      this.showStatus('No targets to apply. Please preview first.', 'error');
      return;
    }

    const destructive = this.destructiveToggle.checked;
    
    try {
      // Extract selectors from current targets
      const selectors = this.currentTargets.map(target => ({
        selector: target.selector,
        action: target.action,
        description: target.description
      }));

      console.log('CleanView: Applying changes with selectors:', selectors);
      
      await this.sendMessageWithRetry({
        action: 'applyChanges',
        selectors: selectors,
        destructive: destructive
      });
      
      this.hidePreviewResults();
    } catch (error) {
      console.error('Error in handleApply:', error);
      if (error.message && error.message.includes('Could not establish connection')) {
        this.showStatus('Content script not loaded. Please refresh the page and try again.', 'error');
      } else {
        this.showStatus('Error applying changes', 'error');
      }
    }
  }
  
    async handleUndo() {
      if (!this.currentTab || !this.isValidWebPage(this.currentTab.url)) {
        this.showStatus('This extension only works on web pages', 'error');
        return;
      }

      try {
        await this.sendMessageWithRetry({
          action: 'undo'
        });
      } catch (error) {
        console.error('Error in handleUndo:', error);
        if (error.message && error.message.includes('Could not establish connection')) {
          this.showStatus('Content script not loaded. Please refresh the page and try again.', 'error');
        } else {
          this.showStatus('Error undoing changes', 'error');
        }
      }
    }

    async handleReset() {
      if (!this.currentTab || !this.isValidWebPage(this.currentTab.url)) {
        this.showStatus('This extension only works on web pages', 'error');
        return;
      }

      try {
        await this.sendMessageWithRetry({
          action: 'reset'
        });
        this.hidePreviewResults();
      } catch (error) {
        console.error('Error in handleReset:', error);
        if (error.message && error.message.includes('Could not establish connection')) {
          this.showStatus('Content script not loaded. Please refresh the page and try again.', 'error');
        } else {
          this.showStatus('Error resetting page', 'error');
        }
      }
    }
  
    async handleSaveRule() {
      const prompt = this.promptInput.value.trim();
      if (!prompt) {
        this.showStatus('Please enter a command to save', 'error');
        return;
      }

      if (!this.currentTab || !this.isValidWebPage(this.currentTab.url)) {
        this.showStatus('This extension only works on web pages', 'error');
        return;
      }

      try {
        const hostname = new URL(this.currentTab.url).hostname;
        
        // For demo purposes, we'll save a simplified rule
        // In reality, you'd save the parsed command and compiled selectors
        chrome.runtime.sendMessage({
          action: 'saveRule',
          hostname: hostname,
          rule: {
            promptText: prompt,
            destructive: this.destructiveToggle.checked,
            compiledSelectors: [] // This would be populated from the actual parsing
          }
        });
        
        this.showStatus('Rule saved for this site', 'success');
      } catch (error) {
        console.error('Error in handleSaveRule:', error);
        this.showStatus('Error saving rule', 'error');
      }
    }
  
  showPreviewResults(targets) {
    this.isPreviewMode = true;
    this.currentTargets = targets; // Store the targets for later use
    this.targetsList.innerHTML = '';
    
    if (targets.length === 0) {
      this.targetsList.innerHTML = '<div class="target-item">No targets found</div>';
    } else {
      targets.forEach(target => {
        const item = document.createElement('div');
        item.className = 'target-item';
        item.innerHTML = `
          <span>${target.description}</span>
          <span>${target.count} elements</span>
        `;
        this.targetsList.appendChild(item);
      });
    }
    
    this.resultsSection.style.display = 'block';
    this.previewBtn.textContent = 'Update Preview';
    this.showStatus(`Found ${targets.length} target group(s)`, 'info');
  }
  
    hidePreviewResults() {
      this.isPreviewMode = false;
      this.resultsSection.style.display = 'none';
      this.previewBtn.textContent = 'Preview';
    }
  
    showStatus(message, type = 'info') {
      this.statusMessage.textContent = message;
      this.statusMessage.className = `status-message ${type}`;
      
      if (type === 'success' || type === 'info') {
        setTimeout(() => {
          this.statusMessage.textContent = '';
          this.statusMessage.className = 'status-message';
        }, 3000);
      }
    }

    startCooldownTimer() {
      // Clear existing timer
      if (this.cooldownInterval) {
        clearInterval(this.cooldownInterval);
      }

      // Check cooldown status every second
      this.cooldownInterval = setInterval(() => {
        const lastRequest = localStorage.getItem('cleanview_last_request');
        if (!lastRequest) return;

        const now = Date.now();
        const timeSinceLastRequest = now - parseInt(lastRequest);
        const remaining = Math.ceil((20000 - timeSinceLastRequest) / 1000);

        if (remaining > 0) {
          this.previewBtn.disabled = true;
          this.previewBtn.textContent = `Wait ${remaining}s`;
        } else {
          this.previewBtn.disabled = false;
          this.previewBtn.textContent = 'Preview';
          clearInterval(this.cooldownInterval);
          this.cooldownInterval = null;
        }
      }, 1000);
    }
  }
  
  // Initialize popup when DOM loads
  document.addEventListener('DOMContentLoaded', () => {
    new PopupController();
  });
  