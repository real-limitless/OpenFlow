import type { FormField } from "../../lib/forms/path";

const ALLOWED_TAGS = new Set([
  "a",
  "b",
  "br",
  "code",
  "div",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "i",
  "img",
  "li",
  "ol",
  "p",
  "pre",
  "span",
  "strong",
  "sub",
  "sup",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "u",
  "ul",
  "video",
  "source",
]);

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Strip disallowed tags; keep a small allowlist (text-level sanitization). */
export function sanitizeHtml(input: string): string {
  if (!input) return "";
  // Remove script/style blocks entirely
  let html = input
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
    .replace(/on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  // Drop tags not in allowlist
  html = html.replace(/<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g, (full, tag: string) => {
    const t = tag.toLowerCase();
    if (!ALLOWED_TAGS.has(t)) return "";
    if (t === "br") return "<br/>";
    // Strip javascript: urls
    if (/javascript:/i.test(full)) return "";
    return full;
  });
  return html.replace(/\n/g, "<br/>");
}

const DEFAULT_CSS = `
:root { color-scheme: light dark; --bg: #0f1115; --fg: #e8eaed; --muted: #9aa0a6; --card: #1a1d24; --border: #2a2f3a; --primary: #6c8cff; --err: #f87171; }
@media (prefers-color-scheme: light) {
  :root { --bg: #f6f7f9; --fg: #111; --muted: #5f6368; --card: #fff; --border: #e2e5eb; --primary: #3b5bdb; }
}
* { box-sizing: border-box; }
body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif; background: var(--bg); color: var(--fg); line-height: 1.5; }
.of-wrap { max-width: 40rem; margin: 0 auto; padding: 2rem 1.25rem 3rem; }
.of-wrap.embed { padding: 1rem; max-width: 100%; }
.of-card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 1.5rem; }
.of-thanks { max-width: 100%; }
.of-thanks a { color: var(--primary); }

h1 { font-size: 1.35rem; margin: 0 0 0.5rem; font-weight: 600; }
.of-desc { color: var(--muted); font-size: 0.9rem; margin: 0 0 1.25rem; }
label { display: block; font-size: 0.85rem; font-weight: 500; margin: 0.85rem 0 0.35rem; }
input[type=text], input[type=email], input[type=number], input[type=password], input[type=date], textarea, select {
  width: 100%; padding: 0.55rem 0.7rem; border-radius: 8px; border: 1px solid var(--border);
  background: var(--bg); color: var(--fg); font: inherit;
}
textarea { min-height: 5rem; resize: vertical; }
.req { color: var(--err); }
.of-check, .of-radio { display: flex; flex-direction: column; gap: 0.35rem; margin-top: 0.25rem; }
.of-check label, .of-radio label { display: flex; align-items: center; gap: 0.5rem; font-weight: 400; margin: 0; }
button[type=submit] {
  margin-top: 1.25rem; width: 100%; padding: 0.7rem 1rem; border: 0; border-radius: 8px;
  background: var(--primary); color: #fff; font-weight: 600; font-size: 0.95rem; cursor: pointer;
}
button[type=submit]:hover { filter: brightness(1.08); }
.of-foot { margin-top: 1.25rem; text-align: center; font-size: 0.75rem; color: var(--muted); }
.of-err { color: var(--err); font-size: 0.85rem; margin: 0.5rem 0 0; }
.of-thanks { text-align: center; padding: 2rem 1rem; }
`;

export function renderFormPage(opts: {
  formTitle: string;
  formDescription: string;
  elements: FormField[];
  path: string;
  embed?: boolean;
  buttonLabel?: string;
  customCss?: string;
  appendAttribution?: boolean;
  error?: string;
  csrfToken: string;
}): string {
  const fieldsHtml = opts.elements
    .map((f) => renderField(f))
    .join("\n");

  const desc = opts.formDescription
    ? `<div class="of-desc">${sanitizeHtml(opts.formDescription)}</div>`
    : "";
  const err = opts.error ? `<p class="of-err">${escapeHtml(opts.error)}</p>` : "";
  const btn = escapeHtml(opts.buttonLabel?.trim() || "Submit");
  const foot =
    opts.appendAttribution !== false
      ? `<p class="of-foot">Form powered by OpenFlow</p>`
      : "";
  const css = DEFAULT_CSS + (opts.customCss ? `\n${opts.customCss}` : "");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${escapeHtml(opts.formTitle)}</title>
  <style>${css}</style>
</head>
<body>
  <div class="of-wrap${opts.embed ? " embed" : ""}">
    <div class="of-card">
      <h1>${escapeHtml(opts.formTitle)}</h1>
      ${desc}
      ${err}
      <form method="post" action="/form/${escapeHtml(opts.path)}${opts.embed ? "?embed=1" : ""}" enctype="application/x-www-form-urlencoded">
        <input type="hidden" name="_csrf" value="${escapeHtml(opts.csrfToken)}"/>
        ${fieldsHtml}
        <button type="submit">${btn}</button>
      </form>
      ${foot}
    </div>
  </div>
</body>
</html>`;
}

function renderField(f: FormField): string {
  const type = f.elementType || "text";
  if (type === "customHtml") {
    return `<div class="of-html">${sanitizeHtml(f.html ?? "")}</div>`;
  }
  if (type === "hidden") {
    return `<input type="hidden" name="${escapeHtml(f.fieldName)}" value="${escapeHtml(f.fieldValue ?? f.defaultValue ?? "")}"/>`;
  }

  const req = f.requiredField ? ' required' : "";
  const reqMark = f.requiredField ? ' <span class="req">*</span>' : "";
  const ph = f.placeholder ? ` placeholder="${escapeHtml(f.placeholder)}"` : "";
  const def = f.defaultValue != null ? escapeHtml(f.defaultValue) : "";
  const name = escapeHtml(f.fieldName);
  const label = escapeHtml(f.fieldLabel);

  if (type === "textarea") {
    return `<label for="${name}">${label}${reqMark}</label><textarea id="${name}" name="${name}"${ph}${req}>${def}</textarea>`;
  }
  if (type === "dropdown") {
    const opts = (f.options?.length ? f.options : ["Option 1"]).map((o) => {
      const v = escapeHtml(o);
      const sel = def && def === v ? " selected" : "";
      return `<option value="${v}"${sel}>${v}</option>`;
    });
    const multi = f.multipleChoice ? " multiple" : "";
    return `<label for="${name}">${label}${reqMark}</label><select id="${name}" name="${name}${f.multipleChoice ? "[]" : ""}"${multi}${req}>${opts.join("")}</select>`;
  }
  if (type === "radio") {
    const opts = (f.options?.length ? f.options : ["Yes", "No"])
      .map((o, i) => {
        const v = escapeHtml(o);
        const id = `${name}_${i}`;
        const checked = def === v ? " checked" : "";
        return `<label for="${id}"><input type="radio" id="${id}" name="${name}" value="${v}"${checked}${req && i === 0 ? " required" : ""}/> ${v}</label>`;
      })
      .join("");
    return `<div><span>${label}${reqMark}</span><div class="of-radio">${opts}</div></div>`;
  }
  if (type === "checkboxes") {
    const opts = (f.options?.length ? f.options : ["Option"])
      .map((o, i) => {
        const v = escapeHtml(o);
        const id = `${name}_${i}`;
        return `<label for="${id}"><input type="checkbox" id="${id}" name="${name}" value="${v}"/> ${v}</label>`;
      })
      .join("");
    return `<div><span>${label}${reqMark}</span><div class="of-check">${opts}</div></div>`;
  }

  const inputType =
    type === "email"
      ? "email"
      : type === "number"
        ? "number"
        : type === "password"
          ? "password"
          : type === "date"
            ? "date"
            : "text";
  return `<label for="${name}">${label}${reqMark}</label><input type="${inputType}" id="${name}" name="${name}" value="${def}"${ph}${req}/>`;
}

export function renderThanksPage(opts: {
  title?: string;
  bodyHtml: string;
  embed?: boolean;
  appendAttribution?: boolean;
}): string {
  const foot =
    opts.appendAttribution !== false
      ? `<p class="of-foot">Form powered by OpenFlow</p>`
      : "";
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${escapeHtml(opts.title ?? "Submitted")}</title>
  <style>${DEFAULT_CSS}</style>
</head>
<body>
  <div class="of-wrap${opts.embed ? " embed" : ""}">
    <div class="of-card of-thanks">
      <div>${sanitizeHtml(opts.bodyHtml)}</div>
      ${foot}
    </div>
  </div>
</body>
</html>`;
}

export function renderErrorPage(message: string, embed?: boolean): string {
  return renderThanksPage({
    title: "Form unavailable",
    bodyHtml: `<h1>Form unavailable</h1><p>${escapeHtml(message)}</p>`,
    embed,
    appendAttribution: true,
  });
}
