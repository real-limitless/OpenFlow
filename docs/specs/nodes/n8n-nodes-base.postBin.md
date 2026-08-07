---
type: n8n-nodes-base.postBin
displayName: PostBin
category: Development, Data & Storage
versions: [1]
priority: medium
status: specced
---

# PostBin

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.postbin.md | Public docs only |
| https://www.toptal.com/developers/postbin/api | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.postBin`
- **Aliases:** (none)
- **Inputs:** `main` x 1
- **Outputs:** `main` x 1
- **Credentials:** none (no auth required; public PostBin API at `https://www.postb.in`)

## Parameters

The node selects between two resources, each with their own operations:

### Resource: Bin

| parameter | type | default | required | applies to | notes |
|-----------|------|---------|----------|------------|-------|
| resource | fixed options | `bin` | yes | always | Options: `bin`, `request` |
| operation | fixed options | `create` | yes | resource == `bin` | Options: `Create` (POST /api/bin), `Get` (GET /api/bin/{binId}), `Delete` (DELETE /api/bin/{binId}) |
| binId | string | `""` | yes | operation in (`get`, `delete`) | The opaque bin identifier. Accepts the raw ID or a full PostBin URL from which the ID is extracted. |

### Resource: Request

| parameter | type | default | required | applies to | notes |
|-----------|------|---------|----------|------------|-------|
| resource | fixed options | `bin` | yes | always | Set to `request` |
| operation | fixed options | `get` | yes | resource == `request` | Options: `Get` (GET /api/bin/{binId}/req/{requestId}), `Remove First` (GET /api/bin/{binId}/req/shift — dequeues and returns the oldest request), `Send` (POST /{binId} — sends a test request to the bin) |
| binId | string | `""` | yes | all request operations | Unique bin identifier |
| requestId | string | `""` | yes | operation == `get` | Unique request identifier (returned when a request is sent to the bin) |
| binContent | string (textarea, 5 rows) | `""` | no | operation == `send` | Content body sent in the POST test request |

### Expression support

All string parameters (`binId`, `requestId`, `binContent`) accept n8n expressions.

## Runtime behavior

### Input

Each input item is processed independently. The node forwards the item's JSON as the request body for the `Send` operation (via the `content` property). For all other operations, input item data is ignored.

### Output

**Bin — Create / Get:** returns one item per input with the following fields:

| field | type | description |
|-------|------|-------------|
| `binId` | string | Opaque bin identifier |
| `nowTimestamp` | integer | Unix timestamp (ms) when the bin was created |
| `nowIso` | string | ISO-8601 representation of the creation time |
| `expiresTimestamp` | integer | Unix timestamp (ms) when the bin expires (~30 min after creation) |
| `expiresIso` | string | ISO-8601 representation of the expiry time |
| `requestUrl` | string | Full URL for sending requests to this bin (`https://www.postb.in/{binId}`) |
| `viewUrl` | string | Full URL for viewing requests in the browser (`https://www.postb.in/b/{binId}`) |

**Bin — Delete:** returns the original input items unmodified. The PostBin API responds with `{"msg":"Bin Deleted"}` on success; this is not passed through.

**Request — Get / Remove First:** returns the PostBin request object (method, path, headers, query, body, ip, binId, inserted timestamp) on the output item's `json` property.

**Request — Send:** returns one item with `{ requestId: string }`, where `requestId` is the opaque string returned by PostBin in the response body.

### Error handling

- If the binId format is not recognized (does not match the pattern `\b\d{13}-\d{13}\b` for 13-digit timestamp pairs, or the opaque PostBin short ID format), the node throws a `NodeApiError` with message "Bin ID format is not valid".
- HTTP error responses from the PostBin API (404, 500) are surfaced as node errors.

## Acceptance tests

### Test: Bin — Create

**Given** a single input item:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "bin",
  "operation": "create"
}
```

**Expect** output[0] to contain a `json` object with string fields `binId`, `requestUrl`, `viewUrl`, and numeric timestamp fields `nowTimestamp`, `expiresTimestamp`. The `binId` must be a non-empty string.

### Test: Bin — Get

**Parameters:**

```json
{
  "resource": "bin",
  "operation": "get",
  "binId": "YS4il4gS"
}
```

**Expect** output[0].json to contain the same shape as Create, with `binId` matching the requested value and `requestUrl` containing the binId in its path.

### Test: Request — Send and Get

**Given** a bin already exists (from a previous Create or manual setup):

Step 1 — **Send:**

```json
{
  "resource": "request",
  "operation": "send",
  "binId": "YS4il4gS",
  "binContent": "hello world"
}
```

**Expect** output[0].json to contain `{ "requestId": "<opaque string>" }`.

Step 2 — **Get** the request:

```json
{
  "resource": "request",
  "operation": "get",
  "binId": "YS4il4gS",
  "requestId": "<requestId from step 1>"
}
```

**Expect** output[0].json to contain fields `method`, `path`, `headers`, `body`, `binId`.

### Test: Request — Remove First

**Parameters:**

```json
{
  "resource": "request",
  "operation": "removeFirst",
  "binId": "YS4il4gS"
}
```

**Expect** output[0].json to contain a request object (same shape as Get) representing the oldest request in the bin. After this call, the request is removed from the bin.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Bin ID format validation | inferred from compiled JS | The node extracts binId from either a raw opaque string (`YS4il4gS` format) or a full PostBin URL. The validation regex corresponds to the opaque short-ID format used by the PostBin service. |
| Response shape for Get/Remove First | documented (PostBin API docs) | The raw API response varies between the two timestamp-based ID format and the opaque short-ID format used historically. |
| Error behavior | inferred | The node throws on invalid ID format; API-level errors propagate naturally. |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/postBin.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
