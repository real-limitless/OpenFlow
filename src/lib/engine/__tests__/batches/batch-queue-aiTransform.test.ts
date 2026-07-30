import { describe, it, expect } from "vitest";
import { seedBuiltinExecutors } from "../../index";
import { seedBuiltinDescriptions, getNodeType } from "@/lib/nodes/registry";
import { runNode, assertExecutorRegistered } from "../helpers";

seedBuiltinExecutors();
seedBuiltinDescriptions();

describe("n8n-nodes-base.aiTransform", () => {
  it("registers executor and description", () => {
    assertExecutorRegistered("n8n-nodes-base.aiTransform");
    expect(getNodeType("n8n-nodes-base.aiTransform").placeholder).not.toBe(true);
  });

  describe("acceptance fixtures from spec", () => {
    it("basic AI-generated transformation (merge fields)", async () => {
      const input = [
        { json: { firstname: "John", lastname: "Doe", email: "john@example.com" } },
        { json: { firstname: "Jane", lastname: "Smith", email: "jane@example.com" } },
      ];

      const params = {
        instructions: "Merge firstname and lastname into details.name and sort by email",
        AI_TRANSFORM_JS_CODE:
          "return $input.all().map(i => ({ json: { ...i.json, details: { name: i.json.firstname + ' ' + i.json.lastname } } })).sort((a, b) => a.json.email.localeCompare(b.json.email));",
      };

      const out = await runNode("n8n-nodes-base.aiTransform", params, input);

      expect(out[0]).toHaveLength(2);
      expect(out[0][0].json.firstname).toBe("Jane");
      expect(out[0][0].json.lastname).toBe("Smith");
      expect(out[0][0].json.email).toBe("jane@example.com");
      expect(out[0][0].json.details).toEqual({ name: "Jane Smith" });
      expect(out[0][1].json.firstname).toBe("John");
      expect(out[0][1].json.lastname).toBe("Doe");
      expect(out[0][1].json.email).toBe("john@example.com");
      expect(out[0][1].json.details).toEqual({ name: "John Doe" });
    });

    it("filter and project (each-item style logic in all-items mode)", async () => {
      const input = [
        { json: { status: "active", value: 10 } },
        { json: { status: "inactive", value: 20 } },
        { json: { status: "active", value: 30 } },
      ];

      const params = {
        instructions: "Keep only active items and return value doubled",
        AI_TRANSFORM_JS_CODE:
          "return $input.all().filter(i => i.json.status === 'active').map(i => ({ json: { doubled: i.json.value * 2 } }));",
      };

      const out = await runNode("n8n-nodes-base.aiTransform", params, input);

      expect(out[0]).toHaveLength(2);
      expect(out[0][0].json.doubled).toBe(20);
      expect(out[0][1].json.doubled).toBe(60);
    });

    it("synthesize new items (no input needed)", async () => {
      const input = [{ json: {} }];

      const params = {
        instructions: "Generate 3 items with numbers 1, 2, 3",
        AI_TRANSFORM_JS_CODE: "return [1, 2, 3].map(n => ({ json: { n } }));",
      };

      const out = await runNode("n8n-nodes-base.aiTransform", params, input);

      expect(out[0]).toHaveLength(3);
      expect(out[0][0].json.n).toBe(1);
      expect(out[0][1].json.n).toBe(2);
      expect(out[0][2].json.n).toBe(3);
    });

    it("missing instructions and code — user-facing error", async () => {
      const input = [{ json: { x: 1 } }];
      const params = {};

      await expect(runNode("n8n-nodes-base.aiTransform", params, input)).rejects.toThrow(
        "Missing instructions to generate code — Enter your prompt in the 'Instructions' parameter and click 'Generate code'",
      );
    });

    it("instructions provided but code not generated — user-facing error", async () => {
      const input = [{ json: { x: 1 } }];
      const params = {
        instructions: "Double the value",
      };

      await expect(runNode("n8n-nodes-base.aiTransform", params, input)).rejects.toThrow(
        "Missing code for data transformation — Click the 'Generate code' button to create the code",
      );
    });
  });

  describe("edge cases", () => {
    it("passes binary input hint to output", async () => {
      const input = [
        { json: { foo: "bar" }, binary: { file: { data: "base64...", mimeType: "text/plain" } } },
      ];

      const params = {
        instructions: "PassThroughCode",
        AI_TRANSFORM_JS_CODE: "return $input.all();",
      };

      const out = await runNode("n8n-nodes-base.aiTransform", params, input);

      expect(out[0]).toHaveLength(2);
      expect(out[0][1].json._hint).toBe(
        "Input items contain binary data. Use the 'Extract from File' node first to convert binary to JSON before transforming.",
      );
    });

    it("throws when code returns null", async () => {
      const input = [{ json: { x: 1 } }];
      const params = {
        instructions: "test",
        AI_TRANSFORM_JS_CODE: "return null;",
      };

      await expect(runNode("n8n-nodes-base.aiTransform", params, input)).rejects.toThrow(
        "AI Transform doesn't return an object",
      );
    });

    it("throws when code returns array with non-object json", async () => {
      const input = [{ json: { x: 1 } }];
      const params = {
        instructions: "test",
        AI_TRANSFORM_JS_CODE: "return [{ json: 'not an object' }];",
      };

      await expect(runNode("n8n-nodes-base.aiTransform", params, input)).rejects.toThrow(
        "AI Transform output 'json' property must be an object, not an array or primitive",
      );
    });

    it("wraps primitive return value in object", async () => {
      const input = [{ json: { x: 1 } }];
      const params = {
        instructions: "test",
        AI_TRANSFORM_JS_CODE: "return 42;",
      };

      const out = await runNode("n8n-nodes-base.aiTransform", params, input);

      expect(out[0]).toHaveLength(1);
      expect(out[0][0].json.result).toBe(42);
    });
  });
});