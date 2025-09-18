import {DatabaseSync} from "node:sqlite"

import bcrypt from "bcrypt"

export type Project = {
    token: string,
    type: 1, // 1 = GitHub personal access token (PAT)
}

let db_: DatabaseSync | null = null
function db(): DatabaseSync {
    if (db_ === null) {
        db_ = new DatabaseSync("./dev.db")
    }
    return db_
}

export function projects(): Project {
    const q = db().prepare(`
      SELECT * from "projects"
    `)
    return q.all() as unknown as Project
}

export async function authenticateUser(email: string, password: string): Promise<number | null> {
    const q = db().prepare(`
      SELECT id, key FROM users WHERE email = ?
    `)
    const keys = q.all(email)

    if (keys.length === 0) {
        return null
    }

    if (keys.length !== 1) {
        throw new Error("Unexpected")
    }

    const key = keys[0]["key"]
    if (typeof key !== "string") {
        throw new Error("Unexpected")
    }

    const id = keys[0]["id"]
    if (typeof id !== "number") {
        throw new Error("Unexpected")
    }

    const success = await bcrypt.compare(password, key)

    if (success) {
        return id
    } else {
        return null
    }
}

export async function createUser(email: string, password: string) {
    // TODO: We should do something like this
    // https://stackoverflow.com/a/3408196
    // to handle existing usr.

    const key = await bcrypt.hash(password, 10)
    const q = db().prepare(`
      INSERT INTO users (key, email) VALUES (?, ?)
    `)

    q.run(key, email)
}
