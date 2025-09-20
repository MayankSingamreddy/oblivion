// Options page for Oblivion Chrome Extension
import { StorageManager } from '../modules/storage';
import { NLAgent } from '../modules/nlAgent';
import { PresetManager } from '../modules/presets';
class OptionsInterface {
    constructor() {
        this.settings = null;
        this.storageManager = new StorageManager();
        this.nlAgent = new NLAgent(this.storageManager);
        this.presetManager = new PresetManager(this.storageManager);
        this.init();
    }
    async init() {
        await this.loadSettings();
        this.setupEventListeners();
        await this.updateUI();
        await this.updateStorageInfo();
        this.updateVersionInfo();
    }
    async loadSettings() {
        try {
            this.settings = await this.storageManager.loadSettings();
        }
        catch (error) {
            console.error('Failed to load settings:', error);
            // Use default settings
            this.settings = {
                aiEnabled: true,
                aiModel: 'gpt-4o-mini',
                apiKey: '',
                fallbackEnabled: true,
                syncEnabled: true,
                localModelEnabled: true,
                globalPreferences: {
                    blockCookieNags: false,
                    reduceMotion: false,
                    dimAutoplay: false,
                    autoApplyRules: true
                }
            };
        }
    }
    setupEventListeners() {
        // Setting controls
        document.getElementById('useLocalAI')?.addEventListener('change', (e) => this.handleSettingChange('localModelEnabled', e.target.checked));
        document.getElementById('apiKey')?.addEventListener('input', (e) => this.handleSettingChange('apiKey', e.target.value));
        document.getElementById('model')?.addEventListener('change', (e) => this.handleSettingChange('aiModel', e.target.value));
        document.getElementById('warnInteractive')?.addEventListener('change', (e) => {
            if (!this.settings)
                return;
            this.settings.globalPreferences.autoApplyRules = e.target.checked;
            this.showUnsavedChanges();
        });
        document.getElementById('enableAutoRevert')?.addEventListener('change', (e) => {
            if (!this.settings)
                return;
            this.settings.globalPreferences.blockCookieNags = e.target.checked;
            this.showUnsavedChanges();
        });
        document.getElementById('enableSync')?.addEventListener('change', (e) => this.handleSettingChange('syncEnabled', e.target.checked));
        // Action buttons
        document.getElementById('saveBtn')?.addEventListener('click', () => this.handleSave());
        document.getElementById('testAIBtn')?.addEventListener('click', () => this.handleTestAI());
        document.getElementById('resetBtn')?.addEventListener('click', () => this.handleReset());
        document.getElementById('cleanupBtn')?.addEventListener('click', () => this.handleCleanup());
        // Import/Export
        document.getElementById('exportBtn')?.addEventListener('click', () => this.handleExport());
        document.getElementById('importBtn')?.addEventListener('click', () => this.handleImportClick());
        document.getElementById('importFile')?.addEventListener('change', (e) => this.handleImportFile(e));
        // Watch for local AI setting changes to toggle remote settings visibility
        this.updateRemoteSettingsVisibility();
        document.getElementById('useLocalAI')?.addEventListener('change', () => this.updateRemoteSettingsVisibility());
    }
    async updateUI() {
        if (!this.settings)
            return;
        // Update form fields
        this.setCheckboxValue('useLocalAI', this.settings.localModelEnabled);
        this.setInputValue('apiKey', this.settings.apiKey || '');
        this.setInputValue('apiEndpoint', 'https://api.openai.com/v1'); // Hardcoded for now
        this.setSelectValue('model', this.settings.aiModel || 'gpt-4o-mini');
        this.setInputValue('maxElements', '100'); // Hardcoded for now
        this.setCheckboxValue('warnInteractive', this.settings.globalPreferences.autoApplyRules);
        this.setCheckboxValue('enableAutoRevert', this.settings.globalPreferences.blockCookieNags);
        this.setCheckboxValue('enableSync', this.settings.syncEnabled);
        this.updateRemoteSettingsVisibility();
    }
    updateRemoteSettingsVisibility() {
        const useLocalAI = document.getElementById('useLocalAI')?.checked ?? true;
        const remoteSettings = document.querySelector('.remote-ai-settings');
        if (remoteSettings) {
            remoteSettings.style.opacity = useLocalAI ? '0.6' : '1';
            remoteSettings.style.pointerEvents = useLocalAI ? 'none' : 'auto';
        }
    }
    async updateStorageInfo() {
        try {
            const stats = await this.storageManager.getStorageStats();
            const storageUsed = document.getElementById('storageUsed');
            const storageText = document.getElementById('storageText');
            if (storageUsed && storageText) {
                const percentage = Math.round((stats.used / stats.quota) * 100);
                storageUsed.style.width = `${Math.min(percentage, 100)}%`;
                const usedKB = Math.round(stats.used / 1024);
                const totalKB = Math.round(stats.quota / 1024);
                storageText.textContent = `${usedKB} KB used of ${totalKB} KB (${stats.hostCount} sites, ${stats.ruleCount} rules)`;
                // Update storage bar color based on usage
                if (percentage > 80) {
                    storageUsed.style.background = 'linear-gradient(90deg, #ef4444, #dc2626)';
                }
                else if (percentage > 60) {
                    storageUsed.style.background = 'linear-gradient(90deg, #f59e0b, #d97706)';
                }
                else {
                    storageUsed.style.background = 'linear-gradient(90deg, #10b981, #3b82f6)';
                }
            }
        }
        catch (error) {
            console.error('Failed to update storage info:', error);
        }
    }
    updateVersionInfo() {
        const versionInfo = document.getElementById('versionInfo');
        const buildInfo = document.getElementById('buildInfo');
        if (versionInfo) {
            versionInfo.textContent = chrome.runtime.getManifest().version;
        }
        if (buildInfo) {
            // Generate build info from timestamp
            const buildDate = new Date().toISOString().split('T')[0];
            buildInfo.textContent = `${buildDate}-${Math.random().toString(36).substr(2, 6)}`;
        }
    }
    handleSettingChange(key, value) {
        if (!this.settings)
            return;
        this.settings[key] = value;
        // Show unsaved changes indicator
        this.showUnsavedChanges();
    }
    async handleSave() {
        if (!this.settings)
            return;
        try {
            await this.storageManager.saveSettings(this.settings);
            this.showStatus('Settings saved successfully', 'success');
            this.hideUnsavedChanges();
        }
        catch (error) {
            console.error('Failed to save settings:', error);
            this.showStatus('Failed to save settings', 'error');
        }
    }
    async handleTestAI() {
        if (!this.settings)
            return;
        this.showStatus('Testing AI connection...', 'processing');
        try {
            // Test AI configuration
            const testQuery = "Find elements with role='banner'";
            const result = await this.nlAgent.generateSelectors(testQuery);
            if (result.selectors && result.selectors.length > 0) {
                this.showStatus('AI connection successful!', 'success');
            }
            else {
                throw new Error('AI returned no results');
            }
        }
        catch (error) {
            console.error('AI test failed:', error);
            this.showStatus('AI connection failed. Check your configuration.', 'error');
        }
    }
    async handleReset() {
        const confirmed = confirm('Reset all settings to defaults? This cannot be undone.');
        if (!confirmed)
            return;
        try {
            // Reset to default settings
            this.settings = {
                aiEnabled: true,
                aiModel: 'gpt-4o-mini',
                apiKey: '',
                fallbackEnabled: true,
                syncEnabled: true,
                localModelEnabled: true,
                globalPreferences: {
                    blockCookieNags: false,
                    reduceMotion: false,
                    dimAutoplay: false,
                    autoApplyRules: true
                }
            };
            await this.storageManager.saveSettings(this.settings);
            await this.updateUI();
            this.showStatus('Settings reset to defaults', 'success');
        }
        catch (error) {
            console.error('Failed to reset settings:', error);
            this.showStatus('Failed to reset settings', 'error');
        }
    }
    async handleCleanup() {
        const confirmed = confirm('Clean up unused rules and data? This will remove rules for sites you haven\'t visited recently.');
        if (!confirmed)
            return;
        try {
            const cleaned = await this.storageManager.performMaintenance();
            await this.updateStorageInfo();
            this.showStatus(`Cleanup complete! Removed ${cleaned.cleaned} unused items, saved ${(cleaned.size / 1024).toFixed(1)}KB.`, 'success');
        }
        catch (error) {
            console.error('Cleanup failed:', error);
            this.showStatus('Cleanup failed', 'error');
        }
    }
    async handleExport() {
        try {
            const exportData = await this.storageManager.exportData();
            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `oblivion-backup-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            this.showStatus('Export completed', 'success');
        }
        catch (error) {
            console.error('Export failed:', error);
            this.showStatus('Export failed', 'error');
        }
    }
    handleImportClick() {
        const fileInput = document.getElementById('importFile');
        fileInput?.click();
    }
    async handleImportFile(e) {
        const file = e.target.files?.[0];
        if (!file)
            return;
        try {
            const text = await file.text();
            const importData = JSON.parse(text);
            // Validate import data
            if (!importData.version || !importData.data) {
                throw new Error('Invalid backup file format');
            }
            const confirmed = confirm(`Import ${importData.stats?.ruleCount || 'unknown'} rules from ${importData.stats?.hostCount || 'unknown'} sites? This will merge with your existing data.`);
            if (!confirmed)
                return;
            await this.storageManager.importData(importData);
            await this.updateStorageInfo();
            this.showStatus('Import completed successfully', 'success');
        }
        catch (error) {
            console.error('Import failed:', error);
            this.showStatus('Import failed. Please check the file format.', 'error');
        }
    }
    // Utility methods
    setInputValue(id, value) {
        const element = document.getElementById(id);
        if (element) {
            element.value = value;
        }
    }
    setCheckboxValue(id, value) {
        const element = document.getElementById(id);
        if (element) {
            element.checked = value;
        }
    }
    setSelectValue(id, value) {
        const element = document.getElementById(id);
        if (element) {
            element.value = value;
        }
    }
    showStatus(message, type) {
        const statusEl = document.getElementById('statusMessage');
        if (!statusEl)
            return;
        statusEl.textContent = message;
        statusEl.className = `status-message ${type}`;
        statusEl.style.display = 'block';
        if (type !== 'processing') {
            setTimeout(() => {
                statusEl.style.display = 'none';
            }, 5000);
        }
    }
    showUnsavedChanges() {
        const saveBtn = document.getElementById('saveBtn');
        if (saveBtn && !saveBtn.textContent?.includes('*')) {
            saveBtn.textContent = 'Save Settings *';
            saveBtn.style.backgroundColor = '#f59e0b';
        }
    }
    hideUnsavedChanges() {
        const saveBtn = document.getElementById('saveBtn');
        if (saveBtn) {
            saveBtn.textContent = 'Save Settings';
            saveBtn.style.backgroundColor = '#3b82f6';
        }
    }
}
// Initialize options page when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new OptionsInterface());
}
else {
    new OptionsInterface();
}
//# sourceMappingURL=options.js.map