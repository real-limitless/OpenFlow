# Production dependency audit

OpenFlow production install (`npm audit --omit=dev`) was audited on `DEVELOPMENT` at `e5dd9362` and again on this branch after the upgrades below. Dev-only packages are out of scope for the counts.

## Counts

| Severity | Before | After |
| --- | ---: | ---: |
| Critical | 9 | 0 |
| High | 13 | 0 |
| Moderate | 3 | 0 |
| Low | 0 | 0 |
| Total | 25 | 0 |

`npm audit --omit=dev` exits 0 after the changes. The check workflow runs the same audit at `--audit-level=critical`, so the job fails when a critical production advisory is present and keeps going when only high or lower advisories remain.

## What changed

Non-breaking upgrades were applied first. Transitive packages with no fixed parent release are pinned in `package.json` `overrides`, staying inside the range those parents already accept. Two direct dependencies needed a major bump because no patched release exists on the previous major. The database schema was not changed.

| Package | Kind | Before | After | Why |
| --- | --- | --- | --- | --- |
| `@tanstack/react-start` | direct | 1.168.32 | 1.169.4 | Critical reflected XSS in server-function responses. Fixed after 1.168.59. |
| `@tanstack/react-router` | direct | 1.170.18 | 1.170.46 | Aligned with the router version start 1.169.4 depends on. |
| `seroval` | transitive (start / router) | 1.5.6 | 1.7.1 | Critical deserialization advisories through 1.6.2. Override stays inside `^1.5.4`. |
| `dompurify` | transitive (`monaco-editor`) | 3.4.8 | 3.4.17 | Critical and high sanitizer advisories through 3.4.16. Patch override. |
| `simple-git` | direct | 3.36.0 | 4.0.2 | Critical command-execution advisories. The patched release is 4.0.2, so this is a major bump. Call sites still use `simpleGit()`, `.env()`, and the existing unsafe-option flags. |
| `@simple-git/argv-parser` | transitive (`simple-git`) | 1.1.1 | 2.0.1 | Comes with `simple-git` 4.0.2. |
| `basic-ftp` | direct | 6.0.2 | 6.2.3 | High CPU denial of service in the directory-listing parser (`<=6.2.0`). |
| `nodemailer` | direct | 9.0.3 | 10.2.1 | High parser denial of service and several moderate delivery bugs. Every 9.x release and 10.0.0 through 10.0.9 are affected, so this is a major bump. `createTransport` / `sendMail` usage is unchanged. Requires Node `>=20`; OpenFlow already requires Node `>=22`. |
| `sharp` | direct | 0.35.3 | 0.35.5 | High advisories in image libraries through `0.35.5-rc.1`. `0.35.5` is the first fixed stable release. |
| `vite` | direct devDependency, also required by production packages | 8.1.5 | 8.1.6 | High editor-launch and file-serving advisories on 8.0.0 through 8.1.5. Pinned to the minimum patched 8.1 release rather than 8.2 or 8.3. |
| `prisma`, `@prisma/client`, `@prisma/adapter-pg` | client is direct; CLI is a devDependency pulled into the production tree by the client | 7.9.1 | 7.10.1 | High findings through 7.10.0. 7.10.1 is the first fixed 7.x release. The 8.0 prereleases are still inside the advisory range and were not used. |
| `deepmerge-ts` | transitive (`@prisma/config`) | 7.1.5 | 8.0.2 | High stack exhaustion below 8.0.0. `prisma` 7.10.1 pins 8.0.2, so this major is the fixed parent release, not a separate override. |
| `mysql2` | direct, plus an older copy nested under `prisma` | direct 3.23.2; nested 3.15.3 | 3.24.4 | The nested 3.15.3 copy was high (`<=3.23.0`). The direct 3.23.2 copy was already outside that range. `prisma` 7.10.1 depends on 3.24.4, and the tree deduped to that single copy, which still satisfies `^3.23.2`. |
| `fast-uri` | transitive (`ajv`) | 3.1.4 | 3.1.9 | High host-confusion and request-forgery advisories on 3.0.0 through 3.1.7. Override stays on 3.x because `ajv` depends on `^3.0.1`. |
| `js-yaml` | transitive (`xmlbuilder2` in production) | 4.3.0 | 4.3.2 | High CPU advisories on 4.0.0 through 4.3.1. Override stays on 4.x because dependents require `^4`. |
| `nanoid` | transitive (`postcss`) | 3.3.16 | 3.3.20 | High unbounded loop below 3.3.18. Override stays on 3.x because `postcss` depends on `^3.3.16`. |
| `source-map-js` | transitive (`postcss`, `@tailwindcss/node`) | 1.2.1 | 1.2.2 | High event-loop denial of service on 1.0.0 through 1.2.1. |
| `xlsx` | direct | 0.18.5 | 0.20.3 | High prototype pollution (`<0.19.3`) and regular-expression denial of service (`<0.20.2`). The registry has no release newer than 0.18.5 (`fixAvailable: false`). The dependency is the vendored 0.20.3 tarball (`file:vendor/xlsx-0.20.3.tgz`) so the `xlsx` import and read/write calls stay the same. |
| `hono` | direct | 4.12.32 | 4.13.13 | Moderate only. Upgraded inside the existing 4.x range. |
| `ip-address` | transitive (`socks`) | 10.4.0 | 10.7.4 | Moderate only. Override to the patched 10.7.4 release, still inside `^10`. |
| `monaco-editor` | transitive (`@monaco-editor/react`) | 0.56.0 | 0.56.0 | Moderate only, and only because of `dompurify`. Cleared by the `dompurify` override. A newer editor release still depended on a vulnerable `dompurify`, so the editor was not bumped. |

`@tanstack/react-router` 1.170.46 types the root error boundary's `error` as `unknown`. `src/routes/__root.tsx` narrows that value before reading `message` and `stack`. That keeps the full typecheck count flat. The existing `@tanstack/router-plugin` range also resolved from 1.168.23 to 1.168.48.

## Remaining findings

No critical, high, or moderate production advisories remain.

`npm audit` without `--omit=dev` still reports 4 dev-only advisories (2 high, 2 moderate, 0 critical). They are outside the production install and were not changed:

| Package | Severity | Installed | Why it remains |
| --- | --- | --- | --- |
| `playwright` | high | devDependency `^1.51.0` | Direct devDependency. A bump can change the browser test runner. Not in the production tree. |
| `brace-expansion` | high | transitive dev | Not reachable from production dependencies. |
| `vitest` | moderate | devDependency `^4.1.10` | Test runner only. |
| `@vitest/mocker` | moderate | transitive of `vitest` | Test runner only. |

Follow-up for the production tree:

- `.github/dependabot.yml` requests weekly npm updates, with minor and patch updates grouped and at most 5 open npm update requests. Workflow action updates and container-file updates are weekly as well.
- The check workflow runs `npm audit --omit=dev --audit-level=critical` after `npm ci`. A critical production advisory fails the job. High and lower do not.

## App checks

Counts were measured on `DEVELOPMENT` (`e5dd9362`) and on this branch after `npm ci`. The cited typecheck baseline of 618 is `npm run typecheck:ci`. The cited lint baseline of 224 is `npx eslint src/server src/sdk src/config.ts` (the check workflow's lint step). Full `npm run typecheck` on this checkout is 1299 errors on both sides. None of these counts increased.

| Check | DEVELOPMENT | This branch |
| --- | ---: | ---: |
| `npm ci` | success | success |
| `npm run build` | not re-run | success |
| `npm run typecheck` errors | 1299 | 1299 |
| `npm run typecheck:ci` errors | 618 | 618 |
| eslint `src/server` `src/sdk` `src/config.ts` errors | 224 | 224 |
| `npm test` failures | 121 (given baseline) | 121 failed, 6948 passed, 62 skipped |
