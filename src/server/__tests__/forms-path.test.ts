import { describe, it, expect } from "vitest";
import {
  formNodeParams,
  parseFormElements,
  resolveFormPath,
  slugify,
} from "../../lib/forms/path";
import type { INode } from "../../lib/workflow/types";

function node(partial: Partial<INode> & { parameters?: Record<string, unknown> }): INode {
  return {
    id: "n1",
    name: "On form submission",
    type: "n8n-nodes-base.formTrigger",
    typeVersion: 2,
    position: [0, 0],
    parameters: {},
    ...partial,
  };
}

describe("form path helpers", () => {
  it("slugifies form paths", () => {
    expect(slugify("My Sign-Up!")).toBe("my-sign-up");
  });

  it("prefers formPath parameter", () => {
    expect(resolveFormPath(node({ parameters: { formPath: "demo-form" } }))).toBe("demo-form");
  });

  it("parses fixedCollection formElements", () => {
    const fields = parseFormElements({
      values: [
        { fieldLabel: "Name", fieldName: "name", elementType: "text", requiredField: true },
        { fieldLabel: "Email", fieldName: "email", elementType: "email" },
      ],
    });
    expect(fields).toHaveLength(2);
    expect(fields[0]?.fieldName).toBe("name");
    expect(fields[0]?.requiredField).toBe(true);
  });

  it("formNodeParams exposes title and elements", () => {
    const p = formNodeParams(
      node({
        parameters: {
          formTitle: "Signup",
          formElements: {
            values: [{ fieldLabel: "X", fieldName: "x", elementType: "text" }],
          },
        },
      }),
    );
    expect(p.formTitle).toBe("Signup");
    expect(p.elements[0]?.fieldName).toBe("x");
  });

  it("parses n8n formFields with label-only rows and expression requiredField", () => {
    const p = formNodeParams(
      node({
        id: "9732c12e-903e-49ac-8d29-ffc4d78c7ff8",
        name: "Submit Social Post Details",
        parameters: {
          options: {
            buttonLabel: "Automatically Generate Social Media Content",
          },
          formTitle: "workflows.diy",
          formFields: {
            values: [
              {
                fieldLabel: "Topic",
                placeholder:
                  'Provide a concise and clear title or main topic for your post',
                requiredField: true,
              },
              {
                fieldLabel: "Keywords or Hashtags (optional)",
                placeholder: "Include any specific keywords",
                requiredField: "={{ false }}",
              },
              {
                fieldLabel: "Link (optional)",
                placeholder:
                  "=Provide the URL of any product, service, form, support page, or other resource.\n",
              },
            ],
          },
          responseMode: "lastNode",
          formDescription:
            "=Welcome to the workflows.diy AI-Powered Assistant!\n\nThis tool is designed to streamline.",
        },
      }),
    );
    expect(p.elements).toHaveLength(3);
    expect(p.elements[0]?.fieldLabel).toBe("Topic");
    expect(p.elements[0]?.fieldName).toBe("topic");
    expect(p.elements[0]?.requiredField).toBe(true);
    expect(p.elements[1]?.requiredField).toBe(false);
    expect(p.elements[2]?.placeholder).toMatch(/^Provide the URL/);
    expect(p.formDescription).toMatch(/^Welcome to the workflows/);
    expect(p.responseMode).toBe("workflowFinishes");
  });

  it("maps fieldType aliases (hiddenField, html, checkbox)", () => {
    const fields = parseFormElements({
      values: [
        { fieldLabel: "H", fieldName: "h", fieldType: "hiddenField", fieldValue: "x" },
        { fieldLabel: "Html", fieldType: "html", html: "<b>hi</b>" },
        { fieldLabel: "C", fieldName: "c", fieldType: "checkbox" },
      ],
    });
    expect(fields[0]?.elementType).toBe("hidden");
    expect(fields[1]?.elementType).toBe("customHtml");
    expect(fields[2]?.elementType).toBe("checkboxes");
  });
});
