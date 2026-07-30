# OpenFlow node factory

Clean-room factory with **full catalog queue**, **TUI**, **per-node control**, **live LLM tails**, and **strict /tmp isolation**.

## Isolation (critical)

| Rule | Detail |
|------|--------|
| n8n npm pack | **Only** under `/tmp/openflow-factory-<runId>/…` |
| Never in git | Scripts refuse corpus paths inside the repo; `assert_no_n8n_in_repo.sh` gates |
| SPEC only | Only SPEC stage receives `CORPUS_DIR` |
| IMPLEMENT | Spec + SDK only — never corpus |
| Wipe | After SPEC, on PASS, Factory Stop, and per-node kill (that type only) |

## Pipeline (per node)

```text
1. fetch corpus → /tmp/openflow-factory-$RUNID/<type>/
2. SPEC       (TUI model) → docs/specs/nodes/<type>.md
3. wipe corpus
4. implement-wait → impl.lock (ONE implement at a time)
5. IMPLEMENT  (TUI model) → executor + tests + register
6. VALIDATE   gates + LLM
   FAIL → back to SPEC (max 3 cycles)
```

OpenCode logs are **line-buffered** into `cycle-N/*.out.log` for live TUI tails.
Timeouts default: SPEC 15m / IMPL 20m / VAL 10m.

## TUI

```bash
npm run factory:tui
```

### Factory-wide

| Key | Action |
|-----|--------|
| **S** | Start factory (pending queue) |
| **C** | Continue / resume checkpoint |
| **X** | Factory Stop (confirm y) — kill all + wipe run tmp |
| **m** | Models — full `opencode models` list |
| **q** | Quit TUI (factory keeps running) |

### Per-node

| Key | Action |
|-----|--------|
| ↑/↓ | Select pipe |
| **Enter** | **LIVE** log view (opens at **bottom**, follow on) |
| **M** | **Job models** — SPEC/IMPL/VAL for this type only (`★` in list) |
| **c** (in job models) | Clear job overrides (back to global) |
| **r** | Retry selected (reset → re-queue) |
| **R** | Retry all failed/partial/interrupted (confirm y) |
| **k** | Kill selected pipe only (confirm y) |
| **n** | Run selected **now** (uses job models if set) |
| **x** | Skip (won’t schedule until unskip) |
| **u** | Unskip |

### Factory models & parallel

| Key | Action |
|-----|--------|
| **m** | **Global** models (all jobs default) |
| **b** | **Batch / parallel**: concurrency (1–8), max cycles (1–5), impl lock |

Settings → `scripts/factory/.jobs/settings.json`  
Job models → `scripts/factory/.jobs/nodes/<type>/models.json`  

Model resolve order: **env → job file → global models.json → catalog → defaults**.

With **impl lock ON** (default), concurrency mainly parallelizes SPEC; IMPLEMENT shows `impl-WAIT`.

### Live logs

| Key | Action |
|-----|--------|
| **G** / **End** | Jump **bottom** + enable live follow |
| **g** / **Home** | Jump **top**; follow off |
| **Space** | Toggle follow LIVE/PAUSED |
| **1 / 2 / 3 / 0** | Pin SPEC / IMPL / VAL / auto stage |
| **4** | Gate log |
| Scroll up | Auto-pauses follow |

Bottom strip on the main list shows the selected node’s latest LLM tool lines without opening full view.

### Filters

| Key | Filter |
|-----|--------|
| **p** | pending |
| **e** | running |
| **f** | failed |
| **s** | skipped |
| **a** | all |
| **/** | search |

## CLI (per-node)

```bash
bash scripts/factory/lib/node_ctl.sh status  n8n-nodes-base.set
bash scripts/factory/lib/node_ctl.sh reset   n8n-nodes-base.set
bash scripts/factory/lib/node_ctl.sh kill    n8n-nodes-base.set
bash scripts/factory/lib/node_ctl.sh run     n8n-nodes-base.set
# one job + specific models (also saved as job overrides)
bash scripts/factory/lib/node_ctl.sh run n8n-nodes-base.httpRequest \
  --spec opencode-go/grok-4.5 \
  --impl opencode-go/kimi-k2.7-code \
  --val xai/grok-4.5
bash scripts/factory/lib/node_ctl.sh models n8n-nodes-base.set --impl featherless/zai-org/GLM-5.2
bash scripts/factory/lib/node_ctl.sh models-clear n8n-nodes-base.set
bash scripts/factory/lib/node_ctl.sh skip|unskip <type>
bash scripts/factory/lib/node_ctl.sh retry-all-failed

# parallel settings
python3 scripts/factory/lib/resolve_models.py settings-set --concurrency 4 --max-cycles 3 --impl-lock on
FACTORY_CONCURRENCY=4 npm run factory:start
```

## Factory CLI

```bash
npm run factory:start
npm run factory:resume
npm run factory:stop
npm run factory:status
FACTORY_DRY_RUN=1 npm run factory:start -- --dry-run
```

## Models

Persisted: `scripts/factory/.jobs/models.json` (TUI **m**).

```bash
FACTORY_MODEL_SPEC=…
FACTORY_MODEL_IMPL=…
FACTORY_MODEL_VAL=…
```

## Checkpoint layout

```text
scripts/factory/.jobs/
  run-state.json
  models.json
  factory.log
  impl.lock / impl.lock.holder
  nodes/<type>/
    status.json          # stage, pids, stageLog, model
    pipeline.pid
    opencode.pid
    heartbeat
    cycle-N/
      01-spec.out.log      # LIVE tail source
      02-implement.out.log
      03-validate.out.log
      gate.log
```

## Layout

```text
scripts/factory/
  tui.py
  run_queue.sh
  lib/
    node_ctl.sh            # per-node control
    run_node_pipeline.sh
    queue_worker.sh
    run_state.py
    …
```
