import { spawn } from "node:child_process";
import type { INodeExecutionData } from "@/sdk";

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_STDOUT_BYTES = 8 * 1024 * 1024;

/** Bootstrap: restricted builtins + allowlisted imports; top-level return; JSON I/O. */
const BOOTSTRAP = `
import json, sys

_REAL_IMPORT = __import__

# Pure-ish stdlib roots (no host FS/network by default). Deny always wins.
_ALLOWED_ROOTS = frozenset({
    "json", "re", "math", "cmath", "datetime", "collections", "itertools",
    "functools", "operator", "string", "decimal", "fractions", "statistics",
    "copy", "hashlib", "hmac", "base64", "html", "xml", "csv", "io",
    "textwrap", "typing", "dataclasses", "uuid", "random", "time", "calendar",
    "enum", "numbers", "abc", "contextlib", "heapq", "bisect", "array",
    "struct", "binascii", "codecs", "unicodedata", "zoneinfo", "ipaddress",
    "pprint", "types", "keyword", "difflib", "fnmatch",
})
# Explicit dotted allows (root may be denied, e.g. urllib.request stays blocked).
_ALLOWED_EXACT = frozenset({"urllib.parse"})
_DENIED_ROOTS = frozenset({
    "os", "sys", "subprocess", "socket", "ssl", "http", "urllib", "ftplib",
    "smtplib", "pathlib", "shutil", "tempfile", "ctypes", "multiprocessing",
    "threading", "pickle", "marshal", "importlib", "builtins", "pty", "signal",
    "resource", "mmap", "fcntl", "sqlite3", "dbm", "shelve", "code", "codeop",
    "tty", "termios", "pwd", "grp", "posix", "nt", "winreg", "msvcrt",
    "asyncio", "concurrent", "webbrowser", "selectors",
})

def _fail(msg):
    print(json.dumps({"ok": False, "error": msg}), flush=True)
    sys.exit(0)

def _import_allowed(name, extra):
    root = name.split(".")[0]
    # Deny always wins (UI/env cannot enable os/subprocess/etc.).
    if root in _DENIED_ROOTS:
        if name in _ALLOWED_EXACT or any(name.startswith(a + ".") for a in _ALLOWED_EXACT):
            return True
        return False
    if name in _ALLOWED_EXACT or name in extra:
        return True
    for a in _ALLOWED_EXACT:
        if name.startswith(a + "."):
            return True
    for a in extra:
        if name == a or name.startswith(a + "."):
            return True
    return root in _ALLOWED_ROOTS or root in extra

def _safe_import(name, globals=None, locals=None, fromlist=(), level=0):
    if level != 0:
        raise ImportError("relative imports are not allowed in the Code node")
    if not _import_allowed(name, _EXTRA):
        raise ImportError(
            "import of %r is not allowed in the Code node (restricted stdlib allowlist)"
            % (name,)
        )
    return _REAL_IMPORT(name, globals, locals, fromlist, 0)

_SAFE = {
    "abs": abs, "all": all, "any": any, "bool": bool, "dict": dict,
    "enumerate": enumerate, "filter": filter, "float": float, "frozenset": frozenset,
    "int": int, "isinstance": isinstance, "issubclass": issubclass, "len": len,
    "list": list, "map": map, "max": max, "min": min, "next": next,
    "pow": pow, "print": lambda *a, **k: None, "range": range, "repr": repr,
    "reversed": reversed, "round": round, "set": set, "slice": slice,
    "sorted": sorted, "str": str, "sum": sum, "tuple": tuple, "type": type,
    "zip": zip, "True": True, "False": False, "None": None,
    "__import__": _safe_import,
    "hasattr": hasattr, "getattr": getattr, "setattr": setattr, "delattr": delattr,
    "callable": callable, "chr": chr, "ord": ord, "hex": hex, "oct": oct, "bin": bin,
    "format": format, "hash": hash, "id": id, "divmod": divmod, "iter": iter,
    "object": object, "property": property, "staticmethod": staticmethod,
    "classmethod": classmethod, "super": super, "bytearray": bytearray,
    "bytes": bytes, "memoryview": memoryview, "complex": complex,
    "Exception": Exception, "ValueError": ValueError, "TypeError": TypeError,
    "KeyError": KeyError, "IndexError": IndexError, "RuntimeError": RuntimeError,
    "StopIteration": StopIteration, "AssertionError": AssertionError,
}

try:
    payload = json.load(sys.stdin)
except Exception as e:
    _fail("invalid payload: " + str(e))

code = payload.get("code") or ""
mode = payload.get("mode") or "runOnceForAllItems"
items = payload.get("items") or []
item = payload.get("item")
_EXTRA = frozenset(payload.get("extraImports") or [])

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

type RunnerPayload = {
  mode: string;
  code: string;
  items: unknown[];
  item?: unknown;
  extraImports: string[];
};

async function resolveExtraImports(): Promise<string[]> {
  try {
    const mod = await import("@/server/services/instance-settings");
    return await mod.resolvePythonExtraImports();
  } catch {
    const raw = process.env.OPENFLOW_PYTHON_ALLOW_IMPORTS?.trim();
    if (!raw) return [];
    return raw
      .split(/[,\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
}

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

  const extraImports = await resolveExtraImports();
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
          extraImports,
        }
      : { mode: "runOnceForAllItems", code, items: wireItems, extraImports };

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
