---
type: n8n-nodes-base.whatsAppTool
displayName: WhatsApp Business Cloud
category: AI Tool
versions: [1]
priority: medium
status: specced
---

# WhatsApp Business Cloud (AI Tool)

A tool variant of the WhatsApp Business Cloud node, designed for use as an AI agent tool. When connected to an AI Agent, the agent model can dynamically populate parameters using the `$fromAI()` function or the "let model fill" toggle. Wraps the WhatsApp Business Cloud API for Message and Media operations with human-in-the-loop approval support.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.whatsapp.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.whatsapp/common-issues.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/whatsapp.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |
| https://developers.facebook.com/docs/whatsapp/cloud-api | External API docs |

## Wire format

- **Type string:** `n8n-nodes-base.whatsAppTool`
- **Aliases:** (none; shares type with `n8n-nodes-base.whatsApp`)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 2 (second output for approval responses when using "Send and Wait for Response")
- **Credentials:** `whatsAppApi` (API key: Access Token + Business Account ID)

## Parameters

### Resource selection

The user selects a resource (Message, Media) which determines available operations.

### Message operations

| Operation | Key parameters |
|-----------|----------------|
| Send | Recipient Phone Number, Message Type (Text/Image/Audio/Document/Video/Sticker/Contacts/Location/Interactive), Message content fields (dependent on Message Type), optional: Context Message ID (quoted reply) |
| Send and Wait for Response | Recipient Phone Number, Message content, Response Type (Approval / Free Text / Custom Form), optional: Limit Wait Time (interval or wall time), Append n8n Attribution, Approval configuration (single or dual button, custom labels), Free Text configuration (form title, description, button labels), Custom Form configuration (form elements, title, description, button labels) |
| Send Template | Recipient Phone Number, Template Name, Template Language, optional: Template Parameters (header, body, buttons), Context Message ID |

**Response Type details (Send and Wait for Response):**

- **Approval:** Presents approval/disapproval buttons. Configurable as single button (approve only) or dual button (approve + disapprove) with custom labels.
- **Free Text:** Presents a form for free-text input. Customizable message button label, form title/description, and response button label.
- **Custom Form:** Presents a multi-field form built from configurable form elements (supporting text, number, email, phone, date, file, textarea, select, multiselect, checkbox). Customizable message button label, form title/description, and response button label.

### Media operations

| Operation | Key parameters |
|-----------|----------------|
| Upload | Media file (from expression or binary data), MIME type, optional: file name |
| Download | Media ID, optional: output storage preference, file name |
| Delete | Media ID |

### Common properties

When sending messages, the **From** (sender phone number ID) identifies the WhatsApp Business Account's phone number. The **To** field identifies the recipient's phone number in international format.

The message type determines which additional fields appear:
- **Text:** body text, optional preview_url (enable URL link preview)
- **Image/Audio/Document/Video/Sticker:** media ID or media URL, optional caption (text or document)
- **Contacts:** one or more contact objects (name, phone numbers, emails, addresses, organization)
- **Location:** latitude, longitude, optional name and address
- **Interactive:** type (button/list/flow/product/product_list) with type-specific payload

## Runtime behavior

### Input

The tool accepts incoming items from the main input. Each item is processed independently unless otherwise configured.

When used as an AI agent tool, `$fromAI()` can populate any parameter dynamically — the agent model determines the parameter values based on the tool description. Parameters marked as required by the agent descriptor must be supplied by the model, while optional ones may be omitted.

### Output

- **Send / Send Template / Media operations:** Produces one output item per input item on output[0], containing the WhatsApp Cloud API response (`json` property includes messaging_product, contacts, messages array with message IDs).
- **Send and Wait for Response:** When a response is received, the item is routed to output[1] with the response data (approval status or submitted form fields). If the wait times out without response, an empty timeout item may be emitted depending on configuration.
- **Upload:** Returns the media upload response including media ID and MIME type.
- **Download:** Returns the downloaded media file as binary data, with file metadata.
- **Delete:** Returns success confirmation from the API.

### Errors

- **API errors from WhatsApp Cloud API** (e.g., 400 Bad Request, rate limiting, authentication failures): Surface the API error message and code. Common causes include malformed template parameters, invalid recipient numbers, media exceeding size limits, and unsupported message types.
- **Template sending failures:** If template parameters don't match the template's declared format (data types, ordering), the API returns a 400 error with details.
- **Non-text media:** The `Input Data Field Name` parameter should reference the binary property name literally, not as an expression.
- The `continueOnFail` option, when enabled, causes the node to pass the error item through to the output instead of throwing.

### Expressions

All parameter values accept expression strings. When used as an AI tool, `$fromAI()` is supported for dynamic parameter population.

## Acceptance tests

### Test: send text message

**Parameters:**
```json
{
  "resource": "Message",
  "operation": "Send",
  "from": "123456789",
  "to": "15551234567",
  "messageType": "Text",
  "text": "Hello from n8n workflow"
}
```

**Expect** output[0] contains one item. The `json` property includes `messaging_product: "whatsapp"`, `contacts` array with at least one entry containing `wa_id: "15551234567"`, and `messages` array with at least one entry containing the WhatsApp-assigned `id`.

### Test: send template message

**Parameters:**
```json
{
  "resource": "Message",
  "operation": "Send Template",
  "from": "123456789",
  "to": "15551234567",
  "template": "hello_world",
  "language": "en_US"
}
```

**Expect** output[0] contains one item. The `json` property includes `messaging_product: "whatsapp"` and `messages` array with a message ID.

### Test: upload media

**Parameters:**
```json
{
  "resource": "Media",
  "operation": "Upload",
  "from": "123456789"
}
```

**Given** binary input containing a file with property name `data`.

**Expect** output[0] contains one item. The `json` property includes `id` (the media upload ID returned by the Cloud API).

### Test: send and wait for approval response

**Parameters:**
```json
{
  "resource": "Message",
  "operation": "Send and Wait for Response",
  "from": "123456789",
  "to": "15551234567",
  "messageType": "Text",
  "text": "Approve this action?",
  "responseType": "Approval",
  "approvalType": "approveAndDisapprove",
  "approveLabel": "Yes",
  "disapproveLabel": "No"
}
```

**Expect** When the recipient approves, output[1] contains one item with approval data indicating approval. When the recipient disapproves, output[1] contains one item indicating disapproval.

### Test: error on invalid recipient

**Parameters:**
```json
{
  "resource": "Message",
  "operation": "Send",
  "from": "123456789",
  "to": "9999999999",
  "messageType": "Text",
  "text": "Test"
}
```

**Expect** Node throws an error with the API error details (invalid recipient number). When `continueOnFail` is enabled, the error item is passed through on output[0].

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Operations (Message send/sendAndWaitTemplate, Media upload/download/delete) | documented | Public n8n docs page enumerates all operations |
| Send and Wait Response Types (Approval, Free Text, Custom Form) | documented | Public docs describe each type and customization options |
| Credential type `whatsAppApi` (Access Token + Business Account ID) | documented | Public WhatsApp credentials page documents API key authentication |
| $fromAI() dynamic parameter support | documented | Public n8n how-tools-work and use-ai-for-parameters docs confirm tool nodes support this pattern |
| Output shape (messaging_product, contacts, messages) | documented | Documented as "Send Text/Media/Template" returning API response |
| Credential type `whatsAppTriggerApi` distinct | inferred | Trigger uses OAuth2; tool/app node uses API key; confirmed from trigger spec |
| Two-output mode for "Send and Wait for Response" | inferred | Public n8n docs for the base WhatsApp node describe the HITL pattern; telegramTool and gmailTool specs follow a 2-output pattern for Send and Wait variants |
| Exact sub-parameter nesting under "options" | inferred | Abstracted to functional outcome level; exact UI grouping not specified |

## OpenFlow mapping

- **Definition group:** `transform`
- **Executor file:** `src/lib/engine/executors/whatsapp-tool.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
- **Notes:** AI agent tool variant. Shares the `whatsAppApi` API-key credential with the base WhatsApp Business Cloud node. Supports `$fromAI()` for dynamic parameter population. The "Send and Wait for Response" operation requires two output channels: output[0] for the sent message confirmation, output[1] for the received approval/response. The executor wraps the Meta WhatsApp Cloud API at `https://graph.facebook.com/v17.0/`.
