#!/usr/bin/env tsx
/**
 * Sync scraped n8n public workflows into Postgres WorkflowTemplate rows.
 *
 * Usage:
 *   npx tsx scripts/templates/sync-from-scraped.ts [--dir PATH] [--limit N] [--only-new] [--dry-run]
 */
import { readdir, readFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { PrismaClient } from "../../src/generated/prisma/client";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

type Args = {
  dir?: string;
  limit: number;
  onlyNew: boolean;
  dryRun: boolean;
};

function parseArgs(argv: string[]): Args {
  const out: Args = { limit: 0, onlyNew: false, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dir" && argv[i + 1]) out.dir = argv[++i];
    else if (a === "--limit" && argv[i + 1]) out.limit = parseInt(argv[++i], 10) || 0;
    else if (a === "--only-new") out.onlyNew = true;
    else if (a === "--dry-run") out.dryRun = true;
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

async function resolveWorkflowDirs(explicit?: string): Promise<string[]> {
  if (explicit) {
    const p = path.resolve(explicit);
    const candidates = [p, path.join(p, "workflows")];
    for (const c of candidates) {
      if (await exists(c)) return [c];
    }
    throw new Error(`No workflows dir at ${p}`);
  }

  const found: string[] = [];
  const settingsPath = path.join(ROOT, "scripts/scrape-n8n-workflows/.jobs/settings.json");
  if (await exists(settingsPath)) {
    try {
      const settings = JSON.parse(await readFile(settingsPath, "utf8")) as { outDir?: string };
      if (settings.outDir) {
        const op = path.isAbsolute(settings.outDir)
          ? settings.outDir
          : path.join(ROOT, settings.outDir);
        for (const c of [path.join(op, "workflows"), op]) {
          if (await exists(c)) {
            found.push(c);
            break;
          }
        }
      }
    } catch {
      /* ignore */
    }
  }

  const scraped = path.join(ROOT, ".scraped");
  if (await exists(scraped)) {
    for (const name of await readdir(scraped)) {
      const base = path.join(scraped, name);
      for (const c of [path.join(base, "workflows"), base]) {
        if (await exists(c) && !found.includes(c)) {
          // only if it has at least one workflow.json
          try {
            const kids = await readdir(c);
            const sample = kids.slice(0, 5);
            for (const k of sample) {
              if (await exists(path.join(c, k, "workflow.json"))) {
                found.push(c);
                break;
              }
            }
          } catch {
            /* ignore */
          }
        }
      }
    }
  }

  if (!found.length) {
    throw new Error("No scraped workflows found. Pass --dir or run the scraper first.");
  }
  return found;
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

function firstImageUrl(image: unknown): string | null {
  if (!image) return null;
  if (typeof image === "string") return image;
  if (Array.isArray(image) && image[0]) {
    const first = image[0];
    if (typeof first === "string") return first;
    if (first && typeof first === "object" && typeof (first as { url?: string }).url === "string") {
      return (first as { url: string }).url;
    }
  }
  return null;
}

function categoryNames(raw: unknown): string[] {
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : [raw];
  const out: string[] = [];
  for (const c of list) {
    if (typeof c === "string") out.push(c);
    else if (c && typeof c === "object") {
      const name = (c as { name?: string; slug?: string }).name
        ?? (c as { slug?: string }).slug;
      if (name) out.push(name);
    }
  }
  return [...new Set(out)];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }

  const dirs = await resolveWorkflowDirs(args.dir);
  console.log("Scrape dirs:", dirs.join(", "));

  const pool = new pg.Pool({ connectionString: dbUrl });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;
  let processed = 0;

  const existing = args.onlyNew
    ? new Set(
        (
          await prisma.workflowTemplate.findMany({ select: { id: true } })
        ).map((r) => r.id),
      )
    : null;

  try {
    for (const base of dirs) {
      const ids = (await readdir(base)).sort();
      for (const id of ids) {
        if (args.limit > 0 && processed >= args.limit) break;
        const dir = path.join(base, id);
        const wfPath = path.join(dir, "workflow.json");
        const metaPath = path.join(dir, "meta.json");
        if (!(await exists(wfPath))) {
          skipped++;
          continue;
        }
        if (existing?.has(id)) {
          skipped++;
          continue;
        }

        processed++;
        try {
          const wfRaw = await readFile(wfPath, "utf8");
          let workflow: Record<string, unknown>;
          try {
            workflow = JSON.parse(wfRaw) as Record<string, unknown>;
          } catch {
            errors++;
            continue;
          }

          // Unwrap nested shapes
          if (!Array.isArray(workflow.nodes) && workflow.workflow && typeof workflow.workflow === "object") {
            const inner = workflow.workflow as Record<string, unknown>;
            if (Array.isArray(inner.nodes)) {
              workflow = { ...inner, name: inner.name ?? workflow.name, id: inner.id ?? workflow.id };
            }
          }

          let metaRoot: Record<string, unknown> = {};
          if (await exists(metaPath)) {
            try {
              const m = JSON.parse(await readFile(metaPath, "utf8")) as Record<string, unknown>;
              metaRoot = (m.workflow && typeof m.workflow === "object"
                ? (m.workflow as Record<string, unknown>)
                : m) as Record<string, unknown>;
            } catch {
              /* ignore meta */
            }
          }

          const externalId = parseInt(id, 10);
          if (!Number.isFinite(externalId)) {
            skipped++;
            continue;
          }

          const name =
            (typeof metaRoot.name === "string" && metaRoot.name) ||
            (typeof workflow.name === "string" && workflow.name) ||
            `Workflow ${id}`;
          const description =
            typeof metaRoot.description === "string" ? metaRoot.description : null;
          const imageUrl = firstImageUrl(metaRoot.image);
          const views = Number(metaRoot.totalViews ?? metaRoot.views ?? 0) || 0;
          const recentViews = Number(metaRoot.recentViews ?? 0) || 0;
          const nodeTypes = extractNodeTypes(workflow);
          const nodeCount =
            Number(
              (metaRoot.workflowInfo as { nodeCount?: number } | undefined)?.nodeCount,
            ) ||
            (Array.isArray(workflow.nodes) ? workflow.nodes.length : nodeTypes.length);
          const categories = categoryNames(metaRoot.categories);
          const user = (metaRoot.user && typeof metaRoot.user === "object"
            ? metaRoot.user
            : {}) as Record<string, unknown>;
          const publishedAt =
            typeof metaRoot.createdAt === "string" ? new Date(metaRoot.createdAt) : null;

          const data = {
            id,
            externalId,
            name,
            description,
            imageUrl,
            views,
            recentViews,
            nodeCount,
            nodeTypes: JSON.stringify(nodeTypes),
            categories: JSON.stringify(categories),
            authorName: typeof user.name === "string" ? user.name : null,
            authorUsername: typeof user.username === "string" ? user.username : null,
            authorAvatar: typeof user.avatar === "string" ? user.avatar : null,
            workflowJson: JSON.stringify(workflow),
            metaJson: Object.keys(metaRoot).length
              ? JSON.stringify(metaRoot)
              : null,
            sourceUrl: `https://n8n.io/workflows/${id}`,
            readyToDemo: Boolean(metaRoot.readyToDemo),
            publishedAt:
              publishedAt && !Number.isNaN(publishedAt.getTime()) ? publishedAt : null,
            syncedAt: new Date(),
          };

          if (args.dryRun) {
            if (processed <= 3) console.log("[dry-run]", data.id, data.name, data.views);
            inserted++;
            continue;
          }

          const prev = await prisma.workflowTemplate.findUnique({
            where: { id },
            select: { id: true },
          });
          await prisma.workflowTemplate.upsert({
            where: { id },
            create: data,
            update: {
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
              readyToDemo: data.readyToDemo,
              publishedAt: data.publishedAt,
              syncedAt: data.syncedAt,
            },
          });
          if (prev) updated++;
          else inserted++;

          if (processed % 200 === 0) {
            console.log(`… ${processed} processed (ins=${inserted} upd=${updated} err=${errors})`);
          }
        } catch (e) {
          errors++;
          if (errors <= 10) {
            console.error("error", id, e instanceof Error ? e.message : e);
          }
        }
      }
      if (args.limit > 0 && processed >= args.limit) break;
    }
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }

  console.log(
    JSON.stringify(
      {
        processed,
        inserted,
        updated,
        skipped,
        errors,
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
