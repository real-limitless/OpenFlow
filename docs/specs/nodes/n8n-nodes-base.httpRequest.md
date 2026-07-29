---
type: n8n-nodes-base.httpRequest
displayName: HTTP Request
category: Actions
versions: [4, 4.1, 4.2]
priority: high
status: specced
---

# HTTP Request

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.httprequest.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/httprequest.md | Public docs only (auth overview) |

## Wire format

- **Type string:** `n8n-nodes-base.httpRequest`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** optional generic HTTP auth (basic, header, OAuth1/2, query, digest, custom) or predefined credential types (**documented**)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| method | options | GET | yes | — | DELETE, GET, HEAD, OPTIONS, PATCH, POST, PUT (**documented**) |
| url | string | | yes | — | Endpoint (**documented**) |
| authentication | options | none | no | — | none / predefined / generic (**documented**) |
| sendQuery | boolean | false | no | — | Send Query Parameters (**documented**) |
| queryParameters | fixedCollection/json | | no | sendQuery | Name/value or JSON (**documented**) |
| sendHeaders | boolean | false | no | — | (**documented**) |
| headerParameters | fixedCollection/json | | no | sendHeaders | (**documented**) |
| sendBody | boolean | false | no | — | (**documented**) |
| contentType / bodyContentType | options | | no | sendBody | form-urlencoded, form-data, json, binary, raw (**documented**) |
| body / bodyParameters | various | | no | sendBody | Per content type (**documented**) |
| options.batching | collection | | no | — | items per batch, interval ms (**documented**) |
| options.allowUnauthorizedCerts | boolean | | no | — | Ignore SSL issues (**documented**) |
| options.lowercaseHeaders | boolean | true | no | — | (**documented**) |
| options.redirect | collection | | no | — | follow + max redirects (**documented**) |
| options.response | collection | | no | — | full response, never error, format autodetect/file/json/text (**documented**) |
| options.pagination | collection | | no | — | off / update param / next URL; vars `$pageCount`, `$request`, `$response` (**documented**) |
| options.proxy | string | | no | — | (**documented**) |
| options.timeout | number | | no | — | ms until headers (**documented**) |
| options.queryBatching / arrayFormat | options | | no | query | no brackets / brackets / indexed (**documented**) |

## Runtime behavior

### Input

Usually one request per input item (batching can group) (**documented** batching).

### Output

Default: response body as item JSON (autodetect). Options can include status/headers, force JSON/text/file, or never-error on non-2xx (**documented**).

Pagination loops until complete when enabled (**documented**).

### Errors

Non-2xx fails the item/node unless never-error (**documented**). SSL failures unless ignore SSL (**documented**). Timeout aborts (**documented**).

### Expressions

URL, headers, query, body fields commonly expressions (**inferred** / standard).

## Acceptance tests

### Test: GET JSON body

**Given** one input item `{}`

**Parameters:**

```json
{
  "method": "GET",
  "url": "https://httpbin.org/get",
  "authentication": "none"
}
```

**Expect** output[0][0].json is object (parsed JSON body); no throw on 2xx

### Test: never error on 404

**Parameters:** URL returning 404, options.response.neverError true

**Expect** success path with status available if full response enabled (**documented** behavior)

### Test: query parameters

**sendQuery** true, name/value `foo=bar`

**Expect** request includes query string (observable via httpbin args)

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Exact nested options keys | inferred | UI labels documented |
| Tool-only optimize response | documented | AI agent attachment; low priority for OpenFlow core |
| curl import | documented | Editor-only |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/http-request.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
