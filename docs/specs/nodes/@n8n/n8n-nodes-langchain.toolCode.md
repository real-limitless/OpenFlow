---
type: '@n8n/n8n-nodes-langchain.toolCode'
displayName: Custom Code Tool
category: AI
versions: [1]
priority: medium
status: specced
---

# Custom Code Tool

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.toolcode.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |
| https://langchain-ai.github.io/langgraphjs/how-tos/tool-calling/ | Public docs only (tool-calling contract) |

## Wire format

- **Type string:** `@n8n/n8n-nodes-langchain.toolCode`
- **Aliases:** (none)
- **Inputs:** (none — invoked by the connected AI agent at tool-calling time)
- **Outputs:** `ai_tool` × 1
- **Credentials:** (none)

This is a LangChain **tool sub-node**. It connects to an AI agent root node through a single `ai_tool` output and is exposed to the model as a callable tool. It receives no independent `main` data input and performs no external I/O — it exists to run user-authored code inside the agent's tool loop.

## Parameters

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| `description` | string | — | yes | Free-text guidance telling the agent when to invoke the tool (e.g. "Call this tool to get a random color. The input should be a string with comma separated names of colors to exclude.") |
| `language` | string (JavaScript / Python) | — | yes | Programming language in which the tool body is written |
| `jsCode` / `pyCode` | code | — | yes | The tool body: executable code that receives the tool's input argument via a `query` variable and returns the tool's result |

The functional contract is: user-provided code runs on demand, with the model's tool argument exposed as `query`. The exact default description and editor scaffolding are UI conveniences, not part of the documented contract, and are intentionally not reproduced.

## Runtime behavior

### Input

The node has no `main` input connection. The connected agent invokes it during tool-calling, passing a single **string argument** (the model-generated tool input). Expressions in the node's own parameters resolve against the **first item only** of the calling context (standard sub-node semantics); they do not iterate per-item.

### Invocation

When the model calls the tool, the node executes the configured code. The code has access to the tool input through the `query` variable (a string). The author's code is responsible for all processing and must return a value that becomes the tool's result. Execution is local and deterministic: no external service is implied, no credentials are required, and the tool has no side effects beyond what the author's own code performs.

### Output

The tool's response to the agent is the value returned by the author's code. No additional data structures are added to the workflow output — the agent receives the returned value and uses it to compose its answer.

### Errors

If the configured code throws (e.g. runtime exception, invalid syntax, unexpected input shape), the tool reports the failure rather than fabricating a result. Standard `continueOnFail` behavior applies: when set, the failure is handed to the agent as an error payload instead of aborting the run. Because code is user-authored, error behavior is ultimately bounded by what the code does; the node surfaces runtime failures as errors.

### Expressions

The `description` parameter (and any other string parameters) accept n8n expression strings. The code body is static text and is not treated as an n8n expression.

## Acceptance tests

### Test: lowercasing transform

**Given** a connected AI agent with the Custom Code Tool available, configured in JavaScript:

**Parameters:**
```json
{
  "description": "Call this tool to lowercase a string.",
  "language": "JavaScript",
  "jsCode": "let myString = query; return myString.toLowerCase();"
}
```

**When** the model invokes the tool with the argument `"HELLO"`:

**Expect** the tool returns `"hello"`, demonstrating that the tool input is exposed via `query` and the returned value is delivered to the agent.

### Test: code runs on demand, no side effects

**Given** the tool body is a pure function (e.g. returning `query.length`):

**When** the model calls it twice with different inputs in the same run:

**Expect** a correct result for each call, no external service contacted, no data persisted, and no workflow data mutated by the node itself.

### Test: invalid expression in description

**Given** an invalid expression in `description` and `continueOnFail` enabled:

**Expect** the tool call resolves to an error payload handed to the agent rather than aborting the workflow.

### Test: author code throws

**Given** a tool body that raises an exception for a certain input:

**When** the model passes that input:

**Expect** the tool reports the failure instead of returning a fabricated value; with `continueOnFail` enabled the error payload reaches the agent and the workflow continues.

### Test: multi-item expression resolution

**Given** multiple input items flow through the calling agent and the tool's `description` references `$json`:

**Expect** the expression resolves against the first item only (sub-node semantics), not per item.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Node purpose | documented | Public docs: "write code that an agent can run"; lists the tool alongside Call n8n Workflow Tool and HTTP Request Tool as a powerful tool sub-node |
| Tool input via `query` variable | documented | Public docs show `query` holding the input string and returning the result |
| `description` parameter | documented | Public docs require it and explain its role in steering the agent |
| `language` (JavaScript / Python) | documented | Public docs state both languages are available |
| Code body parameter name | inferred | Docs refer to the code box generically; the exact parameter key is UI detail, intentionally not reverse-engineered |
| Wire format (tool sub-node, `ai_tool` output) | documented | Public tool-sub-node docs describe the `ai_tool` connection; type string `@n8n/n8n-nodes-langchain.toolCode` confirmed from package descriptor |
| Error behavior | inferred | No public statement; surface-runtime-failure is the only behavior consistent with executing user code |
| Sub-node first-item expression semantics | documented | Public sub-node hint box confirms expressions resolve against the first item only |
| Versions [1] | inferred from corpus | Package descriptor lists a single `ToolCode` node class; public docs are not version-specific |

## OpenFlow mapping

- **Definition group:** `ai`
- **Executor file:** `src/lib/engine/executors/toolCode.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
