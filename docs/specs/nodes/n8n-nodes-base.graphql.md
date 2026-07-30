---
type: n8n-nodes-base.graphql
displayName: GraphQL
category: Data & Storage, Development
versions: [1, 1.1]
priority: medium
status: specced
---

# GraphQL

Make a GraphQL request to an endpoint and return the received data. The node
can be used as an AI tool, with many parameters set automatically or directed
by an AI agent.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.graphql.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.graphql/ | Public docs only (older) |
| https://graphql.org/learn/ | Third-party protocol docs (GraphQL query language) |
| https://n8n.io/integrations/graphql | Public template gallery (templates only) |
| CORPUS_DIR package descriptor (`n8n-nodes-base@2.15.1`, `dist/types/nodes.json` GraphQL entry + `dist/node-definitions/nodes/n8n-nodes-base/graphql/v1.ts` & `v11.ts` interfaces) | Public descriptor metadata — parameter names, enums, defaults, credential refs only |

## Wire format

- **Type string:** `n8n-nodes-base.graphql`
- **Aliases:** (none — codex categories `Data & Storage`, `Development`) (**descriptor**)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** optional, depends on `authentication` selection
  (`none` → no credentials). When set: `httpBasicAuth` / `httpCustomAuth` /
  `httpDigestAuth` / `httpHeaderAuth` / `httpQueryAuth` / `oAuth1Api` /
  `oAuth2Api`, gated by `displayOptions.show.authentication` (**descriptor**).
- **AI tool:** `usableAsTool: true` — can be attached to an AI agent
  (**descriptor**; **documented**).

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| authentication | options | `none` | no | — | `none` \| `basicAuth` \| `customAuth` \| `digestAuth` \| `headerAuth` \| `oAuth1` \| `oAuth2` \| `queryAuth` (**documented**; wire enum **descriptor**) |
| requestMethod | options | `POST` | yes | — | `GET` \| `POST` (**documented**; default **descriptor**) |
| endpoint | string | | yes | — | GraphQL endpoint URL; placeholder `http://example.com/graphql` (**documented** + **descriptor**) |
| allowUnauthorizedCerts | boolean | `false` | no | — | Ignore SSL certificate validation failures (**documented**; default **descriptor**) |
| requestFormat | options | `graphql` (v1) / `json` (v1.1) | yes | requestMethod = POST | `graphql` \| `json`; v1 default `graphql`, v1.1 default `json`; v1.1 marks `json` as recommended (**documented** + **descriptor**) |
| query | string | | yes | — | GraphQL query text (**documented**; default `""`, `typeOptions.rows: 6`, **descriptor**) |
| variables | json | `""` | no | requestFormat = json, requestMethod = POST | Query variables as a JSON object (**documented**; wire type `json` **descriptor**) |
| operationName | string | `""` | no | requestFormat = json, requestMethod = POST | Name of the operation to execute (**documented**; wire name **descriptor**) |
| responseFormat | options | `json` | no | — | `json` \| `string` (**documented**; default **descriptor**) |
| dataPropertyName | string | `data` | yes* | responseFormat = string | Output property name to write the response string to (**documented**; default `data`, **descriptor**) |
| headerParametersUi | fixedCollection | `{}` | no | — | Headers (Name/Value pairs) to send with the request; `multipleValues: true` (**documented**; wire name + collection shape **descriptor**) |
| headerParametersUi.parameter[] | collection | | no | headerParametersUi set | Repeating `parameter` row with `name` + `value` strings (**descriptor**) |

\*Required only when its `displayOptions` show the field.

### Version differences

- **v1** (`GraphqlV1`): `requestFormat` default is `graphql`; both
  `requestFormat` values (`graphql` / `json`) accept the same set of
  follow-up parameters (`variables`, `operationName`) when `requestFormat =
  json` AND `requestMethod = POST` (**descriptor** + **documented**).
- **v1.1** (`GraphqlV11`): `requestFormat` default is `json`; the option list
  reorders so `json` is listed first with the description “JSON (Recommended)
  — standard and most widely supported format”, and `graphql` carries the
  caveat “Raw GraphQL query string. Not all servers support this format.”
  All other params unchanged (**descriptor**).
- Credentials enum is identical across v1 and v1.1 (**descriptor**).

## Runtime behavior

### Input

- The node typically emits **one item per input item** (standard item loop),
  issuing one GraphQL request per input item (**inferred** / standard).
- `query`, `variables`, `operationName`, `endpoint`, and `headerParametersUi`
  may carry expression strings so per-item values can be templated from the
  input item JSON (**documented** / standard expression usage).
- When `requestMethod = GET`, the query is typically encoded into the URL
  (server-defined); `query` is still required (**documented**; GET behavior
  **inferred** from GraphQL server convention — not all servers support
  GET). `requestFormat`, `variables`, `operationName` are hidden for GET.
- When `requestMethod = POST`:
  - `requestFormat = graphql`: send the raw `query` as the POST body
    (content type commonly `application/graphql`); `variables` and
    `operationName` are not used (**documented**; wire shape **descriptor**).
  - `requestFormat = json`: send a JSON body of shape
    `{ "query": "...", "variables": {...}, "operationName": "..." }` (content
    type `application/json`); `variables` parsed as JSON; `operationName`
    included when non-empty (**documented** + GraphQL spec).

### Output

- `responseFormat = json` (default): the response body is parsed as JSON and
  the top-level fields (`data`, optional `errors`, `extensions`) become
  properties of the output item’s `json` (**documented**; item shape
  **inferred** from common behavior).
- `responseFormat = string`: the raw response body is written to
  `dataPropertyName` (default `data`) on the output item’s `json`
  (**documented**; property name **descriptor**).
- One output item per input item (standard item loop) (**inferred**).

### Authentication

- `authentication = none` (default): no Authorization / credential headers
  injected by the node (**documented**; **descriptor**).
- All other options require the named credential to be selected and resolved
  at run time; the credential supplies its own header/query/body contribution
  per its public spec (**documented** + **descriptor** credential refs).
- Required credential is gated by `displayOptions.show.authentication` on
  each credential entry; selecting a non-`none` value exposes a
  **Credential for** selector in the UI (**documented**).

### Errors

- Network failure, non-2xx response, malformed JSON, missing required
  parameters, or unresolved credentials → fail item/node per engine policy
  (**inferred** standard).
- When `requestFormat = graphql` (raw) and the server does not support that
  body format, the request may fail; v1.1 doc explicitly recommends `json`
  for compatibility (**documented** caveat in descriptor option description).
- `continueOnFail`: failed item yields an error item per engine policy
  (**inferred**).

### Expressions

`authentication`, `requestMethod`, `endpoint`, `allowUnauthorizedCerts`,
`requestFormat`, `query`, `variables`, `operationName`, `responseFormat`,
`dataPropertyName`, and the `name` / `value` inside `headerParametersUi` all
accept expression strings where the UI allows expressions (**descriptor**:
each typed `string | Expression<string> | PlaceholderValue`).

## Acceptance tests

### Test: POST JSON request body, JSON response

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "authentication": "none",
  "requestMethod": "POST",
  "endpoint": "https://example.com/graphql",
  "requestFormat": "json",
  "query": "{ hello }",
  "variables": "",
  "operationName": "",
  "responseFormat": "json"
}
```

**Expect** a single `POST` request to `endpoint` with
`Content-Type: application/json` and body
`{"query":"{ hello }"}`. On a 2xx response with a valid JSON body, output[0][0].json
contains the parsed `data` (and any `errors` / `extensions`) (**documented** +
GraphQL spec).

### Test: GET method hides JSON-only params

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "authentication": "none",
  "requestMethod": "GET",
  "endpoint": "https://example.com/graphql",
  "query": "{ hello }",
  "responseFormat": "json"
}
```

**Expect** `requestFormat`, `variables`, and `operationName` are **not** shown
in the UI and are not required by the executor (**descriptor** displayOptions).
A GET is issued; `query` is still required (**documented**).

### Test: POST raw GraphQL body (v1 default)

**Parameters:**

```json
{
  "authentication": "none",
  "requestMethod": "POST",
  "endpoint": "https://example.com/graphql",
  "requestFormat": "graphql",
  "query": "query { hello }",
  "responseFormat": "json"
}
```

**Expect** a single `POST` with the raw query string as the body (content
type commonly `application/graphql`); `variables` and `operationName` are
not sent (**documented** + GraphQL convention).

### Test: string response goes to `dataPropertyName`

**Parameters:**

```json
{
  "requestMethod": "POST",
  "endpoint": "https://example.com/graphql",
  "requestFormat": "json",
  "query": "{ hello }",
  "responseFormat": "string",
  "dataPropertyName": "raw"
}
```

**Expect** output[0][0].json.raw equals the raw response body as a string
(**documented**; default `data`, configurable via `dataPropertyName`).

### Test: basic auth credential selected

**Parameters:**

```json
{
  "authentication": "basicAuth",
  "requestMethod": "POST",
  "endpoint": "https://example.com/graphql",
  "requestFormat": "json",
  "query": "{ hello }",
  "responseFormat": "json"
}
```

**Credentials:** valid `httpBasicAuth` (username/password).

**Expect** request includes an `Authorization: Basic …` header supplied by
the credential resolver; no other auth header is added by the node itself
(**documented** + **descriptor** credential reference).

### Test: per-item templated endpoint + variables

**Given** input items:

```json
[
  { "json": { "id": 1 } },
  { "json": { "id": 2 } }
]
```

**Parameters:**

```json
{
  "requestMethod": "POST",
  "endpoint": "https://example.com/graphql",
  "requestFormat": "json",
  "query": "query($id: ID!) { user(id: $id) { name } }",
  "variables": "={{ ({ \"id\": $json.id }) }}",
  "operationName": "",
  "responseFormat": "json"
}
```

**Expect** two output items, each produced from a request whose JSON body
contains `variables.id` equal to the corresponding input item’s `id`
(**documented** expression support + GraphQL JSON body convention).

### Test: custom header

**Parameters:**

```json
{
  "requestMethod": "POST",
  "endpoint": "https://example.com/graphql",
  "requestFormat": "json",
  "query": "{ hello }",
  "responseFormat": "json",
  "headerParametersUi": {
    "parameter": [
      { "name": "X-Trace-Id", "value": "abc-123" }
    ]
  }
}
```

**Expect** outgoing request includes header `X-Trace-Id: abc-123`
(**documented**; wire collection shape `headerParametersUi.parameter[]` with
`name` + `value` **descriptor**).

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Authentication enum and credential references | documented + descriptor | `none` / `basicAuth` / `customAuth` / `digestAuth` / `headerAuth` / `oAuth1` / `oAuth2` / `queryAuth` |
| `requestMethod` enum + default `POST` | documented + descriptor | |
| `requestFormat` options + per-version default | documented + descriptor | v1 default `graphql`, v1.1 default `json` |
| `responseFormat` options + default `json` | documented + descriptor | |
| `dataPropertyName` default `data` and visibility | documented + descriptor | only shown when `responseFormat = string` |
| `headerParametersUi` collection shape | descriptor | name + value strings; `multipleValues: true` |
| `query` required | documented + descriptor | `required: true` on descriptor |
| `variables` parsed as JSON | documented + descriptor | typed `json` |
| `allowUnauthorizedCerts` default `false` | documented + descriptor | |
| GET request body shape (URL-encoded query) | inferred | docs do not detail GET payload shape; spec is silent on it |
| Output item JSON shape (which top-level keys are exposed) | inferred | typically mirrors GraphQL response (`data`, `errors`, `extensions`) |
| Authentication header names per credential | inferred | delegated to the credential’s own contract; not described in this node’s docs |
| Retry / pagination / batched items | gap | not in public docs for this node |

## OpenFlow mapping

- **Definition group:** `core` (input/output is `main`; treat as a request
  node)
- **Executor file:** `src/lib/engine/executors/graphql.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
- **Notes:** Body construction must follow the documented `requestFormat`
  contract (raw vs JSON). Credential resolution is delegated to
  `credentials.<name>` references; do not re-implement credential crypto
  inside the executor. Never load third-party workflow node packages; use a
  pure HTTP client behind the executor.
