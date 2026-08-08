import { buildNodeCorpus } from "./corpus";
import { createEmbedClient } from "./embed";
import { upsertChunks, clearMemoryIndex, catalogStats } from "./index-store";

export interface ReindexOptions {
  /** Force hash embeddings even if API key present. */
  forceHash?: boolean;
  batchSize?: number;
  includeSpecs?: boolean;
  onProgress?: (msg: string) => void;
}

export async function reindexNodeCatalog(options: ReindexOptions = {}): Promise<{
  chunks: number;
  modelId: string;
  mode: string;
}> {
  const log = options.onProgress ?? (() => undefined);
  const corpus = buildNodeCorpus({ includeSpecs: options.includeSpecs !== false });
  log(`corpus: ${corpus.length} chunks`);

  const client = createEmbedClient(options.forceHash === true);
  log(`embed: mode=${client.mode} model=${client.modelId} dims=${client.dimensions}`);

  const batchSize = Math.max(1, Math.min(64, options.batchSize ?? 16));
  let written = 0;

  for (let i = 0; i < corpus.length; i += batchSize) {
    const batch = corpus.slice(i, i + batchSize);
    const texts = batch.map((c) => `${c.title}\n${c.body}`.slice(0, 8000));
    const embeddings = await client.embed(texts);
    written += await upsertChunks(batch, embeddings, client);
    if ((i / batchSize) % 10 === 0) {
      log(`upserted ${written}/${corpus.length}`);
    }
  }

  clearMemoryIndex();
  const stats = await catalogStats();
  log(`done: chunks=${stats.chunkCount} model=${stats.modelId}`);

  return {
    chunks: written,
    modelId: client.modelId,
    mode: client.mode,
  };
}
