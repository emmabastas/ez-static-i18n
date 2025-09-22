import type { ServerResponse } from "http";
import type { HTMLElement } from "node-html-parser";
import type { Request, Response, Handler } from "express";
import type { ServeStaticOptions } from "serve-static";
export type JsonLike = undefined | number | string | JsonLike[] | {
    [key: string]: JsonLike;
};
export declare function assertUrlEncoded(req: Request, res: Response): JsonLike;
export declare function sha256(input: string): string;
export type LinkRewriter = (link: string, element: HTMLElement, prop: string) => string;
export declare function rewriteLinks(html: HTMLElement, f: LinkRewriter): void;
export type TranslationEntry = {
    sourcePhrase: string;
    translatedPhrases: Map<string, string>;
};
export declare class TranslationMap {
    private map;
    private constructor();
    static empty(): TranslationMap;
    static fromObject(translations: Record<string, {
        sourcePhrase: string;
        translatedPhrases: Record<string, string>;
    }>): TranslationMap;
    toObject(): Record<string, {
        sourcePhrase: string;
        translatedPhrases: Record<string, string>;
    }>;
    hasTranslation(phrase: string, language: string): boolean;
    hasTranslationH(phraseHash: string, language: string): boolean;
    getTranslation(phrase: string, language: string): string | null;
    getTranslationH(phraseHash: string, language: string): string | null;
    addTranslation(phrase: string, language: string, translation: string): void;
    addTranslationH(phraseHash: string, language: string, translation: string): void;
    removeTranslation(phrase: string, language: string): void;
    removeTranslationH(phraseHash: string, language: string): void;
    addSourcePhrase(phrase: string): void;
    getSourcePhraseH(phraseHash: string): string | null;
    entries(): [string, TranslationEntry][];
}
export type ServeStaticWithOverwriteOptions = ServeStaticOptions & {
    write?: (res: ServerResponse, _: any[]) => void;
};
export declare function serveStaticWithOverwrite(root: string, options?: ServeStaticWithOverwriteOptions): Handler;
