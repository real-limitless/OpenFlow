---
type: n8n-nodes-base.formTrigger
displayName: n8n Form
category: Triggers
versions: [1, 2]
priority: high
status: specced
---

# n8n Form (Form Trigger)

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.formtrigger.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.form.md | Public docs only (continuation page partner) |
| Public node descriptor metadata (categories, aliases, nodeVersion) | Public descriptor metadata |

## Wire format

- **Type string:** `n8n-nodes-base.formTrigger`
- **Aliases:** `table`, `submit`, `post` (**documented** in public descriptor metadata)
- **Categories:** `Core Nodes` (subcategory `Other Trigger Nodes`) (**documented** in descriptor metadata)
- **Inputs:** none (trigger node — starts a workflow when a user submits a form)
- **Outputs:** `main` × 1
- **Credentials:** optional — Basic auth credential, or `none` (**documented**)

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| formTitle | string | — | yes | — | Webpage title and main `h1` heading on the rendered form (**documented**) |
| formDescription | string | — | no | — | Subtitle below the `h1`; `\n` or `<br>` for line breaks; HTML sanitized (**documented**) |
| formPath | string | auto-generated UUID | no | — | Custom slug = final URL segment for both test and production; replaces the UUID (**documented**) |
| formElements | fixedCollection | — | yes | — | Ordered list of form fields; each entry shaped by `elementType` (see below) (**documented**) |
| responseMode | options | formSubmitted | no | — | `formSubmitted` / `workflowFinishes` (**documented** UI labels "Form Is Submitted" / "Workflow Finishes"; wire enum strings inferred) |
| authentication | options | none | no | — | `none` / `basicAuth` (**documented** UI labels "None" / "Basic Auth"; wire enum strings inferred) |
| options.appendAttribution | boolean | true | no | — | "Append n8n Attribution"; turn off to hide the **Form automated with n8n** footer (**documented**) |
| options.buttonLabel | string | — | no | — | Submit button label (**documented**) |
| options.formPath | string | — | no | — | Same field exposed under Node Options; final URL segment replacing the UUID (**documented**) |
| options.ignoreBots | boolean | false | no | — | Drop requests from bots / link previewers / web crawlers (**documented**) |
| options.useWorkflowTimezone | boolean | false | no | — | Use the Workflow settings timezone instead of UTC (default); affects `submittedAt` in the output (**documented**) |
| options.customFormStyling | string | — | no | — | CSS to override the default public-form styling; pre-populated with the default CSS (**documented**) |
| options.formSubmittedText | string | — | no | responseMode = formSubmitted | Response text shown after submission when Respond When = Form Is Submitted; supports HTML / `<br>` (**documented**) |

### Form element shape (`formElements` entries)

Every field has (**documented**):

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| fieldLabel | string | — | yes | Label shown above the input on the rendered form |
| fieldName | string | — | yes | Key used for this field's value in the node output; used to reference the field downstream |
| elementType | options | — | yes | One of the element types below |
| placeholder | string | — | no | Sample text inside compatible elements (Email, Number, Password, Text, Textarea) |
| defaultValue | string | — | no | Pre-filled / pre-selected value; supported in all elements except Custom HTML, File, Hidden Field, Password |
| requiredField | boolean | false | no | Require the user to complete this field |

**`elementType` enum** (**documented** UI labels; wire strings inferred): `checkboxes`, `customHtml`, `date`, `dropdown`, `email`, `file`, `hidden`, `number`, `password`, `radio`, `text`, `textarea`.

Type-specific options (**documented**):

- **Checkboxes** — `limitSelection` options: `exactNumber` / `range` / `unlimited` (default). Default is no limit.
- **Custom HTML** — `html` (arbitrary HTML; sanitized). Not included in output unless `elementName` is set.
- **Date** — date picker; values formatted per Luxon date/time handling.
- **Dropdown** — single-choice by default; `multipleChoice` boolean enables multi-choice. Options added via "Add Field Option".
- **Hidden Field** — not displayed; `fieldValue` sets a default, or values passed via query parameters.
- **Radio Buttons** — single-choice radio group.

## Runtime behavior

### Trigger registration

The node generates a form web page and exposes two URLs shown at the top of the node panel (**documented**):

- **Test URL:** registered when the user selects **Execute Step** or **Execute Workflow** (with the workflow inactive). Submitting the form runs the node (Execute Step) or the whole workflow (Execute Workflow); incoming data is visible in the editor.
- **Production URL:** registered when the workflow is published/active. Submissions run automatically; data is **not** shown in the editor (viewable under the workflow's **Executions** tab).

The form is served at `/form/<formPath>` (or `/form/<auto-generated-UUID>` when `formPath` is unset).

### Input

An inbound form submission starts the workflow. The submission is mapped to a single output item whose `json` contains (**documented** capability; key set partially documented):

```json
{
  "<fieldName>": "<submitted value>",
  "...": "...",
  "submittedAt": "2026-07-29T19:32:40.000Z"
}
```

- Each form field's value is keyed by its **Field Name** (**documented**).
- `submittedAt` — ISO timestamp of the submission. In UTC by default; uses the Workflow settings timezone when `options.useWorkflowTimezone` is on (**documented**).
- **File** uploads are written to a binary property on the item (**inferred** from item/binary model; binary property name not documented).

### Default values via query parameters

Field initial values can be set via URL query parameters on the form URL (**documented**):

- **Production mode only.** n8n does not populate field values from query parameters in testing mode.
- Every page in a multi-page form receives the same query parameters sent to the Form Trigger URL.
- Field names/values using special characters must be percent-encoded (e.g. `@` → `%40`, space → `%20`).

Example: `https://host/form/my-form?email=jane.doe%40example.com&name=Jane%20Doe`.

### Response to the submitter

Determined by **Respond When** (`responseMode`) (**documented**):

- **Form Is Submitted:** n8n sends a response to the user as soon as the form is submitted. The response text is `options.formSubmittedText` (supports HTML / `<br>` for line breaks).
- **Workflow Finishes:** n8n waits for the workflow to complete before responding. If the workflow errors, n8n sends a response telling the user there was a problem submitting the form.

### HTML security and allowed tags

HTML in **Form Description** and **Custom HTML** elements is automatically sanitized (**documented**):

- **Allowed tags:** `a`, `b`, `br`, `code`, `div`, `em`, `h1`–`h6`, `i`, `iframe`, `img`, `li`, `ol`, `p`, `pre`, `span`, `strong`, `sub`, `sup`, `table`, `tbody`, `td`, `tfoot`, `th`, `thead`, `tr`, `u`, `ul`, `video`, `source`.
- **Restricted (removed) tags:** `script`, `style`, `input`, `form`, `button`, and other XSS-enabling elements.
- **Attribute restrictions:** only specific attributes per tag (e.g. `<a>` → `href`, `target`, `rel`; `<img>` → `src`, `alt`, `width`, `height`; `<iframe>` is automatically sandboxed). Only `http://` and `https://` URL schemes are permitted.

### Errors

As a trigger, the node does not consume upstream items and does not surface `continueOnFail` semantics. Basic-auth failure rejects the request (**inferred**; status code not documented). **Ignore Bots** silently drops bot/crawler/link-previewer requests (no execution). A workflow error under Respond When = Workflow Finishes yields an error response to the submitter rather than a thrown node error (**documented**).

### Expressions

Form configuration (title, description, path, elements) is typically fixed at design time. `options.formSubmittedText` and `options.customFormStyling` may use expressions (**inferred**).

## Acceptance tests

### Test: text field submission maps to output json

**Submission:** form with a single **Text** field, `fieldName` = `name`, value `Jane Doe`.

**Parameters:**

```json
{
  "formTitle": "Sign Up",
  "formElements": [
    { "fieldLabel": "Name", "fieldName": "name", "elementType": "text", "requiredField": true }
  ],
  "responseMode": "formSubmitted"
}
```

**Expect** output[0].json (shape; `submittedAt` value reflects submission time):

```json
{
  "name": "Jane Doe",
  "submittedAt": "2026-07-29T19:32:40.000Z"
}
```

### Test: query parameter defaults (production only)

**Form URL:** `https://host/form/my-form?email=jane.doe%40example.com&name=Jane%20Doe`

**Parameters:** form with fields `name` (Text) and `email` (Email), production URL active.

**Expect:** the form renders with `name` pre-filled `Jane Doe` and `email` pre-filled `jane.doe@example.com` (**documented**). In testing mode the fields are **not** pre-filled from query parameters.

### Test: respond when workflow finishes — error path

**Parameters:**

```json
{
  "formTitle": "T",
  "formElements": [{ "fieldLabel": "A", "fieldName": "a", "elementType": "text" }],
  "responseMode": "workflowFinishes"
}
```

Downstream workflow throws.

**Expect:** the submitter receives a response telling them there was a problem submitting the form (**documented**); the node itself does not swallow the workflow error as a normal output item.

### Test: use workflow timezone affects submittedAt

**Parameters:** `options.useWorkflowTimezone` = `true`; Workflow settings timezone = `America/New_York`.

**Submission** at the instant corresponding to `2026-07-29T15:32:40-04:00` (New York).

**Expect** output[0].json.submittedAt to be expressed in the `America/New_York` timezone (not UTC) (**documented**).

### Test: custom HTML sanitization removes script tags

**Parameters:** a `customHtml` element with `html` = `<p>hi</p><script>alert(1)</script><img src=x onerror=alert(1)>`.

**Expect:** rendered form contains `<p>hi</p>`; the `<script>` tag and the `onerror` attribute are removed during sanitization (**documented**).

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string, aliases, categories | documented (descriptor) | `n8n-nodes-base.formTrigger`; aliases `table`/`submit`/`post`; category `Core Nodes` / `Other Trigger Nodes` |
| Parameter wire names (camelCase) | inferred | Docs expose UI labels only; wire strings (e.g. `formTitle`, `formElements`, `responseMode`) inferred from labels and named consistently with the SDK |
| `responseMode` wire enum strings | inferred | UI labels "Form Is Submitted" / "Workflow Finishes" documented; wire strings `formSubmitted` / `workflowFinishes` inferred |
| `authentication` wire enum strings | inferred | UI labels "None" / "Basic Auth" documented; wire strings `none` / `basicAuth` inferred |
| `elementType` wire enum strings | inferred | UI labels documented; wire strings (e.g. `customHtml`, `hidden`) inferred |
| Output key set | partially documented | Field values keyed by Field Name documented; `submittedAt` documented; other possible keys (e.g. `formMode`, `submissionId`) not in permitted sources |
| File upload binary property name | inferred | File element type documented; binary property name on the output item not documented |
| Basic-auth failure status code | inferred | Auth rejection documented; HTTP status (401/403) not documented |
| Versions ([1, 2]) | inferred | Descriptor `nodeVersion` 1.0 (v1 default); v1 and v2 descriptor directories present in public descriptor metadata |
| `formSubmittedText` default | inferred | Field documented in response-formatting guidance; default text not documented |

## OpenFlow mapping

- **Definition group:** `triggers`
- **Executor file:** `src/lib/engine/executors/formTrigger.ts` (+ server form route registration at `/form/<path>`)
- **SDK:** `defineNode` + native `ExecutionContext` only