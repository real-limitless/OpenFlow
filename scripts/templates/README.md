# Template libraries (multi-repo)

OpenFlow seeds the marketplace from **one or more** git repos that follow the
library layout (`workflows/{id}/workflow.json` + `meta.json`).

## Default source

Ships in `config/template-sources.json`:

- **id:** `n8n-community`
- **url:** https://github.com/real-limitless/n8n-workflow-library

## Add your own repo(s)

### Option A — local override file (recommended)

Create `config/template-sources.local.json` (gitignored):

```json
{
  "sources": [
    {
      "id": "my-team",
      "name": "My Team Templates",
      "url": "https://github.com/my-org/openflow-templates.git",
      "ref": "main",
      "enabled": true,
      "priority": 10
    }
  ]
}
```

Same `id` as the default **merges/overrides** that entry (e.g. set
`"enabled": false` on `n8n-community` to turn it off).

### Option B — environment

```bash
export OPENFLOW_TEMPLATE_SOURCES='[{"id":"acme","name":"Acme","url":"https://github.com/acme/tpl.git","ref":"main","priority":20}]'
```

### Option C — local directory (no git)

```json
{
  "sources": [
    {
      "id": "local-dev",
      "name": "Local pack",
      "dir": "../my-templates",
      "enabled": true,
      "priority": 5
    }
  ]
}
```

## In the UI

- **Marketplace** (`/templates`) — empty state offers **Load n8n-workflow-library**
- **Settings → Templates** — add/remove git repos, enable/disable, sync
- **First-time setup** (`/setup`) — optional “Load community templates” checkbox

## Sync (CLI)

```bash
export DATABASE_URL=…
npm run templates:sync

# one source only
npm run templates:sync -- --source n8n-community

# dry-run / limit
npm run templates:sync -- --dry-run --limit 20 --no-clone
```

`npm run setup` also seeds the default library unless `OPENFLOW_SKIP_TEMPLATE_SYNC=1`.

Clones land in `vendor/template-sources/{sourceId}/` (gitignored).  
Sibling checkout `../n8n-workflow-library` is auto-detected for the default id.

Legacy: `N8N_LIBRARY_REPO` / `N8N_LIBRARY_DIR` / `N8N_LIBRARY_REF` still override
the default `n8n-community` source.

## Row ids

Templates are stored as `{sourceId}:{packId}` (e.g. `n8n-community:1957`) so
two libraries can share the same pack folder name without colliding.

## Library pack layout

```
workflows/{packId}/
  workflow.json
  meta.json          # name, sourceUrl, author*, categories, nodeTypes, …
  ATTRIBUTION.txt    # recommended
catalog.json         # optional
manifest.json        # optional
```

See https://github.com/real-limitless/n8n-workflow-library for a full example.
