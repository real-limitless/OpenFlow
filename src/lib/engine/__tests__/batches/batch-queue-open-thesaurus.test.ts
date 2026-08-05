import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runNode } from "../helpers";

const API_BASE = "https://www.openthesaurus.de/synonyme/search";

describe("openThesaurus", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should look up synonyms and wrap response in openThesaurus key", async () => {
    const mockResponse = {
      synsets: [
        {
          id: 1,
          categories: ["Nomen"],
          terms: [
            { id: 10, term: "Fahrzeug", level: 1 },
            { id: 11, term: "Wagen", level: 1 },
          ],
        },
      ],
    };
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(mockResponse), { status: 200 }),
    );

    const [output] = await runNode(
      "n8n-nodes-base.openThesaurus",
      { text: "Auto" },
      [{ json: { word: "Auto" } }],
    );

    expect(output).toHaveLength(1);
    expect(output[0].json.openThesaurus).toBeDefined();
    expect(output[0].json.openThesaurus.synsets).toBeInstanceOf(Array);
    expect(output[0].json.openThesaurus.synsets[0].terms[0].term).toBe("Fahrzeug");
    expect(output[0].json.word).toBe("Auto");
  });

  it("should return empty synsets array for unknown word", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ synsets: [] }), { status: 200 }),
    );

    const [output] = await runNode(
      "n8n-nodes-base.openThesaurus",
      { text: "xyzzyNonExistentWord" },
      [{}],
    );

    expect(output).toHaveLength(1);
    expect(output[0].json.openThesaurus).toEqual({ synsets: [] });
  });

  it("should pass item through on empty text with continueOnFail", async () => {
    const [output] = await runNode(
      "n8n-nodes-base.openThesaurus",
      { text: "" },
      [{ json: { existing: "data" } }],
      { continueOnFail: true },
    );

    expect(output).toHaveLength(1);
    expect(output[0].json.existing).toBe("data");
    expect(output[0].json.openThesaurus).toBeUndefined();
  });

  it("should throw on empty text without continueOnFail", async () => {
    await expect(
      runNode(
        "n8n-nodes-base.openThesaurus",
        { text: "" },
        [{}],
      ),
    ).rejects.toThrow("text parameter is required");
  });

  it("should throw on API error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("Not Found", { status: 404, statusText: "Not Found" }),
    );

    await expect(
      runNode(
        "n8n-nodes-base.openThesaurus",
        { text: "Auto" },
        [{}],
      ),
    ).rejects.toThrow("OpenThesaurus API: HTTP 404");
  });

  it("should pass item through on API error with continueOnFail", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("Not Found", { status: 404, statusText: "Not Found" }),
    );

    const [output] = await runNode(
      "n8n-nodes-base.openThesaurus",
      { text: "Auto" },
      [{ json: { existing: "data" } }],
      { continueOnFail: true },
    );

    expect(output).toHaveLength(1);
    expect(output[0].json.existing).toBe("data");
  });

  it("should pass similar option as query param", async () => {
    let requestUrl = "";
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async (url: string | URL | Request) => {
        requestUrl = String(url);
        return new Response(JSON.stringify({ synsets: [], similar: ["Umstand"] }), { status: 200 });
      },
    );

    const [output] = await runNode(
      "n8n-nodes-base.openThesaurus",
      { text: "Umstant", options: { similar: true } },
      [{}],
    );

    expect(requestUrl).toContain("similar=true");
    expect(output[0].json.openThesaurus.similar).toEqual(["Umstand"]);
  });

  it("should pass substring option as query param", async () => {
    let requestUrl = "";
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async (url: string | URL | Request) => {
        requestUrl = String(url);
        return new Response(JSON.stringify({ synsets: [], substring: ["Handschuh", "Handwerk"] }), { status: 200 });
      },
    );

    const [output] = await runNode(
      "n8n-nodes-base.openThesaurus",
      { text: "Hand", options: { substring: true } },
      [{}],
    );

    expect(requestUrl).toContain("substring=true");
    expect(output[0].json.openThesaurus.substring).toHaveLength(2);
  });

  it("should pass baseform option as query param", async () => {
    let requestUrl = "";
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async (url: string | URL | Request) => {
        requestUrl = String(url);
        return new Response(JSON.stringify({ synsets: [], baseform: "Krankenhaus" }), { status: 200 });
      },
    );

    const [output] = await runNode(
      "n8n-nodes-base.openThesaurus",
      { text: "Krankenhäuser", options: { baseform: true } },
      [{}],
    );

    expect(requestUrl).toContain("baseform=true");
    expect(output[0].json.openThesaurus.baseform).toBe("Krankenhaus");
  });
});
