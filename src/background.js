// Background service worker
let activeRules = new Map();

chrome.runtime.onInstalled.addListener(() => {
  console.log('CleanView extension installed');
});

// Handle command shortcuts
chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle-popup') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.action.openPopup();
    });
  }
});

// Listen for tab updates to auto-apply rules
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    autoApplyRules(tabId, tab.url);
  }
});

// Auto-apply saved rules for domain
async function autoApplyRules(tabId, url) {
  try {
    const hostname = new URL(url).hostname;
    const result = await chrome.storage.local.get([hostname]);
    const rules = result[hostname];
    
    if (rules && rules.length > 0) {
      // Wait a bit for SPA content to load
      setTimeout(() => {
        chrome.tabs.sendMessage(tabId, {
          action: 'autoApplyRules',
          rules: rules
        });
      }, 1000);
    }
  } catch (error) {
    console.error('Error auto-applying rules:', error);
  }
}

// Handle messages from content script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'saveRule') {
    saveRule(request.hostname, request.rule);
  }
  return true;
});

async function saveRule(hostname, rule) {
  try {
    const result = await chrome.storage.local.get([hostname]);
    const existingRules = result[hostname] || [];
    existingRules.push({
      ...rule,
      lastAppliedAt: Date.now()
    });
    
    await chrome.storage.local.set({
      [hostname]: existingRules
    });
  } catch (error) {
    console.error('Error saving rule:', error);
  }
}
