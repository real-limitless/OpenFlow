---
type: n8n-nodes-base.bubbleTool
displayName: Bubble (AI Tool)
category: AI Tool
versions: [1]
priority: medium
status: specced
---

# Bubble (AI Tool)

A tool variant of the Bubble node, designed for use as an AI agent tool. When connected to an AI Agent, the agent model can dynamically populate parameters using the `$fromAI()` function. Wraps the Bubble Data API with a single Object resource supporting Create, Delete, Get, Get All, and Update operations against a Bubble application's database.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.bubble/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/bubble.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |
| https://manual.bubble.io/help-guides/integrations/api/the-bubble-api/the-data-api/data-api-endpoints.md | External API docs |

## Wire format

- **Type string:** `n8n-nodes-base.bubbleTool`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `bubbleApi` (API key + app name + domain/environment)

## Parameters

### Authentication

Uses the `bubbleApi` credential type which requires:
- **API Token** — a private API key generated in Bubble's Settings > API tab
- **App Name** — the Bubble app name (the subdomain prefix before `.bubbleapps.io`)
- **Environment** — `Development` (version-test) or `Live`
- **Hosting** — `Bubble Hosting` (bubbleapps.io) or `Self Hosted` (custom domain)
- **Domain** — required only when Self Hosted is selected

### Resource / Operation

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| resource | options | `object` | yes | Fixed to `object` — the tool targets Bubble database objects |
| operation | options | — | yes | One of: `create`, `delete`, `get`, `getAll`, `update` |

### Object operations

| Operation | Key parameters |
|-----------|----------------|
| Create | Type Name (Bubble data type slug), Fields (JSON map of field values) |
| Delete | Type Name, Object ID |
| Get | Type Name, Object ID |
| Get All | Type Name, filters (optional constraints/field comparisons), Return All, Limit, Sort options |
| Update | Type Name, Object ID, Fields (JSON map of updated field values) |

### AI tool-specific behavior

When used as an AI agent tool:
- Parameters can be populated dynamically by the AI model via `$fromAI()` expressions
- Tool name and description metadata are configurable in the AI Agent node
- The Type Name parameter resolves to the Bubble data type slug (lowercase, no spaces)
- The Fields parameter for create/update accepts a JSON object whose keys map to Bubble field names

## Runtime behavior

### Input

Consumes items from `main` input. Parameters may reference item data through expressions.

### Output

**Output[0]** — one item per input item, containing the Bubble Data API response:

- **Create:** the newly created object with its `_id` and all field values
- **Get:** the single object fields including `_id`
- **Get All:** an object with a `response` array containing matching objects (or `results` depending on Bubble API version) plus `count` and optionally `cursor` for pagination
- **Update:** the updated object with all current field values
- **Delete:** confirmation response from the Bubble API

### Errors

- Bubble API errors (authentication failure, invalid type name, privacy rule violations, not-found) propagate as node errors
- `continueOnFail` allows the workflow to proceed on error
- Missing required parameters (Type Name, Object ID for single-object operations) throw before API calls
- The Bubble Data API enforces privacy rules (create/modify/delete via API) which must be enabled in the Bubble app's privacy rule settings

### Expressions

All string/number/boolean/enum parameters accept n8n expression strings. Parameters tagged as AI-populatable accept `$fromAI()` expressions. Resource/operation selectors are typically static.

## Acceptance tests

### Test: Create an object

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "object",
  "operation": "create",
  "typeName": "rentalunit",
  "fields": "{\"name\": \"Studio Apartment\", \"price\": 1200}"
}
```

**Expect** output[0].json to contain an `_id` field and fields matching the input, with `name` equal to `Studio Apartment`.

### Test: Get an object by ID

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "object",
  "operation": "get",
  "typeName": "rentalunit",
  "objectId": "12345abcdef"
}
```

**Expect** output[0].json to contain `_id` matching the requested ID and a `name` field.

### Test: Get All objects with limit

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "object",
  "operation": "getAll",
  "typeName": "rentalunit",
  "returnAll": false,
  "limit": 10
}
```

**Expect** output[0].json to contain a `response` array with at most 10 entries, each containing `_id`.

### Test: Update an object

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "object",
  "operation": "update",
  "typeName": "rentalunit",
  "objectId": "12345abcdef",
  "fields": "{\"price\": 1500}"
}
```

**Expect** output[0].json to contain `_id` matching the requested ID and `price` equal to `1500`.

### Test: Delete an object

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "object",
  "operation": "delete",
  "typeName": "rentalunit",
  "objectId": "12345abcdef"
}
```

**Expect** output[0].json to confirm successful deletion status from the Bubble API.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Bubble operations and parameters | documented | Public docs list all 5 object operations for the Bubble app node; tool variant shares same operations |
| AI tool parameter support | documented | Public n8n docs confirm `$fromAI()` support for tool variants |
| Credential field names | documented | Public Bubble credentials docs confirm API Token, App Name, Environment, Hosting, and Domain fields |
| Credential type name | inferred from corpus | `bubbleApi` confirmed from package metadata |
| Bubble Data API endpoint structure | documented | Bubble manual documents REST endpoints at `/api/1.1/obj/{typename}` with GET/POST/PUT/DELETE |
| Specific Bubble API response shapes | inferred | Response format varies by Bubble version; only functional outcomes are spec'd |
| Tool-specific parameter layout | inferred | The tool variant wraps the standard Bubble operations identically in agent context |

## OpenFlow mapping

- **Definition group:** `tools`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.bubbleTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
