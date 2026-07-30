---
type: n8n-nodes-base._killtest
displayName: _killtest (unpublished)
category: (none)
versions: []
priority: low
status: specced
---

# _killtest (unpublished)

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base._killtest.md | Public docs only — **404 / page not found** |
| https://docs.n8n.io/integrations/builtin/core-nodes.md | Public docs only — type not listed among core nodes |
| Published package metadata (`n8n-nodes-base` known-node catalog; names/enums only) | Public descriptor metadata — **no entry for `_killtest`** |

This wire type is **not** a documented or published core node. The requested docs URL returns “Page Not Found.” The published base-node known catalog has **no** key or path matching `_killtest` / `n8n-nodes-base._killtest`. No public workflow JSON examples use this type.

## Wire format

- **Type string:** `n8n-nodes-base._killtest`
- **Aliases:** (none known)
- **Inputs:** **unknown** — no public description; treat as unsupported
- **Outputs:** **unknown** — no public description; treat as unsupported
- **Credentials:** (none known)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| *(none documented)* | — | — | — | — | No public parameter schema. Do **not** invent parameters. |

Any `parameters` object present on imported workflow JSON for this type must be preserved opaquely on a placeholder node (**OpenFlow import convention**, inferred from clean-room compatibility targets — not from a real node contract).

## Runtime behavior

### Input

**Not specified.** There is no public runtime contract for this type.

### Output

**Not specified.** OpenFlow must **not** invent pass-through, transform, or side-effect behavior for this type.

### Unsupported / placeholder (OpenFlow contract)

Because the type has no public docs and no published descriptor:

1. **Do not implement** a native executor that pretends to be a real product node.
2. On import, keep the node as an **unsupported / placeholder** description so workflow JSON is not dropped (**documented** OpenFlow clean-room rule: unsupported types import as placeholders that preserve parameters).
3. At run time, attempting to execute this type should **fail clearly** (missing executor / unsupported node), not silently no-op, unless the host already has a generic placeholder policy that fails the run.
4. `continueOnFail` on the node (if present in JSON) does not create a defined success path for this type; failure remains “type unsupported.”

### Errors

| Condition | Behavior |
|-----------|----------|
| Node present in workflow | Import OK as placeholder; parameters retained |
| Execution reaches node | Throw / fail run: unsupported or unregistered type |
| Spec used as implementer input | Implementer **must refuse** to build a fake product executor |

### Expressions

N/A — no documented expression-bearing parameters.

## Acceptance tests

### Test: type string preserved on placeholder import

**Given** workflow fragment:

```json
{
  "nodes": [
    {
      "id": "k1",
      "name": "Kill Test",
      "type": "n8n-nodes-base._killtest",
      "typeVersion": 1,
      "position": [0, 0],
      "parameters": { "anyOpaque": true }
    }
  ],
  "connections": {}
}
```

**Expect:**

- Import succeeds without dropping the node.
- Stored type remains `n8n-nodes-base._killtest`.
- `parameters` remain `{ "anyOpaque": true }` (opaque preserve).
- Description is placeholder / unsupported (not a full native definition).

### Test: no executor registration

**Parameters:** N/A

**Expect:**

- `hasExecutor("n8n-nodes-base._killtest")` is `false` (or equivalent registry miss).
- No file under `src/lib/engine/executors/` claims this type string as a product node.

### Test: execution fails closed

**Given** input items:

```json
[{ "json": { "x": 1 } }]
```

**Parameters:**

```json
{}
```

**Expect:** execution does **not** produce a successful main-branch pass-through of `[{ "json": { "x": 1 } }]` under a fabricated executor. Run fails with unsupported/missing executor (or host-equivalent hard error).

### Test: no hallucinated parameter schema in UI registry

**Expect:** `getNodeType("n8n-nodes-base._killtest")` is missing or `placeholder: true`, with **no** invented required properties presented as a real node form.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Public docs page | documented | 404 — type not a published core node |
| Package known-node catalog | documented (metadata only) | No `_killtest` entry among published nodes |
| Inputs / outputs / versions | unknown | Cannot specify without inventing |
| Parameters / defaults / enums | unknown | None discoverable from permitted sources |
| Runtime semantics | unknown | Intentionally unspecified |
| OpenFlow placeholder import | documented (OpenFlow) | Clean-room compatibility: preserve unsupported types |
| Execute-time failure | inferred (OpenFlow) | Fail closed; do not fake behavior |
| Confidence overall | **none for product behavior** | Spec records non-existence, not a node contract |

## OpenFlow mapping

- **Definition group:** *(none — do not add a product definition)*
- **Executor file:** *(none — do not implement)*
- **SDK:** N/A for product behavior. If anything is registered, it must remain a **placeholder** only (preserve wire JSON), never a `defineNode` product executor claiming real behavior.
- **Implementer instruction:** **STOP.** This type is unpublished. Do not author executors, tests that assert product I/O, or catalog entries beyond unsupported/placeholder handling.
