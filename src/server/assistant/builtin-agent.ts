import { config } from "../../config";
import { OPENFLOW_MCP_TOOLS, callOpenflowTool } from "../mcp/tools";
import { OPENFLOW_ASSISTANT_SYSTEM } from "./system-prompt";

export type AssistantStreamEvent =
  | { type: "text"; text: string }
  | { type: "tool_call"; name: string; args: Record<string, unknown> }
  | { type: "tool_result"; name: string; result: unknown; isError?: boolean }
  | { type: "done"; message: string }
  | { type: "error"; message: string };

type ChatMessage =
  | { role: "system" | "user" | "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

type ToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

function openaiTools() {
  return OPENFLOW_MCP_TOOLS.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema,
    },
  }));
}

async function chatCompletion(messages: ChatMessage[]): Promise<{
  content: string | null;
  tool_calls?: ToolCall[];
}> {
  const { baseUrl, apiKey, model } = config.assistant.llm;
  if (!apiKey) {
    throw new Error(
      "No LLM configured. Set OPENFLOW_ASSISTANT_API_KEY (or OPENAI_API_KEY), or use backend=opencode with a running OpenCode server.",
    );
  }

  const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      tools: openaiTools(),
      tool_choice: "auto",
      temperature: 0.2,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LLM error ${res.status}: ${text.slice(0, 500)}`);
  }

  const data = (await res.json()) as {
    choices?: Array<{
      message?: { content?: string | null; tool_calls?: ToolCall[] };
    }>;
  };
  const msg = data.choices?.[0]?.message;
  if (!msg) throw new Error("LLM returned empty response");
  return { content: msg.content ?? null, tool_calls: msg.tool_calls };
}

export async function* runBuiltinAssistant(opts: {
  workflowId: string;
  userId: string;
  userMessage: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  maxSteps?: number;
}): AsyncGenerator<AssistantStreamEvent> {
  const maxSteps = opts.maxSteps ?? config.assistant.maxSteps;
  const messages: ChatMessage[] = [
    { role: "system", content: OPENFLOW_ASSISTANT_SYSTEM },
    ...(opts.history ?? []).map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    })),
    { role: "user", content: opts.userMessage },
  ];

  let finalText = "";

  for (let step = 0; step < maxSteps; step++) {
    let response: { content: string | null; tool_calls?: ToolCall[] };
    try {
      response = await chatCompletion(messages);
    } catch (e) {
      yield { type: "error", message: e instanceof Error ? e.message : String(e) };
      return;
    }

    if (response.tool_calls?.length) {
      messages.push({
        role: "assistant",
        content: response.content,
        tool_calls: response.tool_calls,
      });

      for (const tc of response.tool_calls) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(tc.function.arguments || "{}") as Record<string, unknown>;
        } catch {
          args = {};
        }
        yield { type: "tool_call", name: tc.function.name, args };

        try {
          const result = await callOpenflowTool(
            opts.workflowId,
            opts.userId,
            tc.function.name,
            args,
          );
          yield { type: "tool_result", name: tc.function.name, result };
          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: JSON.stringify(result),
          });
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          yield { type: "tool_result", name: tc.function.name, result: message, isError: true };
          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: JSON.stringify({ error: message }),
          });
        }
      }
      continue;
    }

    finalText = response.content?.trim() || "Done.";
    if (finalText) yield { type: "text", text: finalText };
    yield { type: "done", message: finalText };
    return;
  }

  finalText = "Stopped after max tool steps. Ask me to continue if needed.";
  yield { type: "text", text: finalText };
  yield { type: "done", message: finalText };
}
