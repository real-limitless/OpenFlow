---
type: n8n-nodes-base.homeAssistant
displayName: Home Assistant
category: Miscellaneous
versions: [1]
priority: medium
status: specced
---

# Home Assistant

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.homeassistant.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/homeassistant/ | Public docs only |
| https://developers.home-assistant.io/docs/api/rest/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.homeAssistant`
- **Aliases:** (none)
- **Inputs:** `main` x 1
- **Outputs:** `main` x 1
- **Credentials:** `homeAssistantApi` (Host, Port, SSL toggle, Access Token)

## Parameters

The node selects a **resource** (the Home Assistant domain to interact with) and an **operation** within that resource:

| Resource | Operations | Key parameters |
|----------|-----------|----------------|
| Camera Proxy | get | `entityId` — camera entity (e.g. `camera.my_sample_camera`) |
| Config | get, check | (none; get returns full config object, check triggers config validation) |
| Event | create, getAll | `eventType` (create); optional `eventData` JSON object (create) |
| Log | get, getAll | `entityId` (get); optional `timestamp` for period start |
| Service | call, getAll | `domain`, `service` (call); optional `serviceData` JSON object (call) |
| State | getAll, get, upsert | `entityId` (get/upsert); `state` string (upsert); optional `attributes` (upsert) |
| Template | create | `template` — Home Assistant template string to render |

**Parameter notes:**
- `entityId` is a string like `light.living_room` or `camera.my_sample_camera`.
- `domain` + `service` together identify a Home Assistant service (e.g. `light` / `turn_on`).
- `eventType` is a free-form string naming the event.
- `template` is a raw Home Assistant Jinja2-style template string.
- `eventData`, `serviceData` are arbitrary JSON objects sent as the request body.
- `timestamp` for log operations is an ISO 8601 string; defaults to 1 day before request time.
- `state` for upsert is a string value; `attributes` is an optional JSON object.

## Runtime behavior

### Input

Each incoming item is processed independently. The node reads the selected parameters (which may be static values or expressions evaluated per item) and constructs the corresponding Home Assistant REST API request.

### Output

Each operation produces one output item per API response. The response JSON is placed on the output item's `json` property.

**Camera Proxy — special binary handling:** The `cameraProxy` `get` operation fetches raw image bytes from `GET /api/camera_proxy/<entity_id>`. The response is not JSON; it is raw binary (image/jpeg or image/png). The node must convert this to OpenFlow binary output format. For each input item, emit one output item with an empty `json` (`{}`) and the image data set as binary under a key such as `data`, with `mimeType` derived from the Content-Type header (default `image/jpeg`) and a `fileName` derived from the entity ID (e.g. `camera_my_sample_camera.jpg`). The `pairedItem` must reference the original input item index.

**Array responses:** When the HA API returns a JSON array (e.g. `GET /api/states`, `GET /api/services`, `GET /api/logbook`, `GET /api/events`), the node should expand the array into one output item per element. Each element becomes a separate item on output[0]. Non-array responses (single object, scalar) are wrapped as a single output item.

**Service call with return_response:** The `service` `call` operation may optionally use the `?return_response` query parameter. When enabled, the API returns an object with `changed_states` and `service_response` keys. The node passes this through as-is.

### Errors

- HTTP 4xx/5xx responses from the HA API should cause the node to throw (or return empty output if `continueOnFail` is enabled).
- HTTP 404 when getting a specific state or log entity should throw a descriptive error.
- Network errors (connection refused, DNS failure, TLS errors) should throw and abort.
- Camera proxy: if the image fetch returns a non-200 or non-image content, throw a descriptive error.

### Expressions

All parameter values accept expression strings. The resource and operation selectors are static (chosen at workflow design time, not expressions).

## Acceptance tests

### Test: state getAll — expand array

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "state",
  "operation": "getAll"
}
```

**Mock** HA API returns `GET /api/states`:

```json
[
  { "entity_id": "sun.sun", "state": "above_horizon", "attributes": {} },
  { "entity_id": "sensor.temperature", "state": "22.5", "attributes": { "unit": "°C" } }
]
```

**Expect** output[0] to contain 2 items (one per state object, each with the full state JSON on `json`).

### Test: camera proxy get — binary output

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "cameraProxy",
  "operation": "get",
  "entityId": "camera.my_sample_camera"
}
```

**Mock** HA API returns raw JPEG bytes with `Content-Type: image/jpeg`.

**Expect** output[0] to contain 1 item with `json: {}` and `binary.data` containing the raw image bytes, `mimeType: "image/jpeg"`, `fileName` matching the entity ID.

### Test: state upsert

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "state",
  "operation": "upsert",
  "entityId": "sensor.kitchen_temperature",
  "state": "25",
  "attributes": { "unit_of_measurement": "°C" }
}
```

**Mock** HA API returns `POST /api/states/sensor.kitchen_temperature`:

```json
{
  "entity_id": "sensor.kitchen_temperature",
  "state": "25",
  "attributes": { "unit_of_measurement": "°C" },
  "last_changed": "2025-01-01T00:00:00Z"
}
```

**Expect** output[0] to contain 1 item with the response JSON on `json`.

### Test: service call

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "service",
  "operation": "call",
  "domain": "light",
  "service": "turn_on",
  "serviceData": { "entity_id": "light.living_room" }
}
```

**Expect** the executor to POST to `/api/services/light/turn_on` with body `{"entity_id": "light.living_room"}`.

### Test: template create

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "template",
  "operation": "create",
  "template": "It is {{ now() }}!"
}
```

**Mock** HA API returns the rendered text `"It is 2025-01-01 12:00:00!"`.

**Expect** output[0] to contain 1 item with `{ "json": { "rendered": "It is 2025-01-01 12:00:00!" } }` (wrapping the plain-text response in an object).

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource / operation list | documented | Public n8n docs list 7 resources and all operations |
| Credential shape | documented | Public n8n credentials page covers Host, Port, SSL, Access Token |
| REST API endpoints | documented | Home Assistant developer docs document all used endpoints |
| Camera proxy binary output | documented | HA REST API docs confirm raw image response; binary-wrapping behavior is inferred from n8n node convention |
| Array expansion | inferred | Standard n8n pattern for list-type API responses; confirmed by public docs showing array-returning endpoints |
| Template response wrapping | inferred | The HA API returns plain text; wrapping in `{ rendered }` is a reasonable convention consistent with similar n8n nodes |
| History resource | excluded | Found in corpus but NOT in public n8n docs; omitted per clean-room rules |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/home-assistant.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only