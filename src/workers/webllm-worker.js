// WebLLM worker for local model inference
import { MLCEngine } from "https://esm.run/@mlc-ai/web-llm";

class WebLLMWorker {
  constructor() {
    this.engine = null;
    this.isInitialized = false;
    this.initProgress = null;
  }

  async initialize(modelId, maxTokens = 500) {
    try {
      this.postMessage({
        type: 'init-progress',
        data: { text: 'Initializing WebLLM engine...', progress: 0 }
      });

      // Create MLCEngine instance
      this.engine = new MLCEngine();

      // Setup progress callback
      const progressCallback = (progress) => {
        this.postMessage({
          type: 'init-progress',
          data: progress
        });
      };

      // Initialize with selected model
      await this.engine.reload(modelId, {
        temperature: 0.1,
        top_p: 0.95,
        max_tokens: maxTokens
      }, progressCallback);

      this.isInitialized = true;

      this.postMessage({
        type: 'init-complete',
        data: { modelId, ready: true }
      });

    } catch (error) {
      console.error('WebLLM initialization failed:', error);
      
      this.postMessage({
        type: 'init-error',
        error: error.message
      });
    }
  }

  async generateResponse(prompt, maxTokens = 300) {
    if (!this.isInitialized || !this.engine) {
      throw new Error('Model not initialized');
    }

    try {
      const messages = [
        {
          role: 'user',
          content: prompt
        }
      ];

      const response = await this.engine.chat.completions.create({
        messages: messages,
        max_tokens: maxTokens,
        temperature: 0.1,
        stream: false
      });

      const content = response.choices[0]?.message?.content || '';
      
      this.postMessage({
        type: 'generate-complete',
        data: content
      });

    } catch (error) {
      console.error('Generation failed:', error);
      
      this.postMessage({
        type: 'generate-error', 
        error: error.message
      });
    }
  }

  postMessage(data) {
    // Worker context
    if (typeof self !== 'undefined' && self.postMessage) {
      self.postMessage(data);
    }
  }
}

// Worker instance
const worker = new WebLLMWorker();

// Handle messages from main thread
self.onmessage = async (event) => {
  const { type, modelId, prompt, maxTokens } = event.data;

  switch (type) {
    case 'init':
      await worker.initialize(modelId, maxTokens);
      break;

    case 'generate':
      await worker.generateResponse(prompt, maxTokens);
      break;

    case 'destroy':
      // Cleanup if needed
      worker.engine = null;
      worker.isInitialized = false;
      break;

    default:
      console.warn('Unknown message type:', type);
  }
};
