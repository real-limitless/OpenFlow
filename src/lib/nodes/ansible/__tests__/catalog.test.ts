import { describe, expect, it } from "vitest";
import {
  ansibleOptionToProperty,
  getAnsibleModuleSchema,
  listAnsibleGallery,
  listAnsibleSchemaFqcns,
  searchAnsibleGallery,
  schemaToProperties,
} from "../catalog";
import { decodeNodeDragPayload, encodeNodeDragPayload } from "@/lib/workflow/add-node";

describe("ansible catalog", () => {
  it("searches gallery by short name", () => {
    const hits = searchAnsibleGallery("file");
    expect(hits.some((h) => h.fqcn === "ansible.builtin.file")).toBe(true);
  });

  it("loads file schema and maps options", () => {
    const schema = getAnsibleModuleSchema("ansible.builtin.file");
    expect(schema).not.toBeNull();
    const props = schemaToProperties(schema!);
    expect(props.some((p) => p.name === "path" && p.required)).toBe(true);
    const state = props.find((p) => p.name === "state");
    expect(state?.type).toBe("options");
  });

  it("has schemas for full gallery coverage", () => {
    const gallery = listAnsibleGallery();
    const schemas = new Set(listAnsibleSchemaFqcns());
    expect(schemas.size).toBeGreaterThanOrEqual(gallery.length);
    for (const g of gallery) {
      expect(schemas.has(g.fqcn), `missing schema for ${g.fqcn}`).toBe(true);
    }
  });

  it("maps boolean options", () => {
    const prop = ansibleOptionToProperty({
      name: "recurse",
      displayName: "Recurse",
      type: "boolean",
      default: false,
    });
    expect(prop.type).toBe("boolean");
  });
});

describe("node drag payload", () => {
  it("round-trips JSON payload", () => {
    const raw = encodeNodeDragPayload({
      type: "openflow-node-base.ansible",
      name: "file",
      parameters: { module: "ansible.builtin.file" },
    });
    const decoded = decodeNodeDragPayload(raw);
    expect(decoded?.type).toBe("openflow-node-base.ansible");
    expect(decoded?.name).toBe("file");
    expect(decoded?.parameters?.module).toBe("ansible.builtin.file");
  });

  it("accepts legacy plain type string", () => {
    expect(decodeNodeDragPayload("openflow-node-base.set")?.type).toBe("openflow-node-base.set");
  });
});
