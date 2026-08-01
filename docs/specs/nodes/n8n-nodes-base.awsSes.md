---
type: n8n-nodes-base.awsSes
displayName: AWS SES
category: Communication, Development
versions: [1]
priority: medium
status: specced
---

# AWS SES

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.awsses/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/aws/ | Public docs only |
| https://docs.aws.amazon.com/ses/latest/APIReference/Welcome.html | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.awsSes`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `aws` (access key + secret key) or `awsAssumeRole` (STS role assumption)

### Credential fields

| field | type | required | notes |
|-------|------|----------|-------|
| region | string | yes | AWS region code (e.g. `us-east-1`) |
| accessKeyId | string | yes (access-key mode) | IAM access key ID |
| secretAccessKey | string | yes (access-key mode) | IAM secret access key |
| sessionToken | string | no | Temporary security credential session token |
| customEndpoints | collection | no | VPC custom endpoint overrides per service (includes SES) |
| roleArn | string | yes (assume-role mode) | ARN of the IAM role to assume |
| externalId | string | yes (assume-role mode) | External ID required by the role trust policy |
| roleSessionName | string | no | Session name for auditing (default `n8n-session`) |
| stsAccessKeyId | string | conditional | Access key for STS AssumeRole call |
| stsSecretAccessKey | string | conditional | Secret key for STS AssumeRole call |
| stsSessionToken | string | no | Session token for STS call |

## Parameters

The node groups operations under three resources: `customVerificationEmail`, `email`, and `template`. A `resource` selector determines the available `operation` values.

### Resource: `customVerificationEmail`

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | options | `customVerificationEmail` | yes | — | Fixed value `customVerificationEmail` |
| operation | options | `create` | yes | resource=customVerificationEmail | `create`, `delete`, `get`, `getAll`, `addIdentity`, `update` |

**Create / Update parameters:**

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| emailAddress | string | `""` | yes (create) | The email identity to verify or manage |
| templateName | string | `""` | yes (create/update) | Name of the custom verification email template |
| fromEmailAddress | string | `""` | yes (create) | Verified sender email for the verification message |
| additionalFields | collection | `{}` | no | Success redirect URL, failure redirect URL, template content overrides |

**Delete / Get:**
- A `templateName` parameter to identify the template.

**GetAll:**
- `returnAll` (boolean, default `false`) and `limit` (number, default `100`, max 500) for pagination.

**Add identity:**
- `emailAddress` (string, required) — the email address to add to the verified identity list.

### Resource: `email`

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | options | `email` | yes | — | Fixed value `email` |
| operation | options | `send` | yes | resource=email | `send`, `sendTemplate` |

#### Operation: `send` (SendEmail)

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| fromEmail | string | `""` | yes | Source / sender address |
| toAddresses | string | `""` | yes | Comma-separated list of primary recipients |
| ccAddresses | string | `""` | no | Comma-separated list of CC recipients |
| bccAddresses | string | `""` | no | Comma-separated list of BCC recipients |
| subject | string | `""` | yes (when no template) | Email subject line |
| emailType | options | `text` | no | `text` or `html` — body format selection |
| message | string | `""` | yes (send) | Email body content (text or HTML depending on emailType) |
| attachments | string | `""` | no | Comma-separated list of binary property names from input items to attach as MIME file attachments |
| additionalFields | collection | `{}` | no | Reply-to addresses, return path, configuration set name, message tags, headers, and source ARN |

**Validation:** `subject` is required when sending without a template. If `subject` is empty and no template is selected, the executor must throw `'AWS SES: "subject" is required'` before contacting the AWS API.

#### Operation: `sendTemplate` (SendTemplatedEmail)

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| fromEmail | string | `""` | yes | Source / sender address |
| toAddresses | string | `""` | yes | Comma-separated list of primary recipients |
| ccAddresses | string | `""` | no | Comma-separated list of CC recipients |
| bccAddresses | string | `""` | no | Comma-separated list of BCC recipients |
| template | options | `""` | yes | Select a previously created SES template (loaded via loadOptions from the SES API) |
| templateData | string | `""` | no | JSON string of substitution variables for the template (e.g. `{"name":"Alice"}`) |
| additionalFields | collection | `{}` | no | Reply-to addresses, return path, configuration set name, tags, source ARN |

### Resource: `template`

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | options | `template` | yes | — | Fixed value `template` |
| operation | options | `create` | yes | resource=template | `create`, `delete`, `get`, `getAll`, `update` |

**Create / Update parameters:**

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| name | string | `""` | yes (create/update) | Template name |
| subject | string | `""` | yes (create/update) | Template subject line (supports substitution variables) |
| html | string | `""` | no | HTML body content |
| text | string | `""` | no | Plain text body content |

**Delete / Get:**
- `name` (string, required) — template name to delete or retrieve.

**GetAll:**
- `returnAll` (boolean, default `false`) and `limit` (number, default `100`) for pagination.

## Runtime behavior

### Input

Each input item is processed independently. Parameters may be set statically or via expressions referencing the input item's JSON data.

For **email:send**, the `message` body and `subject` accept expressions. When `emailType` is `html`, the body is sent as `text/html`; when `text`, as `text/plain`. If `attachments` is set, the executor reads binary data from input item properties matching those names, constructs a MIME multipart message, and sends the body and attachments as a MIME message via the SES `SendRawEmail` API instead of `SendEmail`.

For **email:sendTemplate**, `templateData` must be a valid JSON string if provided. The `template` field is populated dynamically by fetching available SES templates from the AWS API at parameter-load time (loadOptions).

### Output

One output item per input item. Output shape depends on the operation:

**Custom Verification Email:**
- `create` / `update`: `{ success: true }` or response metadata from SES
- `delete`: `{ success: true }`
- `get`: Template details as returned by `GetCustomVerificationEmailTemplate`
- `getAll`: Array of custom verification email template metadata
- `addIdentity`: `{ success: true }`

**Email:**
- `send`: The `MessageId` from the SES `SendEmail` response, wrapped as `{ messageId: "<value>" }`
- `sendTemplate`: The `MessageId` from the SES `SendTemplatedEmail` response, wrapped as `{ messageId: "<value>" }`

**Template:**
- `create` / `update`: SES template creation/update confirmation
- `delete`: `{ success: true }`
- `get`: Full template details including `TemplateName`, `SubjectPart`, `HtmlPart`, `TextPart`
- `getAll`: Array of template metadata (TemplateName, Timestamps)

### Errors

AWS API errors (invalid credentials, unverified sender address, template not found, rate limits) propagate as thrown exceptions. If `continueOnFail` is enabled, the failed item is returned with an `error` property and execution continues.

When `email:send` has no `subject` and no template, the executor must throw `'AWS SES: "subject" is required'` as a validation error before contacting the AWS API.

### Expressions

All string parameters accept n8n expressions. Numeric and boolean parameters accept expressions via the expression editor.

## Acceptance tests

### Test: email — send plain text

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "email",
  "operation": "send",
  "fromEmail": "sender@example.com",
  "toAddresses": "recipient@example.com",
  "subject": "Hello from SES",
  "emailType": "text",
  "message": "This is a test email."
}
```

**Expect** output[0] JSON contains a `messageId` field (a non-empty string).

### Test: email — sendTemplate

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "email",
  "operation": "sendTemplate",
  "fromEmail": "sender@example.com",
  "toAddresses": "recipient@example.com",
  "template": "my-template",
  "templateData": "{\"name\":\"Alice\"}"
}
```

**Expect** output[0] JSON contains a `messageId` field (a non-empty string).

### Test: email — missing subject validation error

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "email",
  "operation": "send",
  "fromEmail": "sender@example.com",
  "toAddresses": "recipient@example.com",
  "subject": "",
  "message": "No subject line"
}
```

**Expect** a validation error is thrown matching `/AWS SES: "subject" is required/`.

### Test: template — create then get

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters (create):**

```json
{
  "resource": "template",
  "operation": "create",
  "name": "test-template-{{ $randomInt }}",
  "subject": "Welcome {{name}}",
  "html": "<h1>Hello {{name}}</h1>",
  "text": "Hello {{name}}"
}
```

**Expect** no error. Output[0] indicates success.

**Parameters (get):**

```json
{
  "resource": "template",
  "operation": "get",
  "name": "test-template-{{ $randomInt }}"
}
```

**Expect** output[0] JSON contains `TemplateName`, `SubjectPart`, and `HtmlPart` fields matching the created values.

### Test: customVerificationEmail — add identity

**Given** input items:

```json
[{ "json": { "email": "test@example.com" } }]
```

**Parameters:**

```json
{
  "resource": "customVerificationEmail",
  "operation": "addIdentity",
  "emailAddress": "={{ $json.email }}"
}
```

**Expect** output[0] JSON contains `{ "success": true }` or confirmation metadata.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource/operation names | Public docs | Custom Verification Email, Email, Template resources confirmed by public n8n docs |
| Credential fields | Public docs | AWS IAM and Assume Role credentials well-documented |
| Email send parameters | Inferred from AWS SES API docs | `SendEmail` and `SendTemplatedEmail` parameter contracts known from public AWS docs |
| Template create/update fields | Inferred from AWS SES API | `Template` structure (name, subject, html, text) matches SES `CreateTemplate` API |
| Custom verification email parameters | Inferred | Public n8n docs list operations; exact parameter names abstracted from corpus |
| `additionalFields` sub-structure | Inferred | Varies per operation; covers reply-to, configuration set, tags, headers |
| Output shapes | Inferred | `messageId` on send confirmed by AWS SES API response; other shapes inferred from operation semantics |
| Validation rules | Inferred | Subject required for non-template send inferred from SES API requirements |
| Load options for templates | Inferred from corpus methods | Template list populated via `loadOptions.getTemplates` method calling SES `ListTemplates` |
| Attachments with MIME message | Inferred | `attachments` parameter accepts binary property names; when present, executor should use `SendRawEmail` with MIME multipart. MIME construction details (encoding, content-type detection, attachment disposition headers) not fully specified — implementer should use a MIME builder library or verify against SES acceptance of raw MIME.

## OpenFlow mapping

- **Definition group:** `communication`
- **Executor file:** `src/lib/engine/executors/awsSes.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only