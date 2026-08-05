---
type: n8n-nodes-base.googleSlidesTool
displayName: Google Slides
category: AI Tool
versions: [1]
priority: medium
status: specced
---

# Google Slides (AI Tool)

A tool variant of the Google Slides node, designed for use as an AI agent tool. When connected to an AI Agent, the agent model can dynamically populate parameters using the `$fromAI()` function or the "let model fill" toggle. Supports Presentation resource operations (Create, Get, Get slides, Replace text) and Page resource operations (Get, Get thumbnail) against the Google Slides API v1.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.googleslides.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/google.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |
| https://developers.google.com/slides/api/reference/rest/v1/presentations | External API docs |
| https://developers.google.com/workspace/slides/api/reference/rest/v1/presentations.pages/getThumbnail | External API docs |

## Wire format

- **Type string:** `n8n-nodes-base.googleSlidesTool`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `googleSlidesOAuth2Api` (OAuth2) or `googleApi` (service account). Google Slides supports both OAuth2 and service account authentication.

## Parameters

### Authentication

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| authentication | options | `oAuth2` | no | `oAuth2` or `serviceAccount` |

### Resources and operations

The user selects a resource and then an operation within that resource:

| Resource | Operation | Required parameters | Optional parameters |
|----------|-----------|---------------------|---------------------|
| Presentation | Create | Title | — |
| Presentation | Get | Presentation ID | — |
| Presentation | Get presentation slides | Presentation ID | — |
| Presentation | Replace text | Presentation ID, Old text, New text | — |
| Page | Get a page | Presentation ID, Slide ID | — |
| Page | Get a thumbnail | Presentation ID, Slide ID | Thumbnail size |

### Presentation identification

- **Presentation ID**: the Google Slides presentation identifier. It can be derived from the presentation URL (`https://docs.google.com/presentation/d/<PRESENTATION_ID>/edit`). Presentation IDs are stable even when the title changes.
- **Slide ID**: the object ID of an individual page/slide within the presentation. Obtainable from the Get presentation slides operation.

### Replace text behavior

The Replace text operation performs a find-and-replace across all slides in the presentation. Every occurrence of Old text in shape text elements is replaced with New text. This uses the Google Slides API `batchUpdate` with a `replaceAllText` request.

### Thumbnail size

When provided, the thumbnail size controls the output image dimensions. The Google Slides API supports pixel-size requests; the node exposes common size presets.

### AI tool-specific behavior

When used as an AI agent tool:
- Parameters can be populated dynamically by the AI model via `$fromAI()` expressions
- The "let model fill" toggle is available on appropriate parameter fields
- Optional fields are auto-populated by the AI agent when "let model fill" is enabled

## Runtime behavior

### Input

Consumes items from `main` input. Field values (presentation ID, title, text patterns) can reference input item properties via expressions.

### Output

All operations produce items on `output[0]`:

- **Presentation → Create** — returns the created presentation from the Google Slides API including `presentationId`, `title`, `pageCount`, and the slide/page structure (`slides[]`)
- **Presentation → Get** — returns the presentation object matching the Presentation ID, including `presentationId`, `title`, `pageCount`, `slides[]` (each with `objectId`, `pageElements[]`, `pageType`)
- **Presentation → Get presentation slides** — returns an array of slides for the given presentation; each slide item contains `objectId`, `pageType`, `pageElements[]`
- **Presentation → Replace text** — returns the presentation object after the replacement, including the number of replacements made
- **Page → Get a page** — returns the page object matching the Slide ID, with `objectId`, `pageType`, `pageElements[]` (shapes, tables, images, videos, etc.), each element containing `objectId`, `size`, `transform`, and element-type-specific properties
- **Page → Get a thumbnail** — returns the page thumbnail as an image URL (`contentUrl`) with dimensions `width`/`height`

Output follows the Google Slides API v1 resource schemas:
- Presentation: `presentationId`, `title`, `locale`, `pageSize`, `revisionId`, `slides[]` (array of Page resources), `masters[]`, `layouts[]`
- Page: `objectId`, `pageType` (SLIDE, MASTER, LAYOUT), `revisionId`, `pageElements[]` (array of PageElement resources)
- PageElement: `objectId`, `size`, `transform`, `title`, `description`, plus one of: `shape`, `image`, `video`, `table`, `wordArt`, `sheetsChart`, `line`, `group`
- Shape: `shapeType`, `text` (with `textElements[]`)
- Thumbnail: `contentUrl` (string), `width` (integer, pixels), `height` (integer, pixels)

### Errors

- API errors (auth failures, permission errors, invalid presentation IDs, invalid slide IDs, missing text patterns in replace-all) propagate as node errors
- `continueOnFail` allows the workflow to proceed on error
- Replace text with an Old text pattern that does not exist in the presentation succeeds with zero replacements

### Expressions

All string/boolean/number fields accept standard n8n expressions. Parameters tagged as AI-populatable accept `$fromAI()` expressions.

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
  "title": "Q4 Review"
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "presentationId": "<valid-presentation-id>",
    "title": "Q4 Review",
    "pageCount": 1,
    "slides": [
      {
        "objectId": "<slide-object-id>",
        "pageType": "SLIDE",
        "pageElements": []
      }
    ]
  }
}]
```

### Test: Get a presentation by ID

**Given** input items:
```json
[{ "json": { "presentationId": "1ABCxyz" } }]
```

**Parameters:**
```json
{
  "resource": "presentation",
  "operation": "get",
  "presentationId": "={{ $json.presentationId }}"
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "presentationId": "1ABCxyz",
    "title": "Q4 Review",
    "pageCount": 2,
    "slides": [
      { "objectId": "slide1", "pageType": "SLIDE", "pageElements": [] },
      { "objectId": "slide2", "pageType": "SLIDE", "pageElements": [] }
    ]
  }
}]
```

### Test: Replace text across all slides

**Given** input items:
```json
[{ "json": { "presentationId": "1ABCxyz" } }]
```

**Parameters:**
```json
{
  "resource": "presentation",
  "operation": "replaceText",
  "presentationId": "={{ $json.presentationId }}",
  "oldText": "{{Q3}}",
  "newText": "Q4"
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "presentationId": "1ABCxyz",
    "title": "Q4 Review",
    "revisionId": "<opaque-revision-token>",
    "slides": []
  }
}]
```

### Test: Get slides from a presentation (list)

**Given** input items:
```json
[{ "json": { "presentationId": "1ABCxyz" } }]
```

**Parameters:**
```json
{
  "resource": "presentation",
  "operation": "getSlides",
  "presentationId": "={{ $json.presentationId }}"
}
```

**Expect** output[0]:
```json
[{
  "json": [{
    "objectId": "slide1",
    "pageType": "SLIDE",
    "pageElements": []
  }]
}]
```

### Test: Get page thumbnail

**Given** input items:
```json
[{ "json": { "presentationId": "1ABCxyz", "slideId": "slide1" } }]
```

**Parameters:**
```json
{
  "resource": "page",
  "operation": "getThumbnail",
  "presentationId": "={{ $json.presentationId }}",
  "slideId": "={{ $json.slideId }}",
  "thumbnailSize": "LARGE"
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "contentUrl": "https://slides.googleapis.com/.../thumbnail",
    "width": 1600,
    "height": 900
  }
}]
```

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Operations (Presentation Create/Get/GetSlides/ReplaceText, Page Get/GetThumbnail) | documented | Public n8n docs list all six operations across Presentation and Page resources |
| AI tool parameter support | documented | Public n8n docs confirm the node can be used as an AI tool with `$fromAI()` |
| Google Slides API v1 endpoints | documented | `presentations.create`, `presentations.get`, `presentations.batchUpdate` (replaceAllText), `presentations.pages/get`, `presentations.pages/getThumbnail` per Google API reference |
| Presentation output schema | documented | Google Slides API v1 Presentation resource schema is public |
| Replace text behavior | documented | Google Slides API `replaceAllText` request is publicly documented |
| Thumbnail size options | inferred | Public n8n docs do not specify size enum values; inferred from Google Slides API thumbnail pixel-size options |
| Credential type names | inferred | `googleSlidesOAuth2Api` (OAuth2) and `googleApi` (service account) follow the Google credential conventions; both auth methods are documented as supported for Google Slides |
| Tool-specific parameter layout | inferred | The tool variant wraps the standard Google Slides operations identically to the base node in agent context |
| Version differences | inferred | Single version for this tool variant; base node has one version |

## OpenFlow mapping

- **Definition group:** `tools`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.googleSlidesTool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
