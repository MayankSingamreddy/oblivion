class OptionsController {
  constructor() {
    this.initializeElements();
    this.setupEventListeners();
    this.loadSettings();
  }

  initializeElements() {
    this.apiKeyInput = document.getElementById('apiKey');
    this.modelSelect = document.getElementById('model');
    this.enableAICheckbox = document.getElementById('enableAI');
    this.enableFallbackCheckbox = document.getElementById('enableFallback');
    this.maxElementsInput = document.getElementById('maxElements');
    this.saveBtn = document.getElementById('saveBtn');
    this.testBtn = document.getElementById('testBtn');
    this.resetBtn = document.getElementById('resetBtn');
    this.statusMessage = document.getElementById('statusMessage');
  }

  setupEventListeners() {
    this.saveBtn.addEventListener('click', () => this.saveSettings());
    this.testBtn.addEventListener('click', () => this.testApiKey());
    this.resetBtn.addEventListener('click', () => this.resetSettings());
    
    // Auto-save on change
    [this.enableAICheckbox, this.enableFallbackCheckbox, this.modelSelect, this.maxElementsInput].forEach(element => {
      element.addEventListener('change', () => this.saveSettings());
    });
    
    // Save API key on blur to avoid saving on every keystroke
    this.apiKeyInput.addEventListener('blur', () => this.saveSettings());
  }

  async loadSettings() {
    try {
      const settings = await chrome.storage.local.get({
        apiKey: '',
        model: 'gpt-4o-mini',
        enableAI: true,
        enableFallback: true,
        maxElements: 100
      });

      this.apiKeyInput.value = settings.apiKey;
      this.modelSelect.value = settings.model;
      this.enableAICheckbox.checked = settings.enableAI;
      this.enableFallbackCheckbox.checked = settings.enableFallback;
      this.maxElementsInput.value = settings.maxElements;

      // Show status if API key is configured
      if (settings.apiKey) {
        this.showStatus('Settings loaded', 'info', 2000);
      }
    } catch (error) {
      console.error('Error loading settings:', error);
      this.showStatus('Error loading settings', 'error');
    }
  }

  async saveSettings() {
    try {
      const settings = {
        apiKey: this.apiKeyInput.value.trim(),
        model: this.modelSelect.value,
        enableAI: this.enableAICheckbox.checked,
        enableFallback: this.enableFallbackCheckbox.checked,
        maxElements: parseInt(this.maxElementsInput.value) || 100
      };

      await chrome.storage.local.set(settings);
      this.showStatus('Settings saved', 'success', 2000);
    } catch (error) {
      console.error('Error saving settings:', error);
      this.showStatus('Error saving settings', 'error');
    }
  }

  async testApiKey() {
    const apiKey = this.apiKeyInput.value.trim();
    
    if (!apiKey) {
      this.showStatus('Please enter an API key first', 'error');
      return;
    }

    if (!apiKey.startsWith('sk-')) {
      this.showStatus('API key should start with "sk-"', 'error');
      return;
    }

    this.testBtn.disabled = true;
    this.testBtn.textContent = 'Testing...';
    this.showStatus('Testing API key...', 'info');

    try {
      const response = await fetch('https://api.openai.com/v1/models', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        }
      });

      if (response.ok) {
        this.showStatus('✅ API key is valid!', 'success');
      } else {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 401) {
          this.showStatus('❌ Invalid API key', 'error');
        } else if (response.status === 429) {
          this.showStatus('❌ Rate limit exceeded. API key may be valid but quota reached.', 'error');
        } else {
          this.showStatus(`❌ API error: ${errorData.error?.message || response.statusText}`, 'error');
        }
      }
    } catch (error) {
      console.error('Error testing API key:', error);
      this.showStatus('❌ Network error. Please check your connection.', 'error');
    } finally {
      this.testBtn.disabled = false;
      this.testBtn.textContent = 'Test API Key';
    }
  }

  async resetSettings() {
    if (!confirm('Are you sure you want to reset all settings to defaults?')) {
      return;
    }

    try {
      // Clear all settings
      await chrome.storage.local.clear();
      
      // Reload default values
      await this.loadSettings();
      
      this.showStatus('Settings reset to defaults', 'info');
    } catch (error) {
      console.error('Error resetting settings:', error);
      this.showStatus('Error resetting settings', 'error');
    }
  }

  showStatus(message, type = 'info', autoHide = null) {
    this.statusMessage.textContent = message;
    this.statusMessage.className = `status-message ${type}`;
    
    if (autoHide) {
      setTimeout(() => {
        this.statusMessage.textContent = '';
        this.statusMessage.className = 'status-message';
      }, autoHide);
    }
  }
}

// Initialize when DOM loads
document.addEventListener('DOMContentLoaded', () => {
  new OptionsController();
});