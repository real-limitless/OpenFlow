---
type: n8n-nodes-base.pipedriveTool
displayName: Pipedrive Tool
category: Integration
versions: [1]
priority: medium
status: specced
---

# Pipedrive Tool

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.pipedrive.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/pipedrive.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |

This is the AI agent tool variant of the Pipedrive node. No dedicated docs page
exists for the `pipedriveTool` type string — it is the same underlying Pipedrive
node presented to AI agents as a callable tool with `$fromAI()` parameter
support. No third-party node source was consulted.

## Wire format

- **Type string:** `n8n-nodes-base.pipedriveTool`
- **Aliases:** none documented
- **Inputs:** `main` x 1
- **Outputs:** `main` x 1
- **Credentials:** Pipedrive credential (API token or OAuth2)

An AI agent tool sub-node that connects on the `ai_tool` output channel. When a
connected agent invokes it, the tool runs the requested Pipedrive operation and
returns the result to the agent.

## Parameters

The resource and operation set is identical to the regular Pipedrive node. The
key difference is that every parameter that can be AI-populated supports
`$fromAI()` expressions. When the tool is connected to a Tools Agent, the agent
model can supply any or all parameters dynamically based on conversation context
and other connected tools.

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | enum-like string | none | yes | always | Selects Activity, Deal, Deal Activity, Deal Product, File, Lead, Note, Organization, Person, or Product. Supports `$fromAI()`. |
| operation | enum-like string | none | yes | depends on resource | Selects the documented action for the resource (create, get, getAll, update, delete, search, duplicate, relationship listing, product association changes, download, file metadata retrieval). Supports `$fromAI()`. |
| resource identifier | string/number | none | conditional | single-record actions | Identifies the target record. Supports `$fromAI()`. |
| request fields | object | empty | conditional | create/update actions | Fields accepted by the selected Pipedrive API operation, using the service's documented names and types. Supports `$fromAI()`. |
| query and filters | object | empty | conditional | list/search actions | Pagination, filtering, search text, and related selectors. Supports `$fromAI()`. |
| relationship identifiers | string/number | none | conditional | deal activity/product actions | Parent deal ID and, for product operations, associated product ID. Supports `$fromAI()`. |
| file input/output settings | binary reference + options | none | conditional | file create/download actions | Create reads binary data from an input item; download returns file content as OpenFlow binary property. |

Every user-facing parameter may also be populated by the AI agent via
`$fromAI('key', 'description', 'type', 'default')` expressions. The tool does
not expose the underlying node's full nested UI; it delegates value selection to
the agent.

Tool name and description are derived from the node's configured name and
description for agent tool registration.

## Runtime behavior

### Input

The tool receives the agent's invocation context as a single `main` input item
whose JSON body may contain the fields the agent chose to pass. If no item is
provided the tool may still execute for agent-defined parameters.

The tool resolves `$fromAI()` expressions by querying the agent model for the
required values before validation.

### Output

Emits one `main` item per successful invocation. The output JSON contains the
Pipedrive API result (record data, list results, or success indication). The
result flows back to the agent's conversation context for the agent to
synthesize a natural-language response.

### Errors

Fails for missing credentials, invalid resource/operation combinations,
authentication/authorization failure, transport failure, rate limiting, and
non-success API responses. When `continueOnFail` is enabled, returns an
item-level error representation for the failed input and continues.

Because this is a tool called by an AI agent, the agent should handle the
error gracefully and report it to the user or retry with different parameters.

### Expressions

All parameters accept OpenFlow expressions including `$fromAI()`. Resolve
expressions per input item before validation.

## Acceptance tests

### Test: agent creates a deal via tool

**Given** an AI agent invocation context with deal parameters.

**Parameters:**
```json
{
  "resource": "Deal",
  "operation": "create",
  "requestFields": { "title": "Enterprise License", "value": 5000, "currency": "USD" }
}
```

**Expect** output[0] to contain a successful deal result with the service
identifier and the submitted title/value.

### Test: agent searches persons

**Given** an AI agent invocation with a search term.

**Parameters:**
```json
{
  "resource": "Person",
  "operation": "search",
  "query": { "term": "Acme Corp" }
}
```

**Expect** one output item containing person search results from the Pipedrive
API.

### Test: agent reads a deal by ID

**Given** a deal ID.

**Parameters:**
```json
{
  "resource": "Deal",
  "operation": "get",
  "resourceIdentifier": 123
}
```

**Expect** one output item with the deal data for ID 123.

### Test: agent lists deals with pagination

**Given** agent supplies limit.

**Parameters:**
```json
{
  "resource": "Deal",
  "operation": "getAll",
  "query": { "limit": 10 }
}
```

**Expect** one output item containing the deal collection with up to 10 records
and available pagination information.

### Test: agent handles credential failure

**Given** invalid or missing Pipedrive credentials.

**Parameters:**
```json
{ "resource": "Deal", "operation": "get", "resourceIdentifier": 1 }
```

**Expect** a credential or authorization error that propagates back through the
tool interface.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string `n8n-nodes-base.pipedriveTool` | inferred | No dedicated docs page; the underlying node is `n8n-nodes-base.pipedrive` and the tool variant uses a distinct type string for AI-agent registration. |
| Resource and operation families | documented | Listed on the public Pipedrive node page. |
| API token and OAuth2 credentials | documented | Listed on the public credential page. |
| $fromAI() parameter population | documented | Public AI parameters documentation. |
| One main input and one main output | inferred | Standard tool-node wire contract. |
| Tool name/description derivation | inferred | Standard AI tool registration convention. |
| Execution semantics per agent invocation | inferred | Standard tool execution model — the node runs once per call with the agent-supplied parameters. |

## OpenFlow mapping

- **Definition group:** `integration`
- **Executor file:** `src/lib/engine/executors/pipedriveTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
