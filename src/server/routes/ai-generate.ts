import type { Hono } from "hono";
import type { AppEnv } from "../middleware/auth";
import { config } from "../../config";

const SYSTEM = `You generate JavaScript for an OpenFlow AI Transform node.
The code runs once for all input items (like Code node "Run Once for All Items").
Available helpers (same surface as Code node): $input, $json, $("NodeName"), $execution, $workflow, $env, $vars, $itemIndex, $now, $today.

Rules:
- Return ONLY JavaScript code, no markdown fences, no explanation.
- Code must return an array of items: [{ json: { ... } }, ...]
- Each item.json must be a plain object (not array or primitive).
- Prefer $input.all() for multi-item transforms.
- Do not use require(), import, fetch, or filesystem APIs.
- Keep code concise and correct.`;

function stripCodeFences(text: string): string {
  let t = text.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:javascript|js)?\s*/i, "").replace(/\s*```$/i, "");
  }
  return t.trim();
}

export default function aiGenerateRoute(app: Hono<AppEnv>) {
  app.post("/api/v1/ai/generate-transform-code", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      instructions?: string;
      sampleItems?: unknown[];
    };
    const instructions = (body.instructions ?? "").trim();
    if (!instructions) {
      return c.json({ error: "instructions required" }, 400);
    }
    if (instructions.length > 500) {
      return c.json({ error: "instructions max length is 500 characters" }, 400);
    }

    const { baseUrl, apiKey, model } = config.assistant.llm;
    if (!apiKey) {
      return c.json(
        {
          error:
            "No LLM configured. Set OPENFLOW_ASSISTANT_API_KEY or OPENAI_API_KEY to generate code.",
        },
        503,
      );
    }

    const sample =
      Array.isArray(body.sampleItems) && body.sampleItems.length > 0
        ? body.sampleItems.slice(0, 5)
        : [{ json: { example: true } }];

    const user = `Instructions:
${instructions}

Sample input items (JSON):
${JSON.stringify(sample, null, 2)}

Write the transform JavaScript now.`;

    try {
      const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: SYSTEM },
            { role: "user", content: user },
          ],
          temperature: 0.15,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        return c.json({ error: `LLM error ${res.status}: ${text.slice(0, 400)}` }, 502);
      }

      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string | null } }>;
      };
      const raw = data.choices?.[0]?.message?.content ?? "";
      const code = stripCodeFences(raw);
      if (!code) {
        return c.json({ error: "LLM returned empty code" }, 502);
      }
      return c.json({ code, codeGeneratedForPrompt: instructions });
    } catch (e) {
      return c.json(
        { error: e instanceof Error ? e.message : "Code generation failed" },
        500,
      );
    }
  });
}
