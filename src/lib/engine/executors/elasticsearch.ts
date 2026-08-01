import type { NodeExecutor, INodeExecutionData, ExecutionContext } from "@/sdk";
import { ensureItems } from "@/sdk";

export interface ElasticsearchClient {
  index(params: {
    index: string;
    body: Record<string, unknown>;
    id?: string;
  }): Promise<{ _id: string; result: string }>;
  get(params: {
    index: string;
    id: string;
  }): Promise<{ _id: string; _source: Record<string, unknown>; found: boolean }>;
  delete(params: {
    index: string;
    id: string;
  }): Promise<{ _id: string; result: string }>;
  search(params: {
    index: string;
    body: Record<string, unknown>;
  }): Promise<{ hits: { hits: Array<{ _id: string; _source: Record<string, unknown> }>; total: { value: number } } }>;
  update(params: {
    index: string;
    id: string;
    body: Record<string, unknown>;
  }): Promise<{ _id: string; result: string }>;
  close(): Promise<void>;
}

export type ElasticsearchClientFactory = (
  credentials: Record<string, unknown>,
) => Promise<ElasticsearchClient>;

let clientFactory: ElasticsearchClientFactory | null = null;

export function setElasticsearchClientFactory(factory: ElasticsearchClientFactory | null): void {
  clientFactory = factory;
}

const DEFAULT_FACTORY: ElasticsearchClientFactory = async (credentials) => {
  const { Client } = await import("@elastic/elasticsearch");
  const node = String(credentials.node ?? "http://localhost:9200");
  const apiKey = credentials.apiKey ? String(credentials.apiKey) : undefined;
  const username = credentials.username ? String(credentials.username) : undefined;
  const password = credentials.password ? String(credentials.password) : undefined;

  const auth = apiKey ? { apiKey } : username && password ? { username, password } : undefined;

  const client = new Client({ node, auth });

  return {
    async index(params) {
      const response = await client.index(params);
      return { _id: response._id, result: response.result };
    },
    async get(params) {
      const response = await client.get(params);
      return {
        _id: response._id,
        _source: response._source as Record<string, unknown>,
        found: response.found,
      };
    },
    async delete(params) {
      const response = await client.delete(params);
      return { _id: response._id, result: response.result };
    },
    async search(params) {
      const response = await client.search(params);
      return {
        hits: {
          hits: (response.hits.hits ?? []).map((h) => ({
            _id: h._id,
            _source: h._source as Record<string, unknown>,
          })),
          total: { value: typeof response.hits.total === 'number' ? response.hits.total : response.hits.total?.value ?? 0 },
        },
      };
    },
    async update(params) {
      const response = await client.update(params);
      return { _id: response._id, result: response.result };
    },
    async close() {
      await client.close();
    },
  };
};

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export const elasticsearchExecutor: NodeExecutor = async (ctx) => {
  const items = ensureItems(ctx.getInputItems(0));
  const continueOnFail = ctx.continueOnFail();

  const credentials = await ctx.getCredential("elasticsearchApi");
  if (!credentials) {
    throw new Error('Elasticsearch: credential "elasticsearchApi" is not configured on this node');
  }

  let client: ElasticsearchClient | null = null;

  try {
    const factory = clientFactory ?? DEFAULT_FACTORY;
    client = await factory(credentials);

    const operation = ctx.getParam<string>("operation", "create");
    const resource = ctx.getParam<string>("resource", "");
    const out: INodeExecutionData[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      try {
        const produced = await runOperation(ctx, client, item, i, operation, resource);
        out.push(...produced);
      } catch (err) {
        if (!continueOnFail) {
          throw err instanceof Error ? err : new Error(errMessage(err));
        }
        out.push({
          json: { ...item.json, error: errMessage(err) },
          pairedItem: { item: i, input: 0 },
        });
      }
    }

    return [out];
  } finally {
    if (client) {
      await client.close().catch(() => {});
    }
  }
};

async function runOperation(
  ctx: ExecutionContext,
  client: ElasticsearchClient,
  item: INodeExecutionData,
  itemIndex: number,
  operation: string,
  resource: string,
): Promise<INodeExecutionData[]> {
  const json = item.json ?? {};

  switch (operation) {
    case "create": {
      const index = resource || ctx.getParam<string>("index", "") || String(json.index ?? "");
      const id = ctx.getParam<string>("id", "") || String(json.id ?? "");
      const body = ctx.getParam<Record<string, unknown>>("body", {}) || (json.payload as Record<string, unknown>) || json;
      const result = await client.index({ index, body, ...(id ? { id } : {}) });
      return [{ json: { _id: result._id, result: result.result, ...json }, pairedItem: { item: itemIndex, input: 0 } }];
    }

    case "get": {
      const index = resource || ctx.getParam<string>("index", "") || String(json.index ?? "");
      const id = ctx.getParam<string>("id", "") || String(json.id ?? "");
      const result = await client.get({ index, id });
      return [{ json: { _id: result._id, found: result.found, payload: result._source, ...json }, pairedItem: { item: itemIndex, input: 0 } }];
    }

    case "delete": {
      const index = resource || ctx.getParam<string>("index", "") || String(json.index ?? "");
      const id = ctx.getParam<string>("id", "") || String(json.id ?? "");
      const result = await client.delete({ index, id });
      return [{ json: { _id: result._id, result: result.result, ...json }, pairedItem: { item: itemIndex, input: 0 } }];
    }

    case "search": {
      const index = resource || ctx.getParam<string>("index", "") || String(json.index ?? "") || "_all";
      const query = ctx.getParam<Record<string, unknown>>("query", {}) || (json.query as Record<string, unknown>) || { match_all: {} };
      const size = ctx.getParam<number>("size", 10);
      const result = await client.search({ index, body: { query, size } });
      const hits = result.hits.hits.map((h) => ({ _id: h._id, ...h._source }));
      return [{ json: { total: result.hits.total.value, hits, ...json }, pairedItem: { item: itemIndex, input: 0 } }];
    }

    case "update": {
      const index = resource || ctx.getParam<string>("index", "") || String(json.index ?? "");
      const id = ctx.getParam<string>("id", "") || String(json.id ?? "");
      const body = ctx.getParam<Record<string, unknown>>("body", {}) || (json.payload as Record<string, unknown>) || {};
      const result = await client.update({ index, id, body: { doc: body } });
      return [{ json: { _id: result._id, result: result.result, ...json }, pairedItem: { item: itemIndex, input: 0 } }];
    }

    default:
      throw new Error(`Elasticsearch: unknown operation "${operation}"`);
  }
}
