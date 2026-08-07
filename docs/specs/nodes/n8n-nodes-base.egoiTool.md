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
| https://developers.e-goi.com/api/v3/ | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.egoiTool`
- **Aliases:** (none)
- **Inputs:** `main` × 1, `ai_tool` × 1
- **Outputs:** `main` × 1
- **Credentials:** `egoiApi` (API key)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | string | contact | yes | — | Must be `contact`. |
| operation | string | create | yes | resource = contact | One of: create, get, getAll, update. |
| listId | number | — | yes | resource = contact | Target list ID. Dynamically loaded from E-goi API. Accepts `$fromAI()`. |
| email | string | — | conditionally | operation in (create, get, update) | Contact email address. Accepts `$fromAI()` expressions. Required for create, get, update. |
| updateAction | string | — | no | operation = update | One of: replace, append. |
| extraFields | object | — | no | resource = contact | Key-value pairs for subscriber custom fields. Dynamic field names loaded from E-goi API by list. Accepts `$fromAI()`. |
| tagIds | array[number] | — | no | resource = contact | One or more tag IDs. Options loaded from E-goi API. Accepts `$fromAI()`. |
| options.status | string | active | no | resource = contact | One of: active, inactive, removed, unconfirmed. |
| options.subscribeDate | string | — | no | operation = create | ISO-8601 date string. |
| options.unsubscribeDate | string | — | no | operation = update | ISO-8601 date string. |
| options.confirmationDate | string | — | no | operation = create | ISO-8601 date string. |
| options.firstName | string | — | no | resource = contact | Accepts `$fromAI()`. |
| options.lastName | string | — | no | resource = contact | Accepts `$fromAI()`. |
| options.birthDate | string | — | no | resource = contact | ISO-8601 date string. |
| options.phone | string | — | no | resource = contact | Accepts `$fromAI()`. |
| options.phoneIndicative | string | — | no | resource = contact | Country calling code, e.g. `+1`. |
| options.cellphone | string | — | no | resource = contact | Accepts `$fromAI()`. |
| options.cellphoneIndicative | string | — | no | resource = contact | Country calling code. |
| returnAll | boolean | false | no | operation = getAll | If false, `limit` is required. |
| limit | number | 50 | no | operation = getAll, returnAll = false | Maximum contacts to return. |

## Runtime behavior

### Input

Each input item is processed independently. When connected to an AI Agent, the `ai_tool` input channel may provide parameter values dynamically via `$fromAI()` expressions. The node connects to the E-goi REST API v3 to perform the configured operation.

### Output

| operation | Output shape |
|-----------|-------------|
| create | The created contact object (subscriber hash, email, status, etc.) |
| get | The single contact matching `email` within `listId` |
| getAll | An array of contact objects for the given `listId`; respects `returnAll`/`limit` |
| update | The updated contact object after applying changes |
| error | `NodeApiError` with `continueOnFail` support |

### Dynamic loading

Three loadOptions functions resolve API-backed option lists:

- **getLists** — Populates the `listId` dropdown with available E-goi mailing lists.
- **getExtraFields** — Given a selected `listId`, loads the custom extra fields for that list as key-value pairs.
- **getListTags** — Given a selected `listId`, loads available tags.

### AI Agent integration

As a Tool variant, the node appears in the AI Agent's Tools panel. When the AI Agent invokes the tool, `$fromAI()` fills any expression-enabled parameter from the agent's conversational context. Parameters not populated by the AI remain at their configured defaults.

### Expressions

All string parameters accept expression strings and `$fromAI()` templates. Dynamic-option parameters resolve options server-side via loadOptions but the selected value may also be an expression.

### Errors

- Missing required params (`listId`, `email` for create/get/update) throw `NodeOperationError`.
- API-level errors (auth failure, not found, rate-limit) are wrapped as `NodeApiError`.
- `continueOnFail`: when enabled, errored items produce output items with `json` containing `error` metadata.

## Acceptance tests

### Test: create contact via AI agent

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "contact",
  "operation": "create",
  "listId": "={{ $fromAI('listId') }}",
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
    "subscriber_hash": "",
    "email": "",
    "status": "active"
  }
}]
```

The actual subscriber_hash and email are populated by the AI Agent at runtime.

### Test: get contact by email

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "contact",
  "operation": "get",
  "listId": 1,
  "email": "test@example.com"
}
```

**Expect** output[0] to contain a single contact object with `subscriber_hash`, `email`, and `status` fields.

### Test: getAll contacts with returnAll

**Given** input items:

```json
[{ "json": {} }]
```

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

### Test: missing email on create throws

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "contact",
  "operation": "create",
  "listId": 1
}
```

**Expect** a `NodeOperationError` with a message indicating the email is required. With `continueOnFail: true`, output[0] contains an error-annotated item instead.

### Test: tool-mode response shape

**Given** the node is invoked as a tool by an AI Agent, **expect** that the output JSON includes only the essential fields needed for the agent's decision loop (subscriber_hash, email, status), without large unnecessary response bodies.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resources & operations | Public docs | Contact-only resource, same 4 operations as base E-goi node |
| Parameter shapes | Inferred from corpus metadata | Matches base E-goi node; `$fromAI()` support inferred from Tool convention |
| Dynamic loading | Confirmed by corpus | Same three loadOptions as base node: getLists, getExtraFields, getListTags |
| Credential type | Public docs | `egoiApi` API key only; no OAuth2 |
| AI Agent integration | Public docs | Standard Tool variant behavior: `ai_tool` input, `$fromAI()`, tools panel |
| API endpoints | Public E-goi API v3 docs | https://developers.e-goi.com/api/v3/ |

## OpenFlow mapping

- **Definition group:** `communication`
- **Executor file:** `src/lib/engine/executors/EgoiTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
