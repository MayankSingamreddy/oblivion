import { Rule } from '../types/types';
export declare class RuleEngine {
    private appliedRules;
    private undoStack;
    private criticalStyleTag;
    private shadowHosts;
    private maxUndoStackSize;
    constructor();
    applyRule(rule: Rule): number;
    private applyRuleToElement;
    private hideElement;
    private blankElement;
    private replaceElement;
    private createReplacement;
    removeRule(ruleId: string): boolean;
    private restoreElement;
    undo(): boolean;
    resetAll(): void;
    getAppliedRules(): Rule[];
    injectCriticalCSS(rules: Rule[]): void;
    private createCriticalStyleTag;
    private isValidTarget;
    private markElementsAsProcessed;
    private captureElementState;
    private restoreElementState;
    private addToUndoStack;
    private findRuleById;
    validateRule(rule: Rule): boolean;
    isInteractiveElement(element: Element): boolean;
    getStatistics(): {
        totalRules: number;
        totalElements: number;
        undoStackSize: number;
    };
}
//# sourceMappingURL=ruleEngine.d.ts.map