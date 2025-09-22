export type Project = {
    token: string;
    type: 1;
};
export declare function projects(): Project;
export declare function authenticateUser(email: string, password: string): Promise<number | null>;
export declare function createUser(email: string, password: string): Promise<void>;
export type ProjectSummary = {
    id: string;
    name: string;
};
export declare function userProjects(userId: number): ProjectSummary[];
export declare function createProject(name: string, pat: string, path: string): number;
export type ProjectInfo = {
    id: number;
    token: string;
    path: string;
};
export declare function projectInfo(userId: number, projectName: string): ProjectInfo | null;
export declare function addUserToProject(userId: number, projectId: number): void;
