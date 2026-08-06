#!/usr/bin/env tsx
/**
 * Sync one or more template library git repos into WorkflowTemplate rows.
 *
 * Sources: config/template-sources.json (+ .local.json) + OPENFLOW_TEMPLATE_SOURCES
 * Default: https://github.com/real-limitless/n8n-workflow-library
 *
 * Usage:
 *   npx tsx scripts/templates/sync-from-library.ts [--source ID] [--dir PATH] [--limit N] [--only-new] [--dry-run] [--no-clone]
 */
import { readdir, readFile, access, mkdir } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import {
  loadTemplateSources,
  projectRoot,
  templateRowId,
  type TemplateSource,
} from "./sources";

const ROOT = projectRoot();

type Args = {
  source?: string;
  dir?: string;
  limit: number;
  onlyNew: boolean;
  dryRun: boolean;
  noClone: boolean;
};

function parseArgs(argv: string[]): Args {
  const out: Args = { limit: 0, onlyNew: false, dryRun: false, noClone: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--source" && argv[i + 1]) out.source = argv[++i];
    else if (a === "--dir" && argv[i + 1]) out.dir = argv[++i];
    else if (a === "--limit" && argv[i + 1]) out.limit = parseInt(argv[++i], 10) || 0;
    else if (a === "--only-new") out.onlyNew = true;
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--no-clone") out.noClone = true;
  }
  return out;
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function isLibraryRoot(p: string): Promise<boolean> {
  // Pack must have workflows/; catalog/manifest optional
  return exists(path.join(p, "workflows"));
}

function git(args: string[], cwd?: string): void {
  const r = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (r.status !== 0) {
    throw new Error(
      `git ${args.join(" ")} failed: ${(r.stderr || r.stdout || "").trim()}`,
    );
  }
}

async function ensureVendorClone(
  vendorDir: string,
  url: string,
  ref: string,
): Promise<void> {
  if (await exists(path.join(vendorDir, ".git"))) {
    console.log(`  Updating ${vendorDir} @ ${ref}…`);
    git(["fetch", "--depth", "1", "origin", ref], vendorDir);
    git(["checkout", "-f", "FETCH_HEAD"], vendorDir);
    return;
  }
  await mkdir(path.dirname(vendorDir), { recursive: true });
  console.log(`  Cloning ${url} (${ref}) → ${vendorDir}…`);
  git(["clone", "--depth", "1", "--branch", ref, url, vendorDir]);
}

async function resolveSourceRoot(
  source: TemplateSource,
  args: Args,
): Promise<string> {
  // CLI --dir forces a single local path (when --source matches or only one source)
  if (args.dir) {
    const p = path.resolve(args.dir);
    if (!(await isLibraryRoot(p))) {
      throw new Error(`Not a library root (need workflows/): ${p}`);
    }
    return p;
  }

  if (source.dir) {
    const p = path.isAbsolute(source.dir)
      ? source.dir
      : path.resolve(ROOT, source.dir);
    // sibling shortcut
    if (await isLibraryRoot(p)) return p;
    throw new Error(`Source ${source.id} dir is not a library root: ${p}`);
  }

  // Sibling checkout named like the default library
  if (source.id === "n8n-community") {
    const sibling = path.resolve(ROOT, "../n8n-workflow-library");
    if (await isLibraryRoot(sibling)) {
      console.log(`  Using sibling: ${sibling}`);
      return sibling;
    }
  }

  const vendor = path.join(ROOT, "vendor/template-sources", source.id);
  if (await isLibraryRoot(vendor)) {
    if (!args.noClone && source.url) {
      try {
        await ensureVendorClone(vendor, source.url, source.ref);
      } catch (e) {
        console.warn(
          `  vendor update failed for ${source.id}, using existing:`,
          e instanceof Error ? e.message : e,
        );
      }
    }
    return vendor;
  }

  if (args.noClone) {
    throw new Error(
      `No local checkout for source "${source.id}". Clone to vendor/template-sources/${source.id} or set dir.`,
    );
  }
  if (!source.url) {
    throw new Error(`Source "${source.id}" has neither url nor dir`);
  }
  await ensureVendorClone(vendor, source.url, source.ref);
  if (!(await isLibraryRoot(vendor))) {
    throw new Error(`Clone finished but library layout missing under ${vendor}`);
  }
  return vendor;
}

function extractNodeTypes(workflow: Record<string, unknown>): string[] {
  const nodes = workflow.nodes;
  if (!Array.isArray(nodes)) return [];
  const types = new Set<string>();
  for (const n of nodes) {
    if (n && typeof n === "object" && typeof (n as { type?: string }).type === "string") {
      types.add((n as { type: string }).type);
    }
  }
  return [...types].sort();
}

function unwrapWorkflow(raw: Record<string, unknown>): Record<string, unknown> {
  if (Array.isArray(raw.nodes)) return raw;
  if (raw.workflow && typeof raw.workflow === "object") {
    const inner = raw.workflow as Record<string, unknown>;
    if (Array.isArray(inner.nodes)) {
      return {
        ...inner,
        name: inner.name ?? raw.name,
        id: inner.id ?? raw.id,
      };
    }
  }
  return raw;
}

function libraryPublicUrl(source: TemplateSource): string | null {
  if (!source.url) return null;
  return source.url.replace(/\.git$/, "").replace(/\/$/, "");
}

type SyncStats = {
  sourceId: string;
  library: string;
  processed: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: number;
};

async function syncSource(
  source: TemplateSource,
  args: Args,
  prisma: PrismaClient | null,
  globalLimit: { remaining: number },
): Promise<SyncStats> {
  const libRoot = await resolveSourceRoot(source, args);
  const base = path.join(libRoot, "workflows");
  console.log(`\n=== ${source.id} (${source.name}) ===`);
  console.log("  Library:", libRoot);

  if (await exists(path.join(libRoot, "manifest.json"))) {
    try {
      const m = JSON.parse(await readFile(path.join(libRoot, "manifest.json"), "utf8")) as {
        workflowCount?: number;
        generatedAt?: string;
      };
      console.log(
        `  manifest: count=${m.workflowCount ?? "?"} generatedAt=${m.generatedAt ?? "?"}`,
      );
    } catch {
      /* ignore */
    }
  }

  const stats: SyncStats = {
    sourceId: source.id,
    library: libRoot,
    processed: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
  };

  const existing =
    args.onlyNew && prisma
      ? new Set(
          (
            await prisma.workflowTemplate.findMany({
              where: { sourceId: source.id },
              select: { id: true },
            })
          ).map((r) => r.id),
        )
      : null;

  const packIds = (await readdir(base)).sort(
    (a, b) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0) || a.localeCompare(b),
  );

  const libUrl = libraryPublicUrl(source);

  for (const packId of packIds) {
    if (args.limit > 0 && globalLimit.remaining <= 0) break;

    const dir = path.join(base, packId);
    const wfPath = path.join(dir, "workflow.json");
    const metaPath = path.join(dir, "meta.json");
    if (!(await exists(wfPath))) {
      stats.skipped++;
      continue;
    }

    const rowId = templateRowId(source.id, packId);
    if (existing?.has(rowId)) {
      stats.skipped++;
      continue;
    }

    stats.processed++;
    if (args.limit > 0) globalLimit.remaining--;

    try {
      const wfRaw = JSON.parse(await readFile(wfPath, "utf8")) as Record<string, unknown>;
      const workflow = unwrapWorkflow(wfRaw);
      if (!Array.isArray(workflow.nodes)) {
        stats.errors++;
        continue;
      }

      let meta: Record<string, unknown> = {};
      if (await exists(metaPath)) {
        try {
          meta = JSON.parse(await readFile(metaPath, "utf8")) as Record<string, unknown>;
        } catch {
          /* ignore */
        }
      }

      const parsedExt =
        typeof meta.externalId === "number"
          ? meta.externalId
          : parseInt(packId, 10);
      const externalId = Number.isFinite(parsedExt) ? parsedExt : null;

      const nodeTypesFromMeta = Array.isArray(meta.nodeTypes)
        ? (meta.nodeTypes as unknown[]).filter((t): t is string => typeof t === "string")
        : null;
      const nodeTypes = nodeTypesFromMeta?.length
        ? [...nodeTypesFromMeta].sort()
        : extractNodeTypes(workflow);

      const categories = Array.isArray(meta.categories)
        ? (meta.categories as unknown[]).filter((c): c is string => typeof c === "string")
        : [];

      const name =
        (typeof meta.name === "string" && meta.name) ||
        (typeof workflow.name === "string" && workflow.name) ||
        `Workflow ${packId}`;

      const publishedRaw =
        (typeof meta.publishedAt === "string" && meta.publishedAt) ||
        (typeof meta.createdAt === "string" && meta.createdAt) ||
        null;
      const publishedAt = publishedRaw ? new Date(publishedRaw) : null;

      const sourceUrl =
        typeof meta.sourceUrl === "string" && meta.sourceUrl
          ? meta.sourceUrl
          : externalId != null
            ? `https://n8n.io/workflows/${externalId}`
            : libUrl
              ? `${libUrl}/tree/main/workflows/${packId}`
              : null;

      const data = {
        id: rowId,
        sourceId: source.id,
        sourceName: source.name,
        packId,
        externalId,
        name,
        description: typeof meta.description === "string" ? meta.description : null,
        imageUrl: typeof meta.imageUrl === "string" ? meta.imageUrl : null,
        views: Number(meta.views ?? 0) || 0,
        recentViews: Number(meta.recentViews ?? 0) || 0,
        nodeCount:
          Number(meta.nodeCount ?? 0) ||
          (Array.isArray(workflow.nodes) ? workflow.nodes.length : nodeTypes.length),
        nodeTypes: JSON.stringify(nodeTypes),
        categories: JSON.stringify(categories),
        authorName: typeof meta.authorName === "string" ? meta.authorName : null,
        authorUsername:
          typeof meta.authorUsername === "string" ? meta.authorUsername : null,
        authorAvatar: typeof meta.authorAvatar === "string" ? meta.authorAvatar : null,
        workflowJson: JSON.stringify(workflow),
        metaJson: Object.keys(meta).length ? JSON.stringify(meta) : null,
        sourceUrl,
        libraryUrl: libUrl,
        readyToDemo: Boolean(meta.readyToDemo),
        publishedAt:
          publishedAt && !Number.isNaN(publishedAt.getTime()) ? publishedAt : null,
        syncedAt: new Date(),
      };

      if (args.dryRun || !prisma) {
        if (stats.processed <= 2) {
          console.log("  [dry-run]", data.id, data.name, data.sourceUrl);
        }
        stats.inserted++;
        continue;
      }

      const prev = await prisma.workflowTemplate.findUnique({
        where: { id: rowId },
        select: { id: true },
      });
      await prisma.workflowTemplate.upsert({
        where: { id: rowId },
        create: data,
        update: {
          sourceId: data.sourceId,
          sourceName: data.sourceName,
          packId: data.packId,
          externalId: data.externalId,
          name: data.name,
          description: data.description,
          imageUrl: data.imageUrl,
          views: data.views,
          recentViews: data.recentViews,
          nodeCount: data.nodeCount,
          nodeTypes: data.nodeTypes,
          categories: data.categories,
          authorName: data.authorName,
          authorUsername: data.authorUsername,
          authorAvatar: data.authorAvatar,
          workflowJson: data.workflowJson,
          metaJson: data.metaJson,
          sourceUrl: data.sourceUrl,
          libraryUrl: data.libraryUrl,
          readyToDemo: data.readyToDemo,
          publishedAt: data.publishedAt,
          syncedAt: data.syncedAt,
        },
      });
      if (prev) stats.updated++;
      else stats.inserted++;

      if (stats.processed % 500 === 0) {
        console.log(
          `  … ${stats.processed} (ins=${stats.inserted} upd=${stats.updated} err=${stats.errors})`,
        );
      }
    } catch (e) {
      stats.errors++;
      if (stats.errors <= 10) {
        console.error("  error", packId, e instanceof Error ? e.message : e);
      }
    }
  }

  return stats;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl && !args.dryRun) {
    console.error("DATABASE_URL is required (or use --dry-run)");
    process.exit(1);
  }

  let sources = await loadTemplateSources({
    onlyId: args.source,
    includeDisabled: false,
  });

  // --dir without multi-source: treat as override path for first/only source
  if (args.dir && sources.length === 0) {
    console.error("No enabled template sources configured.");
    process.exit(1);
  }
  if (args.dir && !args.source && sources.length > 1) {
    console.warn(
      "Multiple sources enabled; --dir applies to each. Prefer --source <id> --dir <path>.",
    );
  }

  if (sources.length === 0) {
    console.error(
      "No enabled sources. Edit config/template-sources.json or config/template-sources.local.json",
    );
    process.exit(1);
  }

  console.log(
    "Sources:",
    sources.map((s) => `${s.id}@${s.ref}${s.enabled ? "" : " (off)"}`).join(", "),
  );

  const pool = dbUrl ? new pg.Pool({ connectionString: dbUrl }) : null;
  const prisma = pool
    ? new PrismaClient({ adapter: new PrismaPg(pool) })
    : null;

  const globalLimit = { remaining: args.limit > 0 ? args.limit : Infinity };
  const allStats: SyncStats[] = [];

  try {
    for (const source of sources) {
      if (args.limit > 0 && globalLimit.remaining <= 0) break;
      try {
        allStats.push(await syncSource(source, args, prisma, globalLimit));
      } catch (e) {
        console.error(
          `Source ${source.id} failed:`,
          e instanceof Error ? e.message : e,
        );
        allStats.push({
          sourceId: source.id,
          library: "",
          processed: 0,
          inserted: 0,
          updated: 0,
          skipped: 0,
          errors: 1,
        });
      }
    }
  } finally {
    if (prisma) await prisma.$disconnect();
    if (pool) await pool.end();
  }

  const totals = allStats.reduce(
    (a, s) => ({
      processed: a.processed + s.processed,
      inserted: a.inserted + s.inserted,
      updated: a.updated + s.updated,
      skipped: a.skipped + s.skipped,
      errors: a.errors + s.errors,
    }),
    { processed: 0, inserted: 0, updated: 0, skipped: 0, errors: 0 },
  );

  console.log(
    JSON.stringify(
      {
        sources: allStats,
        totals,
        dryRun: args.dryRun,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
