# Product screenshots

PNG captures used by the [CORE README](../../README.md).

| File | Subject |
| --- | --- |
| `app-editor-palette.png` | Editor with node palette + assistant (hero) |
| `app-editor.png` | Canvas graph |
| `app-home.png` | Workflow list |
| `app-templates.png` | Template marketplace |
| `app-projects.png` | Projects |
| `app-credentials.png` | Credentials vault |
| `marketing-hero.png` | Marketing landing hero (optional) |

## Regenerate

Screenshots are produced on a **product branch** (`main` / `DEVELOPMENT`) with the app running and Playwright:

```sh
# on a product branch, from repo root
npm run screenshots
```

That writes into `website/assets/screenshots/`. Copy updated PNGs here when refreshing CORE docs. This `CORE` branch does not include the capture scripts.
