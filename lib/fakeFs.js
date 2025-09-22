import * as schemas from "./schemas/schemas.js";
import * as gh from "./github.js";
import { makeGitHubPath, } from "./common.js";
import { TranslationMap } from "./utils.js";
export async function makeFakeGitHubFs(init) {
    const branch = "main";
    const settings = await (async () => {
        const cached = await init.cache.getProjectSettings(init.repoPath, branch);
        if (cached !== null) {
            return cached;
        }
        let result;
        try {
            result = await gh.repoFile(init.token, init.repoPath, "ez-i18n.json");
        }
        catch (e) {
            if (gh.is404(e)) {
                throw Error("TODO");
            }
            throw e;
        }
        if (result.type === "directory") {
            throw new Error("TODO");
        }
        const json = JSON.parse(result.content);
        if (!schemas.projectSettings.validate(json)) {
            throw new Error("TODO");
        }
        const settings = {
            distDir: json.distDir,
            sourceLanguage: json.sourceLanguage,
            targetLanguages: json.targetLanguages,
            contentSelector: json.contentSelector,
            existingTranslations: TranslationMap.fromObject(json.existingTranslations),
        };
        init.cache.saveProjectSettings(init.repoPath, branch, settings);
        return settings;
    })();
    return {
        settings: settings,
        fakeFs: new GitHubFakeFs({
            repoPath: init.repoPath,
            distPath: makeGitHubPath(settings.distDir),
            token: init.token,
            cache: init.cache,
        })
    };
}
export class GitHubFakeFs {
    repoPath;
    distPath;
    token;
    cache;
    branch;
    constructor(options) {
        this.repoPath = options.repoPath;
        this.distPath = options.distPath;
        this.token = options.token;
        this.cache = options.cache;
        this.branch = "main";
    }
    async distEntries() {
        const cached = await this.cache.getDistInfo(this.repoPath, "main");
        if (cached !== null) {
            return cached.children;
        }
        console.log("distEntries cache miss");
        let tree;
        try {
            tree = await gh.tree(this.token, this.repoPath, `${this.branch}:${this.distPath}`, true);
        }
        catch (e) {
            if (gh.is404(e)) {
                console.log("error", await e.response.text());
                return null;
            }
            throw e;
        }
        if (tree.truncated) {
            throw new Error("TODO");
        }
        const entries = new Map(tree.tree.map(e => {
            return [
                e.path,
                {
                    type: e.type,
                    sha: e.sha,
                }
            ];
        }));
        this.cache.saveDistInfo(this.repoPath, this.branch, {
            sha: tree.sha,
            children: entries,
        });
        this.cache.saveGitObject(tree.sha, {
            type: "tree",
            children: tree.tree.map(e => e.sha)
        });
        return entries;
    }
    async gitBlob(sha) {
        const cached = await this.cache.getGitObject(sha);
        if (cached !== null && cached.type === "blob") {
            return cached.content;
        }
        console.log("gitBlob cache miss");
        let content;
        let size;
        try {
            const ret = await gh.repoBlob(this.token, this.repoPath, sha);
            content = ret.content;
            size = ret.size;
        }
        catch (e) {
            if (gh.is404(e)) {
                return null;
            }
            throw e;
        }
        this.cache.saveGitObject(sha, {
            type: "blob",
            size: size,
            content: content,
        });
        return content;
    }
}
