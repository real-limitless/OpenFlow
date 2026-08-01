import type { NodeExecutor } from "@/sdk";
import { sdkHttpRequest } from "@/sdk/helpers/http";

export const gotifyExecutor: NodeExecutor = async (ctx) => {
  const items = ctx.getInputItems(0);
  if (items.length === 0) {
    return [[]];
  }

  const operation = ctx.getParam("operation");
  const credential = await ctx.getCredential("gotifyApi");
  if (!credential) {
    if (ctx.continueOnFail()) {
      return [items.map(() => ({ json: { error: "Missing gotifyApi credential" } }))];
    }
    throw new Error("Missing gotifyApi credential");
  }

  const serverUrl = (credential.url as string)?.replace(/\/+$/g, "");
  const appToken = credential.appApiToken as string;
  const clientToken = credential.clientToken as string;

  if (!serverUrl) {
    if (ctx.continueOnFail()) {
      return [items.map(() => ({ json: { error: "Missing url in credential" } }))];
    }
    throw new Error("Missing url in credential");
  }

  if (operation === "create") {
    const outItems = [];
    for (const item of items) {
      try {
        const message = ctx.getParam("message");
        if (!message) {
          if (ctx.continueOnFail()) {
            outItems.push({ json: { error: "message is required for create operation" } });
            continue;
          }
          throw new Error("message is required for create operation");
        }

        const body: Record<string, unknown> = { message };
        const title = ctx.getParam("title");
        if (title) body.title = title;
        const priority = ctx.getParam<number | undefined>("priority");
        body.priority = priority ?? 0;

        const response = await sdkHttpRequest({
          method: "POST",
          url: `${serverUrl}/message`,
          headers: { "X-Gotify-Key": appToken, "Content-Type": "application/json" },
          body,
        });
        outItems.push({ json: response.body as Record<string, unknown> });
      } catch (err) {
        if (ctx.continueOnFail()) {
          outItems.push({ json: { error: (err as Error).message } });
        } else {
          throw err;
        }
      }
    }
    return [outItems];
  }

  if (operation === "delete") {
    const outItems = [];
    for (const item of items) {
      try {
        const messageId = ctx.getParam("messageId");
        if (!messageId) {
          if (ctx.continueOnFail()) {
            outItems.push({ json: { ...item.json, error: "Missing messageId parameter" } });
            continue;
          }
          throw new Error("Missing messageId parameter");
        }

        await sdkHttpRequest({
          method: "DELETE",
          url: `${serverUrl}/message/${messageId}`,
          headers: { "X-Gotify-Key": clientToken },
        });
        outItems.push({ json: { ...item.json, success: true } });
      } catch (err) {
        if (ctx.continueOnFail()) {
          outItems.push({ json: { error: (err as Error).message } });
        } else {
          throw err;
        }
      }
    }
    return [outItems];
  }

  if (operation === "getAll") {
    try {
      const returnAll = ctx.getParam("returnAll", false) as boolean;
      const limit = ctx.getParam("limit", 20) as number;
      const baseUrl = `${serverUrl}/message`;

      let data: { messages: unknown[]; paging?: Record<string, unknown> };
      if (!returnAll) {
        const resp = await sdkHttpRequest({
          method: "GET",
          url: `${baseUrl}?limit=${limit}`,
          headers: { "X-Gotify-Key": clientToken },
        });
        data = resp.body as { messages: unknown[]; paging?: Record<string, unknown> };
      } else {
        let nextUrl: string | undefined = `${baseUrl}?limit=${limit}`;
        const allMessages: unknown[] = [];
        let lastPaging: Record<string, unknown> | undefined;
        while (nextUrl) {
          const resp = await sdkHttpRequest({
            method: "GET",
            url: nextUrl,
            headers: { "X-Gotify-Key": clientToken },
          });
          const pageData = resp.body as { messages: unknown[]; paging?: { next?: string } };
          allMessages.push(...pageData.messages);
          lastPaging = pageData.paging;
          nextUrl = pageData.paging?.next;
        }
        data = { messages: allMessages, paging: lastPaging ?? {} };
      }

      const outItems = items.map(() => ({
        json: { messages: data.messages, paging: data.paging ?? {} },
      }));
      return [outItems];
    } catch (err) {
      if (ctx.continueOnFail()) {
        return [items.map(() => ({ json: { error: (err as Error).message } }))];
      }
      throw err;
    }
  }

  if (ctx.continueOnFail()) {
    return [items.map(() => ({ json: { error: `Unsupported operation: ${operation}` } }))];
  }
  throw new Error(`Unsupported operation: ${operation}`);
};
