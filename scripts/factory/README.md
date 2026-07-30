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
| **y** | **Continue** stuck/failed job from last stage only (no full SPEC re-trial) |
| **L** | **Bypass impl.lock** + continue IMPLEMENT for this job only |
| **!** | **Steal lock** (kill current lock holder) + continue selected (confirm) |
| **r** | **Full retry** (reset → SPEC cycle 1 again) |
| **R** | Retry all failed/partial/interrupted (confirm y) |
| **k** | Kill selected pipe only (confirm y) |
| **n** | Run selected **now** full pipeline (bg — TUI stays responsive) |

`n` / `y` / `L` / `k` run in the **background** so the TUI does not freeze.
| **x** | Skip (won’t schedule until unskip) |
| **u** | Unskip |

### Factory models & parallel

| Key | Action |
|-----|--------|
| **m** | **Global** models (all jobs default) |
| **b** | **Batch / parallel**: concurrency, max cycles, impl lock, **lock wait sec** |

Settings → `scripts/factory/.jobs/settings.json`  
Job models → `scripts/factory/.jobs/nodes/<type>/models.json`  

Model resolve order: **env → job file → global models.json → catalog → defaults**.

With **impl lock ON** (default), concurrency mainly parallelizes SPEC; IMPLEMENT shows `impl-WAIT`.  

**Lock wait policy** (settings **b**):

| Policy | On wait timeout |
|--------|-----------------|
| **`waitout`** (default) | Job stays **queued** as `WAITOUT` — retries IMPLEMENT when lock free (no kill) |
| **`interrupt`** | Mark `INTERRUPTED` with reason — manual **y**/**L** |

Default wait attempt **300s**. WAITOUT jobs keep cycling until they get the lock (or **L** bypass / **!** steal).

**Interrupted reasons** shown in TUI: `impl_lock_timeout`, `killed_by_operator`, etc.

**Activity line** on running jobs: `streaming|quiet ~N tok/s · log B/s · silent Ns`  
(`tok/s` is estimated from log growth; 0 during quiet reasoning while process is still alive).

### Stage gates (no silent progression)

| After | Gate | Blocks next stage if |
|-------|------|----------------------|
| **SPEC** | `gate_spec.sh` | missing/thin spec, agent rate-limit/timeout/error |
| **IMPLEMENT** | `gate_impl.sh` | no executor/registration, agent error, missing spec |
| **VALIDATE** | `validate_node.sh` | full gates; VAL LLM skipped when gates already red |

Fails set `failedStage` + `failReason` in status (shown in TUI as `FAIL spec/rate_limit` etc.).  
Next cycle retries the **failed stage** (not a blind march forward).

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
bash scripts/factory/lib/node_ctl.sh kill      n8n-nodes-base.set
# resume stuck job from last stage only (one-shot; skips completed stages)
bash scripts/factory/lib/node_ctl.sh continue  n8n-nodes-base.set
bash scripts/factory/lib/node_ctl.sh continue  n8n-nodes-base.set --stage implement
bash scripts/factory/lib/node_ctl.sh continue  n8n-nodes-base.set --no-lock   # bypass wait
bash scripts/factory/lib/node_ctl.sh steal-lock n8n-nodes-base.set            # kill holder
bash scripts/factory/lib/node_ctl.sh run       n8n-nodes-base.set --no-lock
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
