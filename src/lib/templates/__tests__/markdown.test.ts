import { describe, expect, it } from "vitest";
import { stripMarkdown } from "../markdown";

describe("stripMarkdown", () => {
  it("flattens headings, emphasis, and links", () => {
    expect(stripMarkdown("## Setup\n\n- Uses only **Ready** executors\n\nSee [docs](https://example.com).")).toBe(
      "Setup Uses only Ready executors See docs.",
    );
  });
});
