import { escapeHtml } from "../forms/html";
import type { ChatTriggerParams } from "../../lib/chat/path";

export function renderHostedChatPage(opts: {
  path: string;
  params: ChatTriggerParams;
  workflowName: string;
  embed?: boolean;
}): string {
  const title = opts.params.title.trim() || opts.workflowName || "Chat";
  const subtitle = opts.params.subtitle.trim();
  const placeholder = opts.params.inputPlaceholder.trim() || "Type a message";
  const initial = opts.params.initialMessages
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const requireButton = opts.params.requireButton;
  const embedClass = opts.embed ? " embed" : "";

  const initialJson = JSON.stringify(initial);
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: light dark; --bg:#0f1115; --fg:#e8eaed; --muted:#9aa0a6; --card:#1a1d24; --border:#2a2f3a; --primary:#6c8cff; --user:#3b5bdb; }
    @media (prefers-color-scheme: light) {
      :root { --bg:#f6f7f9; --fg:#111; --muted:#5f6368; --card:#fff; --border:#e2e5eb; --primary:#3b5bdb; --user:#3b5bdb; }
    }
    * { box-sizing: border-box; }
    body { margin:0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif; background:var(--bg); color:var(--fg); }
    .wrap { max-width:40rem; margin:0 auto; min-height:100vh; display:flex; flex-direction:column; }
    .wrap.embed { min-height:100%; max-width:100%; }
    header { padding:1.25rem 1.25rem 0.75rem; }
    h1 { font-size:1.25rem; margin:0 0 0.25rem; }
    .sub { color:var(--muted); font-size:0.85rem; margin:0; }
    #log { flex:1; overflow:auto; padding:0.75rem 1.25rem 1rem; display:flex; flex-direction:column; gap:0.5rem; }
    .msg { max-width:92%; padding:0.5rem 0.75rem; border-radius:10px; font-size:0.9rem; white-space:pre-wrap; word-break:break-word; }
    .user { align-self:flex-end; background:var(--user); color:#fff; }
    .bot { align-self:flex-start; background:var(--card); border:1px solid var(--border); }
    form { display:flex; gap:0.5rem; padding:0.75rem 1.25rem 1.25rem; border-top:1px solid var(--border); }
    textarea { flex:1; resize:none; min-height:2.6rem; border-radius:8px; border:1px solid var(--border); background:var(--card); color:var(--fg); padding:0.5rem 0.7rem; font:inherit; }
    button { background:var(--primary); color:#fff; border:0; border-radius:8px; padding:0 0.9rem; font-weight:600; cursor:pointer; }
    button:disabled { opacity:0.5; cursor:not-allowed; }
    #gate { padding:2rem 1.25rem; text-align:center; }
  </style>
</head>
<body>
  <div class="wrap${embedClass}">
    <header>
      <h1>${escapeHtml(title)}</h1>
      ${subtitle ? `<p class="sub">${escapeHtml(subtitle)}</p>` : ""}
    </header>
    ${
      requireButton
        ? `<div id="gate"><button type="button" id="start">New Conversation</button></div>`
        : ""
    }
    <div id="log" ${requireButton ? 'hidden' : ""}></div>
    <form id="f" ${requireButton ? "hidden" : ""}>
      <textarea id="t" rows="2" placeholder="${escapeHtml(placeholder)}"></textarea>
      <button type="submit" id="send">Send</button>
    </form>
  </div>
  <script>
    const PATH = ${JSON.stringify(opts.path)};
    const INITIAL = ${initialJson};
    const log = document.getElementById("log");
    const form = document.getElementById("f");
    const input = document.getElementById("t");
    const sendBtn = document.getElementById("send");
    const gate = document.getElementById("gate");
    const startBtn = document.getElementById("start");
    let sessionId = crypto.randomUUID();
    function add(role, text) {
      const el = document.createElement("div");
      el.className = "msg " + (role === "user" ? "user" : "bot");
      el.textContent = text;
      log.appendChild(el);
      log.scrollTop = log.scrollHeight;
    }
    function seed() { INITIAL.forEach((m) => add("bot", m)); }
    function openChat() {
      if (gate) gate.hidden = true;
      log.hidden = false;
      form.hidden = false;
      sessionId = crypto.randomUUID();
      log.innerHTML = "";
      seed();
      input.focus();
    }
    if (startBtn) startBtn.addEventListener("click", openChat);
    else seed();
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      input.value = "";
      add("user", text);
      sendBtn.disabled = true;
      try {
        const res = await fetch("/chat/" + encodeURIComponent(PATH), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ chatInput: text, sessionId, action: "sendMessage" }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          add("bot", body.error || ("Request failed (" + res.status + ")"));
        } else {
          add("bot", body.output || "(empty response)");
        }
      } catch (err) {
        add("bot", err && err.message ? err.message : "Network error");
      } finally {
        sendBtn.disabled = false;
        input.focus();
      }
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        form.requestSubmit();
      }
    });
  </script>
</body>
</html>`;
}
