---
type: n8n-nodes-base.acuitySchedulingTrigger
displayName: Acuity Scheduling Trigger
category: Productivity
versions: [1]
priority: medium
status: specced
---

# Acuity Scheduling Trigger

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.acuityschedulingtrigger.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/acuityscheduling.md | Public docs only |
| https://developers.acuityscheduling.com/reference/quick-start | Public docs only |
| https://developers.acuityscheduling.com/reference/webhooks | Public docs only |
| https://developers.acuityscheduling.com/page/webhooks-webhooks-webhooks | Public docs only |
| https://developers.acuityscheduling.com/reference/get-appointments-id | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.acuitySchedulingTrigger`
- **Aliases:** (none)
- **Inputs:** `main` × 1 (unused — trigger nodes receive no input items)
- **Outputs:** `main` × 1
- **Credentials:** `acuitySchedulingApi` (User ID + API Key, HTTP Basic Auth) or `acuitySchedulingOAuth2Api` (OAuth2)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| event | string[] | [] | yes | — | One or more Acuity webhook event names to subscribe to. Valid values: `appointment.scheduled`, `appointment.rescheduled`, `appointment.changed`, `appointment.canceled`, `order.completed`. Maps directly to the `event` field in Acuity's dynamic webhook API. |
| resolveData | boolean | false | no | — | When true, the node fetches the full appointment or order resource from `GET /api/v1/appointments/:id` or `GET /api/v1/orders/:id` using the `id` received from the webhook, and emits the resolved object as the output item. When false, the raw webhook form-encoded payload is emitted as-is. |

## Runtime behavior

### Input

This is a webhook trigger node. It does not consume input items from upstream nodes.

### Activation (webhook lifecycle)

On workflow activation, the node creates one or more dynamic webhook subscriptions via `POST /api/v1/webhooks` against the Acuity Scheduling API. Each subscription specifies the configured event and uses the runtime-generated callback URL as the `target`.

- The node must first call `GET /api/v1/webhooks` to check whether a webhook with the same target URL already exists to avoid duplicates.
- On workflow deactivation, the node deletes the created subscriptions via `DELETE /api/v1/webhooks/:id`.

Acuity webhook subscriptions are limited to 25 per account. The node must handle `400` responses indicating this limit has been reached.

### Output

When a webhook fires, Acuity sends a `application/x-www-form-urlencoded` POST request with properties:
- `action` — one of `scheduled`, `rescheduled`, `canceled`, `changed` (for appointments) or `order.completed` (for orders)
- `id` — the appointment or order ID
- `calendarID` — calendar ID (appointments only)
- `appointmentTypeID` — appointment type ID (appointments only)

**If `resolveData` is `false`:** The node emits one output item per webhook call. The item's JSON body wraps the raw form parameters into a flat object with keys matching the form field names, plus any headers or metadata from the HTTP request that are conventionally included by the runtime (e.g. `headers` with the `x-acuity-signature`). The output item `json` contains the parsed webhook payload.

**If `resolveData` is `true`:** The node first receives the webhook payload, then calls `GET /api/v1/appointments/:id` (for actions `scheduled`, `rescheduled`, `canceled`, `changed`) or `GET /api/v1/orders/:id` (for `order.completed`) using the authenticated Acuity Scheduling API, and emits the full API response as the output item's `json`. The appointment response includes fields such as `id`, `firstName`, `lastName`, `email`, `phone`, `date`, `time`, `endTime`, `datetime`, `price`, `paid`, `amountPaid`, `type`, `appointmentTypeID`, `classID`, `duration`, `calendar`, `calendarID`, `canClientCancel`, `canClientReschedule`, `location`, `certificate`, `notes`, `timezone`, `scheduledBy`, `forms` (array of form + values), `labels`, `dateCreated`, `confirmationPage`, `formsText`.

### Errors

- Authentication failures (`401`) from the Acuity webhook management API cause workflow activation to fail with an `Error` that the runtime surfaces during activation.
- Webhook payloads that fail HMAC-SHA256 signature verification (against the API key from the credential) SHOULD be logged or surfaced but MUST NOT block the trigger — the node continues listening. The `x-acuity-signature` header is available in the raw webhook for downstream consumers that wish to verify in a subsequent node.
- HTTP errors when resolving data (GET after webhook receipt) emit the raw webhook payload as a fallback and log a warning; they do not crash the workflow.
- Webhook retries follow Acuity's server-side exponential backoff (up to 24 hours); the node is passive, receiving each retry as a new invocation.

### Expressions

All parameters (`event`, `resolveData`) accept expression strings.

## Acceptance tests

### Test: emit raw webhook for appointment.scheduled

**Given** the node is configured with `event: ["appointment.scheduled"]` and `resolveData: false`.

**When** Acuity sends a POST with body `action=scheduled&id=42&calendarID=7&appointmentTypeID=13`.

**Expect** output[0] to contain one item whose `json` body has keys `action`, `id`, `calendarID`, `appointmentTypeID` with corresponding values. The `action` value must be `"scheduled"`.

### Test: resolve data for order.completed

**Given** the node is configured with `event: ["order.completed"]` and `resolveData: true`.

**When** Acuity sends a POST with body `action=order.completed&id=99`.

**Then** the node performs a GET to `/api/v1/orders/99`. The Acuity API returns an order object.

**Expect** output[0] to contain a full order object under `json` whose structure matches what the Acuity Orders API returns (not the raw webhook fields).

### Test: multiple events produce separate subscriptions

**Given** the node is configured with `event: ["appointment.scheduled", "appointment.canceled", "appointment.rescheduled"]`.

**When** the workflow activates.

**Expect** the node to call `POST /api/v1/webhooks` three times, each with a different `event` value and the same `target` URL on the runtime.

**When** Acuity then sends a webhook for `appointment.scheduled` (id=1) and later for `appointment.canceled` (id=2).

**Expect** output[0] to contain two items emitted in chronological order, each with the correct `action` and `id`.

### Test: resolve data failure falls back to raw payload

**Given** the node is configured with `event: ["appointment.changed"]` and `resolveData: true`.

**When** Acuity sends a valid webhook but the subsequent GET to the Acuity API returns a non-2xx status.

**Expect** the node to emit an item whose `json` body contains the raw webhook form parameters (action, id, calendarID, appointmentTypeID) as a fallback, not the resolved appointment object. The node does not throw.

### Test: duplicate webhook detection

**Given** the node is configured with `event: ["appointment.scheduled"]`.

**When** the workflow activates and there is already a webhook with the same target URL on the Acuity account (returned by `GET /api/v1/webhooks`).

**Expect** the node to skip creating a duplicate and proceed with activation normally.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Webhook event semantics | Documented | Acuity webhook docs define all 5 events and their actions |
| Credential types | Documented | n8n docs describe API key and OAuth2; the OAuth2 variant is implicitly supported through the credential system |
| Dynamic webhook CRUD API | Documented | Acuity developer docs describe POST/GET/DELETE `/api/v1/webhooks` |
| Webhook signature verification | Documented | HMAC-SHA256 with `x-acuity-signature` header per Acuity docs |
| Resolve data behavior | Inferred | The `resolveData` parameter is an abstraction over calling `GET /api/v1/appointments/:id`; the appointment response shape is documented in the Acuity OpenAPI spec |
| Order resolution endpoint | Inferred | The Orders API endpoint is referenced but the full response shape is not documented in the sources consulted; spec assumes it follows Acuity conventions |
| `calendarID` and `appointmentTypeID` presence on non-appointment events | Documented | Acuity webhook docs explicitly state these are only sent for appointments |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/acuitySchedulingTrigger.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
