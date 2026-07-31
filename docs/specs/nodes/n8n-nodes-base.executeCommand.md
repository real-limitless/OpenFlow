---
type: n8n-nodes-base.executeCommand
displayName: Execute Command
category: Development
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
- **Aliases:** `Shell`, `Command`, `OS`, `Bash`
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** none

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `executeOnce` | boolean | `true` | false | — | Whether to run the command once for all input items or once per item |
| `command` | string | `""` | **yes** | — | The shell command to execute; accepts inline newlines for multi-line commands |

## Runtime behavior

### Input

The node receives items on the `main` input. When `executeOnce` is `true`, all input items are passed through and the command executes a single time. When `executeOnce` is `false`, the command executes once per input item and each execution applies to its respective item.

### Output

Each output item contains the fields of the corresponding input item (passed through), plus the following execution result fields added at the top level:

| field | type | description |
|-------|------|-------------|
| `stdout` | string | Standard output of the executed command |
| `stderr` | string | Standard error output of the executed command |
| `exitCode` | number | Process exit code (0 for success, non-zero for failure) |

If `executeOnce` is `true`, the single execution result is applied to every input item. If `executeOnce` is `false`, each input item carries its own execution result.

### Shell environment

The command runs in the default shell of the host machine (for example `cmd` on Windows and `zsh` on macOS). In Docker deployments, the command runs inside the n8n container, not on the Docker host. In queue mode, the command executes on the worker processing the task for production runs; manual executions run on the main instance unless `OFFLOAD_MANUAL_EXECUTIONS_TO_WORKERS` is enabled.

Availability and security notes (documented): the node is **not available on n8n Cloud**, and starting with n8n 2.0 it is **disabled by default** in self-hosted installs as a security precaution (it allows arbitrary shell execution). On Windows, the command string is passed to the shell as a single line; embedded line breaks can cause only the first line to be executed, so multi-command Windows scripts should be joined with `&&` or `;` on one line.

### Errors

- If the command fails (non-zero exit code), the node **does not throw** by default — the `exitCode` field carries the error code and the `stderr` field contains the error output.
- If the shell cannot find the command, the node throws an error (command not found).
- If stdout exceeds the max buffer length, the node throws a `maxBuffer` error.
- `continueOnFail` is respected per standard OpenFlow convention: when enabled, failed items are passed through with an error indicator instead of halting execution.

### Expressions

The `command` parameter accepts expression strings (`{{ ... }}`).

## Acceptance tests

### Test: basic command execution

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "executeOnce": true,
  "command": "echo hello"
}
```

**Expect** output[0]:

```json
[{
  "json": {
    "stdout": "hello\n",
    "stderr": "",
    "exitCode": 0
  }
}]
```

### Test: per-item command execution

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
  "executeOnce": false,
  "command": "echo {{ $json.name }}"
}
```

**Expect** output[0]:

```json
[
  { "json": { "name": "alice", "stdout": "alice\n", "stderr": "", "exitCode": 0 } },
  { "json": { "name": "bob", "stdout": "bob\n", "stderr": "", "exitCode": 0 } }
]
```

### Test: command failure (non-zero exit)

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "executeOnce": true,
  "command": "sh -c 'exit 42'"
}
```

**Expect** output[0]:

```json
[{
  "json": {
    "stdout": "",
    "stderr": "",
    "exitCode": 42
  }
}]
```

### Test: command not found throws

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "executeOnce": true,
  "command": "nonexistent_command_xyz123"
}
```

**Expect** the node throws an error (command not found).

### Test: continueOnFail with command failure

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "executeOnce": true,
  "command": "sh -c 'exit 1'",
  "continueOnFail": true
}
```

**Expect** output[0]:

```json
[{
  "json": {
    "stdout": "",
    "stderr": "",
    "exitCode": 1
  }
}]
```

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Parameter names and defaults | documented (public docs) | `executeOnce`, `command` appear verbatim in the public node docs; aliases + version 1.0 confirmed from public descriptor |
| Output shape (stdout/stderr/exitCode) | inferred | Standard shell command execution contract; matches documented behavior that only "not found" and maxBuffer are errors |
| `executeOnce` per-item behavior | documented | Public docs describe both modes explicitly |
| Shell selection | documented | Public docs name the default host shell per platform |
| Windows line-break truncation | documented | Common issues page documents the single-line behavior |
| maxBuffer behavior | documented | Common issues page documents the error |
| Execution environment (Docker/queue) | documented | Public docs cover Docker container and queue mode worker execution |
| Cloud unavailability + 2.0 disable-by-default | documented | Public node docs security/availability notes |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/execute-command.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only