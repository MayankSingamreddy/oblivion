import { SitePreset } from '../types/types';
import { StorageManager } from './storage';
interface PresetMetadata {
    id: string;
    name: string;
    version: string;
    description: string;
    author: string;
    website: string;
    ruleCount: number;
    hasThemes: boolean;
    lastUpdated: number;
    tags: string[];
}
export declare class PresetManager {
    private storage;
    private builtinPresets;
    private customPresets;
    constructor(storage: StorageManager);
    private initializeBuiltinPresets;
    private loadCustomPresets;
    getPresetForHost(host: string): SitePreset | null;
    getAllPresets(): {
        builtin: PresetMetadata[];
        custom: PresetMetadata[];
    };
    private createPresetMetadata;
    private generateTags;
    applyPreset(host: string): Promise<{
        success: boolean;
        applied: number;
        errors: string[];
    }>;
    createCustomPreset(host: string, name: string, description?: string): Promise<{
        success: boolean;
        preset?: SitePreset;
        error?: string;
    }>;
    deleteCustomPreset(host: string): Promise<boolean>;
    exportPreset(host: string): string | null;
    importPreset(jsonData: string): Promise<{
        success: boolean;
        host?: string;
        error?: string;
    }>;
    exportAllPresets(): Promise<string>;
    importAllPresets(jsonData: string): Promise<{
        success: boolean;
        imported: number;
        errors: string[];
    }>;
    searchPresets(query: string): PresetMetadata[];
    getRecommendationsForHost(host: string): PresetMetadata[];
    private findSimilarPresets;
    private calculateSimilarity;
    private getPopularPresets;
    private extractBaseDomain;
    updateBuiltinPresets(): Promise<{
        updated: number;
        added: number;
    }>;
    getStatistics(): {
        totalPresets: number;
        builtinCount: number;
        customCount: number;
        totalRules: number;
        hostsWithPresets: string[];
    };
}
export {};
//# sourceMappingURL=presets.d.ts.map