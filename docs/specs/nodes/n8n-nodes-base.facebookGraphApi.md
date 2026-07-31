---
type: n8n-nodes-base.facebookGraphApi
displayName: Facebook Graph API
category: Development
versions: [1]
priority: medium
status: specced
---

# Facebook Graph API

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.facebookgraphapi.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/facebookgraph.md | Public docs only |
| n8n-nodes-base npm package descriptors (v2.15.1) under /tmp isolation | Public descriptor metadata |

## Wire format

- **Type string:** `n8n-nodes-base.facebookGraphApi`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `facebookGraphApi` (OAuth2 or App Access Token)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| host | fixed (Default / Video) | Default | yes | | Selects base URL: `graph.facebook.com` (Default) or `graph-video.facebook.com` (Video) |
| method | fixed (GET / POST / DELETE) | GET | yes | | HTTP method for the request |
| graphApiVersion | string | — | no | | Version string like `v19.0`; appended to the host URL |
| node | string | — | yes | | Graph API node path, e.g. `me`, `/<page-id>/feed` |
| edge | string | — | no | | Edge name representing a collection of objects attached to the node |
| ignoreSSLIssues | boolean | false | no | | Bypass SSL certificate validation |
| sendBinaryFile | boolean | false | no | displayed when method=POST | If true, binary data is sent as the request body |
| inputBinaryField | string | — | conditional | shown when sendBinaryFile=true | Name of the binary property containing the file data |

## Runtime behavior

### Input

Each input item is processed independently. The node constructs a Facebook Graph API request from the parameter values.

### Output

A single output item per input item. The `json` property contains the parsed API response body (typically a JSON object from the Facebook Graph API). If the response is binary (e.g. video upload), the binary data is attached under the `data` binary property and the JSON response is placed in `json`.

### Errors

- HTTP errors (4xx/5xx) from the Facebook API are surfaced as node errors.
- `continueOnFail` produces an error item in the output branch instead of halting.
- Missing required parameters (`node`, `method`) throw before any HTTP call.

### Expressions

All string parameters (`graphApiVersion`, `node`, `edge`, `inputBinaryField`) accept expressions.

## Acceptance tests

### Test: simple GET request

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "host": "Default",
  "method": "GET",
  "node": "me",
  "edge": ""
}
```

**Expect** output[0] contains `json` with the parsed Graph API response for the `/me` endpoint.

### Test: POST with binary file

**Given** input items:

```json
[{
  "json": {},
  "binary": {
    "video": { "data": "base64-encoded-video", "mimeType": "video/mp4", "fileName": "intro.mp4" }
  }
}]
```

**Parameters:**

```json
{
  "host": "Video",
  "method": "POST",
  "node": "/<page-id>/videos",
  "sendBinaryFile": true,
  "inputBinaryField": "video"
}
```

**Expect** output[0] contains `json` with the upload response and `binary.data` with the response binary data.

### Test: DELETE request

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "host": "Default",
  "method": "DELETE",
  "node": "/<object-id>"
}
```

**Expect** output[0] contains `json` with the Graph API DELETE response (typically `{ "success": true }`).

### Test: continueOnFail produces error item

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "continueOnFail": true,
  "host": "Default",
  "method": "GET",
  "node": "/nonexistent-resource"
}
```

**Expect** output[0] contains a single item with `json` containing an `error` property.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Host URL options | documented | Public docs list Default and Video hosts |
| Operations (GET/POST/DELETE) | documented | Same set for both Default and Video Uploads |
| Send Binary File | documented | Only available for POST |
| Graph API Version format | documented | Free-form string per Facebook versioning |
| Node/Edge semantics | documented | Follows Facebook Graph API conventions |
| Full credential OAuth2 flow | documented | Public docs cover OAuth2 and App Access Token |
| Exact `graphApiVersion` default | inferred | Not specified in docs; likely empty string (no version prefix) |
| CSS/node.json internal structure | not used | Not extracted from corpus; spec is at functional level |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/facebook-graph-api.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only