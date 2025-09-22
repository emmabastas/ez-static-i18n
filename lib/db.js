import { DatabaseSync } from "node:sqlite";
import bcrypt from "bcrypt";
let db_ = null;
export function initialize(path) {
    if (db_ !== null) {
        throw new Error("multiple initialize");
    }
    db_ = new DatabaseSync(path);
}
function db() {
    if (db_ === null) {
        throw new Error("not initialized");
    }
    return db_;
}
export function projects() {
    const q = db().prepare(`
        SELECT * from "projects"
    `);
    return q.all();
}
export async function authenticateUser(email, password) {
    const q = db().prepare(`
        SELECT id, key FROM users WHERE email = ?`);
    const keys = q.all(email);
    if (keys.length === 0) {
        return null;
    }
    if (keys.length !== 1) {
        throw new Error("Unexpected");
    }
    const key = keys[0]["key"];
    if (typeof key !== "string") {
        throw new Error("Unexpected");
    }
    const id = keys[0]["id"];
    if (typeof id !== "number") {
        throw new Error("Unexpected");
    }
    const success = await bcrypt.compare(password, key);
    if (success) {
        return id;
    }
    else {
        return null;
    }
}
export async function createUser(email, password) {
    const key = await bcrypt.hash(password, 10);
    const q = db().prepare(`
        INSERT INTO users (key, email) VALUES (?, ?)`);
    q.run(key, email);
}
export function userProjects(userId) {
    const q = db().prepare(`
        SELECT p.id, p.name FROM projects p WHERE p.id IN
            (SELECT u.project_id FROM user_projects u WHERE user_id = ?)`);
    const results = q.all(userId);
    return results.map(e => {
        return {
            id: e["id"],
            name: e["name"],
        };
    });
}
export function createProject(name, pat, path) {
    const q = db().prepare(`
        INSERT INTO projects (name, token, type, path) VALUES (?, ?, ?, ?)`);
    const result = q.run(name, pat, 1, path);
    const newId = result.lastInsertRowid;
    if (typeof newId !== "number") {
        throw new Error("Unexpected");
    }
    return newId;
}
export function projectInfo(userId, projectName) {
    const q = db().prepare(`
        SELECT id, token, path FROM projects p WHERE
           p.name = ?
           AND p.id IN (SELECT project_id FROM user_projects WHERE user_id = ?)
    `);
    const results = q.all(projectName, userId);
    if (results.length === 0) {
        return null;
    }
    if (results.length !== 1) {
        throw new Error("Unexpected");
    }
    const result = results[0];
    return {
        id: result["id"],
        token: result["token"],
        path: result["path"],
    };
}
export function addUserToProject(userId, projectId) {
    const q = db().prepare(`
        INSERT INTO user_projects (user_id, project_id) VALUES (?, ?)
`);
    q.run(userId, projectId);
}
