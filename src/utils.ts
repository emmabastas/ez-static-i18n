import { createHash } from "node:crypto"

export function sha256(input: string): string {
    return createHash("sha256").update(input).digest("hex")
}

export type TranslationEntry = {
    sourcePhrase: string,
    translatedPhrases: Map<string, string> // maps language to phrase
}

export class TranslationMap {

    private map: Map<string, TranslationEntry> = new Map()

    private constructor(translations: Iterable<readonly [string, TranslationEntry]>) {
        this.map = new Map(translations)
    }

    public static empty(): TranslationMap {
        return new TranslationMap([])
    }

    hasTranslation(phrase: string, language: string): boolean {
        return this.hasTranslationH(sha256(phrase), language)
    }

    hasTranslationH(phraseHash: string, language: string): boolean {
        return this
            .map
            .get(phraseHash)
            ?.translatedPhrases
            .get(language)
            === undefined ? false : true
    }

    getTranslation(phrase: string, language: string): string | null {
        return this.getTranslationH(sha256(phrase), language)
    }

    getTranslationH(phraseHash: string, language: string): string | null {
        return this.map.get(phraseHash)?.translatedPhrases.get(language) ?? null
    }

    addTranslation(phrase: string, language: string, translation: string) {
        this.addTranslationH(sha256(phrase), language, translation)
    }

    addTranslationH(phraseHash: string, language: string, translation: string) {
        // Someone should add a source phrase first with addSourcePhrase
        if (!this.map.has(phraseHash)) {
            throw new Error("Need a source phrase first")
        }
        this.map.get(phraseHash)!.translatedPhrases.set(language, translation)
    }

    removeTranslation(phrase: string, language: string) {
        this.removeTranslationH(sha256(phrase), language)
    }

    removeTranslationH(phraseHash: string, language: string) {
        if (!this.hasTranslationH(phraseHash, language)) {
            throw new Error("Cannot remove what doesn't exist!")
        }
        this.map.get(phraseHash)!.translatedPhrases.delete(language)
    }

    addSourcePhrase(phrase: string) {
        const hash = sha256(phrase)
        if (this.map.has(hash)) {
            throw new Error("Source phrase already exists!")
        }
        this.map.set(hash, {
            sourcePhrase: phrase,
            translatedPhrases: new Map(),
        })
    }

    entries(): [string, TranslationEntry][] {
        return [...this.map.entries()]
    }
}
