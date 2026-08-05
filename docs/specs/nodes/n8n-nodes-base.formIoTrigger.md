---
type: n8n-nodes-base.formIoTrigger
displayName: Form.io Trigger
category: Communication
versions: [1]
priority: medium
status: specced
---

# Form.io Trigger

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/trigger-nodes/n8n-nodes-base.formiotrigger/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/formiotrigger/ | Public docs only |
| https://apidocs.form.io/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.formIoTrigger`
- **Aliases:** (none)
- **Inputs:** `main` × 0 (trigger — no input items consumed)
- **Outputs:** `main` × 1
- **Credentials:** `formIoTriggerApi` (basic auth with environment selection and optional self-hosted domain)

### Credential shape

The credential authenticates via **Basic auth** against the Form.io API. The user selects one of two environments:

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| Environment | enum: `cloudHosted` / `selfHosted` | yes | Determines the base URL for API calls |
| Self-Hosted Domain | string | when selfHosted | Full origin URL, e.g. `https://yourserver.com` |
| Email | string | yes | Login email for the Form.io account |
| Password | string | yes | Login password for the Form.io account |

## Parameters

The node exposes configuration at a single level. No sub-grouping or nested resource/operation selector is needed because the node performs one function: subscribing to Form.io webhook events.

| Name | Type | Default | Required | Notes |
|------|------|---------|----------|-------|
| Project | LO (dynamic) | — | yes | Loaded via `getProjects` method; populates dropdown from the Form.io API |
| Form | LO (dynamic) | — | yes | Loaded via `getForms` method; scoped to the selected project; populates dropdown with available forms |
| URL | string | — | no | Callback URL override. If omitted the node uses the workflow's own webhook URL |
| Events | multi-select | — | yes | Which Form.io webhook event types to subscribe to. Choices sourced from Form.io webhook event taxonomy |

### Dynamic option loading

- **getProjects**: Queries the Form.io API for projects accessible with the given credentials. Returns project name + id pairs.
- **getForms**: Queries the Form.io API for forms within the selected project. Returns form title + id pairs. Depends on the selected Project value.

## Runtime behavior

### Activation (webhook registration)

When the workflow is activated the node calls the Form.io webhook API to **create** a webhook subscription on the selected project+form. The subscription target URL is either the user-supplied URL or the workflow's n8n-generated webhook URL.

If a webhook subscription already exists for the same project+form+target combination, the node skips creation (`checkExists` returns true).

### Deactivation (webhook removal)

When the workflow is deactivated the node calls the Form.io webhook API to **delete** the subscription it created. If the subscription was removed externally, the deletion attempt fails silently.

### Input

None (trigger node — no input items).

### Output

Each incoming webhook payload is emitted as one output item.

```json
{
  "json": {
    "data": { ... },
    "submission": { ... },
    "form": { ... },
    "event": { ... }
  }
}
```

The exact shape of `data`, `submission`, `form`, and `event` fields is determined by the Form.io webhook API and depends on the event type and form structure. The node passes through the full HTTP request body from Form.io without transformation.

### Errors

- On activation, if API authentication fails or the project/form is unreachable, the node throws and prevents activation.
- On runtime, if the webhook signature cannot be verified (if Form.io supplies a signature header), an invalid payload is silently dropped or logged depending on `continueOnFail`.
- On deactivation, webhook deletion failures are non-fatal.
- The node supports the standard `continueOnFail` toggle: when true, failed items are passed to the output with error metadata instead of halting execution.

### Expressions

- `URL` accepts an expression string.
- `Project` and `Form` accept expression strings (though in the UI they are typically rendered as dynamic dropdowns).

## Acceptance tests

### Test: activate and receive a form submission event

**Given** a valid Form.io credential configured with a cloud-hosted environment, email, and password.

**Parameters:**
```json
{
  "project": "my-project-id",
  "form": "my-form-id",
  "events": ["submission.create"]
}
```

**Expect:** On workflow activation, a new webhook is registered on the Form.io project. When a form submission occurs, the output item contains a `json` property with the submission payload from Form.io.

### Test: self-hosted environment

**Given** a credential with `selfHosted` environment and domain `https://forms.internal.example.com`.

**Parameters:**
```json
{
  "project": "proj-abc",
  "form": "form-123",
  "events": ["submission.update", "submission.delete"]
}
```

**Expect:** API requests target `https://forms.internal.example.com` instead of the default Form.io cloud API. Activation and event delivery work identically to the cloud case.

### Test: deactivation removes webhook

**Given** an active workflow with a Form.io Trigger node.

**Expect:** When the workflow is deactivated, the webhook subscription registered at activation time is removed from the Form.io project. No orphaned webhooks remain.

### Test: continueOnFail with malformed payload

**Given** `continueOnFail = true`.

**When** a non-JSON or malformed payload is received.

**Expect:** The node emits an output item with `json.error` containing the parse failure, and the workflow continues executing downstream nodes.

### Test: webhook already exists on activation

**Given** a webhook subscription already exists for the same project+form+URL combination.

**Expect:** The `checkExists` method returns true, creation is skipped, activation succeeds without error or duplication.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Parameter names and types | Inferred from type declarations (getProjects, getForms loadOptions) | Type declarations confirm the method signatures; exact parameter property names (`project`, `form`, `url`, `events`) are inferred at a high level |
| Form.io webhook event taxonomy | Inferred from Form.io API docs | Form.io supports per-form/submission lifecycle events; the exact enum of event types is sourced from the Form.io webhook documentation |
| Webhook payload shape | Inferred from Form.io API docs | The node passes through the raw Form.io webhook body; exact nesting depends on form configuration |
| Credential schema | Public docs | Confirmed from docs.n8n.io credentials page for Form.io Trigger |
| Signature verification | Inferred | Whether Form.io sends HMAC signatures is not confirmed; the node may or may not implement signature checking |
| URL parameter default behavior | Inferred | Without a URL override, the node uses the n8n-generated webhook URL from the environment |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/formIoTrigger.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
