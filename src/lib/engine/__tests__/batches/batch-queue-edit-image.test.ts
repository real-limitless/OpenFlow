import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { runNode, assertExecutorRegistered } from "../helpers";
import { getExecutor, hasExecutor } from "@/lib/engine/node-runtime";
import { getNodeType, seedBuiltinDescriptions } from "@/lib/nodes/registry";
import type { IBinaryData } from "@/lib/workflow/types";

seedBuiltinDescriptions();

const TYPE = "n8n-nodes-base.editImage";

async function testPng(): Promise<string> {
  const buf = await sharp({
    create: { width: 20, height: 20, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } },
  })
    .png()
    .toBuffer();
  return buf.toString("base64");
}

function makeBinaryItem(
  json: Record<string, unknown>,
  data: string,
  property = "data",
): Record<string, unknown> {
  const bin: Record<string, IBinaryData> = {
    [property]: { data, mimeType: "image/png", fileName: "test.png", fileExtension: "png" },
  };
  return { json, binary: bin };
}

describe("batch-queue edit-image — n8n-nodes-base.editImage", () => {
  it("is registered as executor + description", () => {
    assertExecutorRegistered(TYPE);
    expect(hasExecutor(TYPE)).toBe(true);
    expect(getNodeType(TYPE).placeholder).not.toBe(true);
    expect(getNodeType(TYPE).displayName).toBe("Edit Image");
  });

  it("create operation generates a PNG image (acceptance: create)", async () => {
    const out = await runNode(
      TYPE,
      { operation: "create", width: 100, height: 50, backgroundColor: "#ff0000ff" },
      [{}],
    );

    expect(out[0]).toHaveLength(1);
    const bin = out[0][0].binary?.data;
    expect(bin).toBeDefined();
    expect(bin!.mimeType).toBe("image/png");
    expect(bin!.fileExtension).toBe("png");
    expect(bin!.fileName).toBe("image.png");

    const meta = await sharp(Buffer.from(bin!.data, "base64")).metadata();
    expect(meta.width).toBe(100);
    expect(meta.height).toBe(50);
    expect(meta.format).toBe("png");
  });

  it("blur operation applies Gaussian blur (acceptance: blur)", async () => {
    const img = await testPng();
    const out = await runNode(
      TYPE,
      { operation: "blur", blur: 10, sigma: 5, binaryPropertyName: "data" },
      [makeBinaryItem({}, img)],
    );

    expect(out[0]).toHaveLength(1);
    const bin = out[0][0].binary?.data;
    expect(bin).toBeDefined();
    expect(bin!.mimeType).toBe("image/png");
    expect(bin!.fileExtension).toBe("png");

    const meta = await sharp(Buffer.from(bin!.data, "base64")).metadata();
    expect(meta.format).toBe("png");
  });

  it("border operation adds border around image (acceptance: border)", async () => {
    const img = await testPng();
    const out = await runNode(
      TYPE,
      { operation: "border", borderWidth: 5, borderHeight: 5, borderColor: "#000000" },
      [makeBinaryItem({}, img)],
    );

    expect(out[0]).toHaveLength(1);
    const bin = out[0][0].binary?.data;
    expect(bin).toBeDefined();

    const meta = await sharp(Buffer.from(bin!.data, "base64")).metadata();
    expect(meta.width).toBe(30);
    expect(meta.height).toBe(30);
  });

  it("crop operation extracts a region (acceptance: crop)", async () => {
    const img = await testPng();
    const out = await runNode(
      TYPE,
      { operation: "crop", width: 10, height: 10, positionX: 5, positionY: 5 },
      [makeBinaryItem({}, img)],
    );

    expect(out[0]).toHaveLength(1);
    const bin = out[0][0].binary?.data;
    expect(bin).toBeDefined();

    const meta = await sharp(Buffer.from(bin!.data, "base64")).metadata();
    expect(meta.width).toBe(10);
    expect(meta.height).toBe(10);
  });

  it("resize with maximumArea preserves aspect (acceptance: resize)", async () => {
    const buf = await sharp({
      create: { width: 400, height: 300, channels: 4, background: { r: 0, g: 0, b: 255, alpha: 1 } },
    })
      .png()
      .toBuffer();
    const img = buf.toString("base64");

    const out = await runNode(
      TYPE,
      { operation: "resize", width: 200, height: 200, resizeOption: "maximumArea" },
      [makeBinaryItem({}, img)],
    );

    expect(out[0]).toHaveLength(1);
    const bin = out[0][0].binary?.data;
    expect(bin).toBeDefined();

    const meta = await sharp(Buffer.from(bin!.data, "base64")).metadata();
    expect(meta.width).toBe(200);
    expect(meta.height).toBe(150);
  });

  it("rotate operation with background (acceptance: rotate)", async () => {
    const img = await testPng();
    const out = await runNode(
      TYPE,
      { operation: "rotate", rotate: 45, backgroundColor: "#ffffffff" },
      [makeBinaryItem({}, img)],
    );

    expect(out[0]).toHaveLength(1);
    const bin = out[0][0].binary?.data;
    expect(bin).toBeDefined();
    expect(bin!.mimeType).toBe("image/png");
  });

  it("composite operation overlays images (acceptance: composite)", async () => {
    const bgBuf = await sharp({
      create: { width: 50, height: 50, channels: 4, background: { r: 0, g: 0, b: 255, alpha: 1 } },
    })
      .png()
      .toBuffer();
    const fgBuf = await sharp({
      create: { width: 20, height: 20, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } },
    })
      .png()
      .toBuffer();

    const item = {
      json: {},
      binary: {
        data: { data: bgBuf.toString("base64"), mimeType: "image/png" as string, fileName: "bg.png" as string } as IBinaryData,
        data2: { data: fgBuf.toString("base64"), mimeType: "image/png" as string, fileName: "fg.png" as string } as IBinaryData,
      },
    };

    const out = await runNode(
      TYPE,
      { operation: "composite", dataPropertyNameComposite: "data2", operator: "Over", positionX: 10, positionY: 10 },
      [item as unknown as Record<string, unknown>],
    );

    expect(out[0]).toHaveLength(1);
    const bin = out[0][0].binary?.data;
    expect(bin).toBeDefined();
    expect(bin!.mimeType).toBe("image/png");
  });

  it("draw operation composites a primitive via SVG (acceptance: draw)", async () => {
    const img = await testPng();
    const out = await runNode(
      TYPE,
      {
        operation: "draw",
        primitive: "rectangle",
        color: "#ff000080",
        startPositionX: 2,
        startPositionY: 2,
        endPositionX: 18,
        endPositionY: 18,
        cornerRadius: 0,
      },
      [makeBinaryItem({}, img)],
    );

    expect(out[0]).toHaveLength(1);
    const bin = out[0][0].binary?.data;
    expect(bin).toBeDefined();
    expect(bin!.mimeType).toBe("image/png");
  });

  it("text operation renders text via SVG (acceptance: text)", async () => {
    const img = await testPng();
    const out = await runNode(
      TYPE,
      {
        operation: "text",
        text: "Hello",
        fontSize: 12,
        fontColor: "#ffffff",
        positionX: 2,
        positionY: 14,
        lineLength: 80,
      },
      [makeBinaryItem({}, img)],
    );

    expect(out[0]).toHaveLength(1);
    const bin = out[0][0].binary?.data;
    expect(bin).toBeDefined();
    expect(bin!.mimeType).toBe("image/png");
  });

  it("throws on missing binary data (continueOnFail false)", async () => {
    await expect(
      runNode(TYPE, { operation: "blur", blur: 5 }, [{ json: { foo: "bar" } }]),
    ).rejects.toThrow(/No binary data exists/);
  });

  it("multiple items produce multiple outputs", async () => {
    const img = await testPng();
    const out = await runNode(
      TYPE,
      { operation: "blur", blur: 3, sigma: 1 },
      [makeBinaryItem({ id: 1 }, img), makeBinaryItem({ id: 2 }, img)],
    );

    expect(out[0]).toHaveLength(2);
    expect(out[0][0].binary?.data).toBeDefined();
    expect(out[0][1].binary?.data).toBeDefined();
  });

  it("shear operation applies affine shear (acceptance: shear)", async () => {
    const buf = await sharp({
      create: { width: 200, height: 200, channels: 4, background: { r: 0, g: 128, b: 255, alpha: 1 } },
    })
      .png()
      .toBuffer();
    const img = buf.toString("base64");

    const out = await runNode(
      TYPE,
      { operation: "shear", degreesX: 15, degreesY: 10 },
      [makeBinaryItem({}, img)],
    );

    expect(out[0]).toHaveLength(1);
    const bin = out[0][0].binary?.data;
    expect(bin).toBeDefined();
    expect(bin!.mimeType).toBe("image/png");
  });

  it("transparent operation makes matching color transparent (acceptance: transparent)", async () => {
    const buf = await sharp({
      create: { width: 10, height: 10, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
    })
      .png()
      .toBuffer();
    const img = buf.toString("base64");

    const out = await runNode(
      TYPE,
      { operation: "transparent", color: "#ffffff" },
      [makeBinaryItem({}, img)],
    );

    expect(out[0]).toHaveLength(1);
    const bin = out[0][0].binary?.data;
    expect(bin).toBeDefined();
    expect(bin!.mimeType).toBe("image/png");

    const resultBuf = Buffer.from(bin!.data, "base64");
    const { data } = await sharp(resultBuf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    expect(data[3]).toBe(0);
  });

  it("continueOnFail emits error item on missing binary data", async () => {
    const out = await runNode(
      TYPE,
      { operation: "blur", blur: 5 },
      [{ json: { foo: "bar" } }],
      { continueOnFail: true },
    );

    expect(out[0]).toHaveLength(1);
    expect(out[0][0].json).toHaveProperty("error");
    expect(out[0][0].json.error).toContain("No binary data exists");
    expect(out[0][0].pairedItem).toEqual({ item: 0 });
  });

  it("resolves the same executor under the canonical type string", () => {
    const canonical = getExecutor(TYPE);
    expect(canonical).toBeDefined();
    expect(getExecutor("nodes-base.editImage")).toBe(canonical);
  });
});
