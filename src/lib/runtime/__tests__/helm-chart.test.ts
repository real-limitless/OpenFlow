import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(__dirname, "../../../../deploy/helm/openflow");

describe("Helm chart", () => {
  it("declares api, worker, postgres, and redis", () => {
    const chart = readFileSync(resolve(root, "Chart.yaml"), "utf8");
    expect(chart).toMatch(/name: openflow/);
    const values = readFileSync(resolve(root, "values.yaml"), "utf8");
    expect(values).toMatch(/OPENFLOW_ROLE=main/);
    expect(values).toMatch(/worker:/);
    expect(values).toMatch(/postgres:/);
    expect(values).toMatch(/redis:/);
    const api = readFileSync(resolve(root, "templates/api.yaml"), "utf8");
    expect(api).toMatch(/OPENFLOW_ROLE/);
    const worker = readFileSync(resolve(root, "templates/worker.yaml"), "utf8");
    expect(worker).toMatch(/OPENFLOW_ROLE/);
    expect(worker).toMatch(/WORKER_CONCURRENCY/);
    const pg = readFileSync(resolve(root, "templates/postgres.yaml"), "utf8");
    expect(pg).toMatch(/kind: StatefulSet/);
    const redis = readFileSync(resolve(root, "templates/redis.yaml"), "utf8");
    expect(redis).toMatch(/kind: Deployment/);
    const notes = readFileSync(resolve(root, "templates/NOTES.txt"), "utf8");
    expect(notes).toMatch(/helm|kubectl|OPENFLOW_ROLE/i);
  });
});
