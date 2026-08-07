import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import { requireCredential } from "@/sdk/helpers/credentials";

const HUMANTIC_AI_API = "https://api.humantic.ai/v1";

export const humanticAiToolExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);
  const items: INodeExecutionData[] =
    inputItems.length === 0 ? [{ json: {} }] : inputItems;

  const resource = ctx.getParam<string>("resource", "profile");
  const operation = ctx.getParam<string>("operation", "create");
  const continueOnFail = ctx.continueOnFail();

  const cred = await requireCredential(ctx, "humanticAiApi");

  const out: INodeExecutionData[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    try {
      if (resource !== "profile") {
        throw new Error(`Humantic AI Tool: unsupported resource "${resource}"`);
      }

      let result: Record<string, unknown>;

      if (operation === "create") {
        result = await createProfile(ctx, item, cred);
      } else if (operation === "get") {
        result = await getProfile(ctx, cred);
      } else if (operation === "update") {
        result = await updateProfile(ctx, item, cred);
      } else {
        throw new Error(`Humantic AI Tool: unsupported operation "${operation}"`);
      }

      out.push({
        json: result,
        pairedItem: item.pairedItem ?? { item: i, input: 0 },
      });
    } catch (err) {
      if (continueOnFail) {
        out.push({
          json: { error: err instanceof Error ? err.message : String(err) },
          pairedItem: item.pairedItem ?? { item: i, input: 0 },
        });
        continue;
      }
      throw err;
    }
  }

  return [out];
};

async function createProfile(
  ctx: Parameters<NodeExecutor>[0],
  item: INodeExecutionData,
  cred: unknown,
): Promise<Record<string, unknown>> {
  const userId = String(ctx.getParam("userId", ""));
  if (!userId) throw new Error("Humantic AI Tool: userId is required");

  const sendResume = ctx.getParam<boolean>("sendResume", false);

  const body: Record<string, unknown> = { userid: userId };

  if (sendResume) {
    const binaryPropertyName = ctx.getParam<string>("binaryPropertyName", "data");
    const binaryData = (item.binary ?? {})[binaryPropertyName];
    if (binaryData) {
      body["resume_binary"] = binaryData.data;
    }
  }

  return apiRequest("POST", `${HUMANTIC_AI_API}/user-profile/create`, body, cred);
}

async function getProfile(
  ctx: Parameters<NodeExecutor>[0],
  cred: unknown,
): Promise<Record<string, unknown>> {
  const userId = String(ctx.getParam("userId", ""));
  if (!userId) throw new Error("Humantic AI Tool: userId is required");

  const persona = ctx.getParam<string[]>("persona", []);

  const params = new URLSearchParams({ userid: userId });
  if (persona.length > 0) {
    params.set("persona", persona.join(","));
  }

  return apiRequest(
    "GET",
    `${HUMANTIC_AI_API}/user-profile?${params.toString()}`,
    undefined,
    cred,
  );
}

async function updateProfile(
  ctx: Parameters<NodeExecutor>[0],
  item: INodeExecutionData,
  cred: unknown,
): Promise<Record<string, unknown>> {
  const userId = String(ctx.getParam("userId", ""));
  if (!userId) throw new Error("Humantic AI Tool: userId is required");

  const sendResume = ctx.getParam<boolean>("sendResume", false);
  const text = ctx.getParam<string>("text", "");

  const body: Record<string, unknown> = { userid: userId };

  if (sendResume) {
    const binaryPropertyName = ctx.getParam<string>("binaryPropertyName", "data");
    const binaryData = (item.binary ?? {})[binaryPropertyName];
    if (binaryData) {
      body["resume_binary"] = binaryData.data;
    }
  }

  if (text) {
    body["text"] = text;
  }

  return apiRequest("POST", `${HUMANTIC_AI_API}/user-profile/update`, body, cred);
}

async function apiRequest(
  method: string,
  url: string,
  body: Record<string, unknown> | undefined,
  cred: unknown,
): Promise<Record<string, unknown>> {
  const apiKey = (cred as Record<string, string>)?.apiKey;
  if (!apiKey) {
    throw new Error("Humantic AI: API key is missing from credential");
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    Accept: "application/json",
  };

  const init: RequestInit = { method, headers };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }

  const res = await fetch(url, init);
  const text =
    typeof (res as Response).text === "function"
      ? await (res as Response).text()
      : JSON.stringify(await (res as Response).json());
  let parsed: Record<string, unknown> = {};
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text };
    }
  }

  if (!res.ok) {
    const message =
      String(parsed.message ?? parsed.error ?? "") || `HTTP ${res.status}`;
    throw new Error(`Humantic AI: ${message}`);
  }

  return parsed;
}
