---
type: n8n-nodes-base.strava
displayName: Strava
category: Productivity
versions: [1, 1.1]
priority: medium
status: specced
---

# Strava

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.strava.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/strava/ | Public docs only |
| https://developers.strava.com/docs/reference/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.strava`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `stravaOAuth2Api` — OAuth2 (Client ID + Client Secret)

## Parameters

The node operates on a single **Activity** resource with a choice of operations.

### Resource: Activity

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| resource | literal `"activity"` | `"activity"` | fixed | |
| operation | enum | — | required | See operations below |

### Operations

#### Create

Creates a manual activity for the authenticated athlete (requires `activity:write` scope).

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| name | string(expression) | — | — | Activity name |
| sport_type | enum(expression) | — | — | 50+ sport types (Run, Ride, MountainBikeRide, Swim, Walk, Hike, Yoga, etc.) |
| startDate | string(expression) | — | — | ISO 8601 local datetime |
| elapsedTime | number(expression) | — | — | Seconds |
| additionalFields.commute | boolean | — | — | Mark as commute |
| additionalFields.description | string(expression) | — | — | Free-text description |
| additionalFields.distance | number(expression) | — | — | Meters |
| additionalFields.trainer | boolean | — | — | Mark as trainer activity |

Maps to `POST /api/v3/activities`. Returns a `DetailedActivity` object.

#### Get

Fetches a single activity by ID.

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| activityId | string(expression) | — | — | Activity numeric ID |

Maps to `GET /api/v3/activities/{id}`. Returns a `DetailedActivity` object.

#### GetAll

Lists the authenticated athlete's activities (paginated).

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| returnAll | boolean | `false` | — | Fetch all pages vs. a single page |
| limit | number(expression) | — | — | Max items (when returnAll is false) |

Maps to `GET /api/v3/athlete/activities`. Returns an array of `SummaryActivity` objects.

#### GetComments

Lists comments on an activity.

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| activityId | string(expression) | — | — | Activity numeric ID |
| returnAll | boolean | `false` | — | Fetch all pages |
| limit | number(expression) | — | — | Max items (when returnAll is false) |

Maps to `GET /api/v3/activities/{id}/comments`. Returns an array of `Comment` objects.

#### GetKudos

Lists athletes who kudoed an activity.

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| activityId | string(expression) | — | — | Activity numeric ID |
| returnAll | boolean | `false` | — | Fetch all pages |
| limit | number(expression) | — | — | Max items (when returnAll is false) |

Maps to `GET /api/v3/activities/{id}/kudos`. Returns an array of `SummaryAthlete` objects.

#### GetLaps

Lists laps of an activity.

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| activityId | string(expression) | — | — | Activity numeric ID |
| returnAll | boolean | `false` | — | Fetch all pages |
| limit | number(expression) | — | — | Max items (when returnAll is false) |

Maps to `GET /api/v3/activities/{id}/laps`. Returns an array of `Lap` objects.

#### GetZones

Lists heart rate and power zones for an activity.

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| activityId | string(expression) | — | — | Activity numeric ID |
| returnAll | boolean | `false` | — | Fetch all pages |
| limit | number(expression) | — | — | Max items (when returnAll is false) |

Maps to `GET /api/v3/activities/{id}/zones`. Returns an array of `ActivityZone` objects.

#### GetStreams (v1.1+)

Returns time-series data streams for an activity.

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| activityId | string(expression) | — | — | Activity numeric ID |
| keys | multi-select(enum) | — | — | Stream types: altitude, cadence, distance, grade_smooth, heartrate, latlng, moving, temp, time, velocity_smooth, watts |

Maps to `GET /api/v3/activities/{id}/streams`. Returns a `StreamSet` object.

#### Update

Updates an existing activity (requires `activity:write` scope).

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| activityId | string(expression) | — | — | Activity numeric ID |
| updateFields.commute | boolean | — | — | |
| updateFields.description | string(expression) | — | — | |
| updateFields.gear_id | string(expression) | — | — | Equipment ID |
| updateFields.hide_from_home | boolean | — | — | |
| updateFields.name | string(expression) | — | — | |
| updateFields.type | string(expression) | — | — | Activity type |
| updateFields.sport_type | enum(expression) | — | — | Same sport type enum as Create |
| updateFields.trainer | boolean | — | — | |

Maps to `PUT /api/v3/activities/{id}`. Returns a `DetailedActivity` object.

## Runtime behavior

### Input

Each input item is processed independently. For Create operations the parameters supply the payload fields; for read operations the parameters supply query/path arguments.

### Output

Each operation emits one output item per input item on the `main` output. The response from the Strava API is placed under the `json` key of the output item. List operations (GetAll, GetComments, GetKudos, GetLaps, GetZones) yield a single item with an array value at `json`, or multiple items if the node fans out (one per result).

### Errors

API errors (HTTP 4xx/5xx) produce a `Fault` object. The executor should surface the Strava API error message. If `continueOnFail` is enabled, the node sends the error item to the error output branch instead of throwing.

### Expressions

All parameter fields with type `string(expression)` or `number(expression)` accept n8n expression syntax (`{{ }}`).

## Acceptance tests

### Test: create activity

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "activity",
  "operation": "create",
  "name": "Morning Run",
  "sport_type": "Run",
  "startDate": "2026-08-03T07:00:00",
  "elapsedTime": 1800,
  "additionalFields": { "commute": false }
}
```

**Expect** output[0] to contain a `json` object with `id`, `name`, `type`, and `sport_type` fields matching the Strava API `DetailedActivity` shape.

### Test: get activity by ID

**Given** input items:

```json
[{ "json": { "activityId": "1234567890" } }]
```

**Parameters:**

```json
{
  "resource": "activity",
  "operation": "get",
  "activityId": "={{ $json.activityId }}"
}
```

**Expect** output[0] `json` to be a `DetailedActivity` object whose `id` equals the queried ID.

### Test: get all activities (paginated)

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "activity",
  "operation": "getAll",
  "returnAll": false,
  "limit": 5
}
```

**Expect** output[0] `json` to be an array of `SummaryActivity` objects, at most 5 items.

### Test: get activity streams

**Given** input items:

```json
[{ "json": { "activityId": "1234567890" } }]
```

**Parameters:**

```json
{
  "resource": "activity",
  "operation": "getStreams",
  "activityId": "={{ $json.activityId }}",
  "keys": ["time", "distance", "heartrate", "latlng"]
}
```

**Expect** output[0] `json` to contain a `StreamSet` object with the requested stream keys.

### Test: update activity

**Given** input items:

```json
[{ "json": { "activityId": "1234567890" } }]
```

**Parameters:**

```json
{
  "resource": "activity",
  "operation": "update",
  "activityId": "={{ $json.activityId }}",
  "updateFields": { "description": "Updated description", "commute": true }
}
```

**Expect** output[0] `json` to be a `DetailedActivity` with the updated fields reflected.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Operation names (create, get, getAll, getComments, getKudos, getLaps, getZones, getStreams, update) | Public n8n docs + Strava API docs | Confirmed against Strava API v3 reference |
| Create parameters (name, sport_type, startDate, elapsedTime, additionalFields) | Public Strava API docs + corpus | All documented by Strava API |
| Pagination pattern (returnAll + limit) | Public n8n docs (convention) | Standard n8n pagination idiom, consistent with other n8n nodes |
| GetStreams operation (v1.1 addition) | Public Strava API docs | Not in n8n public docs but fully specified in Strava API |
| Update fields (gear_id, hide_from_home) | Public Strava API docs | Mapped from UpdatableActivity model |
| Output shape (DetailedActivity / SummaryActivity / Comment / Lap / StreamSet) | Public Strava API docs | Response shapes match Strava v3 Swagger spec |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/Strava.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
