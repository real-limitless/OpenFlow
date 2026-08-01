---
type: n8n-nodes-base.awsLambda
displayName: AWS Lambda
category: Development
versions: [1]
priority: medium
status: specced
---

# AWS Lambda

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.awslambda.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/aws.md | Public docs only |
| https://docs.aws.amazon.com/lambda/latest/dg/API_Invoke.html | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.awsLambda`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `aws` (IAM access key or Assume Role)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | string | `function` | yes | — | Always `function` (single resource) |
| operation | string | `invoke` | yes | — | Always `invoke` (single operation) |
| functionName | string | — | yes | — | ARN or name of the Lambda function to invoke |
| invocationType | string | `RequestResponse` | no | — | `RequestResponse` (sync), `Event` (async fire-and-forget), or `DryRun` (test permissions) |
| payload | JSON | `{}` | no | — | JSON payload to pass to the function |
| qualifier | string | — | no | — | Version or alias qualifier (e.g. `prod`, `1`) |
| clientContext | JSON | — | no | — | Base64-encoded JSON client context forwarded to the function |
| logType | string | `None` | no | — | `None` or `Tail` (returns last 4 KB of execution log) |
| additionalFields | object | `{}` | no | — | See sub-parameters below |

### additionalFields sub-parameters

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| simplifyOutput | boolean | `true` | no | When true, extracts the parsed JSON from `Payload` directly instead of wrapping in SDK response envelope |

## Runtime behavior

### Input

Each input item is processed independently. The node uses the configured AWS credentials to call the Lambda Invoke API for the given function.

### Output

One output item per input item. The output shape depends on `simplifyOutput`:

- **simplifyOutput = true:** Returns the parsed `Payload` field from the Invoke response directly (the Lambda function's return value).
- **simplifyOutput = false:** Returns the full SDK response envelope containing `StatusCode`, `Payload`, `ExecutedVersion`, `FunctionError`, and `LogResult`.

When `InvocationType` is `Event`, the response is empty (202 Accepted). When `DryRun`, no function executes.

### Errors

- If the function does not exist or permissions are insufficient, the node throws an error with the AWS service error code.
- `InvocationType` `RequestResponse` may return a `FunctionError` key in the response body (e.g., `Handled` or `Unhandled`). These are treated as execution errors unless `continueOnFail` is enabled.
- `invocationType` `Event` that fails (async invocation) will not surface the error in the node output.

### Expressions

All parameter values accept expression strings.

## Acceptance tests

### Test: basic invoke

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "functionName": "my-function",
  "invocationType": "RequestResponse",
  "payload": { "key": "value" }
}
```

**Expect** output[0]:

```json
[{ "json": { "StatusCode": 200, "Payload": { "key": "value" }, "ExecutedVersion": "$LATEST" } }]
```

### Test: simplified output

**Parameters:**

```json
{
  "functionName": "my-function",
  "invocationType": "RequestResponse",
  "payload": "={{ $json.body }}",
  "additionalFields": { "simplifyOutput": true }
}
```

**Expect** output[0] to contain the parsed payload directly (the Lambda function's return value) rather than the SDK envelope.

### Test: async invocation

**Parameters:**

```json
{
  "functionName": "my-function",
  "invocationType": "Event",
  "payload": {}
}
```

**Expect** output[0]:

```json
[{ "json": { "StatusCode": 202 } }]
```

### Test: dry run

**Parameters:**

```json
{
  "functionName": "my-function",
  "invocationType": "DryRun"
}
```

**Expect** output[0]:

```json
[{ "json": { "StatusCode": 204 } }]
```

### Test: invocation with qualifier

**Parameters:**

```json
{
  "functionName": "my-function",
  "invocationType": "RequestResponse",
  "qualifier": "prod",
  "payload": {}
}
```

**Expect** the request to include the qualifier; `ExecutedVersion` in response should match the alias/version.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Operation set | documented | n8n public docs confirm single "Invoke a function" operation |
| Credential type | documented | AWS IAM credentials with region, access key, secret key; also supports Assume Role |
| Parameters | inferred from AWS API | `functionName`, `invocationType`, `payload`, `qualifier`, `clientContext`, `logType`, `simplifyOutput` inferred from AWS Lambda Invoke API and common n8n patterns |
| Simplify output | inferred | Common n8n pattern for AWS SDK nodes; exact parameter name may differ |
| UI organization | not applicable | Spec describes functional parameters, not UI groupings |

## OpenFlow mapping

- **Definition group:** `core` | `flow` | `triggers` | `transform`
- **Executor file:** `src/lib/engine/executors/AwsLambda.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only