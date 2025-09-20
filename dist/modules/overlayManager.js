export class OverlayManager {
    constructor(selectorEngine, ruleEngine) {
        this.isActive = false;
        this.overlay = null;
        this.highlightElements = [];
        this.currentTarget = null;
        this.boundHandlers = {};
        this.toastContainer = null;
        this.selectorEngine = selectorEngine;
        this.ruleEngine = ruleEngine;
        this.bindEventHandlers();
    }
    bindEventHandlers() {
        this.boundHandlers = {
            mousemove: this.handleMouseMove.bind(this),
            click: this.handleClick.bind(this),
            keydown: this.handleKeydown.bind(this),
            contextmenu: this.handleContextMenu.bind(this),
            scroll: this.handleScroll.bind(this)
        };
    }
    // Enter selection mode with full-page overlay
    enterSelectionMode() {
        if (this.isActive)
            return;
        this.isActive = true;
        this.createOverlay();
        this.attachEventListeners();
        this.showModeIndicator();
        this.createToastContainer();
        // Change cursor for the entire page
        document.body.style.cursor = 'crosshair';
        console.log('🎯 Selection mode activated');
    }
    // Exit selection mode
    exitSelectionMode() {
        if (!this.isActive)
            return;
        this.isActive = false;
        this.removeOverlay();
        this.detachEventListeners();
        this.clearHighlights();
        this.hideModeIndicator();
        this.removeToastContainer();
        // Restore cursor
        document.body.style.cursor = '';
        console.log('✅ Selection mode deactivated');
    }
    // Toggle selection mode
    toggleSelectionMode() {
        if (this.isActive) {
            this.exitSelectionMode();
        }
        else {
            this.enterSelectionMode();
        }
        return this.isActive;
    }
    createOverlay() {
        if (this.overlay)
            return;
        this.overlay = document.createElement('div');
        this.overlay.id = 'oblivion-selection-overlay';
        this.overlay.setAttribute('data-oblivion-ui', 'true');
        // Make overlay cover entire viewport and be transparent
        this.overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      z-index: 2147483647;
      pointer-events: auto;
      background: transparent;
      cursor: crosshair;
      user-select: none;
    `;
        // Insert overlay at the very end of body
        document.body.appendChild(this.overlay);
    }
    removeOverlay() {
        if (this.overlay && this.overlay.parentNode) {
            this.overlay.parentNode.removeChild(this.overlay);
            this.overlay = null;
        }
    }
    attachEventListeners() {
        if (!this.overlay)
            return;
        // Attach to overlay to intercept all events
        this.overlay.addEventListener('mousemove', this.boundHandlers.mousemove, { passive: true });
        this.overlay.addEventListener('click', this.boundHandlers.click, { capture: true });
        this.overlay.addEventListener('contextmenu', this.boundHandlers.contextmenu);
        // Global listeners
        document.addEventListener('keydown', this.boundHandlers.keydown);
        window.addEventListener('scroll', this.boundHandlers.scroll, { passive: true });
    }
    detachEventListeners() {
        if (this.overlay) {
            this.overlay.removeEventListener('mousemove', this.boundHandlers.mousemove);
            this.overlay.removeEventListener('click', this.boundHandlers.click, { capture: true });
            this.overlay.removeEventListener('contextmenu', this.boundHandlers.contextmenu);
        }
        document.removeEventListener('keydown', this.boundHandlers.keydown);
        window.removeEventListener('scroll', this.boundHandlers.scroll);
    }
    handleMouseMove(event) {
        const mouseEvent = event;
        // Temporarily disable pointer events on overlay to detect element underneath
        if (this.overlay) {
            this.overlay.style.pointerEvents = 'none';
        }
        const elementUnder = document.elementFromPoint(mouseEvent.clientX, mouseEvent.clientY);
        // Re-enable pointer events
        if (this.overlay) {
            this.overlay.style.pointerEvents = 'auto';
        }
        if (elementUnder && this.isValidSelectionTarget(elementUnder)) {
            if (this.currentTarget !== elementUnder) {
                this.currentTarget = elementUnder;
                this.updateHighlight(elementUnder);
            }
        }
        else {
            this.currentTarget = null;
            this.clearHighlights();
        }
    }
    handleClick(event) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        const mouseEvent = event;
        if (!this.currentTarget)
            return;
        // Additional safety check for interactive elements
        const isInteractive = this.ruleEngine.isInteractiveElement(this.currentTarget);
        if (isInteractive) {
            const confirmed = this.showInteractiveWarning(this.currentTarget);
            if (!confirmed)
                return;
        }
        // Generate rule for the selected element
        this.createRuleFromSelection(this.currentTarget, mouseEvent.shiftKey);
    }
    handleContextMenu(event) {
        event.preventDefault();
        if (this.currentTarget) {
            this.showContextMenu(event);
        }
    }
    handleKeydown(event) {
        const keyEvent = event;
        switch (keyEvent.key) {
            case 'Escape':
                this.exitSelectionMode();
                keyEvent.preventDefault();
                break;
            case 'h':
                if (this.currentTarget) {
                    this.createRuleFromSelection(this.currentTarget, false, 'hide');
                    keyEvent.preventDefault();
                }
                break;
            case 'b':
                if (this.currentTarget) {
                    this.createRuleFromSelection(this.currentTarget, false, 'blank');
                    keyEvent.preventDefault();
                }
                break;
            case 'r':
                if (this.currentTarget) {
                    this.createRuleFromSelection(this.currentTarget, false, 'replace');
                    keyEvent.preventDefault();
                }
                break;
        }
    }
    handleScroll() {
        // Clear highlights on scroll to avoid misalignment
        this.clearHighlights();
    }
    updateHighlight(element) {
        this.clearHighlights();
        const rect = element.getBoundingClientRect();
        const scrollX = window.pageXOffset || document.documentElement.scrollLeft;
        const scrollY = window.pageYOffset || document.documentElement.scrollTop;
        // Create main highlight box
        const highlight = this.createHighlightElement(rect.left + scrollX, rect.top + scrollY, rect.width, rect.height, this.ruleEngine.isInteractiveElement(element));
        this.highlightElements.push(highlight);
        document.body.appendChild(highlight);
        // Show element info tooltip
        this.showElementInfo(element, rect);
    }
    createHighlightElement(x, y, width, height, isInteractive) {
        const highlight = document.createElement('div');
        highlight.setAttribute('data-oblivion-ui', 'true');
        highlight.style.cssText = `
      position: absolute;
      left: ${x}px;
      top: ${y}px;
      width: ${width}px;
      height: ${height}px;
      z-index: 2147483646;
      pointer-events: none;
      border: 2px solid ${isInteractive ? '#f59e0b' : '#3b82f6'};
      background: ${isInteractive ? 'rgba(245, 158, 11, 0.1)' : 'rgba(59, 130, 246, 0.1)'};
      border-radius: 4px;
      box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.8);
      transition: all 0.1s ease;
    `;
        // Add animation effect
        highlight.animate([
            { opacity: 0, transform: 'scale(0.95)' },
            { opacity: 1, transform: 'scale(1)' }
        ], { duration: 150, easing: 'ease-out' });
        return highlight;
    }
    showElementInfo(element, rect) {
        const info = document.createElement('div');
        info.setAttribute('data-oblivion-ui', 'true');
        info.style.cssText = `
      position: absolute;
      left: ${rect.left + window.pageXOffset}px;
      top: ${rect.top + window.pageYOffset - 30}px;
      z-index: 2147483647;
      background: rgba(0, 0, 0, 0.9);
      color: white;
      padding: 4px 8px;
      border-radius: 4px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 11px;
      font-weight: 500;
      pointer-events: none;
      white-space: nowrap;
      max-width: 200px;
      overflow: hidden;
      text-overflow: ellipsis;
    `;
        const tagName = element.tagName.toLowerCase();
        const className = element.className ? `.${Array.from(element.classList).slice(0, 2).join('.')}` : '';
        const id = element.id ? `#${element.id}` : '';
        const isInteractive = this.ruleEngine.isInteractiveElement(element);
        info.textContent = `${tagName}${id}${className} ${isInteractive ? '⚠️' : ''}`;
        this.highlightElements.push(info);
        document.body.appendChild(info);
        // Auto-remove after delay
        setTimeout(() => {
            if (info.parentNode) {
                info.parentNode.removeChild(info);
            }
        }, 3000);
    }
    clearHighlights() {
        this.highlightElements.forEach(element => {
            if (element.parentNode) {
                element.parentNode.removeChild(element);
            }
        });
        this.highlightElements = [];
    }
    createRuleFromSelection(element, useParent = false, actionType = 'hide') {
        const targetElement = useParent && element.parentElement ? element.parentElement : element;
        const selectorResult = this.selectorEngine.generate(targetElement);
        const rule = {
            id: crypto.randomUUID(),
            host: window.location.hostname,
            action: actionType,
            selector: selectorResult.selector,
            strategy: {
                preserveLayout: actionType === 'blank',
                collapseSpace: actionType === 'hide'
            },
            notes: selectorResult.description,
            createdAt: Date.now(),
            version: 1,
            anchors: selectorResult.anchors,
            confidence: selectorResult.confidence
        };
        // Validate and apply rule
        if (this.ruleEngine.validateRule(rule)) {
            const appliedCount = this.ruleEngine.applyRule(rule);
            if (appliedCount > 0) {
                this.showToast(`${actionType.charAt(0).toUpperCase() + actionType.slice(1)}: ${rule.notes} (${appliedCount} elements)`, 'success');
                // Store rule for persistence (this would integrate with storage)
                this.notifyRuleCreated(rule);
            }
            else {
                this.showToast('No elements were affected', 'warning');
            }
        }
        else {
            this.showToast('Invalid selector generated', 'error');
        }
    }
    showInteractiveWarning(element) {
        // Create modal-like warning for interactive elements
        const warning = document.createElement('div');
        warning.setAttribute('data-oblivion-ui', 'true');
        warning.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      z-index: 2147483647;
      background: white;
      border: 2px solid #f59e0b;
      border-radius: 8px;
      padding: 20px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);
      max-width: 300px;
    `;
        const tagName = element.tagName.toLowerCase();
        const text = element.textContent?.trim().substring(0, 50) || '';
        warning.innerHTML = `
      <h3 style="margin: 0 0 10px 0; color: #f59e0b;">⚠️ Interactive Element</h3>
      <p style="margin: 0 0 15px 0; font-size: 14px; color: #333;">
        You're about to hide a <strong>${tagName}</strong> element that users can interact with.
        ${text ? `<br><em>"${text}..."</em>` : ''}
      </p>
      <div style="display: flex; gap: 10px; justify-content: flex-end;">
        <button id="cancel-btn" style="padding: 8px 16px; border: 1px solid #ccc; background: white; border-radius: 4px; cursor: pointer;">Cancel</button>
        <button id="confirm-btn" style="padding: 8px 16px; border: none; background: #f59e0b; color: white; border-radius: 4px; cursor: pointer;">Hide Anyway</button>
      </div>
    `;
        document.body.appendChild(warning);
        return new Promise((resolve) => {
            const cleanup = () => {
                if (warning.parentNode) {
                    warning.parentNode.removeChild(warning);
                }
            };
            const confirmBtn = warning.querySelector('#confirm-btn');
            const cancelBtn = warning.querySelector('#cancel-btn');
            confirmBtn?.addEventListener('click', () => {
                cleanup();
                resolve(true);
            });
            cancelBtn?.addEventListener('click', () => {
                cleanup();
                resolve(false);
            });
            // Auto-cancel after 10 seconds
            setTimeout(() => {
                cleanup();
                resolve(false);
            }, 10000);
        }); // Type assertion to work around Promise return
    }
    showContextMenu(event) {
        const menu = document.createElement('div');
        menu.setAttribute('data-oblivion-ui', 'true');
        menu.style.cssText = `
      position: absolute;
      left: ${event.pageX}px;
      top: ${event.pageY}px;
      z-index: 2147483647;
      background: white;
      border: 1px solid #ccc;
      border-radius: 6px;
      padding: 8px 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      min-width: 150px;
    `;
        const options = [
            { text: '👻 Hide Element', action: () => this.createRuleFromSelection(this.currentTarget, false, 'hide') },
            { text: '🫥 Blank Element', action: () => this.createRuleFromSelection(this.currentTarget, false, 'blank') },
            { text: '🔄 Replace Element', action: () => this.createRuleFromSelection(this.currentTarget, false, 'replace') },
            { text: '📦 Hide Parent', action: () => this.createRuleFromSelection(this.currentTarget, true, 'hide') }
        ];
        options.forEach(option => {
            const item = document.createElement('div');
            item.textContent = option.text;
            item.style.cssText = `
        padding: 8px 16px;
        cursor: pointer;
        transition: background-color 0.15s;
      `;
            item.addEventListener('mouseenter', () => {
                item.style.backgroundColor = '#f3f4f6';
            });
            item.addEventListener('mouseleave', () => {
                item.style.backgroundColor = '';
            });
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                option.action();
                menu.remove();
            });
            menu.appendChild(item);
        });
        document.body.appendChild(menu);
        // Remove menu when clicking elsewhere
        const removeMenu = () => {
            if (menu.parentNode) {
                menu.parentNode.removeChild(menu);
            }
            document.removeEventListener('click', removeMenu);
        };
        setTimeout(() => {
            document.addEventListener('click', removeMenu);
        }, 100);
    }
    isValidSelectionTarget(element) {
        // Skip our own UI elements
        if (element.hasAttribute('data-oblivion-ui') ||
            element.closest('[data-oblivion-ui]')) {
            return false;
        }
        // Skip critical page elements
        if (['HTML', 'HEAD', 'BODY'].includes(element.tagName)) {
            return false;
        }
        // Skip script/style elements
        if (['SCRIPT', 'STYLE', 'LINK', 'META'].includes(element.tagName)) {
            return false;
        }
        // Must be visible
        const rect = element.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) {
            return false;
        }
        return true;
    }
    showModeIndicator() {
        const indicator = document.createElement('div');
        indicator.id = 'oblivion-mode-indicator';
        indicator.setAttribute('data-oblivion-ui', 'true');
        indicator.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 2147483647;
      background: rgba(0, 0, 0, 0.9);
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 14px;
      backdrop-filter: blur(10px);
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
      user-select: none;
    `;
        indicator.innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px;">
        <span style="font-size: 18px;">🎯</span>
        <div>
          <div style="font-weight: 600;">Selection Mode Active</div>
          <div style="font-size: 12px; opacity: 0.8;">Click elements to hide • Right-click for options • ESC to exit</div>
        </div>
      </div>
    `;
        document.body.appendChild(indicator);
    }
    hideModeIndicator() {
        const indicator = document.getElementById('oblivion-mode-indicator');
        if (indicator && indicator.parentNode) {
            indicator.parentNode.removeChild(indicator);
        }
    }
    createToastContainer() {
        if (this.toastContainer)
            return;
        this.toastContainer = document.createElement('div');
        this.toastContainer.id = 'oblivion-toast-container';
        this.toastContainer.setAttribute('data-oblivion-ui', 'true');
        this.toastContainer.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 2147483647;
      display: flex;
      flex-direction: column;
      gap: 8px;
      pointer-events: none;
    `;
        document.body.appendChild(this.toastContainer);
    }
    removeToastContainer() {
        if (this.toastContainer && this.toastContainer.parentNode) {
            this.toastContainer.parentNode.removeChild(this.toastContainer);
            this.toastContainer = null;
        }
    }
    showToast(message, type = 'success') {
        if (!this.toastContainer)
            return;
        const toast = document.createElement('div');
        toast.setAttribute('data-oblivion-ui', 'true');
        const colors = {
            success: { bg: '#10b981', border: '#059669' },
            warning: { bg: '#f59e0b', border: '#d97706' },
            error: { bg: '#ef4444', border: '#dc2626' }
        };
        toast.style.cssText = `
      background: ${colors[type].bg};
      color: white;
      padding: 12px 16px;
      border-radius: 6px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      font-size: 13px;
      font-weight: 500;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      border: 1px solid ${colors[type].border};
      max-width: 300px;
      pointer-events: auto;
    `;
        toast.textContent = message;
        this.toastContainer.appendChild(toast);
        // Animate in
        toast.animate([
            { opacity: 0, transform: 'translateX(100%)' },
            { opacity: 1, transform: 'translateX(0)' }
        ], { duration: 300, easing: 'ease-out' });
        // Remove after delay
        setTimeout(() => {
            if (toast.parentNode) {
                toast.animate([
                    { opacity: 1, transform: 'translateX(0)' },
                    { opacity: 0, transform: 'translateX(100%)' }
                ], { duration: 200, easing: 'ease-in' }).addEventListener('finish', () => {
                    if (toast.parentNode) {
                        toast.parentNode.removeChild(toast);
                    }
                });
            }
        }, 3000);
    }
    notifyRuleCreated(rule) {
        // This would notify the storage system and other components
        // For now, just log it
        console.log('Rule created:', rule);
        // Could dispatch custom event
        document.dispatchEvent(new CustomEvent('oblivion:rule-created', {
            detail: rule
        }));
    }
    // Public methods for external control
    isSelectionModeActive() {
        return this.isActive;
    }
    getCurrentTarget() {
        return this.currentTarget;
    }
    // Method to programmatically create rule from selector
    createRuleFromSelector(selector, action = 'hide') {
        const elements = document.querySelectorAll(selector);
        if (elements.length === 0)
            return false;
        const rule = {
            id: crypto.randomUUID(),
            host: window.location.hostname,
            action,
            selector,
            strategy: {
                preserveLayout: action === 'blank',
                collapseSpace: action === 'hide'
            },
            notes: `Manual rule: ${selector}`,
            createdAt: Date.now(),
            version: 1,
            confidence: 0.8
        };
        if (this.ruleEngine.validateRule(rule)) {
            const appliedCount = this.ruleEngine.applyRule(rule);
            this.notifyRuleCreated(rule);
            return appliedCount > 0;
        }
        return false;
    }
}
//# sourceMappingURL=overlayManager.js.map