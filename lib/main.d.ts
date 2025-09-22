#!/usr/bin/env -S node --experimental-strip-types
import express from "express";
import { type ProjectSettings } from "./common.ts";
import type { JsonLike } from "./utils.ts";
import type { FakeFs } from "./fakeFs.ts";
type Session = {
    userId: number;
    newTranslations: Record<string, Record<string, {
        sourcePhrase: string;
        translatedPhrases: Record<string, string>;
    }>>;
};
type Request = express.Request & {
    session: {
        data: Session;
    };
    projectName: string;
    projectSettings: ProjectSettings;
    previewLanguage: string;
    fakeFs: FakeFs;
    body: string | JsonLike;
};
export type ServeStaticFromFakeFsDistInit = {
    mapContent?: (req: Request, path: string, content: string) => string | null;
};
export declare function serveStaticFromFakeFsDist(options: ServeStaticFromFakeFsDistInit): express.Router;
export {};
