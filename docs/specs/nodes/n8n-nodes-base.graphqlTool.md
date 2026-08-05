---
type: n8n-nodes-base.graphql
displayName: GraphQL
category: Development
versions: [1, 1.1]
priority: medium
status: specced
aliases:
  - n8n-nodes-base.graphqlTool
---

# GraphQL

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.graphql.md | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.graphql`
- **Aliases:** `n8n-nodes-base.graphqlTool` (usable-as-tool variant)
- **Inputs:** `main` x 1
- **Outputs:** `main` x 1
- **Credentials:** (conditional — see Parameters table)
  - `httpBasicAuth` — shown when authentication = `basicAuth`
  - `httpCustomAuth` — shown when authentication = `customAuth`
  - `httpDigestAuth` — shown when authentication = `digestAuth`
  - `httpHeaderAuth` — shown when authentication = `headerAuth`
  - `httpQueryAuth` — shown when authentication = `queryAuth`
  - `oAuth1Api` — shown when authentication = `oAuth1`
  - `oAuth2Api` — shown when authentication = `oAuth2`

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| authentication | options: `none`, `basicAuth`, `customAuth`, `digestAuth`, `headerAuth`, `queryAuth`, `oAuth1`, `oAuth2` | `none` | N | always | Selects the HTTP authentication scheme; credential field appears conditionally |
| requestMethod | options: `GET`, `POST` | `POST` | N | always | Underlying HTTP verb |
| endpoint | string | `` | Y | always | GraphQL API URL (e.g. `https://api.example.com/graphql`) |
| allowUnauthorizedCerts | boolean | `false` | N | always | Skip SSL certificate validation when true |
| requestFormat | options (v1): `graphql`, `json`; (v1.1+): `json` (recommended), `graphql` (raw) | `graphql` (v1), `json` (v1.1+) | N | visible only when requestMethod = `POST` | How to encode the query payload |
| query | string (multiline, 6 rows) | `` | Y | always | The GraphQL query string |
| variables | JSON | `` | N | visible when requestMethod = `POST` AND requestFormat = `json` | Query variables as a JSON object |
| operationName | string | `` | N | visible when requestMethod = `POST` AND requestFormat = `json` | Named operation to execute (omitted when empty) |
| responseFormat | options: `json`, `string` | `json` | N | always | How to return the GraphQL response |
| dataPropertyName | string | `data` | Y | visible when responseFormat = `string` | Property name on output item when response is stringified |
| headerParametersUi | fixedCollection of `{name, value}` pairs | `{}` | N | always | Custom HTTP headers to include in the request |

### Expression support

All string parameters (endpoint, query, variables, operationName, dataPropertyName, header name, header value) accept expression strings.

### AI / Tool mode

The node has `usableAsTool: true`. In this mode, parameters may be populated automatically by an AI agent via `$fromAI()`. All parameters are candidates for AI-driven population.

## Runtime behavior

### Input

Each input item triggers one independent GraphQL request. The node iterates over all items and produces one or more output items per request.

### Request construction

1. The HTTP method is set from `requestMethod` (default POST).
2. The URL is set from `endpoint`.
3. If `requestMethod` = `GET`, the query is sent as a `?query=` query-string parameter.
4. If `requestMethod` = `POST`:
   - With `requestFormat` = `graphql` (raw): the body is the raw query string, Content-Type is `application/graphql`.
   - With `requestFormat` = `json`: the body is a JSON object with keys `query`, `variables` (parsed from the JSON string), and `operationName` (set to null when empty). Content-Type is `application/json`.
5. Custom headers from `headerParametersUi` are merged into the request.
6. Credential auth is applied based on the selected `authentication` scheme (Basic/Digest auth sets `.auth`, Header Auth adds a header, Query Auth adds a query param, Custom Auth merges headers/body/qs from JSON, OAuth1/OAuth2 uses the helper request methods).

### Output

**When responseFormat = `json`:**
If the raw response is a JSON string, it is parsed. The GraphQL response body (JSON object or array) is decomposed into one output item per top-level element via `constructExecutionMetaData`. If the response has a `data` key (standard GraphQL envelope), the value of `data` is what gets decomposed into items.

**When responseFormat = `string`:**
The raw response body is written as a string to the property named by `dataPropertyName` on a single output item.

### Error handling

- If the response body starts with `{"errors":`, the errors array is parsed. The first `errors` entry is thrown as a `NodeApiError` with `message` being the joined error messages.
- If response format is `json` but the body is not valid JSON, a `NodeOperationError` is thrown suggesting to use String format.
- If `variables` string cannot be parsed as JSON, a `NodeOperationError` is thrown.
- If `continueOnFail` is enabled, error items are produced as `{ json: { error: <message> } }` and execution continues.
- Standard HTTP-level errors (non-2xx) are surfaced through the underlying request helper.

### Binary data

This node does not handle binary data. Binary file downloads from GraphQL are not supported.

## Acceptance tests

### Test: basic POST query (v1.1 JSON format)

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "authentication": "none",
  "requestMethod": "POST",
  "endpoint": "https://api.example.com/graphql",
  "query": "query { users { id name } }",
  "requestFormat": "json",
  "responseFormat": "json"
}
```

**Expect** the node to send an HTTP POST to `https://api.example.com/graphql` with Content-Type `application/json` and body `{"query": "query { users { id name } }", "variables": {}, "operationName": null}`.

### Test: GET query

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "authentication": "none",
  "requestMethod": "GET",
  "endpoint": "https://api.example.com/graphql",
  "query": "{ users { id } }",
  "responseFormat": "json"
}
```

**Expect** the node to send an HTTP GET to `https://api.example.com/graphql?query={ users { id } }` with no body.

### Test: string response format

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "responseFormat": "string",
  "dataPropertyName": "myData",
  "endpoint": "https://api.example.com/graphql",
  "query": "{ hello }"
}
```

**Expect** one output item: `{ "json": { "myData": "<raw response body string>" } }`.

### Test: variables and operationName

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "requestFormat": "json",
  "query": "query GetUser($id: ID!) { user(id: $id) { name } }",
  "variables": "{\"id\": \"42\"}",
  "operationName": "GetUser"
}
```

**Expect** the JSON body to contain `{"query": "...", "variables": {"id": "42"}, "operationName": "GetUser"}`.

### Test: custom header

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "headerParametersUi": {
    "parameter": [{ "name": "X-Custom", "value": "val" }]
  }
}
```

**Expect** the HTTP request to include header `X-Custom: val`.

### Test: error propagation

**Given** a GraphQL endpoint that returns `{"errors": [{"message": "Not found"}]}`.

**Expect** the node to throw a `NodeApiError` with message `"Not found"`. If `continueOnFail` is on, expect output item `{ "json": { "error": "Not found" } }` instead of throwing.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| V1 vs V1.1 requestFormat defaults | Inferred (corpus: v1 default is `graphql`, v1.1+ default is `json` with richer descriptions) | Public docs only describe current behavior; version differences inferred from corpus |
| Exact credential types and names | Public docs + corpus | Seven standard HTTP auth credential types confirmed |
| get/oauth1/oauth2 request helpers | Inferred from corpus | Implementation details differ by engine |
| Error response parsing | Public docs | Behavior for `{"errors":...}` responses is standard GraphQL convention |
| AI tool integration | Public docs | `usableAsTool: true` and `$fromAI()` support are documented publicly |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/graphqlTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
