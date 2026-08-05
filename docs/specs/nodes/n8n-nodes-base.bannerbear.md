---
type: n8n-nodes-base.bannerbear
displayName: Bannerbear
category: Marketing
versions: [1]
priority: medium
status: specced
---

# Bannerbear

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.bannerbear.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/bannerbear.md | Public docs only |
| https://developers.bannerbear.com/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.bannerbear`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `bannerbearApi` (API key — Project API Key from Bannerbear project Settings → API Key)

## Parameters

The node exposes two resources each with one or two operations. Parameters listed at the highest abstraction level; nested layer-modification options are documented by the external Bannerbear API and are not re-enumerated here.

| resource | operation | parameter | type | required | notes |
|----------|-----------|-----------|------|----------|-------|
| Image | Create | Template UID | string | yes | The template uid to base the image on. |
| Image | Create | Modifications | array of objects | yes | One entry per template layer to override. Each object specifies the layer `name` plus any of: `text` (replacement string), `image_url` (replacement image URL), `color` (hex), `background` (hex), and other per-layer overrides (font_family, text_align_h/v, shift_x/y, hide, etc.) defined by the Bannerbear API. |
| Image | Create | Webhook URL | string | no | URL to POST the completed Image object to. |
| Image | Create | Transparent Background | boolean | no | Render PNG with transparent background (default false). |
| Image | Create | Render PDF | boolean | no | Render additional PDF output (costs 3x quota). |
| Image | Create | Template Version | integer | no | Pin an older template version. |
| Image | Create | Metadata | string | no | Arbitrary metadata string. |
| Image | Get | Image UID | string | yes | UID of the image to retrieve. |
| Template | Get | Template UID | string | yes | UID of the template to retrieve. |
| Template | Get All | (none) | — | | Lists all templates in the project (no pagination params exposed). |

## Runtime behavior

### Input

The node passes each input item through independently. For the Create Image operation, fields holding the Template UID and Modifications accept expressions. For Get Image / Get Template / Get All Templates, the identifying parameter accepts expressions.

### Output

Each output item corresponds to one input item and contains the Bannerbear API response object as `json`. Common response fields:
- `uid` — unique identifier
- `status` — `pending`, `completed`, or `failed`
- `self` — permalink to the object
- `created_at` — timestamp

**Image Create / Get** also includes: `image_url` (final rendered URL, null until completed), `template`, `template_name`, `width`, `height`, `modifications` (array of applied layer names), `pdf_url`, `transparent`, `webhook_url`, `webhook_response_code`, `render_pdf`, `metadata`.

**Template Get / Get All** also includes: `name`, `preview_url`, `available_modifications`, `width`, `height`, `tags`.

### Errors

- If the Bannerbear API returns a 4xx or 5xx status, the node throws an error with the HTTP status and response body.
- The node does not poll for completion; it returns the initial `202 Accepted` response body (status `pending`) for Create operations. Downstream workflows must poll the Get Image endpoint to wait for `status: completed`.
- When `continueOnFail` is enabled, errors are surfaced via the `error` property on the output item instead of throwing.

### Expressions

All resource locator parameters (Template UID, Image UID) accept expressions. The Modifications array for Image Create also accepts expression strings.

## Acceptance tests

### Test: Image — Create

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "Image",
  "operation": "Create",
  "templateUid": "abc123",
  "modifications": [
    { "name": "title", "text": "Hello World" },
    { "name": "photo", "image_url": "https://example.com/img.jpg" }
  ],
  "transparent": false,
  "renderPdf": false
}
```

**Expect** output[0] `json` to contain:
- `uid` (string)
- `status` (string, likely `"pending"`)
- `self` (string, starts with `https://api.bannerbear.com/v2/images/`)
- `image_url` (null at this point)
- `modifications` (array with entries matching input)

### Test: Image — Get

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "Image",
  "operation": "Get",
  "imageUid": "{{ $json.uid }}"
}
```

**Expect** output[0] `json` to contain:
- `uid` matching the requested UID
- `status` (one of `pending`, `completed`, `failed`)
- If status is `completed`, `image_url` is a non-null URL string

### Test: Template — Get All

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "Template",
  "operation": "Get All"
}
```

**Expect** output[0] `json` to be an array of template objects, each containing:
- `uid` (string)
- `name` (string)
- `preview_url` (string or null)
- `available_modifications` (array)

### Test: Template — Get

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "Template",
  "operation": "Get",
  "templateUid": "tmpl_001"
}
```

**Expect** output[0] `json` to contain:
- `uid` matching the requested UID
- `name` (string)
- `available_modifications` (array of layer descriptor objects)

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Exact parameter nesting in UI | documented | n8n docs confirm two resources, four operations. |
| Create Image modification sub-parameters | documented | Defined by the external Bannerbear API; the node passes them through. |
| Pagination for list endpoints | inferred | n8n docs mention Get All Templates without pagination; Bannerbear API supports page/limit params but the node may not expose them. |
| Async polling behavior | inferred | Requires polling the Get Image endpoint; the node does not auto-wait. |
| Credential type | documented | `bannerbearApi` — Project API Key (Bearer token). |

## OpenFlow mapping

- **Definition group:** `Marketing`
- **Executor file:** `src/lib/engine/executors/BannerbearExecutor.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
