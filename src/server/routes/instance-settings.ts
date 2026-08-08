import type { Hono } from "hono";
import type { AppEnv } from "../middleware/auth";
import { ensureUser } from "../services/users";
import {
  getCodePythonSettings,
  setCodePythonSettings,
  normalizeImportList,
} from "../services/instance-settings";

/** Built-in allowlist roots (mirrors code-python-native bootstrap; display only). */
const BUILTIN_PYTHON_IMPORT_ROOTS = [
  "json",
  "re",
  "math",
  "cmath",
  "datetime",
  "collections",
  "itertools",
  "functools",
  "operator",
  "string",
  "decimal",
  "fractions",
  "statistics",
  "copy",
  "hashlib",
  "hmac",
  "base64",
  "html",
  "xml",
  "csv",
  "io",
  "textwrap",
  "typing",
  "dataclasses",
  "uuid",
  "random",
  "time",
  "calendar",
  "enum",
  "numbers",
  "abc",
  "contextlib",
  "heapq",
  "bisect",
  "array",
  "struct",
  "binascii",
  "codecs",
  "unicodedata",
  "zoneinfo",
  "ipaddress",
  "pprint",
  "types",
  "keyword",
  "difflib",
  "fnmatch",
  "urllib.parse",
] as const;

export default function instanceSettingsRoute(app: Hono<AppEnv>) {
  app.get("/api/v1/settings/code", async (c) => {
    const userId = c.get("userId");
    await ensureUser(userId);
    const python = await getCodePythonSettings();
    return c.json({
      python: {
        allowImports: python.allowImports,
        builtinAllowImports: [...BUILTIN_PYTHON_IMPORT_ROOTS],
        envAllowImports: normalizeImportList(process.env.OPENFLOW_PYTHON_ALLOW_IMPORTS ?? ""),
      },
    });
  });

  app.put("/api/v1/settings/code", async (c) => {
    const userId = c.get("userId");
    await ensureUser(userId);

    const body = await c.req.json<{
      python?: { allowImports?: unknown };
    }>();

    const allowImports = body?.python?.allowImports;
    if (allowImports === undefined) {
      return c.json({ error: "python.allowImports is required" }, 400);
    }

    const python = await setCodePythonSettings({ allowImports });
    return c.json({
      python: {
        allowImports: python.allowImports,
        builtinAllowImports: [...BUILTIN_PYTHON_IMPORT_ROOTS],
        envAllowImports: normalizeImportList(process.env.OPENFLOW_PYTHON_ALLOW_IMPORTS ?? ""),
      },
    });
  });
}
