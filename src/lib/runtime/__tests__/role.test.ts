import { describe, expect, it } from "vitest";
import {
  parseOpenFlowRole,
  requireRedisQueue,
  schedulerEnabledForRole,
  workerEnabledForRole,
} from "../role";

describe("OPENFLOW_ROLE", () => {
  it("defaults to all", () => {
    expect(parseOpenFlowRole(undefined)).toBe("all");
    expect(parseOpenFlowRole("ALL")).toBe("all");
  });

  it("disables the in-process worker on main", () => {
    expect(workerEnabledForRole("main", "true")).toBe(false);
    expect(workerEnabledForRole("all", "true")).toBe(true);
    expect(workerEnabledForRole("worker", undefined)).toBe(true);
    expect(workerEnabledForRole("all", "false")).toBe(false);
  });

  it("runs the scheduler on api roles only", () => {
    expect(schedulerEnabledForRole("all")).toBe(true);
    expect(schedulerEnabledForRole("main")).toBe(true);
    expect(schedulerEnabledForRole("worker")).toBe(false);
  });

  it("requires Redis when the process is split", () => {
    expect(requireRedisQueue("main")).toBe(true);
    expect(requireRedisQueue("all")).toBe(false);
  });
});
