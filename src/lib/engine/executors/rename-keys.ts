import type { NodeExecutor, INodeExecutionData } from "@/sdk";

interface KeyPair {
  currentKey?: string;
  newKey?: string;
}

interface RegexReplacement {
  searchRegex?: string;
  replaceRegex?: string;
  options?: { caseInsensitive?: boolean; depth?: number };
}

function deepCopy<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value));
  }
}

function getPath(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur === null || typeof cur !== "object" || Array.isArray(cur)) return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

function setPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".");
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    const next = cur[p];
    if (typeof next !== "object" || next === null || Array.isArray(next)) {
      cur[p] = {};
    }
    cur = cur[p] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = value;
}

function unsetPath(obj: Record<string, unknown>, path: string): void {
  const parts = path.split(".");
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    const next = cur[p];
    if (typeof next !== "object" || next === null || Array.isArray(next)) return;
    cur = next as Record<string, unknown>;
  }
  delete cur[parts[parts.length - 1]];
}

function renameByRegex(
  obj: Record<string, unknown>,
  re: RegExp,
  replaceWith: string,
  maxDepth: number,
  depth: number,
): Record<string, unknown> {
  if (maxDepth >= 0 && depth > maxDepth) return obj;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    let processedValue: unknown = v;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      processedValue = renameByRegex(
        v as Record<string, unknown>,
        re,
        replaceWith,
        maxDepth,
        depth + 1,
      );
    } else if (Array.isArray(v)) {
      processedValue = v.map((el) =>
        el !== null && typeof el === "object" && !Array.isArray(el)
          ? renameByRegex(el as Record<string, unknown>, re, replaceWith, maxDepth, depth + 1)
          : el,
      );
    }
    const renamed = k.replace(re, replaceWith);
    out[renamed !== k ? renamed : k] = processedValue;
  }
  return out;
}

export const renameKeysExecutor: NodeExecutor = async (ctx) => {
  const items: INodeExecutionData[] = ctx.getInputItems(0);

  const keysContainer = ctx.getParam<{ key?: KeyPair[] } | KeyPair[]>("keys", {});
  const keys: KeyPair[] = Array.isArray(keysContainer) ? keysContainer : (keysContainer?.key ?? []);

  const additionalOptions = ctx.getParam<Record<string, unknown>>("additionalOptions", {}) ?? {};
  const regexContainer = additionalOptions.regexReplacement as
    { replacements?: RegexReplacement[] } | undefined;
  const replacements: RegexReplacement[] = regexContainer?.replacements ?? [];

  const output: INodeExecutionData[] = [];

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    try {
      let json: Record<string, unknown> = deepCopy(item.json);

      for (const pair of keys) {
        const from = pair.currentKey ?? "";
        const to = pair.newKey ?? "";
        if (!from || !to || from === to) continue;
        const value = getPath(json, from);
        if (value === undefined) continue;
        setPath(json, to, value);
        unsetPath(json, from);
      }

      for (const rep of replacements) {
        const search = rep.searchRegex ?? "";
        const replace = rep.replaceRegex ?? "";
        if (!search) continue;
        const opts = rep.options ?? {};
        const caseInsensitive = opts.caseInsensitive === true;
        const depth = typeof opts.depth === "number" ? opts.depth : -1;
        const flags = caseInsensitive ? "gi" : "g";
        const re = new RegExp(search, flags);
        json = renameByRegex(json, re, replace, depth, 0);
      }

      output.push({
        json,
        binary: item.binary,
        pairedItem: item.pairedItem ?? { item: idx, input: 0 },
      });
    } catch (err) {
      if (ctx.continueOnFail()) {
        output.push({
          json: { error: err instanceof Error ? err.message : String(err) },
          pairedItem: item.pairedItem ?? { item: idx, input: 0 },
        });
      } else {
        throw err;
      }
    }
  }

  return [output];
};
