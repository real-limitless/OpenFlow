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
});
