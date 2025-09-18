import express from "express"
import type { Response, NextFunction as Next } from "express"
import { engine } from 'express-handlebars';
import bodyParser from "body-parser"
import serveStatic from "serve-static"

import { parse } from "node-html-parser"
import type { HTMLElement } from "node-html-parser"

import * as path from "path"
import * as fs from "fs/promises"

import { TranslationMap, serveStaticWithMapHtml } from "./utils.ts"
import * as utils from "./utils.ts"

const app = express()
const port = 3000

type Project = {
    location: Location
}

type Location = {
    type: "local"
    path: string
}

type ProjectSettings = {
    distDir: string
    sourceLanguage: string
    targetLanguages: string[]
    contentSelector: string
    existingTranslations: TranslationMap
}

const project: Project = {
    location: {
        type: "local",
        path: "/home/emma/projects/fee-strike/frontend/",
    }
}

function getProjectSettings(project: Project) {
    return settings
}

const settings: ProjectSettings = {
    distDir: "dist",
    sourceLanguage: "Swedish",
    targetLanguages: ["en", "sp"],
    contentSelector: "h1, h2, h3, h4, h5, h6, p, li, title",
    existingTranslations: TranslationMap.empty(),
}

app.set("views", "./views")
app.engine("html", engine({
    extname: "html",
    defaultLayout: false,
}))
app.set("view engine", "html")

// Whenever conent-type is text/plain this middleware makes the body
// available as a string under req.body
const bodyParserSettings = {
    type: "text/plain",
    inflate: false,
}
app.use(bodyParser.text(bodyParserSettings))

type Request = express.Request & {
    body?: string
}

app.use(serveStatic("public"))

app.get("/dashboard", async (req: Request, res: Response) => {
    const settings = await getProjectSettings(project)
    const coverage = await translationCoverage(project, settings)
    await addNewSourcePhrases(project, settings)

    res.render("dashboard", {
        sourceLanguage: settings.sourceLanguage,
        targetLanguages: settings.targetLanguages,
        translations: settings.existingTranslations
            .entries()
            .map(([_, { sourcePhrase, translatedPhrases }]) => {
                return {
                    sourcePhrase: sourcePhrase,
                    translatedPhrases: settings.targetLanguages.map(l => {
                        return translatedPhrases.get(l) ?? ""
                    }),
                }
            }),
        coverage: [...coverage.entries()].map(([language, report]) => {
            return {
                language: language,
                translated: report.translated,
                phrases: report.phrases,
            }
        }),
    })
})

app.use("/preview", serveStaticWithMapHtml(
    path.join(project.location.path, settings.distDir),
    {
        extensions: [ "html" ],
        mapHtml: function(html: HTMLElement) {
            utils.rewriteLinks(html, (link: string) => {
                if (link.startsWith("/")) {
                    return `/preview${link}`
                }
                return link
            })
            return html
        }
    }
))

app.use("/preview/en", serveStaticWithMapHtml(
    path.join(project.location.path, settings.distDir),
    {
        extensions: [ "html" ],
        mapHtml: function(html: HTMLElement) {
            const settings = getProjectSettings(project)

            utils.rewriteLinks(html, (link: string) => {
                if (link.startsWith("/")) {
                    return `/preview/en${link}`
                }
                return link
            })

            const phraseEls = html.querySelectorAll(settings.contentSelector)
            for (const phraseEl of phraseEls) {
                const translated = settings.existingTranslations.getTranslation(
                    phraseEl.innerHTML,
                    "en",
                )
                if (translated === null) {
                    continue
                }
                phraseEl.innerHTML = translated
            }

            return html
        }
    }
))

app.post("/translation/:language/:hash/", (req: Request, res: Response) => {
    const { language, hash } = req.params

    if(typeof req.body !== "string") {
        res.statusMessage = `Content-Type must be ${bodyParserSettings.type}`
        res.send(405)
        return
    }

    const translated: string = req.body

    if (translated.trim() === "") {
        settings.existingTranslations.removeTranslationH(hash, language)
    } else {
        settings.existingTranslations.addTranslationH(hash, language, translated)
    }

    res.send(200)
})

app.listen(port, () => {
  console.log(`Listening on port ${port}`)
})

type CoverageReport = {
    phrases: number
    translated: number
}

// mutates settings.existingTranslations
async function addNewSourcePhrases(
    project: Project,
    settings: ProjectSettings
): Promise<void> {
    if (project.location.type !== "local") {
        throw new Error("TODO")
    }

    const distPath = path.join(project.location.path, settings.distDir)


    for await (const e of fs.glob(path.join(distPath, "**/*.html"))) {
        const data = await fs.readFile(e, { encoding: "utf8" })
        const parsed: HTMLElement = parse(data, {
            parseNoneClosedTags: true,
        })

        const phrases = parsed
            .querySelectorAll(settings.contentSelector)
            .map((e: HTMLElement) => e.innerHTML)

        for (const phrase of phrases) {
            try {
                // TranslationsMap throws error if source phrase already
                // exists
                settings.existingTranslations.addSourcePhrase(phrase)
            } catch(_) {}
        }
    }
}

async function translationCoverage(
    project: Project,
    settings: ProjectSettings,
): Promise<Map<string, CoverageReport>> {

    if (project.location.type !== "local") {
        throw new Error("TODO")
    }

    const stats: Map<string, CoverageReport> = new Map([])

    const distPath = path.join(project.location.path, settings.distDir)

    for await (const e of fs.glob(path.join(distPath, "**/*.html"))) {
        const data = await fs.readFile(e, { encoding: "utf8" })
        const parsed: HTMLElement = parse(data, {
            parseNoneClosedTags: true,
        })

        for (const lang of settings.targetLanguages) {
            const report = translationCoverageForLanguage(
                parsed,
                lang,
                settings.existingTranslations,
                settings.contentSelector,
            )
            const old = stats.get(lang) ?? { phrases: 0, translated: 0 }
            stats.set(lang, {
                phrases: old.phrases + report.phrases,
                translated: old.translated + report.translated,
            })
        }
    }

    return stats
}

function translationCoverageForLanguage(
    html: HTMLElement,
    language: string,
    translations: TranslationMap,
    contentSelector: string
): CoverageReport {

    const phrases = html
        .querySelectorAll(contentSelector)
        .map((e: HTMLElement) => e.innerHTML)

    const totalPhrases = phrases.length

    const translatedPhrases = phrases
        .filter(phrase => translations.hasTranslation(phrase, language))
        .length

    return {
        phrases: totalPhrases,
        translated: translatedPhrases,
    }
}
