import express from "express"
import type { Response, NextFunction as Next } from "express"
import { engine } from 'express-handlebars';
import bodyParser from "body-parser"
import serveStatic from "serve-static"

import { parse } from "node-html-parser"
import type { HTMLElement } from "node-html-parser"

import * as fs from "fs/promises"

import { lookup as mimeLookup } from "mime-types"

import { TranslationMap, serveStaticWithMapHtml } from "./utils.ts"
import type { JsonLike } from "./utils.ts"
import * as utils from "./utils.ts"

import * as db from "./db.ts"
import * as gh from "./github.ts"
import { Cache } from "./cache.ts"

import * as schemas from "../schemas/schemas.ts"
import { ServerResponse } from "http";

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

//const project: Project = {
//    location: {
//        type: "local",
//        path: "/home/emma/projects/fee-strike/frontend/",
//    }
//}

async function main(serverSettings: schemas.ServerSettings) {
    const cache = await Cache.new(serverSettings.redis.url)

    // app.set("trust proxy", 1) // Uncomment this when wunning behind an https proxy.
    app.use(cache.sessionStorageMiddleware({
        cookie: {
            path: "/",
            httpOnly: true, // TODO
            secure: false, // TODO
            //maxAge: 5 * 60000, // 5 min
            //partitioned: true,
            priority: "medium",
            sameSite: "lax",
        },
        secret: serverSettings.cookieSecret,
    }))
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
    app.use(bodyParser.urlencoded())

    type Session = {
        userId: number,
    }

    type Request = express.Request & {
        session: { data: Session },
        body: string | JsonLike,
    }

    function auth(req: Request, res: Response, next: Next) {
        if (req.session?.data === undefined) {
            res.redirect("/login")
            return
        }
        next()
    }

    app.use(serveStatic("public", {
        dotfiles: "ignore",
        lastModified: false,
        setHeaders: (res: ServerResponse, path: string) => {
            res.setHeader(
                "Content-Type",
                mimeLookup(path) || "application/octet-stream"
            )
        },
    }))

    app.get("/", (req: Request, res: Response) => {
        res.send("<h1>This is the landing page :-)</h1>")
    })

    app.get("/login", (req: Request, res: Response) => {
        res.render("login")
    })

    app.post("/login", async (req: Request, res: Response) => {
        // @ts-ignore
        const { email, password } = utils.assertUrlEncoded(req, res)
        const id = await db.authenticateUser(email, password)

        if (id === null) {
            res.render("login", { signupFailed: true })
            return
        }

        req.session.data = {
            userId: id,
        }
        res.redirect("/home")
        return
    })

    app.get("/signup", (req: Request, res: Response) => {
        res.render("signup")
    })

    app.post("/signup", async (req: Request, res: Response) => {
        // @ts-ignore
        const { email, password } = utils.assertUrlEncoded(req, res)
        await db.createUser(email, password)
        res.redirect("/login")
    })

    app.use(auth)

    app.get("/home", (req: Request, res: Response) => {
        const session = req.session.data
        const projects = db.userProjects(session.userId)
        res.render("home", {
            hasProjects: projects.length > 0,
            projects: projects,
        })
    })

    app.get("/project/new", (req: Request, res: Response) => {
        res.render("projectNew")
    })

    app.post("/project/new", async (req: Request, res: Response) => {
        const session = req.session.data
        // @ts-ignore
        const { name, pat, repopath } = utils.assertUrlEncoded(req, res)

        // Check that the reponame is in the expected format
        if (repopath.split("/").length !== 2) {
            res.statusCode = 422
            res.render("projectNew", { errorMessage: "Expected repository name to be of the form '<username>/<reponame>'" })
            return
        }

        // Validate the token.
        if (! (await gh.validateToken(pat))) {
            res.render("projectNew", { errorMessage: "Hmmn, I don't think the token you supplied is valid." })
            return
        }

        // Check that we can access the repository
        try {
            gh.repo(pat, repopath)
        } catch (e) {
            if (gh.is404(e)) {
                res.render("projectNew", { errorMessage: `Could not find repository www.github.com/${repopath}. Does it exist? Is it accessible with the token?` })
            }
            throw e
        }

        // TODO: You shouldn't be allowed to name your project "new" :-))
        // TODO: How do we make sure (username, projectname) is unique?

        const projectId = db.createProject(name, pat, repopath)
        db.addUserToProject(session.userId, projectId)
        res.redirect("/home")
    })

    app.get("/project/:projectName/dashboard", async (req: Request, res: Response) => {
        const { projectName } = req.params
        const { userId } = req.session.data

        const pInfo = db.projectInfo(userId, projectName)

        if (pInfo === null) {
            res.send(404)
            return
        }

        const projectId = pInfo.id
        const projectToken = pInfo.token
        const path = pInfo.path

        //TODO branch should be configurable
        const branch = "main"

        let result: gh.File
        try {
            result = await gh.repoFile(projectToken, path, "ez-i18n.json")
        } catch (e) {
            if (gh.is404(e)) {
                // TODO report something useful back
                res.send("Cannot find ez-i18n.json in your repo")
                return
            }
            throw e
        }

        // TODO handle
        if (result.type === "directory") {
            res.send(500)
            throw new Error("Unexpected")
        }

        const json = JSON.parse(result.content)

        // Validate ez-i18n.json against our schema
        if(!schemas.projectSettings.validate(json)) {
            // TODO report something useful back
            res.statusCode = 422
            res.statusMessage = "format of ez-i18n.json was in an unexpected format"
            res.end()
            return
        }

        const settings: ProjectSettings = {
            distDir: json.distDir,
            sourceLanguage: json.sourceLanguage,
            targetLanguages: json.targetLanguages,
            contentSelector: json.contentSelector,
            existingTranslations: TranslationMap.fromObject(json.existingTranslations),
        }

        const coverage = await translationCoverage(pInfo, settings)
        await addNewSourcePhrases(pInfo, settings)

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

    //app.use("/preview", serveStaticWithMapHtml(
    //    path.join(project.location.path, settings.distDir),
    //    {
    //        extensions: [ "html" ],
    //        mapHtml: function(html: HTMLElement) {
    //            utils.rewriteLinks(html, (link: string) => {
    //                if (link.startsWith("/")) {
    //                    return `/preview${link}`
    //                }
    //                return link
    //            })
    //            return html
    //        }
    //    }
    //))

    //app.use("/preview/en", serveStaticWithMapHtml(
    //    path.join(project.location.path, settings.distDir),
    //    {
    //        extensions: [ "html" ],
    //        mapHtml: function(html: HTMLElement) {
    //            const settings = getProjectSettings(project)

    //            utils.rewriteLinks(html, (link: string) => {
    //                if (link.startsWith("/")) {
    //                    return `/preview/en${link}`
    //                }
    //                return link
    //            })

    //            const phraseEls = html.querySelectorAll(settings.contentSelector)
    //            for (const phraseEl of phraseEls) {
    //                const translated = settings.existingTranslations.getTranslation(
    //                    phraseEl.innerHTML,
    //                    "en",
    //                )
    //                if (translated === null) {
    //                    continue
    //                }
    //                phraseEl.innerHTML = translated
    //            }

    //            return html
    //        }
    //    }
    //))

    //app.post("/translation/:language/:hash/", (req: Request, res: Response) => {
    //    const { language, hash } = req.params

    //    if(typeof req.body !== "string") {
    //        res.statusMessage = `Content-Type must be ${bodyParserSettings.type}`
    //        res.send(405)
    //        return
    //    }

    //    const translated: string = req.body

    //    if (translated.trim() === "") {
    //        settings.existingTranslations.removeTranslationH(hash, language)
    //    } else {
    //        settings.existingTranslations.addTranslationH(hash, language, translated)
    //    }

    //    res.send(200)
    //})

    app.listen(port, () => {
      console.log(`Listening on port ${port}`)
    })

    type CoverageReport = {
        phrases: number
        translated: number
    }

    // mutates settings.existingTranslations
    async function addNewSourcePhrases(
        info: db.ProjectInfo,
        settings: ProjectSettings
    ): Promise<void> {
        //const distPath = path.join(project.location.path, settings.distDir)
        const distPath = (() => {
            if (settings.distDir.startsWith("/")) {
                return settings.distDir.slice(1)
            }
            if (settings.distDir.startsWith("./")) {
                return settings.distDir.slice(2)
            }
            return settings.distDir
        })()

        // TODO branch should be configurable
        // TODO: recursive: false is temporary -- don't want to be rate-limited
        // while we have no caching.
        const tree = await gh.tree(info.token, info.path, `main:${distPath}`, false)

        // TODO handle
        if (tree.truncated) {
            throw new Error("Unexpected")
        }

        for (const e of tree.tree) {
            // Skip directories
            if (e.type === "tree") {
                continue
            }

            const content = await (async () => {
                // Is the value cached?
                const cached = await cache.getGitObject(e.sha)
                if (cached !== null) {
                    if (cached.type === "tree") {
                        throw new Error("Unexpected")
                    }
                    return cached.content
                }

                const entryPath = `${distPath}/${e.path}`
                const file = await gh.repoFile(info.token, info.path, entryPath)

                if (file.type === "directory") {
                    throw new Error("Unexpected")
                }

                cache.saveGitObject(e.sha, {
                    type: "blob",
                    size: e.size,
                    content: file.content,
                })

                return file.content
            })()

            const parsed: HTMLElement = parse(content, {
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
        info: db.ProjectInfo,
        settings: ProjectSettings,
    ): Promise<Map<string, CoverageReport>> {
        //const distPath = path.join(project.location.path, settings.distDir)
        const distPath = (() => {
            if (settings.distDir.startsWith("/")) {
                return settings.distDir.slice(1)
            }
            if (settings.distDir.startsWith("./")) {
                return settings.distDir.slice(2)
            }
            return settings.distDir
        })()

        const stats: Map<string, CoverageReport> = new Map([])

        // TODO branch should be configurable
        // TODO: recursive: false is temporary -- don't want to be rate-limited
        // while we have no caching.
        const tree = await gh.tree(info.token, info.path, `main:${distPath}`, false)

        // TODO handle
        if (tree.truncated) {
            throw new Error("Unexpected")
        }

        for (const e of tree.tree) {
            // Skip directories
            if (e.type === "tree") {
                continue
            }

            const content = await (async () => {
                // Is the value cached?
                const cached = await cache.getGitObject(e.sha)
                if (cached !== null) {
                    if (cached.type === "tree") {
                        throw new Error("Unexpected")
                    }
                    return cached.content
                }

                const entryPath = `${distPath}/${e.path}`
                const file = await gh.repoFile(info.token, info.path, entryPath)

                if (file.type === "directory") {
                    throw new Error("Unexpected")
                }

                cache.saveGitObject(e.sha, {
                    type: "blob",
                    size: e.size,
                    content: file.content,
                })

                return file.content
            })()


            const parsed: HTMLElement = parse(content, {
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
}

let _serverSettings : schemas.ServerSettings | null = null
async function getServerSettings() : Promise<schemas.ServerSettings> {
    if (_serverSettings === null) {
        const str = await fs.readFile("./settings.dev.json", { encoding: "utf8" })
        const json = JSON.parse(str)
        if (schemas.serverSettings.validate(json)) {
            _serverSettings = json
        } else {
            throw new Error("Invalid format for settings")
        }
    }
    return _serverSettings
}

getServerSettings().then(serverSettings => main(serverSettings))
