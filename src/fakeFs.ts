import { Cache } from "./cache.ts"
import * as schemas from "../schemas/schemas.ts"
import * as gh from "./github.ts"
import {
    makeGitHubPath,
} from "./common.ts"
import type {
    ProjectSettings,
    GitHubRepoPath,
    GitHubPath,
} from "./common.ts"
import { TranslationMap } from "./utils.ts"

export type GitObject = {
    type: "blob",
    size: number,
    content: string, // Note: this will fail if we try to store a file that's
                     //       > 512 MB
} | {
    type: "tree",
    children: string[] // list of hashes
}

export interface FakeFs {
    distEntries(): Promise<Map<string, { sha: string, type: "blob" | "tree" }> | null>
    gitBlob(sha: string): Promise<string | null>
}

export type FakeFsGitHubInit = {
    repoPath: GitHubRepoPath,
    // branch: string ??
    token: string,
    cache: Cache,
}

export async function makeFakeGitHubFs(init: FakeFsGitHubInit): Promise<{
    settings: ProjectSettings
    fakeFs: FakeFs,
}> {
    // TODO sould be configurable
    const branch = "main"

    const settings = await (async () => {
        // Do we have project settings in cache?
        const cached = await init.cache.getProjectSettings(init.repoPath, branch)
        if (cached !== null) {
            return cached
        }

        let result: gh.File
        try {
            result = await gh.repoFile(init.token, init.repoPath, "ez-i18n.json")
        } catch (e) {
            if (gh.is404(e)) {
                throw Error("TODO")
            }
            throw e
        }

        if (result.type === "directory") {
            throw new Error("TODO")
        }

        const json = JSON.parse(result.content)

        // Validate ez-i18n.json against our schema
        if(!schemas.projectSettings.validate(json)) {
            throw new Error("TODO")
        }

        const settings: ProjectSettings = {
            distDir: json.distDir,
            sourceLanguage: json.sourceLanguage,
            targetLanguages: json.targetLanguages,
            contentSelector: json.contentSelector,
            existingTranslations: TranslationMap.fromObject(json.existingTranslations),
        }

        // Save to cache
        init.cache.saveProjectSettings(
            init.repoPath,
            branch,
            settings,
        )

        return settings
    })()

    return {
        settings: settings,
        fakeFs: new GitHubFakeFs({
            repoPath: init.repoPath,
            distPath: makeGitHubPath(settings.distDir),
            token: init.token,
            cache: init.cache,
        })
    }

}

export type GitHubFakeFsInit = {
    repoPath: GitHubRepoPath,
    distPath: GitHubPath,
    token: string,
    cache: Cache,
}

export class GitHubFakeFs implements FakeFs {
    private repoPath: GitHubRepoPath
    private distPath: GitHubPath
    private token: string
    private cache: Cache
    private branch: string

    constructor(options: GitHubFakeFsInit) {
        this.repoPath = options.repoPath
        this.distPath = options.distPath
        this.token = options.token
        this.cache = options.cache
        this.branch = "main" // TODO should be cofigurable
    }

    async distEntries(): Promise<
        Map<string, { sha: string, type: "blob" | "tree" }> | null
    > {
        // Something in cache?
        const cached = await this.cache.getDistInfo(this.repoPath, "main")
        if (cached !== null) {
            return cached.children
        }
        console.log("distEntries cache miss")

        // No? Ask GitHub
        let tree: gh.Tree
        try {
            tree = await gh.tree(
                this.token,
                this.repoPath,
                `${this.branch}:${this.distPath}`,
                true // Get recursivevely
            )
        } catch (e) {
            if (gh.is404(e)) {
                console.log("error", await (e as gh.RequestError).response.text())
                return null
            }
            throw e
        }

        // GitHub didn't seend is all the entries in a single request.
        // TODO handle
        if (tree.truncated) {
            throw new Error("TODO")
        }

        const entries = new Map(tree.tree.map(e => {
            return [
                e.path,
                {
                    type: e.type,
                    sha: e.sha,
                }
            ]
        }))

        // Cache what we found
        // NB. this operation is asyncronous, but we can return our result
        // before being sure it's cached right?
        this.cache.saveDistInfo(this.repoPath, this.branch, {
            sha: tree.sha,
            children: entries,
        })

        // We can also cache it as a git object
        this.cache.saveGitObject(tree.sha, {
            type: "tree",
            children: tree.tree.map(e => e.sha)
        })

        return entries
    }

    async gitBlob(sha: string): Promise<string | null> {
        // Is the value cached?
        const cached = await this.cache.getGitObject(sha)
        if (cached !== null && cached.type === "blob") {
            return cached.content
        }
        console.log("gitBlob cache miss")

        // No? Ask GitHub.
        let content: string
        let size: number
        try {
            const ret = await gh.repoBlob(this.token, this.repoPath, sha)
            content = ret.content
            size = ret.size
        } catch (e) {
            if (gh.is404(e)) {
                return null
            }
            throw e
        }

        // Save to cache
        this.cache.saveGitObject(sha, {
            type: "blob",
            size: size,
            content: content,
        })

        return content
    }
}
