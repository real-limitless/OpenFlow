---
type: n8n-nodes-base.npm
displayName: npm
category: Development Tools
versions: [1]
priority: medium
status: specced
---

# npm

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.npm/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/npm/ | Public docs only |
| https://github.com/npm/registry/blob/main/docs/REGISTRY-API.md | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.npm`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `npmApi` (access token + registry URL)

## Parameters

The node exposes two resource groups, each with a distinct set of operations:

### Package resource

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | fixed | `package` | Y | — | Groups operations under the Package resource |
| operation | fixed | `getMetadata` | Y | resource = package | One of: `getMetadata`, `getVersions`, `search` |
| packageName | string | — | Y | operation ∈ {getMetadata, getVersions} | The npm package name to look up (e.g. `lodash`, `@scope/name`) |
| packageName | string | — | Y | operation = search | Search query string (package name, keyword, or author) |

### Distribution Tag resource

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | fixed | `distTag` | Y | — | Groups operations under the Distribution Tag resource |
| operation | fixed | `getAll` | Y | resource = distTag | Retrieve all dist-tags for a package |
| packageName | string | — | Y | resource = distTag, operation = getAll | The npm package name |
| operation | fixed | `update` | Y | resource = distTag | Create or update a single dist-tag |
| packageName | string | — | Y | resource = distTag, operation = update | The npm package name |
| distTag | string | — | Y | resource = distTag, operation = update | The tag name (e.g. `latest`, `beta`, `next`) |
| distVersion | string | — | Y | resource = distTag, operation = update | The semver version string the tag should point to |

## Runtime behavior

### Input

Each input item drives one API call. Fields on the input item (`json`) can be referenced via expressions in the parameter values.

### Output

Success output items contain:

| resource/operation | output shape |
|---|---|
| package / getMetadata | Full package metadata object from the npm registry (`GET /{package}`) |
| package / getVersions | Array of version objects from the abbreviated metadata (`GET /{package}` with `application/vnd.npm.install-v1+json`) |
| package / search | `{ objects, total, time }` from `GET /-/v1/search?text={query}` |
| distTag / getAll | Array of `{ tag, version }` for all dist-tags |
| distTag / update | The updated dist-tag object or `{ success: true }` |

Each output item carries the shape `{ json: <responseBody> }`.

### Errors

- Network errors or non-2xx responses from the npm registry API cause the node to throw (red error state) unless `continueOnFail` is set, in which case the error is passed as `{ json: { error: { message, statusCode } } }`.
- Missing or invalid package names result in a 404 from the registry, surfaced as an error.
- Dist-tag update requires authentication (valid npm token with appropriate publish permissions).

### Expressions

All string parameters (`packageName`, `distTag`, `distVersion`) accept expression strings.

## Acceptance tests

### Test: package lookup

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "package",
  "operation": "getMetadata",
  "packageName": "lodash"
}
```

**Expect** output[0]:
```json
[{ "json": { "name": "lodash", "_id": "lodash", "dist-tags": { "latest": "..." }, "versions": { ... }, "time": { ... } } }]
```

### Test: package search

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "package",
  "operation": "search",
  "packageName": "react"
}
```

**Expect** output[0]:
```json
[{ "json": { "objects": [{ "package": { "name": "react", ... }, "score": { ... }, "searchScore": ... }], "total": 1, "time": "..." } }]
```

### Test: dist-tag listing

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "distTag",
  "operation": "getAll",
  "packageName": "lodash"
}
```

**Expect** output[0]:
```json
[{ "json": { "latest": "4.17.21", "beta": "5.0.0" } }]
```

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Operation names | Public docs | Confirmed from docs.n8n.io |
| Credential fields | Public docs | Access Token + Registry URL |
| Registry API response shapes | Public docs (npm registry spec) | npm registry API is well-documented |
| Dist-tag update API mechanics | Inferred from npm CLI docs | PUT /-/package/{name}/dist-tags/{tag} with version string body |
| Auth requirements for dist-tag update | Inferred from npm public docs | Requires token with publish scope |
| Parameter nesting, option enums, defaults | Inferred from published JSON descriptor | Abstraction kept high — no internal schema reconstructed |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/npm.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
