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
        SELECT id, key FROM users WHERE email = ?`)
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
        INSERT INTO users (key, email) VALUES (?, ?)`)

    q.run(key, email)
}

export type ProjectSummary = {
    id: string
    name: string
}

export function userProjects(userId: number): ProjectSummary[] {
    const q = db().prepare(`
        SELECT p.id, p.name FROM projects p WHERE p.id IN
            (SELECT u.project_id FROM user_projects u WHERE user_id = ?)`)
    const results = q.all(userId)

    return results.map(e => {
        return {
            id: e["id"] as string,
            name: e["name"] as string,
        }
    })
}

export function createProject(name: string, pat: string, path: string): number {
    const q = db().prepare(`
        INSERT INTO projects (name, token, type, path) VALUES (?, ?, ?, ?)`)
    const result = q.run(name, pat, 1, path)
    const newId = result.lastInsertRowid
    if (typeof newId !== "number") {
        throw new Error("Unexpected")
    }
    return newId
    //const q = db().prepare(`
    //    INSERT INTO projects (name, token, type) VALUES (?, ?, ?)
    //    OUTPUT INSERTED.id`)
    //const results = q.all(name, pat, 1)
    //if (results.length !== 1) {
    //    throw new Error("Unexpected")
    //}
    //if (typeof results[0] !== "number") {
    //    throw new Error("Unexpected")
    //}
    //return results[0]
}

export type ProjectInfo = {
    id: number,
    token: string,
    path: string,
}

export function projectInfo(userId: number, projectName: string): ProjectInfo | null {
    const q = db().prepare(`
        SELECT id, token, path FROM projects p WHERE
           p.name = ?
           AND p.id IN (SELECT project_id FROM user_projects WHERE user_id = ?)
    `)
    const results = q.all(projectName, userId)

    if (results.length === 0) {
        return null
    }

    if (results.length !== 1) {
        throw new Error("Unexpected")
    }

    const result = results[0]

    return {
        id: result["id"] as number,
        token: result["token"] as string,
        path: result["path"] as string,
    }
}

export function addUserToProject(userId: number, projectId: number) {
    const q = db().prepare(`
        INSERT INTO user_projects (user_id, project_id) VALUES (?, ?)
`)
    q.run(userId, projectId)
}
