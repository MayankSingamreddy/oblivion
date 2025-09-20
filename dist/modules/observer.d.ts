import { RuleEngine } from './ruleEngine';
import { StorageManager } from './storage';
interface ObserverOptions {
    watchAttributes: boolean;
    watchChildList: boolean;
    watchSubtree: boolean;
    debounceMs: number;
    batchSize: number;
}
export declare class DOMObserver {
    private mutationObserver;
    private ruleEngine;
    private storage;
    private host;
    private isObserving;
    private pendingMutations;
    private debounceTimer;
    private criticalStylesInjected;
    private readonly options;
    constructor(ruleEngine: RuleEngine, storage: StorageManager);
    private initialize;
    private injectCriticalCSS;
    startObserving(): void;
    stopObserving(): void;
    private handleMutations;
    private debouncedApplyRules;
    private processPendingMutations;
    private applyInitialRules;
    watchForSelector(selector: string, callback: (element: Element) => void): () => void;
    setupSPADetection(): void;
    private handleSPANavigation;
    private isOblivionElement;
    pauseObservation(): void;
    resumeObservation(): void;
    updateOptions(newOptions: Partial<ObserverOptions>): void;
    getStatus(): {
        isObserving: boolean;
        pendingMutations: number;
        criticalStylesInjected: boolean;
    };
    forceReapplyRules(): Promise<number>;
    destroy(): void;
    private static instance;
    static getInstance(): DOMObserver | null;
    static setInstance(instance: DOMObserver): void;
}
export declare class FrameObserver {
    private frameObservers;
    private ruleEngine;
    private storage;
    constructor(ruleEngine: RuleEngine, storage: StorageManager);
    private initializeFrameWatching;
    private setupFrameObserver;
    private isSameOrigin;
    destroy(): void;
}
export {};
//# sourceMappingURL=observer.d.ts.map