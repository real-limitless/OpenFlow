import { describe, expect, it } from "vitest";
import { hasScope, parseScopes, scopeForTool } from "../scopes";

describe("oauth scopes", () => {
  it("defaults to all scopes when empty", () => {
    expect(parseScopes("")).toEqual([
      "openflow:read",
      "openflow:write",
      "openflow:execute",
    ]);
  });

  it("filters unknown scopes", () => {
    expect(parseScopes("openflow:read admin")).toEqual(["openflow:read"]);
  });

  it("maps tools to scopes", () => {
    expect(scopeForTool("list_workflows")).toBe("openflow:read");
    expect(scopeForTool("add_node")).toBe("openflow:write");
    expect(scopeForTool("execute_workflow")).toBe("openflow:execute");
  });

  it("hasScope treats empty as full access", () => {
    expect(hasScope(undefined, "openflow:write")).toBe(true);
    expect(hasScope(["openflow:read"], "openflow:write")).toBe(false);
  });
});
