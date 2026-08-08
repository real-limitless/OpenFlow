import { prisma } from "@/server/db";

const KEY_SUGGEST = "metrics.catalog.suggest";
const KEY_INSERT = "metrics.catalog.insert";
const KEY_BY_SOURCE = "metrics.catalog.by_source";

async function bump(key: string, n = 1): Promise<number> {
  const now = new Date();
  const row = await prisma.nodeCatalogMeta.findUnique({ where: { key } });
  const next = (parseInt(row?.value ?? "0", 10) || 0) + n;
  await prisma.nodeCatalogMeta.upsert({
    where: { key },
    create: { key, value: String(next), updatedAt: now },
    update: { value: String(next), updatedAt: now },
  });
  return next;
}

async function bumpSource(source: string, kind: "suggest" | "insert"): Promise<void> {
  const now = new Date();
  const row = await prisma.nodeCatalogMeta.findUnique({ where: { key: KEY_BY_SOURCE } });
  let map: Record<string, { suggest: number; insert: number }> = {};
  try {
    map = row?.value ? (JSON.parse(row.value) as typeof map) : {};
  } catch {
    map = {};
  }
  const src = source.slice(0, 40) || "unknown";
  if (!map[src]) map[src] = { suggest: 0, insert: 0 };
  map[src]![kind] += 1;
  await prisma.nodeCatalogMeta.upsert({
    where: { key: KEY_BY_SOURCE },
    create: { key: KEY_BY_SOURCE, value: JSON.stringify(map), updatedAt: now },
    update: { value: JSON.stringify(map), updatedAt: now },
  });
}

export async function recordCatalogSuggest(opts?: {
  source?: string;
  count?: number;
}): Promise<void> {
  try {
    await bump(KEY_SUGGEST, 1);
    if (opts?.source) await bumpSource(opts.source, "suggest");
  } catch {
    /* metrics must not break suggest */
  }
}

export async function recordCatalogInsert(opts: {
  type: string;
  source?: string;
  intent?: string;
}): Promise<void> {
  try {
    await bump(KEY_INSERT, 1);
    if (opts.source) await bumpSource(opts.source, "insert");
    // keep a short rolling counter of top inserted types
    const key = "metrics.catalog.insert_types";
    const now = new Date();
    const row = await prisma.nodeCatalogMeta.findUnique({ where: { key } });
    let map: Record<string, number> = {};
    try {
      map = row?.value ? (JSON.parse(row.value) as Record<string, number>) : {};
    } catch {
      map = {};
    }
    const t = opts.type.slice(0, 120);
    map[t] = (map[t] ?? 0) + 1;
    // cap map size
    const entries = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 50);
    await prisma.nodeCatalogMeta.upsert({
      where: { key },
      create: { key, value: JSON.stringify(Object.fromEntries(entries)), updatedAt: now },
      update: { value: JSON.stringify(Object.fromEntries(entries)), updatedAt: now },
    });
  } catch {
    /* ignore */
  }
}

export async function getCatalogMetrics(): Promise<{
  suggestCount: number;
  insertCount: number;
  conversionRate: number | null;
  bySource: Record<string, { suggest: number; insert: number }>;
  topInsertedTypes: Array<{ type: string; count: number }>;
}> {
  const [s, i, by, types] = await Promise.all([
    prisma.nodeCatalogMeta.findUnique({ where: { key: KEY_SUGGEST } }),
    prisma.nodeCatalogMeta.findUnique({ where: { key: KEY_INSERT } }),
    prisma.nodeCatalogMeta.findUnique({ where: { key: KEY_BY_SOURCE } }),
    prisma.nodeCatalogMeta.findUnique({ where: { key: "metrics.catalog.insert_types" } }),
  ]);
  const suggestCount = parseInt(s?.value ?? "0", 10) || 0;
  const insertCount = parseInt(i?.value ?? "0", 10) || 0;
  let bySource: Record<string, { suggest: number; insert: number }> = {};
  let topInsertedTypes: Array<{ type: string; count: number }> = [];
  try {
    bySource = by?.value ? (JSON.parse(by.value) as typeof bySource) : {};
  } catch {
    bySource = {};
  }
  try {
    const m = types?.value ? (JSON.parse(types.value) as Record<string, number>) : {};
    topInsertedTypes = Object.entries(m)
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);
  } catch {
    topInsertedTypes = [];
  }
  return {
    suggestCount,
    insertCount,
    conversionRate: suggestCount > 0 ? insertCount / suggestCount : null,
    bySource,
    topInsertedTypes,
  };
}
