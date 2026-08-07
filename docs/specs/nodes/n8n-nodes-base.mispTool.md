---
type: n8n-nodes-base.mispTool
displayName: MISP Tool
category: Integration
versions: [1]
priority: medium
status: specced
---

# MISP Tool

AI agent tool variant of the MISP node. Exposes MISP threat intelligence operations as callable tools for AI agents.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.misp/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/misp/ | Public docs only |
| https://www.circl.lu/doc/misp/automation | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.mispTool`
- **Aliases:** (none)
- **Inputs:** `main` x 1 (AI agent tool invocation)
- **Outputs:** `main` x 1
- **Credentials:** `mispApi` (API key + base URL + allow-unauthorized-certificates toggle)

## Parameters

The node wraps all resources and operations of the base MISP node. When invoked from an AI agent, parameters are populated dynamically via `$fromAI()`. The operator selects a resource and operation; the AI agent supplies the required input fields at runtime.

| Resource | Operations |
|----------|-----------|
| Attribute | Create, Delete, Get, Get All, Search, Update |
| Event | Create, Delete, Get, Get All, Publish, Search, Unpublish, Update |
| Event Tag | Add, Remove |
| Feed | Create, Disable, Enable, Get, Get All, Update |
| Galaxy | Delete, Get, Get All |
| Noticelist | Get, Get All |
| Object | Search |
| Organisation | Create, Delete, Get, Get All, Update |
| Tag | Create, Delete, Get All, Update |
| User | Create, Delete, Get, Get All, Update |
| Warninglist | Get, Get All |

Each operation accepts domain-specific parameters matching the MISP REST API fields (e.g. event UUID, attribute value/type/category, tag name/colour, org name, user email/role, feed URL/source-format, sharing-group ID, distribution level, threat level, analysis stage, publish flag). Dynamic option loading is available for organisations, sharing groups, tags, and users.

## Runtime behavior

### Input

Each input item triggers one MISP API call. The AI agent selects the resource and operation; the executor resolves target URL from the credential's base URL, authenticates via the `Authorization: <api-key>` header, and sends the request with `Accept: application/json` and `Content-Type: application/json`.

### Output

Each output item contains the MISP API response under a key matching the resource name (lowercase). For list operations the response is an array of records; for create/update operations the response is the created or modified record; for delete operations the response is a confirmation message.

### Errors

Non-2xx responses from the MISP API produce a `NodeOperationError`. The `continueOnFail` option allows the item to pass through with an error property instead of halting.

### Expressions

All parameters accept expression strings. The node supports `$fromAI()` for AI-agent-driven parameter population.

## Acceptance tests

### Test: create event

**Given** one input item with `{"json": {}}` and a valid mispApi credential.

**Parameters:**
```json
{
  "resource": "event",
  "operation": "create",
  "info": "Test event created by n8n",
  "date": "2026-01-15",
  "analysis": "2",
  "threatLevelId": "1",
  "distribution": "0"
}
```

**Expect** output[0] to contain `{ "json": { "Event": { "id": "<numeric>", "info": "Test event created by n8n", ... } } }`.

### Test: add attribute to event

**Given** one input item.

**Parameters:**
```json
{
  "resource": "attribute",
  "operation": "create",
  "eventId": "{{ $json.eventId }}",
  "type": "ip-dst",
  "value": "8.8.8.8",
  "category": "Network activity"
}
```

**Expect** output[0] to contain a response with the created attribute including `type`, `value`, and `event_id`.

### Test: search events by tag

**Given** one input item.

**Parameters:**
```json
{
  "resource": "event",
  "operation": "search",
  "tags": ["tlp:green"]
}
```

**Expect** output[0] to contain an array of events matching the tag filter.

### Test: get all organisations

**Given** one input item.

**Parameters:**
```json
{
  "resource": "organisation",
  "operation": "getAll"
}
```

**Expect** output[0] to contain an array of organisation records with `id` and `name`.

### Test: add tag to event

**Given** one input item.

**Parameters:**
```json
{
  "resource": "eventTag",
  "operation": "add",
  "eventId": "{{ $json.eventId }}",
  "tagId": "tlp:amber"
}
```

**Expect** output[0] to confirm the tag was attached to the event.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Base MISP operations | Documented | Public n8n docs list all resources and operations |
| Credential shape | Documented | API key + base URL + allow-unauthorized-certificates |
| MISP REST API contract | Documented | Public circl.lu automation docs |
| Tool-specific $fromAI() behavior | Inferred | Standard pattern for n8n Tool nodes; no dedicated mispTool docs page exists (404) |
| Exact field names per operation | Inferred | Follow MISP REST API field conventions; AI agent populates dynamically |
| Load options (orgs, tags, sharing groups, users) | Inferred from DTS type declarations | Standard n8n pattern for dynamic option loading |

## OpenFlow mapping

- **Definition group:** `integration`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.mispTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
