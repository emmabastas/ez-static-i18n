import { TranslationMap } from "./utils.ts"

// Thank you https://krython.com/tutorial/typescript/phantom-types-compile-time-only-types/
type Phantom<T, P> = T & { readonly __phantom: P };

// A GitHub "repository path" of the form <username>/<reponame>, as it appeas in
// www.github.com/<username>/<reponame>
export type GitHubRepoPath = Phantom<string, "GitHubRepoPath">

export function validateGitHubRepoPath(s: string): GitHubRepoPath | null {
    if (s.split("/").length !== 2) {
        return null
    }
    return s as GitHubRepoPath
}

// A filesystem-like path that can be used with the GitHub REST API to ask for
// files in a repository. Notably this path needs to start bare, i.e. canont
// start with a './' or '/'.
export type GitHubPath = Phantom<string, "GitHubPath">

export function makeGitHubPath(s: string): GitHubPath {
    if (s.startsWith("/")) {
        return s.slice(1) as GitHubPath
    }
    if (s.startsWith("./")) {
        return s.slice(2) as GitHubPath
    }
    return s as GitHubPath
}

export type ProjectSettings = {
    distDir: string
    sourceLanguage: string
    targetLanguages: string[]
    contentSelector: string
    existingTranslations: TranslationMap
}
