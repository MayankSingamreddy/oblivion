// LLM Service for dynamic selector generation
window.llmService = {
  apiKey: null,
  baseUrl: 'https://api.openai.com/v1/chat/completions',
  lastRequestTime: 0,
  requestCount: 0,
  maxRequestsPerMinute: 3, // Conservative rate limiting
  
  async initialize() {
    // Get API key from storage
    const result = await chrome.storage.local.get(['apiKey']);
    this.apiKey = result.apiKey;
    
    if (!this.apiKey) {
      console.warn('CleanView LLM: No OpenAI API key found. Please configure in options.');
      // Show user-friendly error message
      chrome.runtime.sendMessage({
        action: 'error',
        message: 'OpenAI API key not configured. Please add your API key in the extension options.'
      });
      return false;
    }
    
    return true;
  },

  async analyzePageStructure(userCommand) {
    if (!await this.initialize()) {
      throw new Error('OpenAI API key not configured');
    }

    // Extract page structure information
    const pageInfo = this.extractPageInfo();
    
    const prompt = this.buildAnalysisPrompt(userCommand, pageInfo);
    
    try {
      const response = await this.callOpenAI(prompt);
      return this.parseResponse(response);
    } catch (error) {
      console.error('CleanView LLM: Error analyzing page:', error);
      throw error;
    }
  },

  extractPageInfo() {
    const info = {
      url: window.location.href,
      hostname: window.location.hostname,
      title: document.title,
      elements: []
    };

    // Sample key elements from the page
    const selectors = [
      'header', 'nav', 'main', 'aside', 'footer',
      '[role="navigation"]', '[role="main"]', '[role="complementary"]', '[role="banner"]',
      '[data-testid]', '[aria-label]',
      '.sidebar', '.nav', '.menu', '.content', '.main',
      '#sidebar', '#nav', '#menu', '#content', '#main'
    ];

    selectors.forEach(selector => {
      try {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => {
          if (el.offsetParent) { // Only visible elements
            const rect = el.getBoundingClientRect();
            if (rect.width > 50 && rect.height > 50) { // Only significant elements
              info.elements.push({
                tag: el.tagName.toLowerCase(),
                id: el.id || null,
                classes: el.className || null,
                role: el.getAttribute('role') || null,
                'data-testid': el.getAttribute('data-testid') || null,
                'aria-label': el.getAttribute('aria-label') || null,
                text: el.textContent?.substring(0, 100) || null,
                position: {
                  top: Math.round(rect.top),
                  left: Math.round(rect.left),
                  width: Math.round(rect.width),
                  height: Math.round(rect.height)
                }
              });
            }
          }
        });
      } catch (e) {
        // Invalid selector, skip
      }
    });

    return info;
  },

  buildAnalysisPrompt(userCommand, pageInfo) {
    return `You are a web scraping expert. Analyze this webpage and generate CSS selectors to target elements based on the user's command.

User Command: "${userCommand}"

Page Information:
- URL: ${pageInfo.url}
- Title: ${pageInfo.title}
- Hostname: ${pageInfo.hostname}

Key Elements Found:
${JSON.stringify(pageInfo.elements.slice(0, 20), null, 2)}

Instructions:
1. Based on the user command, identify which elements should be targeted
2. Generate specific CSS selectors that will match those elements
3. Prioritize selectors that are specific and unlikely to match unintended elements
4. Consider the element's position, role, and content when generating selectors
5. Return a JSON response with the following format:

{
  "targets": [
    {
      "type": "rightSidebar|leftSidebar|header|footer|ads|main|etc",
      "description": "Human readable description",
      "selectors": ["selector1", "selector2"],
      "confidence": 0.8
    }
  ]
}

Common patterns to look for:
- Sidebars: Elements with role="complementary", aside tags, or positioned on left/right
- Headers: Elements with role="banner", header tags, or at top of page
- Footers: Elements with role="contentinfo", footer tags, or at bottom
- Ads: Elements with classes/ids containing "ad", "sponsor", "promo"
- Main content: Elements with role="main" or large central content areas

Be specific and avoid overly broad selectors like just tag names.`;
  },

  async callOpenAI(prompt, retryCount = 0) {
    // Rate limiting check
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < 20000) { // 20 seconds between requests
      const waitTime = 20000 - timeSinceLastRequest;
      console.log(`CleanView LLM: Rate limiting - waiting ${Math.round(waitTime/1000)}s before next request`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastRequestTime = Date.now();
    this.requestCount++;

    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'user',
              content: prompt
            }
          ],
          max_tokens: 1000,
          temperature: 0.1
        })
      });

      if (!response.ok) {
        if (response.status === 429) {
          // Rate limit exceeded
          if (retryCount < 3) {
            const retryAfter = response.headers.get('Retry-After') || 60;
            const waitTime = parseInt(retryAfter) * 1000;
            console.log(`CleanView LLM: Rate limited, retrying after ${retryAfter}s (attempt ${retryCount + 1}/3)`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            return this.callOpenAI(prompt, retryCount + 1);
          } else {
            throw new Error('Rate limit exceeded. Please wait a few minutes before trying again.');
          }
        } else if (response.status === 401) {
          throw new Error('Invalid API key. Please check your OpenAI API key in the extension options.');
        } else if (response.status === 402) {
          throw new Error('Insufficient credits. Please add credits to your OpenAI account.');
        } else {
          throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
        }
      }

      const data = await response.json();
      return data.choices[0].message.content;
    } catch (error) {
      if (retryCount < 2 && error.message.includes('fetch')) {
        // Network error, retry
        console.log(`CleanView LLM: Network error, retrying (attempt ${retryCount + 1}/2)`);
        await new Promise(resolve => setTimeout(resolve, 2000 * (retryCount + 1)));
        return this.callOpenAI(prompt, retryCount + 1);
      }
      throw error;
    }
  },

  parseResponse(response) {
    try {
      // Extract JSON from response (in case there's extra text)
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      throw new Error('No JSON found in response');
    } catch (error) {
      console.error('CleanView LLM: Error parsing response:', error);
      console.log('Raw response:', response);
      throw new Error('Failed to parse LLM response');
    }
  },

  async generateSelectors(userCommand) {
    try {
      const analysis = await this.analyzePageStructure(userCommand);
      
      // Convert LLM response to our format
      const results = analysis.targets.map(target => ({
        action: this.extractAction(userCommand),
        target: target.type,
        description: target.description,
        selector: target.selectors.join(', '),
        confidence: target.confidence,
        elements: this.findElementsBySelectors(target.selectors)
      }));

      return results;
    } catch (error) {
      console.error('CleanView LLM: Error generating selectors:', error);
      
      // Send specific error message to popup
      if (error.message.includes('Rate limit')) {
        chrome.runtime.sendMessage({
          action: 'error',
          message: 'Rate limit exceeded. Please wait a few minutes before trying again.'
        });
      } else if (error.message.includes('API key')) {
        chrome.runtime.sendMessage({
          action: 'error',
          message: 'Invalid API key. Please check your OpenAI API key in the extension options.'
        });
      } else if (error.message.includes('credits')) {
        chrome.runtime.sendMessage({
          action: 'error',
          message: 'Insufficient credits. Please add credits to your OpenAI account.'
        });
      } else {
        chrome.runtime.sendMessage({
          action: 'error',
          message: 'AI analysis failed. Falling back to traditional method.'
        });
      }
      
      // Fallback to original method
      return null;
    }
  },

  extractAction(command) {
    const lowerCommand = command.toLowerCase();
    if (lowerCommand.includes('hide') || lowerCommand.includes('remove')) return 'hide';
    if (lowerCommand.includes('delete') || lowerCommand.includes('destroy')) return 'remove';
    if (lowerCommand.includes('dim') || lowerCommand.includes('fade')) return 'dim';
    return 'hide';
  },

  findElementsBySelectors(selectors) {
    const elements = [];
    selectors.forEach(selector => {
      try {
        const nodes = document.querySelectorAll(selector);
        elements.push(...nodes);
      } catch (e) {
        console.warn('CleanView LLM: Invalid selector:', selector);
      }
    });
    return elements;
  }
};
