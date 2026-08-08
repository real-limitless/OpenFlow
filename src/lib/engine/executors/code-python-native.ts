import { spawn } from "node:child_process";
import type { INodeExecutionData } from "@/sdk";

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_STDOUT_BYTES = 8 * 1024 * 1024;

/** Bootstrap: restricted builtins, top-level return via function wrap, JSON I/O. */
const BOOTSTRAP = `
import json, sys, traceback

_SAFE = {
    "abs": abs, "all": all, "any": any, "bool": bool, "dict": dict,
    "enumerate": enumerate, "filter": filter, "float": float, "frozenset": frozenset,
    "int": int, "isinstance": isinstance, "issubclass": issubclass, "len": len,
    "list": list, "map": map, "max": max, "min": min, "next": next,
    "pow": pow, "print": lambda *a, **k: None, "range": range, "repr": repr,
    "reversed": reversed, "round": round, "set": set, "slice": slice,
    "sorted": sorted, "str": str, "sum": sum, "tuple": tuple, "type": type,
    "zip": zip, "True": True, "False": False, "None": None,
}

def _fail(msg):
    print(json.dumps({"ok": False, "error": msg}), flush=True)
    sys.exit(0)

try:
    payload = json.load(sys.stdin)
except Exception as e:
    _fail("invalid payload: " + str(e))

code = payload.get("code") or ""
mode = payload.get("mode") or "runOnceForAllItems"
items = payload.get("items") or []
item = payload.get("item")

ns = {"__builtins__": _SAFE, "_items": items}
if item is not None:
    ns["_item"] = item
else:
    ns["_item"] = items[0] if items else {"json": {}}

lines = code.splitlines() or [""]
body = "\\n".join(("    " + ln if ln.strip() else ln) for ln in lines)
wrapped = "def __of_user():\\n" + (body if body.strip() else "    pass") + "\\n__of_result = __of_user()\\n"

try:
    exec(compile(wrapped, "<code>", "exec"), ns, ns)
except SyntaxError as e:
    _fail("SyntaxError: " + str(e))
except Exception as e:
    _fail(type(e).__name__ + ": " + str(e))

result = ns.get("__of_result", None)
try:
    print(json.dumps({"ok": True, "result": result}, default=str), flush=True)
except Exception as e:
    _fail("result not JSON-serializable: " + str(e))
`;

function resolvePythonBin(): string {
  return process.env.OPENFLOW_PYTHON_BIN?.trim() || "python3";
}

type RunnerPayload =
  | { mode: "runOnceForAllItems"; code: string; items: unknown[] }
  | { mode: "runOnceForEachItem"; code: string; items: unknown[]; item: unknown };

export async function runPythonNative(
  code: string,
  mode: string,
  items: INodeExecutionData[],
  activeItem?: INodeExecutionData,
): Promise<unknown> {
  const wireItems = items.map((it) => ({
    json: it.json ?? {},
    ...(it.pairedItem !== undefined ? { pairedItem: it.pairedItem } : {}),
  }));

  const payload: RunnerPayload =
    mode === "runOnceForEachItem"
      ? {
          mode: "runOnceForEachItem",
          code,
          items: wireItems,
          item: {
            json: activeItem?.json ?? {},
            ...(activeItem?.pairedItem !== undefined ? { pairedItem: activeItem.pairedItem } : {}),
          },
        }
      : { mode: "runOnceForAllItems", code, items: wireItems };

  return spawnPython(payload);
}

function spawnPython(payload: RunnerPayload): Promise<unknown> {
  const bin = resolvePythonBin();
  const timeoutMs = Number(process.env.OPENFLOW_PYTHON_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;

  return new Promise((resolve, reject) => {
    const child = spawn(bin, ["-c", BOOTSTRAP], {
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        PATH: process.env.PATH,
        LANG: process.env.LANG ?? "C.UTF-8",
        LC_ALL: process.env.LC_ALL ?? "C.UTF-8",
        HOME: process.env.HOME,
        TMPDIR: process.env.TMPDIR,
      },
    });

    let stdout = Buffer.alloc(0);
    let stderr = "";
    let settled = false;

    const finish = (err?: Error, value?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) reject(err);
      else resolve(value);
    };

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(new Error(`Code node Python timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdout = Buffer.concat([stdout, chunk]);
      if (stdout.length > MAX_STDOUT_BYTES) {
        child.kill("SIGKILL");
        finish(new Error("Code node Python stdout exceeded size limit"));
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
      if (stderr.length > 64_000) stderr = stderr.slice(-64_000);
    });

    child.on("error", (err) => {
      const msg = err.message.includes("ENOENT")
        ? `Code node requires python3 on PATH (or OPENFLOW_PYTHON_BIN); ${err.message}`
        : `Code node failed to spawn Python: ${err.message}`;
      finish(new Error(msg));
    });

    child.on("close", (code) => {
      if (settled) return;
      const text = stdout.toString("utf8").trim();
      if (!text) {
        finish(
          new Error(
            `Code node Python exited ${code ?? "unknown"} with no output` +
              (stderr ? `: ${stderr.trim()}` : ""),
          ),
        );
        return;
      }
      let parsed: { ok?: boolean; result?: unknown; error?: string };
      try {
        parsed = JSON.parse(text) as { ok?: boolean; result?: unknown; error?: string };
      } catch {
        finish(
          new Error(
            `Code node Python returned non-JSON output` + (stderr ? `: ${stderr.trim()}` : ""),
          ),
        );
        return;
      }
      if (!parsed.ok) {
        finish(new Error(parsed.error || "Code node Python failed"));
        return;
      }
      finish(undefined, parsed.result);
    });

    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}
