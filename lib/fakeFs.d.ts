import { Cache } from "./cache.ts";
import type { ProjectSettings, GitHubRepoPath, GitHubPath } from "./common.ts";
export type GitObject = {
    type: "blob";
    size: number;
    content: string;
} | {
    type: "tree";
    children: string[];
};
export interface FakeFs {
    distEntries(): Promise<Map<string, {
        sha: string;
        type: "blob" | "tree";
    }> | null>;
    gitBlob(sha: string): Promise<string | null>;
}
export type FakeFsGitHubInit = {
    repoPath: GitHubRepoPath;
    token: string;
    cache: Cache;
};
export declare function makeFakeGitHubFs(init: FakeFsGitHubInit): Promise<{
    settings: ProjectSettings;
    fakeFs: FakeFs;
}>;
export type GitHubFakeFsInit = {
    repoPath: GitHubRepoPath;
    distPath: GitHubPath;
    token: string;
    cache: Cache;
};
export declare class GitHubFakeFs implements FakeFs {
    private repoPath;
    private distPath;
    private token;
    private cache;
    private branch;
    constructor(options: GitHubFakeFsInit);
    distEntries(): Promise<Map<string, {
        sha: string;
        type: "blob" | "tree";
    }> | null>;
    gitBlob(sha: string): Promise<string | null>;
}
