import { TranslationMap } from "./utils.ts";
type Phantom<T, P> = T & {
    readonly __phantom: P;
};
export type GitHubRepoPath = Phantom<string, "GitHubRepoPath">;
export declare function validateGitHubRepoPath(s: string): GitHubRepoPath | null;
export type GitHubPath = Phantom<string, "GitHubPath">;
export declare function makeGitHubPath(s: string): GitHubPath;
export type ProjectSettings = {
    distDir: string;
    sourceLanguage: string;
    targetLanguages: string[];
    contentSelector: string;
    existingTranslations: TranslationMap;
};
export {};
