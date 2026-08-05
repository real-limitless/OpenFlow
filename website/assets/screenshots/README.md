# Product screenshots

PNG captures used by the [marketing site](../../) and root [README](../../../README.md).

| File | Subject |
| --- | --- |
| `app-editor-palette.png` | Editor with node palette + assistant (hero) |
| `app-editor.png` | Canvas graph without palette focus |
| `app-home.png` | Workflow list |
| `app-templates.png` | Template marketplace |
| `app-projects.png` | Projects |
| `app-credentials.png` | Credentials vault |
| `marketing-hero.png` | Marketing landing hero (optional) |

## Regenerate

Requires the app at `http://localhost:3000` (Docker or `npm run dev`) and Playwright:

```sh
# from repo root
npm install          # includes playwright
npx playwright install chromium
npm run screenshots
```

Env overrides: `APP_URL`, `WORKFLOW_ID`, `MARKETING_PORT`.

The script writes into this directory. Prefer a workflow with ~3–12 nodes for a clean editor shot (defaults to “Daily API digest” when present).
