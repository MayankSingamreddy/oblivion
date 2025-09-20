import { ThemeTokens } from '../types/types';
import { StorageManager } from './storage';
export declare class ThemeCapsule {
    private shadowHost;
    private shadowRoot;
    private themeStyleTag;
    private uiStyleTag;
    private storage;
    private host;
    private currentTheme;
    private components;
    private readonly defaultTokens;
    constructor(storage: StorageManager);
    private initialize;
    private createThemeCapsule;
    private createShadowStyles;
    private applyThemeTokens;
    private generateShadowCSS;
    private applyPageLevelTheme;
    private generatePageCSS;
    private tokensToCSS;
    private loadHostTheme;
    applyTheme(tokens: Partial<ThemeTokens>): Promise<boolean>;
    resetTheme(): Promise<boolean>;
    createUIComponent(name: string, content: string, className?: string): HTMLElement | null;
    removeUIComponent(name: string): boolean;
    createFloatingUI(content: string, position: {
        x: number;
        y: number;
    }): HTMLElement;
    private setupThemeObserver;
    private handleSystemThemeChange;
    private getDarkThemeTokens;
    private getLightThemeTokens;
    private getUIStyles;
    getCurrentTheme(): ThemeTokens | null;
    isThemeApplied(): boolean;
    createThemePicker(): HTMLElement | null;
    private setupThemePickerEvents;
    destroy(): void;
}
//# sourceMappingURL=themeCapsule.d.ts.map