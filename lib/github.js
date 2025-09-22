import { Agent } from "https";
let agent_ = null;
function agent() {
    if (agent_ === null) {
        agent_ = new Agent();
    }
    return agent_;
}
function assertRepoPath(path) {
    if (path.split("/").length !== 2) {
        throw new Error("Unexpected");
    }
    const userName = path.split("/")[0];
    const projectName = path.split("/")[1];
    return [userName, projectName];
}
export class RequestError extends Error {
    response;
    constructor(response) {
        super(`Error, request returned ${response.status}: ${response.statusText}`);
        this.response = response;
    }
}
export function is404(err) {
    if (err instanceof RequestError && err.response.status === 404) {
        return true;
    }
    return false;
}
async function fetch_(endpoint, method, token, options) {
    const options_ = options ?? {};
    options_.method = method;
    options_.credentials = "omit";
    options_.redirect = "manual";
    const headers = new Headers(options_.headers);
    headers.set("Authorization", `Bearer ${token}`);
    headers.set("X-GitHub-Api-Version", "2022-11-28");
    options_.headers = headers;
    const queryParams = (() => {
        if (options?.queryParams !== undefined) {
            return "?" + options.queryParams.toString();
        }
        return "";
    })();
    const url = `https://api.github.com/${endpoint.join("/")}` + queryParams;
    const res = await fetch(url, options_);
    if (res.status === 301) {
        throw new Error("TODO");
    }
    if (res.status === 302 || res.status === 307) {
        throw new Error("TODO");
    }
    if (res.headers.has("retry-after")) {
        throw new Error("TODO");
    }
    if (res.headers.get("x-ratelimit-remaining") === "0") {
        throw new Error("TODO");
    }
    if (400 <= res.status && res.status <= 599) {
        throw new RequestError(res);
    }
    return res;
}
async function get(endpoint, token, options) {
    return fetch_(endpoint, "GET", token, options);
}
async function post(endpoint, token, options) {
    return fetch_(endpoint, "POST", token, options);
}
async function put(endpoint, token, options) {
    return fetch_(endpoint, "PUT", token, options);
}
async function del(endpoint, token, options) {
    return fetch_(endpoint, "DELETE", token, options);
}
export async function scopes(token) {
    return (await get([], token)).headers.get("x-oath-scopes")?.split("") ?? [];
}
export async function validateToken(token) {
    try {
        await get(["user"], token);
        return true;
    }
    catch (e) {
        if (e instanceof RequestError && e.response.status === 401) {
            return false;
        }
        throw e;
    }
}
export async function repo(token, path) {
    const [userName, projectName] = assertRepoPath(path);
    await get(["repos", userName, projectName], token);
    return {};
}
export async function repoBlob(token, repoPath, sha) {
    const [userName, projectName] = assertRepoPath(repoPath);
    const ret = await get(["repos", userName, projectName, "git", "blobs", sha], token, {
        headers: { "Accept": "application/vnd.github.raw+json" },
    });
    const size = ret.headers.get("Content-Length") ?? -1;
    if (size === null) {
        throw new Error("Unexpected");
    }
    const n = Number(size);
    if (Number.isNaN(n)) {
        throw new Error("Unexpected");
    }
    return {
        size: n,
        content: (await ret.text()),
    };
}
export async function repoFile(token, repoPath, filePath) {
    const [userName, projectName] = assertRepoPath(repoPath);
    const res = await get(["repos", userName, projectName, "contents", ...filePath.split("/")], token, {
        headers: { "Accept": "application/vnd.github.raw+json" },
    });
    if (res.headers.get("Content-Type")?.includes("application/vnd.github.raw+json")) {
        return {
            type: "file",
            content: await res.text()
        };
    }
    if (res.headers.get("Content-Type")?.includes("application/json")) {
        return {
            type: "directory",
            children: (await res.json()).map(e => {
                return {
                    path: e["path"],
                    sha: e["sha"],
                    size: e["size"],
                };
            }),
        };
    }
    throw new Error("Unexpected response");
}
export async function tree(token, path, sha, recursive) {
    const [owner, repo] = assertRepoPath(path);
    const res = await get(["repos", owner, repo, "git", "trees", sha], token, {
        queryParams: recursive ? (new URLSearchParams({ "recursive": "1" }))
            : undefined
    });
    const json = await res.json();
    const treeSha = json["sha"];
    if (typeof treeSha !== "string") {
        throw new Error(`Unexpected "${treeSha}"`);
    }
    const truncated = json["truncated"];
    if (typeof truncated !== "boolean") {
        throw new Error(`Unexpected "${truncated}"`);
    }
    return {
        sha: treeSha,
        truncated: truncated,
        tree: json["tree"].map((e) => {
            const path = e["path"];
            if (typeof path !== "string") {
                throw new Error(`Unexpected "${path}"`);
            }
            const type = e["type"];
            if (!["tree", "blob"].includes(type)) {
                throw new Error(`Unexpected "${type}"`);
            }
            const subSha = e["sha"];
            if (typeof subSha !== "string") {
                throw new Error(`Unexpected "${subSha}"`);
            }
            const size = e["size"];
            if (type === "blob" && typeof size !== "number") {
                throw new Error(`Unexpected "${size}"`);
            }
            return {
                path: path,
                type: type,
                sha: subSha,
                size: size,
            };
        })
    };
}
