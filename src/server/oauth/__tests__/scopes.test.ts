import { describe, expect, it } from "vitest";
import {
  ALL_MCP_SCOPES,
  DEFAULT_AGENT_SCOPES,
  HUMAN_MCP_SCOPES,
  hasScope,
  parseScopes,
  scopeForTool,
} from "../scopes";

describe("oauth scopes", () => {
  it("defaults to classic agent scopes when empty (no secret write)", () => {
    expect(parseScopes("")).toEqual([
      "openflow:read",
      "openflow:write",
      "openflow:execute",
    ]);
    expect(parseScopes("")).toEqual([...DEFAULT_AGENT_SCOPES]);
    expect(parseScopes("")).not.toContain("openflow:credentials");
    expect(parseScopes("")).not.toContain("openflow:variables");
  });

  it("accepts opt-in secret scopes when explicit", () => {
    expect(parseScopes("openflow:read openflow:credentials openflow:variables")).toEqual([
      "openflow:read",
      "openflow:credentials",
      "openflow:variables",
    ]);
  });

  it("filters unknown scopes", () => {
    expect(parseScopes("openflow:read admin")).toEqual(["openflow:read"]);
  });

  it("maps tools to scopes", () => {
    expect(scopeForTool("list_workflows")).toBe("openflow:read");
    expect(scopeForTool("list_credentials")).toBe("openflow:read");
    expect(scopeForTool("list_variables")).toBe("openflow:read");
    expect(scopeForTool("add_node")).toBe("openflow:write");
    expect(scopeForTool("execute_workflow")).toBe("openflow:execute");
    expect(scopeForTool("create_credential")).toBe("openflow:credentials");
    expect(scopeForTool("update_credential")).toBe("openflow:credentials");
    expect(scopeForTool("delete_credential")).toBe("openflow:credentials");
    expect(scopeForTool("list_credential_types")).toBe("openflow:credentials");
    expect(scopeForTool("create_variable")).toBe("openflow:variables");
    expect(scopeForTool("update_variable")).toBe("openflow:variables");
    expect(scopeForTool("delete_variable")).toBe("openflow:variables");
  });

  it("hasScope treats empty as full access", () => {
    expect(hasScope(undefined, "openflow:write")).toBe(true);
    expect(hasScope(["openflow:read"], "openflow:write")).toBe(false);
    expect(hasScope(["openflow:credentials"], "openflow:credentials")).toBe(true);
  });

  it("human scopes include opt-in secret scopes", () => {
    expect(HUMAN_MCP_SCOPES).toContain("openflow:credentials");
    expect(HUMAN_MCP_SCOPES).toContain("openflow:variables");
    expect(ALL_MCP_SCOPES).toEqual([...HUMAN_MCP_SCOPES]);
  });
});
