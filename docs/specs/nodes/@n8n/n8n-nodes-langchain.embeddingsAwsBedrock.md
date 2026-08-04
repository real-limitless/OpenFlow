---
type: "@n8n/n8n-nodes-langchain.embeddingsAwsBedrock"
displayName: Embeddings AWS Bedrock
category: AI
versions: [1]
priority: high
status: specced
---

# Embeddings AWS Bedrock

Cluster **sub-node**: configures an Amazon Bedrock-hosted text-embedding model and supplies it to a root node (AI Agent, Vector Store insert/load, Chains, Default Data Loader, etc.) on the `ai_embedding` channel. It does **not** process items on `main` directly — the parent root node invokes the embeddings provider with texts to embed and receives numeric vectors back.

The node selects an embedding model from Amazon Bedrock's foundation model catalog. Two authentication methods are supported: AWS IAM (access key) and AWS Assume Role.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.embeddingsawsbedrock.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/aws.md | Public docs only |
| https://docs.aws.amazon.com/bedrock/latest/userguide/what-is-bedrock.html | Third-party service API docs |
| https://js.langchain.com/docs/integrations/platforms/aws/#text-embedding-models | Public docs only (LangChain integration docs) |

## Wire format

- **Type string:** `@n8n/n8n-nodes-langchain.embeddingsAwsBedrock`
- **Aliases:** (none)
- **Inputs:** none on `main` (sub-node; connects to root nodes via the `ai_embedding` channel)
- **Outputs:** `ai_embedding` × 1 — supplies the embeddings provider into the parent root node's embedding input
- **Credentials:** `aws` (IAM) or `awsAssumeRole` (Assume Role), selected by `authentication` parameter
- **typeVersion:** `1`
- **Categories:** AI, Langchain

Cluster topology: the node is attached as an **embedding sub-node** of a root node. The root drives document loading, chunking, and vector-store writes/queries; this node supplies the Bedrock model identity and authentication for computing embeddings.

### External service

The node calls the **Amazon Bedrock Runtime API** to generate embeddings. Bedrock exposes a unified [InvokeModel](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_InvokeModel.html) endpoint for all foundation models. Each embedding model has its own request/response format (the body is model-specific). The executor constructs the signed request using AWS Signature V4.

## Parameters

The public n8n docs page lists the following node options:

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| `authentication` | options | — | yes | **Authentication** — selects the credential type: `iam` (AWS IAM access key) or `assumeRole` (AWS Assume Role). Controls which credential is required. |
| `model` | options / string | — (dynamic list) | yes | **Model** — the Bedrock foundation model ID to use for generating embeddings (e.g. `cohere.embed-english-v3`, `amazon.titan-embed-text-v2:0`). Dynamically loaded from the Bedrock `ListFoundationModels` API at design time. If the dropdown is empty, the IAM role may lack `bedrock:ListFoundationModels` permission; users can switch to Expression mode and enter the model ID directly. |

The credential selector offers two authentication methods (see credentials section below).

No additional options (batch size, strip newlines, timeout) are documented for this node on the public page. The node delegates model-specific embedding parameters to the model family's native request format, which is assembled internally.

## Credentials

### `aws` (IAM)

| field | type | required | notes |
|-------|------|----------|-------|
| `region` | string | yes | AWS region (e.g. `us-east-1`). |
| `accessKeyId` | string (secret) | yes | IAM access key ID. |
| `secretAccessKey` | string (secret) | yes | IAM secret access key. |
| `sessionToken` | string (secret) | no | Temporary security credential session token. |
| `customEndpoints.bedrock` | string | no | Custom Bedrock endpoint — used to list available models (via VPC PrivateLink). |
| `customEndpoints.bedrockRuntime` | string | no | Custom Bedrock Runtime endpoint — used for inference (via VPC PrivateLink). |

### `awsAssumeRole`

All `aws` fields plus:

| field | type | required | notes |
|-------|------|----------|-------|
| `roleArn` | string | yes | ARN of the IAM role to assume. |
| `externalId` | string | yes | Unique external ID for "confused deputy" prevention. |
| `roleSessionName` | string | no | Session name for auditing (default `n8n-session`). |
| `useSystemCredentials` | boolean | no | If true, uses environment/instance-profile credentials for STS call. |
| `stsAccessKeyId` | string (secret) | no | Manual STS access key ID (when system credentials not used). |
| `stsSecretAccessKey` | string (secret) | no | Manual STS secret access key. |
| `stsSessionToken` | string (secret) | no | STS session token (if using temp credentials for STS). |

## Runtime behavior

### Role

1. Resolve credentials (`aws` or `awsAssumeRole`) based on `authentication` parameter. Missing credential → fail on first invocation.
2. If `authentication = assumeRole`, call `STS AssumeRole` to obtain temporary credentials. Fail if STS call fails.
3. Determine base URL:
   - Default: `https://bedrock-runtime.{region}.amazonaws.com` (region from credential).
   - If custom `bedrockRuntime` endpoint is set in credential, use that instead.
4. Resolve **model** ID from `model` parameter. Expressions allowed; as a **sub-node**, expressions resolve against the **first** input item only.
5. Build an embeddings provider handle exposed on output channel `ai_embedding`. The parent root node invokes it with an array of strings (texts) to embed.
6. For each invocation, the provider calls Bedrock Runtime `InvokeModel`:
   - Endpoint: `POST /model/{modelId}/invoke`
   - Sign the request with AWS Signature V4 using the resolved credentials.
   - The request body is model-specific (each Bedrock embedding model family defines its own JSON schema). The provider must format the payload as required by the selected model.
   - Parse the model-specific response and extract the embedding vector(s).
7. Return an array of numeric vectors aligned positionally with the input texts.

### Input

None on `main`. The parent root node invokes the provider with an array of strings (texts) to embed.

### Output

None on `main`. When invoked, the provider calls the Bedrock Runtime API and returns `number[][]` (one vector per input text, in input order).

**External API contract (Bedrock Runtime InvokeModel):**

The endpoint and signing scheme are common across all Bedrock models, but the request/response body is model-family specific. For example:

- **Amazon Titan Embeddings** (titan-embed-text-v2): request includes `inputText` (string) and optional `dimensions` / `normalize`; response contains `embedding` (number[]).
- **Cohere Embed** (cohere.embed-english-v3): request includes `texts` (string[]) and optional `input_type` / `truncate`; response contains `embeddings` (number[][]).

The provider must handle this per-model formatting transparently.

### Errors

- **Missing credentials** → throw on first invocation (provider cannot initialize).
- **STS AssumeRole failure** → fail with STS error.
- **Invalid / unauthorized IAM credentials** → throw on first API call (HTTP 403).
- **Model not found / access denied** → fail.
- **Rate limit / throttling** → fail; retryable with backoff.
- **Network / timeout** → fail after timeout.
- **Empty input array** → no API call; return empty array.

Sub-nodes do **not** have their own `continueOnFail` — error handling belongs to the parent root node.

### Expressions

Parameters accept expressions (`{{ … }}`). **Sub-node expression resolution rule (documented):** in sub-nodes, expressions always resolve to the **first** input item of the parent run. A dynamic `model` is evaluated once per parent execution against the first item.

## Acceptance tests

### Test: basic embedding call

**Given** parent root node invokes the embeddings provider with texts:

```json
["Hello world", "Bedrock embeddings test"]
```

**Parameters:**

```json
{
  "authentication": "iam",
  "model": "amazon.titan-embed-text-v2:0"
}
```

**Credentials:** `aws` with valid region, accessKeyId, secretAccessKey.

**Expect** the provider calls `POST /model/amazon.titan-embed-text-v2:0/invoke` against `https://bedrock-runtime.{region}.amazonaws.com` with AWS Signature V4 signing. Output on `ai_embedding` is `number[][]` with exactly 2 vectors in input order.

### Test: assume role — STS → InvokeModel with temp credentials

**Parameters:**

```json
{
  "authentication": "assumeRole",
  "model": "cohere.embed-english-v3"
}
```

**Credentials:** `awsAssumeRole` with valid roleArn, externalId, and STS credentials.

**Expect:** executor calls `STS AssumeRole` first; on success, uses temporary credentials (`AccessKeyId`, `SecretAccessKey`, `SessionToken`) to sign the Bedrock Runtime request.

### Test: custom endpoint (VPC PrivateLink)

**Parameters:**

```json
{
  "authentication": "iam",
  "model": "amazon.titan-embed-text-v2:0"
}
```

**Credentials:** `aws` with `customEndpoints.bedrockRuntime` set to `https://my-vpce.bedrock-runtime.us-east-1.vpce.amazonaws.com`.

**Expect:** InvokeModel requests go to `https://my-vpce.bedrock-runtime.us-east-1.vpce.amazonaws.com` instead of the default `https://bedrock-runtime.{region}.amazonaws.com`.

### Test: sub-node expression resolves to first item

**Given** parent run has input items with differing model values:

```json
[{ "json": { "modelId": "titan-v1" } }, { "json": { "modelId": "titan-v2" } }]
```

**Parameters:**

```json
{
  "authentication": "iam",
  "model": "={{ $json.modelId }}"
}
```

**Expect:** the provider is configured once using the **first** item only (`titan-v1`); all embedded texts use that model. The second item's value is never consulted.

### Test: missing credential

**Given** the node has no `aws` or `awsAssumeRole` credential attached.

**Parameters:** valid `authentication` and `model`.

**Expect:** provider initialization throws; the parent root node surfaces the error.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string, display name, sub-node role | documented | Primary n8n docs page (suggested page link) |
| Parameters: Authentication, Model (dynamic list) | documented | Primary n8n docs page lists both parameters |
| Credential `aws`: region, accessKeyId, secretAccessKey, customEndpoints | documented | n8n AWS credentials page |
| Credential `awsAssumeRole`: roleArn, externalId, STS fields | documented | n8n AWS credentials page |
| Sub-node first-item expression rule | documented | Docs parameter-resolution hint (shared across all sub-nodes) |
| Model list dynamically loaded from Bedrock ListFoundationModels | documented | Docs: "If the dropdown is empty, your IAM role may not have the bedrock:ListFoundationModels permission" |
| AWS Signature V4 signing for Bedrock Runtime API | inferred + AWS docs | Standard for all AWS API calls to Bedrock |
| Endpoint pattern `POST /model/{modelId}/invoke` | inferred | Bedrock Runtime InvokeModel API |
| Default endpoint `https://bedrock-runtime.{region}.amazonaws.com` | inferred | Standard Bedrock Runtime regional endpoint pattern |
| Model-specific request/response body formats | gap | Each model family (Titan, Cohere, etc.) has its own InvokeModel schema; not documented on the n8n page. Executor must handle per-model formatting. |
| Output channel name `ai_embedding` | inferred | Consistent with sibling embedding sub-nodes |
| Error handling specifics | inferred | Standard HTTP error propagation for AWS service calls |
| `continueOnFail` behavior for sub-nodes | inferred | Sub-nodes inherit error handling from parent root node |
| Additional options (batch size, strip newlines) | gap | Not listed on the public docs page; may not exist for this node unlike Azure OpenAI embeddings sibling |

## OpenFlow mapping

- **Definition group:** `ai` / langchain cluster sub-nodes
- **Executor file:** `src/lib/engine/executors/embeddings-aws-bedrock.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only; register type `@n8n/n8n-nodes-langchain.embeddingsAwsBedrock` in `executors/index.ts` `BUILTIN_PAIRS` and `node-runtime` `BUILTIN_EXECUTOR_MODULES`
- **Runtime note:** executor registers an embeddings provider on the `ai_embedding` channel for root nodes (Agent, Chains, Vector Store insert/load, Default Data Loader); calls the Bedrock Runtime `InvokeModel` API (`POST /model/{modelId}/invoke`) signed with AWS Signature V4 using the resolved credentials (IAM or Assume Role); maps the model-specific request/response body formats per Bedrock embedding model family. The `authentication` parameter selects between `aws` (IAM) and `awsAssumeRole` credential types. Do **not** load `@n8n/n8n-nodes-langchain` or `langchain` packages.
