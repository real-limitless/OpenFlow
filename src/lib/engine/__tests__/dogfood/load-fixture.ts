import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { IWorkflow } from "@/lib/workflow/types";

const HERE = dirname(fileURLToPath(import.meta.url));
const DOGFOOD_DIR = join(HERE, "../../../../../workflows/dogfood");

export function dogfoodPath(name: string): string {
  const file = name.endsWith(".json") ? name : `${name}.json`;
  return join(DOGFOOD_DIR, file);
}

/** Load a golden workflow fixture from workflows/dogfood/. */
export function loadDogfoodFixture(name: string): IWorkflow {
  const raw = readFileSync(dogfoodPath(name), "utf8");
  const parsed = JSON.parse(raw) as IWorkflow;
  if (!parsed.nodes || !Array.isArray(parsed.nodes)) {
    throw new Error(`Invalid dogfood fixture ${name}: missing nodes[]`);
  }
  if (!parsed.connections || typeof parsed.connections !== "object") {
    throw new Error(`Invalid dogfood fixture ${name}: missing connections`);
  }
  return {
    id: parsed.id ?? `dogfood-${name}`,
    name: parsed.name ?? name,
    active: parsed.active ?? false,
    nodes: parsed.nodes,
    connections: parsed.connections,
    settings: parsed.settings ?? { executionOrder: "v1" },
    pinData: parsed.pinData ?? {},
    staticData: parsed.staticData ?? null,
    meta: parsed.meta ?? {},
    versionId: parsed.versionId,
  };
}
