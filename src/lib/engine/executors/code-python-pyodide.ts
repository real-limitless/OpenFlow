import { createRequire } from "node:module";
import { dirname } from "node:path";
import type { INodeExecutionData } from "@/sdk";

type PyodideInterface = {
  globals: {
    set: (key: string, value: unknown) => void;
    get: (key: string) => unknown;
  };
  toPy: (value: unknown) => unknown;
  runPythonAsync: (code: string) => Promise<unknown>;
};

type LoadPyodideFn = (options?: { indexURL?: string }) => Promise<PyodideInterface>;

let loadPromise: Promise<PyodideInterface> | null = null;

function resolveIndexURL(): string {
  const require = createRequire(import.meta.url);
  const pkgJson = require.resolve("pyodide/package.json");
  return dirname(pkgJson) + "/";
}

async function getPyodide(): Promise<PyodideInterface> {
  if (!loadPromise) {
    loadPromise = (async () => {
      try {
        const mod = (await import(/* @vite-ignore */ "pyodide")) as unknown as {
          loadPyodide?: LoadPyodideFn;
          default?: { loadPyodide?: LoadPyodideFn };
        };
        const loadPyodide = mod.loadPyodide ?? mod.default?.loadPyodide;
        if (typeof loadPyodide !== "function") {
          throw new Error("pyodide loaded but loadPyodide export is missing");
        }
        return await loadPyodide({ indexURL: resolveIndexURL() });
      } catch (err) {
        loadPromise = null;
        const detail = err instanceof Error ? err.message : String(err);
        throw new Error(`Code node requires pyodide (server-side only): ${detail}`);
      }
    })();
  }
  return loadPromise;
}

function wrapUserCode(code: string): string {
  const lines = (code || "").split("\n");
  const body = lines.map((ln) => (ln.trim() ? `    ${ln}` : ln)).join("\n");
  return `def __of_user():\n${body || "    pass"}\n__of_result = __of_user()\n`;
}

function toJsValue(value: unknown): unknown {
  if (value == null) return value;
  if (typeof value !== "object") return value;
  const maybe = value as {
    toJs?: (opts?: {
      dict_converter?: (entries: Iterable<[string, unknown]>) => unknown;
    }) => unknown;
  };
  if (typeof maybe.toJs === "function") {
    return maybe.toJs({ dict_converter: Object.fromEntries });
  }
  return value;
}

export async function runPythonPyodide(
  code: string,
  mode: string,
  items: INodeExecutionData[],
  activeItem?: INodeExecutionData,
): Promise<unknown> {
  const pyodide = await getPyodide();

  const wireItems = items.map((it) => ({
    json: it.json ?? {},
    ...(it.pairedItem !== undefined ? { pairedItem: it.pairedItem } : {}),
  }));

  const active =
    mode === "runOnceForEachItem"
      ? {
          json: activeItem?.json ?? {},
          ...(activeItem?.pairedItem !== undefined ? { pairedItem: activeItem.pairedItem } : {}),
        }
      : (wireItems[0] ?? { json: {} });

  // Minimal legacy helper surface + native _items/_item.
  pyodide.globals.set("_items", pyodide.toPy(wireItems));
  pyodide.globals.set("_item", pyodide.toPy(active));
  pyodide.globals.set("_json", pyodide.toPy(active.json ?? {}));

  // Build _input in Python for method-style access.
  await pyodide.runPythonAsync(`
class _OfInput:
    def __init__(self, items, item):
        self._items = items
        self._item = item
    def all(self):
        return self._items
    def first(self):
        return self._items[0] if self._items else {"json": {}}
    def last(self):
        return self._items[-1] if self._items else {"json": {}}
    @property
    def item(self):
        return self._item

_input = _OfInput(_items, _item)
`);

  const wrapped = wrapUserCode(code);
  try {
    await pyodide.runPythonAsync(wrapped);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(msg);
  }

  const raw = pyodide.globals.get("__of_result");
  return toJsValue(raw);
}

/** Test helper: drop cached interpreter so cold-load paths can be exercised. */
export function resetPyodideForTests(): void {
  loadPromise = null;
}
