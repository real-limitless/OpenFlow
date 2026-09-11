import { prisma } from "../db";
import {
  getCircuitBreakerRegistry,
  parseCircuitBreakerConfig,
  type CircuitBreakerConfig,
} from "../../lib/runtime/circuit-breaker";

export const CIRCUIT_BREAKER_KEY = "runtime.circuitBreaker";

let loaded = false;

export async function loadCircuitBreakerConfig(): Promise<CircuitBreakerConfig> {
  let stored: unknown;
  try {
    const row = await prisma.instanceSetting.findUnique({ where: { key: CIRCUIT_BREAKER_KEY } });
    stored = row?.value ? JSON.parse(row.value) : null;
  } catch {
    stored = null;
  }
  const cfg = parseCircuitBreakerConfig(stored);
  getCircuitBreakerRegistry().setConfig(cfg);
  loaded = true;
  return cfg;
}

export async function ensureCircuitBreakerConfig(): Promise<CircuitBreakerConfig> {
  if (loaded) return getCircuitBreakerRegistry().getConfig();
  return loadCircuitBreakerConfig();
}

export async function setCircuitBreakerConfig(
  patch: Partial<CircuitBreakerConfig>,
): Promise<CircuitBreakerConfig> {
  const current = await ensureCircuitBreakerConfig();
  const next = parseCircuitBreakerConfig({ ...current, ...patch }, {});
  await prisma.instanceSetting.upsert({
    where: { key: CIRCUIT_BREAKER_KEY },
    create: { key: CIRCUIT_BREAKER_KEY, value: JSON.stringify(next) },
    update: { value: JSON.stringify(next) },
  });
  getCircuitBreakerRegistry().setConfig(next);
  loaded = true;
  return next;
}
