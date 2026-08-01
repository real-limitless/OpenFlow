---
type: n8n-nodes-base.httpRequestTool
displayName: HTTP Request
category: Action
versions: [1]
priority: high
status: specced
---

# HTTP Request

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.httprequest/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/httprequest/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.httpRequestTool`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** HTTP Request credentials — supports predefined credential types (any n8n built-in/community node credential) and generic credential types (BasicAuth, BearerAuth, DigestAuth, HeaderAuth, QueryAuth, CustomAuth, OAuth1, OAuth2, SSL). SSL certificates may also be configured via a dedicated SSL certificate credential under node Settings.

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| method | string: GET \| POST \| PUT \| PATCH \| DELETE \| HEAD \| OPTIONS | GET | true | | HTTP method |
| url | string | — | true | | Request URL |
| authentication | string: none \| predefinedCredential \| genericCredential | none | false | | Authentication mode |
| predefinedCredentialType | string | — | false | authentication === 'predefinedCredential' | Selects an existing n8n credential type |
| sendBody | boolean | false | false | | Enable request body |
| bodyContentType | string: formUrlencoded \| formData \| json \| binaryData \| raw | — | false | sendBody === true | Body format |
| jsonBody | json | — | false | sendBody === true && bodyContentType === 'json' | JSON request body |
| bodyParameters | json | — | false | sendBody === true && bodyContentType === 'formUrlencoded' | Form-urlencoded body: `{ parameters: [{ name, value }] }` or raw JSON |
| formDataParameters | json | — | false | sendBody === true && bodyContentType === 'formData' | Multipart form-data: array of `{ parameterType, name, value, inputDataFieldName }` |
| rawBody | string | — | false | sendBody === true && bodyContentType === 'raw' | Raw body content |
| rawContentType | string | — | false | sendBody === true && bodyContentType === 'raw' | Content-Type for raw body |
| binaryInputDataFieldName | string | — | false | sendBody === true && bodyContentType === 'binaryData' | Name of binary field containing file body |
| sendQuery | boolean | false | false | | Enable query parameters |
| sendHeaders | boolean | false | false | | Enable custom headers |
| queryParameters | json | — | false | sendQuery === true | Query parameters: `{ parameters: [{ name, value }] }` or raw JSON |
| headerParameters | json | — | false | sendHeaders === true | Request headers: `{ parameters: [{ name, value }] }` or raw JSON |
| importCurl | string | — | false | | Paste a cURL command to populate parameters |

### Options group

When **Add Option** toggles are enabled, the following parameters apply as keys under `options`:

| key path | type | default | notes |
|----------|------|---------|-------|
| options.arrayFormat | string: noBrackets \| bracketsOnly \| bracketsWithIndices | noBrackets | Array serialization for query params (only when sendQuery is true) |
| options.batch.itemsPerBatch | number | — | Items per pagination batch |
| options.batch.batchInterval | number | 0 | Milliseconds between batches |
| options.ignoreSSLIssues | boolean | false | Skip SSL certificate validation |
| options.lowercaseHeaders | boolean | true | Normalize header names to lowercase |
| options.redirect.followRedirects | boolean | true | Follow HTTP redirects |
| options.redirect.maxRedirects | number | — | Max redirect hops (only when followRedirects is true) |
| options.response.responseFormat | string: autoDetect \| file \| json \| text | autoDetect | How to format the response body |
| options.response.putOutputInField | string | — | Field name for file/text output (only when format is file or text) |
| options.response.includeResponseHeadersAndStatus | boolean | false | Return `{ body, headers, statusCode }` instead of just body |
| options.response.neverError | boolean | false | Treat non-2xx as success |
| options.pagination.paginationMode | string: off \| updateParameterInEachRequest \| responseContainsNextUrl | off | Pagination strategy |
| options.pagination.nextUrl | string | — | Expression for next page URL (only when mode is responseContainsNextUrl) |
| options.proxy | string | — | HTTP proxy URL |
| options.timeout | number | — | Request timeout in milliseconds |

### Tool-only options

When used as an AI agent tool, these keys also apply under `options`:

| key path | type | default | notes |
|----------|------|---------|-------|
| options.response.optimizeResponse | boolean | false | Reduce response data sent to LLM |
| options.response.expectedResponseType | string: json \| html \| text | json | Expected format of API response (only when optimizeResponse is true) |
| options.response.fieldContainingData | string | — | JSON path to relevant data subset (json type only) |
| options.response.includeFields | string: all \| selected \| exclude | all | Field filter mode (json type only) |
| options.response.fields | string | — | Comma-separated field names in dot notation (only when includeFields is not all) |
| options.response.selector | string | body | CSS selector for HTML extraction (html type only) |
| options.response.returnOnlyContent | boolean | false | Strip HTML tags (html type only) |
| options.response.elementsToOmit | string | — | CSS selectors to exclude (html + returnOnlyContent only) |
| options.response.truncateResponse | boolean | false | Limit response size (html or text type only) |
| options.response.maxResponseCharacters | number | 1000 | Max characters in response (only when truncateResponse is true) |

## Runtime behavior

### Input

Consumes items from the `main` input. Each item's `json` property can supply expression values for URL, headers, query parameters, and body. Binary properties may feed the request body when using `binaryData` content type. Every input item produces a corresponding output item.

### Output

By default, produces one output item per input item with the HTTP response body set as the item's `json` property. If `includeResponseHeadersAndStatus` is enabled, the output item contains `{ body, headers, statusCode }`. The `responseFormat` option controls deserialization: `autoDetect` infers JSON vs. text; `json` enforces JSON parse; `file` and `text` store output in a named field on the item.

When pagination is active, the node merges results from all pages into a single output array. When batching is active, the node processes items in groups with configurable intervals.

When `optimizeResponse` is enabled (tool mode), the response is transformed according to the expected response type before being passed to the LLM — this may extract a subset of JSON, strip HTML to text content, or truncate to a character limit.

### Errors

By default, any non-2xx status code throws (workflow stops or `continueOnFail` path is taken). The `neverError` option suppresses this, passing the error response as a successful output. Connection failures, DNS errors, and timeouts always throw. SSL errors are thrown unless `ignoreSSLIssues` is enabled.

### Expressions

Every string parameter (URL, headers, query values, body fields, proxy, timeout, pagination URL, etc.) accepts n8n expression strings.

## Acceptance tests

### Test: basic GET request

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "method": "GET",
  "url": "https://jsonplaceholder.typicode.com/todos/1",
  "authentication": "none"
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "userId": 1,
    "id": 1,
    "title": "delectus aut autem",
    "completed": false
  }
}]
```

### Test: POST with JSON body

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "method": "POST",
  "url": "https://jsonplaceholder.typicode.com/posts",
  "sendBody": true,
  "bodyContentType": "json",
  "jsonBody": { "title": "foo", "body": "bar", "userId": 1 },
  "sendHeaders": true,
  "headerParameters": { "parameters": [{ "name": "Content-Type", "value": "application/json" }] }
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "title": "foo",
    "body": "bar",
    "userId": 1,
    "id": 101
  }
}]
```

### Test: full response with headers and status

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "method": "GET",
  "url": "https://jsonplaceholder.typicode.com/todos/1",
  "options": {
    "response": {
      "includeResponseHeadersAndStatus": true
    }
  }
}
```

**Expect** output[0] to contain:
```json
[{
  "json": {
    "body": { "userId": 1, "id": 1, "title": "delectus aut autem", "completed": false },
    "headers": { "content-type": "application/json; charset=utf-8" },
    "statusCode": 200
  }
}]
```

### Test: query parameters via fields

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "method": "GET",
  "url": "https://jsonplaceholder.typicode.com/posts",
  "sendQuery": true,
  "queryParameters": { "parameters": [{ "name": "userId", "value": "1" }] }
}
```

**Expect** output[0]:
```json
[{
  "json": [
    { "userId": 1, "id": 1, "title": "sunt aut facere repellat provident occaecati excepturi optio reprehenderit" }
  ]
}]
```

### Test: tool-mode response optimization (JSON, fieldContainingData)

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "method": "GET",
  "url": "https://jsonplaceholder.typicode.com/todos/1",
  "options": {
    "response": {
      "optimizeResponse": true,
      "expectedResponseType": "json",
      "fieldContainingData": "title"
    }
  }
}
```

**Expect** output[0]:
```json
[{
  "json": "delectus aut autem"
}]
```

### Test: tool-mode response optimization (HTML, returnOnlyContent)

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "method": "GET",
  "url": "https://example.com",
  "options": {
    "response": {
      "optimizeResponse": true,
      "expectedResponseType": "html",
      "returnOnlyContent": true,
      "truncateResponse": true,
      "maxResponseCharacters": 500
    }
  }
}
```

**Expect** output[0] to be a string of at most 500 characters, stripped of HTML tags.

### Test: follow redirects off

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "method": "GET",
  "url": "http://httpbin.org/redirect/1",
  "options": {
    "redirect": {
      "followRedirects": false
    }
  }
}
```

**Expect** output[0] to contain a 3xx redirect response (statusCode 302) rather than the final destination.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Core parameters (method, URL, auth, headers, query, body) | documented | Full coverage in public docs |
| Response options (format, headers/status, neverError) | documented | Full coverage in public docs |
| Pagination modes | documented | Public docs cover all three modes |
| Tool-only optimize response | documented | Public docs cover JSON/HTML/Text optimization |
| Batch processing | documented | Items per batch + interval pattern confirmed |
| Redirects, timeout, proxy, SSL, lowercase headers | documented | All confirmed in public docs |
| Array format options | documented | Three options confirmed |
| cURL import | documented | Public docs describe the feature |
| Exact wire key names (options nesting, displayOptions) | inferred | Abstraction chosen per clean-room rules; actual nxgraph may differ |
| Internal execution order (credential merge vs option merge) | inferred | Outcome is well-understood; internal ordering is irrelevant |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/httpRequestTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only