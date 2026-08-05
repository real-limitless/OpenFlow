---
type: n8n-nodes-base.demio
displayName: Demio
category: Communication
versions: [1]
priority: medium
status: specced
---

# Demio

Webinar management and event marketing platform. This node manages Demio events,
registers attendees, and retrieves event analytics reports via the Demio REST API.

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.demio/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/demio/ | Public docs only |
| https://publicdemioapi.docs.apiary.io/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.demio`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `demioApi` (API key + API secret)

## Parameters

### Resource: Event / Operation: Get

Retrieves a single event by its ID.

| name | type | required | notes |
|------|------|----------|-------|
| resource | literal: `event` | yes | discriminator |
| operation | literal: `get` | yes | discriminator |
| eventId | string | yes | Demio event public ID |
| additionalFields.active | boolean | no | When true, return active event data (e.g. live counts) |
| additionalFields.date_id | string | no | Filter by specific scheduled date instance ID |

### Resource: Event / Operation: Get All

Lists events with optional type filtering.

| name | type | required | notes |
|------|------|----------|-------|
| resource | literal: `event` | yes | discriminator |
| operation | literal: `getAll` | yes | discriminator |
| returnAll | boolean | no | Return all matching results (default: false) |
| limit | number | no | Max items to return; visible when returnAll is false |
| filters.type | enum | no | One of: `automated`, `past`, `upcoming` |

### Resource: Event / Operation: Register

Registers a person to an event.

| name | type | required | notes |
|------|------|----------|-------|
| resource | literal: `event` | yes | discriminator |
| operation | literal: `register` | yes | discriminator |
| eventId | string | yes | Demio event public ID |
| email | string | yes | Registrant email address |
| firstName | string | no | Registrant first name |
| additionalFields.last_name | string | no | Registrant last name |
| additionalFields.company | string | no | Registrant company name |
| additionalFields.phone_number | string | no | Registrant phone number |
| additionalFields.website | string | no | Registrant website URL |
| additionalFields.ref_url | string | no | Referrer/campaign URL |
| additionalFields.gdpr | string | no | GDPR consent value (e.g. "true") |
| additionalFields.date_id | string | no | Specific scheduled date instance ID |
| additionalFields.customFieldsUi | array | no | Custom registration fields (key/value pairs) |

### Resource: Report / Operation: Get

Retrieves an event analytics report.

| name | type | required | notes |
|------|------|----------|-------|
| resource | literal: `report` | yes | discriminator |
| operation | literal: `get` | yes | discriminator |
| eventId | string | yes | Demio event public ID |
| dateId | string | no | Specific scheduled date instance ID |
| filters.status | enum | no | Filter by: `attended`, `banned`, `completed`, `did-not-attend`, `left-early` |

## Runtime behavior

### Input

The node accepts any input items from `main[0]`. Expression-enabled parameters
can reference input JSON properties (e.g. `{{ $json.email }}` for the register
operation).

### Output

Each operation emits one output item per result:
- **Event → Get:** The single event object with fields such as id, title, status, date, registrant count, etc.
- **Event → Get All:** An array of event objects (each event as its own item).
- **Event → Register:** The registration confirmation object returned by the Demio API, typically including the registrant's unique join link and event access details.
- **Report → Get:** The report data object with attendance analytics, including per-participant status, join/leave timestamps, and aggregate metrics.

The output wraps the API response under a `json` property. Exact response
shapes follow the Demio REST API contract.

### Errors

- Missing required parameters (eventId, email) throw a validation error.
- API errors (invalid credentials, not found, rate-limit) propagate as node-level errors.
- Non-existent event IDs or invalid date IDs return a 404 from the API.
- The `continueOnFail` setting (when enabled) allows the workflow to proceed
  with an empty output on error.

### Expressions

All string, number, and boolean parameters accept expression strings
(`={{ }}` syntax). This includes eventId, email, firstName, additionalFields
values, limit, returnAll, and filter values.

## Acceptance tests

### Test: get single event by ID

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "event",
  "operation": "get",
  "eventId": "abc123"
}
```

**Expect** output[0] to contain one item with `json` including an event
object that has at least `id` matching the requested eventId.

### Test: register attendee

**Given** input items:

```json
[{ "json": { "email": "test@example.com" } }]
```

**Parameters:**

```json
{
  "resource": "event",
  "operation": "register",
  "eventId": "evt_456",
  "email": "{{ $json.email }}",
  "firstName": "Jane",
  "additionalFields": {
    "last_name": "Doe"
  }
}
```

**Expect** output[0] to contain one item with `json` including a
registration confirmation with a `join_link` field.

### Test: list upcoming events with limit

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "event",
  "operation": "getAll",
  "returnAll": false,
  "limit": 10,
  "filters": {
    "type": "upcoming"
  }
}
```

**Expect** output[0] to contain at most 10 items, each with `json`
containing an event object with a `status` or `date` field.

### Test: get event report with attendance filter

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "report",
  "operation": "get",
  "eventId": "abc123",
  "filters": {
    "status": "attended"
  }
}
```

**Expect** output[0] to contain report items where each has a
`status` field equal to `"attended"`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource/Operation list | Documented | Confirmed via n8n public docs and corpus schema |
| Parameter names and defaults | Inferred | From corpus Zod schema files (parameter definitions only) |
| Exact API response shapes | Inferred | Not documented in n8n docs; follow Demio REST API contract |
| Credential fields | Documented | API key + API secret, per n8n credentials docs |
| $fromAI() tool support | Inferred | Standard app node — likely usable as AI tool via alias |
| Aliases | Inferred | No alias found in corpus or docs |

## OpenFlow mapping

- **Definition group:** `communication`
- **Executor file:** `src/lib/engine/executors/communication/demio.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
