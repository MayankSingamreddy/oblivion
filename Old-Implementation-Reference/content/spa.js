// SPA-aware navigation and early injection
class SPAManager {
  constructor(onRouteChange) {
    this.onRouteChange = onRouteChange;
    this.currentPath = location.pathname;
    this.setupListeners();
  }

  setupListeners() {
    // Listen for programmatic navigation
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function(...args) {
      originalPushState.apply(history, args);
      this.handleRouteChange();
    }.bind(this);

    history.replaceState = function(...args) {
      originalReplaceState.apply(history, args);  
      this.handleRouteChange();
    }.bind(this);

    // Listen for back/forward navigation
    window.addEventListener('popstate', () => {
      this.handleRouteChange();
    });

    // Watch for hash changes
    window.addEventListener('hashchange', () => {
      this.handleRouteChange();
    });

    // Watch for DOM changes that might indicate route change
    if (this.isLikelySPA()) {
      this.setupMutationWatcher();
    }
  }

  handleRouteChange() {
    const newPath = location.pathname;
    if (newPath !== this.currentPath) {
      this.currentPath = newPath;
      if (this.onRouteChange) {
        // Small delay to let the new content render
        setTimeout(() => this.onRouteChange(newPath), 100);
      }
    }
  }

  isLikelySPA() {
    // Detect if this is likely a SPA based on common frameworks
    return !!(
      window.React ||
      window.Vue ||
      window.Angular ||
      document.querySelector('[data-reactroot]') ||
      document.querySelector('[ng-app]') ||
      document.querySelector('[data-vue-app]') ||
      // Check for common SPA indicators
      document.querySelector('script[src*="react"]') ||
      document.querySelector('script[src*="vue"]') ||
      document.querySelector('script[src*="angular"]') ||
      document.querySelector('script[src*="ember"]')
    );
  }

  setupMutationWatcher() {
    // Watch for major DOM changes that might indicate navigation
    const observer = new MutationObserver((mutations) => {
      let hasSignificantChange = false;
      
      mutations.forEach(mutation => {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              // Check if this looks like a main content area being replaced
              const isContentChange = node.matches && (
                node.matches('main, [role="main"], .main-content, #main, .content') ||
                node.querySelectorAll('main, [role="main"]').length > 0
              );
              
              if (isContentChange) {
                hasSignificantChange = true;
              }
            }
          });
        }
      });

      if (hasSignificantChange) {
        // Debounce rapid changes
        clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
          if (this.onRouteChange) {
            this.onRouteChange(location.pathname);
          }
        }, 200);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    this.mutationObserver = observer;
  }

  destroy() {
    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
    }
    clearTimeout(this.debounceTimer);
  }
}

window.SPAManager = SPAManager;