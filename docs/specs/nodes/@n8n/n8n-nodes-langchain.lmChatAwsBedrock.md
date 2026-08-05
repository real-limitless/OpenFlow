---
type: "@n8n/n8n-nodes-langchain.lmChatAwsBedrock"
displayName: AWS Bedrock Chat Model
category: AI
versions: [1, 1.1]
priority: high
status: specced
---

# AWS Bedrock Chat Model

Cluster **sub-node**: configures an Amazon Bedrock-hosted chat model and supplies it to a root node (AI Agent, Basic LLM Chain, etc.) on the `ai_languageModel` channel. It does **not** own the conversation prompt/messages list — the parent root node assembles the message history and invokes the model via the Bedrock [Converse API](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_Converse.html).

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.lmchatawsbedrock.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/aws.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/cluster-nodes.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai.md | Public docs only |
| https://docs.aws.amazon.com/bedrock/latest/userguide/models-supported.html | Third-party service API docs |
| https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_Converse.html | Third-party service API docs |
| https://docs.aws.amazon.com/bedrock/latest/userguide/guardrails.html | Third-party service API docs |
| https://docs.aws.amazon.com/bedrock/latest/userguide/latency-optimized-inference.html | Third-party service API docs |

## Wire format

- **Type string:** `@n8n/n8n-nodes-langchain.lmChatAwsBedrock`
- **Aliases:** (none observed)
- **Inputs:** none on `main` (sub-node; no main-item pipeline) (**public JSON** + cluster docs)
- **Outputs:**
  - `ai_languageModel` × 1 — connects **into** a root node's language-model input
- **Credentials:** `aws` (IAM) or `awsAssumeRole` (Assume Role), selected by `authentication` parameter
- **typeVersion:** `1`, `1.1` (v1.1 adds `modelSource` parameter for inference profiles)

Cluster topology: this node is attached as a **sub-node** of an Agent / Chain root. The root drives message assembly, tool loops, and output mapping; this node provides model identity, sampling options, authentication, and the Bedrock API endpoint configuration.

## Parameters

UI labels from **public docs**; wire keys from **published JSON descriptor**. The v1.1 `modelSource` parameter was added to support inference profiles alongside on-demand models.

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| authentication | options | `iam` | no | — | **Authentication** — `iam` (AWS IAM access key) or `assumeRole` (AWS Assume Role). Selects which credential type is required. |
| modelSource | options | `onDemand` | no | `@version >= 1.1` | **Model Source** — `onDemand` (standard foundation models) or `inferenceProfile` (cross-region inference profiles). Only present in v1.1+. |
| model | options / string | — (dynamic list) | yes | varies by source | **Model** — the model ID or inference profile ID that generates completions. Dynamically loaded from the AWS Bedrock API at design time. Hidden when `modelSource = inferenceProfile` (v1.1+); shown when `onDemand`. Arbitrary values allowed (typed model ID). |
| model | options / string | — (dynamic list) | yes | `modelSource = inferenceProfile` (v1.1+) | Alternate model parameter for inference profiles. Dynamically loaded from `/inference-profiles`. Arbitrary values allowed. |
| options | collection | `{}` | no | — | Sampling / request options. |

### options sub-parameters

| name | type | default | notes |
|------|------|---------|-------|
| maxTokensToSample | number | 2000 | **Maximum Number of Tokens** — the maximum number of tokens to generate in the completion. Maps to Bedrock Converse `inferenceConfig.maxTokens`. |
| temperature | number | 0.7 | **Sampling Temperature** — controls randomness; range 0–1, step 0.1. Lower = more deterministic. |
| topP | number | 1 | **Top P** — nucleus sampling threshold; range 0–1, step 0.1. |
| maxRetries | number | 2 | **Max Retries** — max retries on request failure. |
| timeout | number | 60000 | **Timeout** — request timeout in milliseconds. Set to 0 to disable. |
| additionalModelRequestFields | json | `{}` | **Additional Model Request Fields** — model-family-specific parameters as JSON (e.g. Claude `top_k`/`thinking`, Nova `reasoningConfig`). Passed through transparently |
| latency | options | `standard` | **Latency Optimization** — `standard` or `optimized`. Optimized mode reduces response time for supported models/regions. |
| guardrail | fixedCollection | `{}` | **Guardrail** — apply an Amazon Bedrock guardrail. Sub-fields: `guardrailIdentifier` (string, ID or ARN), `guardrailVersion` (string, default `"DRAFT"`), `trace` (options: `disabled`/`enabled`/`enabled_full`). |

## Credentials

### `aws` (IAM)

| field | type | required | notes |
|-------|------|----------|-------|
| region | string | yes | AWS region (e.g. `us-east-1`). Defaults to `eu-central-1` in baseURL fallback. |
| accessKeyId | string (secret) | yes | IAM access key ID. |
| secretAccessKey | string (secret) | yes | IAM secret access key. |
| sessionToken | string (secret) | no | Temporary security credential session token. |
| customEndpoints.bedrock | string | no | Custom Bedrock endpoint (for VPC PrivateLink without private DNS). |
| customEndpoints.bedrockRuntime | string | no | Custom Bedrock Runtime endpoint (for inference via PrivateLink). |

### `awsAssumeRole`

All `aws` fields plus:

| field | type | required | notes |
|-------|------|----------|-------|
| roleArn | string | yes | ARN of the IAM role to assume. |
| externalId | string | yes | Unique external ID for the "confused deputy" prevention. |
| roleSessionName | string | no | Session name for auditing (default `n8n-session`). |
| useSystemCredentials | boolean | no | If true, uses environment/instance-profile credentials for STS call. |
| stsAccessKeyId | string (secret) | no | Manual STS access key ID (when system credentials not used). |
| stsSecretAccessKey | string (secret) | no | Manual STS secret access key. |
| stsSessionToken | string (secret) | no | STS session token (if using temp credentials for STS). |
| region | string | yes | Region for STS call. |

## Runtime behavior

### Role

1. Resolve credentials (`aws` or `awsAssumeRole`). Missing credential → fail when parent invokes model.
2. If `authentication = assumeRole`, call `STS AssumeRole` to obtain temporary credentials (`AccessKeyId`, `SecretAccessKey`, `SessionToken`). Fail if STS call fails or role cannot be assumed.
3. Determine base URL:
   - Default: `https://bedrock.{region}.amazonaws.com` (region from credential, fallback `eu-central-1`).
   - If custom `bedrockRuntime` endpoint is set in credential, use that instead.
4. Resolve **model** ID from `model` parameter (string or resource-locator `.value`). Expressions allowed; as a sub-node, expressions resolve against the **first** input item only.
5. Build a Bedrock Converse API request:
   - Endpoint: `POST /model/{modelId}/converse`
   - Sign the request with AWS Signature V4 using the resolved credentials (for assumed role, the temp credentials from STS).
   - Apply `options` into the request body:
     - `inferenceConfig.maxTokens` ← `maxTokensToSample`
     - `inferenceConfig.temperature` ← `temperature`
     - `inferenceConfig.topP` ← `topP`
     - `additionalModelRequestFields` → merged at top level or under `additionalModelRequestFields` as per AWS Converse spec.
     - `performanceConfig.latency` ← `latency` (set to `"standard"` or `"optimized"`).
   - If guardrail is configured, include `guardrailConfig` block with `guardrailIdentifier`, `guardrailVersion`, and `trace`.
6. Expose the configured model handle on output channel `ai_languageModel` for the parent root to call.

### Messages

- **No** top-level `messages` / `text` parameter on this node.
- Conversation messages are supplied by the **parent** (Agent system/user turns, memory, tool results; or Chain prompt).
- Messages are sent in the Bedrock Converse API `messages` array format: `[{ role: "user"|"assistant", content: [...] }]`. Each content block can be text or tool-use/tool-result structured content.
- The `system` prompt is sent as a separate `system` array in the Converse request body (not in messages).
- Tool definitions, when present from the parent, are sent as the `toolConfig` block in the Converse request.

### Output

When used as a language-model sub-node:

- Connection graph output: `ai_languageModel` → parent.
- On parent-driven invoke, the model returns a Converse response containing `output.message` with `content` blocks and a `stopReason`. The **parent** maps these into main-branch fields such as `output` / `text`.
- Standalone unit tests may treat the executor as returning a model descriptor or a single completion object; product path is parent-invoked.

### Guardrail behavior

- When a guardrail blocks the request, the node returns the guardrail's configured blocked message as the model output (not as an error). The content will differ from expected output; downstream nodes can detect intervention by matching on the blocked-message text.
- An invalid guardrail identifier or version fails the node with the AWS validation error.
- Guardrails apply to both streaming and non-streaming requests.

### Errors

| Condition | Behavior |
|-----------|----------|
| Missing `aws`/`awsAssumeRole` credential | Fail on invoke |
| STS AssumeRole failure | Fail with STS error |
| Missing / empty model ID | Fail |
| Invalid guardrail identifier/version | Fail (AWS validation error) |
| AWS auth failure (invalid/expired keys) | Fail (HTTP 403) |
| Model not found / access denied | Fail |
| Rate limit / throttling | Fail; retryable up to maxRetries |
| Network / timeout | Fail after timeout; retry up to maxRetries |
| `continueOnFail` | Standard engine: surface error on item / continue |

### Expressions

- `model` (value portion of resource locator) and option numerics may be expressions (`={{ … }}`).
- Sub-node rule: multi-item expressions always use the **first** item.

## Acceptance tests

### Test: wire shape — model + basic options

**Parameters:**

```json
{
  "authentication": "iam",
  "model": "anthropic.claude-sonnet-4-6-v1:0",
  "options": {
    "maxTokensToSample": 2000,
    "temperature": 0.7,
    "topP": 1
  }
}
```

**Credentials:** `aws` with valid region, accessKeyId, secretAccessKey.

**Cluster:** connect this node's `ai_languageModel` → AI Agent `ai_languageModel`.

**Expect:** parent can invoke `POST /model/anthropic.claude-sonnet-4-6-v1:0/converse` against `https://bedrock.{region}.amazonaws.com` with `inferenceConfig.maxTokens = 2000`, `temperature = 0.7`, `topP = 1`. Request is AWS Signature V4 signed with the IAM credential.

### Test: assume role — STS → Converse with temp credentials

**Parameters:**

```json
{
  "authentication": "assumeRole",
  "model": "anthropic.claude-3-haiku-20240307-v1:0",
  "options": {
    "maxTokensToSample": 500
  }
}
```

**Credentials:** `awsAssumeRole` with valid roleArn, externalId, and STS credentials.

**Expect:** executor calls `STS AssumeRole` first; on success, uses temporary credentials (`AccessKeyId`, `SecretAccessKey`, `SessionToken`) to sign the Converse request. Converse URL contains model ID + `/converse`. The Authorization header credential scope uses temporary AKID.

### Test: model source — inference profiles (v1.1+)

**Parameters:**

```json
{
  "authentication": "iam",
  "modelSource": "inferenceProfile",
  "model": "us.anthropic.claude-sonnet-4-6-v1:0",
  "options": {}
}
```

**Expect:** Converse endpoint uses inference profile ID in place of model ID. No `/foundation-models` filtering applied; `/inference-profiles` API used at design time for list.

### Test: guardrail applied

**Parameters:**

```json
{
  "authentication": "iam",
  "model": "anthropic.claude-3-haiku-20240307-v1:0",
  "options": {
    "guardrail": {
      "values": {
        "guardrailIdentifier": "arn:aws:bedrock:us-east-1:123456789012:guardrail/abc123",
        "guardrailVersion": "1",
        "trace": "enabled"
      }
    }
  }
}
```

**Expect:** Converse request body includes `guardrailConfig` block with `guardrailIdentifier`, `guardrailVersion`, and `trace`. On guardrail intervention, output contains the guardrail's blocked message instead of model-generated content.

### Test: custom endpoint (VPC PrivateLink)

**Parameters:**

```json
{
  "authentication": "iam",
  "model": "anthropic.claude-3-haiku-20240307-v1:0",
  "options": {}
}
```

**Credentials:** `aws` with `customEndpoints.bedrockRuntime` set to `https://my-vpce.bedrock-runtime.us-east-1.vpce.amazonaws.com`.

**Expect:** Converse requests go to `https://my-vpce.bedrock-runtime.us-east-1.vpce.amazonaws.com` instead of the default `https://bedrock.{region}.amazonaws.com`.

### Test: additional model request fields

**Parameters:**

```json
{
  "authentication": "iam",
  "model": "anthropic.claude-sonnet-4-6-v1:0",
  "options": {
    "additionalModelRequestFields": "{\"top_k\": 10, \"thinking\": {\"type\": \"enabled\", \"budget_tokens\": 1024}}"
  }
}
```

**Expect:** Converse request body includes the parsed JSON fields from `additionalModelRequestFields` merged into the request (alongside `inferenceConfig` and `performanceConfig`).

### Test: missing credentials

**Parameters:** valid `model`, no `aws` or `awsAssumeRole` credential configured.

**Expect:** execution error when parent invokes the model.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string, sub-node role, Authentication, Model, options list | documented | Primary docs page |
| IAM and Assume Role credential fields | documented | AWS credentials page |
| Sub-node first-item expression rule | documented | Docs parameter-resolution hint |
| Model list dynamically loaded from Bedrock API | documented | Docs page |
| Inference profiles (v1.1 `modelSource`) | documented | Published JSON descriptor; not yet on public docs page |
| AWS Signature V4 signing, Bedrock Converse API endpoint pattern | inferred + AWS docs | `POST /model/{modelId}/converse` from AWS Converse API Reference |
| Parameter keys `model`, `authentication`, `options` + option keys | documented + JSON | High confidence from docs labels + published JSON |
| Guardrail sub-fields (`guardrailIdentifier`, `guardrailVersion`, `trace`) | documented | Docs guardrail section |
| Latency optimization field | documented | Docs node options section |
| `additionalModelRequestFields` passthrough | documented | Docs node options section |
| Exact default values (maxTokens=2000, temperature=0.7, topP=1, maxRetries=2, timeout=60000) | published JSON | From package descriptor |
| v1 vs v1.1 behavioral deltas beyond `modelSource` | gap | v1.1 only adds modelSource; no other deltas observed |
| Converse API response shape mapping to parent | gap | AWS Converse response structure; parent agent handles output parsing |
| Streaming behavior | gap | Not explicitly documented for this sub-node; Bedrock supports streaming via `/converse/stream` |

## OpenFlow mapping

- **Definition group:** `ai` / langchain cluster sub-nodes
- **Executor file:** `src/lib/engine/executors/lm-chat-aws-bedrock.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only; register type `@n8n/n8n-nodes-langchain.lmChatAwsBedrock` in `executors/index.ts` `BUILTIN_PAIRS` and `node-runtime` `BUILTIN_EXECUTOR_MODULES`
- **Runtime note:** executor should register/provide a language-model provider on `ai_languageModel` for agent/chain roots; sign Bedrock Converse API requests with AWS Signature V4 using the resolved credentials; support both `aws` (IAM) and `awsAssumeRole` auth (the latter calls STS first for temp credentials); map `maxTokensToSample`/`temperature`/`topP` to `inferenceConfig`, `latency` to `performanceConfig.latency`, and pass through `additionalModelRequestFields` and `guardrailConfig` — do **not** load `@n8n/n8n-nodes-langchain` packages
