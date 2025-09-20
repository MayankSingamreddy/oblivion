import { SelectorEngine } from '../modules/selectorEngine';
import { RuleEngine } from '../modules/ruleEngine';
import { OverlayManager } from '../modules/overlayManager';
import { StorageManager } from '../modules/storage';
import { DOMObserver, FrameObserver } from '../modules/observer';
import { ThemeCapsule } from '../modules/themeCapsule';
import { NLAgent, PatternFallback } from '../modules/nlAgent';
import { PresetManager } from '../modules/presets';
class OblivionContentScript {
    constructor() {
        this.isInitialized = false;
        this.settings = null;
        this.host = window.location.hostname;
        this.path = window.location.pathname;
        // Initialize core modules
        this.storage = new StorageManager();
        this.selectorEngine = new SelectorEngine();
        this.ruleEngine = new RuleEngine();
        this.overlayManager = new OverlayManager(this.selectorEngine, this.ruleEngine);
        this.domObserver = new DOMObserver(this.ruleEngine, this.storage);
        this.frameObserver = new FrameObserver(this.ruleEngine, this.storage);
        this.themeCapsule = new ThemeCapsule(this.storage);
        this.nlAgent = new NLAgent(this.storage);
        this.presetManager = new PresetManager(this.storage);
        this.patternFallback = new PatternFallback();
        this.initialize();
    }
    async initialize() {
        try {
            // Set singleton reference for DOMObserver
            DOMObserver.setInstance(this.domObserver);
            // Load settings
            this.settings = await this.storage.loadSettings();
            // Setup message handling
            this.setupMessageHandler();
            // Setup SPA detection
            this.domObserver.setupSPADetection();
            // Apply any saved rules for this host
            await this.applyPersistedRules();
            // Apply themes if available
            await this.applyPersistedThemes();
            this.isInitialized = true;
            // Notify background script we're ready
            chrome.runtime.sendMessage({
                action: 'contentScriptReady',
                host: this.host,
                path: this.path
            }).catch(() => {
                // Extension context might not be available yet
            });
            console.log('🚀 Oblivion content script initialized');
        }
        catch (error) {
            console.error('Failed to initialize Oblivion:', error);
        }
    }
    setupMessageHandler() {
        chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
            try {
                const response = await this.handleMessage(message);
                sendResponse(response);
            }
            catch (error) {
                sendResponse({ success: false, error: error.message });
            }
            return true; // Keep message channel open for async response
        });
    }
    async handleMessage(message) {
        switch (message.action) {
            case 'getPageInfo':
                return { success: true, data: await this.getPageInfo() };
            case 'applyRule':
                return await this.applyRule(message.rule);
            case 'removeRule':
                return await this.removeRule(message.ruleId);
            case 'startSelection':
                this.overlayManager.enterSelectionMode();
                return { success: true };
            case 'stopSelection':
                this.overlayManager.exitSelectionMode();
                return { success: true };
            case 'askAI':
                return await this.handleAIRequest(message.prompt);
            case 'undo':
                const undoSuccess = this.ruleEngine.undo();
                return { success: undoSuccess };
            case 'resetSite':
                return await this.resetSite(message.temporary);
            case 'saveConfig':
                return await this.saveCurrentConfig();
            case 'loadPreset':
                return await this.loadPreset(message.presetId);
            case 'applyTheme':
                const themeApplied = await this.themeCapsule.applyTheme(message.tokens);
                return { success: themeApplied };
            case 'exportConfig':
                return await this.exportConfig();
            case 'importConfig':
                return await this.importConfig(message.data);
            default:
                return { success: false, error: 'Unknown action' };
        }
    }
    async getPageInfo() {
        const preset = this.presetManager.getPresetForHost(this.host);
        const rules = await this.storage.loadHostRules(this.host);
        const appliedRules = this.ruleEngine.getAppliedRules();
        const themes = await this.storage.loadHostThemes(this.host);
        return {
            host: this.host,
            path: this.path,
            title: document.title,
            hasPreset: !!preset,
            hasSavedConfig: rules.length > 0,
            appliedCount: appliedRules.length,
            ruleCount: rules.length,
            isActive: appliedRules.length > 0,
            chips: this.detectCommonElements()
        };
    }
    detectCommonElements() {
        const patterns = {
            'trending': {
                selectors: ['[aria-label*="trending" i]', '[aria-label*="trend" i]', '*[title*="trending" i]'],
                name: 'Trending'
            },
            'sidebar': {
                selectors: ['aside', '[role="complementary"]', '*[class*="sidebar" i]'],
                name: 'Sidebar'
            },
            'recommendations': {
                selectors: ['*[aria-label*="recommend" i]', '*[class*="recommend" i]', '*[data-testid*="recommend" i]'],
                name: 'Recommendations'
            },
            'ads': {
                selectors: ['*[id*="ad" i]', '*[class*="ad" i]', '*[aria-label*="sponsor" i]'],
                name: 'Ads'
            },
            'comments': {
                selectors: ['#comments', '[class*="comment" i]', '[data-testid*="comment" i]'],
                name: 'Comments'
            }
        };
        const chips = [];
        for (const [key, pattern] of Object.entries(patterns)) {
            let found = false;
            let count = 0;
            for (const selector of pattern.selectors) {
                try {
                    const elements = document.querySelectorAll(selector);
                    if (elements.length > 0) {
                        found = true;
                        count = elements.length;
                        break;
                    }
                }
                catch (e) {
                    // Invalid selector, skip
                }
            }
            if (found) {
                chips.push({
                    id: key,
                    name: pattern.name,
                    selectors: pattern.selectors,
                    active: false, // TODO: Check if already hidden
                    count
                });
            }
        }
        return chips;
    }
    async applyRule(rule) {
        try {
            if (!this.ruleEngine.validateRule(rule)) {
                return { success: false, error: 'Invalid rule' };
            }
            const appliedCount = this.ruleEngine.applyRule(rule);
            if (appliedCount > 0) {
                // Save to storage for persistence
                await this.storage.saveRule(this.host, rule);
                return { success: true, data: { appliedCount } };
            }
            else {
                return { success: false, error: 'No elements matched the rule' };
            }
        }
        catch (error) {
            return { success: false, error: error.message };
        }
    }
    async removeRule(ruleId) {
        try {
            const removed = this.ruleEngine.removeRule(ruleId);
            if (removed) {
                await this.storage.removeRule(this.host, ruleId);
                return { success: true };
            }
            else {
                return { success: false, error: 'Rule not found' };
            }
        }
        catch (error) {
            return { success: false, error: error.message };
        }
    }
    async handleAIRequest(prompt) {
        try {
            // Try AI first if available
            if (this.settings?.aiEnabled) {
                const aiResponse = await this.nlAgent.generateSelectors(prompt);
                let totalApplied = 0;
                const results = [];
                for (const suggestion of aiResponse.selectors) {
                    const rule = {
                        id: crypto.randomUUID(),
                        host: this.host,
                        action: 'hide',
                        selector: suggestion.selector,
                        strategy: { preserveLayout: false, collapseSpace: true },
                        notes: suggestion.description,
                        createdAt: Date.now(),
                        version: 1,
                        confidence: suggestion.confidence
                    };
                    if (this.ruleEngine.validateRule(rule)) {
                        const count = this.ruleEngine.applyRule(rule);
                        if (count > 0) {
                            await this.storage.saveRule(this.host, rule);
                            totalApplied += count;
                            results.push({
                                description: rule.notes,
                                count,
                                selector: rule.selector
                            });
                        }
                    }
                }
                return {
                    success: true,
                    data: {
                        appliedCount: totalApplied,
                        results,
                        method: 'ai'
                    }
                };
            }
        }
        catch (error) {
            console.warn('AI request failed, falling back to patterns:', error);
        }
        // Fallback to pattern matching
        try {
            const patternResponse = this.patternFallback.generateSelectors(prompt);
            let totalApplied = 0;
            const results = [];
            for (const suggestion of patternResponse.selectors) {
                const rule = {
                    id: crypto.randomUUID(),
                    host: this.host,
                    action: 'hide',
                    selector: suggestion.selector,
                    strategy: { preserveLayout: false, collapseSpace: true },
                    notes: suggestion.description,
                    createdAt: Date.now(),
                    version: 1,
                    confidence: suggestion.confidence
                };
                if (this.ruleEngine.validateRule(rule)) {
                    const count = this.ruleEngine.applyRule(rule);
                    if (count > 0) {
                        await this.storage.saveRule(this.host, rule);
                        totalApplied += count;
                        results.push({
                            description: rule.notes,
                            count,
                            selector: rule.selector
                        });
                    }
                }
            }
            return {
                success: true,
                data: {
                    appliedCount: totalApplied,
                    results,
                    method: 'pattern-fallback'
                }
            };
        }
        catch (error) {
            return { success: false, error: error.message };
        }
    }
    async resetSite(temporary = true) {
        try {
            if (temporary) {
                // Just reset rules without clearing storage
                this.ruleEngine.resetAll();
                return { success: true, data: { temporary: true } };
            }
            else {
                // Clear storage and reset
                await this.storage.clearHostRules(this.host);
                this.ruleEngine.resetAll();
                return { success: true, data: { temporary: false } };
            }
        }
        catch (error) {
            return { success: false, error: error.message };
        }
    }
    async saveCurrentConfig() {
        try {
            const appliedRules = this.ruleEngine.getAppliedRules();
            if (appliedRules.length === 0) {
                return { success: false, error: 'No rules to save - apply some rules first' };
            }
            // Rules are already saved individually, just confirm
            const allRules = await this.storage.loadHostRules(this.host);
            return {
                success: true,
                data: {
                    savedCount: allRules.length,
                    host: this.host
                }
            };
        }
        catch (error) {
            return { success: false, error: error.message };
        }
    }
    async loadPreset(presetId) {
        try {
            const result = await this.presetManager.applyPreset(presetId);
            if (result.success) {
                // Reapply rules to current page
                await this.applyPersistedRules();
                return {
                    success: true,
                    data: {
                        applied: result.applied,
                        errors: result.errors
                    }
                };
            }
            else {
                return { success: false, error: result.errors.join(', ') };
            }
        }
        catch (error) {
            return { success: false, error: error.message };
        }
    }
    async exportConfig() {
        try {
            const data = await this.storage.exportData();
            return { success: true, data };
        }
        catch (error) {
            return { success: false, error: error.message };
        }
    }
    async importConfig(data) {
        try {
            const result = await this.storage.importData(data);
            return { success: result.success, data: result };
        }
        catch (error) {
            return { success: false, error: error.message };
        }
    }
    async applyPersistedRules() {
        try {
            const rules = await this.storage.loadHostRules(this.host);
            if (rules.length === 0)
                return;
            let appliedCount = 0;
            for (const rule of rules) {
                if (this.ruleEngine.validateRule(rule)) {
                    const count = this.ruleEngine.applyRule(rule);
                    appliedCount += count;
                }
            }
            if (appliedCount > 0) {
                console.log(`✅ Applied ${appliedCount} persisted rules from ${rules.length} total`);
            }
        }
        catch (error) {
            console.warn('Failed to apply persisted rules:', error);
        }
    }
    async applyPersistedThemes() {
        try {
            const themes = await this.storage.loadHostThemes(this.host);
            if (themes && Object.keys(themes).length > 0) {
                await this.themeCapsule.applyTheme(themes);
                console.log('🎨 Applied persisted theme tokens');
            }
        }
        catch (error) {
            console.warn('Failed to apply persisted themes:', error);
        }
    }
    // Public methods for testing and debugging
    getModules() {
        return {
            selectorEngine: this.selectorEngine,
            ruleEngine: this.ruleEngine,
            overlayManager: this.overlayManager,
            storage: this.storage,
            domObserver: this.domObserver,
            themeCapsule: this.themeCapsule,
            nlAgent: this.nlAgent,
            presetManager: this.presetManager
        };
    }
    getStats() {
        return {
            host: this.host,
            path: this.path,
            isInitialized: this.isInitialized,
            rules: this.ruleEngine.getStatistics(),
            observer: this.domObserver.getStatus(),
            theme: {
                applied: this.themeCapsule.isThemeApplied(),
                current: this.themeCapsule.getCurrentTheme()
            }
        };
    }
    // Cleanup when page unloads
    destroy() {
        try {
            this.overlayManager.exitSelectionMode();
            this.domObserver.destroy();
            this.frameObserver.destroy();
            this.themeCapsule.destroy();
            this.nlAgent.destroy();
            console.log('🧹 Oblivion content script cleaned up');
        }
        catch (error) {
            console.warn('Cleanup failed:', error);
        }
    }
}
// Initialize when DOM is ready
let oblivionInstance;
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        oblivionInstance = new OblivionContentScript();
    });
}
else {
    oblivionInstance = new OblivionContentScript();
}
// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (oblivionInstance) {
        oblivionInstance.destroy();
    }
});
// Expose for debugging in development
if (typeof window !== 'undefined') {
    window.oblivion = {
        getInstance: () => oblivionInstance,
        getStats: () => oblivionInstance?.getStats(),
        getModules: () => oblivionInstance?.getModules()
    };
}
//# sourceMappingURL=main.js.map