export type AbortReason = "cancelled" | "timeout";

export class ExecutionAbortedError extends Error {
  readonly reason: AbortReason;

  constructor(reason: AbortReason, message?: string) {
    super(message ?? (reason === "cancelled" ? "Execution cancelled" : "Execution timed out"));
    this.name = "ExecutionAbortedError";
    this.reason = reason;
  }
}

export function isExecutionAbortedError(err: unknown): err is ExecutionAbortedError {
  return Boolean(err && typeof err === "object" && (err as Error).name === "ExecutionAbortedError");
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/**
 * Workflow timeout in milliseconds.
 * `executionTimeout` is seconds; `executionTimeoutMs` is an explicit millisecond override.
 */
export function parseExecutionTimeoutMs(settings?: Record<string, unknown> | null): number | null {
  if (!settings) return null;
  const ms = asFiniteNumber(settings.executionTimeoutMs);
  if (ms != null && ms > 0) return Math.floor(ms);
  const seconds = asFiniteNumber(settings.executionTimeout);
  if (seconds != null && seconds > 0) return Math.floor(seconds * 1000);
  return null;
}

/** Max concurrent running+waiting executions. null = unlimited. */
export function parseMaxConcurrency(settings?: Record<string, unknown> | null): number | null {
  if (!settings) return null;
  const n = asFiniteNumber(settings.maxConcurrency);
  if (n == null || n < 1) return null;
  return Math.floor(n);
}

export async function raceWithAbort<T>(
  work: Promise<T>,
  shouldAbort?: () => AbortReason | null | Promise<AbortReason | null>,
): Promise<T> {
  if (!shouldAbort) return work;
  let stopped = false;
  const abort = new Promise<never>((_, reject) => {
    const tick = async () => {
      while (!stopped) {
        const reason = await shouldAbort();
        if (reason) {
          reject(new ExecutionAbortedError(reason));
          return;
        }
        await new Promise((r) => setTimeout(r, 100));
      }
    };
    void tick();
  });
  try {
    return await Promise.race([work, abort]);
  } finally {
    stopped = true;
  }
}
