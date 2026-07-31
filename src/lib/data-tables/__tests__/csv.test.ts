import { describe, it, expect } from "vitest";
import { parseCsv, toCsv, mapCsvRowsToColumnIds } from "../csv";

describe("data-tables csv", () => {
  it("parses simple CSV", () => {
    const { headers, rows } = parseCsv("name,age\nAlice,30\nBob,25\n");
    expect(headers).toEqual(["name", "age"]);
    expect(rows).toEqual([
      { name: "Alice", age: "30" },
      { name: "Bob", age: "25" },
    ]);
  });

  it("handles quoted commas", () => {
    const { rows } = parseCsv('city,note\n"Portland, OR","ok""yes"\n');
    expect(rows[0]).toEqual({ city: "Portland, OR", note: 'ok"yes' });
  });

  it("round-trips via toCsv", () => {
    const columns = [
      { id: "c1", name: "name", type: "string" as const },
      { id: "c2", name: "age", type: "number" as const },
    ];
    const csv = toCsv(columns, [
      { data: { c1: "Alice", c2: 30 } },
      { data: { c1: "Bob", c2: 25 } },
    ]);
    const parsed = parseCsv(csv);
    expect(parsed.headers).toEqual(["name", "age"]);
    expect(parsed.rows[0].name).toBe("Alice");
  });

  it("maps headers to column ids", () => {
    const columns = [
      { id: "c1", name: "name", type: "string" as const },
      { id: "c2", name: "age", type: "string" as const },
    ];
    const mapped = mapCsvRowsToColumnIds([{ name: "A", age: "1" }], columns);
    expect(mapped[0]).toEqual({ c1: "A", c2: "1" });
  });
});
