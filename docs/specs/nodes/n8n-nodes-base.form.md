---
type: n8n-nodes-base.form
displayName: n8n Form
category: Helpers
versions: [1]
priority: high
status: specced
---

# n8n Form

## Sources

| URL | Source class |
|-----|----------------|
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.form.md | Public docs only |
| https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.formtrigger.md | Public docs only (companion trigger) |
| Public node descriptor metadata (aliases, categories, nodeVersion) | Public descriptor metadata |

## Wire format

- **Type string:** `n8n-nodes-base.form`
- **Aliases:** `_Form`, `form`, `table`, `submit`, `post`, `page`, `step`, `stage`, `multi` (**documented** in public descriptor metadata)
- **Categories:** `Core Nodes` (subcategory `Helpers`) (**documented** in descriptor metadata)
- **Inputs:** `main` × 1 — receives one or more items from the upstream node; each item triggers rendering and display of this form page
- **Outputs:** `main` × 1 — passes through the input items unchanged after the form page has been displayed
- **Credentials:** none

## Parameters

| name | type | default | required | displayOptions | notes |
|------|------|---------|----------|----------------|-------|
| operation | options | `form` | no | — | `form` (default — show an intermediate form page) or `completion` (show a form-ending page) (**documented**) |
| formFields | fixedCollection | — | no | operation = `form` | Ordered list of field definitions for this form page (**documented**) |
| formTitle | string | — | no | operation = `form` | Overrides the Form Trigger's title for this page only (**documented** via trigger node parallelism) |
| formDescription | string | — | no | operation = `form` | Overrides the Form Trigger's description for this page only (**documented** via trigger node parallelism) |
| completionTitle | string | — | no | operation = `completion` | `h1` title on the completion/ending page (**documented**) |
| completionMessage | string | — | no | operation = `completion` | Subtitle below the `h1`; supports `\n` or `<br>` for line breaks (**documented**) |
| completionPageTitle | string | — | no | operation = `completion` | Browser tab title for the completion page (**documented**) |
| options.formTitle | string | — | no | — | Same as top-level formTitle; exposed under Node Options (**documented**) |
| options.formDescription | string | — | no | — | Same as top-level formDescription; exposed under Node Options (**documented**) |
| options.buttonLabel | string | — | no | — | Label for the submit button on this page (**documented**) |
| options.completionPageTitle | string | — | no | operation = `completion` | Same as top-level completionPageTitle; exposed under Node Options (**documented**) |

### Form ending modes (`operation = completion`)

When **operation** is `completion`, the **On n8n Form Submission** parameter selects how the form ends (**documented**):

| mode | description | key parameters |
|------|-------------|----------------|
| completion | Show a completion screen | `completionTitle`, `completionMessage`, `completionPageTitle` |
| redirect | Redirect to an external URL | `redirectUrl` |
| showText | Display arbitrary HTML/text | `text` (HTML or plain text; allows `<script>`, `<style>`, `<input>`) |
| returnBinary | Return a binary file to the user | `completionTitle`, `completionMessage`, `inputDataFieldName` (binary property name) |

### Form field shape (`formFields` entries)

Each field in the `formFields` fixedCollection defines one input element (**documented**):

| name | type | default | required | notes |
|------|------|---------|----------|-------|
| fieldLabel | string | — | yes | Label shown above the input |
| fieldName | string | — | yes | Key used for this field's value in the node output; used to reference the field in expressions |
| fieldType | options | `text` | no | `checkbox`, `date`, `dropdown`, `email`, `file`, `hiddenField`, `html`, `number`, `password`, `radio`, `text`, `textarea` (**documented**) |
| placeholder | string | — | no | Sample text inside the input; supported for `email`, `number`, `password`, `text`, `textarea` only |
| defaultValue | string | — | no | Pre-filled / pre-selected value; supported for `checkbox`, `date`, `dropdown`, `email`, `number`, `radio`, `text`, `textarea` only |
| requiredField | boolean | false | no | Mark the field as mandatory |
| fieldOptions | fixedCollection | — | no | Options for `dropdown`, `checkbox`, `radio` — contains `values` array of `{ option: string }` objects |
| multipleFiles | boolean | false | no | When `fieldType = file`, allow selecting multiple files (**documented**) |
| acceptFileTypes | string | — | no | When `fieldType = file`, comma-separated list of allowed file extensions (e.g. `.jpg, .png`) (**documented**) |
| multiselect | boolean | false | no | When `fieldType = dropdown`, allow multiple selections (**documented**) |
| formatDate | string | — | no | When `fieldType = date`, the date format string (e.g. `mm/dd/yyyy`) (**documented**) |
| html | string | — | no | When `fieldType = html`, the custom HTML content to display; `<script>`, `<style>`, `<input>` are stripped (**documented**) |
| elementName | string | — | no | When `fieldType = html`, if set the raw HTML is included in the node output under this key (**documented**) |
| fieldValue | string | — | no | When `fieldType = hiddenField`, the default value for the hidden field (**documented**) |

### Define Form using JSON

As an alternative to the structured `formFields` collection, the node may support a **Define Form** parameter with mode `usingJson`, where the user provides a JSON array of field objects using the same keys as above (**documented**).

## Runtime behavior

### Input

The node receives items from the upstream node (which may be a Form Trigger or any node processing submitted data). Each input item causes this form page to be displayed in sequence.

- When the item arrives, the engine renders the form page (defined by `formFields`) and the user completes/submits it.
- The field values filled in by the user for this page are merged into the existing item data and passed to the next downstream node.
- The output item(s) contain the cumulative form data (initial trigger values plus all submitted page values), keyed by `fieldName`.

### Output

The node outputs the same items it received, with each item's `json` updated to include the submitted field values for this page. The output shape for a page with fields `name` (text) and `age` (number):

```json
{
  "name": "Jane Doe",
  "age": 42,
  "...": "..."
}
```

When `operation = completion`, the output item is the final accumulated data. No further form pages follow.

### Form Ending behavior

- **Only one** Form Ending (`operation = completion`) node per execution produces the final response, even when multiple branches contain Form Ending nodes (**documented**).
- When multiple branches receive data (e.g. from a Switch node), branches execute sequentially. The Form Ending node in the **last executed branch** determines the final response; all prior Form Ending nodes in earlier branches are ignored (**documented**).
- Under **Return Binary File** mode, the node reads a binary property from the input item (named by `inputDataFieldName`) and serves it as the HTTP response to the form submitter (**documented**).

### Query parameter defaults

- Field initial values can be set via query parameters on the form URL, exactly as documented for the Form Trigger node (**documented**).
- **Production mode only.** In testing mode, query parameters do not populate field values.
- Every page in the form receives the same query parameters sent to the Form Trigger URL.
- Field names/values with special characters must be percent-encoded.

### Custom HTML sanitization

HTML in `formDescription` (when set on the Form node page) and `html`-type fields is sanitized per the same rules as the Form Trigger. For the `showText` form-ending mode, however, no HTML sanitization is applied (**documented**).

### Errors

- The node does not throw errors for missing or invalid field configurations at runtime; configuration errors surface at design time.
- If the upstream node produces zero items, the form page is never rendered.
- `continueOnFail` is not applicable — the node does not fail based on field validation (field-level validation is client-side for required fields).

### Expressions

`formTitle`, `formDescription`, `completionTitle`, `completionMessage`, `text` (showText mode), `redirectUrl`, and `options.buttonLabel` accept expression strings. Field labels, names, and types are typically static.

## Acceptance tests

### Test: single-field form page passes through and merges field value

**Given** an input item from the Form Trigger:

```json
[{ "json": { "email": "a@b.com", "submittedAt": "2026-07-30T12:00:00.000Z" } }]
```

**Parameters:**

```json
{
  "operation": "form",
  "formFields": [
    { "fieldLabel": "Name", "fieldName": "name", "fieldType": "text", "requiredField": true }
  ]
}
```

**User submits** value `Jane Doe` for the Name field.

**Expect** output[0].json:

```json
{
  "email": "a@b.com",
  "submittedAt": "2026-07-30T12:00:00.000Z",
  "name": "Jane Doe"
}
```

### Test: completion page ends the form

**Given** an input item with accumulated form data:

```json
[{ "json": { "name": "Jane", "feedback": "Great!" } }]
```

**Parameters:**

```json
{
  "operation": "completion",
  "completionTitle": "Thank You",
  "completionMessage": "Your feedback has been received."
}
```

**Expect** output[0].json contains the input data unchanged (the completion page does not add fields):

```json
{
  "name": "Jane",
  "feedback": "Great!"
}
```

The user's browser displays a completion page with `h1` "Thank You" and subtitle "Your feedback has been received." (**documented**).

### Test: multiple form pages accumulate fields

**Page 1 parameters:**

```json
{
  "operation": "form",
  "formFields": [{ "fieldLabel": "Email", "fieldName": "email", "fieldType": "email" }]
}
```

**Page 2 parameters:**

```json
{
  "operation": "form",
  "formFields": [{ "fieldLabel": "Age", "fieldName": "age", "fieldType": "number" }]
}
```

**User submits** `email = a@b.com` on page 1, `age = 30` on page 2.

**Expect** the item reaching the Form Ending node to have:

```json
{
  "email": "a@b.com",
  "age": 30
}
```

### Test: only last Form Ending node responds when multiple branches execute

Given a workflow with a Switch node feeding two branches, each ending in a Form Ending node:

- Branch A ending: `completionTitle = "Done A"`
- Branch B ending: `completionTitle = "Done B"`

When both branches receive data (sequential execution), only the Form Ending in the **last executed branch** produces the final HTTP response. The earlier branch's Form Ending is ignored (**documented**).

### Test: hidden field passes through without display

**Parameters:** form page with a `hiddenField` type:

```json
{
  "operation": "form",
  "formFields": [{ "fieldLabel": "ref", "fieldName": "refId", "fieldType": "hiddenField", "fieldValue": "abc-123" }]
}
```

**Expect:** the rendered form does not display the hidden field. The output item includes `"refId": "abc-123"` (**documented**).

## Gaps / confidence

| Topic | documented / inferred | Notes |
|-------|----------------------|-------|
| Type string, aliases, categories | documented (descriptor) | `n8n-nodes-base.form`; aliases include `_Form`/`form`/`table`/`submit`/`post`/`page`/`step`/`stage`/`multi`; category `Core Nodes` / `Helpers` |
| `operation` param and enum values | documented | `form` and `completion` confirmed from public workflow JSON in docs |
| Form-ending sub-modes (completion/redirect/showText/returnBinary) | documented | Documented as "Show Completion Screen" / "Redirect to URL" / "Show Text" / "Return Binary File" |
| `formFields` field shape | documented | All 13 fieldType values, placeholder, defaultValue, requiredField, fieldOptions, and type-specific keys documented |
| JSON-defined form fields | documented | "Define Form > Using JSON" documented with full example |
| Wire parameter names (`operation`, `formFields`, `completionTitle`, etc.) | inferred | Public workflow JSON shows `operation`, `completionTitle`, `formFields.values`, `options` — consistent with SDK conventions |
| `completionMessage` wire name | inferred | UI label "Completion Message" documented; wire name `completionMessage` inferred |
| `redirectUrl` wire name | inferred | UI label "URL" documented; wire name `redirectUrl` inferred |
| `text` param for showText mode | documented | "Text" field for arbitrary HTML/plain text |
| `inputDataFieldName` for returnBinary | documented | "Input Data Field Name" — the binary property containing the file to return |
| Versions | inferred | Descriptor `nodeVersion` 1.0; only v1 observed in public workflow JSON examples |
| Whether defineForm/json mode is a separate param or implicit | inferred | Docs describe a "Define Form" selector with "Using JSON" option; exact wire shape not confirmed beyond the JSON array example |
| Form-Ending `showText` no-sanitization rule | documented | Docs explicitly state `script`, `style`, `input` are allowed when using Show Text ending |

## OpenFlow mapping

- **Definition group:** `helpers`
- **Executor file:** `src/lib/engine/executors/form.ts`
- **SDK:** `defineNode` + native `ExecutionContext` only