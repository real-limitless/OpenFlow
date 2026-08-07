---
type: n8n-nodes-base.moceanTool
displayName: Mocean
category: AI Tool
versions: [1]
priority: medium
status: specced
---

# Mocean (AI Tool)

An AI agent tool variant of the Mocean node. When connected to an AI Agent, the agent model can dynamically populate parameters using `$fromAI()` or the "let model fill" toggle. Dispatches SMS and voice messages via the Mocean REST API at `https://rest.moceanapi.com/rest/2`.

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.mocean.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/mocean.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |
| https://moceanapi.com/docs/ | External API reference |

## Wire format

- **Type string:** `n8n-nodes-base.moceanTool`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `moceanApi` (required) — API Key + API Secret

## Parameters

The node exposes a resource selector (SMS / Voice) with a single Send operation for each. All data parameters accept expressions and `$fromAI()` dynamic population for AI agent use.

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | string | `sms` | no | — | Channel selector: `sms` or `voice` |
| operation | string | `send` | no | resource = sms, voice | Fixed to Send |
| from | string | — | yes | resource = sms, voice, operation = send | Originating phone number or alphanumeric sender ID |
| to | string | — | yes | resource = sms, voice, operation = send | Recipient phone number in international format |
| message | string | — | yes | resource = sms, voice, operation = send | Message body text |
| language | string | `en-US` | no | resource = voice, operation = send | TTS language/locale. Options: `cmn-CN`, `en-GB`, `en-US`, `ja-JP`, `ko-KR` |
| options | object | `{}` | no | resource = sms, voice, operation = send | Optional message properties |

### options sub-fields

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| dlrUrl | string | — | no | URL to receive delivery receipt callbacks |

## Runtime behavior

### Input

Each input item is processed independently. The `from`, `to`, `message`, `language`, and `options` values are resolved per item.

### Output

For each input item, the node makes a single API request to the Mocean REST API. The API response envelope is forwarded as the output item JSON.

Authentication credentials (`mocean-api-key`, `mocean-api-secret`) are injected into the request. The calling parameters map to API fields: `from` → `mocean-from`, `to` → `mocean-to`, `message` → `mocean-text`. For voice messages a `mocean-command` field with a JSON-serialized TTS command object is added.

### `$fromAI()` support

In AI agent tool mode, the resource, operation, and data field parameters can be populated at inference time by the connected language model. The runtime must support:
- Selecting the channel (sms/voice) at inference time
- Populating `from`, `to`, `message`, `language`, and `options` from model-generated values
- Providing clear descriptions for each parameter to guide model selection

### Errors

- Missing required parameters (`from`, `to`, `message`) cause validation errors before any API call.
- Mocean API errors (invalid credentials, invalid phone number, insufficient balance) throw or produce an error item depending on `continueOnFail`.
- When `continueOnFail` is enabled, the node produces an output item with `{ error: { message, description } }` instead of throwing.

### Expressions

All string parameters accept expression strings. Boolean and numeric parameters accept expressions resolving to the correct type.

## Acceptance tests

### Test: agent sends an SMS

**Given** a connected AI agent that decides to send an SMS message.

**Parameters:** resource `sms`, from `AcmeInc`, to `+1234567890`, message `Hello from AI agent`.

**Expect:** output[0] contains the Mocean API response with a success status and message ID.

### Test: agent sends a voice message with language

**Given** a connected AI agent that decides to send a voice TTS message.

**Parameters:** resource `voice`, from `AcmeInc`, to `+1234567890`, message `This is a voice message`, language `en-US`.

**Expect:** output[0] contains the Mocean API response. The outgoing API call includes a `mocean-command` field.

### Test: agent decides resource and parameters via $fromAI()

**Given** a connected AI agent with a `$fromAI()` compatible moceanTool node.

**Parameters:** resource, to, from, message not set — left for the model to populate.

**Expect:** the agent selects a resource (sms or voice), fills required parameters, and the node produces a successful output.

### Test: continue on fail — missing required parameters

**Given** an input item with empty `from`, `to`, and `message`.

**Parameters:** resource `sms`, from `""`, to `""`, message `""`.

**Node config:** `continueOnFail = true`

**Expect:** output[0] contains an item with `{ error: ... }` instead of throwing.

### Test: parameter expression resolution

**Given** input items:

```json
[{ "json": { "phone": "+1234567890", "body": "Alert from AI agent" } }]
```

**Parameters:** resource `sms`, from `AcmeInc`, to `={{ $json.phone }}`, message `={{ $json.body }}`.

**Expect:** the `to` and `message` values are resolved from the input item. The node sends the API request with resolved values.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string (`moceanTool`) | inferred | Follows the `<base>Tool` naming convention confirmed in other tool specs |
| Resources and operations (2) | documented | Shared with base Mocean node: SMS (send), Voice (send) |
| Credentials | documented | `moceanApi` with API Key + API Secret confirmed by public n8n docs |
| `$fromAI()` support | documented | General AI tool parameter population pattern documented in n8n docs |
| Parameters and behavior | documented | Shared with base Mocean node spec; confirmed at moceanapi.com/docs |
| No dedicated docs page | inferred | The `moceanTool` type has no separate docs page — it's the base node exposed as tool with `usableAsTool: true` |

## OpenFlow mapping

- **Definition group:** `ai-tool`
- **Executor file:** `src/lib/engine/executors/moceanTool.ts`
- **SDK:** `defineNode` with the native `ExecutionContext` only
