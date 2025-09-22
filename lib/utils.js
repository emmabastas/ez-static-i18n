import { createHash } from "node:crypto";
import serveStatic from "serve-static";
export function assertUrlEncoded(req, res) {
    if (req.headers["content-type"] !== "application/x-www-form-urlencoded") {
        res.statusCode = 405;
        res.statusMessage = "Expected content-type: application/x-www-form-urlencoded";
        res.end();
        throw new Error("Bad content-type");
    }
    return req.body;
}
export function sha256(input) {
    return createHash("sha256").update(input).digest("hex");
}
export function rewriteLinks(html, f) {
    const elements = html.querySelectorAll("link, script, a, img, svg");
    for (const e of elements) {
        const href = e.getAttribute("href");
        if (href !== undefined) {
            e.setAttribute("href", f(href, e, "href"));
        }
        const src = e.getAttribute("src");
        if (src !== undefined) {
            e.setAttribute("src", f(src, e, "src"));
        }
    }
}
export class TranslationMap {
    map = new Map();
    constructor(translations) {
        this.map = new Map(translations);
    }
    static empty() {
        return new TranslationMap([]);
    }
    static fromObject(translations) {
        return new TranslationMap(Object
            .entries(translations)
            .map(([e, { sourcePhrase, translatedPhrases }]) => {
            return [
                e,
                {
                    sourcePhrase: sourcePhrase,
                    translatedPhrases: new Map(Object.entries(translatedPhrases))
                }
            ];
        }));
    }
    toObject() {
        const obj = {};
        for (const [k, v] of [...this.map.entries()]) {
            const obj2 = {};
            for (const [k2, v2] of [...v.translatedPhrases.entries()]) {
                obj2[k2] = v2;
            }
            obj[k] = {
                sourcePhrase: v.sourcePhrase,
                translatedPhrases: obj2
            };
        }
        return obj;
    }
    hasTranslation(phrase, language) {
        return this.hasTranslationH(sha256(phrase), language);
    }
    hasTranslationH(phraseHash, language) {
        return this
            .map
            .get(phraseHash)
            ?.translatedPhrases
            .get(language)
            === undefined ? false : true;
    }
    getTranslation(phrase, language) {
        return this.getTranslationH(sha256(phrase), language);
    }
    getTranslationH(phraseHash, language) {
        return this.map.get(phraseHash)?.translatedPhrases.get(language) ?? null;
    }
    addTranslation(phrase, language, translation) {
        this.addTranslationH(sha256(phrase), language, translation);
    }
    addTranslationH(phraseHash, language, translation) {
        if (!this.map.has(phraseHash)) {
            throw new Error("Need a source phrase first");
        }
        this.map.get(phraseHash).translatedPhrases.set(language, translation);
    }
    removeTranslation(phrase, language) {
        this.removeTranslationH(sha256(phrase), language);
    }
    removeTranslationH(phraseHash, language) {
        if (!this.hasTranslationH(phraseHash, language)) {
            throw new Error("Cannot remove what doesn't exist!");
        }
        this.map.get(phraseHash).translatedPhrases.delete(language);
    }
    addSourcePhrase(phrase) {
        const hash = sha256(phrase);
        if (this.map.has(hash)) {
            throw new Error("Source phrase already exists!");
        }
        this.map.set(hash, {
            sourcePhrase: phrase,
            translatedPhrases: new Map(),
        });
    }
    getSourcePhraseH(phraseHash) {
        return this.map.get(phraseHash)?.sourcePhrase ?? null;
    }
    entries() {
        return [...this.map.entries()];
    }
}
export function serveStaticWithOverwrite(root, options) {
    const f = serveStatic(root, options);
    const handler = {
        get(target, prop, receiver) {
            const value = Reflect.get(target, prop, receiver);
            if (prop === "write") {
                return (...args) => {
                    if (typeof options?.write === "function") {
                        options.write(target, args);
                    }
                };
            }
            return typeof value === "function"
                ? value.bind(target)
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
    };
    return (req, res, next) => {
        const proxyRes = new Proxy(res, handler);
        return f(req, proxyRes, next);
    };
}
