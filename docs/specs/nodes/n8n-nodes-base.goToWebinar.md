---
type: n8n-nodes-base.goToWebinar
displayName: GoToWebinar
category: Communication
versions: [1]
priority: medium
status: specced
---

# GoToWebinar

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.gotowebinar/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/gotowebinar/ | Public docs only |
| https://developer.goto.com/GoToWebinarV2 | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.goToWebinar`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `goToWebinarOAuth2Api` (OAuth2 with Client ID + Client Secret)

## Parameters

The node exposes six resource families, each with its own set of operations and fields. The user selects a resource and then an operation within that resource.

| Resource | Operations | Key parameters |
|----------|-----------|----------------|
| **Webinar** | Create, Get, Get All, Update | `webinarKey` (for Get/Update), `subject` (Create), `description` (Create), `times` (Create — array of `{startTime, endTime}`), `timeZone`, `type` (single_session/series/sequence), `locale` (en_US/de_DE/es_ES/fr_FR/it_IT/zh_CN), `isPasswordProtected`, `experienceType` (CLASSIC/BROADCAST/SIMULIVE), `isOndemand`, `isBreakout`, `recordingAssetKey`, `emailSettings` |
| **Registrant** | Create, Delete, Get, Get All | `webinarKey`, `registrantKey` (for Delete/Get), `email`, `firstName`, `lastName`, custom registration field answers |
| **Attendee** | Get, Get All, Get Details | `webinarKey`, `sessionKey`, `registrantKey` (for Get/Get Details) |
| **Session** | Get, Get All, Get Details | `webinarKey`, `sessionKey` |
| **Co-Organizer** | Create, Delete, Get All, Re-invite | `webinarKey`, `organizerKey` (co-organizer's key), `email` (Create), `givenName`, `familyName` |
| **Panelist** | Create, Delete, Get All, Re-invite | `webinarKey`, `panelistKey` (for Delete/Re-invite), `email` (Create), `givenName`, `familyName` |

**Webinar Get All** supports pagination via `page` and `size` query parameters, plus a date range filter (`fromTime`, `toTime` in ISO8601 UTC). The implementation should also expose a `returnAll` toggle and `limit` option for simplicity, consistent with convention.

**Create Registrant** accepts dynamic registration-field answers that vary per webinar (loaded at runtime from the GoToWebinar API). The node provides runtime option-loading for webinars, webinar sessions, registration fields, and timezones.

## Runtime behavior

### Input

Each input item is processed independently. The node uses the item's JSON data as the source for expression-based parameter values. For operations that produce lists (Get All), the result can be paginated across multiple API calls when `returnAll` is enabled.

### Output

Each output item corresponds to one API result item. For singular operations (Get, Create), the single response object is emitted as one output item. For list operations (Get All), each element in the API response's array is emitted as one output item.

The shape of output items mirrors the GoToWebinar API v2 JSON response schema. Key response fields include:

- **Webinar response:** `webinarKey`, `webinarID`, `subject`, `description`, `times[]` (each with `startTime`, `endTime`), `timeZone`, `locale`, `approvalType`, `registrationUrl`, `impromptu`, `isPasswordProtected`, `recurrenceType`, `experienceType`
- **Registrant response:** `registrantKey`, `email`, `firstName`, `lastName`, `status`, `registrationDate`
- **Attendee response:** `attendeeKey`, `email`, `firstName`, `lastName`, `attendance`
- **Session response:** `sessionKey`, `webinarKey`, `startTime`, `endTime`, `registrationUrl`
- **Co-Organizer / Panelist responses:** arrays of member objects with `key`, `email`, `name`, `status`

### Errors

The node should surface HTTP error responses from the GoToWebinar API (4xx/5xx) directly. When `continueOnFail` is enabled, the node should return the error item rather than throwing, consistent with standard node error handling.

### Expressions

All parameter values accept expression strings for dynamic resolution from input item data.

## Acceptance tests

### Test: Create, then Get a webinar

**Given** an input item with subject and description fields in JSON:

```json
[{ "json": { "subject": "Test Webinar", "description": "A test webinar via automation" } }]
```

**Parameters:** resource=Webinar, operation=Create, subject from expression, description from expression, times=`[{ "startTime": "2026-08-06T14:00:00Z", "endTime": "2026-08-06T15:00:00Z" }]`, timeZone=`America/New_York`

**Expect** output[0] JSON to contain `webinarKey`, `subject: "Test Webinar"`, and the created webinar times.

### Test: Get All webinars with pagination

**Given** a single input item:

```json
[{ "json": {} }]
```

**Parameters:** resource=Webinar, operation=Get All, returnAll=false, limit=5

**Expect** output[0] to contain at most 5 webinar objects, each with `webinarKey` and `subject`.

### Test: Register a registrant

**Given** an input item:

```json
[{ "json": { "email": "test@example.com", "firstName": "Jane", "lastName": "Doe" } }]
```

**Parameters:** resource=Registrant, operation=Create, webinarKey from a prior step (or fixed test key), email/firstName/lastName from expressions

**Expect** output[0] JSON to contain `registrantKey`, `email: "test@example.com"`, `status: "APPROVED"` (or similar).

### Test: Get All attendees for a session

**Given** known webinarKey and sessionKey:

```json
[{ "json": {} }]
```

**Parameters:** resource=Attendee, operation=Get All, webinarKey from fixed test key, sessionKey from fixed test key

**Expect** output to contain zero or more attendee objects, each with `attendeeKey`.

### Test: Get All panelists for a webinar

**Given** a known webinarKey:

```json
[{ "json": {} }]
```

**Parameters:** resource=Panelist, operation=Get All, webinarKey from fixed test key

**Expect** output to contain an array of panelist objects each with `key` and `email` (may be empty).

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Exact parameter names and nested structure | Documented (n8n public docs + GoToWebinar API v2 reference) | High confidence — both n8n docs and the GoToWebinar developer site list the same operations |
| Credential type | Documented | `goToWebinarOAuth2Api` — OAuth2 only, no API-key variant |
| Registration field questions (dynamic) | Inferred | The node loads registration questions from the API at runtime — exact field structure depends on the webinar configuration |
| Timezone option loading | Inferred from type declarations | The node exposes `getTimezones` as a loadOptions method |
| Simplified parameter abstraction | Spec design choice | Mapped to functional outcomes rather than replicating original n8n UI nesting |
| Panelist/Co-Organizer detail parameters | Inferred from GoToWebinar API | `givenName`, `familyName` are API-required fields for create operations |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/n8n-nodes-base.goToWebinar.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
