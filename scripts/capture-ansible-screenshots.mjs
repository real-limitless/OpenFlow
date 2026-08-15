#!/usr/bin/env node
/**
 * Capture REAL OpenFlow UI screenshots for Ansible (Playwright → live app).
 *
 *   APP_URL=https://your-openflow.example npm run screenshots:ansible
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT = join(ROOT, "website", "assets", "screenshots");
const APP_URL = (
  process.env.APP_URL ||
  process.env.OPENFLOW_SCREENSHOT_URL ||
  "http://localhost:3000"
).replace(/\/$/, "");

const DEMO_NAME = "Ansible screenshots demo";

function ensureDir(p) {
  mkdirSync(p, { recursive: true });
}

async function settle(page, ms = 800) {
  await page.waitForTimeout(ms);
  await page.evaluate(() => document.fonts?.ready ?? Promise.resolve()).catch(() => {});
}

async function shot(page, name) {
  const path = join(OUT, `${name}.png`);
  await page.screenshot({ path, type: "png", fullPage: false, animations: "disabled" });
  console.log(`  wrote ${path}`);
}

async function api(page, method, path, body) {
  const res = await page.request.fetch(`${APP_URL}${path}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    data: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* ignore */
  }
  if (!res.ok()) throw new Error(`${method} ${path} → ${res.status()} ${text.slice(0, 240)}`);
  return json;
}

async function ensureDemoWorkflow(page) {
  if (process.env.WORKFLOW_ID) return process.env.WORKFLOW_ID;
  const list = await api(page, "GET", "/api/v1/workflows");
  const existing = Array.isArray(list) ? list.find((w) => w.name === DEMO_NAME) : null;
  if (existing?.id) return existing.id;
  const created = await api(page, "POST", "/api/v1/workflows", {
    name: DEMO_NAME,
    active: false,
    nodes: [
      {
        id: "n1",
        name: "Manual Trigger",
        type: "openflow-node-base.manualTrigger",
        typeVersion: 1,
        position: [80, 200],
        parameters: {},
      },
      {
        id: "n2",
        name: "file",
        type: "openflow-node-base.ansible",
        typeVersion: 1,
        position: [360, 200],
        parameters: {
          resource: "module",
          authentication: "none",
          module: "ansible.builtin.file",
          args: {
            path: "/tmp/openflow-ansible-verify-dir",
            state: "directory",
            mode: "0755",
          },
          hosts: "localhost",
          connection: "local",
          checkMode: true,
          become: false,
          executeOnce: true,
          timeout: 120,
        },
      },
      {
        id: "n3",
        name: "Deploy site",
        type: "openflow-node-base.ansible",
        typeVersion: 1,
        position: [640, 200],
        parameters: {
          resource: "playbook",
          authentication: "none",
          playbook: "/data/ansible/playbooks/site.yml",
          extraVars: { app_version: "1.4.2", env: "staging" },
          tags: "deploy",
          checkMode: true,
          connection: "local",
          executeOnce: true,
          timeout: 300,
        },
      },
    ],
    connections: {
      "Manual Trigger": { main: [[{ node: "file", type: "main", index: 0 }]] },
      file: { main: [[{ node: "Deploy site", type: "main", index: 0 }]] },
    },
    settings: {},
  });
  return created.id;
}

async function ensureAnsibleCredential(page) {
  const list = await api(page, "GET", "/api/v1/credentials");
  const hit = Array.isArray(list) ? list.find((c) => c.type === "ansibleSsh") : null;
  if (hit) return hit;
  return api(page, "POST", "/api/v1/credentials", {
    name: "demo-ansible-ssh",
    type: "ansibleSsh",
    data: {
      host: "10.0.12.40",
      port: 22,
      username: "deploy",
      password: "demo-not-real",
      becomePassword: "demo-become",
      becomeUser: "root",
    },
  });
}

async function openEditor(page, wfId) {
  await page.goto(`${APP_URL}/workflow/${wfId}`, {
    waitUntil: "domcontentloaded",
    timeout: 90_000,
  });
  await page.waitForSelector(".react-flow__node", { timeout: 45_000 });
  await settle(page, 2500);
}

/** Click a dock tab by visible title (Nodes / Properties / Canvas / …). */
async function clickDockTab(page, title) {
  // Prefer exact short tab labels in the dock chrome
  const tabs = page.locator(".dv-default-tab, .dv-tabs-and-actions-container button, [role='tab']");
  const count = await tabs.count();
  for (let i = 0; i < count; i++) {
    const t = tabs.nth(i);
    const text = ((await t.textContent()) || "").trim();
    if (text === title || text.startsWith(title)) {
      await t.click();
      await settle(page, 500);
      return true;
    }
  }
  const fallback = page.getByText(title, { exact: true }).first();
  if (await fallback.isVisible().catch(() => false)) {
    await fallback.click();
    await settle(page, 500);
    return true;
  }
  return false;
}

async function selectNode(page, id) {
  const node = page.locator(`.react-flow__node[data-id="${id}"]`);
  await node.waitFor({ state: "visible", timeout: 15_000 });
  await node.click({ force: true });
  await settle(page, 800);
  // Properties header name field should match
  const nameField = page.locator('input').filter({ hasText: "" }).first();
  // Wait until properties show something related
  await page
    .waitForFunction(
      (want) => {
        const selected = document.querySelector(".react-flow__node.selected");
        return selected?.getAttribute("data-id") === want;
      },
      id,
      { timeout: 5_000 },
    )
    .catch(() => {});
  await settle(page, 600);
  return true;
}

async function expandAnsibleGallery(page) {
  await clickDockTab(page, "Nodes");
  const search = page.locator('input[placeholder*="Search or describe"]').first();
  await search.waitFor({ state: "visible", timeout: 10_000 });
  // Clear search so category list is full
  await search.fill("");
  await settle(page, 400);

  // Find the Ansible category collapsible trigger (badge often "Ansible18")
  const ansibleBtn = page.locator("button").filter({ hasText: /Ansible/i }).first();
  if (await ansibleBtn.isVisible().catch(() => false)) {
    await ansibleBtn.click();
    await settle(page, 500);
  }
  // Scroll palette so Ansible modules are visible
  const fileCard = page.locator("button").filter({ hasText: /ansible\.builtin\.file/i }).first();
  if (await fileCard.isVisible().catch(() => false)) {
    await fileCard.scrollIntoViewIfNeeded();
  } else {
    // try search within ansible by short name without wiping category if possible
    await search.fill("file");
    await settle(page, 1000);
  }
  await page
    .locator("text=ansible.builtin.file")
    .first()
    .waitFor({ state: "visible", timeout: 8_000 })
    .catch(() => {});
  await settle(page, 500);
}

async function main() {
  ensureDir(OUT);
  console.log(`APP_URL=${APP_URL}`);

  const health = await fetch(`${APP_URL}/health`).catch(() => null);
  if (!health?.ok) {
    console.error(`App not healthy at ${APP_URL}/health`);
    process.exit(1);
  }

  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-dev-shm-usage"],
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    colorScheme: "dark",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(25_000);

  await ensureAnsibleCredential(page);
  const wfId = await ensureDemoWorkflow(page);
  console.log(`  workflow ${wfId}`);

  // 1) Architecture / canvas overview
  await openEditor(page, wfId);
  await clickDockTab(page, "Canvas");
  const fit = page.locator(".react-flow__controls-fitview").first();
  if (await fit.isVisible().catch(() => false)) await fit.click();
  await settle(page, 700);
  await shot(page, "app-ansible-architecture");

  // 2) Gallery — expand Ansible category in Nodes palette
  await openEditor(page, wfId);
  await expandAnsibleGallery(page);
  await shot(page, "app-ansible-gallery");

  // 3) Module form — select file node, Properties panel
  await openEditor(page, wfId);
  await selectNode(page, "file");
  await clickDockTab(page, "Properties");
  await settle(page, 1000);
  // Confirm selection shows ansible module field
  const moduleLabel = page.getByText("Module", { exact: true }).first();
  if (!(await moduleLabel.isVisible().catch(() => false))) {
    // re-click node after properties focused
    await selectNode(page, "file");
    await settle(page, 1000);
  }
  const formBtn = page.locator("button", { hasText: /^Form$/ }).first();
  if (await formBtn.isVisible().catch(() => false)) await formBtn.click();
  await page.getByText("Path", { exact: false }).first().waitFor({ state: "visible", timeout: 8_000 }).catch(() => {});
  await settle(page, 800);
  await shot(page, "app-ansible-module-form");

  // 4) Playbook node
  await selectNode(page, "Deploy site");
  await clickDockTab(page, "Properties");
  await settle(page, 1200);
  await page.getByText("Playbook", { exact: false }).first().waitFor({ state: "visible", timeout: 8_000 }).catch(() => {});
  await shot(page, "app-ansible-playbook");

  // 5) Credentials — open ansible SSH credential editor
  await page.goto(`${APP_URL}/credentials`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await settle(page, 1500);
  // Prefer pencil/edit on the demo row
  const row = page.locator("tr, div, li, button").filter({ hasText: "demo-ansible-ssh" }).first();
  if (await row.isVisible().catch(() => false)) {
    const edit = row.locator("button").last();
    if (await edit.isVisible().catch(() => false)) await edit.click();
    else await row.click();
    await settle(page, 1200);
  }
  // If dialog open with host field, great
  await page.getByText(/Host|Become|ansible/i).first().waitFor({ state: "visible", timeout: 5_000 }).catch(() => {});
  await shot(page, "app-ansible-credentials");

  // 6) Editor palette hero with Ansible category open
  await openEditor(page, wfId);
  await expandAnsibleGallery(page);
  await shot(page, "app-editor-palette");

  await browser.close();
  console.log("Done — live Playwright from", APP_URL);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
