import { LLMResponse } from '../types/types';
import { StorageManager } from './storage';
interface ModelInfo {
    id: string;
    name: string;
    size: string;
    description: string;
    downloadUrl: string;
}
export declare class NLAgent {
    private storage;
    private settings;
    private webllmWorker;
    private localModelLoaded;
    private requestQueue;
    private isProcessingQueue;
    private lastRequestTime;
    private readonly requestCooldown;
    private readonly availableModels;
    constructor(storage: StorageManager);
    private initialize;
    generateSelectors(prompt: string): Promise<LLMResponse>;
    private initializeLocalModel;
    private handleWorkerMessage;
    private generateWithLocalModel;
    private processQueue;
    private currentPromiseHandlers;
    private handleGenerationComplete;
    private handleGenerationError;
    private generateWithRemoteModel;
    private extractPageContext;
    private extractLandmarks;
    private extractInteractiveElements;
    private extractContentAreas;
    private buildLocalModelPrompt;
    private buildRemoteModelPrompt;
    private getSystemPrompt;
    private parseModelResponse;
    private validateSelector;
    isLocalModelAvailable(): Promise<boolean>;
    getAvailableModels(): ModelInfo[];
    setupLocalModel(modelId: string, onProgress?: (progress: {
        text: string;
        progress: number;
    }) => void): Promise<boolean>;
    private onModelLoadProgress?;
    getModelStatus(): {
        localAvailable: boolean;
        localLoaded: boolean;
        remoteConfigured: boolean;
        currentModel: string;
    };
    destroy(): void;
}
export declare class PatternFallback {
    private readonly patterns;
    generateSelectors(prompt: string): LLMResponse;
}
export {};
//# sourceMappingURL=nlAgent.d.ts.map