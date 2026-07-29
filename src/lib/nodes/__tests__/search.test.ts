import { describe, it, expect } from "vitest";
import { fuzzyScore, fuzzySearch } from "../search";

describe("Fuzzy Search", () => {
  const items = [
    { name: "n8n-nodes-base.set", displayName: "Set", description: "Sets values" },
    {
      name: "n8n-nodes-base.httpRequest",
      displayName: "HTTP Request",
      description: "Makes HTTP calls",
    },
    {
      name: "n8n-nodes-base.manualTrigger",
      displayName: "Manual Trigger",
      description: "Starts workflow manually",
    },
    { name: "n8n-nodes-base.if", displayName: "IF", description: "Conditional routing" },
    { name: "n8n-nodes-base.code", displayName: "Code", description: "Run JavaScript code" },
  ];

  it("exact match scores highest", () => {
    expect(fuzzyScore("Set", items[0])).toBe(100);
    expect(fuzzyScore("set", items[0])).toBe(100);
  });

  it("prefix match scores high", () => {
    expect(fuzzyScore("HT", items[1])).toBe(80);
  });

  it("word prefix match scores 60", () => {
    expect(fuzzyScore("Request", items[1])).toBe(60);
  });

  it("substring match scores 50", () => {
    expect(fuzzyScore("quest", items[1])).toBe(50);
  });

  it("no match returns 0", () => {
    expect(fuzzyScore("xyzzy", items[0])).toBe(0);
  });

  it("fuzzy subsequence match", () => {
    expect(fuzzyScore("cd", items[4])).toBeGreaterThan(0);
  });

  it("fuzzySearch returns sorted results", () => {
    const results = fuzzySearch("set", items);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].displayName).toBe("Set");
  });

  it("fuzzySearch with empty query returns all", () => {
    const results = fuzzySearch("", items);
    expect(results.length).toBe(items.length);
  });

  it("fuzzySearch handles typos", () => {
    const results = fuzzySearch("htp", items);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].displayName).toBe("HTTP Request");
  });
});
