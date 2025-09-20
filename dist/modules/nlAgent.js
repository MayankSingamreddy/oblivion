export class NLAgent {
    constructor(storage) {
        this.settings = null;
        this.webllmWorker = null;
        this.localModelLoaded = false;
        this.requestQueue = [];
        this.isProcessingQueue = false;
        this.lastRequestTime = 0;
        this.requestCooldown = 2000; // 2 seconds between requests
        // Available local models
        this.availableModels = [
            {
                id: 'Llama-3.2-1B-Instruct-q4f16_1-MLC',
                name: 'Llama 3.2 1B Instruct',
                size: '~800MB',
                description: 'Fast, lightweight model good for simple tasks',
                downloadUrl: 'https://huggingface.co/mlc-ai/Llama-3.2-1B-Instruct-q4f16_1-MLC'
            },
            {
                id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
                name: 'Qwen2.5 0.5B Instruct',
                size: '~400MB',
                description: 'Ultra-lightweight model for basic selector generation',
                downloadUrl: 'https://huggingface.co/mlc-ai/Qwen2.5-0.5B-Instruct-q4f16_1-MLC'
            }
        ];
        this.currentPromiseHandlers = null;
        this.storage = storage;
        this.initialize();
    }
    async initialize() {
        this.settings = await this.storage.loadSettings();
        // Initialize local model if enabled
        if (this.settings.localModelEnabled) {
            this.initializeLocalModel();
        }
    }
    // Main method to generate selectors from natural language
    async generateSelectors(prompt) {
        // Rate limiting
        const now = Date.now();
        if (now - this.lastRequestTime < this.requestCooldown) {
            const remaining = Math.ceil((this.requestCooldown - (now - this.lastRequestTime)) / 1000);
            throw new Error(`Please wait ${remaining} seconds before next request`);
        }
        this.lastRequestTime = now;
        try {
            // Try local model first if available
            if (this.settings?.localModelEnabled && this.localModelLoaded) {
                return await this.generateWithLocalModel(prompt);
            }
            // Fall back to remote model if configured
            if (this.settings?.apiKey) {
                return await this.generateWithRemoteModel(prompt);
            }
            throw new Error('No AI model available. Please configure API key or enable local model.');
        }
        catch (error) {
            console.error('Selector generation failed:', error);
            throw error;
        }
    }
    // Initialize WebLLM local model
    async initializeLocalModel() {
        try {
            console.log('🤖 Initializing local WebLLM model...');
            // Check if WebGPU is available
            if (!navigator.gpu) {
                console.warn('WebGPU not available, local model disabled');
                return;
            }
            // Create dedicated worker for WebLLM
            this.webllmWorker = new Worker(new URL('../workers/webllm-worker.js', import.meta.url), { type: 'module' });
            // Setup worker communication
            this.webllmWorker.onmessage = this.handleWorkerMessage.bind(this);
            this.webllmWorker.onerror = (error) => {
                console.error('WebLLM worker error:', error);
            };
            // Initialize model in worker
            const modelId = this.settings?.aiModel || this.availableModels[1].id; // Default to smaller model
            this.webllmWorker.postMessage({
                type: 'init',
                modelId,
                maxTokens: 500
            });
        }
        catch (error) {
            console.error('Failed to initialize local model:', error);
        }
    }
    handleWorkerMessage(event) {
        const { type, data, error } = event.data;
        switch (type) {
            case 'init-progress':
                this.onModelLoadProgress?.(data);
                break;
            case 'init-complete':
                this.localModelLoaded = true;
                console.log('✅ Local model loaded successfully');
                this.processQueue();
                break;
            case 'init-error':
                console.error('Local model initialization failed:', error);
                this.localModelLoaded = false;
                break;
            case 'generate-complete':
                this.handleGenerationComplete(data);
                break;
            case 'generate-error':
                this.handleGenerationError(error);
                break;
        }
    }
    // Generate selectors using local WebLLM model
    async generateWithLocalModel(prompt) {
        if (!this.webllmWorker || !this.localModelLoaded) {
            throw new Error('Local model not available');
        }
        return new Promise((resolve, reject) => {
            // Add to queue for processing
            this.requestQueue.push({ prompt, resolve, reject });
            if (!this.isProcessingQueue) {
                this.processQueue();
            }
        });
    }
    processQueue() {
        if (this.requestQueue.length === 0 || this.isProcessingQueue || !this.localModelLoaded) {
            return;
        }
        this.isProcessingQueue = true;
        const { prompt, resolve, reject } = this.requestQueue.shift();
        // Extract page context for better AI understanding
        const context = this.extractPageContext();
        const fullPrompt = this.buildLocalModelPrompt(prompt, context);
        // Store current request handlers
        this.currentPromiseHandlers = { resolve, reject };
        // Send to worker
        this.webllmWorker.postMessage({
            type: 'generate',
            prompt: fullPrompt,
            maxTokens: 300
        });
    }
    handleGenerationComplete(response) {
        this.isProcessingQueue = false;
        if (this.currentPromiseHandlers) {
            try {
                const parsed = this.parseModelResponse(response);
                this.currentPromiseHandlers.resolve(parsed);
            }
            catch (error) {
                this.currentPromiseHandlers.reject(error);
            }
            this.currentPromiseHandlers = null;
        }
        // Process next item in queue
        setTimeout(() => this.processQueue(), 500);
    }
    handleGenerationError(error) {
        this.isProcessingQueue = false;
        if (this.currentPromiseHandlers) {
            this.currentPromiseHandlers.reject(new Error(error));
            this.currentPromiseHandlers = null;
        }
        // Process next item in queue
        setTimeout(() => this.processQueue(), 1000);
    }
    // Generate selectors using remote API
    async generateWithRemoteModel(prompt) {
        if (!this.settings?.apiKey) {
            throw new Error('API key not configured');
        }
        const context = this.extractPageContext();
        const messages = [
            {
                role: 'system',
                content: this.getSystemPrompt()
            },
            {
                role: 'user',
                content: this.buildRemoteModelPrompt(prompt, context)
            }
        ];
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.settings.apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: this.settings.aiModel || 'gpt-4o-mini',
                messages,
                max_tokens: 500,
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
            throw new Error('No response from AI model');
        }
        return this.parseModelResponse(aiResponse);
    }
    // Extract structural page context for AI analysis
    extractPageContext() {
        const landmarks = this.extractLandmarks();
        const interactiveElements = this.extractInteractiveElements();
        const contentAreas = this.extractContentAreas();
        return {
            title: document.title,
            url: window.location.hostname,
            landmarks,
            interactiveElements: interactiveElements.slice(0, 10), // Limit for token efficiency
            contentAreas: contentAreas.slice(0, 5)
        };
    }
    extractLandmarks() {
        const landmarks = [];
        const landmarkSelectors = ['header', 'main', 'nav', 'aside', 'footer', '[role="banner"]', '[role="main"]', '[role="navigation"]', '[role="complementary"]', '[role="contentinfo"]'];
        for (const selector of landmarkSelectors) {
            const elements = document.querySelectorAll(selector);
            for (const element of Array.from(elements).slice(0, 3)) {
                landmarks.push({
                    tag: element.tagName.toLowerCase(),
                    role: element.getAttribute('role') || undefined,
                    classes: Array.from(element.classList).slice(0, 3),
                    bounds: element.getBoundingClientRect()
                });
            }
        }
        return landmarks;
    }
    extractInteractiveElements() {
        const interactive = [];
        const interactiveSelectors = ['button', 'a', 'input', 'select', '[role="button"]', '[role="link"]'];
        for (const selector of interactiveSelectors) {
            const elements = document.querySelectorAll(selector);
            for (const element of Array.from(elements).slice(0, 5)) {
                interactive.push({
                    tag: element.tagName.toLowerCase(),
                    type: element.getAttribute('type') || undefined,
                    role: element.getAttribute('role') || undefined,
                    bounds: element.getBoundingClientRect()
                });
            }
        }
        return interactive;
    }
    extractContentAreas() {
        const contentAreas = [];
        const contentSelectors = ['article', 'main', '.content', '.post', '[role="main"]'];
        for (const selector of contentSelectors) {
            const elements = document.querySelectorAll(selector);
            for (const element of Array.from(elements).slice(0, 2)) {
                const textLength = element.textContent?.length || 0;
                if (textLength > 100) { // Only include substantial content areas
                    contentAreas.push({
                        selector,
                        bounds: element.getBoundingClientRect(),
                        textLength
                    });
                }
            }
        }
        return contentAreas;
    }
    // Build prompt for local model (more concise)
    buildLocalModelPrompt(userPrompt, context) {
        return `Page: ${context.title} (${context.url})
Landmarks: ${context.landmarks.length} found
Task: ${userPrompt}

Generate CSS selectors for this request. Return JSON only:
[{"selector": "...", "description": "...", "confidence": 0.8}]

Rules:
- Maximum 3 selectors
- Use stable attributes (id, role, aria-label, data-testid)
- Avoid nth-child unless necessary
- Confidence 0.0-1.0`;
    }
    // Build prompt for remote model (more detailed)
    buildRemoteModelPrompt(userPrompt, context) {
        const landmarkInfo = context.landmarks
            .map(l => `${l.tag}${l.role ? `[role="${l.role}"]` : ''}`)
            .join(', ');
        return `Analyze this webpage and generate CSS selectors:

Page: ${context.title}
Domain: ${context.url}
User Request: "${userPrompt}"

Structure:
- Landmarks: ${landmarkInfo}
- Interactive elements: ${context.interactiveElements.length}
- Content areas: ${context.contentAreas.length}

Generate precise CSS selectors that accomplish the user's request while avoiding critical page elements.`;
    }
    // System prompt for AI models
    getSystemPrompt() {
        return `You are a web page element selector expert. Generate CSS selectors based on user requests.

CRITICAL RULES:
1. Return ONLY valid JSON array format
2. Each object needs: selector, description, confidence (0.0-1.0)
3. Maximum 5 selectors per response
4. Prefer stable attributes: id, role, aria-label, data-testid
5. Avoid fragile selectors like nth-child unless absolutely necessary
6. Never target critical elements: html, body, main navigation, forms
7. Confidence reflects selector stability and accuracy

Example output:
[
  {
    "selector": "[aria-label*='advertisement' i]",
    "description": "Advertisement elements",
    "confidence": 0.9
  },
  {
    "selector": "aside[role='complementary']",
    "description": "Sidebar content", 
    "confidence": 0.8
  }
]

Focus on accuracy over quantity.`;
    }
    // Parse AI model response into structured format
    parseModelResponse(response) {
        try {
            // Try to extract JSON from response
            let jsonMatch = response.match(/\[[\s\S]*\]/);
            if (!jsonMatch) {
                // Try to find JSON in code blocks
                const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
                if (codeBlockMatch) {
                    jsonMatch = codeBlockMatch[1].match(/\[[\s\S]*\]/);
                }
            }
            if (!jsonMatch) {
                throw new Error('No JSON array found in response');
            }
            const selectors = JSON.parse(jsonMatch[0]);
            if (!Array.isArray(selectors)) {
                throw new Error('Response is not an array');
            }
            // Validate and filter selectors
            const validSelectors = selectors
                .filter(item => item.selector && item.description)
                .map(item => ({
                selector: item.selector,
                description: item.description,
                confidence: Math.min(Math.max(item.confidence || 0.5, 0), 1)
            }))
                .filter(item => this.validateSelector(item.selector))
                .slice(0, 5); // Limit to 5 selectors
            return { selectors: validSelectors };
        }
        catch (error) {
            console.error('Failed to parse model response:', response, error);
            throw new Error('Invalid response format from AI model');
        }
    }
    // Validate CSS selector
    validateSelector(selector) {
        try {
            document.querySelector(selector);
            // Check if selector is too broad
            const matches = document.querySelectorAll(selector);
            if (matches.length > 100) {
                console.warn(`Selector too broad: ${matches.length} matches for "${selector}"`);
                return false;
            }
            // Check for dangerous selectors
            const dangerousPatterns = [
                /^html$/i,
                /^body$/i,
                /^head$/i,
                /script/i,
                /style/i,
                /\boblivion\b/i
            ];
            if (dangerousPatterns.some(pattern => pattern.test(selector))) {
                console.warn(`Dangerous selector blocked: "${selector}"`);
                return false;
            }
            return matches.length > 0;
        }
        catch (error) {
            console.warn(`Invalid selector: "${selector}"`, error);
            return false;
        }
    }
    // Check if local model is available
    async isLocalModelAvailable() {
        if (!navigator.gpu) {
            return false;
        }
        try {
            const adapter = await navigator.gpu.requestAdapter();
            return adapter !== null;
        }
        catch (error) {
            return false;
        }
    }
    // Get available models
    getAvailableModels() {
        return this.availableModels;
    }
    // Download and setup local model
    async setupLocalModel(modelId, onProgress) {
        this.onModelLoadProgress = onProgress;
        try {
            if (!this.webllmWorker) {
                await this.initializeLocalModel();
            }
            if (this.webllmWorker) {
                this.webllmWorker.postMessage({
                    type: 'init',
                    modelId,
                    maxTokens: 500
                });
            }
            return new Promise((resolve) => {
                const checkLoaded = setInterval(() => {
                    if (this.localModelLoaded) {
                        clearInterval(checkLoaded);
                        resolve(true);
                    }
                }, 1000);
                // Timeout after 5 minutes
                setTimeout(() => {
                    clearInterval(checkLoaded);
                    resolve(false);
                }, 300000);
            });
        }
        catch (error) {
            console.error('Failed to setup local model:', error);
            return false;
        }
    }
    // Get current model status
    getModelStatus() {
        return {
            localAvailable: !!navigator.gpu,
            localLoaded: this.localModelLoaded,
            remoteConfigured: !!this.settings?.apiKey,
            currentModel: this.localModelLoaded
                ? 'Local WebLLM'
                : this.settings?.apiKey
                    ? this.settings.aiModel || 'Remote API'
                    : 'None'
        };
    }
    // Clean up resources
    destroy() {
        if (this.webllmWorker) {
            this.webllmWorker.terminate();
            this.webllmWorker = null;
        }
        this.localModelLoaded = false;
        this.requestQueue = [];
        this.isProcessingQueue = false;
    }
}
// Fallback pattern matching for when AI is not available
export class PatternFallback {
    constructor() {
        this.patterns = new Map([
            [
                /ads?|advertisement|sponsored|promo/i,
                {
                    selectors: ['[id*="ad" i]', '[class*="ad" i]', '[aria-label*="sponsor" i]', '[data-testid*="ad" i]'],
                    description: 'Advertisement elements'
                }
            ],
            [
                /sidebar|aside/i,
                {
                    selectors: ['aside', '[role="complementary"]', '[class*="sidebar" i]'],
                    description: 'Sidebar content'
                }
            ],
            [
                /trending|trend|popular/i,
                {
                    selectors: ['[aria-label*="trending" i]', '[title*="trending" i]', '[class*="trend" i]'],
                    description: 'Trending content'
                }
            ],
            [
                /recommend|suggestion/i,
                {
                    selectors: ['[aria-label*="recommend" i]', '[class*="recommend" i]', '[data-testid*="recommend" i]'],
                    description: 'Recommendations'
                }
            ],
            [
                /navigation|nav|menu/i,
                {
                    selectors: ['nav', '[role="navigation"]', '[class*="nav" i]:not([class*="main" i])'],
                    description: 'Secondary navigation'
                }
            ]
        ]);
    }
    generateSelectors(prompt) {
        const selectors = [];
        for (const [pattern, config] of this.patterns) {
            if (pattern.test(prompt)) {
                for (const selector of config.selectors) {
                    try {
                        const matches = document.querySelectorAll(selector);
                        if (matches.length > 0 && matches.length <= 50) {
                            selectors.push({
                                selector,
                                description: config.description,
                                confidence: 0.6
                            });
                        }
                    }
                    catch (error) {
                        // Skip invalid selectors
                    }
                }
            }
        }
        return { selectors: selectors.slice(0, 3) };
    }
}
//# sourceMappingURL=nlAgent.js.map