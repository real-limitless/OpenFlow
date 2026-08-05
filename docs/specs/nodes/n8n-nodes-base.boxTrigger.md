---
type: n8n-nodes-base.boxTrigger
displayName: Box Trigger
category: Data & Storage
versions: [1]
priority: medium
status: specced
---

# Box Trigger

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.boxtrigger/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/box/ | Public docs only |
| https://developer.box.com/reference/post-webhooks/ | Public docs only (Box API webhook creation) |
| https://developer.box.com/reference/resources/webhook/ | Public docs only (Box webhook resource schema) |

The temporary corpus was used only to confirm the published type string,
the "Data & Storage" category, and the complete list of event trigger values.
No package implementation or schema source was used.

## Wire format

- **Type string:** `n8n-nodes-base.boxTrigger`
- **Aliases:** (none)
- **Inputs:** `main` × 0 (trigger node, no upstream input)
- **Outputs:** `main` × 1
- **Credentials:** `boxOAuth2Api` (OAuth2, required)

## Parameters

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| events | multiOptions | (none — empty) | yes | One or more Box webhook trigger event types to subscribe to |
| targetType | options | `file` | yes | The type of Box item to monitor — `file` or `folder` |
| targetId | string | (empty) | yes | The Box ID of the file or folder to monitor (found in the URL after `folder/`) |

### Event trigger values

The `events` parameter accepts one or more of the following Box webhook trigger
enum values (derived from the Box API specification at developer.box.com):

**File events:**
`FILE.UPLOADED`, `FILE.PREVIEWED`, `FILE.DOWNLOADED`, `FILE.TRASHED`,
`FILE.DELETED`, `FILE.RESTORED`, `FILE.COPIED`, `FILE.MOVED`, `FILE.LOCKED`,
`FILE.UNLOCKED`, `FILE.RENAMED`

**Folder events:**
`FOLDER.CREATED`, `FOLDER.RENAMED`, `FOLDER.DOWNLOADED`, `FOLDER.RESTORED`,
`FOLDER.DELETED`, `FOLDER.COPIED`, `FOLDER.MOVED`, `FOLDER.TRASHED`

**Collaboration events:**
`COLLABORATION.CREATED`, `COLLABORATION.ACCEPTED`, `COLLABORATION.REJECTED`,
`COLLABORATION.REMOVED`, `COLLABORATION.UPDATED`

**Comment events:**
`COMMENT.CREATED`, `COMMENT.UPDATED`, `COMMENT.DELETED`

**Task assignment events:**
`TASK_ASSIGNMENT.CREATED`, `TASK_ASSIGNMENT.UPDATED`

**Metadata instance events:**
`METADATA_INSTANCE.CREATED`, `METADATA_INSTANCE.UPDATED`,
`METADATA_INSTANCE.DELETED`

**Shared link events:**
`SHARED_LINK.CREATED`, `SHARED_LINK.DELETED`, `SHARED_LINK.UPDATED`

**Other:**
`WEBHOOK.DELETED`
`SIGN_REQUEST.COMPLETED`, `SIGN_REQUEST.DECLINED`, `SIGN_REQUEST.EXPIRED`,
`SIGN_REQUEST.SIGNER_EMAIL_BOUNCED`, `SIGN_REQUEST.SIGN_SIGNER_SIGNED`,
`SIGN_REQUEST.SIGN_DOCUMENT_CREATED`, `SIGN_REQUEST.SIGN_ERROR_FINALIZING`

### Determining the Target ID

The Box target ID is the numeric identifier of the monitored file or folder,
obtained by opening the item in the Box web app and copying the string of
characters after `folder/` in the URL (e.g. for
`https://app.box.com/folder/12345` the target ID is `12345`).

## Runtime behavior

### Webhook lifecycle

1. **On workflow activation:** The node registers a webhook with the Box API
   by POSTing to `https://api.box.com/2.0/webhooks`. The request body contains
   the `target` object (`{ id: targetId, type: targetType }`), the `address`
   (derived from the runtime's public webhook base URL), and the `triggers`
   array (the selected `events` values). The node must check for duplicate
   registrations via `GET /webhooks` to avoid registering the same
   webhook multiple times for the same target + triggers combination.

2. **On webhook receive:** An HTTP POST arrives at the registered endpoint
   carrying a Box webhook event payload. The node reads the raw body and
   passes it through as a single output item. No signature verification is
   performed (Box webhook signatures are optional and handled at the HTTP
   server layer if configured).

3. **On workflow deactivation:** The node deletes the registered webhook by
   issuing `DELETE /webhooks/{webhookId}` with the stored webhook ID.

### Output

Each incoming Box webhook event produces one output item containing the raw
webhook body as received from the Box API. The payload shape is defined by
the Box webhook specification and typically includes:

```json
{
  "type": "webhook_event",
  "webhook": {
    "id": "...",
    "type": "webhook"
  },
  "trigger": "FILE.UPLOADED",
  "source": {
    "id": "...",
    "type": "file",
    "name": "...",
    ...
  },
  "created_by": {
    "id": "...",
    "type": "user",
    "name": "...",
    "login": "..."
  },
  "created_at": "2026-08-04T12:00:00-04:00",
  "additional_details": { ... }
}
```

The exact shape is the Box webhook event as delivered. The executor passes
the body through without transformation.

### Errors

- **Webhook registration failure:** API errors (403 forbidden, 404 target not
  found, 409 duplicate) surface as execution errors. Respect `continueOnFail`.
- **Webhook receive errors:** Runtime HTTP errors are handled by the
  underlying HTTP server framework.
- **Webhook deletion failure:** Log but do not fail the deactivation.

### Expressions

All parameter values accept expression strings. The `events`, `targetType`,
and `targetId` parameters may be supplied by expressions.

## Acceptance tests

### Test: basic webhook — file uploaded event

**Given** an activated workflow with these parameters:

```json
{
  "events": ["FILE.UPLOADED"],
  "targetType": "folder",
  "targetId": "12345"
}
```

**When** a file is uploaded to the target folder, the Box API delivers a POST
to the registered webhook URL.

**Expect** output[0] to contain one item whose `json.trigger` equals
`"FILE.UPLOADED"` and whose `json.source.type` equals `"file"`.

### Test: event filtering — multiple triggers

**Given** a node configured with:

```json
{
  "events": ["FILE.UPLOADED", "FILE.DOWNLOADED", "FILE.DELETED"],
  "targetType": "file",
  "targetId": "67890"
}
```

**When** the monitored file is uploaded, downloaded, and deleted, three
separate POSTs arrive at the registered webhook URL.

**Expect** each output to contain the matching trigger value in `json.trigger`.

### Test: webhook lifecycle — activate then deactivate

**Given** a workflow with this trigger node.

**When** the workflow is activated, the node creates a webhook via
`POST /webhooks` and preserves the returned `id`.

**When** the workflow is deactivated, the node deletes the webhook via
`DELETE /webhooks/{id}`.

**Expect** both API calls succeed without error. A subsequent activation
should register a new webhook.

### Test: duplicate guard

**Given** a workflow that is activated twice without deactivation.

**When** the first activation creates a webhook, the second activation should
detect the existing registration (checking via `GET /webhooks` against the
target + triggers + address combination) and skip duplicate creation.

**Expect** no error and exactly one webhook registered.

### Test: target type file

**Given** a node configured with:

```json
{
  "events": ["FILE.LOCKED"],
  "targetType": "file",
  "targetId": "99887"
}
```

**When** the specified file is locked.

**Expect** output[0] to contain `json.trigger` equal to `"FILE.LOCKED"` and
`json.source.type` equal to `"file"`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string, category | documented | Confirmed by package descriptor metadata and public docs. |
| Credentials | documented | boxOAuth2Api (OAuth2) via public Box credentials page. |
| Event trigger enum | documented | Full list confirmed against Box API specification at developer.box.com. |
| Target parameters (type, id) | documented | Public n8n docs describe finding the target ID. |
| Webhook lifecycle | inferred | Standard webhook trigger pattern consistent with other n8n triggers; Box webhook REST API is well-documented. |
| Webhook registration body | documented | Box API POST /webhooks requires target, address, triggers — all confirmed from Box developer docs. |
| Output payload shape | inferred | Box webhook event envelope matches Box API webhook resource schema. Exact field names are service-defined. |
| Duplicate detection strategy | inferred | Standard guard pattern for webhook triggers; the exact implementation (GET /webhooks filtering vs stored IDs) is implementation-dependent. |
| Expression support | inferred | Standard for all n8n trigger nodes. |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/box-trigger.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
