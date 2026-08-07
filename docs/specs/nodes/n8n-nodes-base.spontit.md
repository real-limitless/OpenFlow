---
type: n8n-nodes-base.spontit
displayName: Spontit
category: Communication
versions: [1]
priority: low
status: deprecating
---

# Spontit

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/changelog/v20-breaking-changes | Public docs only — confirms removal in v2.0 |
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.spontit | Public docs only — 404 (page removed) |
| https://docs.n8n.io/integrations/credentials/spontit | Public docs only — 404 (credential page removed) |

## Status

**DEPRECATED.** The Spontit external push notification service was shut down by its provider. The node was removed from n8n in the v2.0.0 release. Existing workflows referencing this node must be updated or removed to avoid execution errors.

No public documentation remains on the n8n docs site (all Spontit pages return 404). The npm package n8n-nodes-base@2.15.1 no longer ships this node. Its type string does not appear in the published `known/nodes.json` registry.

## Wire format

- **Type string:** `n8n-nodes-base.spontit`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `spontitApi` (removed — no credential documentation remains)

## Parameters

No reliable parameter data available. The node is defunct.

Based on the node's category (push notifications) and analogy to similar notification nodes (Pushover, Gotify, Pushbullet), the original node likely accepted:

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| resource | string | — | yes | Single resource: "pushNotification" (inferred from service name) |
| operation | string | — | yes | Single operation: "create" or "send" |
| title | string | — | yes | Push notification title |
| message | string | — | yes | Push notification body text |
| additionalFields | object | {} | no | Optional fields (device targeting, URL, image, priority, sound) |

These are inferred — no primary source confirms the exact set.

## Runtime behavior

### Input

Inoperative. The node is deprecated and will not execute. Workflows using it should produce a workflow execution error indicating the node is unavailable or the credential type is unrecognized.

### Output

No output is produced — the node refuses to execute.

### Errors

Any execution attempt must throw a descriptive error: the Spontit service has been shut down and the node was removed.

## Acceptance tests

No functional tests possible — the external service is offline and the node code is absent from the current npm package.

| Test | Status | Reason |
|------|--------|--------|
| Send push notification | Skipped | External service shut down |
| Credential validation | Skipped | Credential definition removed from npm |

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Exact parameter names and defaults | Inferred | No public docs remain; inferred from notification-node patterns |
| Credential schema | Inferred | Removed from npm; no docs; presumed API-key based |
| Removal rationale | Documented | n8n changelog v2.0 breaking changes confirms "service no longer available" |
| Original supported operations | Inferred | Most likely a single push-notification send operation |

## OpenFlow mapping

- **Definition group:** `deprecated`
- **Executor file:** Not applicable — node is non-functional
- **SDK:** N/A
