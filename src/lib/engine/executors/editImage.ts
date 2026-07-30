import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import type { IBinaryData } from "@/lib/workflow/types";
import { withPairedItem } from "@/sdk";
import sharp from "sharp";

type FormatKey = "png" | "jpg" | "jpeg" | "gif" | "webp" | "tiff" | "bmp";

const FORMAT_MAP: Record<string, { mime: string; ext: string }> = {
  png: { mime: "image/png", ext: "png" },
  jpg: { mime: "image/jpeg", ext: "jpg" },
  jpeg: { mime: "image/jpeg", ext: "jpg" },
  gif: { mime: "image/gif", ext: "gif" },
  webp: { mime: "image/webp", ext: "webp" },
  tiff: { mime: "image/tiff", ext: "tiff" },
  bmp: { mime: "image/bmp", ext: "bmp" },
};

function parseHexColor(hex: string): { r: number; g: number; b: number; alpha?: number } {
  const s = hex.replace("#", "");
  if (s.length === 6) {
    return {
      r: parseInt(s.slice(0, 2), 16),
      g: parseInt(s.slice(2, 4), 16),
      b: parseInt(s.slice(4, 6), 16),
    };
  }
  if (s.length === 8) {
    return {
      r: parseInt(s.slice(0, 2), 16),
      g: parseInt(s.slice(2, 4), 16),
      b: parseInt(s.slice(4, 6), 16),
      alpha: parseInt(s.slice(6, 8), 16) / 255,
    };
  }
  return { r: 0, g: 0, b: 0, alpha: 1 };
}

const OPERATOR_MAP: Record<string, string> = {
  Add: "add",
  Atop: "atop",
  Bumpmap: "bumpmap",
  Copy: "copy",
  CopyBlack: "copyBlack",
  CopyBlue: "copyBlue",
  CopyCyan: "copyCyan",
  CopyGreen: "copyGreen",
  CopyMagenta: "copyMagenta",
  CopyOpacity: "copyOpacity",
  CopyRed: "copyRed",
  CopyYellow: "copyYellow",
  Difference: "difference",
  Divide: "divide",
  In: "in",
  Minus: "minus",
  Multiply: "multiply",
  Out: "out",
  Over: "over",
  Plus: "plus",
  Subtract: "subtract",
  Xor: "xor",
};

function getBinaryData(item: INodeExecutionData, propertyName: string): IBinaryData | undefined {
  return item.binary?.[propertyName];
}

function assertBinary(item: INodeExecutionData, propertyName: string, index: number): Buffer {
  const bin = getBinaryData(item, propertyName);
  if (!bin?.data) {
    throw new Error(
      `No binary data exists on item ${index} under property "${propertyName}".`,
    );
  }
  return Buffer.from(bin.data, "base64");
}

function makeOutputItem(
  buf: Buffer,
  ext: string,
  fmtMime: string,
  outFileName: string | undefined,
  itemIndex: number,
  inputItem: INodeExecutionData,
  binaryPropertyName: string,
): INodeExecutionData {
  const extOnly = ext || "png";
  const name = outFileName || preserveInputFileName(inputItem, binaryPropertyName, extOnly);
  return {
    json: {},
    binary: {
      [binaryPropertyName]: {
        data: buf.toString("base64"),
        mimeType: fmtMime,
        fileExtension: extOnly,
        fileName: name,
        fileSize: buf.length,
      },
    },
    pairedItem: { item: itemIndex, input: 0 },
  };
}

async function toOutput(
  pipeline: any,
  formatOpt: string | undefined,
  quality: number,
  inputMime: string | undefined,
  outFileName: string | undefined,
  itemIndex: number,
  inputItem: INodeExecutionData,
  binaryPropertyName: string,
): Promise<INodeExecutionData> {
  const fmtKey = (formatOpt || (inputMime ? extFromMime(inputMime) : "png")) as FormatKey;
  const fmtInfo = FORMAT_MAP[fmtKey] ?? FORMAT_MAP.png;
  const sharpFmt = fmtKey === "jpg" ? "jpeg" : fmtKey;
  const opts: Record<string, unknown> = {};
  if (sharpFmt === "jpeg" || sharpFmt === "webp" || sharpFmt === "tiff") {
    opts.quality = quality;
  }
  const buf = await pipeline.toFormat(sharpFmt, opts).toBuffer();
  return makeOutputItem(buf, fmtInfo.ext, fmtInfo.mime, outFileName, itemIndex, inputItem, binaryPropertyName);
}

function extFromMime(mime: string): string {
  for (const [, v] of Object.entries(FORMAT_MAP)) {
    if (v.mime === mime) return v.ext;
  }
  return "png";
}

function preserveInputFileName(
  item: INodeExecutionData,
  propertyName: string,
  newExt: string,
): string {
  const bin = item.binary?.[propertyName];
  if (!bin?.fileName) return `image.${newExt}`;
  const base = bin.fileName.replace(/\.[^.]+$/, "");
  return `${base}.${newExt}`;
}

export const editImageExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);
  const operation = ctx.getParam<string>("operation", "");
  const binaryPropertyName = ctx.getParam<string>("binaryPropertyName", "data");
  const formatOpt = ctx.getParam<string>("format", "");
  const quality = ctx.getParam<number>("quality", 100);
  const outFileName = ctx.getParam<string>("fileName", "");
  const continueOnFail = ctx.continueOnFail();

  if (!operation) {
    throw new Error("Edit Image: operation is required");
  }

  const results: INodeExecutionData[] = [];

  for (let idx = 0; idx < inputItems.length; idx++) {
    const item = inputItems[idx];
    try {
      const processed = await processItem(item, idx);
      results.push(processed);
    } catch (err) {
      if (continueOnFail) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push({
          json: { error: msg },
          pairedItem: { item: idx },
        });
      } else {
        throw err;
      }
    }
  }

  return [results];

  async function processItem(
    item: INodeExecutionData,
    idx: number,
  ): Promise<INodeExecutionData> {
    switch (operation) {
      case "create":
        return processCreate(item, idx);
      case "blur":
        return processBlur(item, idx);
      case "border":
        return processBorder(item, idx);
      case "composite":
        return processComposite(item, idx);
      case "crop":
        return processCrop(item, idx);
      case "draw":
        return processDraw(item, idx);
      case "rotate":
        return processRotate(item, idx);
      case "resize":
        return processResize(item, idx);
      case "shear":
        return processShear(item, idx);
      case "text":
        return processText(item, idx);
      case "transparent":
        return processTransparent(item, idx);
      default:
        throw new Error(`Edit Image: unknown operation "${operation}"`);
    }
  }

  function inputMime(item: INodeExecutionData): string | undefined {
    return getBinaryData(item, binaryPropertyName)?.mimeType;
  }

  function processCreate(
    item: INodeExecutionData,
    idx: number,
  ): Promise<INodeExecutionData> {
    const width = Math.max(1, ctx.getParam<number>("width", 50));
    const height = Math.max(1, ctx.getParam<number>("height", 50));
    const bgColor = parseHexColor(ctx.getParam<string>("backgroundColor", "#ffffff00"));
    const pipeline = sharp({
      create: {
        width,
        height,
        channels: 4,
        background: bgColor,
      },
    });
    return toOutput(pipeline, formatOpt || "png", quality, undefined, outFileName || `image.png`, idx, item, binaryPropertyName);
  }

  function processBlur(
    item: INodeExecutionData,
    idx: number,
  ): Promise<INodeExecutionData> {
    const buf = assertBinary(item, binaryPropertyName, idx);
    const blurRadius = ctx.getParam<number>("blur", 5);
    const sigma = ctx.getParam<number>("sigma", 2);
    const effectiveSigma = sigma > 0 ? sigma : Math.max(blurRadius / 3, 0.1);
    const pipeline = sharp(buf).blur(effectiveSigma);
    return toOutput(pipeline, formatOpt, quality, inputMime(item), outFileName, idx, item, binaryPropertyName);
  }

  function processBorder(
    item: INodeExecutionData,
    idx: number,
  ): Promise<INodeExecutionData> {
    const buf = assertBinary(item, binaryPropertyName, idx);
    const bw = ctx.getParam<number>("borderWidth", 10);
    const bh = ctx.getParam<number>("borderHeight", 10);
    const color = parseHexColor(ctx.getParam<string>("borderColor", "#000000"));
    const pipeline = sharp(buf).extend({
      top: bh,
      bottom: bh,
      left: bw,
      right: bw,
      background: color,
    });
    return toOutput(pipeline, formatOpt, quality, inputMime(item), outFileName, idx, item, binaryPropertyName);
  }

  function processComposite(
    item: INodeExecutionData,
    idx: number,
  ): Promise<INodeExecutionData> {
    const buf = assertBinary(item, binaryPropertyName, idx);
    const compositeProperty = ctx.getParam<string>("dataPropertyNameComposite", "");
    if (!compositeProperty) {
      throw new Error(
        "Edit Image: dataPropertyNameComposite is required for composite operation",
      );
    }
    const overlayBin = getBinaryData(item, compositeProperty);
    if (!overlayBin?.data) {
      throw new Error(
        `Edit Image: no binary data found on property "${compositeProperty}"`,
      );
    }
    const overlayBuf = Buffer.from(overlayBin.data, "base64");
    const operator = ctx.getParam<string>("operator", "Over");
    const posX = ctx.getParam<number>("positionX", 0);
    const posY = ctx.getParam<number>("positionY", 0);
    const blend = OPERATOR_MAP[operator] ?? "over";
    const pipeline = sharp(buf).composite([
      { input: overlayBuf, top: posY, left: posX, blend: blend as any },
    ]);
    return toOutput(pipeline, formatOpt, quality, inputMime(item), outFileName, idx, item, binaryPropertyName);
  }

  function processCrop(
    item: INodeExecutionData,
    idx: number,
  ): Promise<INodeExecutionData> {
    const buf = assertBinary(item, binaryPropertyName, idx);
    const width = ctx.getParam<number>("width", 500);
    const height = ctx.getParam<number>("height", 500);
    const posX = ctx.getParam<number>("positionX", 0);
    const posY = ctx.getParam<number>("positionY", 0);
    const pipeline = sharp(buf).extract({
      left: posX,
      top: posY,
      width,
      height,
    });
    return toOutput(pipeline, formatOpt, quality, inputMime(item), outFileName, idx, item, binaryPropertyName);
  }

  function processDraw(
    item: INodeExecutionData,
    idx: number,
  ): Promise<INodeExecutionData> {
    const buf = assertBinary(item, binaryPropertyName, idx);
    const primitive = ctx.getParam<string>("primitive", "rectangle");
    const color = ctx.getParam<string>("color", "#ff000000");
    const sx = ctx.getParam<number>("startPositionX", 50);
    const sy = ctx.getParam<number>("startPositionY", 50);
    const ex = ctx.getParam<number>("endPositionX", 250);
    const ey = ctx.getParam<number>("endPositionY", 250);
    const cr = ctx.getParam<number>("cornerRadius", 0);

    let svgContent = "";
    if (primitive === "rectangle") {
      const w = Math.abs(ex - sx);
      const h = Math.abs(ey - sy);
      const x = Math.min(sx, ex);
      const y = Math.min(sy, ey);
      const rx = cr > 0 ? cr : undefined;
      svgContent = `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${color}"${rx !== undefined ? ` rx="${rx}" ry="${rx}"` : ""} />`;
    } else if (primitive === "circle") {
      const cx = sx;
      const cy = sy;
      const r = Math.sqrt((ex - sx) ** 2 + (ey - sy) ** 2);
      svgContent = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" />`;
    } else if (primitive === "line") {
      svgContent = `<line x1="${sx}" y1="${sy}" x2="${ex}" y2="${ey}" stroke="${color}" stroke-width="2" />`;
    } else {
      throw new Error(`Edit Image: unknown primitive "${primitive}"`);
    }

    const svg = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg">${svgContent}</svg>`,
    );
    const pipeline = sharp(buf).composite([
      {
        input: svg,
        top: 0,
        left: 0,
      },
    ]);
    return toOutput(pipeline, formatOpt, quality, inputMime(item), outFileName, idx, item, binaryPropertyName);
  }

  function processRotate(
    item: INodeExecutionData,
    idx: number,
  ): Promise<INodeExecutionData> {
    const buf = assertBinary(item, binaryPropertyName, idx);
    const degrees = ctx.getParam<number>("rotate", 0);
    const bgRaw = ctx.getParam<string>("backgroundColor", "");
    const bg = bgRaw ? parseHexColor(bgRaw) : { r: 0, g: 0, b: 0, alpha: 0 };
    const pipeline = sharp(buf).rotate(degrees, { background: bg });
    return toOutput(pipeline, formatOpt, quality, inputMime(item), outFileName, idx, item, binaryPropertyName);
  }

  function processResize(
    item: INodeExecutionData,
    idx: number,
  ): Promise<INodeExecutionData> {
    const buf = assertBinary(item, binaryPropertyName, idx);
    const width = ctx.getParam<number>("width", 500);
    const height = ctx.getParam<number>("height", 500);
    const resizeOption = ctx.getParam<string>("resizeOption", "maximumArea");

    const opts: Record<string, unknown> = {};
    switch (resizeOption) {
      case "ignoreAspectRatio":
        opts.fit = "fill";
        break;
      case "maximumArea":
        opts.fit = "inside";
        break;
      case "minimumArea":
        opts.fit = "cover";
        break;
      case "onlyIfSmaller":
        opts.fit = "inside";
        opts.withoutEnlargement = true;
        break;
      case "onlyIfLarger":
        opts.fit = "outside";
        break;
      case "percent":
        return resizePercent(buf, width, height, idx, item);
      default:
        opts.fit = "inside";
    }

    const pipeline = sharp(buf).resize(width, height, opts);
    return toOutput(pipeline, formatOpt, quality, inputMime(item), outFileName, idx, item, binaryPropertyName);
  }

  async function resizePercent(
    buf: Buffer,
    widthPct: number,
    heightPct: number,
    idx: number,
    item: INodeExecutionData,
  ): Promise<INodeExecutionData> {
    const meta = await sharp(buf).metadata();
    const w = meta.width ?? 500;
    const h = meta.height ?? 500;
    const pipeline = sharp(buf).resize(
      Math.round((w * widthPct) / 100),
      Math.round((h * heightPct) / 100),
    );
    return toOutput(pipeline, formatOpt, quality, inputMime(item), outFileName, idx, item, binaryPropertyName);
  }

  function processShear(
    item: INodeExecutionData,
    idx: number,
  ): Promise<INodeExecutionData> {
    const buf = assertBinary(item, binaryPropertyName, idx);
    const degX = ctx.getParam<number>("degreesX", 0);
    const degY = ctx.getParam<number>("degreesY", 0);
    const radX = (degX * Math.PI) / 180;
    const radY = (degY * Math.PI) / 180;
    const pipeline = sharp(buf).affine(
      [1, Math.tan(radY), Math.tan(radX), 1],
      { background: { r: 0, g: 0, b: 0, alpha: 0 } },
    );
    return toOutput(pipeline, formatOpt, quality, inputMime(item), outFileName, idx, item, binaryPropertyName);
  }

  async function processText(
    item: INodeExecutionData,
    idx: number,
  ): Promise<INodeExecutionData> {
    const buf = assertBinary(item, binaryPropertyName, idx);
    const text = ctx.getParam<string>("text", "");
    const fontSize = ctx.getParam<number>("fontSize", 18);
    const fontColor = ctx.getParam<string>("fontColor", "#000000");
    const posX = ctx.getParam<number>("positionX", 50);
    const posY = ctx.getParam<number>("positionY", 50);
    const lineLength = ctx.getParam<number>("lineLength", 80);

    const meta = await sharp(buf).metadata();
    const iw = meta.width ?? 100;
    const ih = meta.height ?? 100;
    const wrapped = wrapText(text, lineLength);
    const lines = wrapped.map(
      (line, i) =>
        `<text x="${posX}" y="${posY + i * (fontSize + 4)}" font-size="${fontSize}" fill="${fontColor}" font-family="Arial, sans-serif">${escapeXml(line)}</text>`,
    );
    const svg = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${iw}" height="${ih}">${lines.join("\n")}</svg>`,
    );
    const pipeline = sharp(buf).composite([{ input: svg, top: 0, left: 0 }]);
    return toOutput(pipeline, formatOpt, quality, inputMime(item), outFileName, idx, item, binaryPropertyName);
  }

  async function processTransparent(
    item: INodeExecutionData,
    idx: number,
  ): Promise<INodeExecutionData> {
    const buf = assertBinary(item, binaryPropertyName, idx);
    const colorStr = ctx.getParam<string>("color", "");
    if (!colorStr) throw new Error("Edit Image: color is required for transparent operation");
    const c = parseHexColor(colorStr);
    const { data, info } = await sharp(buf)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] === c.r && data[i + 1] === c.g && data[i + 2] === c.b) {
        data[i + 3] = 0;
      }
    }
    const pipeline = sharp(data, {
      raw: { width: info.width, height: info.height, channels: 4 },
    });
    return toOutput(pipeline, formatOpt, quality, inputMime(item), outFileName, idx, item, binaryPropertyName);
  }
};

function wrapText(text: string, lineLength: number): string[] {
  const lines: string[] = [];
  const paragraphs = text.split("\n");
  for (const para of paragraphs) {
    if (para.length <= lineLength) {
      lines.push(para);
    } else {
      let start = 0;
      while (start < para.length) {
        let end = Math.min(start + lineLength, para.length);
        if (end < para.length) {
          const lastSpace = para.lastIndexOf(" ", end);
          if (lastSpace > start) end = lastSpace;
        }
        lines.push(para.slice(start, end));
        start = end + (para[end] === " " ? 1 : 0);
      }
    }
  }
  return lines;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
