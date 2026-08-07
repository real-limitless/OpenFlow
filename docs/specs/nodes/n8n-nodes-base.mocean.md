---
type: n8n-nodes-base.mocean
displayName: Mocean
category: Communication
versions: [1]
priority: medium
status: specced
---

# Mocean

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.mocean.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/mocean.md | Public docs only |
| https://moceanapi.com/docs/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.mocean`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `moceanApi` (API Key + API Secret)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | string | `sms` | no | — | Selects the channel: `sms` or `voice` |
| operation | string | `send` | no | resource = sms, voice | Fixed to Send |
| from | string | — | yes | resource = sms, voice, operation = send | Originating phone number or sender ID assigned by Mocean |
| to | string | — | yes | resource = sms, voice, operation = send | Recipient phone number in international format |
| message | string | — | yes | resource = sms, voice, operation = send | Message body text |
| language | string | `en-US` | no | resource = voice, operation = send | TTS language/locale for voice messages. Options: `cmn-CN` (Chinese Mandarin), `en-GB` (English UK), `en-US` (English US), `ja-JP` (Japanese), `ko-KR` (Korean) |
| options | object | `{}` | no | resource = sms, voice, operation = send | Optional message properties |

### options sub-fields

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| dlrUrl | string | — | no | URL to receive delivery receipt callbacks |

## Runtime behavior

### Input

Each input item is processed independently. The `from`, `to`, `message`, and options sub-fields are resolved per item and may use expressions.

### Output

For each input item, the node makes a single API request to the Mocean REST API (`https://rest.moceanapi.com/rest/2`). The API response envelope is forwarded as the output item JSON.

Authentication credentials (`mocean-api-key`, `mocean-api-secret`, `mocean-resp-format=JSON`) are injected into the request body or query parameters by the node. The `from` parameter is mapped to `mocean-from`, `to` to `mocean-to`, and `message` to `mocean-text` in the outgoing API call. For voice messages a `mocean-command` field with a JSON-serialized TTS command object is added.

If `continueOnFail` is disabled and the Mocean API returns an error status, the node throws. If `continueOnFail` is enabled, the node produces an error item with `error: { message, description }` instead.

### Errors

- Missing required parameters (`from`, `to`, `message`) cause validation errors.
- Mocean API errors (invalid credentials, invalid phone number, insufficient balance) surface as thrown errors or error items depending on `continueOnFail`.

### Expressions

All string parameters (`from`, `to`, `message`, options sub-fields) accept expression strings.

## Acceptance tests

### Test: send SMS

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "sms",
  "operation": "send",
  "from": "AcmeInc",
  "to": "+1234567890",
  "message": "Hello from Mocean"
}
```

**Expect** output[0]:

The output item's `json` contains the Mocean API response. The node must not throw for a successful API call.

### Test: send voice message with language

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "voice",
  "operation": "send",
  "from": "AcmeInc",
  "to": "+1234567890",
  "message": "This is a voice message",
  "language": "en-US"
}
```

**Expect** output[0]:

The node sends a voice TTS message with the specified language. The output `json` contains the Mocean API response.

### Test: continue on fail

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "sms",
  "operation": "send",
  "from": "",
  "to": "",
  "message": "",
  "continueOnFail": true
}
```

**Expect** output[0]:

The output item has an `error` property with non-null `message` and `description`.

### Test: parameter expression resolution

**Given** input items:

```json
[{ "json": { "phone": "+1234567890", "body": "Alert!" } }]
```

**Parameters:**

```json
{
  "resource": "sms",
  "operation": "send",
  "from": "AcmeInc",
  "to": "={{ $json.phone }}",
  "message": "={{ $json.body }}"
}
```

**Expect** output[0]:

The `to` and `message` values are resolved from the input item. The node sends the API request with resolved values.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| SMS/Voice resources | documented | Public n8n docs confirm two resources (SMS, Voice) each with Send operation |
| from/to/message params | documented | Standard SMS parameters confirmed by public docs |
| language for voice | documented | TTS language locale for voice messages; confirmed by public n8n docs |
| options (dlrUrl) | inferred | Delivery receipt URL; standard Mocean API feature |
| Credential shape | documented | moceanApi with API Key + API Secret |
| Response shape | inferred | Standard Mocean REST API JSON response; not deeply documented in n8n docs |
| usableAsTool | inferred | Node is marked usableAsTool for AI agents |
| continueOnFail behavior | inferred | Standard n8n pattern applied to all action nodes |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/mocean.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
