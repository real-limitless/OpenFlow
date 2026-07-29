import type { NodeExecutor } from "../types";
import { evaluateExpression } from "../../expressions/evaluate";

function formatToken(date: Date, token: string, useUtc: boolean): string {
  const get = (fn: (d: Date) => number) => (useUtc ? fn(date) : fn(date));
  switch (token) {
    case "YYYY":
      return String(get((d) => d.getFullYear()));
    case "YY":
      return String(get((d) => d.getFullYear()))
        .slice(-2)
        .padStart(2, "0");
    case "MM":
      return String(get((d) => d.getMonth() + 1)).padStart(2, "0");
    case "M":
      return String(get((d) => d.getMonth() + 1));
    case "DD":
      return String(get((d) => d.getDate())).padStart(2, "0");
    case "D":
      return String(get((d) => d.getDate()));
    case "HH":
      return String(get((d) => d.getHours())).padStart(2, "0");
    case "H":
      return String(get((d) => d.getHours()));
    case "mm":
      return String(get((d) => d.getMinutes())).padStart(2, "0");
    case "ss":
      return String(get((d) => d.getSeconds())).padStart(2, "0");
    case "SSS":
      return String(get((d) => d.getMilliseconds())).padStart(3, "0");
    default:
      return token;
  }
}

function formatDate(date: Date, format: string, useUtc: boolean): string {
  return format.replace(/YYYY|YY|MM|DD|HH|mm|ss|SSS|M|D|H/g, (token) =>
    formatToken(date, token, useUtc),
  );
}

export const dateTimeExecutor: NodeExecutor = async (ctx, node) => {
  const inputItems = ctx.getNodeInputItems(node.name, 0);
  const mode = (node.parameters.mode as string) ?? "format";

  if (mode === "calculate") {
    return [inputItems];
  }

  const dateRaw = (node.parameters.date as string) ?? "";
  const format = (node.parameters.format as string) ?? "YYYY-MM-DD HH:mm:ss";
  const timezone = (node.parameters.timezone as string) ?? "UTC";
  const options = (node.parameters.options as Record<string, unknown>) ?? {};
  const outputFormat = (options.outputFormat as string) || format;
  const useUtc = timezone === "UTC" || timezone === "";

  return [
    inputItems.map((item) => {
      const resolved =
        dateRaw.startsWith("{{") || dateRaw.startsWith("=")
          ? (() => {
              const r = evaluateExpression(dateRaw, { json: item.json });
              return r.ok ? r.value : dateRaw;
            })()
          : dateRaw;

      const date = new Date(resolved === "" ? Date.now() : (resolved as string));
      const formatted = formatDate(date, outputFormat, useUtc);

      return { json: { ...item.json, result: formatted } };
    }),
  ];
};
