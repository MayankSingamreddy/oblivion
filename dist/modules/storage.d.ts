import { Rule, Settings, ThemeTokens } from '../types/types';
export declare class StorageManager {
    private readonly MAX_SYNC_SIZE;
    private readonly MAX_RULES_PER_HOST;
    private readonly COMPRESSION_THRESHOLD;
    private readonly VERSION;
    private memoryCache;
    private compressionDict;
    constructor();
    private initializeStorage;
    saveHostRules(host: string, rules: Rule[]): Promise<boolean>;
    loadHostRules(host: string): Promise<Rule[]>;
    saveRule(host: string, rule: Rule): Promise<boolean>;
    removeRule(host: string, ruleId: string): Promise<boolean>;
    clearHostRules(host: string): Promise<boolean>;
    saveSettings(settings: Settings): Promise<boolean>;
    loadSettings(): Promise<Settings>;
    saveHostThemes(host: string, themes: ThemeTokens): Promise<boolean>;
    loadHostThemes(host: string): Promise<ThemeTokens | null>;
    exportData(): Promise<string>;
    importData(jsonData: string): Promise<{
        success: boolean;
        imported: number;
        errors: string[];
    }>;
    getStorageStats(): Promise<{
        used: number;
        quota: number;
        hostCount: number;
        ruleCount: number;
        oldestAccess: number;
    }>;
    performMaintenance(): Promise<{
        cleaned: number;
        size: number;
    }>;
    private saveCompressedHostData;
    private saveUncompressedHostData;
    private saveHostData;
    private loadHostData;
    private decompressHostData;
    private compressString;
    private decompressString;
    private isCacheValid;
    private debounceUpdateAccess;
    private updateLastAccess;
    private debounce;
    private migrateIfNeeded;
    private migrateLegacyData;
    private getDefaultSettings;
    saveMultipleRules(rules: Array<{
        host: string;
        rule: Rule;
    }>): Promise<{
        success: number;
        failed: number;
    }>;
    getAllHosts(): Promise<string[]>;
    searchRules(query: string): Promise<Array<{
        host: string;
        rule: Rule;
    }>>;
}
//# sourceMappingURL=storage.d.ts.map