# Factory job – SPEC (clean‑room half A)

**Model:** `xai/grok-4.5`
**Node type:** `n8n-odoo`
**Batch:** `queue`
**Cycle:** `3` of `4`

---

## Sources (Public docs only)
- https://docs.n8n.io/nodes/n8n-odoo/  (description of the Odoo node)
- https://docs.n8n.io/addons/odoo/ (optional addon documentation)

## Wire format
- **Type string:** `n8n-odoo`
- **Inputs:** Execution context, credentials reference (`odoo_creds`), operation choice, record identifiers (e.g., `id` or `modelName` and `recordId`).
- **Outputs:** JSON structure representing Odoo records, with field names matching API response paths (`data`, `result`).
- **Credentials required:** `odoo_api_key` stored in `odoo_creds` (OAuth2 or API token).

## Parameters (high‑level, abstracted)
1. **Operation** – Choice of `Read`, `Create`, `Update`, `Delete` or `Execute Function`. Must be selected before other options.
2. **Model Name** – The Odoo model to interact with (e.g., `sale.order`, `res.partner`). Required for all operations except Execute Function.
3. **Record ID** – Identifier of the target record. Required for Read, Update, Delete; optional for Create (auto‑generates ID).
4. **Data Mapping** – Key‑value pairs mapping local field names to Odoo field paths. Provided as a generic `mapping` object; the node translates to Odoo field specifications under‑the‑hood.
5. **Function Name** – (only for Execute Function) name of an Odoo RPC function to call. No additional data required beyond parameters.
6. **Credentials** – Reference to a pre‑configured `odoo_creds` credential set.

*Note:* Parameter defaults are abstracted – exact default values are omitted unless required for interoperability per n8n public docs.

## Runtime behavior
- The node authenticates using the supplied OAuth2/API credentials and forwards the chosen operation to the Odoo REST API.
- **Read:** Calls `GET /{modelName}/{recordId}`; returns matching record(s) under `data`.
- **Create:** Calls `POST /{modelName}` with `data` from parameter mapping; returns created record ID under `result.id`.
- **Update:** Calls `PUT /{modelName}/{recordId}` using mapped data; returns updated record under `data`.
- **Delete:** Calls `DELETE /{modelName}/{recordId}`; returns empty success payload.
- **Execute Function:** Calls `rpc.execute(function_name, params)`; returns function‑specific response.
- Errors from the Odoo API are translated to OpenFlow‑compatible error objects with a `status` field and descriptive message.

## Acceptance tests (2‑5 concrete fixtures)
1. **Read test** – Call `Read` on `res.partner` with ID `1` and verify the output contains `name`, `email`, and matches expected partner data from Odoo demo.
2. **Create test** – Call `Create` on `res.partner` with mapping `{name: "Test", email: "test@example.com"}`; verify the response `result.id` equals the newly created partner ID.
3. **Update test** – Call `Update` on `res.partner` ID `1` with mapping `{name: "Updated Name"}`; verify the returned record name matches the update.
4. **Execute Function test** – Call `Execute Function` on Odoo with function `res.users.get_current_user` and no parameters; verify the response returns current user fields.

## Gaps / confidence
- The specification abstracts away exact field‑level default values and complex pagination logic; these are considered gaps where inference from public docs is necessary.
- Confidence in operation success handling is high, as error mapping follows documented Odoo response patterns.
- Future extension may require adding optional `batch` size parameter for bulk operations – not covered here.

## OpenFlow mapping
- **Definition group:** `odoo`
- **Executor filename:** `odoo_node.ts`
- The executor will implement the described wire format and runtime behavior using the OpenFlow SDK.

---

*This SPEC adheres to the abstraction rules and does not contain any implementation code.*