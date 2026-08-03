import type { NodeExecutor } from "@/sdk";
import { requireCredential, sdkHttpRequest } from "@/sdk";
import type { ExecutionContext } from "@/sdk";

const APITEMPLATEIO_BASE = "https://api.apitemplate.io/v2";

interface ApiTemplateIoCredential {
  apiKey?: string;
}

function resolveValue(
  raw: unknown,
  ctx: ExecutionContext,
  itemJson: Record<string, unknown>,
): unknown {
  if (typeof raw !== "string") return raw;
  if (raw.startsWith("={{") || raw.startsWith("=")) {
    return ctx.evaluate(raw, itemJson);
  }
  return raw;
}

export const apiTemplateIoExecutor: NodeExecutor = async (ctx, node) => {
  const items = ctx.getInputItems(0);
  const resource = ctx.getParam<string>("resource", "");
  const operation = ctx.getParam<string>("operation", "");
  const continueOnFail = ctx.continueOnFail();

  const cred = await requireCredential(ctx, "apiTemplateIoApi");
  const apiKey = (cred as ApiTemplateIoCredential).apiKey ?? "";

  const output: Array<Record<string, unknown>> = [];

  for (const item of items) {
    const itemJson = item.json ?? {};

    try {
      const result = await executeOperation(resource, operation, ctx, itemJson, apiKey);
      output.push({ ...itemJson, apiTemplateIo: result });
    } catch (err) {
      if (continueOnFail) {
        output.push({ ...itemJson, error: err instanceof Error ? err.message : String(err) });
      } else {
        throw err;
      }
    }
  }

  return [output.map((json) => ({ json }))];
};

async function executeOperation(
  resource: string,
  operation: string,
  ctx: ExecutionContext,
  itemJson: Record<string, unknown>,
  apiKey: string,
): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = {
    "X-API-Key": apiKey,
    "Content-Type": "application/json",
  };

  if (resource === "account" && operation === "get") {
    const res = await sdkHttpRequest({
      method: "GET",
      url: `${APITEMPLATEIO_BASE}/account`,
      headers,
    });
    if (res.status >= 400) {
      throw new Error(`APITemplate.io error: ${JSON.stringify(res.body)}`);
    }
    return res.body as Record<string, unknown>;
  }

  if ((resource === "image" || resource === "pdf") && operation === "create") {
    const templateId = ctx.getParam<string>("templateId", "");
    if (!templateId) {
      throw new Error("templateId is required");
    }

    const rawData = ctx.getParam<Record<string, unknown>>("data", {});
    const data: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(rawData)) {
      data[key] = resolveValue(val, ctx, itemJson);
    }

    const options = ctx.getParam<Record<string, unknown>>("options", {});
    const expiration = options.expiration as number | undefined;

    const queryParams: string[] = [];
    if (expiration !== undefined && expiration > 0) {
      queryParams.push(`expiration=${expiration}`);
    }

    const isPdf = resource === "pdf";
    if (isPdf) {
      const outputFormat = options.outputFormat as string | undefined;
      if (outputFormat && outputFormat !== "pdf") {
        queryParams.push(`output_format=${outputFormat}`);
      }
    }

    const url = isPdf
      ? `${APITEMPLATEIO_BASE}/render?template_id=${encodeURIComponent(templateId)}${queryParams.length ? "&" + queryParams.join("&") : ""}`
      : `${APITEMPLATEIO_BASE}/render-image?template_id=${encodeURIComponent(templateId)}${queryParams.length ? "&" + queryParams.join("&") : ""}`;

    const res = await sdkHttpRequest({
      method: "POST",
      url,
      headers,
      body: { ...data, template_id: templateId },
    });

    if (res.status >= 400) {
      throw new Error(`APITemplate.io error: ${JSON.stringify(res.body)}`);
    }

    const body = res.body as Record<string, unknown>;
    if (isPdf) {
      return {
        ...body,
        url: body.download_url ?? body.url ?? "",
        download_url: body.download_url ?? "",
        template_id: templateId,
      };
    }

    return {
      ...body,
      url: body.url ?? "",
      template_id: templateId,
    };
  }

  throw new Error(`Unsupported resource/operation: ${resource}/${operation}`);
}
