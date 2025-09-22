export type Opts = Omit<RequestInit, "method" | "redirect" | "credentials"> & {
    queryParams?: URLSearchParams;
};
export type Method = "GET" | "POST" | "PUT" | "DELETE";
export declare class RequestError extends Error {
    readonly response: Response;
    constructor(response: Response);
}
export declare function is404(err: Error): boolean;
export declare function scopes(token: string): Promise<string[]>;
export declare function validateToken(token: string): Promise<boolean>;
export declare function repo(token: string, path: string): Promise<{}>;
export type File = {
    type: "file";
    content: string;
} | {
    type: "directory";
    children: {
        path: string;
        sha: string;
        size: number;
    }[];
};
export declare function repoBlob(token: string, repoPath: string, sha: string): Promise<{
    size: number;
    content: string;
}>;
export declare function repoFile(token: string, repoPath: string, filePath: string): Promise<File>;
export type Tree = {
    sha: string;
    truncated: boolean;
    tree: TreeEntry[];
};
export type TreeEntry = {
    path: string;
    type: "blob";
    sha: string;
    size: number;
} | {
    path: string;
    type: "tree";
    sha: string;
};
export declare function tree(token: string, path: string, sha: string, recursive?: boolean): Promise<Tree>;
