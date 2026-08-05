---
type: n8n-nodes-base.egoiTool
displayName: E-goi Tool
category: Communication, Marketing
versions: [1]
priority: medium
status: specced
---

# E-goi Tool

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.egoi/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/egoi/ | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work/ | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters/ | Public docs only |
| https://developers.e-goi.com/api/v3/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.egoiTool`
- **Aliases:** `n8n-nodes-base.egoi` (shared implementation — Tool alias of the base E-goi node with `usableAsTool: true`)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `egoiApi` (API key)

## Parameters

The Tool variant exposes the same Contact resource operations as the base E-goi node (create, get, getAll, update). All parameters are eligible for `$fromAI()` dynamic population when connected to an AI Agent.

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | string | contact | yes | — | Must be `contact`. |
| operation | string | create | yes | resource = contact | One of: create, get, getAll, update. |
| listId | number | — | yes | resource = contact | Target E-goi mailing list ID. When used with `$fromAI()`, the AI model resolves the correct list from context. |
| email | string | — | conditionally | operation in (create, get, update) | Contact email address. Required for create, get, update. Supports `$fromAI()`. |
| updateAction | string | — | no | operation = update | One of: replace, append. |
| extraFields | object | — | no | resource = contact | Key-value pairs for subscriber-level custom fields. Dynamic field names resolved from E-goi API by list. |
| tagIds | array[number] | — | no | resource = contact | Tag IDs to assign. Options loaded from E-goi API. |
| options.status | string | active | no | resource = contact | One of: active, inactive, removed, unconfirmed. |
| options.subscribeDate | string | — | no | operation = create | ISO-8601 date string. |
| options.unsubscribeDate | string | — | no | operation = update | ISO-8601 date string. |
| options.confirmationDate | string | — | no | operation = create | ISO-8601 date string. |
| options.firstName | string | — | no | resource = contact | Supports `$fromAI()`. |
| options.lastName | string | — | no | resource = contact | Supports `$fromAI()`. |
| options.birthDate | string | — | no | resource = contact | ISO-8601 date string. |
| options.phone | string | — | no | resource = contact | Supports `$fromAI()`. |
| options.phoneIndicative | string | — | no | resource = contact | Country calling code. |
| options.cellphone | string | — | no | resource = contact | Supports `$fromAI()`. |
| options.cellphoneIndicative | string | — | no | resource = contact | Country calling code. |
| returnAll | boolean | false | no | operation = getAll | If false, `limit` is required. |
| limit | number | 50 | no | operation = getAll, returnAll = false | Maximum contacts to return. |

## Runtime behavior

### Input

Each input item is processed independently. The node connects to the E-goi REST API v3 to perform the configured operation.

### AI Agent integration

When connected to an AI Agent (Tools Agent), the node advertises its capabilities as a tool. The AI model can dynamically populate any parameter using `$fromAI()` expressions, allowing the agent to decide the list, contact email, and field values based on conversation context and other tool outputs.

### Output

| operation | Output shape |
|-----------|-------------|
| create | The created contact object from the E-goi API response |
| get | The single contact matching `email` within `listId` |
| getAll | An array of contact objects for the given `listId`; respects `returnAll`/`limit` |
| update | The updated contact object from E-goi API |

### Dynamic loading

Three load functions resolve API-backed option lists:

- **getLists** — Populates `listId` dropdown with available E-goi mailing lists.
- **getExtraFields** — Given a selected `listId`, loads the custom extra fields configured for that list.
- **getListTags** — Given a selected `listId`, loads the available tags.

### Expressions

All string parameters accept expression strings, including `$fromAI()` for AI agent dynamic population.

### Errors

- Missing required params throw `NodeOperationError`.
- API-level errors (auth, not found, rate-limit) are wrapped as `NodeApiError`.
- `continueOnFail`: errored items produce output items with `json` containing `error` metadata instead of halting.

## Acceptance tests

### Test: create contact via AI agent

**Given** input items:

```json
[{ "json": { "email": "ai-contact@example.com", "firstName": "Alice" } }]
```

**Parameters:**

```json
{
  "resource": "contact",
  "operation": "create",
  "listId": 1,
  "email": "={{ $fromAI('email') }}",
  "options": {
    "firstName": "={{ $fromAI('firstName') }}"
  }
}
```

**Credentials:** valid `egoiApi` API key

**Expect** output[0]:

```json
[{
  "json": {
    "subscriber_hash": "abc123def456",
    "email": "ai-contact@example.com",
    "first_name": "Alice",
    "status": "active"
  }
}]
```

### Test: get contact via AI agent

**Parameters:**

```json
{
  "resource": "contact",
  "operation": "get",
  "listId": 1,
  "email": "={{ $fromAI('email') }}"
}
```

**Expect** output[0] to contain a single contact object with `subscriber_hash`, `email`, and `status` fields.

### Test: getAll contacts

**Parameters:**

```json
{
  "resource": "contact",
  "operation": "getAll",
  "listId": 1,
  "returnAll": true
}
```

**Expect** output[0] to be an array of contact objects.

### Test: update contact

**Parameters:**

```json
{
  "resource": "contact",
  "operation": "update",
  "listId": 1,
  "email": "test@example.com",
  "updateAction": "append",
  "options": { "status": "inactive" }
}
```

**Expect** output[0] to contain a single updated contact with `status` reflecting the change.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resources & operations | Public docs | Same Contact resource with 4 operations as base E-goi node |
| Tool variant behavior | Public docs | Tool nodes expose `usableAsTool: true` and support `$fromAI()` for AI agent parameter population |
| Parameter shapes | Inferred from base E-goi spec | Shares all parameters with `n8n-nodes-base.egoi`; no separate docs page exists for this variant |
| Credential type | Public docs | API key only (`egoiApi`) |
| AI agent integration | Public docs | n8n tool pattern: tool nodes connect to AI Agent via `ai_tool` connector |

## OpenFlow mapping

- **Definition group:** `communication`
- **Executor file:** `src/lib/engine/executors/EgoiTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
