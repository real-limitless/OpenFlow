---
type: '@n8n/n8n-nodes-langchain.retrieverWorkflow'
displayName: Workflow Retriever
category: AI
versions: [1, 1.1]
priority: medium
status: specced
---

# Workflow Retriever

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.retrieverworkflow.md | Public docs only |

## Wire format

- **Type string:** `@n8n/n8n-nodes-langchain.retrieverWorkflow`
- **Aliases:** (none)
- **Inputs:** (none — sub-node connected to a root node via `ai_retriever` channel)
- **Outputs:** `ai_retriever` × 1
- **Credentials:** (none)

This is a LangChain **retriever sub-node**. It has no `main` input/output.  
It connects to a root node (e.g. a Retrieval QA Chain) through a single `ai_retriever` output and exposes an n8n workflow as a document retriever for RAG workflows.

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `source` | string | `database` | no | — | `database` (load workflow by ID from the n8n store) or `parameter` (paste complete workflow JSON) |
| `workflowId` | resourceLocator | — | only when `source=database` | `{ show: { source: ["database"] } }` | Select a workflow via resource locator (list or ID mode) |
| `workflowJson` | JSON / string | — | only when `source=parameter` | `{ show: { source: ["parameter"] } }` | Complete workflow definition (JSON) to execute as the retriever |
| `fields` | fixedCollection | `{}` | no | — | Typed key-value bindings to pass into the sub-workflow as input data |

### Fields (workflow values)

Each entry in `fields.values` defines a named value to make available to the called workflow's trigger node output:

| name | type | default | displayOptions | notes |
|------|------|---------|----------------|-------|
| `name` | string | — | — | Field name (supports dot-notation like `data.person[0].name`) |
| `type` | string | `stringValue` | — | `stringValue`, `numberValue`, `booleanValue`, `arrayValue`, `objectValue` |
| `stringValue` | string | — | `{ show: { type: ["stringValue"] } }` | Value when type is string |
| `numberValue` | string | — | `{ show: { type: ["numberValue"] } }` | Value when type is number |
| `booleanValue` | string | `true` | `{ show: { type: ["booleanValue"] } }` | Value when type is boolean (`"true"` / `"false"`) |
| `arrayValue` | string | — | `{ show: { type: ["arrayValue"] } }` | Value when type is array (JSON string) |
| `objectValue` | JSON / string | `{}` | `{ show: { type: ["objectValue"] } }` | Value when type is object |

## Runtime behavior

### Invocation

1. **Resolve the target workflow:**
   - `source=database`: load the workflow by its ID from the n8n workflow store (via resource locator with list or ID mode).
   - `source=parameter`: parse the pasted workflow JSON string directly.

2. **Assemble sub-workflow inputs** from the configured `fields.values` list. Each entry's value is converted to its declared `type` (string, number, boolean, JSON array, JSON object) and made available as properties on the sub-workflow's trigger node output (`$json.<fieldName>`).

3. **Execute the target workflow** with these input values accessible in its trigger output.

4. **Collect the output** from the sub-workflow. The retriever node's output is the set of documents returned by the sub-workflow (typically an array of Document objects with `pageContent` and `metadata`).

### Output

The sub-workflow's output is returned to the parent root node on the `ai_retriever` channel. The retriever output contract (what Document shape is expected) is defined by the root node's interface — typically Document objects with at minimum `pageContent` (string) and `metadata` (object) fields.

### Sub-node expression semantics

Like all LangChain sub-nodes, expressions in retriever parameters resolve against the **first item only** of the calling context. They do not iterate per-item.

### Errors

- `source=database` with a missing or inaccessible workflow ID → the retriever call fails.
- Invalid or unparseable `workflowJson` → the retriever call fails.
- The target workflow throws during execution → the error propagates to the parent root node.
- `continueOnFail` is honored per standard n8n conventions: when set, a failed invocation returns an error item instead of throwing.

### Expressions

`workflowId`, `workflowJson`, and each field value accept expression strings.

## Acceptance tests

### Test: database source with static workflow values

**Given** a registered workflow `wf-retriever` whose trigger exposes `$json.query` and whose body returns an array of Document objects `[{ pageContent: "result", metadata: {} }]`.

**Parameters:**
```json
{
  "source": "database",
  "workflowId": "wf-retriever",
  "fields": {
    "values": [
      { "name": "query", "type": "stringValue", "stringValue": "What is LangChain?" }
    ]
  }
}
```

**When** the parent root node invokes the retriever:

**Expect** the sub-workflow executes exactly once with input containing `{ query: "What is LangChain?" }`, and the retriever output is the sub-workflow's returned Document array.

### Test: parameter source with inline JSON

**Given** `source=parameter` with a `workflowJson` defining a workflow that returns a fixed Document `{ pageContent: "cached response", metadata: {} }`:

**Parameters:**
```json
{
  "source": "parameter",
  "workflowJson": "{ \"nodes\": [...], \"connections\": [...] }"
}
```

**When** the retriever is invoked:

**Expect** the parsed workflow runs and the retriever output contains `[{ pageContent: "cached response", metadata: {} }]`.

### Test: field with typed value variants

**Given** a `fields` entry with `type: "numberValue"` and `numberValue: "42"`:

**Parameters:**
```json
{
  "source": "database",
  "workflowId": "wf-echo",
  "fields": {
    "values": [
      { "name": "count", "type": "numberValue", "numberValue": "42" }
    ]
  }
}
```

**Expect** the sub-workflow trigger receives the value `count` as the number `42` (not the string `"42"`).

### Test: sub-workflow failure propagates

**Given** `source=database`, `workflowId="wf-explode"`, where `wf-explode` throws during execution:

**When** the retriever is invoked:

**Expect** the error propagates to the parent root node. With `continueOnFail` enabled, an error item is returned instead of throwing.

### Test: expression resolution (first-item semantics)

**Given** the configuration field uses `={{ $json.someField }}`, and the calling context has multiple items:

**Expect** the expression resolves against the first item only (standard sub-node behavior).

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Node purpose and parameters | documented | Public docs confirm Source (Database / Parameter) and Workflow Values |
| Sub-node wire format | documented | Standard `ai_retriever` output channel for LangChain retriever sub-nodes |
| Fields (name + type + value collections) | documented | Public docs describe passing named values to the sub-workflow |
| Dot-notation field names | inferred from corpus | Type definition shows `data.person[0].name` JSDoc example |
| Typed field variants | inferred from corpus | Zod schema confirms `stringValue`, `numberValue`, `booleanValue`, `arrayValue`, `objectValue` value type options |
| Sub-node first-item expression semantics | documented | Public sub-node hint box confirms expressions resolve against the first item only |
| Sub-workflow output contract | inferred | The retriever is expected to produce Document objects for the parent chain; exact shape depends on root node |
| Resource locator in v1.1 | inferred from corpus | v1 uses bare `stringOrExpression` for workflowId; v1.1 upgrades to resource locator (`__rl` with list/id modes and cached result) |

## OpenFlow mapping

- **Definition group:** `ai`
- **Executor file:** `src/lib/engine/executors/retrieverWorkflow.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
