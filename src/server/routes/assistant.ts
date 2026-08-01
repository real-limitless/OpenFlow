import type { Hono } from "hono";
import type { AppEnv } from "../middleware/auth";
import { config } from "../../config";
import {
  addCheckpoint,
  appendMessage,
  clearSession,
  getOrCreateSession,
  rollbackSession,
} from "../assistant/sessions";
import { runBuiltinAssistant } from "../assistant/builtin-agent";
import { createOpencodeSession, runOpencodeAssistant } from "../assistant/opencode-manager";
import { subscribeWorkflowEvents } from "../services/workflow-events";
import { loadWorkflow, saveWorkflow } from "../services/workflow-editor";
import type { IWorkflow } from "../../lib/workflow/types";

function sseWrite(controller: ReadableStreamDefaultController<Uint8Array>, data: unknown) {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  controller.enqueue(new TextEncoder().encode(payload));
}

export default function assistantRoute(app: Hono<AppEnv>) {
  app.get("/api/v1/workflows/:id/events", async (c) => {
    const workflowId = c.req.param("id");
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        sseWrite(controller, { type: "connected", workflowId });
        const unsub = subscribeWorkflowEvents(workflowId, (event) => {
          sseWrite(controller, event);
        });
        const heartbeat = setInterval(() => {
          try {
            sseWrite(controller, { type: "ping" });
          } catch {
            clearInterval(heartbeat);
          }
        }, 15000);
        c.req.raw.signal.addEventListener("abort", () => {
          clearInterval(heartbeat);
          unsub();
          try {
            controller.close();
          } catch {
            /* closed */
          }
        });
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  });

  app.get("/api/v1/workflows/:id/assistant/session", async (c) => {
    if (!config.assistant.enabled) return c.json({ error: "Assistant disabled" }, 503);
    const workflowId = c.req.param("id");
    const userId = c.get("userId") ?? "local";
    const session = getOrCreateSession(workflowId, userId);
    return c.json({
      id: session.id,
      workflowId: session.workflowId,
      backend: config.assistant.backend,
      messages: session.messages,
    });
  });

  app.delete("/api/v1/workflows/:id/assistant/session", async (c) => {
    const workflowId = c.req.param("id");
    const userId = c.get("userId") ?? "local";
    clearSession(workflowId, userId);
    return c.body(null, 204);
  });

  app.post("/api/v1/workflows/:id/assistant/messages", async (c) => {
    if (!config.assistant.enabled) return c.json({ error: "Assistant disabled" }, 503);

    const workflowId = c.req.param("id");
    const userId = c.get("userId") ?? "local";
    const body = (await c.req.json().catch(() => ({}))) as {
      message?: string;
      workflow?: IWorkflow;
    };
    const message = (body.message ?? "").trim();
    if (!message) return c.json({ error: "message required" }, 400);

    // Optional canvas snapshot so agent sees unsaved client graph (same pattern as execute).
    if (body.workflow?.nodes) {
      await saveWorkflow(
        workflowId,
        { ...body.workflow, id: body.workflow.id || workflowId },
        userId,
        "editor",
      );
    }

    const wf = await loadWorkflow(workflowId);
    if (!wf) return c.json({ error: "Workflow not found" }, 404);

    const session = getOrCreateSession(workflowId, userId);
    // Snapshot graph before this turn so rollback can restore canvas + chat.
    const userMsg = appendMessage(session, { role: "user", content: message });
    addCheckpoint(session, userMsg.id, wf);

    const history = session.messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(0, -1)
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (data: unknown) => sseWrite(controller, data);
        let assistantText = "";

        try {
          if (config.assistant.backend === "opencode") {
            if (!session.opencodeSessionId) {
              session.opencodeSessionId = await createOpencodeSession(`OpenFlow ${workflowId}`);
            }
            const origin = new URL(c.req.url).origin;
            const mcpUrl = `${origin}/mcp/openflow?workflowId=${encodeURIComponent(workflowId)}`;
            for await (const ev of runOpencodeAssistant({
              sessionId: session.opencodeSessionId,
              workflowId,
              userMessage: message,
              mcpPublicUrl: mcpUrl,
            })) {
              send(ev);
              if (ev.type === "text") assistantText += ev.text;
              if (ev.type === "done") assistantText = ev.message;
            }
          } else {
            for await (const ev of runBuiltinAssistant({
              workflowId,
              userId,
              userMessage: message,
              history,
            })) {
              send(ev);
              if (ev.type === "text") assistantText += (assistantText ? "" : "") + ev.text;
              if (ev.type === "tool_call") {
                appendMessage(session, {
                  role: "tool",
                  content: JSON.stringify(ev.args),
                  toolName: ev.name,
                });
              }
              if (ev.type === "done") assistantText = ev.message;
            }
          }

          if (assistantText) {
            appendMessage(session, { role: "assistant", content: assistantText });
          }
        } catch (e) {
          send({
            type: "error",
            message: e instanceof Error ? e.message : String(e),
          });
        } finally {
          try {
            controller.close();
          } catch {
            /* closed */
          }
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  });

  /**
   * Roll back chat + workflow to a user message.
   * Body: { messageId, keepMessage?: boolean }
   * - keepMessage true (default): keep that user message, drop everything after it, restore graph to pre-turn snapshot
   * - keepMessage false: also drop that user message (for edit-then-resend)
   */
  app.post("/api/v1/workflows/:id/assistant/rollback", async (c) => {
    if (!config.assistant.enabled) return c.json({ error: "Assistant disabled" }, 503);
    const workflowId = c.req.param("id");
    const userId = c.get("userId") ?? "local";
    const body = (await c.req.json().catch(() => ({}))) as {
      messageId?: string;
      keepMessage?: boolean;
    };
    const messageId = body.messageId?.trim();
    if (!messageId) return c.json({ error: "messageId required" }, 400);

    const session = getOrCreateSession(workflowId, userId);
    const { checkpoint, truncated } = rollbackSession(session, messageId, {
      keepMessage: body.keepMessage !== false,
    });

    let restored = false;
    if (checkpoint?.workflow) {
      await saveWorkflow(workflowId, { ...checkpoint.workflow, id: workflowId }, userId, "assistant");
      restored = true;
    }

    return c.json({
      ok: true,
      truncated,
      restored,
      messages: session.messages,
      workflow: checkpoint?.workflow ?? null,
    });
  });

  app.get("/api/v1/assistant/health", async (c) => {
    return c.json({
      enabled: config.assistant.enabled,
      backend: config.assistant.backend,
      llmConfigured: Boolean(config.assistant.llm.apiKey),
    });
  });
}
