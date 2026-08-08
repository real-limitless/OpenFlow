/**
 * Quick golden-intent checks for the semantic catalog.
 * Requires a prior `npm run catalog:reindex` (or :hash).
 */
import { suggestNodes } from "../src/lib/catalog/suggest";

const CASES: Array<{ intent: string; expectTypeIncludes: string; banTopShell?: boolean }> = [
  { intent: "clone a git repository", expectTypeIncludes: "git", banTopShell: true },
  { intent: "list github issues", expectTypeIncludes: "github", banTopShell: true },
  { intent: "send email via smtp", expectTypeIncludes: "email", banTopShell: true },
  { intent: "run arbitrary bash on the host", expectTypeIncludes: "executeCommand" },
];

let failed = 0;
for (const c of CASES) {
  const r = await suggestNodes({ intent: c.intent, limit: 5 });
  const top = r.items[0];
  const ok =
    top &&
    top.type.toLowerCase().includes(c.expectTypeIncludes.toLowerCase()) &&
    (c.banTopShell ? !top.isShell : true);
  console.log(ok ? "PASS" : "FAIL", c.intent, "→", top?.type, top?.rankTier);
  if (!ok) failed++;
}
process.exit(failed ? 1 : 0);
