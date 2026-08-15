/**
 * Rebuild the semantic node catalog index.
 *
 *   npm run catalog:reindex
 *   npm run catalog:reindex -- --hash
 */
import { reindexNodeCatalog } from "../src/lib/catalog/reindex";

const forceHash = process.argv.includes("--hash") || process.argv.includes("--force-hash");

reindexNodeCatalog({
  forceHash,
  onProgress: (m) => console.log(`[catalog] ${m}`),
})
  .then((r) => {
    console.log(JSON.stringify({ ok: true, ...r }, null, 2));
    process.exit(0);
  })
  .catch((err) => {
    console.error("[catalog] reindex failed:", err);
    process.exit(1);
  });
