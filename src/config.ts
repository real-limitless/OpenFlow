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
      return process.env.CREDENTIALS_KEY;
    },
  },
  binary: {
    storageDir: process.env.BINARY_STORAGE_DIR ?? "./data/binary",
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
  if (!config.credentials.key) {
    throw new Error(
      "CREDENTIALS_KEY environment variable is not set. " +
        "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    );
  }
}
