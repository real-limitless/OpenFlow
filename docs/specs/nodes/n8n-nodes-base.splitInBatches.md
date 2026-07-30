---
type: n8n-nodes-base.splitInBatches
displayName: Loop Over Items (Split in Batches)
category: Flow
versions: [1, 2, 3]
priority: high
status: specced
---

# Loop Over Items (Split in Batches)

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.splitinbatches.md | Public docs only |
| https://docs.n8n.io/build/flow-logic/loop.md | Public docs only |
| Public workflow export JSON / published node descriptors (type string, parameter names, defaults, output labels) | Public workflow JSON / descriptor metadata only |

## Wire format

- **Type string:** `n8n-nodes-base.splitInBatches`
- **Aliases (UI):** historically **Split In Batches**; current display name **Loop Over Items** / **Loop Over Items (Split in Batches)** (**documented** + descriptor)
- **Group / category:** organization / Flow · Core Nodes
- **Versions:** `1`, `2`, `3` — public examples and current UI target **typeVersion 3**
- **Inputs:** `main` × 1
- **Outputs:** version-dependent (see below)
- **Credentials:** (none)

### Outputs by typeVersion

| typeVersion | Outputs | Labels (descriptor order = output index) |
|-------------|---------|------------------------------------------|
| **3** (current) | `main` × 2 | **output[0] = `done`**, **output[1] = `loop`** (**inferred** from published descriptor + public RSS example connections: loop branch is index **1**) |
| **2** | `main` × 2 | **output[0] = `loop`**, **output[1] = `done`** (**inferred** — labels swapped vs v3) |
| **1** | `main` × 1 | single output only (**inferred**); multi-branch loop/done model is v2+ |

> **Import rule:** map connections by **typeVersion**. Do not assume v2 index order on v3 graphs. Public docs name the branches **loop** and **done** without stating numeric indices; indices come from descriptor + export JSON.

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| splitInBatchesNotice | notice | `""` | no | — | UI-only tip that many nodes already iterate items; not runtime (**inferred** descriptor) |
| batchSize | number | **v3: `1`**; **v1/v2: `10`** | no | — | Items emitted per **loop** iteration; min **1** (**documented** concept; defaults/min **inferred** descriptor) |
| options | collection | `{}` | no | — | Nested options |
| options.reset | boolean | `false` | no | — | When true (or expression truthy), treat current input as a **new** item set and re-initialize batching instead of continuing prior leftover state (**documented**). Expression mode allowed for conditional reset (**documented**) |

No other runtime parameters on the public page.

## Runtime behavior

### Role

Chunk a saved list of input items into batches of size `batchSize`, emit each batch on the **loop** branch for downstream work, and when every original item has been batched (and the loop body has finished feeding results back), emit the **combined processed results** on **done**. Used when automatic per-item node execution is not enough (rate limits, nodes that only consume the first item, pagination with reset, etc.) (**documented**).

### Engine model (multi-run / loop-back)

Public docs describe **stateful, multi-activation** behavior:

1. **First activation (seed):** node receives the full item list on `main` input 0. It **stores** that original list as the work queue (**documented**: “saves the original incoming data”).
2. **Each loop iteration:** emit the next `batchSize` items from the remaining queue on the **loop** output. Downstream nodes process that batch. Their output is typically wired **back** into this node’s input (and/or into further nodes that eventually reconnect).
3. **Continuation activations:** on later runs, the node advances through the stored queue (unless **reset**). It does **not** treat every inbound payload as a brand-new full list unless reset says so (**documented** reset semantics).
4. **Completion:** when no items remain to batch, stop emitting on **loop** and emit on **done**. Docs: when execution completes, the node **combines all of the processed data** and returns it on **done** — i.e. **done** carries **aggregated results of the loop body**, not merely “unprocessed leftovers” (**documented**).
5. **No IF required** solely to drain the queue: the node stops after all incoming items are divided into batches and passed on (**documented** on loop.md). Pagination-style loops that **reset** still need an external termination condition (e.g. IF) to avoid infinite loops (**documented** warning).

### Context helpers (expressions)

Public docs document node context fields (name of the node in the expression is the canvas name, e.g. `"Loop Over Items"`):

| Context key | Meaning |
|-------------|---------|
| `noItemsLeft` | `true` when no further batches remain; `false` while more items are left (**documented**) |
| `currentRunIndex` | zero-based (or engine-defined) index of the current loop run (**documented**) |

OpenFlow must expose equivalent context for expression compatibility when the runner supports multi-run loops (**documented** surface; storage shape **inferred**).

### Input

Items on `main` index 0: `{ json, binary?, pairedItem? }[]`.

- **Seed run:** full list to batch.
- **Loop-back run:** items returning from the loop body (processed batch results) and/or empty/partial signals depending on graph wiring — exact pairing of “results to accumulate for done” vs “advance queue” is **partially documented**; treat as: queue advances over the **saved original list**; **done** aggregates **processed** items from the loop path (**documented** intent).

### Output (typeVersion 3)

| Index | Label | When empty | When non-empty |
|-------|-------|------------|----------------|
| **0** | `done` | While iterations remain (loop still active) | After all batches processed: **combined processed data** from the loop (**documented**) |
| **1** | `loop` | When finished (no batch this run) | Current batch of up to `batchSize` items from the saved queue (**documented**) |

**typeVersion 2:** same two branches with **indices swapped** (`loop` = 0, `done` = 1) (**inferred**).

**typeVersion 1:** single `main` output — historical; prefer v3 semantics for new work (**inferred**).

### Batching rules

1. `batchSize = max(1, floor(number))`; invalid/non-positive → treat as **1** (**inferred** clamp; minValue 1 in descriptor).
2. Batches are **contiguous slices** of the saved item list in input order (**inferred**).
3. Last batch may be shorter than `batchSize` (**inferred**).
4. Empty seed input → no loop batches; **done** empty (or empty both outputs) — not an error (**inferred**).
5. `batchSize` ≥ item count → one loop emission with all items, then completion/**done** on the appropriate subsequent activation (**inferred** multi-run); single-activation engines must document their approximation (below).

### Reset (`options.reset`)

- **false (default):** continue batching the previously saved item set across activations (**documented**).
- **true / expression true:** discard prior batch cursor / saved set and **re-initialize** from the **current** input items as a new set (**documented**). Used with IF + pagination when each page is a new dataset (**documented** example pattern).
- Expression evaluation of reset is supported (**documented**).

### Errors

- Invalid `batchSize` → clamp, do not throw (**inferred**).
- Infinite loop risk is a **workflow design** issue when reset + no exit condition (**documented**); runtime may impose a max-iteration guard (**OpenFlow policy**, not public-doc mandated).
- `continueOnFail`: no special dual-output error channel (**inferred**).

### Expressions

- `batchSize` and `options.reset` accept expressions (**documented** for reset; batch size **inferred**).
- Context: `$("NodeName").context["noItemsLeft"]`, `$("NodeName").context["currentRunIndex"]` (**documented**).

### OpenFlow single-pass approximation (implementation gap)

A runner that executes each node **once** per workflow pass cannot fully realize multi-activation loop-back. Documented contract for a **full** engine remains multi-run. Acceptable **partial** single-pass behavior for import/smoke (must be labeled partial in executor comments / gaps):

1. Prefer **typeVersion 3** index order: **done = output[0]**, **loop = output[1]**.
2. On one shot with input `items` and size `B`:
   - **loop** ← `items.slice(0, B)`
   - If more remain: **done** ← `[]` on this activation (full engine would only fill **done** after all iterations with **processed** results). Emitting **remaining raw items** on **done** is a **non-compatible shortcut** and must not be treated as doc-faithful.
   - If no more remain: **loop** ← all items; **done** ← same batch or `[]` until loop-back accumulation exists — **gap**.
3. `options.reset` and context keys are no-ops or static until multi-run state exists (**gap**).

## Acceptance tests

Fixtures use **typeVersion 3** output order: `output[0] = done`, `output[1] = loop`.

### Test: first batch only (items remain)

**Given** input items:

```json
[
  { "json": { "i": 1 } },
  { "json": { "i": 2 } },
  { "json": { "i": 3 } },
  { "json": { "i": 4 } },
  { "json": { "i": 5 } }
]
```

**Parameters:**

```json
{ "batchSize": 2 }
```

**typeVersion:** `3`

**Expect** (first activation, multi-run engine):

- **output[0] done:** `[]`
- **output[1] loop:**

```json
[
  { "json": { "i": 1 } },
  { "json": { "i": 2 } }
]
```

- Context: `noItemsLeft === false`, `currentRunIndex` is first run (**documented** keys; exact index base **inferred** as `0`)

### Test: exact single batch then done (multi-run sketch)

**Given** input items:

```json
[
  { "json": { "i": 1 } },
  { "json": { "i": 2 } }
]
```

**Parameters:**

```json
{ "batchSize": 2 }
```

**typeVersion:** `3`

**Expect** activation 1 (seed):

- **loop:** both items
- **done:** `[]` (still finishing / awaiting loop body — **inferred** timing; some engines may complete in one step if no further queue)

**Expect** final activation after loop body returns processed items `P` (example processed shape):

- **loop:** `[]`
- **done:** combined processed items `P` (**documented** “combines all of the processed data”)

> Exact interleaving of “last batch on loop” vs “done only” across runs is **partially inferred**; tests should lock once the OpenFlow multi-run runner defines activation boundaries.

### Test: batch size 1

**Given** input items:

```json
[
  { "json": { "url": "https://a.example" } },
  { "json": { "url": "https://b.example" } }
]
```

**Parameters:**

```json
{ "batchSize": 1, "options": {} }
```

**typeVersion:** `3`

**Expect** first activation:

- **done:** `[]`
- **loop:** `[ { "json": { "url": "https://a.example" } } ]`

(Matches public RSS tutorial: batch size 1, process one URL per loop iteration.)

### Test: empty input

**Given** input items:

```json
[]
```

**Parameters:**

```json
{ "batchSize": 10 }
```

**typeVersion:** `3`

**Expect:**

- **done:** `[]`
- **loop:** `[]`

### Test: reset re-seeds (behavioral)

**Given** prior internal queue still had leftovers, and new input:

```json
[
  { "json": { "page": 2 } }
]
```

**Parameters:**

```json
{
  "batchSize": 1,
  "options": { "reset": true }
}
```

**typeVersion:** `3`

**Expect:** node abandons previous leftovers and batches from the new input only (**documented**). First emission **loop** = the new page item(s); without reset, behavior would continue the old queue (**documented** contrast).

### Test: v2 output index swap (import)

**Given** same five items as test 1, `batchSize: 2`, **typeVersion `2`**.

**Expect** first activation:

- **output[0] loop:** first 2 items
- **output[1] done:** `[]` (while running)

(Wire labels swapped vs v3 — **inferred** descriptor.)

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Display name Loop Over Items / type `splitInBatches` | documented | |
| batchSize meaning | documented | defaults 1 (v3) vs 10 (v1/v2) from descriptor |
| options.reset | documented | expression form documented |
| Dual outputs named loop + done | documented | |
| v3 index order done=0, loop=1 | inferred | descriptor + public workflow connections |
| v2 index order loop=0, done=1 | inferred | descriptor |
| v1 single output | inferred | descriptor only |
| Saves original list; multi-run batching | documented | |
| done = combined **processed** results | documented | not “remaining raw items” |
| noItemsLeft / currentRunIndex | documented | |
| Exact multi-run activation protocol (when done fires vs last loop) | partial / inferred | needs runner design |
| pairedItem on batches | inferred | preserve from source items |
| OpenFlow single-pass | gap | full loop-back not in single-pass engine |
| Max iteration guard | OpenFlow policy | docs only warn about infinite loops |

## OpenFlow mapping

- **Definition group:** `flow`
- **Definition:** `src/lib/nodes/definitions/flow.ts` (`splitInBatches`)
- **Executor file:** `src/lib/engine/executors/split-in-batches.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
- **Runner note:** multi-activation loop-back + context keys are required for doc-faithful behavior; correct **v3** branch indices (`done` then `loop`) when implementing or refreshing the executor
