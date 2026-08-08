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
| `app-ansible-gallery.png` | Ansible module gallery (palette cards) |
| `app-ansible-module-form.png` | Module Form \| JSON parameters |
| `app-ansible-playbook.png` | Playbook resource + path jail |
| `app-ansible-credentials.png` | ansibleSsh / become credentials |
| `app-ansible-architecture.png` | Dual-track OpenFlow + MCP architecture |

## Regenerate

### Product UI (live app)

Requires the app at `http://localhost:3000` (Docker or `npm run dev`) and Playwright:

```sh
# from repo root
npm install
npx playwright install chromium
npm run screenshots
```

Env overrides: `APP_URL`, `WORKFLOW_ID`, `MARKETING_PORT`.

### Ansible feature illustrations (no app required)

```sh
npm run screenshots:ansible
```

Writes the `app-ansible-*.png` set from HTML mockups via Playwright.
