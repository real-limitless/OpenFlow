---
type: n8n-nodes-base.philipsHueTool
displayName: Philips Hue Tool
category: Action
versions: [1]
priority: medium
status: specced
---

# Philips Hue Tool

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.philipshue.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/philipshue.md | Public docs only |
| https://developers.meethue.com/develop/hue-api-v2/api-reference/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.philipsHueTool`
- **Aliases:** (none)
- **Inputs:** `main` x 1, `ai_tool` x 1
- **Outputs:** `main` x 1
- **Credentials:** `philipsHueOAuth2Api` (OAuth2, extends `oAuth2Api`; requires AppId, ClientId, ClientSecret registered as a Hue Remote API app)

## Parameters

The node exposes the same single-resource (Light) operations as the base `n8n-nodes-base.philipsHue` node, with the addition of `$fromAI()` support for dynamic parameter population by AI agents.

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | fixed | light | Y | — | Single resource: Light |
| operation | fixed | (varies) | Y | — | One of: getAll, get, delete, update |
| lightId | string | — | Y* | operation ∈ {get, delete, update} | Hue light resource ID |
| on | boolean | — | N | operation = update | Whether the light is on |
| brightness | number | — | N | operation = update | Brightness value (platform-native scale) |
| hue | number | — | N | operation = update | Hue value in degrees (0–360) |
| saturation | number | — | N | operation = update | Saturation percentage (0–100) |
| colorTemperature | number | — | N | operation = update | Color temperature in mireds |
| transitionTime | number | — | N | operation = update | Duration in ms for state transition |

All parameters accept expression strings and `$fromAI()` injection. The AI agent may populate any parameter dynamically based on conversational context.

## Runtime behavior

### Input

The node consumes one input item from `main` (standard workflow execution) or tool call input from `ai_tool` (AI agent invocation). Authentication is via `philipsHueOAuth2Api`, which resolves the user's Hue bridge URL and issues OAuth2 tokens against the Hue Remote API.

### Output

Produces one output item per processed input item containing the Hue CLIP API v2 response:

- **getAll:** Array of light resource objects (each with `id`, `type`, `metadata`, `on`, `dimming`, `color`, `colorTemperature`, etc.) from `GET /resource/light`.
- **get:** Single light resource object from `GET /resource/light/{lightId}`.
- **delete:** Confirmation response from `DELETE /resource/light/{lightId}`.
- **update:** Confirmation response from `PUT /resource/light/{lightId}` reflecting changed attributes.

### Errors

- Missing required `lightId` for get/delete/update throws a validation error.
- API errors (401 unauthorized, 404 light not found, bridge unreachable) propagate as typed errors.
- `continueOnFail` is respected — on failure the node emits an error item instead of halting.

### Expressions

All parameter values accept expression strings and `$fromAI()` dynamic population.

## Acceptance tests

### Test: retrieve all lights via AI tool

**Given** input from AI agent:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "light",
  "operation": "getAll"
}
```

**Expect** output[0] emits one item per Hue light, each containing the full Hue API v2 light resource shape with `{ "json": { "id": "...", "type": "light", "metadata": {...}, "on": {...}, "dimming": {...} } }`.

### Test: AI agent turns a light on

**Given** input from AI agent:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "light",
  "operation": "update",
  "lightId": "7a345bcd-1234-5678-abcd-1a2b3c4d5e6f",
  "on": true,
  "transitionTime": 400
}
```

**Expect** output[0] contains the Hue API update success response indicating `on` was set to `true`.

### Test: AI agent gets a specific light

**Given** input from AI agent:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "light",
  "operation": "get",
  "lightId": "7a345bcd-1234-5678-abcd-1a2b3c4d5e6f"
}
```

**Expect** output[0] contains the single light resource with `id` matching the requested lightId.

### Test: missing lightId throws

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "light",
  "operation": "get",
  "lightId": ""
}
```

**Expect** the node throws a validation error indicating `lightId` is required.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string and credential | documented | Public n8n docs confirm the base Philips Hue OAuth2 credential |
| Tool variant existence | documented | n8n docs confirm tool variants exist per node; this follows the established pattern |
| Operations and parameters | inferred | Tool variant shares the same Light resource and 4 operations as the base node |
| $fromAI() support | inferred | All tool variants in n8n support `$fromAI()` for dynamic AI-agent parameter population |
| AI tool input channel | inferred | Tool nodes accept `ai_tool` input in addition to `main` |

## OpenFlow mapping

- **Definition group:** `action`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.philipsHueTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
