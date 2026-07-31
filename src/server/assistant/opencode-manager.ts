import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { config } from "../../config";
import { OPENFLOW_ASSISTANT_SYSTEM } from "./system-prompt";
import type { AssistantStreamEvent } from "./builtin-agent";

let child: ChildProcess | null = null;
let baseUrl: string | null = null;
let starting: Promise<string> | null = null;

function projectOpencodeDir(): string {
  return path.resolve(process.cwd(), ".opencode/assistant");
}

async function health(url: string): Promise<boolean> {
  try {
    const res = await fetch(`${url}/global/health`, {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function ensureOpencodeServer(): Promise<string> {
  if (config.assistant.opencode.baseUrl) {
    const url = config.assistant.opencode.baseUrl.replace(/\/$/, "");
    if (await health(url)) return url;
    throw new Error(`OpenCode at ${url} is not healthy`);
  }

  if (baseUrl && (await health(baseUrl))) return baseUrl;
  if (starting) return starting;

  starting = (async () => {
    const port = config.assistant.opencode.port;
    const host = config.assistant.opencode.hostname;
    const url = `http://${host}:${port}`;
    if (await health(url)) {
      baseUrl = url;
      return url;
    }

    const bin = config.assistant.opencode.bin;
    const cwd = projectOpencodeDir();
    if (!existsSync(cwd)) {
      throw new Error(
        `OpenCode assistant project missing at ${cwd}. Create .opencode/assistant with agent config.`,
      );
    }

    child = spawn(bin, ["serve", "--port", String(port), "--hostname", host], {
      cwd,
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout?.on("data", (d) => console.log("[opencode]", String(d).trimEnd()));
    child.stderr?.on("data", (d) => console.error("[opencode]", String(d).trimEnd()));
    child.on("exit", (code) => {
      console.warn("[opencode] exited", code);
      child = null;
      baseUrl = null;
    });

    for (let i = 0; i < 40; i++) {
      await new Promise((r) => setTimeout(r, 250));
      if (await health(url)) {
        baseUrl = url;
        return url;
      }
    }
    throw new Error("Timed out waiting for OpenCode server");
  })();

  try {
    return await starting;
  } finally {
    starting = null;
  }
}

async function ocFetch(urlPath: string, init?: RequestInit) {
  const url = await ensureOpencodeServer();
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  if (config.assistant.opencode.password) {
    const user = config.assistant.opencode.username;
    const token = Buffer.from(`${user}:${config.assistant.opencode.password}`).toString("base64");
    headers.set("Authorization", `Basic ${token}`);
  }
  const res = await fetch(`${url}${urlPath}`, { ...init, headers });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenCode ${res.status}: ${text.slice(0, 400)}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

export async function createOpencodeSession(title: string): Promise<string> {
  const data = (await ocFetch("/session", {
    method: "POST",
    body: JSON.stringify({ title }),
  })) as { id?: string; data?: { id?: string } };
  const id = data.id ?? data.data?.id;
  if (!id) throw new Error("OpenCode session create returned no id");
  return id;
}

export async function ensureOpenflowMcp(
  workflowId: string,
  mcpUrl: string,
  authHeader?: string,
): Promise<void> {
  try {
    await ocFetch("/mcp", {
      method: "POST",
      body: JSON.stringify({
        name: "openflow",
        config: {
          type: "remote",
          url: mcpUrl,
          enabled: true,
          headers: {
            ...(authHeader ? { Authorization: authHeader } : {}),
            "X-OpenFlow-Workflow-Id": workflowId,
          },
        },
      }),
    });
  } catch (e) {
    console.warn("[opencode] MCP register failed (may already exist)", e);
  }
}

export async function* runOpencodeAssistant(opts: {
  sessionId: string;
  workflowId: string;
  userMessage: string;
  mcpPublicUrl: string;
}): AsyncGenerator<AssistantStreamEvent> {
  try {
    await ensureOpenflowMcp(opts.workflowId, opts.mcpPublicUrl);

    const body = {
      agent: "openflow-assistant",
      system: OPENFLOW_ASSISTANT_SYSTEM,
      parts: [{ type: "text", text: opts.userMessage }],
    };

    type Part = { type?: string; text?: string; tool?: string; state?: string };
    const data = (await ocFetch(`/session/${opts.sessionId}/message`, {
      method: "POST",
      body: JSON.stringify(body),
    })) as {
      parts?: Part[];
      info?: { error?: { message?: string } };
      data?: {
        parts?: Part[];
      };
    };

    if (data.info?.error?.message) {
      yield { type: "error", message: data.info.error.message };
      return;
    }

    const parts = data.parts ?? data.data?.parts ?? [];
    const texts: string[] = [];
    for (const p of parts) {
      if (p.type === "text" && p.text) {
        texts.push(p.text);
        yield { type: "text", text: p.text };
      }
      if (p.type === "tool" && p.tool) {
        yield {
          type: "tool_call",
          name: p.tool,
          args: {},
        };
      }
    }
    const message = texts.join("\n").trim() || "Done.";
    yield { type: "done", message };
  } catch (e) {
    yield {
      type: "error",
      message: e instanceof Error ? e.message : String(e),
    };
  }
}
