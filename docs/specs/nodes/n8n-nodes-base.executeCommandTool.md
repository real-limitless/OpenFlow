---
type: n8n-nodes-base.executeCommandTool
displayName: Execute Command
category: Action
versions: [1]
priority: medium
status: specced
---

# Execute Command Tool

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.executecommand/ | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.executeCommandTool`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** (none)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| executeOnce | boolean | false | false | | When true, runs the command once per workflow execution ignoring input item count. When false, runs once per input item. |
| command | string | — | true | | Shell command to execute on the host machine. Runs in the host's default shell (e.g. cmd on Windows, zsh on macOS). Accepts expression strings and `$fromAI()` dynamic parameter population for AI agents. |

## Runtime behavior

### Input

Consumes items from the `main` input. When `executeOnce` is false, the command is executed once per input item. When `executeOnce` is true, the command runs a single time regardless of how many items arrive.

### Output

Produces one output item per execution, with the following shape:

- `exitCode` (number): The process exit code (0 typically means success)
- `stdout` (string): The command's standard output
- `stderr` (string): The command's standard error output

When `executeOnce` is true, a single output item is produced. When `executeOnce` is false, one output item is produced per input item (each execution gets its own stdout/stderr/exitCode).

### Errors

Non-zero exit codes do not inherently cause the node to throw - the `exitCode` is reported in the output data. The caller should inspect `exitCode` to determine success. The node throws only on execution infrastructure failures (e.g., shell not found, command not found). The `continueOnFail` option applies as usual.

### Security

The Execute Command node runs shell commands on the host machine and is disabled by default in n8n starting from version 2.0. It is not available on n8n Cloud. In Docker deployments, commands execute inside the n8n container, not on the Docker host.

### Expressions

The `command` parameter accepts n8n expression strings and `$fromAI()` dynamic parameter population for AI agent tool usage.

## Acceptance tests

### Test: basic command execution

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "command": "echo hello"
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "exitCode": 0,
    "stdout": "hello\n",
    "stderr": ""
  }
}]
```

### Test: execute once per item (default)

**Given** input items:
```json
[
  { "json": { "name": "alice" } },
  { "json": { "name": "bob" } }
]
```

**Parameters:**
```json
{
  "command": "echo {{ $json.name }}",
  "executeOnce": false
}
```

**Expect** output[0]:
```json
[
  { "json": { "exitCode": 0, "stdout": "alice\n", "stderr": "" } },
  { "json": { "exitCode": 0, "stdout": "bob\n", "stderr": "" } }
]
```

### Test: execute once for all items

**Given** input items:
```json
[
  { "json": { "x": "1" } },
  { "json": { "x": "2" } }
]
```

**Parameters:**
```json
{
  "command": "echo executed once",
  "executeOnce": true
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "exitCode": 0,
    "stdout": "executed once\n",
    "stderr": ""
  }
}]
```

### Test: command producing stderr and non-zero exit

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "command": "ls /nonexistent_path_xyz"
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "exitCode": 2,
    "stdout": "",
    "stderr": "ls: cannot access '/nonexistent_path_xyz': No such file or directory\n"
  }
}]
```

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Core behavior (command, executeOnce, stdout/stderr/exitCode output) | documented | Public docs cover the base Execute Command node thoroughly |
| `$fromAI()` dynamic parameter support for tool variant | documented | Public docs confirm tool nodes support `$fromAI()` dynamic parameter population |
| Tool-mode-specific additions beyond base node | inferred | The tool variant likely wraps the same executeOnce + command parameters as the base node, with `$fromAI()` support added. No separate tool-mode-only options documented like HTTP Request has. |
| Output shape (exitCode, stdout, stderr) as structured fields | inferred | Clean-room abstraction - outcome-based contract; exact field keys may differ |
| Security and availability restrictions | documented | Not available on Cloud, disabled by default, Docker container scope |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/executeCommandTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
