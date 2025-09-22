import * as redis from "redis";
import { Schema, Repository } from "redis-om";
import { RedisStore } from "connect-redis";
import session from "express-session";
import { TranslationMap } from "./utils.js";
const gitObjectSchema = new Schema("gitObject", {
    sha: { type: "string" },
    type: { type: "string" },
    size: { type: "number" },
    content: { type: "string" },
    children: { type: "string" },
}, {
    dataStructure: "HASH"
});
const projectSettingsSchema = new Schema("projectSettings", {
    json: { type: "string" }
}, {
    dataStructure: "HASH"
});
const distInfoSchema = new Schema("distInfo", {
    content: { type: "string" },
}, {
    dataStructure: "HASH",
});
export class Cache {
    client;
    sessionStorageMiddleware_;
    gitObjectRepository;
    distInfoRepository;
    projectSettingsRepository;
    constructor(client) {
        this.client = client;
        this.sessionStorageMiddleware_ = null;
        this.gitObjectRepository = new Repository(gitObjectSchema, this.client);
        this.distInfoRepository = new Repository(distInfoSchema, this.client);
        this.projectSettingsRepository = new Repository(projectSettingsSchema, this.client);
    }
    static async new(redisUrl) {
        const client = redis.createClient({ url: redisUrl });
        await client.connect();
        return new Cache(client);
    }
    sessionStorageMiddleware(options) {
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
            });
        }
        return this.sessionStorageMiddleware_;
    }
    async getGitObject(sha) {
        const ret = await this.gitObjectRepository.fetch(sha);
        if (ret["type"] === undefined) {
            return null;
        }
        if (ret["type"] === "tree") {
            ret["children"] = JSON.parse(ret["children"]);
        }
        return ret;
    }
    async saveGitObject(sha, obj) {
        const obj_ = { ...obj };
        if (obj.type === "tree") {
            obj_.children = JSON.stringify(obj.children);
        }
        await this.gitObjectRepository.save(sha, obj_);
        await this.gitObjectRepository.expire(sha, 4 * 3600);
    }
    async getDistInfo(repoPath, branch) {
        const ret = await this.distInfoRepository.fetch(`${repoPath}:${branch}`);
        if (ret["content"] === undefined) {
            return null;
        }
        const json = JSON.parse(ret["content"]);
        json["children"] = new Map(json["children"]);
        return json;
    }
    async saveDistInfo(repoPath, branch, info) {
        const info_ = {
            sha: info.sha,
            children: [...info.children.entries()].map(([k, v]) => {
                return [k, {
                        sha: v.sha,
                        type: v.type,
                    }];
            })
        };
        await this.distInfoRepository.save(`${repoPath}:${branch}`, { content: JSON.stringify(info_) });
        await this.distInfoRepository.expire(`${repoPath}:${branch}`, 600);
    }
    async getProjectSettings(repoPath, branch) {
        const ret = await this.projectSettingsRepository.fetch(`${repoPath}:${branch}`);
        if (ret["json"] === undefined) {
            console.log("getProjectSettings cache miss");
            return null;
        }
        const json = JSON.parse(ret["json"]);
        return {
            ...json,
            existingTranslations: TranslationMap.fromObject(json["existingTranslations"]),
        };
    }
    async saveProjectSettings(repoPath, branch, settings) {
        this.projectSettingsRepository.save(`${repoPath}:${branch}`, {
            json: JSON.stringify({
                distDir: settings.distDir,
                sourceLanguage: settings.sourceLanguage,
                targetLanguages: settings.targetLanguages,
                contentSelector: settings.contentSelector,
                existingTranslations: settings.existingTranslations.toObject()
            })
        });
    }
}
