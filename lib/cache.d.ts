import express from "express";
import session from "express-session";
import type { ProjectSettings } from "./common.ts";
export type GitObject = {
    type: "blob";
    size: number;
    content: string;
} | {
    type: "tree";
    children: string[];
};
export type DistInfo = {
    sha: string;
    children: Map<string, {
        sha: string;
        type: "blob" | "tree";
    }>;
};
export declare class Cache {
    private client;
    private sessionStorageMiddleware_;
    private gitObjectRepository;
    private distInfoRepository;
    private projectSettingsRepository;
    private constructor();
    static new(redisUrl: string): Promise<Cache>;
    sessionStorageMiddleware(options: session.SessionOptions): express.RequestHandler;
    getGitObject(sha: string): Promise<GitObject | null>;
    saveGitObject(sha: string, obj: GitObject): Promise<void>;
    getDistInfo(repoPath: string, branch: string): Promise<DistInfo | null>;
    saveDistInfo(repoPath: string, branch: string, info: DistInfo): Promise<void>;
    getProjectSettings(repoPath: string, branch: string): Promise<ProjectSettings | null>;
    saveProjectSettings(repoPath: string, branch: string, settings: ProjectSettings): Promise<void>;
}
