import { randomBytes } from "node:crypto";

function isPlaceholderKey(key: string | undefined): boolean {
  if (!key) return true;
  return /^(replace-me|replace-with|changeme|change-me)/i.test(key);
}

let resolvedCredentialsKey: string | undefined;

function resolveCredentialsKey(): string | undefined {
  if (resolvedCredentialsKey !== undefined) return resolvedCredentialsKey;

  const fromEnv = process.env.CREDENTIALS_KEY;
  if (!isPlaceholderKey(fromEnv)) {
    resolvedCredentialsKey = fromEnv;
    return resolvedCredentialsKey;
  }

  const isProd = process.env.NODE_ENV === "production";
  if (isProd) {
    resolvedCredentialsKey = fromEnv; // may be empty — validateConfig handles it
    return resolvedCredentialsKey;
  }

  resolvedCredentialsKey = randomBytes(32).toString("hex");
  process.env.CREDENTIALS_KEY = resolvedCredentialsKey;
  console.warn(
    "[openflow] CREDENTIALS_KEY was missing; generated an ephemeral key for this process. " +
      "Set CREDENTIALS_KEY in .env so encrypted credentials survive restarts " +
      '(node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))").',
  );
  return resolvedCredentialsKey;
}

export const config = {
  database: {
    url: process.env.DATABASE_URL ?? "postgresql://openflow:openflow@localhost:15432/openflow",
  },
  redis: {
    url: process.env.REDIS_URL ?? "redis://localhost:6379",
  },
  auth: {
    get disabled() {
      return process.env.AUTH_DISABLED === "true" || process.env.AUTH_DISABLED === "1";
    },
  },
  credentials: {
    get key() {
      return resolveCredentialsKey();
    },
  },
  /** Default secret backend: local | vault | aws-sm */
  secrets: {
    get backend() {
      return (process.env.SECRETS_BACKEND ?? "local").trim() || "local";
    },
  },
  binary: {
    storageDir: process.env.BINARY_STORAGE_DIR ?? "./data/binary",
    /** fs | s3 */
    get storage() {
      return (process.env.BINARY_STORAGE ?? "fs").trim().toLowerCase() || "fs";
    },
  },
  log: {
    get level() {
      return (process.env.LOG_LEVEL ?? "info").trim().toLowerCase() || "info";
    },
    get format() {
      return process.env.LOG_FORMAT === "pretty" ? "pretty" : "json";
    },
    get streamType() {
      return (process.env.LOG_STREAM_TYPE ?? "none").trim().toLowerCase() || "none";
    },
  },
  worker: {
    enabled: process.env.RUN_WORKER !== "false" && process.env.RUN_WORKER !== "0",
    concurrency: Math.max(1, parseInt(process.env.WORKER_CONCURRENCY ?? "5", 10) || 5),
  },
  /** Dev hot-load of node executors (POST /api/v1/dev/reload-nodes). */
  hotNodes: {
    get enabled() {
      return (
        process.env.OPENFLOW_HOT_NODES === "true" ||
        process.env.OPENFLOW_HOT_NODES === "1" ||
        process.env.NODE_ENV === "development" ||
        process.env.AUTH_DISABLED === "true" ||
        process.env.AUTH_DISABLED === "1"
      );
    },
  },
  /** Public base URL for OAuth issuer / MCP metadata (no trailing slash). */
  get publicUrl() {
    const raw =
      process.env.OPENFLOW_PUBLIC_URL?.trim() ||
      process.env.PUBLIC_URL?.trim() ||
      "";
    return raw.replace(/\/$/, "");
  },
  /** Remote MCP server for third-party chatbots (tools + OAuth). */
  mcp: {
    get enabled() {
      return (
        process.env.OPENFLOW_MCP_ENABLED !== "false" &&
        process.env.OPENFLOW_MCP_ENABLED !== "0"
      );
    },
  },
  /** Semantic node catalog (RAG) for MCP / palette / agent discovery. */
  catalog: {
    get enabled() {
      return (
        process.env.OPENFLOW_CATALOG_RAG_ENABLED !== "false" &&
        process.env.OPENFLOW_CATALOG_RAG_ENABLED !== "0"
      );
    },
    /** OpenAI-compatible embeddings endpoint (defaults to assistant LLM base). */
    get embedBaseUrl() {
      return (
        process.env.OPENFLOW_CATALOG_EMBED_BASE_URL?.trim() ||
        process.env.OPENFLOW_ASSISTANT_BASE_URL?.trim() ||
        process.env.OPENAI_BASE_URL?.trim() ||
        "https://api.openai.com/v1"
      );
    },
    get embedApiKey() {
      return (
        process.env.OPENFLOW_CATALOG_EMBED_API_KEY?.trim() ||
        process.env.OPENFLOW_ASSISTANT_API_KEY?.trim() ||
        process.env.OPENAI_API_KEY?.trim() ||
        ""
      );
    },
    get embedModel() {
      return (
        process.env.OPENFLOW_CATALOG_EMBED_MODEL?.trim() ||
        "text-embedding-3-small"
      );
    },
    /** Fixed pgvector dimension (must match embed model / hash fallback). */
    get dimensions() {
      return Math.max(
        32,
        parseInt(process.env.OPENFLOW_CATALOG_EMBED_DIMS ?? "1536", 10) || 1536,
      );
    },
    /** Penalty applied to shell-tier nodes in hybrid rank (0–1 scale before normalize). */
    get shellPenalty() {
      const n = parseFloat(process.env.OPENFLOW_CATALOG_SHELL_PENALTY ?? "0.35");
      return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.35;
    },
    get usePgvector() {
      return (
        process.env.OPENFLOW_CATALOG_USE_PGVECTOR !== "false" &&
        process.env.OPENFLOW_CATALOG_USE_PGVECTOR !== "0"
      );
    },
  },
  /** Workflow editor assistant (chat + OpenFlow MCP). */
  assistant: {
    get enabled() {
      return (
        process.env.OPENFLOW_ASSISTANT_ENABLED !== "false" &&
        process.env.OPENFLOW_ASSISTANT_ENABLED !== "0"
      );
    },
    /** builtin = OpenAI-compatible tool loop; opencode = OpenCode server */
    get backend(): "builtin" | "opencode" {
      return process.env.OPENFLOW_ASSISTANT_BACKEND === "opencode" ? "opencode" : "builtin";
    },
    maxSteps: Math.max(1, parseInt(process.env.OPENFLOW_ASSISTANT_MAX_STEPS ?? "24", 10) || 24),
    llm: {
      get baseUrl() {
        return (
          process.env.OPENFLOW_ASSISTANT_BASE_URL ??
          process.env.OPENAI_BASE_URL ??
          "https://api.openai.com/v1"
        );
      },
      get apiKey() {
        return (
          process.env.OPENFLOW_ASSISTANT_API_KEY ??
          process.env.OPENAI_API_KEY ??
          process.env.OPENCODE_API_KEY ??
          ""
        );
      },
      get model() {
        return process.env.OPENFLOW_ASSISTANT_MODEL ?? process.env.OPENAI_MODEL ?? "gpt-4o-mini";
      },
    },
    opencode: {
      get bin() {
        return process.env.OPENCODE_BIN ?? "opencode";
      },
      get baseUrl() {
        return process.env.OPENCODE_BASE_URL ?? "";
      },
      get hostname() {
        return process.env.OPENCODE_HOSTNAME ?? "127.0.0.1";
      },
      get port() {
        return Math.max(1, parseInt(process.env.OPENCODE_PORT ?? "4096", 10) || 4096);
      },
      get password() {
        return process.env.OPENCODE_SERVER_PASSWORD ?? "";
      },
      get username() {
        return process.env.OPENCODE_SERVER_USERNAME ?? "opencode";
      },
    },
  },
};

export function validateConfig(): void {
  const key = config.credentials.key;
  if (!key || isPlaceholderKey(key)) {
    throw new Error(
      "CREDENTIALS_KEY environment variable is not set. " +
        "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    );
  }

  const dbHost = (() => {
    try {
      return new URL(config.database.url).host;
    } catch {
      return "(invalid DATABASE_URL)";
    }
  })();

  console.info(
    `[openflow] boot · db=${dbHost} · auth=${config.auth.disabled ? "disabled" : "enabled"} · worker=${config.worker.enabled ? "on" : "off"}`,
  );
}
