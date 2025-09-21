import * as redis from "redis"
import { Schema, Repository } from "redis-om"
import { RedisStore } from "connect-redis"

import express from "express"
import session from "express-session"

export type GitObject = {
    type: "blob",
    size: number,
    content: string, // Note: this will fail if we try to store a file that's
                     //       > 512 MB
} | {
    type: "tree",
    children: string[] // list of hashes
}

const gitObjectSchema = new Schema("gitObject", {
    sha: { type: "string" },
    type: { type: "string" }, // "tree" | "blob"
    size: { type: "number" },
    content: { type: "string" },
    children: { type: "string" },
}, {
    dataStructure: "HASH"
})

export type DistInfo = {
    sha: string, // sha for the tree object representing the directory
    children: Map<string, { sha: string, type: "blob" | "tree" }>,
}

const distInfoSchema = new Schema("distInfo", {
    content: { type: "string" },
}, {
    dataStructure: "HASH",
})

export class Cache {
    // The RedisClientType is very slow to typecheck, it's pretty much unusable.
    // https://github.com/redis/node-redis/issues/2975
    //private client: redis.RedisClientType
    private client: any
    private sessionStorageMiddleware_ : express.RequestHandler | null

    private gitObjectRepository: Repository
    private distInfoRepository: Repository

    private constructor(client: any) {
        this.client = client
        this.sessionStorageMiddleware_ = null
        this.gitObjectRepository = new Repository(gitObjectSchema, this.client)
        this.distInfoRepository = new Repository(distInfoSchema, this.client)
    }

    static async new(redisUrl: string): Promise<Cache> {
        const client = redis.createClient({ url: redisUrl }) as any
        await client.connect()
        return new Cache(client)
    }

    sessionStorageMiddleware(options: session.SessionOptions): express.RequestHandler {
        if (this.sessionStorageMiddleware_ === null) {
            this.sessionStorageMiddleware_ = session({
                ...options,
                store: new RedisStore({
                    client: this.client,
                    disableTTL: false,
                    disableTouch: false,
                }),
                resave: false,
                saveUninitialized: false,
            })
        }

        return this.sessionStorageMiddleware_
    }

    async getGitObject(sha: string): Promise<GitObject | null> {
        const ret = await this.gitObjectRepository.fetch(sha)

        // Since redis doesn't differentiate between something being missing,
        // and something beeing all null, this is how we check if an entity
        // doesn't exist..
        if (ret["type"] === undefined) {
            return null
        }

        if (ret["type"] === "tree") {
            ret["children"] = JSON.parse(ret["children"])
        }

        return ret as GitObject
    }

    async saveGitObject(sha: string, obj: GitObject) {
        const obj_: Record<string, any> = { ...obj }
        if (obj.type === "tree") {
            obj_.children = JSON.stringify(obj.children)
        }

        await this.gitObjectRepository.save(sha, obj_)
        await this.gitObjectRepository.expire(sha, 4 * 3600) // 4h
    }

    async getDistInfo(repoPath: string, branch: string): Promise<DistInfo | null> {
        const ret = await this.distInfoRepository.fetch(`${repoPath}:${branch}`)

        if (ret["content"] === undefined) {
            return null
        }

        const json = JSON.parse(ret["content"])
        json["children"] = new Map(json["children"])

        return json
    }

    async saveDistInfo(repoPath: string, branch: string, info: DistInfo) {
        // Because how typescript works an absolutely HUGE object with lots of
        // fields can still typecheck as DistInfo, so we manually extract only
        // the fields relevant to DistInfo to ensure that unecessary data is not
        // saved to Redis.

        const info_ = {
            sha: info.sha,
            children: [...info.children.entries()].map(([k, v]: any) => {
                return [k, {
                    sha: v.sha,
                    type: v.type,
                }]
            })
        }

        await this.distInfoRepository.save(
            `${repoPath}:${branch}`,
            { content: JSON.stringify(info_) },
        )
        await this.distInfoRepository.expire(`${repoPath}:${branch}`, 600) // 10min
    }
}
