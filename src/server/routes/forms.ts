import type { Hono } from "hono";
import { prisma } from "../db";
import type { AppEnv } from "../middleware/auth";
import type { INode, IWorkflow } from "../../lib/workflow/types";
import { executeWorkflow } from "../../lib/engine/runner";
import { getExecutorMap } from "../../lib/engine";
import { clearFormResponse } from "../../lib/engine/executors/form-trigger";
import { credentialResolverForProject } from "../credentials";
import { dataTableAccessForProject } from "../services/data-tables-access";
import { resolveSubWorkflowFromDb } from "../workflow-loader";
import { loadVarsMap } from "../services/variables";
import { getDefaultEnvironment } from "../services/environments";
import { formNodeParams, isFormTriggerNode, resolveFormPath } from "../forms/register";
import {
  escapeHtml,
  renderErrorPage,
  renderFormPage,
  renderThanksPage,
  sanitizeHtml,
} from "../forms/html";
import { signFormCsrf, verifyFormCsrf } from "../forms/csrf";
import type { ExecutionRunData } from "../../lib/engine/types";
import { typesEqual } from "../../lib/nodes/type-ids";
import { evaluateExpression, isExpression } from "../../lib/expressions/evaluate";
import { notifyExecutionFinished, notifyExecutionStarted } from "../services/workflow-events";
import { persistExecutionProgress } from "../services/persist-execution-progress";

function definitionFromWorkflow(workflow: {
  id: string;
  name: string;
  active: boolean;
  nodes: string;
  connections: string;
  settings: string | null;
  staticData: string | null;
  pinData: string | null;
  meta: string | null;
  versionId: string;
}): IWorkflow {
  return {
    id: workflow.id,
    name: workflow.name,
    active: workflow.active,
    nodes: JSON.parse(workflow.nodes) as INode[],
    connections: JSON.parse(workflow.connections),
    settings: workflow.settings ? JSON.parse(workflow.settings) : undefined,
    staticData: workflow.staticData ? JSON.parse(workflow.staticData) : undefined,
    pinData: workflow.pinData ? JSON.parse(workflow.pinData) : undefined,
    meta: workflow.meta ? JSON.parse(workflow.meta) : undefined,
    versionId: workflow.versionId,
  } as IWorkflow;
}

async function loadFormContext(path: string) {
  const route = await prisma.formRoute.findUnique({
    where: { path },
    include: { workflow: true },
  });
  if (!route || !route.active || !route.workflow.active) return null;

  const definition = definitionFromWorkflow(route.workflow);
  const node =
    definition.nodes.find((n) => n.id === route.nodeId && isFormTriggerNode(n)) ??
    definition.nodes.find((n) => isFormTriggerNode(n) && resolveFormPath(n) === path);

  if (!node || node.disabled) return null;
  return { route, definition, node, workflowRow: route.workflow };
}

function collectBodyFields(
  formData: Record<string, string | string[]>,
  fieldNames: string[],
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const name of fieldNames) {
    const multi = formData[`${name}[]`];
    const single = formData[name];
    if (multi !== undefined) {
      body[name] = Array.isArray(multi) ? multi : [multi];
    } else if (single !== undefined) {
      body[name] = single;
    }
  }
  // Also capture any other posted keys except internal
  for (const [k, v] of Object.entries(formData)) {
    if (k === "_csrf" || k.endsWith("[]")) continue;
    if (!(k in body)) body[k] = v;
  }
  return body;
}

function isFormPageNode(node: INode): boolean {
  return Boolean(node.type && typesEqual(node.type, "n8n-nodes-base.form"));
}

/** Last successful main-output item from a finished run (prefers Form completion nodes). */
function extractTerminalJson(
  definition: IWorkflow,
  runData: ExecutionRunData,
): Record<string, unknown> | null {
  const completionNodes = definition.nodes.filter((n) => {
    if (n.disabled || !isFormPageNode(n)) return false;
    const op = String((n.parameters as Record<string, unknown> | undefined)?.operation ?? "form");
    return op === "completion";
  });

  const prefer = [
    ...completionNodes.map((n) => n.name),
    ...definition.nodes
      .filter((n) => !n.disabled && !completionNodes.some((c) => c.name === n.name))
      .map((n) => n.name),
  ];

  // Prefer latest finishedAt among preferred successful nodes with items
  let best: { at: string; json: Record<string, unknown> } | null = null;
  for (const name of prefer) {
    const rd = runData[name];
    if (!rd || rd.status !== "success" || !rd.items?.length) continue;
    const flat = rd.items.flat();
    const json = (flat[flat.length - 1]?.json ?? null) as Record<string, unknown> | null;
    if (!json) continue;
    const at = rd.finishedAt || rd.startedAt || "";
    if (!best || at >= best.at) best = { at, json };
  }
  return best?.json ?? null;
}

function evalAgainstJson(raw: unknown, json: Record<string, unknown>): string {
  if (raw == null) return "";
  if (typeof raw !== "string") return String(raw);
  if (!isExpression(raw) && !raw.includes("{{")) return raw;
  const result = evaluateExpression(raw, { json });
  if (result.ok && result.value != null) return String(result.value);
  return raw;
}

function buildWorkflowFinishThanks(
  definition: IWorkflow,
  runData: ExecutionRunData,
): { title: string; bodyHtml: string } {
  const json = extractTerminalJson(definition, runData) ?? {};
  const fc = (json.formCompletion ?? null) as {
    title?: string;
    message?: string;
    pageTitle?: string;
  } | null;

  // Prefer executor-resolved formCompletion; fall back to completion node params + expressions
  let title = String(fc?.title ?? "").trim();
  let message = String(fc?.message ?? "").trim();

  if (!title || !message) {
    const completionNode = definition.nodes.find((n) => {
      if (n.disabled || !isFormPageNode(n)) return false;
      const op = String((n.parameters as Record<string, unknown> | undefined)?.operation ?? "form");
      return op === "completion";
    });
    const params = (completionNode?.parameters ?? {}) as Record<string, unknown>;
    if (!title) title = evalAgainstJson(params.completionTitle, json).trim();
    if (!message) message = evalAgainstJson(params.completionMessage, json).trim();
  }

  if (!title) {
    title = String(json.priceLine ?? json.symbol ?? json.headline ?? "Submitted").trim();
  }
  if (!message) {
    message = String(json.reportHtml ?? json.reportText ?? json.headline ?? "").trim();
  }
  if (!message) {
    message = "<p>Your form was submitted successfully.</p>";
  }

  // If message is plain text, wrap it; HTML is sanitized in renderThanksPage
  const bodyHtml = message.includes("<")
    ? message
    : `<h1>${escapeHtml(title)}</h1><p>${escapeHtml(message).replace(/\n/g, "<br/>")}</p>`;

  return { title: title || "Submitted", bodyHtml };
}

export default function formsRoute(app: Hono<AppEnv>) {
  app.get("/form/:path", async (c) => {
    const path = c.req.param("path");
    const embed = c.req.query("embed") === "1" || c.req.query("embed") === "true";
    const ctx = await loadFormContext(path);
    if (!ctx) {
      return c.html(renderErrorPage("This form is not available.", embed), 404);
    }
    const cfg = formNodeParams(ctx.node);
    const html = renderFormPage({
      formTitle: cfg.formTitle,
      formDescription: cfg.formDescription,
      elements: cfg.elements,
      path,
      embed,
      buttonLabel: String(cfg.options.buttonLabel ?? ""),
      customCss: String(cfg.options.customFormStyling ?? ""),
      appendAttribution: cfg.options.appendAttribution !== false,
      csrfToken: signFormCsrf(path),
    });
    c.header("Content-Security-Policy", "frame-ancestors *");
    return c.html(html, 200);
  });

  app.post("/form/:path", async (c) => {
    const path = c.req.param("path");
    const embed = c.req.query("embed") === "1" || c.req.query("embed") === "true" || false;
    const ctx = await loadFormContext(path);
    if (!ctx) {
      return c.html(renderErrorPage("This form is not available.", embed), 404);
    }

    const cfg = formNodeParams(ctx.node);
    let formData: Record<string, string | string[]> = {};
    try {
      const raw = await c.req.parseBody({ all: true });
      for (const [k, v] of Object.entries(raw)) {
        if (Array.isArray(v)) {
          formData[k] = v.map((x) => (typeof x === "string" ? x : String(x)));
        } else if (typeof v === "string") {
          formData[k] = v;
        } else if (v && typeof v === "object" && "name" in v) {
          // File — skip in MVP
          continue;
        }
      }
    } catch {
      try {
        formData = (await c.req.json()) as Record<string, string | string[]>;
      } catch {
        formData = {};
      }
    }

    const csrf = typeof formData._csrf === "string" ? formData._csrf : undefined;
    if (!verifyFormCsrf(path, csrf)) {
      const html = renderFormPage({
        formTitle: cfg.formTitle,
        formDescription: cfg.formDescription,
        elements: cfg.elements,
        path,
        embed,
        buttonLabel: String(cfg.options.buttonLabel ?? ""),
        customCss: String(cfg.options.customFormStyling ?? ""),
        appendAttribution: cfg.options.appendAttribution !== false,
        error: "Session expired. Please try again.",
        csrfToken: signFormCsrf(path),
      });
      return c.html(html, 400);
    }

    // Required validation
    for (const f of cfg.elements) {
      if (!f.requiredField || f.elementType === "customHtml" || f.elementType === "hidden") {
        continue;
      }
      const val = formData[f.fieldName] ?? formData[`${f.fieldName}[]`];
      const empty =
        val == null ||
        (typeof val === "string" && !val.trim()) ||
        (Array.isArray(val) && val.length === 0);
      if (empty) {
        const html = renderFormPage({
          formTitle: cfg.formTitle,
          formDescription: cfg.formDescription,
          elements: cfg.elements,
          path,
          embed,
          buttonLabel: String(cfg.options.buttonLabel ?? ""),
          customCss: String(cfg.options.customFormStyling ?? ""),
          appendAttribution: cfg.options.appendAttribution !== false,
          error: `“${f.fieldLabel}” is required.`,
          csrfToken: signFormCsrf(path),
        });
        return c.html(html, 400);
      }
    }

    const fieldNames = cfg.elements.map((e) => e.fieldName);
    const body = collectBodyFields(formData, fieldNames);
    // Hidden field values from config if not posted
    for (const f of cfg.elements) {
      if (f.elementType === "hidden" && body[f.fieldName] == null) {
        body[f.fieldName] = f.fieldValue ?? f.defaultValue ?? "";
      }
    }

    const headers: Record<string, string> = {};
    c.req.raw.headers.forEach((v, k) => {
      headers[k] = v;
    });
    const query: Record<string, string> = {};
    for (const [k, v] of Object.entries(c.req.query())) {
      if (v != null) query[k] = String(v);
    }

    // Flattened item shape (same as form-trigger executor output).
    // Runner treats pinData as final node output, so we do not rely on re-running the executor.
    const submittedAt = new Date().toISOString();
    const itemJson: Record<string, unknown> = {
      ...body,
      submittedAt,
    };

    const workflowRow = ctx.workflowRow;
    const execution = await prisma.execution.create({
      data: {
        workflowId: workflowRow.id,
        status: "running",
        mode: "webhook",
      },
    });
    notifyExecutionStarted(workflowRow.id, execution.id, "webhook");

    const defaultEnv = await getDefaultEnvironment(workflowRow.projectId);
    const environmentId = defaultEnv?.id;
    const vars = await loadVarsMap(workflowRow.projectId, environmentId ?? null);

    const pinData = {
      [ctx.node.name]: [{ json: itemJson }],
    };

    try {
      const runResult = await executeWorkflow({
        workflow: {
          ...ctx.definition,
          __executionId: execution.id,
        } as IWorkflow & { __executionId: string },
        nodeExecutors: getExecutorMap(),
        pinData,
        credentialResolver: credentialResolverForProject(workflowRow.projectId, workflowRow.userId),
        dataTables: dataTableAccessForProject(workflowRow.projectId),
        vars,
        startNode: ctx.node.name,
        resolveSubWorkflow: resolveSubWorkflowFromDb,
        onProgress: async (partial) => {
          await persistExecutionProgress(execution.id, partial);
        },
      });

      const status = runResult.success ? "success" : "error";
      await prisma.execution.update({
        where: { id: execution.id },
        data: {
          status,
          finishedAt: new Date(),
          runData: JSON.stringify(runResult.runData),
          error: runResult.success
            ? null
            : JSON.stringify({
                message:
                  Object.values(runResult.runData).find((d) => d.status === "error")?.error ??
                  "Workflow failed",
              }),
        },
      });
      notifyExecutionFinished(workflowRow.id, execution.id, status, "webhook");

      clearFormResponse(execution.id);

      const waitForWorkflow =
        cfg.responseMode === "workflowFinishes" || cfg.responseMode === "lastNode";

      if (!runResult.success && waitForWorkflow) {
        c.header("Content-Security-Policy", "frame-ancestors *");
        return c.html(
          renderThanksPage({
            title: "Submission problem",
            bodyHtml:
              "<h1>There was a problem</h1><p>We could not process your submission. Please try again later.</p>",
            embed,
            appendAttribution: cfg.options.appendAttribution !== false,
          }),
          500,
        );
      }

      // When waiting for the workflow, render the Form completion / last-node report.
      if (runResult.success && waitForWorkflow) {
        const finish = buildWorkflowFinishThanks(ctx.definition, runResult.runData);
        c.header("Content-Security-Policy", "frame-ancestors *");
        return c.html(
          renderThanksPage({
            title: finish.title,
            bodyHtml: finish.bodyHtml,
            embed,
            appendAttribution: cfg.options.appendAttribution !== false,
          }),
          200,
        );
      }

      const rawThanks = String(cfg.options.formSubmittedText || "").trim();
      const thanksBody = rawThanks
        ? rawThanks.includes("<")
          ? sanitizeHtml(rawThanks)
          : `<h1>Thank you</h1><p>${sanitizeHtml(rawThanks)}</p>`
        : "<h1>Thank you</h1><p>Your form was submitted successfully.</p>";

      c.header("Content-Security-Policy", "frame-ancestors *");
      return c.html(
        renderThanksPage({
          title: "Submitted",
          bodyHtml: thanksBody,
          embed,
          appendAttribution: cfg.options.appendAttribution !== false,
        }),
        200,
      );
    } catch (err) {
      await prisma.execution.update({
        where: { id: execution.id },
        data: {
          status: "error",
          finishedAt: new Date(),
          error: JSON.stringify({
            message: err instanceof Error ? err.message : String(err),
          }),
        },
      });
      notifyExecutionFinished(workflowRow.id, execution.id, "error", "webhook");
      return c.html(
        renderThanksPage({
          title: "Submission problem",
          bodyHtml:
            "<h1>There was a problem</h1><p>We could not process your submission. Please try again later.</p>",
          embed,
          appendAttribution: true,
        }),
        500,
      );
    }
  });
}
