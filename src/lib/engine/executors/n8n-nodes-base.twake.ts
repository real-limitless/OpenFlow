import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import { ensureItems } from "@/sdk";
import { evaluateExpression } from "@/lib/expressions/evaluate";

export const twakeExecutor: NodeExecutor = async (ctx) => {
  const items = ensureItems(ctx.getInputItems(0));
  const out: INodeExecutionData[] = [];
  const continueOnFail = ctx.continueOnFail?.() ?? false;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const itemJson = item.json ?? {};
    const pairedItem = item.pairedItem ?? { item: i, input: 0 };

    try {
      const operation = String(ctx.getParam("operation", "sendMessage"));
      if (operation !== "sendMessage") {
        throw new Error(`Twake: unsupported operation "${operation}"`);
      }

      const channelId = resolveExpr(ctx.getParam<string>("channelId", ""), itemJson);
      const content = resolveExpr(ctx.getParam<string>("content", ""), itemJson);
      const groupId = resolveExpr(ctx.getParam<string>("groupId", ""), itemJson);
      const ephemeral = Boolean(ctx.getParam("ephemeral", false));

      if (!channelId) throw new Error("Twake: channelId is required");
      if (!content) throw new Error("Twake: content is required");

      const cred = await ctx.getCredential("twakeCloudApi");
      const serverCred = !cred ? await ctx.getCredential("twakeServerApi") : null;

      let baseUrl: string;
      let authHeader: string;

      if (cred) {
        baseUrl = "https://api.twake.app";
        const workspaceKey = String((cred as Record<string, unknown>).workspaceKey ?? "");
        authHeader = `Basic ${btoa(workspaceKey + ":")}`;
      } else if (serverCred) {
        baseUrl = String((serverCred as Record<string, unknown>).hostUrl ?? "").replace(/\/+$/, "");
        const publicId = String((serverCred as Record<string, unknown>).publicId ?? "");
        const privateKey = String((serverCred as Record<string, unknown>).privateApiKey ?? "");
        if (!baseUrl) throw new Error("Twake: hostUrl is required for server credentials");
        authHeader = `Basic ${btoa(`${publicId}:${privateKey}`)}`;
      } else {
        throw new Error("Twake: credentials are required (twakeCloudApi or twakeServerApi)");
      }

      const body: Record<string, unknown> = {
        message: {
          channel_id: channelId,
          content,
          _once_ephemeral_message: ephemeral,
        },
      };
      if (groupId) body.group_id = groupId;

      const url = `${baseUrl}/api/v1/messages/save`;
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader,
        },
        body: JSON.stringify(body),
      });

      let responseBody: unknown;
      const text = await resp.text();
      try {
        responseBody = text ? JSON.parse(text) : null;
      } catch {
        responseBody = text;
      }

      if (!resp.ok) {
        const errMsg =
          typeof responseBody === "object" && responseBody !== null
            ? String((responseBody as Record<string, unknown>).error ?? (responseBody as Record<string, unknown>).message ?? `Twake API error ${resp.status}`)
            : `Twake API error ${resp.status}`;
        throw new Error(errMsg);
      }

      out.push({ json: responseBody as Record<string, unknown>, pairedItem });
    } catch (err) {
      if (!continueOnFail) throw err;
      out.push({ json: { error: err instanceof Error ? err.message : String(err) }, pairedItem });
    }
  }

  return [out];
};

function resolveExpr(raw: unknown, itemJson: Record<string, unknown>): string {
  if (typeof raw !== "string") return String(raw ?? "");
  if (raw.startsWith("={{") || raw.includes("{{")) {
    const result = evaluateExpression(raw, { json: itemJson });
    return result.ok ? String(result.value ?? "") : raw;
  }
  return raw;
}
