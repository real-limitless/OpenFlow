# Factory job – SPEC (clean‑room half A)

**Node type:** `n8n-edges-external.salesforce`  (derived from `n8n-edges-external` executor to expose Salesforce as an external edge)

## Sources
- Public docs: <https://docs.n8n.io/integrations/basics/nodes/salesforce/> (Salesforce node documentation)
- Public workflow JSON shape: <https://github.com/n8n-io/n8n/blob/main/nodes/Salesforce/spec.json>

## Wire format
- Type string: `salesforce`
- Credentials: `salesforceOAuth2Api`
- Inputs: an arbitrary JSON payload (the previous node’s output).
- Outputs: a transformed JSON object representing the result of the Salesforce operation (e.g., created record, queried data) with the same shape as the external service’s response.

## Parameters (high‑level, abstracted)
| Parameter | Description |
|-----------|-------------|
| **Operation** | Choose the functional action: `create`, `retrieve`, `update`, `delete`, `query`, `apexCall`. |
| **Resource** | The Salesforce object (e.g., `Account`, `Contact`, `Opportunity`). |
| **OAuth2Credentials** | Reference to an OAuth 2 credential created in n8n (e.g., `mySalesforceCreds`). |
| **Request Options** | Abstract request options such as `WhereClause`, `Fields`, `Limit`, `Soql`, etc., expressed as strings or simple objects. |

*No deep nesting of hidden implementation details is reproduced; only the essential, publicly documented knobs are listed.*

## Runtime behavior
1. The node receives its input payload.
2. Based on the **Operation** parameter, it constructs the appropriate Salesforce REST API request URL and payload.
3. Credentials supplied in **OAuth2Credentials** are used to issue an authenticated request.
4. The node returns a **functional** JSON response summarizing the operation’s outcome (e.g., `recordId`, number of records affected, queried rows). No raw wrapper fields from the internal implementation are exposed.
5. Errors from Salesforce (e.g., authentication failures, invalid SOQL) are translated into clear n8n error messages with the original error code preserved for debugging.

## Acceptance tests
1. **Create Contact** – Provide a minimal contact payload; verify output contains a `recordId`.
2. **Query Accounts** – Use a simple SOQL query; assert the returned array matches the expected account list count.
3. **Update Account** – Supply an `accountId` and updated fields; confirm the node reports `1` records updated.
4. **Delete Contact** – Specify a contact ID; ensure the node returns a successful deletion flag.
5. **Apex Call** – Invoke an Apex REST method with a JSON body; verify the response body matches the specified output schema.

## Gaps / confidence
- **Authentication flow**: Public docs confirm OAuth 2 credential usage; no hidden token refresh steps are documented, so we trust the node handles it as per n8n’s generic OAuth flow.
- **SOQL options**: The spec provides basic `WhereClause` and `Fields`; more advanced options like `PagingInfo` are inferred from the `spec.json` and are acceptable for the scope of this spec.
- **Error mapping**: Salesforce error codes are mapped to generic n8n error messages, which aligns with the node’s documented behavior.

## OpenFlow mapping
- **Node citation**: `n8n-edges-external.salesforce`
- **Executor filename**: `src/edges/salesforce.ts` (implementation will be authored separately and will adhere to this specification).

---

*This SPEC file adheres to abstraction rules, cites only public documentation, and avoids copying any internal n8n or npm package source.*