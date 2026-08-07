---
type: n8n-nodes-base.line
displayName: Line
category: Communication
versions: [1]
priority: low
status: specced
aliases: [n8n-nodes-base.lineTool]
deprecated: true
deprecationReason: LINE Notify service ended April 1, 2025
---

# Line

DEPRECATED — LINE Notify discontinued service on 2025-04-01. This spec documents the node as it existed while active.

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.line/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/line/ | Public docs only |
| https://notify-bot.line.me/doc/en/ | Public docs only (LINE Notify API) |

## Wire format

- **Type string:** `n8n-nodes-base.line`
- **Aliases:** `n8n-nodes-base.lineTool`
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `lineNotifyOAuth2Api` (OAuth2 — Client ID + Client Secret)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | string | `notification` | Y | — | Fixed to `notification` (hidden constant) |
| operation | string | `send` | Y | — | Fixed to `send` (hidden constant) |
| message | string | — | Y | — | Text body of the notification |
| additionalFields | object | `{}` | N | — | Optional modifiers below |
| additionalFields.notificationDisabled | boolean | `false` | N | — | If true, the recipient does not receive a push notification |
| additionalFields.imageUi.imageValue.imageFullsize | string | — | N | hidden when binaryData=true | HTTP/HTTPS URL to a full-size image (max 2048×2048 JPEG) |
| additionalFields.imageUi.imageValue.imageThumbnail | string | — | N | hidden when binaryData=true | HTTP/HTTPS URL to a thumbnail (max 240×240 JPEG) |
| additionalFields.imageUi.imageValue.binaryData | boolean | `false` | N | — | Whether to upload an image from binary data instead of URL |
| additionalFields.imageUi.imageValue.binaryProperty | string | `data` | N | shown when binaryData=true | Binary field name containing the image |
| additionalFields.stickerUi.stickerValue.stickerId | number | — | N | — | LINE sticker numeric ID |
| additionalFields.stickerUi.stickerValue.stickerPackageId | number | — | N | — | LINE sticker package numeric ID |

## Runtime behavior

### Input

Each input item triggers one API call to the LINE Notify API. If multiple items arrive and the user wants a single notification, the node should execute once (not per item) — this is controlled by the `executeOnce` flag common to n8n tool nodes.

### Output

Per item, outputs a single object containing:
- `message`: echo of the sent message (or a short confirmation string)
- `status`: HTTP status code from the LINE Notify API (200 on success)

If the API returns an error (e.g. invalid token, rate limit), the node throws unless `continueOnFail` is true, in which case the error object is returned as the output item.

### Errors

- 401 (Unauthorized): invalid or expired OAuth2 token
- 429 (Too Many Requests): rate-limited
- Throws by default; with `continueOnFail` the error object is emitted instead of a success output.

### Expressions

`message`, `imageFullsize`, `imageThumbnail`, `binaryProperty`, `stickerId`, `stickerPackageId`, and `notificationDisabled` all accept expression strings.

## Acceptance tests

### Test: send basic text notification

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "message": "Hello from OpenFlow",
  "additionalFields": {}
}
```

**Expect** output[0]:
- Contains a `status` field with value 200
- Contains a `message` field

### Test: send notification with image URL

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "message": "Check this image",
  "additionalFields": {
    "imageUi": {
      "imageValue": {
        "binaryData": false,
        "imageFullsize": "https://example.com/full.jpg",
        "imageThumbnail": "https://example.com/thumb.jpg"
      }
    }
  }
}
```

**Expect** output[0]:
- `status` equals 200

### Test: send notification with sticker

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "message": "Hello with sticker",
  "additionalFields": {
    "stickerUi": {
      "stickerValue": {
        "stickerPackageId": 1,
        "stickerId": 1
      }
    }
  }
}
```

**Expect** output[0]:
- `status` equals 200

### Test: send notification with binary image data

**Given** input items with binary data:
```json
[{ "json": {}, "binary": { "data": { "data": "<base64_jpeg>", "mimeType": "image/jpeg" } } }]
```

**Parameters:**
```json
{
  "message": "Photo notification",
  "additionalFields": {
    "imageUi": {
      "imageValue": {
        "binaryData": true,
        "binaryProperty": "data"
      }
    }
  }
}
```

**Expect** output[0]:
- `status` equals 200

### Test: notification disabled (silent)

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "message": "Silent notification",
  "additionalFields": {
    "notificationDisabled": true
  }
}
```

**Expect** output[0]:
- `status` equals 200

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| LINE Notify API contract | Public docs | LINE Notify REST API documented at notify-bot.line.me/doc/en/ |
| Parameter names and structure | Inferred from package schema | Image and sticker sub-structures inferred; functional outcomes preserved |
| Tool variant alias | Inferred | Node is usable as AI tool (n8n-nodes-base.lineTool) but no separate spec needed |
| End-of-service date | Public docs | LINE Notify ended 2025-04-01 |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/line.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
- **Deprecated:** Mark as deprecated with a clear error that LINE Notify service ended 2025-04-01
