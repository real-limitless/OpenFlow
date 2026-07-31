import type { NodeExecutor, INodeExecutionData } from "@/sdk";

const FORMAT_MIME: Record<string, string> = {
  png: "image/png",
  webp: "image/webp",
  jpg: "image/jpeg",
  svg: "image/svg+xml",
  pdf: "application/pdf",
};

export const quickChartExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);
  const chartType = ctx.getParam<string>("chartType", "bar");
  const chartRaw = ctx.getParam<string>("chart", "");
  const width = ctx.getParam<number>("width", 500);
  const height = ctx.getParam<number>("height", 300);
  const devicePixelRatio = ctx.getParam<number>("devicePixelRatio", 2);
  const backgroundColor = ctx.getParam<string>("backgroundColor", "transparent");
  const version = ctx.getParam<string>("version", "2.9.4");
  const format = ctx.getParam<string>("format", "png");
  const encoding = ctx.getParam<string>("encoding", "url");
  const options = ctx.getParam<Record<string, unknown>>("options", {});
  const host = (options?.host as string) || "https://quickchart.io";
  const continueOnFail = ctx.continueOnFail();

  const mimeType = FORMAT_MIME[format] || "image/png";

  if (!chartRaw) {
    throw new Error("QuickChart: chart parameter is required");
  }

  let chartConfig: Record<string, unknown>;
  try {
    chartConfig = JSON.parse(chartRaw);
  } catch {
    throw new Error("QuickChart: chart parameter must be valid JSON");
  }

  if (!chartConfig.type) {
    chartConfig.type = chartType;
  }

  const results: INodeExecutionData[] = [];

  for (let idx = 0; idx < inputItems.length; idx++) {
    try {
      const chartJson = JSON.stringify(chartConfig);
      const params = new URLSearchParams();
      if (encoding === "url") {
        params.set("c", chartJson);
      } else {
        params.set("encoding", "base64");
        params.set("c", Buffer.from(chartJson).toString("base64"));
      }
      params.set("width", String(width));
      params.set("height", String(height));
      params.set("devicePixelRatio", String(devicePixelRatio));
      if (backgroundColor !== "transparent") {
        params.set("backgroundColor", backgroundColor);
      }
      params.set("version", version);
      params.set("format", format);

      const url = `${host}/chart?${params.toString()}`;

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
      const dataUri = `data:${mimeType};base64,${buf.toString("base64")}`;

      results.push({
        json: { data: dataUri },
        binary: {
          data: {
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
          json: { error: msg },
          pairedItem: { item: idx },
        });
      } else {
        throw err;
      }
    }
  }

  return [results];
};