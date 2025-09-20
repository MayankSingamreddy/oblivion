// Background service worker for Element Remover Pro
class BackgroundService {
  constructor() {
    this.setupEventListeners();
  }

  setupEventListeners() {
    // Handle extension install/update
    chrome.runtime.onInstalled.addListener((details) => {
      if (details.reason === 'install') {
        this.handleInstall();
      } else if (details.reason === 'update') {
        this.handleUpdate(details.previousVersion);
      }
    });

    // Handle keyboard shortcuts
    chrome.commands.onCommand.addListener((command) => {
      this.handleCommand(command);
    });

    // Handle messages from content scripts and popup
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.handleMessage(message, sender, sendResponse);
      return true; // Keep message channel open
    });

    // Handle tab updates to inject content script if needed
    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo.status === 'complete' && tab.url) {
        this.ensureContentScript(tabId, tab.url);
      }
    });
  }

  async handleInstall() {
    // Set up default settings
    const defaultSettings = {
      aiEnabled: true,
      aiModel: 'gpt-4o-mini',
      fallbackEnabled: true,
      syncEnabled: true,
      globalPreferences: {
        blockCookieNags: false,
        reduceMotion: false,
        dimAutoplay: false
      }
    };

    await chrome.storage.sync.set({ settings: defaultSettings });
    
    // Open options page
    chrome.tabs.create({ url: 'options/options.html' });
  }

  async handleUpdate(previousVersion) {
    console.log(`Updated from version ${previousVersion}`);
    
    // Handle migration if needed
    if (this.shouldMigrate(previousVersion)) {
      await this.migrateData(previousVersion);
    }
  }

  shouldMigrate(previousVersion) {
    // Check if migration is needed based on version
    const [major, minor] = previousVersion.split('.').map(Number);
    return major < 2; // Migrate from v1.x to v2.x
  }

  async migrateData(previousVersion) {
    try {
      // Get old data
      const oldData = await chrome.storage.sync.get();
      
      // Transform old format to new format if needed
      // This is where you'd handle any breaking changes in data structure
      
      console.log('Data migration completed');
    } catch (error) {
      console.error('Migration failed:', error);
    }
  }

  async handleCommand(command) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return;

      switch (command) {
        case 'open-popup':
          // Open popup programmatically if possible, or inject content script
          await this.ensureContentScript(tab.id, tab.url);
          chrome.action.openPopup();
          break;
          
        case 'quick-hide':
          // Enter tweak mode directly
          await this.ensureContentScript(tab.id, tab.url);
          await chrome.tabs.sendMessage(tab.id, { action: 'startTweak' });
          break;
      }
    } catch (error) {
      console.error('Command handling failed:', error);
    }
  }

  async handleMessage(message, sender, sendResponse) {
    try {
      switch (message.action) {
        case 'contentScriptReady':
          // Content script is ready, no action needed
          sendResponse({ success: true });
          break;
          
        case 'getSettings':
          const settings = await chrome.storage.sync.get('settings');
          sendResponse(settings.settings || {});
          break;
          
        case 'saveSettings':
          await chrome.storage.sync.set({ settings: message.settings });
          sendResponse({ success: true });
          break;
          
        case 'exportSiteData':
          const result = await this.exportSiteData(message.host);
          sendResponse(result);
          break;
          
        case 'importSiteData':
          const importResult = await this.importSiteData(message.host, message.data);
          sendResponse(importResult);
          break;
          
        default:
          sendResponse({ error: 'Unknown action' });
      }
    } catch (error) {
      sendResponse({ error: error.message });
    }
  }

  async ensureContentScript(tabId, url) {
    // Check if content script is already injected
    try {
      await chrome.tabs.sendMessage(tabId, { action: 'ping' });
    } catch (error) {
      // Content script not ready, inject it
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: ['content/content.js']
        });

        await chrome.scripting.insertCSS({
          target: { tabId },
          files: ['assets/styles.css']
        });
      } catch (injectionError) {
        console.error('Failed to inject content script:', injectionError);
      }
    }
  }

  async exportSiteData(host) {
    try {
      const data = await chrome.storage.sync.get(`profile:${host}`);
      return {
        success: true,
        data: data[`profile:${host}`] || null
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  async importSiteData(host, data) {
    try {
      await chrome.storage.sync.set({
        [`profile:${host}`]: data
      });
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Utility method to get active tab
  async getActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab;
  }

  // Clean up old data if storage is getting full
  async cleanupStorage() {
    const data = await chrome.storage.sync.get();
    const size = JSON.stringify(data).length;
    
    // Chrome sync storage limit is ~100KB
    if (size > 80000) {
      // Remove old entries based on lastSeen
      const profiles = Object.entries(data).filter(([key]) => key.startsWith('profile:'));
      profiles.sort((a, b) => {
        const aTime = a[1].meta?.lastSeen || 0;
        const bTime = b[1].meta?.lastSeen || 0;
        return aTime - bTime; // Oldest first
      });
      
      // Remove oldest 25%
      const toRemove = profiles.slice(0, Math.ceil(profiles.length * 0.25));
      const keysToRemove = toRemove.map(([key]) => key);
      
      if (keysToRemove.length > 0) {
        await chrome.storage.sync.remove(keysToRemove);
        console.log(`Cleaned up ${keysToRemove.length} old profiles`);
      }
    }
  }
}

// Initialize background service
new BackgroundService();

// Periodic cleanup (once per day)
chrome.alarms.create('cleanup', { periodInMinutes: 24 * 60 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'cleanup') {
    new BackgroundService().cleanupStorage();
  }
});