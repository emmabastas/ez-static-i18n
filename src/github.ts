/*
See https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api?apiVersion=2022-11-28
for best practices when using the GitHub REST API.

Permissions required for fine-grained PAT's:
https://docs.github.com/en/rest/authentication/permissions-required-for-fine-grained-personal-access-tokens?apiVersion=2022-11-28

Webook can help avoid poling: https://docs.github.com/en/webhooks

There is also a GraphQL api.
 */

import { Agent } from "https"

let agent_ : Agent | null = null
function agent(): Agent {
    if (agent_ === null) {
        agent_ = new Agent()
    }
    return agent_
}

function assertRepoPath(path: string): [string, string] {
    if (path.split("/").length !== 2) {
        throw new Error("Unexpected")
    }
    const userName = path.split("/")[0]
    const projectName = path.split("/")[1]
    return [userName, projectName]
}

export type Opts = Omit<RequestInit, "method" | "redirect" | "credentials"> & {
    queryParams?: URLSearchParams
}
export type Method = "GET" | "POST" | "PUT" | "DELETE"

export class RequestError extends Error {
    readonly response: Response

    constructor(response: Response) {
        super(`Error, request returned ${response.status}: ${response.statusText}`)
        this.response = response
    }
}

export function is404(err: Error): boolean {
    if (err instanceof RequestError && err.response.status === 404) {
        return true
    }
    return false
}

async function fetch_(endpoint: string[], method: Method, token: string, options?: Opts): Promise<Response> {
    const options_ : RequestInit = options ?? {}
    options_.method = method
    options_.credentials = "omit"
    options_.redirect = "manual"

    // https://docs.github.com/en/rest/authentication/authenticating-to-the-rest-api?apiVersion=2022-11-28#about-authentication
    const headers = new Headers(options_.headers)
    headers.set("Authorization", `Bearer ${token}`)
    headers.set("X-GitHub-Api-Version", "2022-11-28")
    options_.headers = headers

    const url = `https://api.github.com/${endpoint.join("/")}`
        + (options?.queryParams?.toString() ?? "")

    const res = await fetch(url, options_)

    // FOLLOW REDIRECTS
    // https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api?apiVersion=2022-11-28#follow-redirects

    // Permanent redirection,
    // follow but report a warning
    if (res.status === 301) {
        throw new Error("TODO")
    }

    // Temporary redirection, simply follow.
    if (res.status === 302 || res.status === 307) {
        throw new Error("TODO")
    }

    // HANDLE RATE LIMITS
    // https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api?apiVersion=2022-11-28#handle-rate-limit-errors-appropriately

    if (res.headers.has("retry-after")) {
        throw new Error("TODO")
    }

    if (res.headers.get("x-ratelimit-remaining") === "0") {
        throw new Error("TODO")
    }

    // 4xx or 5xx
    if (400 <= res.status && res.status <= 599) {
        throw new RequestError(res)
    }

    return res
}

async function get(endpoint: string[], token: string, options?: Opts): Promise<Response> {
    return fetch_(endpoint, "GET", token, options)
}
async function post(endpoint: string[], token: string, options?: Opts): Promise<Response> {
    return fetch_(endpoint, "POST", token, options)
}
async function put(endpoint: string[], token: string, options?: Opts): Promise<Response> {
    return fetch_(endpoint, "PUT", token, options)
}
async function del(endpoint: string[], token: string, options?: Opts): Promise<Response> {
    return fetch_(endpoint, "DELETE", token, options)
}

export async function scopes(token: string): Promise<string[]> {
    return (await get([], token)).headers.get("x-oath-scopes")?.split("") ?? []
}

export async function validateToken(token: string): Promise<boolean> {
    try {
        await get(["user"], token)
        return true
    } catch (e) {
        if (e instanceof RequestError && e.response.status === 401) {
            return false
        }
        throw e
    }
}

export async function repo(token: string, path: string): Promise<{}> {
    const [userName, projectName] = assertRepoPath(path)

    await get(["repos", userName, projectName], token)
    return {}
}

export type File = {
    type: "file",
    content: string,
} | {
    type: "directory",
    children: {
        path: string,
        sha: string,
        size: number,
    }[],
}

export async function repoFile(
    token: string,
    repoPath: string,
    filePath: string
): Promise<File> {
    const [userName, projectName] = assertRepoPath(repoPath)

    const res = await get(
        ["repos", userName, projectName, "contents", ...filePath.split("/")],
        token,
        {
            headers: { "Accept": "application/vnd.github.raw+json" },
        }
    )

    // It's a file
    if (res.headers.get("Content-Type")?.includes("application/vnd.github.raw+json")) {
        return {
            type: "file",
            content: await res.text()
        }
    }

    // It's a directory
    if (res.headers.get("Content-Type")?.includes("application/json")) {
        return {
            type: "directory",
            children: (await res.json() as any[]).map(e => {
                return {
                    path: e["path"],
                    sha: e["sha"],
                    size: e["size"],
                }
            }),
        }
    }
    throw new Error("Unexpected response")
}

export type Tree = {
    sha: string,
    truncated: boolean,
    tree: TreeEntry[]
}

export type TreeEntry = {
    path: string,
    type: "blob"
    sha: string
    size: number
} | {
    path: string,
    type: "tree",
    sha: string,
}

// NB. sha doesn't need to be the actual content hash, knowing filename + branch
// is enough: https://stackoverflow.com/a/26204232
export async function tree(
    token: string,
    path: string,
    sha: string,
    recursive?: boolean
): Promise<Tree> {
    const [ owner, repo ] = assertRepoPath(path)
    const res = await get(
        ["repos", owner, repo, "git", "trees", sha],
        token,
        {
            queryParams: recursive ? (new URLSearchParams({ "recursive": "1" }))
                : undefined
        }
    )

    const json = await res.json()

    const treeSha = json["sha"]
    if (typeof treeSha !== "string") {
        throw new Error(`Unexpected "${treeSha}"`)
    }

    const truncated = json["truncated"]
    if (typeof truncated !== "boolean") {
        throw new Error(`Unexpected "${truncated}"`)
    }

    return {
        sha: treeSha,
        truncated: truncated,
        tree: json["tree"].map((e: any) => {

            const path = e["path"]
            if (typeof path !== "string") {
                throw new Error(`Unexpected "${path}"`)
            }

            const type = e["type"]
            if (!["tree", "blob"].includes(type)) {
                throw new Error(`Unexpected "${type}"`)
            }

            const subSha = e["sha"]
            if (typeof subSha !== "string") {
                throw new Error(`Unexpected "${subSha}"`)
            }

            const size = e["size"]
            if (type === "blob" && typeof size !== "number") {
                throw new Error(`Unexpected "${size}"`)
            }

            return {
                path: path,
                type: type,
                sha: subSha,
                size: size,
            }
        })
    }
}
