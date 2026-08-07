---
type: n8n-nodes-base.npmTool
displayName: npm (AI Tool)
category: AI Tool
versions: [1]
priority: medium
status: specced
---

# npm (AI Tool)

A tool variant of the npm node, designed for use as an AI agent tool. When connected to an AI Agent, the agent model can dynamically populate parameters using the `$fromAI()` function. Supports Package metadata/version/search and Distribution Tag listing/update operations against the npm public or custom registry API.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.npm/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/npm/ | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |
| https://github.com/npm/registry/blob/main/docs/REGISTRY-API.md | External API docs |

## Wire format

- **Type string:** `n8n-nodes-base.npmTool`
- **Aliases:** `npm`
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `npmApi` (Access Token + Registry URL)

## Parameters

The node exposes two resource groups. When used as an AI agent tool, parameters can be populated dynamically by the AI model via `$fromAI()` expressions.

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

### AI tool-specific behavior

When used as an AI agent tool:
- Parameters can be populated dynamically by the AI model via `$fromAI()` expressions
- Tool name and description metadata are configurable in the AI Agent node
- Resource and operation selection can be left open for the AI to decide

## Runtime behavior

### Input

Each input item drives one API call. Parameters may reference item data through expressions. Resource/operation selectors are typically static but can be dynamically populated by the AI agent.

### Output

**Output[0]** — operation result, one item per input item:

| resource/operation | output shape |
|---|---|
| package / getMetadata | Full package metadata object from `GET /{package}` |
| package / getVersions | Array of version objects from abbreviated metadata (`application/vnd.npm.install-v1+json`) |
| package / search | `{ objects, total, time }` from `GET /-/v1/search?text={query}` |
| distTag / getAll | Map of tag names to version strings from `GET /-/package/{name}/dist-tags` |
| distTag / update | Confirmation from `PUT /-/package/{name}/dist-tags/{tag}` with version string body |

Each output item carries the shape `{ json: <responseBody> }`.

### Errors

- Network errors or non-2xx responses from the npm registry API cause the node to throw unless `continueOnFail` is set
- Missing or invalid package names result in a 404 from the registry, surfaced as an error
- Dist-tag update requires authentication (valid npm token with publish permissions)
- AI agent tool errors propagate to the agent's error handling

### Expressions

All string parameters (`packageName`, `distTag`, `distVersion`) accept expression strings. Parameters tagged as AI-populatable accept `$fromAI()` expressions.

## Acceptance tests

### Test: package metadata lookup

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

**Expect** output[0].json to contain `name` equal to `"lodash"` and top-level keys `"dist-tags"`, `"versions"`, `"time"`.

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

**Expect** output[0].json to contain an `objects` array with entries each having a `package` object containing `name`, and a `total` field indicating match count.

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

**Expect** output[0].json to be a map of tag names to version strings (e.g. `{ "latest": "4.17.21", "beta": "5.0.0" }`).

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Operations and parameters | documented | Public docs list all Package and Distribution Tag operations |
| AI tool parameter support | documented | Public n8n docs confirm `$fromAI()` support for tool variants |
| Credential fields | documented | Access Token + Registry URL |
| Registry API response shapes | documented | npm registry API spec is well-documented |
| Dist-tag update authentication | inferred | Requires token with publish scope |
| Exact output shape from /search | documented | npm registry API defines the `/-/v1/search` response shape |

## OpenFlow mapping

- **Definition group:** `tools`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.npmTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
