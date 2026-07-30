---
type: n8n-nodes-base.aiTransform
displayName: AI Transform
category: Transform
versions: [1]
priority: medium
status: specced
---

# AI Transform

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.aitransform.md | Public docs only |
| https://docs.n8n.io/build/code-in-n8n/get-coding-help-from-ai.md | Public docs only |
| Published node descriptor (type string, parameter names, enums, defaults, `parameterPane: wide`, hints) | Public descriptor metadata only |

## Wire format

- **Type string:** `n8n-nodes-base.aiTransform`
- **Aliases:** `code`, `Javascript`, `JS`, `Script`, `Custom Code`, `Function`, `AI`, `LLM`
- **Display name:** `AI Transform`
- **Group / category:** `transform` · Core Nodes / Development
- **Versions:** `1` (only version published)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** (none)
- **UI:** wide parameter pane (`parameterPane: wide`)
- **Hints:** Output-pane hint shown when input items contain binary data — instructs user to use Extract from File first (**documented**)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| instructions | button (with input field) | `""` | no | — | User prompt (plain English, ≤500 chars). Click "Generate code" to trigger AI code generation. Action type: `askAiCodeGeneration` targeting `AI_TRANSFORM_JS_CODE`. `noDataExpression`. |
| codeGeneratedForPrompt | hidden | `""` | no | — | Stores the prompt text for which code was last generated. Used to detect prompt changes. |
| AI_TRANSFORM_JS_CODE | string (jsEditor, read-only) | `""` | no | — | AI-generated JavaScript code. Read-only in UI; to edit, adjust instructions or copy to a Code node. `noDataExpression`. |

## Runtime behavior

### Role

Generate JavaScript code from a natural-language prompt, then execute that code to transform input items. The AI is context-aware of upstream node data types.

### Input

Consume the upstream `main` item list: `{ json, binary?, pairedItem? }[]`.

### Execution flow

1. **Code resolution:**
   - If `AI_TRANSFORM_JS_CODE` is non-empty, use it as the transformation code.
   - Else if `instructions` is non-empty, throw a user-facing error: "Missing code for data transformation — Click the 'Generate code' button to create the code".
   - Else throw: "Missing instructions to generate code — Enter your prompt in the 'Instructions' parameter and click 'Generate code'".

2. **Execution:**
   - Run the resolved code in a sandbox (`JsTaskRunnerSandbox`) that supports the same helper surface as the Code node (`$input`, `$json`, `$("NodeName")`, `$execution`, `$workflow`, `$env`, `$vars`, etc.).
   - The sandbox runs the code against **all input items at once** (equivalent to Code node `runOnceForAllItems` mode).
   - Return value must be an array of items with `json` (object) and optional `binary`, `pairedItem`.

3. **Output:**
   - Emit result array on `main` output index `0`.

### Errors

| Condition | Behavior |
|-----------|----------|
| No `instructions` and no generated code | Node error with descriptive message guiding user to generate code |
| Generated code throws exception | Node failure; respects workflow `continueOnFail` / error workflow |
| Return shape invalid (non-object `json`, non-array return) | Node error |
| Binary data in input items | Node executes but outputs hint advising Extract from File first |

### Expressions

- All parameter fields (`instructions`, `codeGeneratedForPrompt`, `AI_TRANSFORM_JS_CODE`) are **`noDataExpression`** — not populated via `{{ }}` expressions.
- Inside generated JS, helpers use `$…` APIs, not the expression editor's `{{ }}` wrapper.

### Security (OpenFlow)

- Execute in a **sandbox / isolate** with no host FS, no raw network, no credential vault.
- Enforce timeouts and memory limits.
- Do not evaluate AI Transform source through the expression engine; run as a dedicated code task.

## Acceptance tests

### Test: basic AI-generated transformation (merge fields)

**Given** input items:

```json
[
  { "json": { "firstname": "John", "lastname": "Doe", "email": "john@example.com" } },
  { "json": { "firstname": "Jane", "lastname": "Smith", "email": "jane@example.com" } }
]
```

**Parameters:**

```json
{
  "instructions": "Merge firstname and lastname into details.name and sort by email",
  "AI_TRANSFORM_JS_CODE": "return $input.all().map(i => ({ json: { ...i.json, details: { name: i.json.firstname + ' ' + i.json.lastname } } })).sort((a, b) => a.json.email.localeCompare(b.json.email));"
}
```

**Expect** output[0]:

```json
[
  { "json": { "firstname": "Jane", "lastname": "Smith", "email": "jane@example.com", "details": { "name": "Jane Smith" } } },
  { "json": { "firstname": "John", "lastname": "Doe", "email": "john@example.com", "details": { "name": "John Doe" } } }
]
```

### Test: filter and project (each-item style logic in all-items mode)

**Given** input items:

```json
[
  { "json": { "status": "active", "value": 10 } },
  { "json": { "status": "inactive", "value": 20 } },
  { "json": { "status": "active", "value": 30 } }
]
```

**Parameters:**

```json
{
  "instructions": "Keep only active items and return value doubled",
  "AI_TRANSFORM_JS_CODE": "return $input.all().filter(i => i.json.status === 'active').map(i => ({ json: { doubled: i.json.value * 2 } }));"
}
```

**Expect** output[0]:

```json
[
  { "json": { "doubled": 20 } },
  { "json": { "doubled": 60 } }
]
```

### Test: synthesize new items (no input needed)

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "instructions": "Generate 3 items with numbers 1, 2, 3",
  "AI_TRANSFORM_JS_CODE": "return [1, 2, 3].map(n => ({ json: { n } }));"
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

### Test: missing instructions and code — user-facing error

**Given** input items:

```json
[{ "json": { "x": 1 } }]
```

**Parameters:**

```json
{}
```

**Expect** node error with message: "Missing instructions to generate code" and description: "Enter your prompt in the 'Instructions' parameter and click 'Generate code'".

### Test: instructions provided but code not generated — user-facing error

**Given** input items:

```json
[{ "json": { "x": 1 } }]
```

**Parameters:**

```json
{
  "instructions": "Double the value"
}
```

**Expect** node error with message: "Missing code for data transformation" and description: "Click the 'Generate code' button to create the code".

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string, display name, category, version | documented | Node JSON descriptor |
| Parameter names, types, defaults, button action type | inferred | Published descriptor + compiled JS |
| `parameterPane: wide` | inferred | Descriptor |
| Output-pane hint for binary inputs | documented | Node JSON `hints` array |
| AI code generation action `askAiCodeGeneration` | inferred | Descriptor `action.type` + target constant |
| Execution uses `JsTaskRunnerSandbox` (same as Code node) | inferred | Compiled JS imports `JsTaskRunnerSandbox` from `../Code/` |
| All-items execution mode (single run per batch) | inferred | `sandbox.runCodeAllItems(code)` call |
| Helper surface (`$input`, `$json`, `$()`, etc.) | inferred | Shares Code node sandbox; documented for Code node |
| Cloud-only feature (AI generation) | documented | Docs hint: "Available only on Cloud plans" |
| Prompt character limit (500) | documented | Docs + descriptor `inputFieldMaxLength: 500` |
| Read-only generated code UX | documented | Docs: "To edit this code, adjust your prompt... or copy and paste it into a Code node" |

## OpenFlow mapping

- **Definition group:** `transform` / `core`
- **Executor file:** `src/lib/engine/executors/aiTransform.ts`
- **Definition:** `src/lib/nodes/definitions/core.ts` (`n8n-nodes-base.aiTransform`)
- **SDK:** `defineNode` + native `ExecutionContext` only; sandboxed JS runner (reuse Code node sandbox infrastructure)
- **Do not** load third-party node packages