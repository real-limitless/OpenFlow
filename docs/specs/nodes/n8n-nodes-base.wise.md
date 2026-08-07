---
type: n8n-nodes-base.wise
displayName: Wise
category: Finance & Accounting
versions: [1]
priority: medium
status: specced
---

# Wise

Multi-resource action node for the Wise (formerly TransferWise) money transfer platform. Wraps the Wise REST API (`https://api.wise.com/`) to query profiles, account balances, exchange rates, recipients, quotes, and drive the full transfer lifecycle (create → execute).

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.wise/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/wise/ | Public docs only |
| https://docs.wise.com/api-docs/api-reference | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.wise`
- **Aliases:** `Currency`
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `wiseApi` (API token + environment selection + optional private key for SCA)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| resource | options | `profile` | yes | — | Selects the Wise API resource: `account`, `exchangeRate`, `profile`, `recipient`, `quote`, `transfer` |
| operation | options | — | yes | — | The action to perform on the selected resource (varies by resource) |
| profileId | string | — | conditional | resource∈{account,profile,quote,transfer} | Profile ID for profile-scoped operations; populated dynamically from the Get All Profiles API |
| returnAll | boolean | false | — | — | Pagination helper for list operations |
| limit | number | 5 | — | returnAll=false | Max results to return (1–1000) |

### Resource-specific operations and parameters

#### Profile
- **operation**: `get` | `getAll`
- No additional parameters. `get` requires a profile ID selected from the dynamic list.

#### Account
- **operation**: `getBalances` | `getCurrencies` | `getStatement`
- **profileId**: required (string, dynamically loaded)
- **currency** (statement only): optional currency code filter for the account statement.
- **format** (statement only): output format — `json` (default), `csv`, `pdf`, `xml`.
- **binaryProperty** (statement only, non-JSON formats): name of the output binary field for the downloaded file (default `data`).
- **fileName** (statement only, non-JSON formats): filename for the downloaded statement file.
- **lineStyle** (statement only, optional): `COMPACT` (default, single line per transaction) or `FLAT` (separate lines for fees).
- **range** (statement only): optional date range (intervalStart/intervalEnd) for the account statement.

#### Exchange Rate
- **operation**: `get`
- **source** (string): source currency code (e.g. `USD`).
- **target** (string): target currency code (e.g. `EUR`).
- **interval** (optional): the time interval for the rate — `day`, `hour`, `minute`.

#### Recipient
- **operation**: `getAll`
- **profileId**: required.
- **returnAll** (optional): whether to return all results (default false).
- **limit** (optional): max results to return. Only used when returnAll is false.

#### Quote
- **operation**: `create` | `get`
- **profileId**: required for `create`.
- **sourceCurrency**: required for `create`.
- **targetCurrency**: required for `create`.
- **amountType**: required for `create` — `source` (default, amount is what will be sent) or `target` (amount is what should be received).
- **amount**: required for `create` (the amount for the quote, interpreted per amountType).
- **quoteId**: required for `get`.

#### Transfer
- **operation**: `create` | `delete` | `execute` | `get` | `getAll`
- **profileId**: required.
- **quoteId**: required for `create` (the quote the transfer is based on).
- **targetAccountId**: required for `create` (recipient account ID, dynamically loaded from Wise recipients list).
- **reference** (optional for `create`): reference text shown in the recipient's bank statement.
- **transferId**: required for `delete`, `execute`, `get`.
- **downloadReceipt** (`get` only): whether to download the transfer receipt as PDF (only for executed transfers with status "Outgoing Payment Sent"). Default false.
- **binaryProperty** (`get` with downloadReceipt): name of the output binary field (default `data`).
- **fileName** (`get` with downloadReceipt): filename for the receipt PDF.
- **returnAll** (`getAll` only): whether to return all results (default false).
- **limit** (`getAll` only): max results to return. Only used when returnAll is false.
- **sourceCurrency** (optional for `getAll`): filter by source currency.
- **targetCurrency** (optional for `getAll`): filter by target currency.
- **status** (optional for `getAll`): filter by transfer status (e.g. `processing`, `outgoing_payment_sent`, `cancelled`, `bounced_back`, `funds_converted`, etc.).
- **range** (optional for `getAll`): filter by date range (createdDateStart/createdDateEnd).

## Runtime behavior

### Input

Single item or multi-item. Each input item is processed independently by default. `getAll` operations (recipient, profile, transfer) issue one API call per distinct profile parameter value and attach the result to each input item.

### Output

Output items vary by resource/operation:

- **Profile**: returns the profile object (`{ id, type, firstName, lastName, ... }`) for `get`; returns an array of profile objects for `getAll`.
- **Account**: `getBalances` returns an array of balance objects per currency. `getCurrencies` returns the list of currencies configured on the borderless account. `getStatement` returns the account statement data (transaction list within the requested range).
- **Exchange Rate**: returns a rate object with `rate`, `rateType`, `source`, `target`, `time`, `value` keys.
- **Recipient**: returns an array of recipient account objects.
- **Quote**: returns a quote object with `id`, `rate`, `sourceAmount`, `targetAmount`, `fee`, `estimatedDelivery`, etc.
- **Transfer**: `create` returns the created transfer. `get` returns the transfer detail. `getAll` returns an array. `delete` returns a confirmation. `execute` returns the executed transfer with status.

### Errors

- Non-2xx responses from the Wise API throw an `ApiError`. If the error indicates SCA (Strong Customer Authentication) is required and no private key is configured in the credential, a descriptive error about the missing private key is returned.
- `continueOnFail`: when enabled, failing items are returned with an `error` property and processing continues.

### Credential requirements

- **API Token**: personal API token generated from Wise user settings.
- **Environment**: `live` or `test` (sandbox).
- **Private Key (optional)**: RSA private key for Strong Customer Authentication (SCA)-protected endpoints. Required for operations that modify financial data on live accounts.
- The credential determines the base URL (`api.wise.com` for live, `api.sandbox.transferwise.tech` for test).

### Dynamic options loading

The node loads dynamic lists from the Wise API at credential configuration time:
- **Profiles**: fetched via `GET /v1/profiles` and used for profileId dropdowns.
- **Borderless accounts**: fetched via profile-scoped API for account operations.
- **Recipients**: fetched for recipient selection in transfer creation.
- The `loadOptions` method group provides `getBorderlessAccounts`, `getProfiles`, and `getRecipients`.

## Acceptance tests

### Test: get all profiles

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "profile",
  "operation": "getAll"
}
```

**Expect** output[0].json contains an array of profile objects, each with `id` (number), `type` ("personal" or "business"), and profile owner fields.

### Test: get exchange rate

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "exchangeRate",
  "operation": "get",
  "source": "USD",
  "target": "EUR"
}
```

**Expect** output[0].json contains an object with `rate` (number), `source` ("USD"), `target` ("EUR"), and `time` (ISO datetime string).

### Test: create a quote then create and execute a transfer

**Given** input items:
```json
[{ "json": { "profileId": 12345, "recipientId": 67890 } }]
```

**Parameters (step 1 — create quote):**
```json
{
  "resource": "quote",
  "operation": "create",
  "profileId": "={{ $json.profileId }}",
  "sourceCurrency": "USD",
  "targetCurrency": "EUR",
  "amount": 200
}
```

**Expect** output[0].json contains an object with `id` (number), `rate` (number), `sourceAmount` (200), `targetAmount` (number), `fee` (object).

**Parameters (step 2 — create transfer from quote):**
```json
{
  "resource": "transfer",
  "operation": "create",
  "profileId": "={{ $json.profileId }}",
  "quoteId": "={{ $json.id }}",
  "targetAccountId": "={{ $json.recipientId }}",
  "reference": "Invoice 123"
}
```

**Expect** output[0].json contains a transfer object with `id` (number), `status` (string), `sourceCurrency`, `targetCurrency`, `sourceValue`, `targetValue`.

### Test: get account balances

**Given** input items:
```json
[{ "json": { "profileId": 12345 } }]
```

**Parameters:**
```json
{
  "resource": "account",
  "operation": "getBalances",
  "profileId": "={{ $json.profileId }}"
}
```

**Expect** output[0].json contains an array of balance objects, each with `currency` (string, 3-letter code), `amount` (number), `type` ("STANDARD" or "SAVINGS").

### Test: get all transfers

**Given** input items:
```json
[{ "json": { "profileId": 12345 } }]
```

**Parameters:**
```json
{
  "resource": "transfer",
  "operation": "getAll",
  "profileId": "={{ $json.profileId }}"
}
```

**Expect** output[0].json contains an array of transfer objects, each with `id` (number), `status` (string), `sourceCurrency`, `targetCurrency`, `sourceValue`, and `targetValue`.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource list | documented | Public n8n docs enumerate: Account, Exchange Rate, Profile, Recipient, Quote, Transfer |
| Operations per resource | documented | Full operation list from public docs (6 resources, 14 operations total) |
| Credential fields | documented | Public docs detail API token, environment, private key optional for SCA |
| Wise REST API contract | documented | Wise API docs confirm all endpoints and response shapes |
| Dynamic option loading | inferred from type descriptor | The node exposes `loadOptions` methods for profiles, borderless accounts, and recipients |
| Internal parameter nesting | inferred | Detailed parameter names (sourceCurrency, targetAccountId, quoteId, etc.) are consistent with the public Wise REST API shape |
| `getAll` pagination behavior | documented | Recipient and transfer getAll expose returnAll/limit pattern; transfer getAll also supports date range, status, source/target currency filters |
| Statement output formats | documented via corpus | Account statement supports JSON, CSV, PDF, XML output with binary download for non-JSON formats; line style (COMPACT/FLAT) and date range configurable |
| Receipt download | documented via corpus | Transfer get supports optional PDF receipt download for executed transfers via binary output |
| quote:create amountType | documented via corpus | Source or target amount semantics configurable via amountType parameter |
| Alias | documented via corpus | Node.json alias field confirms `Currency` alias |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/wise.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
