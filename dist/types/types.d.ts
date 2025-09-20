export interface Rule {
    id: string;
    host: string;
    action: 'hide' | 'blank' | 'replace';
    selector: string;
    strategy: {
        preserveLayout: boolean;
        collapseSpace: boolean;
    };
    notes?: string;
    createdAt: number;
    version: number;
    anchors?: SelectionAnchors;
    confidence?: number;
}
export interface SelectionAnchors {
    id?: string;
    role?: string;
    ariaLabel?: string;
    testId?: string;
    text?: string;
    classes?: string[];
    position?: {
        tagName: string;
        nthChild: number;
        depth: number;
    };
}
export interface SelectorGenerationResult {
    selector: string;
    confidence: number;
    anchors: SelectionAnchors;
    description: string;
}
export interface PageInfo {
    host: string;
    path: string;
    title: string;
    hasPreset: boolean;
    hasSavedConfig: boolean;
    appliedCount: number;
    ruleCount: number;
    isActive: boolean;
    chips: DetectedChip[];
}
export interface DetectedChip {
    id: string;
    name: string;
    selectors: string[];
    active: boolean;
    count?: number;
}
export interface Settings {
    aiEnabled: boolean;
    aiModel: string;
    apiKey?: string;
    fallbackEnabled: boolean;
    syncEnabled: boolean;
    localModelEnabled: boolean;
    globalPreferences: {
        blockCookieNags: boolean;
        reduceMotion: boolean;
        dimAutoplay: boolean;
        autoApplyRules: boolean;
    };
}
export interface ThemeTokens {
    '--obv-bg'?: string;
    '--obv-accent'?: string;
    '--obv-font'?: string;
    '--obv-text-color'?: string;
    '--obv-border-radius'?: string;
}
export interface SitePreset {
    name: string;
    version: string;
    description?: string;
    rules: Rule[];
    themes?: ThemeTokens;
}
export interface UndoAction {
    id: string;
    type: 'rule' | 'theme';
    action: 'apply' | 'remove';
    timestamp: number;
    rule?: Rule;
    elements?: Element[];
    prevValues?: Map<Element, string>;
}
export interface AIModelConfig {
    type: 'local' | 'remote';
    modelName?: string;
    apiEndpoint?: string;
    maxTokens?: number;
    temperature?: number;
}
export interface StructuralContext {
    title: string;
    url: string;
    landmarks: Array<{
        tag: string;
        role?: string;
        classes: string[];
        bounds: DOMRect;
    }>;
    interactiveElements: Array<{
        tag: string;
        type?: string;
        role?: string;
        bounds: DOMRect;
    }>;
    contentAreas: Array<{
        selector: string;
        bounds: DOMRect;
        textLength: number;
    }>;
}
export interface LLMResponse {
    selectors: Array<{
        selector: string;
        description: string;
        confidence: number;
    }>;
}
export type Message = {
    action: 'getPageInfo';
} | {
    action: 'applyRule';
    rule: Rule;
} | {
    action: 'removeRule';
    ruleId: string;
} | {
    action: 'startSelection';
} | {
    action: 'stopSelection';
} | {
    action: 'askAI';
    prompt: string;
} | {
    action: 'undo';
} | {
    action: 'resetSite';
    temporary: boolean;
} | {
    action: 'saveConfig';
} | {
    action: 'loadPreset';
    presetId: string;
} | {
    action: 'applyTheme';
    tokens: ThemeTokens;
} | {
    action: 'exportConfig';
} | {
    action: 'importConfig';
    data: any;
};
export type MessageResponse<T = any> = {
    success: boolean;
    data?: T;
    error?: string;
};
//# sourceMappingURL=types.d.ts.map