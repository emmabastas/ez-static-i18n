import * as redis from "redis"
import { Schema, Repository } from "redis-om"
import { RedisStore } from "connect-redis"

import express from "express"
import session from "express-session"

type GitObject = {
    type: "blob",
    size: number,
    content: string, // Note: this will fail if we try to store a file that's
                     //       > 512 MB
} | {
    type: "tree",
}

const gitObjectSchema = new Schema("gitObject", {
    sha: { type: "string" },
    type: { type: "string" }, // "tree" | "blob"
    size: { type: "number" },
    content: { type: "string" },
}, {
    dataStructure: "HASH"
})

export class Cache {
    // The RedisClientType is very slow to typecheck, it's pretty much unusable.
    // https://github.com/redis/node-redis/issues/2975
    //private client: redis.RedisClientType
    private client: any
    private sessionStorageMiddleware_ : express.RequestHandler | null

    private gitObjectRepository: Repository

    private constructor(client: any) {
        this.client = client
        this.sessionStorageMiddleware_ = null
        this.gitObjectRepository = new Repository(gitObjectSchema, this.client)
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
        return ret as GitObject
    }

    async saveGitObject(sha: string, obj: GitObject) {
        await this.gitObjectRepository.save(sha, obj)
        await this.gitObjectRepository.expire(sha, 4 * 3600)
    }
}
