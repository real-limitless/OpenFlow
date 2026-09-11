import { describe, expect, it } from "vitest";
import { isFiveFieldCron } from "../cron";

describe("isFiveFieldCron", () => {
  it("accepts standard cron", () => {
    expect(isFiveFieldCron("*/5 * * * *")).toBe(true);
    expect(isFiveFieldCron("0 9 * * 1-5")).toBe(true);
  });

  it("rejects empty or 6-field strings", () => {
    expect(isFiveFieldCron("")).toBe(false);
    expect(isFiveFieldCron("* * * * * *")).toBe(false);
  });
});
