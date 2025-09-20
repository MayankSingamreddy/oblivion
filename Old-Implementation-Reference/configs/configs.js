// Element Remover Pro - Configurations Management
class ConfigsManager {
  constructor() {
    this.allConfigs = [];
    this.filteredConfigs = [];
    this.currentFilter = 'all';
    this.searchTerm = '';
    
    this.initializeElements();
    this.setupEventListeners();
    this.loadConfigurations();
  }

  initializeElements() {
    // Stats elements
    this.totalSites = document.getElementById('totalSites');
    this.totalRules = document.getElementById('totalRules');
    this.lastUsed = document.getElementById('lastUsed');
    
    // Search and filter elements
    this.searchInput = document.getElementById('searchInput');
    this.searchBtn = document.getElementById('searchBtn');
    this.filterButtons = document.querySelectorAll('.filter-btn');
    
    // Lists and states
    this.configsList = document.getElementById('configsList');
    this.emptyState = document.getElementById('emptyState');
    this.loadingState = document.getElementById('loadingState');
    
    // Action buttons
    this.exportAllBtn = document.getElementById('exportAllBtn');
    this.importBtn = document.getElementById('importBtn');
    this.clearAllBtn = document.getElementById('clearAllBtn');
    this.importFile = document.getElementById('importFile');
    
    // Modal elements
    this.modal = document.getElementById('configModal');
    this.modalTitle = document.getElementById('modalTitle');
    this.modalSite = document.getElementById('modalSite');
    this.modalRuleCount = document.getElementById('modalRuleCount');
    this.modalCreated = document.getElementById('modalCreated');
    this.modalRulesList = document.getElementById('modalRulesList');
    this.modalEdit = document.getElementById('modalEdit');
    this.modalDelete = document.getElementById('modalDelete');
    this.modalCancel = document.getElementById('modalCancel');
    this.modalClose = document.getElementById('modalClose');
  }

  setupEventListeners() {
    // Search functionality
    this.searchInput.addEventListener('input', () => this.handleSearch());
    this.searchBtn.addEventListener('click', () => this.handleSearch());
    this.searchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.handleSearch();
    });

    // Filter buttons
    this.filterButtons.forEach(btn => {
      btn.addEventListener('click', () => this.handleFilter(btn.dataset.filter));
    });

    // Action buttons
    this.exportAllBtn.addEventListener('click', () => this.exportAllConfigs());
    this.importBtn.addEventListener('click', () => this.importFile.click());
    this.importFile.addEventListener('change', () => this.handleImport());
    this.clearAllBtn.addEventListener('click', () => this.clearAllConfigs());

    // Modal events
    this.modalClose.addEventListener('click', () => this.closeModal());
    this.modalCancel.addEventListener('click', () => this.closeModal());
    this.modalDelete.addEventListener('click', () => this.handleDeleteConfig());
    this.modalEdit.addEventListener('click', () => this.handleEditConfig());
    
    // Close modal on backdrop click
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) this.closeModal();
    });

    // Escape key to close modal
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.modal.style.display !== 'none') {
        this.closeModal();
      }
    });
  }

  async loadConfigurations() {
    try {
      this.showLoading(true);
      
      // Get all storage keys starting with 'rules:'
      const storage = await chrome.storage.sync.get(null);
      const configs = [];
      
      for (const [key, value] of Object.entries(storage)) {
        if (key.startsWith('rules:') && Array.isArray(value) && value.length > 0) {
          const hostname = key.replace('rules:', '');
          
          // Calculate stats
          const ruleCount = value.length;
          const createdAt = Math.min(...value.map(rule => rule.createdAt || Date.now()));
          const lastUsed = Math.max(...value.map(rule => rule.lastUsed || rule.createdAt || Date.now()));
          
          configs.push({
            hostname,
            rules: value,
            ruleCount,
            createdAt,
            lastUsed,
            key
          });
        }
      }
      
      // Sort by last used (most recent first)
      configs.sort((a, b) => b.lastUsed - a.lastUsed);
      
      this.allConfigs = configs;
      this.filteredConfigs = [...configs];
      
      this.updateStats();
      this.renderConfigs();
      this.showLoading(false);
      
    } catch (error) {
      console.error('Failed to load configurations:', error);
      this.showError('Failed to load configurations');
      this.showLoading(false);
    }
  }

  updateStats() {
    const totalSites = this.allConfigs.length;
    const totalRules = this.allConfigs.reduce((sum, config) => sum + config.ruleCount, 0);
    const lastUsedDate = this.allConfigs.length > 0 
      ? new Date(Math.max(...this.allConfigs.map(c => c.lastUsed)))
      : null;
    
    this.totalSites.textContent = totalSites;
    this.totalRules.textContent = totalRules;
    this.lastUsed.textContent = lastUsedDate 
      ? this.formatDate(lastUsedDate)
      : 'Never';
  }

  renderConfigs() {
    if (this.filteredConfigs.length === 0) {
      this.showEmpty(true);
      return;
    }
    
    this.showEmpty(false);
    
    this.configsList.innerHTML = this.filteredConfigs.map(config => 
      this.createConfigCard(config)
    ).join('');
    
    // Add event listeners to config cards
    this.configsList.addEventListener('click', (e) => {
      const card = e.target.closest('.config-card');
      if (card && !e.target.closest('.config-action')) {
        const hostname = card.dataset.hostname;
        this.showConfigDetails(hostname);
      }
      
      // Handle action buttons
      if (e.target.closest('.config-action')) {
        const action = e.target.closest('.config-action');
        const hostname = action.closest('.config-card').dataset.hostname;
        
        if (action.classList.contains('delete')) {
          this.deleteConfig(hostname);
        } else if (action.classList.contains('edit')) {
          this.editConfig(hostname);
        }
      }
    });
  }

  createConfigCard(config) {
    const siteIcon = this.getSiteIcon(config.hostname);
    const createdDate = new Date(config.createdAt);
    const lastUsedDate = new Date(config.lastUsed);
    
    return `
      <div class="config-card" data-hostname="${config.hostname}">
        <div class="config-header">
          <div class="config-site">
            <span class="site-icon">${siteIcon}</span>
            ${config.hostname}
          </div>
          <div class="config-actions">
            <button class="config-action edit" title="Edit Configuration">✏️</button>
            <button class="config-action delete" title="Delete Configuration">🗑️</button>
          </div>
        </div>
        
        <div class="config-details">
          <div class="config-stat">
            <div class="config-stat-number">${config.ruleCount}</div>
            <div class="config-stat-label">Rules</div>
          </div>
          <div class="config-stat">
            <div class="config-stat-number">${this.formatDate(createdDate, true)}</div>
            <div class="config-stat-label">Created</div>
          </div>
          <div class="config-stat">
            <div class="config-stat-number">${this.formatDate(lastUsedDate, true)}</div>
            <div class="config-stat-label">Last Used</div>
          </div>
        </div>
        
        <div class="config-meta">
          Click to view details • ${config.rules.length} hidden elements
        </div>
      </div>
    `;
  }

  getSiteIcon(hostname) {
    const icons = {
      'x.com': '🐦',
      'twitter.com': '🐦',
      'youtube.com': '📺',
      'reddit.com': '🤖',
      'facebook.com': '👤',
      'instagram.com': '📷',
      'linkedin.com': '💼',
      'github.com': '🐙',
      'stackoverflow.com': '📚',
      'medium.com': '✍️',
      'news.ycombinator.com': '🗞️'
    };
    
    return icons[hostname] || '🌐';
  }

  handleSearch() {
    this.searchTerm = this.searchInput.value.toLowerCase().trim();
    this.applyFilters();
  }

  handleFilter(filter) {
    // Update active button
    this.filterButtons.forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.querySelector(`[data-filter="${filter}"]`);
    if (activeBtn) activeBtn.classList.add('active');
    
    this.currentFilter = filter;
    this.applyFilters();
  }

  applyFilters() {
    let filtered = [...this.allConfigs];
    
    // Apply search filter
    if (this.searchTerm) {
      filtered = filtered.filter(config => 
        config.hostname.toLowerCase().includes(this.searchTerm) ||
        config.rules.some(rule => 
          rule.description?.toLowerCase().includes(this.searchTerm) ||
          rule.selector?.toLowerCase().includes(this.searchTerm)
        )
      );
    }
    
    // Apply category filter
    switch (this.currentFilter) {
      case 'recent':
        const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
        filtered = filtered.filter(config => config.lastUsed > oneDayAgo);
        break;
      case 'most-rules':
        filtered.sort((a, b) => b.ruleCount - a.ruleCount);
        break;
      default: // 'all'
        filtered.sort((a, b) => b.lastUsed - a.lastUsed);
    }
    
    this.filteredConfigs = filtered;
    this.renderConfigs();
  }

  showConfigDetails(hostname) {
    const config = this.allConfigs.find(c => c.hostname === hostname);
    if (!config) return;
    
    this.modalSite.textContent = hostname;
    this.modalRuleCount.textContent = `${config.ruleCount} rules`;
    this.modalCreated.textContent = this.formatDate(new Date(config.createdAt));
    
    // Populate rules list
    this.modalRulesList.innerHTML = config.rules.map(rule => `
      <div class="rule-item">
        <div class="rule-description">${rule.description || 'Unnamed Rule'}</div>
        <div class="rule-selector">${rule.selector}</div>
      </div>
    `).join('');
    
    // Store current config for modal actions
    this.currentModalConfig = config;
    
    this.showModal();
  }

  showModal() {
    this.modal.style.display = 'flex';
  }

  closeModal() {
    this.modal.style.display = 'none';
    this.currentModalConfig = null;
  }

  async handleDeleteConfig() {
    if (!this.currentModalConfig) return;
    
    if (confirm(`Are you sure you want to delete the configuration for ${this.currentModalConfig.hostname}? This action cannot be undone.`)) {
      await this.deleteConfig(this.currentModalConfig.hostname);
      this.closeModal();
    }
  }

  handleEditConfig() {
    if (!this.currentModalConfig) return;
    
    // Open the site in a new tab for editing
    const url = `https://${this.currentModalConfig.hostname}`;
    chrome.tabs.create({ url });
    this.closeModal();
  }

  async deleteConfig(hostname) {
    try {
      const key = `rules:${hostname}`;
      await chrome.storage.sync.remove(key);
      
      // Remove from local arrays
      this.allConfigs = this.allConfigs.filter(c => c.hostname !== hostname);
      this.filteredConfigs = this.filteredConfigs.filter(c => c.hostname !== hostname);
      
      this.updateStats();
      this.renderConfigs();
      this.showSuccess(`Configuration for ${hostname} deleted`);
      
    } catch (error) {
      console.error('Failed to delete configuration:', error);
      this.showError(`Failed to delete configuration for ${hostname}`);
    }
  }

  async editConfig(hostname) {
    // Open the site in a new tab for editing
    const url = `https://${hostname}`;
    chrome.tabs.create({ url });
  }

  async exportAllConfigs() {
    try {
      const exportData = {
        version: '1.0',
        exported: new Date().toISOString(),
        configurations: this.allConfigs.map(config => ({
          hostname: config.hostname,
          rules: config.rules,
          createdAt: config.createdAt,
          lastUsed: config.lastUsed
        }))
      };
      
      const blob = new Blob([JSON.stringify(exportData, null, 2)], {
        type: 'application/json'
      });
      
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `element-remover-configs-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      this.showSuccess('Configurations exported successfully');
      
    } catch (error) {
      console.error('Failed to export configurations:', error);
      this.showError('Failed to export configurations');
    }
  }

  async handleImport() {
    const file = this.importFile.files[0];
    if (!file) return;
    
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      
      if (!data.configurations || !Array.isArray(data.configurations)) {
        throw new Error('Invalid configuration file format');
      }
      
      // Import configurations
      for (const config of data.configurations) {
        if (config.hostname && config.rules && Array.isArray(config.rules)) {
          const key = `rules:${config.hostname}`;
          await chrome.storage.sync.set({
            [key]: config.rules
          });
        }
      }
      
      // Reload configurations
      await this.loadConfigurations();
      
      this.showSuccess(`Imported ${data.configurations.length} configurations`);
      
    } catch (error) {
      console.error('Failed to import configurations:', error);
      this.showError('Failed to import configurations. Please check the file format.');
    }
    
    // Reset file input
    this.importFile.value = '';
  }

  async clearAllConfigs() {
    if (!confirm('Are you sure you want to delete ALL configurations? This action cannot be undone.')) {
      return;
    }
    
    if (!confirm('This will permanently delete all your saved site configurations. Are you absolutely sure?')) {
      return;
    }
    
    try {
      // Get all keys to remove
      const keysToRemove = this.allConfigs.map(config => config.key);
      await chrome.storage.sync.remove(keysToRemove);
      
      // Clear local data
      this.allConfigs = [];
      this.filteredConfigs = [];
      
      this.updateStats();
      this.renderConfigs();
      this.showSuccess('All configurations cleared');
      
    } catch (error) {
      console.error('Failed to clear configurations:', error);
      this.showError('Failed to clear all configurations');
    }
  }

  showLoading(show) {
    this.loadingState.style.display = show ? 'block' : 'none';
    this.configsList.style.display = show ? 'none' : 'block';
  }

  showEmpty(show) {
    this.emptyState.style.display = show ? 'block' : 'none';
    this.configsList.style.display = show ? 'none' : 'block';
  }

  showSuccess(message) {
    this.showToast(message, 'success');
  }

  showError(message) {
    this.showToast(message, 'error');
  }

  showToast(message, type = 'info') {
    // Create toast element
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 10000;
      padding: 12px 20px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      color: white;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      transform: translateX(100%);
      transition: transform 0.3s ease;
      ${type === 'success' ? 'background: #10b981;' : 
        type === 'error' ? 'background: #ef4444;' : 
        'background: #3b82f6;'}
    `;
    
    document.body.appendChild(toast);
    
    // Animate in
    requestAnimationFrame(() => {
      toast.style.transform = 'translateX(0)';
    });
    
    // Remove after delay
    setTimeout(() => {
      toast.style.transform = 'translateX(100%)';
      setTimeout(() => {
        if (toast.parentNode) {
          document.body.removeChild(toast);
        }
      }, 300);
    }, 3000);
  }

  formatDate(date, short = false) {
    const now = new Date();
    const diff = now - date;
    
    // If less than 24 hours, show relative time
    if (diff < 24 * 60 * 60 * 1000) {
      if (diff < 60 * 1000) return 'Just now';
      if (diff < 60 * 60 * 1000) return `${Math.floor(diff / (60 * 1000))}m ago`;
      return `${Math.floor(diff / (60 * 60 * 1000))}h ago`;
    }
    
    // If less than 7 days, show days ago
    if (diff < 7 * 24 * 60 * 60 * 1000) {
      return `${Math.floor(diff / (24 * 60 * 60 * 1000))}d ago`;
    }
    
    // Otherwise show formatted date
    if (short) {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    
    return date.toLocaleDateString('en-US', { 
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new ConfigsManager();
});
