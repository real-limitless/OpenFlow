#!/usr/bin/env node
/**
 * Capture product + marketing screenshots with Playwright.
 *
 * Usage:
 *   node scripts/capture-screenshots.mjs
 *
 * Env:
 *   APP_URL       default http://localhost:3000
 *   MARKETING_URL default http://127.0.0.1:4173  (serve website/ yourself, or script starts one)
 *   WORKFLOW_ID   optional editor workflow id
 */
import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFileSync, mkdirSync, existsSync, statSync } from "node:fs";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const OUT = join(ROOT, "website", "assets", "screenshots");
const APP_URL = process.env.APP_URL || "http://localhost:3000";
const MARKETING_PORT = Number(process.env.MARKETING_PORT || 4173);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

function ensureDir(p) {
  mkdirSync(p, { recursive: true });
}

async function waitForUrl(url, attempts = 40, delayMs = 500) {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, { redirect: "manual" });
      if (res.status > 0 && res.status < 500) return true;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return false;
}

function startStaticServer(dir, port) {
  const server = createServer((req, res) => {
    try {
      let path = decodeURIComponent((req.url || "/").split("?")[0]);
      if (path === "/") path = "/index.html";
      const file = join(dir, path);
      if (!file.startsWith(dir) || !existsSync(file) || statSync(file).isDirectory()) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      const body = readFileSync(file);
      res.writeHead(200, { "Content-Type": MIME[extname(file)] || "application/octet-stream" });
      res.end(body);
    } catch (err) {
      res.writeHead(500);
      res.end(String(err));
    }
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve(server));
  });
}

async function resolveWorkflowId(page) {
  if (process.env.WORKFLOW_ID) return process.env.WORKFLOW_ID;
  try {
    const res = await page.request.get(`${APP_URL}/api/v1/workflows`);
    if (!res.ok()) return null;
    const list = await res.json();
    if (!Array.isArray(list) || list.length === 0) return null;
    // Prefer a modest graph for a clean screenshot
    const preferred =
      list.find((w) => /daily api digest/i.test(w.name || "")) ||
      list.find((w) => (w.nodeCount ?? 0) >= 3 && (w.nodeCount ?? 0) <= 12) ||
      list.find((w) => (w.nodeCount ?? 0) > 0) ||
      list[0];
    return preferred?.id ?? null;
  } catch {
    return null;
  }
}

async function shot(page, name, options = {}) {
  const path = join(OUT, `${name}.png`);
  await page.screenshot({
    path,
    type: "png",
    fullPage: false,
    animations: "disabled",
    ...options,
  });
  console.log(`  wrote ${path}`);
}

async function settle(page, ms = 800) {
  await page.waitForTimeout(ms);
  await page.evaluate(() => document.fonts?.ready ?? Promise.resolve());
}

/** App pages keep websockets/polling alive — never wait for networkidle. */
async function gotoApp(page, path, settleMs = 1500) {
  const url = path.startsWith("http") ? path : `${APP_URL}${path}`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForLoadState("load").catch(() => {});
  await settle(page, settleMs);
}

async function main() {
  ensureDir(OUT);

  const appOk = await waitForUrl(APP_URL, 6, 400);
  if (!appOk) {
    console.warn(`App not reachable at ${APP_URL} — product shots will be skipped.`);
  }

  let marketingServer = null;
  const marketingDir = join(ROOT, "website");
  marketingServer = await startStaticServer(marketingDir, MARKETING_PORT);
  const marketingUrl = `http://127.0.0.1:${MARKETING_PORT}`;
  console.log(`Marketing static server: ${marketingUrl}`);

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

  // —— Marketing (hero only — product shots carry the story) ——
  console.log("Capturing marketing site…");
  await page.goto(marketingUrl + "/", { waitUntil: "networkidle", timeout: 60_000 });
  await settle(page, 600);
  await shot(page, "marketing-hero");

  // —— Product ——
  if (appOk) {
    console.log("Capturing product UI…");

    // Home / workflow list
    await gotoApp(page, "/", 1500);
    await page.keyboard.press("Escape").catch(() => {});
    await shot(page, "app-home");

    // Templates marketplace
    await gotoApp(page, "/templates", 1800);
    await shot(page, "app-templates");

    // Projects
    await gotoApp(page, "/projects", 1200);
    await shot(page, "app-projects");

    // Credentials
    await gotoApp(page, "/credentials", 1000);
    await shot(page, "app-credentials");

    // Workflow editor
    const wfId = await resolveWorkflowId(page);
    if (wfId) {
      console.log(`  editor workflow: ${wfId}`);
      await gotoApp(page, `/workflow/${wfId}`, 2500);
      await page
        .waitForSelector(".react-flow, .react-flow__viewport, [class*='react-flow']", {
          timeout: 20_000,
        })
        .catch(() => {});
      await settle(page, 1500);
      await shot(page, "app-editor");

      // Try to open node palette if a button exists
      const paletteCandidates = [
        'button:has-text("Add node")',
        'button:has-text("Nodes")',
        '[aria-label*="palette" i]',
        'button:has-text("Insert")',
        'button:has-text("Add")',
      ];
      for (const sel of paletteCandidates) {
        const el = page.locator(sel).first();
        if (await el.isVisible().catch(() => false)) {
          await el.click().catch(() => {});
          await settle(page, 900);
          await shot(page, "app-editor-palette");
          break;
        }
      }
    } else {
      console.warn("  no workflows found — skipped editor screenshots");
    }
  }

  await browser.close();
  if (marketingServer) {
    await new Promise((r) => marketingServer.close(r));
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
