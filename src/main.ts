import express from "express"
import type { Request, Response, NextFunction as Next, Handler, RequestHandler } from "express"
import { engine } from 'express-handlebars';
import bodyParser from "body-parser"
import serveStatic from "serve-static"
import { ServerResponse } from "http";

import { parse } from "node-html-parser"
import type { HTMLElement } from "node-html-parser"

import * as fs from "fs/promises"

import { lookup as mimeLookup } from "mime-types"

import { validateGitHubRepoPath, type ProjectSettings } from "./common.ts"
import { TranslationMap } from "./utils.ts"
import type { JsonLike } from "./utils.ts"
import * as utils from "./utils.ts"
import * as db from "./db.ts"
import * as gh from "./github.ts"
import { Cache } from "./cache.ts"
import * as schemas from "../schemas/schemas.ts"
import { makeFakeGitHubFs } from "./fakeFs.ts";
import type { FakeFs } from "./fakeFs.ts"

const app = express()
const port = 3000

type Session = {
    userId: number,
    //newTranslations: Map<string, TranslationMap> // project -> translatioNmap
    newTranslations: Record<string, Record<string, {
        sourcePhrase: string,
        translatedPhrases: Record<string, string>
    }>>
}

type Request = express.Request & {
    session: { data: Session },
    projectName: string
    projectSettings: ProjectSettings
    previewLanguage: string,
    fakeFs: FakeFs
    body: string | JsonLike,
}

// Expects that the project name is already available at req.projectName
function projectInfo(cache: Cache): express.Router {
    const router = express.Router()

    router.use(async function(req: Request, res: Response, next: Next) {
        const projectName = req.projectName
        if (typeof projectName !== "string") {
            throw new Error("Unexpected")
        }

        const { userId } = req.session.data

        const pInfo = db.projectInfo(userId, projectName)

        if (pInfo === null) {
            res.send(404)
            return
        }

        const ghRepoPath = validateGitHubRepoPath(pInfo.path)
        if (ghRepoPath === null) {
            throw new Error("TODO")
        }
        const { settings, fakeFs } = await makeFakeGitHubFs({
            repoPath: ghRepoPath,
            token: pInfo.token,
            cache: cache,
        })

        req.projectSettings = settings
        req.fakeFs = fakeFs

        next()
    })

    return router
}

export type ServeStaticFromFakeFsDistInit = {
    mapContent?: (req: Request, path: string, content: string) => string | null
}

export function serveStaticFromFakeFsDist(
    options: ServeStaticFromFakeFsDistInit
): express.Router {
    const router = express.Router()

    router.use(async function(req: Request, res: Response, next: Next) {
        let path = req.path
        if (path.endsWith("/")) {
            path += "index.html"
        }
        if (path.startsWith("/")) {
            path = path.slice(1)
        }

        const ffs = req.fakeFs

        const entries = await ffs.distEntries()

        if (entries === null) {
            throw new Error("TODO")
        }

        const entry = entries.get(path)

        // The requested item isn't listed
        if (entry === undefined) {
            res.send(404)
            return
        }

        // The requested item is a directory.
        if (entry.type === "tree") {
            res.send(404)
            return
        }

        let content = await ffs.gitBlob(entry.sha)

        // The requested item doesn't exist in the repository.
        // But it does accordint to ffs.distEntries(), something is wrong..
        if (content === null) {
            throw new Error("Unexpected")
        }

        if (options.mapContent) {
            const mapped = options.mapContent(req, path, content)
            if (mapped !== null) {
                content = mapped
            }
        }

        res.setHeader("Content-Type", mimeLookup(path) || "application/octet-stream")
        res.send(content)
        res.end()
    })

    return router
}

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
    app.set("views", "./dist")
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

    function auth(req: Request, res: Response, next: Next) {
        if (req.session?.data === undefined) {
            res.redirect("/login")
            return
        }
        next()
    }

    app.use(serveStatic("dist", {
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
            newTranslations: {},
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
        const session = req.session.data

        const pInfo = db.projectInfo(session.userId, projectName)

        if (pInfo === null) {
            res.send(404)
            return
        }

        const repoPath = validateGitHubRepoPath(pInfo.path)
        if (repoPath === null) {
            throw new Error("TODO")
        }

        const { settings, fakeFs } = await makeFakeGitHubFs({
            repoPath: repoPath,
            token: pInfo.token,
            cache: cache,
        })

        const coverage = await translationCoverage(settings, fakeFs)

        const newTranslations: TranslationMap = (() => {
            if (session.newTranslations[projectName] === undefined) {
                return settings.existingTranslations
            }
            return TranslationMap.fromObject(session.newTranslations[projectName])
        })()
        await addNewSourcePhrases(newTranslations, settings, fakeFs)
        session.newTranslations[projectName] = newTranslations.toObject()
        //console.log("newTranslations", session.newTranslations["jamstack.org"])

        res.render("dashboard", {
            project: projectName,
            sourceLanguage: settings.sourceLanguage,
            targetLanguages: settings.targetLanguages,
            translations: newTranslations
                .entries()
                .filter(([_, { sourcePhrase }]) => sourcePhrase.length < 100) // TODO: temporary filter
                .slice(0, 200) // TODO: Hard-coded limit of 200 items
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

    app.use("/preview-translated/:projectName/:lang", (req: Request, res: Response, next: Next) => {
        req.projectName = req.params.projectName
        req.previewLanguage = req.params.lang
        next()
    })
    app.use("/preview-translated/:projectName/:lang", projectInfo(cache))
    app.use("/preview-translated/:projectName/:lang", serveStaticFromFakeFsDist({
        mapContent: function(req: Request, path: string, content: string) {
            const projectName = req.projectName
            const lang = req.previewLanguage
            const settings = req.projectSettings
            const session = req.session.data

            if (path.endsWith(".html")) {
                const html = parse(content, { parseNoneClosedTags: true })

                utils.rewriteLinks(html, (link: string) => {
                    if (link.startsWith("/")) {
                        return `/preview-translated/${req.projectName}/${req.previewLanguage}${link}`
                    }
                    return link
                })

                // Get the latest-and-greatest most up-to-date version of the
                // users translations
                const newTranslations: TranslationMap = (() => {
                    if (session.newTranslations[projectName] === undefined) {
                        return settings.existingTranslations
                    }
                    return TranslationMap.fromObject(session.newTranslations[projectName])
                })()


                // Get all the phrases
                const phraseEls = html.querySelectorAll(settings.contentSelector)
                for (const phraseEl of phraseEls) {
                    // Use a translation if one exists
                    const translated = newTranslations.getTranslation(
                        phraseEl.innerHTML,
                        lang,
                    )
                    if (translated !== null) {
                        phraseEl.innerHTML = translated
                        continue
                    }
                    // othwrwise leave the phrase unaltered.
                }

                return html.toString()
            }

            return null
        }
    }))

    app.use("/preview/:projectName", (req: Request, res: Response, next: Next) => {
        req.projectName = req.params.projectName
        next()
    })
    app.use("/preview/:projectName", projectInfo(cache))
    app.use("/preview/:projectName", serveStaticFromFakeFsDist({
        mapContent: function(req: Request, path: string, content: string) {

            if (path.endsWith(".html")) {
                const html = parse(content, { parseNoneClosedTags: true })

                // Rewrite the links
                utils.rewriteLinks(html, (link: string) => {
                    if (link.startsWith("/")) {
                        return `/preview/${req.projectName}${link}`
                    }
                    return link
                })

                return html.toString()
            }

            return null
        }
    }))

    app.use("/translation/:project", (req: Request, res: Response, next: Next) => {
        req.projectName = req.params.project
        next()
    })
    app.use("/translation/:project", projectInfo(cache))
    app.post("/translation/:project/:language/:hash/", (req: Request, res: Response) => {
        const { project, language, hash } = req.params
        const settings = req.projectSettings
        const session = req.session.data

        const newTranslations: TranslationMap = (() => {
            if (session.newTranslations[project] === undefined) {
                return settings.existingTranslations
            }
            return TranslationMap.fromObject(session.newTranslations[project])
        })()

        if(typeof req.body !== "string") {
            res.statusMessage = `Content-Type must be ${bodyParserSettings.type}`
            res.send(405)
            return
        }

        const translated: string = req.body

        if (translated.trim() === "") {
            newTranslations.removeTranslationH(hash, language)
        } else {
            newTranslations.addTranslationH(hash, language, translated)
        }

        session.newTranslations[project] = newTranslations.toObject()
        console.log("post done", session.newTranslations)

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
        translations: TranslationMap,
        settings: ProjectSettings,
        ffs: FakeFs,
    ): Promise<void> {
        const entries = (await ffs.distEntries())

        if (entries === null) {
            throw new Error("TODO")
        }

        for (const { type, sha} of [...entries.values()].slice(0, 100)) {
            // Skip directories
            if (type === "tree") {
                continue
            }

            const content = await ffs.gitBlob(sha)

            // The blob doesn't exist event though it's a child of the dist
            // tree.
            if (content === null) {
                throw new Error("Unexpected")
            }

            const parsed: HTMLElement = parse(content, {
                parseNoneClosedTags: true,
            })

            const phrases = parsed
                .querySelectorAll(settings.contentSelector)
                .map((e: HTMLElement) => e.innerHTML)

            for (const phrase of phrases) {
                try {
                    translations.addSourcePhrase(phrase)
                } catch(_) {}
            }
        }
    }

    async function translationCoverage(
        settings: ProjectSettings,
        ffs: FakeFs,
    ): Promise<Map<string, CoverageReport>> {
        const stats: Map<string, CoverageReport> = new Map([])

        const entries = await ffs.distEntries()

        if (entries === null) {
            throw new Error("TODO")
        }

        // TODO: hard-coded limit of 100 files.
        for (const { type, sha } of [...entries.values()].slice(0, 100)) {
            // Skip directories
            if (type === "tree") {
                continue
            }

            const content = await ffs.gitBlob(sha)

            // The blob doesn't exist event though it's a child of the dist
            // tree.
            if (content === null) {
                throw new Error("Unexpected")
            }

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
