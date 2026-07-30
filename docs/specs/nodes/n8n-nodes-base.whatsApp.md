---
type: n8n-nodes-base.whatsApp
displayName: WhatsApp Business Cloud
category: Communication
versions: [1, 1.1]
priority: medium
status: specced
---

# WhatsApp Business Cloud

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.whatsapp.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/whatsapp.md | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.whatsApp`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `whatsAppApi` (required)
- **Group:** `output`
- **Usable as tool:** Yes (supports `sendAndWait` for human-in-the-loop)

## Parameters

### Common fields (all resources)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `resource` | options | `message` | yes | — | Options: `message`, `media` |
| `operation` | options | — | yes | depends on `resource` | See per-resource tables below |

### Resource: `message`

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `operation` | options | `sendTemplate` | yes | `resource:message` | Options: `send`, `sendAndWait`, `sendTemplate` |
| `messagingProduct` | hidden | `whatsapp` | — | `resource:message` | Fixed value, sent in request body |
| `phoneNumberId` | options (loadOptions) | `''` | yes | `resource:message` | Loaded from `{{$credentials.businessAccountId}}/phone_numbers`; routed as POST URL base `{{$value}}/messages` |
| `recipientPhoneNumber` | string | `''` | yes | `resource:message` | Recipient phone with country code; pre-send sanitized via `cleanPhoneNumber` |
| `messageType` | options | `text` | — | `resource:message`, `operation:send` | Options: `text`, `image`, `video`, `audio`, `document`, `sticker`, `location`, `contacts` |
| `textBody` | string | `''` | yes | `resource:message`, `operation:send`, `messageType:text` | Max 4096 chars; routed to `text.body` |
| `mediaPath` | options | `useMediaLink` | — | `resource:message`, `operation:send`, `messageType:image\|video\|audio\|document\|sticker` | Options: `useMediaLink`, `useMediaId`, `useMedian8n` |
| `mediaLink` | string | `''` | — | `resource:message`, `operation:send`, `messageType:image\|video\|audio\|document\|sticker`, `mediaPath:useMediaLink` | Routed to `{{$parameter.messageType}}.link` |
| `mediaId` | string | `''` | — | `resource:message`, `operation:send`, `messageType:image\|video\|audio\|document\|sticker`, `mediaPath:useMediaId` | Routed to `{{$parameter.messageType}}.id` |
| `mediaPropertyName` | string | `data` | yes | `resource:message`, `operation:send`, `messageType:image\|video\|audio\|document\|sticker`, `mediaPath:useMedian8n` | Binary property name; pre-send uploads via `mediaUploadFromItem` |
| `mediaFilename` | string | `''` | conditional | `resource:message`, `operation:send`, `messageType:document`, `mediaPath:useMediaId` | Required when using media ID for document; routed to `document.filename` |
| `mediaCaption` | string | `''` | — | `resource:message`, `operation:send`, `messageType:image\|video\|audio\|document\|sticker` | Routed to `{{$parameter.messageType}}.caption` |
| `longitude` | number | — | yes | `resource:message`, `operation:send`, `messageType:location` | Range -180..180; routed to `location.longitude` |
| `latitude` | number | — | yes | `resource:message`, `operation:send`, `messageType:location` | Range -90..90; routed to `location.latitude` |
| `locationName` | string | `''` | — | `resource:message`, `operation:send`, `messageType:location` | Routed to `location.name` |
| `locationAddress` | string | `''` | — | `resource:message`, `operation:send`, `messageType:location` | Routed to `location.address` |
| `contacts` | fixedCollection | `{}` | — | `resource:message`, `operation:send`, `messageType:contacts` | See Contacts structure below |
| `template` | options (loadOptions) | `''` | yes | `resource:message`, `operation:sendTemplate` | Loaded from `{{$credentials.businessAccountId}}/message_templates`; value format `name\|language`; pre-send processed via `templateInfo` |
| `components` | fixedCollection (multiple) | `[]` | — | `resource:message`, `operation:sendTemplate` | Template components (body, header, button); pre-send processed via `componentsRequest` |

#### Contacts structure (when `messageType: contacts`)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `name.formatted_name` | string | `''` | yes | — | Routed to `contacts[0].name.formatted_name` |
| `name.first_name` | string | `''` | — | — | Routed to `contacts[0].name.first_name` |
| `name.last_name` | string | `''` | — | — | Routed to `contacts[0].name.last_name` |
| `name.middle_name` | string | `''` | — | — | Routed to `contacts[0].name.middle_name` |
| `name.suffix` | string | `''` | — | — | Routed to `contacts[0].name.suffix` |
| `name.prefix` | string | `''` | — | — | Routed to `contacts[0].name.prefix` |
| `addresses[]` | fixedCollection | `[]` | — | — | Each: `type` (HOME/WORK), `street`, `city`, `state`, `zip`, `country`, `country_code` |
| `birthday` | string | `''` | — | — | Format YYYY-MM-DD; routed to `contacts[0].birthday` |
| `emails[]` | fixedCollection | `[]` | — | — | Each: `type` (HOME/WORK), `email` |
| `organization` | fixedCollection | `{}` | — | — | Fields: `company`, `department`, `title` |
| `phones[]` | fixedCollection | `[]` | — | — | Each: `type` (CELL/HOME/IPHONE/MAIN/wa_id/WORK — version-dependent), `phone`, `whatsapp_user_id` (v1.1+) |
| `urls[]` | fixedCollection | `[]` | — | — | Each: `type` (HOME/WORK), `url` |

#### Template Components structure

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `type` | options | `body` | yes | — | Options: `body`, `header`, `button` |
| `bodyParameters[]` | fixedCollection | `[]` | — | `type:body` | Each: `type` (text/currency/date_time), `text`/`code`+`amount_1000`/`date_time`/`fallback_value` |
| `sub_type` | options | `quick_reply` | — | `type:button` | Options: `quick_reply`, `url` |
| `index` | number | `0` | — | `type:button` | Range 0..2 |
| `buttonParameters` | fixedCollection | `{}` | — | `type:button` | Single item: `type` (payload/text), `payload`/`text` |

### Resource: `media`

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `operation` | options | `mediaUpload` | yes | `resource:media` | Options: `mediaUpload`, `mediaUrlGet`, `mediaDelete` |
| `phoneNumberId` | options (loadOptions) | `''` | yes | `resource:media`, `operation:mediaUpload` | Loaded from `{{$credentials.businessAccountId}}/phone_numbers`; routed as POST URL base `{{$value}}/media` |
| `mediaPropertyName` | string | `data` | yes | `resource:media`, `operation:mediaUpload` | Binary property name; pre-send processed via `setupUpload` |
| `mediaFileName` | string | `''` | — | `resource:media`, `operation:mediaUpload` | Optional filename for upload |
| `mediaGetId` | string | `''` | yes | `resource:media`, `operation:mediaUrlGet` | Media ID; routed as GET `/{mediaId}` |
| `mediaDeleteId` | string | `''` | yes | `resource:media`, `operation:mediaDelete` | Media ID; routed as DELETE `/{mediaId}` |

### Send and Wait (human-in-the-loop) properties

Added when `operation: sendAndWait` (inherited from `sendAndWait` utility):

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| `responseType` | options | `approval` | — | `operation:sendAndWait` | Options: `approval`, `freeText`, `form` |
| `approveLabel` | string | `✓ Approve` | — | `operation:sendAndWait`, `responseType:approval` | Custom approve button label |
| `disapproveLabel` | string | `✗ Decline` | — | `operation:sendAndWait`, `responseType:approval` | Custom disapprove button label |
| `includeDisapprove` | boolean | `true` | — | `operation:sendAndWait`, `responseType:approval` | Show disapprove button |
| `buttonLabel` | string | `Respond` | — | `operation:sendAndWait`, `responseType:freeText\|form` | Button label on message |
| `formTitle` | string | `''` | — | `operation:sendAndWait`, `responseType:freeText\|form` | Form title |
| `formDescription` | string | `''` | — | `operation:sendAndWait`, `responseType:freeText\|form` | Form description |
| `responseButtonLabel` | string | `Submit` | — | `operation:sendAndWait`, `responseType:freeText\|form` | Submit button label |
| `formFields` | fixedCollection | `[]` | — | `operation:sendAndWait`, `responseType:form` | Custom form fields (see Form Trigger) |
| `limitWaitTime` | boolean | `false` | — | `operation:sendAndWait` | Enable wait timeout |
| `waitTimeType` | options | `interval` | — | `operation:sendAndWait`, `limitWaitTime:true` | Options: `interval`, `dateTime` |
| `waitInterval` | number | `3600` | — | `operation:sendAndWait`, `limitWaitTime:true`, `waitTimeType:interval` | Seconds to wait |
| `waitDateTime` | dateTime | — | — | `operation:sendAndWait`, `limitWaitTime:true`, `waitTimeType:dateTime` | Absolute timestamp to wait until |
| `appendAttribution` | boolean | `true` | — | `operation:sendAndWait` | Append "Sent via n8n" notice |

## Runtime behavior

### Input

- Consumes `main` input items (array of `{ json, binary? }`).
- For `message:send` with `mediaPath:useMedian8n`, reads binary data from `mediaPropertyName` (default `data`).
- For `media:mediaUpload`, reads binary data from `mediaPropertyName` (default `data`).
- For `sendAndWait`, passes input items through to output after resume.

### Output

- **Message Send / Send Template**: Returns WhatsApp API response (message ID, contacts array) as JSON items.
- **Send and Wait**: On resume, returns original input items with `json.waitResponse` containing the human response (approval boolean, free text, or form data).
- **Media Upload**: Returns media ID and metadata.
- **Media Download**: Returns binary data (file) and metadata URL.
- **Media Delete**: Returns success status.

### Errors

- Throws `NodeOperationError` on API errors (non-2xx, or error response body).
- `routing.output.postReceive` includes `sendErrorPostReceive` to normalize error responses.
- `continueOnFail`: If enabled, returns error item with `error` property instead of throwing.

### Expressions

All string parameters support `{{ $parameter.x }}` and `{{ $json.x }}` expressions. Specific fields with dynamic routing:
- `phoneNumberId` → URL base `{{$value}}/messages` or `{{$value}}/media`
- `mediaLink` / `mediaId` / `mediaCaption` / `mediaFilename` → dynamic property `{{$parameter.messageType}}.link|id|caption|filename`
- `template` value → `name|language` split via `templateInfo` pre-send
- `components` → transformed via `componentsRequest` pre-send

### Send and Wait (human-in-the-loop)

- Operation value: `sendAndWait` (mapped to `n8n_workflow.SEND_AND_WAIT_OPERATION`).
- Pauses execution via `putExecutionToWait` with configured timeout.
- Registers webhooks for resume (`sendAndWaitWebhooksDescription`).
- Custom executor handles the send + wait logic in `customOperations.message[SEND_AND_WAIT_OPERATION]`.
- On resume, original input items are returned with response attached.

## Acceptance tests

### Test: Send text message

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "message",
  "operation": "send",
  "phoneNumberId": "1234567890",
  "recipientPhoneNumber": "15551234567",
  "messageType": "text",
  "textBody": "Hello from n8n!"
}
```

**Expect** output[0] (mocked HTTP 200):
```json
[{ "json": { "messaging_product": "whatsapp", "contacts": [{ "input": "15551234567", "wa_id": "15551234567" }], "messages": [{ "id": "wamid.HBgMMTU1NTEyMzQ1NjcVAgARGBJGM..." }] } }]
```

### Test: Send image via link

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "message",
  "operation": "send",
  "phoneNumberId": "1234567890",
  "recipientPhoneNumber": "15551234567",
  "messageType": "image",
  "mediaPath": "useMediaLink",
  "mediaLink": "https://example.com/image.png",
  "mediaCaption": "Test image"
}
```

**Expect** output[0] (mocked HTTP 200):
```json
[{ "json": { "messaging_product": "whatsapp", "contacts": [{ "input": "15551234567", "wa_id": "15551234567" }], "messages": [{ "id": "wamid.HBgMMTU1NTEyMzQ1NjcVAgARGBJGM..." }] } }]
```

### Test: Send template with body parameters

**Given** input items:
```json
[{ "json": { "orderId": "ORD-123", "customerName": "John" } }]
```

**Parameters:**
```json
{
  "resource": "message",
  "operation": "sendTemplate",
  "phoneNumberId": "1234567890",
  "recipientPhoneNumber": "15551234567",
  "template": "order_confirmation|en_US",
  "components": [
    {
      "type": "body",
      "bodyParameters": [
        { "type": "text", "text": "={{ $json.customerName }}" },
        { "type": "text", "text": "={{ $json.orderId }}" }
      ]
    }
  ]
}
```

**Expect** output[0] (mocked HTTP 200):
```json
[{ "json": { "messaging_product": "whatsapp", "contacts": [{ "input": "15551234567", "wa_id": "15551234567" }], "messages": [{ "id": "wamid.HBgMMTU1NTEyMzQ1NjcVAgARGBJGM..." }] } }]
```

### Test: Send and Wait for approval (human-in-the-loop)

**Given** input items:
```json
[{ "json": { "approvalId": "APP-001" } }]
```

**Parameters:**
```json
{
  "resource": "message",
  "operation": "sendAndWait",
  "phoneNumberId": "1234567890",
  "recipientPhoneNumber": "15551234567",
  "messageType": "text",
  "textBody": "Approve request APP-001?",
  "responseType": "approval",
  "approveLabel": "✓ Approve",
  "disapproveLabel": "✗ Reject",
  "includeDisapprove": true,
  "limitWaitTime": false
}
```

**Expect** execution pauses; on resume with approval:
```json
[{ "json": { "approvalId": "APP-001", "waitResponse": { "approved": true, "response": "Approved" } } }]
```

### Test: Upload media

**Given** input items with binary:
```json
[{ "json": {}, "binary": { "data": { "mimeType": "image/png", "data": "<base64>" } } }]
```

**Parameters:**
```json
{
  "resource": "media",
  "operation": "mediaUpload",
  "phoneNumberId": "1234567890",
  "mediaPropertyName": "data",
  "mediaFileName": "test.png"
}
```

**Expect** output[0] (mocked HTTP 200):
```json
[{ "json": { "id": "media_id_123", "messaging_product": "whatsapp" } }]
```

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Message type `sticker` media handling | documented | Treated same as other media types (link/ID/n8n) |
| Template language code parameter | documented (commented in source) | Not exposed as separate parameter; embedded in template value `name\|language` |
| `contacts` message phones `wa_id` field | documented (v1.1+) | Version-gated displayOptions |
| `sendAndWait` custom form fields schema | documented (refs Form Trigger) | Exact field types mirror Form Trigger node |
| Webhook verification for Trigger node | documented (public docs) | Signature verification via `X-Hub-Signature-256` |
| Trigger event filter options | documented | 11 event types; status filter for messages |

## OpenFlow mapping

- **Definition group:** `core` (app node)
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.whatsApp.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
- **Trigger pair:** `n8n-nodes-base.whatsAppTrigger` (separate spec, group `triggers`)