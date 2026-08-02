---
type: '@n8n/n8n-nodes-langchain.toolWorkflow'
displayName: Call n8n Workflow Tool
category: AI
versions: [1, 2]
priority: medium
status: specced
---

# Call n8n Workflow Tool

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.toolworkflow.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.executeworkflowtrigger/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.executeworkflow.md | Public docs only |

## Wire format

- **Type string:** `@n8n/n8n-nodes-langchain.toolWorkflow`
- **Aliases:** (none)
- **Inputs:** (none — invoked by the connected AI agent at tool-calling time)
- **Outputs:** `ai_tool` × 1
- **Credentials:** (none)

This is a LangChain **tool sub-node**. It connects to an AI agent root node through a single `ai_tool` output and exposes another n8n workflow as a callable tool. It receives no independent `main` data input.

## Parameters

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| `name` | string | — | yes | Callable function identifier exposed to the agent; letters, digits, and underscores only |
| `description` | string | — | yes | Free-text guidance for the agent describing when this tool should be used |
| `source` | string | `database` | yes | `database` (load a workflow by ID from the workflow store) or `parameter` / "Define Below" (paste a full workflow JSON) |
| `workflowId` | string | — | only when `source=database` | ID of the target workflow to execute |
| `workflowJson` | string | — | only when `source=parameter` | Complete workflow definition (JSON) to execute |
| `workflowInputs` | fixedCollection | `{}` | no | Typed input bindings for the target sub-workflow's declared input schema (see below) |

### Workflow inputs

When `source=database` and the target workflow declares a **Workflow Input Schema** (via its Execute Sub-workflow Trigger node), the tool exposes a configurable list of input fields that mirror that schema. A "Refresh" action pulls the field names/types from the target workflow.

Each workflow input field defines:

| name | type | default | notes |
|------|------|---------|-------|
| `name` | string | — | Input key expected by the sub-workflow |
| `type` | string | `string` | Data type expected: `string`, `number`, `boolean`, `array`, `object` |
| `value` | any | — | Value source: a fixed literal, an expression against the calling workflow, or a `$fromAI()` call that lets the AI model supply the value |

## Runtime behavior

### Input

The node has no `main` input connection. The agent invokes it during tool-calling. Values for configured tool parameters are resolved from fixed literals, expressions, or model-supplied arguments (via `$fromAI()`).

### Invocation

1. Resolve the target workflow: load it by ID from the workflow store (`source=database`), or parse the pasted workflow JSON (`source=parameter`).
2. Assemble the sub-workflow input item(s) from the configured `workflowInputs` bindings, converting each value to the declared `type`.
3. Execute the target workflow, passing the assembled inputs to its Execute Sub-workflow Trigger (the trigger's Input data mode — "Define using fields below", "Define using JSON example", or "Accept all data" — determines how strictly inputs are validated).
4. Collect the target workflow's output items.

### Output

The collected sub-workflow output data is returned to the agent as the tool's response, serialized so the model can consume it (text/JSON). This is the "fetch its output data" behavior: the agent can use the returned data to answer the user.

### Sub-node expression semantics

Like all LangChain sub-nodes, expressions used in the tool's parameters resolve against the **first item only** of the calling context; they do not iterate per-item.

### Errors

- `source=database` with a missing/inaccessible workflow ID → the tool call fails.
- Invalid or unparseable `workflowJson` → the tool call fails.
- The target workflow throws during execution → the error surfaces as a failed tool invocation to the agent.
- Workflow input value cannot be converted to the declared `type` → the tool call fails.
- `continueOnFail` is honored per standard n8n conventions: when set, the failed tool call returns an error payload instead of throwing.

### Expressions

`name`, `description`, and each workflow-input `value` accept expression strings. The `$fromAI(key, description?, type?, defaultValue?)` function is valid in workflow-input values and lets the model fill in the argument.

## Acceptance tests

### Test: call-by-id passes configured inputs

**Given** a registered workflow `wf-echo` whose Execute Sub-workflow Trigger declares an input schema with `city` (string) and whose body returns that input as its output.

**Parameters:**
```json
{
  "name": "get_city_weather",
  "description": "Get the weather for a city",
  "source": "database",
  "workflowId": "wf-echo",
  "workflowInputs": { "values": [{ "name": "city", "type": "string", "value": "London" }] }
}
```

**When** the agent invokes the tool with no model-supplied arguments:

**Expect** the sub-workflow executes exactly once with an input item containing `{ "city": "London" }`, and the tool response to the agent contains the sub-workflow's returned data.

### Test: define-below source

**Given** `source=parameter` with a `workflowJson` that defines a workflow returning the fixed payload `{ "result": "ok" }`:

**Parameters:**
```json
{
  "name": "ping",
  "source": "parameter",
  "workflowJson": "{ \"nodes\": [...], \"connections\": [...] }"
}
```

**When** the agent invokes the tool:

**Expect** the parsed workflow runs and the tool response contains `{ "result": "ok" }`.

### Test: $fromAI() model-supplied input

**Given** the same `wf-echo` workflow and an input binding that defers to the model:

```json
{
  "name": "get_city_weather",
  "source": "database",
  "workflowId": "wf-echo",
  "workflowInputs": { "values": [{ "name": "city", "type": "string", "value": "={{ $fromAI('city') }}" }] }
}
```

**When** the agent invokes the tool and the model supplies the argument `city = "Paris"`:

**Expect** the sub-workflow receives `{ "city": "Paris" }` and its output reflects that value.

### Test: sub-workflow failure propagates

**Given** `source=database`, `workflowId="wf-explode"`, where `wf-explode` throws during execution:

**When** the agent invokes the tool:

**Expect** the tool call surfaces the sub-workflow error (the agent observes a failed invocation). With `continueOnFail` enabled, the tool returns an error payload instead of throwing.

### Test: tool name contract

**Given** `name: "get_weather_2"`:

**Expect** the tool is exposed to the agent as the callable function `get_weather_2` (letters, digits, underscores preserved; no spaces or punctuation).

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Node purpose and parameters | documented | Public docs confirm Description, Source (Database / Define Below), and Workflow Inputs |
| Tool sub-node wire format | documented | `ai_tool` output connection is standard for LangChain tool sub-nodes |
| Workflow Input Schema contract | documented | Public Execute Sub-workflow / Execute Sub-workflow Trigger docs confirm the schema is declared in the target workflow's trigger node and auto-populated in the caller |
| `$fromAI()` in tool parameters | documented | Public docs document the function and its `key`, `description`, `type`, `defaultValue` arguments |
| Sub-node first-item expression semantics | documented | Public sub-node hint box confirms expressions resolve against the first item only |
| Tool output serialization to agent | inferred | Public docs state the tool runs the workflow and fetches its output; exact envelope (property name, text vs JSON) is an implementation detail |
| Exact workflow-input parameter nesting | inferred | Public docs describe the concept; internal nested schema intentionally not reproduced |
| Function-name charset constraint | inferred | Tool-calling contract (letters/digits/underscores); consistent with documented agent tool behavior |
| Versions [1, 2] | inferred from corpus | NPM package contains v1 and v2 descriptors; public docs are not version-specific |

## OpenFlow mapping

- **Definition group:** `ai`
- **Executor file:** `src/lib/engine/executors/toolWorkflow.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
