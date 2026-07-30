---
type: n8n-nodes-base.executeCommand
displayName: Execute Command
category: Transform
versions: [1]
priority: medium
status: specced
---

# Execute Command

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.executecommand.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.executecommand/common-issues.md | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.executeCommand`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** (none)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| executeOnce | boolean | false | no | | "Execute Once" — when true, node runs once for the first input item only; when false (default), runs once per input item |
| command | string | '' | yes | | The shell command to execute on the host machine; supports multi-line commands and `&&` chaining |

## Runtime behavior

### Input

Consumes items from the single `main` input. Each input item may contain `json` and optional `binary` data. If `executeOnce` is true, only the first input item is processed; otherwise each item is processed independently.

### Output

Produces one output item per processed input item (or one item if `executeOnce` is true). Each output item has the shape:

```json
{
  "json": {
    "exitCode": 0,
    "stdout": "command output",
    "stderr": ""
  },
  "pairedItem": { "item": 0 }
}
```

- `exitCode`: integer exit code of the executed command (0 on success, non-zero on failure)
- `stdout`: string stdout output from the command
- `stderr`: string stderr output from the command

### Errors

- If the command fails (non-zero exit code or spawn error) and `continueOnFail` is **false** (default), the node throws a `NodeOperationError` with the error message and `itemIndex`.
- If `continueOnFail` is **true**, the node does not throw; instead it emits an output item for the failed item with:
  ```json
  { "json": { "error": "<error message>" }, "pairedItem": { "item": <index> } }
  ```
- Common errors documented by n8n:
  - "Command failed: <command> /bin/sh: <command>: not found" — command not in PATH or typo.
  - "Error: stdout maxBuffer length exceeded" — command output exceeds internal buffer limit; reduce output or pipe through filtering.
  - On Windows PowerShell: line breaks in multi-line PowerShell commands are treated as command separators; use single-line with semicolons or `-File`.

### Expressions

- `command` accepts expression strings (`{{ ... }}`) to interpolate values from input items.
- `executeOnce` accepts expressions.

### Security & environment notes (documented behavior)

- The node executes commands in the **host machine's default shell** (`cmd` on Windows, `zsh`/`bash` on macOS/Linux).
- In Docker, commands run inside the n8n container, not the Docker host.
- In queue mode, commands run on the worker executing the task; manual executions run on the main instance unless `OFFLOAD_MANUAL_EXECUTIONS_TO_WORKERS=true`.
- **Disabled by default in n8n ≥2.0** for security; must be explicitly enabled in config.
- **Not available on n8n Cloud.**

## Acceptance tests

### Test: basic command (echo)

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{ "executeOnce": false, "command": "echo hello" }
```

**Expect** output[0]:
```json
[{ "json": { "exitCode": 0, "stdout": "hello\n", "stderr": "" }, "pairedItem": { "item": 0 } }]
```

---

### Test: executeOnce true (single execution for multiple items)

**Given** input items:
```json
[{ "json": { "value": 1 }}, { "json": { "value": 2 }}, { "json": { "value": 3 }}]
```

**Parameters:**
```json
{ "executeOnce": true, "command": "echo first" }
```

**Expect** output[0] (single item, first input only):
```json
[{ "json": { "exitCode": 0, "stdout": "first\n", "stderr": "" }, "pairedItem": { "item": 0 } }]
```

---

### Test: command with expression interpolation

**Given** input items:
```json
[{ "json": { "name": "world" }}]
```

**Parameters:**
```json
{ "executeOnce": false, "command": "echo hello {{ $json.name }}" }
```

**Expect** output[0]:
```json
[{ "json": { "exitCode": 0, "stdout": "hello world\n", "stderr": "" }, "pairedItem": { "item": 0 } }]
```

---

### Test: command failure with continueOnFail false (default)

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{ "executeOnce": false, "command": "exit 42" }
```

**Expect** node throws `NodeOperationError` with message containing "exit 42" and `itemIndex: 0`.

---

### Test: command failure with continueOnFail true

**Given** input items:
```json
[{ "json": {} }, { "json": {} }]
```

**Parameters:**
```json
{ "executeOnce": false, "command": "exit 1" }
```
**Node option:** `continueOnFail: true`

**Expect** output[0] (two items, both with error):
```json
[
  { "json": { "error": "Command failed: exit 1" }, "pairedItem": { "item": 0 } },
  { "json": { "error": "Command failed: exit 1" }, "pairedItem": { "item": 1 } }
]
```

---

### Test: multi-line command (chained with &&)

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{ "executeOnce": false, "command": "cd /tmp && echo hello" }
```

**Expect** output[0] stdout contains "hello" and exitCode 0.

---

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| executeOnce parameter | documented (as "Execute Once") | Docs call it "Execute Once"; source uses `executeOnce` key. Boolean default inferred as `false`. |
| executeOnce default | inferred | Default `false` inferred from docs ("turned off" = once per item). |
| continueOnFail error shape | inferred | n8n standard `continueOnFail` behavior inferred from core node patterns and source snippet. |
| maxBuffer limit | documented (common issues) | Exact byte limit not documented; only mitigation described. |
| Windows PowerShell line-break behavior | documented | Documented limitation; no parameter to control shell. |
| Docker/queue-mode execution context | documented | Described in docs; not a parameter. |
| Disabled by default in n8n ≥2.0 | documented | Config flag not part of node spec. |
| n8n Cloud unavailable | documented | Not a runtime parameter. |
| stdout/stderr encoding | inferred | Assumed UTF-8 string; not explicitly documented. |
| Working directory | not documented | Not exposed as parameter; inherits from n8n process cwd. |
| Environment variables | not documented | Not exposed; inherits from n8n process env. |
| Timeout | not documented | No timeout parameter documented. |
| Shell selection | documented (fixed) | Uses host default shell; not configurable. |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.executeCommand.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only