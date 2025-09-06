// Natural language processing for commands
window.nlpParser = {
    parseCommand(text) {
      const normalized = text.toLowerCase().trim();
      
      const actions = this.extractActions(normalized);
      const targets = this.extractTargets(normalized);
      const destructive = this.isDestructive(normalized);
      
      // Combine actions and targets
      const actionTargetPairs = this.combineActionsTargets(actions, targets, normalized);
      
      return {
        actions: actionTargetPairs,
        destructive,
        originalText: text
      };
    },
  
    extractActions(text) {
      const actionPatterns = {
        hide: ['hide', 'remove', 'get rid of', 'eliminate', 'take away'],
        remove: ['delete', 'remove permanently', 'destroy'],
        dim: ['dim', 'fade', 'make transparent', 'reduce opacity'],
        keepOnly: ['keep only', 'show only', 'display only', 'just show']
      };
      
      const found = [];
      Object.entries(actionPatterns).forEach(([action, patterns]) => {
        if (patterns.some(pattern => text.includes(pattern))) {
          found.push(action);
        }
      });
      
      return found.length > 0 ? found : ['hide'];
    },
  
    extractTargets(text) {
      const targetPatterns = {
        leftSidebar: ['left sidebar', 'left rail', 'left pane', 'left nav', 'left navigation'],
        rightSidebar: ['right sidebar', 'right rail', 'right pane', 'right nav', 'trends', 'recommendations'],
        sidebars: ['both sidebars', 'sidebars', 'side panels', 'rails'],
        header: ['header', 'top bar', 'navigation bar', 'navbar', 'masthead'],
        footer: ['footer', 'bottom bar'],
        ads: ['ads', 'advertisements', 'sponsored content', 'promotions'],
        promoted: ['promoted', 'sponsored', 'promoted posts', 'sponsored posts'],
        comments: ['comments', 'comment section', 'replies'],
        nav: ['navigation', 'nav menu', 'menu'],
        main: ['main content', 'main feed', 'primary content', 'feed', 'timeline'],
        recommended: ['recommended', 'suggestions', 'you might like', 'related'],
        videoRecommendations: ['video recommendations', 'related videos', 'up next'],
        shorts: ['shorts', 'short videos'],
        stories: ['stories', 'story'],
        notifications: ['notifications', 'alerts'],
        trending: ['trending', 'what\'s happening', 'trends']
      };
      
      const found = [];
      Object.entries(targetPatterns).forEach(([target, patterns]) => {
        if (patterns.some(pattern => text.includes(pattern))) {
          found.push(target);
        }
      });
      
      return found.length > 0 ? found : ['sidebars'];
    },
  
    isDestructive(text) {
      const destructiveKeywords = ['delete', 'destroy', 'permanently', 'completely remove'];
      return destructiveKeywords.some(keyword => text.includes(keyword));
    },
  
    combineActionsTargets(actions, targets, text) {
      const pairs = [];
      
      // Handle "keep only" specially
      if (actions.includes('keepOnly')) {
        targets.forEach(target => {
          pairs.push({ action: 'keepOnly', target });
        });
        return pairs;
      }
      
      // Default action for each target
      const defaultAction = actions[0] || 'hide';
      targets.forEach(target => {
        pairs.push({ action: defaultAction, target });
      });
      
      return pairs;
    }
  };
  