# Product screenshots

PNG captures used by the [marketing site](../../) and root [README](../../../README.md).

| File | Subject |
| --- | --- |
| `app-editor-palette.png` | Editor with node palette (often Ansible category) |
| `app-editor.png` | Canvas graph without palette focus |
| `app-home.png` | Workflow list |
| `app-templates.png` | Template marketplace |
| `app-projects.png` | Projects |
| `app-credentials.png` | Credentials vault |
| `marketing-hero.png` | Marketing landing hero (optional) |
| `app-ansible-gallery.png` | **Live** Ansible palette category + modules |
| `app-ansible-module-form.png` | **Live** file node + Form module options |
| `app-ansible-playbook.png` | **Live** playbook resource parameters |
| `app-ansible-credentials.png` | **Live** credentials page (ansibleSsh demo) |
| `app-ansible-architecture.png` | **Live** canvas with Ansible nodes |

## Regenerate (Playwright → real UI)

Requires a running OpenFlow instance and Playwright Chromium.

```sh
# from repo root
npx playwright install chromium

# General product shots
APP_URL=https://your-openflow.example npm run screenshots

# Ansible feature shots (creates/reuses "Ansible screenshots demo" workflow)
APP_URL=https://your-openflow.example npm run screenshots:ansible
```

| Env | Meaning |
| --- | --- |
| `APP_URL` / `OPENFLOW_SCREENSHOT_URL` | OpenFlow base URL (must expose `/health` + API) |
| `WORKFLOW_ID` | Optional fixed workflow for editor shots |
| `MARKETING_PORT` | Local static server port for marketing hero |

Ansible captures hit the **real** editor (dock Nodes/Properties, React Flow node `data-id`, credentials list). They are not HTML mockups.
