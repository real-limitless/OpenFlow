import type { NodeExecutor, INodeExecutionData } from "@/sdk";

interface KeyPair {
  currentKey?: string;
  newKey?: string;
}

function renameInObject(
  obj: Record<string, unknown>,
  from: string,
  to: string,
  maxDepth: number,
  depth: number,
): Record<string, unknown> {
  if (maxDepth >= 0 && depth > maxDepth) return obj;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    const nextKey = k === from ? to : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      out[nextKey] = renameInObject(
        v as Record<string, unknown>,
        from,
        to,
        maxDepth,
        depth + 1,
      );
    } else {
      out[nextKey] = v;
    }
  }
  return out;
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
    const nextKey = re.test(k) ? k.replace(re, replaceWith) : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      out[nextKey] = renameByRegex(
        v as Record<string, unknown>,
        re,
        replaceWith,
        maxDepth,
        depth + 1,
      );
    } else {
      out[nextKey] = v;
    }
  }
  return out;
}

export const renameKeysExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);
  const keysContainer = ctx.getParam<{ keys?: KeyPair[] } | KeyPair[]>("keys", {});
  const keys: KeyPair[] = Array.isArray(keysContainer)
    ? keysContainer
    : (keysContainer?.keys ?? []);

  // Also accept single currentKey/newKey
  const singleCurrent = ctx.getParam<string>("currentKey", "");
  const singleNew = ctx.getParam<string>("newKey", "");
  if (keys.length === 0 && singleCurrent && singleNew) {
    keys.push({ currentKey: singleCurrent, newKey: singleNew });
  }

  const options = ctx.getParam<Record<string, unknown>>("options", {}) ?? {};
  const useRegex = options.regex === true || ctx.getParam<boolean>("useRegex", false) === true;
  const regexStr = String(options.regularExpression ?? ctx.getParam("regularExpression", "") ?? "");
  const replaceWith = String(options.replaceWith ?? ctx.getParam("replaceWith", "") ?? "");
  const caseInsensitive = options.caseInsensitive === true;
  const maxDepth = Number(options.maxDepth ?? -1);

  const output: INodeExecutionData[] = inputItems.map((item) => {
    let json = { ...item.json };

    for (const pair of keys) {
      const from = pair.currentKey ?? "";
      const to = pair.newKey ?? "";
      if (!from || !to || from === to) continue;
      json = renameInObject(json, from, to, maxDepth, 0);
    }

    if (useRegex && regexStr) {
      try {
        const flags = caseInsensitive ? "gi" : "g";
        const re = new RegExp(regexStr, flags);
        json = renameByRegex(json, re, replaceWith, maxDepth, 0);
      } catch {
        // invalid regex — leave as-is
      }
    }

    return { json, pairedItem: item.pairedItem, binary: item.binary };
  });

  return [output];
};
