export function validateGitHubRepoPath(s) {
    if (s.split("/").length !== 2) {
        return null;
    }
    return s;
}
export function makeGitHubPath(s) {
    if (s.startsWith("/")) {
        return s.slice(1);
    }
    if (s.startsWith("./")) {
        return s.slice(2);
    }
    return s;
}
