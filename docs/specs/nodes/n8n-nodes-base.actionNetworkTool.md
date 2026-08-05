---
type: n8n-nodes-base.actionNetworkTool
displayName: Action Network Tool
category: Sales
versions: [1]
priority: medium
status: specced
---

# Action Network Tool

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.actionnetwork.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/actionnetwork.md | Public docs only |
| https://actionnetwork.org/docs/ | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.actionNetworkTool`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `actionNetworkApi` (API key)

## Parameters

The node exposes every operation from the Action Network base node (7 resources, 22 operations) as a flat resource/operation selection. All operation-specific parameter fields support `$fromAI()` dynamic population when connected to an AI Agent Tools Agent.

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| resource | string | — | yes | Enum: Attendance, Event, Person, Person Tag, Petition, Signature, Tag |
| operation | string | — | yes | Depends on resource (see Resource/Operation matrix below) |
| (operation-specific params) | varies | — | per operation | Fields such as personId, eventId, petitionId, tagId, body, etc. |

### Resource/Operation matrix

**Attendance:** Create, Get, Get All
**Event:** Create, Get, Get All
**Person:** Create, Get, Get All, Update
**Person Tag:** Add, Remove
**Petition:** Create, Get, Get All, Update
**Signature:** Create, Get, Get All, Update
**Tag:** Create, Get, Get All

All operation-specific parameters match the original Action Network API fields (e.g. `email`, `givenName`, `familyName` for Person Create; `title`, `originSystem` for Event Create; `name` for Tag Create). The intent is to pass those values through to the corresponding Action Network API v2 endpoints.

### Options

Each operation may have an **Options** collection for additional query/post body modifiers (e.g. pagination `perPage` for GetAll operations, or `addTags` for Person Create). These follow the same naming as documented Action Network API v2 parameters and are all expression-capable.

### AI tool behavior

Every parameter field exposes a `$fromAI()` toggle. When activated, the AI Agent model selects the value based on conversation context, tool descriptions, and connected tool outputs. The node behaves identically to the base Action Network node in all other respects — the tool variant simply marks `usableAsTool: true` in the node definition.

## Runtime behavior

### Input

Each input item is processed independently. For Create/Update operations, the input item's JSON properties can be referenced in parameter expressions but are not automatically merged — the user must explicitly map fields.

### Output

Each operation emits one output item per API resource processed:
- **Create:** Returns the created resource object from the Action Network API, wrapped in `{ json: {...} }`.
- **Get:** Returns the single resource object.
- **Get All:** Returns an array of resource objects under `{ json: { results: [...] } }`. When `returnAll: false`, respects `limit` option.
- **Update:** Returns the updated resource object.
- **Person Tag Add/Remove:** Returns the person object after the tag association change.
- **Signature Create/Update:** Returns the signature object.

### Errors

- HTTP 4xx/5xx from the Action Network API cause the node to throw, halting execution for that item unless `continueOnFail` is enabled.
- Missing required parameters produce a validation error before any API call.
- Pagination errors (e.g. unreachable next page) throw explicitly.

### Expressions

All parameter fields accept expression strings. `$fromAI()` is available for all fields when connected to an AI Agent.

## Acceptance tests

### Test: person-create

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "Person",
  "operation": "Create",
  "email": "test@example.com",
  "givenName": "Jane",
  "familyName": "Doe"
}
```

**Expect** output[0] to contain a `json` object with the Action Network API's person representation, including `identifiers`, `email_addresses`, and assigned `id`.

### Test: event-getAll

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "Event",
  "operation": "Get All",
  "returnAll": true
}
```

**Expect** output[0] to contain `{ json: { results: [...] } }` where each element is an event object with `title`, `origin_system`, `start_date`, and `identifiers`.

### Test: petition-get

**Given** input items:

```json
[{ "json": { "petitionId": "abc123" } }]
```

**Parameters:**

```json
{
  "resource": "Petition",
  "operation": "Get",
  "petitionId": "={{ $json.petitionId }}"
}
```

**Expect** output[0] to contain the petition object matching the requested `petitionId` as `{ json: { ... } }`.

### Test: signature-create (tool mode with $fromAI)

**Given** input items and an AI Agent connected to this tool:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "Signature",
  "operation": "Create",
  "petitionId": "={{ $fromAI('petitionId', 'The petition ID to sign', 'string') }}",
  "person": {
    "email": "={{ $fromAI('email', "The signer's email address", 'string') }}",
    "givenName": "={{ $fromAI('givenName', "The signer's given name", 'string') }}",
    "familyName": "={{ $fromAI('familyName', "The signer's family name", 'string') }}"
  }
}
```

**Expect** the node to emit a signature object with `email_addresses` and `petition_url` matching the AI-agent-determined inputs.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Full operation list | Documented | Public n8n docs list all 7 resources and operations for the base Action Network node |
| Parameter names per operation | Inferred | Names follow canonical Action Network API v2 convention; exact field names confirmed from published corpus type descriptors |
| Tool-specific behavior ($fromAI) | Documented | Public n8n docs describe the AI tool pattern used by all tool-type nodes |
| Credential type | Documented | `actionNetworkApi` (API key) documented on n8n credentials page |
| Output shape details | Inferred | Follows standard n8n `{ json: ... }` envelope; Get All wraps arrays in `results` per community convention |
| Error behavior | Inferred | Standard n8n HTTP error handling; no tool-specific deviations expected |

## OpenFlow mapping

- **Definition group:** `tools`
- **Executor file:** `src/lib/engine/executors/ActionNetworkTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
