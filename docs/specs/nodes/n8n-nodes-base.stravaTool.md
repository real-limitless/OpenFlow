---
type: n8n-nodes-base.stravaTool
displayName: Strava
category: AI Tool
versions: [1, 1.1]
priority: medium
status: specced
---

# Strava (AI Tool)

An AI agent tool variant of the Strava node. When connected to an AI Agent, the agent model can dynamically populate parameters using `$fromAI()` or the "let model fill" toggle. Provides 9 operations against the Strava API v3 Activities endpoints.

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.strava.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/strava/ | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |
| https://developers.strava.com/docs/reference/ | External API reference |

## Wire format

- **Type string:** `n8n-nodes-base.stravaTool`
- **Aliases:** (none — base node name `strava` with `usableAsTool: true`)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `stravaOAuth2Api` (required) — OAuth2 authorization code flow with scopes `activity:read_all,activity:write`

## Parameters

The node exposes a single `resource` (Activity) with selectable operations. Operation-specific fields appear based on the selected operation. All data parameters accept expressions and `$fromAI()` dynamic population for AI agent use.

### Resource (fixed)

Only one resource exists:

| Value | Label |
|-------|-------|
| `activity` | Activity |

### Operation (required)

| Value | Label | Description |
|-------|-------|-------------|
| `create` | Create | Create a new manual activity |
| `get` | Get | Get a single activity by ID |
| `getAll` | Get Many | List the authenticated athlete's activities |
| `getComments` | Get Comments | Get all comments on an activity |
| `getKudos` | Get Kudos | Get all kudos (likes) on an activity |
| `getLaps` | Get Laps | Get all laps of an activity |
| `getStreams` | Get Streams | Get activity stream data (time-series) |
| `getZones` | Get Zones | Get all activity zones |
| `update` | Update | Update an activity |

### Create parameters

Shown when `operation = create`. Accepts `$fromAI()`.

| name | type | required | default | description |
|------|------|----------|---------|-------------|
| `name` | string | yes | — | The name of the activity |
| `sport_type` | options | yes (v1.1+) | `Run` | Sport type (see Sport Types below) |
| `type` | string | yes (v1 only) | — | Deprecated; type string like "Run", "Ride" |
| `startDate` | dateTime | yes | — | ISO 8601 start date-time |
| `elapsedTime` | number | yes | 0 | Duration in seconds |
| `additionalFields.commute` | boolean | no | false | Mark as a commute |
| `additionalFields.description` | string | no | — | Description of the activity |
| `additionalFields.distance` | number | no | 0 | Distance in meters |
| `additionalFields.trainer` | boolean | no | false | Mark as a trainer activity |

### Get / Get Comments / Get Kudos / Get Laps / Get Zones / Get Streams parameters

Shown when `operation` is one of `get`, `getComments`, `getKudos`, `getLaps`, `getZones`, or `getStreams`.

| name | type | required | default | description |
|------|------|----------|---------|-------------|
| `activityId` | string | yes | — | The ID of the activity |
| `returnAll` | boolean | no | false | Return all results or only up to a limit (comments, kudos, laps, zones) |
| `limit` | number | no | 50 | Max results to return when `returnAll` is false (min 1, max 100) |
| `keys` | multiOptions | yes (streams) | — | Desired stream types: `altitude`, `cadence`, `distance`, `grade_smooth`, `heartrate`, `latlng`, `moving`, `temp`, `time`, `velocity_smooth`, `watts` |

### Get Many parameters

Shown when `operation = getAll`.

| name | type | required | default | description |
|------|------|----------|---------|-------------|
| `returnAll` | boolean | no | false | Return all results or only up to a limit |
| `limit` | number | no | 50 | Max results to return when `returnAll` is false (min 1, max 100) |
| `filters.before` | number | no | — | Epoch timestamp filter — only activities before this time |
| `filters.after` | number | no | — | Epoch timestamp filter — only activities after this time |

### Update parameters

Shown when `operation = update`. Accepts `$fromAI()`.

| name | type | required | default | description |
|------|------|----------|---------|-------------|
| `activityId` | string | yes | — | The ID of the activity to update |
| `updateFields.name` | string | no | — | The name of the activity |
| `updateFields.description` | string | no | — | Description of the activity |
| `updateFields.type` | string | no | — | Type string like "Run", "Ride" (v1 only) |
| `updateFields.sport_type` | options | no | `Run` | Sport type (v1.1+; see Sport Types below) |
| `updateFields.commute` | boolean | no | false | Mark as a commute |
| `updateFields.trainer` | boolean | no | false | Mark as a trainer activity |
| `updateFields.gear_id` | string | no | — | Gear identifier; `none` clears gear from the activity |
| `updateFields.hide_from_home` | boolean | no | false | Do not publish to Home or Club feeds |

### Sport Types

Available for `sport_type` create / update parameters (v1.1+):

`AlpineSki`, `BackcountrySki`, `Badminton`, `Canoeing`, `Crossfit`, `EBikeRide`, `Elliptical`, `EMountainBikeRide`, `Golf`, `GravelRide`, `Handcycle`, `HighIntensityIntervalTraining`, `Hike`, `IceSkate`, `InlineSkate`, `Kayaking`, `Kitesurf`, `MountainBikeRide`, `NordicSki`, `Pickleball`, `Pilates`, `Racquetball`, `Ride`, `RockClimbing`, `RollerSki`, `Rowing`, `Run`, `Sail`, `Skateboard`, `Snowboard`, `Snowshoe`, `Soccer`, `Squash`, `StairStepper`, `StandUpPaddling`, `Surfing`, `Swim`, `TableTennis`, `Tennis`, `TrailRun`, `Velomobile`, `VirtualRide`, `VirtualRow`, `VirtualRun`, `Walk`, `WeightTraining`, `Wheelchair`, `Windsurf`, `Workout`, `Yoga`

## Runtime behavior

### Input

Each input item is processed independently. Parameters are resolved per item. For read operations, the input item is typically just a trigger/placeholder with parameters set via `$fromAI()` or workflow expressions.

### Output

**create:** Returns a [DetailedActivity](https://developers.strava.com/docs/reference/#api-models-DetailedActivity) object with fields including `id`, `name`, `distance`, `moving_time`, `elapsed_time`, `total_elevation_gain`, `type`, `sport_type`, `start_date`, `start_date_local`, `timezone`, `athlete`, `map`, `trainer`, `commute`, `gear_id`, `average_speed`, `max_speed`, `calories`, `segment_efforts`, `splits_metric`, `laps`, `photos`, `device_name`, etc.

**get:** Returns a [DetailedActivity](https://developers.strava.com/docs/reference/#api-models-DetailedActivity) object (same shape as create response).

**getAll:** Returns an array of [SummaryActivity](https://developers.strava.com/docs/reference/#api-models-SummaryActivity) objects — a lighter representation without segment_efforts, splits, laps.

**getComments:** Returns an array of [Comment](https://developers.strava.com/docs/reference/#api-models-Comment) objects with `id`, `activity_id`, `text`, `created_at`, `athlete`.

**getKudos:** Returns an array of [SummaryAthlete](https://developers.strava.com/docs/reference/#api-models-SummaryAthlete) objects (`firstname`, `lastname`).

**getLaps:** Returns an array of [Lap](https://developers.strava.com/docs/reference/#api-models-Lap) objects with `id`, `name`, `elapsed_time`, `moving_time`, `start_date`, `distance`, `average_speed`, `max_speed`, `average_cadence`, `average_watts`, `lap_index`.

**getStreams:** Returns an array of stream objects keyed by requested stream type, each with `type`, `data` (array of numeric values), `series_type`, `original_size`, `resolution`.

**getZones:** Returns an array of [ActivityZone](https://developers.strava.com/docs/reference/#api-models-ActivityZone) objects with `score`, `distribution_buckets`, `type`, `sensor_based`, `points`.

**update:** Returns a [DetailedActivity](https://developers.strava.com/docs/reference/#api-models-DetailedActivity) object (same shape as create response), reflecting the updated values.

### API endpoints

All requests target `https://www.strava.com/api/v3/`:

- Create: `POST /activities`
- Get: `GET /activities/{id}`
- Get Many: `GET /athlete/activities`
- Get Comments: `GET /activities/{id}/comments`
- Get Kudos: `GET /activities/{id}/kudos`
- Get Laps: `GET /activities/{id}/laps`
- Get Streams: `GET /activities/{id}/streams?keys={keys}&key_by_type=true`
- Get Zones: `GET /activities/{id}/zones`
- Update: `PUT /activities/{id}`

### `$fromAI()` support

In AI agent tool mode, operation and data field parameters can be populated at inference time by the connected language model. The runtime must support:
- Selecting the target operation at inference time
- Populating activity fields like `name`, `sport_type`, `startDate`, `elapsedTime`, `activityId`, `description`, `distance` from model-generated values
- Providing clear descriptions for each parameter to guide model selection

### Errors

- 4xx/5xx HTTP responses from the Strava API throw (or return empty output if `continueOnFail` is enabled).
- Strava API returns [Fault](https://developers.strava.com/docs/reference/#api-models-Fault) or [Error](https://developers.strava.com/docs/reference/#api-models-Error) objects with `message`, `errors` fields.
- Common errors: 401 (invalid/expired token), 403 (insufficient scope), 404 (activity not found), 429 (rate limit exceeded).
- Missing required parameters (`name`, `activityId`, `startDate`, `elapsedTime`, `keys`) throw before making the HTTP call.
- The Strava API enforces rate limits: 600 requests per 15 minutes per application per user for non-upload requests, 100 requests per 15 minutes for uploads.
- OAuth2 token refresh is handled by the credential lifecycle — expired tokens trigger a refresh using the stored refresh token.

### Expressions

All string parameters accept expression strings. Boolean, number, and options parameters accept expressions resolving to the correct type.

## Acceptance tests

### Test: agent creates a manual activity

**Given** a connected AI agent that decides to log a workout.

**Parameters:** operation `create`, name `"Morning Run"`, sport_type `Run`, startDate `"2024-03-15T07:00:00Z"`, elapsedTime `3600`, additionalFields.distance `5000`.

**Expect:** output[0] contains a DetailedActivity object with `name` matching the input, `type` = `"Run"`, `elapsed_time` = `3600`, `distance` = `5000`, `manual` = `true`.

### Test: agent gets an activity by ID

**Given** a connected AI agent that has an activity ID from a previous step.

**Parameters:** operation `get`, activityId `"1234567890"`.

**Expect:** output[0] contains a DetailedActivity object with `id` matching the requested ID.

### Test: agent lists recent activities

**Given** a connected AI agent that wants to fetch activities.

**Parameters:** operation `getAll`, returnAll `false`, limit `5`.

**Expect:** output[0] contains an array of up to 5 SummaryActivity objects, each with `id`, `name`, `distance`, `moving_time`, `type`.

### Test: agent updates an activity

**Given** a connected AI agent that wants to rename an activity.

**Parameters:** operation `update`, activityId `"1234567890"`, updateFields.name `"Updated Name"`, updateFields.description `"Changed the description"`.

**Expect:** output[0] contains a DetailedActivity object with `name` = `"Updated Name"` and `description` matching the update.

### Test: agent gets activity streams

**Given** a connected AI agent that wants time-series data for an activity.

**Parameters:** operation `getStreams`, activityId `"1234567890"`, keys `["time", "distance", "heartrate"]`.

**Expect:** output[0] contains stream data for the requested keys, each with `type` matching a requested key and `data` containing an array of numeric values.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string (`stravaTool`) | inferred | Base `strava` node has `usableAsTool: true`; follows `<base>Tool` naming convention confirmed in other tool specs |
| 9 operations on Activity resource | documented | Confirmed by both public n8n docs and Strava API reference |
| Version distinction (v1 vs v1.1) | documented | v1 uses `type` string; v1.1+ uses `sport_type` enum from Strava SportType model |
| Credentials | documented | `stravaOAuth2Api` OAuth2 with scopes `activity:read_all,activity:write` |
| `$fromAI()` support | documented | General AI tool parameter population pattern documented in n8n docs |
| No dedicated docs page | inferred | The `stravaTool` type has no separate docs.n8n.io page — it's the base node exposed as tool |
| Response shapes | documented | Strava API reference documents all model types (DetailedActivity, SummaryActivity, Comment, Lap, etc.) |
| Stream types options | documented | 11 stream type values match the Strava Streams API `keys` parameter |
| Sport types | documented | 51 sport type values match the Strava SportType model enum |
| URL parameter for stream `keys` | inferred | The `keys` param uses `key_by_type=true` query parameter in the Strava Streams API |

## OpenFlow mapping

- **Definition group:** `ai-tool`
- **Executor file:** `src/lib/engine/executors/stravaTool.ts`
- **SDK:** `defineNode` with the native `ExecutionContext` only
