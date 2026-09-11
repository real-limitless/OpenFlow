import { connection } from "../queue";
import {
  MemoryIdempotencyStore,
  defaultIdempotencyWindowSec,
  idempotencyRedisKey,
} from "../../lib/security/webhook-idempotency";

const memory = new MemoryIdempotencyStore(defaultIdempotencyWindowSec() * 1000);

export async function claimWebhookIdempotency(
  path: string,
  key: string,
): Promise<{ replayOf: string } | { claimed: true }> {
  const redisKey = idempotencyRedisKey(path, key);
  const cached = memory.get(redisKey);
  if (cached) return { replayOf: cached };
  const ttl = defaultIdempotencyWindowSec();
  try {
    const ok = await connection.set(redisKey, "pending", "EX", ttl, "NX");
    if (ok !== "OK") {
      for (let i = 0; i < 10; i++) {
        const existing = await connection.get(redisKey);
        if (existing && existing !== "pending") {
          memory.set(redisKey, existing);
          return { replayOf: existing };
        }
        await new Promise((r) => setTimeout(r, 50));
      }
      const last = await connection.get(redisKey);
      if (last && last !== "pending") return { replayOf: last };
    }
  } catch {
    /* memory-only */
  }
  return { claimed: true };
}

export async function storeWebhookIdempotency(
  path: string,
  key: string,
  executionId: string,
): Promise<void> {
  const redisKey = idempotencyRedisKey(path, key);
  const ttl = defaultIdempotencyWindowSec();
  memory.set(redisKey, executionId);
  try {
    await connection.set(redisKey, executionId, "EX", ttl);
  } catch {
    /* memory already set */
  }
}
