// Options page controller
class OptionsController {
    constructor() {
      this.initializeElements();
      this.loadSettings();
      this.loadRules();
      this.setupEventListeners();
    }
  
    initializeElements() {
      this.autoApplyRules = document.getElementById('autoApplyRules');
      this.allowLLM = document.getElementById('allowLLM');
      this.apiKey = document.getElementById('apiKey');
      this.timeout = document.getElementById('timeout');
      this.maxNodes = document.getElementById('maxNodes');
      this.rulesList = document.getElementById('rulesList');
      this.exportBtn = document.getElementById('exportBtn');
      this.importBtn = document.getElementById('importBtn');
      this.clearAllBtn = document.getElementById('clearAllBtn');
      this.importFile = document.getElementById('importFile');
      this.statusMessage = document.getElementById('statusMessage');
    }
  
    setupEventListeners() {
      // Save settings on change
      [this.autoApplyRules, this.allowLLM, this.timeout, this.maxNodes].forEach(element => {
        element.addEventListener('change', () => this.saveSettings());
      });
  
      this.apiKey.addEventListener('input', () => this.saveSettings());
  
      // Data management
      this.exportBtn.addEventListener('click', () => this.exportRules());
      this.importBtn.addEventListener('click', () => this.importFile.click());
      this.importFile.addEventListener('change', (e) => this.importRules(e));
      this.clearAllBtn.addEventListener('click', () => this.clearAllRules());
    }
  
    async loadSettings() {
      try {
        const settings = await chrome.storage.local.get([
          'autoApplyRules',
          'allowLLM',
          'apiKey',
          'timeout',
          'maxNodes'
        ]);
  
        this.autoApplyRules.checked = settings.autoApplyRules !== false;
        this.allowLLM.checked = settings.allowLLM === true;
        this.apiKey.value = settings.apiKey || '';
        this.timeout.value = settings.timeout || 5000;
        this.maxNodes.value = settings.maxNodes || 50;
      } catch (error) {
        this.showStatus('Error loading settings', 'error');
      }
    }
  
    async saveSettings() {
      try {
        await chrome.storage.local.set({
          autoApplyRules: this.autoApplyRules.checked,
          allowLLM: this.allowLLM.checked,
          apiKey: this.apiKey.value,
          timeout: parseInt(this.timeout.value),
          maxNodes: parseInt(this.maxNodes.value)
        });
  
        this.showStatus('Settings saved', 'success');
      } catch (error) {
        this.showStatus('Error saving settings', 'error');
      }
    }
  
    async loadRules() {
      try {
        const allData = await chrome.storage.local.get(null);
        const rules = {};
        
        // Filter out settings and keep only domain rules
        Object.entries(allData).forEach(([key, value]) => {
          if (Array.isArray(value) && key.includes('.')) {
            rules[key] = value;
          }
        });
  
        this.displayRules(rules);
      } catch (error) {
        this.showStatus('Error loading rules', 'error');
      }
    }
  
    displayRules(rules) {
      if (Object.keys(rules).length === 0) {
        this.rulesList.innerHTML = '<div class="no-rules">No saved rules yet</div>';
        return;
      }
  
      const rulesHTML = Object.entries(rules).map(([domain, domainRules]) => {
        const rulesItems = domainRules.map((rule, index) => `
          <div class="rule-item">
            <div class="rule-info">
              <div class="rule-domain">${domain}</div>
              <div class="rule-prompt">"${rule.promptText}"</div>
            </div>
            <div class="rule-actions">
              <button class="btn btn-small btn-danger" onclick="optionsController.deleteRule('${domain}', ${index})">
                Delete
              </button>
            </div>
          </div>
        `).join('');
        
        return rulesItems;
      }).join('');
  
      this.rulesList.innerHTML = rulesHTML;
    }
  
    async deleteRule(domain, index) {
      try {
        const result = await chrome.storage.local.get([domain]);
        const rules = result[domain] || [];
        
        rules.splice(index, 1);
        
        if (rules.length === 0) {
          await chrome.storage.local.remove([domain]);
        } else {
          await chrome.storage.local.set({ [domain]: rules });
        }
        
        this.loadRules();
        this.showStatus('Rule deleted', 'success');
      } catch (error) {
        this.showStatus('Error deleting rule', 'error');
      }
    }
  
    async exportRules() {
      try {
        const allData = await chrome.storage.local.get(null);
        const rules = {};
        
        // Filter out settings
        Object.entries(allData).forEach(([key, value]) => {
          if (Array.isArray(value) && key.includes('.')) {
            rules[key] = value;
          }
        });
  
        const dataStr = JSON.stringify(rules, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'cleanview-rules.json';
        link.click();
        
        URL.revokeObjectURL(url);
        this.showStatus('Rules exported', 'success');
      } catch (error) {
        this.showStatus('Error exporting rules', 'error');
      }
    }
  
    async importRules(event) {
      const file = event.target.files[0];
      if (!file) return;
  
      try {
        const text = await file.text();
        const rules = JSON.parse(text);
        
        await chrome.storage.local.set(rules);
        
        this.loadRules();
        this.showStatus('Rules imported', 'success');
      } catch (error) {
        this.showStatus('Error importing rules', 'error');
      }
      
      // Reset file input
      event.target.value = '';
    }
  
    async clearAllRules() {
      if (!confirm('Are you sure you want to clear all saved rules?')) {
        return;
      }
  
      try {
        const allData = await chrome.storage.local.get(null);
        const keysToRemove = [];
        
        // Find all domain rule keys
        Object.keys(allData).forEach(key => {
          if (Array.isArray(allData[key]) && key.includes('.')) {
            keysToRemove.push(key);
          }
        });
        
        await chrome.storage.local.remove(keysToRemove);
        
        this.loadRules();
        this.showStatus('All rules cleared', 'success');
      } catch (error) {
        this.showStatus('Error clearing rules', 'error');
      }
    }
  
    showStatus(message, type = 'success') {
      this.statusMessage.textContent = message;
      this.statusMessage.className = `status-message ${type} show`;
      
      setTimeout(() => {
        this.statusMessage.classList.remove('show');
      }, 3000);
    }
  }
  
  // Global reference for inline event handlers
  let optionsController;
  
  document.addEventListener('DOMContentLoaded', () => {
    optionsController = new OptionsController();
  });
  