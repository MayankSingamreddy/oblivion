export class ThemeCapsule {
    constructor(storage) {
        this.shadowHost = null;
        this.shadowRoot = null;
        this.themeStyleTag = null;
        this.uiStyleTag = null;
        this.currentTheme = null;
        this.components = new Map();
        // Default theme tokens
        this.defaultTokens = {
            '--obv-bg': '#ffffff',
            '--obv-accent': '#3b82f6',
            '--obv-font': '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            '--obv-text-color': '#1f2937',
            '--obv-border-radius': '8px'
        };
        this.storage = storage;
        this.host = window.location.hostname;
        this.initialize();
    }
    async initialize() {
        await this.loadHostTheme();
        this.createThemeCapsule();
        this.setupThemeObserver();
    }
    // Create the main ShadowRoot host for theme isolation
    createThemeCapsule() {
        if (this.shadowHost)
            return;
        // Create shadow host element
        this.shadowHost = document.createElement('oblivion-theme-capsule');
        this.shadowHost.setAttribute('data-oblivion-ui', 'true');
        this.shadowHost.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 0;
      height: 0;
      pointer-events: none;
      z-index: -1;
    `;
        // Attach shadow root
        this.shadowRoot = this.shadowHost.attachShadow({ mode: 'open' });
        // Create base styles within shadow root
        this.createShadowStyles();
        // Insert at the beginning of body
        if (document.body) {
            document.body.insertBefore(this.shadowHost, document.body.firstChild);
        }
        else {
            document.addEventListener('DOMContentLoaded', () => {
                if (document.body && this.shadowHost) {
                    document.body.insertBefore(this.shadowHost, document.body.firstChild);
                }
            });
        }
        console.log('🎨 Theme capsule created');
    }
    // Create isolated styles within the shadow root
    createShadowStyles() {
        if (!this.shadowRoot)
            return;
        // Create UI component styles
        this.uiStyleTag = document.createElement('style');
        this.uiStyleTag.textContent = this.getUIStyles();
        this.shadowRoot.appendChild(this.uiStyleTag);
        // Create dynamic theme styles
        this.themeStyleTag = document.createElement('style');
        this.shadowRoot.appendChild(this.themeStyleTag);
        this.applyThemeTokens();
    }
    // Apply theme tokens to both shadow root and page
    applyThemeTokens() {
        if (!this.themeStyleTag || !this.currentTheme)
            return;
        const { tokens } = this.currentTheme;
        // Apply tokens to the shadow root
        const shadowCSS = this.generateShadowCSS(tokens);
        this.themeStyleTag.textContent = shadowCSS;
        // Apply safe page-level theme overrides
        this.applyPageLevelTheme(tokens);
    }
    // Generate CSS for shadow root components
    generateShadowCSS(tokens) {
        return `
      :host {
        ${this.tokensToCSS(tokens)}
      }
      
      .obv-themed {
        background: var(--obv-bg);
        color: var(--obv-text-color);
        font-family: var(--obv-font);
        border-radius: var(--obv-border-radius);
      }
      
      .obv-accent {
        background: var(--obv-accent);
        color: white;
      }
      
      .obv-button {
        background: var(--obv-accent);
        color: white;
        border: none;
        padding: 8px 16px;
        border-radius: var(--obv-border-radius);
        font-family: var(--obv-font);
        cursor: pointer;
        transition: opacity 0.2s ease;
      }
      
      .obv-button:hover {
        opacity: 0.9;
      }
    `;
    }
    // Apply safe page-level theme modifications
    applyPageLevelTheme(tokens) {
        // Only apply safe, non-destructive changes to landmark elements
        const pageCSS = this.generatePageCSS(tokens);
        // Inject into page's head in a controlled way
        let pageThemeStyle = document.getElementById('oblivion-page-theme');
        if (!pageThemeStyle) {
            pageThemeStyle = document.createElement('style');
            pageThemeStyle.id = 'oblivion-page-theme';
            pageThemeStyle.setAttribute('data-oblivion-ui', 'true');
            document.head.appendChild(pageThemeStyle);
        }
        pageThemeStyle.textContent = pageCSS;
    }
    // Generate safe CSS for page-level theme application
    generatePageCSS(tokens) {
        // Only apply to safe selectors that won't break functionality
        const safeSelectors = [
            'html',
            'body',
            'main',
            'article',
            '.content',
            '.post',
            '.article-content'
        ];
        const rules = [];
        // Apply background and font changes carefully
        if (tokens['--obv-bg'] && tokens['--obv-bg'] !== this.defaultTokens['--obv-bg']) {
            rules.push(`
        html, body {
          background-color: ${tokens['--obv-bg']} !important;
          transition: background-color 0.3s ease;
        }
      `);
        }
        if (tokens['--obv-font'] && tokens['--obv-font'] !== this.defaultTokens['--obv-font']) {
            rules.push(`
        body, input, textarea, select, button {
          font-family: ${tokens['--obv-font']} !important;
        }
      `);
        }
        if (tokens['--obv-text-color'] && tokens['--obv-text-color'] !== this.defaultTokens['--obv-text-color']) {
            rules.push(`
        body {
          color: ${tokens['--obv-text-color']} !important;
        }
      `);
        }
        return rules.join('\n');
    }
    // Convert theme tokens to CSS custom properties
    tokensToCSS(tokens) {
        return Object.entries(tokens)
            .map(([key, value]) => `${key}: ${value};`)
            .join('\n');
    }
    // Load theme for current host
    async loadHostTheme() {
        try {
            const savedTheme = await this.storage.loadHostThemes(this.host);
            this.currentTheme = {
                tokens: savedTheme || { ...this.defaultTokens },
                applied: false,
                lastModified: Date.now()
            };
        }
        catch (error) {
            console.warn('Failed to load host theme:', error);
            this.currentTheme = {
                tokens: { ...this.defaultTokens },
                applied: false,
                lastModified: Date.now()
            };
        }
    }
    // Apply theme (public method)
    async applyTheme(tokens) {
        try {
            // Merge with current tokens
            const mergedTokens = {
                ...(this.currentTheme?.tokens || this.defaultTokens),
                ...tokens
            };
            this.currentTheme = {
                tokens: mergedTokens,
                applied: true,
                lastModified: Date.now()
            };
            this.applyThemeTokens();
            // Save to storage
            await this.storage.saveHostThemes(this.host, mergedTokens);
            console.log('🎨 Theme applied:', tokens);
            return true;
        }
        catch (error) {
            console.error('Failed to apply theme:', error);
            return false;
        }
    }
    // Reset theme to defaults
    async resetTheme() {
        try {
            this.currentTheme = {
                tokens: { ...this.defaultTokens },
                applied: true,
                lastModified: Date.now()
            };
            this.applyThemeTokens();
            // Clear from storage
            await this.storage.saveHostThemes(this.host, {});
            console.log('🎨 Theme reset to defaults');
            return true;
        }
        catch (error) {
            console.error('Failed to reset theme:', error);
            return false;
        }
    }
    // Create a themed UI component within shadow root
    createUIComponent(name, content, className = '') {
        if (!this.shadowRoot)
            return null;
        // Remove existing component if it exists
        const existing = this.components.get(name);
        if (existing && existing.parentNode) {
            existing.parentNode.removeChild(existing);
        }
        // Create new component
        const component = document.createElement('div');
        component.className = `obv-themed ${className}`;
        component.innerHTML = content;
        this.shadowRoot.appendChild(component);
        this.components.set(name, component);
        return component;
    }
    // Remove a UI component
    removeUIComponent(name) {
        const component = this.components.get(name);
        if (component && component.parentNode) {
            component.parentNode.removeChild(component);
            this.components.delete(name);
            return true;
        }
        return false;
    }
    // Create floating UI element (escapes shadow boundary)
    createFloatingUI(content, position) {
        const floatingUI = document.createElement('div');
        floatingUI.setAttribute('data-oblivion-ui', 'true');
        floatingUI.className = 'oblivion-floating-ui';
        // Apply theme styles inline to escape shadow root
        const tokens = this.currentTheme?.tokens || this.defaultTokens;
        floatingUI.style.cssText = `
      position: fixed;
      left: ${position.x}px;
      top: ${position.y}px;
      z-index: 2147483647;
      background: ${tokens['--obv-bg']};
      color: ${tokens['--obv-text-color']};
      font-family: ${tokens['--obv-font']};
      border-radius: ${tokens['--obv-border-radius']};
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
      border: 1px solid ${tokens['--obv-accent']};
      padding: 12px;
      max-width: 300px;
      pointer-events: auto;
    `;
        floatingUI.innerHTML = content;
        document.body.appendChild(floatingUI);
        return floatingUI;
    }
    // Setup theme change observer
    setupThemeObserver() {
        // Listen for system theme changes
        if (window.matchMedia) {
            const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
            darkModeQuery.addEventListener('change', (e) => {
                this.handleSystemThemeChange(e.matches);
            });
            // Check initial state
            this.handleSystemThemeChange(darkModeQuery.matches);
        }
    }
    handleSystemThemeChange(isDark) {
        // Auto-adapt theme based on system preference if no custom theme is set
        const hasCustomTheme = this.currentTheme &&
            JSON.stringify(this.currentTheme.tokens) !== JSON.stringify(this.defaultTokens);
        if (!hasCustomTheme) {
            const adaptedTokens = isDark ? this.getDarkThemeTokens() : this.getLightThemeTokens();
            this.applyTheme(adaptedTokens);
        }
    }
    getDarkThemeTokens() {
        return {
            '--obv-bg': '#1f2937',
            '--obv-accent': '#3b82f6',
            '--obv-font': this.defaultTokens['--obv-font'],
            '--obv-text-color': '#f9fafb',
            '--obv-border-radius': '8px'
        };
    }
    getLightThemeTokens() {
        return { ...this.defaultTokens };
    }
    // Get base UI styles for shadow root components
    getUIStyles() {
        return `
      * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }
      
      .obv-container {
        background: var(--obv-bg);
        color: var(--obv-text-color);
        font-family: var(--obv-font);
        border-radius: var(--obv-border-radius);
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
        border: 1px solid rgba(0, 0, 0, 0.1);
        overflow: hidden;
      }
      
      .obv-header {
        background: var(--obv-accent);
        color: white;
        padding: 12px 16px;
        font-weight: 600;
        border-bottom: 1px solid rgba(255, 255, 255, 0.2);
      }
      
      .obv-content {
        padding: 16px;
      }
      
      .obv-footer {
        background: rgba(0, 0, 0, 0.05);
        padding: 8px 16px;
        border-top: 1px solid rgba(0, 0, 0, 0.1);
        display: flex;
        justify-content: flex-end;
        gap: 8px;
      }
      
      .obv-button {
        background: var(--obv-accent);
        color: white;
        border: none;
        padding: 8px 16px;
        border-radius: calc(var(--obv-border-radius) / 2);
        font-family: var(--obv-font);
        font-size: 14px;
        cursor: pointer;
        transition: all 0.2s ease;
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
      
      .obv-button:hover {
        opacity: 0.9;
        transform: translateY(-1px);
      }
      
      .obv-button.secondary {
        background: rgba(0, 0, 0, 0.1);
        color: var(--obv-text-color);
      }
      
      .obv-input {
        width: 100%;
        padding: 8px 12px;
        border: 1px solid rgba(0, 0, 0, 0.2);
        border-radius: calc(var(--obv-border-radius) / 2);
        font-family: var(--obv-font);
        font-size: 14px;
        background: rgba(255, 255, 255, 0.8);
      }
      
      .obv-input:focus {
        outline: none;
        border-color: var(--obv-accent);
        box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
      }
    `;
    }
    // Get current theme state
    getCurrentTheme() {
        return this.currentTheme?.tokens || null;
    }
    // Check if theme is applied
    isThemeApplied() {
        return this.currentTheme?.applied || false;
    }
    // Create a theme picker UI
    createThemePicker() {
        const pickerContent = `
      <div class="obv-header">
        🎨 Customize Page Theme
      </div>
      <div class="obv-content">
        <div style="display: flex; flex-direction: column; gap: 12px;">
          <div>
            <label style="display: block; margin-bottom: 4px; font-weight: 500;">Background Color</label>
            <input type="color" class="obv-input" id="bg-color" value="${this.currentTheme?.tokens['--obv-bg'] || '#ffffff'}">
          </div>
          <div>
            <label style="display: block; margin-bottom: 4px; font-weight: 500;">Text Color</label>
            <input type="color" class="obv-input" id="text-color" value="${this.currentTheme?.tokens['--obv-text-color'] || '#1f2937'}">
          </div>
          <div>
            <label style="display: block; margin-bottom: 4px; font-weight: 500;">Accent Color</label>
            <input type="color" class="obv-input" id="accent-color" value="${this.currentTheme?.tokens['--obv-accent'] || '#3b82f6'}">
          </div>
        </div>
      </div>
      <div class="obv-footer">
        <button class="obv-button secondary" id="reset-theme">Reset</button>
        <button class="obv-button" id="apply-theme">Apply</button>
      </div>
    `;
        const picker = this.createUIComponent('theme-picker', pickerContent, 'obv-container');
        if (picker) {
            this.setupThemePickerEvents(picker);
        }
        return picker;
    }
    setupThemePickerEvents(picker) {
        const bgInput = picker.querySelector('#bg-color');
        const textInput = picker.querySelector('#text-color');
        const accentInput = picker.querySelector('#accent-color');
        const applyBtn = picker.querySelector('#apply-theme');
        const resetBtn = picker.querySelector('#reset-theme');
        // Live preview
        const updatePreview = () => {
            const tokens = {
                '--obv-bg': bgInput.value,
                '--obv-text-color': textInput.value,
                '--obv-accent': accentInput.value
            };
            this.currentTheme = {
                tokens: { ...this.currentTheme?.tokens, ...tokens },
                applied: false,
                lastModified: Date.now()
            };
            this.applyThemeTokens();
        };
        bgInput.addEventListener('input', updatePreview);
        textInput.addEventListener('input', updatePreview);
        accentInput.addEventListener('input', updatePreview);
        applyBtn.addEventListener('click', () => {
            this.applyTheme({
                '--obv-bg': bgInput.value,
                '--obv-text-color': textInput.value,
                '--obv-accent': accentInput.value
            });
            this.removeUIComponent('theme-picker');
        });
        resetBtn.addEventListener('click', () => {
            this.resetTheme();
            this.removeUIComponent('theme-picker');
        });
    }
    // Clean up all theme-related elements
    destroy() {
        // Remove page-level theme styles
        const pageThemeStyle = document.getElementById('oblivion-page-theme');
        if (pageThemeStyle && pageThemeStyle.parentNode) {
            pageThemeStyle.parentNode.removeChild(pageThemeStyle);
        }
        // Remove shadow host
        if (this.shadowHost && this.shadowHost.parentNode) {
            this.shadowHost.parentNode.removeChild(this.shadowHost);
        }
        // Clear components
        this.components.clear();
        // Remove floating UIs
        const floatingUIs = document.querySelectorAll('.oblivion-floating-ui');
        for (const ui of Array.from(floatingUIs)) {
            if (ui.parentNode) {
                ui.parentNode.removeChild(ui);
            }
        }
        console.log('🎨 Theme capsule destroyed');
    }
}
//# sourceMappingURL=themeCapsule.js.map