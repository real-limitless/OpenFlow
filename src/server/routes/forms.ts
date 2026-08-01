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
import {
  formNodeParams,
  isFormTriggerNode,
  resolveFormPath,
} from "../forms/register";
import { renderErrorPage, renderFormPage, renderThanksPage, sanitizeHtml } from "../forms/html";
import { signFormCsrf, verifyFormCsrf } from "../forms/csrf";

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
    const embed =
      c.req.query("embed") === "1" ||
      c.req.query("embed") === "true" ||
      false;
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
        credentialResolver: credentialResolverForProject(
          workflowRow.projectId,
          workflowRow.userId,
        ),
        dataTables: dataTableAccessForProject(workflowRow.projectId),
        vars,
        startNode: ctx.node.name,
        resolveSubWorkflow: resolveSubWorkflowFromDb,
      });

      await prisma.execution.update({
        where: { id: execution.id },
        data: {
          status: runResult.success ? "success" : "error",
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

      clearFormResponse(execution.id);

      if (!runResult.success && cfg.responseMode === "workflowFinishes") {
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
