class AIService {
  constructor() {
    this.lastRequestTime = 0;
    this.requestCooldown = 20000; // 20 seconds between requests
  }

  async generateSelectors(prompt) {
    // Check settings from sync storage first, fallback to local
    const settings = await chrome.storage.sync.get({
      settings: {
        apiKey: '',
        aiModel: 'gpt-4o-mini',
        aiEnabled: true,
        maxElements: 100
      }
    }).then(result => result.settings).catch(async () => {
      // Fallback to local storage for backwards compatibility
      return await chrome.storage.local.get({
        apiKey: '',
        model: 'gpt-4o-mini',
        enableAI: true,
        maxElements: 100
      });
    });

    const apiKey = settings.apiKey;
    const model = settings.aiModel || settings.model || 'gpt-4o-mini';
    const enableAI = settings.aiEnabled !== undefined ? settings.aiEnabled : settings.enableAI;

    if (!enableAI || !apiKey) {
      throw new Error('AI detection disabled or API key not configured');
    }

    // Rate limiting
    const now = Date.now();
    if (now - this.lastRequestTime < this.requestCooldown) {
      const remaining = Math.ceil((this.requestCooldown - (now - this.lastRequestTime)) / 1000);
      throw new Error(`Please wait ${remaining} seconds before next AI request`);
    }

    this.lastRequestTime = now;

    try {
      const pageContext = this.extractPageContext();
      const aiPrompt = this.buildAIPrompt(prompt, pageContext);
      
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: model,
          messages: [
            {
              role: 'system',
              content: this.getSystemPrompt()
            },
            {
              role: 'user',
              content: aiPrompt
            }
          ],
          max_tokens: 1000,
          temperature: 0.1
        })
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error?.message || `API request failed: ${response.statusText}`);
      }

      const data = await response.json();
      const aiResponse = data.choices[0]?.message?.content;
      
      if (!aiResponse) {
        throw new Error('No response from AI');
      }

      return this.parseAIResponse(aiResponse);
    } catch (error) {
      console.error('AI Service error:', error);
      throw error;
    }
  }

  extractPageContext() {
    // Get a summary of the page structure for AI analysis
    const context = {
      title: document.title,
      url: window.location.hostname,
      elementStats: this.getElementStats(),
      commonPatterns: this.findCommonPatterns()
    };

    return context;
  }

  getElementStats() {
    return {
      totalElements: document.querySelectorAll('*').length,
      divs: document.querySelectorAll('div').length,
      spans: document.querySelectorAll('span').length,
      sections: document.querySelectorAll('section').length,
      articles: document.querySelectorAll('article').length,
      asides: document.querySelectorAll('aside').length,
      navs: document.querySelectorAll('nav').length,
      headers: document.querySelectorAll('header').length,
      footers: document.querySelectorAll('footer').length
    };
  }

  findCommonPatterns() {
    const patterns = [];
    
    // Find elements with common ad-related attributes
    const adElements = document.querySelectorAll('[id*="ad" i], [class*="ad" i], [class*="sponsor" i]');
    if (adElements.length > 0) {
      patterns.push(`${adElements.length} potential ad elements found`);
    }

    // Find sidebars
    const sidebarElements = document.querySelectorAll('aside, [id*="sidebar" i], [class*="sidebar" i]');
    if (sidebarElements.length > 0) {
      patterns.push(`${sidebarElements.length} sidebar elements found`);
    }

    // Find navigation elements
    const navElements = document.querySelectorAll('nav, [role="navigation"], [id*="nav" i]');
    if (navElements.length > 0) {
      patterns.push(`${navElements.length} navigation elements found`);
    }

    return patterns;
  }

  buildAIPrompt(userPrompt, pageContext) {
    return `
Page Analysis Request:
User wants to: "${userPrompt}"

Page Context:
- Title: ${pageContext.title}
- Domain: ${pageContext.url}
- Total elements: ${pageContext.elementStats.totalElements}
- Key elements: ${pageContext.elementStats.divs} divs, ${pageContext.elementStats.sections} sections, ${pageContext.elementStats.asides} asides, ${pageContext.elementStats.navs} navs
- Common patterns: ${pageContext.commonPatterns.join(', ')}

Please analyze this page and suggest CSS selectors to accomplish the user's request.
Focus on being precise and avoiding overly broad selectors that might hide important content.
    `.trim();
  }

  getSystemPrompt() {
    return `You are an expert web page element selector. Your job is to analyze web pages and generate precise CSS selectors based on user requests.

Rules:
1. Return ONLY a JSON array of selector objects
2. Each object must have: "selector", "description", "confidence" (0-1)
3. Be conservative - prefer specific selectors over broad ones
4. Avoid selectors that might hide critical page content (main content, important navigation)
5. Consider semantic HTML elements, common CSS classes, and ID patterns
6. Maximum 5 selector groups per response
7. Confidence should reflect how likely the selector is to match the intended elements

Example response:
[
  {
    "selector": "[id*='ad' i], [class*='advertisement' i], [data-testid*='ad' i]",
    "description": "Advertisement elements",
    "confidence": 0.9
  },
  {
    "selector": "aside, [role='complementary'], [class*='sidebar' i]",
    "description": "Sidebar content",
    "confidence": 0.8
  }
]

Focus on accuracy over quantity. It's better to return fewer, more accurate selectors than many uncertain ones.`;
  }

  parseAIResponse(response) {
    try {
      // Try to extract JSON from the response
      let jsonMatch = response.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        // Try to find JSON in code blocks
        jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
          jsonMatch = jsonMatch[1].match(/\[[\s\S]*\]/);
        }
      }

      if (!jsonMatch) {
        throw new Error('No JSON found in AI response');
      }

      const selectors = JSON.parse(jsonMatch[0]);
      
      if (!Array.isArray(selectors)) {
        throw new Error('AI response is not an array');
      }

      // Convert to the format expected by the new content script
      return selectors.map(item => {
        if (!item.selector || !item.description) {
          throw new Error('Invalid selector object in AI response');
        }

        const elements = this.validateAndFindElements(item.selector);
        
        return {
          selector: item.selector,
          description: item.description,
          confidence: item.confidence || 0.5,
          anchors: this.extractAnchors(elements[0]) // Get anchors from first matching element
        };
      }).filter(item => {
        // Validate that selector actually finds elements
        return document.querySelectorAll(item.selector).length > 0;
      });

    } catch (error) {
      console.error('Error parsing AI response:', error);
      throw new Error('Failed to parse AI response: ' + error.message);
    }
  }

  validateAndFindElements(selector) {
    try {
      const elements = document.querySelectorAll(selector);
      const visibleElements = Array.from(elements).filter(el => this.isElementVisible(el));
      
      // Safety check - don't return if too many elements
      if (visibleElements.length > 50) {
        console.warn(`Selector "${selector}" matches too many elements (${visibleElements.length}), filtering...`);
        // Return only the first 20 as a safety measure
        return visibleElements.slice(0, 20);
      }
      
      return visibleElements;
    } catch (error) {
      console.warn(`Invalid selector from AI: "${selector}"`, error);
      return [];
    }
  }

  isElementVisible(element) {
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    
    return (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.opacity !== '0' &&
      rect.width > 0 &&
      rect.height > 0
    );
  }

  extractAnchors(element) {
    if (!element) return {};
    
    const anchors = {};
    
    // Get text content anchor
    const text = element.textContent?.trim();
    if (text && text.length < 100) {
      anchors.text = text;
    }

    // Get role/aria anchors  
    const role = element.getAttribute('role');
    if (role) {
      anchors.role = role;
    }

    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel) {
      anchors.ariaLabel = ariaLabel;
    }

    // Get data attributes
    const testId = element.getAttribute('data-testid');
    if (testId) {
      anchors.testId = testId;
    }

    return anchors;
  }
}

// Export for use in content script
window.aiService = new AIService();