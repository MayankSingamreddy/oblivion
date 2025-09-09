// New popup controller for Element Remover Pro v2
class ElementRemoverPopup {
  constructor() {
    this.currentTab = null;
    this.pageInfo = null;
    this.isAiInputVisible = false;
    this.isTweakMode = false;
    
    this.initializeElements();
    this.setupEventListeners();
    this.initialize();
  }

  initializeElements() {
    // Header elements
    this.siteName = document.getElementById('siteName');
    this.statusDot = document.getElementById('statusDot');
    this.optionsBtn = document.getElementById('optionsBtn');

    // Primary action buttons
    this.cleanBtn = document.getElementById('cleanBtn');
    this.tweakBtn = document.getElementById('tweakBtn'); 
    this.askAiBtn = document.getElementById('askAiBtn');

    // AI input panel
    this.aiInputPanel = document.getElementById('aiInputPanel');
    this.aiPrompt = document.getElementById('aiPrompt');
    this.aiSubmitBtn = document.getElementById('aiSubmitBtn');
    this.aiCancelBtn = document.getElementById('aiCancelBtn');

    // Controls
    this.alwaysApplyToggle = document.getElementById('alwaysApplyToggle');
    this.chipsContainer = document.getElementById('chipsContainer');
    this.chipsList = document.getElementById('chipsList');
    
    // Footer
    this.undoBtn = document.getElementById('undoBtn');
    this.resetBtn = document.getElementById('resetBtn');
    
    // Status
    this.statusMessage = document.getElementById('statusMessage');
    this.tweakIndicator = document.getElementById('tweakIndicator');
  }

  setupEventListeners() {
    // Primary actions
    this.cleanBtn.addEventListener('click', () => this.handleClean());
    this.tweakBtn.addEventListener('click', () => this.handleTweak());
    this.askAiBtn.addEventListener('click', () => this.handleAskAi());

    // AI input panel
    this.aiSubmitBtn.addEventListener('click', () => this.handleAiSubmit());
    this.aiCancelBtn.addEventListener('click', () => this.hideAiInput());

    // Controls
    this.alwaysApplyToggle.addEventListener('change', (e) => {
      this.handleAlwaysApplyToggle(e.target.checked);
    });

    // Footer
    this.undoBtn.addEventListener('click', () => this.handleUndo());
    this.resetBtn.addEventListener('click', () => this.handleReset());

    // Options
    this.optionsBtn.addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
      window.close();
    });

    // Listen for content script messages
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message);
    });

    // Handle enter key in AI prompt
    this.aiPrompt.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.handleAiSubmit();
      }
    });
  }

  async initialize() {
    try {
      // Get current tab
      [this.currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (!this.currentTab) {
        this.showStatus('Unable to access current tab', 'error');
        return;
      }

      // Update site name
      const url = new URL(this.currentTab.url);
      this.siteName.textContent = url.hostname.replace('www.', '');

      // Get page info from content script
      await this.getPageInfo();
      
    } catch (error) {
      console.error('Initialization failed:', error);
      this.showStatus('Failed to connect to page', 'error');
    }
  }

  async getPageInfo() {
    try {
      const response = await chrome.tabs.sendMessage(this.currentTab.id, {
        action: 'getPageInfo'
      });

      if (response?.error) {
        throw new Error(response.error);
      }

      this.pageInfo = response;
      this.updateUI();
      
    } catch (error) {
      console.error('Failed to get page info:', error);
      // Try to inject content script
      await this.ensureContentScript();
    }
  }

  async ensureContentScript() {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: this.currentTab.id },
        files: ['content.js']
      });

      await chrome.scripting.insertCSS({
        target: { tabId: this.currentTab.id },
        files: ['assets/styles.css']  
      });

      // Wait a bit for initialization then try again
      setTimeout(() => this.getPageInfo(), 1000);
      
    } catch (error) {
      console.error('Content script injection failed:', error);
      this.showStatus('Cannot access this page', 'error');
    }
  }

  updateUI() {
    if (!this.pageInfo) return;

    // Update status dot
    this.statusDot.className = 'status-dot ' + 
      (this.pageInfo.isActive ? 'active' : 'inactive');

    // Update Clean button based on preset availability
    if (this.pageInfo.hasPreset) {
      this.cleanBtn.disabled = false;
      this.cleanBtn.querySelector('.btn-subtitle').textContent = 'Site preset available';
    } else {
      this.cleanBtn.disabled = true;
      this.cleanBtn.querySelector('.btn-subtitle').textContent = 'No preset available';
    }

    // Update chips if available
    if (this.pageInfo.chips && this.pageInfo.chips.length > 0) {
      this.showChips(this.pageInfo.chips);
    }

    // Update reset button text
    this.resetBtn.textContent = this.pageInfo.isActive ? 'Reset' : 'Reset';
  }

  showChips(chips) {
    this.chipsList.innerHTML = '';
    
    chips.forEach(chip => {
      const chipElement = document.createElement('button');
      chipElement.className = `chip ${chip.active ? 'active' : ''}`;
      chipElement.textContent = chip.name;
      chipElement.setAttribute('data-chip-id', chip.id);
      
      chipElement.addEventListener('click', () => {
        this.handleChipToggle(chip.id, !chip.active);
      });
      
      this.chipsList.appendChild(chipElement);
    });

    this.chipsContainer.style.display = 'block';
  }

  async handleClean() {
    if (!this.pageInfo?.hasPreset) return;

    try {
      this.setButtonLoading(this.cleanBtn, true);
      
      const response = await chrome.tabs.sendMessage(this.currentTab.id, {
        action: 'applyCleanPreset'
      });

      if (response?.error) {
        throw new Error(response.error);
      }

      this.showStatus(`Applied ${response.presetName} preset (${response.appliedCount} elements)`, 'success');
      await this.getPageInfo(); // Refresh UI
      
    } catch (error) {
      this.showStatus(`Clean failed: ${error.message}`, 'error');
    } finally {
      this.setButtonLoading(this.cleanBtn, false);
    }
  }

  async handleTweak() {
    try {
      if (this.isTweakMode) {
        // Exit tweak mode
        await chrome.tabs.sendMessage(this.currentTab.id, {
          action: 'startTweak'
        });
        this.isTweakMode = false;
        this.tweakIndicator.style.display = 'none';
        this.tweakBtn.classList.remove('active');
      } else {
        // Enter tweak mode  
        await chrome.tabs.sendMessage(this.currentTab.id, {
          action: 'startTweak'
        });
        this.isTweakMode = true;
        this.tweakIndicator.style.display = 'block';
        this.tweakBtn.classList.add('active');
        
        this.showStatus('Tweak mode activated - hover and click elements to hide them', 'info');
      }
      
    } catch (error) {
      this.showStatus(`Tweak mode failed: ${error.message}`, 'error');
    }
  }

  handleAskAi() {
    this.showAiInput();
  }

  showAiInput() {
    this.isAiInputVisible = true;
    this.aiInputPanel.style.display = 'block';
    this.aiPrompt.focus();
  }

  hideAiInput() {
    this.isAiInputVisible = false;
    this.aiInputPanel.style.display = 'none';
    this.aiPrompt.value = '';
  }

  async handleAiSubmit() {
    const prompt = this.aiPrompt.value.trim();
    if (!prompt) return;

    try {
      this.setButtonLoading(this.aiSubmitBtn, true);
      
      const response = await chrome.tabs.sendMessage(this.currentTab.id, {
        action: 'askAI',
        prompt: prompt
      });

      if (response?.error) {
        throw new Error(response.error);
      }

      const resultText = response.fallback ? 
        `Applied fallback patterns (${response.appliedCount} elements)` :
        `AI applied changes (${response.appliedCount} elements)`;
        
      this.showStatus(resultText, 'success');
      this.hideAiInput();
      await this.getPageInfo(); // Refresh UI
      
    } catch (error) {
      this.showStatus(`AI request failed: ${error.message}`, 'error');
    } finally {
      this.setButtonLoading(this.aiSubmitBtn, false);
    }
  }

  async handleChipToggle(chipId, enable) {
    // TODO: Implement chip toggle functionality
    console.log(`Toggle chip ${chipId}: ${enable}`);
  }

  async handleUndo() {
    try {
      await chrome.tabs.sendMessage(this.currentTab.id, {
        action: 'undo'
      });
      
      this.showStatus('Undone', 'success');
      await this.getPageInfo();
      
    } catch (error) {
      this.showStatus(`Undo failed: ${error.message}`, 'error');
    }
  }

  async handleReset() {
    try {
      const temporary = !confirm('Permanently clear site memory? (Cancel for temporary reset)');
      
      await chrome.tabs.sendMessage(this.currentTab.id, {
        action: 'resetSite',
        temporary: temporary
      });

      const message = temporary ? 'Page reset (temporary)' : 'Site memory cleared';
      this.showStatus(message, 'success');
      await this.getPageInfo();
      
    } catch (error) {
      this.showStatus(`Reset failed: ${error.message}`, 'error');
    }
  }

  async handleAlwaysApplyToggle(enabled) {
    try {
      await chrome.tabs.sendMessage(this.currentTab.id, {
        action: 'toggleAlwaysApply',
        enabled: enabled
      });
      
    } catch (error) {
      console.error('Always apply toggle failed:', error);
      // Reset toggle state
      this.alwaysApplyToggle.checked = !enabled;
    }
  }

  handleMessage(message) {
    switch (message.action) {
      case 'tweakModeActive':
        this.isTweakMode = message.active;
        if (message.active) {
          this.tweakIndicator.style.display = 'block';
          this.tweakBtn.classList.add('active');
        } else {
          this.tweakIndicator.style.display = 'none'; 
          this.tweakBtn.classList.remove('active');
        }
        break;
        
      case 'elementHidden':
        this.showStatus(`Hidden: ${message.rule.description}`, 'success');
        break;
        
      case 'ruleUndone':
        this.showStatus('Rule undone', 'success');
        break;
    }
  }

  setButtonLoading(button, loading) {
    if (loading) {
      button.disabled = true;
      button.style.opacity = '0.7';
      // Could add spinner here
    } else {
      button.disabled = false;
      button.style.opacity = '1';
    }
  }

  showStatus(message, type = 'info') {
    this.statusMessage.textContent = message;
    this.statusMessage.className = `status-message ${type}`;
    this.statusMessage.style.display = 'block';

    // Auto-hide after 3 seconds
    setTimeout(() => {
      this.statusMessage.style.display = 'none';
    }, 3000);
  }
}

// Initialize popup when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new ElementRemoverPopup();
});