/**
 * Clone/update template library git repos and upsert WorkflowTemplate rows.
 * Used by CLI (templates:sync) and HTTP API.
 */
import { readdir, readFile, access, mkdir } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import type { PrismaClient } from "../../generated/prisma/client";
import {
  loadTemplateSources,
  projectRoot,
  templateRowId,
  type TemplateSource,
} from "../../lib/templates/sources";

export type SyncOptions = {
  sourceId?: string;
  dir?: string;
  limit?: number;
  onlyNew?: boolean;
  dryRun?: boolean;
  noClone?: boolean;
  log?: (msg: string) => void;
};

export type SourceSyncStats = {
  sourceId: string;
  library: string;
  processed: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: number;
};

export type SyncResult = {
  sources: SourceSyncStats[];
  totals: Omit<SourceSyncStats, "sourceId" | "library">;
  dryRun: boolean;
  finishedAt: string;
};

type SyncJobState = {
  running: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  result: SyncResult | null;
};

const job: SyncJobState = {
  running: false,
  startedAt: null,
  finishedAt: null,
  error: null,
  result: null,
};

export function getTemplateSyncJobState(): SyncJobState {
  return { ...job, result: job.result ? { ...job.result } : null };
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
  log: (m: string) => void,
): Promise<void> {
  if (await exists(path.join(vendorDir, ".git"))) {
    log(`  Updating ${vendorDir} @ ${ref}…`);
    git(["fetch", "--depth", "1", "origin", ref], vendorDir);
    git(["checkout", "-f", "FETCH_HEAD"], vendorDir);
    return;
  }
  await mkdir(path.dirname(vendorDir), { recursive: true });
  log(`  Cloning ${url} (${ref}) → ${vendorDir}…`);
  git(["clone", "--depth", "1", "--branch", ref, url, vendorDir]);
}

async function resolveSourceRoot(
  source: TemplateSource,
  opts: SyncOptions,
  root: string,
  log: (m: string) => void,
): Promise<string> {
  if (opts.dir) {
    const p = path.resolve(opts.dir);
    if (!(await isLibraryRoot(p))) {
      throw new Error(`Not a library root (need workflows/): ${p}`);
    }
    return p;
  }

  if (source.dir) {
    const p = path.isAbsolute(source.dir)
      ? source.dir
      : path.resolve(root, source.dir);
    if (await isLibraryRoot(p)) return p;
    throw new Error(`Source ${source.id} dir is not a library root: ${p}`);
  }

  if (source.id === "n8n-community") {
    const sibling = path.resolve(root, "../n8n-workflow-library");
    if (await isLibraryRoot(sibling)) {
      log(`  Using sibling: ${sibling}`);
      return sibling;
    }
  }

  const vendor = path.join(root, "vendor/template-sources", source.id);
  if (await isLibraryRoot(vendor)) {
    if (!opts.noClone && source.url) {
      try {
        await ensureVendorClone(vendor, source.url, source.ref, log);
      } catch (e) {
        log(
          `  vendor update failed for ${source.id}, using existing: ${
            e instanceof Error ? e.message : e
          }`,
        );
      }
    }
    return vendor;
  }

  if (opts.noClone) {
    throw new Error(
      `No local checkout for source "${source.id}". Clone to vendor/template-sources/${source.id} or set dir.`,
    );
  }
  if (!source.url) {
    throw new Error(`Source "${source.id}" has neither url nor dir`);
  }
  await ensureVendorClone(vendor, source.url, source.ref, log);
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

async function syncOneSource(
  source: TemplateSource,
  opts: SyncOptions,
  prisma: PrismaClient | null,
  globalLimit: { remaining: number },
  root: string,
  log: (m: string) => void,
): Promise<SourceSyncStats> {
  const libRoot = await resolveSourceRoot(source, opts, root, log);
  const base = path.join(libRoot, "workflows");
  log(`\n=== ${source.id} (${source.name}) ===`);
  log(`  Library: ${libRoot}`);

  const stats: SourceSyncStats = {
    sourceId: source.id,
    library: libRoot,
    processed: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
  };

  const existing =
    opts.onlyNew && prisma
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
    if ((opts.limit ?? 0) > 0 && globalLimit.remaining <= 0) break;

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
    if ((opts.limit ?? 0) > 0) globalLimit.remaining--;

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
        typeof meta.externalId === "number" ? meta.externalId : parseInt(packId, 10);
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

      if (opts.dryRun || !prisma) {
        if (stats.processed <= 2) {
          log(`  [dry-run] ${data.id} ${data.name}`);
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
        log(
          `  … ${stats.processed} (ins=${stats.inserted} upd=${stats.updated} err=${stats.errors})`,
        );
      }
    } catch (e) {
      stats.errors++;
      if (stats.errors <= 10) {
        log(`  error ${packId}: ${e instanceof Error ? e.message : e}`);
      }
    }
  }

  return stats;
}

export async function runTemplateLibrarySync(
  prisma: PrismaClient | null,
  opts: SyncOptions = {},
): Promise<SyncResult> {
  const log = opts.log ?? ((m: string) => console.log(m));
  const root = projectRoot();

  const sources = await loadTemplateSources({
    onlyId: opts.sourceId,
    includeDisabled: false,
  });

  if (sources.length === 0) {
    throw new Error(
      "No enabled template sources. Edit config/template-sources.json or add one in Settings → Templates.",
    );
  }

  log(
    "Sources: " +
      sources.map((s) => `${s.id}@${s.ref}`).join(", "),
  );

  const globalLimit = {
    remaining: opts.limit && opts.limit > 0 ? opts.limit : Infinity,
  };
  const allStats: SourceSyncStats[] = [];

  for (const source of sources) {
    if ((opts.limit ?? 0) > 0 && globalLimit.remaining <= 0) break;
    try {
      allStats.push(
        await syncOneSource(source, opts, prisma, globalLimit, root, log),
      );
    } catch (e) {
      log(`Source ${source.id} failed: ${e instanceof Error ? e.message : e}`);
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

  return {
    sources: allStats,
    totals,
    dryRun: Boolean(opts.dryRun),
    finishedAt: new Date().toISOString(),
  };
}

/** Start sync in background; returns false if already running. */
export function startTemplateLibrarySyncBackground(
  prisma: PrismaClient,
  opts: SyncOptions = {},
): boolean {
  if (job.running) return false;
  job.running = true;
  job.startedAt = new Date().toISOString();
  job.finishedAt = null;
  job.error = null;
  job.result = null;

  void runTemplateLibrarySync(prisma, opts)
    .then((result) => {
      job.result = result;
      job.error = null;
    })
    .catch((e) => {
      job.error = e instanceof Error ? e.message : String(e);
      job.result = null;
    })
    .finally(() => {
      job.running = false;
      job.finishedAt = new Date().toISOString();
    });

  return true;
}
