import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import { sdkHttpRequest } from "@/sdk";

function getAccountName(cred: Record<string, unknown> | null): string {
  if (cred?.accountName) return String(cred.accountName);
  if (cred?.site) return String(cred.site);
  if (cred?.subdomain) return String(cred.subdomain);
  return "";
}

function getApiKey(cred: Record<string, unknown> | null): string {
  if (cred?.apiKey) return String(cred.apiKey);
  if (cred?.accessToken) return String(cred.accessToken);
  return "";
}

function buildUrl(accountName: string, path: string): string {
  return `https://${accountName}.chargebee.com/api/v2${path}`;
}

function authHeader(apiKey: string): string {
  return `Basic ${btoa(`${apiKey}:`)}`;
}

async function chargebeeRequest(
  apiKey: string,
  accountName: string,
  method: string,
  path: string,
  queryOrBody?: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const url = buildUrl(accountName, path);
  const headers: Record<string, string> = {
    Authorization: authHeader(apiKey),
    Accept: "application/json",
  };

  let finalUrl = url;
  let body: unknown = undefined;

  if (method === "GET") {
    if (queryOrBody) {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(queryOrBody)) {
        if (v !== undefined && v !== null && v !== "") {
          qs.set(k, String(v));
        }
      }
      const qstr = qs.toString();
      if (qstr) finalUrl = `${url}?${qstr}`;
    }
  } else {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    if (queryOrBody) {
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(queryOrBody)) {
        if (v !== undefined && v !== null) {
          params.set(k, String(v));
        }
      }
      body = params.toString();
    }
  }

  const response = await sdkHttpRequest({
    method,
    url: finalUrl,
    headers,
    body,
    timeoutMs: 30000,
  });

  if (response.status < 200 || response.status >= 300) {
    throw new Error(
      `Chargebee API error: HTTP ${response.status} ${JSON.stringify(response.body)}`,
    );
  }

  return (response.body ?? {}) as Record<string, unknown>;
}

export const chargebeeExecutor: NodeExecutor = async (ctx, node) => {
  const items = ctx.getInputItems(0);
  if (items.length === 0) {
    return [[{ json: {} }]];
  }

  const resource = String(node.parameters.resource ?? "invoice");
  const operation = String(node.parameters.operation ?? "list");

  const credential = await ctx.getCredential("chargebeeApi");
  const accountName = getAccountName(credential as Record<string, unknown> | null);
  const apiKey = getApiKey(credential as Record<string, unknown> | null);

  if (!accountName || !apiKey) {
    throw new Error("Chargebee: chargebeeApi credential is missing accountName or apiKey");
  }

  const results: INodeExecutionData[] = [];

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: idx, input: 0 };

    try {
      const result = await runOperation(
        ctx,
        node,
        apiKey,
        accountName,
        resource,
        operation,
        itemJson,
      );

      if (Array.isArray(result)) {
        for (const r of result) {
          results.push({ json: r, pairedItem });
        }
      } else {
        results.push({ json: result, pairedItem });
      }
    } catch (err) {
      if (!ctx.continueOnFail()) throw err;
      const message = err instanceof Error ? err.message : String(err);
      results.push({ json: { error: message, json: itemJson, itemIndex: idx }, pairedItem });
    }
  }

  return [results];
};

async function runOperation(
  ctx: Parameters<NodeExecutor>[0],
  node: Parameters<NodeExecutor>[1],
  apiKey: string,
  accountName: string,
  resource: string,
  operation: string,
  itemJson: Record<string, unknown>,
): Promise<Record<string, unknown> | Record<string, unknown>[]> {
  switch (resource) {
    case "customer":
      return runCustomerOperation(ctx, node, apiKey, accountName, operation, itemJson);
    case "invoice":
      return runInvoiceOperation(ctx, node, apiKey, accountName, operation, itemJson);
    case "subscription":
      return runSubscriptionOperation(ctx, node, apiKey, accountName, operation, itemJson);
    default:
      throw new Error(`Chargebee: unsupported resource "${resource}"`);
  }
}

async function runCustomerOperation(
  ctx: Parameters<NodeExecutor>[0],
  node: Parameters<NodeExecutor>[1],
  apiKey: string,
  accountName: string,
  operation: string,
  _itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  if (operation !== "create") {
    throw new Error(`Chargebee: unsupported customer operation "${operation}"`);
  }

  const properties = node.parameters.properties as Record<string, unknown> | undefined;
  const params: Record<string, unknown> = {};

  if (properties && typeof properties === "object") {
    for (const key of ["id", "first_name", "last_name", "email", "phone", "company"]) {
      const val = properties[key];
      if (val !== undefined && val !== null && val !== "") {
        params[key] = val;
      }
    }

    const customProps = properties.customProperties as Record<string, unknown> | undefined;
    if (customProps) {
      const values = (customProps.customPropertiesValues as Record<string, unknown> | undefined)?.customProperties as Array<Record<string, string>> | undefined;
      if (values && values.length > 0) {
        for (const entry of values) {
          const name = entry.name;
          const value = entry.value;
          if (name) params[name] = value ?? "";
        }
      }
    }
  }

  return chargebeeRequest(apiKey, accountName, "POST", "/customers", params);
}

async function runInvoiceOperation(
  ctx: Parameters<NodeExecutor>[0],
  node: Parameters<NodeExecutor>[1],
  apiKey: string,
  accountName: string,
  operation: string,
  _itemJson: Record<string, unknown>,
): Promise<Record<string, unknown> | Record<string, unknown>[]> {
  if (operation === "list") {
    const maxResults = Number(node.parameters.maxResults ?? 10);
    const filters = node.parameters.filters as Record<string, unknown> | undefined;

    const params: Record<string, unknown> = {
      "sort_by[desc]": "date",
      limit: Math.min(Math.max(1, maxResults), 100),
    };

    if (filters) {
      const dateFilters = filters.date as Array<Record<string, unknown>> | undefined;
      if (dateFilters && dateFilters.length > 0) {
        for (const f of dateFilters) {
          const op = f.operation as string;
          const val = f.value as string;
          if (op && val) {
            const epochSeconds = Math.floor(new Date(val).getTime() / 1000);
            if (!isNaN(epochSeconds)) {
              params[`date[${op}]`] = epochSeconds;
            }
          }
        }
      }

      const amountFilters = filters.amount as Array<Record<string, unknown>> | undefined;
      if (amountFilters && amountFilters.length > 0) {
        for (const f of amountFilters) {
          const op = f.operation as string;
          const val = f.value as string;
          if (op && val) {
            params[`amount[${op}]`] = val;
          }
        }
      }
    }

    const res = await chargebeeRequest(apiKey, accountName, "GET", "/invoices", params);
    const list = (res.list ?? []) as Array<Record<string, unknown>>;
    return list.map((entry) => {
      const invoice = entry.invoice as Record<string, unknown> | undefined;
      return invoice ?? entry;
    });
  }

  if (operation === "pdfUrl") {
    const invoiceId = String(node.parameters.invoiceId ?? "");
    if (!invoiceId) {
      throw new Error("Chargebee: invoiceId is required for pdfUrl operation");
    }
    const res = await chargebeeRequest(
      apiKey,
      accountName,
      "POST",
      `/invoices/${encodeURIComponent(invoiceId)}/pdf`,
    );
    const download = res.download as Record<string, unknown> | undefined;
    const downloadUrl = download?.download_url as string | undefined;
    return { ..._itemJson, pdfUrl: downloadUrl ?? "" };
  }

  throw new Error(`Chargebee: unsupported invoice operation "${operation}"`);
}

async function runSubscriptionOperation(
  ctx: Parameters<NodeExecutor>[0],
  node: Parameters<NodeExecutor>[1],
  apiKey: string,
  accountName: string,
  operation: string,
  _itemJson: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const subscriptionId = String(node.parameters.subscriptionId ?? "");
  if (!subscriptionId) {
    throw new Error("Chargebee: subscriptionId is required for subscription operations");
  }

  if (operation === "cancel") {
    const body: Record<string, unknown> = {};
    const endOfTerm = node.parameters.endOfTerm;
    if (endOfTerm === true || endOfTerm === "true") {
      body.end_of_term = "true";
    }
    return chargebeeRequest(
      apiKey,
      accountName,
      "POST",
      `/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`,
      body,
    );
  }

  if (operation === "delete") {
    return chargebeeRequest(
      apiKey,
      accountName,
      "POST",
      `/subscriptions/${encodeURIComponent(subscriptionId)}/delete`,
    );
  }

  throw new Error(`Chargebee: unsupported subscription operation "${operation}"`);
}
