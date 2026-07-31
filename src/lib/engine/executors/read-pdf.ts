import type { NodeExecutor, INodeExecutionData } from "@/sdk";
import { ensureItems } from "@/sdk";

export const readPDFExecutor: NodeExecutor = async (ctx) => {
  const items: INodeExecutionData[] = ensureItems(ctx.getInputItems(0));
  const binaryPropertyName = ctx.getParam<string>("binaryPropertyName", "data");

  if (!binaryPropertyName) {
    throw new Error("Read PDF: binaryPropertyName is required");
  }

  const continueOnFail = ctx.continueOnFail();
  const output: INodeExecutionData[] = [];

  for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
    const item = items[itemIndex];
    const bin = item.binary?.[binaryPropertyName];

    if (!bin) {
      if (!continueOnFail) {
        throw new Error(
          `Read PDF: binary property "${binaryPropertyName}" is missing on item ${itemIndex}`,
        );
      }
      output.push({
        json: { error: `binary property "${binaryPropertyName}" is missing` },
        pairedItem: { item: itemIndex, input: 0 },
      });
      continue;
    }

    try {
      const { PDFParse, VerbosityLevel } = await import("pdf-parse");
      const pdfBuffer = Buffer.from(bin.data, "base64");
      const parser = new PDFParse({ data: pdfBuffer, verbosity: VerbosityLevel.ERRORS });
      await parser.load();

      const info = await parser.getInfo();
      let pageTexts: Array<{ text?: string }>;
      try {
        pageTexts = await parser.getPageText();
      } catch {
        pageTexts = Array.from({ length: info.total }, () => ({ text: "" }));
      }
      const text = pageTexts.map((p: { text?: string }) => p.text ?? "").join("\n");
      const numPages = pageTexts.length;

      const metadata: Record<string, unknown> | null = info.info
        ? {
            author: info.info.Author ?? null,
            creator: info.info.Creator ?? null,
            producer: info.info.Producer ?? null,
            subject: info.info.Subject ?? null,
            title: info.info.Title ?? null,
            keywords: info.info.Keywords ?? null,
            creationDate: info.info.CreationDate ?? null,
            modificationDate: info.info.ModDate ?? null,
          }
        : null;

      await parser.destroy();

      output.push({
        json: { text, metadata, numPages, version: info.info?.PDFFormatVersion ?? "1.0" },
        pairedItem: { item: itemIndex, input: 0 },
      });
    } catch (err) {
      if (!continueOnFail) throw err;
      output.push({
        json: {
          error: err instanceof Error ? err.message : String(err),
        },
        pairedItem: { item: itemIndex, input: 0 },
      });
    }
  }

  return [output];
};