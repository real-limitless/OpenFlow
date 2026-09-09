import type { NodeExecutor } from "@/sdk";
export type GitOperation = "add" | "addConfig" | "clone" | "commit" | "log" | "push" | "reflog" | "switchBranch" | "tag";
export type TagAction = "add" | "list" | "delete";
export interface GitLogEntry {
    hash: string;
    date: string;
    author: string;
    message: string;
}
export interface GitReflogEntry {
    hash: string;
    selector: string;
    message: string;
}
export interface GitClient {
    clone(repository: string, path: string, options: {
        branch?: string;
        credentials?: Record<string, unknown>;
    }): Promise<void>;
    add(repoPath: string, pathsToAdd: string): Promise<void>;
    commit(repoPath: string, message: string, options: {
        allowEmpty?: boolean;
    }): Promise<string>;
    push(repoPath: string, options: {
        remote?: string;
        branch?: string;
        force?: boolean;
        credentials?: Record<string, unknown>;
    }): Promise<void>;
    log(repoPath: string, maxCommits: number): Promise<GitLogEntry[]>;
    reflog(repoPath: string, maxCommits: number): Promise<GitReflogEntry[]>;
    switchBranch(repoPath: string, branch: string, options: {
        create?: boolean;
        force?: boolean;
    }): Promise<void>;
    tag(repoPath: string, action: TagAction, options: {
        name?: string;
        message?: string;
    }): Promise<string[]>;
    addConfig(repoPath: string, key: string, value: string): Promise<void>;
    close(): Promise<void>;
}
export type GitClientFactory = (credentials: Record<string, unknown> | null, options: Record<string, unknown>) => Promise<GitClient>;
export declare function setGitClientFactory(factory: GitClientFactory | null): void;
export declare function createGitClient(credentials: Record<string, unknown> | null, options: Record<string, unknown>): Promise<GitClient>;
export declare const gitExecutor: NodeExecutor;
