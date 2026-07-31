---
type: n8n-nodes-base.googleSlides
displayName: Google Slides
category: Marketing
versions: [1]
priority: medium
status: specced
---

# Google Slides

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googleslides.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/google/oauth-single-service/ | Public docs only |
| https://developers.google.com/slides/api/reference/rest/v1/presentations/create | Third-party service API docs |
| https://developers.google.com/slides/api/reference/rest/v1/presentations/get | Third-party service API docs |
| https://developers.google.com/slides/api/reference/rest/v1/presentations.pages/get | Third-party service API docs |
| https://developers.google.com/slides/api/reference/rest/v1/presentations.pages/getThumbnail | Third-party service API docs |
| https://developers.google.com/slides/api/reference/rest/v1/presentations/batchUpdate | Third-party service API docs |
| n8n-nodes-base npm package descriptors (v2.15.1) under /tmp isolation | Public descriptor metadata |

## Wire format

- **Type string:** `n8n-nodes-base.googleSlides`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:**
  - `googleSlidesOAuth2Api` (OAuth2) — single-service Google credential; scopes `https://www.googleapis.com/auth/drive`, `https://www.googleapis.com/auth/drive.file`, `https://www.googleapis.com/auth/presentations`
- **Usable as tool:** true
- **Node version:** 1 (single-version; `codexVersion` 1.0)
- **Category:** Marketing

## Parameters

Resource + operation selection follows the standard node pattern: a top-level
`resource` options field (`page` | `presentation`) and a per-resource
`operation` options field.

### Resource: `page`

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `resource` | options | `presentation` | yes | — | Values: `presentation`, `page` |
| `operation` | options | — | yes | `resource:page` | Values: `get`, `getThumbnail` |
| `presentationId` | string | `""` | yes | `resource:page` | ID of the presentation (extracted from a pasted URL when provided) |
| `pageId` | options | — | yes | `resource:page, operation:get \| getThumbnail` | Slide page ID; loaded from the presentation via `getPages`; accepts expressions |

**Output:**

- `get` — the full Google Slides `Page` object for the requested page (`objectId`, `pageElements[]`, `pageProperties`, `slideProperties`, `revisionId`).
- `getThumbnail` — `{ contentUrl: string, height: number, width: number }`.

### Resource: `presentation`

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `resource` | options | `presentation` | yes | — | Values: `presentation`, `page` |
| `operation` | options | — | yes | `resource:presentation` | Values: `create`, `get`, `getSlides`, `replaceText` |
| `title` | string | `""` | yes | `resource:presentation, operation:create` | Title of the new presentation |
| `presentationId` | string | `""` | yes | `resource:presentation, operation:get \| getSlides \| replaceText` | ID of the presentation (extracted from a pasted URL when provided) |
| `text` | string | `""` | yes | `resource:presentation, operation:replaceText` | The text to find |
| `replacement` | string | `""` | yes | `resource:presentation, operation:replaceText` | The text to replace matches with |
| `replaceAllMatches` | boolean | `true` | no | `resource:presentation, operation:replaceText` | Replace every occurrence; when `false`, only the first occurrence is replaced |

## Runtime behavior

### Input

- **Create:** Executes once per node execution; does not consume input items.
- **Get / Get slides / Get page / Get thumbnail:** Execute once per node execution; the target is identified by `presentationId` / `pageId` parameters, not by input items.
- **Replace text:** Executes once per node execution against the presentation identified by `presentationId`; `text`/`replacement` may be expressions evaluated per item when the incoming item count is used to drive the operation.

### Output

- **Create:** Single item with the created `Presentation` resource (contains `presentationId`, `title`, `pageSize`, `slides[]`, `masters[]`, `layouts[]`, `locale`, `revisionId`).
- **Get:** Single item with the full `Presentation` resource.
- **Get slides:** One item per slide in the presentation; each item is the slide's `Page` object (including `slideProperties` with layout/master references and notes page).
- **Get page:** Single item with the requested `Page` object.
- **Get thumbnail:** Single item with `{ contentUrl, height, width }`.
- **Replace text:** Single item with the `batchUpdate` response: `{ presentationId, replies: [{ replaceAllText: { occurrencesChanged } }] }`.

### Errors

- Invalid/missing presentation ID or page ID → throw.
- Authentication failures (expired/invalid OAuth2 token, missing scopes) → throw.
- Google API quota/rate limits (HTTP 429) → throw (engine-level retry applies).
- `continueOnFail`: on failure the node emits `[{ json: { error: <message> } }]` on the main output.

### Expressions

All string parameters (`title`, `presentationId`, `pageId`, `text`, `replacement`) accept expression strings. `presentationId` also accepts a full `https://docs.google.com/presentation/d/<id>/...` URL; the executor must extract the ID.

## Acceptance tests

### Test: Create a presentation

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "presentation",
  "operation": "create",
  "title": "Q3 Report"
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "presentationId": "{{$string}}",
    "title": "Q3 Report",
    "slides": [{}],
    "masters": [],
    "layouts": [],
    "revisionId": "{{$string}}"
  }
}]
```

### Test: Get a presentation

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "presentation",
  "operation": "get",
  "presentationId": "abc123"
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "presentationId": "abc123",
    "title": "Q3 Report",
    "slides": [{ "objectId": "{{$string}}" }],
    "revisionId": "{{$string}}"
  }
}]
```

### Test: Get presentation slides

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "presentation",
  "operation": "getSlides",
  "presentationId": "abc123"
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "objectId": "p1",
    "pageElements": [],
    "slideProperties": {
      "layoutObjectId": "{{$string}}",
      "masterObjectId": "{{$string}}"
    }
  }
}, {
  "json": {
    "objectId": "p2",
    "pageElements": [],
    "slideProperties": {
      "layoutObjectId": "{{$string}}",
      "masterObjectId": "{{$string}}"
    }
  }
}]
```

### Test: Replace text in a presentation

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "presentation",
  "operation": "replaceText",
  "presentationId": "abc123",
  "text": "TODO",
  "replacement": "Done",
  "replaceAllMatches": true
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "presentationId": "abc123",
    "replies": [{
      "replaceAllText": {
        "occurrencesChanged": "{{$number}}"
      }
    }]
  }
}]
```

### Test: Get a page thumbnail

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "page",
  "operation": "getThumbnail",
  "presentationId": "abc123",
  "pageId": "p1"
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "contentUrl": "https://slides.googleapis.com/...",
    "height": "{{$number}}",
    "width": "{{$number}}"
  }
}]
```

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource/operation list | documented | From public n8n docs (2 resources × 6 operations) |
| Type string, version, category | documented | From npm descriptor metadata (node 1.0, Marketing) |
| Credential type | documented | `googleSlidesOAuth2Api`; scopes from Google Slides API reference |
| Output shapes | documented | From descriptor `__schema__` JSON (v2.0.0) + Google Slides API reference |
| Exact UI nesting/displayOptions | inferred | Spec abstracted per clean-room rules; executor may choose equivalent flat layout |
| `replaceAllMatches` / first-occurrence fallback | inferred | Google Slides `replaceAllText` request supports `replaceMethod`; public n8n docs describe only the operation |
| `continueOnFail` error shape | inferred | Standard engine behavior |
| Per-item vs once-per-execution granularity | inferred | Consistent with sibling Google app nodes |

## OpenFlow mapping

- **Definition group:** `integration`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.googleSlides.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
- **Credential types:** `googleSlidesOAuth2Api` (implement as OpenFlow OAuth2 credential adapter)
- **Node type string:** `n8n-nodes-base.googleSlides`
