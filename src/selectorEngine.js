// Robust selector engine with multi-strategy approach
window.selectorEngine = {
    async findTargets(parsed, useLLM = true) {
      // Always try LLM-based approach first if available
      if (window.llmService) {
        try {
          console.log('CleanView selectorEngine: Using LLM-based analysis...');
          const llmResults = await window.llmService.generateSelectors(parsed.originalText);
          if (llmResults && llmResults.length > 0) {
            console.log('CleanView selectorEngine: LLM analysis successful:', llmResults);
            return llmResults;
          }
        } catch (error) {
          console.warn('CleanView selectorEngine: LLM analysis failed, falling back to traditional method:', error);
        }
      } else {
        console.warn('CleanView selectorEngine: LLM service not available, using traditional method');
      }

      // Fallback to traditional approach only if LLM fails or is unavailable
      console.log('CleanView selectorEngine: Using traditional analysis as fallback...');
      const candidates = this.collectCandidates();
      const scored = this.scoreCandidates(candidates);
      return this.mapToRequestedTargets(parsed.actions, scored);
    },
  
    collectCandidates() {
      const candidates = new Map();
      
      // Strategy A: Role/ARIA & Landmark Heuristics
      this.collectSemanticCandidates(candidates);
      
      // Strategy B: Text & Attribute Heuristics
      this.collectAttributeCandidates(candidates);
      
      // Strategy C: Geometry/Visual Heuristics
      this.collectGeometryCandidates(candidates);
      
      // Strategy D: Site-specific hints
      this.collectSiteSpecificCandidates(candidates);
      
      return candidates;
    },
  
    collectSemanticCandidates(candidates) {
      const semanticSelectors = {
        main: ['[role="main"]', 'main', '#main', '#content'],
        nav: ['[role="navigation"]', 'nav', '[aria-label*="navigation" i]'],
        sidebar: ['aside', '[role="complementary"]', '[aria-label*="sidebar" i]'],
        header: ['header', '[role="banner"]', '#header', '.header'],
        footer: ['footer', '[role="contentinfo"]', '#footer', '.footer']
      };
      
      Object.entries(semanticSelectors).forEach(([type, selectors]) => {
        selectors.forEach(selector => {
          try {
            const elements = document.querySelectorAll(selector);
            elements.forEach(el => {
              this.addCandidate(candidates, el, type, 'semantic', 5);
            });
          } catch (e) {
            // Invalid selector, skip
          }
        });
      });
    },
  
    collectAttributeCandidates(candidates) {
      const keywordPatterns = {
        sidebar: ['sidebar', 'rail', 'aside', 'secondary', 'pane', 'trends'],
        leftSidebar: ['left-rail', 'left-sidebar', 'left-pane', 'leftnav'],
        rightSidebar: ['right-rail', 'right-sidebar', 'right-pane', 'rightnav', 'trends'],
        ads: ['ad', 'ads', 'sponsor', 'promoted', 'dfp', 'gpt', 'ad-slot'],
        header: ['header', 'topbar', 'masthead', 'navbar'],
        footer: ['footer', 'bottom'],
        nav: ['nav', 'navigation', 'menu']
      };
      
      const allElements = document.querySelectorAll('*[class], *[id], *[data-testid], *[aria-label]');
      
      allElements.forEach(el => {
        const attrs = [
          el.className,
          el.id,
          el.getAttribute('data-testid') || '',
          el.getAttribute('aria-label') || '',
          el.getAttribute('data-component') || ''
        ].join(' ').toLowerCase();
        
        Object.entries(keywordPatterns).forEach(([type, keywords]) => {
          const matches = keywords.some(keyword => attrs.includes(keyword));
          if (matches) {
            this.addCandidate(candidates, el, type, 'attribute', 3);
          }
        });
      });
    },
  
    collectGeometryCandidates(candidates) {
      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;
      
      document.querySelectorAll('*').forEach(el => {
        const rect = el.getBoundingClientRect();
        
        // Skip very small or invisible elements
        if (rect.width < 48 || rect.height < 48 || !el.offsetParent) return;
        
        // Sidebar detection: narrow columns on left/right
        if (rect.height > viewportHeight * 0.5 && rect.width < 420) {
          if (rect.left < 50) {
            this.addCandidate(candidates, el, 'leftSidebar', 'geometry', 2);
          } else if (rect.right > viewportWidth - 50) {
            this.addCandidate(candidates, el, 'rightSidebar', 'geometry', 2);
          }
        }
        
        // Footer detection: wide elements near bottom
        if (rect.bottom > viewportHeight - 100 && rect.width > viewportWidth * 0.8) {
          this.addCandidate(candidates, el, 'footer', 'geometry', 2);
        }
        
        // Header detection: wide elements near top
        if (rect.top < 100 && rect.width > viewportWidth * 0.8) {
          this.addCandidate(candidates, el, 'header', 'geometry', 2);
        }
      });
    },
  
    collectSiteSpecificCandidates(candidates) {
      const hostname = window.location.hostname;
      
      const sitePatterns = {
        'x.com': {
          leftSidebar: ['[data-testid="sidebarColumn"]', 'nav[role="navigation"]'],
          rightSidebar: ['[data-testid="sidebarColumn"]:last-child', '[role="complementary"]'],
          main: ['[data-testid="primaryColumn"]', '[role="main"]']
        },
        'twitter.com': {
          leftSidebar: ['[data-testid="sidebarColumn"]', 'nav[role="navigation"]'],
          rightSidebar: ['[data-testid="sidebarColumn"]:last-child', '[role="complementary"]'],
          main: ['[data-testid="primaryColumn"]', '[role="main"]']
        },
        'youtube.com': {
          rightSidebar: ['#secondary', '#related'],
          main: ['#primary', '#columns #primary'],
          comments: ['#comments', '#comment-section']
        },
        'linkedin.com': {
          rightSidebar: ['aside', '.scaffold-layout__aside'],
          leftSidebar: ['.scaffold-layout__sidebar'],
          main: ['main', '.scaffold-layout__main']
        }
      };
      
      const patterns = sitePatterns[hostname];
      if (patterns) {
        Object.entries(patterns).forEach(([type, selectors]) => {
          selectors.forEach(selector => {
            try {
              const elements = document.querySelectorAll(selector);
              elements.forEach(el => {
                this.addCandidate(candidates, el, type, 'site-specific', 4);
              });
            } catch (e) {
              // Invalid selector, skip
            }
          });
        });
      }
    },
  
    addCandidate(candidates, element, type, source, score) {
      const key = this.getElementKey(element);
      
      if (!candidates.has(key)) {
        candidates.set(key, {
          element,
          types: new Map(),
          totalScore: 0
        });
      }
      
      const candidate = candidates.get(key);
      const currentScore = candidate.types.get(type) || 0;
      candidate.types.set(type, Math.max(currentScore, score));
      candidate.totalScore = Math.max(candidate.totalScore, score);
    },
  
    getElementKey(element) {
      // Create unique key for element
      const path = this.getElementPath(element);
      return path;
    },
  
    getElementPath(element) {
      const path = [];
      let current = element;
      
      while (current && current !== document.body) {
        let selector = current.tagName.toLowerCase();
        
        if (current.id) {
          selector += `#${current.id}`;
          path.unshift(selector);
          break;
        }
        
        if (current.className) {
          const classes = current.className.split(' ').filter(c => c.trim());
          if (classes.length > 0) {
            selector += `.${classes[0]}`;
          }
        }
        
        path.unshift(selector);
        current = current.parentElement;
      }
      
      return path.join(' > ');
    },
  
    scoreCandidates(candidates) {
      const scored = [];
      
      candidates.forEach((candidate, key) => {
        // Additional scoring factors
        let score = candidate.totalScore;
        
        // Visibility bonus
        if (candidate.element.offsetParent) {
          score += 1;
        }
        
        // Size penalty for very small elements (unless ads)
        const rect = candidate.element.getBoundingClientRect();
        if (rect.width < 48 && rect.height < 48 && !candidate.types.has('ads')) {
          score -= 2;
        }
        
        scored.push({
          ...candidate,
          finalScore: score,
          selector: this.generateSelector(candidate.element)
        });
      });
      
      return scored.sort((a, b) => b.finalScore - a.finalScore);
    },
  
    generateSelector(element) {
      // Generate a robust CSS selector
      if (element.id) {
        const selector = `#${element.id}`;
        console.log('CleanView selectorEngine: Generated ID selector:', selector);
        return selector;
      }
      
      if (element.getAttribute('data-testid')) {
        const selector = `[data-testid="${element.getAttribute('data-testid')}"]`;
        console.log('CleanView selectorEngine: Generated data-testid selector:', selector);
        return selector;
      }
      
      if (element.className) {
        const classes = element.className.split(' ').filter(c => c.trim());
        if (classes.length > 0) {
          // Use more specific selector with tag + class
          const selector = `${element.tagName.toLowerCase()}.${classes[0]}`;
          console.log('CleanView selectorEngine: Generated class selector:', selector);
          return selector;
        }
      }
      
      // Fallback to nth-child selector with parent context
      const parent = element.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children);
        const index = siblings.indexOf(element) + 1;
        
        // Try to make it more specific by including parent context
        let parentSelector = '';
        if (parent.id) {
          parentSelector = `#${parent.id} > `;
        } else if (parent.className) {
          const parentClasses = parent.className.split(' ').filter(c => c.trim());
          if (parentClasses.length > 0) {
            parentSelector = `${parent.tagName.toLowerCase()}.${parentClasses[0]} > `;
          } else {
            parentSelector = `${parent.tagName.toLowerCase()} > `;
          }
        } else {
          parentSelector = `${parent.tagName.toLowerCase()} > `;
        }
        
        const selector = `${parentSelector}${element.tagName.toLowerCase()}:nth-child(${index})`;
        console.log('CleanView selectorEngine: Generated nth-child selector:', selector);
        return selector;
      }
      
      // Last resort - try to make it more specific
      const selector = `${element.tagName.toLowerCase()}[data-cleanview-target]`;
      console.log('CleanView selectorEngine: Generated fallback selector:', selector);
      return selector;
    },
  
    mapToRequestedTargets(actions, candidates) {
      const results = [];
      
      actions.forEach(action => {
        const relevantCandidates = candidates.filter(c => 
          c.types.has(action.target) || 
          this.isTargetMatch(action.target, c.types)
        );
        
        // Take top candidates with minimum score threshold
        const selected = relevantCandidates
          .filter(c => c.finalScore >= 2)
          .slice(0, 5); // Max 5 elements per target
        
        if (selected.length > 0) {
          const selectors = selected.map(s => s.selector);
          
          // Filter out overly broad selectors
          const safeSelectors = selectors.filter(selector => this.isSelectorSafe(selector));
          
          if (safeSelectors.length === 0) {
            console.warn('CleanView selectorEngine: All selectors filtered out as unsafe for', action.target);
            return;
          }
          
          const combinedSelector = safeSelectors.join(', ');
          console.log('CleanView selectorEngine: Combined selectors for', action.target, ':', combinedSelector);
          console.log('CleanView selectorEngine: Individual selectors:', safeSelectors);
          
          results.push({
            action: action.action,
            target: action.target,
            description: `${action.action} ${action.target}`,
            selector: combinedSelector,
            elements: selected.map(s => s.element)
          });
        }
      });
      
      return results;
    },

    isSelectorSafe(selector) {
      // Block overly broad selectors that could match too many elements
      const unsafePatterns = [
        /^[a-z]+$/, // Just tag name like "div", "span"
        /^[a-z]+,\s*[a-z]+/, // Multiple tag names like "div, span"
        /^\*/, // Universal selector
        /^body/, // Body selector
        /^html/, // HTML selector
      ];
      
      const isUnsafe = unsafePatterns.some(pattern => pattern.test(selector.trim()));
      
      if (isUnsafe) {
        console.warn('CleanView selectorEngine: Unsafe selector filtered out:', selector);
        return false;
      }
      
      return true;
    },
  
    isTargetMatch(requestedTarget, candidateTypes) {
      const targetMappings = {
        'sidebars': ['sidebar', 'leftSidebar', 'rightSidebar'],
        'both sidebars': ['leftSidebar', 'rightSidebar'],
        'promoted': ['ads', 'promoted'],
        'recommendations': ['recommended', 'suggestions']
      };
      
      const mappings = targetMappings[requestedTarget];
      if (mappings) {
        return mappings.some(mapping => candidateTypes.has(mapping));
      }
      
      return false;
    }
  };
  