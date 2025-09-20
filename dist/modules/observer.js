export class DOMObserver {
    constructor(ruleEngine, storage) {
        this.mutationObserver = null;
        this.isObserving = false;
        this.pendingMutations = new Set();
        this.debounceTimer = null;
        this.criticalStylesInjected = false;
        this.options = {
            watchAttributes: true,
            watchChildList: true,
            watchSubtree: true,
            debounceMs: 100,
            batchSize: 50
        };
        this.ruleEngine = ruleEngine;
        this.storage = storage;
        this.host = window.location.hostname;
        this.initialize();
    }
    async initialize() {
        // Inject critical CSS immediately if possible
        if (document.readyState === 'loading') {
            await this.injectCriticalCSS();
        }
        // Start observing when DOM is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                this.startObserving();
                this.applyInitialRules();
            });
        }
        else {
            this.startObserving();
            this.applyInitialRules();
        }
    }
    // Inject critical CSS at document_start for zero-flicker hiding
    async injectCriticalCSS() {
        if (this.criticalStylesInjected)
            return;
        try {
            const rules = await this.storage.loadHostRules(this.host);
            const criticalRules = rules.filter(rule => rule.action === 'hide' && !rule.strategy.preserveLayout);
            if (criticalRules.length > 0) {
                this.ruleEngine.injectCriticalCSS(criticalRules);
                this.criticalStylesInjected = true;
                console.log(`🚀 Injected critical CSS for ${criticalRules.length} rules`);
            }
        }
        catch (error) {
            console.warn('Failed to inject critical CSS:', error);
        }
    }
    // Start observing DOM changes
    startObserving() {
        if (this.isObserving || !document.body)
            return;
        this.mutationObserver = new MutationObserver(this.handleMutations.bind(this));
        this.mutationObserver.observe(document.body, {
            childList: this.options.watchChildList,
            subtree: this.options.watchSubtree,
            attributes: this.options.watchAttributes,
            attributeFilter: ['class', 'id', 'data-testid', 'role'] // Only watch relevant attributes
        });
        this.isObserving = true;
        console.log('👀 DOM observer started');
    }
    // Stop observing DOM changes  
    stopObserving() {
        if (!this.isObserving)
            return;
        if (this.mutationObserver) {
            this.mutationObserver.disconnect();
            this.mutationObserver = null;
        }
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }
        this.pendingMutations.clear();
        this.isObserving = false;
        console.log('🛑 DOM observer stopped');
    }
    // Handle mutation events with debouncing and batching
    handleMutations(mutations) {
        let hasRelevantChanges = false;
        for (const mutation of mutations) {
            if (mutation.type === 'childList') {
                // Check for added nodes
                for (const node of Array.from(mutation.addedNodes)) {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        const element = node;
                        // Skip our own UI elements
                        if (this.isOblivionElement(element))
                            continue;
                        this.pendingMutations.add(element);
                        hasRelevantChanges = true;
                        // Also check descendants of added element
                        const descendants = element.querySelectorAll('*');
                        for (let i = 0; i < Math.min(descendants.length, 20); i++) {
                            this.pendingMutations.add(descendants[i]);
                        }
                    }
                }
            }
            else if (mutation.type === 'attributes') {
                const element = mutation.target;
                if (!this.isOblivionElement(element)) {
                    this.pendingMutations.add(element);
                    hasRelevantChanges = true;
                }
            }
        }
        // Debounce rule application to avoid excessive processing
        if (hasRelevantChanges) {
            this.debouncedApplyRules();
        }
    }
    debouncedApplyRules() {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
        this.debounceTimer = setTimeout(() => {
            this.processPendingMutations();
        }, this.options.debounceMs);
    }
    async processPendingMutations() {
        if (this.pendingMutations.size === 0)
            return;
        try {
            const rules = await this.storage.loadHostRules(this.host);
            if (rules.length === 0) {
                this.pendingMutations.clear();
                return;
            }
            const elements = Array.from(this.pendingMutations).slice(0, this.options.batchSize);
            this.pendingMutations.clear();
            let appliedCount = 0;
            // Test each rule against new elements
            for (const rule of rules) {
                if (!this.ruleEngine.validateRule(rule))
                    continue;
                try {
                    // Check if any new elements match this rule's selector
                    const matchingElements = elements.filter(el => {
                        try {
                            return el.matches && el.matches(rule.selector);
                        }
                        catch {
                            return false;
                        }
                    });
                    if (matchingElements.length > 0) {
                        const count = this.ruleEngine.applyRule(rule);
                        appliedCount += count;
                    }
                }
                catch (error) {
                    console.warn('Failed to test rule against new elements:', rule.selector, error);
                }
            }
            if (appliedCount > 0) {
                console.log(`🔄 Applied ${appliedCount} rules to new DOM elements`);
            }
        }
        catch (error) {
            console.error('Failed to process pending mutations:', error);
        }
    }
    // Apply initial rules when page loads
    async applyInitialRules() {
        try {
            const rules = await this.storage.loadHostRules(this.host);
            if (rules.length === 0)
                return;
            let totalApplied = 0;
            for (const rule of rules) {
                if (this.ruleEngine.validateRule(rule)) {
                    const applied = this.ruleEngine.applyRule(rule);
                    totalApplied += applied;
                }
            }
            if (totalApplied > 0) {
                console.log(`✨ Applied ${totalApplied} saved rules to ${rules.length} selectors`);
            }
        }
        catch (error) {
            console.error('Failed to apply initial rules:', error);
        }
    }
    // Watch for specific selectors (useful for arrive-style functionality)
    watchForSelector(selector, callback) {
        if (!this.isObserving) {
            this.startObserving();
        }
        const selectorCallback = (mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === 'childList') {
                    for (const node of Array.from(mutation.addedNodes)) {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            const element = node;
                            try {
                                // Check element itself
                                if (element.matches && element.matches(selector)) {
                                    callback(element);
                                }
                                // Check descendants
                                const matches = element.querySelectorAll(selector);
                                for (const match of Array.from(matches)) {
                                    callback(match);
                                }
                            }
                            catch (error) {
                                console.warn('Invalid selector for watching:', selector, error);
                            }
                        }
                    }
                }
            }
        };
        // Create separate observer for this selector
        const observer = new MutationObserver(selectorCallback);
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
        // Also check existing elements
        try {
            const existing = document.querySelectorAll(selector);
            for (const element of Array.from(existing)) {
                callback(element);
            }
        }
        catch (error) {
            console.warn('Invalid selector for initial check:', selector, error);
        }
        // Return cleanup function
        return () => {
            observer.disconnect();
        };
    }
    // Handle SPA navigation detection
    setupSPADetection() {
        // Monitor pushState/popState for client-side navigation
        const originalPushState = history.pushState;
        const originalReplaceState = history.replaceState;
        history.pushState = function (...args) {
            originalPushState.apply(history, args);
            setTimeout(() => {
                DOMObserver.getInstance()?.handleSPANavigation();
            }, 100);
        };
        history.replaceState = function (...args) {
            originalReplaceState.apply(history, args);
            setTimeout(() => {
                DOMObserver.getInstance()?.handleSPANavigation();
            }, 100);
        };
        // Listen for popstate events
        window.addEventListener('popstate', () => {
            setTimeout(() => {
                this.handleSPANavigation();
            }, 100);
        });
        // Monitor hash changes
        window.addEventListener('hashchange', () => {
            setTimeout(() => {
                this.handleSPANavigation();
            }, 50);
        });
    }
    handleSPANavigation() {
        console.log('🔄 SPA navigation detected, reapplying rules...');
        // Clear pending mutations since page context changed
        this.pendingMutations.clear();
        // Reapply all rules after short delay to let new content load
        setTimeout(() => {
            this.applyInitialRules();
        }, 200);
    }
    // Check if element is part of Oblivion's UI
    isOblivionElement(element) {
        return element.hasAttribute('data-oblivion-ui') ||
            element.closest('[data-oblivion-ui]') !== null ||
            element.id === 'oblivion-selection-overlay' ||
            element.id === 'oblivion-mode-indicator';
    }
    // Pause observation temporarily (useful during bulk operations)
    pauseObservation() {
        if (this.mutationObserver && this.isObserving) {
            this.mutationObserver.disconnect();
        }
    }
    // Resume observation
    resumeObservation() {
        if (this.isObserving && document.body) {
            this.mutationObserver = new MutationObserver(this.handleMutations.bind(this));
            this.mutationObserver.observe(document.body, {
                childList: this.options.watchChildList,
                subtree: this.options.watchSubtree,
                attributes: this.options.watchAttributes,
                attributeFilter: ['class', 'id', 'data-testid', 'role']
            });
        }
    }
    // Update observer configuration
    updateOptions(newOptions) {
        Object.assign(this.options, newOptions);
        if (this.isObserving) {
            this.stopObserving();
            this.startObserving();
        }
    }
    // Get current observation status
    getStatus() {
        return {
            isObserving: this.isObserving,
            pendingMutations: this.pendingMutations.size,
            criticalStylesInjected: this.criticalStylesInjected
        };
    }
    // Force reapplication of all rules (useful for debugging)
    async forceReapplyRules() {
        try {
            const rules = await this.storage.loadHostRules(this.host);
            let totalApplied = 0;
            for (const rule of rules) {
                if (this.ruleEngine.validateRule(rule)) {
                    const applied = this.ruleEngine.applyRule(rule);
                    totalApplied += applied;
                }
            }
            console.log(`🔄 Force reapplied ${totalApplied} rules`);
            return totalApplied;
        }
        catch (error) {
            console.error('Failed to force reapply rules:', error);
            return 0;
        }
    }
    // Clean up resources
    destroy() {
        this.stopObserving();
        // Remove any critical style tags we created
        const criticalStyle = document.getElementById('oblivion-critical');
        if (criticalStyle && criticalStyle.parentNode) {
            criticalStyle.parentNode.removeChild(criticalStyle);
        }
    }
    static getInstance() {
        return this.instance;
    }
    static setInstance(instance) {
        this.instance = instance;
    }
}
// Singleton pattern for global access
DOMObserver.instance = null;
// Specialized class for handling iframe content
export class FrameObserver {
    constructor(ruleEngine, storage) {
        this.frameObservers = new Map();
        this.ruleEngine = ruleEngine;
        this.storage = storage;
        this.initializeFrameWatching();
    }
    initializeFrameWatching() {
        // Watch for new iframes
        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === 'childList') {
                    for (const node of Array.from(mutation.addedNodes)) {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            const element = node;
                            // Check for new iframes
                            const iframes = element.tagName === 'IFRAME'
                                ? [element]
                                : Array.from(element.querySelectorAll('iframe'));
                            for (const iframe of iframes) {
                                this.setupFrameObserver(iframe);
                            }
                        }
                    }
                }
            }
        });
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
        // Setup observers for existing iframes
        const existingIframes = document.querySelectorAll('iframe');
        for (const iframe of Array.from(existingIframes)) {
            this.setupFrameObserver(iframe);
        }
    }
    setupFrameObserver(iframe) {
        try {
            // Only observe same-origin iframes for security reasons
            const iframeSrc = iframe.src;
            if (!iframeSrc || !this.isSameOrigin(iframeSrc)) {
                return;
            }
            iframe.addEventListener('load', () => {
                try {
                    const iframeDoc = iframe.contentDocument;
                    if (!iframeDoc)
                        return;
                    // Create observer for iframe content
                    const frameObserver = new DOMObserver(this.ruleEngine, this.storage);
                    this.frameObservers.set(iframe, frameObserver);
                    console.log('📱 Setup observer for iframe:', iframeSrc);
                }
                catch (error) {
                    console.warn('Cannot access iframe content:', error);
                }
            });
        }
        catch (error) {
            console.warn('Failed to setup frame observer:', error);
        }
    }
    isSameOrigin(url) {
        try {
            const urlObj = new URL(url, window.location.href);
            return urlObj.origin === window.location.origin;
        }
        catch {
            return false;
        }
    }
    // Clean up frame observers
    destroy() {
        for (const observer of this.frameObservers.values()) {
            observer.destroy();
        }
        this.frameObservers.clear();
    }
}
//# sourceMappingURL=observer.js.map