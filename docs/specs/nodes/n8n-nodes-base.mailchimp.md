---
type: n8n-nodes-base.mailchimp
displayName: Mailchimp
category: Marketing
versions: [1]
priority: medium
status: specced
---

# Mailchimp

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.mailchimp/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/mailchimp/ | Public docs only |
| n8n-nodes-base npm package descriptors (v2.15.1) under /tmp isolation | Public descriptor metadata |

## Wire format

- **Type string:** `n8n-nodes-base.mailchimp`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `mailchimpApi` (API key) or `mailchimpOAuth2Api` (OAuth2)

## Parameters

### Resource & Operation

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| resource | string | campaign | yes | campaign, listGroup, member, memberTag |
| operation | string | (varies) | yes | see per-resource below |

### Campaign resource

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | string | — | yes | resource=campaign | delete, get, getAll, replicate, resendNonOpeners, send |
| campaignId | string | — | yes* | operation∈{delete,get,replicate,resendNonOpeners,send} | Campaign ID from loadOptions |
| returnAll | boolean | false | — | operation=getAll | When true, paginate all results |
| limit | number | 50 | — | operation=getAll,returnAll=false | Max results per page |

### List Group resource

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | string | getAll | yes | resource=listGroup | getAll only |
| listId | string | — | yes | resource=listGroup | Target list ID |
| returnAll | boolean | false | — | operation=getAll | When true, paginate all groups |
| limit | number | 50 | — | operation=getAll,returnAll=false | Max results per page |

### Member resource

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | string | — | yes | resource=member | create, delete, get, getAll, update |
| listId | string | — | yes | resource=member | Target list ID |
| emailAddress | string | — | yes* | operation∈{create,delete,get,update} | Member email |
| returnAll | boolean | false | — | operation=getAll | When true, paginate all members |
| limit | number | 50 | — | operation=getAll,returnAll=false | Max results per page |
| status | string | subscribed | — | operation=create | subscribed, unsubscribed, cleaned, pending |
| mergeFields | object | — | — | operation∈{create,update} | Key-value pairs of merge field values (e.g. FNAME, LNAME) |
| options | object | — | — | operation∈{create,update} | Contains sub-fields: mergeFields, locationFields, groups |

When `jsonParameters` is false on create/update, merge fields, location fields, and groups are provided through structured sub-parameters (mergeFieldsUi, locationFieldsUi, groupsUi). When true, they are provided as a raw JSON string.

### Member Tag resource

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | string | — | yes | resource=memberTag | addTags, removeTags |
| listId | string | — | yes | resource=memberTag | Target list ID |
| emailAddress | string | — | yes | resource=memberTag | Member email |
| tags | array | [] | yes | resource=memberTag | Array of tag objects `{name, status}` |

### Common parameters

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| jsonParameters | boolean | false | — | When true, JSON fields accept raw JSON strings instead of structured UI |
| options | object | — | — | Additional API options (fields, excludeFields, etc.) |

## Runtime behavior

### Credential / Base URL derivation

The Mailchimp Marketing API base URL is `https://{dc}.api.mailchimp.com/3.0` where `{dc}` is the datacenter prefix (e.g. `us1`) extracted from the API key (the substring after the final `-` character). For OAuth2, the datacenter is obtained from the OAuth metadata endpoint response.

### Input

Each input item is processed independently. Parameters that reference list IDs, campaign IDs, or email addresses can be expressions evaluated per item.

### Output

Each operation produces one output item per API response entity. Output items use the shape `{ json: { ...responseBody } }`:

- **Campaign / getAll:** Array of campaign objects wrapped in `{ campaigns: [...], total_items: N }`
- **Campaign / get:** Single campaign object
- **Campaign / delete:** No content — output is the input item (pass-through)
- **Campaign / send:** When the API returns a 204 No Content, the output is a minimal confirmation object `{ json: { status: "sent", campaignId: "..." } }`. When the API returns a body, it is forwarded as-is.
- **Campaign / replicate:** New campaign object with the replicated campaign data
- **Campaign / resendNonOpeners:** Updated campaign object
- **List Group / getAll:** Array of list group category objects with their groups
- **Member / create, get, update:** Single member object
- **Member / getAll:** Array of member objects wrapped in `{ members: [...], total_items: N }`
- **Member / delete:** No content — input pass-through
- **Member Tag / addTags, removeTags:** Input pass-through (no response body)

### Pagination

When `returnAll=true` and the operation supports it (e.g. member/getAll, campaign/getAll, listGroup/getAll), the executor must loop with offset/query parameters until the full result set is collected. The Mailchimp API uses `offset` and `count` query parameters.

### Expressions

All string parameters accept expression strings. The `options` JSON fields accept expression strings that evaluate to objects.

### Errors

When `continueOnFail` is false, API errors throw and halt execution. When `continueOnFail` is true, the error output item is `{ json: { error: { message, statusCode, ... } } }` pushed to the output array.

## Acceptance tests

### Test: campaign send

**Given** input items:
```json
[{ "json": { "campaignId": "abc123" } }]
```

**Parameters:**
```json
{
  "resource": "campaign",
  "operation": "send",
  "campaignId": "={{ $json.campaignId }}"
}
```

**Expect** output[0] to contain either a campaign object from the API body or a minimal confirmation with `status: "sent"` when the API returns 204.

### Test: member create with merge fields

**Given** input items:
```json
[{ "json": { "listId": "list1", "email": "test@example.com" } }]
```

**Parameters:**
```json
{
  "resource": "member",
  "operation": "create",
  "listId": "={{ $json.listId }}",
  "emailAddress": "={{ $json.email }}",
  "status": "subscribed",
  "jsonParameters": true,
  "mergeFields": "{\"FNAME\":\"John\",\"LNAME\":\"Doe\"}"
}
```

**Expect** output[0].json to contain the created member object with `email_address`, `id`, `status`, `merge_fields`.

### Test: member getAll pagination

**Given** input items:
```json
[{ "json": { "listId": "list1" } }]
```

**Parameters:**
```json
{
  "resource": "member",
  "operation": "getAll",
  "listId": "={{ $json.listId }}",
  "returnAll": true
}
```

**Expect** output[0].json to contain a `members` array and `total_items`. The executor must have looped with offset/count to collect all members.

### Test: campaign delete

**Given** input items:
```json
[{ "json": { "campaignId": "abc123" } }]
```

**Parameters:**
```json
{
  "resource": "campaign",
  "operation": "delete",
  "campaignId": "={{ $json.campaignId }}"
}
```

**Expect** output[0] to be the input item (pass-through).

### Test: continueOnFail error handling

**Given** input items:
```json
[{ "json": { "campaignId": "nonexistent" } }]
```

**Parameters:**
```json
{
  "resource": "campaign",
  "operation": "send",
  "campaignId": "={{ $json.campaignId }}",
  "continueOnFail": true
}
```

**Expect** output[0].json to contain an `error` object with `message` and `statusCode`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Base URL derivation | Inferred from public docs + descriptor | API key `-{dc}` suffix is standard Mailchimp practice; OAuth metadata is documented in Mailchimp developer docs |
| Merged field UI sub-parameters | Inferred from descriptor | `mergeFieldsUi`, `locationFieldsUi`, `groupsUi` sub-parameter structure known from descriptor but not detailed in public docs |
| Campaign operations detail | Inferred from public docs only | Exact API request shapes for replicate, resendNonOpeners are not documented in n8n docs |
| List Group getAll | Inferred from public docs only | Exact API response shape inferred from Mailchimp Marketing API docs |
| Member Tag operation | Inferred from public docs + descriptor | Tags array `{name, status}` shape confirmed by descriptor |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/mailchimp.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only