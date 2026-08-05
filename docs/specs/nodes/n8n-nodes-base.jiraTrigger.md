---
type: n8n-nodes-base.jiraTrigger
displayName: Jira Trigger
category: Triggers
versions: [1]
priority: medium
status: specced
---

# Jira Trigger

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.jiratrigger/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/jira.md | Public docs only |
| https://developer.atlassian.com/cloud/jira/platform/webhooks/ | Public docs only |
| https://developer.atlassian.com/cloud/jira/platform/rest/v3/api-group-webhooks/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.jiraTrigger`
- **Aliases:** (none)
- **Inputs:** none; trigger node.
- **Outputs:** `main` × 1.
- **Credentials:** One of three Jira authentication methods:
  - Jira Software Cloud OAuth2 (requires `manage:jira-webhook` scope)
  - Jira Software Cloud API token (email + API token + domain)
  - Jira Software Server (email + password + domain)

The node registers a dynamic webhook with the Jira REST API on activation and deletes it on deactivation. The callback URL is a runtime deployment concern.

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| JQL Filter | string | — | no | — | Jira Query Language expression that restricts which issues trigger events. Example: `project = TEST AND status = Done`. Must use clauses and operators supported by the Jira dynamic webhook API (`=`, `!=`, `IN`, `NOT IN` on `project`, `issuetype`, `status`, `priority`, `assignee`, `reporter`, `issueKey`, indexed custom fields). |
| Events | multi-select | provider-defined (e.g. issue created / updated / deleted) | yes | — | One or more Jira webhook event types to subscribe to. Supported for dynamic registration include issue lifecycle events (`jira:issue_created`, `jira:issue_updated`, `jira:issue_deleted`), comment events, issue property events, sprint events, and version events. The editor should expose human-readable labels but use the provider event key when registering. |
| Trigger on issue updated only when specified fields change | multi-select | — | no | — | One or more Jira field IDs. When set, the `jira:issue_updated` event fires only when at least one of the listed fields was modified. |

The editor should make the generated test and production callback URLs visible to the user. The JQL filter supports expressions from incoming workflow data.

## Runtime behavior

### Trigger registration

When the workflow is activated (test or production), the node uses the configured Jira credential to register one or more dynamic webhooks via `POST /rest/api/3/webhook`. The registration payload contains the callback URL, the selected event keys, and the JQL filter if provided. On deactivation, the node deletes the webhooks via `DELETE /rest/api/3/webhook` using the IDs returned during registration.

Jira dynamic webhooks expire after 30 days. For production workflows that run longer than 30 days, the node must periodically refresh the webhook life via `PUT /rest/api/3/webhook/refresh`.

### Input

The node consumes no upstream items. Each incoming webhook delivery starts one workflow execution. The request body is a JSON payload delivered by Jira via HTTP POST to the registered callback URL.

### Output

For every accepted delivery, output[0] contains one item on the `main` output. The item's `json` value represents the received Jira webhook event and its request metadata. The payload contains at minimum:

- `webhookEvent` — the event type string (e.g. `jira:issue_created`)
- `timestamp` — epoch milliseconds
- `issue` — the Jira issue object (same shape as REST API `GET /rest/api/3/issue/{id}` with no expand parameters), present for issue-related events
- `user` — the user who performed the action (condensed shape without `locale`, `emailAddress`, `groups`, `applicationRoles`)
- `changelog` — present only for `jira:issue_updated`, containing an array of changed field items

For comment events the payload also includes a `comment` object matching the GET comment response shape.

All unknown fields are forwarded as-is so future Jira API additions are not silently dropped.

### HTTP response

The callback must acknowledge valid deliveries promptly with HTTP 200. Invalid requests, malformed payloads, or verification failures (when using signed webhooks) must return a non-2xx response.

### Errors

- Missing or invalid credentials: fail registration with an actionable authentication/authorization error.
- Insufficient OAuth scopes (especially `manage:jira-webhook`): fail registration when webhook creation is denied.
- JQL filter uses unsupported clauses: fail registration with the provider's error.
- Provider API failure, timeout, or rate limit: surface the failure; do not silently fail registration.
- Webhook expiration handling failure: report a warning or error when the refresh cycle fails.
- A trigger has no upstream items, so `continueOnFail` does not provide item-level recovery semantics.

### Expressions

The JQL filter may be expression-backed. Event selection and credentials are configuration values resolved before registration. Incoming event fields are available to downstream expressions through the emitted item.

## Acceptance tests

### Test: issue created event forwarded as one item

**Parameters:** Subscribe to `jira:issue_created` with no JQL filter.

**Request:** `POST` to the registered callback URL with a valid Jira `jira:issue_created` payload containing `issue`, `user`, `timestamp`, and `webhookEvent`.

**Expect:** One execution with one item on output[0]. The item preserves `issue.key`, `issue.fields.summary`, `user.displayName`, `webhookEvent`, and `timestamp` at the JSON root.

### Test: JQL filter restricts which issues fire

**Parameters:** Subscribe to `jira:issue_updated` with JQL `project = TEST`.

**Request:** Deliver two payloads — one where `issue.key` starts with `TEST-` and one where it starts with `OTHER-`.

**Expect:** If Jira applies JQL filtering server-side (which it does for supported clauses), only the matching issue triggers execution. The node registers the JQL with the provider and does not implement client-side filtering.

### Test: issue updated includes changelog

**Parameters:** Subscribe to `jira:issue_updated`.

**Request:** Deliver a valid `jira:issue_updated` payload with a `changelog` containing one changed field item.

**Expect:** The output item includes the `changelog` object with the `items` array and `id`. Changed field details (`field`, `fromString`, `toString`) are present and accessible.

### Test: registration authorization failure

**Parameters:** Use a credential without `manage:jira-webhook` scope.

**Expect:** Workflow activation fails with an authentication/authorization error. No webhook is registered and no executions fire.

### Test: comment event delivered correctly

**Parameters:** Subscribe to `comment_created`.

**Request:** Deliver a valid `comment_created` payload with `comment` object, `issue`, and `user`.

**Expect:** One execution with one item. The `comment` object is present alongside `issue` and `webhookEvent: "comment_created"`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Node purpose and webhook-based trigger | documented | n8n describes the node as handling Jira events through webhooks. |
| Three credential types (Cloud OAuth2, Cloud API token, Server) | documented | Jira credentials page documents all three methods. |
| Event types for dynamic registration | documented | Atlassian webhook docs list supported events; OAuth2 apps have a restricted subset. |
| Dynamic webhook registration via REST API | documented | Atlassian documents POST/DELETE/GET/PUT webhook endpoints. |
| JQL filtering | documented | Atlassian API supports JQL in registration; n8n docs reference JQL on the action node. |
| 30-day webhook expiration with refresh | documented | Atlassian docs specify expiration and the refresh endpoint. |
| Field-filtering on issue updated | documented | Atlassian docs reference `updatedFieldIdsFilter` in the registration payload. |
| Exact editor parameter names, defaults, and event enum list | intentionally unspecified | Public docs do not enumerate the exact option list; implementation should derive from the provider's public event registry. |
| Exposed JQL clauses and operator subset | documented | Atlassian docs explicitly list supported clauses and operators for dynamic webhooks. |
| Signed webhook (X-Hub-Signature) handling | documented | Atlassian docs describe HMAC-SHA256 signing for admin webhooks; unclear if the trigger node uses or validates this. |
| Registration lifecycle (test/production activation/deactivation) | inferred | Follows the standard OpenFlow trigger lifecycle. |
| Retry/deduplication policy | undocumented | Jira retries with exponential backoff up to 5 times; `X-Atlassian-Webhook-Identifier` header can be used for dedup. |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/jira-trigger.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
