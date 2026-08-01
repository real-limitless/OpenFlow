# n8n.io public workflow scraper + TUI

Fully automated tooling for public workflows on [n8n.io/workflows](https://n8n.io/workflows/).

| Entry | Use |
| --- | --- |
| **`tui.py`** | Factory-style TUI: scan → cherry-pick → queue → agents |
| **`queue_worker.py`** | Background scrape agents (started from TUI or CLI) |
| **`scrape_workflows.py`** | One-shot CLI scrape (all / filters / ids) |

## Mental model

1. **Surf / scan** — walk categories, products (`?integrations=`), nodes, or search; catch **addresses** (id + public URL).  
2. **Cherry-pick** — multi-select from the address list.  
3. **Enqueue** — factory-like job queue.  
4. **Launch agents** — concurrent workers pull `meta.json` + `workflow.json` (+ HTML).  
5. Optional **SOCKS5** pool (Databay free list).

### Full-library scan (parallel pages)

A previous bug used **random page sizes**, which breaks offset pagination and only collected ~5–6k of ~11k workflows. Scans now use a **fixed** `scanRows` (default 100) and **parallel page workers** (default 10), optionally over SOCKS5.

| Setting | Default | Meaning |
| --- | --- | --- |
| `scanParallel` | true | Fan out page fetches |
| `scanWorkers` | 10 | Concurrent page agents |
| `scanRows` | 100 | Fixed page size (do not randomize) |
| `scanUseProxy` | true | Use SOCKS5 pool for page scan |
| `scanMinDelay` / `scanMaxDelay` | 0.15 / 0.55 | Per-request jitter for scan workers |

In the TUI: **SETTINGS** to tune, **PROXIES → R** refresh list, then **SCAN → 1 (all) → Enter**.

CLI full catalog address list only (no detail download):

```bash
python scrape_workflows.py --parallel-scan --scan-workers 12 --scan-rows 100 \
  --limit 0 --ids '' --skip-warm  # still downloads; for scan-only use TUI
```

Or from TUI scan-all, then **LIST → E** enqueue all → **S** start worker.

## Setup

```bash
cd scripts/scrape-n8n-workflows
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## TUI (recommended)

```bash
python tui.py
```

### Screens (Tab to cycle)

| Mode | What |
| --- | --- |
| **SCAN** | Pick source: all / category / apps / nodes / search / id → Enter |
| **LIST** | Address list from last scan; Space to select; `e` enqueue |
| **QUEUE** | Job stages; `S` start worker; `X` stop |
| **PROXIES** | Refresh Databay SOCKS5; health-check; toggle `useProxy` |
| **SETTINGS** | Concurrency, delays, HTML, out dir |
| **LOG** | Tail `worker.log` |

### Key bindings (summary)

| Key | Action |
| --- | --- |
| `1`–`6` | SCAN sources: all, category, apps, nodes, search, id |
| `Enter` | Run scan (SCAN) / edit setting |
| `Space` | Toggle cherry-pick (LIST) |
| `a` / `A` | Select all / clear (LIST) |
| `e` / `E` | Enqueue selected / entire scan |
| `n` | Enqueue high-priority + start worker |
| `S` / `X` | Start / stop queue worker |
| `R` | Reload facets (SCAN) or refresh proxies |
| `H` | Health-check SOCKS5 sample |
| `t` | Toggle `useProxy` |
| `?` | Help |
| `q` | Quit TUI (**worker keeps running**) |

### Product / integration filter

Site URL:

`https://n8n.io/workflows/?integrations=Google+Sheets`

In the TUI: **SCAN → 3 (apps) → Google Sheets → Enter**.

API param used under the hood: `apps=Google Sheets`.

## Queue worker (headless)

```bash
# drain queue (stays idle until empty cycles; Ctrl-C to stop)
python queue_worker.py

# process until queue empty then exit
python queue_worker.py --once
```

Jobs live under `scripts/scrape-n8n-workflows/.jobs/`:

```
.jobs/
  settings.json
  queue.jsonl
  run-state.json
  worker.pid / worker.log
  scans/{scanId}.jsonl
  status/{id}.json
  proxies/socks5.txt
```

Artifacts:

```
.scraped/n8n-workflows/workflows/{id}/
  meta.json
  workflow.json
  page.html
  page_meta.json
  body.txt
```

## CLI (one-shot)

```bash
# single id
python scrape_workflows.py --ids 8237

# product filter
python scrape_workflows.py --apps "Google Sheets" --limit 20 --no-html

# category
python scrape_workflows.py --category AI --limit 10
```

## SOCKS5 proxies

Default list: [databay.com free SOCKS5](https://databay.com/free-proxy-list/socks5.txt)

```bash
# In TUI: PROXIES → R refresh → H health-check → t enable useProxy
```

Or settings:

```json
{
  "useProxy": true,
  "proxyUrl": "https://databay.com/free-proxy-list/socks5.txt",
  "proxyFallbackDirect": true
}
```

Free lists are often dead/slow. Health-check first; if the pool is empty agents can fall back to direct when `proxyFallbackDirect` is true.

## Stealth defaults

- Rotating browser User-Agents / headers  
- Random delays + occasional long pauses  
- Shuffled queue claim order  
- Resume-safe (skips complete downloads)

## Notes

- Public pages only under `https://n8n.io/workflows/…`  
- Scraped dumps are gitignored (`.scraped/`, `.jobs/` recommended local-only)  
- Respect n8n ToS; personal/research use of public templates
