import { createHash } from "node:crypto"
import type { IncomingMessage, ServerResponse } from "http"

import { parse } from "node-html-parser"
import type { HTMLElement } from "node-html-parser"

import type { Request, Response, NextFunction, Handler } from "express"
import type { ServeStaticOptions } from "serve-static"
import serveStatic from "serve-static"

export type JsonLike = undefined | number | string | JsonLike[] | { [ key: string ]: JsonLike }

export function assertUrlEncoded(req: Request, res: Response): JsonLike {
    if (req.headers["content-type"] !== "application/x-www-form-urlencoded") {
        res.statusCode = 405
        res.statusMessage = "Expected content-type: application/x-www-form-urlencoded"
        res.end()
        throw new Error("Bad content-type")
    }
    // @ts-ignore
    return req.body
}

export function sha256(input: string): string {
    return createHash("sha256").update(input).digest("hex")
}

// mutates
export type LinkRewriter =
    (link: string, element: HTMLElement, prop: string) => string
export function rewriteLinks(html: HTMLElement, f: LinkRewriter) {
    const elements = html.querySelectorAll("link, script, a, img, svg")

    for (const e of elements) {
        const href = e.getAttribute("href")
        if (href !== undefined) {
            e.setAttribute("href", f(href, e, "href"))
        }

        const src = e.getAttribute("src")
        if (src !== undefined) {
            e.setAttribute("src", f(src, e, "src"))
        }
    }
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

    public static fromObject(
        translations: {
            [key: string]: {
                sourcePhrase: string,
                translatedPhrases: { [key: string]: string }
            }
        }
    ): TranslationMap {
        return new TranslationMap(Object
            .entries(translations)
            .map(([e, { sourcePhrase, translatedPhrases }]) => {
                return [
                    e,
                    {
                        sourcePhrase: sourcePhrase,
                        translatedPhrases: new Map(Object.entries(translatedPhrases))
                    }
                ]
        }))
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

export type ServeStaticWithMapHtmlOptions = ServeStaticOptions & {
    mapHtml: (_: HTMLElement) => HTMLElement,
}
export function serveStaticWithMapHtml(
    root: string,
    options?: ServeStaticWithMapHtmlOptions,
): Handler {
    return serveStaticWithOverwrite(root, (() => {
        if (options === undefined || options.mapHtml === undefined) {
            return options
        }

        return {
            ...options,
            write: function(res: ServerResponse, args: any[]) {
                // Wy try to only rewrite requests for actual HTML content.
                if(!res.req.headers["accept"]?.includes("text/html")) {
                    // @ts-ignore
                    return res.write(...args)
                }

                if (args.length !== 1 || !Buffer.isBuffer(args[0])) {//!(args[0] instanceof Buffer)) {
                    throw new Error("Unexpected arguments")
                }

                const buf = args[0]
                const html: string = buf.toString("utf8")
                const parsed: HTMLElement = parse(html, {
                    parseNoneClosedTags: true,
                })

                const maped = options.mapHtml(parsed)

                return res.write(parsed.toString())
            },
        }
    })())
}

/*
This is like the built-in express middleware `serve-static` except that this
middleware let's you specify the a `write` option used to overwrite and otherwise
manipulate the content of the body as it is served.
 */
export type ServeStaticWithOverwriteOptions = ServeStaticOptions & {
    write?: (res: ServerResponse, _: any[]) => void
}
export function serveStaticWithOverwrite (
    root: string,
    options?: ServeStaticWithOverwriteOptions,
): Handler {
    const f = serveStatic(root, options)

    // Thank you gpt.
    const handler: ProxyHandler<ServerResponse> = {
        get(target, prop, receiver) {
            const value = Reflect.get(target, prop, receiver);
            if (prop === "write") {
                return (...args: any[]) => {
                    if (typeof options?.write === "function") {
                        options.write(target, args)
                    }
                }
            }

            return typeof value === "function"
                ? value.bind(target) // preserve method context
                : value;
        },

        set(target, prop, value, receiver) {
            return Reflect.set(target, prop, value, receiver);
        },

        has(target, prop) {
            return Reflect.has(target, prop);
        },

        ownKeys(target) {
            return Reflect.ownKeys(target);
        },

        getOwnPropertyDescriptor(target, prop) {
            return Reflect.getOwnPropertyDescriptor(target, prop);
        },

        defineProperty(target, prop, descriptor) {
            return Reflect.defineProperty(target, prop, descriptor);
        },

        deleteProperty(target, prop) {
            return Reflect.deleteProperty(target, prop);
        },

        getPrototypeOf(target) {
            return Reflect.getPrototypeOf(target);
        },

        setPrototypeOf(target, proto) {
            return Reflect.setPrototypeOf(target, proto);
        },

        isExtensible(target) {
            return Reflect.isExtensible(target);
        },

        preventExtensions(target) {
            return Reflect.preventExtensions(target);
        },

        //apply(target, thisArg, args) {
        //    return Reflect.apply(target, thisArg, args);
        //},

        //construct(target, args, newTarget) {
        //    return Reflect.construct(target, args, newTarget);
        //}
    }


    return (req: IncomingMessage, res: ServerResponse, next: NextFunction) => {
        const proxyRes = new Proxy(res, handler)
        return f(req, proxyRes, next)
    }
}
