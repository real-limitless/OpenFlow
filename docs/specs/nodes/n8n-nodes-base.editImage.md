---
type: n8n-nodes-base.editImage
displayName: Edit Image
category: Transform
versions: [1]
priority: medium
status: specced
---

# Edit Image

Manipulate and edit images with operations including blur, border, composite, create, crop, draw, rotate, resize, shear, text, and transparency. Operates on binary image data from input items.

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.editimage/ | Public docs only |
| CORPUS_DIR package descriptor (`n8n-nodes-base@2.15.1`, `EditImage.node.json` + `.node.js` schema) | Public descriptor metadata — parameter names, enums, defaults only |

## Wire format

- **Type string:** `n8n-nodes-base.editImage`
- **Aliases:** `File`, `Binary` (palette / codex search; **descriptor**)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** (none)
- **Subtitle:** `={{ $parameter["operation"] }}` (**descriptor**)

## Parameters

`operation` selects the operation. Parameter visibility is governed by `displayOptions` on `operation`.

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | options | (required) | yes | — | `blur` \| `border` \| `composite` \| `create` \| `crop` \| `draw` \| `rotate` \| `resize` \| `shear` \| `text` \| `transparent` (**documented** + **descriptor**) |
| binaryPropertyName | string | `data` | no | — | Binary property name on input items to read/write image data (**descriptor**) |

### `create` options

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| backgroundColor | color | `#ffffff00` | no | operation = `create` | Background color with alpha (**descriptor**) |
| width | number | `50` | no | operation = `create` | Min 1 (**descriptor**) |
| height | number | `50` | no | operation = `create` | Min 1 (**descriptor**) |

### `draw` options

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| primitive | options | `rectangle` | no | operation = `draw` | `circle` \| `line` \| `rectangle` (**descriptor**) |
| color | color | `#ff000000` | no | operation = `draw` | Color with alpha (**descriptor**) |
| startPositionX | number | `50` | no | operation = `draw`; primitive ∈ `circle,line,rectangle` | X start position (**descriptor**) |
| startPositionY | number | `50` | no | operation = `draw`; primitive ∈ `circle,line,rectangle` | Y start position (**descriptor**) |
| endPositionX | number | `250` | no | operation = `draw`; primitive ∈ `circle,line,rectangle` | X end position (**descriptor**) |
| endPositionY | number | `250` | no | operation = `draw`; primitive ∈ `circle,line,rectangle` | Y end position (**descriptor**) |
| cornerRadius | number | `0` | no | operation = `draw`; primitive = `rectangle` | Corner radius for rounded rectangle (**descriptor**) |

### `text` options

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| text | string | `''` | no | operation = `text` | Text to render; multiline (5 rows) (**descriptor**) |
| fontSize | number | `18` | no | operation = `text` | Font size (**descriptor**) |
| fontColor | color | `#000000` | no | operation = `text` | Text color (**descriptor**) |
| positionX | number | `50` | no | operation = `text` | X position (**descriptor**) |
| positionY | number | `50` | no | operation = `text` | Y position (**descriptor**) |
| lineLength | number | `80` | no | operation = `text` | Max characters per line before wrap; min 1 (**descriptor**) |
| font | string | (auto) | no | operation = `text` | Font family (auto-detects Arial if available) (**descriptor**) |

### `blur` options

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| blur | number | `5` | no | operation = `blur` | Blur radius; 0–1000 (**descriptor**) |
| sigma | number | `2` | no | operation = `blur` | Sigma; 0–1000 (**descriptor**) |

### `border` options

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| borderWidth | number | `10` | no | operation = `border` | Border width (**descriptor**) |
| borderHeight | number | `10` | no | operation = `border` | Border height (**descriptor**) |
| borderColor | color | `#000000` | no | operation = `border` | Border color (**descriptor**) |

### `composite` options

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| dataPropertyNameComposite | string | `''` | no | operation = `composite` | Binary property name of image to composite on top (e.g., `data2`) (**descriptor**) |
| operator | options | `Over` | no | operation = `composite` | Composite operator: `Add` \| `Atop` \| `Bumpmap` \| `Copy` \| `CopyBlack` \| `CopyBlue` \| `CopyCyan` \| `CopyGreen` \| `CopyMagenta` \| `CopyOpacity` \| `CopyRed` \| `CopyYellow` \| `Difference` \| `Divide` \| `In` \| `Minus` \| `Multiply` \| `Out` \| `Over` \| `Plus` \| `Subtract` \| `Xor` (**descriptor**) |
| positionX | number | `0` | no | operation = `composite` | X offset (**descriptor**) |
| positionY | number | `0` | no | operation = `composite` | Y offset (**descriptor**) |

### `crop` options

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| width | number | `500` | no | operation = `crop` | Crop width (**descriptor**) |
| height | number | `500` | no | operation = `crop` | Crop height (**descriptor**) |
| positionX | number | `0` | no | operation = `crop` | X position to crop from (**descriptor**) |
| positionY | number | `0` | no | operation = `crop` | Y position to crop from (**descriptor**) |

### `resize` options

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| width | number | `500` | no | operation = `resize` | New width (**descriptor**) |
| height | number | `500` | no | operation = `resize` | New height (**descriptor**) |
| resizeOption | options | `maximumArea` | no | operation = `resize` | `ignoreAspectRatio` (`!`) \| `maximumArea` (`@`) \| `minimumArea` (`^`) \| `onlyIfSmaller` (`<`) \| `onlyIfLarger` (`>`) \| `percent` (`%`) (**descriptor**) |

### `rotate` options

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| rotate | number | (required) | yes | operation = `rotate` | Degrees to rotate (**descriptor**) |
| backgroundColor | color | (transparent) | no | operation = `rotate` | Background color for uncovered areas (**descriptor**) |

### `shear` options

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| degreesX | number | (required) | yes | operation = `shear` | Shear X degrees (**descriptor**) |
| degreesY | number | (required) | yes | operation = `shear` | Shear Y degrees (**descriptor**) |

### `transparent` options

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| color | color | (required) | yes | operation = `transparent` | Color to make transparent (**descriptor**) |

### Output options (applies to all operations)

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| format | options | (from input / `png` for create) | no | — | Output format: `png` \| `jpg` \| `jpeg` \| `gif` \| `webp` \| `tiff` \| `bmp` (**descriptor**) |
| quality | number | `100` | no | — | Quality 0–100 (lossy formats) (**descriptor**) |
| fileName | string | (preserve input name with new ext) | no | — | Output file name (**descriptor**) |

## Runtime behavior

### Input

- Each input item may contain binary image data at `item.binary[binaryPropertyName]` (default `data`).
- For `create`: no input binary required; generates a new image.
- For `composite`: requires a second binary image at `item.binary[dataPropertyNameComposite]`.
- Multiple operations can be chained; they execute in the order listed in the node UI (single operation per node execution in n8n v1).

### Output

- One output item per input item.
- Output binary written to `item.binary[binaryPropertyName]` (same property name as input, default `data`).
- Output JSON is empty `{}` unless `continueOnFail` triggers error output.
- Binary metadata updated: `mimeType` = `image/<format>`, `fileExtension` = `<format>`, `fileName` updated per `fileName` option or input name with new extension.

### Operation semantics

**Create**: Generates a new image of specified `width` × `height` filled with `backgroundColor`. Sets output format to `png` if not specified.

**Blur**: Applies Gaussian blur with `blur` radius (0–1000) and `sigma` (0–1000). Both parameters are honored per spec; `blur` controls radius, `sigma` controls Gaussian deviation.

**Border**: Adds border of `borderWidth` × `borderHeight` in `borderColor` around the image.

**Composite**: Composites the image from `dataPropertyNameComposite` onto the input image using `operator` at offset (`positionX`, `positionY`). Geometry string format: `(±)X(±)Y`.

**Crop**: Crops to `width` × `height` starting at (`positionX`, `positionY`).

**Draw**: Draws `primitive` (`circle`, `line`, `rectangle`) in `color` from (`startPositionX`, `startPositionY`) to (`endPositionX`, `endPositionY`). Rectangle supports `cornerRadius`.

**Resize**: Resizes to `width` × `height` using `resizeOption` modifier:
- `ignoreAspectRatio` (`!`) — exact dimensions
- `maximumArea` (`@`) — fit within dimensions (default)
- `minimumArea` (`^`) — fill dimensions
- `onlyIfSmaller` (`<`) — shrink only
- `onlyIfLarger` (`>`) — enlarge only
- `percent` (`%`) — width/height as percentage

**Rotate**: Rotates by `rotate` degrees; fills background with `backgroundColor` (transparent if omitted).

**Shear**: Applies affine shear transform by `degreesX` (X-axis shear) and `degreesY` (Y-axis shear). Both parameters are required.

**Text**: Renders `text` at (`positionX`, `positionY`) with `fontSize`, `fontColor`, wrapping at `lineLength` characters. Auto-selects Arial-family font if available.

**Transparent**: Makes pixels matching `color` transparent (color-key / alpha channel replacement via GraphicsMagick `transparent()`). Not a passthrough — matching pixels become fully transparent (alpha = 0).

### Errors

- Missing input binary for non-create operations → `NodeOperationError` (assert binary data).
- Missing composite binary → `NodeOperationError`.
- Font not found for text operation → `NodeOperationError` ("Default font not found. Select a font from the options.").
- On error with `continueOnFail`: emits `{ json: { error: <message> }, pairedItem: { item: <index> } }` per failed item.

### Expressions

- All string/number parameters accept expressions where UI exposes them.
- `binaryPropertyName` and `dataPropertyNameComposite` are string parameters (expression-capable).
- `format`, `quality`, `fileName` accept expressions.

## Acceptance tests

### Test: create image

**Given** input items:
```json
[{ "json": {} }]
```

**Parameters:**
```json
{
  "operation": "create",
  "width": 100,
  "height": 50,
  "backgroundColor": "#ff0000ff"
}
```

**Expect** output[0]:
```json
[{
  "json": {},
  "binary": {
    "data": { "mimeType": "image/png", "fileExtension": "png", "fileName": "image.png" }
  }
}]
```
(*binary.data.data contains a 100×50 red PNG*)

---

### Test: blur image

**Given** input items:
```json
[{
  "json": {},
  "binary": {
    "data": { "data": "<base64 of test image>", "mimeType": "image/png", "fileName": "test.png" }
  }
}]
```

**Parameters:**
```json
{
  "operation": "blur",
  "blur": 10,
  "sigma": 5
}
```

**Expect** output[0]:
```json
[{
  "json": {},
  "binary": {
    "data": { "mimeType": "image/png", "fileExtension": "png", "fileName": "test.png" }
  }
}]
```
(*binary.data.data contains blurred version with radius 10, sigma 5*)

---

### Test: shear image

**Given** input items:
```json
[{
  "json": {},
  "binary": {
    "data": { "data": "<base64 200x200>", "mimeType": "image/png", "fileName": "test.png" }
  }
}]
```

**Parameters:**
```json
{
  "operation": "shear",
  "degreesX": 15,
  "degreesY": 10
}
```

**Expect** output[0] binary.data = sheared image (affine transform X=15°, Y=10°).

---

### Test: add border

**Given** input items:
```json
[{
  "json": {},
  "binary": {
    "data": { "data": "<base64>", "mimeType": "image/png", "fileName": "test.png" }
  }
}]
```

**Parameters:**
```json
{
  "operation": "border",
  "borderWidth": 5,
  "borderHeight": 5,
  "borderColor": "#000000"
}
```

**Expect** output[0] binary.data dimensions = original + 10px each axis.

---

### Test: composite image

**Given** input items:
```json
[{
  "json": {},
  "binary": {
    "data": { "data": "<base64 bg>", "mimeType": "image/png", "fileName": "bg.png" },
    "data2": { "data": "<base64 fg>", "mimeType": "image/png", "fileName": "fg.png" }
  }
}]
```

**Parameters:**
```json
{
  "operation": "composite",
  "dataPropertyNameComposite": "data2",
  "operator": "Over",
  "positionX": 10,
  "positionY": 20
}
```

**Expect** output[0] binary.data = bg with fg composited at (10,20) using Over operator.

---

### Test: crop image

**Given** input items:
```json
[{
  "json": {},
  "binary": {
    "data": { "data": "<base64 200x200>", "mimeType": "image/png", "fileName": "test.png" }
  }
}]
```

**Parameters:**
```json
{
  "operation": "crop",
  "width": 100,
  "height": 100,
  "positionX": 50,
  "positionY": 50
}
```

**Expect** output[0] binary.data = 100×100 crop from (50,50).

---

### Test: draw rectangle

**Given** input items:
```json
[{
  "json": {},
  "binary": {
    "data": { "data": "<base64>", "mimeType": "image/png", "fileName": "test.png" }
  }
}]
```

**Parameters:**
```json
{
  "operation": "draw",
  "primitive": "rectangle",
  "color": "#ff000080",
  "startPositionX": 10,
  "startPositionY": 10,
  "endPositionX": 100,
  "endPositionY": 80,
  "cornerRadius": 5
}
```

**Expect** output[0] binary.data has semi-transparent red rounded rectangle drawn.

---

### Test: add text

**Given** input items:
```json
[{
  "json": {},
  "binary": {
    "data": { "data": "<base64>", "mimeType": "image/png", "fileName": "test.png" }
  }
}]
```

**Parameters:**
```json
{
  "operation": "text",
  "text": "Hello\nWorld",
  "fontSize": 24,
  "fontColor": "#ffffff",
  "positionX": 50,
  "positionY": 50,
  "lineLength": 10
}
```

**Expect** output[0] binary.data has "Hello" and "World" rendered on separate lines.

---

### Test: resize with aspect ratio

**Given** input items:
```json
[{
  "json": {},
  "binary": {
    "data": { "data": "<base64 400x300>", "mimeType": "image/png", "fileName": "test.png" }
  }
}]
```

**Parameters:**
```json
{
  "operation": "resize",
  "width": 200,
  "height": 200,
  "resizeOption": "maximumArea"
}
```

**Expect** output[0] binary.data = 200×150 (fits within 200×200 preserving aspect).

---

### Test: rotate with background

**Given** input items:
```json
[{
  "json": {},
  "binary": {
    "data": { "data": "<base64>", "mimeType": "image/png", "fileName": "test.png" }
  }
}]
```

**Parameters:**
```json
{
  "operation": "rotate",
  "rotate": 45,
  "backgroundColor": "#ffffffff"
}
```

**Expect** output[0] binary.data rotated 45° with white background fill.

---

### Test: shear image

**Given** input items:
```json
[{
  "json": {},
  "binary": {
    "data": { "data": "<base64>", "mimeType": "image/png", "fileName": "test.png" }
  }
}]
```

**Parameters:**
```json
{
  "operation": "shear",
  "degreesX": 15,
  "degreesY": 10
}
```

**Expect** output[0] binary.data sheared 15° on X-axis and 10° on Y-axis.

---

### Test: make color transparent (color-key / alpha)

**Given** input items:
```json
[{
  "json": {},
  "binary": {
    "data": { "data": "<base64 with white bg>", "mimeType": "image/png", "fileName": "test.png" }
  }
}]
```

**Parameters:**
```json
{
  "operation": "transparent",
  "color": "#ffffff"
}
```

**Expect** output[0] binary.data has pixels matching `#ffffff` made fully transparent (alpha = 0). Not a passthrough — color-key replacement via GraphicsMagick `transparent()`.

---

### Test: continueOnFail on missing binary

**Given** input items:
```json
[{ "json": { "foo": "bar" } }]
```

**Parameters:**
```json
{
  "operation": "blur",
  "blur": 5
}
```
**Node setting:** `continueOnFail: true`

**Expect** output[0]:
```json
[{
  "json": { "error": "No binary data exists on item..." },
  "pairedItem": { "item": 0 }
}]
```

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Operations + parameter names/enums/defaults | documented + descriptor | Confirmed by `EditImage.node.js` schema (v2.15.1) |
| Composite operator enum (19 values) | descriptor | Full list from schema |
| Resize option modifiers (`!`, `@`, `^`, `<`, `>`, `%`) | descriptor | Mapped from GraphicsMagick geometry |
| Font auto-selection (Arial fallback) | descriptor | `get-system-fonts` scans for `Arial.` |
| Text line-wrapping algorithm | inferred | Descriptor splits on space, wraps at `lineLength` |
| Output `pairedItem` shape | inferred | Standard n8n item linking |
| Binary property name default = `data` | descriptor | |
| Multiple operations per node execution | gap | n8n v1 shows single operation per node; UI may allow chaining but descriptor shows single `operation` enum |

## OpenFlow mapping

- **Definition group:** `transform`
- **Executor file:** `src/lib/engine/executors/editImage.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
- **Notes:** Image processing should use a GraphicsMagick/ImageMagick-compatible library available to the OpenFlow engine (e.g., `gm` or `sharp`). Binary data handling via `ExecutionContext` helpers (`getBinaryData`, `prepareBinaryData`, `assertBinaryData`). Never load third-party workflow node packages.