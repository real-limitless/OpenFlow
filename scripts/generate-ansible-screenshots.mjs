#!/usr/bin/env node
/**
 * Generate Ansible feature screenshots (HTML mockups → PNG via Playwright).
 * Does not require a running OpenFlow app.
 *
 *   node scripts/generate-ansible-screenshots.mjs
 */
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:http";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT = join(ROOT, "website", "assets", "screenshots");
const PORT = Number(process.env.ANSIBLE_SHOT_PORT || 4179);

const CSS = `
  :root {
    --bg: #0c0f14;
    --panel: #12161e;
    --border: #243041;
    --text: #e8eef7;
    --muted: #8b9bb0;
    --accent: #3d8bfd;
    --accent2: #22c55e;
    --warn: #f59e0b;
    --chip: #1a2230;
    --node: #18212e;
    font-family: "IBM Plex Sans", ui-sans-serif, system-ui, sans-serif;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: radial-gradient(1200px 600px at 20% -10%, #1a2740 0%, var(--bg) 55%);
    color: var(--text);
  }
  .frame {
    width: 1440px;
    height: 900px;
    padding: 28px 32px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: color-mix(in srgb, var(--panel) 92%, #000);
  }
  .brand { font-weight: 650; letter-spacing: 0.02em; }
  .brand span { color: var(--accent); }
  .pill {
    font-size: 12px;
    color: var(--muted);
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 4px 10px;
    background: var(--chip);
  }
  .layout {
    flex: 1;
    display: grid;
    gap: 14px;
    min-height: 0;
  }
  .layout.three { grid-template-columns: 280px 1fr 320px; }
  .layout.two { grid-template-columns: 1fr 380px; }
  .panel {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 14px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }
  .panel h2 {
    margin: 0;
    padding: 12px 14px;
    font-size: 12px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--muted);
    border-bottom: 1px solid var(--border);
  }
  .panel .body { padding: 12px 14px; overflow: auto; flex: 1; }
  .search {
    display: flex;
    gap: 8px;
    margin-bottom: 12px;
  }
  .search input {
    flex: 1;
    background: var(--chip);
    border: 1px solid var(--border);
    color: var(--text);
    border-radius: 8px;
    padding: 8px 10px;
    font-size: 13px;
  }
  .cat {
    font-size: 11px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--accent);
    margin: 10px 0 6px;
  }
  .item {
    display: grid;
    grid-template-columns: 28px 1fr;
    gap: 10px;
    padding: 8px;
    border-radius: 10px;
    border: 1px solid transparent;
    margin-bottom: 4px;
  }
  .item.active, .item:hover {
    border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
    background: color-mix(in srgb, var(--accent) 10%, transparent);
  }
  .ico {
    width: 28px; height: 28px; border-radius: 8px;
    display: grid; place-items: center;
    background: color-mix(in srgb, var(--accent) 18%, var(--chip));
    color: var(--accent); font-size: 14px; font-weight: 700;
  }
  .item strong { display: block; font-size: 13px; }
  .item small { color: var(--muted); font-size: 11px; font-family: ui-monospace, monospace; }
  .canvas {
    position: relative;
    background:
      radial-gradient(circle at 1px 1px, #243041 1px, transparent 0) 0 0 / 22px 22px,
      var(--panel);
  }
  .node {
    position: absolute;
    min-width: 180px;
    background: var(--node);
    border: 1px solid var(--border);
    border-radius: 12px;
    box-shadow: 0 10px 30px rgba(0,0,0,.35);
    padding: 10px 12px;
  }
  .node .title { font-size: 13px; font-weight: 600; }
  .node .sub { font-size: 11px; color: var(--muted); margin-top: 2px; font-family: ui-monospace, monospace; }
  .node .tag {
    display: inline-block; margin-top: 8px; font-size: 10px;
    padding: 2px 6px; border-radius: 999px; background: var(--chip); color: var(--accent2);
    border: 1px solid color-mix(in srgb, var(--accent2) 35%, var(--border));
  }
  .wire {
    position: absolute; height: 2px;
    background: linear-gradient(90deg, var(--accent), color-mix(in srgb, var(--accent) 20%, transparent));
    opacity: 0.75;
  }
  label.field { display: block; margin-bottom: 12px; }
  label.field span { display: block; font-size: 12px; color: var(--muted); margin-bottom: 4px; }
  label.field input, label.field select, label.field textarea {
    width: 100%;
    background: var(--chip);
    border: 1px solid var(--border);
    color: var(--text);
    border-radius: 8px;
    padding: 8px 10px;
    font-size: 13px;
  }
  .tabs { display: flex; gap: 6px; margin-bottom: 10px; }
  .tabs button {
    border: 1px solid var(--border);
    background: transparent;
    color: var(--muted);
    border-radius: 8px;
    padding: 5px 10px;
    font-size: 12px;
  }
  .tabs button.on { background: var(--chip); color: var(--text); border-color: var(--accent); }
  .notice {
    font-size: 12px; color: var(--muted); line-height: 1.4;
    border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; margin-bottom: 12px;
    background: color-mix(in srgb, var(--warn) 8%, var(--chip));
  }
  .kv { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .code {
    font-family: ui-monospace, monospace; font-size: 11px; line-height: 1.45;
    background: #0a0d12; border: 1px solid var(--border); border-radius: 10px;
    padding: 12px; color: #c8d6e5; white-space: pre;
  }
  .badge-row { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
  .badge {
    font-size: 11px; padding: 4px 8px; border-radius: 999px;
    border: 1px solid var(--border); background: var(--chip); color: var(--muted);
  }
  .badge.ok { color: var(--accent2); border-color: color-mix(in srgb, var(--accent2) 40%, var(--border)); }
  footer.note {
    font-size: 11px; color: var(--muted); text-align: right;
  }
`;

function pageShell(title, body, layoutClass = "three") {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
  <style>${CSS}</style></head><body>
  <div class="frame">
    <div class="topbar">
      <div class="brand">Open<span>Flow</span> · Ansible</div>
      <div class="pill">${title}</div>
    </div>
    <div class="layout ${layoutClass}">${body}</div>
    <footer class="note">Illustrative product UI · dual-track with ansible-flow-mcp</footer>
  </div></body></html>`;
}

const pages = {
  "app-ansible-gallery": pageShell(
    "Ansible module gallery",
    `
    <section class="panel">
      <h2>Node palette</h2>
      <div class="body">
        <div class="search"><input value="file" readonly /></div>
        <div class="cat">Ansible · ansible.builtin</div>
        <div class="item active"><div class="ico">A</div><div><strong>file</strong><small>ansible.builtin.file</small></div></div>
        <div class="item"><div class="ico">A</div><div><strong>copy</strong><small>ansible.builtin.copy</small></div></div>
        <div class="item"><div class="ico">A</div><div><strong>service</strong><small>ansible.builtin.service</small></div></div>
        <div class="cat">community.docker</div>
        <div class="item"><div class="ico">A</div><div><strong>docker_container</strong><small>community.docker.docker_container</small></div></div>
        <div class="cat">Development</div>
        <div class="item"><div class="ico">A</div><div><strong>Ansible</strong><small>openflow-node-base.ansible</small></div></div>
      </div>
    </section>
    <section class="panel canvas">
      <h2>Canvas</h2>
      <div class="body" style="position:relative;height:100%">
        <div class="node" style="left:80px;top:120px"><div class="title">Manual Trigger</div><div class="sub">trigger</div></div>
        <div class="wire" style="left:260px;top:148px;width:120px"></div>
        <div class="node" style="left:390px;top:100px">
          <div class="title">file</div>
          <div class="sub">openflow-node-base.ansible</div>
          <div class="tag">module preset</div>
        </div>
        <div class="wire" style="left:580px;top:148px;width:100px"></div>
        <div class="node" style="left:690px;top:110px"><div class="title">Set</div><div class="sub">map results</div></div>
      </div>
    </section>
    <section class="panel">
      <h2>Drop behavior</h2>
      <div class="body">
        <div class="notice">Gallery cards share one runtime type. Drop sets <code>parameters.module</code> FQCN instantly.</div>
        <div class="code">{
  "type": "openflow-node-base.ansible",
  "name": "file",
  "parameters": {
    "resource": "module",
    "module": "ansible.builtin.file"
  }
}</div>
        <div class="badge-row">
          <span class="badge ok">one executor</span>
          <span class="badge ok">many palette cards</span>
          <span class="badge">18 gallery modules</span>
        </div>
      </div>
    </section>`,
  ),

  "app-ansible-module-form": pageShell(
    "Module Form | JSON options",
    `
    <section class="panel canvas">
      <h2>Workflow</h2>
      <div class="body" style="position:relative;height:100%">
        <div class="node" style="left:120px;top:160px"><div class="title">Manual Trigger</div></div>
        <div class="wire" style="left:300px;top:188px;width:140px"></div>
        <div class="node" style="left:460px;top:140px">
          <div class="title">Ensure directory</div>
          <div class="sub">ansible.builtin.file</div>
          <div class="tag">check mode</div>
        </div>
      </div>
    </section>
    <section class="panel">
      <h2>Parameters</h2>
      <div class="body">
        <label class="field"><span>Resource</span><select><option>Module (ad-hoc)</option></select></label>
        <label class="field"><span>Module</span><input value="ansible.builtin.file" readonly /></label>
        <label class="field"><span>Authentication</span><select><option>None (local)</option></select></label>
        <div class="kv">
          <label class="field"><span>Hosts</span><input value="localhost" readonly /></label>
          <label class="field"><span>Check Mode</span><input value="true" readonly /></label>
        </div>
        <div style="margin:8px 0 6px;font-size:12px;color:var(--muted)">Module options</div>
        <div class="tabs"><button class="on">Form</button><button>JSON</button></div>
        <label class="field"><span>Path *</span><input value="/tmp/openflow-ansible-verify-dir" readonly /></label>
        <label class="field"><span>State</span><select><option>directory</option></select></label>
        <label class="field"><span>Mode</span><input value="0755" readonly /></label>
      </div>
    </section>`,
    "two",
  ),

  "app-ansible-playbook": pageShell(
    "Playbook resource + path jail",
    `
    <section class="panel canvas">
      <h2>Canvas</h2>
      <div class="body" style="position:relative;height:100%">
        <div class="node" style="left:100px;top:140px"><div class="title">Schedule</div><div class="sub">cron</div></div>
        <div class="wire" style="left:280px;top:168px;width:120px"></div>
        <div class="node" style="left:420px;top:120px">
          <div class="title">Deploy site</div>
          <div class="sub">resource: playbook</div>
          <div class="tag">ansible-playbook</div>
        </div>
        <div class="wire" style="left:620px;top:168px;width:100px"></div>
        <div class="node" style="left:740px;top:130px"><div class="title">Notify</div><div class="sub">on success</div></div>
      </div>
    </section>
    <section class="panel">
      <h2>Playbook config</h2>
      <div class="body">
        <label class="field"><span>Resource</span><select><option>Playbook</option></select></label>
        <label class="field"><span>Playbook Path *</span>
          <input value="/data/ansible/playbooks/site.yml" readonly /></label>
        <label class="field"><span>Extra Vars (JSON)</span>
          <textarea rows="4" readonly>{
  "app_version": "1.4.2",
  "env": "staging"
}</textarea></label>
        <div class="kv">
          <label class="field"><span>Limit</span><input value="web:&staging" readonly /></label>
          <label class="field"><span>Tags</span><input value="deploy,config" readonly /></label>
        </div>
        <div class="notice">Path jail: cwd, ./playbooks, /data/ansible, tmpdir + OPENFLOW_ANSIBLE_PLAYBOOK_ROOTS. Max 2MB · .yml/.yaml only.</div>
        <div class="badge-row">
          <span class="badge ok">check mode</span>
          <span class="badge ok">become + SSH</span>
          <span class="badge">result.tasks[]</span>
        </div>
      </div>
    </section>`,
    "two",
  ),

  "app-ansible-credentials": pageShell(
    "Ansible SSH + become credentials",
    `
    <section class="panel">
      <h2>Credentials</h2>
      <div class="body">
        <div class="item active"><div class="ico">🔑</div><div><strong>prod-edge-01</strong><small>ansibleSsh</small></div></div>
        <div class="item"><div class="ico">🔑</div><div><strong>lab-key</strong><small>sshPrivateKey</small></div></div>
        <div class="notice">Preferred type: <strong>ansibleSsh</strong> — host, user, password and/or private key, become password/user.</div>
      </div>
    </section>
    <section class="panel">
      <h2>Credential fields</h2>
      <div class="body">
        <div class="kv">
          <label class="field"><span>Host</span><input value="10.0.12.40" readonly /></label>
          <label class="field"><span>Port</span><input value="22" readonly /></label>
        </div>
        <label class="field"><span>Username</span><input value="deploy" readonly /></label>
        <label class="field"><span>Private Key</span><textarea rows="4" readonly>-----BEGIN OPENSSH PRIVATE KEY-----
••••••••••••••••••••••••••••••••
-----END OPENSSH PRIVATE KEY-----</textarea></label>
        <div class="kv">
          <label class="field"><span>Become Password</span><input type="password" value="********" readonly /></label>
          <label class="field"><span>Become User</span><input value="root" readonly /></label>
        </div>
      </div>
    </section>
    <section class="panel">
      <h2>Runtime</h2>
      <div class="body">
        <div class="code">temp inventory + key (0600)
  → ansible / ansible-playbook
  → cleanup temp dir
argv in runData: [redacted-path]
secrets never echoed</div>
        <div class="badge-row">
          <span class="badge ok">no shell=true</span>
          <span class="badge ok">argv only</span>
          <span class="badge ok">redacted runData</span>
        </div>
      </div>
    </section>`,
  ),

  "app-ansible-architecture": pageShell(
    "Dual-track architecture",
    `
    <section class="panel" style="grid-column: 1 / -1">
      <h2>OpenFlow canvas + ansible-flow-mcp</h2>
      <div class="body" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px">
        <div>
          <div class="cat">Shared catalog</div>
          <div class="code">gallery.json
schemas/*.json
allowlist
runner contract
golden fixtures</div>
        </div>
        <div>
          <div class="cat">OpenFlow</div>
          <div class="code">openflow-node-base.ansible
openflow-node-base.ansibleTool
palette gallery
Form | JSON
playbook resource
ansibleSsh creds</div>
        </div>
        <div>
          <div class="cat">ansible-flow-mcp</div>
          <div class="code">search_modules
get_module_schema
run_module
run_playbook
list_collections
stdio MCP</div>
        </div>
      </div>
      <div class="body" style="padding-top:0">
        <div class="notice">Agent ritual: search → schema → check → execute. Same deny list for free-form modules. Callback: ansible.posix.json</div>
        <div class="badge-row">
          <span class="badge ok">Apache-2.0 MCP</span>
          <span class="badge ok">clean-room OpenFlow</span>
          <span class="badge">docs/ansible.md</span>
        </div>
      </div>
    </section>`,
    "two",
  ),
};

async function main() {
  mkdirSync(OUT, { recursive: true });
  const serveRoot = join(ROOT, ".tmp", "ansible-shot-pages");
  mkdirSync(serveRoot, { recursive: true });
  for (const [name, html] of Object.entries(pages)) {
    writeFileSync(join(serveRoot, `${name}.html`), html);
  }

  const server = createServer((req, res) => {
    const name = decodeURIComponent((req.url || "/").split("?")[0].replace(/^\//, "") || "");
    const file = join(serveRoot, name);
    try {
      const body = readFileSync(file);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end("nf");
    }
  });
  await new Promise((r) => server.listen(PORT, "127.0.0.1", r));

  const browser = await chromium.launch({ headless: true, args: ["--disable-dev-shm-usage"] });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: "dark",
  });
  const page = await context.newPage();

  for (const name of Object.keys(pages)) {
    await page.goto(`http://127.0.0.1:${PORT}/${name}.html`, {
      waitUntil: "networkidle",
      timeout: 30_000,
    });
    await page.waitForTimeout(200);
    const path = join(OUT, `${name}.png`);
    await page.screenshot({ path, type: "png", animations: "disabled" });
    console.log("wrote", path);
  }

  await browser.close();
  await new Promise((r) => server.close(r));
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
