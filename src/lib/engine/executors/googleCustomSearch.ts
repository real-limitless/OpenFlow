import type { NodeExecutor } from "@/sdk";

const BASE_URL = "https://customsearch.googleapis.com/customsearch/v1";
const MAX_TOTAL_RESULTS = 100;

function buildQueryParams(params: Record<string, unknown>): URLSearchParams {
  const qp = new URLSearchParams();
  const cx = params.cx as string | undefined;
  const query = params.query as string | undefined;
  const options = (params.options as Record<string, unknown>) ?? {};

  if (cx) qp.set("cx", cx);
  if (query) qp.set("q", query);

  const optMap: Record<string, string> = {
    siteSearch: "siteSearch",
    siteSearchFilter: "siteSearchFilter",
    searchType: "searchType",
    num: "num",
    start: "start",
    lr: "lr",
    cr: "cr",
    gl: "gl",
    hl: "hl",
    safe: "safe",
    filter: "filter",
    dateRestrict: "dateRestrict",
    sort: "sort",
    fileType: "fileType",
    exactTerms: "exactTerms",
    excludeTerms: "excludeTerms",
    orTerms: "orTerms",
    rights: "rights",
    imgSize: "imgSize",
    imgType: "imgType",
    imgColorType: "imgColorType",
    imgDominantColor: "imgDominantColor",
    highRange: "highRange",
    lowRange: "lowRange",
    hq: "hq",
    linkSite: "linkSite",
    c2coff: "c2coff",
  };

  for (const [optKey, apiKey] of Object.entries(optMap)) {
    const val = optKey === "c2coff"
      ? (options as Record<string, unknown>)[optKey]
      : (options as Record<string, unknown>)[optKey];
    if (val !== undefined && val !== null && val !== "") {
      qp.set(apiKey, String(val));
    }
  }

  return qp;
}

export const googleCustomSearchExecutor: NodeExecutor = async (ctx) => {
  const inputItems = ctx.getInputItems(0);
  const items = inputItems.length === 0 ? [{ json: {} }] : inputItems;
  const continueOnFail = ctx.continueOnFail();
  const out = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    try {
      const params = ctx.getParams();
      const credential = await ctx.getCredential("googleApi");
      if (!credential) {
        throw new Error("Missing Google API key: googleApi credential is required");
      }

      const apiKey = (credential as Record<string, unknown>).apiKey as string;
      if (!apiKey) {
        throw new Error("Missing Google API key: googleApi credential has no apiKey");
      }

      const returnAll = ctx.getParam<boolean>("returnAll", false);
      const limit = ctx.getParam<number>("limit", MAX_TOTAL_RESULTS);
      const options = ctx.getParam<Record<string, unknown>>("options", {});
      const allParams = { ...params, options };

      let collectedItems: unknown[] = [];
      let startIndex = 1;
      const perPage = returnAll ? 10 : Math.min(Number(options.num) || 10, 10);

      while (true) {
        const pageParams = { ...allParams };
        if (returnAll || !allParams.options || !(allParams.options as Record<string, unknown>).start) {
          (pageParams.options as Record<string, unknown>).start = startIndex;
        }
        if (returnAll) {
          (pageParams.options as Record<string, unknown>).num = perPage;
        }

        const qp = buildQueryParams(pageParams);
        qp.set("key", apiKey);
        const url = `${BASE_URL}?${qp.toString()}`;

        const res = await fetch(url, {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(15000),
        });

        const raw: Record<string, unknown> = await res.json();

        if (!res.ok) {
          const errMsg = raw.error && typeof raw.error === "object"
            ? ((raw.error as Record<string, unknown>).message as string) ?? res.statusText
            : res.statusText;
          throw new Error(`Google Custom Search API error: ${errMsg}`);
        }

        const pageItems = raw.items as unknown[] | undefined;
        if (pageItems && Array.isArray(pageItems)) {
          collectedItems = collectedItems.concat(pageItems);
        }

        if (!returnAll) {
          collectedItems = pageItems ?? [];
          raw.items = collectedItems;
          out.push({
            json: raw,
            pairedItem: item.pairedItem ?? { item: i, input: 0 },
          });
          break;
        }

        const queries = raw.queries as Record<string, unknown[]> | undefined;
        const hasNext = queries?.nextPage && Array.isArray(queries.nextPage) && queries.nextPage.length > 0;

        if (!hasNext || collectedItems.length >= Math.min(limit, MAX_TOTAL_RESULTS) || collectedItems.length >= MAX_TOTAL_RESULTS) {
          raw.items = collectedItems.slice(0, Math.min(limit, MAX_TOTAL_RESULTS));
          const firstReq = (queries?.request as Record<string, unknown>[] | undefined)?.[0];
          if (firstReq) {
            raw.queries = { request: [firstReq] };
            if (collectedItems.length > perPage) {
              delete (raw as Record<string, unknown>).queries;
            }
          }
          out.push({
            json: raw,
            pairedItem: item.pairedItem ?? { item: i, input: 0 },
          });
          break;
        }

        startIndex += perPage;
      }
    } catch (err) {
      if (continueOnFail) {
        out.push({
          json: {
            error: err instanceof Error ? err.message : String(err),
            kind: "customsearch#search",
            items: [],
          },
          pairedItem: item.pairedItem ?? { item: i, input: 0 },
        });
        continue;
      }
      throw err;
    }
  }

  return [out];
};
