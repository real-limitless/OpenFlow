import { prisma } from "../db";

export const CODE_PYTHON_ALLOW_IMPORTS_KEY = "code.pythonAllowImports";

export type CodePythonSettings = {
  /** Extra module roots allowed beyond the built-in safe stdlib list. */
  allowImports: string[];
};

const DEFAULT_CODE_PYTHON: CodePythonSettings = {
  allowImports: [],
};

type CacheEntry = { at: number; value: CodePythonSettings };
let codePythonCache: CacheEntry | null = null;
const CACHE_TTL_MS = 5_000;

const MODULE_RE = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/;

export function normalizeImportList(input: unknown): string[] {
  const raw: string[] = Array.isArray(input)
    ? input.map((x) => String(x))
    : typeof input === "string"
      ? input.split(/[,\n]+/)
      : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const part of raw) {
    const m = part.trim();
    if (!m || !MODULE_RE.test(m)) continue;
    if (seen.has(m)) continue;
    seen.add(m);
    out.push(m);
  }
  return out;
}

export function invalidateInstanceSettingsCache(): void {
  codePythonCache = null;
}

export async function getCodePythonSettings(): Promise<CodePythonSettings> {
  const now = Date.now();
  if (codePythonCache && now - codePythonCache.at < CACHE_TTL_MS) {
    return codePythonCache.value;
  }

  try {
    const row = await prisma.instanceSetting.findUnique({
      where: { key: CODE_PYTHON_ALLOW_IMPORTS_KEY },
    });
    let allowImports: string[] = [];
    if (row?.value) {
      try {
        allowImports = normalizeImportList(JSON.parse(row.value));
      } catch {
        allowImports = normalizeImportList(row.value);
      }
    }
    const value = { allowImports };
    codePythonCache = { at: now, value };
    return value;
  } catch {
    // DB unavailable (tests / early boot) — env-only fallback path still works.
    return { ...DEFAULT_CODE_PYTHON };
  }
}

export async function setCodePythonSettings(
  patch: Partial<CodePythonSettings>,
): Promise<CodePythonSettings> {
  const current = await getCodePythonSettings();
  const next: CodePythonSettings = {
    allowImports:
      patch.allowImports !== undefined
        ? normalizeImportList(patch.allowImports)
        : current.allowImports,
  };

  await prisma.instanceSetting.upsert({
    where: { key: CODE_PYTHON_ALLOW_IMPORTS_KEY },
    create: {
      key: CODE_PYTHON_ALLOW_IMPORTS_KEY,
      value: JSON.stringify(next.allowImports),
    },
    update: {
      value: JSON.stringify(next.allowImports),
    },
  });

  invalidateInstanceSettingsCache();
  codePythonCache = { at: Date.now(), value: next };
  return next;
}

/** Merge DB allowlist with OPENFLOW_PYTHON_ALLOW_IMPORTS env (env appends). */
export async function resolvePythonExtraImports(): Promise<string[]> {
  const fromDb = (await getCodePythonSettings()).allowImports;
  const fromEnv = normalizeImportList(process.env.OPENFLOW_PYTHON_ALLOW_IMPORTS ?? "");
  return normalizeImportList([...fromDb, ...fromEnv]);
}
