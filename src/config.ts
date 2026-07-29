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
};

export function validateConfig(): void {
  if (!config.credentials.key) {
    throw new Error(
      "CREDENTIALS_KEY environment variable is not set. " +
        "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    );
  }
}
