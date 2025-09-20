// Background service worker for Oblivion v2.0
import { Message, MessageResponse, Settings } from '../types/types';

class OblivionBackground {
  private tabStates = new Map<number, { host: string; active: boolean; lastActivity: number }>();
  private settings: Settings | null = null;

  constructor() {
    this.initialize();
  }

  private async initialize(): Promise<void> {
    // Set up event listeners
    this.setupEventListeners();
    
    // Load settings
    await this.loadSettings();
    
    // Perform startup maintenance
    await this.performStartupMaintenance();
    
    console.log('🚀 Oblivion background service worker initialized');
  }

  private setupEventListeners(): void {
    // Extension lifecycle
    chrome.runtime.onInstalled.addListener(this.handleInstall.bind(this));
    chrome.runtime.onStartup.addListener(this.handleStartup.bind(this));

    // Tab management
    chrome.tabs.onActivated.addListener(this.handleTabActivated.bind(this));
    chrome.tabs.onUpdated.addListener(this.handleTabUpdated.bind(this));
    chrome.tabs.onRemoved.addListener(this.handleTabRemoved.bind(this));

    // Navigation events
    chrome.webNavigation.onCommitted.addListener(this.handleNavigation.bind(this));

    // Commands (keyboard shortcuts)
    chrome.commands.onCommand.addListener(this.handleCommand.bind(this));

    // Messages from content scripts and popup
    chrome.runtime.onMessage.addListener(this.handleMessage.bind(this));

    // Alarm for periodic maintenance
    chrome.alarms.onAlarm.addListener(this.handleAlarm.bind(this));
  }

  private async handleInstall(details: chrome.runtime.InstalledDetails): Promise<void> {
    if (details.reason === 'install') {
      console.log('🎉 Oblivion installed');
      await this.performFirstInstall();
    } else if (details.reason === 'update') {
      console.log(`🔄 Oblivion updated to ${chrome.runtime.getManifest().version}`);
      await this.performUpdate(details.previousVersion || '1.0.0');
    }
  }

  private async handleStartup(): Promise<void> {
    console.log('🌅 Oblivion startup');
    await this.loadSettings();
    await this.performStartupMaintenance();
  }

  private async handleTabActivated(activeInfo: chrome.tabs.TabActiveInfo): Promise<void> {
    try {
      const tab = await chrome.tabs.get(activeInfo.tabId);
      if (tab.url) {
        const host = new URL(tab.url).hostname;
        this.updateTabState(activeInfo.tabId, host, true);
      }
    } catch (error) {
      // Tab might have been closed or URL might be invalid
    }
  }

  private async handleTabUpdated(
    tabId: number,
    changeInfo: chrome.tabs.TabChangeInfo,
    tab: chrome.tabs.Tab
  ): Promise<void> {
    if (changeInfo.status === 'complete' && tab.url) {
      try {
        const host = new URL(tab.url).hostname;
        this.updateTabState(tabId, host, false);
        
        // Inject content script if needed
        await this.ensureContentScript(tabId, tab.url);
      } catch (error) {
        // URL might be invalid or injection might fail
        console.warn('Failed to handle tab update:', error);
      }
    }
  }

  private handleTabRemoved(tabId: number): void {
    this.tabStates.delete(tabId);
  }

  private async handleNavigation(details: chrome.webNavigation.WebNavigationTransitionCallbackDetails): Promise<void> {
    if (details.frameId === 0) { // Main frame only
      try {
        const host = new URL(details.url).hostname;
        this.updateTabState(details.tabId, host, false);
      } catch (error) {
        // URL might be invalid
      }
    }
  }

  private async handleCommand(command: string): Promise<void> {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return;

      switch (command) {
        case 'toggle-selection-mode':
          await this.sendMessageToTab(tab.id, { action: 'startSelection' });
          break;

        case 'quick-undo':
          await this.sendMessageToTab(tab.id, { action: 'undo' });
          break;

        case 'apply-host-preset':
          const host = new URL(tab.url!).hostname;
          await this.sendMessageToTab(tab.id, { action: 'loadPreset', presetId: host });
          break;
      }
    } catch (error) {
      console.error('Command handling failed:', error);
    }
  }

  private async handleMessage(
    message: any,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: any) => void
  ): Promise<void> {
    try {
      let response: MessageResponse;

      switch (message.action) {
        case 'contentScriptReady':
          this.handleContentScriptReady(sender, message);
          response = { success: true };
          break;

        case 'getSettings':
          response = { success: true, data: this.settings };
          break;

        case 'saveSettings':
          response = await this.saveSettings(message.settings);
          break;

        case 'openOptionsPage':
          chrome.runtime.openOptionsPage();
          response = { success: true };
          break;

        case 'getBadgeInfo':
          response = await this.getBadgeInfo(sender.tab?.id);
          break;

        case 'updateBadge':
          await this.updateBadge(sender.tab?.id, message.count);
          response = { success: true };
          break;

        case 'getTabState':
          const tabState = sender.tab?.id ? this.tabStates.get(sender.tab.id) : null;
          response = { success: true, data: tabState };
          break;

        case 'reportError':
          this.handleError(message.error, sender);
          response = { success: true };
          break;

        default:
          // Forward unknown messages to content script
          if (sender.tab?.id && message.action) {
            response = await this.sendMessageToTab(sender.tab.id, message);
          } else {
            response = { success: false, error: 'Unknown action' };
          }
      }

      sendResponse(response);
    } catch (error) {
      sendResponse({ success: false, error: (error as Error).message });
    }
  }

  private async handleAlarm(alarm: chrome.alarms.Alarm): Promise<void> {
    switch (alarm.name) {
      case 'maintenance':
        await this.performMaintenance();
        break;

      case 'cleanup-tab-states':
        this.cleanupTabStates();
        break;
    }
  }

  private handleContentScriptReady(sender: chrome.runtime.MessageSender, message: any): void {
    if (sender.tab?.id) {
      this.updateTabState(sender.tab.id, message.host, true);
      console.log(`📱 Content script ready for ${message.host}`);
    }
  }

  private updateTabState(tabId: number, host: string, active: boolean): void {
    this.tabStates.set(tabId, {
      host,
      active,
      lastActivity: Date.now()
    });
  }

  private async sendMessageToTab(tabId: number, message: Message): Promise<MessageResponse> {
    try {
      const response = await chrome.tabs.sendMessage(tabId, message);
      return response || { success: false, error: 'No response from content script' };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  private async ensureContentScript(tabId: number, url: string): Promise<void> {
    // Skip special pages
    if (url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('edge://') || url.startsWith('about:')) {
      return;
    }

    try {
      // Check if content script is already injected
      await chrome.tabs.sendMessage(tabId, { action: 'ping' });
    } catch (error) {
      // Content script not available, inject it
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ['dist/content/main.js']
        });
      } catch (injectionError) {
        console.warn('Failed to inject content script:', injectionError);
      }
    }
  }

  private async performFirstInstall(): Promise<void> {
    // Set default settings
    const defaultSettings: Settings = {
      aiEnabled: true,
      aiModel: 'gpt-4o-mini',
      fallbackEnabled: true,
      syncEnabled: true,
      localModelEnabled: false,
      globalPreferences: {
        blockCookieNags: false,
        reduceMotion: false,
        dimAutoplay: false,
        autoApplyRules: true
      }
    };

    await chrome.storage.sync.set({ settings: defaultSettings });
    this.settings = defaultSettings;

    // Setup maintenance alarms
    chrome.alarms.create('maintenance', { periodInMinutes: 24 * 60 }); // Daily
    chrome.alarms.create('cleanup-tab-states', { periodInMinutes: 60 }); // Hourly

    // Open welcome page
    chrome.tabs.create({ url: chrome.runtime.getURL('src/options/options.html?welcome=true') });
  }

  private async performUpdate(previousVersion: string): Promise<void> {
    // Handle version-specific migrations
    const currentVersion = chrome.runtime.getManifest().version;
    console.log(`Updating from ${previousVersion} to ${currentVersion}`);

    // Migration logic would go here
    if (this.shouldMigrate(previousVersion, currentVersion)) {
      await this.performMigration(previousVersion, currentVersion);
    }

    // Update badge to show update
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (tab.id) {
        chrome.action.setBadgeText({ tabId: tab.id, text: '!' });
        chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: '#3b82f6' });
      }
    }

    // Clear update badge after 5 seconds
    setTimeout(() => {
      chrome.action.setBadgeText({ text: '' });
    }, 5000);
  }

  private shouldMigrate(from: string, to: string): boolean {
    const [fromMajor] = from.split('.').map(Number);
    const [toMajor] = to.split('.').map(Number);
    return fromMajor < toMajor;
  }

  private async performMigration(from: string, to: string): Promise<void> {
    console.log(`🔄 Performing migration from ${from} to ${to}`);
    
    try {
      // Example migration logic
      const allData = await chrome.storage.sync.get();
      
      // Migrate any old format data
      const updates: { [key: string]: any } = {};
      let migrated = false;

      for (const [key, value] of Object.entries(allData)) {
        if (key.startsWith('rules:') && Array.isArray(value)) {
          // Migrate old rule format to new format
          updates[key] = {
            meta: {
              version: '2.0.0',
              lastAccessed: Date.now(),
              ruleCount: (value as any[]).length,
              compressed: false
            },
            rules: value
          };
          migrated = true;
        }
      }

      if (migrated) {
        await chrome.storage.sync.set(updates);
        console.log(`✅ Migrated ${Object.keys(updates).length} rule collections`);
      }
    } catch (error) {
      console.error('Migration failed:', (error as Error).message);
    }
  }

  private async performStartupMaintenance(): Promise<void> {
    // Clean up old data, update settings, etc.
    this.cleanupTabStates();
    
    // Update action badge for any active tabs
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (tab.id && tab.url) {
        try {
          const response = await chrome.tabs.sendMessage(tab.id, { action: 'getPageInfo' });
          if (response?.data?.appliedCount > 0) {
            await this.updateBadge(tab.id, response.data.appliedCount);
          }
        } catch (error) {
          // Content script not available or tab not ready
        }
      }
    }
  }

  private async performMaintenance(): Promise<void> {
    console.log('🧹 Performing daily maintenance');
    
    try {
      // Clean up tab states
      this.cleanupTabStates();

      // Clean up storage if needed
      const storageData = await chrome.storage.sync.getBytesInUse();
      const maxBytes = chrome.storage.sync.QUOTA_BYTES;
      
      if (storageData > maxBytes * 0.8) {
        console.log('🗑️ Storage usage high, performing cleanup...');
        // Trigger storage cleanup (would need to implement in storage module)
      }

    } catch (error) {
      console.error('Maintenance failed:', error);
    }
  }

  private cleanupTabStates(): void {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    for (const [tabId, state] of this.tabStates.entries()) {
      if (now - state.lastActivity > maxAge) {
        this.tabStates.delete(tabId);
      }
    }
  }

  private async loadSettings(): Promise<void> {
    try {
      const result = await chrome.storage.sync.get('settings');
      this.settings = result.settings || null;
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }

  private async saveSettings(settings: Settings): Promise<MessageResponse> {
    try {
      await chrome.storage.sync.set({ settings });
      this.settings = settings;
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  private async getBadgeInfo(tabId?: number): Promise<MessageResponse> {
    if (!tabId) return { success: false, error: 'No tab ID' };
    
    try {
      const badgeText = await chrome.action.getBadgeText({ tabId });
      return { success: true, data: { text: badgeText } };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  private async updateBadge(tabId: number | undefined, count: number): Promise<void> {
    if (!tabId) return;

    try {
      if (count > 0) {
        chrome.action.setBadgeText({ 
          tabId, 
          text: count > 99 ? '99+' : count.toString()
        });
        chrome.action.setBadgeBackgroundColor({ 
          tabId, 
          color: '#10b981' 
        });
      } else {
        chrome.action.setBadgeText({ tabId, text: '' });
      }
    } catch (error) {
      console.warn('Failed to update badge:', error);
    }
  }

  private handleError(error: any, sender: chrome.runtime.MessageSender): void {
    console.error('Error reported from content script:', error, sender);
    
    // Could send to error reporting service here
    // For now, just log it
  }

  // Utility methods
  public getTabStates(): Map<number, any> {
    return this.tabStates;
  }

  public getSettings(): Settings | null {
    return this.settings;
  }
}

// Initialize background service
new OblivionBackground();

// Handle service worker lifecycle
(self as any).addEventListener('activate', (event: any) => {
  console.log('🔄 Service worker activated');
  event.waitUntil((self as any).clients.claim());
});

(self as any).addEventListener('install', (event: any) => {
  console.log('📦 Service worker installed');
  event.waitUntil((self as any).skipWaiting());
});
