import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { hasExecutor } from "@/lib/engine/node-runtime";
import { runNode } from "../helpers";

seedBuiltinExecutors();

const TYPE = "n8n-nodes-base.postgresTrigger";

describe("postgresTrigger", () => {
  it("is registered", () => {
    expect(hasExecutor(TYPE)).toBe(true);
  });

  describe("mode: createTrigger", () => {
    it("emits insert item with type, table, and payload", async () => {
      const result = await runNode(
        TYPE,
        { triggerMode: "createTrigger", tableName: "orders", schema: "public" },
        [{
          type: "INSERT",
          table: "public.orders",
          payload: { id: 1, product: "widget", qty: 5 },
        }],
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveLength(1);
      expect(result[0][0].json).toEqual({
        type: "INSERT",
        table: "public.orders",
        payload: { id: 1, product: "widget", qty: 5 },
      });
    });

    it("emits update item with old and new payload", async () => {
      const result = await runNode(
        TYPE,
        { triggerMode: "createTrigger", tableName: "orders", schema: "public" },
        [{
          type: "UPDATE",
          table: "public.orders",
          payload: {
            old: { id: 1, product: "widget", qty: 5 },
            new: { id: 1, product: "widget", qty: 3 },
          },
        }],
      );

      expect(result).toHaveLength(1);
      expect(result[0][0].json).toEqual({
        type: "UPDATE",
        table: "public.orders",
        payload: {
          old: { id: 1, product: "widget", qty: 5 },
          new: { id: 1, product: "widget", qty: 3 },
        },
      });
    });

    it("emits delete item with old payload", async () => {
      const result = await runNode(
        TYPE,
        { triggerMode: "createTrigger", tableName: "orders", schema: "public" },
        [{
          type: "DELETE",
          table: "public.orders",
          payload: { id: 1, product: "widget", qty: 5 },
        }],
      );

      expect(result[0][0].json).toEqual({
        type: "DELETE",
        table: "public.orders",
        payload: { id: 1, product: "widget", qty: 5 },
      });
    });
  });

  describe("mode: listenTrigger", () => {
    it("emits item with channel and message", async () => {
      const result = await runNode(
        TYPE,
        { triggerMode: "listenTrigger", channelName: "my_events" },
        [{ channel: "my_events", message: "hello" }],
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveLength(1);
      expect(result[0][0].json).toEqual({
        channel: "my_events",
        message: "hello",
      });
    });
  });

  describe("validation", () => {
    it("throws when tableName is missing in createTrigger mode", async () => {
      await expect(runNode(
        TYPE,
        { triggerMode: "createTrigger", schema: "public" },
        [],
      )).rejects.toThrow("tableName");
    });

    it("throws when channelName is missing in listenTrigger mode", async () => {
      await expect(runNode(
        TYPE,
        { triggerMode: "listenTrigger" },
        [],
      )).rejects.toThrow("channelName");
    });
  });

  describe("empty input", () => {
    it("returns a single empty item when no input", async () => {
      const result = await runNode(
        TYPE,
        { triggerMode: "createTrigger", tableName: "orders", schema: "public" },
        [],
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveLength(1);
      expect(result[0][0].json).toEqual({});
    });
  });
});
