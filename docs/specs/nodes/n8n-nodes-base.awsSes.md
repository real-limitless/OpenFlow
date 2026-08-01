# Factory job — SPEC (clean-room half A)

## Sources
- https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.awsses.md (Public docs only)

## Wire format
- Type string: `n8n-nodes-base.awsSes`
- Inputs: expects a JSON object containing email details (e.g., `to`, `subject`, `text`, `html`, `attachments`, `from`)
- Outputs: returns a JSON response indicating send status, message ID, or error details
- Credentials: uses AWS credentials provided via an `Aws` credential type, including access key ID and secret access key, and optionally session token

## Parameters
- **to**: recipient email address(es)
- **subject**: email subject line
- **text**: plain‑text body content
- **html**: HTML‑formatted body content
- **attachments**: optional array of attachment descriptors
- **from**: sender email address (must be verified in SES)
- **template**: optional template identifier if using SES templates
All parameters are abstracted at the functional level; exact nested schemas are omitted.

## Runtime behavior
- Upon receiving input, the node validates required parameters according to SES sending constraints (e.g., `to` must be a non‑empty string, `from` must be verified).
- It then invokes the AWS SES SendEmail (or SendRawEmail) API using the configured AWS credentials.
- On successful API call, it returns a success payload containing the SES response metadata (e.g., `messageId`).
- On failure (e.g., invalid credentials, throttling, validation error), it propagates an error with an appropriate error code and message, preserving the original error information for debugging.

## Acceptance tests
1. **Successful email send** – Input with valid `to`, `subject`, `text`, `from`; expecting a success response containing a `messageId`.
2. **Missing required field** – Input lacking `subject`; expecting a validation error indicating the missing field.
3. **Invalid AWS credentials** – Provide malformed credential object; expecting an authentication error from SES.
4. **Throttling handling** – Simulate SES throttling response; expecting the node to return a throttling error without leaking internal details.
5. **Template usage** – Input with a valid `template` field; expecting the node to reference the template and send using SES template API.

## Gaps / confidence
- Full list of optional SES send parameters (e.g., `replyToAddresses`, `returnPath`) is not explicitly documented in the publicly linked page; behavior is inferred from typical SES API usage.
- Default encoding for `text` vs `html` when both are provided is assumed to be prioritized as `html` if present.
- Error codes mapping to OpenFlow is assumed to be generic API errors; exact codes may vary.

## OpenFlow mapping
- **Definition group**: `awsSes`
- **Executor filename**: `AwsSesExecutor.ts` (intended to be placed under `src/sdk/awsSes/`)

---

*This SPEC follows clean‑room principles: it is derived solely from publicly available n8n documentation and does not reproduce any internal implementation details.*