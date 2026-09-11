export type OpenFlowRole = "all" | "main" | "worker";

export function parseOpenFlowRole(raw: string | undefined): OpenFlowRole {
  const r = (raw ?? "all").trim().toLowerCase();
  if (r === "main" || r === "worker") return r;
  return "all";
}

export function workerEnabledForRole(
  role: OpenFlowRole,
  runWorker: string | undefined,
): boolean {
  if (role === "main") return false;
  return runWorker !== "false" && runWorker !== "0";
}

export function schedulerEnabledForRole(role: OpenFlowRole): boolean {
  return role !== "worker";
}

export function requireRedisQueue(role: OpenFlowRole): boolean {
  return role === "main" || role === "worker";
}
