import { beforeEach, describe, expect, it } from "vitest";
import {
  ansibleOptionToProperty,
  groupGalleryByCollection,
  schemaHasFormFields,
  schemaToProperties,
  searchGalleryEntries,
} from "../catalog-core";
import {
  setAnsibleCatalogOverride,
  getAnsibleModuleSchema,
  searchAnsibleGallery,
} from "../catalog";
import {
  getAnsibleModuleSchemaFs,
  listAnsibleCollectionsFs,
  listAnsibleGalleryFs,
  listAnsibleModulesByCollectionFs,
  resetAnsibleCatalogCache,
  searchAnsibleGalleryFs,
  resolveAnsibleCatalogRoot,
} from "../catalog-fs";
import { decodeNodeDragPayload, encodeNodeDragPayload } from "@/lib/workflow/add-node";
import { existsSync } from "node:fs";

const fixtureGallery = [
  {
    fqcn: "ansible.builtin.file",
    shortName: "file",
    collection: "ansible.builtin",
    description: "Manage files",
  },
  {
    fqcn: "ansible.builtin.ping",
    shortName: "ping",
    collection: "ansible.builtin",
    description: "Ping",
  },
  {
    fqcn: "community.docker.docker_container",
    shortName: "docker_container",
    collection: "community.docker",
    description: "Containers",
  },
];

const fixtureSchemas = {
  "ansible.builtin.file": {
    fqcn: "ansible.builtin.file",
    shortDescription: "Manage files",
    options: [
      {
        name: "path",
        displayName: "Path",
        type: "string",
        required: true,
        default: null,
        description: "Path",
        choices: null,
        noLog: false,
        suboptions: null,
      },
      {
        name: "state",
        displayName: "State",
        type: "string",
        required: false,
        default: "file",
        description: "State",
        choices: ["absent", "directory", "file"],
        noLog: false,
        suboptions: null,
      },
    ],
  },
};

describe("ansible catalog-core", () => {
  it("searches gallery by short name", () => {
    const hits = searchGalleryEntries(fixtureGallery, "file");
    expect(hits.some((h) => h.fqcn === "ansible.builtin.file")).toBe(true);
  });

  it("maps options and detects form schemas", () => {
    const props = schemaToProperties(fixtureSchemas["ansible.builtin.file"]);
    expect(props.some((p) => p.name === "path" && p.required)).toBe(true);
    expect(props.find((p) => p.name === "state")?.type).toBe("options");
    expect(schemaHasFormFields(fixtureSchemas["ansible.builtin.file"])).toBe(true);
    expect(schemaHasFormFields({ fqcn: "x", options: [] })).toBe(false);
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

  it("groups by collection", () => {
    const groups = groupGalleryByCollection(fixtureGallery);
    expect(groups.some((g) => g.collection === "ansible.builtin")).toBe(true);
  });
});

describe("ansible catalog override (client)", () => {
  beforeEach(() => {
    setAnsibleCatalogOverride({ gallery: fixtureGallery, schemas: fixtureSchemas });
  });

  it("search + get schema via override", () => {
    expect(searchAnsibleGallery("ping")[0]?.fqcn).toBe("ansible.builtin.ping");
    expect(getAnsibleModuleSchema("ansible.builtin.file")?.options?.length).toBe(2);
  });
});

describe("ansible catalog-fs (server)", () => {
  beforeEach(() => {
    resetAnsibleCatalogCache();
  });

  it("resolves catalog root and loads gallery when data present", () => {
    const root = resolveAnsibleCatalogRoot();
    expect(existsSync(root) || root.includes("ansible")).toBe(true);
    const gallery = listAnsibleGalleryFs();
    // fallback (18) or full data catalog
    expect(gallery.length).toBeGreaterThanOrEqual(10);
    const hits = searchAnsibleGalleryFs("file", 20);
    expect(hits.some((h) => h.fqcn.includes("file"))).toBe(true);
  });

  it("loads a known schema from disk when available", () => {
    const schema =
      getAnsibleModuleSchemaFs("ansible.builtin.file") ||
      getAnsibleModuleSchemaFs("ansible.builtin.ping");
    expect(schema).not.toBeNull();
    expect(schema!.fqcn).toMatch(/^ansible\.builtin\./);
  });

  it("lists all collections and full builtin modules (no 80 cap)", () => {
    const cols = listAnsibleCollectionsFs();
    expect(cols.length).toBeGreaterThanOrEqual(1);
    expect(cols.every((c) => c.name && c.moduleCount > 0)).toBe(true);
    const builtin = cols.find((c) => c.name === "ansible.builtin");
    expect(builtin).toBeDefined();
    const mods = listAnsibleModulesByCollectionFs("ansible.builtin");
    expect(mods.length).toBe(builtin!.moduleCount);
    expect(mods.length).toBeGreaterThan(10);
    // yum is a classic builtin module name when full catalog is present
    const names = new Set(mods.map((m) => m.shortName));
    expect(names.has("file") || names.has("ping")).toBe(true);
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
    expect(decoded?.parameters?.module).toBe("ansible.builtin.file");
  });

  it("accepts legacy plain type string", () => {
    expect(decodeNodeDragPayload("openflow-node-base.set")?.type).toBe("openflow-node-base.set");
  });
});
