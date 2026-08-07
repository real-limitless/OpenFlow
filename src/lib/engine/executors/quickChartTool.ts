import type { NodeExecutor, INodeExecutionData } from "@/sdk";

const FORMAT_MIME: Record<string, string> = {
  png: "image/png",
  webp: "image/webp",
  svg: "image/svg+xml",
  pdf: "application/pdf",
};

export const quickChartToolExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);
  const chartType = ctx.getParam<string>("chartType", "bar");
  const labelsMode = ctx.getParam<string>("labelsMode", "manually");
  const labelsUi = ctx.getParam<{ labelsValues?: Array<{ label: string }> }>("labelsUi", {});
  const labelsArray = ctx.getParam<string>("labelsArray", "");
  const dataRaw = ctx.getParam<string>("data", "");
  const output = ctx.getParam<string>("output", "data");
  const chartOptions = ctx.getParam<Record<string, unknown>>("chartOptions", {});
  const datasetOptions = ctx.getParam<Record<string, unknown>>("datasetOptions", {});
  const width = (chartOptions?.width as number) ?? 500;
  const height = (chartOptions?.height as number) ?? 300;
  const devicePixelRatio = (chartOptions?.devicePixelRatio as number) ?? 2;
  const backgroundColor = (chartOptions?.backgroundColor as string) ?? "";
  const version = (chartOptions?.version as string) ?? "2.9.4";
  const format = (chartOptions?.format as string) ?? "png";
  const horizontal = (chartOptions?.horizontal as boolean) ?? false;
  const continueOnFail = ctx.continueOnFail();

  const mimeType = FORMAT_MIME[format] || "image/png";

  const results: INodeExecutionData[] = [];

  for (let idx = 0; idx < inputItems.length; idx++) {
    try {
      if (!dataRaw) {
        throw new Error("QuickChart: data parameter is required");
      }

      let dataArray: number[];
      try {
        dataArray = JSON.parse(dataRaw);
      } catch {
        throw new Error("QuickChart: data must be valid JSON array");
      }

      let labels: string[];
      if (labelsMode === "array") {
        try {
          labels = labelsArray ? JSON.parse(labelsArray) : [];
        } catch {
          throw new Error("QuickChart: labelsArray must be valid JSON array");
        }
      } else {
        labels = (labelsUi?.labelsValues ?? []).map((v) => v.label);
      }
      const chartConfig: Record<string, unknown> = {
        type: chartType,
        data: {
          labels,
          datasets: [
            {
              data: dataArray,
              ...datasetOptions,
            },
          ],
        },
        options: {},
      };

      if (horizontal) {
        (chartConfig.options as Record<string, unknown>).indexAxis = "y";
      }

      const chartJson = JSON.stringify(chartConfig);
      const params = new URLSearchParams();
      params.set("c", chartJson);
      params.set("width", String(width));
      params.set("height", String(height));
      params.set("devicePixelRatio", String(devicePixelRatio));
      if (backgroundColor) {
        params.set("bkg", backgroundColor);
      }
      params.set("v", version);
      params.set("format", format);

      const url = `https://quickchart.io/chart?${params.toString()}`;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30000);
      let res: Response;
      try {
        res = await fetch(url, { signal: controller.signal });
      } finally {
        clearTimeout(timer);
      }

      if (!res.ok) {
        throw new Error(`QuickChart API returned status ${res.status}`);
      }

      const buf = Buffer.from(await res.arrayBuffer());

      results.push({
        json: { ...inputItems[idx].json },
        binary: {
          [output]: {
            data: buf.toString("base64"),
            mimeType,
            fileName: `chart.${format}`,
            fileSize: buf.length,
          },
        },
        pairedItem: { item: idx, input: 0 },
      });
    } catch (err) {
      if (continueOnFail) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push({
          json: { ...inputItems[idx].json, error: msg },
          pairedItem: { item: idx },
        });
      } else {
        throw err;
      }
    }
  }

  return [results];
};
