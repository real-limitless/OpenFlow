---
type: n8n-nodes-base.code
displayName: Code
category: Transform
versions: [1, 2]
priority: high
status: implemented
---

# Code

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.code.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.code/common-issues.md | Public docs only |
| https://docs.n8n.io/build/code-in-n8n/using-the-code-node.md | Public docs only |
| https://docs.n8n.io/build/code-in-n8n/use-built-in-shortcuts.md | Public docs only |
| https://docs.n8n.io/build/code-in-n8n/use-built-in-shortcuts/n8n-metadata.md | Public docs only |
| https://docs.n8n.io/build/work-with-data/understand-n8ns-data-structure.md | Public docs only |
| https://docs.n8n.io/build/work-with-data/reference-data/reference-previous-nodes.md | Public docs only |
| https://docs.n8n.io/build/work-with-data/reference-data/link-data-items/preserving-linking-in-the-code-node.md | Public docs only |
| https://docs.n8n.io/build/code-in-n8n/cookbook/code-node/get-number-of-items-returned-by-last-node.md | Public docs only |
| https://docs.n8n.io/deploy/host-n8n/configure-n8n/basic-configuration/configuration-examples/enable-modules-in-code-node.md | Public docs only |
| Public workflow export JSON / published node descriptors (type string, parameter names, enums, defaults) | Public workflow JSON / descriptor metadata only |

## Wire format

- **Type string:** `n8n-nodes-base.code`
- **Aliases:** Replaces legacy Function / Function Item nodes (docs; those older type strings are out of scope unless imported as placeholders)
- **Display name:** `Code`
- **Group / category:** `transform` · Core Nodes
- **Versions:** `1`, `2` (`defaultVersion` **2** — **inferred** from published descriptor)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** (none) — Code must not read credential stores (**documented**)
- **UI:** wide parameter pane (**inferred** descriptor `parameterPane: wide`)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| mode | options | `runOnceForAllItems` | no | — | **Run mode.** Enum: `runOnceForAllItems` (“Run Once for All Items”), `runOnceForEachItem` (“Run Once for Each Item”). `noDataExpression`. |
| language | options (v2) / hidden (v1) | `javaScript` | no | v2: always shown; v1: hidden fixed `javaScript` | **Language.** v2 enum: `javaScript`, `pythonNative`. Legacy workflows may still store `python` (Pyodide) on the wire — UI for that path is deprecated (**documented**). `noDataExpression`. |
| jsCode | string (code editor) | `""` | when language is JS | v1 always (by mode); v2 when `language=javaScript` (by mode) | JavaScript source. Editor language `javaScript`. `noDataExpression` (code is not a `{{ }}` expression field). |
| pythonCode | string (code editor) | `""` | when language is Python | when `language` ∈ `python` \| `pythonNative` (by mode) | Python source. Editor language `python`. `noDataExpression`. |
| notice | notice | `""` | no | by language | UI tips only (JS: `$` helpers / `console.log`; Python: `print` / limited helpers). Not runtime logic. |

### Mode × code field

Both `jsCode` and `pythonCode` appear twice in the published property list (all-items vs each-item) so the editor can show mode-specific placeholders; the **wire key** is still a single `jsCode` or `pythonCode` string on the node parameters object (**inferred** from descriptor + public exports).

### Version notes

- **typeVersion 1:** Language fixed to JavaScript (hidden). Only `mode` + `jsCode`.
- **typeVersion 2 (default):** User picks `language`. JavaScript uses `jsCode`; Python uses `pythonCode` with value `pythonNative` for the current native runner. Legacy `language: "python"` means Pyodide (unsupported on product v2 per docs).

## Runtime behavior

### Role

Run user-supplied **JavaScript** or **Python** as one workflow step to transform items or add logic not covered by native nodes.

### Input

Consume the upstream `main` item list: `{ json, binary?, pairedItem? }[]`.

### Execution modes

1. **`runOnceForAllItems` (default)**  
   Execute the script **once** for the whole input batch, regardless of item count (**documented**).

2. **`runOnceForEachItem`**  
   Execute the script **once per input item** (**documented**). Helpers that refer to “the current item” (`$json`, `$input.item`, native Python `_item`) apply in this mode.

### Languages

#### JavaScript (`language=javaScript`)

- Runs as Node.js-compatible user code inside an isolated sandbox / task runner (**documented** isolation intent; exact sandbox tech is **inferred** as implementation detail).
- Supports returning a **Promise** that resolves to the same item shapes (**documented**).
- `console.log` for debug output (**documented**).
- **No** top-level `import` / `export`; use `require` when modules are allowed (**documented** common issues).
- **No filesystem or outbound HTTP** from Code; use dedicated File / HTTP Request nodes instead (**documented**).
- Module loading:
  - Cloud: no arbitrary external npm; product docs list limited built-ins (e.g. `crypto`, `moment`) (**documented**).
  - Self-host: optional allowlists via `NODE_FUNCTION_ALLOW_BUILTIN` / `NODE_FUNCTION_ALLOW_EXTERNAL` (**documented**).
- OpenFlow default posture: **deny** network/fs and unlisted modules unless product config explicitly enables them (**inferred** safety mapping).

#### Python native (`language=pythonNative`)

- Native runner (task runners); stable on product v2 (**documented**).
- Helpers limited to **`_items`** (all-items mode) and **`_item`** (each-item mode) — not the full `_` / `$` helper surface (**documented**).
- Prefer bracket access (`item["json"]["field"]`), not Pyodide-style attribute sugar (**documented**).
- Insecure built-ins denied by default; library imports depend on runner allowlist / hosting (**documented**). Cloud Python: no library imports (**documented**).
- `print()` for debug (**documented** notice text).
- **OpenFlow:** restricted host `python3` subprocess (`code-python-native.ts`); no `__import__` / `open` / `exec` / `eval`; timeout + stdout cap.

#### Python Pyodide legacy (`language=python`)

- WebAssembly CPython port; **legacy / removed on product v2** (**documented**).
- Full `_variable` / `_method()` helper style analogous to JS `$` helpers when supported (**documented**).
- **OpenFlow:** Pyodide in-process (`code-python-pyodide.ts`); helpers `_items`, `_item`, `_json`, `_input.all/first/last/item`. No micropip / network installs in v1.

### Built-in helpers (JavaScript Code node)

Documented helpers available in the Code node (not every expression-only helper):

| Helper | Notes |
|--------|--------|
| `$input.all()` | All current-node input items |
| `$input.first()` / `$input.last()` | First / last input item |
| `$input.item` | Current item (each-item mode / current processing item) |
| `$input.params` | Prior node query/settings object |
| `$input.context.noItemsLeft` | Loop Over Items context flag |
| `$json` | Shorthand for `$input.item.json` — **Code node: each-item mode** |
| `$binary` | Current item binary — **not** available in Code node per reference table |
| `$("<node-name>").all/first/last/item/params/context` | Prior node output access |
| `$("<node-name>").itemMatching(index)` | Explicit back-link from an input index |
| `$execution.*`, `$workflow.*`, `$runIndex`, `$nodeVersion`, `$prevNode.*`, `$env`, `$vars`, `$getWorkflowStaticData(type)` | Metadata helpers (see metadata docs) |

Expression-only top-level transforms (e.g. `$if`, `$jmespath` as expression helpers) are **not** guaranteed in Code; use native JS / Luxon instead (**documented** warning on built-in shortcuts page).

**Legacy cookbook** samples still use a bare `items` array variable for all-items mode (**documented** cookbook). Treat `items` as an optional compatibility alias for `$input.all()` when implementing (**inferred** mapping from cookbook ↔ `$input` docs).

Python (Pyodide) mirrors with `_input`, `_json`, etc. Native Python uses only `_items` / `_item`.

### Output

Emit on `main` output index `0` an array of items:

```json
[{ "json": { }, "binary": { }, "pairedItem": 0 }]
```

Rules (**documented**):

- Inter-node data is always an **array of objects**.
- Each item should wrap payload under **`json`**, and `json` must be an **object** (not an array).
- Optional **`binary`** map for file payloads.
- From product ≥0.166.0, Code/Function may **auto-wrap** a missing `json` key and auto-wrap a bare object into an array — convenience only; prefer explicit shape.
- **Return contract by mode (behavioral):**
  - All-items: return an **array** of items (or a Promise of that array).
  - Each-item: return a **single** item object (or array of items for that iteration — multi-emit per input is **inferred** if returned array is accepted; prefer one item object as docs examples show).
- Empty / `undefined` return is an error (“doesn’t return an object”) (**documented**).
- When item count changes vs input, set **`pairedItem`** (index or object) so downstream `$("Node").item` linking works (**documented**). Single-item I/O is auto-linked.

### Errors

| Condition | Behavior |
|-----------|----------|
| Invalid return shape / non-object `json` / no return | Node error with common-issues messages (**documented**) |
| Thrown exception in user code | Node failure; respect workflow `continueOnFail` / error workflow (**inferred** engine-wide) |
| `import`/`export` in JS | Error; use `require` (**documented**) |
| `require` of disallowed module | “Cannot find module” / deny (**documented**) |
| Credential access attempts | Not supported; errors if called (**documented**) |
| FS / HTTP from sandbox | Not available (**documented**); should fail closed (**inferred**) |
| Unsupported `language` (e.g. legacy python without runtime) | Clear configuration/runtime error (**inferred**) |

### Expressions

- Parameter fields `mode`, `language`, `jsCode`, `pythonCode` are **`noDataExpression`** — they are not populated via `{{ }}` expressions (**inferred** descriptor).
- Inside JS/Python source, helpers use `$…` / `_…` APIs, not the expression editor’s `{{ }}` wrapper.

### Security (OpenFlow)

- Execute in a **sandbox / isolate** with no host FS, no raw network, no credential vault (**documented** product intent).
- Enforce timeouts and memory limits (**inferred**).
- Do not evaluate Code node source through the expression engine; run as a dedicated code task (**inferred**).

## Acceptance tests

### Test: all-items map with `$input.all()`

**Given** input items:

```json
[
  { "json": { "x": 1 } },
  { "json": { "x": 2 } }
]
```

**Parameters:**

```json
{
  "mode": "runOnceForAllItems",
  "language": "javaScript",
  "jsCode": "return $input.all().map(i => ({ json: { n: i.json.x } }));"
}
```

**Expect** output[0]:

```json
[
  { "json": { "n": 1 } },
  { "json": { "n": 2 } }
]
```

### Test: each-item with `$json`

**Given** input items:

```json
[
  { "json": { "v": 3 } },
  { "json": { "v": 5 } }
]
```

**Parameters:**

```json
{
  "mode": "runOnceForEachItem",
  "language": "javaScript",
  "jsCode": "return { json: { doubled: $json.v * 2 } };"
}
```

**Expect** output[0]:

```json
[
  { "json": { "doubled": 6 } },
  { "json": { "doubled": 10 } }
]
```

### Test: synthesize items (all-items)

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "mode": "runOnceForAllItems",
  "language": "javaScript",
  "jsCode": "return [1, 2, 3].map(n => ({ json: { n } }));"
}
```

**Expect** output[0]:

```json
[
  { "json": { "n": 1 } },
  { "json": { "n": 2 } },
  { "json": { "n": 3 } }
]
```

### Test: invalid `json` array payload fails

**Given** input items:

```json
[{ "json": { "a": 1 } }]
```

**Parameters:**

```json
{
  "mode": "runOnceForAllItems",
  "language": "javaScript",
  "jsCode": "return [{ json: [1, 2, 3] }];"
}
```

**Expect** node error (json property must be an object) (**documented**).

### Test: native Python all-items (`_items`) — optional if Python enabled

**Given** input items:

```json
[
  { "json": { "x": 1 } },
  { "json": { "x": 2 } }
]
```

**Parameters:**

```json
{
  "mode": "runOnceForAllItems",
  "language": "pythonNative",
  "pythonCode": "return [ {\"json\": {\"n\": i[\"json\"][\"x\"]}} for i in _items ]"
}
```

**Expect** output[0]:

```json
[
  { "json": { "n": 1 } },
  { "json": { "n": 2 } }
]
```

If OpenFlow ships JS-only initially, skip with documented gap and still accept the parameter surface on import.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| mode enum + default all-items | documented | Code node usage docs |
| language `javaScript` / `pythonNative` wire values | inferred | Published descriptor; docs describe JS vs native Python vs legacy Pyodide |
| jsCode / pythonCode field names | inferred | Descriptor + public exports; docs say “code” generically |
| Return item shape + json object rule | documented | Data structure + common issues |
| Auto-wrap missing json/array | documented | Data structure note for Code/Function |
| `$input.*` / `$json` (each-item) helpers | documented | Reference previous nodes |
| Native Python only `_items`/`_item` | documented | Code node + metadata pages |
| pairedItem when reshaping multi-item | documented | Preserving linking in Code node |
| No FS/HTTP; no credentials | documented | Code node + common issues |
| Promise support (JS) | documented | |
| Module allowlist env vars | documented | Self-host configuration |
| Exact sandbox (isolated-vm vs task runner) | inferred | Hosting-dependent; OpenFlow chooses isolate |
| Bare `items` global vs `$input.all()` | documented (cookbook) / inferred (alias) | Prefer `$input` in new code |
| Each-item multi-return array semantics | inferred | Docs emphasize single item object |
| typeVersion default 2 | inferred | Descriptor `defaultVersion` |
| Legacy Function node import | documented (replaced) | Out of scope unless placeholder |

## OpenFlow mapping

- **Definition group:** `transform` / `core`
- **Executor file:** `src/lib/engine/executors/code.ts` (+ `code-python-native.ts`, `code-python-pyodide.ts`, `code-result.ts`)
- **Definition:** `src/lib/nodes/definitions/core.ts` (`n8n-nodes-base.code`)
- **SDK:** `defineNode` + native `ExecutionContext` only; sandboxed JS (`isolated-vm`); `pythonNative` via host python3; `python` via Pyodide
- **Do not** load third-party node packages
