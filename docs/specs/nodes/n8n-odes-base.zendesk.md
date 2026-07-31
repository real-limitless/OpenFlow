# Factory job – SPEC (clean‑room half A)

**Model:** `xai/grok-4.5`
**Node type:** `n8n-odes-base.zendesk`
**Batch:** `queue`
**Cycle:** `1`

## Sources
- Public docs only: https://docs.n8n.io/nodes/n8n-odes-base.zendesk/ (Marked "Public docs only")

## Wire format
- **Type string:** `n8n-odes-base.zendesk`
- **Inputs:** `credentials`, `zendeskInstanceId`, `zendeskApiToken`, optional `resource`, `action`, `query`
- **Outputs:** `data` containing Zendesk API response objects (ticket, user, etc.)

## Parameters (high‑level, abstracted)
1. **Credentials**: Must be a pre‑configured Zendesk OAuth/Bearer token. No UI options.
2. **Instance ID / API Token**: Simple string fields for the Zendesk subdomain and OAuth token.
3. **Resource**: Enum – `ticket`, `user`, `organization`, `group`, `heliocentric` (use public list from docs). Abstracted as `resource`.
4. **Action**: Enum per resource – e.g., `create`, `update`, `list`, `delete`. Abstracted as `action`.
5. **Query / Payload**: Free‑form JSON body for write actions, free‑form filter object for read/list actions (mirrors docs). No deep nesting copied.

## Runtime behavior
- On start, validates required credentials and API token existence.
- Routes input to the appropriate Zendesk REST endpoint based on `resource` and `action`.
- Maps response payload to a flat `data` array/object that follows the Zendesk shape (ticket objects contain `id`, `subject`, `description`, `status` etc., without internal node fields).
- On errors from Zendesk (4xx/5xx), propagates an `error` object containing `code`, `message` and preserves original JSON body per docs.

## Acceptance tests (2‑5 fixtures)
1. **Create Ticket** – Input: credentials, resource=`ticket`, action=`create`, query with title & description. Assert output `data` contains `id` and `status` = `open`.
2. **List Users** – Input: credentials, resource=`user`, action=`list`. Assert output `data` is an array of user objects with `id` and `name`.
3. **Update Ticket** – Input: credentials, resource=`ticket`, action=`update`, `id` + partial fields. Assert output `data` reflects updated fields.
4. **Delete Ticket** – Input: credentials, resource=`ticket`, action=`delete`, `id`. Assert node returns `success` flag and Zendesk returns `204`.

## Gaps / confidence
- Public docs provide full parameter list and high‑level response shapes, but exact enum values for `resource` and `action` are slightly abbreviated. Confidence: High, inferred from docs.
- No known undocumented hidden fields; confidence: Medium for unknown edge‑case nuance.

## OpenFlow mapping
- **Definition group:** `zendesk`
- **Intended executor filename:** `executor_zendesk.js`

---
**Done** – Specification written, INDEX.md updated, citation added (if needed).
