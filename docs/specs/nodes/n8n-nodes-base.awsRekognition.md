---
type: n8n-nodes-base.awsRekognition
displayName: AWS Rekognition
category: Development
versions: [1]
priority: medium
status: specced
---

# AWS Rekognition

## Sources

| URL | Source class |
|-----|--------------|
| https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.awsrekognition/ | Public docs only |
| https://docs.n8n.io/integrations/builtin/credentials/aws/ | Public docs only |
| https://docs.aws.amazon.com/rekognition/latest/dg/what-is.html | Public docs only |

## Wire format

- **Type string:** `n8n-nodes-base.awsRekognition`
- **Aliases:** (none)
- **Inputs:** `main` × 1
- **Outputs:** `main` × 1
- **Credentials:** `aws` (IAM access-key) or `awsAssumeRole` (IAM assumed-role) — shared AWS credentials as documented at https://docs.n8n.io/integrations/builtin/credentials/aws/

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| authentication | `select` | `iam` | yes | | Auth strategy: `iam` (access key + secret key) or `assumeRole` (cross-account IAM role) |
| resource | `select` | `image` | yes | | Only supported resource |
| operation | `select` | `analyze` | yes | show: resource=image | Only supported operation |
| type | `select` | `detectLabels` | yes | show: operation=analyze, resource=image | Analysis type. Values: `detectFaces`, `detectLabels`, `detectModerationLabels`, `detectText`, `recognizeCelebrity`. Accepts expressions. |
| binaryData | `boolean` | false | no | show: operation=analyze, resource=image | Whether the source image is provided via a binary-data field on the input item |
| binaryPropertyName | `string` | `data` | no | show: operation=analyze, resource=image, binaryData=true | Name of the binary property containing the image bytes |
| bucket | `string` | — | required* | show: operation=analyze, resource=image, binaryData=false | S3 bucket name containing the image (*required when binaryData=false) |
| name | `string` | — | required* | show: operation=analyze, resource=image, binaryData=false | S3 object key of the image (*required when binaryData=false) |
| additionalFields | `object` | `{}` | no | show: operation=analyze, resource=image | Optional analysis configuration (see below) |

### additionalFields properties

| name | type | default | notes |
|------|------|---------|-------|
| regionsOfInterest | `array` | — | Regions of interest for DetectText; each entry is `{regionOfInterest: {boundingBox: {top, left, width, height}}}` |
| version | `string` | — | Model version to use for detectLabels |
| wordFilter | `string` | — | Filter string for DetectText (return only words matching the filter) |
| maxLabels | `number` | — | Maximum number of labels to return (detectLabels) |
| minConfidence | `number` | — | Minimum confidence threshold (0–100) for returned predictions |
| attributes | `string[]` | — | Face attributes to return when type=detectFaces: `all` (all facial attributes) or `default` (bounding box, confidence, landmarks, pose, quality, emotions) |

## Runtime behavior

### Image source

The node accepts an image in one of two mutually exclusive ways:
1. **Binary data mode** (`binaryData=true`): The input item must carry a binary property (named by `binaryPropertyName`, default `data`) whose buffer content is the raw image bytes (JPEG, PNG, etc.). The node passes the bytes directly to the AWS Rekognition API.
2. **S3 reference mode** (`binaryData=false`): The node reads the image from the S3 bucket + object key specified by `bucket` and `name`. These values may be expressions referencing input data.

### API dispatch

Based on the `type` parameter, the node calls a single AWS Rekognition API action:
- `detectLabels` → POST DetectLabels
- `detectFaces` → POST DetectFaces
- `detectModerationLabels` → POST DetectModerationLabels
- `detectText` → POST DetectText
- `recognizeCelebrity` → POST RecognizeCelebrities

All API calls use AWS Signature V4 signing via the configured credentials.

### Output

Each input item produces exactly one output item. The output item retains the original input `json` data and adds a top-level property (name determined by the executor, typically `rekognitionResult` or similar) containing the full API response envelope as returned by the AWS Rekognition service. The response shape varies by analysis type and mirrors the corresponding AWS API response:
- **detectLabels**: `Labels[]` array with `Name`, `Confidence`, `Categories`, `Parents`, `Aliases`, `Instances`
- **detectFaces**: `FaceDetails[]` array with `BoundingBox`, `Confidence`, `Landmarks`, `Pose`, `Quality`, `Emotions`, `AgeRange`, `Gender`, `Eyeglasses`, `Sunglasses`, `Beard`, `Mustache`, `EyesOpen`, `MouthOpen`, `Smile`
- **detectModerationLabels**: `ModerationLabels[]` array with `Name`, `Confidence`, `ParentName`
- **detectText**: `TextDetections[]` array with `DetectedText`, `Type` (LINE/WORD), `Confidence`, `Id`, `ParentId`, `Geometry`
- **recognizeCelebrity**: `CelebrityFaces[]` array with `Name`, `Id`, `Urls`, `MatchConfidence`, `Face` (BoundingBox, Confidence, Landmarks, Pose, Quality, Emotions); plus an `UnrecognizedFaces[]` array

Binary data from the input is propagated to the output unchanged.

### Errors

- If the AWS Rekognition API returns an error (AccessDenied, InvalidParameter, ImageTooLarge, etc.), the node throws an exception.
- If `continueOnFail` is enabled on the node, the input item is passed through to output with an `error` property instead of throwing.
- Missing binary data when `binaryData=true` produces a clear validation error.
- Missing `bucket` or `name` when `binaryData=false` produces a clear validation error.

### Expressions

All parameter values accept expression strings.

## Acceptance tests

### Test: detect labels from S3 image

**Given** input items:

```json
[{ "json": { "bucketName": "my-photos", "objectKey": "vacation/beach.jpg" } }]
```

**Parameters:**

```json
{
  "resource": "image",
  "operation": "analyze",
  "type": "detectLabels",
  "binaryData": false,
  "bucket": "={{ $json.bucketName }}",
  "name": "={{ $json.objectKey }}"
}
```

**Expect** output[0]:

```json
[{
  "json": {
    "bucketName": "my-photos",
    "objectKey": "vacation/beach.jpg",
    "rekognitionResult": {
      "Labels": [
        { "Name": "Beach", "Confidence": 99.5, "Categories": [], "Parents": [] }
      ]
    }
  }
}]
```

### Test: detect faces with all attributes via binary data

**Given** input items:

```json
[{ "json": {}, "binary": { "data": { "mimeType": "image/jpeg", "data": "<base64-encoded-bytes>" } } }]
```

**Parameters:**

```json
{
  "resource": "image",
  "operation": "analyze",
  "type": "detectFaces",
  "binaryData": true,
  "additionalFields": { "attributes": ["all"] }
}
```

**Expect** output[0]:

```json
[{
  "json": {
    "rekognitionResult": {
      "FaceDetails": [
        {
          "BoundingBox": { "Width": 0.2, "Height": 0.3, "Left": 0.1, "Top": 0.2 },
          "Confidence": 99.9,
          "Landmarks": [{ "Type": "eyeLeft", "X": 0.2, "Y": 0.3 }]
        }
      ]
    }
  }
}]
```

### Test: moderate image content

**Given** input items:

```json
[{ "json": { "bucket": "content-bucket", "key": "uploads/img001.jpg" } }]
```

**Parameters:**

```json
{
  "resource": "image",
  "operation": "analyze",
  "type": "detectModerationLabels",
  "binaryData": false,
  "bucket": "={{ $json.bucket }}",
  "name": "={{ $json.key }}"
}
```

**Expect** output[0]:

```json
[{
  "json": {
    "bucket": "content-bucket",
    "key": "uploads/img001.jpg",
    "rekognitionResult": {
      "ModerationLabels": [
        { "Name": "Explicit Nudity", "Confidence": 85.2, "ParentName": "Explicit" }
      ]
    }
  }
}]
```

### Test: detect text from binary image

**Given** input items:

```json
[{ "json": {}, "binary": { "photo": { "mimeType": "image/png", "data": "<base64-bytes>" } } }]
```

**Parameters:**

```json
{
  "resource": "image",
  "operation": "analyze",
  "type": "detectText",
  "binaryData": true,
  "binaryPropertyName": "photo"
}
```

**Expect** output[0]:
```json
[{
  "json": {
    "rekognitionResult": {
      "TextDetections": [
        { "DetectedText": "HELLO", "Type": "LINE", "Confidence": 98.7, "Id": 0 }
      ]
    }
  }
}]
```

### Test: error on missing bucket

**Given** input items:

```json
[{ "json": {} }]
```

**Parameters:**

```json
{
  "resource": "image",
  "operation": "analyze",
  "type": "detectLabels",
  "binaryData": false
}
```

**Expect:** node throws `NodeOperationError` with message indicating bucket is required when binaryData is false. If `continueOnFail` is enabled, the item passes through with `error` property.

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Resource/operation names | Public docs | Single resource (`image`) with single operation (`analyze`) confirmed by docs.n8n.io |
| Analysis types | Confirmed from corpus schema | `detectFaces`, `detectLabels`, `detectModerationLabels`, `detectText`, `recognizeCelebrity` — extracted from the Zod schema file as parameter enums |
| S3 vs binary input split | Confirmed from corpus schema | Conditionally-required fields (`bucket`/`name` vs `binaryPropertyName`) |
| additionalFields structure | Confirmed from corpus schema | `regionsOfInterest`, `version`, `wordFilter`, `maxLabels`, `minConfidence`, `attributes` |
| Exact response shapes | Inferred from AWS public API docs | Verified against the AWS Rekognition Developer Guide |
| Credential authentication values | Inferred from AWS shared credential type | `iam` and `assumeRole` match the standard n8n AWS credential pattern |
| default analysis type | Inferred from corpus schema defaults | `detectLabels` is the default `type` value |

## OpenFlow mapping

- **Definition group:** `core`
- **Executor file:** `src/lib/engine/executors/awsRekognition.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only
