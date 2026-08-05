---
type: n8n-nodes-base.nasa
displayName: NASA
category: Miscellaneous
versions: [1]
priority: medium
status: specced
---

# NASA

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.nasa.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/nasa.md | Public docs only |
| https://api.nasa.gov/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.nasa`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `nasaApi` (API key, required)

## Parameters

### Resource selector

A required single-select picklist that determines which NASA API endpoint family to call. Allowed values:

| Resource value | Display name | NASA API area |
|----------------|-------------|---------------|
| `astronomyPictureOfTheDay` | Astronomy Picture of the Day | APOD API |
| `asteroidNeoFeed` | Asteroid Neo-Feed | NEO API (date-range feed) |
| `asteroidNeoLookup` | Asteroid Neo-Lookup | NEO API (single asteroid by SPK-ID) |
| `asteroidNeoBrowse` | Asteroid Neo-Browse | NEO API (browse all) |
| `donkiCoronalMassEjection` | DONKI Coronal Mass Ejection | DONKI |
| `donkiGeomagneticStorm` | DONKI Geomagnetic Storm | DONKI |
| `donkiHighSpeedStream` | DONKI High Speed Stream | DONKI |
| `donkiInterplanetaryShock` | DONKI Interplanetary Shock | DONKI |
| `donkiMagnetopauseCrossing` | DONKI Magnetopause Crossing | DONKI |
| `donkiNotifications` | DONKI Notification | DONKI |
| `donkiRadiationBeltEnhancement` | DONKI Radiation Belt Enhancement | DONKI |
| `donkiSolarEnergeticParticle` | DONKI Solar Energetic Particle | DONKI |
| `donkiSolarFlare` | DONKI Solar Flare | DONKI |
| `donkiWsaEnlilSimulation` | DONKI WSA+EnlilSimulation | DONKI |
| `earthImagery` | Earth Imagery | Earth (Landsat) |
| `earthAssets` | Earth Asset (Landsat metadata) | Earth |
| `inSightMarsWeatherService` | InSight Mars Weather Service | Mars weather |
| `imageAndVideoLibrary` | Image and Video Library | Media search |
| `techTransfer` | TechTransfer (NASA patents/software) | Tech Transfer |
| `twoLineElementSet` | Two-Line Element Set (satellite TLE) | Satellite tracking |

Default: `astronomyPictureOfTheDay`

### Operation

Each resource exposes a single fixed operation. All resources use `get` (single-result fetch) except `asteroidNeoBrowse` which uses `getAll` (paginated listing). The operation is automatically determined by the selected resource and is not independently configurable.

### Resource-specific parameters

| Parameter | Applies to | Type | Default | Required | Notes |
|-----------|-----------|------|---------|----------|-------|
| `asteroidId` | `asteroidNeoLookup` | string | `""` | Yes | NASA SPK-ID of the asteroid |
| `download` | `astronomyPictureOfTheDay` | boolean | `true` | No | When true, downloads the image as a binary attachment |
| `binaryPropertyName` | `astronomyPictureOfTheDay` (when download=true), `earthImagery` | string | `"data"` | Yes | Output binary field name for downloaded file |
| `lat` | `earthImagery`, `earthAssets` | number | — | Yes | Latitude of the location |
| `lon` | `earthImagery`, `earthAssets` | number | — | Yes | Longitude of the location |
| `returnAll` | `asteroidNeoBrowse` | boolean | `false` | No | Pagination mode toggle |
| `limit` | `asteroidNeoBrowse` (when returnAll=false) | number | `20` | No | Max items per page |

### Additional Fields (collection)

Each resource group exposes a collection of optional fields:

**APOD — `astronomyPictureOfTheDay`:**
- `date` (dateTime, `YYYY-MM-DD`) — specific APOD date; defaults to today

**NEO Feed + most DONKI resources (date-range):**
- `startDate` (dateTime, `YYYY-MM-DD`)
- `endDate` (dateTime, `YYYY-MM-DD`)

**NEO Lookup — `asteroidNeoLookup`:**
- `includeCloseApproachData` (boolean, default false)

**DONKI Interplanetary Shock (additional filters):**
- `startDate`, `endDate` (same as above)
- `location` (options: ALL, earth, MESSENGER, STEREO A, STEREO B; default ALL)
- `catalog` (options: ALL, SWRC_CATALOG, WINSLOW_MESSENGER_ICME_CATALOG; default ALL)

**Earth imagery/assets:**
- `date` (dateTime, `YYYY-MM-DD`) — image date
- `dim` (number) — width/height in degrees (e.g. 0.025)

## Runtime behavior

### Input

The node does not transform input item data. Incoming items are passed through; each item triggers an independent API call based on the configured resource/parameters. Non-browse operations produce one output item per input item. The browse operation (`asteroidNeoBrowse`) merges up to `limit` results into one output per input.

### Output

Output structure mirrors the raw NASA API JSON response for the selected endpoint:

| Resource family | Output shape outline |
|----------------|-------------------|
| **APOD** | `{ copyright, date, explanation, hdurl, media_type, service_version, title, url }` plus optional binary attachment if `download=true` |
| **NEO Feed** | `{ element_count, near_earth_objects: { [date]: [asteroid...] } }` per NASA NEO feed spec |
| **NEO Lookup** | A single NEO object with `id`, `name`, `absolute_magnitude_h`, `estimated_diameter`, `is_potentially_hazardous_asteroid`, `close_approach_data` (if requested) |
| **NEO Browse** | Array of NEO objects |
| **DONKI** | Array of event objects; shape varies by endpoint (common fields: `activityID`, `catalog`, `beginTime`, `peakTime`, `endTime`, `linkedEvents`, sources) |
| **Earth Imagery** | Binary image file (Landsat raster) |
| **Earth Assets** | `{ date, id, resource, service_version, url }` (Landsat scene metadata) |
| **InSight Mars Weather** | `{ sol_keys, validity_checks, [sol...] }` |
| **Image & Video Library** | `{ collection: { items, metadata, version, href } }` |
| **TechTransfer** | Array of software/patent records |
| **Two-Line Element Set** | TLE data for tracked satellites |

When used as an AI tool, the node returns the JSON response to the calling agent without binary files.

### Errors

- Missing or invalid API key → credential error (401)
- Invalid parameters (e.g. unknown asteroid ID, out-of-range date) → API error propagated as a node error
- Network/rate-limit errors → standard n8n retry behavior applies
- `continueOnFail`: when enabled, failed items produce an empty output item with `error` field instead of halting

### Expressions

All parameters accept expression strings.

## Acceptance tests

### Test: APOD — fetch astronomy picture of the day (URL only)

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "astronomyPictureOfTheDay",
  "operation": "get",
  "download": false
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "copyright": "string",
    "date": "string",
    "explanation": "string",
    "hdurl": "string",
    "media_type": "string",
    "service_version": "string",
    "title": "string",
    "url": "string"
  }
}]
```

### Test: NEO Feed with date range

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "asteroidNeoFeed",
  "operation": "get",
  "additionalFields": {
    "startDate": "2025-01-01",
    "endDate": "2025-01-07"
  }
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "element_count": "number",
    "near_earth_objects": {}
  }
}]
```

### Test: Earth imagery with binary download

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "earthImagery",
  "operation": "get",
  "lat": 47.751076,
  "lon": -120.740135,
  "binaryPropertyName": "data",
  "additionalFields": {
    "date": "2025-06-01",
    "dim": 0.025
  }
}
```

**Expect** output[0] contains a `binary.data` field with image data and `json` with empty or minimal metadata.

### Test: NEO browse (paginated)

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "resource": "asteroidNeoBrowse",
  "operation": "getAll",
  "returnAll": false,
  "limit": 5
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "near_earth_objects": "array"
  }
}]
```
The `near_earth_objects` array must have length ≤ 5.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| APOD parameter structure | Documented | Public docs list the operation; additional details from corpus |
| NEO, DONKI, Earth resources | Documented | Public docs list resource names |
| InSight Mars, Image Library, TechTransfer, TLE resources | Inferred from corpus | Not listed on the public docs page but present in the published npm descriptor |
| Exact output field shapes | Inferred | NASA API responses are documented at api.nasa.gov; the spec describes high-level shapes |
| Credential type | Documented | API key from api.nasa.gov |

## OpenFlow mapping

- **Definition group:** `transform`
- **Executor file:** `src/lib/engine/executors/nasa.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
