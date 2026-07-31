---
type: @n8n/n8n-nodes-langchain.code
displayName: LangChain Code
category: Cluster Nodes
versions: [1]
priority: P1
status: specced
---

# LangChain Code

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/cluster-nodes/root-nodes/n8n-nodes-langchain.code.md | Public docs only |
| https://docs.n8n.io/build/code-in-n8n/use-built-in-shortcuts/langchain-code-node.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai.md | Public docs only |
| corpus docs/page.md redirect hint (`/tmp` isolation; `n8n-nodes-base@2.15.1` contains no langchain descriptor) | Public docs 404 + public descriptor metadata (absence) |

> **Deprecated.** The public docs mark this node as deprecated for critical
> security issues: it is hidden from the add-node panel and is **not available
> on Cloud** (self-hosted only). OpenFlow should treat it as an
> import-compatibility / legacy-execution type, not a recommended node.

## Wire format

- **Type string:** `@n8n/n8n-nodes-langchain.code`
- **Aliases:** LangChain Code
- **Inputs:** `main` × 1 (optional, role-dependent) + any subset of the AI channel types below
- **Outputs:** `main` × 1 (optional, role-dependent) + any subset of the AI channel types below
- **Credentials:** (none)
- **Hidden:** true (deprecated; removed from the nodes panel)
- **Availability:** self-hosted only

The node lets users write JavaScript that works directly with LangChain
constructs, as an escape hatch for functionality n8n has no dedicated node for.
Unlike the regular Code node (`n8n-nodes-base.code`), it does **not** support
Python.

### Connector channel types (documented)

The non-`main` input/output channels are fixed connection types; the node
surfaces whichever subset the workflow config selects:

`ai_agent`, `ai_chain`, `ai_document`, `ai_embedding`, `ai_languageModel`,
`ai_memory`, `ai_outputParser`, `ai_retriever`, `ai_textSplitter`, `ai_tool`,
`ai_vectorRetriever`, `ai_vectorStore`

## Parameters

The docs describe the configuration functionally; exact parameter keys are not
published in the docs and are **inferred** below. Implementations should accept
these names but stay tolerant (import-compat surface).

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `mode` | options | `execute` | yes | — | `execute` — process workflow data through code (needs main input + main output); `supplyData` — act as a sub-node feeding a root node over a non-main channel (no main output) |
| `jsCode` | code | `''` | yes | — | The user-supplied JavaScript body. Runs in the sandbox; built-in/external modules are **not** loadable by default (self-hosted opt-in via instance config) |
| `inputs` | multiOptions | `['main']` | no | — | Which input channels to expose; values from the channel list above plus `main` |
| `outputs` | multiOptions | `['main']` | no | — | Which output channels to expose; values from the channel list above plus `main` |

### Role determined by connector config (documented)

| Intended role | Inputs | Outputs | Mode |
|---|---|---|---|
| App node (like the Code node) | `main` | `main` | execute |
| Root node | `main` + at least one other channel | `main` | execute |
| Sub-node | — (none) | a non-`main` channel matching the target input type | supplyData |
| Sub-node with sub-nodes | a non-`main` channel | a non-`main` channel matching the target input type | supplyData |

A `main` input + `main` output configuration **requires** execute mode.

## Runtime behavior

### Input

- In **execute** mode the node consumes `main` items (from an upstream workflow
  node) and any configured AI channels. Upstream data is available to the code
  through the standard item helpers (`$json`, `$input`, etc.).
- In **supplyData** mode the node has no `main` input; it only pushes data out
  on a configured non-`main` channel for a consuming root node.

### Output

- In **execute** mode, code returns items on `main` (an array of
  `{ json, binary? }` items, like the Code node), which continue the workflow.
- In **supplyData** mode, code publishes a value on the configured non-`main`
  output channel (e.g. an `ai_document`, `ai_tool` or `ai_languageModel`
  handle) that the parent root node consumes at its matching input.
- The node also exposes `main` as an output for root-node runs.

### Code-side helpers (documented; usable in expressions in this node only)

| Helper | Contract |
|---|---|
| `this.getInputData(inputIndex?, inputName?)` | Read items from the `main` input |
| `this.getInputConnectionData(inputName, itemIndex, inputIndex?)` | Resolve a connected sub-node's value on a non-`main` input channel. `inputName` must be one of the 12 channel types; `itemIndex` should be `0`; `inputIndex` disambiguates multiple nodes on the same channel |
| `this.addInputData(inputName, data)` | Populate a non-`main` input channel with data (useful for mocking). Data follows n8n's documented item/data-structure shape |
| `this.addOutputData(outputName, data)` | Populate a non-`main` output channel with data (the supplyData mechanism). `outputName` must be one of the 12 channel types |
| `this.getNode()` | Return the current node definition/config |
| `this.getNodeOutputs()` | Return the current node's configured outputs |
| `this.getExecutionCancelSignal()` | Return a cancellation signal that fires when the workflow is stopped, so long-running chains/agents in user code can abort |

### Errors

- Thrown JavaScript errors and rejected promises in the code body abort the
  node with the thrown message.
- With `continueOnFail`, a failure emits a single error item
  `{ json: { error: <message> } }` on the node's output instead of throwing
  (standard n8n behavior; inferred for this node).
- Misconfiguration errors: execute mode without a `main` output, or a
  `supplyData` mode configured with `main` outputs, is rejected.

### Expressions

- The code body is JavaScript, not an expression template, but the documented
  `this.*` helpers are also available inside expressions on this node's
  parameters.

### Security posture

- Deprecated: hidden node, self-hosted only, and (per the docs) carries
  critical security issues. Default sandbox does **not** permit importing
  built-in or external modules; enabling modules is an explicit self-hosted
  instance configuration.

## Acceptance tests

### Test: execute-mode-transform

**Given** input items:

```json
[{ "json": { "name": "Ada" } }, { "json": { "name": "Grace" } }]
```

**Parameters:**

```json
{
  "mode": "execute",
  "jsCode": "return $input.all().map(i => ({ json: { greeting: `Hello ${i.json.name}` } }));",
  "inputs": ["main"],
  "outputs": ["main"]
}
```

**Expect** output[0]:

```json
[
  { "json": { "greeting": "Hello Ada" } },
  { "json": { "greeting": "Hello Grace" } }
]
```

### Test: execute-mode-requires-main-output

**Given** input items:

```json
[{ "json": { "a": 1 } }]
```

**Parameters:**

```json
{
  "mode": "execute",
  "jsCode": "return $input.all();",
  "inputs": ["main"],
  "outputs": ["ai_languageModel"]
}
```

**Expect** a validation error — execute mode requires a `main` output (no items
are emitted; error item only if `continueOnFail` is set).

### Test: supply-data-mode-document-channel

**Given** no `main` input items (node starts a run or is reached from an
upstream main connection with no items).

**Parameters:**

```json
{
  "mode": "supplyData",
  "jsCode": "this.addOutputData('ai_document', { document: [{ pageContent: 'hello world', metadata: { source: 'test' } }] }); return [];",
  "inputs": [],
  "outputs": ["ai_document"]
}
```

**Sub-nodes connected:** a root node (e.g. Question and Answer Chain or a
vector-store insert path) consumes the `ai_document` channel.

**Expect** the root node receives one document with `pageContent` `"hello
world"` and `metadata.source` `"test"`.

### Test: resolve-model-handle

**Given** no `main` input items.

**Parameters:**

```json
{
  "mode": "supplyData",
  "jsCode": "const model = this.getInputConnectionData('ai_languageModel', 0); const res = await model.invoke('Reply with OK'); this.addOutputData('ai_chain', res); return [];",
  "inputs": ["ai_languageModel"],
  "outputs": ["ai_chain"]
}
```

**Sub-nodes connected:** `ai_languageModel` ← OpenAI Chat Model (test stub).

**Expect** the connected model is invoked once with `"Reply with OK"` and its
response is published on the `ai_chain` output channel.

### Test: hidden-and-unavailable

**Given** an OpenFlow editor with this node type registered.

**Expect** the type is absent from the add-node panel (hidden), is rejected on
cloud deployments (self-hosted only), and workflow JSON importing a node of
this type keeps its parameters losslessly as a placeholder/legacy node.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Deprecation, hidden, self-hosted-only | documented | Docs warning banner + availability note |
| No Python support (unlike Code node) | documented | Docs comparison note |
| Execute vs Supply Data modes + role table | documented | Docs node-parameters + role table |
| 12 non-`main` channel types | documented | Method reference lists the enum verbatim |
| Built-in code helpers (`addInputData`, `addOutputData`, `getInputConnectionData`, `getInputData`, `getNode`, `getNodeOutputs`, `getExecutionCancelSignal`) | documented | Node page + built-in-shortcuts reference |
| Module-loading restriction + self-hosted opt-in | documented | Docs node-parameters note |
| Exact parameter names (`mode`, `jsCode`, `inputs`, `outputs`) | inferred | Docs publish UI labels only; keys are a compatibility guess |
| Default value of `mode` (`execute`) | inferred | Docs list Execute first |
| Error handling / `continueOnFail` item shape | inferred | Standard n8n pattern; not documented for this node |
| Wire parameter names / `typeVersion` | undocumented | Deprecated node; no public workflow JSON found using it; corpus (n8n-nodes-base@2.15.1) has no langchain descriptor |
| Exact data structure for `addInputData`/`addOutputData` | partially documented | Docs link to an internal "Data structure" reference; treat as n8n item shape `{ json, binary? }` |

## OpenFlow mapping

- **Definition group:** `ai` (langchain cluster; configurable app/root/sub-node role)
- **Executor file:** `src/lib/engine/executors/langchain-code.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only; channel resolution via the SDK's cluster-connection helpers (`ai_*` channels + `main`)
- **Registration:** registered as **hidden** (not in add-node panel) and gated to self-hosted deployments; import path preserves parameters for round-trip compatibility
