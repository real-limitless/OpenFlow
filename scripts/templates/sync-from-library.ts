#!/usr/bin/env tsx
/**
 * Sync one or more template library git repos into WorkflowTemplate rows.
 *
 * Default source: https://github.com/real-limitless/n8n-workflow-library
 *
 * Usage:
 *   npx tsx scripts/templates/sync-from-library.ts [--source ID] [--dir PATH] [--limit N] [--only-new] [--dry-run] [--no-clone]
 */
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import { runTemplateLibrarySync } from "../../src/server/services/template-library-sync";

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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl && !args.dryRun) {
    console.error("DATABASE_URL is required (or use --dry-run)");
    process.exit(1);
  }

  const pool = dbUrl ? new pg.Pool({ connectionString: dbUrl }) : null;
  const prisma = pool
    ? new PrismaClient({ adapter: new PrismaPg(pool) })
    : null;

  try {
    const result = await runTemplateLibrarySync(prisma, {
      sourceId: args.source,
      dir: args.dir,
      limit: args.limit || undefined,
      onlyNew: args.onlyNew,
      dryRun: args.dryRun,
      noClone: args.noClone,
    });
    console.log(JSON.stringify(result, null, 2));
  } finally {
    if (prisma) await prisma.$disconnect();
    if (pool) await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
