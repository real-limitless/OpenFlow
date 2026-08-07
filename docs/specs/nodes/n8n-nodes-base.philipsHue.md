---
type: n8n-nodes-base.philipsHue
displayName: Philips Hue
category: Action
versions: [1]
priority: medium
status: specced
---

# Philips Hue

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.philipshue.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/philipshue.md | Public docs only |
| https://developers.meethue.com/develop/hue-api-v2/api-reference/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.philipsHue`
- **Aliases:** (none)
- **Inputs:** `main` x 1
- **Outputs:** `main` x 1
- **Credentials:** `philipsHueOAuth2Api` (OAuth2, extends `oAuth2Api`)

## Parameters

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| resource | fixed | light | Y | Single resource: Light |
| operation | fixed | (varies) | Y | One of: getAll, get, delete, update |
| lightId | string | — | Y* | Required for get/delete/update operations |
| additionalFields | object | {} | N | Per-operation options (see below) |

### Operation: getAll (Retrieve all lights)

Lists all registered Hue lights. No lightId required.

| field | type | default | notes |
|-------|------|---------|-------|
| additionalFields | — | {} | No shared additional fields for this operation |

### Operation: get (Retrieve a light)

Fetches a single light's state and attributes by its Hue bridge ID.

| field | type | default | notes |
|-------|------|---------|-------|
| lightId | string | — | Required. The Hue light resource ID |

### Operation: delete (Delete a light)

Removes a light from the Hue bridge.

| field | type | default | notes |
|-------|------|---------|-------|
| lightId | string | — | Required |

### Operation: update (Update a light)

Modifies a light's controllable state attributes.

| field | type | default | notes |
|-------|------|---------|-------|
| lightId | string | — | Required |
| on | boolean | — | Whether the light is on |
| brightness | number | — | Brightness value (0–100 or hue-bridge-native scale) |
| hue | number | — | Hue value in degrees (0–360) |
| saturation | number | — | Saturation percentage (0–100) |
| colorTemperature | number | — | Color temperature in mireds or native scale |
| transitionTime | number | — | Duration in milliseconds for the state transition |

Additional optional fields from the Hue CLIP API v2 Light PUT payload may be exposed as additionalFields.

## Runtime behavior

### Input

Each input item is processed independently. The node authenticates via OAuth2 (philipsHueOAuth2Api) and calls the Philips Hue CLIP API v2 at the bridge URL resolved from the OAuth account.

### Output

Output items carry the JSON response from the Hue API under the standard `json` property:

- **getAll:** Array of light objects with id, owner, type, metadata, and on/color/colorTemperature/dimming/type state objects as returned by the Hue API v2 `/resource/light` endpoint.
- **get:** Single light resource object as returned by `GET /resource/light/{lightId}`.
- **delete:** Confirmation response from `DELETE /resource/light/{lightId}` — typically a success message or empty 200.
- **update:** Confirmation response from `PUT /resource/light/{lightId}` indicating the changed attributes.

The input item's paired fields (`json`, `binary`, etc.) are passed through for non-destructive operations (getAll, get). For delete and update, the node emits the API response for each processed item.

### Errors

- Missing `lightId` for get/delete/update should throw a descriptive validation error.
- API errors (unauthorized, light not found, bridge offline) propagate as standard n8n NodeApiError.
- `continueOnFail` is respected — when enabled, the node emits an error item instead of failing.

### Expressions

All parameter values accept expression strings.

## Acceptance tests

### Test: retrieve all lights

**Given** input items:

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

**Expect** output[0] emits one item per Hue light, each containing the full Hue API v2 light resource shape with `{ "json": { "id": "...", "type": "light", "metadata": {...}, "on": {...}, "dimming": {...}, ... } }`.

### Test: turn a light on

**Given** input items:

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

**Expect** output[0] contains the Hue API update response — a success object indicating the `on` property was set to `true` on the matching light.

### Test: delete a light

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "light",
  "operation": "delete",
  "lightId": "7a345bcd-1234-5678-abcd-1a2b3c4d5e6f"
}
```

**Expect** output[0] is a non-error item with the API confirmation body.

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
| Resource and operation names | documented | Public n8n docs list the operations (delete/retrieve/retrieve all/update) |
| Credential type | documented | Confirmed as OAuth2 via `philipsHueOAuth2Api` per public docs |
| Update field schema | inferred | n8n docs only say "Update a light"; exact parameter fields inferred from Hue CLIP API v2 |
| API base URL | inferred | Hue OAuth2 uses the user's bridge; the CLIP API v2 basepath is resolved during OAuth |
| Pagination | not applicable | getAll returns all lights in a single response |

## OpenFlow mapping

- **Definition group:** `action`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.philipsHue.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
