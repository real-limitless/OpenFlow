---
type: n8n-nodes-base.convertKitTool
displayName: ConvertKit Tool
category: Marketing
versions: [1]
priority: medium
status: specced
---

# ConvertKit Tool

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.convertkit.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/convertkit.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.convertKitTool`
- **Aliases:** (none)
- **Inputs:** `main` x 1
- **Outputs:** `main` x 1
- **Credentials:** `convertKitApi` (API Secret)

This is the **AI agent tool variant** of the ConvertKit app node. The base ConvertKit node is flagged `usableAsTool: true` in the n8n type system and shares its full resource/operation set (see `n8n-nodes-base.convertKit.md`). The tool variant enables AI agents to populate parameters dynamically via `$fromAI()` expressions.

## Parameters

The ConvertKit Tool exposes the same 5 resources and their operations as the base ConvertKit node:

| Resource | Operations |
|----------|-----------|
| Custom Field | Create, Delete, Get Many, Update |
| Form | Add Subscriber, Get Many, Get Subscriptions |
| Sequence | Add Subscriber, Get Many, Get Subscriptions |
| Tag | Create, Get Many |
| Tag Subscriber | Add, Get Many, Delete |

Each operation requires the same resource-specific parameters (field label/ID, form/sequence/tag ID, email, etc.) as the base node. All parameter values support `$fromAI()` expressions, allowing the AI agent to supply values at runtime.

### AI-specific behavior

- All resource, operation, and field parameters accept `$fromAI()` expressions
- Parameters with dynamic options (Form Name or ID, Sequence Name or ID, Tag Name or ID) can be populated via expression or direct ID input
- The `additionalFields` collection parameters (custom fields via `fieldsUi`/`fields`, `firstName`, `tags`, `subscriberState`) also accept `$fromAI()` expressions

## Runtime behavior

### Input

Same as base ConvertKit node — each input item may supply parameters via expressions.

### Output

Same as base ConvertKit node — one output item per API call with the ConvertKit API response body.

### Errors

Same error handling as base ConvertKit node. `continueOnFail` behavior applies. When the AI agent provides invalid parameters via `$fromAI()`, the node throws a standard API error.

### Expressions

All parameters support expressions, including `$fromAI()` for AI agent parameter population.

## Acceptance tests

### Test: AI agent creates a tag via tool

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "tag",
  "operation": "create",
  "name": "={{ $fromAI() }}"
}
```

**Expect** output[0] contains `json.tag` with the tag created from the AI-supplied name.

### Test: AI agent subscribes to a form

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "form",
  "operation": "addSubscriber",
  "id": "={{ $fromAI() }}",
  "email": "={{ $fromAI() }}"
}
```

**Expect** output[0] contains `json.subscriber` with the subscribed email.

### Test: AI agent tags a subscriber

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "tagSubscriber",
  "operation": "add",
  "tagId": "={{ $fromAI() }}",
  "email": "={{ $fromAI() }}"
}
```

**Expect** output[0] contains the tag subscription response from the ConvertKit API.

### Test: non-AI expresssion-based usage (backward compatible)

**Given** input items:
```json
[{ "json": { "tagName": "test-tag" } }]
```

**Parameters:**
```json
{
  "resource": "tag",
  "operation": "create",
  "name": "={{ $json.tagName }}"
}
```

**Expect** output[0] contains `json.tag` — tool mode does not break standard expression usage.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Tool variant existence | Published JSON descriptor | The base ConvertKit node has `usableAsTool: true`; the tool variant is the same node with a separate type string and `$fromAI()` parameter support |
| Separate `convertKitTool` type | Inferred from naming convention | The `.Tool` suffix is documented as the AI agent tool variant pattern; no dedicated docs page exists at the corresponding URL (404) |
| Credential fields | Public docs | API Secret required from ConvertKit account settings |
| `$fromAI()` interaction | Public docs | Documented as `$fromAI()` expression support for AI agent tool nodes |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/convertKitTool.ts` (may delegate to shared ConvertKit executor)
- **SDK:** `defineNode` + native `ExecutionContext` only
