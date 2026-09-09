export declare const config: {
    database: {
        url: string;
    };
    redis: {
        url: string;
    };
    auth: {
        readonly disabled: boolean;
    };
    credentials: {
        readonly key: string | undefined;
    };
    /** Default secret backend: local | vault | aws-sm */
    secrets: {
        readonly backend: string;
    };
    binary: {
        storageDir: string;
        /** fs | s3 */
        readonly storage: string;
    };
    log: {
        readonly level: string;
        readonly format: "pretty" | "json";
        readonly streamType: string;
    };
    worker: {
        enabled: boolean;
        concurrency: number;
    };
    /** Dev hot-load of node executors (POST /api/v1/dev/reload-nodes). */
    hotNodes: {
        readonly enabled: boolean;
    };
    /** Public base URL for OAuth issuer / MCP metadata (no trailing slash). */
    readonly publicUrl: string;
    /** Remote MCP server for third-party chatbots (tools + OAuth). */
    mcp: {
        readonly enabled: boolean;
    };
    /**
     * Shared workspace for Execute Command / Git / toolbox container clones.
     * Docker Compose mounts this at /data/workspace on api + toolbox.
     */
    readonly workspaceDir: string;
    /** Semantic node catalog (RAG) for MCP / palette / agent discovery. */
    catalog: {
        readonly enabled: boolean;
        /**
         * OpenAI-compatible embeddings base URL (no trailing slash).
         * Prefer OPENFLOW_CATALOG_EMBED_BASE_URL for a dedicated remote TEI/Ollama/OpenRouter
         * embed server so catalog reindex does not share the chat LLM endpoint.
         */
        readonly embedBaseUrl: string;
        /** True when catalog embed URL was set explicitly (not chat LLM fallback). */
        readonly embedBaseUrlExplicit: boolean;
        readonly embedApiKey: string;
        /**
         * Allow remote embed servers that need no Bearer token (Ollama, many TEI deploys).
         * Default on when OPENFLOW_CATALOG_EMBED_BASE_URL is set explicitly.
         */
        readonly embedAllowNoAuth: boolean;
        readonly embedModel: string;
        /** Fixed pgvector dimension (must match embed model / hash fallback). */
        readonly dimensions: number;
        /** Texts per embeddings API request (higher = fewer round-trips on remote GPU). */
        readonly embedBatchSize: number;
        /** Parallel embed batches in flight during reindex. */
        readonly embedConcurrency: number;
        /** Penalty applied to shell-tier nodes in hybrid rank (0–1 scale before normalize). */
        readonly shellPenalty: number;
        readonly usePgvector: boolean;
    };
    /** Workflow editor assistant (chat + OpenFlow MCP). */
    assistant: {
        readonly enabled: boolean;
        /** builtin = OpenAI-compatible tool loop; opencode = OpenCode server */
        readonly backend: "builtin" | "opencode";
        maxSteps: number;
        llm: {
            readonly baseUrl: string;
            readonly apiKey: string;
            readonly model: string;
        };
        opencode: {
            readonly bin: string;
            readonly baseUrl: string;
            readonly hostname: string;
            readonly port: number;
            readonly password: string;
            readonly username: string;
        };
    };
};
export declare function validateConfig(): void;
