import { config } from "@/config";
import { buildNodeCorpus } from "./corpus";
import { createEmbedClient } from "./embed";
import { upsertChunks, clearMemoryIndex, catalogStats } from "./index-store";
import type { CatalogCorpusChunk } from "./types";

export interface ReindexOptions {
  /** Force hash embeddings even if API available. */
  forceHash?: boolean;
  batchSize?: number;
  concurrency?: number;
  includeSpecs?: boolean;
  onProgress?: (msg: string) => void;
}

async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]!, i);
    }
  }
  const n = Math.min(concurrency, Math.max(1, items.length));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}

export async function reindexNodeCatalog(options: ReindexOptions = {}): Promise<{
  chunks: number;
  modelId: string;
  mode: string;
  batchSize: number;
  concurrency: number;
}> {
  const log = options.onProgress ?? (() => undefined);
  const corpus = buildNodeCorpus({ includeSpecs: options.includeSpecs !== false });
  log(`corpus: ${corpus.length} chunks`);

  const client = createEmbedClient(options.forceHash === true);
  const batchSize = Math.max(
    1,
    Math.min(256, options.batchSize ?? config.catalog.embedBatchSize),
  );
  const concurrency = Math.max(
    1,
    Math.min(16, options.concurrency ?? config.catalog.embedConcurrency),
  );

  log(
    `embed: mode=${client.mode} model=${client.modelId} dims=${client.dimensions} batch=${batchSize} concurrency=${concurrency}`,
  );

  type Batch = { chunks: CatalogCorpusChunk[]; texts: string[]; start: number };
  const batches: Batch[] = [];
  for (let i = 0; i < corpus.length; i += batchSize) {
    const chunks = corpus.slice(i, i + batchSize);
    batches.push({
      chunks,
      texts: chunks.map((c) => `${c.title}\n${c.body}`.slice(0, 8000)),
      start: i,
    });
  }

  let written = 0;
  await mapPool(batches, concurrency, async (batch) => {
    const embeddings = await client.embed(batch.texts);
    const n = await upsertChunks(batch.chunks, embeddings, client);
    written += n;
    log(`upserted ${written}/${corpus.length}`);
    return n;
  });

  clearMemoryIndex();
  const stats = await catalogStats();
  log(`done: chunks=${stats.chunkCount} model=${stats.modelId}`);

  return {
    chunks: written,
    modelId: client.modelId,
    mode: client.mode,
    batchSize,
    concurrency,
  };
}
