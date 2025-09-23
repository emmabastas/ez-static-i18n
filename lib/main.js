#!/usr/bin/env -S node --experimental-strip-types
import express from "express";
import { engine } from 'express-handlebars';
import bodyParser from "body-parser";
import serveStatic from "serve-static";
import { parse } from "node-html-parser";
import * as fs from "fs/promises";
import { lookup as mimeLookup } from "mime-types";
import { validateGitHubRepoPath } from "./common.js";
import { TranslationMap } from "./utils.js";
import * as utils from "./utils.js";
import * as db from "./db.js";
import * as gh from "./github.js";
import { Cache } from "./cache.js";
import * as schemas from "./schemas/schemas.js";
import { makeFakeGitHubFs } from "./fakeFs.js";
function projectInfo(cache) {
    const router = express.Router();
    router.use(async function (req, res, next) {
        const projectName = req.projectName;
        if (typeof projectName !== "string") {
            throw new Error("Unexpected");
        }
        const { userId } = req.session.data;
        const pInfo = db.projectInfo(userId, projectName);
        if (pInfo === null) {
            res.send(404);
            return;
        }
        const ghRepoPath = validateGitHubRepoPath(pInfo.path);
        if (ghRepoPath === null) {
            throw new Error("TODO");
        }
        const { settings, fakeFs } = await makeFakeGitHubFs({
            repoPath: ghRepoPath,
            token: pInfo.token,
            cache: cache,
        });
        req.projectSettings = settings;
        req.fakeFs = fakeFs;
        next();
    });
    return router;
}
export function serveStaticFromFakeFsDist(options) {
    const router = express.Router();
    router.use(async function (req, res, next) {
        let path = req.path;
        if (path.endsWith("/")) {
            path += "index.html";
        }
        if (path.startsWith("/")) {
            path = path.slice(1);
        }
        const ffs = req.fakeFs;
        const entries = await ffs.distEntries();
        if (entries === null) {
            throw new Error("TODO");
        }
        const entry = entries.get(path);
        if (entry === undefined) {
            res.send(404);
            return;
        }
        if (entry.type === "tree") {
            res.send(404);
            return;
        }
        let content = await ffs.gitBlob(entry.sha);
        if (content === null) {
            throw new Error("Unexpected");
        }
        if (options.mapContent) {
            const mapped = options.mapContent(req, path, content);
            if (mapped !== null) {
                content = mapped;
            }
        }
        res.setHeader("Content-Type", mimeLookup(path) || "application/octet-stream");
        res.send(content);
        res.end();
    });
    return router;
}
async function main(serverSettings) {
    db.initialize(serverSettings.sqlitePath);
    const app = express();
    const cache = await Cache.new(serverSettings.redis.url);
    app.use(cache.sessionStorageMiddleware({
        cookie: {
            path: "/",
            httpOnly: true,
            secure: false,
            priority: "medium",
            sameSite: "lax",
        },
        secret: serverSettings.cookieSecret,
    }));
    app.set("views", "./dist");
    app.engine("html", engine({
        extname: "html",
        defaultLayout: false,
    }));
    app.set("view engine", "html");
    const bodyParserSettings = {
        type: "text/plain",
        inflate: false,
    };
    app.use(bodyParser.text(bodyParserSettings));
    app.use(bodyParser.urlencoded());
    function auth(req, res, next) {
        if (req.session?.data === undefined) {
            res.redirect("/login");
            return;
        }
        next();
    }
    app.use(serveStatic("dist", {
        dotfiles: "ignore",
        lastModified: false,
        setHeaders: (res, path) => {
            res.setHeader("Content-Type", mimeLookup(path) || "application/octet-stream");
        },
    }));
    app.get("/", (req, res) => {
        res.send("<h1>This is the landing page :-)</h1>");
    });
    app.get("/login", (req, res) => {
        res.render("login");
    });
    app.post("/login", async (req, res) => {
        const { email, password } = utils.assertUrlEncoded(req, res);
        const id = await db.authenticateUser(email, password);
        if (id === null) {
            res.render("login", { loginFailed: true });
            return;
        }
        req.session.data = {
            userId: id,
            newTranslations: {},
        };
        res.redirect("/home");
        return;
    });
    app.get("/signup", (req, res) => {
        res.render("signup");
    });
    app.post("/signup", async (req, res) => {
        const { email, name, password } = utils.assertUrlEncoded(req, res);
        await db.createUser(email, name, password);
        res.redirect("/login");
    });
    app.use(auth);
    app.get("/home", (req, res) => {
        const session = req.session.data;
        const projects = db.userProjects(session.userId);
        res.render("home", {
            hasProjects: projects.length > 0,
            projects: projects,
        });
    });
    app.get("/project/new", (req, res) => {
        res.render("projectNew");
    });
    app.post("/project/new", async (req, res) => {
        const session = req.session.data;
        const { name, pat, repopath } = utils.assertUrlEncoded(req, res);
        if (repopath.split("/").length !== 2) {
            res.statusCode = 422;
            res.render("projectNew", { errorMessage: "Expected repository name to be of the form '<username>/<reponame>'" });
            return;
        }
        if (!(await gh.validateToken(pat))) {
            res.render("projectNew", { errorMessage: "Hmmn, I don't think the token you supplied is valid." });
            return;
        }
        try {
            gh.repo(pat, repopath);
        }
        catch (e) {
            if (gh.is404(e)) {
                res.render("projectNew", { errorMessage: `Could not find repository www.github.com/${repopath}. Does it exist? Is it accessible with the token?` });
            }
            throw e;
        }
        const projectId = db.createProject(name, pat, repopath);
        db.addUserToProject(session.userId, projectId);
        res.redirect("/home");
    });
    app.get("/project/:projectName/dashboard", async (req, res) => {
        const { projectName } = req.params;
        const session = req.session.data;
        const pInfo = db.projectInfo(session.userId, projectName);
        if (pInfo === null) {
            res.send(404);
            return;
        }
        const repoPath = validateGitHubRepoPath(pInfo.path);
        if (repoPath === null) {
            throw new Error("TODO");
        }
        const { settings, fakeFs } = await makeFakeGitHubFs({
            repoPath: repoPath,
            token: pInfo.token,
            cache: cache,
        });
        const coverage = await translationCoverage(settings, fakeFs);
        const newTranslations = (() => {
            if (session.newTranslations[projectName] === undefined) {
                return settings.existingTranslations;
            }
            return TranslationMap.fromObject(session.newTranslations[projectName]);
        })();
        await addNewSourcePhrases(newTranslations, settings, fakeFs);
        session.newTranslations[projectName] = newTranslations.toObject();
        res.render("dashboard", {
            project: projectName,
            sourceLanguage: settings.sourceLanguage,
            targetLanguages: settings.targetLanguages,
            translations: newTranslations
                .entries()
                .filter(([_, { sourcePhrase }]) => sourcePhrase.length < 100)
                .slice(0, 200)
                .map(([_, { sourcePhrase, translatedPhrases }]) => {
                return {
                    sourcePhrase: sourcePhrase,
                    translatedPhrases: settings.targetLanguages.map(l => {
                        return translatedPhrases.get(l) ?? "";
                    }),
                };
            }),
            coverage: [...coverage.entries()].map(([language, report]) => {
                return {
                    language: language,
                    translated: report.translated,
                    phrases: report.phrases,
                };
            }),
        });
    });
    app.use("/preview-translated/:projectName/:lang", (req, res, next) => {
        req.projectName = req.params.projectName;
        req.previewLanguage = req.params.lang;
        next();
    });
    app.use("/preview-translated/:projectName/:lang", projectInfo(cache));
    app.use("/preview-translated/:projectName/:lang", serveStaticFromFakeFsDist({
        mapContent: function (req, path, content) {
            const projectName = req.projectName;
            const lang = req.previewLanguage;
            const settings = req.projectSettings;
            const session = req.session.data;
            if (path.endsWith(".html")) {
                const html = parse(content, { parseNoneClosedTags: true });
                utils.rewriteLinks(html, (link) => {
                    if (link.startsWith("/")) {
                        return `/preview-translated/${req.projectName}/${req.previewLanguage}${link}`;
                    }
                    return link;
                });
                const newTranslations = (() => {
                    if (session.newTranslations[projectName] === undefined) {
                        return settings.existingTranslations;
                    }
                    return TranslationMap.fromObject(session.newTranslations[projectName]);
                })();
                const phraseEls = html.querySelectorAll(settings.contentSelector);
                for (const phraseEl of phraseEls) {
                    const translated = newTranslations.getTranslation(phraseEl.innerHTML, lang);
                    if (translated !== null) {
                        phraseEl.innerHTML = translated;
                        continue;
                    }
                }
                return html.toString();
            }
            return null;
        }
    }));
    app.use("/preview/:projectName", (req, res, next) => {
        req.projectName = req.params.projectName;
        next();
    });
    app.use("/preview/:projectName", projectInfo(cache));
    app.use("/preview/:projectName", serveStaticFromFakeFsDist({
        mapContent: function (req, path, content) {
            if (path.endsWith(".html")) {
                const html = parse(content, { parseNoneClosedTags: true });
                utils.rewriteLinks(html, (link) => {
                    if (link.startsWith("/")) {
                        return `/preview/${req.projectName}${link}`;
                    }
                    return link;
                });
                return html.toString();
            }
            return null;
        }
    }));
    app.use("/translation/:project", (req, res, next) => {
        req.projectName = req.params.project;
        next();
    });
    app.use("/translation/:project", projectInfo(cache));
    app.post("/translation/:project/:language/:hash/", (req, res) => {
        const { project, language, hash } = req.params;
        const settings = req.projectSettings;
        const session = req.session.data;
        const newTranslations = (() => {
            if (session.newTranslations[project] === undefined) {
                return settings.existingTranslations;
            }
            return TranslationMap.fromObject(session.newTranslations[project]);
        })();
        if (typeof req.body !== "string") {
            res.statusMessage = `Content-Type must be ${bodyParserSettings.type}`;
            res.send(405);
            return;
        }
        const translated = req.body;
        if (translated.trim() === "") {
            newTranslations.removeTranslationH(hash, language);
        }
        else {
            newTranslations.addTranslationH(hash, language, translated);
        }
        session.newTranslations[project] = newTranslations.toObject();
        console.log("post done", session.newTranslations);
        res.send(200);
    });
    app.listen(serverSettings.port, () => {
        console.log(`Listening on port ${serverSettings.port}`);
    });
    async function addNewSourcePhrases(translations, settings, ffs) {
        const entries = (await ffs.distEntries());
        if (entries === null) {
            throw new Error("TODO");
        }
        for (const { type, sha } of [...entries.values()].slice(0, 100)) {
            if (type === "tree") {
                continue;
            }
            const content = await ffs.gitBlob(sha);
            if (content === null) {
                throw new Error("Unexpected");
            }
            const parsed = parse(content, {
                parseNoneClosedTags: true,
            });
            const phrases = parsed
                .querySelectorAll(settings.contentSelector)
                .map((e) => e.innerHTML);
            for (const phrase of phrases) {
                try {
                    translations.addSourcePhrase(phrase);
                }
                catch (_) { }
            }
        }
    }
    async function translationCoverage(settings, ffs) {
        const stats = new Map([]);
        const entries = await ffs.distEntries();
        if (entries === null) {
            throw new Error("TODO");
        }
        for (const { type, sha } of [...entries.values()].slice(0, 100)) {
            if (type === "tree") {
                continue;
            }
            const content = await ffs.gitBlob(sha);
            if (content === null) {
                throw new Error("Unexpected");
            }
            const parsed = parse(content, {
                parseNoneClosedTags: true,
            });
            for (const lang of settings.targetLanguages) {
                const report = translationCoverageForLanguage(parsed, lang, settings.existingTranslations, settings.contentSelector);
                const old = stats.get(lang) ?? { phrases: 0, translated: 0 };
                stats.set(lang, {
                    phrases: old.phrases + report.phrases,
                    translated: old.translated + report.translated,
                });
            }
        }
        return stats;
    }
    function translationCoverageForLanguage(html, language, translations, contentSelector) {
        const phrases = html
            .querySelectorAll(contentSelector)
            .map((e) => e.innerHTML);
        const totalPhrases = phrases.length;
        const translatedPhrases = phrases
            .filter(phrase => translations.hasTranslation(phrase, language))
            .length;
        return {
            phrases: totalPhrases,
            translated: translatedPhrases,
        };
    }
}
let _serverSettings = null;
async function getServerSettings(path) {
    if (_serverSettings === null) {
        const str = await fs.readFile(path, { encoding: "utf8" });
        const json = JSON.parse(str);
        if (schemas.serverSettings.validate(json)) {
            _serverSettings = json;
        }
        else {
            throw new Error("Invalid format for settings");
        }
    }
    return _serverSettings;
}
if (process.argv.length !== 3) {
    console.log("");
    console.log("--------------------------------------------");
    console.log("Usage: ez-static-i18n-server <settings.json>");
    console.log("--------------------------------------------");
    console.log("");
    process.exit(-1);
}
const settingsPath = process.argv[2];
getServerSettings(settingsPath).then(serverSettings => main(serverSettings));
