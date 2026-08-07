---
type: n8n-nodes-base.yourlsTool
displayName: Yourls
category: Utility
versions: [1]
priority: medium
status: specced
---

# Yourls Tool

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.yourls.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/yourls.md | Public docs only |
| https://yourls.org/docs/guide/advanced/api | Public docs only |
| https://yourls.org/docs/guide/advanced/passwordless-api | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.yourlsTool`
- **Aliases:** (none; base type `n8n-nodes-base.yourls` with `usableAsTool: true`)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `yourlsApi` (required) — API signature token + instance URL; sent as `signature` query param with `format=json`

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | options: `url` | `url` | yes | — | Single resource: URL |
| operation | options: `shorten`, `expand`, `stats` | `shorten` | yes | resource = `url` | Which action to perform |
| url | string | — | yes | resource=url, operation=shorten | The long URL to shorten |
| additionalFields | collection | `{}` | no | resource=url, operation=shorten | Optional fields for shorten |
| additionalFields.keyword | string | — | no | — | Custom keyword for the short URL |
| additionalFields.title | string | — | no | — | Title override (otherwise auto-fetched) |
| shortUrl | string | — | yes | resource=url, operation=expand | The short URL to expand (keyword or full URL) |
| shortUrl | string | — | yes | resource=url, operation=stats | The short URL to get stats for (keyword or full URL) |

## Runtime behavior

### Input

Each input item is processed independently. The node reads per-item parameters using the item index.

### Output

One output item per input item. The response depends on the YOURLS API:

- **shorten:** Returns the full YOURLS `shorturl` response object containing `url` (keyword, url, title, date, ip), `status`, `message`, `title`, `shorturl`, `statusCode`.
- **expand:** Returns the full YOURLS expand response containing `keyword`, `shorturl`, `longurl`, `message`, `statusCode`.
- **stats:** Returns the `link` sub-object from the YOURLS url-stats response, containing `keyword`, `shorturl`, `longurl`, `title`, `timestamp`, `clicks`, `link` (nested original URL metadata).

The response is always JSON (`format=json` is hardcoded). Failures (`status === 'fail'`) throw a `NodeOperationError`. PHP fatal errors in the response also throw.

### Errors

- On `continueOnFail`, error items are emitted as `{ error: message }` for the failing item and processing continues.
- Otherwise any API error (failure status, PHP fatal, network) throws immediately for the current item index.

### Expressions

All string parameters accept expressions (`url`, `shortUrl`, `keyword`, `title`).

## Acceptance tests

### Test: shorten a URL

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "url",
  "operation": "shorten",
  "url": "https://example.com/very-long-page"
}
```

**Expect** output[0] to contain a JSON object with `shorturl` (string), `status` ("success"), and `url.keyword` (string). Execute must call `GET` against `{instance}/yourls-api.php` with query params `action=shorturl`, `url`, `signature`, `format=json`.

### Test: expand a short URL

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "url",
  "operation": "expand",
  "shortUrl": "https://sho.rt/abc"
}
```

**Expect** output[0] to contain a JSON object with `longurl` (string), `shorturl` (string), `statusCode` ("200"), `keyword` (string). Execute must call `GET` with `action=expand`, `shorturl`.

### Test: get stats for a short URL

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "url",
  "operation": "stats",
  "shortUrl": "abc"
}
```

**Expect** output[0] to contain a JSON object with `clicks` (number), `keyword` (string), `shorturl` (string), `longurl` (string), `title` (string). The executor must extract the `link` field from the YOURLS response before emitting. Execute must call `GET` with `action=url-stats`, `shorturl`.

### Test: error on API failure

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "url",
  "operation": "shorten",
  "url": ""
}
```

**Expect** when the YOURLS API responds with `{ "status": "fail", "message": "..." }`, the executor throws a `NodeOperationError` with `ContinueInputDataError` or equivalent. If `continueOnFail` is enabled, emit `{ "error": "..." }` and continue.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| API action values | documented (yourls.org API page) | `shorturl`, `expand`, `url-stats` |
| Per-operation response shape | documented (yourls.org) | shorten: envelope; expand: keyword/shorturl/longurl; stats: link wrapping |
| Credential fields | documented (n8n docs) | `signature` token + `url` (instance base URL) |
| Error handling | inferred from corpus | `status === 'fail'` throws; PHP fatal throws |
| `usableAsTool` flag | inferred from corpus | Base type `n8n-nodes-base.yourls` with `usableAsTool: true`; the `Tool` type string is an alias |
| Output format | documented | Always JSON (`format=json` hardcoded in API helper) |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/yourlsTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
