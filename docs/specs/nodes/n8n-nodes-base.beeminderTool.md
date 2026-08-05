---
type: n8n-nodes-base.beeminderTool
displayName: Beeminder Tool
category: AI Tool
versions: [1]
priority: medium
status: specced
---

# Beeminder Tool

An AI agent tool variant of the Beeminder node, wrapping the Beeminder REST API v1 for use by AI agents. When connected to an AI Agent root node, the model can dynamically populate parameters via `$fromAI()` or the "let model fill" toggle. Supports Datapoint, Goal, User, and Charge resources.

The Beeminder API is a goal-tracking service that lets users quantify commitments, track progress with data points, and put money on the line.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.beeminder/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/beeminder/ | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |
| https://api.beeminder.com/ | External API docs |

## Wire format

- **Type string:** `n8n-nodes-base.beeminderTool`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `beeminderApi` (API user token) or `beeminderOAuth2Api` (OAuth2). Requires a username and an auth token (obtainable from the Beeminder account settings or the `/api/v1/auth_token.json` endpoint).

## Parameters

### Resource and operation selection

The user selects a resource and an operation within that resource:

- **Datapoint:** create, createAll, delete, get, getAll, update — CRUD for data points on a goal.
- **Goal:** create, get, getAll, getArchived, update, refresh, shortCircuit, stepDown, cancelStepDown, uncle, ratchet — goal lifecycle and pledge management.
- **User:** get — retrieve the authenticated user's profile and goal metadata.
- **Charge:** create — create a manual charge on the Beeminder account.

### Parameter table

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | fixed (datapoint \| goal \| user \| charge) | datapoint | required | always | The Beeminder resource to operate on. |
| operation | fixed (varies by resource) | create | required | always | Operation for the selected resource. |
| goalName | string | — | conditional | datapoint any; goal get/update/refresh/shortCircuit/stepDown/cancelStepDown/uncle | Slug of the Beeminder goal. |
| value | number | — | conditional | datapoint create/update | Numeric datapoint value. |
| comment | string | — | optional | datapoint create/update | Optional comment attached to the datapoint. |
| timestamp | string | — | optional | datapoint create/update | Unix timestamp (seconds) for the datapoint; defaults to now. |
| requestid | string | — | optional | datapoint create | Client-supplied idempotency key echoed back. |
| datapointId | string | — | conditional | datapoint get/delete/update | ID of the datapoint to target. |
| returnAll | boolean | false | optional | datapoint getAll | Fetch all datapoints across pages. |
| limit | number | — | optional | datapoint getAll (returnAll=false) | Max items per page. |
| options.sort | string | — | optional | datapoint getAll | Sort order for paginated results. |
| options.page | number | — | optional | datapoint getAll | Page number. |
| options.per | number | — | optional | datapoint getAll | Items per page when paginating manually. |
| datapoints | array | — | conditional | datapoint createAll | Array of datapoint objects to create in batch. |
| slug | string | — | conditional | goal create | URL-friendly identifier for the new goal. |
| title | string | — | conditional | goal create | Human-readable goal title. |
| goal_type | fixed (hustler \| biker \| fatloser \| gainer \| inboxer \| drinker \| custom) | — | conditional | goal create | Beeminder goal type controlling graph defaults. |
| gunits | string | — | conditional | goal create | Unit label for the goal (e.g., "hours", "pushups"). |
| additionalFields | collection | {} | optional | goal create; goal get; goal getAll; goal getArchived | Fields such as goaldate, goalval, rate, initval, secret, datapublic, datasource, dryrun, tags. |
| updateFields | collection | {} | optional | goal update; datapoint update | Fields to update (title, yaxis, tmin, tmax, secret, datapublic, roadall, datasource, tags for goals; value/comment/timestamp for datapoints). |
| emaciated | boolean | false | optional | goal get/getAll/getArchived | Strip road/roadall/fullroad from response (lighter payload). |
| datapoints | boolean | false | optional | goal get | Include full datapoint array in goal response. |
| amount | number | — | conditional | charge create | Charge amount in USD. |
| additionalFields.note | string | — | optional | charge create | Note describing the charge. |
| additionalFields.dryrun | boolean | false | optional | charge create; goal create | Validate without executing. |
| additionalFields.associations | boolean | false | optional | user get | Include full goal + datapoint data in user response. |
| additionalFields.diff_since | string | — | optional | user get | Unix timestamp; only return goals/datapoints updated since. |
| additionalFields.skinny | boolean | false | optional | user get | Lightweight goal attributes only (requires diff_since). |
| additionalFields.emaciated | boolean | false | optional | user get | Strip road data from goal sub-objects. |
| additionalFields.datapoints_count | number | — | optional | user get | Limit returned datapoints per goal to N most recently updated. |

All string parameters accept expressions. When used as an AI agent tool, parameters may be populated dynamically by the calling agent via `$fromAI()`.

## Runtime behavior

### Input

Each input item is processed independently; values are rendered per item. Empty input produces empty output.

### Output

For each input item, one output item is produced on the single `main` output. The `json` property carries the operation outcome:

| Resource | Operation | Output shape |
|----------|-----------|-------------|
| Datapoint | create | Created datapoint object (id, timestamp, daystamp, value, comment, updated_at, requestid) |
| Datapoint | createAll | Array of created datapoint objects |
| Datapoint | delete | Updated goal object |
| Datapoint | get | Single datapoint object |
| Datapoint | getAll | Array of datapoint objects |
| Datapoint | update | Updated datapoint object |
| Goal | create | Newly created goal object |
| Goal | get | Goal object (with datapoints array if requested) |
| Goal | getAll | Array of goal objects sorted by urgency |
| Goal | getArchived | Array of archived goal objects |
| Goal | update | Updated goal object |
| Goal | refresh | Boolean true/false (async queue success) |
| Goal | shortCircuit | Updated goal object (pledge charged immediately) |
| Goal | stepDown | Updated goal object (pledge scheduled to decrease) |
| Goal | cancelStepDown | Updated goal object |
| Goal | uncle | Updated goal object (goal derailed, pledge charged) |
| Goal | ratchet | Updated goal object (buffer reduced) |
| User | get | User object (username, timezone, goals, updated_at) |
| Charge | create | Created charge object |

### Errors

- API errors (4xx/5xx from Beeminder) throw a NodeApiError unless `continueOnFail` is set, in which case an empty output item is produced with the error details.
- Missing required parameters (e.g., creating a datapoint without a goalName) produce a validation error before any API call.
- `uncle` operation fails with an error if the goal has more than 0 days of buffer (goal must be in a beemergency/red state).

### Expressions

Parameters accept expression strings for dynamic resolution at runtime per input item.

## Acceptance tests

### Test: Create a datapoint

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "datapoint",
  "operation": "create",
  "goalName": "weight",
  "value": 72.5,
  "additionalFields": {
    "comment": "Morning weigh-in",
    "timestamp": "1700000000"
  }
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "id": "4f9dd9fd86f22478d3",
    "timestamp": 1700000000,
    "daystamp": "20231114",
    "value": 72.5,
    "comment": "Morning weigh-in",
    "updated_at": 1700000000,
    "requestid": null
  }
}]
```

### Test: Get all goals for user

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "goal",
  "operation": "getAll",
  "additionalFields": {
    "emaciated": true
  }
}
```

**Expect** output[0]:
```json
[{
  "json": [
    {
      "slug": "weight",
      "title": "Weight Loss",
      "goal_type": "fatloser",
      "losedate": 1700000000,
      "goaldate": 1702598400,
      "goalval": 70,
      "rate": -0.5,
      "updated_at": 1699900000,
      "queued": false
    }
  ]
}]
```

### Test: Delete a datapoint

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "datapoint",
  "operation": "delete",
  "goalName": "weight",
  "datapointId": "4f9dd9fd86f22478d3"
}
```

**Expect** output[0] contains a single item whose `json` property is an object representing the updated goal on the Beeminder API (the goal object after deletion).

### Test: Update a goal's pledge (shortCircuit)

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "goal",
  "operation": "shortCircuit",
  "goalName": "weight"
}
```

**Expect** output[0] contains the updated goal object with pledge amount deducted and next stepdown schedule preserved.

### Test: Get authenticated user (with diff_since)

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "user",
  "operation": "get",
  "additionalFields": {
    "skinny": true,
    "diff_since": "1690000000"
  }
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "username": "alice",
    "timezone": "America/Los_Angeles",
    "updated_at": 1700000000,
    "goals": [
      {
        "slug": "weight",
        "title": "Weight Loss",
        "goal_type": "fatloser",
        "last_datapoint": {
          "timestamp": 1699900000,
          "value": 71.0,
          "comment": "evening",
          "id": "5f9d79fd86f33468d4"
        },
        "losedate": 1700000000,
        "updated_at": 1700000000
      }
    ]
  }
}]
```

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Beeminder API wire format | External API docs | Beeminder REST API v1 is fully documented at api.beeminder.com; all endpoint shapes verified against the Beeminder API specs — high confidence. |
| n8n Beeminder node params | Public docs + schema extract | The base Beeminder app node is documented at docs.n8n.io; the Tool variant shares the same resource/operation structure with `$fromAI()` support. The Tool variant has no separate docs page; batch-creation schema (`createAll`) exists in the definition set. |
| Credential types | Public docs + corpus | Two auth methods: `beeminderApi` (token) and `beeminderOAuth2Api` (OAuth2). High confidence. |
| Ratchet operation | Inferred from API docs | The ratchet endpoint exists in the Beeminder API but the schema definitions for it were not present in the v1 node definition set — the spec omits it. Implementers should check if the AI-tool node exposes it. |
| Output shapes | Inferred from Beeminder API docs | Response shapes mirror the Beeminder API JSON responses; exact structure may vary slightly with API version. |

## OpenFlow mapping

- **Definition group:** `tools`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.beeminderTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
