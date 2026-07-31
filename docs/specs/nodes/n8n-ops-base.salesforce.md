# Factory job – SPEC (clean‑room half A)

**Node type:** `n8n-nodes-base.salesforce`
**Current cycle:** 1 of 4

---

## Sources
- Public Docs: https://docs.n8n.io/integrations/building-integrations/introduction/ (pre‑ferred)
- Credentials: https://docs.n8n.io/integrations/authentication/salesforce/ – *Public docs only* 

---

## Wire format
- **Type string:** node type `n8n-ops-base.salesforce`
- **Inputs:** `{ "credentials": { "salesforce": "<credentialId>" }, "operation": "create/update", "payload": any }`
- **Outputs:** `{ "items": [{ "id", "sessionId", "data": any }] }`
- **Credentials needed:** Salesforce OAuth (consumer key, callback URL, auth URL) – referenced via n8n credential schema – *public docs*

---

## Parameters (high‑level abstraction)
1. **Operation** – `create` or `update`. Required. No default – must be supplied per call.
2. **Payload** – Object of the Salesforce record fields. Required for create/update operations. No default.
3. **Authenticate / Session** – Provided automatically through n8n credential reference. No user edit needed.
4. **Data Mapping (optional)** – Simple key‑value mapping from node input to Salesforce fields, described only at a functional level.

> **Note:** Avoid reproducing the exact internal option list; only list the functional knobs defined in public docs.

---

## Runtime behavior
- **Input Processing:** The node reads the incoming JSON payload, validates the operation type, and builds a request body adhering to the Salesforce REST API contract as documented.
- **Output Shape:** Returns an array of items, each containing an identifier (`id`), a session ID (`sessionId`), and the transformed Salesforce response data at the highest abstract level.
- **Error Handling:** Errors from Salesforce (e.g., `404`, `INVALID_SESSION_ID`) are mapped to standard n8n error objects – failure messages are clearly labelled as `SalesforceError`.
- **Concurrency:** Behaves as a synchronous operation; no background job handling is required.

---

## Acceptance tests (2‑5 functional fixtures)
1. **TestCreateContact** – Input payload for a new Contact; assert output contains a new `id` and `sessionId`.
2. **TestUpdateLead** – Input payload with `operation: "update"` and an existing record ID; assert updated fields appear in the output data.
3. **TestInvalidOperation** – Request with unknown operation (`"delete"`); assert node emits `SalesforceError` with HTTP status `400`.
4. **TestMissingCredentials** – Run node without attached Salesforce credentials; assert an `AuthenticationError` is raised.
5. **TestLargePayload** – Process a payload with > 50 fields; assert response shape matches expected abstraction without exposing internal field limits.

---

## Gaps / confidence
- **Documented:** Operation types (`create` & `update`), credential usage, basic success/error responses – all covered by public docs.
- **Inferred:** Minimal internal field mapping defaults (e.g., `ignoreNullValues`). These were not explicitly documented, so we keep the mapping abstracted and leave no default assumptions.
- **Confidence:** High for operational contract; medium for inferred small‑scale defaults.

---

## OpenFlow mapping
- **Definition group:** `salesforce`
- **Intended executor filename:** `salesforce.ts`

---

**Citations** (added to `docs/clean-room.md`):
- Salesforce integration docs: https://docs.n8n.io/integrations/authentication/salesforce/

**Specification completed – no implementation code written.**