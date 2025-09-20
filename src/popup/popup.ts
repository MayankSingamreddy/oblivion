// Popup interface for Oblivion Chrome Extension
import { StorageManager } from '../modules/storage';
import { SelectorEngine } from '../modules/selectorEngine';
import { OverlayManager } from '../modules/overlayManager';
import { NLAgent } from '../modules/nlAgent';
import { PresetManager } from '../modules/presets';
import { PageInfo, Rule, Settings, SitePreset } from '../types/types';

class PopupInterface {
  private storageManager: StorageManager;
  private presetManager: PresetManager;
  private currentTab: chrome.tabs.Tab | null = null;
  private currentPageInfo: PageInfo | null = null;
  private isSelectionMode = false;
  private isAIMode = false;

  constructor() {
    this.storageManager = new StorageManager();
    this.presetManager = new PresetManager(this.storageManager);
    this.init();
  }

  private async init(): Promise<void> {
    await this.loadCurrentTab();
    await this.loadPageInfo();
    this.setupEventListeners();
    await this.updateUI();
  }

  private async loadCurrentTab(): Promise<void> {
    try {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      this.currentTab = activeTab;
    } catch (error) {
      console.error('Failed to get active tab:', error);
    }
  }

  private async loadPageInfo(): Promise<void> {
    if (!this.currentTab?.url) return;
    
    try {
      const url = new URL(this.currentTab.url);
      const host = url.hostname;
      
      // Get page info from content script
      const [response] = await chrome.tabs.sendMessage(this.currentTab.id!, { 
        action: 'getPageInfo' 
      });
      
      if (response) {
        this.currentPageInfo = response;
      } else {
        // Fallback page info
        this.currentPageInfo = {
          host,
          path: url.pathname,
          title: this.currentTab.title || 'Untitled',
          hasPreset: this.presetManager.getPresetForHost(host) !== null,
          hasSavedConfig: (await this.storageManager.loadHostRules(host)).length > 0,
          appliedCount: 0,
          ruleCount: 0,
          isActive: false,
          chips: []
        };
      }
    } catch (error) {
      console.error('Failed to load page info:', error);
    }
  }

  private setupEventListeners(): void {
    // Primary action buttons
    document.getElementById('cleanBtn')?.addEventListener('click', () => this.handleCleanAction());
    document.getElementById('selectBtn')?.addEventListener('click', () => this.handleSelectAction());
    document.getElementById('aiBtn')?.addEventListener('click', () => this.handleAIAction());

    // Header buttons
    document.getElementById('presetsBtn')?.addEventListener('click', () => this.handlePresetsAction());
    document.getElementById('optionsBtn')?.addEventListener('click', () => this.handleOptionsAction());

    // AI input panel
    document.getElementById('aiSubmitBtn')?.addEventListener('click', () => this.handleAISubmit());
    document.getElementById('aiCancelBtn')?.addEventListener('click', () => this.handleAICancel());

    // Memory controls
    document.getElementById('saveConfigBtn')?.addEventListener('click', () => this.handleSaveConfig());

    // Theme controls
    document.getElementById('themeSelect')?.addEventListener('change', (e) => 
      this.handleThemeChange((e.target as HTMLSelectElement).value));

    // Footer controls
    document.getElementById('undoBtn')?.addEventListener('click', () => this.handleUndo());
    document.getElementById('redoBtn')?.addEventListener('click', () => this.handleRedo());
    document.getElementById('resetBtn')?.addEventListener('click', () => this.handleReset());

    // Listen for messages from content script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
    });

    // Handle keyboard shortcuts
    document.addEventListener('keydown', (e) => this.handleKeydown(e));
  }

  private async updateUI(): Promise<void> {
    if (!this.currentPageInfo) return;

    // Update site name and status
    const siteNameEl = document.getElementById('siteName');
    const statusDotEl = document.getElementById('statusDot');
    
    if (siteNameEl) {
      siteNameEl.textContent = this.currentPageInfo.host;
    }
    
    if (statusDotEl) {
      statusDotEl.className = `status-dot ${this.currentPageInfo.isActive ? 'active' : 'inactive'}`;
    }

    // Update button states
    this.updateButtonStates();
    
    // Update memory status
    this.updateMemoryStatus();
    
    // Update quick actions
    this.updateQuickActions();

    // Update undo/redo buttons
    this.updateUndoRedoButtons();
  }

  private updateButtonStates(): void {
    const cleanBtn = document.getElementById('cleanBtn') as HTMLButtonElement;
    const selectBtn = document.getElementById('selectBtn') as HTMLButtonElement;
    const aiBtn = document.getElementById('aiBtn') as HTMLButtonElement;

    if (cleanBtn && this.currentPageInfo) {
      cleanBtn.disabled = !this.currentPageInfo.hasPreset;
      cleanBtn.classList.toggle('active', this.currentPageInfo.appliedCount > 0);
    }

    if (selectBtn) {
      selectBtn.classList.toggle('active', this.isSelectionMode);
    }

    if (aiBtn) {
      aiBtn.classList.toggle('active', this.isAIMode);
    }
  }

  private updateMemoryStatus(): void {
    const saveBtn = document.getElementById('saveConfigBtn');
    const memoryStatus = document.getElementById('memoryStatus');

    if (!saveBtn || !this.currentPageInfo) return;

    const hasSavedConfig = this.currentPageInfo.hasSavedConfig;
    
    saveBtn.classList.toggle('saved', hasSavedConfig);
    if (memoryStatus) {
      memoryStatus.style.display = hasSavedConfig ? 'flex' : 'none';
    }
  }

  private updateQuickActions(): void {
    const quickActions = document.getElementById('quickActions');
    const quickActionsList = document.getElementById('quickActionsList');

    if (!quickActions || !quickActionsList || !this.currentPageInfo) return;

    if (this.currentPageInfo.chips.length > 0) {
      quickActions.style.display = 'block';
      quickActionsList.innerHTML = '';
      
      this.currentPageInfo.chips.forEach(chip => {
        const chipEl = document.createElement('button');
        chipEl.className = `quick-action ${chip.active ? 'active' : ''}`;
        chipEl.textContent = chip.name;
        chipEl.addEventListener('click', () => this.toggleChip(chip));
        quickActionsList.appendChild(chipEl);
      });
    } else {
      quickActions.style.display = 'none';
    }
  }

  private async updateUndoRedoButtons(): Promise<void> {
    if (!this.currentTab) return;

    try {
      const response = await chrome.tabs.sendMessage(this.currentTab.id!, { 
        action: 'getUndoRedoState' 
      });

      const undoBtn = document.getElementById('undoBtn') as HTMLButtonElement;
      const redoBtn = document.getElementById('redoBtn') as HTMLButtonElement;

      if (undoBtn && response) {
        undoBtn.disabled = !response.canUndo;
      }
      if (redoBtn && response) {
        redoBtn.disabled = !response.canRedo;
      }
    } catch (error) {
      // Silently fail if content script not ready
    }
  }

  // Action handlers
  private async handleCleanAction(): Promise<void> {
    if (!this.currentTab?.url || !this.currentPageInfo) return;
    
    const url = new URL(this.currentTab.url);
    const preset = this.presetManager.getPresetForHost(url.hostname);
    
    if (preset) {
      await this.sendMessageToTab({ 
        action: 'applyPreset', 
        preset 
      });
      this.showStatus('Applied site preset', 'success');
      await this.loadPageInfo();
      await this.updateUI();
    }
  }

  private async handleSelectAction(): Promise<void> {
    if (!this.currentTab) return;
    
    this.isSelectionMode = !this.isSelectionMode;
    
    await this.sendMessageToTab({ 
      action: 'toggleSelectionMode', 
      enabled: this.isSelectionMode 
    });
    
    this.updateButtonStates();
    
    if (this.isSelectionMode) {
      this.showStatus('Selection mode active - click elements to hide', 'info');
      window.close(); // Close popup to allow element selection
    }
  }

  private handleAIAction(): void {
    this.isAIMode = !this.isAIMode;
    const aiInputPanel = document.getElementById('aiInputPanel');
    
    if (aiInputPanel) {
      aiInputPanel.style.display = this.isAIMode ? 'block' : 'none';
    }
    
    if (this.isAIMode) {
      const textarea = document.getElementById('aiPrompt') as HTMLTextAreaElement;
      textarea?.focus();
    }
    
    this.updateButtonStates();
  }

  private async handleAISubmit(): Promise<void> {
    const textarea = document.getElementById('aiPrompt') as HTMLTextAreaElement;
    const prompt = textarea?.value?.trim();
    
    if (!prompt || !this.currentTab) return;

    const aiStatus = document.getElementById('aiStatus');
    if (aiStatus) {
      aiStatus.style.display = 'block';
      aiStatus.className = 'ai-status processing';
      aiStatus.textContent = 'Processing...';
    }

    try {
      const response = await this.sendMessageToTab({
        action: 'processNLQuery',
        query: prompt
      });

      if (response?.success) {
        this.showStatus(`Applied AI suggestions (${response.rulesApplied} rules)`, 'success');
        textarea.value = '';
        this.handleAICancel();
        await this.loadPageInfo();
        await this.updateUI();
      } else {
        throw new Error(response?.error || 'AI processing failed');
      }
    } catch (error) {
      console.error('AI processing error:', error);
      this.showStatus('AI processing failed. Check your settings.', 'error');
    }

    if (aiStatus) {
      aiStatus.style.display = 'none';
    }
  }

  private handleAICancel(): void {
    this.isAIMode = false;
    const aiInputPanel = document.getElementById('aiInputPanel');
    if (aiInputPanel) {
      aiInputPanel.style.display = 'none';
    }
    this.updateButtonStates();
  }

  private handlePresetsAction(): void {
    // Open presets management (could be a new page or modal)
    chrome.tabs.create({ url: chrome.runtime.getURL('src/options/options.html#presets') });
  }

  private handleOptionsAction(): void {
    chrome.runtime.openOptionsPage();
  }

  private async handleSaveConfig(): Promise<void> {
    if (!this.currentTab?.url) return;
    
    try {
      const response = await this.sendMessageToTab({ action: 'saveCurrentConfig' });
      
      if (response?.success) {
        this.showStatus('Configuration saved', 'success');
        await this.loadPageInfo();
        await this.updateUI();
      } else {
        throw new Error('Failed to save configuration');
      }
    } catch (error) {
      console.error('Save config error:', error);
      this.showStatus('Failed to save configuration', 'error');
    }
  }

  private async handleThemeChange(theme: string): Promise<void> {
    if (!this.currentTab) return;
    
    await this.sendMessageToTab({ 
      action: 'applyTheme', 
      theme 
    });
    
    this.showStatus(`Applied ${theme} theme`, 'success');
  }

  private async handleUndo(): Promise<void> {
    if (!this.currentTab) return;
    
    await this.sendMessageToTab({ action: 'undo' });
    await this.loadPageInfo();
    await this.updateUI();
  }

  private async handleRedo(): Promise<void> {
    if (!this.currentTab) return;
    
    await this.sendMessageToTab({ action: 'redo' });
    await this.loadPageInfo();
    await this.updateUI();
  }

  private async handleReset(): Promise<void> {
    if (!this.currentTab) return;
    
    const confirmed = confirm('Reset all changes for this site? This cannot be undone.');
    if (!confirmed) return;
    
    await this.sendMessageToTab({ action: 'resetSite' });
    this.showStatus('Site reset', 'success');
    await this.loadPageInfo();
    await this.updateUI();
  }

  private async toggleChip(chip: any): Promise<void> {
    if (!this.currentTab) return;
    
    await this.sendMessageToTab({ 
      action: 'toggleChip', 
      chipId: chip.id 
    });
    
    await this.loadPageInfo();
    await this.updateUI();
  }

  private handleKeydown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      if (this.isSelectionMode) {
        this.handleSelectAction();
      } else if (this.isAIMode) {
        this.handleAICancel();
      }
    }
  }

  private handleMessage(message: any, sender: chrome.runtime.MessageSender, sendResponse: Function): void {
    switch (message.action) {
      case 'pageInfoUpdated':
        this.currentPageInfo = message.pageInfo;
        this.updateUI();
        break;
      case 'selectionModeChanged':
        this.isSelectionMode = message.enabled;
        this.updateButtonStates();
        break;
    }
  }

  private async sendMessageToTab(message: any): Promise<any> {
    if (!this.currentTab?.id) return null;
    
    try {
      return await chrome.tabs.sendMessage(this.currentTab.id, message);
    } catch (error) {
      console.error('Failed to send message to tab:', error);
      return null;
    }
  }

  private showStatus(message: string, type: 'info' | 'success' | 'error'): void {
    const statusEl = document.getElementById('statusMessage');
    if (!statusEl) return;
    
    statusEl.textContent = message;
    statusEl.className = `status-message ${type}`;
    statusEl.style.display = 'block';
    
    setTimeout(() => {
      statusEl.style.display = 'none';
    }, 3000);
  }
}

// Initialize popup when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new PopupInterface());
} else {
  new PopupInterface();
}
