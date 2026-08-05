import type { NodeExecutor, INodeExecutionData } from "@/sdk";

const API_BASE = "https://api.humantic.ai/v1/user-profile";

export const humanticAiExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);
  const items: INodeExecutionData[] =
    inputItems.length === 0 ? [{ json: {} }] : inputItems;

  const resource = ctx.getParam<string>("resource", "profile");
  const operation = ctx.getParam<string>("operation", "create");
  const continueOnFail = ctx.continueOnFail();

  const cred = await ctx.getCredential("humanticAiApi");
  const apiKey = cred?.apiKey as string | undefined;
  if (!apiKey) {
    throw new Error("Humantic AI: API key is required. Configure a humanticAiApi credential.");
  }

  const out: INodeExecutionData[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    try {
      const userId = ctx.getParam<string>("userId", "");
      if (!userId || userId.trim() === "") {
        throw new Error("Humantic AI: userId is required");
      }

      let result: Record<string, unknown>;

      if (resource === "profile") {
        if (operation === "create") {
          result = await createProfile(apiKey, userId, ctx, item);
        } else if (operation === "get") {
          result = await getProfile(apiKey, userId, ctx);
        } else if (operation === "update") {
          result = await updateProfile(apiKey, userId, ctx, item);
        } else {
          throw new Error(`Humantic AI: unsupported operation "${operation}" for resource "${resource}"`);
        }
      } else {
        throw new Error(`Humantic AI: unsupported resource "${resource}"`);
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
  apiKey: string,
  userId: string,
  ctx: { getParam: <T>(name: string, defaultVal?: T) => T },
  item: INodeExecutionData,
): Promise<Record<string, unknown>> {
  const sendResume = ctx.getParam<boolean>("sendResume", false);
  const params = new URLSearchParams({ apikey: apiKey, userId });

  if (sendResume) {
    const binaryPropertyName = ctx.getParam<string>("binaryPropertyName", "data");
    const binaryData = item.binary?.[binaryPropertyName];
    if (!binaryData) {
      throw new Error(`Humantic AI: binary field "${binaryPropertyName}" not found on input item`);
    }
    const formData = new FormData();
    formData.append("apikey", apiKey);
    formData.append("userId", userId);
    const blob = new Blob([binaryData.data], { type: binaryData.mimeType ?? "application/pdf" });
    formData.append("resume", blob, binaryData.fileName ?? "resume");
    const res = await fetch(`${API_BASE}/create`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
      throw await apiError(res);
    }
    return (await res.json()) as Record<string, unknown>;
  }

  params.set("source", "linkedin");
  const res = await fetch(`${API_BASE}/create?${params.toString()}`, {
    method: "POST",
    headers: { accept: "application/json" },
  });
  if (!res.ok) {
    throw await apiError(res);
  }
  return (await res.json()) as Record<string, unknown>;
}

async function getProfile(
  apiKey: string,
  userId: string,
  ctx: { getParam: <T>(name: string, defaultVal?: T) => T },
): Promise<Record<string, unknown>> {
  const persona = ctx.getParam<string[]>("persona", []);
  const params = new URLSearchParams({ apikey: apiKey, userId });
  if (persona.length > 0) {
    params.set("persona", persona.join(","));
  }
  const res = await fetch(`${API_BASE}/get?${params.toString()}`, {
    method: "GET",
    headers: { accept: "application/json" },
  });
  if (!res.ok) {
    throw await apiError(res);
  }
  return (await res.json()) as Record<string, unknown>;
}

async function updateProfile(
  apiKey: string,
  userId: string,
  ctx: { getParam: <T>(name: string, defaultVal?: T) => T },
  item: INodeExecutionData,
): Promise<Record<string, unknown>> {
  const sendResume = ctx.getParam<boolean>("sendResume", false);
  const params = new URLSearchParams({ apikey: apiKey, userId });

  if (sendResume) {
    const binaryPropertyName = ctx.getParam<string>("binaryPropertyName", "data");
    const binaryData = item.binary?.[binaryPropertyName];
    if (!binaryData) {
      throw new Error(`Humantic AI: binary field "${binaryPropertyName}" not found on input item`);
    }
    const formData = new FormData();
    formData.append("apikey", apiKey);
    formData.append("userId", userId);
    const blob = new Blob([binaryData.data], { type: binaryData.mimeType ?? "application/pdf" });
    formData.append("resume", blob, binaryData.fileName ?? "resume");
    const res = await fetch(`${API_BASE}/update`, {
      method: "PUT",
      body: formData,
    });
    if (!res.ok) {
      throw await apiError(res);
    }
    return (await res.json()) as Record<string, unknown>;
  }

  const text = ctx.getParam<string>("text", "");
  if (text) {
    params.set("text", text);
  }
  const res = await fetch(`${API_BASE}/update?${params.toString()}`, {
    method: "PUT",
    headers: { accept: "application/json", "content-type": "application/json" },
  });
  if (!res.ok) {
    throw await apiError(res);
  }
  return (await res.json()) as Record<string, unknown>;
}

async function apiError(res: Response): Promise<Error> {
  let message = `Humantic AI API: HTTP ${res.status}`;
  try {
    const body = await res.json();
    if (body?.message) message += ` — ${body.message}`;
  } catch {
    const text = await res.text().catch(() => "");
    if (text) message += ` — ${text}`;
  }
  return new Error(message);
}
