import type { ExecutionContext, INode, INodeExecutionData } from "@/sdk";

export async function cockpitExecutor(
  ctx: ExecutionContext,
  _node: INode,
): Promise<INodeExecutionData[][]> {
  const items = ctx.getInputItems(0);
  const resource = ctx.getParam("resource") as string;
  const operation = ctx.getParam("operation") as string;
  const credentials = await ctx.getCredential("cockpitApi");

  if (!credentials) {
    throw new Error("Cockpit API credentials are required");
  }

  const cred = credentials as { url?: string; accessToken?: string };
  const baseUrl = (cred.url ?? "").replace(/\/+$/, "");
  const token = cred.accessToken ?? "";

  const buildUrl = (path: string): string =>
    `${baseUrl}/api${path}?token=${encodeURIComponent(token)}`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  const results: INodeExecutionData[] = [];

  for (const item of items) {
    try {
      const output = await executeOperation(
        resource,
        operation,
        ctx,
        item,
        buildUrl,
        headers,
        baseUrl,
        token,
      );
      if (Array.isArray(output)) {
        for (const o of output) {
          results.push({ json: o as Record<string, unknown> });
        }
      } else {
        results.push({ json: output });
      }
    } catch (error) {
      if (ctx.continueOnFail()) {
        results.push({
          json: {
            error: {
              message: (error as Error).message,
              ...(error as object),
            },
            ...item.json,
          },
        });
      } else {
        throw error;
      }
    }
  }

  return [results];
}

async function executeOperation(
  resource: string,
  operation: string,
  ctx: ExecutionContext,
  item: INodeExecutionData,
  buildUrl: (path: string) => string,
  headers: Record<string, string>,
  _baseUrl: string,
  _token: string,
): Promise<Record<string, unknown> | Record<string, unknown>[]> {
  if (resource === "collection") {
    return handleCollection(operation, ctx, item, buildUrl, headers);
  }
  if (resource === "form") {
    return handleForm(operation, ctx, item, buildUrl, headers);
  }
  if (resource === "singleton") {
    return handleSingleton(operation, ctx, item, buildUrl, headers);
  }
  throw new Error(`Unknown resource: ${resource}`);
}

async function handleCollection(
  operation: string,
  ctx: ExecutionContext,
  item: INodeExecutionData,
  buildUrl: (path: string) => string,
  headers: Record<string, string>,
): Promise<Record<string, unknown> | Record<string, unknown>[]> {
  const collection = ctx.getParam("collection") as string;
  if (!collection) {
    throw new Error("Collection name is required");
  }

  if (operation === "create" || operation === "update") {
    const rawData = ctx.getParam("data");
    let data: Record<string, unknown> = {};
    if (typeof rawData === "string" && rawData.trim()) {
      try {
        data = JSON.parse(rawData);
      } catch {
        data = { value: rawData };
      }
    } else if (rawData && typeof rawData === "object") {
      data = rawData as Record<string, unknown>;
    }

    if (operation === "create") {
      const res = await fetch(buildUrl(`/collections/save/${collection}`), {
        method: "POST",
        headers,
        body: JSON.stringify({ data }),
      });
      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`Cockpit API error (${res.status}): ${errBody}`);
      }
      return res.json() as Promise<Record<string, unknown>>;
    } else {
      const res = await fetch(buildUrl(`/collections/save/${collection}`), {
        method: "POST",
        headers,
        body: JSON.stringify({ data }),
      });
      if (!res.ok) {
        const errBody = await res.text();
        throw new Error(`Cockpit API error (${res.status}): ${errBody}`);
      }
      return res.json() as Promise<Record<string, unknown>>;
    }
  }

  if (operation === "getAll") {
    const filter = ctx.getParam("filter");
    const limit = (ctx.getParam("limit") as number) ?? 0;
    const skip = (ctx.getParam("skip") as number) ?? 0;
    const sort = ctx.getParam("sort");
    const populate = ctx.getParam("populate") as boolean;

    let filterObj: Record<string, unknown> | undefined;
    if (typeof filter === "string" && filter.trim()) {
      filterObj = JSON.parse(filter);
    } else if (filter && typeof filter === "object") {
      filterObj = filter as Record<string, unknown>;
    }

    let sortObj: Record<string, unknown> | undefined;
    if (typeof sort === "string" && sort.trim()) {
      sortObj = JSON.parse(sort);
    } else if (sort && typeof sort === "object") {
      sortObj = sort as Record<string, unknown>;
    }

    const body: Record<string, unknown> = {};
    if (filterObj) body.filter = filterObj;
    if (limit > 0) body.limit = limit;
    if (skip > 0) body.skip = skip;
    if (sortObj) body.sort = sortObj;
    body.populate = populate ?? false;

    const res = await fetch(buildUrl(`/collections/get/${collection}`), {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Cockpit API error (${res.status}): ${errBody}`);
    }
    const data = (await res.json()) as Record<string, unknown> | Record<string, unknown>[];
    if (Array.isArray(data)) {
      return data;
    }
    const entries = data.entries as Record<string, unknown>[] | undefined;
    return entries ?? [data];
  }

  throw new Error(`Unknown collection operation: ${operation}`);
}

async function handleForm(
  operation: string,
  ctx: ExecutionContext,
  item: INodeExecutionData,
  buildUrl: (path: string) => string,
  headers: Record<string, string>,
): Promise<Record<string, unknown>> {
  const form = ctx.getParam("form") as string;
  if (!form) {
    throw new Error("Form name is required");
  }

  const rawData = ctx.getParam("data");
  let data: Record<string, unknown> = {};
  if (typeof rawData === "string" && rawData.trim()) {
    try {
      data = JSON.parse(rawData);
    } catch {
      data = { value: rawData };
    }
  } else if (rawData && typeof rawData === "object") {
    data = rawData as Record<string, unknown>;
  }

  const res = await fetch(buildUrl(`/forms/submit/${form}`), {
    method: "POST",
    headers,
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Cockpit API error (${res.status}): ${errBody}`);
  }
  return res.json() as Promise<Record<string, unknown>>;
}

async function handleSingleton(
  _operation: string,
  ctx: ExecutionContext,
  _item: INodeExecutionData,
  buildUrl: (path: string) => string,
  headers: Record<string, string>,
): Promise<Record<string, unknown>> {
  const singleton = ctx.getParam("singleton") as string;
  if (!singleton) {
    throw new Error("Singleton name is required");
  }

  const res = await fetch(buildUrl(`/singletons/get/${singleton}`), {
    method: "POST",
    headers,
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Cockpit API error (${res.status}): ${errBody}`);
  }
  return res.json() as Promise<Record<string, unknown>>;
}
