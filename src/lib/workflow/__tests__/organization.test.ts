import { describe, expect, it } from "vitest";
import {
  collectFolders,
  inFolder,
  matchesOrganization,
  normalizeFolder,
  parseSavedViews,
  tagNames,
  workflowFolder,
} from "../organization";

describe("organization helpers", () => {
  it("normalizes folders and tags", () => {
    expect(normalizeFolder(" /Sales / Inbound / ")).toBe("Sales/Inbound");
    expect(tagNames(["Ops", { name: "ops" }, "Prod", ""])).toEqual(["Ops", "Prod"]);
    expect(workflowFolder({ meta: { folder: "Sales/Inbound" } })).toBe("Sales/Inbound");
  });

  it("filters by folder prefix, tags, and query", () => {
    const wf = {
      name: "Lead capture",
      active: true,
      tags: ["prod", "sales"],
      meta: { folder: "Sales/Inbound" },
    };
    expect(inFolder("", "__unfiled")).toBe(true);
    expect(inFolder("Sales", "__unfiled")).toBe(false);
    expect(collectFolders(["Sales/Inbound", "Ops"])).toEqual(["Ops", "Sales", "Sales/Inbound"]);
    expect(
      matchesOrganization(wf, { query: "lead", folder: "Sales", tags: ["prod"], active: "active" }),
    ).toBe(true);
    expect(
      matchesOrganization(wf, { query: "", folder: "", tags: ["missing"], active: "all" }),
    ).toBe(false);
  });

  it("parses saved views", () => {
    const views = parseSavedViews(
      JSON.stringify([{ id: "v1", name: " Prod failing ", filter: { tags: ["prod"], active: "active" } }]),
    );
    expect(views[0]).toMatchObject({
      id: "v1",
      name: "Prod failing",
      filter: { tags: ["prod"], active: "active", folder: "", query: "" },
    });
    expect(parseSavedViews("nope")).toEqual([]);
  });
});
