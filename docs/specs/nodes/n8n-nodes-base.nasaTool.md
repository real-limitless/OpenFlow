---
type: n8n-nodes-base.nasaTool
displayName: NASA (AI Tool)
category: AI Tool
versions: [1]
priority: medium
status: specced
---

# NASA (AI Tool)

An AI agent tool variant of the NASA node. When connected to an AI Agent, the agent model can dynamically populate parameters using `$fromAI()` or the "let model fill" toggle. Shares the same underlying NASA Open API endpoints as the base NASA node but is surfaced as a distinct type string for the AI Agent tool-selection system.

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.nasa.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/nasa.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/ai-examples/use-ai-for-parameters.md | Public docs only |
| https://docs.n8n.io/build/integrate-ai/understand-ai-components/how-tools-work.md | Public docs only |
| https://api.nasa.gov/ | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.nasaTool`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `nasaApi` (API key, required)

## Parameters

The node exposes a resource selector that determines which NASA API endpoint family to call. Each resource exposes a single fixed operation (`get` for single-result fetches, `getAll` for the NEO browse paginated endpoint). All parameters accept expressions and `$fromAI()` dynamic population for AI agent use.

Unlike the base NASA node, the tool variant does not include `download` (binary image download for APOD/Earth Imagery) or `binaryPropertyName` parameters, since binary data is not passed through the tool interface.

### Resource selection

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| resource | options | `astronomyPictureOfTheDay` | yes | Selects the NASA API endpoint family (see resource table below) |

### Resource table

| Resource value | Display name | NASA API area | Operation |
|----------------|-------------|---------------|-----------|
| `astronomyPictureOfTheDay` | Astronomy Picture of the Day | APOD | get |
| `asteroidNeoFeed` | Asteroid Neo-Feed | NEO (date-range feed) | get |
| `asteroidNeoLookup` | Asteroid Neo-Lookup | NEO (single SPK-ID) | get |
| `asteroidNeoBrowse` | Asteroid Neo-Browse | NEO (browse all) | getAll |
| `donkiCoronalMassEjection` | DONKI Coronal Mass Ejection | DONKI | get |
| `donkiGeomagneticStorm` | DONKI Geomagnetic Storm | DONKI | get |
| `donkiHighSpeedStream` | DONKI High Speed Stream | DONKI | get |
| `donkiInterplanetaryShock` | DONKI Interplanetary Shock | DONKI | get |
| `donkiMagnetopauseCrossing` | DONKI Magnetopause Crossing | DONKI | get |
| `donkiNotifications` | DONKI Notification | DONKI | get |
| `donkiRadiationBeltEnhancement` | DONKI Radiation Belt Enhancement | DONKI | get |
| `donkiSolarEnergeticParticle` | DONKI Solar Energetic Particle | DONKI | get |
| `donkiSolarFlare` | DONKI Solar Flare | DONKI | get |
| `donkiWsaEnlilSimulation` | DONKI WSA+EnlilSimulation | DONKI | get |
| `earthImagery` | Earth Imagery | Earth (Landsat) | get |
| `earthAssets` | Earth Asset (Landsat metadata) | Earth | get |
| `inSightMarsWeatherService` | InSight Mars Weather Service | Mars weather | get |
| `imageAndVideoLibrary` | Image and Video Library | Media search | get |
| `techTransfer` | TechTransfer (NASA patents/software) | Tech Transfer | get |
| `twoLineElementSet` | Two-Line Element Set (satellite TLE) | Satellite tracking | get |

### Resource-specific parameters

When used as an AI tool, parameters can be populated by the AI model at inference time. The following parameters are available per resource:

| Parameter | Applies to | Type | Required | Notes |
|-----------|-----------|------|----------|-------|
| `asteroidId` | `asteroidNeoLookup` | string | yes | NASA SPK-ID of the asteroid |
| `lat` | `earthImagery`, `earthAssets` | number | yes | Latitude of the location |
| `lon` | `earthImagery`, `earthAssets` | number | yes | Longitude of the location |
| `returnAll` | `asteroidNeoBrowse` | boolean | no | Pagination mode; false returns up to `limit` items |
| `limit` | `asteroidNeoBrowse` | number | no | Max items per page (default 20) |

### Optional additional fields

**APOD (`astronomyPictureOfTheDay`):**
- `date` (dateTime, `YYYY-MM-DD`) — specific APOD date; defaults to today

**NEO Feed + most DONKI resources (date-range):**
- `startDate` (dateTime, `YYYY-MM-DD`)
- `endDate` (dateTime, `YYYY-MM-DD`)

**NEO Lookup (`asteroidNeoLookup`):**
- `includeCloseApproachData` (boolean, default false)

**DONKI Interplanetary Shock:**
- `startDate`, `endDate` (as above)
- `location` (options: ALL, earth, MESSENGER, STEREO A, STEREO B; default ALL)
- `catalog` (options: ALL, SWRC_CATALOG, WINSLOW_MESSENGER_ICME_CATALOG; default ALL)

**Earth imagery/assets:**
- `date` (dateTime, `YYYY-MM-DD`) — image date
- `dim` (number) — width/height in degrees (e.g. 0.025)

## Runtime behavior

### Input

The node consumes items from `main[0]`. Each incoming item triggers an independent NASA API call based on the configured resource and parameters. In $fromAI() mode, the resource, operation, and data fields may be determined at inference time from the agent's conversation context.

### Output

Successful requests produce one or more output items on `main[0]`. The output structure mirrors the raw NASA API JSON response for the selected endpoint. When the NASA API returns paginated data (`asteroidNeoBrowse`), results are merged into a single output item.

When used as an AI tool, returned data is passed to the calling agent for interpretation. Binary downloads (APOD image, Earth imagery) are not included in AI tool mode — only the JSON response is returned.

### $fromAI() support

In AI agent tool mode, resource selection, date ranges, spatial coordinates, asteroid IDs, and optional filters can be populated at inference time by the connected language model. The runtime must support:
- Selecting the target NASA API endpoint at runtime
- Populating date parameters, coordinates, identifiers, and query filters from model-generated values
- Providing clear parameter descriptions to guide model selection

### Errors

- Missing or invalid API key → credential error (401)
- Invalid parameters (unknown asteroid ID, out-of-range date, invalid lat/lon) → API error propagated as a node error
- Network/rate-limit errors → standard n8n retry behavior applies
- `continueOnFail`: when enabled, failed items produce an empty output item with `error` field

## Acceptance tests

### Test: agent fetches APOD

**Given** a connected AI agent that decides to fetch today's Astronomy Picture of the Day.

**Parameters:** resource `astronomyPictureOfTheDay`.

**Expect:** a successful output item containing the APOD response with `title`, `explanation`, `url`, `date`, and `media_type` fields.

### Test: agent looks up a specific asteroid

**Given** an AI agent that decides to look up asteroid "2000433" (Eros).

**Parameters:** resource `asteroidNeoLookup`, `asteroidId` populated by the model as `2000433`.

**Expect:** a successful output containing the NEO object with `id`, `name`, `absolute_magnitude_h`, and `is_potentially_hazardous_asteroid`.

### Test: agent queries DONKI solar flares

**Given** an AI agent that decides to retrieve solar flare data for a specific date range.

**Parameters:** resource `donkiSolarFlare`, `additionalFields.startDate` and `additionalFields.endDate` populated by the model.

**Expect:** a successful output containing an array of DONKI solar flare event objects.

### Test: agent retrieves Earth imagery metadata

**Given** an AI agent that decides to retrieve Landsat asset metadata for given coordinates.

**Parameters:** resource `earthAssets`, `lat` and `lon` populated by the model.

**Expect:** a successful output containing the Earth asset metadata with `date`, `id`, and `url`.

### Test: missing credential error

**Given** no credential is configured for the node.

**Expect:** execution fails before any API call with an actionable error about missing NASA API credentials.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Tool variant existence | documented | Public NASA node page states "This node can be used as an AI tool." The separate `nasaTool` type string is inferred from the tool-variant pattern used by other nodes. |
| Resource list (APOD, NEO, DONKI, Earth) | documented | Confirmed from public NASA node documentation page. |
| Resource list (InSight Mars, Image Library, TechTransfer, TLE) | inferred | These 4 resources appear in the published npm descriptor but not in public docs.n8n.io. May not be available in the tool variant. |
| Credential type | documented | `nasaApi` API key from api.nasa.gov |
| $fromAI() support | documented | General AI tool parameter population pattern documented in n8n docs. |
| Exact output field shapes | inferred | NASA API responses documented at api.nasa.gov; spec describes high-level shapes. |
| No binary download in tool mode | inferred | AI tool nodes return JSON only; `download`/`binaryPropertyName` parameters are not included in the tool variant. |

## OpenFlow mapping

- **Definition group:** `ai-tool`
- **Executor file:** `src/lib/engine/executors/nasaTool.ts`
- **SDK:** `defineNode` with native `ExecutionContext` only
