import { SelectorGenerationResult } from '../types/types';
export declare class SelectorEngine {
    private readonly volatileClassPatterns;
    private readonly stableAttributePriority;
    private readonly landmarkTags;
    private readonly maxDepth;
    private readonly maxSelectorLength;
    generate(element: Element): SelectorGenerationResult;
    private tryUniqueId;
    private tryStableAttribute;
    private tryLandmarkRole;
    private tryStableClass;
    private tryRelativeToStableParent;
    private trySemanticPath;
    private tryFallbackSelector;
    private getChildPath;
    private getSemanticStep;
    private getPositionalStep;
    private refineWithContext;
    private createFallbackSelector;
    private isVolatileClass;
    private isVolatileValue;
    private validateSelector;
    private extractAnchors;
    private getElementDepth;
    testSelectorStability(selector: string): Promise<number>;
}
//# sourceMappingURL=selectorEngine.d.ts.map