---
type: n8n-nodes-base.emelia
displayName: Emelia
category: Action
versions: [1]
priority: medium
status: missing
---

# Emelia

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.emelia.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/emelia.md | Public docs only |
| https://docs.emelia.io/docs/api-reference | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.emelia`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `emeliaApi` (required, API key)

## Parameters

The node uses a resource + operation discriminator pattern.

### Resource: Campaign

| Operation | Parameter | type | default | required | notes |
|-----------|-----------|------|---------|----------|-------|
| Create | campaignName | string | — | no | Name for the new campaign |
| Get | campaignId | string | — | no | ID of the campaign to retrieve |
| Get All | returnAll | boolean | false | no | If true, return all campaigns ignoring limit |
| Get All | limit | number | — | no | Max items to return (shown when returnAll=false) |
| Pause | campaignId | string | — | no | ID of the campaign to pause |
| Start | campaignId | string | — | no | ID of the campaign to start |
| Add Contact | campaignId | string | — | no | ID of the campaign receiving the contact |
| Add Contact | contactEmail | string | — | no | Email address of the contact to add |
| Add Contact | additionalFields | collection | — | no | firstName, lastName, phoneNumber, mailsSent, lastContacted, lastOpen, lastReplied, customFieldsUi |
| Duplicate | campaignId | string | — | no | ID of the campaign to duplicate |
| Duplicate | campaignName | string | — | no | Name for the duplicated campaign |
| Duplicate | options | collection | — | no | copyContacts, copyProvider, copyMails, copySettings (booleans) |

### Resource: Contact List

| Operation | Parameter | type | default | required | notes |
|-----------|-----------|------|---------|----------|-------|
| Add | contactListId | string | — | no | ID of the list to add the contact to |
| Add | contactEmail | string | — | no | Email address of the contact to add |
| Add | additionalFields | collection | — | no | firstName, lastName, phoneNumber, mailsSent, lastContacted, lastOpen, lastReplied, customFieldsUi |
| Get All | returnAll | boolean | false | no | If true, return all lists ignoring limit |
| Get All | limit | number | — | no | Max items to return (shown when returnAll=false) |

## Runtime behavior

### Input

Each input item is processed independently. The node reads the configured parameters (resource, operation, and operation-specific fields) and performs the corresponding Emelia REST API call.

### Output

A single output item per API response is emitted on `main[0]`. The JSON body of the API response is placed at the root of the output item's `json` property. For list-style operations (Get All on both Campaign and Contact List), the response array is mapped item-by-item — one output item per element.

### Errors

- Authentication failures (invalid or missing API key) result in a node-level error.
- API-level errors (e.g., campaign not found, list not found) are surfaced as node execution errors.
- The standard `continueOnFail` behavior applies: if enabled, the node returns the error as an output item with `error: true` instead of failing the workflow.

### Expressions

All parameter values accept expression strings for dynamic resolution. The `campaignId`, `contactListId`, `contactEmail`, `campaignName`, and all `additionalFields` values support expressions.

## Acceptance tests

### Test: campaign create

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "campaign",
  "operation": "create",
  "campaignName": "Q3 Outreach"
}
```

**Expect** output[0] to contain a `json` property with the created campaign object from the Emelia API (including `id` and `name`).

### Test: campaign get all (paginated)

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "campaign",
  "operation": "getAll",
  "returnAll": false,
  "limit": 10
}
```

**Expect** output[0] to contain an array of up to 10 campaign objects.

### Test: contact list add

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "contactList",
  "operation": "add",
  "contactListId": "lst_abc123",
  "contactEmail": "user@example.com",
  "additionalFields": {
    "firstName": "John",
    "lastName": "Doe"
  }
}
```

**Expect** output[0] to contain a `json` property with the added contact object (including `leadId` and `email`).

### Test: campaign add contact with custom fields

**Given** input items:

```json
[{ "json": { "email": "lead@co.com", "company": "Acme" } }]
```

**Parameters:**

```json
{
  "resource": "campaign",
  "operation": "addContact",
  "campaignId": "cmp_xyz789",
  "contactEmail": "={{ $json.email }}"
}
```

**Expect** output[0] to contain a `json` property with the contact added to the campaign. The expression `$json.email` should resolve to `"lead@co.com"`.

### Test: campaign duplicate with options

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "campaign",
  "operation": "duplicate",
  "campaignId": "cmp_xyz789",
  "campaignName": "Copy of Q3 Outreach",
  "options": {
    "copyContacts": true,
    "copyMails": true,
    "copySettings": true
  }
}
```

**Expect** output[0] to contain a `json` property with the duplicated campaign object.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Operations list | Public docs + corpus confirm | 7 campaign ops, 2 contact list ops |
| Parameter field names | Corpus schema only (not public docs) | Campaign: campaignId, campaignName, contactEmail, additionalFields; Contact List: contactListId, contactEmail, additionalFields; Duplicate options: copyContacts/copyProvider/copyMails/copySettings |
| Duplicate operation | Corpus only — not listed in public n8n docs page but present in Emelia API and node | Included based on corpus schema files |
| API response shapes | Inferred from Emelia REST API docs | Exact field names of responses not documented in n8n public docs |
| Credential shape | Public docs confirm | emeliaApi with API Key field |
| Default resource | Corpus confirms | `campaign` is the default resource when not specified |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.emelia.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
